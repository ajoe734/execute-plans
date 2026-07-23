#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = process.env.PANTHEON_LOAD_BASELINE_OUT_DIR || process.env.PANTHEON_AUDIT_OUT_DIR || ".lovable/audits";
const OUT_PATH = process.env.PANTHEON_LOAD_GATE_MANIFEST || path.join(OUT_DIR, "release-load-gate-current.json");

function latest(pattern) {
  if (!fs.existsSync(OUT_DIR)) return "";
  return fs.readdirSync(OUT_DIR)
    .filter((name) => pattern.test(name))
    .map((name) => path.join(OUT_DIR, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || "";
}

function readJson(filePath) {
  if (!filePath) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

const bundlePath = latest(/^bundle-budget-.*\.json$/);
const routePath = latest(/^route-timing-.*\.json$/);
const bundle = readJson(bundlePath);
const route = readJson(routePath);

const checks = [
  {
    id: "bundle_budget",
    label: "MGMT-LOAD-006 bundle-size budget",
    evidence: bundlePath,
    pass: bundle?.pass === true,
    status: bundle?.pass === true ? "pass" : bundle ? "fail" : "missing",
  },
  {
    id: "route_load",
    label: "MGMT-LOAD-007 route-load readiness baseline",
    evidence: routePath,
    pass: route?.pass === true,
    status: route?.pass === true ? "pass" : route ? "fail" : "missing",
  },
];

const failures = checks.filter((check) => check.status === "fail").map((check) => check.label);
const missing = checks.filter((check) => check.status === "missing").map((check) => check.label);
const pass = failures.length === 0 && missing.length === 0;
const payload = {
  schemaVersion: 1,
  probe: "MGMT-LOAD-006/007 release load gate",
  generatedAt: new Date().toISOString(),
  sources: {
    bundleBudget: bundlePath || null,
    routeTiming: routePath || null,
  },
  checks,
  result: {
    pass,
    overall: pass ? "pass" : failures.length ? "fail" : "missing",
    failures,
    missing,
  },
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), "utf8");
console.log(`release load gate: ${payload.result.overall}`);
console.log(`manifest: ${OUT_PATH}`);
if (!pass) process.exitCode = 1;
