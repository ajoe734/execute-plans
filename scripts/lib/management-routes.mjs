// MGMT-GAP-006: canonical route baseline for the hosted management
// production-acceptance harness.
//
// BASELINE_ROUTES reproduces the 93-route shape from
// docs/04/pantheon_management_console_gap_2026-06-30/archive/route-control-reaudit-2026-07-01.json
// (Pantheon repo), captured 2026-07-01 against a local FE preview. This
// harness re-crawls the same path set against the *hosted* FE origin (see
// accept-management-hosted-production.mjs) and additionally discovers the
// live nav from the rendered DOM, so route additions/removals since that
// crawl are still caught.
//
// ALIAS_CANONICAL_RULES encodes the alias -> canonical final-path mapping
// observed in that same crawl (`finalUrl` field), used to assert that known
// hidden aliases redirect instead of direct-rendering a duplicate component.
//
// MGMT-PERF-IA-001: portfolio-book, promotion-allocation, persona-league,
// quarterly-ranking, and performance-attribution retire from direct nav
// rendering in favor of the three canonical centers below. This file is a
// plain-JS mirror (this probe runs under bare `node`, not vite/ts-node) of
// src/management/navigation/managementRouteManifest.ts — keep both in sync
// when the route/menu manifest changes.
export const BASELINE_ROUTES = [
  { path: "/management/performance", kind: "nav" },
  { path: "/management/rankings", kind: "nav" },
  { path: "/management/governance-decisions", kind: "nav" },
  { path: "/management/cockpit", kind: "nav" },
  { path: "/management/persona-fleet", kind: "nav" },
  { path: "/management/human-inbox", kind: "nav" },
  { path: "/management/trading-pulse", kind: "nav" },
  { path: "/management/evolution-journal", kind: "nav" },
  { path: "/management/evidence", kind: "nav" },
  { path: "/management/persona-intent", kind: "nav" },
  { path: "/management/portfolio-book", kind: "nav" },
  { path: "/management/persona-league", kind: "nav" },
  { path: "/management/quarterly-ranking", kind: "nav" },
  { path: "/management/performance-attribution", kind: "nav" },
  { path: "/management/readiness/ep5", kind: "nav" },
  { path: "/management/readiness/broker-live", kind: "nav" },
  { path: "/management/readiness/capital-binding-live", kind: "nav" },
  { path: "/management/readiness/bff-ha", kind: "nav" },
  { path: "/management/readiness/strict-publish", kind: "nav" },
  { path: "/management/strategies", kind: "nav" },
  { path: "/management/alpha-factory", kind: "nav" },
  { path: "/management/personas", kind: "nav" },
  { path: "/management/capital", kind: "nav" },
  { path: "/management/ranking", kind: "nav" },
  { path: "/management/rebalance", kind: "nav" },
  { path: "/management/evolution", kind: "nav" },
  { path: "/management/experiments", kind: "nav" },
  { path: "/management/artifacts", kind: "nav" },
  { path: "/management/lineage", kind: "nav" },
  { path: "/management/loops", kind: "nav" },
  { path: "/management/deployments", kind: "nav" },
  { path: "/management/runtimes", kind: "nav" },
  { path: "/management/risk", kind: "nav" },
  { path: "/management/incidents", kind: "nav" },
  { path: "/management/jobs", kind: "nav" },
  { path: "/management/alerts", kind: "nav" },
  { path: "/management/sentinel", kind: "nav" },
  { path: "/management/interventions", kind: "nav" },
  { path: "/management/approvals", kind: "nav" },
  { path: "/management/governance", kind: "nav" },
  { path: "/management/governance/policies", kind: "nav" },
  { path: "/management/governance/permissions", kind: "nav" },
  { path: "/management/governance/memory", kind: "nav" },
  { path: "/management/governance/consult", kind: "nav" },
  { path: "/management/knowledge", kind: "nav" },
  { path: "/management/postmortems", kind: "nav" },
  { path: "/management/tools", kind: "nav" },
  { path: "/management/mcp", kind: "nav" },
  { path: "/management/skills", kind: "nav" },
  { path: "/management/workflows", kind: "nav" },
  { path: "/management/hooks", kind: "nav" },
  { path: "/management/channels", kind: "nav" },
  { path: "/management/llm-provider-auth", kind: "nav" },
  { path: "/management/data-sources", kind: "nav" },
  { path: "/management/audit", kind: "nav" },
  { path: "/management/settings", kind: "nav" },
  { path: "/management/loops/execution", kind: "detail-or-alias" },
  { path: "/management/loops/optimization", kind: "detail-or-alias" },
  { path: "/management/loops/research", kind: "detail-or-alias" },
  { path: "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-tw-equity", kind: "detail-or-alias" },
  { path: "/management/evidence/evref-demo-readiness-001", kind: "detail-or-alias" },
  { path: "/management/evidence?ref_id=evref-demo-readiness-001", kind: "detail-or-alias" },
  { path: "/management/persona-intent/trace-001", kind: "detail-or-alias" },
  { path: "/management/strategies/stg_001", kind: "detail-or-alias", entity: "strategies" },
  { path: "/management/personas/per_quant", kind: "detail-or-alias", entity: "personas" },
  { path: "/management/personas/per_quant/onboarding", kind: "detail-or-alias" },
  { path: "/management/capital/cp_alpha", kind: "detail-or-alias", entity: "capital" },
  { path: "/management/ranking/formulas", kind: "detail-or-alias" },
  { path: "/management/ranking/formulas/rf_001", kind: "detail-or-alias", entity: "ranking-formulas" },
  { path: "/management/rebalance/rb_q2_2026", kind: "detail-or-alias", entity: "rebalance" },
  { path: "/management/evolution/ev_001", kind: "detail-or-alias", entity: "evolution" },
  { path: "/management/experiments/rx_201", kind: "detail-or-alias", entity: "experiments" },
  { path: "/management/artifacts/art_stg001_v320", kind: "detail-or-alias", entity: "artifacts" },
  { path: "/management/deployments/dp_001", kind: "detail-or-alias", entity: "deployments" },
  { path: "/management/incidents/in_021", kind: "detail-or-alias", entity: "incidents" },
  { path: "/management/governance/ap_301", kind: "detail-or-alias" },
  { path: "/management/governance/policies/rp_quant_v2", kind: "detail-or-alias", entity: "governance-policies" },
  { path: "/management/tools/tl_market_data", kind: "detail-or-alias", entity: "tools" },
  { path: "/management/mcp/mcp_alpha", kind: "detail-or-alias", entity: "mcp" },
  { path: "/management/mcp-tools/mt_001", kind: "detail-or-alias", entity: "mcp-tools" },
  { path: "/management/skills/sk_macro_brief", kind: "detail-or-alias", entity: "skills" },
  { path: "/management/channels/ch_slack_alerts", kind: "detail-or-alias", entity: "channels" },
  { path: "/management/control-room", kind: "detail-or-alias" },
  { path: "/management/one-ring", kind: "detail-or-alias" },
  { path: "/management/overview", kind: "detail-or-alias" },
  { path: "/management/command-center", kind: "detail-or-alias" },
  { path: "/management/risk-center", kind: "detail-or-alias" },
  { path: "/management/capital-pools", kind: "detail-or-alias" },
  { path: "/management/ranking-formulas", kind: "detail-or-alias" },
  { path: "/management/rebalances", kind: "detail-or-alias" },
  { path: "/management/research", kind: "detail-or-alias" },
  { path: "/management/deployment", kind: "detail-or-alias" },
  { path: "/management/capital-pools/cp_alpha", kind: "detail-or-alias" },
  { path: "/management/ranking-formulas/rf_001", kind: "detail-or-alias" },
  { path: "/management/rebalances/rb_q2_2026", kind: "detail-or-alias" },
  { path: "/management/research/rx_201", kind: "detail-or-alias" },
];

