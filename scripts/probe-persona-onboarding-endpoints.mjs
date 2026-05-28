#!/usr/bin/env node
/**
 * probe-persona-onboarding-endpoints.mjs — 2026-05-28
 *
 * Per PERSONA_ONBOARDING_WIZARD_SPEC.md §4.1 / §12 (DoD #1):
 *   "Frontend 實作 wizard 前必須 step 1: 跑一次 8 個 endpoint smoke test,
 *    把實際 status code / response shape 列出來再開工."
 *
 * Endpoints (per spec §4):
 *   1.  POST /bff/personas/{id}/actions/AdvanceLifecycle              (stage 1)
 *   2.  POST /bff/capital-pools                                       (stage 2a)
 *   3.  POST /bff/capital-pools/{id}/actions/ApprovePool              (stage 2b)
 *   4.  POST /api/v1/bindings                                         (stage 2c)
 *   5.  POST /api/v1/deployment-plans                                 (stage 3)
 *   6.  POST /api/v1/approval-decisions                               (stage 4)
 *   7.  POST /bff/runtimes/{id}/actions/StartRuntime                  (stage 5)
 *   8.  GET  /api/v1/operator/persona-management/{id}                 (F4 read)
 *
 * Output: .lovable/audits/persona-onboarding-endpoint-probe-2026-05-28.md
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

const PERSONA_ID = "persona-dev";
const POOL_ID = "cp-dev";
const RUNTIME_ID = "runtime-dev";

const ENDPOINTS = [
  { stage: 1, route: `/bff/personas/${PERSONA_ID}/actions/AdvanceLifecycle`,
    method: "POST", body: { target_state: "paper_owner", confirm_token: "probe" } },
  { stage: "2a", route: `/bff/capital-pools`,
    method: "POST", body: { name: "probe-pool", currency: "USD", allocated: 1, riskBudget: 1 } },
  { stage: "2b", route: `/bff/capital-pools/${POOL_ID}/actions/ApprovePool`,
    method: "POST", body: { memo: "probe" } },
  { stage: "2c", route: `/api/v1/bindings`,
    method: "POST", body: { persona_id: PERSONA_ID, capital_pool_id: POOL_ID,
      role: "paper_owner", allowed_deployment_scope: "paper", budget: 1 } },
  { stage: 3, route: `/api/v1/deployment-plans`,
    method: "POST", body: { binding_id: "bind-dev", artifact_id: "ar-dev",
      deployment_mode: "paper", capital_pool_id: POOL_ID } },
  { stage: 4, route: `/api/v1/approval-decisions`,
    method: "POST", body: { plan_id: "plan-dev", decision: "approve", memo: "probe" } },
  { stage: 5, route: `/bff/runtimes/${RUNTIME_ID}/actions/StartRuntime`,
    method: "POST", body: { confirm_token: "probe" } },
  { stage: "F4", route: `/api/v1/operator/persona-management/${PERSONA_ID}`,
    method: "GET" },
];

function classify(status) {
  if (status >= 200 && status < 300) return "✅ implemented";
  if ([400, 409, 422].includes(status)) return "✅ implemented (precondition)";
  if ([401, 403].includes(status)) return "✅ implemented (auth/role)";
  if ([404, 405].includes(status)) return "❌ NOT implemented";
  if (status === 501) return "❌ NOT implemented (501)";
  if (status >= 500) return `⚠️ BE error ${status}`;
  return `? ${status}`;
}

async function probe(ep) {
  const url = new URL(ep.route, BFF_BASE_URL).toString();
  const corr = `probe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const init = {
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
    signal: AbortSignal.timeout(10000),
  };
  if (ep.method !== "GET") init.body = JSON.stringify(ep.body ?? {});
  try {
    const res = await fetch(url, init);
    const text = await res.text().catch(() => "");
    return { ...ep, status: res.status, tag: classify(res.status),
             snippet: text.slice(0, 200).replace(/\s+/g, " ") };
  } catch (err) {
    return { ...ep, status: 0, tag: "⚠️ network", snippet: String(err).slice(0, 120) };
  }
}

async function main() {
  console.log(`[onboard-probe] BFF: ${BFF_BASE_URL}`);
  const results = [];
  for (const ep of ENDPOINTS) {
    const r = await probe(ep);
    console.log(`  ${r.tag.padEnd(30)} ${String(r.status).padStart(3)}  ${ep.method.padEnd(4)} ${ep.route}`);
    results.push(r);
  }

  const md = [
    "# Persona Onboarding Wizard — Endpoint Probe — 2026-05-28",
    "",
    `Generated: ${new Date().toISOString()}`,
    `BFF base: ${BFF_BASE_URL}`,
    `Spec: docs/04/pantheon_persona_onboarding_wizard_2026-05-28/PERSONA_ONBOARDING_WIZARD_SPEC.md §4.1 / §12 DoD #1`,
    "",
    "Probe: dev IDs + `X-Dry-Run: 1`. Any typed 4xx envelope counts as implemented.",
    "Wizard wraps every write in `withWriteFallback` so any `❌ NOT implemented` row",
    "auto-degrades to writeOverlay + LiveStatusBanner.",
    "",
    "| Stage | Tag | Status | Method | Route | Snippet |",
    "|---|---|---|---|---|---|",
    ...results.map((r) =>
      `| ${r.stage} | ${r.tag} | ${r.status} | ${r.method} | ${r.route} | ${r.snippet.replace(/\|/g, "\\|")} |`,
    ),
    "",
  ];

  const dir = path.resolve(process.cwd(), AUDIT_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "persona-onboarding-endpoint-probe-2026-05-28.md");
  fs.writeFileSync(out, md.join("\n"), "utf8");
  console.log(`\n[onboard-probe] Evidence: ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
