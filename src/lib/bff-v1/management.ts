// 2026-05-22 PM-Live — Management Oversight (PM-1..PM-11) live wiring.
//
// Wraps the 14 `mgmt*` paths defined in paths.ts with `withLiveOrMock`,
// matching the pattern used by lists.ts. Each helper accepts a `seedFn`
// returning the same view-model the pages already render, so Phase 1 mock
// behaviour is preserved byte-for-byte when `VITE_BFF_MODE=mock` or when
// live transport fails under `VITE_BFF_FALLBACK=auto`.
//
// Adapters are defensive: any shape mismatch falls back to the seed.

import { withLiveOrMock } from "./liveTransport";
import { paths } from "./paths";

import {
  composeCockpit, defaultCockpitSeed, type CockpitModel,
} from "@/lib/v5/management/cockpit";
import {
  defaultPulseRankings, type TradingPulseRankBlock,
} from "@/lib/v5/management/tradingRankings";
import type { HumanInboxItem, HumanInboxDetail } from "@/lib/v5/management/humanInbox";
import type { PersonaIntentTrace } from "@/lib/v5/management/personaIntent";
import type { ReadinessPageModel } from "@/lib/v5/management/readiness";
// PM-12 imports
import type {
  PortfolioSummary, CapitalPoolSummaryRow, HoldingRow, PortfolioHoldingFilters,
  PortfolioHoldingsMonitor, PortfolioHoldingMonitorRow, PortfolioIncident,
} from "@/lib/v5/management/portfolio";
import type { PersonaLeagueRow } from "@/lib/v5/management/personaLeague";
import type {
  QuarterlyRankingRow, QuarterlyRankingFormula,
} from "@/lib/v5/management/quarterlyRanking";
import type {
  PerformanceAttributionRow, AttributionDimension, AttributionPeriod,
} from "@/lib/v5/management/performanceAttribution";

// ---------- shape guards (extremely defensive) ----------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const unwrap = (raw: unknown): unknown =>
  isObject(raw) && "data" in raw ? (raw as { data: unknown }).data : raw;

const asArray = <T>(raw: unknown): T[] | null =>
  Array.isArray(raw) ? (raw as T[]) : null;

const asNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const asRecord = (value: unknown): Record<string, unknown> => isObject(value) ? value : {};
const stringRecord = (value: unknown): Record<string, string> => Object.fromEntries(
  Object.entries(asRecord(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
);

export function adaptPortfolioHoldingsMonitor(raw: unknown): PortfolioHoldingsMonitor | null {
  if (!isObject(raw)) return null;
  const data = asRecord(raw.data);
  if (!Array.isArray(data.items) || !isObject(data.summary)) return null;
  const summary = data.summary;
  const meta = asRecord(raw.meta);
  const surfaces = asRecord(meta.surfaces);
  const surface = asRecord(surfaces.portfolio_book_holdings);
  const issueList = (value: unknown) => Array.isArray(value) ? value.map((issue) => ({
    code: String(asRecord(issue).code ?? "UNKNOWN_SOURCE_ISSUE"),
    message: String(asRecord(issue).message ?? asRecord(issue).code ?? "Unknown source issue"),
  })) : [];
  const items: PortfolioHoldingMonitorRow[] = data.items.map((value) => {
    const row = asRecord(value);
    const scope = asRecord(row.capital_scope);
    return {
      holdingId: String(row.holding_id ?? "unknown-holding"), runtimeId: String(row.runtime_id ?? "") || undefined,
      personaId: String(row.persona_id ?? "") || undefined, capitalPoolId: String(row.capital_pool_id ?? "") || undefined,
      brokerId: String(row.broker_id ?? "") || undefined, symbol: String(row.symbol ?? "—"),
      quantity: asNumber(row.quantity), marketValue: asNumber(row.market_value), unrealizedPnl: asNumber(row.unrealized_pnl),
      deploymentStage: String(row.deployment_stage ?? "unknown"), sourceStatus: String(row.source_status ?? "unavailable"),
      telemetryStale: row.telemetry_stale === true, riskState: String(row.risk_state ?? "unknown"),
      sourceIssues: issueList(row.source_issues),
      capitalScope: { stage: String(scope.stage ?? row.deployment_stage ?? "unknown"), scopeKind: String(scope.scope_kind ?? "unclassified") as PortfolioHoldingMonitorRow["capitalScope"]["scopeKind"], scopeId: String(scope.scope_id ?? "") || undefined },
      links: stringRecord(row.links),
    };
  });
  const incidents: PortfolioIncident[] = (Array.isArray(meta.incidents) ? meta.incidents : []).map((value) => {
    const incident = asRecord(value); const identity = asRecord(incident.identity);
    return { id: String(incident.id ?? "unknown-incident"), holdingId: String(identity.portfolio_id ?? "") || undefined,
      severity: String(incident.severity ?? "unknown"), message: String(incident.message ?? "Source coverage incident"),
      riskState: String(incident.risk_state ?? "unknown"), sourceStatus: String(incident.source_status ?? "unavailable"),
      sourceIssues: issueList(incident.source_issues), links: stringRecord(incident.links) };
  });
  const coverage = asRecord(summary.source_coverage);
  return { items, incidents, surfaceStatus: String(surface.status ?? "unavailable"), surfaceMessage: String(surface.message ?? "") || undefined,
    coverage: { holdingCount: Number(summary.holding_count ?? items.length), sourceRowCount: Number(coverage.source_row_count ?? 0),
      runtimeCount: Number(coverage.runtime_count ?? 0), telemetryRuntimeCount: Number(coverage.telemetry_runtime_count ?? 0),
      staleRowCount: Number(coverage.stale_row_count ?? 0), missingBindingCount: Number(coverage.missing_binding_count ?? 0),
      degradedSourceCount: Number(coverage.degraded_source_count ?? 0), incidentCount: Number(summary.incident_count ?? incidents.length) } };
}

export type ManagementOodaStage = "Observe" | "Orient" | "Decide" | "Act";
export type ManagementAutonomyMode = "manual" | "supervised" | "autonomous";

export interface ManagementDataSourceStatus {
  state: string;
  summary?: string;
  providerStatuses: Record<string, string>;
  readbackRefs: string[];
  unavailableRefs: string[];
  researchDatasetRef?: string;
  researchDatasetManifestRef?: string;
  researchDatasetAsOf?: string;
  readbackCapturedAt?: string;
  readOnly: boolean;
  orderSideEffectsAllowed: boolean;
  capitalSideEffectsAllowed: boolean;
  liveIngestionEnabled: boolean;
}

export interface ManagementDataSource {
  providerKey: string;
  provider: string;
  market?: string;
  sourceClass?: string;
  status: string;
  evidenceRef?: string;
  orderPath?: string;
  orderCapableProvider: boolean;
  readOnly: boolean;
  orderSideEffectsAllowed: boolean;
  capitalSideEffectsAllowed: boolean;
  reason?: string;
}

export interface ManagementResearchStatus {
  stage: string;
  framework?: string;
  frameworks: string[];
  experimentId?: string;
  strategyId?: string;
  strategySpecId?: string;
  artifactId?: string;
  artifactState?: string;
  deploymentStage?: string;
  datasetRef?: string;
  registryAdmissionStatus?: string;
  pendingTaskIds: string[];
  canDeploy: boolean;
  summary?: string;
}

export interface ManagementResearchProject {
  projectId: string;
  title: string;
  stage: string;
  status?: string;
  frameworks: string[];
  datasetRef?: string;
  artifactId?: string;
  experimentId?: string;
  blockedByTaskIds: string[];
  canDeploy: boolean;
}

export interface ManagementPersonaFleetRow {
  personaId: string;
  personaName?: string;
  owner: string;
  ooda: ManagementOodaStage;
  autonomy: ManagementAutonomyMode;
  perfDelta: number;
  humanNeeded: boolean;
  lastMutation: string;
  state?: "draft" | "active" | "paused" | "deprecated" | "retired" | "archived" | string;
  tags?: string[];
  marketScope?: string[];
  currentWork?: string;
  dataSourceStatus?: ManagementDataSourceStatus;
  dataSources?: ManagementDataSource[];
  researchStatus?: ManagementResearchStatus;
  currentResearchProjects?: ManagementResearchProject[];
}

/** Wraps `body` so adapter errors degrade to seedFn output. */
function safeAdapt<T>(adapt: (raw: unknown) => T | null, seedFn: () => T) {
  return (raw: unknown): T => {
    try {
      const out = adapt(raw);
      return out ?? seedFn();
    } catch {
      return seedFn();
    }
  };
}

const asString = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const asFiniteNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const asBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(text)) return true;
  if (["0", "false", "no", "n"].includes(text)) return false;
  return fallback;
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => asString(item)).filter(Boolean)
    : [];

