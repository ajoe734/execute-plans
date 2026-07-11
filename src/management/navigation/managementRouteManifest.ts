// MGMT-PERF-IA-001 — canonical management route, menu, tab, and redirect
// manifest. Single typed source of truth for:
//   - the management sidebar (ManagementLayout.tsx)
//   - page titles / breadcrumbs (src/lib/v4/routeLabels.ts)
//   - command palette static "jump to" entries (CommandPalette.tsx)
//   - cockpit destination links (management/components/cockpit/*)
//   - the hosted route acceptance inventory (scripts/lib/management-routes.mjs)
//
// Target IA contract: docs/04/pantheon_management_performance_ranking_ia_gap_2026-07-11/
// archive/TARGET_INFORMATION_ARCHITECTURE.md and archive/ROUTE_MIGRATION_MATRIX.md
// (Pantheon repo). Do not hand-roll a second nav/redirect list; extend this file.
import {
  Boxes, Users, GitBranch,
  FlaskConical, Database, Rocket, Server, ListChecks, Bell, AlertOctagon,
  ScrollText, ClipboardCheck, Wrench, Network, Sparkles, Radio, Settings,
  BookOpen, Workflow, FileText, Factory, Clock, ShieldCheck, Brain, MessagesSquare,
  Compass, Target, Eye, ShieldAlert, Trophy, BarChart3,
  KeyRound,
  type LucideIcon,
} from "lucide-react";

/** Shared cross-page filter/context vocabulary (TARGET_INFORMATION_ARCHITECTURE.md
 *  "Shared Filters"). Legacy redirects may only forward keys from this list;
 *  everything else is considered page-local and is dropped on migration. */
export const SHARED_CONTEXT_KEYS = [
  "persona",
  "runtime",
  "strategy",
  "capital_pool",
  "asset_class",
  "broker",
  "stage",
  "period",
  "as_of",
  "source_confidence",
] as const;

/** Extra context keys individual legacy routes are known to read today.
 *  These are preserved on redirect even though they are not (yet) part of
 *  the shared vocabulary locked by MGMT-PERF-IA-002. */
export const LEGACY_CONTEXT_KEYS = [
  "quarter",
  "eligibility",
  "sort",
  "snapshot",
  "dimension",
  "entity",
  "capital_id",
  "formula_id",
  "rebalance_id",
  "pool",
  "capital_pool_id",
] as const;

export type ManagementCenterId = "performance" | "rankings" | "governance-decisions";

export interface ManagementCenterTab {
  id: string;
  labelKey: string;
}

export interface ManagementCenter {
  id: ManagementCenterId;
  path: string;
  labelKey: string;
  icon: LucideIcon;
  defaultTab: string;
  tabs: readonly ManagementCenterTab[];
}

// Canonical route manifest — TARGET_INFORMATION_ARCHITECTURE.md "Canonical
// Route Manifest" table. Wave 0 (this task) mounts each tab on the existing,
// unmodified legacy page component so the canonical URL is fully functional
// on merge; Wave 1 (MGMT-PERF-IA-003/004/005) replaces tab bodies with the
// consolidated, deduplicated implementation.
export const CANONICAL_CENTERS: Record<ManagementCenterId, ManagementCenter> = {
  performance: {
    id: "performance",
    path: "/management/performance",
    labelKey: "nav.performanceCenter",
    icon: BarChart3,
    defaultTab: "overview",
    tabs: [
      { id: "overview", labelKey: "performanceCenter.tabs.overview" },
      { id: "attribution", labelKey: "performanceCenter.tabs.attribution" },
      { id: "exposure", labelKey: "performanceCenter.tabs.exposure" },
    ],
  },
  rankings: {
    id: "rankings",
    path: "/management/rankings",
    labelKey: "nav.rankingsCenter",
    icon: Trophy,
    defaultTab: "rolling",
    tabs: [
      { id: "rolling", labelKey: "rankingsCenter.tabs.rolling" },
      { id: "quarterly", labelKey: "rankingsCenter.tabs.quarterly" },
    ],
  },
  "governance-decisions": {
    id: "governance-decisions",
    path: "/management/governance-decisions",
    labelKey: "nav.governanceDecisions",
    icon: ClipboardCheck,
    defaultTab: "recommendations",
    tabs: [
      { id: "recommendations", labelKey: "governanceDecisions.tabs.recommendations" },
      { id: "capital", labelKey: "governanceDecisions.tabs.capital" },
      { id: "policy", labelKey: "governanceDecisions.tabs.policy" },
    ],
  },
};

export function canonicalCenterUrl(center: ManagementCenterId, tab?: string, extraParams?: Record<string, string | undefined>): string {
  const def = CANONICAL_CENTERS[center];
  const params = new URLSearchParams();
  params.set("tab", tab || def.defaultTab);
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined && v !== "") params.set(k, v);
    }
  }
  return `${def.path}?${params.toString()}`;
}

