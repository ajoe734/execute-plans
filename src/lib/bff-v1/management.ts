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

import { withLiveOrMock } from "./liveTransport";
import { strictNotFoundAsUndefined, withStrictLiveOrMock } from "@/lib/bff/liveRead";
import { paths } from "./paths";
import { bffFetch, type BffRequest } from "./client";
import { idempotencyKey as mintIdempotencyKey } from "./headers";
import { liveWriteGated } from "./writeGate";

import {
  composeCockpit, defaultCockpitSeed, type CockpitModel,
} from "@/lib/v5/management/cockpit";
import {
  defaultPulseRankings, type TradingPulseRankBlock,
} from "@/lib/v5/management/tradingRankings";
import {
  HUMAN_INBOX_KINDS,
  type HumanInboxAllowedActions,
  type HumanInboxDecisionRecord,
  type HumanInboxDetail,
  type HumanInboxItem,
  type HumanInboxKind,
} from "@/lib/v5/management/humanInbox";
import type { ManagementLinkSet } from "@/lib/v5/management/links";
import type { PersonaIntentTrace, PersonaIntentVisibility } from "@/lib/v5/management/personaIntent";
import type { ReadinessPageModel } from "@/lib/v5/management/readiness";
// PM-12 imports
import type {
  PortfolioSummary, CapitalPoolSummaryRow, HoldingRow,
} from "@/lib/v5/management/portfolio";
import type { LeagueRecommendedAction, PersonaLeagueRow } from "@/lib/v5/management/personaLeague";
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
  pnl?: number;
  sharpe?: number;
  maxDrawdown?: number;
  violationCount?: number;
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
  runtimeId?: string;
  runtimeBindingId?: string;
  deploymentStage?: string;
  capitalMode?: string;
  paperLedgerId?: string;
  paperLedger?: ManagementPersonaFleetPaperLedger;
  capitalPoolId?: string;
  capitalPool?: ManagementPersonaFleetCapitalPool;
  performanceSummary?: ManagementPersonaFleetPerformanceSummary;
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

