#!/usr/bin/env node
/**
 * probe-bff-write-paths.mjs — 2026-05-28
 *
 * Real write-path probe against the live BFF.
 * Complements scripts/probe-bff-authenticated-live.mjs (which is read-heavy).
 *
 * For each endpoint:
 *  - 200/201/202        → BE implemented (success path, may need precondition)
 *  - 400/409/422        → BE implemented, precondition failure with typed envelope (OK)
 *  - 401/403            → BE implemented, auth/role failure (OK for this probe)
 *  - 404/405            → BE NOT implemented (the gap we're tracking)
 *  - 501                → BE explicitly NOT implemented (the gap)
 *  - 5xx (other)        → BE bug
 *
 * Uses dev IDs and `X-Dry-Run: 1` header. Never targets real entities.
 *
 * Output: .lovable/audits/bff-backend-write-probe-2026-05-28.md
 */
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

const BFF_BASE_URL = (
  process.env.PANTHEON_BFF_BASE_URL ||
  process.env.VITE_BFF_BASE_URL ||
  "https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io"
).replace(/\/$/, "");
const BEARER_TOKEN =
  process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN ||
  process.env.BFF_AUTH_TOKEN ||
  "pantheon-dev-browser:reviewer";
const AUDIT_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || ".lovable/audits";
const ROOT = process.cwd();

const ENDPOINTS = [
  // ── P0-D — Entity create ───────────────────────────────────────────
  { batch: "P0-D", route: "/bff/strategies", method: "POST", body: { name: "dev-probe", alpha: "alpha-dev", capitalPoolId: "cp-dev", personaIds: [] } },
  { batch: "P0-D", route: "/bff/personas", method: "POST", body: { name: "dev-probe", archetype: "generalist" } },
  { batch: "P0-D", route: "/bff/capital-pools", method: "POST", body: { name: "dev-probe", currency: "USD", allocated: 1, riskBudget: 1 } },
  { batch: "P0-D", route: "/bff/rebalances", method: "POST", body: { name: "dev-probe", quarter: "2026Q2", targetPoolId: "cp-dev" } },
  { batch: "P0-D", route: "/bff/deployments", method: "POST", body: { name: "dev-probe", strategyId: "st-dev", artifactId: "ar-dev", target: "paper", version: "0.0.0" } },
  { batch: "P0-D", route: "/bff/runtimes", method: "POST", body: { name: "dev-probe" } },
  { batch: "P0-D", route: "/bff/ranking-formulas", method: "POST", body: { name: "dev-probe", expression: "sharpe" } },
  { batch: "P0-D", route: "/bff/research-experiments", method: "POST", body: { name: "dev-probe", hypothesis: "h", metric: "sharpe" } },
  { batch: "P0-D", route: "/bff/skills", method: "POST", body: { name: "dev-probe" } },

  // ── P1-A — Action commands ────────────────────────────────────────
  { batch: "P1-A", route: "/bff/actions/strategies/strategy-dev/promote_live", method: "POST", body: {} },
  { batch: "P1-A", route: "/bff/actions/strategies/strategy-dev/pause", method: "POST", body: {} },
  { batch: "P1-A", route: "/bff/actions/strategies/strategy-dev/throttle", method: "POST", body: { factor: 0.5 } },
  { batch: "P1-A", route: "/bff/actions/strategies/strategy-dev/archive", method: "POST", body: {} },
  { batch: "P1-A", route: "/bff/actions/strategies/strategy-dev/edit", method: "POST", body: { patch: {} } },
  { batch: "P1-A", route: "/bff/approvals/approval-dev/decide", method: "POST", body: { decision: "approve", reason: "probe" } },
  { batch: "P1-A", route: "/bff/command-confirmations/token-dev/confirm", method: "POST", body: {} },

  // ── P1-C — v5 Sentinel + HIQ writes ───────────────────────────────
  { batch: "P1-C", route: "/bff/v5/sentinel/findings/finding-dev/status", method: "POST", body: { status: "acknowledged" } },
  { batch: "P1-C", route: "/bff/v5/sentinel/remediation/build", method: "POST", body: { findingId: "finding-dev", plan: { kind: "pause", target: "strategy-dev" } } },
  { batch: "P1-C", route: "/bff/v5/interventions/intervention-dev/claim", method: "POST", body: {} },
  { batch: "P1-C", route: "/bff/v5/interventions/intervention-dev/release", method: "POST", body: {} },
  { batch: "P1-C", route: "/bff/v5/interventions/intervention-dev/escalate", method: "POST", body: { to: "tier2" } },
  { batch: "P1-C", route: "/bff/v5/interventions/intervention-dev/decide", method: "POST", body: { decision: "approve", memo: "probe" } },
  { batch: "P1-C", route: "/bff/v5/interventions/intervention-dev/two-man-sign", method: "POST", body: {} },
  { batch: "P1-C", route: "/bff/v5/interventions/batch-decide", method: "POST", body: { ids: ["intervention-dev"], decision: "approve" } },

  // ── P1-E — Agora writes ───────────────────────────────────────────
  { batch: "P1-E", route: "/bff/agora/signals", method: "POST", body: { title: "dev-probe" } },
  { batch: "P1-E", route: "/bff/agora/feedback", method: "POST", body: { target: "dev", text: "probe" } },
  { batch: "P1-E", route: "/bff/agora/inbox/inbox-dev/triage", method: "POST", body: { action: "ack" } },
  { batch: "P1-E", route: "/bff/agora/journal", method: "POST", body: { title: "dev-probe", body: "probe" } },
  { batch: "P1-E", route: "/bff/agora/skill-coaching", method: "POST", body: { skillId: "skill-dev" } },
  { batch: "P1-E", route: "/bff/agora/postmortems", method: "POST", body: { incidentId: "incident-dev" } },
  { batch: "P1-E", route: "/bff/agora/ask/sessions", method: "POST", body: { target: "persona-dev", question: "probe" } },
];