export interface ManagementNavItem {
  /** Stable identity for duplicate-detection and dedupeKey highlighting. */
  id: string;
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** Only set when several nav entries should share one active-highlight. */
  dedupeKey?: string;
}

export interface ManagementNavGroup {
  id: string;
  labelKey: string;
  items: readonly ManagementNavItem[];
}

// Sidebar groups — TARGET_INFORMATION_ARCHITECTURE.md "Sidebar Groups".
// Every pre-existing sidebar item is assigned exactly once; portfolio-book,
// performance-attribution, persona-league, quarterly-ranking, and
// promotion-allocation are retired from direct sidebar visibility in favor
// of the three canonical centers below (see MGMT-PERF-IA-001 evidence for
// the full old-item -> new-group accounting).
export const MANAGEMENT_SIDEBAR_GROUPS: readonly ManagementNavGroup[] = [
  {
    id: "operational-overview",
    labelKey: "groups.operationalOverview",
    items: [
      { id: "cockpit", to: "/management/cockpit", labelKey: "nav.managementCockpit", icon: Compass, dedupeKey: "cockpit" },
      { id: "persona-fleet", to: "/management/persona-fleet", labelKey: "nav.personaFleet", icon: Users, dedupeKey: "fleet" },
      { id: "human-inbox", to: "/management/human-inbox", labelKey: "nav.humanInbox", icon: Eye, dedupeKey: "humanQueue" },
      { id: "trading-pulse", to: "/management/trading-pulse", labelKey: "nav.tradingPulse", icon: Target },
      { id: "persona-intent", to: "/management/persona-intent", labelKey: "nav.personaIntent", icon: Brain },
    ],
  },
  {
    id: "performance-and-risk",
    labelKey: "groups.performanceAndRisk",
    items: [
      { id: "performance-center", to: canonicalCenterUrl("performance"), labelKey: "nav.performanceCenter", icon: BarChart3 },
      { id: "risk-center", to: "/management/risk", labelKey: "nav.riskCenter", icon: AlertOctagon },
    ],
  },
  {
    id: "ranking-and-governance",
    labelKey: "groups.rankingAndGovernance",
    items: [
      { id: "rankings-center", to: canonicalCenterUrl("rankings"), labelKey: "nav.rankingsCenter", icon: Trophy },
      { id: "governance-decisions", to: canonicalCenterUrl("governance-decisions"), labelKey: "nav.governanceDecisions", icon: ClipboardCheck },
    ],
  },
  {
    id: "research-and-evolution",
    labelKey: "groups.researchAndEvolution",
    items: [
      { id: "experiments", to: "/management/experiments", labelKey: "nav.experiments", icon: FlaskConical },
      { id: "evolution-journal", to: "/management/evolution-journal", labelKey: "nav.evolutionJournal", icon: GitBranch },
      { id: "evolution", to: "/management/evolution", labelKey: "nav.evolution", icon: GitBranch },
      { id: "alpha-factory", to: "/management/alpha-factory", labelKey: "nav.alphaFactory", icon: Factory },
    ],
  },
  {
    id: "registry-and-lineage",
    labelKey: "groups.registryAndLineage",
    items: [
      { id: "strategies", to: "/management/strategies", labelKey: "nav.strategyRegistry", icon: Boxes },
      { id: "personas", to: "/management/personas", labelKey: "nav.personaRegistry", icon: Users, dedupeKey: "personas" },
      { id: "artifacts", to: "/management/artifacts", labelKey: "nav.artifacts", icon: Database },
      { id: "lineage", to: "/management/lineage", labelKey: "nav.lineage", icon: Workflow },
      { id: "evidence", to: "/management/evidence", labelKey: "nav.evidenceExplorer", icon: FileText },
      { id: "knowledge", to: "/management/knowledge", labelKey: "nav.knowledge", icon: BookOpen },
      { id: "postmortems", to: "/management/postmortems", labelKey: "nav.postmortems", icon: FileText },
    ],
  },
  {
    id: "execution-operations",
    labelKey: "groups.executionOperations",
    items: [
      { id: "deployments", to: "/management/deployments", labelKey: "nav.deployments", icon: Rocket },
      { id: "runtimes", to: "/management/runtimes", labelKey: "nav.runtimes", icon: Server },
      { id: "loops", to: "/management/loops", labelKey: "nav.loops", icon: Workflow, dedupeKey: "loops" },
      { id: "sentinel", to: "/management/sentinel", labelKey: "nav.sentinel", icon: ShieldAlert, dedupeKey: "humanQueue" },
      { id: "interventions", to: "/management/interventions", labelKey: "nav.interventions", icon: Eye, dedupeKey: "humanQueue" },
      { id: "incidents", to: "/management/incidents", labelKey: "nav.incidents", icon: AlertOctagon },
      { id: "jobs", to: "/management/jobs", labelKey: "nav.jobs", icon: ListChecks },
      { id: "alerts", to: "/management/alerts", labelKey: "nav.alerts", icon: Bell },
      { id: "governance-queue", to: "/management/governance", labelKey: "nav.governance", icon: ClipboardCheck },
      { id: "approvals", to: "/management/approvals", labelKey: "nav.approvals", icon: ClipboardCheck, dedupeKey: "humanQueue" },
    ],
  },
  {
    id: "live-readiness-and-system",
    labelKey: "groups.liveReadinessAndSystem",
    items: [
      { id: "readiness-ep5", to: "/management/readiness/ep5", labelKey: "readiness.ep5Title", icon: ShieldAlert },
      { id: "readiness-broker-live", to: "/management/readiness/broker-live", labelKey: "nav.brokerLiveReadiness", icon: ShieldAlert, dedupeKey: "brokerLive" },
      { id: "readiness-bff-ha", to: "/management/readiness/bff-ha", labelKey: "nav.bffHaReadiness", icon: Server, dedupeKey: "bffHa" },
      { id: "readiness-strict-publish", to: "/management/readiness/strict-publish", labelKey: "nav.strictPublishAudit", icon: ShieldCheck, dedupeKey: "strict" },
      { id: "data-sources", to: "/management/data-sources", labelKey: "nav.dataSourcesManagement", icon: Database },
      { id: "llm-provider-auth", to: "/management/llm-provider-auth", labelKey: "nav.llmProviderAuth", icon: KeyRound },
      { id: "governance-policies", to: "/management/governance/policies", labelKey: "nav.routePolicies", icon: ClipboardCheck },
      { id: "permissions", to: "/management/governance/permissions", labelKey: "nav.permissions", icon: ShieldCheck },
      { id: "memory-governance", to: "/management/governance/memory", labelKey: "nav.memoryGov", icon: Brain },
      { id: "consult-rules", to: "/management/governance/consult", labelKey: "nav.consultRules", icon: MessagesSquare },
      { id: "tools", to: "/management/tools", labelKey: "nav.tools", icon: Wrench },
      { id: "mcp", to: "/management/mcp", labelKey: "nav.mcp", icon: Network },
      { id: "skills", to: "/management/skills", labelKey: "nav.skills", icon: Sparkles },
      { id: "workflows", to: "/management/workflows", labelKey: "nav.workflowTemplates", icon: Workflow },
      { id: "hooks", to: "/management/hooks", labelKey: "nav.hooks", icon: Clock },
      { id: "channels", to: "/management/channels", labelKey: "nav.channels", icon: Radio },
      { id: "audit", to: "/management/audit", labelKey: "nav.audit", icon: ScrollText },
      { id: "settings", to: "/management/settings", labelKey: "nav.settings", icon: Settings },
    ],
  },
];

