#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = 1;
const FRONTEND_REPOSITORY = "ajoe734/execute-plans";
const GATE_WORKFLOW = "pantheon-integration-gate.yml";
const DEPLOYMENT_MANIFEST_PATH = "deployment.json";
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/u;
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".htm",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".svg",
  ".text",
  ".txt",
  ".xml",
]);

export const SAFE_BUILD_MODE = Object.freeze({
  VITE_BFF_MODE: "live",
  VITE_BFF_FALLBACK: "strict",
  VITE_BFF_REAL_WRITES: "false",
  VITE_BFF_ALLOW_DEV_STUB_WRITES: "false",
  VITE_BFF_EMBEDDED_BEARER_TOKEN: "false",
});

export const WRITE_PROOF_BUILD_MODE = Object.freeze({
  ...SAFE_BUILD_MODE,
  VITE_BFF_REAL_WRITES: "true",
  VITE_BFF_ALLOW_DEV_STUB_WRITES: "true",
});

export const RELEASE_PROFILES = Object.freeze({
  READ_ONLY: "read-only",
  WRITE_PROOF: "write-proof",
});

function normalizeProfile(value, label = "release profile") {
  const normalized = requiredString(value, label);
  if (!Object.values(RELEASE_PROFILES).includes(normalized)) {
    throw new Error(`${label} must be read-only or write-proof`);
  }
  return normalized;
}

function requiredString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function normalizeSha(value, label) {
  const normalized = requiredString(value, label).toLowerCase();
  if (!SHA_PATTERN.test(normalized)) {
    throw new Error(`${label} must be an exact 40-character hexadecimal SHA`);
  }
  return normalized;
}

function normalizeDigest(value, label) {
  const normalized = requiredString(value, label).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new Error(`${label} must be an exact SHA-256 digest`);
  }
  return normalized;
}

function normalizeGateRunId(value, label = "gate run ID") {
  const normalized = requiredString(value, label);
  if (!POSITIVE_INTEGER_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a positive integer`);
  }
  return normalized;
}

function normalizeHttpUrl(value, label, { gateRunId = "" } = {}) {
  const raw = requiredString(value, label);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use HTTP or HTTPS`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      `${label} must not contain credentials, a query, or a fragment`,
    );
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "") || "/";
  if (gateRunId && !parsed.pathname.endsWith(`/actions/runs/${gateRunId}`)) {
    throw new Error(`${label} does not match the gate run ID`);
  }
  return parsed.pathname === "/"
    ? parsed.origin
    : `${parsed.origin}${parsed.pathname}`;
}

