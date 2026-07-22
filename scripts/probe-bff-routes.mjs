#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PANTHEON_BFF_BASE_URL || process.env.VITE_BFF_BASE_URL || "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io";
const OUT_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || ".lovable/audits";
const AUTH_TOKEN = process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN || "";
const mode = process.argv.includes("--authenticated") ? "authenticated" : "anonymous";
const PROBE_ATTEMPTS = positiveInt(process.env.PANTHEON_BFF_ROUTE_PROBE_ATTEMPTS, 3, 1);
const RETRY_DELAY_MS = positiveInt(process.env.PANTHEON_BFF_ROUTE_PROBE_RETRY_DELAY_MS, 1_000, 100);
const FETCH_TIMEOUT_MS = positiveInt(process.env.PANTHEON_BFF_ROUTE_PROBE_TIMEOUT_MS, 25_000, 5_000);
const LEGACY_HEALTH_ROUTES = new Set();
const READINESS_ROUTES = new Set(["/livez"]);

const routes = [
  ["GET", "/livez"],
  ["GET", "/openapi.json"],
  ["GET", "/bff/events/stream"],
  ["GET", "/bff/me"],
  ["POST", "/bff/auth/refresh"],
  ["POST", "/bff/logout"],
  ["POST", "/bff/actions/strategy/strategy-dev/promote"],
  ["GET", "/bff/strategies"],
  ["GET", "/bff/strategies/strategy-dev"],
  ["GET", "/bff/personas"],
  ["GET", "/bff/personas/persona-dev"],
  ["GET", "/bff/capital-pools"],
  ["GET", "/bff/capital-pools/capital-dev"],
  ["GET", "/bff/rebalances"],
  ["GET", "/bff/deployments"],
  ["GET", "/bff/evolution-programs"],
  ["GET", "/bff/jobs"],
  ["GET", "/bff/approvals"],
  ["POST", "/bff/approvals/approval-dev/decide"],
  ["POST", "/bff/approvals/batch-decide"],
  ["GET", "/bff/alerts"],
  ["POST", "/bff/alerts/alert-dev/acknowledge"],
  ["GET", "/bff/incidents"],
  ["GET", "/bff/audit"],
  ["GET", "/bff/artifacts"],
  ["GET", "/bff/runtimes"],
  ["GET", "/bff/mcp-servers"],
  ["POST", "/bff/mcp-servers/mcp-dev/import-tools"],
  ["GET", "/bff/mcp-tools"],
  ["GET", "/bff/skills"],
  ["GET", "/bff/channels"],
  ["GET", "/bff/tools"],
  ["GET", "/bff/ranking-formulas"],
  ["GET", "/bff/research-experiments"],
  ["GET", "/bff/agora/signals"],
  ["GET", "/bff/agora/inbox"],
  ["GET", "/bff/agora/journal"],
  ["GET", "/bff/agora/postmortems"],
  // /bff/agora/ask/sessions intentionally removed (2026-06-03): Management AI
  // no longer uses Agora Ask. Agora-only probe lives in scripts/check-agora-boundary.ts.
  ["POST", "/bff/management/nl/ask"],
  { method: "POST", route: "/bff/assistant/provider/reauth", anonymousOnly: true },

  ["GET", "/bff/v5/loop-runs"],
  ["GET", "/bff/v5/sentinel/findings"],
  ["GET", "/bff/v5/interventions"],
  ["POST", "/bff/v5/interventions/intervention-dev/decide"],
  ["GET", "/bff/v5/execution/persona-health"],
];

function bodyFor(method, route) {
  if (method === "GET") return undefined;
  if (route === "/bff/assistant/provider/reauth") {
    return JSON.stringify({ provider: "codex", reason: "anonymous route probe" });
  }
  if (route === "/bff/management/nl/ask") {
    return JSON.stringify({ question: "probe", focus: "all", context: "probe-script" });
  }
  if (route.includes("/decide")) return JSON.stringify({ decision: "defer", memo: "route probe noop" });
  if (route.includes("/acknowledge")) return JSON.stringify({ memo: "route probe noop" });
  if (route.includes("/import-tools")) return JSON.stringify({ schemaJson: { probe: true }, memo: "route probe noop" });
  if (route.includes("/auth/refresh") || route.includes("/logout")) return JSON.stringify({});
  if (route.includes("/actions/")) return JSON.stringify({ memo: "route probe noop", expectedVersion: 1 });
  return JSON.stringify({});
}

