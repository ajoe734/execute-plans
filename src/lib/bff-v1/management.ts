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
import {
  HUMAN_INBOX_KINDS,
  type HumanInboxDecisionRecord,
  type HumanInboxDetail,
  type HumanInboxItem,
  type HumanInboxKind,
} from "@/lib/v5/management/humanInbox";
import type { ManagementLinkSet } from "@/lib/v5/management/links";
import type { PersonaIntentTrace } from "@/lib/v5/management/personaIntent";
import type { ReadinessPageModel } from "@/lib/v5/management/readiness";
// PM-12 imports
import type {
  PortfolioSummary, CapitalPoolSummaryRow, HoldingRow,
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

export interface ManagementTradingPulseSurface {
  status: string;
  source?: string;
  message?: string;
  staleness?: unknown;
  degradation?: unknown;
  [key: string]: unknown;
}

export interface ManagementTradingPulseSummary {
  runtimeCount: number;
  telemetryCoverageCount: number;
  baselineComparisonCount: number;
  baselineBreachedCount: number;
  baselineWatchCount: number;
  totalPnl: number | null;
  worstDrawdown: number | null;
  averageFillRate: number | null;
  worstSlippageBps: number | null;
  totalTrades: number;
  byStatus: Record<string, number>;
  byStage: Record<string, number>;
  byBaselineStatus: Record<string, number>;
  [key: string]: unknown;
}

export interface ManagementTradingPulseCard {
  cardId: string;
  card_id?: string;
  label: string;
  value: number | string | null;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ManagementTradingPulseBaselineComparison {
  runtimeId: string;
  runtime_id?: string;
  runtimeBindingId?: string;
  runtime_binding_id?: string;
  deploymentStage?: string;
  deployment_stage?: string;
  status: string;
  metricCount: number;
  breachedMetricCount: number;
  watchMetricCount: number;
  paperLiveDrift?: Record<string, unknown>;
  paper_live_drift?: Record<string, unknown>;
  thresholdEvaluation?: Record<string, unknown>;
  threshold_evaluation?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ManagementTradingPulseRuntimeRow {
  runtimeId: string;
  runtime_id?: string;
  runtimeBindingId?: string;
  runtime_binding_id?: string;
  deploymentStage?: string;
  deployment_stage?: string;
  status?: string;
  metrics: Record<string, unknown>;
  telemetrySummary?: Record<string, unknown>;
  telemetry_summary?: Record<string, unknown>;
  baselineComparison?: ManagementTradingPulseBaselineComparison | null;
  baseline_comparison?: ManagementTradingPulseBaselineComparison | null;
  rowHealth?: Record<string, unknown>;
  row_health?: Record<string, unknown>;
  lastUpdatedAt?: string;
  last_updated_at?: string;
  [key: string]: unknown;
}

export interface ManagementTradingPulseMeta {
  snapshotAt?: string;
  snapshot_at?: string;
  surfaces: Record<string, ManagementTradingPulseSurface>;
  [key: string]: unknown;
}

export interface ManagementTradingPulseModel {
  id?: string;
  summary: ManagementTradingPulseSummary;
  cards: ManagementTradingPulseCard[];
  rankings: unknown[];
  runtimeRows: ManagementTradingPulseRuntimeRow[];
  runtime_rows?: ManagementTradingPulseRuntimeRow[];
  baselineComparisons: ManagementTradingPulseBaselineComparison[];
  baseline_comparisons?: ManagementTradingPulseBaselineComparison[];
  meta: ManagementTradingPulseMeta;
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

const asNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const asCountRecord = (value: unknown): Record<string, number> => {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, asFiniteNumber(item, 0)] as const),
  );
};

const firstArray = <T>(...values: unknown[]): T[] => {
  for (const value of values) {
    if (Array.isArray(value)) return value as T[];
  }
  return [];
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

function adaptManagementPersonaFleetLiveOnly(raw: unknown): ManagementPersonaFleetRow[] {
  return adaptManagementPersonaFleet(raw) ?? [];
}

async function personaFleetDemoFallbackDisabled(): Promise<ManagementPersonaFleetRow[]> {
  throw new Error("Persona Fleet requires live BFF data; demo fallback is disabled.");
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

const asOptionalString = (raw: unknown): string | undefined => {
  const value = asString(raw);
  return value ? value : undefined;
};

const asInboxStringList = (raw: unknown): string[] => {
  const arr = asArray<unknown>(raw);
  if (!arr) return [];
  return arr
    .map((it) => {
      if (typeof it === "string") return it;
      if (isObject(it)) return asString(it.ref ?? it.evidence_ref ?? it.ref_id ?? it.id ?? it.href ?? it.route);
      return asString(it);
    })
    .filter(Boolean);
};

const uniqueInboxStrings = (items: string[]): string[] =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

const nestedInboxEvidenceRefs = (item: Record<string, unknown>): string[] => {
  const refs: string[] = [
    ...asInboxStringList(item.evidenceRefs ?? item.evidence_refs),
  ];
  const researchContext = isObject(item.research_context) ? item.research_context : {};
  const researchProjects = asArray<Record<string, unknown>>(researchContext.current_research_projects) ?? [];
  for (const project of researchProjects) {
    refs.push(...asInboxStringList(project.evidenceRefs ?? project.evidence_refs));
  }

  const dataSourceStatus = isObject(researchContext.data_source_status)
    ? researchContext.data_source_status
    : {};
  refs.push(...asInboxStringList(dataSourceStatus.readbackRefs ?? dataSourceStatus.readback_refs));
  refs.push(...asInboxStringList(dataSourceStatus.unavailableRefs ?? dataSourceStatus.unavailable_refs));
  const manifestRef = asString(dataSourceStatus.researchDatasetManifestRef ?? dataSourceStatus.research_dataset_manifest_ref);
  if (manifestRef) refs.push(manifestRef);

  return uniqueInboxStrings(refs);
};

const normalizeInboxKind = (raw: unknown): HumanInboxKind => {
  const kind = asString(raw, "approval");
  const aliases: Record<string, HumanInboxKind> = {
    governance_review: "approval",
    model_artifact_approval: "approval",
    sentinel_finding: "sentinel",
  };
  if (kind in aliases) return aliases[kind];
  return HUMAN_INBOX_KINDS.includes(kind as HumanInboxKind) ? (kind as HumanInboxKind) : "approval";
};

const inboxDetailHref = (id: string): string =>
  `/management/human-inbox/${encodeURIComponent(id)}`;

const normalizeInboxManageHref = (raw: unknown): string | undefined => {
  const href = asString(raw);
  if (!href) return undefined;
  if (href.startsWith("/governance-review-queue")) {
    return `/management/governance${href.slice("/governance-review-queue".length)}`;
  }
  if (href.startsWith("/management/")) return href;
  return undefined;
};

const inboxLinks = (
  id: string,
  rawLinks: unknown,
  rawManageHref: unknown,
): ManagementLinkSet => {
  const existing = isObject(rawLinks) ? (rawLinks as Partial<ManagementLinkSet>) : {};
  const detailHref = inboxDetailHref(id);
  const manageHref =
    normalizeInboxManageHref(rawManageHref) ??
    normalizeInboxManageHref(existing.manageHref) ??
    detailHref;
  return {
    ...existing,
    manageHref,
    primaryObjectHref: normalizeInboxManageHref(existing.primaryObjectHref) ?? manageHref,
    recommendedActionHref: detailHref,
  };
};

const actionStateBlocksProceed = (actionState: string): boolean =>
  ["pending", "proposed", "blocked", "unable_to_continue", "cannot_proceed", "needs_human_approval"].includes(
    actionState,
  );

const allowedActionsCanDecide = (raw: unknown, fallback: boolean): boolean => {
  const allowed = isObject(raw) ? raw : null;
  if (!allowed) return fallback;
  if (typeof allowed.canDecide === "boolean") return allowed.canDecide;
  if (typeof allowed.can_decide === "boolean") return allowed.can_decide;
  if (typeof allowed.canApprove === "boolean" || typeof allowed.canReject === "boolean") {
    return Boolean(allowed.canApprove || allowed.canReject);
  }
  if (typeof allowed.can_approve === "boolean" || typeof allowed.can_reject === "boolean") {
    return Boolean(allowed.can_approve || allowed.can_reject);
  }
  return fallback;
};

const inferInboxRequiredRole = (it: Record<string, unknown>, kind: HumanInboxKind): string => {
  const researchContext = isObject(it.research_context) ? it.research_context : {};
  const recommendation = asString(researchContext.recommendation).toLowerCase();
  if (recommendation.includes("risk_owner")) return "risk-owner";
  if (recommendation.includes("operator")) return "operator";
  if (recommendation.includes("research")) return "research-owner";
  if (kind === "readiness_blocker") return "research-owner";
  return "";
};

const adaptInboxRecord = (it: Record<string, unknown>): HumanInboxItem | null => {
  const id = asString(it.id ?? it.inbox_id ?? it.inboxId);
  if (!id) return null;
  const kind = normalizeInboxKind(it.kind ?? it.inboxType ?? it.inbox_type ?? it.source_type ?? it.sourceType);
  const actionState = asString(it.action_state ?? it.actionState ?? it.status);
  const canDecide = asBoolean(
    it.canDecide ?? it.can_decide,
    allowedActionsCanDecide(it.allowedActions ?? it.allowed_actions, true),
  );
  const canProceed = asBoolean(
    it.canProceed ?? it.can_proceed,
    actionState ? !actionStateBlocksProceed(actionState) : true,
  );
  const blockingReasons = asInboxStringList(it.blockingReasons ?? it.blocking_reasons ?? it.reasons);
  const route = it.route ?? it.manageHref ?? (isObject(it.target) ? it.target.route : undefined);
  return {
    id,
    kind,
    title: asString(it.title ?? it.summary ?? id),
    summary: asOptionalString(it.summary),
    requiredRole: asString(it.requiredRole ?? it.required_role ?? it.submitted_by, inferInboxRequiredRole(it, kind)),
    consequenceIfApproved: asString(it.consequenceIfApproved ?? it.consequence_if_approved ?? ""),
    consequenceIfRejected: asString(it.consequenceIfRejected ?? it.consequence_if_rejected ?? ""),
    consequenceIfIgnored: asString(it.consequenceIfIgnored ?? it.consequence_if_ignored ?? ""),
    ttlSec: typeof it.ttlSec === "number" ? it.ttlSec : typeof it.ttl_sec === "number" ? it.ttl_sec : undefined,
    canDecide,
    canProceed,
    blockingReasons: blockingReasons.length ? blockingReasons : undefined,
    evidenceRefs: nestedInboxEvidenceRefs(it),
    detailHref: inboxDetailHref(id),
    links: inboxLinks(id, it.links, route),
  };
};

const normalizeDecisionType = (raw: unknown): HumanInboxDetail["decisionType"] => {
  const decisionType = asString(raw);
  return decisionType === "two_man" || decisionType === "quorum" ? decisionType : "single";
};

const adaptSignatures = (
  raw: unknown,
): HumanInboxDetail["signatures"] => {
  const arr = asArray<Record<string, unknown>>(raw);
  if (!arr) return [];
  return arr
    .map((it) => ({
      role: asString(it.role ?? it.required_role),
      signedBy: asOptionalString(it.signedBy ?? it.signed_by),
      signedAt: asOptionalString(it.signedAt ?? it.signed_at),
    }))
    .filter((it) => it.role);
};

const normalizeDecision = (raw: unknown): HumanInboxDecisionRecord["decision"] => {
  const decision = asString(raw);
  return decision === "approve" ||
    decision === "reject" ||
    decision === "request_more_evidence"
    ? decision
    : "defer";
};

const adaptDecisionHistory = (raw: unknown): HumanInboxDecisionRecord[] => {
  const arr = asArray<Record<string, unknown>>(raw);
  if (!arr) return [];
  return arr.map((it) => ({
    decidedAt: asString(it.decidedAt ?? it.decided_at ?? it.timestamp),
    decidedBy: asString(it.decidedBy ?? it.decided_by ?? it.actor),
    decision: normalizeDecision(it.decision),
    note: asOptionalString(it.note ?? it.reason),
  }));
};

export function adaptHumanInboxList(raw: unknown): HumanInboxItem[] | null {
  const data = unwrap(raw);
  const arr =
    asArray<Record<string, unknown>>(data) ??
    (isObject(data) ? asArray<Record<string, unknown>>(data.items) : null);
  if (!arr) return null;
  const items = arr.map(adaptInboxRecord).filter((it): it is HumanInboxItem => it !== null);
  return items.length ? items : null;
}
export function adaptHumanInboxDetail(raw: unknown): HumanInboxDetail | null {
  const data = unwrap(raw);
  const item = isObject(data) && isObject(data.item) ? data.item : data;
  if (!isObject(item)) return null;
  const base = adaptInboxRecord(item);
  if (!base) return null;
  return {
    ...base,
    decisionType: normalizeDecisionType(item.decisionType ?? item.decision_type),
    signatures: adaptSignatures(item.signatures),
    evidenceRefs: nestedInboxEvidenceRefs(item),
    decisionHistory: adaptDecisionHistory(item.decisionHistory ?? item.decision_history),
    auditRefs: asInboxStringList(item.auditRefs ?? item.audit_refs),
  };
}

// ---------- PM-4 Trading Pulse ----------

// Pull a numeric metric off a live ranking item, tolerating camel/snake names
// and a few metric aliases the BFF uses (sharpe→sharpeRatio, execution→fillRate).
function rankingMetricValue(it: Record<string, unknown>, metric: string): number | null {
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
  return null;
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

function normalizeTradingPulseSurface(value: unknown): ManagementTradingPulseSurface {
  if (typeof value === "string") {
    return { status: value, source: value };
  }
  const record = isObject(value) ? value : {};
  return {
    ...record,
    status: asString(record.status ?? record.state, "unavailable"),
    source: asString(record.source),
    message: asString(record.message),
  };
}

function normalizeTradingPulseMeta(value: unknown): ManagementTradingPulseMeta {
  const record = isObject(value) ? value : {};
  const snapshotAt = asString(record.snapshotAt ?? record.snapshot_at);
  const surfacesRecord = isObject(record.surfaces) ? record.surfaces : {};
  const surfaces = Object.fromEntries(
    Object.entries(surfacesRecord).map(([key, surface]) => [
      key,
      normalizeTradingPulseSurface(surface),
    ]),
  );
  return {
    ...record,
    snapshotAt,
    snapshot_at: snapshotAt,
    surfaces,
  };
}

function normalizeTradingPulseSummary(value: unknown): ManagementTradingPulseSummary {
  const record = isObject(value) ? value : {};
  return {
    ...record,
    runtimeCount: asFiniteNumber(record.runtimeCount ?? record.runtime_count, 0),
    telemetryCoverageCount: asFiniteNumber(record.telemetryCoverageCount ?? record.telemetry_coverage_count, 0),
    baselineComparisonCount: asFiniteNumber(record.baselineComparisonCount ?? record.baseline_comparison_count, 0),
    baselineBreachedCount: asFiniteNumber(record.baselineBreachedCount ?? record.baseline_breached_count, 0),
    baselineWatchCount: asFiniteNumber(record.baselineWatchCount ?? record.baseline_watch_count, 0),
    totalPnl: asNullableNumber(record.totalPnl ?? record.total_pnl),
    worstDrawdown: asNullableNumber(record.worstDrawdown ?? record.worst_drawdown),
    averageFillRate: asNullableNumber(record.averageFillRate ?? record.average_fill_rate),
    worstSlippageBps: asNullableNumber(record.worstSlippageBps ?? record.worst_slippage_bps),
    totalTrades: asFiniteNumber(record.totalTrades ?? record.total_trades, 0),
    byStatus: asCountRecord(record.byStatus ?? record.by_status),
    byStage: asCountRecord(record.byStage ?? record.by_stage),
    byBaselineStatus: asCountRecord(record.byBaselineStatus ?? record.by_baseline_status),
  };
}

function normalizeTradingPulseCard(value: unknown): ManagementTradingPulseCard | null {
  if (!isObject(value)) return null;
  const cardId = asString(value.cardId ?? value.card_id ?? value.id);
  const label = asString(value.label, cardId || "Metric");
  const details = isObject(value.details) ? value.details : {};
  return {
    ...value,
    cardId: cardId || label.toLowerCase().replace(/\s+/g, "-"),
    card_id: asString(value.card_id ?? cardId),
    label,
    value: typeof value.value === "string" ? value.value : asNullableNumber(value.value),
    details,
  };
}

function normalizeBaselineComparison(value: unknown): ManagementTradingPulseBaselineComparison | null {
  if (!isObject(value)) return null;
  const runtimeId = asString(value.runtimeId ?? value.runtime_id);
  const runtimeBindingId = asString(value.runtimeBindingId ?? value.runtime_binding_id);
  const deploymentStage = asString(value.deploymentStage ?? value.deployment_stage);
  const paperLiveDrift = isObject(value.paperLiveDrift ?? value.paper_live_drift)
    ? (value.paperLiveDrift ?? value.paper_live_drift) as Record<string, unknown>
    : undefined;
  const thresholdEvaluation = isObject(value.thresholdEvaluation ?? value.threshold_evaluation)
    ? (value.thresholdEvaluation ?? value.threshold_evaluation) as Record<string, unknown>
    : undefined;
  return {
    ...value,
    runtimeId,
    runtime_id: runtimeId,
    runtimeBindingId,
    runtime_binding_id: runtimeBindingId,
    deploymentStage,
    deployment_stage: deploymentStage,
    status: asString(value.status, "unavailable"),
    metricCount: asFiniteNumber(value.metricCount ?? value.metric_count, 0),
    breachedMetricCount: asFiniteNumber(value.breachedMetricCount ?? value.breached_metric_count, 0),
    watchMetricCount: asFiniteNumber(value.watchMetricCount ?? value.watch_metric_count, 0),
    paperLiveDrift,
    paper_live_drift: paperLiveDrift,
    thresholdEvaluation,
    threshold_evaluation: thresholdEvaluation,
  };
}

function normalizeRuntimeRow(value: unknown): ManagementTradingPulseRuntimeRow | null {
  if (!isObject(value)) return null;
  const runtimeId = asString(value.runtimeId ?? value.runtime_id);
  const runtimeBindingId = asString(value.runtimeBindingId ?? value.runtime_binding_id);
  const deploymentStage = asString(value.deploymentStage ?? value.deployment_stage);
  const telemetrySummary = isObject(value.telemetrySummary ?? value.telemetry_summary)
    ? (value.telemetrySummary ?? value.telemetry_summary) as Record<string, unknown>
    : undefined;
  const metrics = isObject(telemetrySummary?.metrics)
    ? telemetrySummary.metrics as Record<string, unknown>
    : (isObject(value.metrics) ? value.metrics : {});
  const baselineComparison = normalizeBaselineComparison(value.baselineComparison ?? value.baseline_comparison);
  const rowHealth = isObject(value.rowHealth ?? value.row_health)
    ? (value.rowHealth ?? value.row_health) as Record<string, unknown>
    : undefined;
  return {
    ...value,
    runtimeId,
    runtime_id: runtimeId,
    runtimeBindingId,
    runtime_binding_id: runtimeBindingId,
    deploymentStage,
    deployment_stage: deploymentStage,
    status: asString(value.status),
    metrics,
    telemetrySummary,
    telemetry_summary: telemetrySummary,
    baselineComparison,
    baseline_comparison: baselineComparison,
    rowHealth,
    row_health: rowHealth,
    lastUpdatedAt: asString(value.lastUpdatedAt ?? value.last_updated_at),
    last_updated_at: asString(value.last_updated_at ?? value.lastUpdatedAt),
  };
}

function legacyPulseRowsToModel(
  rows: Record<string, unknown>[],
  meta: ManagementTradingPulseMeta,
): ManagementTradingPulseModel {
  const cards = rows
    .map((row) => normalizeTradingPulseCard({
      cardId: asString(row.surface),
      label: asString(row.surface, "surface"),
      value: row.current,
      details: {
        baselineKind: row.baselineKind,
        baselineValue: row.baselineValue,
        rollbackReady: row.rollbackReady,
        killSwitchReady: row.killSwitchReady,
      },
    }))
    .filter((card): card is ManagementTradingPulseCard => card !== null);
  const nextMeta = {
    ...meta,
    surfaces: Object.keys(meta.surfaces).length > 0
      ? meta.surfaces
      : {
          management_trading_pulse: {
            status: "degraded",
            source: "local_snapshot",
            message: "Legacy Trading Pulse rows are a local snapshot, not the live BFF aggregate.",
          },
        },
  };
  return {
    id: "management-trading-pulse",
    summary: normalizeTradingPulseSummary({
      runtimeCount: rows.length,
      telemetryCoverageCount: 0,
      baselineComparisonCount: 0,
      byStatus: {},
      byStage: Object.fromEntries(rows.map((row) => [asString(row.surface, "unknown"), 1])),
    }),
    cards,
    rankings: [],
    runtimeRows: [],
    runtime_rows: [],
    baselineComparisons: [],
    baseline_comparisons: [],
    meta: nextMeta,
  };
}

export function defaultTradingPulseModel(): ManagementTradingPulseModel {
  return {
    id: "management-trading-pulse",
    summary: normalizeTradingPulseSummary({}),
    cards: [],
    rankings: [],
    runtimeRows: [],
    runtime_rows: [],
    baselineComparisons: [],
    baseline_comparisons: [],
    meta: {
      snapshotAt: "",
      snapshot_at: "",
      surfaces: {
        management_trading_pulse: {
          status: "unavailable",
          source: "local_snapshot",
          message: "Live Trading Pulse data is unavailable.",
        },
      },
    },
  };
}

export function adaptTradingPulseOverview(raw: unknown): ManagementTradingPulseModel | null {
  const root = isObject(raw) ? raw : null;
  const data = root && "data" in root ? root.data : raw;
  const dataRecord = isObject(data) ? data : null;
  const meta = normalizeTradingPulseMeta(root?.meta ?? dataRecord?.meta);

  const legacyRows = asArray<Record<string, unknown>>(data);
  if (legacyRows && legacyRows.some((row) => "surface" in row && "current" in row)) {
    return legacyPulseRowsToModel(legacyRows, meta);
  }
  if (!dataRecord) return null;

  const cards = firstArray<Record<string, unknown>>(
    dataRecord.cards,
    root?.cards,
    root?.items,
  )
    .map(normalizeTradingPulseCard)
    .filter((card): card is ManagementTradingPulseCard => card !== null);
  const runtimeRows = firstArray<Record<string, unknown>>(
    dataRecord.runtimeRows,
    dataRecord.runtime_rows,
    root?.runtimeRows,
    root?.runtime_rows,
  )
    .map(normalizeRuntimeRow)
    .filter((row): row is ManagementTradingPulseRuntimeRow => row !== null);
  const baselineComparisons = firstArray<Record<string, unknown>>(
    dataRecord.baselineComparisons,
    dataRecord.baseline_comparisons,
    root?.baselineComparisons,
    root?.baseline_comparisons,
  )
    .map(normalizeBaselineComparison)
    .filter((comparison): comparison is ManagementTradingPulseBaselineComparison => comparison !== null);
  const rankings = firstArray<unknown>(
    dataRecord.rankings,
    root?.rankings,
  );
  const summary = normalizeTradingPulseSummary(dataRecord.summary ?? root?.summary);

  if (
    cards.length === 0
    && runtimeRows.length === 0
    && baselineComparisons.length === 0
    && Object.keys(summary.byStatus).length === 0
    && summary.runtimeCount === 0
  ) {
    return null;
  }

  return {
    id: asString(dataRecord.id ?? root?.id),
    summary,
    cards,
    rankings,
    runtimeRows,
    runtime_rows: runtimeRows,
    baselineComparisons,
    baseline_comparisons: baselineComparisons,
    meta,
  };
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
        safeAdapt(adaptHumanInboxList, seedFn),
      ),
    get: (id: string, seedFn: InboxItemSeedFn): Promise<HumanInboxDetail> =>
      withLiveOrMock<HumanInboxDetail>(
        { method: "GET", path: paths.mgmtHumanInboxItem(id) },
        async () => seedFn(),
        safeAdapt(adaptHumanInboxDetail, seedFn),
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
    /** PM-4 main pulse overview — live BFF aggregate, not the legacy seed rows. */
    get: (
      seedFn: () => ManagementTradingPulseModel = defaultTradingPulseModel,
    ): Promise<ManagementTradingPulseModel> =>
      withLiveOrMock<ManagementTradingPulseModel>(
        { method: "GET", path: paths.mgmtTradingPulse() },
        async () => seedFn(),
        safeAdapt(adaptTradingPulseOverview, seedFn),
      ),
  },

  personaFleet: {
    get: (): Promise<ManagementPersonaFleetRow[]> =>
      withLiveOrMock<ManagementPersonaFleetRow[], unknown>(
        { method: "GET", path: paths.mgmtPersonaFleet() },
        personaFleetDemoFallbackDisabled,
        adaptManagementPersonaFleetLiveOnly,
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
