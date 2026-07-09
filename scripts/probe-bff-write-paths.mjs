#!/usr/bin/env node
/**
 * probe-bff-write-paths.mjs
 *
 * Real write-path probe against the live BFF.
 * Complements scripts/probe-bff-authenticated-live.mjs (which is read-heavy).
 *
 * Uses dev IDs, `X-Dry-Run: 1`, and idempotency keys. It never targets real
 * entities. Each request carries a unique probe marker, then readback list
 * endpoints are searched for that marker to prove dry-run requests did not
 * create visible live records.
 */
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

const BFF_BASE_URL = (
  process.env.PANTHEON_BFF_BASE_URL ||
  process.env.VITE_BFF_BASE_URL ||
  "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io"
).replace(/\/$/, "");
const BEARER_TOKEN =
  process.env.PANTHEON_BFF_WRITE_PROBE_BEARER_TOKEN ||
  process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN ||
  process.env.BFF_AUTH_TOKEN ||
  "pantheon-dev-browser:reviewer";
const AUDIT_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || ".lovable/audits";
const ROOT = process.cwd();
const RUN_ID = (process.env.GITHUB_RUN_ID || `${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "-");
const PROBE_MARKER = `dry-run-write-probe-${RUN_ID}-${Math.random().toString(36).slice(2, 8)}`;
const INCLUDE_CREATE_DRY_RUNS = truthy(process.env.PANTHEON_WRITE_PROBE_INCLUDE_CREATES || "false");

const ENDPOINTS = [
  // P0-D - Entity create
  { batch: "P0-D", safety: "create", route: "/bff/strategies", method: "POST", body: { name: "dev-probe", alpha: "alpha-dev", capitalPoolId: "cp-dev", personaIds: [] } },
  { batch: "P0-D", safety: "create", route: "/bff/personas", method: "POST", body: { name: "dev-probe", archetype: "generalist" } },
  { batch: "P0-D", safety: "create", route: "/bff/capital-pools", method: "POST", body: { name: "dev-probe", currency: "USD", allocated: 1, riskBudget: 1 } },
  { batch: "P0-D", safety: "create", route: "/bff/rebalances", method: "POST", body: { name: "dev-probe", quarter: "2026Q2", targetPoolId: "cp-dev" } },
  { batch: "P0-D", safety: "create", route: "/bff/deployments", method: "POST", body: { name: "dev-probe", strategyId: "st-dev", artifactId: "ar-dev", target: "paper", version: "0.0.0" } },
  { batch: "P0-D", safety: "create", route: "/bff/runtimes", method: "POST", body: { name: "dev-probe" } },
  { batch: "P0-D", safety: "create", route: "/bff/ranking-formulas", method: "POST", body: { name: "dev-probe", expression: "sharpe" } },
  { batch: "P0-D", safety: "create", route: "/bff/research-experiments", method: "POST", body: { name: "dev-probe", hypothesis: "h", metric: "sharpe" } },
  { batch: "P0-D", safety: "create", route: "/bff/skills", method: "POST", body: { name: "dev-probe" } },

  // P1-A - Action commands
  { batch: "P1-A", route: "/bff/actions/strategy/strategy-dev/promote_live", method: "POST", body: {} },
  { batch: "P1-A", route: "/bff/actions/strategy/strategy-dev/pause", method: "POST", body: {} },
  { batch: "P1-A", route: "/bff/actions/strategy/strategy-dev/throttle", method: "POST", body: { factor: 0.5 } },
  { batch: "P1-A", route: "/bff/actions/strategy/strategy-dev/archive", method: "POST", body: {} },
  { batch: "P1-A", route: "/bff/actions/strategy/strategy-dev/edit", method: "POST", body: { patch: {} } },
  { batch: "P1-A", allowTyped404: true, route: "/bff/approvals/approval-dev/decide", method: "POST", body: { decision: "approve", reason: "probe" } },
  { batch: "P1-A", route: "/bff/command-confirmations/token-dev/confirm", method: "POST", body: {} },

  // P1-C - v5 Sentinel + HIQ writes
  { batch: "P1-C", route: "/bff/v5/sentinel/findings/finding-dev/status", method: "POST", body: { status: "acknowledged" } },
  { batch: "P1-C", route: "/bff/v5/sentinel/remediation/build", method: "POST", body: { findingId: "finding-dev", plan: { kind: "pause", target: "strategy-dev" } } },
  { batch: "P1-C", route: "/bff/v5/interventions/intervention-dev/claim", method: "POST", body: {} },
  { batch: "P1-C", route: "/bff/v5/interventions/intervention-dev/release", method: "POST", body: {} },
  { batch: "P1-C", route: "/bff/v5/interventions/intervention-dev/escalate", method: "POST", body: { to: "tier2" } },
  { batch: "P1-C", route: "/bff/v5/interventions/intervention-dev/decide", method: "POST", body: { decision: "approve", memo: "probe" } },
  { batch: "P1-C", route: "/bff/v5/interventions/intervention-dev/two-man-sign", method: "POST", body: {} },
  { batch: "P1-C", required: false, route: "/bff/v5/interventions/batch-decide", method: "POST", body: { ids: ["intervention-dev"], decision: "approve" } },

  // P1-E - Agora writes
  { batch: "P1-E", safety: "create", route: "/bff/agora/signals", method: "POST", body: { title: "dev-probe" } },
  { batch: "P1-E", safety: "create", route: "/bff/agora/feedback", method: "POST", body: { target: "dev", text: "probe" } },
  { batch: "P1-E", safety: "create", route: "/bff/agora/inbox/inbox-dev/triage", method: "POST", body: { action: "ack" } },
  { batch: "P1-E", safety: "create", route: "/bff/agora/journal", method: "POST", body: { title: "dev-probe", body: "probe" } },
  { batch: "P1-E", safety: "create", route: "/bff/agora/skill-coaching", method: "POST", body: { skillId: "skill-dev" } },
  { batch: "P1-E", safety: "create", route: "/bff/agora/postmortems", method: "POST", body: { incidentId: "incident-dev" } },

  // P2-MAI - Management AI runtime (OpenClaw / Codex)
  { batch: "P2-MAI", route: "/bff/management/nl/ask", method: "POST", body: { question: "probe", focus: "all", context: "probe-script" } },
];

const ACTIVE_ENDPOINTS = ENDPOINTS.filter((ep) => INCLUDE_CREATE_DRY_RUNS || ep.safety !== "create");
const SKIPPED_ENDPOINTS = ENDPOINTS.filter((ep) => !INCLUDE_CREATE_DRY_RUNS && ep.safety === "create");

const READBACK_ENDPOINTS = [
  "/bff/strategies",
  "/bff/personas",
  "/bff/capital-pools",
  "/bff/rebalances",
  "/bff/deployments",
  "/bff/runtimes",
  "/bff/ranking-formulas",
  "/bff/research-experiments",
  "/bff/skills",
  "/bff/approvals",
  "/bff/v5/interventions",
  "/bff/agora/signals",
  "/bff/agora/inbox",
  "/bff/agora/journal",
  "/bff/agora/postmortems",
];

function isObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function isBffErrorEnvelope(value) {
  if (!isObject(value)) return false;
  const detail = value.detail;
  return (
    typeof value.error === "string" ||
    typeof value.code === "string" ||
    typeof detail === "string" ||
    Array.isArray(detail) ||
    (isObject(value.error) && typeof value.error.code === "string") ||
    (isObject(detail) && isObject(detail.error) && typeof detail.error.code === "string") ||
    (isObject(detail) && typeof detail.code === "string")
  );
}

function safeJsonParse(text) {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function slug(value) {
  return String(value).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function withProbeMarker(ep) {
  const body = JSON.parse(JSON.stringify(ep.body ?? {}));
  const marker = `${PROBE_MARKER}-${slug(ep.route)}`;
  if ("name" in body) body.name = marker;
  if ("title" in body) body.title = marker;
  if ("text" in body) body.text = marker;
  if ("hypothesis" in body) body.hypothesis = marker;
  if ("memo" in body) body.memo = marker;
  if ("reason" in body) body.reason = marker;
  if ("question" in body) body.question = marker;
  if ("context" in body) body.context = marker;
  if ("body" in body) body.body = marker;
  body.probeMarker = marker;
  return { body, marker };
}

function classify(status, json) {
  const typedEnvelope = status >= 400 && status < 500 && isBffErrorEnvelope(json);
  if (status >= 200 && status < 300) {
    return { category: "implemented", tag: "implemented", note: "dry-run success response", typedEnvelope };
  }
  if ([400, 409, 422].includes(status) && typedEnvelope) {
    return { category: "implemented", tag: "implemented", note: "typed precondition/validation envelope", typedEnvelope };
  }
  if ([401, 403].includes(status) && typedEnvelope) {
    return { category: "implemented", tag: "implemented", note: "typed auth/role rejection envelope", typedEnvelope };
  }
  if (status >= 400 && status < 500 && !typedEnvelope) {
    return { category: "untyped_4xx", tag: "untyped_4xx", note: "4xx did not match BffErrorEnvelope", typedEnvelope };
  }
  if ([404, 405, 501].includes(status)) {
    return { category: "missing", tag: "not_implemented", note: `route missing or not implemented (${status})`, typedEnvelope };
  }
  if (status >= 500) {
    return { category: "be_error", tag: "be_error", note: `backend error ${status}`, typedEnvelope };
  }
  if (status === 0) {
    return { category: "network", tag: "network", note: "transport error", typedEnvelope };
  }
  return { category: "other", tag: "unexpected", note: `unexpected status ${status}`, typedEnvelope };
}

function headersFor(requestId) {
  return {
    Authorization: `Bearer ${BEARER_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Correlation-Id": requestId,
    "X-Request-Id": requestId,
    "X-BFF-Api-Version": "2026-05-07",
    "X-Dry-Run": "1",
    "Idempotency-Key": `idk-${requestId}`,
    "X-Idempotency-Key": `idk-${requestId}`,
  };
}

