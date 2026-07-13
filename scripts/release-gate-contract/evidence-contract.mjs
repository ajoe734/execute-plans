// Dormant release-evidence validation foundation.
//
// This module performs no network access, reads no environment variables, and
// is not referenced by deployment automation. Callers must pass every expected
// identity value and every evidence byte explicitly.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  MANAGEMENT_ACCEPTANCE_PROFILE,
  MANAGEMENT_ACCEPTANCE_SCHEMA_VERSION,
  RELEASE_GATE_NUMBERS,
  RELEASE_GATE_QUALIFICATION_PROFILE,
  RELEASE_GATE_SCHEMA_VERSION,
  RELEASE_GATE_STEP_OUTCOME_KEYS,
  RELEASE_GATE_STEP_OUTCOME_PROFILE,
  RELEASE_GATE_STEP_OUTCOME_SCHEMA_VERSION,
  assertExactGateCheckSequence,
  assertExactObjectFields,
  assertExactReleaseGateShape,
  createGateChecks,
  deriveReleaseGateResult,
  inspectReleaseGateStepOutcomes,
  releaseGateDefinition,
} from "./schema.mjs";

export const MAX_RELEASE_GATE_EVIDENCE_BYTES = 1024 * 1024;

const IDENTITY_FIELDS = Object.freeze([
  "frontendSha",
  "backendSha",
  "feBaseUrl",
  "bffBaseUrl",
  "runUrl",
  "leaseId",
]);

const SUMMARY_FIELDS = Object.freeze([
  "schemaVersion",
  "qualificationProfile",
  "releaseQualification",
  "overall",
  "identity",
  "auditEvidencePresent",
  "stepOutcomes",
  "gates",
]);

const STEP_OUTCOME_BINDING_FIELDS = Object.freeze([
  "schemaVersion",
  "profile",
  "artifactPath",
  "sha256",
  "requiredKeys",
  "exact",
  "observedKeys",
  "missingKeys",
  "unknownKeys",
  "orderedKeys",
  "invalidEntries",
]);

