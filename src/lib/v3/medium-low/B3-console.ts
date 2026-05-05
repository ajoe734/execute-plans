// v3 Part 10 Batch B3 — Management Console page contracts.
// Resolves G34, G35, G36, G37, G38, G41, G42, G44, G45, G46, G47, G72.

// ───────── G34 — Command Center KPIs ─────────
export interface CommandCenterKpiSpec {
  id: string;
  formula: string;
  source: string;
}

export const COMMAND_CENTER_KPIS: readonly CommandCenterKpiSpec[] = [
  { id: "lifecycleBottleneckCount",    formula: "count(strategy where daysInCurrentState > stateSlaDays)", source: "Strategy Registry" },
  { id: "pendingApprovalCount",        formula: "count(review where status in [submitted, validator_running, in_review])", source: "Governance" },
  { id: "liveRiskWarningCount",        formula: "count(alert where targetEnvironment=live and status not closed)", source: "Risk Center" },
  { id: "runningJobCount",             formula: "count(job where status in [queued, running, retrying])", source: "Job System" },
  { id: "personaViolationCount",       formula: "count(policyViolation where status != closed)", source: "Persona Directorate" },
  { id: "capitalExposureUtilization",  formula: "allocatedCapital / totalCapital", source: "Capital Pool" },
  { id: "agoraIncomingCount",          formula: "count(handoff where status=submitted)", source: "Handoff Queue" },
  { id: "runtimeHealthScore",          formula: "percentage(runtime where status=healthy)", source: "Runtime Monitor" },
] as const;

// ───────── G35 — Strategies List sort/filter ─────────
export interface StrategyListFilter {
  lifecycleStatus?: string[];
  reviewStatus?: string[];
  deploymentStatus?: string[];
  riskLevel?: ("low" | "medium" | "high" | "critical")[];
  capitalPoolIds?: string[];
  ownerPersonaIds?: string[];
  hasOpenAlerts?: boolean;
  hasOpenReview?: boolean;
  paperLiveGapMin?: number;
  updatedWithinDays?: number;
}

export const STRATEGY_LIST_SORT_KEYS = [
  "name", "lifecycleStatus", "reviewStatus", "deploymentStatus",
  "riskLevel", "sharpe", "drawdown", "pnl30d", "updatedAt", "openAlerts",
] as const;
export type StrategyListSortKey = typeof STRATEGY_LIST_SORT_KEYS[number];

// ───────── G36 — Run Experiment input ─────────
export interface RunExperimentRequest {
  strategyId: string;
  experimentType: "backtest" | "oos" | "stress_test" | "parameter_sweep";
  specVersionId: string;
  datasetId: string;
  costModelId: string;
  startDate: string;
  endDate: string;
  parameterSetId?: string;
  scenarioIds?: string[];
  notes?: string;
}

// ───────── G37 / G38 — Risk / Review SoT ─────────
export const SOURCE_OF_TRUTH = {
  risk: "/management/risk",
  review: "/management/governance",
  incidents: "/management/incidents",
  // Anywhere else that displays risk/review must read these endpoints, not local state.
} as const;

// ───────── G41 — Skill sandbox I/O ─────────
export interface SkillSandboxRequest {
  skillId: string;
  skillVersion: string;
  fixtureId: string;
  timeoutMs: number;
  /** Sandbox env scope; production grants are not allowed here. */
  envScope: "research" | "paper";
}
export interface SkillSandboxResult {
  sandboxRunId: string;
  passed: boolean;
  durationMs: number;
  logsUrl: string;
  producedArtifactIds: string[];
  toolCalls: { mcpToolId: string; sideEffectLevel: "read" | "write" | "destructive"; status: "ok" | "error" }[];
}

// ───────── G42 — Lineage graph limits ─────────
export const LINEAGE_GRAPH_LIMITS = {
  maxNodes: 500,
  maxEdges: 1500,
  collapseAfterDepth: 4,
  /** Server-paginated when graph exceeds maxNodes. */
  serverPaginate: true,
  interactions: ["pan", "zoom", "expand_node", "collapse_subtree", "filter_by_kind"] as const,
} as const;

// ───────── G44 / G72 — SSE diagnostic + channel catalog ─────────
export type SseChannel =
  | "global.notifications"
  | "command_center.kpi"
  | "command_center.events"
  | "jobs.progress"
  | "alerts.live"
  | "incidents.timeline"
  | "deployment.events"
  | "review.updates"
  | "agora.signals"
  | "agora.session.messages";

export interface SseChannelSpec {
  channel: SseChannel;
  endpoint: string;
  retainCount: number;
  minIntervalMs: number;
}

export const SSE_CHANNELS: readonly SseChannelSpec[] = [
  { channel: "global.notifications",      endpoint: "/bff/sse/notifications",            retainCount: 100, minIntervalMs: 500 },
  { channel: "command_center.kpi",        endpoint: "/bff/sse/command-center/kpi",       retainCount: 50,  minIntervalMs: 1000 },
  { channel: "command_center.events",     endpoint: "/bff/sse/command-center/events",    retainCount: 300, minIntervalMs: 500 },
  { channel: "jobs.progress",             endpoint: "/bff/sse/jobs/:jobId/progress",     retainCount: 200, minIntervalMs: 1000 },
  { channel: "alerts.live",               endpoint: "/bff/sse/alerts",                   retainCount: 100, minIntervalMs: 1000 },
  { channel: "incidents.timeline",        endpoint: "/bff/sse/incidents/:id/timeline",   retainCount: 200, minIntervalMs: 1000 },
  { channel: "deployment.events",         endpoint: "/bff/sse/deployment/events",        retainCount: 100, minIntervalMs: 1000 },
  { channel: "review.updates",            endpoint: "/bff/sse/review/updates",           retainCount: 100, minIntervalMs: 1000 },
  { channel: "agora.signals",             endpoint: "/bff/sse/agora/signals",            retainCount: 200, minIntervalMs: 1000 },
  { channel: "agora.session.messages",    endpoint: "/bff/sse/agora/sessions/:id",       retainCount: 200, minIntervalMs: 250 },
] as const;

export interface SseDiagnosticDTO {
  channel: SseChannel;
  connectedAt: string;
  lastEventAt?: string;
  reconnectCount: number;
  lastError?: string;
}

// ───────── G45 / G46 / G47 — Empty / Loading / Error templates ─────────
export const TEMPLATE_KEYS = {
  empty: {
    list:    { titleKey: "empty.list.title",    bodyKey: "empty.list.body",    actionKey: "empty.list.action" },
    detail:  { titleKey: "empty.detail.title",  bodyKey: "empty.detail.body" },
    search:  { titleKey: "empty.search.title",  bodyKey: "empty.search.body" },
  },
  loading: {
    list:    { skeleton: "rows", rows: 8 },
    detail:  { skeleton: "card", cards: 3 },
    chart:   { skeleton: "chart" },
  },
  error: {
    bff:        { titleKey: "error.bff.title",        bodyKey: "error.bff.body",        actionKey: "error.bff.retry" },
    network:    { titleKey: "error.network.title",    bodyKey: "error.network.body",    actionKey: "error.network.retry" },
    permission: { titleKey: "error.permission.title", bodyKey: "error.permission.body" },
    notFound:   { titleKey: "error.notFound.title",   bodyKey: "error.notFound.body" },
  },
} as const;
