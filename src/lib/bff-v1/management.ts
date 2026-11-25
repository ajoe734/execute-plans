// 2026-05-22 PM-Live — Management Oversight (PM-1..PM-11) live wiring.
//
// Wraps the 14 `mgmt*` paths defined in paths.ts with `withLiveOrMock`,
// matching the pattern used by lists.ts. Each helper accepts a `seedFn`
// returning the same view-model the pages already render, so Phase 1 mock
// behaviour is preserved byte-for-byte when `VITE_BFF_MODE=mock` or when
// live transport fails under `VITE_BFF_FALLBACK=auto`.
//
// Adapters are defensive: any shape mismatch falls back to the seed.
//
// Exception: Human Inbox is strict-live/no-seed. It must never synthesize
// pending human work from FE mock rows.

import {
  isStrictLiveFallback,
} from "./liveTransport";
import { resolveMeetingActionEvidenceHref } from "./meetings";
import { strictLiveRead } from "./domainReads";
import { liveStatus } from "./liveStatus";
import { paths } from "./paths";
import { bffFetch, detectMode, type BffRequest } from "./client";
import { idempotencyKey as mintIdempotencyKey } from "./headers";
import { liveWriteGated } from "./writeGate";

import {
  composeCockpit, defaultCockpitSeed, type CockpitModel,
} from "@/lib/v5/management/cockpit";
import {
  defaultPulseRankings,
  LIVE_RANKING_BLOCKS,
  LIVE_RANKING_BLOCK_LABELS,
  type LiveRankingBlockKind,
  type ManagementTradingPulseLinks,
  type TradingPulseComparisonScope,
  type TradingPulseComparisonScopePeriod,
  type TradingPulseRankBlock,
  type TradingPulseRankRow,
} from "@/lib/v5/management/tradingRankings";
import { tradeJourneyHref } from "@/management/navigation/tradeJourneyLinks";
export {
  LIVE_RANKING_BLOCKS,
  LIVE_RANKING_BLOCK_LABELS,
  type LiveRankingBlockKind,
  type ManagementTradingPulseLinks,
  type TradingPulseComparisonScope,
  type TradingPulseComparisonScopePeriod,
  type TradingPulseRankBlock,
  type TradingPulseRankRow,
};
import {
  HUMAN_INBOX_KINDS,
  type HumanInboxAllowedActions,
  type HumanInboxDecisionRecord,
  type HumanInboxDetail,
  type HumanInboxItem,
  type HumanInboxKind,
  type HumanInboxList,
  type HumanInboxPageInfo,
} from "@/lib/v5/management/humanInbox";
import type { ManagementLinkSet } from "@/lib/v5/management/links";
import type { PersonaIntentTrace, PersonaIntentVisibility } from "@/lib/v5/management/personaIntent";
import { composeReadinessHeader, type ChecklistItemStatus, type ReadinessBlocker, type ReadinessChecklistItem, type ReadinessPacket, type ReadinessPageModel } from "@/lib/v5/management/readiness";
// PM-12 imports
import type {
  PortfolioSummary, CockpitCapitalSummary, CapitalPoolSummaryRow, HoldingRow,
  PortfolioHoldingFilters, PortfolioHoldingsMonitor, PortfolioHoldingMonitorRow,
  PortfolioIncident, PortfolioSourceIssue, PortfolioCapitalScopeKind,
} from "@/lib/v5/management/portfolio";
import type { PersonaLeagueRow, PersonaLeagueInventoryRow } from "@/lib/v5/management/personaLeague";
import { buildLinkSet, resolveManagementHref } from "@/lib/v5/management/links";
import type {
  QuarterlyRankingRow, QuarterlyRankingFormula,
} from "@/lib/v5/management/quarterlyRanking";
import type {
  PerformanceAttributionRow, AttributionDimension, AttributionPeriod,
  PerformanceAttributionResult,
} from "@/lib/v5/management/performanceAttribution";
import {
  adaptAttributionPeriodState,
  adaptAttributionSummary,
  isBffAcceptedAttributionDimension,
  normalizePerformanceAttributionRow,
} from "@/lib/v5/management/performanceAttribution";
import {
  EVOLUTION_QUALIFICATION_CRITERIA,
  type EvolutionQualificationCriterionRow,
  type EvolutionQualificationDecisionItem,
  type EvolutionQualificationReport,
  type EvolutionMemberBaseline,
  type EvolutionMemberBaselinesSurface,
} from "./dto";
import { isRawEvidenceSummaryText } from "@/lib/enumLabels";

export type ManagementDataConfidence = "formal" | "partial" | "fallback" | "degraded" | "unavailable";

export interface ManagementOperationsReadModel {
  identity: {
    personaId: string;
    personaLabel?: string;
    stage?: string;
    runtimeIds: string[];
    paperLedgerIds: string[];
    capitalPoolIds: string[];
    sleeveIds: string[];
    strategyIds: string[];
    artifactIds: string[];
    brokerIds: string[];
    period: string;
    asOf: string;
  };
  dataConfidence: ManagementDataConfidence;
  performance: {
    pnl?: number | null;
    pnlPct?: number | null;
    drawdownPct?: number | null;
    riskPct?: number | null;
    sharpe?: number | null;
    rank?: number | null;
    score?: number | null;
    performanceDelta?: number | null;
    sourceContribution?: number | null;
  };
  sources: Array<{
    sourceName: string;
    sourceStatus: string;
    sourceFreshness?: string;
    sourceRowCount?: number;
    sourceError?: string;
    coverageRatio?: number;
  }>;
  diagnostics: Array<{
    sourceName: string;
    code: string;
    message: string;
  }>;
}

export interface ManagementPortfolioExposureItem {
  id: string;
  capitalPoolId: string;
  name: string;
  status: string;
  currency?: string;
  riskBudget?: number;
  currentExposure?: number;
  availableBudget?: number;
  riskBudgetUtilization?: number;
  riskState: string;
  pnl?: number;
  runtimeIds: string[];
  runtimeCount: number;
  activeRuntimeCount: number;
  paperRuntimeCount: number;
  liveRuntimeCount: number;
  telemetryAvailable: boolean;
}

export interface PortfolioExposureFilters {
  capitalPoolId?: string;
  personaId?: string;
  runtimeId?: string;
  period?: string;
}

export interface ManagementPortfolioExposureMonitor {
  summary: {
    exposureCount: number;
    riskBudgetTotal?: number;
    currentExposureTotal?: number;
    availableBudgetTotal?: number;
    riskBudgetUtilization?: number;
    overBudgetCount: number;
    nearLimitCount: number;
    unknownExposureCount: number;
    telemetryRuntimeCount: number;
    totalPnl?: number;
    latestTelemetryAt?: string;
  };
  items: ManagementPortfolioExposureItem[];
  dataConfidence: ManagementDataConfidence;
  sourceIssues: string[];
}

// ---------- shape guards (extremely defensive) ----------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const unwrap = (raw: unknown): unknown =>
  isObject(raw) && "data" in raw ? (raw as { data: unknown }).data : raw;

const asArray = <T>(raw: unknown): T[] | null =>
  Array.isArray(raw) ? (raw as T[]) : null;

export type ManagementOodaStage = "Observe" | "Orient" | "Decide" | "Act" | "Learn";
export type ManagementAutonomyMode = "manual" | "supervised" | "autonomous";

export interface ManagementDataSourceStatus {
  state: string;
  summary?: string;
  entries?: ManagementDataSource[];
  providerStatuses: Record<string, string>;
  providerStatusCounts?: Record<string, number>;
  providerCount?: number;
  requiredSourceCount?: number;
  configuredSourceCount?: number;
  degradedProviderCount?: number;
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
  linkTargets?: ManagementPersonaFleetLinkTargets;
}

export interface ManagementResearchStatus {
  stage: string;
  framework?: string;
  frameworks: string[];
  frameworkCount?: number;
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
  currentProjectCount?: number;
  evidenceRefCount?: number;
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
  linkTargets?: ManagementPersonaFleetLinkTargets;
}

// PPL-ALLOC-006 — real-allocation policy evaluation (PPL-ALLOC-004 contract).
// The BFF owns the ranking/caps/exclusion math; the caller only assembles rows
// from data it already has and never recomputes target weights client-side.
export interface AllocationPolicyInputRow {
  personaId: string;
  stage?: string;
  tier?: string;
  capitalScope?: string;
  capitalPoolId?: string;
  capitalSleeveId?: string;
  currentWeight?: number;
  pnlScore?: number;
  sharpeScore?: number;
  drawdownControlScore?: number;
  executionQualityScore?: number;
  riskComplianceScore?: number;
  improvementScore?: number;
  humanInterventionPenalty?: number;
  hardPenalty?: number;
  hardRiskBreach?: boolean;
  humanReviewBlocked?: boolean;
  bindingMismatch?: boolean;
  evidenceRefs?: string[];
}

export interface AllocationPolicyLine {
  personaId: string;
  stage?: string;
  capitalScope: string;
  capitalPoolId?: string;
  capitalSleeveId?: string;
  currentWeight: number;
  targetWeight: number;
  delta: number;
  rankScore: number;
  capacityAdjustedScore: number;
  recommendation: string;
  capReasons: string[];
  exclusions: string[];
  evidenceRefs: string[];
  requiresHumanApproval: boolean;
}

export interface ManagementPersonaFleetRowAction {
  actionId: string;
  label?: string;
  href?: string;
  startupWizardVisible?: boolean;
}

export type ManagementPersonaFleetLinkTarget =
  | string
  | null
  | undefined
  | (Record<string, unknown> & {
    href?: string;
    routeHref?: string;
    route_href?: string;
    managementHref?: string;
    management_href?: string;
    manageHref?: string;
    manage_href?: string;
    detailHref?: string;
    detail_href?: string;
    available?: boolean;
    disabled?: boolean;
    unavailable?: boolean;
  });

export type ManagementPersonaFleetLinkTargets = Record<string, ManagementPersonaFleetLinkTarget>;

export interface ManagementPersonaFleetCapitalPool {
  id?: string;
  mode?: string;
  liveCapitalEnabled?: boolean;
}

export interface ManagementPersonaFleetPerformanceSummary {
  pnl?: number | null;
  sharpe?: number | null;
  maxDrawdown?: number | null;
  violationCount?: number | null;
  totalTrades?: number | null;
  source?: string;
  telemetryRuntimeCount?: number;
  latestTelemetryAt?: string;
}

export interface ManagementPersonaFleetPaperLedger {
  id?: string;
  mode?: string;
  isolated?: boolean;
  benchmarkBudget?: number;
}

export interface ManagementPersonaFleetRuntimeBinding {
  id?: string;
  runtimeId?: string;
  state?: string;
  deploymentStage?: string;
  capitalMode?: string;
  health?: string;
}

export interface ManagementPersonaFleetReview {
  id?: string;
  type?: string;
  status?: string;
  inboxId?: string;
  route?: string;
  requiresHumanGate?: boolean;
}

export interface ManagementPersonaFleetRank {
  leagueRank?: number;
  leagueScore?: number;
  basis?: string;
}

export interface ManagementPersonaFleetRow {
  personaId: string;
  personaName?: string;
  owner: string;
  ooda: ManagementOodaStage;
  autonomy: ManagementAutonomyMode;
  perfDelta: number;
  perf_delta?: number | null;
  hasTradingTelemetry?: boolean;
  has_trading_telemetry?: boolean;
  isMarketPersonaDefault?: boolean;
  is_market_persona_default?: boolean;
  seedRow?: boolean;
  seed_row?: boolean;
  humanNeeded: boolean;
  lastMutation: string;
  lastMutationLabel?: string;
  lastMutationAt?: string;
  lastMutationKind?: "formal_mutation" | "fleet_summary" | "unavailable" | string;
  mutationEntryId?: string | null;
  evolutionEntryId?: string | null;
  evolutionHref?: string | null;
  mutationConfidence?: "formal" | "fallback" | "unavailable" | string;
  mutationDiagnostics?: string[];
  state?: "draft" | "active" | "paused" | "deprecated" | "retired" | "archived" | string;
  tags?: string[];
  marketScope?: string[];
  currentWork?: string;
  dataSourceStatus?: ManagementDataSourceStatus;
  dataSources?: ManagementDataSource[];
  researchStatus?: ManagementResearchStatus;
  currentResearchProjects?: ManagementResearchProject[];
  runtimeId?: string;
  runtimeBindingId?: string;
  deploymentStage?: string;
  capitalMode?: string;
  paperLedgerId?: string;
  paperCapitalPoolId?: string;
  paperLedger?: ManagementPersonaFleetPaperLedger;
  capitalPoolId?: string;
  capitalPool?: ManagementPersonaFleetCapitalPool;
  /** PPL-ALLOC-006 — real-allocation capital binding (PPL-ALLOC-003 read model). */
  capitalScope?: "paper_ledger" | "canary_sleeve" | "live_sleeve" | "capital_pool" | "unbound" | string;
  capitalScopeId?: string;
  capitalSleeveId?: string;
  currentWeight?: number;
  targetWeight?: number;
  bindingState?: string;
  performanceSummary?: ManagementPersonaFleetPerformanceSummary;
  performance_summary?: {
    telemetry_runtime_count?: number;
  };
  runtimeBinding?: ManagementPersonaFleetRuntimeBinding;
  runtimeHealth?: Record<string, unknown>;
  requiredHumanReview?: string;
  reviewId?: string;
  reviewType?: string;
  reviewStatus?: string;
  review?: ManagementPersonaFleetReview;
  promotionReviewId?: string;
  humanGateId?: string;
  inboxId?: string;
  leagueRank?: number;
  leagueScore?: number;
  rank?: ManagementPersonaFleetRank;
  rowAction?: ManagementPersonaFleetRowAction;
  linkTargets?: ManagementPersonaFleetLinkTargets;
  /** Server-owned classification (PERSONA-FLEET-BFF-20261029); the FE never re-derives it. */
  personaPurpose?: ManagementPersonaFleetPurpose;
  dataScope?: ManagementPersonaFleetDataScope;
  classificationConfirmed?: boolean;
  classificationSource?: { purpose?: string; dataScope?: string };
  archived?: boolean;
  /** Controller-record cycle health from the BFF (BFF-PERSONA-CYCLE-VIEWS-20261112); never derived client-side. */
  personaCycleHealth?: ManagementPersonaCycleHealth;
}

export interface ManagementPersonaCycleHealth {
  status: string;
  lastPacketId?: string;
  stage?: string;
  failureReason?: string;
  updatedAt?: string;
  harnessVersion?: number;
  riskStatus?: string;
}

export type ManagementPersonaFleetPurpose = "trading" | "advisory_assistant" | "unknown";
export type ManagementPersonaFleetDataScope = "regular" | "test" | "unknown";
export type ManagementPersonaFleetArchived = "exclude" | "only" | "include";

export interface ManagementPersonaFleetQuery {
  q?: string;
  pageSize?: number;
  pageToken?: string;
  purpose?: ManagementPersonaFleetPurpose | "all";
  dataScope?: ManagementPersonaFleetDataScope | "all";
  archived?: ManagementPersonaFleetArchived;
}

export interface ManagementPersonaFleetPopulation {
  authorizedTotal?: number;
  activeTotal?: number;
  archivedTotal?: number;
  byPurpose: Record<string, number>;
  byDataScope: Record<string, number>;
}

export interface ManagementPersonaFleetPage {
  rows: ManagementPersonaFleetRow[];
  nextPageToken: string | null;
  /** Filtered authorized population (not the page); undefined when the server did not report it. */
  total?: number;
  /** Archived records matching the current authorized non-archive filters across all pages; undefined when not reported. */
  filteredArchivedTotal?: number;
  pageSize?: number;
  population: ManagementPersonaFleetPopulation;
  /** Client observation time of this response; the server does not stamp as-of on this list. */
  asOf?: string;
}

export interface ManagementTradingPulseSurface {
  status: string;
  source?: string;
  message?: string;
  staleness?: unknown;
  degradation?: unknown;
  [key: string]: unknown;
}

export interface ManagementTradingPulseMetricCoverageEntry {
  availableCount?: number;
  available_count?: number;
  missingCount?: number;
  missing_count?: number;
  runtimeCount?: number;
  runtime_count?: number;
  missingRuntimeIds?: string[];
  missing_runtime_ids?: string[];
  [key: string]: unknown;
}

export interface ManagementTradingPulseCoverage {
  runtimeCount?: number;
  runtime_count?: number;
  paperRuntimeCount?: number;
  paper_runtime_count?: number;
  telemetryCoverageCount?: number;
  telemetry_coverage_count?: number;
  monitoringCoverageCount?: number;
  monitoring_coverage_count?: number;
  baselineComparisonCount?: number;
  baseline_comparison_count?: number;
  baselineRequiredCount?: number;
  baseline_required_count?: number;
  rowHealthDegradedCount?: number;
  row_health_degraded_count?: number;
  retiredRuntimeCount?: number;
  retired_runtime_count?: number;
  rowHealthStatusCounts?: Record<string, number>;
  row_health_status_counts?: Record<string, number>;
  missingTelemetryRuntimeIds?: string[];
  missing_telemetry_runtime_ids?: string[];
  missingMonitoringRuntimeIds?: string[];
  missing_monitoring_runtime_ids?: string[];
  missingBaselineRuntimeIds?: string[];
  missing_baseline_runtime_ids?: string[];
  degradedRuntimeIds?: string[];
  degraded_runtime_ids?: string[];
  metricCoverage?: Record<string, ManagementTradingPulseMetricCoverageEntry>;
  metric_coverage?: Record<string, ManagementTradingPulseMetricCoverageEntry>;
  [key: string]: unknown;
}

export interface ManagementTradingPulseStageScopeCount {
  personaCount: number | null;
  persona_count: number | null;
  runtimeCount: number | null;
  runtime_count: number | null;
  [key: string]: unknown;
}

export type ManagementTradingPulseOperatorScopeStatus =
  | "verified"
  | "partial"
  | "unavailable"
  | "unverified"
  | string;

export interface ManagementTradingPulseOperatorScope {
  status: ManagementTradingPulseOperatorScopeStatus;
  tenantId: string | null;
  tenant_id: string | null;
  personaCount: number | null;
  persona_count: number | null;
  runtimeCount: number | null;
  runtime_count: number | null;
  verifiedRuntimeCount: number | null;
  verified_runtime_count: number | null;
  excludedProbeCount?: number | null;
  excluded_probe_count?: number | null;
  reason: string | null;
  byStage: Record<string, ManagementTradingPulseStageScopeCount>;
  by_stage: Record<string, ManagementTradingPulseStageScopeCount>;
  [key: string]: unknown;
}

export interface ManagementTradingPulsePnlGroup {
  stage: string | null;
  currency: string | null;
  periodStartAt: string | null;
  period_start_at: string | null;
  periodEndAt: string | null;
  period_end_at: string | null;
  periodLabel?: string | null;
  period_label?: string | null;
  asOf: string | null;
  as_of: string | null;
  pnlDefinition: string | null;
  pnl_definition: string | null;
  value: number | null;
  coveredPersonaCount: number | null;
  covered_persona_count: number | null;
  eligiblePersonaCount: number | null;
  eligible_persona_count: number | null;
  coveredRuntimeCount: number | null;
  covered_runtime_count: number | null;
  eligibleRuntimeCount: number | null;
  eligible_runtime_count: number | null;
  [key: string]: unknown;
}

export interface ManagementTradingPulseFillRateDetails {
  status: string | null;
  reason: string | null;
  basis: string | null;
  unit: string | null;
  numerator: number | null;
  denominator: number | null;
  window?: TradingPulseComparisonScopePeriod | string | null;
  sources?: unknown[];
  [key: string]: unknown;
}

export interface ManagementTradingPulseMetricPeriod {
  startAt: string | null;
  start_at: string | null;
  asOf: string | null;
  as_of: string | null;
  window: string | null;
  [key: string]: unknown;
}

export type ManagementTradingPulseSourceStatus =
  | "available"
  | "stale"
  | "unavailable"
  | "unverified"
  | string;

export interface ManagementTradingPulsePerformanceContext {
  ledgerFillCount: number | null;
  ledger_fill_count: number | null;
  pnlCurrency: string | null;
  pnl_currency: string | null;
  pnlPeriodStartAt: string | null;
  pnl_period_start_at: string | null;
  pnlAt: string | null;
  pnl_at: string | null;
  pnlDefinition: string | null;
  pnl_definition: string | null;
  fillRateDetails: ManagementTradingPulseFillRateDetails | null;
  fill_rate_details: ManagementTradingPulseFillRateDetails | null;
  fillRateBasis: string | null;
  fill_rate_basis: string | null;
  sharpeRatioStatus: string | null;
  sharpe_ratio_status: string | null;
  sharpeRatioReason: string | null;
  sharpe_ratio_reason: string | null;
  staleness: Record<string, unknown> | null;
  metricReasons: Record<string, string | null>;
  metric_reasons: Record<string, string | null>;
  metricUnits: Record<string, string | null>;
  metric_units: Record<string, string | null>;
  metricPeriods: Record<string, ManagementTradingPulseMetricPeriod>;
  metric_periods: Record<string, ManagementTradingPulseMetricPeriod>;
  latestReportAt: string | null;
  latest_report_at: string | null;
  lastFillAt: string | null;
  last_fill_at: string | null;
  snapshotAt: string | null;
  snapshot_at: string | null;
  sourceStatus: ManagementTradingPulseSourceStatus;
  source_status: ManagementTradingPulseSourceStatus;
  [key: string]: unknown;
}

export type ManagementTradingPulseOutcomeStatus =
  | "available"
  | "not_observed"
  | "unavailable"
  | string;

export interface ManagementTradingPulseLatestOutcome {
  status: ManagementTradingPulseOutcomeStatus;
  occurredAt: string | null;
  occurred_at: string | null;
  reasonCode: string | null;
  reason_code: string | null;
  submittedToBroker: boolean | null;
  submitted_to_broker: boolean | null;
  requestedQuantity: number | null;
  requested_quantity: number | null;
  filledQuantity: number | null;
  filled_quantity: number | null;
  required: number | null;
  available: number | null;
  currency: string | null;
  journeyId: string | null;
  journey_id: string | null;
  sourceEventId: string | null;
  source_event_id: string | null;
  focusStage: string | null;
  focus_stage: string | null;
  decisionId: string | null;
  decision_id: string | null;
  orderId: string | null;
  order_id: string | null;
  brokerOrderId: string | null;
  broker_order_id: string | null;
  side: string | null;
  symbol: string | null;
  journeyHref: string | null;
  journey_href: string | null;
  [key: string]: unknown;
}

export interface ManagementTradingPulseSummary {
  operatorScope: ManagementTradingPulseOperatorScope;
  operator_scope: ManagementTradingPulseOperatorScope;
  pnlGroups: ManagementTradingPulsePnlGroup[];
  pnl_groups: ManagementTradingPulsePnlGroup[];
  fillRateAggregation?: string | null;
  fill_rate_aggregation?: string | null;
  snapshotAt?: string;
  snapshot_at?: string;
  runtimeCount: number | null;
  runtime_count?: number | null;
  telemetryCoverageCount: number;
  monitoringCoverageCount?: number;
  monitoring_coverage_count?: number;
  paperRuntimeCount?: number;
  paper_runtime_count?: number;
  retiredRuntimeCount?: number;
  retired_runtime_count?: number;
  baselineComparisonCount: number;
  baselineRequiredCount?: number;
  baseline_required_count?: number;
  baselineBreachedCount: number;
  baselineWatchCount: number;
  rowHealthDegradedCount?: number;
  row_health_degraded_count?: number;
  rowHealthStatusCounts?: Record<string, number>;
  row_health_status_counts?: Record<string, number>;
  missingTelemetryRuntimeIds?: string[];
  missing_telemetry_runtime_ids?: string[];
  missingMonitoringRuntimeIds?: string[];
  missing_monitoring_runtime_ids?: string[];
  missingBaselineRuntimeIds?: string[];
  missing_baseline_runtime_ids?: string[];
  degradedRuntimeIds?: string[];
  degraded_runtime_ids?: string[];
  metricCoverage?: Record<string, ManagementTradingPulseMetricCoverageEntry>;
  metric_coverage?: Record<string, ManagementTradingPulseMetricCoverageEntry>;
  coverage?: ManagementTradingPulseCoverage;
  totalPnl: number | null;
  worstDrawdown: number | null;
  averageFillRate: number | null;
  worstSlippageBps: number | null;
  totalTrades: number | null;
  total_trades?: number | null;
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

export interface ManagementTradingPulseSnapshot {
  captured_at?: string;
  observed_at?: string;
  deployment_stage?: string;
  metrics: Record<string, number | null>;
}

export interface ManagementTradingPulseDriftMetric {
  metric_id: string;
  label?: string;
  unit?: string;
  baseline_value: number | null;
  observed_value: number | null;
  delta: number | null;
  status: string;
}

export interface ManagementTradingPulseDriftGroup {
  group_id: string;
  label: string;
  metrics: ManagementTradingPulseDriftMetric[];
}

export interface ManagementTradingPulseBaselineComparison {
  strategyId?: string;
  strategy_id?: string;
  paperBaseline?: ManagementTradingPulseSnapshot;
  observedState?: ManagementTradingPulseSnapshot;
  driftGroups?: ManagementTradingPulseDriftGroup[];
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
  personaId?: string | null;
  persona_id?: string | null;
  personaName?: string | null;
  persona_name?: string | null;
  strategyId?: string;
  strategy_id?: string;
  strategyName?: string | null;
  strategy_name?: string | null;
  underlyingSymbol?: string | null;
  underlying_symbol?: string | null;
  tenantId?: string | null;
  tenant_id?: string | null;
  runtimeId: string;
  runtime_id?: string;
  runtimeBindingId?: string;
  runtime_binding_id?: string;
  deploymentStage?: string;
  deployment_stage?: string;
  status?: string;
  executedTradeCount?: number | null;
  executed_trade_count?: number | null;
  totalTrades?: number | null;
  total_trades?: number | null;
  positionCount?: number | null;
  position_count?: number | null;
  metrics: Record<string, unknown>;
  telemetrySummary?: Record<string, unknown>;
  telemetry_summary?: Record<string, unknown>;
  performanceContext?: ManagementTradingPulsePerformanceContext;
  performance_context?: ManagementTradingPulsePerformanceContext;
  latestOutcome?: ManagementTradingPulseLatestOutcome;
  latest_outcome?: ManagementTradingPulseLatestOutcome;
  links?: ManagementTradingPulseLinks;
  baselineComparison?: ManagementTradingPulseBaselineComparison | null;
  baseline_comparison?: ManagementTradingPulseBaselineComparison | null;
  rowHealth?: Record<string, unknown>;
  row_health?: Record<string, unknown>;
  lastUpdatedAt?: string;
  last_updated_at?: string;
  [key: string]: unknown;
}

export interface ManagementTradingPulseRankingEntry {
  rank?: number | null;
  personaId: string | null;
  persona_id: string | null;
  personaName: string | null;
  persona_name: string | null;
  strategyId: string | null;
  strategy_id: string | null;
  strategyName: string | null;
  strategy_name: string | null;
  underlyingSymbol: string | null;
  underlying_symbol: string | null;
  tenantId: string | null;
  tenant_id: string | null;
  runtimeId: string;
  runtime_id: string;
  runtimeBindingId: string;
  runtime_binding_id: string;
  deploymentStage: string;
  deployment_stage: string;
  status: string;
  pnl: number | null;
  drawdown: number | null;
  sharpeRatio: number | null;
  sharpe_ratio: number | null;
  fillRate: number | null;
  fill_rate: number | null;
  avgSlippageBps: number | null;
  avg_slippage_bps: number | null;
  totalTrades: number | null;
  total_trades: number | null;
  lastUpdatedAt: string | null;
  last_updated_at: string | null;
  baselineComparisonStatus: string | null;
  baseline_comparison_status: string | null;
  breachedMetricCount: number | null;
  breached_metric_count: number | null;
  rowHealthStatus: string | null;
  row_health_status: string | null;
  rowHealthDegradedChecks: string[];
  row_health_degraded_checks: string[];
  performanceContext: ManagementTradingPulsePerformanceContext;
  performance_context: ManagementTradingPulsePerformanceContext;
  latestOutcome: ManagementTradingPulseLatestOutcome;
  latest_outcome: ManagementTradingPulseLatestOutcome;
  links?: ManagementTradingPulseLinks;
  [key: string]: unknown;
}

export interface ManagementTradingPulseRankingsSummary {
  operatorScope: ManagementTradingPulseOperatorScope;
  operator_scope: ManagementTradingPulseOperatorScope;
  pnlGroups: ManagementTradingPulsePnlGroup[];
  pnl_groups: ManagementTradingPulsePnlGroup[];
  runtimeCount: number | null;
  runtime_count: number | null;
  rankingBlockCount: number;
  ranking_block_count: number;
  rankedItemCount: number;
  ranked_item_count: number;
  eligibleItemCount: number;
  eligible_item_count: number;
  missingMetricItemCount: number;
  missing_metric_item_count: number;
  criteria: string[];
  limit: number | null;
  topRuntimeId: string | null;
  top_runtime_id: string | null;
  [key: string]: unknown;
}

export type TradingPulseRankingsList = TradingPulseRankBlock[] & {
  summary?: ManagementTradingPulseRankingsSummary;
  meta?: ManagementTradingPulseMeta;
};

export interface ManagementTradingPulseMeta {
  snapshotAt?: string;
  snapshot_at?: string;
  surfaces: Record<string, ManagementTradingPulseSurface>;
  coverage?: ManagementTradingPulseCoverage;
  [key: string]: unknown;
}

export interface ManagementTradingPulseModel {
  id?: string;
  summary: ManagementTradingPulseSummary;
  cards: ManagementTradingPulseCard[];
  rankings: ManagementTradingPulseRankingEntry[];
  runtimeRows: ManagementTradingPulseRuntimeRow[];
  runtime_rows?: ManagementTradingPulseRuntimeRow[];
  baselineComparisons: ManagementTradingPulseBaselineComparison[];
  baseline_comparisons?: ManagementTradingPulseBaselineComparison[];
  meta: ManagementTradingPulseMeta;
}

export interface ManagementEvidenceSurface {
  status: string;
  source?: string;
  message?: string;
  reason?: string;
}

export interface ManagementEvidenceMeta {
  snapshotAt?: string;
  snapshot_at?: string;
  surfaces: Record<string, ManagementEvidenceSurface>;
  redactedEvidenceCount: number;
  redacted_evidence_count: number;
  [key: string]: unknown;
}

export interface ManagementEvidenceCredibility {
  tier: string;
  verified: boolean;
  lastVerifiedAt?: string | null;
  last_verified_at?: string | null;
  verificationMethod?: string | null;
  verification_method?: string | null;
}

export interface ManagementEvidenceResolvedLink {
  availability: string;
  routeHref?: string | null;
  route_href?: string | null;
  displayLabel: string;
  display_label: string;
  openInNewTab: boolean;
  open_in_new_tab: boolean;
}

export interface ManagementEvidenceLinkedObjectLink {
  availability: string;
  routeHref?: string | null;
  route_href?: string | null;
  displayLabel: string;
  display_label: string;
  entityType?: string | null;
  entity_type?: string | null;
  entityRef?: string | null;
  entity_ref?: string | null;
  reason?: string;
}

export interface ManagementEvidenceLinkedObjectSummary {
  entityType: string;
  entity_type: string;
  entityRef: string;
  entity_ref: string;
  displayLabel?: string | null;
  display_label?: string | null;
}

export interface ManagementEvidenceActionability {
  state: string;
  severity: string;
  reasons: string[];
  canTrace: boolean;
  can_trace: boolean;
  canOpenSource: boolean;
  can_open_source: boolean;
  canOpenLinkedObject: boolean;
  can_open_linked_object: boolean;
}

export interface ManagementEvidenceOperationEvent {
  eventId?: string | null;
  event_id?: string | null;
  refId?: string | null;
  ref_id?: string | null;
  action?: string | null;
  actorId?: string | null;
  actor_id?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  reason?: string | null;
  statusAfter?: string | null;
  status_after?: string | null;
  owner?: string | null;
  reviewer?: string | null;
  taskRefs: string[];
  task_refs: string[];
  commandId?: string | null;
  command_id?: string | null;
  auditRef?: string | null;
  audit_ref?: string | null;
}

export interface ManagementEvidenceOperation {
  refId?: string | null;
  ref_id?: string | null;
  status: string;
  owner?: string | null;
  reviewer?: string | null;
  taskRefs: string[];
  task_refs: string[];
  lastActionAt?: string | null;
  last_action_at?: string | null;
  lastReason?: string | null;
  last_reason?: string | null;
  commandRefs: string[];
  command_refs: string[];
  auditRefs: string[];
  audit_refs: string[];
  events: ManagementEvidenceOperationEvent[];
}

export interface ManagementEvidenceAllowedActions {
  canOpenSource: boolean;
  canOpenLinkedObject: boolean;
  canInspectChain: boolean;
  canMarkStale: boolean;
  canRequestEvidence: boolean;
  canCreateDispositionTask: boolean;
  canAssignReviewer: boolean;
  canResolve: boolean;
}

export type ManagementEvidenceDisabledActionReasons = Partial<Record<keyof ManagementEvidenceAllowedActions, string>>;

export interface ManagementEvidenceListItem {
  id: string;
  refId: string;
  ref_id: string;
  title: string;
  displayLabel: string;
  display_label: string;
  sourceType: string;
  source_type: string;
  capturedAt?: string;
  captured_at?: string;
  linkType: string;
  link_type: string;
  credibility: ManagementEvidenceCredibility;
  linkedObjectSummary?: ManagementEvidenceLinkedObjectSummary;
  linked_object_summary?: ManagementEvidenceLinkedObjectSummary;
  linkedObjectLink?: ManagementEvidenceLinkedObjectLink;
  linked_object_link?: ManagementEvidenceLinkedObjectLink;
  resolvedLink: ManagementEvidenceResolvedLink;
  resolved_link: ManagementEvidenceResolvedLink;
  routeHref?: string;
  route_href?: string;
  managementHref?: string;
  management_href?: string;
  actionability: ManagementEvidenceActionability;
  operation: ManagementEvidenceOperation;
  allowedActions: ManagementEvidenceAllowedActions;
  allowed_actions: ManagementEvidenceAllowedActions;
  disabledActionReasons: ManagementEvidenceDisabledActionReasons;
  disabled_action_reasons: ManagementEvidenceDisabledActionReasons;
  redacted: boolean;
  requiredCapability?: string;
  required_capability?: string;
  reason?: string;
}

export interface ManagementEvidenceSummary {
  totalEvidence: number;
  total_evidence: number;
  returnedEvidence: number;
  returned_evidence: number;
  visibleEvidence: number;
  visible_evidence: number;
  redactedEvidence: number;
  redacted_evidence: number;
  verifiedEvidence: number;
  verified_evidence: number;
  bySourceType: Record<string, number>;
  by_source_type: Record<string, number>;
  byLinkType: Record<string, number>;
  by_link_type: Record<string, number>;
  byCredibilityTier: Record<string, number>;
  by_credibility_tier: Record<string, number>;
  traceableEvidence: number | null;
  traceable_evidence: number | null;
  unresolvedSourceEvidence: number;
  unresolved_source_evidence: number;
  incompleteEvidence: number;
  incomplete_evidence: number;
  needsAttentionEvidence: number | null;
  needs_attention_evidence: number | null;
  openOperationEvidence: number | null;
  open_operation_evidence: number | null;
  byActionabilityState: Record<string, number>;
  by_actionability_state: Record<string, number>;
  byActionabilitySeverity: Record<string, number>;
  by_actionability_severity: Record<string, number>;
  byOperationStatus: Record<string, number>;
  by_operation_status: Record<string, number>;
}

export interface ManagementEvidenceFacets {
  sourceTypes: Record<string, number>;
  source_types: Record<string, number>;
  linkTypes: Record<string, number>;
  link_types: Record<string, number>;
  credibilityTiers: Record<string, number>;
  credibility_tiers: Record<string, number>;
  actionabilityStates: Record<string, number>;
  actionability_states: Record<string, number>;
  actionabilitySeverity: Record<string, number>;
  actionability_severity: Record<string, number>;
  operationStatuses: Record<string, number>;
  operation_statuses: Record<string, number>;
}

export interface ManagementEvidencePageInfo {
  nextPageToken?: string | null;
  next_page_token?: string | null;
  hasMore: boolean;
  has_more: boolean;
  total: number;
  pageSize: number;
  page_size: number;
}

export interface ManagementEvidenceOverview {
  items: ManagementEvidenceListItem[];
  data: ManagementEvidenceListItem[];
  summary: ManagementEvidenceSummary;
  facets: ManagementEvidenceFacets;
  pageInfo: ManagementEvidencePageInfo;
  page_info: ManagementEvidencePageInfo;
  pagination: ManagementEvidencePageInfo;
  meta: ManagementEvidenceMeta;
}

export interface ManagementEvidenceStoragePreview {
  available: boolean;
  previewType: string;
  preview_type: string;
}

export interface ManagementEvidenceSourceDocument {
  title: string;
  sourceType: string;
  source_type: string;
  excerpt?: string | null;
  storagePreview: ManagementEvidenceStoragePreview;
  storage_preview: ManagementEvidenceStoragePreview;
  capturedAt?: string | null;
  captured_at?: string | null;
  capturedBy?: string | null;
  captured_by?: string | null;
}

export interface ManagementEvidenceLinkedDecision {
  entityType: string;
  entity_type: string;
  entityRef: string;
  entity_ref: string;
  displayLabel?: string | null;
  display_label?: string | null;
  routeHref?: string | null;
  route_href?: string | null;
  linkType?: string | null;
  link_type?: string | null;
  relationshipNote?: string | null;
  relationship_note?: string | null;
  redacted?: boolean;
  reason?: string;
  requiredCapability?: string;
  required_capability?: string;
}

export interface ManagementEvidenceSourceNoteContext {
  noteId?: string | null;
  note_id?: string | null;
  title?: string | null;
  excerpt?: string | null;
  routeHref?: string | null;
  route_href?: string | null;
}

export interface ManagementEvidenceSourceMemoryContext {
  entryId?: string | null;
  entry_id?: string | null;
  headline?: string | null;
  knowledgeType?: string | null;
  knowledge_type?: string | null;
  lifecycleStatus?: string | null;
  lifecycle_status?: string | null;
  routeHref?: string | null;
  route_href?: string | null;
}

export interface ManagementEvidenceRelationshipItem {
  entityType: string;
  entity_type: string;
  entityRef: string;
  entity_ref: string;
  displayLabel?: string | null;
  display_label?: string | null;
  routeHref?: string | null;
  route_href?: string | null;
  linkType?: string | null;
  link_type?: string | null;
  relationshipNote?: string | null;
  relationship_note?: string | null;
  source?: string | null;
}

export type ManagementEvidenceRelationships = Record<string, ManagementEvidenceRelationshipItem[]>;

export interface ManagementEvidenceChainNode {
  id: string;
  type: string;
  label: string;
  routeHref?: string | null;
  route_href?: string | null;
  availability?: string | null;
}

export interface ManagementEvidenceChainEdge {
  from: string;
  to: string;
  relationship: string;
  source?: string | null;
  degraded?: boolean;
}

export interface ManagementEvidenceChain {
  nodes: ManagementEvidenceChainNode[];
  edges: ManagementEvidenceChainEdge[];
  emptyReason?: string | null;
  empty_reason?: string | null;
  degradedReasons: string[];
  degraded_reasons: string[];
}

export interface ManagementEvidenceTask {
  taskRef: string;
  task_ref: string;
  status: string;
  materialization?: string | null;
  routeHref?: string | null;
  route_href?: string | null;
}

export interface ManagementEvidenceAuditEvent {
  auditRef?: string | null;
  audit_ref?: string | null;
  eventId?: string | null;
  event_id?: string | null;
  action?: string | null;
  actorId?: string | null;
  actor_id?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  reason?: string | null;
  statusAfter?: string | null;
  status_after?: string | null;
  commandId?: string | null;
  command_id?: string | null;
}

export interface ManagementEvidenceDetail {
  refId: string;
  ref_id: string;
  title: string;
  sourceDocument: ManagementEvidenceSourceDocument;
  source_document: ManagementEvidenceSourceDocument;
  linkType: string;
  link_type: string;
  credibility: ManagementEvidenceCredibility;
  resolvedLink: ManagementEvidenceResolvedLink;
  resolved_link: ManagementEvidenceResolvedLink;
  linkedObjectSummary?: ManagementEvidenceLinkedObjectSummary;
  linked_object_summary?: ManagementEvidenceLinkedObjectSummary;
  linkedObjectLink?: ManagementEvidenceLinkedObjectLink;
  linked_object_link?: ManagementEvidenceLinkedObjectLink;
  linkedDecisions: ManagementEvidenceLinkedDecision[];
  linked_decisions: ManagementEvidenceLinkedDecision[];
  sourceNoteContext?: ManagementEvidenceSourceNoteContext | null;
  source_note_context?: ManagementEvidenceSourceNoteContext | null;
  sourceMemoryContext?: ManagementEvidenceSourceMemoryContext | null;
  source_memory_context?: ManagementEvidenceSourceMemoryContext | null;
  createdAt?: string | null;
  created_at?: string | null;
  routeHref?: string | null;
  route_href?: string | null;
  managementHref?: string | null;
  management_href?: string | null;
  actionability: ManagementEvidenceActionability;
  operation: ManagementEvidenceOperation;
  relationships: ManagementEvidenceRelationships;
  chain: ManagementEvidenceChain;
  tasks: ManagementEvidenceTask[];
  auditEvents: ManagementEvidenceAuditEvent[];
  audit_events: ManagementEvidenceAuditEvent[];
  allowedActions: ManagementEvidenceAllowedActions;
  allowed_actions: ManagementEvidenceAllowedActions;
  disabledActionReasons: ManagementEvidenceDisabledActionReasons;
  disabled_action_reasons: ManagementEvidenceDisabledActionReasons;
  redacted: boolean;
  requiredCapability?: string;
  reason?: string;
  meta: ManagementEvidenceMeta;
}

/**
 * Wraps `body` so adapter errors degrade to seedFn output.
 *
 * Strict-live posture (VITE_BFF_MODE=live + VITE_BFF_FALLBACK=strict, the
 * hosted/production profile) must not mask an HTTP-200-but-contract-mismatch
 * response by silently substituting seed data — that hides a real backend
 * error behind what looks like legitimate live data. In that posture this
 * rethrows instead, so the caller's `withLiveOrMock` catch reports the
 * typed unavailable/degraded error. The explicit demo/test mock profile and
 * the dev-default `auto` fallback keep degrading to seedFn
 * (PFG-FE-HONEST-LIVE-20260820).
 */
function safeAdapt<T>(adapt: (raw: unknown) => T | null, seedFn: () => T) {
  return (raw: unknown): T => {
    try {
      const out = adapt(raw);
      if (out !== null && out !== undefined) return out;
      if (isStrictLiveFallback()) {
        throw new Error("live adapter contract mismatch (strict mode): adapter returned no data");
      }
      return seedFn();
    } catch (err) {
      if (isStrictLiveFallback()) throw err;
      return seedFn();
    }
  };
}

function optionalAdapt<T>(adapt: (raw: unknown) => T | null) {
  return (raw: unknown): T | undefined => {
    try {
      return adapt(raw) ?? undefined;
    } catch {
      return undefined;
    }
  };
}

function listAdapt<T>(adapt: (raw: unknown) => T[] | null) {
  return (raw: unknown): T[] => {
    try {
      return adapt(raw) ?? [];
    } catch {
      return [];
    }
  };
}

export function liveOnlyRead<T, TLive = unknown>(
  req: BffRequest,
  adapt: (raw: unknown) => T | null,
): Promise<T | undefined> {
  if (detectMode() === "mock") {
    return Promise.resolve(undefined);
  }
  return strictLiveRead<T | undefined>(
    `mgmt.${req.path}`,
    req,
    optionalAdapt(adapt),
  );
}

function liveOnlyList<T>(
  req: BffRequest,
  adapt: (raw: unknown) => T[] | null,
): Promise<T[]> {
  if (detectMode() === "mock") {
    return Promise.resolve([]);
  }
  return strictLiveRead<T[]>(
    `mgmt.${req.path}`,
    req,
    listAdapt(adapt),
  );
}

function mgmtRead<T>(
  helperName: string,
  req: BffRequest,
  seedFn: () => T,
  adaptLive: (raw: unknown) => T | null,
): Promise<T> {
  if (detectMode() === "mock") {
    return Promise.resolve(seedFn());
  }
  return strictLiveRead<T>(helperName, req, safeAdapt(adaptLive, seedFn));
}

const asString = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const asFiniteNumber = (value: unknown, fallback = 0): number => {
  if (value === null || value === undefined || value === "") return fallback;
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

const asBooleanRecord = (value: unknown): Record<string, boolean> => {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, asBoolean(item, false)] as const),
  );
};

const asNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Object.is(n, -0) ? 0 : n;
};

const asNullableBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(text)) return true;
  if (["0", "false", "no", "n"].includes(text)) return false;
  return null;
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

const optionalString = (value: unknown): string | undefined => {
  const text = asString(value);
  return text || undefined;
};

const nullableString = (value: unknown): string | null => {
  const text = asString(value);
  return text || null;
};

function adaptEvidenceSurface(value: unknown): ManagementEvidenceSurface {
  if (isObject(value)) {
    return {
      status: asString(value.status ?? value.state, "unknown"),
      source: optionalString(value.source),
      message: optionalString(value.message ?? value.summary ?? value.reason),
      reason: optionalString(value.reason),
    };
  }
  return { status: asString(value, "unknown") };
}

function adaptEvidenceMeta(value: unknown): ManagementEvidenceMeta {
  const record = isObject(value) ? value : {};
  const rawSurfaces = isObject(record.surfaces) ? record.surfaces : {};
  const surfaces = Object.fromEntries(
    Object.entries(rawSurfaces).map(([key, item]) => [key, adaptEvidenceSurface(item)]),
  );
  return {
    snapshotAt: optionalString(record.snapshotAt ?? record.snapshot_at),
    snapshot_at: optionalString(record.snapshot_at ?? record.snapshotAt),
    surfaces,
    redactedEvidenceCount: asFiniteNumber(record.redactedEvidenceCount ?? record.redacted_evidence_count, 0),
    redacted_evidence_count: asFiniteNumber(record.redacted_evidence_count ?? record.redactedEvidenceCount, 0),
  };
}

function adaptEvidenceCredibility(value: unknown): ManagementEvidenceCredibility {
  const record = isObject(value) ? value : {};
  return {
    tier: asString(record.tier, "unverified"),
    verified: asBoolean(record.verified, false),
    lastVerifiedAt: nullableString(record.lastVerifiedAt ?? record.last_verified_at),
    last_verified_at: nullableString(record.last_verified_at ?? record.lastVerifiedAt),
    verificationMethod: nullableString(record.verificationMethod ?? record.verification_method),
    verification_method: nullableString(record.verification_method ?? record.verificationMethod),
  };
}

function nullableFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isOfficialReferenceSource(sourceType?: string | null, sourceRef?: unknown): boolean {
  const normalizedType = typeof sourceType === "string" ? sourceType.trim().toLowerCase() : "";
  if (normalizedType === "official_reference") return true;
  const normalizedRef = typeof sourceRef === "string" ? sourceRef.trim().toLowerCase() : "";
  return normalizedRef.startsWith("tw-official://");
}

function adaptEvidenceResolvedLink(
  value: unknown,
  opts?: { isOfficialReference?: boolean },
): ManagementEvidenceResolvedLink {
  const record = isObject(value) ? value : {};
  const routeHref = nullableString(record.routeHref ?? record.route_href);
  const rawAvailability = asString(record.availability, "unavailable");
  const isOfficialNoInternalLink = Boolean(opts?.isOfficialReference && !routeHref);
  const availability =
    isOfficialNoInternalLink && rawAvailability === "unavailable"
      ? "no_internal_link"
      : rawAvailability;
  const rawDisplayLabel = asString(record.displayLabel ?? record.display_label);
  const displayLabel = isOfficialNoInternalLink
    ? !rawDisplayLabel || /^source unavailable$/i.test(rawDisplayLabel)
      ? "No internal link"
      : rawDisplayLabel
    : rawDisplayLabel || (availability === "unavailable" ? "Source unavailable" : "Open source");
  const openInNewTab = asBoolean(record.openInNewTab ?? record.open_in_new_tab, availability === "external");
  return {
    availability,
    routeHref,
    route_href: routeHref,
    displayLabel,
    display_label: displayLabel,
    openInNewTab,
    open_in_new_tab: openInNewTab,
  };
}

function adaptEvidenceLinkedObjectLink(value: unknown): ManagementEvidenceLinkedObjectLink | undefined {
  if (!isObject(value)) return undefined;
  const availability = asString(value.availability, "unavailable");
  const routeHref = nullableString(value.routeHref ?? value.route_href);
  const displayLabel = asString(value.displayLabel ?? value.display_label, "Linked object unavailable");
  return {
    availability,
    routeHref,
    route_href: routeHref,
    displayLabel,
    display_label: displayLabel,
    entityType: nullableString(value.entityType ?? value.entity_type),
    entity_type: nullableString(value.entity_type ?? value.entityType),
    entityRef: nullableString(value.entityRef ?? value.entity_ref),
    entity_ref: nullableString(value.entity_ref ?? value.entityRef),
    reason: optionalString(value.reason),
  };
}

function adaptEvidenceLinkedObjectSummary(value: unknown): ManagementEvidenceLinkedObjectSummary | undefined {
  if (!isObject(value)) return undefined;
  const entityType = asString(value.entityType ?? value.entity_type);
  const entityRef = asString(value.entityRef ?? value.entity_ref);
  const displayLabel = nullableString(value.displayLabel ?? value.display_label);
  if (!entityType && !entityRef && !displayLabel) return undefined;
  return {
    entityType,
    entity_type: entityType,
    entityRef,
    entity_ref: entityRef,
    displayLabel,
    display_label: displayLabel,
  };
}

const defaultEvidenceActionability = (): ManagementEvidenceActionability => ({
  state: "unknown",
  severity: "info",
  reasons: [],
  canTrace: false,
  can_trace: false,
  canOpenSource: false,
  can_open_source: false,
  canOpenLinkedObject: false,
  can_open_linked_object: false,
});

function adaptEvidenceActionability(value: unknown): ManagementEvidenceActionability {
  if (!isObject(value)) return defaultEvidenceActionability();
  const canTrace = asBoolean(value.canTrace ?? value.can_trace, false);
  const canOpenSource = asBoolean(value.canOpenSource ?? value.can_open_source, false);
  const canOpenLinkedObject = asBoolean(value.canOpenLinkedObject ?? value.can_open_linked_object, false);
  return {
    state: asString(value.state, "unknown"),
    severity: asString(value.severity, "info"),
    reasons: asStringArray(value.reasons),
    canTrace,
    can_trace: canTrace,
    canOpenSource,
    can_open_source: canOpenSource,
    canOpenLinkedObject,
    can_open_linked_object: canOpenLinkedObject,
  };
}

function adaptEvidenceOperationEvent(value: unknown): ManagementEvidenceOperationEvent | null {
  if (!isObject(value)) return null;
  const taskRefs = asStringArray(value.taskRefs ?? value.task_refs);
  return {
    eventId: nullableString(value.eventId ?? value.event_id),
    event_id: nullableString(value.event_id ?? value.eventId),
    refId: nullableString(value.refId ?? value.ref_id),
    ref_id: nullableString(value.ref_id ?? value.refId),
    action: nullableString(value.action),
    actorId: nullableString(value.actorId ?? value.actor_id),
    actor_id: nullableString(value.actor_id ?? value.actorId),
    createdAt: nullableString(value.createdAt ?? value.created_at),
    created_at: nullableString(value.created_at ?? value.createdAt),
    reason: nullableString(value.reason),
    statusAfter: nullableString(value.statusAfter ?? value.status_after),
    status_after: nullableString(value.status_after ?? value.statusAfter),
    owner: nullableString(value.owner),
    reviewer: nullableString(value.reviewer),
    taskRefs,
    task_refs: taskRefs,
    commandId: nullableString(value.commandId ?? value.command_id),
    command_id: nullableString(value.command_id ?? value.commandId),
    auditRef: nullableString(value.auditRef ?? value.audit_ref),
    audit_ref: nullableString(value.audit_ref ?? value.auditRef),
  };
}

function adaptEvidenceOperation(value: unknown, refId?: string): ManagementEvidenceOperation {
  const record = isObject(value) ? value : {};
  const taskRefs = asStringArray(record.taskRefs ?? record.task_refs);
  const commandRefs = asStringArray(record.commandRefs ?? record.command_refs);
  const auditRefs = asStringArray(record.auditRefs ?? record.audit_refs);
  const events = firstArray<unknown>(record.events)
    .map(adaptEvidenceOperationEvent)
    .filter((item): item is ManagementEvidenceOperationEvent => Boolean(item));
  return {
    refId: nullableString(record.refId ?? record.ref_id ?? refId),
    ref_id: nullableString(record.ref_id ?? record.refId ?? refId),
    status: asString(record.status, "none"),
    owner: nullableString(record.owner),
    reviewer: nullableString(record.reviewer),
    taskRefs,
    task_refs: taskRefs,
    lastActionAt: nullableString(record.lastActionAt ?? record.last_action_at),
    last_action_at: nullableString(record.last_action_at ?? record.lastActionAt),
    lastReason: nullableString(record.lastReason ?? record.last_reason),
    last_reason: nullableString(record.last_reason ?? record.lastReason),
    commandRefs,
    command_refs: commandRefs,
    auditRefs,
    audit_refs: auditRefs,
    events,
  };
}

function adaptEvidenceAllowedActions(value: unknown): ManagementEvidenceAllowedActions {
  const record = asBooleanRecord(value);
  return {
    canOpenSource: record.canOpenSource ?? record.can_open_source ?? false,
    canOpenLinkedObject: record.canOpenLinkedObject ?? record.can_open_linked_object ?? false,
    canInspectChain: record.canInspectChain ?? record.can_inspect_chain ?? false,
    canMarkStale: record.canMarkStale ?? record.can_mark_stale ?? false,
    canRequestEvidence: record.canRequestEvidence ?? record.can_request_evidence ?? false,
    canCreateDispositionTask: record.canCreateDispositionTask ?? record.can_create_disposition_task ?? false,
    canAssignReviewer: record.canAssignReviewer ?? record.can_assign_reviewer ?? false,
    canResolve: record.canResolve ?? record.can_resolve ?? false,
  };
}

function adaptEvidenceDisabledActionReasons(value: unknown): ManagementEvidenceDisabledActionReasons {
  const record = asStringRecord(value);
  return {
    ...(record.canOpenSource || record.can_open_source
      ? { canOpenSource: record.canOpenSource ?? record.can_open_source }
      : {}),
    ...(record.canOpenLinkedObject || record.can_open_linked_object
      ? { canOpenLinkedObject: record.canOpenLinkedObject ?? record.can_open_linked_object }
      : {}),
    ...(record.canInspectChain || record.can_inspect_chain
      ? { canInspectChain: record.canInspectChain ?? record.can_inspect_chain }
      : {}),
    ...(record.canMarkStale || record.can_mark_stale
      ? { canMarkStale: record.canMarkStale ?? record.can_mark_stale }
      : {}),
    ...(record.canRequestEvidence || record.can_request_evidence
      ? { canRequestEvidence: record.canRequestEvidence ?? record.can_request_evidence }
      : {}),
    ...(record.canCreateDispositionTask || record.can_create_disposition_task
      ? { canCreateDispositionTask: record.canCreateDispositionTask ?? record.can_create_disposition_task }
      : {}),
    ...(record.canAssignReviewer || record.can_assign_reviewer
      ? { canAssignReviewer: record.canAssignReviewer ?? record.can_assign_reviewer }
      : {}),
    ...(record.canResolve || record.can_resolve
      ? { canResolve: record.canResolve ?? record.can_resolve }
      : {}),
  };
}

function adaptEvidenceRelationshipItem(value: unknown): ManagementEvidenceRelationshipItem | null {
  if (!isObject(value)) return null;
  const entityType = asString(value.entityType ?? value.entity_type);
  const entityRef = asString(value.entityRef ?? value.entity_ref);
  if (!entityType || !entityRef) return null;
  return {
    entityType,
    entity_type: entityType,
    entityRef,
    entity_ref: entityRef,
    displayLabel: nullableString(value.displayLabel ?? value.display_label),
    display_label: nullableString(value.display_label ?? value.displayLabel),
    routeHref: nullableString(value.routeHref ?? value.route_href),
    route_href: nullableString(value.route_href ?? value.routeHref),
    linkType: nullableString(value.linkType ?? value.link_type),
    link_type: nullableString(value.link_type ?? value.linkType),
    relationshipNote: nullableString(value.relationshipNote ?? value.relationship_note),
    relationship_note: nullableString(value.relationship_note ?? value.relationshipNote),
    source: nullableString(value.source),
  };
}

function adaptEvidenceRelationships(value: unknown): ManagementEvidenceRelationships {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, items]) => [
      key,
      firstArray<unknown>(items)
        .map(adaptEvidenceRelationshipItem)
        .filter((item): item is ManagementEvidenceRelationshipItem => Boolean(item)),
    ]),
  );
}

function adaptEvidenceChainNode(value: unknown): ManagementEvidenceChainNode | null {
  if (!isObject(value)) return null;
  const id = asString(value.id);
  if (!id) return null;
  const routeHref = nullableString(value.routeHref ?? value.route_href);
  return {
    id,
    type: asString(value.type, "unknown"),
    label: asString(value.label, id),
    routeHref,
    route_href: routeHref,
    availability: nullableString(value.availability),
  };
}

function adaptEvidenceChainEdge(value: unknown): ManagementEvidenceChainEdge | null {
  if (!isObject(value)) return null;
  const from = asString(value.from);
  const to = asString(value.to);
  if (!from || !to) return null;
  return {
    from,
    to,
    relationship: asString(value.relationship, "related_to"),
    source: nullableString(value.source),
    degraded: asBoolean(value.degraded, false),
  };
}

function adaptEvidenceChain(value: unknown): ManagementEvidenceChain {
  const record = isObject(value) ? value : {};
  const nodes = firstArray<unknown>(record.nodes)
    .map(adaptEvidenceChainNode)
    .filter((item): item is ManagementEvidenceChainNode => Boolean(item));
  const edges = firstArray<unknown>(record.edges)
    .map(adaptEvidenceChainEdge)
    .filter((item): item is ManagementEvidenceChainEdge => Boolean(item));
  const degradedReasons = asStringArray(record.degradedReasons ?? record.degraded_reasons);
  return {
    nodes,
    edges,
    emptyReason: nullableString(record.emptyReason ?? record.empty_reason),
    empty_reason: nullableString(record.empty_reason ?? record.emptyReason),
    degradedReasons,
    degraded_reasons: degradedReasons,
  };
}

function adaptEvidenceTask(value: unknown): ManagementEvidenceTask | null {
  if (!isObject(value)) return null;
  const taskRef = asString(value.taskRef ?? value.task_ref);
  if (!taskRef) return null;
  return {
    taskRef,
    task_ref: taskRef,
    status: asString(value.status, "linked"),
    materialization: nullableString(value.materialization),
    routeHref: nullableString(value.routeHref ?? value.route_href),
    route_href: nullableString(value.route_href ?? value.routeHref),
  };
}

function adaptEvidenceAuditEvent(value: unknown): ManagementEvidenceAuditEvent | null {
  if (!isObject(value)) return null;
  return {
    auditRef: nullableString(value.auditRef ?? value.audit_ref),
    audit_ref: nullableString(value.audit_ref ?? value.auditRef),
    eventId: nullableString(value.eventId ?? value.event_id),
    event_id: nullableString(value.event_id ?? value.eventId),
    action: nullableString(value.action),
    actorId: nullableString(value.actorId ?? value.actor_id),
    actor_id: nullableString(value.actor_id ?? value.actorId),
    createdAt: nullableString(value.createdAt ?? value.created_at),
    created_at: nullableString(value.created_at ?? value.createdAt),
    reason: nullableString(value.reason),
    statusAfter: nullableString(value.statusAfter ?? value.status_after),
    status_after: nullableString(value.status_after ?? value.statusAfter),
    commandId: nullableString(value.commandId ?? value.command_id),
    command_id: nullableString(value.command_id ?? value.commandId),
  };
}

function adaptEvidenceListItem(value: unknown): ManagementEvidenceListItem | null {
  if (!isObject(value)) return null;
  const sourceDocument = isObject(value.sourceDocument)
    ? value.sourceDocument
    : isObject(value.source_document)
      ? value.source_document
      : {};
  const metadata = isObject(value.metadata) ? value.metadata : {};
  const refId = asString(value.refId ?? value.ref_id ?? value.evidence_item_id ?? value.evidenceItemId ?? value.id);
  if (!refId) return null;
  const title = asString(
    value.title ??
      value.displayLabel ??
      value.display_label ??
      sourceDocument.title ??
      value.citation_label ??
      value.citationLabel,
    refId,
  );
  const rawSourceRef =
    value.sourceRef ?? value.source_ref ?? sourceDocument.sourceRef ?? sourceDocument.source_ref;
  const inferredSourceType = asString(
    value.sourceType ??
      value.source_type ??
      sourceDocument.sourceType ??
      sourceDocument.source_type ??
      metadata.source_class ??
      metadata.sourceClass,
    "unknown",
  );
  const isOfficialReference = isOfficialReferenceSource(inferredSourceType, rawSourceRef);
  const sourceType =
    inferredSourceType === "unknown" && isOfficialReference ? "official_reference" : inferredSourceType;
  const capturedAt = optionalString(
    value.capturedAt ??
      value.captured_at ??
      sourceDocument.capturedAt ??
      sourceDocument.captured_at ??
      value.available_time ??
      value.availableTime ??
      value.event_time ??
      value.eventTime,
  );
  const linkType = asString(value.linkType ?? value.link_type ?? value.item_type ?? value.itemType, "unknown");
  const linkedObjectSummary = adaptEvidenceLinkedObjectSummary(value.linkedObjectSummary ?? value.linked_object_summary);
  const linkedObjectLink = adaptEvidenceLinkedObjectLink(value.linkedObjectLink ?? value.linked_object_link);
  const resolvedLink = adaptEvidenceResolvedLink(value.resolvedLink ?? value.resolved_link, {
    isOfficialReference,
  });
  const routeHref = optionalString(value.routeHref ?? value.route_href);
  const managementHref = optionalString(value.managementHref ?? value.management_href);
  const allowedActions = adaptEvidenceAllowedActions(value.allowedActions ?? value.allowed_actions);
  const disabledActionReasons = adaptEvidenceDisabledActionReasons(
    value.disabledActionReasons ?? value.disabled_action_reasons,
  );
  return {
    id: refId,
    refId,
    ref_id: refId,
    title,
    displayLabel: asString(value.displayLabel ?? value.display_label, title),
    display_label: asString(value.display_label ?? value.displayLabel, title),
    sourceType,
    source_type: sourceType,
    capturedAt,
    captured_at: capturedAt,
    linkType,
    link_type: linkType,
    credibility: adaptEvidenceCredibility(value.credibility),
    linkedObjectSummary,
    linked_object_summary: linkedObjectSummary,
    linkedObjectLink,
    linked_object_link: linkedObjectLink,
    resolvedLink,
    resolved_link: resolvedLink,
    routeHref,
    route_href: routeHref,
    managementHref,
    management_href: managementHref,
    actionability: adaptEvidenceActionability(value.actionability),
    operation: adaptEvidenceOperation(value.operation, refId),
    allowedActions,
    allowed_actions: allowedActions,
    disabledActionReasons,
    disabled_action_reasons: disabledActionReasons,
    redacted: asBoolean(value.redacted, false),
    requiredCapability: optionalString(value.requiredCapability ?? value.required_capability),
    required_capability: optionalString(value.required_capability ?? value.requiredCapability),
    reason: optionalString(value.reason),
  };
}

function buildEvidenceSummary(items: ManagementEvidenceListItem[]): ManagementEvidenceSummary {
  const bySourceType: Record<string, number> = {};
  const byLinkType: Record<string, number> = {};
  const byCredibilityTier: Record<string, number> = {};
  let verifiedEvidence = 0;
  let redactedEvidence = 0;
  const byActionabilityState: Record<string, number> = {};
  const byActionabilitySeverity: Record<string, number> = {};
  const byOperationStatus: Record<string, number> = {};
  for (const item of items) {
    const sourceType = item.sourceType || "unknown";
    const linkType = item.linkType || "unknown";
    const tier = item.credibility.tier || "unverified";
    const actionabilityState = item.actionability?.state || "unknown";
    const actionabilitySeverity = item.actionability?.severity || "unknown";
    const operationStatus = item.operation?.status || "none";
    bySourceType[sourceType] = (bySourceType[sourceType] ?? 0) + 1;
    byLinkType[linkType] = (byLinkType[linkType] ?? 0) + 1;
    byCredibilityTier[tier] = (byCredibilityTier[tier] ?? 0) + 1;
    byActionabilityState[actionabilityState] = (byActionabilityState[actionabilityState] ?? 0) + 1;
    byActionabilitySeverity[actionabilitySeverity] = (byActionabilitySeverity[actionabilitySeverity] ?? 0) + 1;
    byOperationStatus[operationStatus] = (byOperationStatus[operationStatus] ?? 0) + 1;
    if (item.credibility.verified) verifiedEvidence += 1;
    if (item.redacted) redactedEvidence += 1;
  }
  const visibleEvidence = Math.max(items.length - redactedEvidence, 0);
  const traceableEvidence = byActionabilityState.traceable ?? 0;
  const unresolvedSourceEvidence = byActionabilityState.unresolved_source ?? 0;
  const incompleteEvidence = byActionabilityState.incomplete ?? 0;
  const needsAttentionEvidence = items.filter((item) => {
    const state = String(item.actionability?.state ?? "unknown").trim().toLowerCase();
    return Boolean(state) && !["unknown", "traceable", "ok", "resolved", "none"].includes(state);
  }).length;
  const openOperationEvidence = items.filter((item) => {
    const status = String(item.operation?.status ?? "none").toLowerCase();
    return !["", "none", "resolved"].includes(status) && !item.redacted;
  }).length;
  return {
    totalEvidence: items.length,
    total_evidence: items.length,
    returnedEvidence: items.length,
    returned_evidence: items.length,
    visibleEvidence,
    visible_evidence: visibleEvidence,
    redactedEvidence,
    redacted_evidence: redactedEvidence,
    verifiedEvidence,
    verified_evidence: verifiedEvidence,
    bySourceType,
    by_source_type: bySourceType,
    byLinkType,
    by_link_type: byLinkType,
    byCredibilityTier,
    by_credibility_tier: byCredibilityTier,
    traceableEvidence,
    traceable_evidence: traceableEvidence,
    unresolvedSourceEvidence,
    unresolved_source_evidence: unresolvedSourceEvidence,
    incompleteEvidence,
    incomplete_evidence: incompleteEvidence,
    needsAttentionEvidence,
    needs_attention_evidence: needsAttentionEvidence,
    openOperationEvidence,
    open_operation_evidence: openOperationEvidence,
    byActionabilityState,
    by_actionability_state: byActionabilityState,
    byActionabilitySeverity,
    by_actionability_severity: byActionabilitySeverity,
    byOperationStatus,
    by_operation_status: byOperationStatus,
  };
}

function adaptEvidenceSummary(
  value: unknown,
  items: ManagementEvidenceListItem[],
  pageInfo?: ManagementEvidencePageInfo,
): ManagementEvidenceSummary {
  const computed = buildEvidenceSummary(items);
  const fallbackTotal = pageInfo?.total ?? computed.totalEvidence;
  if (!isObject(value)) {
    return {
      ...computed,
      totalEvidence: fallbackTotal,
      total_evidence: fallbackTotal,
      traceableEvidence: null,
      traceable_evidence: null,
      needsAttentionEvidence: null,
      needs_attention_evidence: null,
      openOperationEvidence: null,
      open_operation_evidence: null,
    };
  }
  const bySourceType = asCountRecord(value.bySourceType ?? value.by_source_type);
  const byLinkType = asCountRecord(value.byLinkType ?? value.by_link_type);
  const byCredibilityTier = asCountRecord(value.byCredibilityTier ?? value.by_credibility_tier);
  const byActionabilityState = asCountRecord(value.byActionabilityState ?? value.by_actionability_state);
  const byActionabilitySeverity = asCountRecord(value.byActionabilitySeverity ?? value.by_actionability_severity);
  const byOperationStatus = asCountRecord(value.byOperationStatus ?? value.by_operation_status);
  const totalEvidence = asFiniteNumber(
    pageInfo?.total ?? value.totalEvidence ?? value.total_evidence ?? value.totalItems ?? value.total_items,
    fallbackTotal,
  );
  const verifiedEvidence = asFiniteNumber(
    value.verifiedEvidence ?? value.verified_evidence ?? value.verifiedCount ?? value.verified_count,
    computed.verifiedEvidence,
  );
  const traceableEvidence = nullableFiniteNumber(
    value.traceableEvidence ?? value.traceable_evidence ?? value.traceableCount ?? value.traceable_count,
  );
  const needsAttentionEvidence = nullableFiniteNumber(
    value.needsAttentionEvidence ?? value.needs_attention_evidence ?? value.needsAttentionCount ?? value.needs_attention_count,
  );
  const openOperationEvidence = nullableFiniteNumber(
    value.openOperationEvidence ?? value.open_operation_evidence ?? value.openOperationsCount ?? value.open_operations_count,
  );
  return {
    totalEvidence,
    total_evidence: totalEvidence,
    returnedEvidence: asFiniteNumber(value.returnedEvidence ?? value.returned_evidence, computed.returnedEvidence),
    returned_evidence: asFiniteNumber(value.returned_evidence ?? value.returnedEvidence, computed.returnedEvidence),
    visibleEvidence: asFiniteNumber(value.visibleEvidence ?? value.visible_evidence, computed.visibleEvidence),
    visible_evidence: asFiniteNumber(value.visible_evidence ?? value.visibleEvidence, computed.visibleEvidence),
    redactedEvidence: asFiniteNumber(value.redactedEvidence ?? value.redacted_evidence, computed.redactedEvidence),
    redacted_evidence: asFiniteNumber(value.redacted_evidence ?? value.redactedEvidence, computed.redactedEvidence),
    verifiedEvidence,
    verified_evidence: verifiedEvidence,
    bySourceType: Object.keys(bySourceType).length ? bySourceType : computed.bySourceType,
    by_source_type: Object.keys(bySourceType).length ? bySourceType : computed.bySourceType,
    byLinkType: Object.keys(byLinkType).length ? byLinkType : computed.byLinkType,
    by_link_type: Object.keys(byLinkType).length ? byLinkType : computed.byLinkType,
    byCredibilityTier: Object.keys(byCredibilityTier).length ? byCredibilityTier : computed.byCredibilityTier,
    by_credibility_tier: Object.keys(byCredibilityTier).length ? byCredibilityTier : computed.byCredibilityTier,
    traceableEvidence,
    traceable_evidence: traceableEvidence,
    unresolvedSourceEvidence: asFiniteNumber(value.unresolvedSourceEvidence ?? value.unresolved_source_evidence, computed.unresolvedSourceEvidence),
    unresolved_source_evidence: asFiniteNumber(value.unresolved_source_evidence ?? value.unresolvedSourceEvidence, computed.unresolvedSourceEvidence),
    incompleteEvidence: asFiniteNumber(value.incompleteEvidence ?? value.incomplete_evidence, computed.incompleteEvidence),
    incomplete_evidence: asFiniteNumber(value.incomplete_evidence ?? value.incompleteEvidence, computed.incompleteEvidence),
    needsAttentionEvidence,
    needs_attention_evidence: needsAttentionEvidence,
    openOperationEvidence,
    open_operation_evidence: openOperationEvidence,
    byActionabilityState: Object.keys(byActionabilityState).length ? byActionabilityState : computed.byActionabilityState,
    by_actionability_state: Object.keys(byActionabilityState).length ? byActionabilityState : computed.byActionabilityState,
    byActionabilitySeverity: Object.keys(byActionabilitySeverity).length ? byActionabilitySeverity : computed.byActionabilitySeverity,
    by_actionability_severity: Object.keys(byActionabilitySeverity).length ? byActionabilitySeverity : computed.byActionabilitySeverity,
    byOperationStatus: Object.keys(byOperationStatus).length ? byOperationStatus : computed.byOperationStatus,
    by_operation_status: Object.keys(byOperationStatus).length ? byOperationStatus : computed.byOperationStatus,
  };
}

function adaptEvidenceFacets(value: unknown, summary: ManagementEvidenceSummary): ManagementEvidenceFacets {
  const record = isObject(value) ? value : {};
  const sourceTypes = asCountRecord(record.sourceTypes ?? record.source_types);
  const linkTypes = asCountRecord(record.linkTypes ?? record.link_types);
  const credibilityTiers = asCountRecord(record.credibilityTiers ?? record.credibility_tiers);
  const actionabilityStates = asCountRecord(record.actionabilityStates ?? record.actionability_states);
  const actionabilitySeverity = asCountRecord(record.actionabilitySeverity ?? record.actionability_severity);
  const operationStatuses = asCountRecord(record.operationStatuses ?? record.operation_statuses);
  return {
    sourceTypes: Object.keys(sourceTypes).length ? sourceTypes : summary.bySourceType,
    source_types: Object.keys(sourceTypes).length ? sourceTypes : summary.bySourceType,
    linkTypes: Object.keys(linkTypes).length ? linkTypes : summary.byLinkType,
    link_types: Object.keys(linkTypes).length ? linkTypes : summary.byLinkType,
    credibilityTiers: Object.keys(credibilityTiers).length ? credibilityTiers : summary.byCredibilityTier,
    credibility_tiers: Object.keys(credibilityTiers).length ? credibilityTiers : summary.byCredibilityTier,
    actionabilityStates: Object.keys(actionabilityStates).length ? actionabilityStates : summary.byActionabilityState,
    actionability_states: Object.keys(actionabilityStates).length ? actionabilityStates : summary.byActionabilityState,
    actionabilitySeverity: Object.keys(actionabilitySeverity).length ? actionabilitySeverity : summary.byActionabilitySeverity,
    actionability_severity: Object.keys(actionabilitySeverity).length ? actionabilitySeverity : summary.byActionabilitySeverity,
    operationStatuses: Object.keys(operationStatuses).length ? operationStatuses : summary.byOperationStatus,
    operation_statuses: Object.keys(operationStatuses).length ? operationStatuses : summary.byOperationStatus,
  };
}

function adaptEvidencePageInfo(
  value: unknown,
  items: ManagementEvidenceListItem[],
  summaryValue?: unknown,
): ManagementEvidencePageInfo {
  const record = isObject(value) ? value : {};
  const summaryRecord = isObject(summaryValue) ? summaryValue : {};
  const nextPageToken = nullableString(record.nextPageToken ?? record.next_page_token);
  const pageSize = asFiniteNumber(record.pageSize ?? record.page_size, items.length);
  const total = asFiniteNumber(
    record.total ?? summaryRecord.totalEvidence ?? summaryRecord.total_evidence ?? summaryRecord.totalItems ?? summaryRecord.total_items,
    items.length,
  );
  const hasMore = asBoolean(record.hasMore ?? record.has_more, Boolean(nextPageToken));
  return {
    nextPageToken,
    next_page_token: nextPageToken,
    hasMore,
    has_more: hasMore,
    total,
    pageSize,
    page_size: pageSize,
  };
}

function evidenceEnvelope(raw: unknown): Record<string, unknown> | unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (!isObject(raw)) return null;
  const data = raw.data;
  if (Array.isArray(data) && ("items" in raw || "summary" in raw || "facets" in raw || "page_info" in raw)) {
    return raw;
  }
  if (isObject(data) && ("items" in data || "evidence_refs" in data || "summary" in data)) {
    return data;
  }
  return raw;
}

export function adaptManagementEvidenceOverview(raw: unknown): ManagementEvidenceOverview | null {
  const container = evidenceEnvelope(raw);
  if (!container) return null;
  const root = isObject(raw) ? raw : {};
  const record = isObject(container) ? container : {};
  const rawItems = firstArray<unknown>(
    isObject(record) ? record.items : undefined,
    isObject(record) ? record.evidence_refs : undefined,
    isObject(record) ? record.data : undefined,
    container,
  );
  const items = rawItems.map(adaptEvidenceListItem).filter((item): item is ManagementEvidenceListItem => Boolean(item));
  const rawSummary = record.summary ?? root.summary;
  const rawPageInfo =
    record.page_info ?? record.pageInfo ?? record.pagination ?? root.page_info ?? root.pageInfo ?? root.pagination;
  const pageInfo = adaptEvidencePageInfo(rawPageInfo, items, rawSummary);
  const summary = adaptEvidenceSummary(rawSummary, items, pageInfo);
  const facets = adaptEvidenceFacets(record.facets ?? root.facets, summary);
  const rawMeta = isObject(record.meta) && Object.keys(record.meta).length > 0 ? record.meta : (root.meta ?? record.meta);
  const meta = adaptEvidenceMeta(rawMeta);
  return {
    items,
    data: items,
    summary,
    facets,
    pageInfo,
    page_info: pageInfo,
    pagination: pageInfo,
    meta,
  };
}