function normalizeBuildMode(
  buildMode = SAFE_BUILD_MODE,
  profile = RELEASE_PROFILES.READ_ONLY,
) {
  const normalizedProfile = normalizeProfile(profile);
  const expectedMode =
    normalizedProfile === RELEASE_PROFILES.WRITE_PROOF
      ? WRITE_PROOF_BUILD_MODE
      : SAFE_BUILD_MODE;
  const keys = Object.keys(buildMode || {}).sort();
  const expectedKeys = Object.keys(expectedMode).sort();
  if (keys.join(",") !== expectedKeys.join(",")) {
    throw new Error(
      "unsafe release candidate build mode: fields must match the strict safe contract",
    );
  }
  const normalized = Object.fromEntries(
    Object.keys(expectedMode).map((key) => [
      key,
      String(buildMode?.[key] ?? "").trim(),
    ]),
  );
  for (const [key, expected] of Object.entries(expectedMode)) {
    if (normalized[key] !== expected) {
      throw new Error(
        `unsafe release candidate build mode: ${key} must be ${expected}`,
      );
    }
  }
  return normalized;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sortPaths(left, right) {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function canonicalRelativePath(relativePath, label = "asset path") {
  const normalized = String(relativePath ?? "").replaceAll(path.sep, "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("\\") ||
    normalized
      .split("/")
      .some((part) => !part || part === "." || part === "..") ||
    path.posix.normalize(normalized) !== normalized
  ) {
    throw new Error(`${label} must be a canonical relative path`);
  }
  return normalized;
}

function isWithin(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

function assertDirectoryRoot(rootPath, label) {
  let stat;
  try {
    stat = fs.lstatSync(rootPath);
  } catch {
    throw new Error(`${label} is not a readable directory`);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must be a real directory, not a symlink`);
  }
}

function assertSafeOutputPath(sourceRoot, outputRoot) {
  const cwd = path.resolve(process.cwd());
  if (
    outputRoot === path.parse(outputRoot).root ||
    outputRoot === cwd ||
    outputRoot === sourceRoot ||
    isWithin(sourceRoot, outputRoot) ||
    isWithin(outputRoot, sourceRoot)
  ) {
    throw new Error(
      "output directory must be a separate, non-ancestor directory",
    );
  }
  if (fs.existsSync(outputRoot)) {
    const stat = fs.lstatSync(outputRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(
        "output directory must be a real directory, not a symlink",
      );
    }
  }
}

function normalizeSentinels(values) {
  return [
    ...new Set(
      (values || [])
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(
          (value) =>
            value.length >= 8 &&
            !["undefined", "password", "changeme"].includes(
              value.toLowerCase(),
            ),
        ),
    ),
  ];
}

function isTextAsset(relativePath) {
  return TEXT_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase());
}

const CREDENTIAL_PATTERNS = Object.freeze([
  {
    kind: "bearer credential",
    pattern: /\bbearer[\t ]+[a-z0-9._~+/=-]{8,}/iu,
  },
  {
    kind: "client secret",
    pattern: /\bclient[_-]?secret\b["'`]?\s*[:=]\s*["'`]?[a-z0-9._~+/=-]{4,}/iu,
  },
  {
    kind: "private key",
    pattern: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/u,
  },
  {
    kind: "private key literal",
    pattern: /\bprivate[_-]?key\b["'`]?\s*[:=]\s*["'`][^"'`\r\n]{8,}/iu,
  },
  {
    kind: "service-role credential",
    pattern:
      /\bservice[_-]?role[_-]?(?:key|secret|token)\b["'`]?\s*[:=]\s*["'`]?[a-z0-9._~+/=-]{4,}/iu,
  },
  {
    kind: "token sentinel",
    pattern:
      /\b(?:access|refresh|auth|api|dev|browser|service[_-]?role)?[_-]?token\b["'`]?\s*[:=]\s*["'`][^"'`\r\n]{0,128}sentinel[^"'`\r\n]*/iu,
  },
]);

function scanTextBytes(bytes, relativePath, secretSentinels) {
  if (!isTextAsset(relativePath)) return;
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${relativePath}: text asset is not valid UTF-8`);
  }

  for (const sentinel of secretSentinels) {
    if (text.includes(sentinel)) {
      throw new Error(
        `${relativePath}: configured secret sentinel is embedded in a browser asset`,
      );
    }
  }
  for (const { kind, pattern } of CREDENTIAL_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(
        `${relativePath}: forbidden ${kind} is embedded in a browser asset`,
      );
    }
  }
}

function collectFiles(
  rootPath,
  { secretSentinels = [], excludeDeployment = false } = {},
) {
  assertDirectoryRoot(rootPath, "asset root");
  const rootRealPath = fs.realpathSync(rootPath);
  const records = [];

  function visit(directoryPath) {
    const entries = fs
      .readdirSync(directoryPath, { withFileTypes: true })
      .sort((left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      );
    for (const entry of entries) {
      const absolutePath = path.join(directoryPath, entry.name);
      const stat = fs.lstatSync(absolutePath);
      const relativePath = canonicalRelativePath(
        path.relative(rootPath, absolutePath),
      );
      if (stat.isSymbolicLink()) {
        throw new Error(
          `${relativePath}: symlinks are forbidden in a release candidate`,
        );
      }
      if (stat.isDirectory()) {
        const realDirectory = fs.realpathSync(absolutePath);
        if (
          realDirectory !== rootRealPath &&
          !isWithin(rootRealPath, realDirectory)
        ) {
          throw new Error(
            `${relativePath}: directory escapes the release candidate root`,
          );
        }
        visit(absolutePath);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(
          `${relativePath}: only regular files are allowed in a release candidate`,
        );
      }
      const realFile = fs.realpathSync(absolutePath);
      if (!isWithin(rootRealPath, realFile)) {
        throw new Error(
          `${relativePath}: file escapes the release candidate root`,
        );
      }
      const bytes = fs.readFileSync(absolutePath);
      scanTextBytes(bytes, relativePath, secretSentinels);
      if (excludeDeployment && relativePath === DEPLOYMENT_MANIFEST_PATH)
        continue;
      records.push({
        path: relativePath,
        sha256: sha256(bytes),
        size: bytes.length,
        absolutePath,
      });
    }
  }

  visit(rootPath);
  return records.sort(sortPaths);
}

export function canonicalAssetManifestBytes(files) {
  const normalizedFiles = files.map((file, index) => {
    const filePath = canonicalRelativePath(file?.path, `files[${index}].path`);
    if (filePath === DEPLOYMENT_MANIFEST_PATH) {
      throw new Error(
        "deployment.json must be excluded from the canonical asset manifest",
      );
    }
    const digest = normalizeDigest(file?.sha256, `files[${index}].sha256`);
    if (!Number.isSafeInteger(file?.size) || file.size < 0) {
      throw new Error(
        `files[${index}].size must be a non-negative safe integer`,
      );
    }
    return { path: filePath, sha256: digest, size: file.size };
  });
  const sorted = [...normalizedFiles].sort(sortPaths);
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index].path !== normalizedFiles[index]?.path) {
      throw new Error("canonical asset manifest files must be sorted by path");
    }
    if (index > 0 && sorted[index - 1].path === sorted[index].path) {
      throw new Error("canonical asset manifest contains a duplicate path");
    }
  }
  return Buffer.from(
    `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, files: normalizedFiles })}\n`,
    "utf8",
  );
}

function publicFileRecords(records) {
  return records.map(({ path: filePath, sha256: digest, size }) => ({
    path: filePath,
    sha256: digest,
    size,
  }));
}

export function digestReleaseDist({
  distDir,
  expectedArtifactDigest = "",
  secretSentinels = [],
}) {
  const distRoot = path.resolve(requiredString(distDir, "dist directory"));
  const normalizedSentinels = normalizeSentinels(secretSentinels);
  const records = collectFiles(distRoot, {
    secretSentinels: normalizedSentinels,
    excludeDeployment: true,
  });
  const files = publicFileRecords(records);
  const artifactDigestSha256 = sha256(canonicalAssetManifestBytes(files));

  if (
    expectedArtifactDigest &&
    artifactDigestSha256 !==
      normalizeDigest(expectedArtifactDigest, "expected artifact digest")
  ) {
    throw new Error(
      "release dist canonical asset digest does not match the expected digest",
    );
  }

  return {
    artifactDigestSha256,
    fileCount: files.length,
    files,
  };
}

function makeCandidate({
  profile,
  pairId = "",
  frontendSha,
  bffSha,
  bffBaseUrl,
  gateRunId,
  gateRunUrl,
  buildMode,
  files,
  artifactDigest,
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    repository: FRONTEND_REPOSITORY,
    profile,
    ...(pairId ? { pairId } : {}),
    frontendSha,
    bffSha,
    bffBaseUrl,
    gate: {
      workflow: GATE_WORKFLOW,
      runId: gateRunId,
      runUrl: gateRunUrl,
    },
    buildMode,
    artifactDigestSha256: artifactDigest,
    artifactDigest,
    files,
  };
}

function makeDeploymentManifest(candidate) {
  return {
    schemaVersion: SCHEMA_VERSION,
    app: "execute-plans",
    environment: "pantheon-dev-fe",
    repository: FRONTEND_REPOSITORY,
    profile: candidate.profile,
    ...(candidate.pairId ? { pairId: candidate.pairId } : {}),
    commit: candidate.frontendSha,
    frontendSha: candidate.frontendSha,
    frontend: {
      repository: FRONTEND_REPOSITORY,
      commitSha: candidate.frontendSha,
    },
    bffHost: candidate.bffBaseUrl,
    bffCommit: candidate.bffSha,
    bffSourceCommitSha: candidate.bffSha,
    bffCommitEvidence: true,
    bff: {
      baseUrl: candidate.bffBaseUrl,
      sourceCommitSha: candidate.bffSha,
      sourceCommitKnown: true,
    },
    gate: candidate.gate,
    integrationGateRunId: candidate.gate.runId,
    artifactDigest: candidate.artifactDigestSha256,
    artifactDigestSha256: candidate.artifactDigestSha256,
    buildMode: candidate.buildMode,
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  });
}

function validateExpectedCandidate(candidate, expectations) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("candidate.json must contain a JSON object");
  }
  if (
    candidate.schemaVersion !== SCHEMA_VERSION ||
    candidate.repository !== FRONTEND_REPOSITORY
  ) {
    throw new Error("candidate.json has an unsupported schema or repository");
  }
  const profile = normalizeProfile(candidate.profile, "candidate profile");
  const pairId = candidate.pairId
    ? normalizeDigest(candidate.pairId, "candidate pair ID")
    : "";
  if (expectations.pairId && pairId !== normalizeDigest(expectations.pairId, "expected pair ID")) {
    throw new Error("candidate pair ID does not match the expected pair");
  }
  if (expectations.profile && profile !== normalizeProfile(expectations.profile, "expected profile")) {
    throw new Error("candidate profile does not match the expected profile");
  }
  const frontendSha = normalizeSha(
    candidate.frontendSha,
    "candidate frontend SHA",
  );
  const bffSha = normalizeSha(candidate.bffSha, "candidate BFF SHA");
  const gateRunId = normalizeGateRunId(
    candidate.gate?.runId,
    "candidate gate run ID",
  );
  const bffBaseUrl = normalizeHttpUrl(
    candidate.bffBaseUrl,
    "candidate BFF base URL",
  );
  const gateRunUrl = normalizeHttpUrl(
    candidate.gate?.runUrl,
    "candidate gate run URL",
    { gateRunId },
  );
  if (candidate.gate?.workflow !== GATE_WORKFLOW) {
    throw new Error("candidate gate workflow is not the integration gate");
  }
  const buildMode = normalizeBuildMode(candidate.buildMode, profile);
  const artifactDigest = normalizeDigest(
    candidate.artifactDigestSha256,
    "candidate artifact digest",
  );
  if (candidate.artifactDigest !== artifactDigest) {
    throw new Error("candidate artifact digest aliases do not match");
  }

  const expectedFrontendSha = normalizeSha(
    expectations.frontendSha,
    "expected frontend SHA",
  );
  const expectedGateRunId = normalizeGateRunId(
    expectations.gateRunId,
    "expected gate run ID",
  );
  if (frontendSha !== expectedFrontendSha)
    throw new Error("candidate frontend SHA does not match the expected SHA");
  if (gateRunId !== expectedGateRunId)
    throw new Error("candidate gate run ID does not match the expected run");
  if (
    expectations.bffSha &&
    bffSha !== normalizeSha(expectations.bffSha, "expected BFF SHA")
  ) {
    throw new Error("candidate BFF SHA does not match the expected SHA");
  }
  if (
    expectations.bffBaseUrl &&
    bffBaseUrl !==
      normalizeHttpUrl(expectations.bffBaseUrl, "expected BFF base URL")
  ) {
    throw new Error("candidate BFF base URL does not match the expected URL");
  }
  if (
    expectations.artifactDigest &&
    artifactDigest !==
      normalizeDigest(expectations.artifactDigest, "expected artifact digest")
  ) {
    throw new Error(
      "candidate artifact digest does not match the expected digest",
    );
  }

  return {
    profile,
    pairId,
    frontendSha,
    bffSha,
    bffBaseUrl,
    gateRunId,
    gateRunUrl,
    buildMode,
    artifactDigest,
  };
}

function validateDeclaredFiles(files) {
  if (!Array.isArray(files))
    throw new Error("candidate files must be an array");
  const normalized = files.map((file, index) => {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      throw new Error(`files[${index}] must be an object`);
    }
    const keys = Object.keys(file).sort();
    if (keys.join(",") !== "path,sha256,size") {
      throw new Error(`files[${index}] has unexpected fields`);
    }
    return {
      path: canonicalRelativePath(file.path, `files[${index}].path`),
      sha256: normalizeDigest(file.sha256, `files[${index}].sha256`),
      size: file.size,
    };
  });
  canonicalAssetManifestBytes(normalized);
  return normalized;
}

function validateDeploymentManifest(deployment, candidate, normalized) {
  if (
    !deployment ||
    typeof deployment !== "object" ||
    Array.isArray(deployment)
  ) {
    throw new Error("deployment.json must contain a JSON object");
  }
  const consistent =
    deployment.schemaVersion === SCHEMA_VERSION &&
    deployment.app === "execute-plans" &&
    deployment.environment === "pantheon-dev-fe" &&
    deployment.repository === FRONTEND_REPOSITORY &&
    deployment.profile === normalized.profile &&
    (normalized.pairId
      ? deployment.pairId === normalized.pairId
      : deployment.pairId === undefined) &&
    deployment.commit === normalized.frontendSha &&
    deployment.frontendSha === normalized.frontendSha &&
    deployment.frontend?.repository === FRONTEND_REPOSITORY &&
    deployment.frontend?.commitSha === normalized.frontendSha &&
    deployment.bffHost === normalized.bffBaseUrl &&
    deployment.bffCommit === normalized.bffSha &&
    deployment.bffSourceCommitSha === normalized.bffSha &&
    deployment.bffCommitEvidence === true &&
    deployment.bff?.baseUrl === normalized.bffBaseUrl &&
    deployment.bff?.sourceCommitSha === normalized.bffSha &&
    deployment.bff?.sourceCommitKnown === true &&
    deployment.gate?.workflow === GATE_WORKFLOW &&
    String(deployment.gate?.runId) === normalized.gateRunId &&
    deployment.gate?.runUrl === normalized.gateRunUrl &&
    String(deployment.integrationGateRunId) === normalized.gateRunId &&
    deployment.artifactDigest === normalized.artifactDigest &&
    deployment.artifactDigestSha256 === normalized.artifactDigest &&
    Object.entries(normalized.buildMode).every(
      ([key, value]) => deployment.buildMode?.[key] === value,
    ) &&
    Object.keys(deployment.buildMode || {})
      .sort()
      .join(",") === Object.keys(normalized.buildMode).sort().join(",") &&
    candidate.artifactDigestSha256 === normalized.artifactDigest;
  if (!consistent)
    throw new Error(
      "deployment.json is inconsistent with the verified release candidate",
    );
}

export function verifyReleaseCandidate({
  candidateDir,
  expectedFrontendSha,
  expectedGateRunId,
  expectedBffSha = "",
  expectedBffBaseUrl = "",
  expectedArtifactDigest = "",
  expectedProfile = RELEASE_PROFILES.READ_ONLY,
  expectedPairId = "",
  secretSentinels = [],
  allowPairEnvelope = false,
}) {
  const candidateRoot = path.resolve(
    requiredString(candidateDir, "candidate directory"),
  );
  assertDirectoryRoot(candidateRoot, "candidate directory");
  const envelopeEntries = fs.readdirSync(candidateRoot, {
    withFileTypes: true,
  });
  const envelopeNames = envelopeEntries.map((entry) => entry.name).sort();
  const expectedEnvelope = allowPairEnvelope
    ? "candidate.json,dist,pair.json,write-proof"
    : "candidate.json,dist";
  if (envelopeNames.join(",") !== expectedEnvelope) {
    throw new Error(
      allowPairEnvelope
        ? "paired candidate directory must contain exactly candidate.json, dist, pair.json, and write-proof"
        : "candidate directory must contain exactly candidate.json and dist",
    );
  }
  for (const entry of envelopeEntries) {
    if (entry.isSymbolicLink()) {
      throw new Error(
        `${entry.name}: symlinks are forbidden in a release candidate`,
      );
    }
  }
  const normalizedSentinels = normalizeSentinels(secretSentinels);
  const candidatePath = path.join(candidateRoot, "candidate.json");
  const distRoot = path.join(candidateRoot, "dist");

  let candidateStat;
  try {
    candidateStat = fs.lstatSync(candidatePath);
  } catch {
    throw new Error("candidate.json is missing");
  }
  if (candidateStat.isSymbolicLink() || !candidateStat.isFile()) {
    throw new Error("candidate.json must be a regular file, not a symlink");
  }
  const candidateBytes = fs.readFileSync(candidatePath);
  scanTextBytes(candidateBytes, "candidate.json", normalizedSentinels);
  let candidate;
  try {
    candidate = JSON.parse(candidateBytes.toString("utf8"));
  } catch {
    throw new Error("candidate.json is not valid JSON");
  }

  const normalized = validateExpectedCandidate(candidate, {
    frontendSha: expectedFrontendSha,
    gateRunId: expectedGateRunId,
    bffSha: expectedBffSha,
    bffBaseUrl: expectedBffBaseUrl,
    artifactDigest: expectedArtifactDigest,
    profile: expectedProfile,
    pairId: expectedPairId,
  });
  const declaredFiles = validateDeclaredFiles(candidate.files);
  const actualRecords = collectFiles(distRoot, {
    secretSentinels: normalizedSentinels,
    excludeDeployment: true,
  });
  const actualFiles = publicFileRecords(actualRecords);
  if (JSON.stringify(actualFiles) !== JSON.stringify(declaredFiles)) {
    throw new Error(
      "release candidate asset manifest does not match the files on disk",
    );
  }
  const observedDigest = sha256(canonicalAssetManifestBytes(actualFiles));
  if (observedDigest !== normalized.artifactDigest) {
    throw new Error("release candidate canonical asset digest mismatch");
  }

  const deploymentPath = path.join(distRoot, DEPLOYMENT_MANIFEST_PATH);
  let deploymentStat;
  try {
    deploymentStat = fs.lstatSync(deploymentPath);
  } catch {
    throw new Error("dist/deployment.json is missing");
  }
  if (deploymentStat.isSymbolicLink() || !deploymentStat.isFile()) {
    throw new Error(
      "dist/deployment.json must be a regular file, not a symlink",
    );
  }
  let deployment;
  try {
    deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  } catch {
    throw new Error("dist/deployment.json is not valid JSON");
  }
  validateDeploymentManifest(deployment, candidate, normalized);

  return {
    candidate,
    deployment,
    artifactDigestSha256: observedDigest,
    fileCount: actualFiles.length,
  };
}

export function prepareReleaseCandidate({
  distDir,
  outputDir = ".release-candidate",
  frontendSha,
  bffSha,
  gateRunId,
  gateRunUrl,
  bffBaseUrl,
  buildMode = SAFE_BUILD_MODE,
  secretSentinels = [],
}) {
  const sourceRoot = path.resolve(requiredString(distDir, "dist directory"));
  const outputRoot = path.resolve(
    requiredString(outputDir, "output directory"),
  );
  assertDirectoryRoot(sourceRoot, "dist directory");
  assertSafeOutputPath(sourceRoot, outputRoot);

  const normalizedFrontendSha = normalizeSha(frontendSha, "frontend SHA");
  const normalizedBffSha = normalizeSha(bffSha, "BFF SHA");
  const normalizedGateRunId = normalizeGateRunId(gateRunId);
  const normalizedGateRunUrl = normalizeHttpUrl(gateRunUrl, "gate run URL", {
    gateRunId: normalizedGateRunId,
  });
  const normalizedBffBaseUrl = normalizeHttpUrl(bffBaseUrl, "BFF base URL");
  const normalizedBuildMode = normalizeBuildMode(buildMode);
  const normalizedSentinels = normalizeSentinels(secretSentinels);
  const sourceRecords = collectFiles(sourceRoot, {
    secretSentinels: normalizedSentinels,
    excludeDeployment: true,
  });
  const files = publicFileRecords(sourceRecords);
  const artifactDigest = sha256(canonicalAssetManifestBytes(files));
  const candidate = makeCandidate({
    profile: RELEASE_PROFILES.READ_ONLY,
    frontendSha: normalizedFrontendSha,
    bffSha: normalizedBffSha,
    bffBaseUrl: normalizedBffBaseUrl,
    gateRunId: normalizedGateRunId,
    gateRunUrl: normalizedGateRunUrl,
    buildMode: normalizedBuildMode,
    files,
    artifactDigest,
  });
  const deployment = makeDeploymentManifest(candidate);
  const temporaryRoot = `${outputRoot}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;

  try {
    fs.mkdirSync(path.join(temporaryRoot, "dist"), {
      recursive: true,
      mode: 0o755,
    });
    for (const record of sourceRecords) {
      const destination = path.join(
        temporaryRoot,
        "dist",
        ...record.path.split("/"),
      );
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 });
      fs.copyFileSync(record.absolutePath, destination);
      fs.chmodSync(destination, 0o644);
    }
    writeJson(
      path.join(temporaryRoot, "dist", DEPLOYMENT_MANIFEST_PATH),
      deployment,
    );
    writeJson(path.join(temporaryRoot, "candidate.json"), candidate);

    verifyReleaseCandidate({
      candidateDir: temporaryRoot,
      expectedFrontendSha: normalizedFrontendSha,
      expectedGateRunId: normalizedGateRunId,
      expectedBffSha: normalizedBffSha,
      expectedBffBaseUrl: normalizedBffBaseUrl,
      expectedArtifactDigest: artifactDigest,
      secretSentinels: normalizedSentinels,
    });

    if (fs.existsSync(outputRoot))
      fs.rmSync(outputRoot, { recursive: true, force: true });
    fs.renameSync(temporaryRoot, outputRoot);
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }

  return {
    candidate,
    deployment,
    outputDir: outputRoot,
    artifactDigestSha256: artifactDigest,
  };
}

