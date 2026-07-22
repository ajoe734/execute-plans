#!/usr/bin/env node
// MGMT-LOAD-001: BFF fanout concurrency baseline probe.
//
// Concurrently requests the same routes the management console shell
// fires on first mount (`/health`, `/bff/management/evidence`,
// `/bff/management/shell-summary`, `/bff/alerts`, `/bff/approvals`,
// `/bff/jobs`) and records per-route timing so a future fix (shell-summary
// endpoint, read isolation) has a before/after baseline. `/bff/events/stream`
// is a long-lived realtime stream and is intentionally NOT included in this
// fanout probe — see
// docs/04/pantheon_management_console_load_gap_2026-07-01/MANAGEMENT_CONSOLE_LOAD_GAP_SPEC.md
// section 2.6. `/bff/management/shell-summary` is included because
// `scripts/aggregate-release-gate.mjs` (pantheon repo) gates its fanout p95
// budget and previously reported it as `missing` evidence with no probe
// exercising the route.
import fs from "node:fs";
import path from "node:path";

const BFF_BASE = trimTrailingSlash(process.env.PANTHEON_BFF_BASE_URL || "https://pantheon-lupin-dev-bff.35.201.204.12.sslip.io");
const OUT_DIR = process.env.PANTHEON_LOAD_BASELINE_OUT_DIR || ".lovable/audits";
const BEARER_TOKEN = process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN || process.env.BFF_AUTH_TOKEN || "";
const FETCH_TIMEOUT_MS = 20_000;
const CONCURRENT_ROUNDS = Number(process.env.PANTHEON_BFF_FANOUT_ROUNDS || "1");

const FANOUT_ROUTES = [
  "/health",
  "/bff/management/evidence",
  "/bff/management/shell-summary",
  "/bff/alerts",
  "/bff/approvals",
  "/bff/jobs",
];

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function tokenShape(token) {
  if (!token) return "(none — anonymous probe)";
  const colonIndex = token.indexOf(":");
  if (colonIndex === -1) return "opaque-token (shape redacted)";
  return `op-<id>:${token.slice(colonIndex + 1)} (dev stub-auth shape; not a production secret)`;
}

async function fetchOne(route) {
  const url = `${BFF_BASE}${route}`;
  const headers = { Accept: "application/json" };
  if (BEARER_TOKEN) headers.Authorization = `Bearer ${BEARER_TOKEN}`;
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    // drain body so timing reflects full response transfer, not just headers
    await res.arrayBuffer();
    return { route, status: res.status, ms: Date.now() - startedAt };
  } catch (err) {
    return { route, status: "ERR", ms: Date.now() - startedAt, error: err instanceof Error ? err.message : String(err) };
  }
}

const rounds = [];
for (let round = 1; round <= CONCURRENT_ROUNDS; round += 1) {
  const roundStartedAt = Date.now();
  const results = await Promise.all(FANOUT_ROUTES.map(fetchOne));
  rounds.push({ round, wallClockMs: Date.now() - roundStartedAt, results });
}

const now = new Date().toISOString().slice(0, 10);
const probeTimestamp = new Date().toISOString();

const byRoute = {};
for (const round of rounds) {
  for (const r of round.results) {
    byRoute[r.route] = byRoute[r.route] || [];
    byRoute[r.route].push(r.ms);
  }
}
const p95 = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[Math.max(0, idx)];
};

const summary = Object.fromEntries(
  Object.entries(byRoute).map(([route, values]) => [
    route,
    { count: values.length, minMs: Math.min(...values), maxMs: Math.max(...values), p95Ms: p95(values) },
  ]),
);

const payload = {
  probe: "MGMT-LOAD-001 BFF fanout concurrency baseline",
  probeTimestamp,
  bffBase: BFF_BASE,
  authTokenShape: tokenShape(BEARER_TOKEN),
  fanoutRoutes: FANOUT_ROUTES,
  excludedFromFanout: ["/bff/events/stream (long-lived SSE realtime stream; not a bounded request)"],
  rounds,
  summary,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const jsonOut = path.join(OUT_DIR, `bff-fanout-baseline-${now}.json`);
fs.writeFileSync(jsonOut, JSON.stringify(payload, null, 2), "utf8");

const md = [
  `# BFF Fanout Concurrency Baseline`,
  ``,
  `Date: ${probeTimestamp}`,
  `Target: ${BFF_BASE}`,
  `Auth token shape: ${tokenShape(BEARER_TOKEN)}`,
  `Concurrent routes: ${FANOUT_ROUTES.join(", ")}`,
  `Excluded: /bff/events/stream (long-lived SSE realtime stream, not a bounded request)`,
  ``,
  `## Per-route summary (ms)`,
  ``,
  `| Route | Count | Min | Max | p95 |`,
  `|---|---:|---:|---:|---:|`,
  ...Object.entries(summary).map(([route, s]) => `| ${route} | ${s.count} | ${s.minMs} | ${s.maxMs} | ${s.p95Ms} |`),
  ``,
  `## Rounds`,
  ``,
  ...rounds.flatMap((round) => [
    `### Round ${round.round} (wall clock ${round.wallClockMs} ms)`,
    ``,
    `| Route | Status | ms |`,
    `|---|---:|---:|`,
    ...round.results.map((r) => `| ${r.route} | ${r.status} | ${r.ms} |`),
    ``,
  ]),
].join("\n");

const mdOut = path.join(OUT_DIR, `bff-fanout-baseline-${now}.md`);
fs.writeFileSync(mdOut, md, "utf8");
console.log(md);

const anyErrors = rounds.some((round) => round.results.some((r) => r.status === "ERR" || (typeof r.status === "number" && r.status >= 500)));
if (anyErrors) process.exitCode = 1;