function adaptEvidenceStoragePreview(value: unknown): ManagementEvidenceStoragePreview {
  const record = isObject(value) ? value : {};
  const previewType = asString(record.previewType ?? record.preview_type, "unavailable");
  return {
    available: asBoolean(record.available, false),
    previewType,
    preview_type: previewType,
  };
}

function adaptEvidenceSourceDocument(value: unknown, fallbackTitle: string): ManagementEvidenceSourceDocument {
  const record = isObject(value) ? value : {};
  const sourceType = asString(record.sourceType ?? record.source_type, "unknown");
  const storagePreview = adaptEvidenceStoragePreview(record.storagePreview ?? record.storage_preview);
  return {
    title: asString(record.title, fallbackTitle),
    sourceType,
    source_type: sourceType,
    excerpt: nullableString(record.excerpt),
    storagePreview,
    storage_preview: storagePreview,
    capturedAt: nullableString(record.capturedAt ?? record.captured_at),
    captured_at: nullableString(record.captured_at ?? record.capturedAt),
    capturedBy: nullableString(record.capturedBy ?? record.captured_by),
    captured_by: nullableString(record.captured_by ?? record.capturedBy),
  };
}

function adaptEvidenceLinkedDecision(value: unknown): ManagementEvidenceLinkedDecision | null {
  if (!isObject(value)) return null;
  const entityType = asString(value.entityType ?? value.entity_type);
  const entityRef = asString(value.entityRef ?? value.entity_ref ?? value.refId ?? value.ref_id ?? value.id);
  const displayLabel = nullableString(value.displayLabel ?? value.display_label);
  if (!entityType && !entityRef && !displayLabel && !value.redacted) return null;
  const routeHref = nullableString(value.routeHref ?? value.route_href);
  const linkType = nullableString(value.linkType ?? value.link_type);
  const relationshipNote = nullableString(value.relationshipNote ?? value.relationship_note);
  return {
    entityType,
    entity_type: entityType,
    entityRef,
    entity_ref: entityRef,
    displayLabel,
    display_label: displayLabel,
    routeHref,
    route_href: routeHref,
    linkType,
    link_type: linkType,
    relationshipNote,
    relationship_note: relationshipNote,
    redacted: asBoolean(value.redacted, false),
    reason: optionalString(value.reason),
    requiredCapability: optionalString(value.requiredCapability ?? value.required_capability),
    required_capability: optionalString(value.required_capability ?? value.requiredCapability),
  };
}

function adaptEvidenceSourceNoteContext(value: unknown): ManagementEvidenceSourceNoteContext | null {
  if (!isObject(value)) return null;
  const noteId = nullableString(value.noteId ?? value.note_id);
  const title = nullableString(value.title);
  const excerpt = nullableString(value.excerpt);
  const routeHref = nullableString(value.routeHref ?? value.route_href);
  if (!noteId && !title && !excerpt && !routeHref) return null;
  return { noteId, note_id: noteId, title, excerpt, routeHref, route_href: routeHref };
}

function adaptEvidenceSourceMemoryContext(value: unknown): ManagementEvidenceSourceMemoryContext | null {
  if (!isObject(value)) return null;
  const entryId = nullableString(value.entryId ?? value.entry_id);
  const headline = nullableString(value.headline);
  const knowledgeType = nullableString(value.knowledgeType ?? value.knowledge_type);
  const lifecycleStatus = nullableString(value.lifecycleStatus ?? value.lifecycle_status);
  const routeHref = nullableString(value.routeHref ?? value.route_href);
  if (!entryId && !headline && !knowledgeType && !lifecycleStatus && !routeHref) return null;
  return {
    entryId,
    entry_id: entryId,
    headline,
    knowledgeType,
    knowledge_type: knowledgeType,
    lifecycleStatus,
    lifecycle_status: lifecycleStatus,
    routeHref,
    route_href: routeHref,
  };
}

export function adaptManagementEvidenceDetail(raw: unknown): ManagementEvidenceDetail | null {
  const data = unwrap(raw);
  if (!isObject(data)) return null;
  const refId = asString(data.refId ?? data.ref_id ?? data.id);
  if (!refId) return null;
  const sourceDocument = adaptEvidenceSourceDocument(data.sourceDocument ?? data.source_document, refId);
  const rawSourceDoc = isObject(data.sourceDocument ?? data.source_document)
    ? ((data.sourceDocument ?? data.source_document) as Record<string, unknown>)
    : {};
  const isOfficialReference = isOfficialReferenceSource(
    sourceDocument.sourceType ?? asString(data.sourceType ?? data.source_type),
    rawSourceDoc.sourceRef ?? rawSourceDoc.source_ref ?? data.sourceRef ?? data.source_ref,
  );
  const linkedObjectSummary = adaptEvidenceLinkedObjectSummary(data.linkedObjectSummary ?? data.linked_object_summary);
  const linkedObjectLink = adaptEvidenceLinkedObjectLink(data.linkedObjectLink ?? data.linked_object_link);
  const linkedDecisions = firstArray<unknown>(data.linkedDecisions, data.linked_decisions)
    .map(adaptEvidenceLinkedDecision)
    .filter((item): item is ManagementEvidenceLinkedDecision => Boolean(item));
  const linkType = asString(data.linkType ?? data.link_type, "unknown");
  const allowedActions = adaptEvidenceAllowedActions(data.allowedActions ?? data.allowed_actions);
  const disabledActionReasons = adaptEvidenceDisabledActionReasons(
    data.disabledActionReasons ?? data.disabled_action_reasons,
  );
  const auditEvents = firstArray<unknown>(data.auditEvents, data.audit_events)
    .map(adaptEvidenceAuditEvent)
    .filter((item): item is ManagementEvidenceAuditEvent => Boolean(item));
  const resolvedLink = adaptEvidenceResolvedLink(data.resolvedLink ?? data.resolved_link, {
    isOfficialReference,
  });
  return {
    refId,
    ref_id: refId,
    title: asString(data.title ?? data.displayLabel ?? data.display_label ?? sourceDocument.title, refId),
    sourceDocument,
    source_document: sourceDocument,
    linkType,
    link_type: linkType,
    credibility: adaptEvidenceCredibility(data.credibility),
    resolvedLink,
    resolved_link: resolvedLink,
    linkedObjectSummary,
    linked_object_summary: linkedObjectSummary,
    linkedObjectLink,
    linked_object_link: linkedObjectLink,
    linkedDecisions,
    linked_decisions: linkedDecisions,
    sourceNoteContext: adaptEvidenceSourceNoteContext(data.sourceNoteContext ?? data.source_note_context),
    source_note_context: adaptEvidenceSourceNoteContext(data.sourceNoteContext ?? data.source_note_context),
    sourceMemoryContext: adaptEvidenceSourceMemoryContext(data.sourceMemoryContext ?? data.source_memory_context),
    source_memory_context: adaptEvidenceSourceMemoryContext(data.sourceMemoryContext ?? data.source_memory_context),
    createdAt: nullableString(data.createdAt ?? data.created_at),
    created_at: nullableString(data.created_at ?? data.createdAt),
    routeHref: nullableString(data.routeHref ?? data.route_href),
    route_href: nullableString(data.route_href ?? data.routeHref),
    managementHref: nullableString(data.managementHref ?? data.management_href),
    management_href: nullableString(data.management_href ?? data.managementHref),
    actionability: adaptEvidenceActionability(data.actionability),
    operation: adaptEvidenceOperation(data.operation, refId),
    relationships: adaptEvidenceRelationships(data.relationships),
    chain: adaptEvidenceChain(data.chain),
    tasks: firstArray<unknown>(data.tasks)
      .map(adaptEvidenceTask)
      .filter((item): item is ManagementEvidenceTask => Boolean(item)),
    auditEvents,
    audit_events: auditEvents,
    allowedActions,
    allowed_actions: allowedActions,
    disabledActionReasons,
    disabled_action_reasons: disabledActionReasons,
    redacted: asBoolean(data.redacted, false),
    requiredCapability: optionalString(data.requiredCapability ?? data.required_capability),
    reason: optionalString(data.reason),
    meta: adaptEvidenceMeta(data.meta ?? (isObject(raw) ? raw.meta : undefined)),
  };
}

export function defaultManagementEvidenceOverview(): ManagementEvidenceOverview {
  return adaptManagementEvidenceOverview({
    items: [
      {
        id: "evref-demo-readiness-001",
        title: "Readiness evidence unavailable",
        sourceType: "unknown",
        linkType: "supporting_evidence",
        capturedAt: "2026-06-15T13:02:00Z",
        credibility: { tier: "unverified", verified: false },
        linkedObjectSummary: {
          entity_type: "readiness",
          entity_ref: "readiness-gate",
          display_label: "Readiness gate",
        },
        resolvedLink: {
          availability: "unavailable",
          route_href: null,
          display_label: "Source unavailable",
          open_in_new_tab: false,
        },
        actionability: {
          state: "unresolved_source",
          severity: "warning",
          reasons: ["unavailable", "resolved_link_unavailable"],
          can_trace: false,
          can_open_source: false,
          can_open_linked_object: false,
        },
        operation: { status: "none", task_refs: [], command_refs: [], audit_refs: [], events: [] },
        allowedActions: {
          canOpenSource: false,
          canOpenLinkedObject: false,
          canInspectChain: true,
          canMarkStale: true,
          canRequestEvidence: true,
          canCreateDispositionTask: true,
          canAssignReviewer: true,
          canResolve: false,
        },
        disabledActionReasons: {
          canOpenSource: "Source unavailable",
          canOpenLinkedObject: "Linked object route is unavailable.",
          canResolve: "No open evidence operation exists to resolve.",
        },
        managementHref: "/management/evidence?ref_id=evref-demo-readiness-001",
      },
    ],
    meta: {
      snapshot_at: "unavailable",
      surfaces: {
        management_evidence: { status: "unavailable", source: "local_snapshot" },
        evidence_refs: { status: "unavailable", source: "local_snapshot" },
      },
      redacted_evidence_count: 0,
    },
  }) as ManagementEvidenceOverview;
}

export function defaultManagementEvidenceDetail(refId = "evref-demo-readiness-001"): ManagementEvidenceDetail {
  return adaptManagementEvidenceDetail({
    ref_id: refId,
    source_document: {
      title: "Readiness evidence unavailable",
      source_type: "unknown",
      excerpt: null,
      storage_preview: { available: false, preview_type: "unavailable" },
      captured_at: "2026-06-15T13:02:00Z",
      captured_by: null,
    },
    link_type: "supporting_evidence",
    credibility: {
      tier: "unverified",
      verified: false,
      last_verified_at: null,
      verification_method: null,
    },
    resolved_link: {
      availability: "unavailable",
      route_href: null,
      display_label: "Source unavailable",
      open_in_new_tab: false,
    },
    linked_object_summary: {
      entity_type: "readiness",
      entity_ref: "readiness-gate",
      display_label: "Readiness gate",
    },
    linked_object_link: {
      availability: "unavailable",
      route_href: null,
      display_label: "Readiness gate",
      reason: "unavailable",
    },
    linked_decisions: [],
    source_note_context: null,
    source_memory_context: null,
    created_at: "2026-06-15T13:02:00Z",
    actionability: {
      state: "unresolved_source",
      severity: "warning",
      reasons: ["unavailable", "resolved_link_unavailable"],
      can_trace: false,
      can_open_source: false,
      can_open_linked_object: false,
    },
    operation: { status: "none", task_refs: [], command_refs: [], audit_refs: [], events: [] },
    relationships: {
      readiness: [
        {
          entity_type: "readiness",
          entity_ref: "readiness-gate",
          display_label: "Readiness gate",
          route_href: null,
          link_type: "supporting_evidence",
          source: "local_snapshot",
        },
      ],
    },
    chain: {
      nodes: [],
      edges: [],
      empty_reason: "unavailable",
      degraded_reasons: ["unavailable"],
    },
    tasks: [],
    auditEvents: [],
    allowedActions: {
      canOpenSource: false,
      canOpenLinkedObject: false,
      canInspectChain: true,
      canMarkStale: true,
      canRequestEvidence: true,
      canCreateDispositionTask: true,
      canAssignReviewer: true,
      canResolve: false,
    },
    disabledActionReasons: {
      canOpenSource: "Source unavailable",
      canOpenLinkedObject: "Linked object route is unavailable.",
      canResolve: "No open evidence operation exists to resolve.",
    },
    meta: {
      snapshot_at: "unavailable",
      surfaces: {
        evidence_ref_detail: "unavailable",
        resolved_link: "unavailable",
        linked_decisions: "unavailable",
      },
      redacted_evidence_count: 0,
    },
  }) as ManagementEvidenceDetail;
}

const normalizeOoda = (value: unknown): ManagementOodaStage => {
  const stage = asString(value).toLowerCase();
  if (stage.startsWith("orient")) return "Orient";
  if (stage.startsWith("decid")) return "Decide";
  if (stage.startsWith("act")) return "Act";
  if (stage.startsWith("learn")) return "Learn";
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
  const providerStatusCounts = asCountRecord(value.providerStatusCounts ?? value.provider_status_counts);
  const countedProviders = Object.values(providerStatusCounts).reduce((total, count) => total + count, 0);
  const providerStatuses = asStringRecord(value.providerStatuses ?? value.provider_statuses);
  const providerCount = asFiniteNumber(
    value.providerCount ?? value.provider_count,
    countedProviders || Object.keys(providerStatuses).length,
  );
  return {
    state: asString(value.state, "not_declared"),
    summary: asString(value.summary),
    entries: firstArrayValue(
      value.entries,
      value.items,
      value.sources,
      value.dataSources,
      value.data_sources,
    )
      ?.map(adaptDataSource)
      .filter((source): source is ManagementDataSource => source !== null),
    providerStatuses,
    providerStatusCounts,
    providerCount,
    requiredSourceCount: asFiniteNumber(value.requiredSourceCount ?? value.required_source_count, 0),
    configuredSourceCount: asFiniteNumber(value.configuredSourceCount ?? value.configured_source_count, providerCount),
    degradedProviderCount: asFiniteNumber(value.degradedProviderCount ?? value.degraded_provider_count, 0),
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
    linkTargets: adaptPersonaFleetLinkTargets(value.linkTargets ?? value.link_targets),
  };
}

function adaptResearchStatus(value: unknown): ManagementResearchStatus | undefined {
  if (!isObject(value)) return undefined;
  const framework = asString(value.framework);
  const frameworks = asStringArray(value.frameworks);
  const frameworkCount = asFiniteNumber(value.frameworkCount ?? value.framework_count, frameworks.length || (framework ? 1 : 0));
  return {
    stage: asString(value.stage, "observe"),
    framework,
    frameworks: frameworks.length > 0 ? frameworks : framework ? [framework] : [],
    frameworkCount,
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
    currentProjectCount: asFiniteNumber(value.currentProjectCount ?? value.current_project_count, 0),
    evidenceRefCount: asFiniteNumber(value.evidenceRefCount ?? value.evidence_ref_count, 0),
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
    linkTargets: adaptPersonaFleetLinkTargets(value.linkTargets ?? value.link_targets),
  };
}

function adaptPersonaFleetRowAction(value: unknown): ManagementPersonaFleetRowAction | undefined {
  if (!isObject(value)) return undefined;
  const actionId = asString(value.actionId ?? value.action_id);
  if (!actionId) return undefined;
  return {
    actionId,
    label: asOptionalString(value.label),
    href: asOptionalString(value.href),
    startupWizardVisible: typeof value.startupWizardVisible === "boolean"
      ? value.startupWizardVisible
      : typeof value.startup_wizard_visible === "boolean"
        ? value.startup_wizard_visible
        : undefined,
  };
}

function adaptPersonaFleetLinkTargets(value: unknown): ManagementPersonaFleetLinkTargets | undefined {
  if (!isObject(value)) return undefined;
  return { ...value } as ManagementPersonaFleetLinkTargets;
}