function pairIdentity({
  frontendSha,
  bffSha,
  bffBaseUrl,
  gateRunId,
  gateRunUrl,
  readOnlyDigest,
  writeProofDigest,
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    repository: FRONTEND_REPOSITORY,
    frontendSha,
    bffSha,
    bffBaseUrl,
    gate: {
      workflow: GATE_WORKFLOW,
      runId: gateRunId,
      runUrl: gateRunUrl,
    },
    profiles: {
      readOnly: {
        profile: RELEASE_PROFILES.READ_ONLY,
        relativePath: ".",
        artifactDigestSha256: readOnlyDigest,
      },
      writeProof: {
        profile: RELEASE_PROFILES.WRITE_PROOF,
        relativePath: "write-proof",
        artifactDigestSha256: writeProofDigest,
      },
    },
  };
}

function pairIdFor(identity) {
  return sha256(Buffer.from(`${JSON.stringify(identity)}\n`, "utf8"));
}

function copyCandidateDist(records, targetRoot, candidate) {
  fs.mkdirSync(path.join(targetRoot, "dist"), {
    recursive: true,
    mode: 0o755,
  });
  for (const record of records) {
    const destination = path.join(
      targetRoot,
      "dist",
      ...record.path.split("/"),
    );
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 });
    fs.copyFileSync(record.absolutePath, destination);
    fs.chmodSync(destination, 0o644);
  }
  writeJson(
    path.join(targetRoot, "dist", DEPLOYMENT_MANIFEST_PATH),
    makeDeploymentManifest(candidate),
  );
  writeJson(path.join(targetRoot, "candidate.json"), candidate);
}

