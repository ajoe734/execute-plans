// spec-conflict-G G08 — Single source of truth for nav / page-header / breadcrumb
// labels. Every navigable route maps to ONE i18n key. SideNav, PageHeader,
// Breadcrumb and Command Palette all consume this registry instead of inlining
// strings.

export interface RouteLabel {
  /** absolute pathname (without query). Longest-prefix match wins. */
  path: string;
  /** i18n key (single source of truth). */
  i18nKey: string;
  /** optional subtitle i18n key for PageHeader. */
  subtitleKey?: string;
  /** breadcrumb parent path (must also be in the registry). */
  parent?: string;
}

// Order matters only for readability — lookup uses longest-prefix match.
export const ROUTE_LABELS: readonly RouteLabel[] = [
  // root
  { path: "/management", i18nKey: "app.management" },
  { path: "/agora", i18nKey: "app.agora" },

  // Oversight
  { path: "/management/cockpit", i18nKey: "nav.managementCockpit", parent: "/management" },
  { path: "/management/trade-journeys", i18nKey: "nav.tradeJourneys", parent: "/management" },
  { path: "/management/persona-fleet", i18nKey: "nav.personaFleet", parent: "/management" },
  { path: "/management/human-inbox", i18nKey: "nav.humanInbox", parent: "/management" },
  { path: "/management/trading-pulse", i18nKey: "nav.tradingPulse", parent: "/management" },
  { path: "/management/evolution-journal", i18nKey: "nav.evolutionJournal", parent: "/management" },
  { path: "/management/evidence", i18nKey: "nav.evidenceExplorer", parent: "/management" },
  { path: "/management/persona-intent", i18nKey: "nav.personaIntent", parent: "/management" },

  // MGMT-PERF-IA-001 canonical centers — the entries these three replace
  // (portfolio-book, promotion-allocation, performance-attribution,
  // persona-league, quarterly-ranking) are now redirect-only and kept below
  // for legacy lookups.
  { path: "/management/performance", i18nKey: "nav.performanceCenter", parent: "/management" },
  { path: "/management/rankings", i18nKey: "nav.rankingsCenter", parent: "/management" },
  { path: "/management/governance-decisions", i18nKey: "nav.governanceDecisions", parent: "/management" },

  // Performance & League (legacy — redirect-only, see managementRouteManifest.ts)
  { path: "/management/portfolio-book", i18nKey: "nav.portfolioBook", parent: "/management" },
  { path: "/management/promotion-allocation", i18nKey: "nav.promotionAllocation", parent: "/management" },
  { path: "/management/performance-attribution", i18nKey: "nav.performanceAttribution", parent: "/management" },

  // Live Readiness
  { path: "/management/readiness/ep5", i18nKey: "readiness.ep5Title", parent: "/management" },
  { path: "/management/readiness/broker-live", i18nKey: "nav.brokerLiveReadiness", parent: "/management" },
  { path: "/management/readiness/bff-ha", i18nKey: "nav.bffHaReadiness", parent: "/management" },
  { path: "/management/readiness/strict-publish", i18nKey: "nav.strictPublishAudit", parent: "/management" },

  // v5 closed-loop OS
  { path: "/management/control-room", i18nKey: "nav.controlRoom", subtitleKey: "v5.controlRoom.subtitle", parent: "/management" },
  { path: "/management/loops", i18nKey: "nav.loops", parent: "/management" },
  { path: "/management/loops/research", i18nKey: "nav.loopResearch", parent: "/management/loops" },
  { path: "/management/loops/execution", i18nKey: "nav.loopExecution", subtitleKey: "v5.loops.execution.subtitle", parent: "/management/loops" },
  { path: "/management/loops/optimization", i18nKey: "nav.loopOptimization", parent: "/management/loops" },
  { path: "/management/sentinel", i18nKey: "nav.sentinel", subtitleKey: "v5.sentinel.subtitle", parent: "/management" },
  { path: "/management/interventions", i18nKey: "nav.interventions", subtitleKey: "v5.interventions.subtitle", parent: "/management" },

  // core management
  { path: "/management/strategies", i18nKey: "nav.strategyRegistry", parent: "/management" },
  { path: "/management/personas", i18nKey: "nav.personaRegistry", parent: "/management" },
  { path: "/management/evolution", i18nKey: "nav.evolution", parent: "/management" },
  { path: "/management/alpha-factory", i18nKey: "nav.alphaFactory", parent: "/management" },

  // research / governance
  { path: "/management/experiments", i18nKey: "nav.experiments", parent: "/management" },
  { path: "/management/governance", i18nKey: "nav.governance", parent: "/management" },
  { path: "/management/governance/policies", i18nKey: "nav.routePolicies", parent: "/management/governance" },
  { path: "/management/governance/permissions", i18nKey: "nav.permissions", parent: "/management/governance" },
  { path: "/management/governance/memory", i18nKey: "nav.memoryGov", parent: "/management/governance" },
  { path: "/management/governance/consult", i18nKey: "nav.consultRules", parent: "/management/governance" },
  { path: "/management/knowledge", i18nKey: "nav.knowledge", parent: "/management" },
  { path: "/management/postmortems", i18nKey: "nav.postmortems", parent: "/management" },
  { path: "/management/lineage", i18nKey: "nav.lineage", parent: "/management" },
  { path: "/management/artifacts", i18nKey: "nav.artifacts", parent: "/management" },

  // operations
  { path: "/management/deployments", i18nKey: "nav.deployments", parent: "/management" },
  { path: "/management/runtimes", i18nKey: "nav.runtimes", parent: "/management" },
  { path: "/management/risk", i18nKey: "nav.riskCenter", parent: "/management" },
  { path: "/management/incidents", i18nKey: "nav.incidents", parent: "/management" },
  { path: "/management/jobs", i18nKey: "nav.jobs", parent: "/management" },
  { path: "/management/alerts", i18nKey: "nav.alerts", parent: "/management" },
  { path: "/management/approvals", i18nKey: "nav.approvals", parent: "/management" },

  // capabilities
  { path: "/management/tools", i18nKey: "nav.tools", parent: "/management" },
  { path: "/management/mcp", i18nKey: "nav.mcp", parent: "/management" },
  { path: "/management/skills", i18nKey: "nav.skills", parent: "/management" },
  { path: "/management/workflows", i18nKey: "nav.workflowTemplates", parent: "/management" },
  { path: "/management/hooks", i18nKey: "nav.hooks", parent: "/management" },
  { path: "/management/channels", i18nKey: "nav.channels", parent: "/management" },
  { path: "/management/studios/formula", i18nKey: "studios.formula", parent: "/management" },
  { path: "/management/studios/skill-sandbox", i18nKey: "studios.skill", parent: "/management" },

  // system
  { path: "/management/audit", i18nKey: "nav.audit", parent: "/management" },
  { path: "/management/settings", i18nKey: "nav.settings", parent: "/management" },
  { path: "/management/command-center", i18nKey: "nav.commandCenter", parent: "/management" },
  { path: "/management/overview", i18nKey: "nav.overview", parent: "/management" },

  // agora
  { path: "/agora/trading-room", i18nKey: "nav.tradingRoom", parent: "/agora" },
  { path: "/agora/strategy-workshop", i18nKey: "nav.strategyWorkshop", parent: "/agora" },
  { path: "/agora/strategy-performance", i18nKey: "nav.strategyPerformance", parent: "/agora" },
];

const sorted = [...ROUTE_LABELS].sort((a, b) => b.path.length - a.path.length);

/** Longest-prefix match for an arbitrary pathname. */
export function lookupRouteLabel(pathname: string): RouteLabel | undefined {
  const clean = pathname.split("?")[0];
  return sorted.find((r) => clean === r.path || clean.startsWith(r.path + "/"));
}

/** Build a parent → ... → leaf breadcrumb chain from the registry. */
export function buildBreadcrumb(pathname: string): RouteLabel[] {
  const chain: RouteLabel[] = [];
  let node = lookupRouteLabel(pathname);
  const guard = new Set<string>();
  while (node && !guard.has(node.path)) {
    chain.unshift(node);
    guard.add(node.path);
    node = node.parent ? lookupRouteLabel(node.parent) : undefined;
  }
  return chain;
}