function firstArrayValue(...values: unknown[]): unknown[] | null {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function normalizePersonaFleetLifecycleState(
  rawState: unknown,
  deploymentStage?: string,
  capitalMode?: string,
): string {
  const state = asString(rawState).trim().toLowerCase();
  if (!state) return "";
  if (["paper_running", "canary_running", "live_running"].includes(state)) return state;
  if ([
    "draft",
    "needs_human_approval",
    "canary_authorized_not_started",
    "rollback_required",
    "paused",
    "retired",
    "stopped",
    "failed",
  ].includes(state)) return state;
  const mode = asString(capitalMode ?? deploymentStage).trim().toLowerCase();
  if (["paper", "canary", "live"].includes(mode)) return `${mode}_running`;
  if (state === "paper" || state === "canary" || state === "live") return `${state}_running`;
  if (["deployed", "active", "running", "ready"].includes(state)) return "paper_running";
  return state;
}

const INVALID_MUTATION_REFERENCE_TOKENS = new Set([
  "",
  "n/a",
  "na",
  "nan",
  "none",
  "null",
  "undefined",
]);
const DATE_MUTATION_REFERENCE = /^\d{4}[-/]\d{2}[-/]\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/;

function normalizeMutationReference(value: unknown): string | null {
  const candidate = asOptionalString(value)?.trim();
  if (!candidate || INVALID_MUTATION_REFERENCE_TOKENS.has(candidate.toLowerCase())) return null;
  return DATE_MUTATION_REFERENCE.test(candidate) ? null : candidate;
}

function normalizeEvolutionHref(value: unknown): string | null {
  const href = asOptionalString(value)?.trim();
  if (!href) return null;
  try {
    const url = new URL(href, "https://pantheon.invalid");
    if (url.origin !== "https://pantheon.invalid" || url.pathname !== "/management/evolution-journal") {
      return null;
    }
    const view = url.searchParams.get("view");
    if (view !== null && !["all", "history", "auto_proposals"].includes(view.trim().toLowerCase())) {
      return null;
    }
    const persona = url.searchParams.get("persona");
    if (persona && INVALID_MUTATION_REFERENCE_TOKENS.has(persona.trim().toLowerCase())) return null;
    for (const key of ["mutation_review", "decision", "item"]) {
      const candidate = url.searchParams.get(key);
      if (candidate !== null && normalizeMutationReference(candidate) === null) return null;
    }
    const source = url.searchParams.get("source");
    if (source && INVALID_MUTATION_REFERENCE_TOKENS.has(source.trim().toLowerCase())) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function adaptPersonaFleetRow(value: unknown): ManagementPersonaFleetRow | null {
  if (!isObject(value)) return null;
  const personaId = asString(value.personaId ?? value.persona_id ?? value.id);
  if (!personaId) return null;

  const perfDelta = optionalFiniteNumber(value.perfDelta ?? value.perf_delta);

  const recommendation = asString(value.recommendation).toLowerCase();
  const governanceRequired = asBoolean(value.governanceRequired ?? value.governance_required, false);
  const humanNeeded = asBoolean(
    value.humanNeeded ?? value.human_needed,
    governanceRequired && !["", "none", "no_change"].includes(recommendation),
  );

  const updated = asString(value.lastMutation ?? value.last_mutation ?? value.updatedAt ?? value.updated_at, "unknown");
  const dataSourceStatus = adaptDataSourceStatus(
    value.dataSourceStatus
    ?? value.data_source_status
    ?? value.dataSourceSummary
    ?? value.data_source_summary,
  );
  const explicitDataSources = firstArrayValue(value.dataSources, value.data_sources)
    ?.map(adaptDataSource)
    .filter((source): source is ManagementDataSource => source !== null);
  const dataSources = [
    ...(explicitDataSources ?? []),
    ...(dataSourceStatus?.entries ?? []),
  ];
  const currentResearchProjects = firstArrayValue(value.currentResearchProjects, value.current_research_projects)
    ?.map(adaptResearchProject)
    .filter((project): project is ManagementResearchProject => project !== null);
  const capitalPool = objectOrEmpty(value.capitalPool ?? value.capital_pool);
  const capitalBinding = objectOrEmpty(value.capitalBinding ?? value.capital_binding);
  const performanceSummary = objectOrEmpty(value.performanceSummary ?? value.performance_summary);
  const telemetryRuntimeCount = optionalFiniteNumber(
    performanceSummary.telemetryRuntimeCount
    ?? performanceSummary.telemetry_runtime_count,
  );
  const hasTradingTelemetry = asBoolean(
    value.hasTradingTelemetry ?? value.has_trading_telemetry,
    (telemetryRuntimeCount ?? 0) > 0,
  );
  const paperLedger = objectOrEmpty(value.paperLedger ?? value.paper_ledger);
  const runtimeBinding = objectOrEmpty(value.runtimeBinding ?? value.runtime_binding);
  const review = objectOrEmpty(value.review);
  const rank = objectOrEmpty(value.rank);
  const capitalMode = asOptionalString(
    value.capitalMode
    ?? value.capital_mode
    ?? capitalPool.mode
    ?? runtimeBinding.capitalMode
    ?? runtimeBinding.capital_mode,
  );
  const normalizedCapitalMode = String(capitalMode ?? "").trim().toLowerCase();
  const paperLedgerId = asOptionalString(
    value.paperLedgerId
    ?? value.paper_ledger_id
    ?? paperLedger.id
    ?? (normalizedCapitalMode === "paper" ? `paper-ledger-${personaId}` : undefined),
  );
  const declaredCapitalPoolId = asOptionalString(value.capitalPoolId ?? value.capital_pool_id ?? capitalPool.id);
  const declaredPaperCapitalPoolId = asOptionalString(
    value.paperCapitalPoolId
    ?? value.paper_capital_pool_id
    ?? value.legacyPaperCapitalPoolId
    ?? value.legacy_paper_capital_pool_id
    ?? capitalPool.paperCapitalPoolId
    ?? capitalPool.paper_capital_pool_id,
  );
  const paperCapitalPoolId = normalizedCapitalMode === "paper" ? declaredPaperCapitalPoolId : undefined;
  const capitalPoolId = normalizedCapitalMode === "paper"
    ? asOptionalString(
        value.targetCapitalPoolId
        ?? value.target_capital_pool_id
        ?? value.liveCapitalPoolId
        ?? value.live_capital_pool_id,
      )
    : declaredCapitalPoolId;
  const deploymentStage = asOptionalString(
    value.deploymentStage
    ?? value.deployment_stage
    ?? runtimeBinding.deploymentStage
    ?? runtimeBinding.deployment_stage,
  );
  const runtimeId = asOptionalString(value.runtimeId ?? value.runtime_id ?? runtimeBinding.runtimeId ?? runtimeBinding.runtime_id);
  const runtimeBindingId = asOptionalString(
    value.runtimeBindingId
    ?? value.runtime_binding_id
    ?? value.bindingId
    ?? value.binding_id
    ?? runtimeBinding.id
    ?? runtimeBinding.runtimeBindingId
    ?? runtimeBinding.runtime_binding_id,
  );
  const capitalScope = asOptionalString(
    value.capitalScope ?? value.capital_scope ?? capitalBinding.capitalScope ?? capitalBinding.capital_scope ?? capitalBinding.scope,
  );
  const capitalScopeId = asOptionalString(
    value.capitalScopeId ?? value.capital_scope_id ?? capitalBinding.capitalScopeId ?? capitalBinding.capital_scope_id ?? capitalBinding.scopeId ?? capitalBinding.scope_id,
  );
  const capitalSleeveId = asOptionalString(
    value.capitalSleeveId ?? value.capital_sleeve_id ?? capitalBinding.capitalSleeveId ?? capitalBinding.capital_sleeve_id,
  );
  const currentWeight = optionalFiniteNumber(
    value.currentWeight ?? value.current_weight ?? capitalBinding.currentWeight ?? capitalBinding.current_weight,
  );
  const targetWeight = optionalFiniteNumber(
    value.targetWeight ?? value.target_weight ?? capitalBinding.targetWeight ?? capitalBinding.target_weight,
  );
  const bindingState = asOptionalString(
    value.bindingState ?? value.binding_state ?? capitalBinding.bindingState ?? capitalBinding.binding_state ?? capitalBinding.state,
  );
  const reviewId = asOptionalString(value.reviewId ?? value.review_id ?? review.id);
  const reviewType = asOptionalString(value.reviewType ?? value.review_type ?? review.type);
  const reviewStatus = asOptionalString(value.reviewStatus ?? value.review_status ?? review.status);
  const inboxId = asOptionalString(value.inboxId ?? value.inbox_id ?? review.inboxId ?? review.inbox_id);
  const leagueRank = optionalFiniteNumber(value.leagueRank ?? value.league_rank ?? rank.leagueRank ?? rank.league_rank);
  const leagueScore = optionalFiniteNumber(value.leagueScore ?? value.league_score ?? rank.leagueScore ?? rank.league_score);

  return {
    personaId,
    personaName: asString(value.personaName ?? value.persona_name ?? value.name, personaId),
    owner: asString(value.owner ?? value.owner_id ?? value.capitalPoolId ?? value.capital_pool_id, "pathreon-management"),
    ooda: normalizeOoda(value.ooda ?? value.oodaStage ?? value.ooda_stage),
    autonomy: normalizeAutonomy(value.autonomy),
    perfDelta: perfDelta ?? Number.NaN,
    hasTradingTelemetry,
    has_trading_telemetry: hasTradingTelemetry,
    isMarketPersonaDefault: asBoolean(
      value.isMarketPersonaDefault ?? value.is_market_persona_default,
      false,
    ),
    seedRow: asBoolean(value.seedRow ?? value.seed_row, false),
    humanNeeded,
    lastMutation: updated.length >= 10 ? updated.slice(0, 10) : updated,
    lastMutationLabel: asOptionalString(value.lastMutationLabel ?? value.last_mutation_label),
    lastMutationAt: asOptionalString(value.lastMutationAt ?? value.last_mutation_at),
    lastMutationKind: asOptionalString(value.lastMutationKind ?? value.last_mutation_kind),
    mutationEntryId: normalizeMutationReference(value.mutationEntryId ?? value.mutation_entry_id),
    evolutionEntryId: normalizeMutationReference(value.evolutionEntryId ?? value.evolution_entry_id),
    evolutionHref: normalizeEvolutionHref(value.evolutionHref ?? value.evolution_href),
    mutationConfidence: asOptionalString(value.mutationConfidence ?? value.mutation_confidence),
    mutationDiagnostics: Array.isArray(value.mutationDiagnostics)
      ? value.mutationDiagnostics.map(String)
      : (Array.isArray(value.mutation_diagnostics) ? value.mutation_diagnostics.map(String) : undefined),
    state: normalizePersonaFleetLifecycleState(
      value.state ?? value.lifecycleState ?? value.lifecycle_state ?? value.status,
      deploymentStage,
      capitalMode,
    ),
    tags: asStringArray(value.tags),
    marketScope: asStringArray(value.marketScope ?? value.market_scope),
    currentWork: asString(value.currentWork ?? value.current_work),
    dataSourceStatus,
    dataSources: dataSources.length > 0 ? dataSources : undefined,
    researchStatus: adaptResearchStatus(
      value.researchStatus
      ?? value.research_status
      ?? value.researchSummary
      ?? value.research_summary,
    ),
    currentResearchProjects,
    runtimeId,
    runtimeBindingId,
    deploymentStage,
    capitalMode,
    paperLedgerId,
    paperCapitalPoolId,
    paperLedger: paperLedgerId ? {
      id: paperLedgerId,
      mode: asOptionalString(paperLedger.mode ?? value.paperLedgerMode ?? value.paper_ledger_mode ?? "paper"),
      isolated: asBoolean(paperLedger.isolated ?? paperLedger.is_isolated ?? value.paperLedgerIsolated ?? value.paper_ledger_isolated, true),
      benchmarkBudget: optionalFiniteNumber(paperLedger.benchmarkBudget ?? paperLedger.benchmark_budget ?? value.paperBenchmarkBudget ?? value.paper_benchmark_budget),
    } : undefined,
    capitalPoolId,
    capitalPool: normalizedCapitalMode !== "paper" && isObject(value.capitalPool ?? value.capital_pool) ? {
      id: asOptionalString(capitalPool.id),
      mode: asOptionalString(capitalPool.mode),
      liveCapitalEnabled: asBoolean(capitalPool.liveCapitalEnabled ?? capitalPool.live_capital_enabled, false),
    } : undefined,
    capitalScope,
    capitalScopeId,
    capitalSleeveId,
    currentWeight,
    targetWeight,
    bindingState,
    performanceSummary: isObject(value.performanceSummary ?? value.performance_summary) ? {
      pnl: optionalFiniteNumber(performanceSummary.pnl),
      sharpe: optionalFiniteNumber(performanceSummary.sharpe),
      maxDrawdown: optionalFiniteNumber(performanceSummary.maxDrawdown ?? performanceSummary.max_drawdown),
      violationCount: optionalFiniteNumber(performanceSummary.violationCount ?? performanceSummary.violation_count),
      totalTrades: optionalFiniteNumber(performanceSummary.totalTrades ?? performanceSummary.total_trades),
      source: asOptionalString(performanceSummary.source),
      telemetryRuntimeCount,
      latestTelemetryAt: asOptionalString(
        performanceSummary.latestTelemetryAt
        ?? performanceSummary.latest_telemetry_at,
      ),
    } : undefined,
    runtimeBinding: isObject(value.runtimeBinding ?? value.runtime_binding) ? {
      id: asOptionalString(runtimeBinding.id),
      runtimeId: asOptionalString(runtimeBinding.runtimeId ?? runtimeBinding.runtime_id),
      state: asOptionalString(runtimeBinding.state ?? runtimeBinding.status),
      deploymentStage: asOptionalString(runtimeBinding.deploymentStage ?? runtimeBinding.deployment_stage),
      capitalMode: asOptionalString(runtimeBinding.capitalMode ?? runtimeBinding.capital_mode),
      health: asOptionalString(runtimeBinding.health),
    } : undefined,
    runtimeHealth: isObject(value.runtimeHealth ?? value.runtime_health)
      ? { ...((value.runtimeHealth ?? value.runtime_health) as Record<string, unknown>) }
      : undefined,
    requiredHumanReview: asOptionalString(value.requiredHumanReview ?? value.required_human_review),
    reviewId,
    reviewType,
    reviewStatus,
    review: isObject(value.review) ? {
      id: asOptionalString(review.id),
      type: asOptionalString(review.type),
      status: asOptionalString(review.status),
      inboxId: asOptionalString(review.inboxId ?? review.inbox_id),
      route: asOptionalString(review.route),
      requiresHumanGate: asBoolean(review.requiresHumanGate ?? review.requires_human_gate, false),
    } : undefined,
    promotionReviewId: asOptionalString(value.promotionReviewId ?? value.promotion_review_id),
    humanGateId: asOptionalString(value.humanGateId ?? value.human_gate_id),
    inboxId,
    leagueRank,
    leagueScore,
    rank: isObject(value.rank) ? {
      leagueRank,
      leagueScore,
      basis: asOptionalString(rank.basis),
    } : undefined,
    rowAction: adaptPersonaFleetRowAction(value.rowAction ?? value.row_action),
    linkTargets: adaptPersonaFleetLinkTargets(value.linkTargets ?? value.link_targets),
    personaPurpose: oneOf(value.personaPurpose ?? value.persona_purpose, ["trading", "advisory_assistant", "unknown"]),
    dataScope: oneOf(value.dataScope ?? value.data_scope, ["regular", "test", "unknown"]),
    classificationConfirmed: typeof (value.classificationConfirmed ?? value.classification_confirmed) === "boolean"
      ? Boolean(value.classificationConfirmed ?? value.classification_confirmed)
      : undefined,
    classificationSource: isObject(value.classificationSource ?? value.classification_source)
      ? {
        purpose: asOptionalString(objectOrEmpty(value.classificationSource ?? value.classification_source).purpose),
        dataScope: asOptionalString(
          objectOrEmpty(value.classificationSource ?? value.classification_source).data_scope
          ?? objectOrEmpty(value.classificationSource ?? value.classification_source).dataScope,
        ),
      }
      : undefined,
    archived: typeof value.archived === "boolean" ? value.archived : undefined,
    personaCycleHealth: adaptPersonaCycleHealth(value.persona_cycle_health ?? value.personaCycleHealth),
  };
}

function adaptPersonaCycleHealth(raw: unknown): ManagementPersonaCycleHealth | undefined {
  if (!isObject(raw)) return undefined;
  const status = asOptionalString(raw.status);
  if (!status) return undefined;
  return {
    status,
    lastPacketId: asOptionalString(raw.last_packet_id ?? raw.lastPacketId),
    stage: asOptionalString(raw.stage),
    failureReason: asOptionalString(raw.failure_reason ?? raw.failureReason),
    updatedAt: asOptionalString(raw.updated_at ?? raw.updatedAt),
    harnessVersion: optionalFiniteNumber(raw.harness_version ?? raw.harnessVersion),
    riskStatus: asOptionalString(raw.risk_status ?? raw.riskStatus),
  };
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const text = asString(value).trim().toLowerCase();
  return (allowed as readonly string[]).includes(text) ? (text as T) : undefined;
}

function countRecord(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(objectOrEmpty(value))) {
    const n = optionalFiniteNumber(raw);
    if (n !== undefined) out[key] = n;
  }
  return out;
}

export function adaptManagementPersonaFleetPage(raw: unknown): ManagementPersonaFleetPage {
  const envelope = objectOrEmpty(raw);
  const data = objectOrEmpty(unwrap(raw));
  const pageInfo = objectOrEmpty(envelope.page_info ?? envelope.pageInfo ?? data.page_info ?? data.pageInfo);
  const summary = objectOrEmpty(data.summary);
  const population = objectOrEmpty(summary.population);
  const token = asOptionalString(pageInfo.next_page_token ?? pageInfo.nextPageToken);
  return {
    rows: adaptManagementPersonaFleet(raw) ?? [],
    nextPageToken: token && token.length > 0 ? token : null,
    total: optionalFiniteNumber(pageInfo.filtered_total ?? pageInfo.filteredTotal ?? pageInfo.total),
    filteredArchivedTotal: optionalFiniteNumber(summary.filtered_archived_total),
    pageSize: optionalFiniteNumber(pageInfo.page_size ?? pageInfo.pageSize),
    population: {
      authorizedTotal: optionalFiniteNumber(population.authorized_total),
      activeTotal: optionalFiniteNumber(population.active_total),
      archivedTotal: optionalFiniteNumber(population.archived_total),
      byPurpose: countRecord(population.by_purpose),
      byDataScope: countRecord(population.by_data_scope),
    },
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

function adaptAllocationPolicyLine(value: unknown): AllocationPolicyLine | null {
  if (!isObject(value)) return null;
  const personaId = asString(value.personaId ?? value.persona_id);
  if (!personaId) return null;
  return {
    personaId,
    stage: asOptionalString(value.stage),
    capitalScope: asString(value.capitalScope ?? value.capital_scope, "real"),
    capitalPoolId: asOptionalString(value.capitalPoolId ?? value.capital_pool_id),
    capitalSleeveId: asOptionalString(value.capitalSleeveId ?? value.capital_sleeve_id),
    currentWeight: asFiniteNumber(value.currentWeight ?? value.current_weight),
    targetWeight: asFiniteNumber(value.targetWeight ?? value.target_weight),
    delta: asFiniteNumber(value.delta),
    rankScore: asFiniteNumber(value.rankScore ?? value.rank_score),
    capacityAdjustedScore: asFiniteNumber(value.capacityAdjustedScore ?? value.capacity_adjusted_score),
    recommendation: asString(value.recommendation, "no_positive_action"),
    capReasons: asStringArray(value.capReasons ?? value.cap_reasons) ?? [],
    exclusions: asStringArray(value.exclusions) ?? [],
    evidenceRefs: asStringArray(value.evidenceRefs ?? value.evidence_refs) ?? [],
    requiresHumanApproval: asBoolean(value.requiresHumanApproval ?? value.requires_human_approval, false),
  };
}

function adaptAllocationPolicyLines(raw: unknown): AllocationPolicyLine[] | null {
  const data = unwrap(raw);
  const lines = isObject(data) ? data.lines : undefined;
  if (!Array.isArray(lines)) return null;
  return lines
    .map(adaptAllocationPolicyLine)
    .filter((line): line is AllocationPolicyLine => line !== null);
}

function allocationPolicyInputRowPayload(row: AllocationPolicyInputRow): Record<string, unknown> {
  return {
    persona_id: row.personaId,
    stage: row.stage,
    tier: row.tier,
    capital_scope: row.capitalScope,
    capital_pool_id: row.capitalPoolId,
    capital_sleeve_id: row.capitalSleeveId,
    current_weight: row.currentWeight ?? 0,
    pnl_score: row.pnlScore ?? 0,
    sharpe_score: row.sharpeScore ?? 0,
    drawdown_control_score: row.drawdownControlScore ?? 0,
    execution_quality_score: row.executionQualityScore ?? 0,
    risk_compliance_score: row.riskComplianceScore ?? 0,
    improvement_score: row.improvementScore ?? 0,
    human_intervention_penalty: row.humanInterventionPenalty ?? 0,
    hard_penalty: row.hardPenalty ?? 0,
    hard_risk_breach: row.hardRiskBreach ?? false,
    human_review_blocked: row.humanReviewBlocked ?? false,
    binding_mismatch: row.bindingMismatch ?? false,
    evidence_refs: row.evidenceRefs ?? [],
  };
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

export interface ManagementCockpitSnapshot {
  snapshotAt: string | null;
  status: string;
  message: string | null;
  health: { status: string; headline: string | null; message: string | null };
  cards: Array<{ id: string; label: string; status: string; summary: string | null }>;
}

function adaptCockpitSnapshot(raw: unknown): ManagementCockpitSnapshot | null {
  const data = unwrap(raw);
  if (!isObject(data) || data.id !== "management-cockpit" ||
      !isObject(data.runtime_health) || !isObject(data.operator_home) ||
      !Array.isArray(data.operator_home.cards)) return null;
  const meta = isObject(raw) && isObject(raw.meta) ? raw.meta : {};
  const surfaces = isObject(meta.surfaces) ? meta.surfaces : {};
  const cockpit = isObject(surfaces.management_cockpit) ? surfaces.management_cockpit : {};
  return {
    snapshotAt: nullableString(data.snapshot_at),
    status: asString(cockpit.status, "unknown"),
    message: nullableString(cockpit.message),
    health: {
      status: asString(data.runtime_health.overall_status, "unknown"),
      headline: nullableString(data.runtime_health.headline),
      message: nullableString(data.runtime_health.message),
    },
    cards: data.operator_home.cards.filter(isObject)
      .filter((card) => typeof card.card_id === "string" && card.card_id.length > 0 &&
        typeof card.label === "string" && card.label.length > 0)
      .map((card) => ({
        id: String(card.card_id), label: String(card.label),
        status: asString(card.status, "unknown"), summary: nullableString(card.summary),
      })),
  };
}

// ---------- PM-6 Human Inbox ----------

const emptyHumanInbox = (): HumanInboxList => [];
const missingHumanInboxDetail = (): HumanInboxDetail | undefined => undefined;

export type PromotionReviewDecisionValue = "approve" | "approve_with_conditions" | "reject";

export interface PromotionReviewDecisionInput {
  decision: PromotionReviewDecisionValue;
  rationale?: string;
  evidenceRefs?: string[];
  approvalDecisionId?: string;
}

export interface PromotionReviewDecisionResult {
  ok: true;
  persisted: boolean;
  reviewId: string;
  status: string;
  idempotencyKey: string;
  decision?: unknown;
  replayed?: boolean;
}

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
      if (isObject(it)) return asString(it.ref ?? it.evidence_ref ?? it.ref_id ?? it.artifact_id ?? it.id ?? it.href ?? it.route);
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
    paper_to_canary_review: "promotion_review",
    canary_to_live_review: "promotion_review",
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

const actionStateBlocksProceed = (actionState: string, kind?: HumanInboxKind): boolean => {
  if (kind === "incident" && actionState === "pending") {
    return false;
  }
  return ["pending", "proposed", "blocked", "unable_to_continue", "cannot_proceed", "needs_human_approval"].includes(
    actionState,
  );
};

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
  if (Object.keys(allowed).length > 0) {
    return false;
  }
  return fallback;
};

const adaptInboxAllowedActions = (raw: unknown, canDecide: boolean): HumanInboxAllowedActions | undefined => {
  const allowed = isObject(raw) ? raw : null;
  if (!allowed) return undefined;
  return {
    canDecide,
    canApprove: asBoolean(allowed.canApprove ?? allowed.can_approve, false),
    canReject: asBoolean(allowed.canReject ?? allowed.can_reject, false),
    canRequestRevision: asBoolean(allowed.canRequestRevision ?? allowed.can_request_revision, false),
    canRequestEvidence: asBoolean(allowed.canRequestEvidence ?? allowed.can_request_evidence, false),
  };
};

const inboxPersonaManageHref = (personaId: string): string =>
  `/management/persona-fleet?persona=${encodeURIComponent(personaId)}`;

const inferInboxRequiredRole = (it: Record<string, unknown>, kind: HumanInboxKind): string => {
  const researchContext = isObject(it.research_context) ? it.research_context : {};
  const recommendation = asString(researchContext.recommendation).toLowerCase();
  if (recommendation.includes("risk_owner")) return "risk-owner";
  if (recommendation.includes("operator")) return "operator";
  if (recommendation.includes("research")) return "research-owner";
  if (kind === "readiness_blocker") return "research-owner";
  return "";
};

const adaptInboxMeetingAction = (
  it: Record<string, unknown>,
  kind: HumanInboxKind,
): HumanInboxItem["meetingAction"] | undefined => {
  if (kind !== "meeting_action") return undefined;
  const nested = isObject(it.meeting_action) ? (it.meeting_action as Record<string, unknown>) : {};
  const src: Record<string, unknown> = { ...nested, ...it };
  const ticketId = asString(src.ticket_id ?? src.action_id ?? it.source_id ?? it.item_id);
  if (!ticketId) return undefined;
  const meetingId = asOptionalString(src.meeting_id ?? src.origin_meeting_id ?? nested.meeting_id);
  const revision = src.revision ?? src.ticket_revision;
  const requestedMaterial = asOptionalString(src.requested_material ?? src.deliverable ?? nested.deliverable);
  const humanRequirement = asOptionalString(src.human_requirement);
  const reviewDecision = isObject(src.review_decision) ? (src.review_decision as Record<string, unknown>) : undefined;
  const inputRequest = isObject(src.input_request) ? (src.input_request as Record<string, unknown>) : undefined;
  const reviewReason = asOptionalString(reviewDecision?.reason);
  const reason = asOptionalString(
    src.reason ??
      inputRequest?.reason ??
      reviewDecision?.reason ??
      src.human_requirement ??
      src.missing_input ??
      it.summary,
  );
  const responseAction = asOptionalString(src.response_action ?? src.next_transition);
  const resumesWith = asOptionalString(src.resumes_with ?? src.resumes_label ?? src.resumes);
  const linksObj = isObject(it.links) ? (it.links as Record<string, unknown>) : {};
  const ticketHref =
    asOptionalString(linksObj.ticket ?? src.ticket_href) ??
    `/api/v1/research/tickets/${encodeURIComponent(ticketId)}`;
  const meetingHref =
    asOptionalString(linksObj.meeting ?? src.href ?? src.route) ??
    (meetingId ? `/management/meetings/${encodeURIComponent(meetingId)}?action=${encodeURIComponent(ticketId)}` : undefined);
  const rawEvidenceRefs = Array.isArray(src.evidence_refs) ? src.evidence_refs : [];
  const evidenceRefs = rawEvidenceRefs
    .map((entry) => {
      if (typeof entry === "string" && entry.trim()) {
        const id = entry.trim();
        return {
          kind: id.startsWith("note-") ? "research_note" : "research_artifact",
          artifactId: id,
          href: resolveMeetingActionEvidenceHref(undefined, id)!,
        };
      }
      if (isObject(entry)) {
        const artifactId = asString(entry.artifact_id ?? entry.id ?? entry.ref ?? entry.evidence_ref);
        if (!artifactId) return null;
        const refKind = asOptionalString(entry.kind);
        const explicitHref = asOptionalString(entry.href ?? entry.route_href ?? entry.routeHref);
        return {
          kind: refKind ?? (artifactId.startsWith("note-") ? "research_note" : "research_artifact"),
          artifactId,
          ...(asOptionalString(entry.checksum) ? { checksum: asOptionalString(entry.checksum) } : {}),
          href: resolveMeetingActionEvidenceHref(refKind, artifactId, explicitHref)!,
        };
      }
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return {
    ticketId,
    meetingId,
    title: asOptionalString(src.title),
    owner: asOptionalString(src.owner),
    assignee: asOptionalString(src.assignee ?? src.owner),
    assigneeKind: asOptionalString(src.assignee_kind ?? nested.assignee_kind),
    reviewerId: asOptionalString(src.reviewer_id ?? nested.reviewer_id),
    deliverable: requestedMaterial,
    requestedMaterial,
    acceptanceCriterion: asOptionalString(src.acceptance_criterion ?? nested.acceptance_criterion),
    dueAt: asOptionalString(src.due_at ?? nested.due_at),
    nextReview: asOptionalString(src.next_review ?? nested.next_review),
    ...(typeof src.overdue === "boolean" ? { overdue: src.overdue } : {}),
    ...(humanRequirement ? { humanRequirement } : {}),
    ...(reviewReason ? { reviewReason } : {}),
    reason,
    missingInput: reason ?? humanRequirement,
    responseAction,
    nextTransition: responseAction,
    requiredActor: asOptionalString(src.required_actor),
    resumesWith,
    resumesLabel: resumesWith,
    state: asOptionalString(src.status ?? src.state ?? src.action_state),
    ownerStatus: asOptionalString(src.owner_status),
    ...(typeof revision === "string" || typeof revision === "number" ? { revision } : {}),
    canRespond: asBoolean(src.can_respond ?? src.canRespond, false),
    ...(evidenceRefs.length > 0 ? { evidenceRefs } : {}),
    ticketHref,
    ...(meetingHref ? { meetingHref } : {}),
  };
};

const adaptInboxRecord = (it: Record<string, unknown>): HumanInboxItem | null => {
  const inferredKind =
    it.incident_id !== undefined || it.incident_cluster_id !== undefined
      ? "incident"
      : it.decision_id !== undefined || it.decision_state !== undefined
        ? "approval"
        : undefined;
  const rawKind = it.kind ?? it.inboxType ?? it.inbox_type ?? it.source_type ?? it.sourceType ?? inferredKind;
  const kind = normalizeInboxKind(rawKind);
  const fallbackReviewId = asString(it.reviewId ?? it.review_id ?? it.source_id);
  const fallbackIncidentId = asString(it.incident_id ?? it.source_id ?? it.sourceId);
  const fallbackDecisionId = asString(it.approval_decision_id ?? it.decision_id);
  const id = asString(
    it.id ?? it.inbox_id ?? it.inboxId,
    kind === "promotion_review" && fallbackReviewId
      ? `promotion_review:${fallbackReviewId}`
      : kind === "incident" && fallbackIncidentId
        ? `incident:${fallbackIncidentId}`
        : kind === "approval" && fallbackDecisionId
          ? `approval:${fallbackDecisionId}`
          : "",
  );
  if (!id) return null;
  const status = asOptionalString(it.status ?? it.decision_state ?? it.state);
  const actionState = asString(it.action_state ?? it.actionState ?? status);
  const defaultCanDecide = kind !== "readiness_blocker" && kind !== "incident";
  const canDecide = kind === "incident"
    ? false
    : asBoolean(
        it.canDecide ?? it.can_decide,
        allowedActionsCanDecide(it.allowedActions ?? it.allowed_actions, defaultCanDecide),
      );
  const canProceed = asBoolean(
    it.canProceed ?? it.can_proceed,
    actionState ? !actionStateBlocksProceed(actionState, kind) : true,
  );
  const personaId = asOptionalString(it.personaId ?? it.persona_id);
  const reviewId = asOptionalString(it.reviewId ?? it.review_id ?? it.source_id);
  const reviewType = asOptionalString(it.reviewType ?? it.review_type);
  const incidentTargetId = kind === "incident"
    ? (asString(it.incident_id ?? it.source_id ?? it.sourceId) || (id.startsWith("incident:") ? id.slice("incident:".length) : id))
    : "";
  const approvalTargetId = kind === "approval"
    ? (asString(it.approval_decision_id ?? it.decision_id) || (id.startsWith("approval:") ? id.slice("approval:".length) : ""))
    : "";
  const sourceId = asOptionalString(
    it.sourceId ??
      it.source_id ??
      (kind === "incident" ? incidentTargetId : undefined) ??
      (kind === "approval" ? approvalTargetId : undefined) ??
      reviewId,
  );
  const decisionHref = asOptionalString(it.decisionHref ?? it.decision_href);
  const blockingReasons = asInboxStringList(it.blockingReasons ?? it.blocking_reasons ?? it.reasons);
  const route = kind === "promotion_review" && personaId
    ? inboxPersonaManageHref(personaId)
    : it.route ??
      it.href ??
      it.manageHref ??
      (isObject(it.target) ? it.target.route : undefined) ??
      (kind === "incident" && incidentTargetId ? `/management/incidents/${encodeURIComponent(incidentTargetId)}` : undefined) ??
      (kind === "approval" && approvalTargetId ? `/management/approvals?approval=${encodeURIComponent(approvalTargetId)}` : undefined);
  const allowedActions = adaptInboxAllowedActions(it.allowedActions ?? it.allowed_actions, canDecide);
  const summaryKey = asOptionalString(it.summary_key ?? it.summaryKey);
  const rawSummaryParams = it.summary_params ?? it.summaryParams;
  const summaryParams = isObject(rawSummaryParams)
    ? { ...(rawSummaryParams as Record<string, unknown>) }
    : undefined;
  const rawEvidenceSummary = asOptionalString(it.evidence_summary ?? it.evidenceSummary);
  const rawSummaryCandidate = asOptionalString(
    it.summary ??
      it.rationale ??
      (!summaryKey && !isRawEvidenceSummaryText(rawEvidenceSummary)
        ? rawEvidenceSummary
        : undefined),
  );
  const summary =
    rawSummaryCandidate && !isRawEvidenceSummaryText(rawSummaryCandidate)
      ? rawSummaryCandidate
      : undefined;
  const approvalTargetType = kind === "approval" ? asOptionalString(it.decision_type ?? it.target_type) : undefined;
  const titleDisplay = asOptionalString(it.title_display ?? it.titleDisplay);
  const rawTitle = asOptionalString(it.title);
  const title = asString(
    titleDisplay ??
      rawTitle ??
      (approvalTargetType ? `${approvalTargetType} approval` : undefined) ??
      summary ??
      id,
  );
  const personaDisplayName = asOptionalString(it.persona_display_name ?? it.personaDisplayName);
  const personaNameMissing =
    typeof it.persona_name_missing === "boolean"
      ? it.persona_name_missing
      : typeof it.personaNameMissing === "boolean"
        ? it.personaNameMissing
        : undefined;
  const strategyId = asOptionalString(it.strategy_id ?? it.strategyId);
  const strategyDisplayName = asOptionalString(it.strategy_display_name ?? it.strategyDisplayName);
  const strategyNameMissing =
    typeof it.strategy_name_missing === "boolean"
      ? it.strategy_name_missing
      : typeof it.strategyNameMissing === "boolean"
        ? it.strategyNameMissing
        : undefined;
  const bindingId = asOptionalString(
    it.binding_id ?? it.bindingId ?? it.runtime_binding_id ?? it.runtimeBindingId,
  );
  const occurrenceCount = optionalFiniteNumber(it.occurrence_count ?? it.occurrenceCount);
  const firstSeenAt = asOptionalString(it.first_seen_at ?? it.firstSeenAt);
  const lastSeenAt = asOptionalString(it.last_seen_at ?? it.lastSeenAt);
  const metric = asOptionalString(it.metric);
  const observed = it.observed;
  const threshold = it.threshold;
  const comparator = asOptionalString(it.comparator);
  return {
    id,
    kind,
    title,
    ...(titleDisplay ? { titleDisplay } : {}),
    ...(rawTitle ? { rawTitle } : {}),
    summary,
    ...(rawEvidenceSummary ? { evidenceSummary: rawEvidenceSummary } : {}),
    ...(summaryKey ? { summaryKey } : {}),
    ...(summaryParams ? { summaryParams } : {}),
    requiredRole: asString(it.requiredRole ?? it.required_role ?? it.actor_role ?? it.submitted_by, inferInboxRequiredRole(it, kind)),
    consequenceIfApproved: asString(it.consequenceIfApproved ?? it.consequence_if_approved ?? ""),
    consequenceIfRejected: asString(it.consequenceIfRejected ?? it.consequence_if_rejected ?? ""),
    consequenceIfIgnored: asString(it.consequenceIfIgnored ?? it.consequence_if_ignored ?? ""),
    ttlSec: typeof it.ttlSec === "number" ? it.ttlSec : typeof it.ttl_sec === "number" ? it.ttl_sec : undefined,
    canDecide,
    canProceed,
    status,
    sourceId,
    personaId,
    ...(personaDisplayName !== undefined ? { personaDisplayName } : {}),
    ...(personaNameMissing !== undefined ? { personaNameMissing } : {}),
    ...(strategyId !== undefined ? { strategyId } : {}),
    ...(strategyDisplayName !== undefined ? { strategyDisplayName } : {}),
    ...(strategyNameMissing !== undefined ? { strategyNameMissing } : {}),
    ...(bindingId !== undefined ? { bindingId } : {}),
    ...(occurrenceCount !== undefined ? { occurrenceCount } : {}),
    ...(firstSeenAt !== undefined ? { firstSeenAt } : {}),
    ...(lastSeenAt !== undefined ? { lastSeenAt } : {}),
    ...(metric !== undefined ? { metric } : {}),
    ...(observed !== undefined ? { observed } : {}),
    ...(threshold !== undefined ? { threshold } : {}),
    ...(comparator !== undefined ? { comparator } : {}),
    reviewId,
    reviewType,
    ...(adaptInboxMeetingAction(it, kind) ? { meetingAction: adaptInboxMeetingAction(it, kind) } : {}),
    decisionHref,
    allowedActions,
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

const extractHumanInboxMeta = (raw: unknown, data?: unknown): HumanInboxList["meta"] => {
  if (isObject(raw) && isObject(raw.meta)) {
    return raw.meta as HumanInboxList["meta"];
  }
  if (isObject(data) && isObject(data.meta)) {
    return data.meta as HumanInboxList["meta"];
  }
  return undefined;
};

const extractHumanInboxPageInfo = (raw: unknown, data?: unknown): HumanInboxPageInfo | undefined => {
  const candidates = [
    isObject(raw) ? raw.page_info : undefined,
    isObject(raw) ? raw.pageInfo : undefined,
    isObject(data) ? data.page_info : undefined,
    isObject(data) ? data.pageInfo : undefined,
  ];
  for (const candidate of candidates) {
    if (isObject(candidate)) {
      const totalRaw = candidate.total;
      const pageSizeRaw = candidate.page_size ?? candidate.pageSize;
      const nextTokenRaw = candidate.next_page_token ?? candidate.nextPageToken;
      const total = typeof totalRaw === "number" && Number.isFinite(totalRaw)
        ? totalRaw
        : typeof totalRaw === "string" && totalRaw.trim() !== "" && Number.isFinite(Number(totalRaw))
          ? Number(totalRaw)
          : undefined;
      const pageSize = typeof pageSizeRaw === "number" && Number.isFinite(pageSizeRaw)
        ? pageSizeRaw
        : typeof pageSizeRaw === "string" && pageSizeRaw.trim() !== "" && Number.isFinite(Number(pageSizeRaw))
          ? Number(pageSizeRaw)
          : undefined;
      const nextPageToken = typeof nextTokenRaw === "string" ? nextTokenRaw : nextTokenRaw === null ? null : undefined;
      return {
        ...(candidate as HumanInboxPageInfo),
        ...(total !== undefined ? { total } : {}),
        ...(pageSize !== undefined ? { page_size: pageSize, pageSize } : {}),
        ...(nextPageToken !== undefined ? { next_page_token: nextPageToken, nextPageToken } : {}),
      };
    }
  }
  return undefined;
};

export function adaptHumanInboxList(raw: unknown): HumanInboxList | null {
  const data = unwrap(raw);
  const arr =
    asArray<Record<string, unknown>>(data) ??
    (isObject(data) ? asArray<Record<string, unknown>>(data.items) : null);
  if (!arr) return null;
  const items: HumanInboxList = arr.map(adaptInboxRecord).filter((it): it is HumanInboxItem => it !== null);
  const meta = extractHumanInboxMeta(raw, data);
  if (meta) {
    items.meta = meta;
  }
  const pageInfo = extractHumanInboxPageInfo(raw, data);
  if (pageInfo) {
    items.page_info = pageInfo;
    items.pageInfo = pageInfo;
  }
  return items;
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

const promotionReviewIdFromInboxId = (id: string): string =>
  id.startsWith("promotion_review:") ? id.slice("promotion_review:".length) : id;

const adaptPromotionReviewDecisionResult = (
  raw: unknown,
  reviewId: string,
  idempotencyKey: string,
): PromotionReviewDecisionResult => {
  const root = isObject(raw) ? raw : {};
  const meta = isObject(root.meta) ? root.meta : {};
  const idem = isObject(meta.idempotency) ? meta.idempotency : {};
  return {
    ok: true,
    persisted: true,
    reviewId,
    status: asString(root.status, "decided"),
    idempotencyKey: asString(idem.idempotencyKey ?? idem.key, idempotencyKey),
    decision: root.decision,
    replayed: asBoolean(idem.replayed, false),
  };
};

// ---------- PM-4 Trading Pulse ----------

const TRADE_JOURNEY_LIST_FOCUS_KEYS = [
  "persona_id",
  "strategy_id",
  "decision_id",
  "order_id",
  "broker_order_id",
] as const;

function sanitizeTradingPulseEntityHref(
  value: unknown,
  kind: "persona" | "strategy" | "journey" | "any" = "any",
): string | undefined {
  const text = asString(value).trim();
  if (
    !text
    || text === "#"
    || text.startsWith("#")
    || !text.startsWith("/")
    || text.startsWith("//")
    || text.includes("\\")
    || /^[a-z][a-z0-9+.-]*:/i.test(text)
  ) {
    return undefined;
  }
  const [withoutHash] = text.split("#");
  const [pathname, rawSearch = ""] = withoutHash.split("?");
  const cleanPath = pathname.replace(/\/+$/, "");
  if (!cleanPath.startsWith("/management/")) {
    return undefined;
  }
  const params = new URLSearchParams(rawSearch);
  const hasParam = (...keys: readonly string[]) =>
    keys.some((key) => Boolean(params.get(key)?.trim()));

  const isPersonaRoute =
    /^\/management\/personas\/[^/]+(?:\/onboarding)?$/.test(cleanPath)
    || (cleanPath === "/management/persona-fleet" && hasParam("persona", "persona_id"));
  const isStrategyRoute = /^\/management\/strategies\/[^/]+$/.test(cleanPath);
  const journeyDetailMatch = /^\/management\/trade-journeys\/([^/]+)$/.exec(cleanPath);
  const isJourneyRoute =
    (journeyDetailMatch !== null && journeyDetailMatch[1] !== "resolve" && journeyDetailMatch[1] !== "events")
    || (cleanPath === "/management/trade-journeys" && hasParam(...TRADE_JOURNEY_LIST_FOCUS_KEYS));

  if (kind === "persona") return isPersonaRoute ? text : undefined;
  if (kind === "strategy") return isStrategyRoute ? text : undefined;
  if (kind === "journey") return isJourneyRoute ? text : undefined;
  if (isPersonaRoute || isStrategyRoute || isJourneyRoute) return text;

  const isOtherSupportedEntityOrFocusRoute =
    /^\/management\/(?:capital|capital-pools|human-inbox|governance|deployments|deployment|evidence|incidents|evolution|persona-intent|experiments|artifacts|meetings|rebalance|rebalances|tools)\/[^/]+$/.test(cleanPath)
    || /^\/management\/(?:governance\/policies|ranking\/formulas|ranking-formulas)\/[^/]+$/.test(cleanPath)
    || /^\/management\/readiness\/(?:broker-live|bff-ha|strict-publish|ep5)$/.test(cleanPath)
    || (cleanPath === "/management/governance-decisions" && hasParam("capital_id", "pool", "item"))
    || (cleanPath === "/management/governance" && hasParam("item"))
    || (cleanPath === "/management/runtimes" && hasParam("runtime", "runtime_id", "persona", "persona_id"))
    || (cleanPath === "/management/evolution-journal" && hasParam("item", "persona", "persona_id"))
    || (cleanPath === "/management/postmortems" && hasParam("item"))
    || (cleanPath === "/management/audit" && hasParam("item"))
    || (/^\/management\/loops(?:\/[^/]+)?$/.test(cleanPath) && hasParam("run"));

  return isOtherSupportedEntityOrFocusRoute ? text : undefined;
}

function firstSanitizedTradingPulseHref(
  kind: "persona" | "strategy" | "journey" | "any",
  ...candidates: unknown[]
): string | undefined {
  for (const candidate of candidates) {
    const sanitized = sanitizeTradingPulseEntityHref(candidate, kind);
    if (sanitized !== undefined) return sanitized;
  }
  return undefined;
}

function buildTradingPulseJourneyHref(
  journeyId: string | null,
  opts: {
    tenantId?: string | null;
    deploymentStage?: string | null;
    decisionId?: string | null;
    orderId?: string | null;
    brokerOrderId?: string | null;
  } = {},
): string | undefined {
  const cleanJourneyId = nullableString(journeyId);
  const decisionId = nullableString(opts.decisionId);
  const orderId = nullableString(opts.orderId);
  const brokerOrderId = nullableString(opts.brokerOrderId);
  if (!cleanJourneyId && !decisionId && !orderId && !brokerOrderId) return undefined;
  return tradeJourneyHref(undefined, {
    journeyId: cleanJourneyId,
    tenantId: opts.tenantId,
    environment: opts.deploymentStage,
    decisionId,
    orderId,
    brokerOrderId,
  });
}

function normalizeTradingPulseLinks(
  value: Record<string, unknown>,
  context: {
    personaId?: string | null;
    strategyId?: string | null;
    journeyId?: string | null;
    decisionId?: string | null;
    orderId?: string | null;
    brokerOrderId?: string | null;
    tenantId?: string | null;
    deploymentStage?: string | null;
  },
): ManagementTradingPulseLinks | undefined {
  const rawLinks = isObject(value.links) ? value.links : undefined;
  const rawOutcome = isObject(value.latestOutcome ?? value.latest_outcome)
    ? (value.latestOutcome ?? value.latest_outcome) as Record<string, unknown>
    : undefined;

  const personaHref =
    firstSanitizedTradingPulseHref(
      "persona",
      rawLinks?.persona,
      rawLinks?.personaHref,
      rawLinks?.persona_href,
    )
    ?? (context.personaId ? (resolveManagementHref("persona", context.personaId) ?? undefined) : undefined);

  const strategyHref =
    firstSanitizedTradingPulseHref(
      "strategy",
      rawLinks?.strategy,
      rawLinks?.strategyHref,
      rawLinks?.strategy_href,
    )
    ?? (context.strategyId ? (resolveManagementHref("strategy", context.strategyId) ?? undefined) : undefined);

  const journeyHref =
    firstSanitizedTradingPulseHref(
      "journey",
      rawLinks?.journey,
      rawLinks?.journeyHref,
      rawLinks?.journey_href,
      rawLinks?.tradeJourney,
      rawLinks?.trade_journey,
      rawOutcome?.journeyHref,
      rawOutcome?.journey_href,
    )
    ?? buildTradingPulseJourneyHref(context.journeyId ?? null, {
      tenantId: context.tenantId,
      deploymentStage: context.deploymentStage,
      decisionId: context.decisionId,
      orderId: context.orderId,
      brokerOrderId: context.brokerOrderId,
    });

  const explicitManageHref = firstSanitizedTradingPulseHref(
    "any",
    rawLinks?.manageHref,
    rawLinks?.manage_href,
    rawLinks?.primaryObjectHref,
    rawLinks?.primary_object_href,
  );
  const manageHref = explicitManageHref ?? personaHref ?? strategyHref ?? journeyHref;
  if (!manageHref) return undefined;

  const primaryObjectHref =
    firstSanitizedTradingPulseHref(
      "any",
      rawLinks?.primaryObjectHref,
      rawLinks?.primary_object_href,
    ) ?? manageHref;

  const out: ManagementTradingPulseLinks = {
    manageHref,
    primaryObjectHref,
  };
  const evidenceHref = firstSanitizedTradingPulseHref(
    "any",
    rawLinks?.evidenceHref,
    rawLinks?.evidence_href,
  );
  if (evidenceHref) out.evidenceHref = evidenceHref;
  const recommendedActionHref = firstSanitizedTradingPulseHref(
    "any",
    rawLinks?.recommendedActionHref,
    rawLinks?.recommended_action_href,
  );
  if (recommendedActionHref) out.recommendedActionHref = recommendedActionHref;
  const auditHref = firstSanitizedTradingPulseHref(
    "any",
    rawLinks?.auditHref,
    rawLinks?.audit_href,
  );
  if (auditHref) out.auditHref = auditHref;
  if (Array.isArray(rawLinks?.relatedHrefs)) {
    const relatedHrefs = rawLinks.relatedHrefs
      .filter(isObject)
      .map((item) => {
        const href = sanitizeTradingPulseEntityHref(item.href, "any");
        if (!href) return null;
        return {
          ...item,
          label: asString(item.label, href),
          href,
          kind: asString(item.kind, "persona") as NonNullable<ManagementTradingPulseLinks["relatedHrefs"]>[number]["kind"],
        };
      })
      .filter((item): item is NonNullable<ManagementTradingPulseLinks["relatedHrefs"]>[number] => item !== null);
    if (relatedHrefs.length > 0) out.relatedHrefs = relatedHrefs;
  }
  if (personaHref) {
    out.persona = personaHref;
    out.personaHref = personaHref;
    out.persona_href = personaHref;
  }
  if (strategyHref) {
    out.strategy = strategyHref;
    out.strategyHref = strategyHref;
    out.strategy_href = strategyHref;
  }
  if (journeyHref) {
    out.journey = journeyHref;
    out.journeyHref = journeyHref;
    out.journey_href = journeyHref;
  }
  return out;
}

function normalizeNullableStringRecord(value: unknown): Record<string, string | null> {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, nullableString(v)] as const),
  );
}

function normalizeComparisonScopePeriod(value: unknown): TradingPulseComparisonScopePeriod {
  const record = isObject(value) ? value : {};
  const startAt = nullableString(record.startAt ?? record.start_at);
  const endAt = nullableString(record.endAt ?? record.end_at);
  const endExclusiveAt = nullableString(record.endExclusiveAt ?? record.end_exclusive_at);
  const asOf = nullableString(record.asOf ?? record.as_of);
  const window = nullableString(record.window);
  const quarter = nullableString(record.quarter);
  return {
    ...record,
    startAt,
    start_at: startAt,
    ...(endAt !== null ? { endAt, end_at: endAt } : {}),
    ...(endExclusiveAt !== null ? { endExclusiveAt, end_exclusive_at: endExclusiveAt } : {}),
    asOf,
    as_of: asOf,
    window,
    ...(quarter !== null ? { quarter } : {}),
  };
}

function normalizeTradingPulseComparisonScope(value: unknown): TradingPulseComparisonScope | null {
  if (!isObject(value)) return null;
  const rawPeriod = value.period;
  const period = isObject(rawPeriod)
    ? normalizeComparisonScopePeriod(rawPeriod)
    : nullableString(rawPeriod);
  return {
    ...value,
    stage: nullableString(value.stage ?? value.deploymentStage ?? value.deployment_stage),
    period,
    unit: nullableString(value.unit),
    definition: nullableString(value.definition),
    basis: nullableString(value.basis),
  };
}

function normalizeTradingPulseFillRateDetails(
  value: unknown,
): ManagementTradingPulseFillRateDetails | null {
  if (!isObject(value)) return null;
  const rawWindow = value.window;
  const window = isObject(rawWindow)
    ? normalizeComparisonScopePeriod(rawWindow)
    : nullableString(rawWindow);
  return {
    ...value,
    status: nullableString(value.status),
    reason: nullableString(value.reason),
    basis: nullableString(value.basis),
    unit: nullableString(value.unit),
    numerator: asNullableNumber(value.numerator),
    denominator: asNullableNumber(value.denominator),
    window,
    ...(Array.isArray(value.sources) ? { sources: value.sources } : {}),
  };
}

function isTradingPulseFillRateKnown(
  details: ManagementTradingPulseFillRateDetails | null,
): boolean {
  if (!details) return true;
  if (details.reason !== null) return false;
  const status = details.status?.trim().toLowerCase() ?? null;
  if (status !== null && status !== "known" && status !== "available" && status !== "ok" && status !== "verified") {
    return false;
  }
  const num = details.numerator;
  const den = details.denominator;
  return num !== null && den !== null && den > 0 && num >= 0;
}

function normalizeTradingPulseMetricPeriods(
  value: unknown,
): Record<string, ManagementTradingPulseMetricPeriod> {
  if (!isObject(value)) return {};
  const entries: Array<[string, ManagementTradingPulseMetricPeriod]> = [];
  for (const [metric, rawEntry] of Object.entries(value)) {
    if (!isObject(rawEntry)) continue;
    const startAt = nullableString(rawEntry.startAt ?? rawEntry.start_at);
    const asOf = nullableString(rawEntry.asOf ?? rawEntry.as_of);
    const window = nullableString(rawEntry.window);
    entries.push([
      metric,
      {
        ...rawEntry,
        startAt,
        start_at: startAt,
        asOf,
        as_of: asOf,
        window,
      },
    ]);
  }
  return Object.fromEntries(entries);
}

function normalizeTradingPulsePerformanceContext(
  rowRecord: Record<string, unknown>,
  telemetrySummary?: Record<string, unknown>,
  metricsRecord?: Record<string, unknown>,
): ManagementTradingPulsePerformanceContext {
  const raw = isObject(rowRecord.performanceContext ?? rowRecord.performance_context)
    ? (rowRecord.performanceContext ?? rowRecord.performance_context) as Record<string, unknown>
    : null;

  const ledgerFillCount = asNullableNumber(
    raw?.ledgerFillCount
    ?? raw?.ledger_fill_count
    ?? rowRecord.ledgerFillCount
    ?? rowRecord.ledger_fill_count
    ?? telemetrySummary?.ledger_fill_count
    ?? telemetrySummary?.ledgerFillCount,
  );
  const pnlCurrency = nullableString(
    raw?.pnlCurrency
    ?? raw?.pnl_currency
    ?? rowRecord.pnlCurrency
    ?? rowRecord.pnl_currency
    ?? telemetrySummary?.pnl_currency
    ?? telemetrySummary?.pnlCurrency,
  );
  const pnlPeriodStartAt = nullableString(
    raw?.pnlPeriodStartAt
    ?? raw?.pnl_period_start_at
    ?? rowRecord.pnlPeriodStartAt
    ?? rowRecord.pnl_period_start_at
    ?? telemetrySummary?.pnl_period_start_at
    ?? telemetrySummary?.pnlPeriodStartAt,
  );
  const pnlAt = nullableString(
    raw?.pnlAt
    ?? raw?.pnl_at
    ?? rowRecord.pnlAt
    ?? rowRecord.pnl_at
    ?? telemetrySummary?.pnl_at
    ?? telemetrySummary?.pnlAt,
  );
  const pnlDefinition = nullableString(
    raw?.pnlDefinition
    ?? raw?.pnl_definition
    ?? rowRecord.pnlDefinition
    ?? rowRecord.pnl_definition
    ?? telemetrySummary?.pnl_definition
    ?? telemetrySummary?.pnlDefinition,
  );
  const fillRateDetails = normalizeTradingPulseFillRateDetails(
    raw?.fillRateDetails
    ?? raw?.fill_rate_details
    ?? telemetrySummary?.fill_rate_details
    ?? telemetrySummary?.fillRateDetails
    ?? metricsRecord?.fill_rate_details
    ?? metricsRecord?.fillRateDetails,
  );
  const fillRateBasis = nullableString(
    raw?.fillRateBasis
    ?? raw?.fill_rate_basis
    ?? fillRateDetails?.basis
    ?? (raw ? "legacy_source_scalar" : null),
  );
  const sharpeRatioStatus = nullableString(
    raw?.sharpeRatioStatus
    ?? raw?.sharpe_ratio_status
    ?? telemetrySummary?.sharpe_ratio_status
    ?? telemetrySummary?.sharpeRatioStatus,
  );
  const sharpeRatioReason = nullableString(
    raw?.sharpeRatioReason
    ?? raw?.sharpe_ratio_reason
    ?? telemetrySummary?.sharpe_ratio_reason
    ?? telemetrySummary?.sharpeRatioReason,
  );
  const rawStaleness = raw?.staleness ?? telemetrySummary?.staleness;
  const staleness = isObject(rawStaleness) ? { ...rawStaleness } : null;

  const metricUnits = normalizeNullableStringRecord(raw?.metricUnits ?? raw?.metric_units);
  const metricPeriods = normalizeTradingPulseMetricPeriods(raw?.metricPeriods ?? raw?.metric_periods);

  const latestReportAt = nullableString(
    raw?.latestReportAt
    ?? raw?.latest_report_at
    ?? telemetrySummary?.last_event_at
    ?? telemetrySummary?.lastEventAt
    ?? telemetrySummary?.collected_at
    ?? telemetrySummary?.collectedAt,
  );

  const rawLastFill = isObject(telemetrySummary?.last_fill ?? telemetrySummary?.lastFill ?? rowRecord.last_fill ?? rowRecord.lastFill)
    ? (telemetrySummary?.last_fill ?? telemetrySummary?.lastFill ?? rowRecord.last_fill ?? rowRecord.lastFill) as Record<string, unknown>
    : null;
  const lastFillAt = nullableString(
    raw?.lastFillAt
    ?? raw?.last_fill_at
    ?? rawLastFill?.at
    ?? rawLastFill?.occurred_at
    ?? rawLastFill?.occurredAt
    ?? rawLastFill?.created_at
    ?? rawLastFill?.createdAt,
  );
  const snapshotAt = nullableString(raw?.snapshotAt ?? raw?.snapshot_at);

  const isStale = Boolean(
    staleness && (
      staleness.is_stale === true
      || staleness.isStale === true
      || String(staleness.status ?? "").trim().toLowerCase() === "stale"
      || (
        typeof staleness.age_seconds === "number"
        && typeof staleness.threshold_seconds === "number"
        && staleness.age_seconds > staleness.threshold_seconds
      )
    ),
  );
  const hasObservedSourceEvidence = Boolean(
    telemetrySummary
    || latestReportAt !== null
    || lastFillAt !== null
    || ledgerFillCount !== null
    || (
      fillRateDetails !== null
      && (isTradingPulseFillRateKnown(fillRateDetails) || fillRateDetails.reason === "no_submitted_orders")
    )
    || (metricsRecord && Object.values(metricsRecord).some((v) => typeof v === "number" && Number.isFinite(v))),
  );
  const explicitSourceStatus = nullableString(raw?.sourceStatus ?? raw?.source_status);
  const sourceStatus: ManagementTradingPulseSourceStatus = explicitSourceStatus
    ?? (isStale ? "stale" : hasObservedSourceEvidence ? "available" : "unverified");

  const metricReasons: Record<string, string | null> = {
    ...normalizeNullableStringRecord(raw?.metricReasons ?? raw?.metric_reasons),
  };
  if (fillRateDetails !== null && !isTradingPulseFillRateKnown(fillRateDetails) && !metricReasons.fill_rate) {
    const den = fillRateDetails.denominator;
    const num = fillRateDetails.numerator;
    const detailsStatus = fillRateDetails.status?.trim().toLowerCase() ?? null;
    const normalizedSourceStatus = String(sourceStatus ?? "").trim().toLowerCase();
    const isSourceVerifiedAvailable =
      ["available", "ok", "live", "fresh", "verified"].includes(normalizedSourceStatus);
    const isDetailsStatusVerified =
      detailsStatus === "known"
      || detailsStatus === "available"
      || detailsStatus === "ok"
      || detailsStatus === "verified";
    if (normalizedSourceStatus === "unavailable" || detailsStatus === "unavailable") {
      metricReasons.fill_rate =
        fillRateDetails.reason === "telemetry_unavailable"
          ? "telemetry_unavailable"
          : "source_unavailable";
    } else if (normalizedSourceStatus === "stale" || detailsStatus === "stale") {
      metricReasons.fill_rate =
        fillRateDetails.reason === "telemetry_stale"
          ? "telemetry_stale"
          : "stale";
    } else if (fillRateDetails.reason !== null) {
      metricReasons.fill_rate = fillRateDetails.reason;
    } else if (
      isSourceVerifiedAvailable
      && isDetailsStatusVerified
      && den !== null
      && den === 0
      && (num === null || num === 0)
    ) {
      metricReasons.fill_rate = "no_submitted_orders";
    } else {
      metricReasons.fill_rate =
        fillRateDetails.status
        ?? (normalizedSourceStatus === "unknown" || normalizedSourceStatus === "unverified"
          ? "unknown"
          : "source_unavailable");
    }
  }
  if (
    (sharpeRatioReason !== null || sharpeRatioStatus !== null)
    && asNullableNumber(metricsRecord?.sharpe_ratio ?? metricsRecord?.sharpeRatio) === null
    && !metricReasons.sharpe_ratio
  ) {
    metricReasons.sharpe_ratio = sharpeRatioReason ?? sharpeRatioStatus;
  }

  return {
    ...(raw ?? {}),
    ledgerFillCount,
    ledger_fill_count: ledgerFillCount,
    pnlCurrency,
    pnl_currency: pnlCurrency,
    pnlPeriodStartAt,
    pnl_period_start_at: pnlPeriodStartAt,
    pnlAt,
    pnl_at: pnlAt,
    pnlDefinition,
    pnl_definition: pnlDefinition,
    fillRateDetails,
    fill_rate_details: fillRateDetails,
    fillRateBasis,
    fill_rate_basis: fillRateBasis,
    sharpeRatioStatus,
    sharpe_ratio_status: sharpeRatioStatus,
    sharpeRatioReason,
    sharpe_ratio_reason: sharpeRatioReason,
    staleness,
    metricReasons,
    metric_reasons: metricReasons,
    metricUnits,
    metric_units: metricUnits,
    metricPeriods,
    metric_periods: metricPeriods,
    latestReportAt,
    latest_report_at: latestReportAt,
    lastFillAt,
    last_fill_at: lastFillAt,
    snapshotAt,
    snapshot_at: snapshotAt,
    sourceStatus,
    source_status: sourceStatus,
  };
}

function normalizeTradingPulseLatestOutcome(
  value: unknown,
): ManagementTradingPulseLatestOutcome {
  const raw = isObject(value) ? value : null;
  if (!raw) {
    return {
      status: "not_observed",
      occurredAt: null,
      occurred_at: null,
      reasonCode: null,
      reason_code: null,
      submittedToBroker: null,
      submitted_to_broker: null,
      requestedQuantity: null,
      requested_quantity: null,
      filledQuantity: null,
      filled_quantity: null,
      required: null,
      available: null,
      currency: null,
      journeyId: null,
      journey_id: null,
      sourceEventId: null,
      source_event_id: null,
      focusStage: null,
      focus_stage: null,
      decisionId: null,
      decision_id: null,
      orderId: null,
      order_id: null,
      brokerOrderId: null,
      broker_order_id: null,
      side: null,
      symbol: null,
      journeyHref: null,
      journey_href: null,
    };
  }
  const occurredAt = nullableString(raw.occurredAt ?? raw.occurred_at);
  const reasonCode = nullableString(
    raw.reasonCode ?? raw.reason_code ?? raw.rejectReason ?? raw.reject_reason ?? raw.reason,
  );
  const submittedToBroker = asNullableBoolean(raw.submittedToBroker ?? raw.submitted_to_broker);
  const requestedQuantity = asNullableNumber(raw.requestedQuantity ?? raw.requested_quantity);
  const filledQuantity = asNullableNumber(raw.filledQuantity ?? raw.filled_quantity);
  const required = asNullableNumber(raw.required);
  const available = asNullableNumber(raw.available);
  const currency = nullableString(raw.currency);
  const journeyId = nullableString(raw.journeyId ?? raw.journey_id);
  const sourceEventId = nullableString(
    raw.sourceEventId ?? raw.source_event_id ?? raw.eventId ?? raw.event_id,
  );
  const focusStage = nullableString(raw.focusStage ?? raw.focus_stage);
  const decisionId = nullableString(raw.decisionId ?? raw.decision_id);
  const orderId = nullableString(raw.orderId ?? raw.order_id);
  const brokerOrderId = nullableString(raw.brokerOrderId ?? raw.broker_order_id);
  const side = nullableString(raw.side);
  const symbol = nullableString(raw.symbol);
  const journeyHref =
    sanitizeTradingPulseEntityHref(raw.journeyHref ?? raw.journey_href, "journey") ?? null;
  const status = asString(
    raw.status,
    journeyId || reasonCode || occurredAt ? "available" : "not_observed",
  );
  return {
    ...raw,
    status,
    occurredAt,
    occurred_at: occurredAt,
    reasonCode,
    reason_code: reasonCode,
    submittedToBroker,
    submitted_to_broker: submittedToBroker,
    requestedQuantity,
    requested_quantity: requestedQuantity,
    filledQuantity,
    filled_quantity: filledQuantity,
    required,
    available,
    currency,
    journeyId,
    journey_id: journeyId,
    sourceEventId,
    source_event_id: sourceEventId,
    focusStage,
    focus_stage: focusStage,
    decisionId,
    decision_id: decisionId,
    orderId,
    order_id: orderId,
    brokerOrderId,
    broker_order_id: brokerOrderId,
    side,
    symbol,
    journeyHref,
    journey_href: journeyHref,
  };
}

function normalizeTradingPulseOperatorScope(
  value: unknown,
): ManagementTradingPulseOperatorScope {
  const raw = isObject(value) ? value : null;
  if (!raw) {
    return {
      status: "unverified",
      tenantId: null,
      tenant_id: null,
      personaCount: null,
      persona_count: null,
      runtimeCount: null,
      runtime_count: null,
      verifiedRuntimeCount: null,
      verified_runtime_count: null,
      reason: "operator_scope_missing",
      byStage: {},
      by_stage: {},
    };
  }
  const status = asString(raw.status, "unverified");
  const tenantId = nullableString(raw.tenantId ?? raw.tenant_id);
  const personaCount = asNullableNumber(raw.personaCount ?? raw.persona_count);
  const runtimeCount = asNullableNumber(raw.runtimeCount ?? raw.runtime_count);
  const verifiedRuntimeCount = asNullableNumber(
    raw.verifiedRuntimeCount ?? raw.verified_runtime_count,
  );
  const excludedProbeCount = asNullableNumber(
    raw.excludedProbeCount ?? raw.excluded_probe_count,
  );
  const reason = nullableString(raw.reason);
  const rawByStage = isObject(raw.byStage ?? raw.by_stage)
    ? (raw.byStage ?? raw.by_stage) as Record<string, unknown>
    : {};
  const byStageEntries: Array<[string, ManagementTradingPulseStageScopeCount]> = [];
  for (const [stage, entry] of Object.entries(rawByStage)) {
    if (isObject(entry)) {
      const pc = asNullableNumber(entry.personaCount ?? entry.persona_count);
      const rc = asNullableNumber(entry.runtimeCount ?? entry.runtime_count);
      byStageEntries.push([
        stage,
        {
          ...entry,
          personaCount: pc,
          persona_count: pc,
          runtimeCount: rc,
          runtime_count: rc,
        },
      ]);
    } else {
      const rc = asNullableNumber(entry);
      byStageEntries.push([
        stage,
        {
          personaCount: null,
          persona_count: null,
          runtimeCount: rc,
          runtime_count: rc,
        },
      ]);
    }
  }
  const byStage = Object.fromEntries(byStageEntries);
  return {
    ...raw,
    status,
    tenantId,
    tenant_id: tenantId,
    personaCount,
    persona_count: personaCount,
    runtimeCount,
    runtime_count: runtimeCount,
    verifiedRuntimeCount,
    verified_runtime_count: verifiedRuntimeCount,
    ...(excludedProbeCount !== null
      ? { excludedProbeCount, excluded_probe_count: excludedProbeCount }
      : {}),
    reason,
    byStage,
    by_stage: byStage,
  };
}

function normalizeTradingPulsePnlGroups(
  value: unknown,
): ManagementTradingPulsePnlGroup[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).map((item) => {
    const stage = nullableString(item.stage ?? item.deploymentStage ?? item.deployment_stage);
    const currency = nullableString(item.currency ?? item.pnlCurrency ?? item.pnl_currency);
    const periodStartAt = nullableString(item.periodStartAt ?? item.period_start_at);
    const periodEndAt = nullableString(
      item.periodEndAt ?? item.period_end_at ?? item.asOf ?? item.as_of,
    );
    const periodLabel = nullableString(item.periodLabel ?? item.period_label ?? item.period);
    const asOf = nullableString(
      item.asOf ?? item.as_of ?? item.periodEndAt ?? item.period_end_at,
    );
    const pnlDefinition = nullableString(item.pnlDefinition ?? item.pnl_definition);
    const groupValue = asNullableNumber(
      item.value ?? item.pnl ?? item.totalPnl ?? item.total_pnl,
    );
    const coveredPersonaCount = asNullableNumber(
      item.coveredPersonaCount ?? item.covered_persona_count,
    );
    const eligiblePersonaCount = asNullableNumber(
      item.eligiblePersonaCount ?? item.eligible_persona_count,
    );
    const coveredRuntimeCount = asNullableNumber(
      item.coveredRuntimeCount ?? item.covered_runtime_count,
    );
    const eligibleRuntimeCount = asNullableNumber(
      item.eligibleRuntimeCount ?? item.eligible_runtime_count,
    );
    return {
      ...item,
      stage,
      currency,
      periodStartAt,
      period_start_at: periodStartAt,
      periodEndAt,
      period_end_at: periodEndAt,
      ...(periodLabel !== null ? { periodLabel, period_label: periodLabel } : {}),
      asOf,
      as_of: asOf,
      pnlDefinition,
      pnl_definition: pnlDefinition,
      value: groupValue,
      coveredPersonaCount,
      covered_persona_count: coveredPersonaCount,
      eligiblePersonaCount,
      eligible_persona_count: eligiblePersonaCount,
      coveredRuntimeCount,
      covered_runtime_count: coveredRuntimeCount,
      eligibleRuntimeCount,
      eligible_runtime_count: eligibleRuntimeCount,
    };
  });
}

// Pull a numeric metric off a live ranking item, tolerating camel/snake names
// and a few metric aliases the BFF uses (sharpe→sharpeRatio, execution→fillRate).
function rankingMetricValue(it: Record<string, unknown>, metric: string): number | null {
  const aliases: Record<string, string[]> = {
    pnl: ["pnl"],
    drawdown: ["drawdown", "maxDrawdown", "max_drawdown"],
    sharpe: ["sharpeRatio", "sharpe_ratio", "sharpe"],
    sharpe_ratio: ["sharpe_ratio", "sharpeRatio", "sharpe"],
    execution: ["fillRate", "fill_rate"],
    fill_rate: ["fillRate", "fill_rate"],
    slippage: ["avgSlippageBps", "avg_slippage_bps", "slippage_bps", "slippageBps"],
    avg_slippage_bps: ["avg_slippage_bps", "avgSlippageBps", "slippage_bps", "slippageBps"],
  };
  const camel = metric.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
  const keys = [
    ...(aliases[metric] ?? [metric, camel]),
    "ranking_metric_value",
    "rankingMetricValue",
    "metricValue",
    "metric_value",
  ];
  for (const k of keys) {
    const v = asNullableNumber(it[k]);
    if (v !== null) return v;
  }
  return null;
}

function normalizeTradingPulseRankingsSummary(
  value: unknown,
  fallbackBlockCount = 0,
): ManagementTradingPulseRankingsSummary | undefined {
  if (!isObject(value)) return undefined;
  const operatorScope = normalizeTradingPulseOperatorScope(
    value.operatorScope ?? value.operator_scope,
  );
  const pnlGroups = normalizeTradingPulsePnlGroups(value.pnlGroups ?? value.pnl_groups);
  const hasExplicitRuntimeCount =
    Object.prototype.hasOwnProperty.call(value, "runtimeCount")
    || Object.prototype.hasOwnProperty.call(value, "runtime_count");
  const hasExplicitOperatorScope =
    isObject(value.operatorScope) || isObject(value.operator_scope);
  const runtimeCount = hasExplicitRuntimeCount
    ? asNullableNumber(value.runtimeCount ?? value.runtime_count)
    : hasExplicitOperatorScope
      ? operatorScope.runtimeCount
      : null;
  const rankingBlockCount = asFiniteNumber(
    value.rankingBlockCount ?? value.ranking_block_count,
    fallbackBlockCount,
  );
  const rankedItemCount = asFiniteNumber(
    value.rankedItemCount ?? value.ranked_item_count,
    0,
  );
  const eligibleItemCount = asFiniteNumber(
    value.eligibleItemCount ?? value.eligible_item_count,
    0,
  );
  const missingMetricItemCount = asFiniteNumber(
    value.missingMetricItemCount ?? value.missing_metric_item_count,
    0,
  );
  const criteria = asStringArray(value.criteria);
  const limit = asNullableNumber(value.limit);
  const topRuntimeId = nullableString(value.topRuntimeId ?? value.top_runtime_id);
  return {
    ...value,
    operatorScope,
    operator_scope: operatorScope,
    pnlGroups,
    pnl_groups: pnlGroups,
    runtimeCount,
    runtime_count: runtimeCount,
    rankingBlockCount,
    ranking_block_count: rankingBlockCount,
    rankedItemCount,
    ranked_item_count: rankedItemCount,
    eligibleItemCount,
    eligible_item_count: eligibleItemCount,
    missingMetricItemCount,
    missing_metric_item_count: missingMetricItemCount,
    criteria,
    limit,
    topRuntimeId,
    top_runtime_id: topRuntimeId,
  };
}

export function adaptTradingPulseRankings(raw: unknown): TradingPulseRankingsList | null {
  const root = isObject(raw) ? raw : null;
  const data = unwrap(raw);
  const dataRecord = isObject(data) ? data : null;
  const blocks =
    asArray<Record<string, unknown>>(data) ??
    (dataRecord
      ? asArray<Record<string, unknown>>(
          dataRecord.rankingBlocks
          ?? dataRecord.ranking_blocks
          ?? dataRecord.rankings
          ?? dataRecord.blocks
          ?? dataRecord.items,
        )
      : null);
  if (!blocks) return null;

  const adaptedBlocks = blocks.map((b) => {
    // Already FE-shaped (mock seed / older contract) → pass through untouched.
    if (Array.isArray((b as { rows?: unknown }).rows) && !Array.isArray((b as { items?: unknown }).items)) {
      return b as unknown as TradingPulseRankBlock;
    }
    const metric = asString(b.metric ?? b.kind ?? b.blockId ?? b.block_id);
    const blockId = asString(b.blockId ?? b.block_id ?? b.kind ?? metric);
    const label = asString(b.label, metric || blockId);
    const sortOrder = optionalString(b.sortOrder ?? b.sort_order);
    const secondaryMetric = optionalString(b.secondaryMetric ?? b.secondary_metric);
    const rankingBasis = optionalString(b.rankingBasis ?? b.ranking_basis);
    const rawMetricReasons = isObject(b.metricReasons ?? b.metric_reasons)
      ? normalizeNullableStringRecord(b.metricReasons ?? b.metric_reasons)
      : undefined;
    const rawItems = asArray<Record<string, unknown>>(b.items) ?? [];
    const skippedMissingIds: string[] = [];

    const rows: TradingPulseRankRow[] = [];
    for (const it of rawItems) {
      if (!isObject(it)) continue;
      const runtimeId = asString(it.runtimeId ?? it.runtime_id);
      const runtimeBindingId = asString(it.runtimeBindingId ?? it.runtime_binding_id);
      const deploymentStage = asString(it.deploymentStage ?? it.deployment_stage);
      const personaId = nullableString(it.personaId ?? it.persona_id);
      const personaName = nullableString(it.personaName ?? it.persona_name);
      const strategyId = nullableString(it.strategyId ?? it.strategy_id);
      const strategyName = nullableString(it.strategyName ?? it.strategy_name);
      const underlyingSymbol = nullableString(it.underlyingSymbol ?? it.underlying_symbol);
      const tenantId = nullableString(it.tenantId ?? it.tenant_id);
      const hasPerfContext = isObject(it.performanceContext ?? it.performance_context);
      const performanceContext = hasPerfContext
        ? normalizeTradingPulsePerformanceContext(it)
        : null;
      if (
        it.rankingEligible === false
        || it.ranking_eligible === false
        || (
          performanceContext !== null
          && (
            performanceContext.sourceStatus === "stale"
            || performanceContext.sourceStatus === "unavailable"
            || Boolean(performanceContext.metricReasons[metric])
            || (
              (metric === "fill_rate" || metric === "execution")
              && (
                !isTradingPulseFillRateKnown(performanceContext.fillRateDetails)
                || Boolean(performanceContext.metricReasons.fill_rate)
              )
            )
          )
        )
      ) {
        if (runtimeId) skippedMissingIds.push(runtimeId);
        continue;
      }
      if (
        metric === "pnl"
        && performanceContext !== null
        && (
          !performanceContext.pnlCurrency
          || !performanceContext.pnlPeriodStartAt
          || !performanceContext.pnlAt
          || !performanceContext.pnlDefinition
        )
      ) {
        if (runtimeId) skippedMissingIds.push(runtimeId);
        continue;
      }
      const metricValue = rankingMetricValue(it, metric);
      if (metricValue === null) {
        if (runtimeId) skippedMissingIds.push(runtimeId);
        continue;
      }

      const hasLatestOutcome = isObject(it.latestOutcome ?? it.latest_outcome);
      const latestOutcome = hasLatestOutcome
        ? normalizeTradingPulseLatestOutcome(it.latestOutcome ?? it.latest_outcome)
        : null;
      const comparisonScope = normalizeTradingPulseComparisonScope(
        it.comparisonScope ?? it.comparison_scope,
      );
      const unit = nullableString(
        it.metricUnit
        ?? it.metric_unit
        ?? it.rankingUnit
        ?? it.ranking_unit
        ?? comparisonScope?.unit
        ?? performanceContext?.metricUnits?.[metric],
      );
      const links = normalizeTradingPulseLinks(it, {
        personaId,
        strategyId,
        journeyId: latestOutcome?.journeyId ?? nullableString(it.journeyId ?? it.journey_id),
        decisionId: latestOutcome?.decisionId ?? nullableString(it.decisionId ?? it.decision_id),
        orderId: latestOutcome?.orderId ?? nullableString(it.orderId ?? it.order_id),
        brokerOrderId: latestOutcome?.brokerOrderId ?? nullableString(it.brokerOrderId ?? it.broker_order_id),
        tenantId,
        deploymentStage: deploymentStage || null,
      });
      if (latestOutcome && links?.journeyHref) {
        latestOutcome.journeyHref = links.journeyHref;
        latestOutcome.journey_href = links.journeyHref;
      }
      const subjectId = asString(
        it.subjectId ?? (runtimeBindingId || personaId || runtimeId),
      );
      const subjectLabel =
        nullableString(it.subjectLabel)
        ?? personaName
        ?? strategyName
        ?? (runtimeId || subjectId);
      const rank = asNullableNumber(it.rank) ?? (rows.length + 1);
      const rankingMetric = asString(it.rankingMetric ?? it.ranking_metric, metric);
      const rankingBlockId = asString(it.rankingBlockId ?? it.ranking_block_id, blockId);
      const avgSlippageBps = asNullableNumber(
        it.avgSlippageBps ?? it.avg_slippage_bps ?? it.slippageBps ?? it.slippage_bps,
      );

      const row: TradingPulseRankRow = {
        ...it,
        subjectId,
        subjectLabel,
        metric: label,
        metricValue,
        metricUnit: unit ?? undefined,
        metric_unit: unit,
        rankingUnit: unit,
        ranking_unit: unit,
        rankingMetric,
        ranking_metric: rankingMetric,
        rankingMetricValue: metricValue,
        ranking_metric_value: metricValue,
        rankingBlockId,
        ranking_block_id: rankingBlockId,
        rank,
        ...(avgSlippageBps !== null ? { avgSlippageBps, avg_slippage_bps: avgSlippageBps } : {}),
        personaId,
        persona_id: personaId,
        personaName,
        persona_name: personaName,
        strategyId,
        strategy_id: strategyId,
        strategyName,
        strategy_name: strategyName,
        underlyingSymbol,
        underlying_symbol: underlyingSymbol,
        tenantId,
        tenant_id: tenantId,
        runtimeId,
        runtime_id: runtimeId,
        runtimeBindingId,
        runtime_binding_id: runtimeBindingId,
        deploymentStage,
        deployment_stage: deploymentStage,
        status: asString(it.status),
        comparisonScope,
        comparison_scope: comparisonScope,
        performanceContext,
        performance_context: performanceContext,
        latestOutcome,
        latest_outcome: latestOutcome,
        links,
        rankingEligible: true,
        ranking_eligible: true,
      };
      if (links === undefined) {
        delete row.links;
      }
      rows.push(row);
    }

    const wireMissingIds = Array.isArray(b.missingMetricRuntimeIds ?? b.missing_metric_runtime_ids)
      ? asStringArray(b.missingMetricRuntimeIds ?? b.missing_metric_runtime_ids)
      : [];
    const missingMetricRuntimeIds = Array.from(new Set([...wireMissingIds, ...skippedMissingIds]));
    const missingMetricCount = asFiniteNumber(
      b.missingMetricCount ?? b.missing_metric_count,
      missingMetricRuntimeIds.length,
    );
    const eligibleItemCount = asFiniteNumber(
      b.eligibleItemCount ?? b.eligible_item_count,
      rows.length,
    );

    const block: TradingPulseRankBlock = {
      ...b,
      kind: blockId,
      blockId,
      block_id: blockId,
      label,
      metric,
      ...(sortOrder !== undefined ? { sortOrder, sort_order: sortOrder } : {}),
      ...(secondaryMetric !== undefined ? { secondaryMetric, secondary_metric: secondaryMetric } : {}),
      ...(rankingBasis !== undefined ? { rankingBasis, ranking_basis: rankingBasis } : {}),
      ...(rawMetricReasons !== undefined ? { metricReasons: rawMetricReasons, metric_reasons: rawMetricReasons } : {}),
      rows,
      items: rows,
      eligibleItemCount,
      eligible_item_count: eligibleItemCount,
      missingMetricCount,
      missing_metric_count: missingMetricCount,
      missingMetricRuntimeIds,
      missing_metric_runtime_ids: missingMetricRuntimeIds,
    };
    return block;
  }) as TradingPulseRankingsList;

  const rawSummary = dataRecord?.summary ?? root?.summary;
  const normalizedSummary = normalizeTradingPulseRankingsSummary(rawSummary, adaptedBlocks.length);
  if (normalizedSummary !== undefined) {
    Object.defineProperty(adaptedBlocks, "summary", {
      value: normalizedSummary,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  const rawMeta = root?.meta ?? dataRecord?.meta;
  if (isObject(rawMeta)) {
    Object.defineProperty(adaptedBlocks, "meta", {
      value: normalizeTradingPulseMeta(rawMeta),
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  return adaptedBlocks;
}

const adaptRankings = adaptTradingPulseRankings;

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

const TRADING_PULSE_COVERAGE_NUMBER_KEYS = [
  ["runtimeCount", "runtime_count"],
  ["paperRuntimeCount", "paper_runtime_count"],
  ["telemetryCoverageCount", "telemetry_coverage_count"],
  ["monitoringCoverageCount", "monitoring_coverage_count"],
  ["baselineComparisonCount", "baseline_comparison_count"],
  ["baselineRequiredCount", "baseline_required_count"],
  ["rowHealthDegradedCount", "row_health_degraded_count"],
  ["retiredRuntimeCount", "retired_runtime_count"],
  ["availableCount", "available_count"],
  ["missingCount", "missing_count"],
] as const;

const TRADING_PULSE_COVERAGE_LIST_KEYS = [
  ["missingTelemetryRuntimeIds", "missing_telemetry_runtime_ids"],
  ["missingMonitoringRuntimeIds", "missing_monitoring_runtime_ids"],
  ["missingBaselineRuntimeIds", "missing_baseline_runtime_ids"],
  ["degradedRuntimeIds", "degraded_runtime_ids"],
] as const;

function normalizeTradingPulseMetricCoverageEntry(
  value: unknown,
): ManagementTradingPulseMetricCoverageEntry | undefined {
  if (!isObject(value)) return undefined;
  const out: ManagementTradingPulseMetricCoverageEntry = { ...value };
  const availableCount = asNullableNumber(value.availableCount ?? value.available_count);
  const missingCount = asNullableNumber(value.missingCount ?? value.missing_count);
  const runtimeCount = asNullableNumber(value.runtimeCount ?? value.runtime_count);
  const rawMissingIds = value.missingRuntimeIds ?? value.missing_runtime_ids;
  if (availableCount !== null) {
    out.availableCount = availableCount;
    out.available_count = availableCount;
  } else {
    delete out.availableCount;
    delete out.available_count;
  }
  if (missingCount !== null) {
    out.missingCount = missingCount;
    out.missing_count = missingCount;
  } else {
    delete out.missingCount;
    delete out.missing_count;
  }
  if (runtimeCount !== null) {
    out.runtimeCount = runtimeCount;
    out.runtime_count = runtimeCount;
  } else {
    delete out.runtimeCount;
    delete out.runtime_count;
  }
  if (Array.isArray(rawMissingIds)) {
    const missingRuntimeIds = asStringArray(rawMissingIds);
    out.missingRuntimeIds = missingRuntimeIds;
    out.missing_runtime_ids = missingRuntimeIds;
  } else {
    delete out.missingRuntimeIds;
    delete out.missing_runtime_ids;
  }
  return out;
}

function normalizeTradingPulseMetricCoverageMap(
  value: unknown,
): Record<string, ManagementTradingPulseMetricCoverageEntry> | undefined {
  if (!isObject(value)) return undefined;
  const entries: Array<[string, ManagementTradingPulseMetricCoverageEntry]> = [];
  for (const [metric, entry] of Object.entries(value)) {
    const normalized = normalizeTradingPulseMetricCoverageEntry(entry);
    if (normalized) {
      entries.push([metric, normalized]);
    }
  }
  return Object.fromEntries(entries);
}

function normalizeTradingPulseCoverage(
  primaryCoverage: unknown,
  secondaryCoverage?: unknown,
  summaryFallback?: unknown,
): ManagementTradingPulseCoverage | undefined {
  const covPrimary = isObject(primaryCoverage) ? primaryCoverage : null;
  const covSecondary = isObject(secondaryCoverage) ? secondaryCoverage : null;
  const sumFallback = isObject(summaryFallback) ? summaryFallback : null;
  const sources = [covPrimary, covSecondary, sumFallback].filter(
    (item): item is Record<string, unknown> => item !== null,
  );
  if (sources.length === 0) return undefined;

  const pick = (camelKey: string, snakeKey: string): unknown => {
    for (const source of sources) {
      if (source[camelKey] !== undefined && source[camelKey] !== null) return source[camelKey];
      if (source[snakeKey] !== undefined && source[snakeKey] !== null) return source[snakeKey];
    }
    return undefined;
  };

  const out: ManagementTradingPulseCoverage = {
    ...(covSecondary ?? {}),
    ...(covPrimary ?? {}),
  };

  for (const [camelKey, snakeKey] of TRADING_PULSE_COVERAGE_NUMBER_KEYS) {
    const num = asNullableNumber(pick(camelKey, snakeKey));
    if (num !== null) {
      out[camelKey] = num;
      out[snakeKey] = num;
    } else {
      delete out[camelKey];
      delete out[snakeKey];
    }
  }

  const rawRowHealthCounts = pick("rowHealthStatusCounts", "row_health_status_counts");
  if (isObject(rawRowHealthCounts)) {
    const counts = asCountRecord(rawRowHealthCounts);
    out.rowHealthStatusCounts = counts;
    out.row_health_status_counts = counts;
  } else {
    delete out.rowHealthStatusCounts;
    delete out.row_health_status_counts;
  }

  for (const [camelKey, snakeKey] of TRADING_PULSE_COVERAGE_LIST_KEYS) {
    const rawList = pick(camelKey, snakeKey);
    if (Array.isArray(rawList)) {
      const list = asStringArray(rawList);
      out[camelKey] = list;
      out[snakeKey] = list;
    } else {
      delete out[camelKey];
      delete out[snakeKey];
    }
  }

  const rawMetricCoverage = pick("metricCoverage", "metric_coverage");
  const metricCoverage = normalizeTradingPulseMetricCoverageMap(rawMetricCoverage);
  if (metricCoverage !== undefined) {
    out.metricCoverage = metricCoverage;
    out.metric_coverage = metricCoverage;
  } else {
    delete out.metricCoverage;
    delete out.metric_coverage;
  }

  if (Object.keys(out).length === 0 && !covPrimary && !covSecondary) {
    return undefined;
  }
  return out;
}

function normalizeTradingPulseMeta(
  value: unknown,
  coverageOverride?: ManagementTradingPulseCoverage,
): ManagementTradingPulseMeta {
  const record = isObject(value) ? value : {};
  const snapshotAt = asString(record.snapshotAt ?? record.snapshot_at);
  const surfacesRecord = isObject(record.surfaces) ? record.surfaces : {};
  const surfaces = Object.fromEntries(
    Object.entries(surfacesRecord).map(([key, surface]) => [
      key,
      normalizeTradingPulseSurface(surface),
    ]),
  );
  const coverage = coverageOverride ?? normalizeTradingPulseCoverage(record.coverage);
  return {
    ...record,
    snapshotAt,
    snapshot_at: snapshotAt,
    surfaces,
    ...(coverage !== undefined ? { coverage } : {}),
  };
}

function normalizeTradingPulseSummary(
  value: unknown,
  coverageOverride?: ManagementTradingPulseCoverage,
): ManagementTradingPulseSummary {
  const record = isObject(value) ? value : {};
  const coverage = coverageOverride ?? normalizeTradingPulseCoverage(record.coverage, undefined, record);
  const operatorScope = normalizeTradingPulseOperatorScope(
    record.operatorScope ?? record.operator_scope,
  );
  const pnlGroups = normalizeTradingPulsePnlGroups(
    record.pnlGroups ?? record.pnl_groups,
  );
  const fillRateAggregation = nullableString(
    record.fillRateAggregation ?? record.fill_rate_aggregation,
  );
  const snapshotAt = optionalString(record.snapshotAt ?? record.snapshot_at);
  const hasExplicitRuntimeCount =
    Object.prototype.hasOwnProperty.call(record, "runtimeCount")
    || Object.prototype.hasOwnProperty.call(record, "runtime_count");
  const hasExplicitOperatorScope =
    isObject(record.operatorScope) || isObject(record.operator_scope);
  const runtimeCount = hasExplicitRuntimeCount
    ? asNullableNumber(record.runtimeCount ?? record.runtime_count)
    : hasExplicitOperatorScope
      ? operatorScope.runtimeCount
      : (asNullableNumber(coverage?.runtimeCount) ?? 0);
  const hasExplicitTotalTrades =
    Object.prototype.hasOwnProperty.call(record, "totalTrades")
    || Object.prototype.hasOwnProperty.call(record, "total_trades");
  const totalTrades = hasExplicitTotalTrades
    ? asNullableNumber(record.totalTrades ?? record.total_trades)
    : null;
  const monitoringCoverageCount = asNullableNumber(
    record.monitoringCoverageCount ?? record.monitoring_coverage_count ?? coverage?.monitoringCoverageCount,
  );
  const paperRuntimeCount = asNullableNumber(
    record.paperRuntimeCount ?? record.paper_runtime_count ?? coverage?.paperRuntimeCount,
  );
  const baselineRequiredCount = asNullableNumber(
    record.baselineRequiredCount ?? record.baseline_required_count ?? coverage?.baselineRequiredCount,
  );
  const retiredRuntimeCount = asNullableNumber(
    record.retiredRuntimeCount ?? record.retired_runtime_count,
  );
  const rowHealthDegradedCount = asNullableNumber(
    record.rowHealthDegradedCount ?? record.row_health_degraded_count ?? coverage?.rowHealthDegradedCount,
  );
  const rawRowHealthStatusCounts =
    record.rowHealthStatusCounts ?? record.row_health_status_counts ?? coverage?.rowHealthStatusCounts;
  const rowHealthStatusCounts = isObject(rawRowHealthStatusCounts)
    ? asCountRecord(rawRowHealthStatusCounts)
    : undefined;
  const rawMissingTelemetry =
    record.missingTelemetryRuntimeIds ?? record.missing_telemetry_runtime_ids ?? coverage?.missingTelemetryRuntimeIds;
  const missingTelemetryRuntimeIds = Array.isArray(rawMissingTelemetry)
    ? asStringArray(rawMissingTelemetry)
    : undefined;
  const rawMissingMonitoring =
    record.missingMonitoringRuntimeIds ?? record.missing_monitoring_runtime_ids ?? coverage?.missingMonitoringRuntimeIds;
  const missingMonitoringRuntimeIds = Array.isArray(rawMissingMonitoring)
    ? asStringArray(rawMissingMonitoring)
    : undefined;
  const rawMissingBaseline =
    record.missingBaselineRuntimeIds ?? record.missing_baseline_runtime_ids ?? coverage?.missingBaselineRuntimeIds;
  const missingBaselineRuntimeIds = Array.isArray(rawMissingBaseline)
    ? asStringArray(rawMissingBaseline)
    : undefined;
  const rawDegradedIds =
    record.degradedRuntimeIds ?? record.degraded_runtime_ids ?? coverage?.degradedRuntimeIds;
  const degradedRuntimeIds = Array.isArray(rawDegradedIds)
    ? asStringArray(rawDegradedIds)
    : undefined;
  const metricCoverage =
    normalizeTradingPulseMetricCoverageMap(record.metricCoverage ?? record.metric_coverage)
    ?? coverage?.metricCoverage;

  const out: ManagementTradingPulseSummary = {
    ...record,
    operatorScope,
    operator_scope: operatorScope,
    pnlGroups,
    pnl_groups: pnlGroups,
    ...(fillRateAggregation !== null
      ? { fillRateAggregation, fill_rate_aggregation: fillRateAggregation }
      : {}),
    ...(snapshotAt !== undefined
      ? { snapshotAt, snapshot_at: snapshotAt }
      : {}),
    runtimeCount,
    runtime_count: runtimeCount,
    telemetryCoverageCount: asFiniteNumber(
      record.telemetryCoverageCount ?? record.telemetry_coverage_count ?? coverage?.telemetryCoverageCount,
      0,
    ),
    baselineComparisonCount: asFiniteNumber(
      record.baselineComparisonCount ?? record.baseline_comparison_count ?? coverage?.baselineComparisonCount,
      0,
    ),
    baselineBreachedCount: asFiniteNumber(record.baselineBreachedCount ?? record.baseline_breached_count, 0),
    baselineWatchCount: asFiniteNumber(record.baselineWatchCount ?? record.baseline_watch_count, 0),
    totalPnl: asNullableNumber(record.totalPnl ?? record.total_pnl),
    worstDrawdown: asNullableNumber(record.worstDrawdown ?? record.worst_drawdown),
    averageFillRate: asNullableNumber(record.averageFillRate ?? record.average_fill_rate),
    worstSlippageBps: asNullableNumber(record.worstSlippageBps ?? record.worst_slippage_bps),
    totalTrades,
    total_trades: totalTrades,
    byStatus: asCountRecord(record.byStatus ?? record.by_status),
    byStage: asCountRecord(record.byStage ?? record.by_stage),
    byBaselineStatus: asCountRecord(record.byBaselineStatus ?? record.by_baseline_status),
    ...(coverage !== undefined ? { coverage } : {}),
  };

  if (monitoringCoverageCount !== null) {
    out.monitoringCoverageCount = monitoringCoverageCount;
    out.monitoring_coverage_count = monitoringCoverageCount;
  } else {
    delete out.monitoringCoverageCount;
    delete out.monitoring_coverage_count;
  }
  if (paperRuntimeCount !== null) {
    out.paperRuntimeCount = paperRuntimeCount;
    out.paper_runtime_count = paperRuntimeCount;
  } else {
    delete out.paperRuntimeCount;
    delete out.paper_runtime_count;
  }
  if (baselineRequiredCount !== null) {
    out.baselineRequiredCount = baselineRequiredCount;
    out.baseline_required_count = baselineRequiredCount;
  } else {
    delete out.baselineRequiredCount;
    delete out.baseline_required_count;
  }
  if (retiredRuntimeCount !== null) {
    out.retiredRuntimeCount = retiredRuntimeCount;
    out.retired_runtime_count = retiredRuntimeCount;
  } else {
    delete out.retiredRuntimeCount;
    delete out.retired_runtime_count;
  }
  if (rowHealthDegradedCount !== null) {
    out.rowHealthDegradedCount = rowHealthDegradedCount;
    out.row_health_degraded_count = rowHealthDegradedCount;
  } else {
    delete out.rowHealthDegradedCount;
    delete out.row_health_degraded_count;
  }
  if (rowHealthStatusCounts !== undefined) {
    out.rowHealthStatusCounts = rowHealthStatusCounts;
    out.row_health_status_counts = rowHealthStatusCounts;
  }
  if (missingTelemetryRuntimeIds !== undefined) {
    out.missingTelemetryRuntimeIds = missingTelemetryRuntimeIds;
    out.missing_telemetry_runtime_ids = missingTelemetryRuntimeIds;
  }
  if (missingMonitoringRuntimeIds !== undefined) {
    out.missingMonitoringRuntimeIds = missingMonitoringRuntimeIds;
    out.missing_monitoring_runtime_ids = missingMonitoringRuntimeIds;
  }
  if (missingBaselineRuntimeIds !== undefined) {
    out.missingBaselineRuntimeIds = missingBaselineRuntimeIds;
    out.missing_baseline_runtime_ids = missingBaselineRuntimeIds;
  }
  if (degradedRuntimeIds !== undefined) {
    out.degradedRuntimeIds = degradedRuntimeIds;
    out.degraded_runtime_ids = degradedRuntimeIds;
  }
  if (metricCoverage !== undefined) {
    out.metricCoverage = metricCoverage;
    out.metric_coverage = metricCoverage;
  }

  return out;
}

function normalizeTradingPulseCardDetails(value: unknown): Record<string, unknown> {
  if (!isObject(value)) return {};
  const out: Record<string, unknown> = { ...value };

  if (isObject(value.byStatus ?? value.by_status)) {
    const byStatus = asCountRecord(value.byStatus ?? value.by_status);
    out.byStatus = byStatus;
    out.by_status = byStatus;
  }
  if (isObject(value.byStage ?? value.by_stage)) {
    const byStage = asCountRecord(value.byStage ?? value.by_stage);
    out.byStage = byStage;
    out.by_stage = byStage;
  }
  if (isObject(value.rowHealthStatusCounts ?? value.row_health_status_counts)) {
    const rowHealthStatusCounts = asCountRecord(
      value.rowHealthStatusCounts ?? value.row_health_status_counts,
    );
    out.rowHealthStatusCounts = rowHealthStatusCounts;
    out.row_health_status_counts = rowHealthStatusCounts;
  }
  if (Array.isArray(value.degradedRuntimeIds ?? value.degraded_runtime_ids)) {
    const degradedRuntimeIds = asStringArray(
      value.degradedRuntimeIds ?? value.degraded_runtime_ids,
    );
    out.degradedRuntimeIds = degradedRuntimeIds;
    out.degraded_runtime_ids = degradedRuntimeIds;
  }
  if ("telemetryCoverageCount" in value || "telemetry_coverage_count" in value) {
    const telemetryCoverageCount = asNullableNumber(
      value.telemetryCoverageCount ?? value.telemetry_coverage_count,
    );
    out.telemetryCoverageCount = telemetryCoverageCount;
    out.telemetry_coverage_count = telemetryCoverageCount;
  }
  if ("metricCoverage" in value || "metric_coverage" in value) {
    const metricCoverage = normalizeTradingPulseMetricCoverageEntry(
      value.metricCoverage ?? value.metric_coverage,
    );
    if (metricCoverage !== undefined) {
      out.metricCoverage = metricCoverage;
      out.metric_coverage = metricCoverage;
    } else {
      out.metricCoverage = null;
      out.metric_coverage = null;
    }
  }
  if ("worstSlippageBps" in value || "worst_slippage_bps" in value) {
    const worstSlippageBps = asNullableNumber(
      value.worstSlippageBps ?? value.worst_slippage_bps,
    );
    out.worstSlippageBps = worstSlippageBps;
    out.worst_slippage_bps = worstSlippageBps;
  }
  if ("baselineComparisonCount" in value || "baseline_comparison_count" in value) {
    const baselineComparisonCount = asNullableNumber(
      value.baselineComparisonCount ?? value.baseline_comparison_count,
    );
    out.baselineComparisonCount = baselineComparisonCount;
    out.baseline_comparison_count = baselineComparisonCount;
  }
  if ("baselineRequiredCount" in value || "baseline_required_count" in value) {
    const baselineRequiredCount = asNullableNumber(
      value.baselineRequiredCount ?? value.baseline_required_count,
    );
    out.baselineRequiredCount = baselineRequiredCount;
    out.baseline_required_count = baselineRequiredCount;
  }
  if (isObject(value.byBaselineStatus ?? value.by_baseline_status)) {
    const byBaselineStatus = asCountRecord(
      value.byBaselineStatus ?? value.by_baseline_status,
    );
    out.byBaselineStatus = byBaselineStatus;
    out.by_baseline_status = byBaselineStatus;
  }
  if (Array.isArray(value.missingBaselineRuntimeIds ?? value.missing_baseline_runtime_ids)) {
    const missingBaselineRuntimeIds = asStringArray(
      value.missingBaselineRuntimeIds ?? value.missing_baseline_runtime_ids,
    );
    out.missingBaselineRuntimeIds = missingBaselineRuntimeIds;
    out.missing_baseline_runtime_ids = missingBaselineRuntimeIds;
  }

  return out;
}

function normalizeTradingPulseCard(value: unknown): ManagementTradingPulseCard | null {
  if (!isObject(value)) return null;
  const cardId = asString(value.cardId ?? value.card_id ?? value.id);
  const label = asString(value.label, cardId || "Metric");
  const details = normalizeTradingPulseCardDetails(value.details);
  return {
    ...value,
    cardId: cardId || label.toLowerCase().replace(/\s+/g, "-"),
    card_id: asString(value.card_id ?? cardId),
    label,
    value: typeof value.value === "string" ? value.value : asNullableNumber(value.value),
    details,
  };
}

function normalizePulseSnapshot(value: unknown): ManagementTradingPulseSnapshot | undefined {
  if (!isObject(value)) return undefined;
  const metrics = isObject(value.metrics) ? value.metrics : {};
  return {
    captured_at: asString(value.captured_at),
    observed_at: asString(value.observed_at),
    deployment_stage: asString(value.deployment_stage),
    metrics: Object.fromEntries(Object.entries({
      ...metrics,
      ...(Object.prototype.hasOwnProperty.call(value, "return_percent") ? { return_percent: value.return_percent } : {}),
    }).map(([key, metric]) => [key, typeof metric === "number" && Number.isFinite(metric) ? metric : null])),
  };
}

function normalizePulseDriftGroups(value: unknown): ManagementTradingPulseDriftGroup[] {
  if (!Array.isArray(value)) return [];
  const number = (raw: unknown) => typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  return value.filter(isObject).map((group) => ({
    group_id: asString(group.group_id),
    label: asString(group.label ?? group.group_id),
    metrics: (Array.isArray(group.metrics) ? group.metrics : []).filter(isObject)
      .filter((metric) => asString(metric.metric_id).length > 0)
      .map((metric) => ({
        metric_id: asString(metric.metric_id), label: asString(metric.label), unit: asString(metric.unit),
        baseline_value: number(metric.baseline_value), observed_value: number(metric.observed_value),
        delta: number(metric.delta), status: asString(metric.status, "unknown"),
      })),
  }));
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
    strategyId: asString(value.strategyId ?? value.strategy_id),
    strategy_id: asString(value.strategyId ?? value.strategy_id),
    paperBaseline: normalizePulseSnapshot(value.paperBaseline ?? value.paper_baseline),
    observedState: normalizePulseSnapshot(value.observedState ?? value.observed_state),
    driftGroups: normalizePulseDriftGroups(value.driftGroups ?? value.drift_groups),
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
  const personaId = nullableString(value.personaId ?? value.persona_id);
  const personaName = nullableString(value.personaName ?? value.persona_name);
  const strategyId = asString(value.strategyId ?? value.strategy_id);
  const strategyName = nullableString(value.strategyName ?? value.strategy_name);
  const underlyingSymbol = nullableString(value.underlyingSymbol ?? value.underlying_symbol);
  const tenantId = nullableString(value.tenantId ?? value.tenant_id);
  const telemetrySummary = isObject(value.telemetrySummary ?? value.telemetry_summary)
    ? (value.telemetrySummary ?? value.telemetry_summary) as Record<string, unknown>
    : undefined;
  const rawMetrics: Record<string, unknown> = {
    ...(isObject(value.metrics) ? value.metrics : {}),
    ...(isObject(telemetrySummary?.metrics) ? (telemetrySummary.metrics as Record<string, unknown>) : {}),
  };
  const performanceContext = normalizeTradingPulsePerformanceContext(value, telemetrySummary, rawMetrics);
  const metrics: Record<string, unknown> = { ...rawMetrics };
  if (performanceContext.ledgerFillCount !== null && performanceContext.ledgerFillCount >= 0) {
    metrics.total_trades = performanceContext.ledgerFillCount;
  }
  const hasExplicitNullFillRate =
    (Object.prototype.hasOwnProperty.call(rawMetrics, "fill_rate") && rawMetrics.fill_rate === null)
    || (Object.prototype.hasOwnProperty.call(rawMetrics, "fillRate") && rawMetrics.fillRate === null);
  const fillRateUnavailable =
    performanceContext.sourceStatus === "unavailable"
    || performanceContext.sourceStatus === "stale"
    || !isTradingPulseFillRateKnown(performanceContext.fillRateDetails)
    || Boolean(performanceContext.metricReasons.fill_rate);
  if (fillRateUnavailable) {
    metrics.fill_rate = null;
    if ("fillRate" in metrics) metrics.fillRate = null;
  } else if (
    !hasExplicitNullFillRate
    && performanceContext.fillRateDetails !== null
    && asNullableNumber(metrics.fill_rate ?? metrics.fillRate) === null
  ) {
    const num = performanceContext.fillRateDetails.numerator;
    const den = performanceContext.fillRateDetails.denominator;
    if (num !== null && den !== null && den > 0) {
      metrics.fill_rate = num / den;
    }
  }
  const executedTradeCount = performanceContext.ledgerFillCount !== null && performanceContext.ledgerFillCount >= 0
    ? performanceContext.ledgerFillCount
    : asNullableNumber(
        value.executedTradeCount
        ?? value.executed_trade_count
        ?? telemetrySummary?.executed_trade_count
        ?? telemetrySummary?.executedTradeCount,
      );
  const totalTrades = performanceContext.ledgerFillCount !== null && performanceContext.ledgerFillCount >= 0
    ? performanceContext.ledgerFillCount
    : asNullableNumber(
        value.totalTrades
        ?? value.total_trades
        ?? metrics.total_trades
        ?? metrics.totalTrades,
      );
  const positionCount = asNullableNumber(
    value.positionCount
    ?? value.position_count
    ?? telemetrySummary?.position_count
    ?? telemetrySummary?.positionCount,
  );
  const latestOutcome = normalizeTradingPulseLatestOutcome(
    value.latestOutcome ?? value.latest_outcome,
  );
  const links = normalizeTradingPulseLinks(value, {
    personaId,
    strategyId: strategyId || null,
    journeyId: latestOutcome.journeyId,
    decisionId: latestOutcome.decisionId,
    orderId: latestOutcome.orderId,
    brokerOrderId: latestOutcome.brokerOrderId,
    tenantId,
    deploymentStage: deploymentStage || null,
  });
  if (links?.journeyHref) {
    latestOutcome.journeyHref = links.journeyHref;
    latestOutcome.journey_href = links.journeyHref;
  }
  const baselineComparison = normalizeBaselineComparison(value.baselineComparison ?? value.baseline_comparison);
  const rowHealth = isObject(value.rowHealth ?? value.row_health)
    ? (value.rowHealth ?? value.row_health) as Record<string, unknown>
    : undefined;
  const lastUpdatedAt = asString(value.lastUpdatedAt ?? value.last_updated_at);
  const out: ManagementTradingPulseRuntimeRow = {
    ...value,
    ...(personaId !== null ? { personaId, persona_id: personaId } : {}),
    personaName,
    persona_name: personaName,
    runtimeId,
    runtime_id: runtimeId,
    runtimeBindingId,
    runtime_binding_id: runtimeBindingId,
    deploymentStage,
    deployment_stage: deploymentStage,
    status: asString(value.status),
    strategyId,
    strategy_id: strategyId,
    strategyName,
    strategy_name: strategyName,
    underlyingSymbol,
    underlying_symbol: underlyingSymbol,
    tenantId,
    tenant_id: tenantId,
    executedTradeCount,
    executed_trade_count: executedTradeCount,
    totalTrades,
    total_trades: totalTrades,
    positionCount,
    position_count: positionCount,
    metrics,
    telemetrySummary,
    telemetry_summary: telemetrySummary,
    performanceContext,
    performance_context: performanceContext,
    latestOutcome,
    latest_outcome: latestOutcome,
    ...(links !== undefined ? { links } : {}),
    baselineComparison,
    baseline_comparison: baselineComparison,
    rowHealth,
    row_health: rowHealth,
    lastUpdatedAt,
    last_updated_at: lastUpdatedAt,
  };
  if (links === undefined) {
    delete out.links;
  }
  return out;
}

function normalizeTradingPulseRankingEntry(
  value: unknown,
): ManagementTradingPulseRankingEntry | null {
  if (!isObject(value)) return null;
  const runtimeId = asString(value.runtimeId ?? value.runtime_id);
  const runtimeBindingId = asString(value.runtimeBindingId ?? value.runtime_binding_id);
  const deploymentStage = asString(value.deploymentStage ?? value.deployment_stage);
  const personaId = nullableString(value.personaId ?? value.persona_id);
  const personaName = nullableString(value.personaName ?? value.persona_name);
  const strategyId = nullableString(value.strategyId ?? value.strategy_id);
  const strategyName = nullableString(value.strategyName ?? value.strategy_name);
  const underlyingSymbol = nullableString(value.underlyingSymbol ?? value.underlying_symbol);
  const tenantId = nullableString(value.tenantId ?? value.tenant_id);
  const pnl = asNullableNumber(value.pnl);
  const drawdown = asNullableNumber(value.drawdown ?? value.maxDrawdown ?? value.max_drawdown);
  const sharpeRatio = asNullableNumber(value.sharpeRatio ?? value.sharpe_ratio ?? value.sharpe);
  const rawFillRate = asNullableNumber(value.fillRate ?? value.fill_rate);
  const avgSlippageBps = asNullableNumber(
    value.avgSlippageBps ?? value.avg_slippage_bps ?? value.slippageBps ?? value.slippage_bps,
  );
  const performanceContext = normalizeTradingPulsePerformanceContext(value, undefined, {
    pnl,
    drawdown,
    sharpe_ratio: sharpeRatio,
    fill_rate: rawFillRate,
    avg_slippage_bps: avgSlippageBps,
  });
  const fillRate =
    (!isTradingPulseFillRateKnown(performanceContext.fillRateDetails) || Boolean(performanceContext.metricReasons.fill_rate))
      ? null
      : rawFillRate;
  const totalTrades = performanceContext.ledgerFillCount !== null && performanceContext.ledgerFillCount >= 0
    ? performanceContext.ledgerFillCount
    : asNullableNumber(value.totalTrades ?? value.total_trades);
  const latestOutcome = normalizeTradingPulseLatestOutcome(
    value.latestOutcome ?? value.latest_outcome,
  );
  const links = normalizeTradingPulseLinks(value, {
    personaId,
    strategyId,
    journeyId: latestOutcome.journeyId ?? nullableString(value.journeyId ?? value.journey_id),
    decisionId: latestOutcome.decisionId ?? nullableString(value.decisionId ?? value.decision_id),
    orderId: latestOutcome.orderId ?? nullableString(value.orderId ?? value.order_id),
    brokerOrderId: latestOutcome.brokerOrderId ?? nullableString(value.brokerOrderId ?? value.broker_order_id),
    tenantId,
    deploymentStage: deploymentStage || null,
  });
  if (links?.journeyHref) {
    latestOutcome.journeyHref = links.journeyHref;
    latestOutcome.journey_href = links.journeyHref;
  }
  const lastUpdatedAt = nullableString(value.lastUpdatedAt ?? value.last_updated_at);
  const baselineComparisonStatus = nullableString(
    value.baselineComparisonStatus ?? value.baseline_comparison_status,
  );
  const breachedMetricCount = asNullableNumber(
    value.breachedMetricCount ?? value.breached_metric_count,
  );
  const rowHealthStatus = nullableString(
    value.rowHealthStatus ?? value.row_health_status,
  );
  const rowHealthDegradedChecks = asStringArray(
    value.rowHealthDegradedChecks ?? value.row_health_degraded_checks,
  );
  const rank = asNullableNumber(value.rank);
  const out: ManagementTradingPulseRankingEntry = {
    ...value,
    ...(rank !== null ? { rank } : {}),
    personaId,
    persona_id: personaId,
    personaName,
    persona_name: personaName,
    strategyId,
    strategy_id: strategyId,
    strategyName,
    strategy_name: strategyName,
    underlyingSymbol,
    underlying_symbol: underlyingSymbol,
    tenantId,
    tenant_id: tenantId,
    runtimeId,
    runtime_id: runtimeId,
    runtimeBindingId,
    runtime_binding_id: runtimeBindingId,
    deploymentStage,
    deployment_stage: deploymentStage,
    status: asString(value.status),
    pnl,
    drawdown,
    sharpeRatio,
    sharpe_ratio: sharpeRatio,
    fillRate,
    fill_rate: fillRate,
    avgSlippageBps,
    avg_slippage_bps: avgSlippageBps,
    totalTrades,
    total_trades: totalTrades,
    lastUpdatedAt,
    last_updated_at: lastUpdatedAt,
    baselineComparisonStatus,
    baseline_comparison_status: baselineComparisonStatus,
    breachedMetricCount,
    breached_metric_count: breachedMetricCount,
    rowHealthStatus,
    row_health_status: rowHealthStatus,
    rowHealthDegradedChecks,
    row_health_degraded_checks: rowHealthDegradedChecks,
    performanceContext,
    performance_context: performanceContext,
    latestOutcome,
    latest_outcome: latestOutcome,
    ...(links !== undefined ? { links } : {}),
  };
  if (links === undefined) {
    delete out.links;
  }
  return out;
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
  const rawMeta = root?.meta ?? dataRecord?.meta;
  const rawSummary = dataRecord?.summary ?? root?.summary;
  const rawSummaryRecord = isObject(rawSummary) ? rawSummary : undefined;
  const rawMetaRecord = isObject(rawMeta) ? rawMeta : undefined;
  const coverage = normalizeTradingPulseCoverage(
    rawSummaryRecord?.coverage,
    rawMetaRecord?.coverage,
    rawSummaryRecord,
  );
  const meta = normalizeTradingPulseMeta(rawMeta, coverage);

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
  )
    .map(normalizeTradingPulseRankingEntry)
    .filter((entry): entry is ManagementTradingPulseRankingEntry => entry !== null);
  const summary = normalizeTradingPulseSummary(rawSummary, coverage);

  const hasPulseEnvelope =
    (rawSummaryRecord !== undefined && Object.keys(rawSummaryRecord).length > 0)
    || Object.keys(meta.surfaces).length > 0;

  if (
    !hasPulseEnvelope
    && cards.length === 0
    && runtimeRows.length === 0
    && baselineComparisons.length === 0
    && Object.keys(summary.byStatus).length === 0
    && (summary.runtimeCount === 0 || summary.runtimeCount === null)
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

export type ManagementEvolutionJournalView = "all" | "history" | "auto_proposals";
export type ManagementEvolutionJournalEvidenceClass =
  | "threshold_signal"
  | "incident_followup"
  | "incident_severity"
  | "unclassified";

export interface ManagementEvolutionJournalAutoProposalCounts {
  /** BFF-EVO-JOURNAL-POOL-VERSIONS: threshold + incident_followup + incident_severity + other + infrastructure == total. */
  threshold: number;
  other: number;
  infrastructure: number;
  incident_followup: number;
  incident_severity: number;
  postmortem_draft: number;
  total: number;
  incidentFollowup: number;
  incidentSeverity: number;
  postmortemDraft: number;
}

export interface ManagementEvolutionJournalSummary {
  total_items: number;
  totalItems: number;
  returned_items: number;
  returnedItems: number;
  decision_count: number;
  decisionCount: number;
  mutation_review_count: number;
  mutationReviewCount: number;
  postmortem_count: number;
  postmortemCount: number;
  rollback_count: number;
  rollbackCount: number;
  freeze_order_count: number;
  freezeOrderCount: number;
  /** Pool version rows (each owner version of each paper_owner persona). */
  pool_version_count: number | null;
  refused_pool_version_count: number | null;
  /** Hidden infrastructure/test entries (view=history without include_system). */
  hidden_system_counts: Record<string, number> | null;
  unclassified_decision_count: number | null;
  decision_subject_class_counts: Record<string, number> | null;
  pending_review_count: number;
  pendingReviewCount: number;
  active_freeze_count: number;
  activeFreezeCount: number;
  completed_rollback_count: number;
  completedRollbackCount: number;
  latest_at?: string | null;
  latestAt?: string | null;
  by_type: Record<string, number>;
  byType: Record<string, number>;
  by_status: Record<string, number>;
  byStatus: Record<string, number>;
  by_risk_level: Record<string, number>;
  byRiskLevel: Record<string, number>;
}

export interface ManagementEvolutionJournalPageInfo {
  next_page_token: string | null;
  nextPageToken: string | null;
  page_size: number;
  pageSize: number;
  total: number;
}

export interface ManagementEvolutionJournalMeta {
  snapshot_at?: string;
  snapshotAt?: string;
  surfaces?: Record<string, { status: string; source?: string; message?: string; reason?: string }>;
}

export type EvolutionJournalList<T = Record<string, unknown>> = T[] & {
  summary?: ManagementEvolutionJournalSummary;
  autoProposalCounts?: ManagementEvolutionJournalAutoProposalCounts;
  auto_proposal_counts?: ManagementEvolutionJournalAutoProposalCounts;
  pageInfo?: ManagementEvolutionJournalPageInfo;
  page_info?: ManagementEvolutionJournalPageInfo;
  meta?: ManagementEvolutionJournalMeta;
};

function adaptArrayPassthrough<T>(raw: unknown): T[] | null {
  const data = unwrap(raw);
  return asArray<T>(data) ??
         (isObject(data) ? asArray<T>(data.items) : null);
}

export function adaptEvolutionJournalList<T = Record<string, unknown>>(raw: unknown): EvolutionJournalList<T> | null {
  const arr = adaptArrayPassthrough<T>(raw);
  if (!arr) return null;
  const list = [...arr] as EvolutionJournalList<T>;
  const rawArr = arr as EvolutionJournalList<T>;
  const data = unwrap(raw);
  const envelope = isObject(raw) ? raw : {};

  const rawSummary = (isObject(data) && isObject(data.summary) ? data.summary : undefined)
    ?? (isObject(envelope.summary) ? envelope.summary : undefined)
    ?? (isObject(rawArr.summary) ? (rawArr.summary as unknown as Record<string, unknown>) : undefined);
  if (rawSummary) {
    const totalItems = asFiniteNumber(rawSummary.total_items ?? rawSummary.totalItems, list.length);
    const returnedItems = asFiniteNumber(rawSummary.returned_items ?? rawSummary.returnedItems, list.length);
    const decisionCount = asFiniteNumber(rawSummary.decision_count ?? rawSummary.decisionCount, 0);
    const mutationReviewCount = asFiniteNumber(rawSummary.mutation_review_count ?? rawSummary.mutationReviewCount, 0);
    const postmortemCount = asFiniteNumber(rawSummary.postmortem_count ?? rawSummary.postmortemCount, 0);
    const rollbackCount = asFiniteNumber(rawSummary.rollback_count ?? rawSummary.rollbackCount, 0);
    const freezeOrderCount = asFiniteNumber(rawSummary.freeze_order_count ?? rawSummary.freezeOrderCount, 0);
    const optCount = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    const optCounts = (v: unknown): Record<string, number> | null =>
      isObject(v) ? asCountRecord(v) : null;
    const pendingReviewCount = asFiniteNumber(rawSummary.pending_review_count ?? rawSummary.pendingReviewCount, 0);
    const activeFreezeCount = asFiniteNumber(rawSummary.active_freeze_count ?? rawSummary.activeFreezeCount, 0);
    const completedRollbackCount = asFiniteNumber(rawSummary.completed_rollback_count ?? rawSummary.completedRollbackCount, 0);
    const latestAt = nullableString(rawSummary.latest_at ?? rawSummary.latestAt);
    const byType = asCountRecord(rawSummary.by_type ?? rawSummary.byType);
    const byStatus = asCountRecord(rawSummary.by_status ?? rawSummary.byStatus);
    const byRiskLevel = asCountRecord(rawSummary.by_risk_level ?? rawSummary.byRiskLevel);
    list.summary = {
      total_items: totalItems,
      totalItems,
      returned_items: returnedItems,
      returnedItems,
      decision_count: decisionCount,
      decisionCount,
      mutation_review_count: mutationReviewCount,
      mutationReviewCount,
      postmortem_count: postmortemCount,
      postmortemCount,
      rollback_count: rollbackCount,
      rollbackCount,
      freeze_order_count: freezeOrderCount,
      freezeOrderCount,
      pool_version_count: optCount(rawSummary.pool_version_count ?? rawSummary.poolVersionCount),
      refused_pool_version_count: optCount(rawSummary.refused_pool_version_count ?? rawSummary.refusedPoolVersionCount),
      hidden_system_counts: optCounts(rawSummary.hidden_system_counts ?? rawSummary.hiddenSystemCounts),
      unclassified_decision_count: optCount(rawSummary.unclassified_decision_count ?? rawSummary.unclassifiedDecisionCount),
      decision_subject_class_counts: optCounts(rawSummary.decision_subject_class_counts ?? rawSummary.decisionSubjectClassCounts),
      pending_review_count: pendingReviewCount,
      pendingReviewCount,
      active_freeze_count: activeFreezeCount,
      activeFreezeCount,
      completed_rollback_count: completedRollbackCount,
      completedRollbackCount,
      latest_at: latestAt,
      latestAt,
      by_type: byType,
      byType,
      by_status: byStatus,
      byStatus,
      by_risk_level: byRiskLevel,
      byRiskLevel,
    };
  }

  const rawCounts = (isObject(data) && isObject(data.auto_proposal_counts ?? data.autoProposalCounts)
    ? (data.auto_proposal_counts ?? data.autoProposalCounts) as Record<string, unknown>
    : undefined)
    ?? (isObject(envelope.auto_proposal_counts ?? envelope.autoProposalCounts)
      ? (envelope.auto_proposal_counts ?? envelope.autoProposalCounts) as Record<string, unknown>
      : undefined)
    ?? (isObject(rawArr.auto_proposal_counts ?? rawArr.autoProposalCounts)
      ? (rawArr.auto_proposal_counts ?? rawArr.autoProposalCounts) as unknown as Record<string, unknown>
      : undefined);
  if (rawCounts) {
    const incidentFollowup = asFiniteNumber(rawCounts.incident_followup ?? rawCounts.incidentFollowup, 0);
    const incidentSeverity = asFiniteNumber(rawCounts.incident_severity ?? rawCounts.incidentSeverity, 0);
    const postmortemDraft = asFiniteNumber(rawCounts.postmortem_draft ?? rawCounts.postmortemDraft, 0);
    const threshold = asFiniteNumber(rawCounts.threshold, 0);
    const other = asFiniteNumber(rawCounts.other, 0);
    const infrastructure = asFiniteNumber(rawCounts.infrastructure, 0);
    const total = asFiniteNumber(rawCounts.total, threshold + incidentFollowup + incidentSeverity + other + infrastructure);
    const counts: ManagementEvolutionJournalAutoProposalCounts = {
      threshold,
      other,
      infrastructure,
      incident_followup: incidentFollowup,
      incident_severity: incidentSeverity,
      postmortem_draft: postmortemDraft,
      total,
      incidentFollowup,
      incidentSeverity,
      postmortemDraft,
    };
    list.autoProposalCounts = counts;
    list.auto_proposal_counts = counts;
  }

  const rawPageInfo = (isObject(envelope.page_info ?? envelope.pageInfo)
    ? (envelope.page_info ?? envelope.pageInfo) as Record<string, unknown>
    : undefined)
    ?? (isObject(data) && isObject(data.page_info ?? data.pageInfo)
      ? (data.page_info ?? data.pageInfo) as Record<string, unknown>
      : undefined)
    ?? (isObject(rawArr.page_info ?? rawArr.pageInfo)
      ? (rawArr.page_info ?? rawArr.pageInfo) as unknown as Record<string, unknown>
      : undefined);
  if (rawPageInfo) {
    const nextPageToken = nullableString(rawPageInfo.next_page_token ?? rawPageInfo.nextPageToken);
    const pageSize = asFiniteNumber(rawPageInfo.page_size ?? rawPageInfo.pageSize, 20);
    const total = asFiniteNumber(rawPageInfo.total, list.summary?.total_items ?? list.length);
    const pageInfo: ManagementEvolutionJournalPageInfo = {
      next_page_token: nextPageToken,
      nextPageToken,
      page_size: pageSize,
      pageSize,
      total,
    };
    list.pageInfo = pageInfo;
    list.page_info = pageInfo;
  }

  const rawMeta = (isObject(envelope.meta) ? envelope.meta : undefined)
    ?? (isObject(data) && isObject(data.meta) ? data.meta : undefined)
    ?? (isObject(rawArr.meta) ? (rawArr.meta as unknown as Record<string, unknown>) : undefined);
  if (rawMeta) {
    const rawSurfaces = isObject(rawMeta.surfaces) ? rawMeta.surfaces : {};
    const surfaces = Object.fromEntries(
      Object.entries(rawSurfaces).map(([key, item]) => [key, adaptEvidenceSurface(item)]),
    );
    list.meta = {
      snapshot_at: optionalString(rawMeta.snapshot_at ?? rawMeta.snapshotAt),
      snapshotAt: optionalString(rawMeta.snapshotAt ?? rawMeta.snapshot_at),
      surfaces,
    };
  }

  return list;
}

function adaptEvolutionQualificationCriterionRow(raw: unknown): EvolutionQualificationCriterionRow | null {
  if (!isObject(raw)) return null;
  const criterion = asString(raw.criterion);
  if (!criterion) return null;
  return {
    criterion,
    result: asString(raw.result, "not_evaluated"),
    observed: raw.observed ?? null,
    threshold: raw.threshold ?? null,
    reason: nullableString(raw.reason),
  };
}

function adaptEvolutionQualificationDecisionItem(raw: unknown): EvolutionQualificationDecisionItem | null {
  if (!isObject(raw)) return null;
  const decisionId = asString(raw.decision_id ?? raw.decisionId);
  if (!decisionId) return null;
  const criteria = firstArray<unknown>(raw.criteria)
    .map(adaptEvolutionQualificationCriterionRow)
    .filter((row): row is EvolutionQualificationCriterionRow => Boolean(row));
  return {
    decision_id: decisionId,
    sweep_id: nullableString(raw.sweep_id ?? raw.sweepId),
    tenant_id: nullableString(raw.tenant_id ?? raw.tenantId),
    target_type: nullableString(raw.target_type ?? raw.targetType),
    target_id: nullableString(raw.target_id ?? raw.targetId),
    metric_name: nullableString(raw.metric_name ?? raw.metricName),
    qualified: asBoolean(raw.qualified, false),
    first_failing_criterion: nullableString(raw.first_failing_criterion ?? raw.firstFailingCriterion),
    failure_reason: nullableString(raw.failure_reason ?? raw.failureReason),
    policy_version: nullableString(raw.policy_version ?? raw.policyVersion),
    evaluated_at: nullableString(raw.evaluated_at ?? raw.evaluatedAt),
    program_id: nullableString(raw.program_id ?? raw.programId),
    criteria,
  };
}

function adaptMemberBaselines(raw: unknown): EvolutionMemberBaseline[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: EvolutionMemberBaseline[] = [];
  for (const item of raw) {
    if (!isObject(item)) continue;
    const artifactRef = asString(item.artifact_ref ?? item.artifactRef);
    const personaId = asString(item.persona_id ?? item.personaId);
    if (!artifactRef || !personaId) continue;
    const rw = item.risk_weight ?? item.riskWeight;
    const pv = item.pool_version ?? item.poolVersion;
    rows.push({
      persona_id: personaId,
      persona_name: nullableString(item.persona_name ?? item.personaName),
      artifact_ref: artifactRef,
      stage: nullableString(item.stage),
      risk_weight: typeof rw === "number" && Number.isFinite(rw) ? rw : null,
      pool_version: typeof pv === "number" && Number.isFinite(pv) ? pv : null,
      status: asString(item.status, "unavailable"),
      reason: nullableString(item.reason),
    });
  }
  return rows;
}

function adaptMemberBaselinesSurface(raw: unknown): EvolutionMemberBaselinesSurface | null {
  if (!isObject(raw)) return null;
  const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    status: asString(raw.status, "unknown"),
    reason: nullableString(raw.reason),
    approved: n(raw.approved),
    not_approved: n(raw.not_approved ?? raw.notApproved),
    unavailable: n(raw.unavailable),
  };
}

export function adaptEvolutionQualificationReport(raw: unknown): EvolutionQualificationReport | null {
  const data = unwrap(raw);
  if (!isObject(data)) return null;
  const items = firstArray<unknown>(data.items)
    .map(adaptEvolutionQualificationDecisionItem)
    .filter((item): item is EvolutionQualificationDecisionItem => Boolean(item));
  const hasReportFields =
    "evaluated" in data ||
    "qualified" in data ||
    "policy_version" in data ||
    "policyVersion" in data ||
    "counts_by_first_failing_criterion" in data ||
    "countsByFirstFailingCriterion" in data ||
    "sweep_id" in data ||
    "sweepId" in data ||
    "evaluated_at" in data ||
    "evaluatedAt" in data ||
    "failure_reason" in data ||
    "failureReason" in data ||
    "member_baselines" in data ||
    items.length > 0;
  if (!hasReportFields) return null;
  const rawCounts = isObject(data.counts_by_first_failing_criterion ?? data.countsByFirstFailingCriterion)
    ? (data.counts_by_first_failing_criterion ?? data.countsByFirstFailingCriterion) as Record<string, unknown>
    : {};
  const countsByFirstFailingCriterion: Record<string, number> = {};
  for (const key of EVOLUTION_QUALIFICATION_CRITERIA) {
    if (key in rawCounts) {
      countsByFirstFailingCriterion[key] = asFiniteNumber(rawCounts[key], 0);
    }
  }
  for (const [key, value] of Object.entries(rawCounts)) {
    if (!(key in countsByFirstFailingCriterion)) {
      countsByFirstFailingCriterion[key] = asFiniteNumber(value, 0);
    }
  }
  const evaluated = asFiniteNumber(data.evaluated, items.length);
  const qualified = asFiniteNumber(data.qualified, items.filter((item) => item.qualified).length);
  return {
    tenant_id: nullableString(data.tenant_id ?? data.tenantId),
    sweep_id: nullableString(data.sweep_id ?? data.sweepId),
    policy_version: nullableString(data.policy_version ?? data.policyVersion),
    evaluated_at: nullableString(data.evaluated_at ?? data.evaluatedAt),
    evaluated,
    qualified,
    drafted: asFiniteNumber(data.drafted, 0),
    counts_by_first_failing_criterion: countsByFirstFailingCriterion,
    failure_reason: nullableString(data.failure_reason ?? data.failureReason),
    items,
    member_baselines: adaptMemberBaselines(data.member_baselines ?? data.memberBaselines),
    member_baselines_surface: adaptMemberBaselinesSurface(data.member_baselines_surface ?? data.memberBaselinesSurface),
    total: asFiniteNumber(data.total, evaluated),
    limit: asFiniteNumber(data.limit, 50),
    offset: asFiniteNumber(data.offset, 0),
  };
}

export const defaultEvolutionQualificationSeed = (): EvolutionQualificationReport => ({
  tenant_id: null,
  sweep_id: null,
  policy_version: "evolution-qualification.v1",
  evaluated_at: null,
  evaluated: 0,
  qualified: 0,
  drafted: 0,
  counts_by_first_failing_criterion: {},
  failure_reason: "no_qualification_has_run",
  items: [],
  total: 0,
  limit: 50,
  offset: 0,
});

export function adaptPerformanceAttributionRows(raw: unknown): PerformanceAttributionRow[] | null {
  const data = unwrap(raw);
  const rawRows = adaptArrayPassthrough<unknown>(raw) ??
    (isObject(data) ? asArray<unknown>(data.rows) : null) ??
    (isObject(raw) ? asArray<unknown>(raw.items) : null);
  return rawRows ? rawRows.map(normalizePerformanceAttributionRow) : null;
}

export type PerformanceAttributionExtendedResult = PerformanceAttributionResult & {
  hidden_test_persona_count?: number;
  hiddenTestPersonaCount?: number;
  hidden_test_strategy_count?: number;
  hiddenTestStrategyCount?: number;
  include_test_personas?: boolean;
  includeTestPersonas?: boolean;
  summary?: NonNullable<PerformanceAttributionResult["summary"]> & {
    hidden_test_persona_count?: number;
    hiddenTestPersonaCount?: number;
    hidden_test_strategy_count?: number;
    hiddenTestStrategyCount?: number;
    include_test_personas?: boolean;
    includeTestPersonas?: boolean;
  };
};

export function adaptPerformanceAttributionResult(raw: unknown): PerformanceAttributionExtendedResult {
  const rows = adaptPerformanceAttributionRows(raw) ?? [];
  const baseSummary = adaptAttributionSummary(raw);
  const root = isObject(raw) ? raw : {};
  const data = isObject(root.data) ? root.data : root;
  const rawSummary = isObject(data.summary)
    ? data.summary
    : isObject(root.summary)
      ? root.summary
      : {};
  const rawMeta = isObject(root.meta)
    ? root.meta
    : isObject(data.meta)
      ? data.meta
      : {};

  const hiddenTestPersonaCount = optionalFiniteNumber(
    rawSummary.hidden_test_persona_count ??
      rawSummary.hiddenTestPersonaCount ??
      rawMeta.hidden_test_persona_count ??
      rawMeta.hiddenTestPersonaCount,
  );
  const hiddenTestStrategyCount = optionalFiniteNumber(
    rawSummary.hidden_test_strategy_count ??
      rawSummary.hiddenTestStrategyCount ??
      rawMeta.hidden_test_strategy_count ??
      rawMeta.hiddenTestStrategyCount,
  );
  const rawInclude =
    rawSummary.include_test_personas ??
    rawSummary.includeTestPersonas ??
    rawMeta.include_test_personas ??
    rawMeta.includeTestPersonas;
  const includeTestPersonas =
    typeof rawInclude === "boolean" ? rawInclude : undefined;

  const hasHiddenFields =
    hiddenTestPersonaCount !== undefined ||
    hiddenTestStrategyCount !== undefined ||
    includeTestPersonas !== undefined;

  const hiddenPayload = {
    ...(hiddenTestPersonaCount !== undefined
      ? {
          hidden_test_persona_count: hiddenTestPersonaCount,
          hiddenTestPersonaCount,
        }
      : {}),
    ...(hiddenTestStrategyCount !== undefined
      ? {
          hidden_test_strategy_count: hiddenTestStrategyCount,
          hiddenTestStrategyCount,
        }
      : {}),
    ...(includeTestPersonas !== undefined
      ? {
          include_test_personas: includeTestPersonas,
          includeTestPersonas,
        }
      : {}),
  };

  const summary =
    baseSummary || hasHiddenFields
      ? {
          ...(baseSummary ?? {}),
          ...hiddenPayload,
        }
      : undefined;

  return {
    rows,
    period: adaptAttributionPeriodState(raw),
    ...(summary ? { summary } : {}),
    ...hiddenPayload,
  };
}


const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function adaptCockpitCapitalSummary(raw: unknown): CockpitCapitalSummary | null {
  const data = unwrap(raw);
  if (!isObject(data)) return null;
  const summary = isObject(data.summary) ? data.summary : {};
  const hasFact = "totalNav" in data || "total_nav" in data || isObject(data.summary) ||
    "activeCapitalPools" in data;
  if (!hasFact) return null;
  const pick = (...keys: string[]): number | null => {
    for (const key of keys) {
      const v = nullableNumber(data[key] ?? summary[key]);
      if (v !== null) return v;
    }
    return null;
  };
  return {
    totalNav: pick("totalNav", "total_nav"),
    totalCash: pick("totalCash", "total_cash"),
    grossExposure: pick("grossExposure", "gross_exposure"),
    leverage: pick("leverage"),
    unrealizedPnl: pick("unrealizedPnl", "unrealized_pnl"),
    pnlToday: pick("pnlToday", "pnl_today"),
    activeCapitalPools: pick("activeCapitalPools", "active_capital_pools", "active_capital_pool_count"),
    highestRiskPoolId: asString(data.highestRiskPoolId ?? data.highest_risk_pool_id) || null,
    bindingCount: pick("binding_count"),
    activeRuntimeCount: pick("active_runtime_count"),
    paperRuntimeCount: pick("paper_runtime_count"),
    liveRuntimeCount: pick("live_runtime_count"),
    totalTrades: pick("total_trades"),
    totalPnl: pick("total_pnl"),
    maxDrawdown: pick("max_drawdown"),
    latestTelemetryAt: asString(summary.latest_telemetry_at ?? data.latest_telemetry_at) || null,
  };
}

/**
 * Ranked persona-league rows. The rankings owner returns data.items as ranking
 * GROUPS (one per criteria) each carrying nested ranked `items`; the overall
 * group is selected. A flat list of ranked rows is also accepted. Only entries
 * carrying a real persona id AND a finite owner-supplied rank qualify;
 * inventory entries are never ranked by position and rows without identity are
 * dropped (no blank names / hrefs).
 */
export function adaptPersonaLeagueRankedRows(raw: unknown): PersonaLeagueRow[] | null {
  const top = adaptArrayPassthrough<Record<string, unknown>>(raw);
  if (!top) return null;
  const isGroup = (r: unknown): r is Record<string, unknown> =>
    isObject(r) && Array.isArray(r.items);
  const items = top.some(isGroup)
    ? top.filter(isGroup)
        .filter((g) => asString(g.criteria) === "overall" || asString(g.ranking_id) === "persona-league-overall")
        .flatMap((g) => g.items as Record<string, unknown>[])
    : top;
  return items.flatMap((record) => {
    if (!isObject(record)) return [];
    const personaId = asString(record.personaId ?? record.persona_id ?? record.id);
    const rank = nullableNumber(record.currentRank ?? record.current_rank ?? record.rank);
    if (!personaId || rank === null) return [];
    const links = isObject(record.links) && asString(record.links.manageHref)
      ? (record.links as unknown as PersonaLeagueRow["links"])
      : buildLinkSet({ primary: { kind: "persona", id: personaId } });
    const previous = nullableNumber(record.previousRank ?? record.previous_rank);
    const delta = nullableNumber(record.rankDelta ?? record.rank_delta);
    const metrics = isObject(record.metrics) ? record.metrics : {};
    return [{
      ...(record as object),
      personaId,
      personaName: asString(record.personaName ?? record.persona_name ?? record.name, personaId),
      tenantId: asString(record.tenantId ?? record.tenant_id) || undefined,
      currentRank: rank,
      previousRank: previous ?? undefined,
      rankDelta: delta ?? undefined,
      tier: asString(record.tier, "watch") as PersonaLeagueRow["tier"],
      pnl30d: nullableNumber(record.pnl30d ?? record.pnl_30d ?? metrics.pnl30d ?? metrics.pnl_30d),
      sharpe: nullableNumber(record.sharpe ?? record.sharpeRatio ?? record.sharpe_ratio ?? metrics.sharpe),
      maxDrawdown: nullableNumber(record.maxDrawdown ?? record.max_drawdown ?? record.drawdown ?? metrics.drawdown),
      eligible: typeof record.eligible === "boolean" ? record.eligible : undefined,
      exclusionReason: asString(record.exclusionReason ?? record.exclusion_reason) || undefined,
      links,
    } as PersonaLeagueRow];
  });
}

/** Owner-reported full persona population (summary.persona_count / page_info.total); null when not stated. */
function personaLeagueOwnerTotal(raw: unknown): number | null {
  const data = unwrap(raw);
  const summary = isObject(data) && isObject(data.summary) ? data.summary : {};
  const pageInfo = isObject(raw) && isObject(raw.page_info) ? raw.page_info : {};
  const total = nullableNumber(summary.persona_count ?? pageInfo.total);
  return total !== null && total >= 0 ? total : null;
}

export function adaptPersonaLeagueInventory(raw: unknown): PersonaLeagueInventoryRow[] | null {
  const items = adaptArrayPassthrough<Record<string, unknown>>(raw);
  if (!items) return null;
  const ownerTotal = personaLeagueOwnerTotal(raw) ?? undefined;
  return items.flatMap((record) => {
    if (!isObject(record)) return [];
    const personaId = asString(record.personaId ?? record.persona_id ?? record.id);
    if (!personaId) return [];
    const href = buildLinkSet({ primary: { kind: "persona", id: personaId } }).manageHref;
    return [{
      personaId,
      personaName: asString(record.personaName ?? record.persona_name ?? record.name, personaId),
      tenantId: asString(record.tenantId ?? record.tenant_id) || undefined,
      eligible: typeof record.eligible === "boolean" ? record.eligible : undefined,
      exclusionReason: asString(record.exclusionReason ?? record.exclusion_reason) || undefined,
      manageHref: href,
      ownerTotal,
    }];
  });
}

export function adaptQuarterlyRankingRows(raw: unknown): QuarterlyRankingRow[] | null {
  const items = adaptArrayPassthrough<Record<string, unknown>>(raw);
  if (!items) return null;

  return items.flatMap((record, index) => {
    const personaId = asString(record.personaId ?? record.persona_id ?? record.persona ?? record.id);
    if (!personaId) return [];

    const metrics = objectOrEmpty(record.metrics);
    const components = objectOrEmpty(record.scoreBreakdown ?? record.score_breakdown ?? record.components);
    const exclusionReason = optionalString(
      record.disqualificationReason ?? record.disqualification_reason ?? record.exclusion_reason,
    );
    const explicitEligibility = asString(record.eligibility).toLowerCase();
    const eligibility = ["eligible", "insufficient_data", "disqualified"].includes(explicitEligibility)
      ? explicitEligibility
      : asBoolean(record.eligible, false)
        ? "eligible"
        : exclusionReason?.toLowerCase().includes("telemetry")
          ? "insufficient_data"
          : "disqualified";
    const rawLinks = objectOrEmpty(record.links);
    const numeric = (value: unknown): number => optionalFiniteNumber(value) ?? Number.NaN;

    return [{
      ...record,
      quarter: asString(record.quarter),
      personaId,
      personaName: asString(record.personaName ?? record.persona_name ?? record.name ?? record.display_name ?? record.persona, personaId),
      currentRank: numeric(record.currentRank ?? record.current_rank ?? record.rank ?? index + 1),
      previousQuarterRank: optionalFiniteNumber(record.previousQuarterRank ?? record.previous_quarter_rank),
      rankDelta: optionalFiniteNumber(record.rankDelta ?? record.rank_delta),
      tier: asString(record.tier ?? record.tierLabel ?? record.tier_label, "disqualified") as QuarterlyRankingRow["tier"],
      score: numeric(record.score ?? record.overallScore ?? record.overall_score),
      scoreBreakdown: {
        pnlScore: numeric(components.pnlScore ?? components.pnl_score),
        sharpeScore: numeric(components.sharpeScore ?? components.sharpe_score),
        drawdownControlScore: numeric(components.drawdownControlScore ?? components.drawdown_control_score ?? components.risk_score),
        executionQualityScore: numeric(components.executionQualityScore ?? components.execution_quality_score ?? components.execution_score),
        riskComplianceScore: numeric(components.riskComplianceScore ?? components.risk_compliance_score ?? components.risk_score),
        improvementScore: numeric(components.improvementScore ?? components.improvement_score ?? components.activity_score),
        humanInterventionPenalty: numeric(components.humanInterventionPenalty ?? components.human_intervention_penalty),
        hardPenalty: numeric(components.hardPenalty ?? components.hard_penalty),
      },
      pnlQuarter: numeric(record.pnlQuarter ?? record.pnl_quarter ?? metrics.pnl),
      sharpeQuarter: numeric(record.sharpeQuarter ?? record.sharpe_quarter ?? metrics.sharpe),
      maxDrawdownQuarter: numeric(record.maxDrawdownQuarter ?? record.max_drawdown_quarter ?? metrics.drawdown),
      executionQualityScore: numeric(record.executionQualityScore ?? record.execution_quality_score ?? components.execution_score),
      riskComplianceScore: numeric(record.riskComplianceScore ?? record.risk_compliance_score ?? components.risk_score),
      improvementScore: numeric(record.improvementScore ?? record.improvement_score ?? components.activity_score),
      humanInterventionPenalty: numeric(record.humanInterventionPenalty ?? record.human_intervention_penalty),
      eligibility: eligibility as QuarterlyRankingRow["eligibility"],
      disqualificationReason: exclusionReason,
      recommendation: optionalString(record.recommendation) as QuarterlyRankingRow["recommendation"],
      evidenceRefs: asStringArray(record.evidenceRefs ?? record.evidence_refs),
      links: {
        ...rawLinks,
        manageHref: asString(rawLinks.manageHref ?? rawLinks.manage_href, `/management/personas/${encodeURIComponent(personaId)}`),
      } as ManagementLinkSet,
    } as QuarterlyRankingRow];
  });
}

// ---------- Persona Intent ----------

export type PersonaIntentKind = "trade_intent" | "consultation" | "meeting" | "trainer";

export interface PersonaIntentPersonaRef {
  id: string;
  name: string;
}

export interface PersonaIntentWithheldField {
  field: string;
  reasonCode: string;
}

export interface PersonaIntentAuditRecord extends PersonaIntentTrace {
  kind: PersonaIntentKind;
  personaName: string;
  topic: string;
  outcome?: string;
  decision?: string;
  consultedPersonaEntries: PersonaIntentPersonaRef[];
  withheldFields: PersonaIntentWithheldField[];
  withheldReasonCodes: string[];
}

const PERSONA_INTENT_VISIBILITIES = new Set(["summary", "redacted", "restricted"]);

const PERSONA_INTENT_KIND_ALIASES: Record<string, PersonaIntentKind> = {
  trade: "trade_intent",
  trade_intent: "trade_intent",
  trade_intents: "trade_intent",
  intent: "trade_intent",
  intents: "trade_intent",
  persona_trace: "trade_intent",
  persona_traces: "trade_intent",
  consult: "consultation",
  consultation: "consultation",
  consultations: "consultation",
  persona_panel: "consultation",
  gate_panel: "consultation",
  panel: "consultation",
  panels: "consultation",
  meeting: "meeting",
  meetings: "meeting",
  persona_meeting: "meeting",
  persona_meetings: "meeting",
  deliberative_meeting: "meeting",
  trainer: "trainer",
  trainers: "trainer",
  trainer_session: "trainer",
  trainer_sessions: "trainer",
  teaching: "trainer",
  teaching_session: "trainer",
  teaching_sessions: "trainer",
};

const BUILTIN_PERSONA_NAMES: Record<string, string> = {
  "persona-risk-officer": "Risk Officer",
  "persona-red-team": "Red Team",
  "persona-risk-chief": "Risk Chief",
  "persona-execution-sponsor": "Execution Sponsor",
  "p-risk-analyst": "Risk Analyst Persona",
};

const DEFAULT_WITHHELD_FIELD_REASONS: Record<string, string> = {
  private_memory: "private_memory_withheld",
  private_memories: "private_memory_withheld",
  private_memory_text: "private_memory_withheld",
  persona_private_memory: "private_memory_withheld",
  memory_trace: "private_memory_withheld",
  private_bank: "private_memory_withheld",
  private_memory_entries: "private_memory_withheld",
  private_text: "private_memory_withheld",
  private_content: "private_memory_withheld",
  persona_interpretation: "private_interpretation_withheld",
  persona_interpretations: "private_interpretation_withheld",
  private_interpretation: "private_interpretation_withheld",
  private_interpretations: "private_interpretation_withheld",
  interpretation_turn: "private_interpretation_withheld",
  reasoning_trace: "private_interpretation_withheld",
  raw_control_diff: "raw_control_diff_withheld",
};

export function formatPersonaDisplayName(personaId: string, hintName?: string): string {
  const cleanId = asString(personaId).trim();
  const cleanHint = asString(hintName).trim();
  if (cleanHint && cleanHint !== cleanId) return cleanHint;
  if (!cleanId) return cleanHint || "";
  if (BUILTIN_PERSONA_NAMES[cleanId]) return BUILTIN_PERSONA_NAMES[cleanId];
  const hexMatch = /^(?:persona|p)[-_]([0-9a-f]{16,})$/i.exec(cleanId);
  if (hexMatch) {
    return `Persona ${hexMatch[1].slice(0, 8)}`;
  }
  if (/^(?:persona|p)[-_]/i.test(cleanId)) {
    const parts = cleanId.replace(/_/g, "-").split("-").filter(Boolean);
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  }
  return cleanHint || cleanId;
}

export function normalizePersonaIntentKind(record: Record<string, unknown>): PersonaIntentKind {
  const agora = isObject(record.agora) ? record.agora : {};
  const explicit = asString(record.kind ?? agora.kind).trim().toLowerCase();
  if (explicit && PERSONA_INTENT_KIND_ALIASES[explicit]) {
    return PERSONA_INTENT_KIND_ALIASES[explicit];
  }
  const sourceType = asString(record.sourceType ?? record.source_type ?? record.type).trim().toLowerCase();
  if (sourceType === "trainer_session") return "trainer";

  const id = asString(record.id ?? record.intent_id ?? record.source_id ?? record.sourceId).trim().toLowerCase();
  const mode = asString(
    record.intent ??
    record.mode ??
    record.consultation_type ??
    record.meeting_type ??
    agora.mode,
  ).trim().toLowerCase();

  if (
    mode === "persona_meeting" ||
    mode === "meeting" ||
    mode === "deliberative_meeting" ||
    Boolean(record.meeting_type) ||
    id.startsWith("mtg-") ||
    id.includes(":mtg-")
  ) {
    return "meeting";
  }

  if (
    mode === "trainer" ||
    mode === "trainer_session" ||
    mode === "teaching" ||
    mode === "teaching_session" ||
    mode === "persona_teaching_advisory" ||
    id.startsWith("teach-") ||
    id.includes(":teach-") ||
    id.includes("creq-teach-")
  ) {
    return "trainer";
  }

  if (sourceType === "agora_session") {
    if (
      mode === "trade_intent" ||
      mode === "trading_room" ||
      mode === "decision_lock" ||
      mode === "trade_proposal" ||
      mode === "order_intent"
    ) {
      return "trade_intent";
    }
    return "consultation";
  }

  if (
    mode === "consult" ||
    mode === "consultation" ||
    mode === "persona_panel" ||
    mode === "gate_panel" ||
    mode === "committee" ||
    mode === "committee_review" ||
    mode === "strategy_review" ||
    mode === "pre_deployment"
  ) {
    return "consultation";
  }

  return "trade_intent";
}

const normalizePersonaIntentVisibility = (record: Record<string, unknown>): PersonaIntentVisibility => {
  const explicit = asString(record.visibility).toLowerCase();
  if (PERSONA_INTENT_VISIBILITIES.has(explicit)) return explicit as PersonaIntentVisibility;

  const redaction = isObject(record.redaction) ? record.redaction : {};
  const status = asString(record.status ?? record.source_status).toLowerCase();
  const redactionStatus = asString(
    redaction.status ??
    record.redaction_status ??
    record.redactionStatus,
  ).toLowerCase();

  if (status === "restricted" || redactionStatus === "restricted") return "restricted";
  if (
    redactionStatus === "redacted" ||
    asBoolean(record.redacted) ||
    asBoolean(redaction.redacted ?? redaction.is_redacted)
  ) {
    return "redacted";
  }
  return "summary";
};

const normalizePersonaIntentRedactedBy = (raw: unknown): "bff" | "policy_engine" | "system" | undefined => {
  const value = asString(raw).toLowerCase();
  return value === "bff" || value === "policy_engine" || value === "system" ? value : undefined;
};

const normalizePersonaIntentSourceType = (record: Record<string, unknown>): string =>
  asString(record.sourceType ?? record.source_type ?? record.type, "unknown");

const normalizePersonaIntentStringList = (...values: unknown[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const items = Array.isArray(value) ? value : [];
    for (const rawItem of items) {
      const item = isObject(rawItem)
        ? asString(
            rawItem.tool_name ??
            rawItem.toolName ??
            rawItem.display_name ??
            rawItem.displayName ??
            rawItem.name ??
            rawItem.tool ??
            rawItem.id ??
            rawItem.ref ??
            rawItem.evidence_ref ??
            rawItem.ref_id ??
            rawItem.href ??
            rawItem.route,
          )
        : asString(rawItem);
      if (!item) continue;
      if (!seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    }
  }
  return out;
};

const extractPersonaDisplayNameMap = (record: Record<string, unknown>): Record<string, string> => {
  const map: Record<string, string> = {};
  const addMapping = (idRaw: unknown, nameRaw: unknown) => {
    const id = asString(idRaw).trim();
    const name = asString(nameRaw).trim();
    if (id && name) {
      map[id] = name;
    }
  };

  const directMap = isObject(record.persona_display_names)
    ? record.persona_display_names
    : isObject(record.personaDisplayNames)
      ? record.personaDisplayNames
      : null;
  if (directMap) {
    for (const [k, v] of Object.entries(directMap)) {
      addMapping(k, v);
    }
  }

  const agora = isObject(record.agora) ? record.agora : {};
  for (const listCandidate of [record.personas, agora.personas, record.consulted_personas, agora.consulted_personas]) {
    if (!Array.isArray(listCandidate)) continue;
    for (const entry of listCandidate) {
      if (!isObject(entry)) continue;
      addMapping(
        entry.persona_id ?? entry.personaId ?? entry.id,
        entry.display_name ?? entry.displayName ?? entry.name ?? entry.label,
      );
    }
  }

  const consultedIds = Array.isArray(record.consulted_persona_ids) ? record.consulted_persona_ids : [];
  const consultedNames = Array.isArray(record.consulted_persona_names) ? record.consulted_persona_names : [];
  if (consultedIds.length > 0 && consultedIds.length === consultedNames.length) {
    for (let i = 0; i < consultedIds.length; i += 1) {
      addMapping(consultedIds[i], consultedNames[i]);
    }
  }

  addMapping(
    record.persona_id ?? record.personaId ?? record.ringPersonaId ?? record.ring_persona_id,
    record.persona_display_name ??
      record.personaDisplayName ??
      record.persona_name ??
      record.personaName ??
      record.persona_label ??
      record.personaLabel,
  );

  return map;
};

const normalizeConsultedPersonas = (
  record: Record<string, unknown>,
  displayMap: Record<string, string>,
): PersonaIntentPersonaRef[] => {
  const agora = isObject(record.agora) ? record.agora : {};
  const rawSources = [
    record.consultedPersonaEntries,
    record.consulted_personas,
    record.consultedPersonas,
    agora.consulted_personas,
    record.consulted_persona_names,
    record.consultedPersonaNames,
  ];
  const entries: PersonaIntentPersonaRef[] = [];
  const seen = new Set<string>();

  for (const source of rawSources) {
    if (!Array.isArray(source) || source.length === 0) continue;
    for (const rawItem of source) {
      if (isObject(rawItem)) {
        const id = asString(
          rawItem.persona_id ??
          rawItem.personaId ??
          rawItem.id ??
          rawItem.actor_id ??
          rawItem.actorId,
        ).trim();
        const rawName = asString(
          rawItem.display_name ??
          rawItem.displayName ??
          rawItem.name ??
          rawItem.label,
        ).trim();
        const name = formatPersonaDisplayName(id, rawName || (id ? displayMap[id] : ""));
        const key = (id || name).toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        entries.push({ id: id || name, name: name || id });
      } else {
        const token = asString(rawItem).trim();
        if (!token) continue;
        const mappedName = displayMap[token];
        const name = mappedName || formatPersonaDisplayName(token);
        const key = token.toLowerCase();
        if (seen.has(key) || seen.has(name.toLowerCase())) continue;
        seen.add(key);
        seen.add(name.toLowerCase());
        entries.push({ id: token, name });
      }
    }
    if (entries.length > 0) break;
  }

  return entries;
};

const normalizeWithheldFields = (
  record: Record<string, unknown>,
  redaction: Record<string, unknown>,
): { withheldFields: PersonaIntentWithheldField[]; withheldReasonCodes: string[] } => {
  const withheldFields: PersonaIntentWithheldField[] = [];
  const seenFields = new Set<string>();
  const defaultReason = asString(
    redaction.reason_code ??
    redaction.reasonCode ??
    (Array.isArray(record.withheld_reason_codes) ? record.withheld_reason_codes[0] : undefined) ??
    (Array.isArray(redaction.reason_codes) ? redaction.reason_codes[0] : undefined),
  ).trim();

  const addField = (fieldRaw: unknown, reasonRaw?: unknown) => {
    const field = asString(fieldRaw).trim();
    if (!field) return;
    const normField = field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
    if (seenFields.has(normField)) return;
    seenFields.add(normField);
    const reasonCode =
      asString(reasonRaw).trim() ||
      DEFAULT_WITHHELD_FIELD_REASONS[normField] ||
      DEFAULT_WITHHELD_FIELD_REASONS[field] ||
      defaultReason ||
      "private_memory_withheld";
    withheldFields.push({ field: normField, reasonCode });
  };

  const fieldReasons = isObject(redaction.field_reasons)
    ? redaction.field_reasons
    : isObject(redaction.fieldReasons)
      ? redaction.fieldReasons
      : {};

  for (const listCandidate of [
    record.withheldFields,
    record.withheld_fields,
    redaction.withheld_fields,
    redaction.withheldFields,
    redaction.redacted_fields,
    redaction.redactedFields,
  ]) {
    if (!Array.isArray(listCandidate)) continue;
    for (const item of listCandidate) {
      if (isObject(item)) {
        addField(item.field ?? item.name, item.reason_code ?? item.reasonCode ?? item.reason);
      } else {
        const f = asString(item).trim();
        if (f) addField(f, fieldReasons[f]);
      }
    }
  }

  for (const [f, r] of Object.entries(fieldReasons)) {
    addField(f, r);
  }

  const reasonSet = new Set<string>();
  for (const wf of withheldFields) {
    if (wf.reasonCode) reasonSet.add(wf.reasonCode);
  }
  for (const rcList of [
    record.withheldReasonCodes,
    record.withheld_reason_codes,
    redaction.reason_codes,
    redaction.reasonCodes,
  ]) {
    if (!Array.isArray(rcList)) continue;
    for (const rc of rcList) {
      const clean = asString(rc).trim();
      if (clean) reasonSet.add(clean);
    }
  }
  if (defaultReason) reasonSet.add(defaultReason);

  return {
    withheldFields,
    withheldReasonCodes: [...reasonSet],
  };
};

export function normalizePersonaIntentRecord(record: Record<string, unknown>): PersonaIntentAuditRecord | null {
  const id = asString(record.id ?? record.intent_id ?? record.intentId);
  if (!id) return null;

  const sourceType = normalizePersonaIntentSourceType(record);
  const sourceId = asString(record.source_id ?? record.sourceId ?? id);
  const personaIds = normalizePersonaIntentStringList(record.persona_ids, record.personaIds);
  const ringPersonaId = asString(
    record.ringPersonaId ??
    record.ring_persona_id ??
    record.personaId ??
    record.persona_id ??
    personaIds[0],
    "unassigned",
  );
  const ringBearerId = asString(
    record.ringBearerId ??
    record.ring_bearer_id ??
    record.ringBearer ??
    record.bearer_id ??
    sourceId,
    "unknown",
  );

  const displayMap = extractPersonaDisplayNameMap(record);
  const personaName = formatPersonaDisplayName(
    ringPersonaId,
    asString(
      record.personaName ??
      record.persona_display_name ??
      record.personaDisplayName ??
      record.persona_name ??
      record.persona_label ??
      record.personaLabel ??
      displayMap[ringPersonaId],
    ),
  );
  const kind = normalizePersonaIntentKind(record);

  const visibility = normalizePersonaIntentVisibility(record);
  const redaction = isObject(record.redaction) ? record.redaction : {};
  const redactionPolicy = asString(
    redaction.policyRef ??
    redaction.policy_ref ??
    redaction.policy ??
    record.policyRef ??
    record.policy_ref,
  );
  const rawSummary = asString(
    record.userIntentSummary ??
    record.user_intent_summary ??
    record.summary ??
    record.title ??
    record.intent,
  );
  const title = asString(record.title ?? record.topic ?? record.intent, id);
  const agora = isObject(record.agora) ? record.agora : {};
  const trainer = isObject(record.trainer) ? record.trainer : {};
  const traceObj = isObject(record.trace) ? record.trace : {};
  const topic = asString(
    record.topic ??
    agora.topic ??
    trainer.topic ??
    trainer.objective ??
    record.title ??
    rawSummary,
    title,
  );
  const proposedAction = asString(
    record.proposedAction ??
    record.proposed_action ??
    agora.proposed_action ??
    record.recommendation ??
    record.action,
  );
  const outcome = asString(
    record.outcome ??
    agora.outcome ??
    record.decision ??
    agora.decision ??
    trainer.latest_outcome_signal ??
    record.status ??
    record.source_status ??
    record.sourceStatus,
  );
  const decision = asString(
    record.decision ??
    agora.decision ??
    record.outcome ??
    agora.outcome,
  );
  const toolsUsed = normalizePersonaIntentStringList(
    record.toolsUsed,
    record.tools_used,
    record.tool_path,
    record.toolPath,
    traceObj.tools_used,
    agora.tools_used,
  );
  const consultedPersonaEntries = normalizeConsultedPersonas(record, displayMap);
  const { withheldFields, withheldReasonCodes } = normalizeWithheldFields(record, redaction);

  const redactedBy = normalizePersonaIntentRedactedBy(
    redaction.redactedBy ??
    redaction.redacted_by ??
    record.redactedBy ??
    record.redacted_by,
  );

  return {
    id,
    title,
    kind,
    personaName,
    topic,
    outcome: outcome || undefined,
    decision: decision || undefined,
    sourceType,
    sourceId,
    sourceStatus: asString(record.status ?? record.source_status ?? record.sourceStatus),
    detailHref: asString(record.route ?? record.bff_detail_path ?? record.detailHref ?? record.detail_href),
    ringPersonaId,
    ringBearerId,
    userIntentSummary: rawSummary || (visibility === "summary" ? title : "[redacted by policy]"),
    personaInterpretation: asString(record.personaInterpretation ?? record.persona_interpretation),
    proposedAction: proposedAction || undefined,
    toolsUsed,
    consultedPersonas: consultedPersonaEntries.map((entry) => entry.name),
    consultedPersonaEntries,
    withheldFields,
    withheldReasonCodes,
    visibility,
    redaction: {
      status: visibility === "summary" ? "not_required" : visibility,
      ...(redactionPolicy ? { policyRef: redactionPolicy } : {}),
      ...(redactedBy ? { redactedBy } : {}),
    },
    evidenceRefs: normalizePersonaIntentStringList(record.evidenceRefs, record.evidence_refs),
    riskFlags: normalizePersonaIntentStringList(record.riskFlags, record.risk_flags),
    policyViolations: normalizePersonaIntentStringList(record.policyViolations, record.policy_violations),
    createdAt: asString(record.createdAt ?? record.created_at ?? record.occurredAt ?? record.occurred_at ?? record.updatedAt ?? record.updated_at),
    debugRecord: record,
  };
}

export function adaptPersonaIntent(raw: unknown): PersonaIntentAuditRecord[] | null {
  const root = isObject(raw) ? raw : {};
  const data = unwrap(raw);
  const rows = asArray<unknown>(data) ??
    (isObject(data) ? asArray<unknown>(data.items ?? data.data) : null) ??
    asArray<unknown>(root.items ?? root.data);
  if (!rows) return null;
  return rows
    .filter(isObject)
    .map(normalizePersonaIntentRecord)
    .filter((row): row is PersonaIntentAuditRecord => row !== null);
}

// ---------- Readiness ----------

export function adaptReadiness(raw: unknown): ReadinessPageModel | null {
  const data = unwrap(raw);
  if (!isObject(data)) return null;
  if (isObject(data.header) && Array.isArray(data.checklist)) return data as unknown as ReadinessPageModel;
  const rawChecks = Array.isArray(data.checks) ? data.checks.filter(isObject) : null;
  if (!rawChecks) return null;
  const meta = isObject(raw) && isObject(raw.meta) ? raw.meta : {};
  const snapshotAt = asString(meta.snapshot_at ?? data.snapshot_at ?? data.updatedAt, "");
  const checkById = new Map(rawChecks.map((c) => [asString(c.id), c]));
  const checklist: ReadinessChecklistItem[] = rawChecks.map((c) => {
    const s = asString(c.status).toLowerCase();
    const status: ChecklistItemStatus = s === "pass" ? "pass" : s === "fail" || s === "blocked" ? "fail" : s === "not_applicable" ? "not_applicable" : "pending";
    const refs = stringList(c.evidence_refs ?? c.evidenceRefs);
    return {
      id: asString(c.id), label: asString(c.label, asString(c.id)), status,
      ownerRole: asString(c.ownerRole ?? c.owner_role, "bff"),
      evidenceRequired: refs.length > 0, evidenceAttached: refs.length > 0 && status === "pass",
      blocking: Boolean(c.blocking), description: asString(c.message ?? c.description) || undefined,
    };
  });
  const blockers: ReadinessBlocker[] = stringList(data.blockingReasons ?? data.blocking_reasons).map((id) => {
    const c = checkById.get(id);
    return { id, severity: "critical", reason: asString(c?.message ?? c?.label, id), requiredRole: "operator", nextAction: asString(c?.label, id), linkedEvidence: stringList(c?.evidence_refs ?? c?.evidenceRefs) };
  });
  const rawRefs = Array.isArray(data.evidenceRefs ?? data.evidence_refs) ? ((data.evidenceRefs ?? data.evidence_refs) as unknown[]).filter(isObject) : [];
  const packets: ReadinessPacket[] = rawRefs.map((e) => ({
    id: asString(e.id ?? e.path), packetType: asString(e.label ?? e.packetType, asString(e.id)),
    status: e.exists === true && !e.historical_only ? "verified" : e.historical_only ? "stale" : e.exists === false ? "missing" : "pending",
    createdAt: asString(e.createdAt ?? e.created_at, snapshotAt), linkedObject: asString(e.path) || undefined, href: asString(e.href) || undefined,
  }));
  const baseHeader = composeReadinessHeader(asString(data.title, asString(data.id)), "dev", checklist, blockers, snapshotAt);
  const rawStatus = asString(data.readinessStatus ?? data.readiness_status).toLowerCase();
  const status = rawStatus === "ready" || rawStatus === "blocked" || rawStatus === "pending" ? rawStatus : baseHeader.status;
  const rawProceed = data.canProceed ?? data.can_proceed;
  return { header: { ...baseHeader, status, canProceed: typeof rawProceed === "boolean" ? rawProceed : status === "ready" }, checklist, packets, blockers };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => asString(item)).filter(Boolean)
    : [];
}

function normalizeDataConfidence(value: unknown): ManagementDataConfidence {
  const confidence = asString(value).toLowerCase();
  return ["formal", "partial", "fallback", "degraded", "unavailable"].includes(confidence)
    ? confidence as ManagementDataConfidence
    : "unavailable";
}

export function adaptOperationsReadModel(raw: unknown): ManagementOperationsReadModel | null {
  const data = unwrap(raw);
  if (!isObject(data) || !isObject(data.identity) || !isObject(data.performance)) return null;
  const identity = data.identity;
  const performance = data.performance;
  const sources = Array.isArray(data.sources) ? data.sources.filter(isObject) : [];
  const diagnostics = Array.isArray(data.diagnostics) ? data.diagnostics.filter(isObject) : [];
  const personaId = asString(identity.persona_id ?? identity.personaId);
  if (!personaId) return null;

  return {
    identity: {
      personaId,
      personaLabel: asString(identity.persona_label ?? identity.personaLabel) || undefined,
      stage: asString(identity.stage) || undefined,
      runtimeIds: stringList(identity.runtime_ids ?? identity.runtimeIds),
      paperLedgerIds: stringList(identity.paper_ledger_ids ?? identity.paperLedgerIds),
      capitalPoolIds: stringList(identity.capital_pool_ids ?? identity.capitalPoolIds),
      sleeveIds: stringList(identity.sleeve_ids ?? identity.sleeveIds),
      strategyIds: stringList(identity.strategy_ids ?? identity.strategyIds),
      artifactIds: stringList(identity.artifact_ids ?? identity.artifactIds),
      brokerIds: stringList(identity.broker_ids ?? identity.brokerIds),
      period: asString(identity.period),
      asOf: asString(identity.as_of ?? identity.asOf),
    },
    dataConfidence: normalizeDataConfidence(data.data_confidence ?? data.dataConfidence),
    performance: {
      pnl: optionalFiniteNumber(performance.pnl),
      pnlPct: optionalFiniteNumber(performance.pnl_pct ?? performance.pnlPct),
      drawdownPct: optionalFiniteNumber(performance.drawdown_pct ?? performance.drawdownPct),
      riskPct: optionalFiniteNumber(performance.risk_pct ?? performance.riskPct),
      sharpe: optionalFiniteNumber(performance.sharpe),
      rank: optionalFiniteNumber(performance.rank),
      score: optionalFiniteNumber(performance.score),
      performanceDelta: optionalFiniteNumber(performance.performance_delta ?? performance.performanceDelta),
      sourceContribution: optionalFiniteNumber(performance.source_contribution ?? performance.sourceContribution),
    },
    sources: sources.map((source) => ({
      sourceName: asString(source.source_name ?? source.sourceName, "unknown"),
      sourceStatus: asString(source.source_status ?? source.sourceStatus, "unavailable"),
      sourceFreshness: asString(source.source_freshness ?? source.sourceFreshness) || undefined,
      sourceRowCount: optionalFiniteNumber(source.source_row_count ?? source.sourceRowCount),
      sourceError: asString(source.source_error ?? source.sourceError) || undefined,
      coverageRatio: optionalFiniteNumber(source.coverage_ratio ?? source.coverageRatio),
    })),
    diagnostics: diagnostics.map((diagnostic) => ({
      sourceName: asString(diagnostic.source_name ?? diagnostic.sourceName, "unknown"),
      code: asString(diagnostic.code, "UNKNOWN"),
      message: asString(diagnostic.message),
    })),
  };
}

function requiredNumber(value: unknown): number {
  return optionalFiniteNumber(value) ?? Number.NaN;
}

export function adaptPortfolioExposureMonitor(raw: unknown): ManagementPortfolioExposureMonitor | null {
  const root = isObject(raw) ? raw : {};
  const data = unwrap(raw);
  if (!isObject(data) || !isObject(data.summary)) return null;
  const summary = data.summary;
  const items = Array.isArray(data.items) ? data.items.filter(isObject) : [];
  const meta = isObject(root.meta) ? root.meta : {};
  const surfaces = isObject(meta.surfaces) ? meta.surfaces : {};
  const sourceIssues = Object.entries(surfaces).flatMap(([name, value]) => {
    if (!isObject(value)) return [];
    const status = asString(value.status, "unavailable").toLowerCase();
    if (["ok", "ready", "healthy"].includes(status)) return [];
    return [`${name}: ${asString(value.message, status)}`];
  });
  const dataConfidence: ManagementDataConfidence = sourceIssues.length > 0
    ? "partial"
    : Object.keys(surfaces).length > 0 || items.length > 0
      ? "formal"
      : "unavailable";

  return {
    summary: {
      exposureCount: requiredNumber(summary.exposure_count ?? summary.exposureCount),
      riskBudgetTotal: optionalFiniteNumber(summary.risk_budget_total ?? summary.riskBudgetTotal),
      currentExposureTotal: optionalFiniteNumber(summary.current_exposure_total ?? summary.currentExposureTotal),
      availableBudgetTotal: optionalFiniteNumber(summary.available_budget_total ?? summary.availableBudgetTotal),
      riskBudgetUtilization: optionalFiniteNumber(summary.risk_budget_utilization ?? summary.riskBudgetUtilization),
      overBudgetCount: requiredNumber(summary.over_budget_count ?? summary.overBudgetCount),
      nearLimitCount: requiredNumber(summary.near_limit_count ?? summary.nearLimitCount),
      unknownExposureCount: requiredNumber(summary.unknown_exposure_count ?? summary.unknownExposureCount),
      telemetryRuntimeCount: requiredNumber(summary.telemetry_runtime_count ?? summary.telemetryRuntimeCount),
      totalPnl: optionalFiniteNumber(summary.total_pnl ?? summary.totalPnl),
      latestTelemetryAt: asString(summary.latest_telemetry_at ?? summary.latestTelemetryAt) || undefined,
    },
    items: items.map((item) => {
      const sourceRefs = isObject(item.source_refs ?? item.sourceRefs) ? item.source_refs ?? item.sourceRefs : {};
      const runtimeIds = isObject(sourceRefs) ? stringList(sourceRefs.runtime_ids ?? sourceRefs.runtimeIds) : [];
      const telemetry = isObject(item.telemetry) ? item.telemetry : {};
      return {
        id: asString(item.id, `portfolio-exposure-${asString(item.pool_id ?? item.capital_pool_id)}`),
        capitalPoolId: asString(item.capital_pool_id ?? item.capitalPoolId ?? item.pool_id),
        name: asString(item.name ?? item.pool_name, asString(item.capital_pool_id ?? item.pool_id, "Unknown pool")),
        status: asString(item.status, "unknown"),
        currency: asString(item.currency) || undefined,
        riskBudget: optionalFiniteNumber(item.risk_budget ?? item.riskBudget),
        currentExposure: optionalFiniteNumber(item.current_exposure ?? item.currentExposure ?? item.exposure_amount),
        availableBudget: optionalFiniteNumber(item.available_budget ?? item.availableBudget),
        riskBudgetUtilization: optionalFiniteNumber(item.risk_budget_utilization ?? item.riskBudgetUtilization),
        riskState: asString(item.risk_state ?? item.riskState, "unknown"),
        pnl: optionalFiniteNumber(item.pnl ?? item.total_pnl),
        runtimeIds,
        runtimeCount: requiredNumber(item.runtime_count),
        activeRuntimeCount: requiredNumber(item.active_runtime_count),
        paperRuntimeCount: requiredNumber(item.paper_runtime_count),
        liveRuntimeCount: requiredNumber(item.live_runtime_count),
        telemetryAvailable: Object.keys(telemetry).length > 0,
      };
    }),
    dataConfidence,
    sourceIssues,
  };
}

export function adaptPortfolioHoldingRows(raw: unknown): HoldingRow[] | null {
  const data = unwrap(raw);
  const items = Array.isArray(data)
    ? data.filter(isObject)
    : isObject(data) && Array.isArray(data.items)
      ? data.items.filter(isObject)
      : null;
  if (!items) return null;

  return items.map((item, index) => {
    const runtimeId = asString(item.runtime_id ?? item.runtimeId) || undefined;
    const capitalPoolId = asString(item.capital_pool_id ?? item.capitalPoolId ?? item.pool_id);
    const instrument = isObject(item.instrument) ? item.instrument : {};
    const decision = isObject(item.decision) ? item.decision : {};
    return {
      holdingId: asString(item.holding_id ?? item.holdingId ?? item.id, `holding-${index}`),
      capitalPoolId,
      brokerAccountRef: asString(item.broker_account_ref ?? item.brokerAccountRef) || undefined,
      runtimeId,
      strategyId: asString(item.strategy_id ?? item.strategyId) || undefined,
      personaId: asString(item.persona_id ?? item.personaId) || undefined,
      symbol: asString(item.symbol, "Unknown"),
      instrumentId: optionalString(
        item.instrument_id ?? item.instrumentId ?? instrument.instrument_id ?? instrument.instrumentId,
      ),
      instrumentKind: optionalString(
        item.instrument_kind ??
          item.kind ??
          item.instrumentKind ??
          instrument.instrument_kind ??
          instrument.kind ??
          instrument.instrumentKind,
      ),
      contractMonth: optionalString(
        item.contract_month ?? item.contractMonth ?? instrument.contract_month ?? instrument.contractMonth,
      ),
      multiplier: optionalFiniteNumber(item.multiplier ?? instrument.multiplier),
      marginReserved: optionalFiniteNumber(
        item.margin_reserved ??
          item.initial_margin_reserved ??
          item.marginReserved ??
          instrument.margin_reserved ??
          instrument.initial_margin_reserved ??
          instrument.marginReserved,
      ),
      reasonCode: optionalString(
        item.reason_code ??
          item.reasonCode ??
          decision.reason_code ??
          decision.reasonCode ??
          instrument.reason_code ??
          instrument.reasonCode,
      ),
      assetClass: asString(item.asset_class ?? item.assetClass, "other") as HoldingRow["assetClass"],
      side: asString(item.side, "flat") as HoldingRow["side"],
      quantity: requiredNumber(item.quantity),
      avgPrice: requiredNumber(item.average_price ?? item.avg_price ?? item.avgPrice),
      markPrice: requiredNumber(item.mark_price ?? item.markPrice),
      marketValue: requiredNumber(item.market_value ?? item.marketValue),
      notional: requiredNumber(item.notional),
      weightPct: requiredNumber(item.weight_pct ?? item.weightPct ?? item.weight),
      unrealizedPnl: requiredNumber(item.unrealized_pnl ?? item.unrealizedPnl),
      realizedPnl: requiredNumber(item.realized_pnl ?? item.realizedPnl),
      pnlPct: requiredNumber(item.pnl_pct ?? item.pnlPct),
      exposurePct: requiredNumber(item.exposure_pct ?? item.exposurePct),
      sector: asString(item.sector) || undefined,
      region: asString(item.region) || undefined,
      currency: asString(item.currency),
      markStatus: optionalString(item.mark_status ?? item.markStatus),
      lastMarkAt: nullableString(item.last_mark_at ?? item.lastMarkAt),
      updatedAt: asString(item.last_mark_at ?? item.updated_at ?? item.updatedAt),
      links: {
        manageHref: runtimeId
          ? `/management/runtimes?runtime=${encodeURIComponent(runtimeId)}`
          : `/management/performance?tab=overview&capital_pool_id=${encodeURIComponent(capitalPoolId)}`,
      },
    };
  });
}

function portfolioSourceIssueList(value: unknown): PortfolioSourceIssue[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).map((issue) => ({
    code: asString(issue.code, "UNKNOWN_SOURCE_ISSUE"),
    message: asString(issue.message, asString(issue.code, "Unknown source issue")),
  }));
}

function portfolioLinkRecord(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
    ),
  );
}

const PORTFOLIO_CAPITAL_SCOPE_KINDS: PortfolioCapitalScopeKind[] = [
  "paper_ledger", "canary_sleeve", "live_capital_pool", "unclassified",
];

function normalizePortfolioCapitalScopeKind(value: unknown): PortfolioCapitalScopeKind {
  const kind = asString(value).toLowerCase();
  return (PORTFOLIO_CAPITAL_SCOPE_KINDS as string[]).includes(kind)
    ? kind as PortfolioCapitalScopeKind
    : "unclassified";
}

function adaptPortfolioHoldingMonitorRow(item: Record<string, unknown>): PortfolioHoldingMonitorRow {
  const scope = isObject(item.capital_scope) ? item.capital_scope : {};
  const instrument = isObject(item.instrument) ? item.instrument : {};
  const decision = isObject(item.decision) ? item.decision : {};
  return {
    holdingId: asString(item.holding_id ?? item.id, "unknown-holding"),
    runtimeId: asString(item.runtime_id) || undefined,
    personaId: asString(item.persona_id) || undefined,
    capitalPoolId: asString(item.capital_pool_id) || undefined,
    brokerId: asString(item.broker_id) || undefined,
    symbol: asString(item.symbol ?? instrument.symbol, "—"),
    instrumentId: optionalString(
      item.instrument_id ?? item.instrumentId ?? instrument.instrument_id ?? instrument.instrumentId,
    ),
    instrumentKind: optionalString(
      item.instrument_kind ??
        item.kind ??
        item.instrumentKind ??
        instrument.instrument_kind ??
        instrument.kind ??
        instrument.instrumentKind,
    ),
    contractMonth: optionalString(
      item.contract_month ?? item.contractMonth ?? instrument.contract_month ?? instrument.contractMonth,
    ),
    multiplier: optionalFiniteNumber(item.multiplier ?? instrument.multiplier),
    marginReserved: optionalFiniteNumber(
      item.margin_reserved ??
        item.initial_margin_reserved ??
        item.marginReserved ??
        instrument.margin_reserved ??
        instrument.initial_margin_reserved ??
        instrument.marginReserved,
    ),
    reasonCode: optionalString(
      item.reason_code ??
        item.reasonCode ??
        decision.reason_code ??
        decision.reasonCode ??
        instrument.reason_code ??
        instrument.reasonCode,
    ),
    side: optionalString(item.side),
    currency: nullableString(item.currency ?? instrument.currency),
    quantity: optionalFiniteNumber(item.quantity),
    averagePrice: optionalFiniteNumber(item.average_price ?? item.avgPrice),
    markPrice: optionalFiniteNumber(item.mark_price ?? item.markPrice),
    marketValue: optionalFiniteNumber(item.market_value ?? item.marketValue),
    unrealizedPnl: optionalFiniteNumber(item.unrealized_pnl ?? item.unrealizedPnl),
    realizedPnl: optionalFiniteNumber(item.realized_pnl ?? item.realizedPnl),
    markStatus: optionalString(item.mark_status ?? item.markStatus),
    lastMarkAt: nullableString(item.last_mark_at ?? item.lastMarkAt),
    deploymentStage: asString(item.deployment_stage, "unknown"),
    sourceStatus: asString(item.source_status, "unavailable"),
    telemetryStale: item.telemetry_stale === true,
    riskState: asString(item.risk_state, "unknown"),
    sourceIssues: portfolioSourceIssueList(item.source_issues),
    capitalScope: {
      stage: asString(scope.stage ?? item.deployment_stage, "unknown"),
      scopeKind: normalizePortfolioCapitalScopeKind(scope.scope_kind),
      scopeId: asString(scope.scope_id) || undefined,
    },
    links: portfolioLinkRecord(item.links),
  };
}

function adaptPortfolioIncident(raw: unknown): PortfolioIncident | null {
  if (!isObject(raw)) return null;
  const identity = isObject(raw.identity) ? raw.identity : {};
  return {
    id: asString(raw.id, "unknown-incident"),
    holdingId: asString(identity.portfolio_id) || undefined,
    severity: asString(raw.severity, "unknown"),
    message: asString(raw.message, "Source coverage incident"),
    riskState: asString(raw.risk_state, "unknown"),
    sourceStatus: asString(raw.source_status, "unavailable"),
    sourceIssues: portfolioSourceIssueList(raw.source_issues),
    links: portfolioLinkRecord(raw.links),
  };
}

export function adaptPortfolioHoldingsMonitor(raw: unknown): PortfolioHoldingsMonitor | null {
  if (!isObject(raw)) return null;
  const data = isObject(raw.data) ? raw.data : {};
  if (!Array.isArray(data.items) || !isObject(data.summary)) return null;
  const summary = data.summary;
  const coverage = isObject(summary.source_coverage) ? summary.source_coverage : {};
  const meta = isObject(raw.meta) ? raw.meta : {};
  const surfaces = isObject(meta.surfaces) ? meta.surfaces : {};
  const holdingsSurface = isObject(surfaces.portfolio_book_holdings) ? surfaces.portfolio_book_holdings : {};

  return {
    items: data.items.filter(isObject).map(adaptPortfolioHoldingMonitorRow),
    incidents: (Array.isArray(meta.incidents) ? meta.incidents : [])
      .map(adaptPortfolioIncident)
      .filter((incident): incident is PortfolioIncident => incident !== null),
    coverage: {
      holdingCount: requiredNumber(summary.holding_count) || 0,
      sourceRowCount: requiredNumber(coverage.source_row_count) || 0,
      runtimeCount: requiredNumber(coverage.runtime_count) || 0,
      telemetryRuntimeCount: requiredNumber(coverage.telemetry_runtime_count) || 0,
      staleRowCount: requiredNumber(coverage.stale_row_count) || 0,
      missingBindingCount: requiredNumber(coverage.missing_binding_count) || 0,
      degradedSourceCount: requiredNumber(coverage.degraded_source_count) || 0,
      incidentCount: requiredNumber(summary.incident_count) || 0,
    },
    surfaceStatus: asString(holdingsSurface.status, "unavailable"),
    surfaceMessage: asString(holdingsSurface.message) || undefined,
  };
}

// ---------- public mgmt façade ----------

export const mgmt = {
  cockpit: {
    get: (seedFn: CockpitSeedFn = defaultCockpit): Promise<CockpitModel> =>
      mgmtRead("mgmt.cockpit", { method: "GET", path: paths.mgmtCockpit() }, seedFn, adaptCockpit),
    getLiveOnly: (opts?: { signal?: AbortSignal }): Promise<ManagementCockpitSnapshot | undefined> =>
      liveOnlyRead<ManagementCockpitSnapshot>({ method: "GET", path: paths.mgmtCockpit(), signal: opts?.signal }, adaptCockpitSnapshot),
  },

  humanInbox: {
    list: (opts?: { signal?: AbortSignal }): Promise<HumanInboxList> => {
      if (detectMode() === "mock") {
        return Promise.resolve(emptyHumanInbox());
      }
      liveStatus.retry();
      return strictLiveRead<HumanInboxList>(
        "mgmt.humanInbox.list",
        { method: "GET", path: paths.mgmtHumanInbox(), signal: opts?.signal },
        (raw) => {
          const adapted = adaptHumanInboxList(raw);
          if (adapted) return adapted;
          const empty = emptyHumanInbox();
          const meta = extractHumanInboxMeta(raw);
          if (meta) {
            empty.meta = meta;
          }
          const pageInfo = extractHumanInboxPageInfo(raw);
          if (pageInfo) {
            empty.page_info = pageInfo;
            empty.pageInfo = pageInfo;
          }
          return empty;
        },
      );
    },
    get: (id: string, opts?: { signal?: AbortSignal }): Promise<HumanInboxDetail | undefined> => {
      if (detectMode() === "mock") {
        return Promise.resolve(undefined);
      }
      return strictLiveRead<HumanInboxDetail | undefined>(
        "mgmt.humanInbox.get",
        { method: "GET", path: paths.mgmtHumanInboxItem(id), signal: opts?.signal },
        (raw) => adaptHumanInboxDetail(raw) ?? missingHumanInboxDetail(),
      );
    },
    decidePromotionReview: async (
      reviewOrInboxId: string,
      input: PromotionReviewDecisionInput,
      opts: { idempotencyKey?: string } = {},
    ): Promise<PromotionReviewDecisionResult> => {
      const reviewId = promotionReviewIdFromInboxId(reviewOrInboxId);
      const idempotencyKey = opts.idempotencyKey ?? mintIdempotencyKey();
      const writeAllowed = await liveWriteGated();
      if (!writeAllowed) {
        return {
          ok: true,
          persisted: false,
          reviewId,
          status: "write_disabled",
          idempotencyKey,
        };
      }
      const body: Record<string, unknown> = {
        decision: input.decision,
        rationale: input.rationale,
        evidence_refs: input.evidenceRefs ?? [],
      };
      if (input.approvalDecisionId) body.approval_decision_id = input.approvalDecisionId;
      const raw = await bffFetch<unknown>({
        method: "POST",
        path: paths.mgmtPromotionReviewDecision(reviewId),
        body,
        idempotencyKey,
        mode: "live",
      });
      return adaptPromotionReviewDecisionResult(raw, reviewId, idempotencyKey);
    },
  },

  tradingPulse: {
    rankingsLiveOnly: (opts?: { signal?: AbortSignal }): Promise<TradingPulseRankingsList> =>
      liveOnlyList<TradingPulseRankBlock>(
        { method: "GET", path: paths.mgmtTradingRankings(), signal: opts?.signal },
        adaptTradingPulseRankings,
      ) as Promise<TradingPulseRankingsList>,
    rankings: (seedFn: () => TradingPulseRankBlock[] = defaultPulseRankings):
      Promise<TradingPulseRankingsList> =>
      detectMode() === "mock"
        ? Promise.resolve(seedFn())
        : (liveOnlyList<TradingPulseRankBlock>(
            { method: "GET", path: paths.mgmtTradingRankings() },
            adaptTradingPulseRankings,
          ) as Promise<TradingPulseRankingsList>),
    /** PM-4 main pulse overview — live BFF aggregate, not the legacy seed rows. */
    get: (
      seedFn: () => ManagementTradingPulseModel = defaultTradingPulseModel,
    ): Promise<ManagementTradingPulseModel> =>
      detectMode() === "mock"
        ? Promise.resolve(seedFn())
        : mgmtRead(
            "mgmt.tradingPulse",
            { method: "GET", path: paths.mgmtTradingPulse() },
            defaultTradingPulseModel,
            adaptTradingPulseOverview,
          ),
    getLiveOnly: (opts?: { signal?: AbortSignal }): Promise<ManagementTradingPulseModel | undefined> =>
      liveOnlyRead<ManagementTradingPulseModel>(
        { method: "GET", path: paths.mgmtTradingPulse(), signal: opts?.signal },
        adaptTradingPulseOverview,
      ),
  },

  personaFleet: {
    /** Legacy flat read for non-fleet consumers: trading rows only (advisory assistants are never trading personas). */
    get: (filters: { q?: string; pageSize?: number } = {}, opts?: { signal?: AbortSignal }): Promise<ManagementPersonaFleetRow[]> => {
      if (detectMode() === "mock") {
        return Promise.reject(new Error("demo fallback is disabled for personaFleet; live BFF required"));
      }
      liveStatus.retry();
      return strictLiveRead<ManagementPersonaFleetRow[]>(
        "mgmt.personaFleet",
        { method: "GET", path: paths.mgmtPersonaFleet(filters), signal: opts?.signal },
        (raw) => adaptManagementPersonaFleetLiveOnly(raw).filter((row) => row.personaPurpose !== "advisory_assistant"),
      );
    },
    /** Server-paginated fleet read with explicit purpose/data/archive scopes. */
    page: (filters: ManagementPersonaFleetQuery = {}, opts?: { signal?: AbortSignal }): Promise<ManagementPersonaFleetPage> => {
      if (detectMode() === "mock") {
        return Promise.reject(new Error("demo fallback is disabled for personaFleet; live BFF required"));
      }
      liveStatus.retry();
      return strictLiveRead<ManagementPersonaFleetPage>(
        "mgmt.personaFleet.page",
        { method: "GET", path: paths.mgmtPersonaFleet(filters), signal: opts?.signal },
        (raw) => ({ ...adaptManagementPersonaFleetPage(raw), asOf: new Date().toISOString() }),
      );
    },
  },

  // PPL-ALLOC-006 — stage-aware target weights for the Real ranking tab.
  // Strict-live: the caps/exclusions/target-weight math is server-owned
  // (PPL-ALLOC-004); there is no seed to fall back to without fabricating policy.
  allocationPolicy: {
    evaluate: async (
      rows: AllocationPolicyInputRow[],
      opts: { rankingSnapshotId?: string } = {},
    ): Promise<AllocationPolicyLine[]> => {
      const raw = await bffFetch<unknown>({
        method: "POST",
        path: paths.mgmtAllocationPolicyEvaluate(),
        body: {
          ranking_snapshot_id: opts.rankingSnapshotId,
          rows: rows.map(allocationPolicyInputRowPayload),
        },
        mode: "live",
      });
      return adaptAllocationPolicyLines(raw) ?? [];
    },
  },

  evolutionJournal: {
    list: <T>(
      seedFn: () => T[],
      opts?: {
        signal?: AbortSignal;
        view?: ManagementEvolutionJournalView | string;
        persona?: string;
        mutationReview?: string;
        decision?: string;
        includeSystem?: boolean;
        pageSize?: number;
        pageToken?: string | null;
      },
    ): Promise<EvolutionJournalList<T>> =>
      mgmtRead(
        "mgmt.evolutionJournal.list",
        { method: "GET", path: paths.mgmtEvolutionJournal(opts), signal: opts?.signal },
        seedFn as () => EvolutionJournalList<T>,
        adaptEvolutionJournalList<T>,
      ),
  },

  evolutionQualification: {
    get: (
      seedFnOrOpts?:
        | (() => EvolutionQualificationReport)
        | {
            signal?: AbortSignal;
            qualified?: boolean;
            offset?: number;
            pageSize?: number;
            page_size?: number;
          },
      maybeOpts?: {
        signal?: AbortSignal;
        qualified?: boolean;
        offset?: number;
        pageSize?: number;
        page_size?: number;
      },
    ): Promise<EvolutionQualificationReport> => {
      const seedFn = typeof seedFnOrOpts === "function" ? seedFnOrOpts : defaultEvolutionQualificationSeed;
      const opts = typeof seedFnOrOpts === "function" ? maybeOpts : seedFnOrOpts;
      return mgmtRead(
        "mgmt.evolutionQualification.get",
        { method: "GET", path: paths.mgmtEvolutionQualification(opts), signal: opts?.signal },
        seedFn,
        adaptEvolutionQualificationReport,
      );
    },
    getLiveOnly: (opts?: {
      signal?: AbortSignal;
      qualified?: boolean;
      offset?: number;
      pageSize?: number;
      page_size?: number;
    }): Promise<EvolutionQualificationReport | undefined> =>
      liveOnlyRead<EvolutionQualificationReport>(
        { method: "GET", path: paths.mgmtEvolutionQualification(opts), signal: opts?.signal },
        adaptEvolutionQualificationReport,
      ),
  },

  evidence: {
    list: <T>(seedFn: () => T[]): Promise<T[]> =>
      mgmtRead("mgmt.evidence.list", { method: "GET", path: paths.mgmtEvidenceExplorer() }, seedFn, adaptArrayPassthrough<T>),
    overview: (
      seedFnOrOpts:
        | (() => ManagementEvidenceOverview)
        | { pageToken?: string | null; page_token?: string | null; pageSize?: number; page_size?: number; signal?: AbortSignal } = defaultManagementEvidenceOverview,
      maybeOpts?: { pageToken?: string | null; page_token?: string | null; pageSize?: number; page_size?: number; signal?: AbortSignal },
    ): Promise<ManagementEvidenceOverview> => {
      const seedFn = typeof seedFnOrOpts === "function" ? seedFnOrOpts : defaultManagementEvidenceOverview;
      const opts = typeof seedFnOrOpts === "function" ? maybeOpts : seedFnOrOpts;
      const params = new URLSearchParams();
      const pageSize = opts?.pageSize ?? opts?.page_size;
      const pageToken = opts?.pageToken ?? opts?.page_token;
      if (pageSize !== undefined) params.set("page_size", String(pageSize));
      if (pageToken) params.set("page_token", String(pageToken));
      const query = params.toString();
      const path = `${paths.mgmtEvidenceExplorer()}${query ? `?${query}` : ""}`;
      return mgmtRead("mgmt.evidence.overview", { method: "GET", path, signal: opts?.signal }, seedFn, adaptManagementEvidenceOverview);
    },
    overviewLiveOnly: (opts?: {
      pageToken?: string | null;
      page_token?: string | null;
      pageSize?: number;
      page_size?: number;
      signal?: AbortSignal;
    }): Promise<ManagementEvidenceOverview | undefined> => {
      const params = new URLSearchParams();
      const pageSize = opts?.pageSize ?? opts?.page_size;
      const pageToken = opts?.pageToken ?? opts?.page_token;
      if (pageSize !== undefined) params.set("page_size", String(pageSize));
      if (pageToken) params.set("page_token", String(pageToken));
      const query = params.toString();
      const path = `${paths.mgmtEvidenceExplorer()}${query ? `?${query}` : ""}`;
      return liveOnlyRead<ManagementEvidenceOverview>(
        { method: "GET", path, signal: opts?.signal },
        adaptManagementEvidenceOverview,
      );
    },
    detail: (
      refId: string,
      seedFn: () => ManagementEvidenceDetail = () => defaultManagementEvidenceDetail(refId),
    ): Promise<ManagementEvidenceDetail> =>
      mgmtRead("mgmt.evidence.detail", { method: "GET", path: paths.mgmtEvidenceRef(refId) }, seedFn, adaptManagementEvidenceDetail),
    detailLiveOnly: (refId: string, opts?: { signal?: AbortSignal }): Promise<ManagementEvidenceDetail | undefined> =>
      liveOnlyRead<ManagementEvidenceDetail>(
        { method: "GET", path: paths.mgmtEvidenceRef(refId), signal: opts?.signal },
        adaptManagementEvidenceDetail,
      ),
  },

  personaIntent: {
    list: (
      seedFn: () => PersonaIntentTrace[],
      opts?: { kind?: PersonaIntentKind | "all" | string; sourceType?: string; personaId?: string; status?: string },
    ): Promise<PersonaIntentTrace[]> => {
      const base = paths.mgmtPersonaIntent();
      const params = new URLSearchParams();
      if (opts?.kind) params.set("kind", opts.kind);
      if (opts?.sourceType) params.set("source_type", opts.sourceType);
      if (opts?.personaId) params.set("persona_id", opts.personaId);
      if (opts?.status) params.set("status", opts.status);
      const qs = params.toString();
      const path = qs ? `${base}?${qs}` : base;
      return mgmtRead("mgmt.personaIntent.list", { method: "GET", path }, seedFn, adaptPersonaIntent);
    },
    listLiveOnly: (opts?: {
      kind?: PersonaIntentKind | "all" | string;
      sourceType?: string;
      personaId?: string;
      status?: string;
      signal?: AbortSignal;
    }): Promise<PersonaIntentAuditRecord[]> => {
      const base = paths.mgmtPersonaIntent();
      const params = new URLSearchParams();
      if (opts?.kind) params.set("kind", opts.kind);
      if (opts?.sourceType) params.set("source_type", opts.sourceType);
      if (opts?.personaId) params.set("persona_id", opts.personaId);
      if (opts?.status) params.set("status", opts.status);
      const qs = params.toString();
      const path = qs ? `${base}?${qs}` : base;
      return liveOnlyList<PersonaIntentAuditRecord>(
        { method: "GET", path, signal: opts?.signal },
        adaptPersonaIntent,
      );
    },
  },

  readiness: {
    ep5LiveOnly: (): Promise<ReadinessPageModel | undefined> =>
      liveOnlyRead<ReadinessPageModel>({ method: "GET", path: paths.mgmtReadinessEp5() }, adaptReadiness),
    ep5: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      mgmtRead("mgmt.readiness.ep5", { method: "GET", path: paths.mgmtReadinessEp5() }, seedFn, adaptReadiness),
    brokerLiveOnly: (): Promise<ReadinessPageModel | undefined> =>
      liveOnlyRead<ReadinessPageModel>({ method: "GET", path: paths.mgmtReadinessBrokerLive() }, adaptReadiness),
    brokerLive: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      mgmtRead("mgmt.readiness.brokerLive", { method: "GET", path: paths.mgmtReadinessBrokerLive() }, seedFn, adaptReadiness),
    capitalBindingLiveOnly: (): Promise<ReadinessPageModel | undefined> =>
      liveOnlyRead<ReadinessPageModel>({ method: "GET", path: paths.mgmtReadinessCapitalBinding() }, adaptReadiness),
    capitalBinding: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      mgmtRead("mgmt.readiness.capitalBinding", { method: "GET", path: paths.mgmtReadinessCapitalBinding() }, seedFn, adaptReadiness),
    bffHaLiveOnly: (): Promise<ReadinessPageModel | undefined> =>
      liveOnlyRead<ReadinessPageModel>({ method: "GET", path: paths.mgmtReadinessBffHa() }, adaptReadiness),
    bffHa: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      mgmtRead("mgmt.readiness.bffHa", { method: "GET", path: paths.mgmtReadinessBffHa() }, seedFn, adaptReadiness),
    strictPublishLiveOnly: (): Promise<ReadinessPageModel | undefined> =>
      liveOnlyRead<ReadinessPageModel>({ method: "GET", path: paths.mgmtReadinessStrictPublish() }, adaptReadiness),
    strictPublish: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      mgmtRead("mgmt.readiness.strictPublish", { method: "GET", path: paths.mgmtReadinessStrictPublish() }, seedFn, adaptReadiness),
  },

  // ---------- PM-12 ----------

  portfolioBook: {
    summaryLiveOnly: (opts?: { signal?: AbortSignal }): Promise<CockpitCapitalSummary | undefined> =>
      liveOnlyRead<CockpitCapitalSummary>(
        { method: "GET", path: paths.mgmtPortfolioBook(), signal: opts?.signal },
        adaptCockpitCapitalSummary,
      ),
    summary: (seedFn: () => PortfolioSummary): Promise<PortfolioSummary> =>
      mgmtRead(
        "mgmt.portfolioBook.summary",
        { method: "GET", path: paths.mgmtPortfolioBook() },
        seedFn,
        (raw) => {
          const data = unwrap(raw);
          return isObject(data) && "totalNav" in data ? (data as unknown as PortfolioSummary) : null;
        },
      ),
    poolsLiveOnly: (): Promise<CapitalPoolSummaryRow[]> =>
      liveOnlyList<CapitalPoolSummaryRow>(
        { method: "GET", path: paths.mgmtPortfolioPools() },
        adaptArrayPassthrough<CapitalPoolSummaryRow>,
      ),
    pools: (seedFn: () => CapitalPoolSummaryRow[]): Promise<CapitalPoolSummaryRow[]> =>
      mgmtRead("mgmt.portfolioBook.pools", { method: "GET", path: paths.mgmtPortfolioPools() }, seedFn, adaptArrayPassthrough<CapitalPoolSummaryRow>),
    holdingsLiveOnly: (opts?: { signal?: AbortSignal }): Promise<HoldingRow[]> =>
      liveOnlyList<HoldingRow>(
        { method: "GET", path: paths.mgmtPortfolioHoldings(), signal: opts?.signal },
        adaptPortfolioHoldingRows,
      ),
    holdings: (seedFn: () => HoldingRow[]): Promise<HoldingRow[]> =>
      mgmtRead("mgmt.portfolioBook.holdings", { method: "GET", path: paths.mgmtPortfolioHoldings() }, seedFn, adaptArrayPassthrough<HoldingRow>),
    exposureLiveOnly: (filters: PortfolioExposureFilters = {}, opts?: { signal?: AbortSignal }): Promise<ManagementPortfolioExposureMonitor | undefined> =>
      liveOnlyRead<ManagementPortfolioExposureMonitor>(
        {
          method: "GET",
          path: paths.mgmtPortfolioExposure(),
          query: {
            capital_pool_id: filters.capitalPoolId,
            persona_id: filters.personaId,
            runtime_id: filters.runtimeId,
            period: filters.period,
          },
          signal: opts?.signal,
        },
        adaptPortfolioExposureMonitor,
      ),
    monitorLiveOnly: (filters: PortfolioHoldingFilters, opts?: { signal?: AbortSignal }): Promise<PortfolioHoldingsMonitor | undefined> =>
      liveOnlyRead<PortfolioHoldingsMonitor>(
        {
          method: "GET",
          path: paths.mgmtPortfolioHoldings(),
          query: {
            deployment_stage: filters.deploymentStage,
            broker_id: filters.brokerId,
            runtime_id: filters.runtimeId,
            source_status: filters.sourceStatus,
            stale_telemetry: filters.staleTelemetry,
            risk_state: filters.riskState,
            capital_pool_id: filters.capitalPoolId,
            persona_id: filters.personaId,
          },
          signal: opts?.signal,
        },
        adaptPortfolioHoldingsMonitor,
      ),
    monitor: (filters: PortfolioHoldingFilters, seedFn: () => PortfolioHoldingsMonitor): Promise<PortfolioHoldingsMonitor> =>
      mgmtRead(
        "mgmt.portfolioBook.monitor",
        {
          method: "GET",
          path: paths.mgmtPortfolioHoldings({
            deployment_stage: filters.deploymentStage,
            broker_id: filters.brokerId,
            runtime_id: filters.runtimeId,
            source_status: filters.sourceStatus,
            stale_telemetry: filters.staleTelemetry,
            risk_state: filters.riskState,
            capital_pool_id: filters.capitalPoolId,
            persona_id: filters.personaId,
          }),
        },
        seedFn,
        adaptPortfolioHoldingsMonitor,
      ),
  },

  personaLeague: {
    listLiveOnly: (opts?: { signal?: AbortSignal }): Promise<PersonaLeagueRow[]> =>
      liveOnlyList<PersonaLeagueRow>(
        { method: "GET", path: paths.mgmtPersonaLeague(), signal: opts?.signal },
        adaptPersonaLeagueRankedRows,
      ),
    inventoryLiveOnly: (opts?: { signal?: AbortSignal }): Promise<PersonaLeagueInventoryRow[]> =>
      liveOnlyList<PersonaLeagueInventoryRow>(
        { method: "GET", path: paths.mgmtPersonaLeague(), signal: opts?.signal },
        adaptPersonaLeagueInventory,
      ),
    list: (seedFn: () => PersonaLeagueRow[]): Promise<PersonaLeagueRow[]> =>
      mgmtRead("mgmt.personaLeague.list", { method: "GET", path: paths.mgmtPersonaLeague() }, seedFn, adaptArrayPassthrough<PersonaLeagueRow>),
    rankingsLiveOnly: (opts?: { signal?: AbortSignal; criteria?: string; limit?: number }): Promise<PersonaLeagueRow[]> =>
      liveOnlyList<PersonaLeagueRow>(
        {
          method: "GET",
          path: paths.mgmtPersonaLeagueRankings(),
          query: { criteria: opts?.criteria, limit: opts?.limit },
          signal: opts?.signal,
        },
        adaptPersonaLeagueRankedRows,
      ),
    rankings: (seedFn: () => PersonaLeagueRow[]): Promise<PersonaLeagueRow[]> =>
      mgmtRead("mgmt.personaLeague.rankings", { method: "GET", path: paths.mgmtPersonaLeagueRankings() }, seedFn, adaptArrayPassthrough<PersonaLeagueRow>),
    tiers: <T>(seedFn: () => T): Promise<T> =>
      mgmtRead(
        "mgmt.personaLeague.tiers",
        { method: "GET", path: paths.mgmtPersonaLeagueTiers() },
        seedFn,
        (raw) => {
          const data = unwrap(raw);
          return isObject(data) ? (data as unknown as T) : null;
        },
      ),
  },

  quarterlyRanking: {
    listLiveOnly: (
      quarter?: string,
      filters?: { pageSize?: number; persona?: string },
      opts?: { signal?: AbortSignal },
    ): Promise<QuarterlyRankingRow[]> =>
      liveOnlyList<QuarterlyRankingRow>(
        { method: "GET", path: paths.mgmtQuarterlyRanking(quarter, filters), signal: opts?.signal },
        adaptQuarterlyRankingRows,
      ),
    list: (
      quarter: string | undefined,
      seedFn: () => QuarterlyRankingRow[],
      filters?: { pageSize?: number; persona?: string },
    ): Promise<QuarterlyRankingRow[]> =>
      mgmtRead("mgmt.quarterlyRanking.list", { method: "GET", path: paths.mgmtQuarterlyRanking(quarter, filters) }, seedFn, adaptQuarterlyRankingRows),
    formulaLiveOnly: (opts?: { signal?: AbortSignal }): Promise<QuarterlyRankingFormula | undefined> =>
      liveOnlyRead<QuarterlyRankingFormula>(
        { method: "GET", path: paths.mgmtQuarterlyRankingFormula(), signal: opts?.signal },
        (raw) => {
          const data = unwrap(raw);
          return isObject(data) && "weights" in data
            ? (data as unknown as QuarterlyRankingFormula) : null;
        },
      ),
    formula: (seedFn: () => QuarterlyRankingFormula): Promise<QuarterlyRankingFormula> =>
      mgmtRead(
        "mgmt.quarterlyRanking.formula",
        { method: "GET", path: paths.mgmtQuarterlyRankingFormula() },
        seedFn,
        (raw) => {
          const data = unwrap(raw);
          return isObject(data) && "weights" in data
            ? (data as unknown as QuarterlyRankingFormula) : null;
        },
      ),
    recommendations: (
      quarter: string | undefined,
      seedFn: () => QuarterlyRankingRow[],
    ): Promise<QuarterlyRankingRow[]> =>
      mgmtRead("mgmt.quarterlyRanking.recommendations", { method: "GET", path: paths.mgmtQuarterlyRankingRecommendations(quarter) }, seedFn, adaptQuarterlyRankingRows),
    recommendationsLiveOnly: async (quarter?: string, opts?: { signal?: AbortSignal }): Promise<QuarterlyRankingRow[]> => {
      const rows: QuarterlyRankingRow[] = [];
      let token: string | undefined;
      do {
        const page = await liveOnlyRead<{ rows: QuarterlyRankingRow[]; next?: string }>(
          { method: "GET", path: paths.mgmtQuarterlyRankingRecommendations(quarter, token), signal: opts?.signal },
          (raw) => {
            const info = (isObject(raw) ? raw.page_info : undefined) as { next_page_token?: string | null } | undefined;
            return { rows: adaptQuarterlyRankingRows(raw) ?? [], next: info?.next_page_token || undefined };
          },
        );
        rows.push(...(page?.rows ?? []));
        token = page?.next;
      } while (token);
      return rows;
    },
  },

  performanceAttribution: {
    /** Rows plus the period the BFF actually applied (meta.period). */
    getLiveOnly: (
      dimension?: AttributionDimension | string,
      period?: AttributionPeriod,
      opts?: {
        signal?: AbortSignal;
        includeTestPersonas?: boolean;
        include_test_personas?: boolean;
      },
    ): Promise<PerformanceAttributionExtendedResult> => {
      if (dimension !== undefined && !isBffAcceptedAttributionDimension(dimension)) {
        return Promise.resolve({
          rows: [],
          period: {
            requested: period,
            windowed: false,
            reason: "unsupported_attribution_dimension",
            message: `Dimension "${dimension}" is not supported by the BFF.`,
            source: "missing",
          },
        });
      }
      if (detectMode() === "mock") {
        return Promise.resolve({ rows: [], period: adaptAttributionPeriodState(undefined) });
      }
      const includeTest =
        opts?.includeTestPersonas ??
        opts?.include_test_personas ??
        (typeof window !== "undefined" &&
        new URLSearchParams(window.location?.search ?? "").get("include_test_personas") === "true"
          ? true
          : undefined);
      const basePath = paths.mgmtPerformanceAttribution(dimension, period);
      const path = includeTest
        ? `${basePath}${basePath.includes("?") ? "&" : "?"}include_test_personas=true`
        : basePath;
      return strictLiveRead<PerformanceAttributionExtendedResult>(
        `mgmt.${path}`,
        { method: "GET", path, signal: opts?.signal },
        adaptPerformanceAttributionResult,
      );
    },
    listLiveOnly: (
      dimension?: AttributionDimension | string,
      period?: AttributionPeriod,
      opts?: {
        signal?: AbortSignal;
        includeTestPersonas?: boolean;
        include_test_personas?: boolean;
      },
    ): Promise<PerformanceAttributionRow[]> => {
      if (dimension !== undefined && !isBffAcceptedAttributionDimension(dimension)) {
        return Promise.resolve([]);
      }
      const includeTest = opts?.includeTestPersonas ?? opts?.include_test_personas;
      const basePath = paths.mgmtPerformanceAttribution(dimension, period);
      const path = includeTest
        ? `${basePath}${basePath.includes("?") ? "&" : "?"}include_test_personas=true`
        : basePath;
      return liveOnlyList<PerformanceAttributionRow>(
        { method: "GET", path, signal: opts?.signal },
        adaptPerformanceAttributionRows,
      );
    },
    list: (
      dimension: AttributionDimension | string | undefined,
      period: AttributionPeriod | undefined,
      seedFn: () => PerformanceAttributionRow[],
      opts?: {
        includeTestPersonas?: boolean;
        include_test_personas?: boolean;
      },
    ): Promise<PerformanceAttributionRow[]> => {
      if (dimension !== undefined && !isBffAcceptedAttributionDimension(dimension)) {
        return Promise.resolve([]);
      }
      const includeTest = opts?.includeTestPersonas ?? opts?.include_test_personas;
      const basePath = paths.mgmtPerformanceAttribution(dimension, period);
      const path = includeTest
        ? `${basePath}${basePath.includes("?") ? "&" : "?"}include_test_personas=true`
        : basePath;
      return mgmtRead("mgmt.performanceAttribution.list", { method: "GET", path }, seedFn, adaptPerformanceAttributionRows);
    },
  },

  operationsReadModel: {
    getLiveOnly: (personaId: string, period?: string, opts?: { signal?: AbortSignal }): Promise<ManagementOperationsReadModel | undefined> =>
      liveOnlyRead<ManagementOperationsReadModel>(
        { method: "GET", path: paths.mgmtOperationsReadModel(personaId, period), signal: opts?.signal },
        adaptOperationsReadModel,
      ),
  },
};

export type Mgmt = typeof mgmt;
