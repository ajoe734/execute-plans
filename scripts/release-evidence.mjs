#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = "pantheon.dev-fe.release-evidence.v1";
const ZERO_HASH = "0".repeat(64);
const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const EVENT_STATUSES = new Set([
  "accepted",
  "bootstrap",
  "failed",
  "overridden",
  "passed",
  "pending",
  "qualified",
  "rejected",
  "rolled_back",
  "skipped",
  "verified",
]);
const OUTCOMES = new Set([
  "accepted",
  "recovery_rollback_failed",
  "recovery_rollback_probe_failed",
  "recovery_rolled_back",
  "rejected_before_switch",
  "rollback_failed",
  "rollback_probe_failed",
  "rolled_back",
]);
const DETAIL_STATUSES = new Set([
  "accepted",
  "bootstrap",
  "completed",
  "failed",
  "missing",
  "overridden",
  "passed",
  "pending",
  "qualified",
  "rejected",
  "rolled_back",
  "skipped",
  "success",
  "verified",
]);
const SENSITIVE_KEY =
  /(?:api.?key|authorization|bearer|client.?secret|private.?key|provider.?key|service.?role|pass(?:word|wd)?|credential|secret|access.?token|refresh.?token|token)/iu;
const SENSITIVE_VALUE = new RegExp(
  [
    String.raw`\bBearer\s+[A-Za-z0-9._~+/=-]{8,}`,
    String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----`,
    String.raw`(?:api[_-]?key|client[_-]?secret|credential|pass(?:word|wd)?|secret|token)\s*[:=]\s*[^\s,;]+`,
    String.raw`(?:https?|wss?):\/\/[^\s/@:]+:[^\s/@]+@`,
    String.raw`\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b`,
    String.raw`\b(?:sk-ant-[A-Za-z0-9_-]{12,}|sk-(?:live-|test-)?[A-Za-z0-9_-]{16,})\b`,
    String.raw`\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b`,
    String.raw`\bAIza[0-9A-Za-z_-]{20,}\b`,
    String.raw`\bAKIA[0-9A-Z]{16}\b`,
    String.raw`\bxox[baprs]-[A-Za-z0-9-]{12,}\b`,
    String.raw`\b(?:rk|sk)_(?:live|test)_[A-Za-z0-9]{12,}\b`,
  ].join("|"),
  "iu",
);

function parseArgs(tokens) {
  const args = new Map();
  const details = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) {
      args.set(key, "true");
      continue;
    }
    index += 1;
    if (key === "detail") details.push(value);
    else args.set(key, value);
  }
  return { args, details };
}

function required(args, key) {
  const value = String(args.get(key) || "").trim();
  if (!value) throw new Error(`missing --${key}`);
  return value;
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function redact(key, value) {
  const text = String(value);
  if (SENSITIVE_KEY.test(String(key)) || SENSITIVE_VALUE.test(text))
    return "[REDACTED]";
  return text.slice(0, 500);
}

function invalidDetail() {
  throw new Error("unsupported or invalid evidence detail");
}

function validateSha40(value) {
  const normalized = value.toLowerCase();
  if (!SHA40.test(normalized)) invalidDetail();
  return normalized;
}

function validateDigest(value, placeholders = []) {
  const normalized = value.toLowerCase().replace(/^sha256:/u, "");
  if (placeholders.includes(normalized)) return normalized;
  if (!SHA256.test(normalized)) invalidDetail();
  return normalized;
}

function validateCommitOrPlaceholder(value) {
  const normalized = value.toLowerCase();
  if (["bootstrap", "missing", "unknown"].includes(normalized))
    return normalized;
  return validateSha40(normalized);
}

function validateBoolean(value) {
  if (value !== "true" && value !== "false") invalidDetail();
  return value;
}

function validateRunId(value) {
  if (!/^[1-9][0-9]{0,19}$/u.test(value)) invalidDetail();
  return value;
}

function validateRunIdOrLegacy(value) {
  return value === "legacy" ? value : validateRunId(value);
}

function validateGithubDigestOrLegacy(value) {
  if (value === "legacy") return value;
  if (!/^sha256:[0-9a-f]{64}$/u.test(value.toLowerCase())) invalidDetail();
  return value.toLowerCase();
}

function validateActor(value) {
  if (value === "none") return value;
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?(?:\[bot\])?$/u.test(value)
  )
    invalidDetail();
  return value;
}

function validatePath(value, placeholders = []) {
  if (placeholders.includes(value)) return value;
  if (value.length > 4096 || /[\0\r\n]/u.test(value) || !path.isAbsolute(value))
    invalidDetail();
  const normalized = path.normalize(value);
  if (normalized !== value || normalized.split(path.sep).includes(".."))
    invalidDetail();
  return value;
}

function validateGateUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    invalidDetail();
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[1-9][0-9]{0,19}\/?$/u.test(
      parsed.pathname,
    )
  )
    invalidDetail();
  return parsed.toString().replace(/\/$/u, "");
}

function validateStatus(value) {
  if (!DETAIL_STATUSES.has(value)) invalidDetail();
  return value;
}

const DETAIL_VALIDATORS = Object.freeze({
  acceptedGateRunId: validateRunIdOrLegacy,
  acceptedGithubArtifactDigest: validateGithubDigestOrLegacy,
  artifactDigestSha256: (value) => validateDigest(value, ["legacy"]),
  auditDir: (value) => validatePath(value),
  bffCommit: validateSha40,
  candidateDir: (value) => validatePath(value),
  candidateSha: validateSha40,
  controllerSha: validateSha40,
  currentDevSha: validateSha40,
  deployRoot: (value) => validatePath(value),
  deploymentStatus: validateStatus,
  emergencyOverride: validateBoolean,
  frontendSha: validateSha40,
  githubArtifactDigest: (value) => {
    if (!/^sha256:[0-9a-f]{64}$/u.test(value.toLowerCase())) invalidDetail();
    return value.toLowerCase();
  },
  incomingEquivalentGateRunId: validateRunId,
  incomingGateRunId: validateRunId,
  incomingGithubArtifactDigest: validateGithubDigestOrLegacy,
  integrationGateRunId: validateRunId,
  integrationGateRunUrl: validateGateUrl,
  integrationGateStatus: validateStatus,
  lockFile: (value) => validatePath(value),
  observedTarget: (value) => validatePath(value, ["missing"]),
  outcome: (value) => {
    if (!OUTCOMES.has(value)) invalidDetail();
    return value;
  },
  overrideActor: validateActor,
  overrideReasonSha256: (value) => validateDigest(value, ["none"]),
  previousArtifactDigest: (value) =>
    validateDigest(value, ["legacy", "missing", "none"]),
  previousCommit: validateCommitOrPlaceholder,
  previousGateRunId: validateRunIdOrLegacy,
  previousManifestBffCommit: validateSha40,
  previousTarget: (value) => validatePath(value, ["missing", "none"]),
  probeStatus: validateStatus,
  releaseDir: (value) => validatePath(value),
  rollbackStatus: validateStatus,
  rollbackDrill: validateBoolean,
  runtimeBffCommit: validateSha40,
  validatedDevSha: validateSha40,
});

function normalizeDetailRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record))
    invalidDetail();
  const normalized = {};
  for (const [key, rawValue] of Object.entries(record)) {
    if (
      !Object.hasOwn(DETAIL_VALIDATORS, key) ||
      SENSITIVE_KEY.test(key) ||
      typeof rawValue !== "string"
    ) {
      invalidDetail();
    }
    if (
      rawValue.length === 0 ||
      rawValue.length > 4096 ||
      /[\0\r\n]/u.test(rawValue) ||
      SENSITIVE_VALUE.test(rawValue)
    ) {
      invalidDetail();
    }
    normalized[key] = DETAIL_VALIDATORS[key](rawValue);
  }
  if (
    normalized.integrationGateRunId &&
    normalized.integrationGateRunUrl &&
    !normalized.integrationGateRunUrl.endsWith(
      `/actions/runs/${normalized.integrationGateRunId}`,
    )
  )
    invalidDetail();
  return Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

function parseDetails(items) {
  const details = {};
  for (const item of items) {
    const separator = item.indexOf("=");
    if (separator <= 0) invalidDetail();
    const key = item.slice(0, separator).trim();
    if (
      !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/u.test(key) ||
      Object.hasOwn(details, key)
    )
      invalidDetail();
    details[key] = item.slice(separator + 1);
  }
  return normalizeDetailRecord(details);
}

function assertRegularFile(filePath, label) {
  const resolved = path.resolve(filePath);
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch {
    throw new Error(`${label} is missing`);
  }
  if (stat.isSymbolicLink() || !stat.isFile())
    throw new Error(`${label} must be a regular file`);
  return resolved;
}

function readEvents(logPath) {
  if (!fs.existsSync(logPath)) return [];
  const resolvedLog = assertRegularFile(logPath, "evidence log");
  const lines = fs
    .readFileSync(resolvedLog, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean);
  const events = lines.map((line, index) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error(`invalid evidence JSON at line ${index + 1}`);
    }
    return event;
  });
  let previousHash = ZERO_HASH;
  events.forEach((event, index) => {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new Error(`invalid evidence event at line ${index + 1}`);
    }
    const expectedKeys = [
      "at",
      "details",
      "hash",
      "previousHash",
      "schemaVersion",
      "sequence",
      "status",
      "type",
    ];
    const actualKeys = Object.keys(event).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      throw new Error(`invalid evidence event at line ${index + 1}`);
    }
    if (
      event.schemaVersion !== SCHEMA_VERSION ||
      event.sequence !== index + 1 ||
      typeof event.at !== "string" ||
      !Number.isFinite(Date.parse(event.at)) ||
      typeof event.type !== "string" ||
      typeof event.status !== "string" ||
      typeof event.previousHash !== "string" ||
      typeof event.hash !== "string"
    )
      throw new Error(`invalid evidence event at line ${index + 1}`);
    validateEventLabel(event.type, "event type");
    validateEventStatus(event.status);
    normalizeDetailRecord(event.details);
    const { hash, ...payload } = event;
    const expected = sha256(JSON.stringify(payload));
    if (
      event.previousHash !== previousHash ||
      hash !== expected ||
      !SHA256.test(hash)
    ) {
      throw new Error(`evidence hash chain mismatch at line ${index + 1}`);
    }
    previousHash = hash;
  });
  return events;
}

function appendEvent(logPath, type, status, details) {
  const events = readEvents(logPath);
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    sequence: events.length + 1,
    at: new Date().toISOString(),
    type,
    status,
    details: normalizeDetailRecord(details),
    previousHash: events.at(-1)?.hash || ZERO_HASH,
  };
  const event = { ...payload, hash: sha256(JSON.stringify(payload)) };
  ensureParent(logPath);
  fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return event;
}

function validateEventLabel(value, label) {
  if (!/^[a-z][a-z0-9_.-]{1,63}$/u.test(value))
    throw new Error(`invalid ${label}`);
}

function validateEventStatus(value) {
  if (!EVENT_STATUSES.has(value)) throw new Error("invalid event status");
}

function init(args, details) {
  const logPath = required(args, "log");
  if (fs.existsSync(logPath)) {
    const stat = fs.lstatSync(logPath);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new Error("evidence log must be a regular file");
    if (stat.size > 0)
      throw new Error(
        "refusing to replace an existing append-only evidence log",
      );
  }
  const event = appendEvent(
    logPath,
    "release.started",
    "pending",
    parseDetails(details),
  );
  process.stdout.write(`${event.hash}\n`);
}

function append(args, details) {
  const logPath = required(args, "log");
  const type = required(args, "type");
  const status = required(args, "status");
  validateEventLabel(type, "event type");
  validateEventStatus(status);
  if (!fs.existsSync(logPath) || fs.lstatSync(logPath).size === 0) {
    throw new Error("evidence log must be initialized before append");
  }
  const event = appendEvent(logPath, type, status, parseDetails(details));
  process.stdout.write(`${event.hash}\n`);
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function auditFiles(rootPath, summaryPath) {
  const root = path.resolve(rootPath);
  const summary = path.resolve(summaryPath);
  const rootStat = fs.lstatSync(root);
  if (
    rootStat.isSymbolicLink() ||
    !rootStat.isDirectory() ||
    fs.realpathSync(root) !== root
  ) {
    throw new Error("audit root must be a real directory without symlinks");
  }
  if (
    !isWithin(root, summary) ||
    !fs.existsSync(path.dirname(summary)) ||
    fs.realpathSync(path.dirname(summary)) !== path.dirname(summary)
  ) {
    throw new Error("evidence summary must remain inside the audit root");
  }

  const files = [];
  function visit(directory) {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      );
    for (const entry of entries) {
      const candidate = path.resolve(directory, entry.name);
      if (!isWithin(root, candidate))
        throw new Error("audit path escaped its root");
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink())
        throw new Error("audit root must not contain symlinks");
      if (stat.isDirectory()) {
        if (fs.realpathSync(candidate) !== candidate)
          throw new Error("audit path escaped its root");
        visit(candidate);
        continue;
      }
      if (!stat.isFile())
        throw new Error(
          "audit root must contain only directories and regular files",
        );
      if (candidate === summary) continue;
      if (fs.realpathSync(candidate) !== candidate)
        throw new Error("audit path escaped its root");
      const bytes = fs.readFileSync(candidate);
      files.push({
        path: path.relative(root, candidate).split(path.sep).join("/"),
        sizeBytes: bytes.length,
        sha256: sha256(bytes),
      });
    }
  }
  visit(root);
  return files.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}

function baseSummary(events, logBytes, outcome) {
  const firstDetails = events[0].details || {};
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: events.at(-1).at,
    outcome,
    candidateSha: firstDetails.candidateSha || "",
    integrationGateRunId: firstDetails.integrationGateRunId || "",
    artifactDigestSha256: firstDetails.artifactDigestSha256 || "",
    githubArtifactDigest: firstDetails.githubArtifactDigest || "",
    eventCount: events.length,
    headHash: events.at(-1).hash,
    logSha256: sha256(logBytes),
    events: events.map(({ sequence, at, type, status, hash }) => ({
      sequence,
      at,
      type,
      status,
      hash,
    })),
  };
}

function terminalOutcome(events) {
  const terminal = events.at(-1);
  const outcome = String(terminal?.details?.outcome || "");
  const accepted =
    terminal?.type === "release.completed" &&
    terminal?.status === "passed" &&
    outcome === "accepted";
  const rejected =
    terminal?.type === "release.failed" &&
    terminal?.status === "failed" &&
    OUTCOMES.has(outcome) &&
    outcome !== "accepted";
  if (!accepted && !rejected)
    throw new Error("evidence log is missing a valid terminal release outcome");
  return outcome;
}

function finalize(args) {
  const logPath = required(args, "log");
  const summaryPath = required(args, "summary");
  const outcome = required(args, "outcome");
  if (!OUTCOMES.has(outcome)) throw new Error("invalid outcome");
  const events = readEvents(logPath);
  if (events.length === 0) throw new Error("cannot finalize empty evidence");
  if (terminalOutcome(events) !== outcome)
    throw new Error("final outcome does not match terminal release event");
  const logBytes = fs.readFileSync(assertRegularFile(logPath, "evidence log"));
  const summary = baseSummary(events, logBytes, outcome);
  const root = String(args.get("root") || "").trim();
  if (root) summary.files = auditFiles(root, summaryPath);
  ensureParent(summaryPath);
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  process.stdout.write(`${summary.headHash}\n`);
}

function validateSummary(summary, events, logBytes) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary))
    throw new Error("invalid evidence summary");
  const expected = baseSummary(events, logBytes, terminalOutcome(events));
  const expectedKeys = [
    ...Object.keys(expected),
    ...(Object.hasOwn(summary, "files") ? ["files"] : []),
  ].sort();
  if (
    JSON.stringify(Object.keys(summary).sort()) !==
      JSON.stringify(expectedKeys) ||
    Object.entries(expected).some(
      ([key, value]) => JSON.stringify(summary[key]) !== JSON.stringify(value),
    )
  )
    throw new Error("evidence summary does not match its append-only log");
}

function validateFileManifest(files) {
  if (!Array.isArray(files))
    throw new Error("evidence summary is missing audit file checksums");
  let previous = "";
  for (const file of files) {
    if (
      !file ||
      typeof file !== "object" ||
      Array.isArray(file) ||
      Object.keys(file).sort().join(",") !== "path,sha256,sizeBytes" ||
      typeof file.path !== "string" ||
      file.path.length === 0 ||
      path.isAbsolute(file.path) ||
      file.path.split("/").includes("..") ||
      typeof file.sizeBytes !== "number" ||
      !Number.isSafeInteger(file.sizeBytes) ||
      file.sizeBytes < 0 ||
      typeof file.sha256 !== "string" ||
      !SHA256.test(file.sha256) ||
      (previous && file.path <= previous)
    )
      throw new Error("invalid audit file checksum manifest");
    previous = file.path;
  }
}

function verify(args) {
  const logPath = required(args, "log");
  const events = readEvents(logPath);
  if (events.length === 0) throw new Error("empty evidence log");
  const summaryPath = String(args.get("summary") || "").trim();
  const root = String(args.get("root") || "").trim();
  if (root && !summaryPath)
    throw new Error("--root verification requires --summary");
  if (summaryPath) {
    const resolvedSummary = assertRegularFile(summaryPath, "evidence summary");
    let summary;
    try {
      summary = JSON.parse(fs.readFileSync(resolvedSummary, "utf8"));
    } catch {
      throw new Error("invalid evidence summary JSON");
    }
    const logBytes = fs.readFileSync(
      assertRegularFile(logPath, "evidence log"),
    );
    validateSummary(summary, events, logBytes);
    if (root) {
      validateFileManifest(summary.files);
      const currentFiles = auditFiles(root, summaryPath);
      if (JSON.stringify(currentFiles) !== JSON.stringify(summary.files)) {
        throw new Error("audit evidence file checksum mismatch");
      }
    }
  }
  process.stdout.write(`${events.at(-1).hash}\n`);
}

export { appendEvent, auditFiles, parseDetails, readEvents, redact, sha256 };

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  try {
    const command = process.argv[2];
    const parsed = parseArgs(process.argv.slice(3));
    if (command === "init") init(parsed.args, parsed.details);
    else if (command === "append") append(parsed.args, parsed.details);
    else if (command === "finalize") finalize(parsed.args);
    else if (command === "verify") verify(parsed.args);
    else
      throw new Error(
        "usage: release-evidence.mjs <init|append|finalize|verify> ...",
      );
  } catch (error) {
    console.error(
      `release evidence error: ${error instanceof Error ? error.message : "unknown failure"}`,
    );
    process.exitCode = 2;
  }
}