function classify(status) {
  if (status >= 200 && status < 300) return { tag: "✅ implemented", note: "success" };
  if (status === 400 || status === 409 || status === 422) return { tag: "✅ implemented", note: "precondition failure (typed envelope expected)" };
  if (status === 401 || status === 403) return { tag: "✅ implemented", note: "auth/role rejected" };
  if (status === 404 || status === 405) return { tag: "❌ NOT implemented", note: "route missing" };
  if (status === 501) return { tag: "❌ NOT implemented", note: "explicit 501" };
  if (status >= 500) return { tag: "⚠️ BE error", note: `5xx ${status}` };
  return { tag: `? ${status}`, note: "unexpected" };
}

async function probe(ep) {
  const url = new URL(ep.route, BFF_BASE_URL).toString();
  const corr = `probe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    const res = await fetch(url, {
      method: ep.method,
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Correlation-Id": corr,
        "X-Request-Id": corr,
        "X-BFF-Api-Version": "2026-05-07",
        "X-Dry-Run": "1",
        "Idempotency-Key": `idk-${corr}`,
      },
      body: JSON.stringify(ep.body ?? {}),
      signal: AbortSignal.timeout(10000),
    });
    let bodyText = "";
    try { bodyText = await res.text(); } catch { /* ignore */ }
    const cls = classify(res.status);
    return { ...ep, status: res.status, tag: cls.tag, note: cls.note, snippet: bodyText.slice(0, 140).replace(/\s+/g, " ") };
  } catch (err) {
    return { ...ep, status: 0, tag: "⚠️ network", note: String(err).slice(0, 80), snippet: "" };
  }
}

async function main() {
  console.log(`[write-probe] BFF: ${BFF_BASE_URL}`);
  console.log(`[write-probe] Probing ${ENDPOINTS.length} write endpoints`);
  const results = [];
  for (const ep of ENDPOINTS) {
    const r = await probe(ep);
    console.log(`  ${r.tag.padEnd(20)} ${String(r.status).padStart(3)}  ${ep.method.padEnd(4)} ${ep.route}`);
    results.push(r);
  }

  const byBatch = {};
  for (const r of results) (byBatch[r.batch] ??= []).push(r);

  const counts = results.reduce((acc, r) => {
    const k = r.tag.includes("NOT implemented") ? "missing"
            : r.tag.includes("implemented") ? "implemented"
            : r.tag.includes("BE error") ? "be_error"
            : "other";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const md = [
    "# BFF Backend Write-Path Probe — 2026-05-28",
    "",
    `Generated: ${new Date().toISOString()}`,
    `BFF base: ${BFF_BASE_URL}`,
    "",
    `Total endpoints: ${results.length}`,
    `- ✅ implemented: ${counts.implemented ?? 0}`,
    `- ❌ NOT implemented: ${counts.missing ?? 0}`,
    `- ⚠️ BE error: ${counts.be_error ?? 0}`,
    `- ? other: ${counts.other ?? 0}`,
    "",
    "Probe method: dev-only IDs + `X-Dry-Run: 1` + dev bearer. Any 4xx-typed envelope counts as \"implemented\".",
    "",
  ];

  for (const batch of ["P0-D", "P1-A", "P1-C", "P1-E"]) {
    md.push(`## ${batch}`, "", "| Tag | Status | Method | Route | Note | Snippet |", "|---|---|---|---|---|---|");
    for (const r of byBatch[batch] ?? []) {
      md.push(`| ${r.tag} | ${r.status} | ${r.method} | ${r.route} | ${r.note} | ${r.snippet.replace(/\|/g, "\\|")} |`);
    }
    md.push("");
  }

  const auditDir = path.resolve(ROOT, AUDIT_DIR);
  fs.mkdirSync(auditDir, { recursive: true });
  const out = path.join(auditDir, "bff-backend-write-probe-2026-05-28.md");
  fs.writeFileSync(out, md.join("\n"), "utf8");
  console.log(`\n[write-probe] Evidence: ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