const asStringRecord = (value: unknown): Record<string, string> => {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, asString(item)] as const)
      .filter(([, item]) => item.length > 0),
  );
};

const normalizeOoda = (value: unknown): ManagementOodaStage => {
  const stage = asString(value).toLowerCase();
  if (stage.startsWith("orient")) return "Orient";
  if (stage.startsWith("decid")) return "Decide";
  if (stage.startsWith("act")) return "Act";
  return "Observe";
};

const normalizeAutonomy = (value: unknown): ManagementAutonomyMode => {
  const mode = asString(value).toLowerCase();
  if (mode === "autonomous") return "autonomous";
  if (mode === "manual") return "manual";
  return "supervised";
};

function adaptDataSourceStatus(value: unknown): ManagementDataSourceStatus | undefined {
  if (!isObject(value)) return undefined;
  return {
    state: asString(value.state, "not_declared"),
    summary: asString(value.summary),
    providerStatuses: asStringRecord(value.providerStatuses ?? value.provider_statuses),
    readbackRefs: asStringArray(value.readbackRefs ?? value.readback_refs),
    unavailableRefs: asStringArray(value.unavailableRefs ?? value.unavailable_refs),
    researchDatasetRef: asString(value.researchDatasetRef ?? value.research_dataset_ref),
    researchDatasetManifestRef: asString(value.researchDatasetManifestRef ?? value.research_dataset_manifest_ref),
    researchDatasetAsOf: asString(value.researchDatasetAsOf ?? value.research_dataset_as_of),
    readbackCapturedAt: asString(value.readbackCapturedAt ?? value.readback_captured_at),
    readOnly: asBoolean(value.readOnly ?? value.read_only, true),
    orderSideEffectsAllowed: asBoolean(value.orderSideEffectsAllowed ?? value.order_side_effects_allowed, false),
    capitalSideEffectsAllowed: asBoolean(value.capitalSideEffectsAllowed ?? value.capital_side_effects_allowed, false),
    liveIngestionEnabled: asBoolean(value.liveIngestionEnabled ?? value.live_ingestion_enabled, false),
  };
}

function adaptDataSource(value: unknown): ManagementDataSource | null {
  if (!isObject(value)) return null;
  const providerKey = asString(value.providerKey ?? value.provider_key);
  const provider = asString(value.provider, providerKey);
  if (!providerKey && !provider) return null;
  return {
    providerKey: providerKey || provider,
    provider,
    market: asString(value.market),
    sourceClass: asString(value.sourceClass ?? value.source_class),
    status: asString(value.status, "unknown"),
    evidenceRef: asString(value.evidenceRef ?? value.evidence_ref),
    orderPath: asString(value.orderPath ?? value.order_path),
    orderCapableProvider: asBoolean(value.orderCapableProvider ?? value.order_capable_provider, false),
    readOnly: asBoolean(value.readOnly ?? value.read_only, true),
    orderSideEffectsAllowed: asBoolean(value.orderSideEffectsAllowed ?? value.order_side_effects_allowed, false),
    capitalSideEffectsAllowed: asBoolean(value.capitalSideEffectsAllowed ?? value.capital_side_effects_allowed, false),
    reason: asString(value.reason),
  };
}