function validatePairManifest(pair, expectations) {
  if (!pair || typeof pair !== "object" || Array.isArray(pair)) {
    throw new Error("pair.json must contain a JSON object");
  }
  const expectedKeys = [
    "bffBaseUrl",
    "bffSha",
    "frontendSha",
    "gate",
    "pairId",
    "profiles",
    "repository",
    "schemaVersion",
  ];
  if (Object.keys(pair).sort().join(",") !== expectedKeys.join(",")) {
    throw new Error("pair.json has unexpected fields");
  }
  if (
    pair.schemaVersion !== SCHEMA_VERSION ||
    pair.repository !== FRONTEND_REPOSITORY
  ) {
    throw new Error("pair.json has an unsupported schema or repository");
  }
  const frontendSha = normalizeSha(pair.frontendSha, "pair frontend SHA");
  const bffSha = normalizeSha(pair.bffSha, "pair BFF SHA");
  const bffBaseUrl = normalizeHttpUrl(pair.bffBaseUrl, "pair BFF base URL");
  const gateRunId = normalizeGateRunId(pair.gate?.runId, "pair gate run ID");
  const gateRunUrl = normalizeHttpUrl(pair.gate?.runUrl, "pair gate run URL", {
    gateRunId,
  });
  if (pair.gate?.workflow !== GATE_WORKFLOW) {
    throw new Error("pair gate workflow is not the integration gate");
  }
  if (
    Object.keys(pair.gate || {}).sort().join(",") !==
    "runId,runUrl,workflow"
  ) {
    throw new Error("pair gate has unexpected fields");
  }
  const readOnly = pair.profiles?.readOnly;
  const writeProof = pair.profiles?.writeProof;
  const validProfiles =
    readOnly?.profile === RELEASE_PROFILES.READ_ONLY &&
    readOnly?.relativePath === "." &&
    writeProof?.profile === RELEASE_PROFILES.WRITE_PROOF &&
    writeProof?.relativePath === "write-proof" &&
    Object.keys(pair.profiles || {}).sort().join(",") ===
      "readOnly,writeProof" &&
    Object.keys(readOnly || {}).sort().join(",") ===
      "artifactDigestSha256,profile,relativePath" &&
    Object.keys(writeProof || {}).sort().join(",") ===
      "artifactDigestSha256,profile,relativePath";
  if (!validProfiles) throw new Error("pair profiles are invalid");
  const readOnlyDigest = normalizeDigest(
    readOnly.artifactDigestSha256,
    "pair read-only artifact digest",
  );
  const writeProofDigest = normalizeDigest(
    writeProof.artifactDigestSha256,
    "pair write-proof artifact digest",
  );
  if (readOnlyDigest === writeProofDigest) {
    throw new Error("paired profiles must have distinct artifact digests");
  }
  const identity = pairIdentity({
    frontendSha,
    bffSha,
    bffBaseUrl,
    gateRunId,
    gateRunUrl,
    readOnlyDigest,
    writeProofDigest,
  });
  const pairId = normalizeDigest(pair.pairId, "pair ID");
  if (pairId !== pairIdFor(identity)) {
    throw new Error("pair ID does not match the canonical paired identity");
  }
  if (
    frontendSha !== normalizeSha(expectations.frontendSha, "expected frontend SHA")
  ) {
    throw new Error("pair frontend SHA does not match the expected SHA");
  }
  if (
    gateRunId !== normalizeGateRunId(expectations.gateRunId, "expected gate run ID")
  ) {
    throw new Error("pair gate run ID does not match the expected run");
  }
  if (
    expectations.bffSha &&
    bffSha !== normalizeSha(expectations.bffSha, "expected BFF SHA")
  ) {
    throw new Error("pair BFF SHA does not match the expected SHA");
  }
  if (
    expectations.bffBaseUrl &&
    bffBaseUrl !== normalizeHttpUrl(expectations.bffBaseUrl, "expected BFF base URL")
  ) {
    throw new Error("pair BFF base URL does not match the expected URL");
  }
  if (
    expectations.pairId &&
    pairId !== normalizeDigest(expectations.pairId, "expected pair ID")
  ) {
    throw new Error("pair ID does not match the expected pair");
  }
  return {
    ...identity,
    pairId,
    readOnlyDigest,
    writeProofDigest,
  };
}