function positiveInt(value, fallback, minimum) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableResult(result) {
  return result.status === "ERR" || [429, 500, 502, 503, 504].includes(result.status);
}

function maxAttemptsFor(route) {
  return PROBE_ATTEMPTS;
}

function timeoutFor(route) {
  return FETCH_TIMEOUT_MS;
}

async function probe(method, route) {
  const url = `${BASE}${route}`;
  const idBase = `probe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const idempotencyKey = `idk_${idBase}`;
  let lastResult = { method, route, status: "ERR", ms: 0, attempts: 0, error: "not attempted" };
  const maxAttempts = maxAttemptsFor(route);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const headers = {
      "Accept": "application/json",
      "X-Request-Id": `req_${idBase}_${attempt}`,
      "X-BFF-Api-Version": "2026-05-07",
    };
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      headers["Idempotency-Key"] = idempotencyKey;
      headers["X-Idempotency-Key"] = idempotencyKey;
    }
    if (mode === "authenticated" && AUTH_TOKEN) {
      headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
    }

    const started = Date.now();
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: bodyFor(method, route),
        signal: AbortSignal.timeout(timeoutFor(route)),
      });
      lastResult = { method, route, status: res.status, ms: Date.now() - started, attempts: attempt };
    } catch (err) {
      lastResult = {
        method,
        route,
        status: "ERR",
        ms: Date.now() - started,
        attempts: attempt,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    if (attempt >= maxAttempts || !isRetryableResult(lastResult)) {
      return lastResult;
    }

    await sleep(RETRY_DELAY_MS * attempt);
  }

  return lastResult;
}

const results = [];
for (const routeSpec of routes) {
  const normalized = Array.isArray(routeSpec)
    ? { method: routeSpec[0], route: routeSpec[1], anonymousOnly: false }
    : routeSpec;
  if (mode !== "anonymous" && normalized.anonymousOnly) continue;
  const { method, route } = normalized;
  results.push(await probe(method, route));
}

const counts = {};
for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;

const missing = results.filter(r => r.status === 404);
const transportErrors = results.filter(r => r.status === "ERR");
const readinessOk = results.some(r => READINESS_ROUTES.has(r.route) && r.status === 200);
const fatalMissing = missing.filter(r => !LEGACY_HEALTH_ROUTES.has(r.route) || !readinessOk);
const fatalTransportErrors = transportErrors.filter(r => !LEGACY_HEALTH_ROUTES.has(r.route) || !readinessOk);
const blockingTransportErrors = mode === "anonymous" && readinessOk ? [] : fatalTransportErrors;
const ignoredLegacyHealthFailures = results.filter(r => LEGACY_HEALTH_ROUTES.has(r.route) && [404, "ERR"].includes(r.status) && readinessOk);
const now = new Date().toISOString().slice(0, 10);
const md = [
  `# BFF Route Probe — ${mode}`,
  ``,
  `Date: ${new Date().toISOString()}`,
  `Target: ${BASE}`,
  ``,
  `## Counts`,
  ``,
  "```json",
  JSON.stringify(counts, null, 2),
  "```",
  ``,
  `## Verdict`,
  ``,
  `- Canonical 404 count: ${fatalMissing.length}`,
  `- Transport errors: ${fatalTransportErrors.length}`,
  `- Blocking transport errors: ${blockingTransportErrors.length}`,
  `- Readiness endpoint ok: ${readinessOk}`,
  `- Legacy health route failures ignored: ${ignoredLegacyHealthFailures.length}`,
  ``,
  `## Results`,
  ``,
  `| Status | Method | Path | ms | Attempts |`,
  `|---:|---|---|---:|---:|`,
  ...results.map(r => `| ${r.status} | ${r.method} | ${r.route} | ${r.ms} | ${r.attempts ?? 1} |`),
  ``,
  `## Gate`,
  ``,
  fatalMissing.length === 0
    ? fatalTransportErrors.length === 0
      ? `PASS: no canonical route returned 404.`
      : `WARN: no canonical route returned 404; ${fatalTransportErrors.length} route(s) hit transient transport errors.`
    : `FAIL: ${fatalMissing.length} canonical routes returned 404.`,
].join("\n");

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `bff-route-probe-${mode}-${now}.md`);
fs.writeFileSync(out, md, "utf8");
console.log(md);
if (fatalMissing.length || blockingTransportErrors.length) process.exitCode = 1;
