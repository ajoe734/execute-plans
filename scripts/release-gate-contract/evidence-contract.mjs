// Dormant release-evidence validation foundation.
//
// This module performs no network access, reads no environment variables, and
// is not referenced by deployment automation. Admission accepts only bounded
// raw JSON bytes or files read through the trusted-artifact reader. Parsed
// summary/management objects are deliberately not accepted as trust inputs.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TextDecoder, isDeepStrictEqual } from "node:util";
import {
  MANAGEMENT_ACCEPTANCE_PROFILE,
  MANAGEMENT_ACCEPTANCE_SCHEMA_VERSION,
  RELEASE_GATE_ASSERTION_FIELDS,
  RELEASE_GATE_NUMBERS,
  RELEASE_GATE_PROVENANCE_PROFILE,
  RELEASE_GATE_PROVENANCE_SCHEMA_VERSION,
  RELEASE_GATE_QUALIFICATION_PROFILE,
  RELEASE_GATE_SCHEMA_VERSION,
  RELEASE_GATE_STEP_EVIDENCE_PROFILE,
  RELEASE_GATE_STEP_EVIDENCE_SCHEMA_VERSION,
  RELEASE_GATE_STEP_OUTCOME_KEYS,
  RELEASE_GATE_STEP_OUTCOME_PROFILE,
  RELEASE_GATE_STEP_OUTCOME_SCHEMA_VERSION,
  assertExactGateCheckSequence,
  assertExactObjectFields,
  assertExactReleaseGateShape,
  assertionDefinitionsForStep,
  deriveReleaseGateResult,
  inspectReleaseGateStepOutcomes,
  releaseGateDefinition,
} from "./schema.mjs";

export const MAX_RELEASE_GATE_EVIDENCE_BYTES = 1024 * 1024;
export const MAX_RELEASE_GATE_SUMMARY_BYTES = 2 * 1024 * 1024;

export const RELEASE_GATE_CRITICAL_ARTIFACT_PATHS = Object.freeze({
  summary: "release-gate-summary.json",
  stepOutcomes: "release-gate-step-outcomes.json",
  managementAcceptance: "management-acceptance.json",
});

export const RELEASE_GATE_MANAGEMENT_BINDING_SCHEMA_VERSION = 1;
export const RELEASE_GATE_MANAGEMENT_BINDING_PROFILE =
  "pantheon-dev-fe-management-acceptance-binding/v1";

const IDENTITY_FIELDS = Object.freeze([
  "frontendSha",
  "backendSha",
  "feBaseUrl",
  "bffBaseUrl",
  "runUrl",
  "leaseId",
]);

const PROVENANCE_CORE_FIELDS = Object.freeze([
  "schemaVersion",
  "profile",
  "repository",
  "workflowPath",
  "workflowSha",
  "controllerSha",
  "runId",
  "runAttempt",
]);

const EXPECTED_PROVENANCE_FIELDS = Object.freeze([
  ...PROVENANCE_CORE_FIELDS,
  "artifactId",
  "artifactDigestSha256",
  "artifacts",
]);

const CRITICAL_ARTIFACT_KEYS = Object.freeze([
  "summary",
  "stepOutcomes",
  "managementAcceptance",
]);

const EVIDENCE_DESCRIPTOR_FIELDS = Object.freeze(["path", "sha256", "size"]);

const SUMMARY_FIELDS = Object.freeze([
  "schemaVersion",
  "qualificationProfile",
  "releaseQualification",
  "identity",
  "provenance",
  "stepOutcomes",
  "managementAcceptance",
  "gates",
  "overall",
]);

const STEP_OUTCOME_BINDING_FIELDS = Object.freeze([
  "schemaVersion",
  "profile",
  "artifactPath",
  "sha256",
  "size",
  "requiredKeys",
  "exact",
  "observedKeys",
  "missingKeys",
  "unknownKeys",
  "orderedKeys",
  "invalidEntries",
]);

const MANAGEMENT_BINDING_FIELDS = Object.freeze([
  "schemaVersion",
  "profile",
  "artifactPath",
  "sha256",
  "size",
]);

const STEP_EVIDENCE_FIELDS = Object.freeze([
  "schemaVersion",
  "profile",
  "provenance",
  "identity",
  "step",
  "assertions",
]);

const MANAGEMENT_ACCEPTANCE_FIELDS = Object.freeze([
  "schemaVersion",
  "profile",
  "releaseGateSchemaVersion",
  "qualificationProfile",
  "provenance",
  "identity",
  "step",
  "assertions",
  "checks",
  "result",
]);

