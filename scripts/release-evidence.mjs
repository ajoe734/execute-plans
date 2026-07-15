#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SCHEMA_VERSION = "pantheon.dev-fe.release-evidence.v1";
const SENSITIVE_KEY = /(?:authorization|bearer|client.?secret|private.?key|service.?role|password|credential|access.?token|refresh.?token)/iu;
const SENSITIVE_VALUE = /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|client[_-]?secret\s*[:=])/iu;

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
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  const text = String(value);
  if (SENSITIVE_VALUE.test(text)) return "[REDACTED]";
  return text.slice(0, 500);
}

function parseDetails(items) {
  const details = {};
  for (const item of items) {
    const separator = item.indexOf("=");
    if (separator <= 0) throw new Error("--detail must use key=value");
    const key = item.slice(0, separator).trim();
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/u.test(key)) {
      throw new Error(`invalid evidence detail key: ${key}`);
    }
    details[key] = redact(key, item.slice(separator + 1));
  }
  return Object.fromEntries(Object.entries(details).sort(([left], [right]) => left.localeCompare(right)));
}

function readEvents(logPath) {
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/u).filter(Boolean);
  const events = lines.map((line, index) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error(`invalid evidence JSON at line ${index + 1}`);
    }
    return event;
  });
  let previousHash = "0".repeat(64);
  events.forEach((event, index) => {
    const { hash, ...payload } = event;
    const expected = sha256(JSON.stringify(payload));
    if (event.sequence !== index + 1 || event.previousHash !== previousHash || hash !== expected) {
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
    details,
    previousHash: events.at(-1)?.hash || "0".repeat(64),
  };
  const event = { ...payload, hash: sha256(JSON.stringify(payload)) };
  ensureParent(logPath);
  fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
  return event;
}

function validateEventLabel(value, label) {
  if (!/^[a-z][a-z0-9_.-]{1,63}$/u.test(value)) throw new Error(`invalid ${label}`);
}

function init(args, details) {
  const logPath = required(args, "log");
  if (fs.existsSync(logPath) && fs.statSync(logPath).size > 0) {
    throw new Error("refusing to replace an existing append-only evidence log");
  }
  const event = appendEvent(logPath, "release.started", "pending", parseDetails(details));
  process.stdout.write(`${event.hash}\n`);
}

function append(args, details) {
  const logPath = required(args, "log");
  const type = required(args, "type");
  const status = required(args, "status");
  validateEventLabel(type, "event type");
  validateEventLabel(status, "event status");
  const event = appendEvent(logPath, type, status, parseDetails(details));
  process.stdout.write(`${event.hash}\n`);
}

function finalize(args) {
  const logPath = required(args, "log");
  const summaryPath = required(args, "summary");
  const outcome = required(args, "outcome");
  validateEventLabel(outcome, "outcome");
  const events = readEvents(logPath);
  if (events.length === 0) throw new Error("cannot finalize empty evidence");
  const logBytes = fs.readFileSync(logPath);
  const firstDetails = events[0].details || {};
  const summary = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    outcome,
    candidateSha: firstDetails.candidateSha || "",
    integrationGateRunId: firstDetails.integrationGateRunId || "",
    artifactDigestSha256: firstDetails.artifactDigestSha256 || "",
    githubArtifactDigest: firstDetails.githubArtifactDigest || "",
    eventCount: events.length,
    headHash: events.at(-1).hash,
    logSha256: sha256(logBytes),
    events: events.map(({ sequence, at, type, status, hash }) => ({ sequence, at, type, status, hash })),
  };
  ensureParent(summaryPath);
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  process.stdout.write(`${summary.headHash}\n`);
}

function verify(args) {
  const logPath = required(args, "log");
  const events = readEvents(logPath);
  if (events.length === 0) throw new Error("empty evidence log");
  process.stdout.write(`${events.at(-1).hash}\n`);
}

export { appendEvent, parseDetails, readEvents, redact, sha256 };

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  try {
    const command = process.argv[2];
    const parsed = parseArgs(process.argv.slice(3));
    if (command === "init") init(parsed.args, parsed.details);
    else if (command === "append") append(parsed.args, parsed.details);
    else if (command === "finalize") finalize(parsed.args);
    else if (command === "verify") verify(parsed.args);
    else throw new Error("usage: release-evidence.mjs <init|append|finalize|verify> ...");
  } catch (error) {
    console.error(`release evidence error: ${error instanceof Error ? error.message : "unknown failure"}`);
    process.exitCode = 2;
  }
}