const MANAGEMENT_ACCEPTANCE_FIELDS = Object.freeze([
  "schemaVersion",
  "profile",
  "releaseGateSchemaVersion",
  "qualificationProfile",
  "identity",
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

function requireHttpsUrl(value, label, { githubRun = false } = {}) {
  const raw = requireString(value, label);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${label} must be a credential-free HTTPS URL without a fragment`);
  }
  if (githubRun && !/^https:\/\/github\.com\/ajoe734\/execute-plans\/actions\/runs\/\d+$/.test(raw)) {
    throw new Error(`${label} must be an exact execute-plans GitHub Actions run URL`);
  }
  return raw.replace(/\/$/, "");
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

export function createStepOutcomeBinding(rawBytes, artifactPath = "release-gate-step-outcomes.json") {
  if (!Buffer.isBuffer(rawBytes)) throw new Error("raw step outcomes must be a Buffer");
  const stepOutcomes = parseRawStepOutcomes(rawBytes);
  const inspection = inspectReleaseGateStepOutcomes(stepOutcomes);
  return {
    schemaVersion: RELEASE_GATE_STEP_OUTCOME_SCHEMA_VERSION,
    profile: RELEASE_GATE_STEP_OUTCOME_PROFILE,
    artifactPath,
    sha256: crypto.createHash("sha256").update(rawBytes).digest("hex"),
    requiredKeys: [...RELEASE_GATE_STEP_OUTCOME_KEYS],
    ...inspection,
  };
}

function assertNoDuplicateJsonObjectKeys(text) {
  let index = 0;
  const fail = (message) => {
    throw new Error(`raw step outcomes are not exact JSON: ${message} at offset ${index}`);
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

export function parseRawStepOutcomes(rawBytes) {
  if (!Buffer.isBuffer(rawBytes)) throw new Error("raw step outcomes must be a Buffer");
  if (rawBytes.length < 1 || rawBytes.length > MAX_RELEASE_GATE_EVIDENCE_BYTES) {
    throw new Error(
      `raw step outcomes must be between 1 and ${MAX_RELEASE_GATE_EVIDENCE_BYTES} bytes`,
    );
  }
  const text = rawBytes.toString("utf8");
  assertNoDuplicateJsonObjectKeys(text);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`raw step outcomes are not valid JSON: ${error.message}`);
  }
}

export function validateStepOutcomeBinding(binding, rawBytes) {
  assertExactObjectFields(binding, STEP_OUTCOME_BINDING_FIELDS, "stepOutcomes binding");
  if (binding.schemaVersion !== RELEASE_GATE_STEP_OUTCOME_SCHEMA_VERSION ||
      binding.profile !== RELEASE_GATE_STEP_OUTCOME_PROFILE) {
    throw new Error("stepOutcomes binding has the wrong version or profile");
  }
  if (binding.artifactPath !== "release-gate-step-outcomes.json") {
    throw new Error("stepOutcomes binding has a non-canonical artifact path");
  }
  if (!/^[a-f0-9]{64}$/.test(String(binding.sha256 || ""))) {
    throw new Error("stepOutcomes binding has an invalid SHA-256");
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
    throw new Error("raw step outcomes do not match the exact ordered 18-outcome contract");
  }

  const observedDigest = crypto.createHash("sha256").update(rawBytes).digest("hex");
  if (binding.sha256 !== observedDigest) {
    throw new Error(`raw step-outcome SHA-256 mismatch: observed ${observedDigest}`);
  }

  const nonSuccess = RELEASE_GATE_STEP_OUTCOME_KEYS.filter(
    (key) => stepOutcomes[key]?.outcome !== "success",
  );
  if (nonSuccess.length > 0) {
    throw new Error(`release qualification has non-success step outcomes: ${nonSuccess.join(",")}`);
  }
  return stepOutcomes;
}

function statIdentity(stat) {
  return {
    dev: Number(stat.dev),
    ino: Number(stat.ino),
    size: Number(stat.size),
    mtimeMs: Number(stat.mtimeMs),
    ctimeMs: Number(stat.ctimeMs),
  };
}

function sameStatIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

export function readBoundedRegularFile(
  filePath,
  {
    maxBytes = MAX_RELEASE_GATE_EVIDENCE_BYTES,
    fsImpl = fs,
  } = {},
) {
  const resolved = path.resolve(requireString(filePath, "filePath"));
  const before = fsImpl.lstatSync(resolved, { throwIfNoEntry: false });
  if (!before) throw new Error(`evidence file is missing: ${resolved}`);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`evidence file must be a regular, non-symlink file: ${resolved}`);
  }
  if (before.size < 1 || before.size > maxBytes) {
    throw new Error(`evidence file exceeds its 1..${maxBytes}-byte bound: ${before.size}`);
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
      throw new Error("evidence file changed identity between lstat and open");
    }
    const bytes = fsImpl.readFileSync(descriptor);
    const after = fsImpl.fstatSync(descriptor);
    if (!Buffer.isBuffer(bytes) || bytes.length !== opened.size ||
        !sameStatIdentity(statIdentity(opened), statIdentity(after))) {
      throw new Error("evidence file changed while it was read");
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) fsImpl.closeSync(descriptor);
  }
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

export function deriveManagementAcceptanceGate(manifest, expectedIdentity) {
  try {
    const identity = normalizeReleaseIdentity(expectedIdentity, "expectedIdentity");
    assertExactObjectFields(
      manifest,
      MANAGEMENT_ACCEPTANCE_FIELDS,
      "management acceptance manifest",
    );
    if (manifest.schemaVersion !== MANAGEMENT_ACCEPTANCE_SCHEMA_VERSION ||
        manifest.profile !== MANAGEMENT_ACCEPTANCE_PROFILE ||
        manifest.releaseGateSchemaVersion !== RELEASE_GATE_SCHEMA_VERSION ||
        manifest.qualificationProfile !== RELEASE_GATE_QUALIFICATION_PROFILE) {
      throw new Error("management acceptance manifest has the wrong version or profile");
    }
    const manifestIdentity = normalizeReleaseIdentity(manifest.identity, "management identity");
    assertSameJson(manifestIdentity, identity, "management acceptance identity");
    assertExactGateCheckSequence(8, manifest.checks);
    assertExactObjectFields(manifest.result, MANAGEMENT_RESULT_FIELDS, "management result");
    const expectedResult = createManagementAcceptanceResult(manifest.checks);
    assertSameJson(manifest.result, expectedResult, "management acceptance result");
    return manifest.checks.map((check) => ({ ...check }));
  } catch (error) {
    return createGateChecks(8, "fail", `invalid management acceptance: ${error.message}`);
  }
}

export function deriveReleaseDecisionGate(gates, expectedIdentity, auditEvidencePresent) {
  normalizeReleaseIdentity(expectedIdentity, "expectedIdentity");
  const priorChecks = RELEASE_GATE_NUMBERS
    .filter((gate) => gate !== 7)
    .flatMap((gate) => {
      assertExactGateCheckSequence(gate, gates[String(gate)]);
      return gates[String(gate)];
    });
  const blockers = priorChecks.filter((check) => check.status !== "pass");
  const definition = releaseGateDefinition(7).checks;
  const check = (index, status, note) => ({ ...definition[index], status, note });
  return [
    check(0, blockers.length === 0 ? "pass" : "fail", `${blockers.length} non-pass check(s)`),
    check(1, blockers.length === 0 ? "pass" : "fail", blockers.length === 0
      ? "no qualification exception is needed"
      : "qualification exceptions cannot mask non-pass checks"),
    check(2, auditEvidencePresent === true ? "pass" : "fail", auditEvidencePresent === true
      ? "audit evidence present"
      : "audit evidence missing"),
    check(3, "pass", "exact frontend/backend/URL/run/lease identifiers validated"),
  ];
}

export function validateReleaseQualificationEvidence({
  summary,
  rawStepOutcomeBytes,
  managementAcceptance,
  expectedIdentity,
}) {
  assertExactObjectFields(summary, SUMMARY_FIELDS, "release summary");
  if (summary.schemaVersion !== RELEASE_GATE_SCHEMA_VERSION ||
      summary.qualificationProfile !== RELEASE_GATE_QUALIFICATION_PROFILE ||
      summary.releaseQualification !== true) {
    throw new Error("release summary has the wrong version, profile, or qualification posture");
  }
  const identity = normalizeReleaseIdentity(expectedIdentity, "expectedIdentity");
  const summaryIdentity = normalizeReleaseIdentity(summary.identity, "summary.identity");
  assertSameJson(summaryIdentity, identity, "release summary identity");
  validateStepOutcomeBinding(summary.stepOutcomes, rawStepOutcomeBytes);
  assertExactReleaseGateShape(summary.gates);

  const recomputedGate8 = deriveManagementAcceptanceGate(managementAcceptance, identity);
  assertSameJson(summary.gates["8"], recomputedGate8, "Gate 8");
  const gatesForDecision = { ...summary.gates, 8: recomputedGate8 };
  const recomputedGate7 = deriveReleaseDecisionGate(
    gatesForDecision,
    identity,
    summary.auditEvidencePresent,
  );
  assertSameJson(summary.gates["7"], recomputedGate7, "Gate 7");

  const allChecks = RELEASE_GATE_NUMBERS.flatMap((gate) => summary.gates[String(gate)]);
  if (allChecks.length !== 79 || allChecks.some((check) => check.status !== "pass")) {
    throw new Error("release qualification requires exactly 79 passing checks");
  }
  if (summary.overall !== "pass" || summary.auditEvidencePresent !== true) {
    throw new Error("release qualification summary is not fail-closed and product-passing");
  }
  return {
    status: "valid",
    frontendSha: identity.frontendSha,
    backendSha: identity.backendSha,
    runUrl: identity.runUrl,
    leaseId: identity.leaseId,
    gateCount: RELEASE_GATE_NUMBERS.length,
    checkCount: allChecks.length,
    stepOutcomeCount: RELEASE_GATE_STEP_OUTCOME_KEYS.length,
  };
}

export function validateReleaseQualificationEvidenceFromFile({
  rawStepOutcomesPath,
  fileReadOptions,
  ...evidence
}) {
  const rawStepOutcomeBytes = readBoundedRegularFile(rawStepOutcomesPath, fileReadOptions);
  return validateReleaseQualificationEvidence({ ...evidence, rawStepOutcomeBytes });
}