const MANAGEMENT_RESULT_FIELDS = Object.freeze([
  "pass",
  "overall",
  "failures",
  "warnings",
  "missing",
  "skipped",
]);

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requireFullSha(value, label) {
  const sha = requireString(value, label).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error(`${label} must be a full 40-character Git SHA`);
  }
  return sha;
}

function requireSha256(value, label) {
  const digest = requireString(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`${label} must be a SHA-256`);
  return digest;
}

function requirePositiveDecimal(value, label) {
  const decimal = requireString(value, label);
  if (!/^[1-9]\d*$/.test(decimal)) throw new Error(`${label} must be a positive decimal string`);
  return decimal;
}

function requireHttpsUrl(value, label, { githubRun = false } = {}) {
  const raw = requireString(value, label);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) {
    throw new Error(`${label} must be a credential-free HTTPS URL without query or fragment`);
  }
  const canonical = url.href.replace(/\/$/, "");
  if (raw.replace(/\/$/, "") !== canonical) {
    throw new Error(`${label} must use canonical URL encoding`);
  }
  if (githubRun && !/^https:\/\/github\.com\/ajoe734\/execute-plans\/actions\/runs\/[1-9]\d*$/.test(raw)) {
    throw new Error(`${label} must be an exact execute-plans GitHub Actions run URL`);
  }
  return canonical;
}