function adaptResearchStatus(value: unknown): ManagementResearchStatus | undefined {
  if (!isObject(value)) return undefined;
  const framework = asString(value.framework);
  const frameworks = asStringArray(value.frameworks);
  return {
    stage: asString(value.stage, "observe"),
    framework,
    frameworks: frameworks.length > 0 ? frameworks : framework ? [framework] : [],
    experimentId: asString(value.experimentId ?? value.experiment_id),
    strategyId: asString(value.strategyId ?? value.strategy_id),
    strategySpecId: asString(value.strategySpecId ?? value.strategy_spec_id),
    artifactId: asString(value.artifactId ?? value.artifact_id),
    artifactState: asString(value.artifactState ?? value.artifact_state),
    deploymentStage: asString(value.deploymentStage ?? value.deployment_stage),
    datasetRef: asString(value.datasetRef ?? value.dataset_ref),
    registryAdmissionStatus: asString(value.registryAdmissionStatus ?? value.registry_admission_status),
    pendingTaskIds: asStringArray(value.pendingTaskIds ?? value.pending_task_ids),
    canDeploy: asBoolean(value.canDeploy ?? value.can_deploy, false),
    summary: asString(value.summary),
  };
}

function adaptResearchProject(value: unknown): ManagementResearchProject | null {
  if (!isObject(value)) return null;
  const projectId = asString(value.projectId ?? value.project_id);
  const title = asString(value.title, projectId);
  if (!projectId && !title) return null;
  return {
    projectId: projectId || title,
    title,
    stage: asString(value.stage, "observe"),
    status: asString(value.status),
    frameworks: asStringArray(value.frameworks),
    datasetRef: asString(value.datasetRef ?? value.dataset_ref),
    artifactId: asString(value.artifactId ?? value.artifact_id),
    experimentId: asString(value.experimentId ?? value.experiment_id),
    blockedByTaskIds: asStringArray(value.blockedByTaskIds ?? value.blocked_by_task_ids),
    canDeploy: asBoolean(value.canDeploy ?? value.can_deploy, false),
  };
}