export interface LegacyRedirectRule {
  /** Stable id for tests/evidence; not rendered. */
  id: string;
  /** Matches the request pathname (no query string). */
  match: RegExp;
  /** Canonical center this legacy path now belongs to. */
  center: ManagementCenterId;
  /** Canonical tab this legacy path now belongs to. */
  tab: string;
  /** Query keys forwarded from the legacy URL, if present. */
  allowedParams: readonly string[];
}

// Route Migration Matrix — docs/04/.../archive/ROUTE_MIGRATION_MATRIX.md
// "Primary Pages" table plus the Promotion Allocation tab rows. Detity-page
// aliases with an :id (capital pool / rebalance / ranking formula detail)
// are intentionally left alone here — MGMT-PERF-IA-006 restores their own
// canonical detail destination instead of a broad tab redirect.
export const LEGACY_REDIRECTS: readonly LegacyRedirectRule[] = [
  {
    id: "portfolio-book-to-performance-overview",
    match: /^\/management\/portfolio-book$/,
    center: "performance",
    tab: "overview",
    allowedParams: ["capital_pool_id", "pool", "persona", "period"],
  },
  {
    id: "performance-attribution-to-performance-attribution",
    match: /^\/management\/performance-attribution$/,
    center: "performance",
    tab: "attribution",
    allowedParams: ["dimension", "persona", "runtime", "strategy", "pool", "entity", "period"],
  },
  {
    id: "capital-to-performance-exposure",
    match: /^\/management\/capital$/,
    center: "performance",
    tab: "exposure",
    allowedParams: ["pool", "persona", "runtime", "period"],
  },
  {
    id: "persona-league-to-rankings-rolling",
    match: /^\/management\/persona-league$/,
    center: "rankings",
    tab: "rolling",
    allowedParams: ["persona", "period", "eligibility", "sort"],
  },
  {
    id: "quarterly-ranking-to-rankings-quarterly",
    match: /^\/management\/quarterly-ranking$/,
    center: "rankings",
    tab: "quarterly",
    allowedParams: ["persona", "quarter", "period", "snapshot"],
  },
  {
    id: "capital-pools-to-governance-capital",
    match: /^\/management\/capital-pools$/,
    center: "governance-decisions",
    tab: "capital",
    allowedParams: ["capital_id"],
  },
  {
    id: "rebalance-to-governance-capital",
    match: /^\/management\/rebalances?$/,
    center: "governance-decisions",
    tab: "capital",
    allowedParams: ["rebalance_id"],
  },
  {
    id: "ranking-to-governance-policy",
    match: /^\/management\/ranking$/,
    center: "governance-decisions",
    tab: "policy",
    allowedParams: ["formula_id"],
  },
  {
    id: "ranking-formulas-list-to-governance-policy",
    match: /^\/management\/ranking\/formulas$/,
    center: "governance-decisions",
    tab: "policy",
    allowedParams: ["formula_id"],
  },
  {
    id: "ranking-formulas-alias-to-governance-policy",
    match: /^\/management\/ranking-formulas$/,
    center: "governance-decisions",
    tab: "policy",
    allowedParams: ["formula_id"],
  },
  {
    id: "promotion-allocation-real-ranking-to-rankings-rolling",
    match: /^\/management\/promotion-allocation$/,
    center: "rankings",
    tab: "rolling",
    // handled specially in resolveLegacyRedirect: only applies when
    // ?tab=real-ranking|league|persona-league is present.
    allowedParams: ["persona", "period", "eligibility", "sort"],
  },
  {
    id: "promotion-allocation-paper-candidates-to-rankings-quarterly",
    match: /^\/management\/promotion-allocation$/,
    center: "rankings",
    tab: "quarterly",
    allowedParams: ["persona", "quarter", "period", "snapshot"],
  },
  {
    id: "promotion-allocation-quarterly-capital-to-governance-capital",
    match: /^\/management\/promotion-allocation$/,
    center: "governance-decisions",
    tab: "capital",
    allowedParams: ["capital_id", "rebalance_id"],
  },
  {
    id: "promotion-allocation-formula-policy-to-governance-policy",
    match: /^\/management\/promotion-allocation$/,
    center: "governance-decisions",
    tab: "policy",
    allowedParams: ["formula_id"],
  },
];