function sameOrderedValues(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function assertSameJson(actual, expected, label) {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${label} does not match its recomputed value`);
  }
}

export function normalizeReleaseIdentity(identity, label = "identity") {
  assertExactObjectFields(identity, IDENTITY_FIELDS, label);
  const leaseId = requireString(identity.leaseId, `${label}.leaseId`);
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(leaseId)) {
    throw new Error(`${label}.leaseId contains unsupported characters`);
  }
  return {
    frontendSha: requireFullSha(identity.frontendSha, `${label}.frontendSha`),
    backendSha: requireFullSha(identity.backendSha, `${label}.backendSha`),
    feBaseUrl: requireHttpsUrl(identity.feBaseUrl, `${label}.feBaseUrl`),
    bffBaseUrl: requireHttpsUrl(identity.bffBaseUrl, `${label}.bffBaseUrl`),
    runUrl: requireHttpsUrl(identity.runUrl, `${label}.runUrl`, { githubRun: true }),
    leaseId,
  };
}

function normalizeProvenanceCore(value, label) {
  assertExactObjectFields(value, PROVENANCE_CORE_FIELDS, label);
  if (value.schemaVersion !== RELEASE_GATE_PROVENANCE_SCHEMA_VERSION ||
      value.profile !== RELEASE_GATE_PROVENANCE_PROFILE ||
      value.repository !== "ajoe734/execute-plans" ||
      value.workflowPath !== ".github/workflows/pantheon-integration-gate.yml") {
    throw new Error(`${label} has the wrong version, repository, or workflow`);
  }
  return {
    schemaVersion: RELEASE_GATE_PROVENANCE_SCHEMA_VERSION,
    profile: RELEASE_GATE_PROVENANCE_PROFILE,
    repository: "ajoe734/execute-plans",
    workflowPath: ".github/workflows/pantheon-integration-gate.yml",
    workflowSha: requireFullSha(value.workflowSha, `${label}.workflowSha`),
    controllerSha: requireFullSha(value.controllerSha, `${label}.controllerSha`),
    runId: requirePositiveDecimal(value.runId, `${label}.runId`),
    runAttempt: requirePositiveDecimal(value.runAttempt, `${label}.runAttempt`),
  };
}

function validateRelativeArtifactPath(value, label) {
  const relative = requireString(value, label);
  if (relative.includes("\\") || relative.includes("\0") || path.posix.isAbsolute(relative)) {
    throw new Error(`${label} must be a canonical relative POSIX path`);
  }
  const segments = relative.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..") ||
      path.posix.normalize(relative) !== relative) {
    throw new Error(`${label} must not contain empty, dot, or traversal segments`);
  }
  return relative;
}

function normalizeEvidenceDescriptor(descriptor, expectedPath, label) {
  assertExactObjectFields(descriptor, EVIDENCE_DESCRIPTOR_FIELDS, label);
  const artifactPath = validateRelativeArtifactPath(descriptor.path, `${label}.path`);
  if (artifactPath !== expectedPath) throw new Error(`${label}.path must be ${expectedPath}`);
  if (!Number.isSafeInteger(descriptor.size) || descriptor.size < 1 ||
      descriptor.size > MAX_RELEASE_GATE_SUMMARY_BYTES) {
    throw new Error(`${label}.size is outside the bounded evidence range`);
  }
  return {
    path: artifactPath,
    sha256: requireSha256(descriptor.sha256, `${label}.sha256`),
    size: descriptor.size,
  };
}

export function normalizeExpectedProvenance(expectedProvenance) {
  assertExactObjectFields(
    expectedProvenance,
    EXPECTED_PROVENANCE_FIELDS,
    "expectedProvenance",
  );
  const core = normalizeProvenanceCore(
    Object.fromEntries(PROVENANCE_CORE_FIELDS.map((field) => [field, expectedProvenance[field]])),
    "expectedProvenance",
  );
  assertExactObjectFields(expectedProvenance.artifacts, CRITICAL_ARTIFACT_KEYS, "expected artifacts");
  const artifacts = Object.fromEntries(CRITICAL_ARTIFACT_KEYS.map((key) => [
    key,
    normalizeEvidenceDescriptor(
      expectedProvenance.artifacts[key],
      RELEASE_GATE_CRITICAL_ARTIFACT_PATHS[key],
      `expected artifacts.${key}`,
    ),
  ]));
  return {
    core,
    artifactId: requirePositiveDecimal(expectedProvenance.artifactId, "expectedProvenance.artifactId"),
    artifactDigestSha256: requireSha256(
      expectedProvenance.artifactDigestSha256,
      "expectedProvenance.artifactDigestSha256",
    ),
    artifacts,
  };
}

function assertNoDuplicateJsonObjectKeys(text, label) {
  let index = 0;
  const fail = (message) => {
    throw new Error(`${label} is not exact JSON: ${message} at offset ${index}`);
  };
  const skipWhitespace = () => {
    while (index < text.length && /\s/.test(text[index])) index += 1;
  };
  const parseStringToken = () => {
    if (text[index] !== '"') fail("expected string");
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") {
        index += 2;
        continue;
      }
      if (text[index] === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      }
      index += 1;
    }
    fail("unterminated string");
  };
  const parseValue = () => {
    skipWhitespace();
    const token = text[index];
    if (token === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      while (index < text.length) {
        skipWhitespace();
        const key = parseStringToken();
        if (keys.has(key)) fail(`duplicate object key ${JSON.stringify(key)}`);
        keys.add(key);
        skipWhitespace();
        if (text[index] !== ":") fail("expected colon");
        index += 1;
        parseValue();
        skipWhitespace();
        if (text[index] === "}") {
          index += 1;
          return;
        }
        if (text[index] !== ",") fail("expected comma");
        index += 1;
      }
      fail("unterminated object");
    }
    if (token === "[") {
      index += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      while (index < text.length) {
        parseValue();
        skipWhitespace();
        if (text[index] === "]") {
          index += 1;
          return;
        }
        if (text[index] !== ",") fail("expected comma");
        index += 1;
      }
      fail("unterminated array");
    }
    if (token === '"') {
      parseStringToken();
      return;
    }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    const number = text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) {
      index += number[0].length;
      return;
    }
    fail("unexpected value");
  };

  parseValue();
  skipWhitespace();
  if (index !== text.length) fail("trailing content");
}

export function parseExactJsonBytes(
  rawBytes,
  label,
  maxBytes = MAX_RELEASE_GATE_EVIDENCE_BYTES,
) {
  if (!Buffer.isBuffer(rawBytes)) throw new Error(`${label} must be a Buffer`);
  if (rawBytes.length < 1 || rawBytes.length > maxBytes) {
    throw new Error(`${label} must be between 1 and ${maxBytes} bytes`);
  }
  if (rawBytes.length >= 3 && rawBytes[0] === 0xef && rawBytes[1] === 0xbb && rawBytes[2] === 0xbf) {
    throw new Error(`${label} must not contain a UTF-8 BOM`);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
  assertNoDuplicateJsonObjectKeys(text, label);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

export function parseRawStepOutcomes(rawBytes) {
  return parseExactJsonBytes(rawBytes, "raw step outcomes");
}

function statIdentity(stat) {
  return {
    dev: Number(stat.dev),
    ino: Number(stat.ino),
    mode: Number(stat.mode),
    size: Number(stat.size),
    mtimeMs: Number(stat.mtimeMs),
    ctimeMs: Number(stat.ctimeMs),
  };
}

function sameStatIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode &&
    left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

export function readBoundedRegularFile(
  filePath,
  {
    label = "evidence file",
    maxBytes = MAX_RELEASE_GATE_EVIDENCE_BYTES,
    fsImpl = fs,
  } = {},
) {
  const resolved = path.resolve(requireString(filePath, "filePath"));
  const before = fsImpl.lstatSync(resolved, { throwIfNoEntry: false });
  if (!before) throw new Error(`${label} is missing: ${resolved}`);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`${label} must be a regular, non-symlink file: ${resolved}`);
  }
  if (before.size < 1 || before.size > maxBytes) {
    throw new Error(`${label} exceeds its 1..${maxBytes}-byte bound: ${before.size}`);
  }

  let descriptor;
  try {
    const constants = fsImpl.constants || fs.constants;
    descriptor = fsImpl.openSync(
      resolved,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? fs.constants.O_NOFOLLOW ?? 0),
    );
    const opened = fsImpl.fstatSync(descriptor);
    if (!opened.isFile() || !sameStatIdentity(statIdentity(before), statIdentity(opened))) {
      throw new Error(`${label} changed identity between lstat and open`);
    }
    const bytes = fsImpl.readFileSync(descriptor);
    const after = fsImpl.fstatSync(descriptor);
    if (!Buffer.isBuffer(bytes) || bytes.length !== opened.size ||
        !sameStatIdentity(statIdentity(opened), statIdentity(after))) {
      throw new Error(`${label} changed while it was read`);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) fsImpl.closeSync(descriptor);
  }
}

function snapshotTrustedParentChain(root, relativePath, fsImpl) {
  const rootPath = path.resolve(requireString(root, "trustedArtifactRoot"));
  const relative = validateRelativeArtifactPath(relativePath, "artifact path");
  const rootStat = fsImpl.lstatSync(rootPath, { throwIfNoEntry: false });
  if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error("trustedArtifactRoot must be a real, non-symlink directory");
  }
  const snapshots = [[rootPath, statIdentity(rootStat)]];
  let current = rootPath;
  const parentSegments = relative.split("/").slice(0, -1);
  for (const segment of parentSegments) {
    current = path.join(current, segment);
    const stat = fsImpl.lstatSync(current, { throwIfNoEntry: false });
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`artifact parent must be a real, non-symlink directory: ${current}`);
    }
    snapshots.push([current, statIdentity(stat)]);
  }
  const resolved = path.resolve(rootPath, relative);
  if (!resolved.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error("artifact path escapes trustedArtifactRoot");
  }
  return { resolved, snapshots };
}

function assertParentChainStable(snapshots, fsImpl) {
  for (const [directory, before] of snapshots) {
    const after = fsImpl.lstatSync(directory, { throwIfNoEntry: false });
    if (!after || after.isSymbolicLink() || !after.isDirectory() ||
        !sameStatIdentity(before, statIdentity(after))) {
      throw new Error(`artifact parent changed while evidence was read: ${directory}`);
    }
  }
}

export function readVerifiedArtifact(
  trustedArtifactRoot,
  descriptor,
  {
    expectedPath = descriptor?.path,
    maxBytes = MAX_RELEASE_GATE_EVIDENCE_BYTES,
    fsImpl = fs,
    label = "artifact",
  } = {},
) {
  const normalized = normalizeEvidenceDescriptor(descriptor, expectedPath, label);
  if (normalized.size > maxBytes) throw new Error(`${label} exceeds its allowed byte bound`);
  const { resolved, snapshots } = snapshotTrustedParentChain(
    trustedArtifactRoot,
    normalized.path,
    fsImpl,
  );
  const bytes = readBoundedRegularFile(resolved, { label, maxBytes, fsImpl });
  assertParentChainStable(snapshots, fsImpl);
  if (bytes.length !== normalized.size) throw new Error(`${label} size binding mismatch`);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  if (digest !== normalized.sha256) throw new Error(`${label} SHA-256 binding mismatch`);
  return bytes;
}

function assertCriticalByteBinding(key, bytes, expectedDescriptor) {
  const maxBytes = key === "summary"
    ? MAX_RELEASE_GATE_SUMMARY_BYTES
    : MAX_RELEASE_GATE_EVIDENCE_BYTES;
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > maxBytes) {
    throw new Error(`${key} critical evidence bytes are outside their bound`);
  }
  if (bytes.length !== expectedDescriptor.size) {
    throw new Error(`${key} critical evidence size does not match trusted provenance`);
  }
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  if (digest !== expectedDescriptor.sha256) {
    throw new Error(`${key} critical evidence digest does not match trusted provenance`);
  }
}

export function createStepOutcomeBinding(rawBytes) {
  const stepOutcomes = parseRawStepOutcomes(rawBytes);
  const inspection = inspectReleaseGateStepOutcomes(stepOutcomes);
  return {
    schemaVersion: RELEASE_GATE_STEP_OUTCOME_SCHEMA_VERSION,
    profile: RELEASE_GATE_STEP_OUTCOME_PROFILE,
    artifactPath: RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.stepOutcomes,
    sha256: crypto.createHash("sha256").update(rawBytes).digest("hex"),
    size: rawBytes.length,
    requiredKeys: [...RELEASE_GATE_STEP_OUTCOME_KEYS],
    ...inspection,
  };
}

export function createManagementAcceptanceBinding(rawBytes) {
  parseExactJsonBytes(rawBytes, "management acceptance");
  return {
    schemaVersion: RELEASE_GATE_MANAGEMENT_BINDING_SCHEMA_VERSION,
    profile: RELEASE_GATE_MANAGEMENT_BINDING_PROFILE,
    artifactPath: RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.managementAcceptance,
    sha256: crypto.createHash("sha256").update(rawBytes).digest("hex"),
    size: rawBytes.length,
  };
}

function validateStepOutcomeBinding(binding, rawBytes, expectedDescriptor) {
  assertExactObjectFields(binding, STEP_OUTCOME_BINDING_FIELDS, "stepOutcomes binding");
  if (binding.schemaVersion !== RELEASE_GATE_STEP_OUTCOME_SCHEMA_VERSION ||
      binding.profile !== RELEASE_GATE_STEP_OUTCOME_PROFILE ||
      binding.artifactPath !== RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.stepOutcomes) {
    throw new Error("stepOutcomes binding has the wrong version, profile, or path");
  }
  const stepOutcomes = parseRawStepOutcomes(rawBytes);
  const inspection = inspectReleaseGateStepOutcomes(stepOutcomes);
  if (!sameOrderedValues(binding.requiredKeys, RELEASE_GATE_STEP_OUTCOME_KEYS) ||
      binding.exact !== inspection.exact ||
      !sameOrderedValues(binding.observedKeys, inspection.observedKeys) ||
      !sameOrderedValues(binding.missingKeys, inspection.missingKeys) ||
      !sameOrderedValues(binding.unknownKeys, inspection.unknownKeys) ||
      binding.orderedKeys !== inspection.orderedKeys ||
      !sameOrderedValues(binding.invalidEntries, inspection.invalidEntries) ||
      inspection.exact !== true) {
    throw new Error(
      `raw step outcomes do not match the exact ordered ${RELEASE_GATE_STEP_OUTCOME_KEYS.length}-outcome v2 contract`,
    );
  }
  if (binding.sha256 !== expectedDescriptor.sha256 || binding.size !== expectedDescriptor.size ||
      binding.sha256 !== crypto.createHash("sha256").update(rawBytes).digest("hex") ||
      binding.size !== rawBytes.length) {
    throw new Error("raw step-outcome byte binding does not match trusted provenance");
  }
  const nonSuccess = RELEASE_GATE_STEP_OUTCOME_KEYS.filter(
    (key) => stepOutcomes[key]?.outcome !== "success",
  );
  if (nonSuccess.length > 0) {
    throw new Error(`release qualification has non-success step outcomes: ${nonSuccess.join(",")}`);
  }
  return stepOutcomes;
}

function validateManagementBinding(binding, rawBytes, expectedDescriptor) {
  assertExactObjectFields(binding, MANAGEMENT_BINDING_FIELDS, "managementAcceptance binding");
  if (binding.schemaVersion !== RELEASE_GATE_MANAGEMENT_BINDING_SCHEMA_VERSION ||
      binding.profile !== RELEASE_GATE_MANAGEMENT_BINDING_PROFILE ||
      binding.artifactPath !== RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.managementAcceptance ||
      binding.sha256 !== expectedDescriptor.sha256 || binding.size !== expectedDescriptor.size ||
      binding.sha256 !== crypto.createHash("sha256").update(rawBytes).digest("hex") ||
      binding.size !== rawBytes.length) {
    throw new Error("managementAcceptance byte binding does not match trusted provenance");
  }
}

function expectedAssertionValue(verifier, identity) {
  if (verifier === "boolean-true") return true;
  if (verifier === "zero") return 0;
  if (verifier === "identity-frontend-sha") return identity.frontendSha;
  if (verifier === "identity-backend-sha") return identity.backendSha;
  if (verifier === "identity-fe-base-url") return identity.feBaseUrl;
  if (verifier === "identity-bff-base-url") return identity.bffBaseUrl;
  throw new Error(`unsupported machine assertion verifier: ${verifier}`);
}

function checkDefinitionById(id) {
  for (const gate of RELEASE_GATE_NUMBERS) {
    const check = releaseGateDefinition(gate).checks.find((candidate) => candidate.id === id);
    if (check) return check;
  }
  throw new Error(`release gate schema has no check ${id}`);
}

function deriveMachineChecks(step, assertions, identity) {
  const definitions = assertionDefinitionsForStep(step);
  if (!Array.isArray(assertions) || assertions.length !== definitions.length) {
    throw new Error(
      `${step} machine assertions must contain exactly ${definitions.length} allowlisted outputs`,
    );
  }
  return definitions.map((definition, index) => {
    const assertion = assertions[index];
    assertExactObjectFields(assertion, RELEASE_GATE_ASSERTION_FIELDS, `${step} assertion ${index}`);
    if (assertion.id !== definition.id || assertion.verifier !== definition.verifier) {
      throw new Error(`${step} assertion ${index} does not match the allowlisted verifier binding`);
    }
    const expected = expectedAssertionValue(definition.verifier, identity);
    const pass = isDeepStrictEqual(assertion.observed, expected);
    const contract = checkDefinitionById(definition.id);
    return {
      id: contract.id,
      label: contract.label,
      status: pass ? "pass" : "fail",
      note: pass
        ? `machine assertion ${definition.verifier} verified from ${step}`
        : `machine assertion ${definition.verifier} failed from ${step}`,
    };
  });
}

function assertEmbeddedContext(value, identity, provenanceCore, label) {
  const embeddedIdentity = normalizeReleaseIdentity(value.identity, `${label}.identity`);
  assertSameJson(embeddedIdentity, identity, `${label} identity`);
  const embeddedProvenance = normalizeProvenanceCore(value.provenance, `${label}.provenance`);
  assertSameJson(embeddedProvenance, provenanceCore, `${label} provenance`);
}

function validateStepEvidenceEnvelope(envelope, step, identity, provenanceCore) {
  assertExactObjectFields(envelope, STEP_EVIDENCE_FIELDS, `${step} evidence`);
  if (envelope.schemaVersion !== RELEASE_GATE_STEP_EVIDENCE_SCHEMA_VERSION ||
      envelope.profile !== RELEASE_GATE_STEP_EVIDENCE_PROFILE ||
      envelope.step !== step) {
    throw new Error(`${step} evidence has the wrong version, profile, or step`);
  }
  assertEmbeddedContext(envelope, identity, provenanceCore, `${step} evidence`);
  return deriveMachineChecks(step, envelope.assertions, identity);
}

function expectedResultLists(checks) {
  return {
    failures: checks.filter((check) => check.status === "fail").map((check) => check.label),
    warnings: checks.filter((check) => check.status === "warn").map((check) => check.label),
    missing: checks.filter((check) => check.status === "missing").map((check) => check.label),
    skipped: checks.filter((check) => check.status === "skip").map((check) => check.label),
  };
}

export function createManagementAcceptanceResult(checks) {
  assertExactGateCheckSequence(8, checks);
  const result = deriveReleaseGateResult(checks);
  return {
    pass: result.pass,
    overall: result.overall,
    ...expectedResultLists(checks),
  };
}

function validateManagementAcceptance(
  manifest,
  identity,
  provenanceCore,
) {
  assertExactObjectFields(
    manifest,
    MANAGEMENT_ACCEPTANCE_FIELDS,
    "management acceptance manifest",
  );
  if (manifest.schemaVersion !== MANAGEMENT_ACCEPTANCE_SCHEMA_VERSION ||
      manifest.profile !== MANAGEMENT_ACCEPTANCE_PROFILE ||
      manifest.releaseGateSchemaVersion !== RELEASE_GATE_SCHEMA_VERSION ||
      manifest.qualificationProfile !== RELEASE_GATE_QUALIFICATION_PROFILE ||
      manifest.step !== "mgmt_hosted_accept") {
    throw new Error("management acceptance manifest has the wrong version, profile, or step");
  }
  assertEmbeddedContext(manifest, identity, provenanceCore, "management acceptance");
  const derivedChecks = deriveMachineChecks(
    "mgmt_hosted_accept",
    manifest.assertions,
    identity,
  );
  assertExactGateCheckSequence(8, manifest.checks);
  assertSameJson(manifest.checks, derivedChecks, "management acceptance checks");
  assertExactObjectFields(manifest.result, MANAGEMENT_RESULT_FIELDS, "management result");
  assertSameJson(
    manifest.result,
    createManagementAcceptanceResult(derivedChecks),
    "management acceptance result",
  );
  return derivedChecks;
}

function deriveReleaseDecisionGate(gates, auditContext) {
  const priorChecks = RELEASE_GATE_NUMBERS
    .filter((gate) => gate !== 7)
    .flatMap((gate) => gates[String(gate)]);
  const blockers = priorChecks.filter((check) => check.status !== "pass");
  const auditComplete = auditContext.verifiedStepEvidence === RELEASE_GATE_STEP_OUTCOME_KEYS.length &&
    auditContext.verifiedCriticalEvidence === CRITICAL_ARTIFACT_KEYS.length &&
    auditContext.provenanceVerified === true;
  const definition = releaseGateDefinition(7).checks;
  const check = (index, status, note) => ({ ...definition[index], status, note });
  return [
    check(0, blockers.length === 0 ? "pass" : "fail", `${blockers.length} non-pass check(s)`),
    check(1, blockers.length === 0 ? "pass" : "fail", blockers.length === 0
      ? "no qualification exception is needed"
      : "qualification exceptions cannot mask non-pass checks"),
    check(2, auditComplete ? "pass" : "fail", auditComplete
      ? `${auditContext.verifiedStepEvidence}/${RELEASE_GATE_STEP_OUTCOME_KEYS.length} step evidence files and ${auditContext.verifiedCriticalEvidence}/${CRITICAL_ARTIFACT_KEYS.length} critical manifests verified`
      : "required byte-bound audit evidence is incomplete"),
    check(3, auditContext.provenanceVerified === true ? "pass" : "fail", auditContext.provenanceVerified === true
      ? "exact frontend/backend/run-attempt/artifact/lease identifiers verified"
      : "release provenance is incomplete"),
  ];
}

function deriveGatesFromEvidence({
  stepOutcomes,
  managementAcceptance,
  identity,
  provenanceCore,
  trustedArtifactRoot,
  fileReadOptions,
}) {
  const checkById = new Map();
  let verifiedStepEvidence = 0;
  for (const step of RELEASE_GATE_STEP_OUTCOME_KEYS) {
    const descriptor = stepOutcomes[step].evidence;
    const bytes = readVerifiedArtifact(trustedArtifactRoot, descriptor, {
      ...fileReadOptions,
      maxBytes: MAX_RELEASE_GATE_EVIDENCE_BYTES,
      label: `${step} evidence`,
    });
    verifiedStepEvidence += 1;
    let checks;
    if (step === "mgmt_hosted_accept") {
      const expectedManagementBytes = fileReadOptions.managementAcceptanceBytes;
      if (!Buffer.isBuffer(expectedManagementBytes) || !bytes.equals(expectedManagementBytes)) {
        throw new Error("mgmt_hosted_accept evidence is not the exact management manifest bytes");
      }
      checks = validateManagementAcceptance(
        managementAcceptance,
        identity,
        provenanceCore,
      );
    } else {
      const envelope = parseExactJsonBytes(bytes, `${step} evidence`);
      checks = validateStepEvidenceEnvelope(envelope, step, identity, provenanceCore);
    }
    for (const check of checks) {
      if (checkById.has(check.id)) throw new Error(`duplicate derived release check: ${check.id}`);
      checkById.set(check.id, check);
    }
  }

  const gates = {};
  for (const gate of RELEASE_GATE_NUMBERS.filter((value) => value !== 7)) {
    gates[String(gate)] = releaseGateDefinition(gate).checks.map(({ id }) => {
      const check = checkById.get(id);
      if (!check) throw new Error(`release check ${id} lacks a machine-verifiable assertion`);
      return check;
    });
  }
  gates["7"] = deriveReleaseDecisionGate(gates, {
    verifiedStepEvidence,
    verifiedCriticalEvidence: CRITICAL_ARTIFACT_KEYS.length,
    provenanceVerified: true,
  });
  return { gates, verifiedStepEvidence };
}

export function validateReleaseQualificationEvidence(input) {
  const {
    summaryBytes,
    rawStepOutcomeBytes,
    managementAcceptanceBytes,
    expectedIdentity,
    expectedProvenance,
    trustedArtifactRoot,
    fileReadOptions = {},
  } = input || {};
  if (Object.hasOwn(input || {}, "summary") || Object.hasOwn(input || {}, "managementAcceptance")) {
    throw new Error("parsed summary/management objects are forbidden; pass exact raw bytes");
  }

  const identity = normalizeReleaseIdentity(expectedIdentity, "expectedIdentity");
  const provenance = normalizeExpectedProvenance(expectedProvenance);
  if (provenance.core.workflowSha !== identity.frontendSha ||
      identity.runUrl !== `https://github.com/ajoe734/execute-plans/actions/runs/${provenance.core.runId}`) {
    throw new Error("trusted provenance does not match the expected release identity");
  }
  if (provenance.core.controllerSha === identity.frontendSha) {
    throw new Error("trusted controller SHA must be independent from the frontend candidate SHA");
  }
  assertCriticalByteBinding("summary", summaryBytes, provenance.artifacts.summary);
  assertCriticalByteBinding("stepOutcomes", rawStepOutcomeBytes, provenance.artifacts.stepOutcomes);
  assertCriticalByteBinding(
    "managementAcceptance",
    managementAcceptanceBytes,
    provenance.artifacts.managementAcceptance,
  );

  const summary = parseExactJsonBytes(
    summaryBytes,
    "release summary",
    MAX_RELEASE_GATE_SUMMARY_BYTES,
  );
  const managementAcceptance = parseExactJsonBytes(
    managementAcceptanceBytes,
    "management acceptance",
  );
  assertExactObjectFields(summary, SUMMARY_FIELDS, "release summary");
  if (summary.schemaVersion !== RELEASE_GATE_SCHEMA_VERSION ||
      summary.qualificationProfile !== RELEASE_GATE_QUALIFICATION_PROFILE ||
      summary.releaseQualification !== true) {
    throw new Error("release summary has the wrong version, profile, or qualification posture");
  }
  const summaryIdentity = normalizeReleaseIdentity(summary.identity, "summary.identity");
  assertSameJson(summaryIdentity, identity, "release summary identity");
  const summaryProvenance = normalizeProvenanceCore(summary.provenance, "summary.provenance");
  assertSameJson(summaryProvenance, provenance.core, "release summary provenance");

  const stepOutcomes = validateStepOutcomeBinding(
    summary.stepOutcomes,
    rawStepOutcomeBytes,
    provenance.artifacts.stepOutcomes,
  );
  validateManagementBinding(
    summary.managementAcceptance,
    managementAcceptanceBytes,
    provenance.artifacts.managementAcceptance,
  );
  assertExactReleaseGateShape(summary.gates);

  const { gates: recomputedGates, verifiedStepEvidence } = deriveGatesFromEvidence({
    stepOutcomes,
    managementAcceptance,
    identity,
    provenanceCore: provenance.core,
    trustedArtifactRoot,
    fileReadOptions: { ...fileReadOptions, managementAcceptanceBytes },
  });
  assertSameJson(summary.gates, recomputedGates, "release gates");

  const allChecks = RELEASE_GATE_NUMBERS.flatMap((gate) => recomputedGates[String(gate)]);
  const recomputedOverall = allChecks.every((check) => check.status === "pass") ? "pass" : "fail";
  if (allChecks.length !== 79 || recomputedOverall !== "pass" || summary.overall !== recomputedOverall) {
    throw new Error("release qualification requires exactly 79 machine-verified passing checks");
  }
  return {
    status: "valid",
    frontendSha: identity.frontendSha,
    backendSha: identity.backendSha,
    runUrl: identity.runUrl,
    runAttempt: provenance.core.runAttempt,
    artifactId: provenance.artifactId,
    artifactDigestSha256: provenance.artifactDigestSha256,
    controllerSha: provenance.core.controllerSha,
    leaseId: identity.leaseId,
    gateCount: RELEASE_GATE_NUMBERS.length,
    checkCount: allChecks.length,
    stepOutcomeCount: RELEASE_GATE_STEP_OUTCOME_KEYS.length,
    verifiedEvidenceCount: verifiedStepEvidence,
  };
}