function firstArrayValue(...values: unknown[]): unknown[] | null {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

function adaptPersonaFleetRow(value: unknown): ManagementPersonaFleetRow | null {
  if (!isObject(value)) return null;
  const metrics = isObject(value.metrics) ? value.metrics : {};
  const personaId = asString(value.personaId ?? value.persona_id ?? value.id);
  if (!personaId) return null;

  const explicitDelta = value.perfDelta ?? value.perf_delta;
  const trainingImprovement = metrics.training_improvement_pct ?? metrics.trainingImprovementPct;
  const perfDelta = Number.isFinite(Number(explicitDelta))
    ? asFiniteNumber(explicitDelta)
    : asFiniteNumber(trainingImprovement) / 100;

  const recommendation = asString(value.recommendation).toLowerCase();
  const governanceRequired = asBoolean(value.governanceRequired ?? value.governance_required, false);
  const humanNeeded = asBoolean(
    value.humanNeeded ?? value.human_needed,
    governanceRequired && !["", "none", "no_change"].includes(recommendation),
  );

  const updated = asString(value.lastMutation ?? value.last_mutation ?? value.updatedAt ?? value.updated_at, "unknown");
  const dataSources = firstArrayValue(value.dataSources, value.data_sources)
    ?.map(adaptDataSource)
    .filter((source): source is ManagementDataSource => source !== null);
  const currentResearchProjects = firstArrayValue(value.currentResearchProjects, value.current_research_projects)
    ?.map(adaptResearchProject)
    .filter((project): project is ManagementResearchProject => project !== null);

  return {
    personaId,
    personaName: asString(value.personaName ?? value.persona_name ?? value.name, personaId),
    owner: asString(value.owner ?? value.owner_id ?? value.capitalPoolId ?? value.capital_pool_id, "pathreon-management"),
    ooda: normalizeOoda(value.ooda ?? value.oodaStage ?? value.ooda_stage),
    autonomy: normalizeAutonomy(value.autonomy),
    perfDelta: Number.isFinite(perfDelta) ? perfDelta : 0,
    humanNeeded,
    lastMutation: updated.length >= 10 ? updated.slice(0, 10) : updated,
    state: asString(value.state ?? value.lifecycleState ?? value.lifecycle_state ?? value.status),
    tags: asStringArray(value.tags),
    marketScope: asStringArray(value.marketScope ?? value.market_scope),
    currentWork: asString(value.currentWork ?? value.current_work),
    dataSourceStatus: adaptDataSourceStatus(value.dataSourceStatus ?? value.data_source_status),
    dataSources,
    researchStatus: adaptResearchStatus(value.researchStatus ?? value.research_status),
    currentResearchProjects,
  };
}

export function adaptManagementPersonaFleet(raw: unknown): ManagementPersonaFleetRow[] | null {
  const data = unwrap(raw);
  const nested = isObject(data) ? unwrap(data) : data;
  const arr = firstArrayValue(
    nested,
    isObject(nested) ? nested.items : undefined,
    isObject(nested) ? nested.persona_fleet : undefined,
    isObject(nested) ? nested.personaFleet : undefined,
    isObject(data) ? data.items : undefined,
    isObject(data) ? data.persona_fleet : undefined,
    isObject(data) ? data.personaFleet : undefined,
  );
  if (!arr) return null;
  const rows = arr.map(adaptPersonaFleetRow).filter((row): row is ManagementPersonaFleetRow => row !== null);
  return rows.length > 0 ? rows : null;
}

// ---------- PM-3 Cockpit ----------

export type CockpitSeedFn = () => CockpitModel;
const defaultCockpit = (): CockpitModel => composeCockpit(defaultCockpitSeed());

function adaptCockpit(raw: unknown): CockpitModel | null {
  const data = unwrap(raw);
  if (!isObject(data)) return null;
  if (!isObject(data.strip) || !isObject(data.loopFlow) || !isObject(data.matrix)) {
    return null;
  }
  // Live BFF is expected to already match CockpitModel shape; trust + cast.
  return data as unknown as CockpitModel;
}

// ---------- PM-6 Human Inbox ----------

export type InboxListSeedFn = () => HumanInboxItem[];
export type InboxItemSeedFn = () => HumanInboxDetail;

function adaptInboxList(raw: unknown): HumanInboxItem[] | null {
  const data = unwrap(raw);
  const arr =
    asArray<Record<string, unknown>>(data) ??
    (isObject(data) ? asArray<Record<string, unknown>>(data.items) : null);
  if (!arr) return null;
  return arr.map((it) => {
    // Mock/older items already match the view-model → pass through.
    if (typeof it.kind === "string" && typeof it.detailHref === "string") {
      return it as unknown as HumanInboxItem;
    }
    // Live BFF item: inboxType / route / summary / target, no consequence triplet.
    const detailHref = String(it.route ?? it.bff_detail_path ?? "");
    const kind = String(it.kind ?? it.inboxType ?? it.source_type ?? "approval");
    const actionState = String(it.action_state ?? it.status ?? "");
    return {
      id: String(it.id ?? it.inbox_id ?? ""),
      kind: kind as HumanInboxItem["kind"],
      title: String(it.title ?? it.summary ?? it.id ?? ""),
      summary: typeof it.summary === "string" ? it.summary : undefined,
      requiredRole: String(it.requiredRole ?? it.required_role ?? ""),
      consequenceIfApproved: String(it.consequenceIfApproved ?? ""),
      consequenceIfRejected: String(it.consequenceIfRejected ?? ""),
      consequenceIfIgnored: String(it.consequenceIfIgnored ?? ""),
      canDecide: typeof it.canDecide === "boolean" ? it.canDecide : true,
      canProceed:
        typeof it.canProceed === "boolean" ? it.canProceed : actionState !== "pending" && actionState !== "proposed",
      detailHref,
      links: (it.links as HumanInboxItem["links"]) ?? undefined,
    } as unknown as HumanInboxItem;
  });
}
function adaptInboxItem(raw: unknown): HumanInboxDetail | null {
  const data = unwrap(raw);
  return isObject(data) ? (data as unknown as HumanInboxDetail) : null;
}

// ---------- PM-4 Trading Pulse ----------

// Pull a numeric metric off a live ranking item, tolerating camel/snake names
// and a few metric aliases the BFF uses (sharpe→sharpeRatio, execution→fillRate).
function rankingMetricValue(it: Record<string, unknown>, metric: string): number {
  const aliases: Record<string, string[]> = {
    pnl: ["pnl"],
    drawdown: ["drawdown", "maxDrawdown", "max_drawdown"],
    sharpe: ["sharpeRatio", "sharpe_ratio", "sharpe"],
    execution: ["fillRate", "fill_rate"],
    fill_rate: ["fillRate", "fill_rate"],
    slippage: ["avgSlippageBps", "avg_slippage_bps"],
  };
  const camel = metric.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
  const keys = aliases[metric] ?? [metric, camel];
  for (const k of keys) {
    const v = it[k];
    if (typeof v === "number") return v;
  }
  return 0;
}

function adaptRankings(raw: unknown): TradingPulseRankBlock[] | null {
  const data = unwrap(raw);
  const blocks =
    asArray<Record<string, unknown>>(data) ??
    (isObject(data)
      ? asArray<Record<string, unknown>>(
          data.rankingBlocks ?? data.ranking_blocks ?? data.rankings ?? data.blocks ?? data.items,
        )
      : null);
  if (!blocks) return null;
  return blocks.map((b) => {
    // Already FE-shaped (mock seed / older contract) → pass through untouched.
    if (Array.isArray((b as { rows?: unknown }).rows)) {
      return b as unknown as TradingPulseRankBlock;
    }
    // Live BFF shape: block.items[] with runtime fields → map to FE rows so the
    // card renders the entries instead of an empty "no data" state.
    const metric = String(b.metric ?? "");
    const rawItems = asArray<Record<string, unknown>>(b.items) ?? [];
    const rows = rawItems.map((it) => {
      const subjectId = String(
        it.runtimeBindingId ?? it.runtime_binding_id ?? it.runtimeId ?? it.runtime_id ?? it.subjectId ?? "",
      );
      return {
        subjectId,
        subjectLabel: String(it.runtimeId ?? it.runtime_id ?? it.subjectLabel ?? subjectId ?? "—"),
        metric: String(b.label ?? metric),
        metricValue: rankingMetricValue(it, metric),
        metricUnit: undefined,
        links: undefined,
      };
    });
    return {
      kind: String(b.blockId ?? b.block_id ?? b.kind ?? metric),
      label: String(b.label ?? metric),
      rows,
    } as unknown as TradingPulseRankBlock;
  });
}

// ---------- PM-7 Persona Fleet / PM-11 Evolution / PM-1 Evidence ----------
// All three are array-of-row view-models. Adapters share shape.

function adaptArrayPassthrough<T>(raw: unknown): T[] | null {
  const data = unwrap(raw);
  return asArray<T>(data) ??
         (isObject(data) ? asArray<T>(data.items) : null);
}

// ---------- Persona Intent ----------

function adaptIntent(raw: unknown): PersonaIntentTrace[] | null {
  return adaptArrayPassthrough<PersonaIntentTrace>(raw);
}

// ---------- Readiness ----------

function adaptReadiness(raw: unknown): ReadinessPageModel | null {
  const data = unwrap(raw);
  if (!isObject(data)) return null;
  if (!isObject(data.header) || !Array.isArray(data.checklist)) return null;
  return data as unknown as ReadinessPageModel;
}

// ---------- public mgmt façade ----------

export const mgmt = {
  cockpit: {
    get: (seedFn: CockpitSeedFn = defaultCockpit): Promise<CockpitModel> =>
      withLiveOrMock<CockpitModel>(
        { method: "GET", path: paths.mgmtCockpit() },
        async () => seedFn(),
        safeAdapt(adaptCockpit, seedFn),
      ),
  },

  humanInbox: {
    list: (seedFn: InboxListSeedFn): Promise<HumanInboxItem[]> =>
      withLiveOrMock<HumanInboxItem[]>(
        { method: "GET", path: paths.mgmtHumanInbox() },
        async () => seedFn(),
        safeAdapt(adaptInboxList, seedFn),
      ),
    get: (id: string, seedFn: InboxItemSeedFn): Promise<HumanInboxDetail> =>
      withLiveOrMock<HumanInboxDetail>(
        { method: "GET", path: paths.mgmtHumanInboxItem(id) },
        async () => seedFn(),
        safeAdapt(adaptInboxItem, seedFn),
      ),
  },

  tradingPulse: {
    rankings: (seedFn: () => TradingPulseRankBlock[] = defaultPulseRankings):
      Promise<TradingPulseRankBlock[]> =>
      withLiveOrMock<TradingPulseRankBlock[]>(
        { method: "GET", path: paths.mgmtTradingRankings() },
        async () => seedFn(),
        safeAdapt(adaptRankings, seedFn),
      ),
    /** PM-4 main pulse rows — passthrough array. */
    get: <T>(seedFn: () => T[]): Promise<T[]> =>
      withLiveOrMock<T[]>(
        { method: "GET", path: paths.mgmtTradingPulse() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<T>, seedFn),
      ),
  },

  personaFleet: {
    get: (
      seedFn: () => ManagementPersonaFleetRow[],
    ): Promise<ManagementPersonaFleetRow[]> =>
      withLiveOrMock<ManagementPersonaFleetRow[], unknown>(
        { method: "GET", path: paths.mgmtPersonaFleet() },
        async () => seedFn(),
        safeAdapt(adaptManagementPersonaFleet, seedFn),
      ),
  },

  evolutionJournal: {
    list: <T>(seedFn: () => T[]): Promise<T[]> =>
      withLiveOrMock<T[]>(
        { method: "GET", path: paths.mgmtEvolutionJournal() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<T>, seedFn),
      ),
  },

  evidence: {
    list: <T>(seedFn: () => T[]): Promise<T[]> =>
      withLiveOrMock<T[]>(
        { method: "GET", path: paths.mgmtEvidenceExplorer() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<T>, seedFn),
      ),
  },

  personaIntent: {
    list: (seedFn: () => PersonaIntentTrace[]): Promise<PersonaIntentTrace[]> =>
      withLiveOrMock<PersonaIntentTrace[]>(
        { method: "GET", path: paths.mgmtPersonaIntent() },
        async () => seedFn(),
        safeAdapt(adaptIntent, seedFn),
      ),
  },

  readiness: {
    ep5: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessEp5() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
    brokerLive: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessBrokerLive() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
    capitalBinding: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessCapitalBinding() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
    bffHa: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessBffHa() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
    strictPublish: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessStrictPublish() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
  },

  // ---------- PM-12 ----------

  portfolioBook: {
    summary: (seedFn: () => PortfolioSummary): Promise<PortfolioSummary> =>
      withLiveOrMock<PortfolioSummary>(
        { method: "GET", path: paths.mgmtPortfolioBook() },
        async () => seedFn(),
        safeAdapt((raw) => {
          const data = unwrap(raw);
          return isObject(data) && "totalNav" in data ? (data as unknown as PortfolioSummary) : null;
        }, seedFn),
      ),
    pools: (seedFn: () => CapitalPoolSummaryRow[]): Promise<CapitalPoolSummaryRow[]> =>
      withLiveOrMock<CapitalPoolSummaryRow[]>(
        { method: "GET", path: paths.mgmtPortfolioPools() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<CapitalPoolSummaryRow>, seedFn),
      ),
    holdings: (seedFn: () => HoldingRow[]): Promise<HoldingRow[]> =>
      withLiveOrMock<HoldingRow[]>(
        { method: "GET", path: paths.mgmtPortfolioHoldings() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<HoldingRow>, seedFn),
      ),
    monitor: (filters: PortfolioHoldingFilters, seedFn: () => PortfolioHoldingsMonitor): Promise<PortfolioHoldingsMonitor> =>
      withLiveOrMock<PortfolioHoldingsMonitor>(
        { method: "GET", path: paths.mgmtPortfolioHoldings({ deployment_stage: filters.deploymentStage, broker_id: filters.brokerId, runtime_id: filters.runtimeId, source_status: filters.sourceStatus, stale_telemetry: filters.staleTelemetry, risk_state: filters.riskState }) },
        async () => seedFn(), safeAdapt(adaptPortfolioHoldingsMonitor, seedFn),
      ),
  },

  personaLeague: {
    list: (seedFn: () => PersonaLeagueRow[]): Promise<PersonaLeagueRow[]> =>
      withLiveOrMock<PersonaLeagueRow[]>(
        { method: "GET", path: paths.mgmtPersonaLeague() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<PersonaLeagueRow>, seedFn),
      ),
    rankings: (seedFn: () => PersonaLeagueRow[]): Promise<PersonaLeagueRow[]> =>
      withLiveOrMock<PersonaLeagueRow[]>(
        { method: "GET", path: paths.mgmtPersonaLeagueRankings() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<PersonaLeagueRow>, seedFn),
      ),
    tiers: <T>(seedFn: () => T): Promise<T> =>
      withLiveOrMock<T>(
        { method: "GET", path: paths.mgmtPersonaLeagueTiers() },
        async () => seedFn(),
        safeAdapt((raw) => {
          const data = unwrap(raw);
          return isObject(data) ? (data as unknown as T) : null;
        }, seedFn),
      ),
  },

  quarterlyRanking: {
    list: (quarter: string | undefined, seedFn: () => QuarterlyRankingRow[]): Promise<QuarterlyRankingRow[]> =>
      withLiveOrMock<QuarterlyRankingRow[]>(
        { method: "GET", path: paths.mgmtQuarterlyRanking(quarter) },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<QuarterlyRankingRow>, seedFn),
      ),
    formula: (seedFn: () => QuarterlyRankingFormula): Promise<QuarterlyRankingFormula> =>
      withLiveOrMock<QuarterlyRankingFormula>(
        { method: "GET", path: paths.mgmtQuarterlyRankingFormula() },
        async () => seedFn(),
        safeAdapt((raw) => {
          const data = unwrap(raw);
          return isObject(data) && "weights" in data
            ? (data as unknown as QuarterlyRankingFormula) : null;
        }, seedFn),
      ),
    recommendations: (
      quarter: string | undefined,
      seedFn: () => QuarterlyRankingRow[],
    ): Promise<QuarterlyRankingRow[]> =>
      withLiveOrMock<QuarterlyRankingRow[]>(
        { method: "GET", path: paths.mgmtQuarterlyRankingRecommendations(quarter) },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<QuarterlyRankingRow>, seedFn),
      ),
  },

  performanceAttribution: {
    list: (
      dimension: AttributionDimension | undefined,
      period: AttributionPeriod | undefined,
      seedFn: () => PerformanceAttributionRow[],
    ): Promise<PerformanceAttributionRow[]> =>
      withLiveOrMock<PerformanceAttributionRow[]>(
        { method: "GET", path: paths.mgmtPerformanceAttribution(dimension, period) },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<PerformanceAttributionRow>, seedFn),
      ),
  },
};

export type Mgmt = typeof mgmt;