const PROMOTION_ALLOCATION_TAB_TO_RULE: Record<string, string> = {
  "real-ranking": "promotion-allocation-real-ranking-to-rankings-rolling",
  league: "promotion-allocation-real-ranking-to-rankings-rolling",
  "persona-league": "promotion-allocation-real-ranking-to-rankings-rolling",
  "paper-candidates": "promotion-allocation-paper-candidates-to-rankings-quarterly",
  "quarterly-capital": "promotion-allocation-quarterly-capital-to-governance-capital",
  rebalance: "promotion-allocation-quarterly-capital-to-governance-capital",
  "quarterly-rebalance": "promotion-allocation-quarterly-capital-to-governance-capital",
  "formula-policy": "promotion-allocation-formula-policy-to-governance-policy",
  "ranking-formulas": "promotion-allocation-formula-policy-to-governance-policy",
  formula: "promotion-allocation-formula-policy-to-governance-policy",
};

/** Resolve a legacy pathname+search to its canonical destination, or `null`
 *  if the path is not a known legacy alias. Only forwards allow-listed
 *  context keys — anything else present on the legacy URL is dropped. */
export function resolveLegacyRedirect(
  pathname: string,
  search: string,
): { pathname: string; search: string } | null {
  const incoming = new URLSearchParams(search);

  let rule: LegacyRedirectRule | undefined;
  if (pathname === "/management/promotion-allocation") {
    const tab = incoming.get("tab");
    const ruleId = PROMOTION_ALLOCATION_TAB_TO_RULE[tab ?? ""]
      ?? PROMOTION_ALLOCATION_TAB_TO_RULE["paper-candidates"];
    rule = LEGACY_REDIRECTS.find((r) => r.id === ruleId);
  } else {
    rule = LEGACY_REDIRECTS.find((r) => r.match.test(pathname));
  }
  if (!rule) return null;

  const out = new URLSearchParams();
  out.set("tab", rule.tab);
  for (const key of rule.allowedParams) {
    const value = incoming.get(key);
    if (value) out.set(key, value);
  }
  const center = CANONICAL_CENTERS[rule.center];
  return { pathname: center.path, search: `?${out.toString()}` };
}

/** True if `pathname` is itself a canonical center path — used to assert the
 *  redirect table cannot loop (a canonical destination is never also a
 *  legacy source). */
export function isCanonicalCenterPath(pathname: string): boolean {
  return Object.values(CANONICAL_CENTERS).some((c) => c.path === pathname);
}