// Each rule: `test` matches the alias path (pathname only); `canonical`
// returns the expected canonical pathname (search params are preserved
// separately by the caller for the `deployment/:id` case).
export const ALIAS_CANONICAL_RULES = [
  { test: /^\/management\/(control-room|one-ring|overview|command-center)$/, canonical: () => "/management/cockpit" },
  { test: /^\/management\/risk-center$/, canonical: () => "/management/risk" },
  // MGMT-PERF-IA-001 — bare capital is Performance Center's exposure tab;
  // capital-pools/ranking-formulas/rebalances (and their singular aliases)
  // are Governance Decisions. Detail (:id) routes intentionally keep their
  // pre-existing target — MGMT-PERF-IA-006 restores a real canonical detail
  // page instead of a broad tab redirect.
  { test: /^\/management\/portfolio-book$/, canonical: () => "/management/performance" },
  { test: /^\/management\/performance-attribution$/, canonical: () => "/management/performance" },
  { test: /^\/management\/capital$/, canonical: () => "/management/performance" },
  { test: /^\/management\/persona-league$/, canonical: () => "/management/rankings" },
  { test: /^\/management\/quarterly-ranking$/, canonical: () => "/management/rankings" },
  { test: /^\/management\/capital-pools$/, canonical: () => "/management/governance-decisions" },
  { test: /^\/management\/capital-pools\/([^/]+)$/, canonical: (m) => `/management/capital/${m[1]}` },
  { test: /^\/management\/ranking$/, canonical: () => "/management/governance-decisions" },
  { test: /^\/management\/ranking\/formulas$/, canonical: () => "/management/governance-decisions" },
  { test: /^\/management\/ranking-formulas$/, canonical: () => "/management/governance-decisions" },
  { test: /^\/management\/ranking-formulas\/([^/]+)$/, canonical: (m) => `/management/ranking/formulas/${m[1]}` },
  { test: /^\/management\/rebalance$/, canonical: () => "/management/governance-decisions" },
  { test: /^\/management\/rebalances$/, canonical: () => "/management/governance-decisions" },
  { test: /^\/management\/rebalances\/([^/]+)$/, canonical: (m) => `/management/rebalance/${m[1]}` },
  { test: /^\/management\/research$/, canonical: () => "/management/experiments" },
  { test: /^\/management\/research\/([^/]+)$/, canonical: (m) => `/management/experiments/${m[1]}` },
  { test: /^\/management\/deployment$/, canonical: () => "/management/deployments" },
  { test: /^\/management\/deployment\/([^/]+)$/, canonical: (m) => `/management/deployments/${m[1]}` },
];

export function expectedCanonicalPath(pathname) {
  for (const rule of ALIAS_CANONICAL_RULES) {
    const match = pathname.match(rule.test);
    if (match) return rule.canonical(match);
  }
  return null;
}

// Maps a route's `entity` tag to the BFF list endpoint used to resolve a
// real live id, so the harness can additionally probe each detail route
// with a genuine live id (not just the 2026-07-01 fixture id, which may
// 404 honestly on a strict-live BFF and is itself a useful negative case).
export const ENTITY_LIST_ENDPOINTS = {
  strategies: "/bff/strategies",
  personas: "/bff/personas",
  capital: "/bff/capital-pools",
  "ranking-formulas": "/bff/ranking-formulas",
  rebalance: "/bff/rebalances",
  evolution: "/bff/evolution-programs",
  experiments: "/bff/research-experiments",
  artifacts: "/bff/artifacts",
  deployments: "/bff/deployments",
  incidents: "/bff/incidents",
  tools: "/bff/tools",
  mcp: "/bff/mcp-servers",
  "mcp-tools": "/bff/mcp-tools",
  skills: "/bff/skills",
  channels: "/bff/channels",
};