export interface ManagementEvidenceSurface {
  status: string;
  source?: string;
  message?: string;
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
  traceableEvidence: number;
  traceable_evidence: number;
  unresolvedSourceEvidence: number;
  unresolved_source_evidence: number;
  incompleteEvidence: number;
  incomplete_evidence: number;
  needsAttentionEvidence: number;
  needs_attention_evidence: number;
  openOperationEvidence: number;
  open_operation_evidence: number;
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

const strictNotFoundAsEmptyArray = <T,>(err: unknown) => {
  const missing = strictNotFoundAsUndefined<T[]>(err);
  return missing?.handled ? { handled: true as const, value: [] as T[] } : undefined;
};

function liveOnlyRead<T, TLive = unknown>(
  req: BffRequest,
  adapt: (raw: unknown) => T | null,
): Promise<T | undefined> {
  return withStrictLiveOrMock<T | undefined, TLive>(
    req,
    async () => undefined,
    optionalAdapt(adapt),
    (err) => strictNotFoundAsUndefined<T>(err),
  );
}

function liveOnlyList<T>(
  req: BffRequest,
  adapt: (raw: unknown) => T[] | null,
): Promise<T[]> {
  return withStrictLiveOrMock<T[], unknown>(
    req,
    async () => [],
    listAdapt(adapt),
    strictNotFoundAsEmptyArray<T>,
  );
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

const asBooleanRecord = (value: unknown): Record<string, boolean> => {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, asBoolean(item, false)] as const),
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
      message: optionalString(value.message ?? value.summary),
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

function adaptEvidenceResolvedLink(value: unknown): ManagementEvidenceResolvedLink {
  const record = isObject(value) ? value : {};
  const availability = asString(record.availability, "unavailable");
  const routeHref = nullableString(record.routeHref ?? record.route_href);
  const displayLabel = asString(
    record.displayLabel ?? record.display_label,
    availability === "unavailable" ? "Source unavailable" : "Open source",
  );
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
  const refId = asString(value.refId ?? value.ref_id ?? value.id);
  if (!refId) return null;
  const title = asString(
    value.title ?? value.displayLabel ?? value.display_label ?? sourceDocument.title,
    refId,
  );
  const sourceType = asString(value.sourceType ?? value.source_type ?? sourceDocument.sourceType ?? sourceDocument.source_type, "unknown");
  const capturedAt = optionalString(value.capturedAt ?? value.captured_at ?? sourceDocument.capturedAt ?? sourceDocument.captured_at);
  const linkType = asString(value.linkType ?? value.link_type, "unknown");
  const linkedObjectSummary = adaptEvidenceLinkedObjectSummary(value.linkedObjectSummary ?? value.linked_object_summary);
  const linkedObjectLink = adaptEvidenceLinkedObjectLink(value.linkedObjectLink ?? value.linked_object_link);
  const resolvedLink = adaptEvidenceResolvedLink(value.resolvedLink ?? value.resolved_link);
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
  const needsAttentionEvidence = Math.max(items.length - traceableEvidence, 0);
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

function adaptEvidenceSummary(value: unknown, items: ManagementEvidenceListItem[]): ManagementEvidenceSummary {
  if (!isObject(value)) return buildEvidenceSummary(items);
  const computed = buildEvidenceSummary(items);
  const bySourceType = asCountRecord(value.bySourceType ?? value.by_source_type);
  const byLinkType = asCountRecord(value.byLinkType ?? value.by_link_type);
  const byCredibilityTier = asCountRecord(value.byCredibilityTier ?? value.by_credibility_tier);
  const byActionabilityState = asCountRecord(value.byActionabilityState ?? value.by_actionability_state);
  const byActionabilitySeverity = asCountRecord(value.byActionabilitySeverity ?? value.by_actionability_severity);
  const byOperationStatus = asCountRecord(value.byOperationStatus ?? value.by_operation_status);
  return {
    totalEvidence: asFiniteNumber(value.totalEvidence ?? value.total_evidence, computed.totalEvidence),
    total_evidence: asFiniteNumber(value.total_evidence ?? value.totalEvidence, computed.totalEvidence),
    returnedEvidence: asFiniteNumber(value.returnedEvidence ?? value.returned_evidence, computed.returnedEvidence),
    returned_evidence: asFiniteNumber(value.returned_evidence ?? value.returnedEvidence, computed.returnedEvidence),
    visibleEvidence: asFiniteNumber(value.visibleEvidence ?? value.visible_evidence, computed.visibleEvidence),
    visible_evidence: asFiniteNumber(value.visible_evidence ?? value.visibleEvidence, computed.visibleEvidence),
    redactedEvidence: asFiniteNumber(value.redactedEvidence ?? value.redacted_evidence, computed.redactedEvidence),
    redacted_evidence: asFiniteNumber(value.redacted_evidence ?? value.redactedEvidence, computed.redactedEvidence),
    verifiedEvidence: asFiniteNumber(value.verifiedEvidence ?? value.verified_evidence, computed.verifiedEvidence),
    verified_evidence: asFiniteNumber(value.verified_evidence ?? value.verifiedEvidence, computed.verifiedEvidence),
    bySourceType: Object.keys(bySourceType).length ? bySourceType : computed.bySourceType,
    by_source_type: Object.keys(bySourceType).length ? bySourceType : computed.bySourceType,
    byLinkType: Object.keys(byLinkType).length ? byLinkType : computed.byLinkType,
    by_link_type: Object.keys(byLinkType).length ? byLinkType : computed.byLinkType,
    byCredibilityTier: Object.keys(byCredibilityTier).length ? byCredibilityTier : computed.byCredibilityTier,
    by_credibility_tier: Object.keys(byCredibilityTier).length ? byCredibilityTier : computed.byCredibilityTier,
    traceableEvidence: asFiniteNumber(value.traceableEvidence ?? value.traceable_evidence, computed.traceableEvidence),
    traceable_evidence: asFiniteNumber(value.traceable_evidence ?? value.traceableEvidence, computed.traceableEvidence),
    unresolvedSourceEvidence: asFiniteNumber(value.unresolvedSourceEvidence ?? value.unresolved_source_evidence, computed.unresolvedSourceEvidence),
    unresolved_source_evidence: asFiniteNumber(value.unresolved_source_evidence ?? value.unresolvedSourceEvidence, computed.unresolvedSourceEvidence),
    incompleteEvidence: asFiniteNumber(value.incompleteEvidence ?? value.incomplete_evidence, computed.incompleteEvidence),
    incomplete_evidence: asFiniteNumber(value.incomplete_evidence ?? value.incompleteEvidence, computed.incompleteEvidence),
    needsAttentionEvidence: asFiniteNumber(value.needsAttentionEvidence ?? value.needs_attention_evidence, computed.needsAttentionEvidence),
    needs_attention_evidence: asFiniteNumber(value.needs_attention_evidence ?? value.needsAttentionEvidence, computed.needsAttentionEvidence),
    openOperationEvidence: asFiniteNumber(value.openOperationEvidence ?? value.open_operation_evidence, computed.openOperationEvidence),
    open_operation_evidence: asFiniteNumber(value.open_operation_evidence ?? value.openOperationEvidence, computed.openOperationEvidence),
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

function adaptEvidencePageInfo(value: unknown, items: ManagementEvidenceListItem[]): ManagementEvidencePageInfo {
  const record = isObject(value) ? value : {};
  const nextPageToken = nullableString(record.nextPageToken ?? record.next_page_token);
  const pageSize = asFiniteNumber(record.pageSize ?? record.page_size, items.length);
  const total = asFiniteNumber(record.total, items.length);
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
  const record = isObject(container) ? container : {};
  const rawItems = firstArray<unknown>(
    isObject(record) ? record.items : undefined,
    isObject(record) ? record.evidence_refs : undefined,
    isObject(record) ? record.data : undefined,
    container,
  );
  const items = rawItems.map(adaptEvidenceListItem).filter((item): item is ManagementEvidenceListItem => Boolean(item));
  const summary = adaptEvidenceSummary(isObject(record) ? record.summary : undefined, items);
  const facets = adaptEvidenceFacets(isObject(record) ? record.facets : undefined, summary);
  const pageInfo = adaptEvidencePageInfo(isObject(record) ? (record.page_info ?? record.pagination) : undefined, items);
  const meta = adaptEvidenceMeta(isObject(record) ? record.meta : undefined);
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
  return {
    refId,
    ref_id: refId,
    title: asString(data.title ?? data.displayLabel ?? data.display_label ?? sourceDocument.title, refId),
    sourceDocument,
    source_document: sourceDocument,
    linkType,
    link_type: linkType,
    credibility: adaptEvidenceCredibility(data.credibility),
    resolvedLink: adaptEvidenceResolvedLink(data.resolvedLink ?? data.resolved_link),
    resolved_link: adaptEvidenceResolvedLink(data.resolvedLink ?? data.resolved_link),
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
    meta: adaptEvidenceMeta(data.meta),
  };
}

export function defaultManagementEvidenceOverview(): ManagementEvidenceOverview {
  return adaptManagementEvidenceOverview({
    items: [
      {
        id: "evref-demo-readiness-001",
        title: "Readiness evidence unavailable in mock mode",
        sourceType: "unknown",
        linkType: "supporting_evidence",
        capturedAt: "2026-06-15T13:02:00Z",
        credibility: { tier: "unverified", verified: false },
        linkedObjectSummary: {
          entity_type: "readiness",
          entity_ref: "mock-readiness",
          display_label: "Mock readiness gate",
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
          reasons: ["mock_unavailable", "resolved_link_unavailable"],
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
      snapshot_at: "mock",
      surfaces: {
        management_evidence: { status: "mock", source: "local_snapshot" },
        evidence_refs: { status: "mock", source: "local_snapshot" },
      },
      redacted_evidence_count: 0,
    },
  }) as ManagementEvidenceOverview;
}

export function defaultManagementEvidenceDetail(refId = "evref-demo-readiness-001"): ManagementEvidenceDetail {
  return adaptManagementEvidenceDetail({
    ref_id: refId,
    source_document: {
      title: "Readiness evidence unavailable in mock mode",
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
      entity_ref: "mock-readiness",
      display_label: "Mock readiness gate",
    },
    linked_object_link: {
      availability: "unavailable",
      route_href: null,
      display_label: "Mock readiness gate",
      reason: "mock_unavailable",
    },
    linked_decisions: [],
    source_note_context: null,
    source_memory_context: null,
    created_at: "2026-06-15T13:02:00Z",
    actionability: {
      state: "unresolved_source",
      severity: "warning",
      reasons: ["mock_unavailable", "resolved_link_unavailable"],
      can_trace: false,
      can_open_source: false,
      can_open_linked_object: false,
    },
    operation: { status: "none", task_refs: [], command_refs: [], audit_refs: [], events: [] },
    relationships: {
      readiness: [
        {
          entity_type: "readiness",
          entity_ref: "mock-readiness",
          display_label: "Mock readiness gate",
          route_href: null,
          link_type: "supporting_evidence",
          source: "mock",
        },
      ],
    },
    chain: {
      nodes: [],
      edges: [],
      empty_reason: "mock_unavailable",
      degraded_reasons: ["mock_unavailable"],
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
      snapshot_at: "mock",
      surfaces: {
        evidence_ref_detail: "mock",
        resolved_link: "mock",
        linked_decisions: "mock",
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
  const performanceSummary = objectOrEmpty(value.performanceSummary ?? value.performance_summary);
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
  const capitalPoolId = normalizedCapitalMode === "paper"
    ? asOptionalString(
        value.targetCapitalPoolId
        ?? value.target_capital_pool_id
        ?? value.liveCapitalPoolId
        ?? value.live_capital_pool_id,
      )
    : asOptionalString(value.capitalPoolId ?? value.capital_pool_id ?? capitalPool.id);
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
    perfDelta: Number.isFinite(perfDelta) ? perfDelta : 0,
    humanNeeded,
    lastMutation: updated.length >= 10 ? updated.slice(0, 10) : updated,
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
    performanceSummary: isObject(value.performanceSummary ?? value.performance_summary) ? {
      pnl: optionalFiniteNumber(performanceSummary.pnl),
      sharpe: optionalFiniteNumber(performanceSummary.sharpe),
      maxDrawdown: optionalFiniteNumber(performanceSummary.maxDrawdown ?? performanceSummary.max_drawdown),
      violationCount: optionalFiniteNumber(performanceSummary.violationCount ?? performanceSummary.violation_count),
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

const emptyHumanInbox = (): HumanInboxItem[] => [];
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

export type ManagementRankingRecommendationAction = Exclude<LeagueRecommendedAction, "no_change">;
export type ManagementRankingRecommendationSource = "persona_league" | "quarterly_ranking";

export interface RankingRecommendationSubmitInput {
  recommendationId?: string;
  actionId: ManagementRankingRecommendationAction;
  quarter: string;
  personaId: string;
  personaName?: string;
  source: ManagementRankingRecommendationSource;
  evidenceRefs?: string[];
  governanceDestinations?: string[];
  liveCapitalMutation?: false;
}

export interface RankingRecommendationSubmitResult {
  ok: true;
  persisted: boolean;
  recommendationId: string;
  actionId: ManagementRankingRecommendationAction;
  quarter: string;
  personaId: string;
  status: string;
  idempotencyKey: string;
  commandId?: string;
  humanInboxId?: string;
  reviewId?: string;
  detailHref?: string;
  replayed?: boolean;
  liveCapitalMutation: false;
  governanceDestinations: string[];
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

const adaptInboxRecord = (it: Record<string, unknown>): HumanInboxItem | null => {
  const rawKind = it.kind ?? it.inboxType ?? it.inbox_type ?? it.source_type ?? it.sourceType;
  const kind = normalizeInboxKind(rawKind);
  const fallbackReviewId = asString(it.reviewId ?? it.review_id ?? it.source_id);
  const id = asString(
    it.id ?? it.inbox_id ?? it.inboxId,
    kind === "promotion_review" && fallbackReviewId ? `promotion_review:${fallbackReviewId}` : "",
  );
  if (!id) return null;
  const actionState = asString(it.action_state ?? it.actionState ?? it.status);
  const canDecide = asBoolean(
    it.canDecide ?? it.can_decide,
    allowedActionsCanDecide(it.allowedActions ?? it.allowed_actions, true),
  );
  const canProceed = asBoolean(
    it.canProceed ?? it.can_proceed,
    actionState ? !actionStateBlocksProceed(actionState) : true,
  );
  const personaId = asOptionalString(it.personaId ?? it.persona_id);
  const reviewId = asOptionalString(it.reviewId ?? it.review_id ?? it.source_id);
  const reviewType = asOptionalString(it.reviewType ?? it.review_type);
  const sourceId = asOptionalString(it.sourceId ?? it.source_id ?? reviewId);
  const decisionHref = asOptionalString(it.decisionHref ?? it.decision_href);
  const blockingReasons = asInboxStringList(it.blockingReasons ?? it.blocking_reasons ?? it.reasons);
  const route = kind === "promotion_review" && personaId
    ? inboxPersonaManageHref(personaId)
    : it.route ?? it.manageHref ?? (isObject(it.target) ? it.target.route : undefined);
  const allowedActions = adaptInboxAllowedActions(it.allowedActions ?? it.allowed_actions, canDecide);
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
    status: asOptionalString(it.status),
    sourceId,
    personaId,
    reviewId,
    reviewType,
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

const RANKING_RECOMMENDATION_GOVERNANCE_DESTINATIONS = [
  "human_inbox",
  "governance_queue",
  "human_gate_decision",
] as const;

const sanitizeRecommendationPart = (value: unknown, fallback: string): string => {
  const text = asString(value, fallback)
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || fallback;
};

const defaultRankingRecommendationId = (input: RankingRecommendationSubmitInput): string =>
  [
    "pm12-rec",
    sanitizeRecommendationPart(input.source, "ranking"),
    sanitizeRecommendationPart(input.quarter, "quarter"),
    sanitizeRecommendationPart(input.personaId, "persona"),
    sanitizeRecommendationPart(input.actionId, "action"),
  ].join("-");

const normalizeGovernanceDestinations = (destinations?: string[]): string[] => {
  const raw = destinations && destinations.length > 0
    ? destinations
    : [...RANKING_RECOMMENDATION_GOVERNANCE_DESTINATIONS];
  return Array.from(new Set(raw.map((item) => asString(item)).filter(Boolean)));
};

const firstOptionalString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const text = asOptionalString(value);
    if (text) return text;
  }
  return undefined;
};

const promotionReviewInboxId = (reviewId?: string): string | undefined => {
  if (!reviewId) return undefined;
  return reviewId.startsWith("promotion_review:") ? reviewId : `promotion_review:${reviewId}`;
};

const humanInboxDetailHref = (humanInboxId?: string): string | undefined =>
  humanInboxId ? `/management/human-inbox/${encodeURIComponent(humanInboxId)}` : undefined;

const buildRankingRecommendationSubmitPayload = (
  input: RankingRecommendationSubmitInput,
  recommendationId: string,
): Record<string, unknown> => {
  const governanceDestinations = normalizeGovernanceDestinations(input.governanceDestinations);
  return {
    quarter: input.quarter,
    recommendation_id: recommendationId,
    recommendationId,
    recommendation_action_id: input.actionId,
    recommendationActionId: input.actionId,
    actionId: input.actionId,
    persona_id: input.personaId,
    personaId: input.personaId,
    persona_name: input.personaName,
    personaName: input.personaName,
    source: input.source,
    evidence_refs: input.evidenceRefs ?? [],
    evidenceRefs: input.evidenceRefs ?? [],
    governance_destinations: governanceDestinations,
    governanceDestinations,
    live_capital_mutation: false,
    liveCapitalMutation: false,
    direct_live_capital_mutation: false,
    runtime_mutation: false,
    reason: `PM-12 ${input.source} recommendation requires Human Inbox review before any governed action.`,
  };
};

const adaptRankingRecommendationSubmitResult = (
  raw: unknown,
  input: RankingRecommendationSubmitInput,
  recommendationId: string,
  idempotencyKey: string,
): RankingRecommendationSubmitResult => {
  const root = isObject(raw) ? raw : {};
  const data = isObject(root.data) ? root.data : {};
  const item = isObject(data.item) ? data.item
    : isObject(root.item) ? root.item
      : {};
  const receipt = isObject(data.receipt) ? data.receipt : {};
  const meta = isObject(root.meta) ? root.meta : {};
  const idem = isObject(meta.idempotency) ? meta.idempotency : {};
  const reviewId = firstOptionalString(
    data.reviewId,
    data.review_id,
    data.promotionReviewId,
    data.promotion_review_id,
    item.reviewId,
    item.review_id,
    item.promotionReviewId,
    item.promotion_review_id,
  );
  const humanInboxId = firstOptionalString(
    data.humanInboxId,
    data.human_inbox_id,
    data.inboxId,
    data.inbox_id,
    item.humanInboxId,
    item.human_inbox_id,
    item.inboxId,
    item.inbox_id,
    promotionReviewInboxId(reviewId),
  );
  const detailHref = firstOptionalString(
    data.detailHref,
    data.detail_href,
    data.humanInboxHref,
    data.human_inbox_href,
    data.reviewHref,
    data.review_href,
    item.detailHref,
    item.detail_href,
    item.humanInboxHref,
    item.human_inbox_href,
    humanInboxDetailHref(humanInboxId),
  );
  return {
    ok: true,
    persisted: true,
    recommendationId,
    actionId: input.actionId,
    quarter: input.quarter,
    personaId: input.personaId,
    status: asString(data.status ?? root.status, "accepted"),
    idempotencyKey: asString(idem.idempotencyKey ?? idem.key, idempotencyKey),
    commandId: firstOptionalString(
      data.commandId,
      data.command_id,
      receipt.commandId,
      receipt.command_id,
      receipt.receipt_id,
    ),
    humanInboxId,
    reviewId,
    detailHref,
    replayed: asBoolean(idem.replayed, false),
    liveCapitalMutation: false,
    governanceDestinations: normalizeGovernanceDestinations(input.governanceDestinations),
  };
};

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
        ...it,
        subjectId,
        subjectLabel: String(it.runtimeId ?? it.runtime_id ?? it.subjectLabel ?? subjectId ?? "—"),
        metric: String(b.label ?? metric),
        metricValue: rankingMetricValue(it, metric),
        metricUnit: undefined,
        links: undefined,
        rankingEligible: Boolean(it.rankingEligible ?? it.ranking_eligible ?? true),
        ranking_eligible: Boolean(it.ranking_eligible ?? it.rankingEligible ?? true),
      };
    });
    return {
      ...b,
      kind: String(b.blockId ?? b.block_id ?? b.kind ?? metric),
      label: String(b.label ?? metric),
      rows,
      eligibleItemCount: asFiniteNumber(b.eligibleItemCount ?? b.eligible_item_count, rows.length),
      eligible_item_count: asFiniteNumber(b.eligible_item_count ?? b.eligibleItemCount, rows.length),
      missingMetricCount: asFiniteNumber(b.missingMetricCount ?? b.missing_metric_count, 0),
      missing_metric_count: asFiniteNumber(b.missing_metric_count ?? b.missingMetricCount, 0),
      missingMetricRuntimeIds: Array.isArray(b.missingMetricRuntimeIds ?? b.missing_metric_runtime_ids)
        ? (b.missingMetricRuntimeIds ?? b.missing_metric_runtime_ids) as string[]
        : [],
      missing_metric_runtime_ids: Array.isArray(b.missing_metric_runtime_ids ?? b.missingMetricRuntimeIds)
        ? (b.missing_metric_runtime_ids ?? b.missingMetricRuntimeIds) as string[]
        : [],
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

const PERSONA_INTENT_VISIBILITIES = new Set(["summary", "redacted", "restricted"]);

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
        ? asString(rawItem.id ?? rawItem.ref ?? rawItem.evidence_ref ?? rawItem.ref_id ?? rawItem.href ?? rawItem.route)
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

function normalizePersonaIntentRecord(record: Record<string, unknown>): PersonaIntentTrace | null {
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
  const title = asString(record.title ?? record.intent, id);
  const redactedBy = normalizePersonaIntentRedactedBy(
    redaction.redactedBy ??
    redaction.redacted_by ??
    record.redactedBy ??
    record.redacted_by,
  );

  return {
    id,
    title,
    sourceType,
    sourceId,
    sourceStatus: asString(record.status ?? record.source_status),
    detailHref: asString(record.route ?? record.bff_detail_path ?? record.detailHref ?? record.detail_href),
    ringPersonaId,
    ringBearerId,
    userIntentSummary: rawSummary || (visibility === "summary" ? title : "[redacted by policy]"),
    personaInterpretation: asString(record.personaInterpretation ?? record.persona_interpretation),
    proposedAction: asString(record.proposedAction ?? record.proposed_action),
    toolsUsed: normalizePersonaIntentStringList(record.toolsUsed, record.tools_used),
    consultedPersonas: normalizePersonaIntentStringList(record.consultedPersonas, record.consulted_personas, personaIds),
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

export function adaptPersonaIntent(raw: unknown): PersonaIntentTrace[] | null {
  const root = isObject(raw) ? raw : {};
  const data = unwrap(raw);
  const rows = asArray<unknown>(data) ??
    (isObject(data) ? asArray<unknown>(data.items ?? data.data) : null) ??
    asArray<unknown>(root.items ?? root.data);
  if (!rows) return null;
  return rows
    .filter(isObject)
    .map(normalizePersonaIntentRecord)
    .filter((row): row is PersonaIntentTrace => row !== null);
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
    getLiveOnly: (): Promise<CockpitModel | undefined> =>
      liveOnlyRead<CockpitModel>({ method: "GET", path: paths.mgmtCockpit() }, adaptCockpit),
  },

  humanInbox: {
    list: (): Promise<HumanInboxItem[]> =>
      withStrictLiveOrMock<HumanInboxItem[], unknown>(
        { method: "GET", path: paths.mgmtHumanInbox() },
        async () => emptyHumanInbox(),
        (raw) => adaptHumanInboxList(raw) ?? emptyHumanInbox(),
      ),
    get: (id: string): Promise<HumanInboxDetail | undefined> =>
      withStrictLiveOrMock<HumanInboxDetail | undefined, unknown>(
        { method: "GET", path: paths.mgmtHumanInboxItem(id) },
        async () => missingHumanInboxDetail(),
        (raw) => adaptHumanInboxDetail(raw) ?? missingHumanInboxDetail(),
        strictNotFoundAsUndefined,
      ),
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
    rankingsLiveOnly: (): Promise<TradingPulseRankBlock[]> =>
      liveOnlyList<TradingPulseRankBlock>(
        { method: "GET", path: paths.mgmtTradingRankings() },
        adaptRankings,
      ),
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
    getLiveOnly: (): Promise<ManagementTradingPulseModel | undefined> =>
      liveOnlyRead<ManagementTradingPulseModel>(
        { method: "GET", path: paths.mgmtTradingPulse() },
        adaptTradingPulseOverview,
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
    overview: (
      seedFn: () => ManagementEvidenceOverview = defaultManagementEvidenceOverview,
    ): Promise<ManagementEvidenceOverview> =>
      withLiveOrMock<ManagementEvidenceOverview, unknown>(
        { method: "GET", path: paths.mgmtEvidenceExplorer() },
        async () => seedFn(),
        safeAdapt(adaptManagementEvidenceOverview, seedFn),
      ),
    overviewLiveOnly: (): Promise<ManagementEvidenceOverview | undefined> =>
      liveOnlyRead<ManagementEvidenceOverview>(
        { method: "GET", path: paths.mgmtEvidenceExplorer() },
        adaptManagementEvidenceOverview,
      ),
    detail: (
      refId: string,
      seedFn: () => ManagementEvidenceDetail = () => defaultManagementEvidenceDetail(refId),
    ): Promise<ManagementEvidenceDetail> =>
      withLiveOrMock<ManagementEvidenceDetail, unknown>(
        { method: "GET", path: paths.mgmtEvidenceRef(refId) },
        async () => seedFn(),
        safeAdapt(adaptManagementEvidenceDetail, seedFn),
      ),
    detailLiveOnly: (refId: string): Promise<ManagementEvidenceDetail | undefined> =>
      liveOnlyRead<ManagementEvidenceDetail>(
        { method: "GET", path: paths.mgmtEvidenceRef(refId) },
        adaptManagementEvidenceDetail,
      ),
  },

  personaIntent: {
    list: (seedFn: () => PersonaIntentTrace[]): Promise<PersonaIntentTrace[]> =>
      withLiveOrMock<PersonaIntentTrace[]>(
        { method: "GET", path: paths.mgmtPersonaIntent() },
        async () => seedFn(),
        safeAdapt(adaptPersonaIntent, seedFn),
      ),
    listLiveOnly: (): Promise<PersonaIntentTrace[]> =>
      liveOnlyList<PersonaIntentTrace>(
        { method: "GET", path: paths.mgmtPersonaIntent() },
        adaptPersonaIntent,
      ),
  },

  readiness: {
    ep5LiveOnly: (): Promise<ReadinessPageModel | undefined> =>
      liveOnlyRead<ReadinessPageModel>({ method: "GET", path: paths.mgmtReadinessEp5() }, adaptReadiness),
    ep5: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessEp5() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
    brokerLiveOnly: (): Promise<ReadinessPageModel | undefined> =>
      liveOnlyRead<ReadinessPageModel>({ method: "GET", path: paths.mgmtReadinessBrokerLive() }, adaptReadiness),
    brokerLive: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessBrokerLive() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
    capitalBindingLiveOnly: (): Promise<ReadinessPageModel | undefined> =>
      liveOnlyRead<ReadinessPageModel>({ method: "GET", path: paths.mgmtReadinessCapitalBinding() }, adaptReadiness),
    capitalBinding: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessCapitalBinding() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
    bffHaLiveOnly: (): Promise<ReadinessPageModel | undefined> =>
      liveOnlyRead<ReadinessPageModel>({ method: "GET", path: paths.mgmtReadinessBffHa() }, adaptReadiness),
    bffHa: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessBffHa() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
    strictPublishLiveOnly: (): Promise<ReadinessPageModel | undefined> =>
      liveOnlyRead<ReadinessPageModel>({ method: "GET", path: paths.mgmtReadinessStrictPublish() }, adaptReadiness),
    strictPublish: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessStrictPublish() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
  },

  // ---------- PM-12 ----------

  portfolioBook: {
    summaryLiveOnly: (): Promise<PortfolioSummary | undefined> =>
      liveOnlyRead<PortfolioSummary>(
        { method: "GET", path: paths.mgmtPortfolioBook() },
        (raw) => {
          const data = unwrap(raw);
          return isObject(data) && "totalNav" in data ? (data as unknown as PortfolioSummary) : null;
        },
      ),
    summary: (seedFn: () => PortfolioSummary): Promise<PortfolioSummary> =>
      withLiveOrMock<PortfolioSummary>(
        { method: "GET", path: paths.mgmtPortfolioBook() },
        async () => seedFn(),
        safeAdapt((raw) => {
          const data = unwrap(raw);
          return isObject(data) && "totalNav" in data ? (data as unknown as PortfolioSummary) : null;
        }, seedFn),
      ),
    poolsLiveOnly: (): Promise<CapitalPoolSummaryRow[]> =>
      liveOnlyList<CapitalPoolSummaryRow>(
        { method: "GET", path: paths.mgmtPortfolioPools() },
        adaptArrayPassthrough<CapitalPoolSummaryRow>,
      ),
    pools: (seedFn: () => CapitalPoolSummaryRow[]): Promise<CapitalPoolSummaryRow[]> =>
      withLiveOrMock<CapitalPoolSummaryRow[]>(
        { method: "GET", path: paths.mgmtPortfolioPools() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<CapitalPoolSummaryRow>, seedFn),
      ),
    holdingsLiveOnly: (): Promise<HoldingRow[]> =>
      liveOnlyList<HoldingRow>(
        { method: "GET", path: paths.mgmtPortfolioHoldings() },
        adaptArrayPassthrough<HoldingRow>,
      ),
    holdings: (seedFn: () => HoldingRow[]): Promise<HoldingRow[]> =>
      withLiveOrMock<HoldingRow[]>(
        { method: "GET", path: paths.mgmtPortfolioHoldings() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<HoldingRow>, seedFn),
      ),
  },

  personaLeague: {
    listLiveOnly: (): Promise<PersonaLeagueRow[]> =>
      liveOnlyList<PersonaLeagueRow>(
        { method: "GET", path: paths.mgmtPersonaLeague() },
        adaptArrayPassthrough<PersonaLeagueRow>,
      ),
    list: (seedFn: () => PersonaLeagueRow[]): Promise<PersonaLeagueRow[]> =>
      withLiveOrMock<PersonaLeagueRow[]>(
        { method: "GET", path: paths.mgmtPersonaLeague() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<PersonaLeagueRow>, seedFn),
      ),
    rankingsLiveOnly: (): Promise<PersonaLeagueRow[]> =>
      liveOnlyList<PersonaLeagueRow>(
        { method: "GET", path: paths.mgmtPersonaLeagueRankings() },
        adaptArrayPassthrough<PersonaLeagueRow>,
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
    listLiveOnly: (quarter?: string): Promise<QuarterlyRankingRow[]> =>
      liveOnlyList<QuarterlyRankingRow>(
        { method: "GET", path: paths.mgmtQuarterlyRanking(quarter) },
        adaptArrayPassthrough<QuarterlyRankingRow>,
      ),
    list: (quarter: string | undefined, seedFn: () => QuarterlyRankingRow[]): Promise<QuarterlyRankingRow[]> =>
      withLiveOrMock<QuarterlyRankingRow[]>(
        { method: "GET", path: paths.mgmtQuarterlyRanking(quarter) },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<QuarterlyRankingRow>, seedFn),
      ),
    formulaLiveOnly: (): Promise<QuarterlyRankingFormula | undefined> =>
      liveOnlyRead<QuarterlyRankingFormula>(
        { method: "GET", path: paths.mgmtQuarterlyRankingFormula() },
        (raw) => {
          const data = unwrap(raw);
          return isObject(data) && "weights" in data
            ? (data as unknown as QuarterlyRankingFormula) : null;
        },
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
    recommendationsLiveOnly: (quarter?: string): Promise<QuarterlyRankingRow[]> =>
      liveOnlyList<QuarterlyRankingRow>(
        { method: "GET", path: paths.mgmtQuarterlyRankingRecommendations(quarter) },
        adaptArrayPassthrough<QuarterlyRankingRow>,
      ),
    submitRecommendation: async (
      input: RankingRecommendationSubmitInput,
      opts: { idempotencyKey?: string } = {},
    ): Promise<RankingRecommendationSubmitResult> => {
      const recommendationId = input.recommendationId || defaultRankingRecommendationId(input);
      const idempotencyKey = opts.idempotencyKey ?? mintIdempotencyKey();
      const governanceDestinations = normalizeGovernanceDestinations(input.governanceDestinations);
      const writeAllowed = await liveWriteGated();
      if (!writeAllowed) {
        return {
          ok: true,
          persisted: false,
          recommendationId,
          actionId: input.actionId,
          quarter: input.quarter,
          personaId: input.personaId,
          status: "write_disabled",
          idempotencyKey,
          liveCapitalMutation: false,
          governanceDestinations,
        };
      }
      const raw = await bffFetch<unknown>({
        method: "POST",
        path: paths.mgmtQuarterlyRankingRecommendationSubmit(recommendationId),
        body: buildRankingRecommendationSubmitPayload(input, recommendationId),
        idempotencyKey,
        mode: "live",
      });
      return adaptRankingRecommendationSubmitResult(raw, input, recommendationId, idempotencyKey);
    },
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