async function probe(ep) {
  const url = new URL(ep.route, BFF_BASE_URL).toString();
  const requestId = `write-probe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const { body, marker } = withProbeMarker(ep);
  try {
    const res = await fetch(url, {
      method: ep.method,
      headers: headersFor(requestId),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const bodyText = await res.text().catch(() => "");
    const json = safeJsonParse(bodyText);
    const baseCls = classify(res.status, json);
    let cls = baseCls;
    if (ep.allowTyped404 && res.status === 404 && baseCls.typedEnvelope) {
      cls = { ...baseCls, category: "implemented", tag: "implemented", note: "typed dev-id not-found precondition envelope" };
    } else if (ep.required === false && baseCls.category === "missing") {
      cls = { ...baseCls, category: "optional_missing", tag: "optional_missing", note: `${baseCls.note}; optional exploratory route` };
    }
    return {
      ...ep,
      marker,
      status: res.status,
      ...cls,
      snippet: bodyText.slice(0, 180).replace(/\s+/g, " "),
    };
  } catch (err) {
    const cls = classify(0, null);
    return {
      ...ep,
      marker,
      status: 0,
      ...cls,
      note: String(err).slice(0, 120),
      snippet: "",
    };
  }
}

function containsMarker(value) {
  try {
    return JSON.stringify(value).includes(PROBE_MARKER);
  } catch {
    return false;
  }
}

async function readback(route) {
  const requestId = `write-probe-readback-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const url = new URL(route, BFF_BASE_URL).toString();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
        Accept: "application/json",
        "X-Request-Id": requestId,
        "X-BFF-Api-Version": "2026-05-07",
      },
      signal: AbortSignal.timeout(15000),
    });
    const bodyText = await res.text().catch(() => "");
    const json = safeJsonParse(bodyText);
    return {
      route,
      status: res.status,
      ok: res.status === 200,
      markerFound: containsMarker(json ?? bodyText),
      note: res.status === 200 ? "readback ok" : `readback status ${res.status}`,
    };
  } catch (err) {
    return {
      route,
      status: 0,
      ok: false,
      markerFound: false,
      note: String(err).slice(0, 120),
    };
  }
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key];
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