export function verifyPairedReleaseCandidate({
  candidateDir,
  expectedFrontendSha,
  expectedGateRunId,
  expectedBffSha = "",
  expectedBffBaseUrl = "",
  expectedPairId = "",
  expectedArtifactDigest = "",
  profile = RELEASE_PROFILES.READ_ONLY,
  secretSentinels = [],
}) {
  const candidateRoot = path.resolve(
    requiredString(candidateDir, "paired candidate directory"),
  );
  assertDirectoryRoot(candidateRoot, "paired candidate directory");
  const normalizedSentinels = normalizeSentinels(secretSentinels);
  const pairPath = path.join(candidateRoot, "pair.json");
  let pairStat;
  try {
    pairStat = fs.lstatSync(pairPath);
  } catch {
    throw new Error("pair.json is missing");
  }
  if (pairStat.isSymbolicLink() || !pairStat.isFile()) {
    throw new Error("pair.json must be a regular file, not a symlink");
  }
  const pairBytes = fs.readFileSync(pairPath);
  scanTextBytes(pairBytes, "pair.json", normalizedSentinels);
  let pair;
  try {
    pair = JSON.parse(pairBytes.toString("utf8"));
  } catch {
    throw new Error("pair.json is not valid JSON");
  }
  const normalized = validatePairManifest(pair, {
    frontendSha: expectedFrontendSha,
    gateRunId: expectedGateRunId,
    bffSha: expectedBffSha,
    bffBaseUrl: expectedBffBaseUrl,
    pairId: expectedPairId,
  });
  const common = {
    expectedFrontendSha: normalized.frontendSha,
    expectedGateRunId: normalized.gate.runId,
    expectedBffSha: normalized.bffSha,
    expectedBffBaseUrl: normalized.bffBaseUrl,
    expectedPairId: normalized.pairId,
    secretSentinels: normalizedSentinels,
  };
  const readOnly = verifyReleaseCandidate({
    candidateDir: candidateRoot,
    ...common,
    expectedArtifactDigest: normalized.readOnlyDigest,
    expectedProfile: RELEASE_PROFILES.READ_ONLY,
    allowPairEnvelope: true,
  });
  const writeProof = verifyReleaseCandidate({
    candidateDir: path.join(candidateRoot, "write-proof"),
    ...common,
    expectedArtifactDigest: normalized.writeProofDigest,
    expectedProfile: RELEASE_PROFILES.WRITE_PROOF,
  });
  const selectedProfile = normalizeProfile(profile, "selected profile");
  const selectedArtifactDigest =
    selectedProfile === RELEASE_PROFILES.WRITE_PROOF
      ? writeProof.artifactDigestSha256
      : readOnly.artifactDigestSha256;
  if (
    expectedArtifactDigest &&
    selectedArtifactDigest !==
      normalizeDigest(expectedArtifactDigest, "expected artifact digest")
  ) {
    throw new Error(
      "selected pair artifact digest does not match the expected digest",
    );
  }
  return {
    pair,
    pairId: normalized.pairId,
    readOnly,
    writeProof,
    selectedProfile,
    artifactDigestSha256: selectedArtifactDigest,
  };
}