export function validateReleaseQualificationEvidenceFromArtifactRoot({
  trustedArtifactRoot,
  expectedIdentity,
  expectedProvenance,
  fileReadOptions = {},
}) {
  const provenance = normalizeExpectedProvenance(expectedProvenance);
  const summaryBytes = readVerifiedArtifact(
    trustedArtifactRoot,
    provenance.artifacts.summary,
    {
      ...fileReadOptions,
      expectedPath: RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.summary,
      maxBytes: MAX_RELEASE_GATE_SUMMARY_BYTES,
      label: "release summary",
    },
  );
  const rawStepOutcomeBytes = readVerifiedArtifact(
    trustedArtifactRoot,
    provenance.artifacts.stepOutcomes,
    {
      ...fileReadOptions,
      expectedPath: RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.stepOutcomes,
      label: "raw step outcomes",
    },
  );
  const managementAcceptanceBytes = readVerifiedArtifact(
    trustedArtifactRoot,
    provenance.artifacts.managementAcceptance,
    {
      ...fileReadOptions,
      expectedPath: RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.managementAcceptance,
      label: "management acceptance",
    },
  );
  return validateReleaseQualificationEvidence({
    summaryBytes,
    rawStepOutcomeBytes,
    managementAcceptanceBytes,
    expectedIdentity,
    expectedProvenance,
    trustedArtifactRoot,
    fileReadOptions,
  });
}
