#!/usr/bin/env node
/**
 * probe-create-persona-then-fleet.mjs — 2026-05-28
 *
 * Narrow acceptance probe for the entity-create + registry-read loop.
 *
 * Steps:
 *   1. POST /bff/personas  → expect 201 + new persona id
 *   2. GET  /bff/management/persona-fleet  → expect new id in items[]
 *   3. (control) GET /bff/management/persona-league  → log whether the new id
 *      shows up here too. League is a ranking snapshot and may legitimately
 *      LAG, so a miss is informational, not a failure.
 *
 * Writes evidence to .lovable/audits/bff-list-after-write-2026-05-28.md.
 *
 * If step 2 fails (POST 201 but new id NOT in fleet), the gap is a BE
 * list-staleness issue, NOT a write-path issue.
 */
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import {
  bearerAuthorization,
  normalizeOptionalBearerToken,
} from "./lib/bearer-token.mjs";

const BFF_BASE_URL = String(
  process.env.PANTHEON_BFF_BASE_URL || process.env.VITE_BFF_BASE_URL || "",
).replace(/\/$/, "");
const BEARER_TOKEN = normalizeOptionalBearerToken(
  process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN ||
  process.env.BFF_AUTH_TOKEN ||
  "",
);
const AUDIT_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || ".lovable/audits";
const ROOT = process.cwd();

if (!BFF_BASE_URL) {
  throw new Error("PANTHEON_BFF_BASE_URL is required for this live write probe");
}
if (!BEARER_TOKEN) {
  throw new Error("A short-lived BFF_AUTH_TOKEN is required for this live write probe");
}

function corrId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function call(method, route, body) {
  const url = new URL(route, BFF_BASE_URL).toString();
  const corr = corrId("probe");
  const headers = {
    Authorization: bearerAuthorization(BEARER_TOKEN),
    Accept: "application/json",
    "X-Correlation-Id": corr,
    "X-Request-Id": corr,
    "X-BFF-Api-Version": "2026-05-07",
  };
  const init = { method, headers, signal: AbortSignal.timeout(10000) };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["Idempotency-Key"] = `idk-${corr}`;
    init.body = JSON.stringify(body);
  }
  const r = await fetch(url, init);
  let parsed = null;
  try { parsed = await r.json(); } catch { /* ignore */ }
  return { status: r.status, body: parsed, correlationId: corr };
}

function extractId(payload) {
  if (!payload) return null;
  const d = payload.data ?? payload;
  return d?.id ?? d?.persona_id ?? null;
}
function extractItems(payload) {
  if (!payload) return [];
  const d = payload.data ?? payload;
  if (Array.isArray(d)) return d;
  return d?.items ?? d?.personas ?? d?.fleet ?? [];
}

async function main() {
  console.log(`[create-then-fleet] BFF: ${BFF_BASE_URL}`);
  const name = `dev-probe-${Date.now()}`;

  const createRes = await call("POST", "/bff/personas", {
    name,
    archetype: "generalist",
  });
  console.log(`  step 1 POST /bff/personas → ${createRes.status}`);
  const newId = extractId(createRes.body);
  console.log(`         new id: ${newId ?? "<missing>"}`);

  // Brief pause for any async projection.
  await new Promise((r) => setTimeout(r, 1500));

  const fleetRes = await call("GET", "/bff/management/persona-fleet");
  console.log(`  step 2 GET  /bff/management/persona-fleet → ${fleetRes.status}`);
  const fleetItems = extractItems(fleetRes.body);
  const inFleet = newId && fleetItems.some((x) => (x?.id ?? x?.persona_id) === newId);
  console.log(`         items: ${fleetItems.length}, contains new id: ${inFleet ? "YES" : "NO"}`);

  const leagueRes = await call("GET", "/bff/management/persona-league");
  console.log(`  step 3 GET  /bff/management/persona-league → ${leagueRes.status}`);
  const leagueItems = extractItems(leagueRes.body);
  const inLeague = newId && leagueItems.some((x) => (x?.id ?? x?.persona_id) === newId);
  console.log(`         items: ${leagueItems.length}, contains new id: ${inLeague ? "YES" : "NO (expected, ranking lag)"}`);

  const verdict =
    createRes.status >= 200 && createRes.status < 300 && inFleet
      ? "PASS"
      : createRes.status >= 200 && createRes.status < 300 && !inFleet
        ? "WRITE OK, FLEET STALE (BE list-staleness gap, NOT a write issue)"
        : "WRITE FAILED";

  const md = [
    "# Probe: create persona → persona-fleet — 2026-05-28",
    "",
    `Generated: ${new Date().toISOString()}`,
    `BFF base: ${BFF_BASE_URL}`,
    `Probe name: \`${name}\``,
    "",
    `**Verdict:** ${verdict}`,
    "",
    "## Step 1 — POST /bff/personas",
    `- status: ${createRes.status}`,
    `- new id: \`${newId ?? "<missing>"}\``,
    `- correlationId: \`${createRes.correlationId}\``,
    "",
    "## Step 2 — GET /bff/management/persona-fleet (REGISTRY)",
    `- status: ${fleetRes.status}`,
    `- items: ${fleetItems.length}`,
    `- contains new id: **${inFleet ? "YES" : "NO"}**`,
    `- correlationId: \`${fleetRes.correlationId}\``,
    "",
    "## Step 3 — GET /bff/management/persona-league (RANKING SNAPSHOT, may lag)",
    `- status: ${leagueRes.status}`,
    `- items: ${leagueItems.length}`,
    `- contains new id: ${inLeague ? "YES" : "NO (informational only — league is a ranking snapshot)"}`,
    `- correlationId: \`${leagueRes.correlationId}\``,
    "",
    "## Interpretation",
    "",
    "- **PASS** → entire create → registry path works end-to-end. Agent's create_persona tool is good to ship.",
    "- **WRITE OK, FLEET STALE** → /bff/personas writes, but /bff/management/persona-fleet does not project. File a BE bug against the projection layer, NOT the write path.",
    "- **WRITE FAILED** → re-check probe script body shape vs BE OpenAPI §4.",
  ];

  const auditDir = path.resolve(ROOT, AUDIT_DIR);
  fs.mkdirSync(auditDir, { recursive: true });
  const out = path.join(auditDir, "bff-list-after-write-2026-05-28.md");
  fs.writeFileSync(out, md.join("\n"), "utf8");
  console.log(`\n[create-then-fleet] Evidence: ${out}`);
  console.log(`[create-then-fleet] Verdict: ${verdict}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