async function main() {
  console.log(`[write-probe] BFF: ${BFF_BASE_URL}`);
  console.log(`[write-probe] Probe marker: ${PROBE_MARKER}`);
  console.log(`[write-probe] Probing ${ACTIVE_ENDPOINTS.length} write endpoints with X-Dry-Run: 1`);
  if (SKIPPED_ENDPOINTS.length) {
    console.log(`[write-probe] Skipping ${SKIPPED_ENDPOINTS.length} create endpoints in safe mode; set PANTHEON_WRITE_PROBE_INCLUDE_CREATES=true to run them explicitly.`);
  }

  const results = [];
  for (const ep of ACTIVE_ENDPOINTS) {
    const r = await probe(ep);
    console.log(`  ${r.tag.padEnd(16)} ${String(r.status).padStart(3)} ${ep.method.padEnd(4)} ${ep.route}`);
    results.push(r);
  }

  console.log(`[write-probe] Readback marker scan across ${READBACK_ENDPOINTS.length} list endpoints`);
  const readbacks = [];
  for (const route of READBACK_ENDPOINTS) {
    const r = await readback(route);
    console.log(`  readback ${String(r.status).padStart(3)} marker=${r.markerFound ? "found" : "absent"} ${route}`);
    readbacks.push(r);
  }

  const byBatch = {};
  for (const r of results) (byBatch[r.batch] ??= []).push(r);
  const counts = countBy(results, "category");
  const typed4xx = results.filter((r) => r.typedEnvelope).length;
  const sideEffectLeaks = readbacks.filter((r) => r.markerFound);
  const readbackFailures = readbacks.filter((r) => !r.ok);
  const hardFailures = results.filter((r) => ["missing", "be_error", "network", "other", "untyped_4xx"].includes(r.category));

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-");
  const md = [
    "# BFF Backend Write-Path Probe",
    "",
    `Generated: ${now.toISOString()}`,
    `BFF base: ${BFF_BASE_URL}`,
    `Probe marker: \`${PROBE_MARKER}\``,
    "",
    `Total endpoints probed: ${results.length}`,
    `Skipped create dry-run endpoints: ${SKIPPED_ENDPOINTS.length}`,
    `Create dry-run enabled: ${INCLUDE_CREATE_DRY_RUNS}`,
    `- implemented or typed rejected: ${counts.implemented ?? 0}`,
    `- typed 4xx BffErrorEnvelope responses: ${typed4xx}`,
    `- route missing/not implemented: ${counts.missing ?? 0}`,
    `- optional route missing/not implemented: ${counts.optional_missing ?? 0}`,
    `- untyped 4xx: ${counts.untyped_4xx ?? 0}`,
    `- backend 5xx: ${counts.be_error ?? 0}`,
    `- network errors: ${counts.network ?? 0}`,
    `- other unexpected: ${counts.other ?? 0}`,
    `- side-effect marker leaks: ${sideEffectLeaks.length}`,
    `- readback failures: ${readbackFailures.length}`,
    "",
    "Probe method: dev-only IDs + `X-Dry-Run: 1` + idempotency key + unique marker. 4xx responses must match BffErrorEnvelope. The unique marker must not appear in readback list endpoints.",
    "",
  ];

  for (const batch of ["P0-D", "P1-A", "P1-C", "P1-E", "P2-MAI"]) {
    md.push(`## ${batch}`, "", "| Tag | Status | Method | Route | Typed envelope | Note | Snippet |", "|---|---:|---|---|---|---|---|");
    for (const r of byBatch[batch] ?? []) {
      md.push(`| ${r.tag} | ${r.status} | ${r.method} | ${r.route} | ${r.typedEnvelope ? "yes" : "no"} | ${r.note} | ${r.snippet.replace(/\|/g, "\\|")} |`);
    }
    md.push("");
  }

  md.push("## Readback Marker Scan", "", "| Status | Route | Marker found | Note |", "|---:|---|---|---|");
  for (const r of readbacks) {
    md.push(`| ${r.status} | ${r.route} | ${r.markerFound ? "yes" : "no"} | ${r.note.replace(/\|/g, "\\|")} |`);
  }
  md.push("");

  if (hardFailures.length || sideEffectLeaks.length || readbackFailures.length) {
    md.push("## Failures", "");
    for (const r of hardFailures) md.push(`- ${r.method} ${r.route}: ${r.note}`);
    for (const r of sideEffectLeaks) md.push(`- ${r.route}: probe marker appeared in readback`);
    for (const r of readbackFailures) md.push(`- ${r.route}: ${r.note}`);
    md.push("");
  } else {
    md.push("## Verdict", "", "PASS: all write endpoints were implemented or typed-rejected, and no dry-run marker appeared in readback lists.", "");
  }

  const auditDir = path.resolve(ROOT, AUDIT_DIR);
  fs.mkdirSync(auditDir, { recursive: true });
  const out = path.join(auditDir, `bff-backend-write-probe-${ts}.md`);
  fs.writeFileSync(out, md.join("\n"), "utf8");
  console.log(`\n[write-probe] Evidence: ${out}`);

  if (hardFailures.length || sideEffectLeaks.length || readbackFailures.length) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("[write-probe] Fatal:", e);
  process.exit(1);
});