export function preparePairedReleaseCandidate({
  readOnlyDistDir,
  writeProofDistDir,
  outputDir = ".release-candidate",
  frontendSha,
  bffSha,
  gateRunId,
  gateRunUrl,
  bffBaseUrl,
  secretSentinels = [],
}) {
  const readOnlyRoot = path.resolve(
    requiredString(readOnlyDistDir, "read-only dist directory"),
  );
  const writeProofRoot = path.resolve(
    requiredString(writeProofDistDir, "write-proof dist directory"),
  );
  const outputRoot = path.resolve(requiredString(outputDir, "output directory"));
  assertDirectoryRoot(readOnlyRoot, "read-only dist directory");
  assertDirectoryRoot(writeProofRoot, "write-proof dist directory");
  if (readOnlyRoot === writeProofRoot) {
    throw new Error("read-only and write-proof dist directories must be distinct");
  }
  assertSafeOutputPath(readOnlyRoot, outputRoot);
  assertSafeOutputPath(writeProofRoot, outputRoot);

  const normalizedFrontendSha = normalizeSha(frontendSha, "frontend SHA");
  const normalizedBffSha = normalizeSha(bffSha, "BFF SHA");
  const normalizedGateRunId = normalizeGateRunId(gateRunId);
  const normalizedGateRunUrl = normalizeHttpUrl(gateRunUrl, "gate run URL", {
    gateRunId: normalizedGateRunId,
  });
  const normalizedBffBaseUrl = normalizeHttpUrl(bffBaseUrl, "BFF base URL");
  const normalizedSentinels = normalizeSentinels(secretSentinels);
  const readOnlyRecords = collectFiles(readOnlyRoot, {
    secretSentinels: normalizedSentinels,
    excludeDeployment: true,
  });
  const writeProofRecords = collectFiles(writeProofRoot, {
    secretSentinels: normalizedSentinels,
    excludeDeployment: true,
  });
  const readOnlyFiles = publicFileRecords(readOnlyRecords);
  const writeProofFiles = publicFileRecords(writeProofRecords);
  const readOnlyDigest = sha256(canonicalAssetManifestBytes(readOnlyFiles));
  const writeProofDigest = sha256(canonicalAssetManifestBytes(writeProofFiles));
  const identity = pairIdentity({
    frontendSha: normalizedFrontendSha,
    bffSha: normalizedBffSha,
    bffBaseUrl: normalizedBffBaseUrl,
    gateRunId: normalizedGateRunId,
    gateRunUrl: normalizedGateRunUrl,
    readOnlyDigest,
    writeProofDigest,
  });
  const pairId = pairIdFor(identity);
  const pair = { ...identity, pairId };
  const commonCandidate = {
    pairId,
    frontendSha: normalizedFrontendSha,
    bffSha: normalizedBffSha,
    bffBaseUrl: normalizedBffBaseUrl,
    gateRunId: normalizedGateRunId,
    gateRunUrl: normalizedGateRunUrl,
  };
  const readOnlyCandidate = makeCandidate({
    ...commonCandidate,
    profile: RELEASE_PROFILES.READ_ONLY,
    buildMode: SAFE_BUILD_MODE,
    files: readOnlyFiles,
    artifactDigest: readOnlyDigest,
  });
  const writeProofCandidate = makeCandidate({
    ...commonCandidate,
    profile: RELEASE_PROFILES.WRITE_PROOF,
    buildMode: WRITE_PROOF_BUILD_MODE,
    files: writeProofFiles,
    artifactDigest: writeProofDigest,
  });
  const temporaryRoot = `${outputRoot}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  try {
    copyCandidateDist(readOnlyRecords, temporaryRoot, readOnlyCandidate);
    copyCandidateDist(
      writeProofRecords,
      path.join(temporaryRoot, "write-proof"),
      writeProofCandidate,
    );
    writeJson(path.join(temporaryRoot, "pair.json"), pair);
    verifyPairedReleaseCandidate({
      candidateDir: temporaryRoot,
      expectedFrontendSha: normalizedFrontendSha,
      expectedGateRunId: normalizedGateRunId,
      expectedBffSha: normalizedBffSha,
      expectedBffBaseUrl: normalizedBffBaseUrl,
      expectedPairId: pairId,
      secretSentinels: normalizedSentinels,
    });
    if (fs.existsSync(outputRoot)) {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
    fs.renameSync(temporaryRoot, outputRoot);
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
  return {
    pair,
    pairId,
    readOnly: {
      candidate: readOnlyCandidate,
      artifactDigestSha256: readOnlyDigest,
    },
    writeProof: {
      candidate: writeProofCandidate,
      artifactDigestSha256: writeProofDigest,
    },
    outputDir: outputRoot,
  };
}

function parseOptions(rawArgs, allowedFlags) {
  const options = new Map();
  for (let index = 0; index < rawArgs.length; index += 2) {
    const flag = rawArgs[index];
    const value = rawArgs[index + 1];
    if (
      !flag?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new Error(
        `invalid option sequence near ${flag || "end of command"}`,
      );
    }
    if (!allowedFlags.has(flag)) throw new Error(`unknown option: ${flag}`);
    if (options.has(flag)) throw new Error(`duplicate option: ${flag}`);
    options.set(flag, value);
  }
  return {
    get(...flags) {
      for (const flag of flags) {
        if (options.has(flag)) return options.get(flag);
      }
      return "";
    },
  };
}

function collectEnvironmentSecretSentinels(environment) {
  const sentinels = [];
  const secretName =
    /(?:^|_)(?:BEARER|TOKEN|SECRET|PRIVATE_KEY|SERVICE_ROLE(?:_KEY)?|CLIENT_SECRET)(?:_|$)/iu;
  const explicitlyPublic = /(?:PUBLISHABLE|PUBLIC|ANON)/iu;
  for (const [name, value] of Object.entries(environment)) {
    if (
      secretName.test(name) &&
      !explicitlyPublic.test(name) &&
      typeof value === "string"
    ) {
      sentinels.push(value);
    }
  }
  const configured = environment.PANTHEON_RELEASE_SECRET_SENTINELS;
  if (configured) {
    try {
      const parsed = JSON.parse(configured);
      if (!Array.isArray(parsed)) throw new Error("not-array");
      sentinels.push(...parsed);
    } catch {
      throw new Error("PANTHEON_RELEASE_SECRET_SENTINELS must be a JSON array");
    }
  }
  return normalizeSentinels(sentinels);
}

function cliBuildMode(options, environment) {
  const browserBearer = String(environment.VITE_BFF_DEV_BEARER_TOKEN || "");
  if (browserBearer) {
    throw new Error(
      "browser bearer environment input must be empty for a release candidate",
    );
  }
  return {
    VITE_BFF_MODE:
      options.get("--vite-bff-mode") || environment.VITE_BFF_MODE || "live",
    VITE_BFF_FALLBACK:
      options.get("--vite-bff-fallback") ||
      environment.VITE_BFF_FALLBACK ||
      "strict",
    VITE_BFF_REAL_WRITES:
      options.get("--vite-bff-real-writes", "--real-writes") ||
      environment.VITE_BFF_REAL_WRITES ||
      "false",
    VITE_BFF_ALLOW_DEV_STUB_WRITES:
      options.get(
        "--vite-bff-allow-dev-stub-writes",
        "--allow-dev-stub-writes",
      ) ||
      environment.VITE_BFF_ALLOW_DEV_STUB_WRITES ||
      "false",
    VITE_BFF_EMBEDDED_BEARER_TOKEN:
      options.get(
        "--vite-bff-embedded-bearer-token",
        "--embedded-bearer-token",
      ) || "false",
  };
}

export function main(argv = process.argv.slice(2), environment = process.env) {
  const [command, ...rawOptions] = argv;
  const commonExpectedFlags = new Set([
    "--candidate-dir",
    "--candidate",
    "--expected-frontend-sha",
    "--frontend-sha",
    "--expected-gate-run-id",
    "--gate-run-id",
    "--expected-bff-sha",
    "--bff-sha",
    "--expected-bff-base-url",
    "--bff-base-url",
    "--expected-artifact-digest",
    "--artifact-digest",
    "--expected-pair-id",
    "--pair-id",
    "--profile",
  ]);
  if (command === "prepare-pair") {
    const options = parseOptions(
      rawOptions,
      new Set([
        "--read-only-dist-dir",
        "--write-proof-dist-dir",
        "--output-dir",
        "--out",
        "--frontend-sha",
        "--bff-sha",
        "--gate-run-id",
        "--gate-run-url",
        "--bff-base-url",
      ]),
    );
    cliBuildMode(
      {
        get() {
          return "";
        },
      },
      environment,
    );
    const result = preparePairedReleaseCandidate({
      readOnlyDistDir: options.get("--read-only-dist-dir"),
      writeProofDistDir: options.get("--write-proof-dist-dir"),
      outputDir: options.get("--output-dir", "--out") || ".release-candidate",
      frontendSha: options.get("--frontend-sha"),
      bffSha: options.get("--bff-sha"),
      gateRunId: options.get("--gate-run-id"),
      gateRunUrl: options.get("--gate-run-url"),
      bffBaseUrl: options.get("--bff-base-url"),
      secretSentinels: collectEnvironmentSecretSentinels(environment),
    });
    process.stdout.write(`${result.pairId}\n`);
    return result;
  }
  if (command === "prepare") {
    const options = parseOptions(
      rawOptions,
      new Set([
        "--dist-dir",
        "--dist",
        "--output-dir",
        "--out",
        "--frontend-sha",
        "--bff-sha",
        "--gate-run-id",
        "--gate-run-url",
        "--bff-base-url",
        "--vite-bff-mode",
        "--vite-bff-fallback",
        "--vite-bff-real-writes",
        "--real-writes",
        "--vite-bff-allow-dev-stub-writes",
        "--allow-dev-stub-writes",
        "--vite-bff-embedded-bearer-token",
        "--embedded-bearer-token",
      ]),
    );
    const result = prepareReleaseCandidate({
      distDir: options.get("--dist-dir", "--dist") || "dist",
      outputDir: options.get("--output-dir", "--out") || ".release-candidate",
      frontendSha: options.get("--frontend-sha"),
      bffSha: options.get("--bff-sha"),
      gateRunId: options.get("--gate-run-id"),
      gateRunUrl: options.get("--gate-run-url"),
      bffBaseUrl: options.get("--bff-base-url"),
      buildMode: cliBuildMode(options, environment),
      secretSentinels: collectEnvironmentSecretSentinels(environment),
    });
    process.stdout.write(`${result.artifactDigestSha256}\n`);
    return result;
  }
  if (command === "verify") {
    const options = parseOptions(rawOptions, commonExpectedFlags);
    const result = verifyReleaseCandidate({
      candidateDir:
        options.get("--candidate-dir", "--candidate") || ".release-candidate",
      expectedFrontendSha: options.get(
        "--expected-frontend-sha",
        "--frontend-sha",
      ),
      expectedGateRunId: options.get("--expected-gate-run-id", "--gate-run-id"),
      expectedBffSha: options.get("--expected-bff-sha", "--bff-sha"),
      expectedBffBaseUrl: options.get(
        "--expected-bff-base-url",
        "--bff-base-url",
      ),
      expectedArtifactDigest: options.get(
        "--expected-artifact-digest",
        "--artifact-digest",
      ),
      secretSentinels: collectEnvironmentSecretSentinels(environment),
    });
    process.stdout.write(`${result.artifactDigestSha256}\n`);
    return result;
  }
  if (command === "verify-pair") {
    const options = parseOptions(rawOptions, commonExpectedFlags);
    const result = verifyPairedReleaseCandidate({
      candidateDir:
        options.get("--candidate-dir", "--candidate") || ".release-candidate",
      expectedFrontendSha: options.get(
        "--expected-frontend-sha",
        "--frontend-sha",
      ),
      expectedGateRunId: options.get("--expected-gate-run-id", "--gate-run-id"),
      expectedBffSha: options.get("--expected-bff-sha", "--bff-sha"),
      expectedBffBaseUrl: options.get(
        "--expected-bff-base-url",
        "--bff-base-url",
      ),
      expectedPairId: options.get("--expected-pair-id", "--pair-id"),
      expectedArtifactDigest: options.get(
        "--expected-artifact-digest",
        "--artifact-digest",
      ),
      profile: options.get("--profile") || RELEASE_PROFILES.READ_ONLY,
      secretSentinels: collectEnvironmentSecretSentinels(environment),
    });
    process.stdout.write(`${result.artifactDigestSha256}\n`);
    return result;
  }
  if (command === "digest") {
    const options = parseOptions(
      rawOptions,
      new Set([
        "--dist-dir",
        "--dist",
        "--expected-artifact-digest",
        "--artifact-digest",
      ]),
    );
    const result = digestReleaseDist({
      distDir: options.get("--dist-dir", "--dist") || "dist",
      expectedArtifactDigest: options.get(
        "--expected-artifact-digest",
        "--artifact-digest",
      ),
      secretSentinels: collectEnvironmentSecretSentinels(environment),
    });
    process.stdout.write(`${result.artifactDigestSha256}\n`);
    return result;
  }
  throw new Error(
    "usage: release-candidate.mjs <prepare|prepare-pair|verify|verify-pair|digest> [options]",
  );
}

const invokedAsScript =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    console.error(`release candidate error: ${error.message}`);
    process.exitCode = 1;
  }
}
