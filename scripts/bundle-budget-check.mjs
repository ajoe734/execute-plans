#!/usr/bin/env node
// MGMT-LOAD-006: management console bundle-size budget check.
//
// Reads the `dist/assets/*.js` output of `npm run build` (building first if
// `dist/` is missing) and reports gzip sizes for the initial management
// entry chunk and the Evidence route-specific async chunk, so the Pantheon
// release load gate (scripts/aggregate-release-gate.mjs) can fail closed on
// a regression instead of relying on prose numbers in a task doc. Budgets
// match docs/bff/execution-tasks/2026-07-01-management-console-load-gap/MGMT-LOAD-004-management-route-code-split.md:
// initial JS gzip <= 800 KB, Evidence route chunk gzip <= 150 KB.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DIST_DIR = process.env.PANTHEON_BUNDLE_DIST_DIR || "dist";
const OUT_DIR = process.env.PANTHEON_LOAD_BASELINE_OUT_DIR || ".lovable/audits";
const ENTRY_PATTERN = /^index-[^/]+\.js$/;
const EVIDENCE_PATTERN = /^evidence-[^/]+\.js$/;
const INITIAL_BUDGET_BYTES = Number(process.env.PANTHEON_BUNDLE_INITIAL_BUDGET_BYTES || 800 * 1024);
const EVIDENCE_BUDGET_BYTES = Number(process.env.PANTHEON_BUNDLE_EVIDENCE_BUDGET_BYTES || 150 * 1024);

function currentSha() {
  const fromEnv = process.env.PANTHEON_PROBE_NOCACHE_SHA || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 40);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return Date.now().toString(36);
  }
}

function gzipBytes(filePath) {
  return zlib.gzipSync(fs.readFileSync(filePath), { level: 9 }).length;
}

if (!fs.existsSync(path.join(DIST_DIR, "assets")) && process.env.PANTHEON_BUNDLE_SKIP_BUILD !== "1") {
  console.log(`No ${DIST_DIR}/assets found; running \`npm run build\` first.`);
  execFileSync("npm", ["run", "build"], { stdio: "inherit" });
}

const assetsDir = path.join(DIST_DIR, "assets");
if (!fs.existsSync(assetsDir)) {
  console.error(`Missing ${assetsDir} after build; cannot measure bundle sizes.`);
  process.exit(2);
}

const files = fs.readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
const entries = files.map((name) => {
  const filePath = path.join(assetsDir, name);
  const sizeBytes = fs.statSync(filePath).size;
  return { name, sizeBytes, gzipBytes: gzipBytes(filePath) };
});

// Several small shared/vendor chunks can also match the generic `index-*.js`
// facade name (e.g. syntax-highlighter language index files); the real
// application entry is reliably the largest chunk matching the pattern.
function largestMatch(pattern) {
  const candidates = entries.filter((e) => pattern.test(e.name));
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.sizeBytes > a.sizeBytes ? b : a));
}

const entryChunk = largestMatch(ENTRY_PATTERN);
const evidenceChunk = largestMatch(EVIDENCE_PATTERN);

const initialManagementJsGzipBytes = entryChunk?.gzipBytes ?? null;
const evidenceRouteChunkGzipBytes = evidenceChunk?.gzipBytes ?? null;

const results = { initialManagementJsGzipBytes, evidenceRouteChunkGzipBytes };
const budgets = {
  initialManagementJsGzipBudgetBytes: INITIAL_BUDGET_BYTES,
  evidenceRouteChunkGzipBudgetBytes: EVIDENCE_BUDGET_BYTES,
};

const initialPass = initialManagementJsGzipBytes !== null && initialManagementJsGzipBytes <= INITIAL_BUDGET_BYTES;
const evidencePass = evidenceRouteChunkGzipBytes !== null && evidenceRouteChunkGzipBytes <= EVIDENCE_BUDGET_BYTES;
const pass = initialPass && evidencePass;

const payload = {
  probe: "MGMT-LOAD-006 bundle-size budget check",
  probeTimestamp: new Date().toISOString(),
  feCommit: currentSha(),
  entryChunk,
  evidenceChunk,
  entries: entries.sort((a, b) => b.gzipBytes - a.gzipBytes),
  results,
  budgets,
  initialPass,
  evidencePass,
  pass,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const now = new Date().toISOString().slice(0, 10);
const jsonOut = path.join(OUT_DIR, `bundle-budget-${now}.json`);
fs.writeFileSync(jsonOut, JSON.stringify(payload, null, 2), "utf8");

const md = [
  `# Management Console Bundle-Size Budget`,
  ``,
  `Date: ${payload.probeTimestamp}`,
  `FE commit: ${payload.feCommit}`,
  ``,
  `| Chunk | File | Gzip | Budget | Pass |`,
  `|---|---|---:|---:|---|`,
  `| Initial management entry | ${entryChunk?.name ?? "MISSING"} | ${initialManagementJsGzipBytes ?? "n/a"} | ${INITIAL_BUDGET_BYTES} | ${initialPass} |`,
  `| Evidence route chunk | ${evidenceChunk?.name ?? "MISSING"} | ${evidenceRouteChunkGzipBytes ?? "n/a"} | ${EVIDENCE_BUDGET_BYTES} | ${evidencePass} |`,
  ``,
  `Overall pass: ${pass}`,
].join("\n");

const mdOut = path.join(OUT_DIR, `bundle-budget-${now}.md`);
fs.writeFileSync(mdOut, md, "utf8");
console.log(md);

if (!pass) process.exitCode = 1;
