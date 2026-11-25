import { detectMode } from "./client";
import { asRecord, strictLiveRead, type UnknownRecord } from "./domainReads";
import type {
  AlphaFactoryCard,
  AlphaFactoryData,
  AlphaFactoryEnvelope,
  AlphaFactoryLane,
  AlphaFactoryLaneId,
  AlphaFactoryMeta,
  AlphaFactoryPageInfo,
  ManagementSurfaceState,
  RiskLevel,
} from "./dto";
import { BffError } from "./errors";
import { paths } from "./paths";

export type {
  AlphaFactoryCard,
  AlphaFactoryData,
  AlphaFactoryEnvelope,
  AlphaFactoryLane,
  AlphaFactoryLaneId,
  AlphaFactoryMeta,
  AlphaFactoryPageInfo,
} from "./dto";

/**
 * FE-ALPHA-FACTORY-PIPELINE-TRUTH-20261125: the board reads the real discovery pipeline
 * (BFF-ALPHA-FACTORY-PIPELINE-TRUTH-20261125). Open research demands, hypothesis cards and
 * template searches are pipeline items, not admissions; completed admissions without a
 * recorded gate pass arrive in `data.document_checked`.
 */
export type AlphaFactoryPipelineKind = "research_demand" | "hypothesis_card" | "template_search";

export interface AlphaFactoryPipelineItem {
  id: string;
  kind: AlphaFactoryPipelineKind;
  lane: "discovered" | "scaffolded";
  demand_id: string | null;
  persona_id: string | null;
  display_name: string | null;
  seed_id: string | null;
  source_id: string | null;
  claim: string | null;
  short_measure: string | null;
  missing_datasets: string[];
  tried_families: string[];
  since: string | null;
  status: string | null;
  latest_reason_code: string | null;
  latest_reason: string | null;
  attempt_count: number | null;
  latest_run_id: string | null;
  latest_at: string | null;
  outcome: string | null;
}

/** Admission card plus the owner facts the pipeline-truth BFF adds. */
export interface AlphaFactoryAdmissionCard extends AlphaFactoryCard {
  /** Typed reason code of a gate attempt (from `last_error`). */
  reason_code?: string | null;
  /** Why a completed admission is only a document check. */
  document_check_reason?: string | null;
  /** True only when the owner recorded a passing replication gate. */
  gate_passed?: boolean;
}

export const ALPHA_FACTORY_COUNT_KEYS = [
  "collected_text_records",
  "dropped_irrelevant",
  "hypothesis_cards",
  "templates_evaluated",
  "templates_registered",
  "searches",
  "passes",
] as const;
export type AlphaFactoryCountKey = (typeof ALPHA_FACTORY_COUNT_KEYS)[number];

/** A stage count: a value only when its owner answered; otherwise unavailable with its reason, never 0. */
export type AlphaFactoryCount =
  | { status: "ok"; value: number; reason: null }
  | { status: "unavailable"; value: null; reason: string };

export type AlphaFactoryCounts = Record<AlphaFactoryCountKey, AlphaFactoryCount>;

export interface AlphaFactoryPipelineData extends AlphaFactoryData {
  pipeline: {
    discovered: AlphaFactoryPipelineItem[];
    scaffolded: AlphaFactoryPipelineItem[];
  };
  document_checked: AlphaFactoryAdmissionCard[];
  counts: AlphaFactoryCounts;
}

export interface AlphaFactoryPipelineEnvelope extends AlphaFactoryEnvelope {
  data: AlphaFactoryPipelineData;
}

const PIPELINE_KINDS = new Set<string>(["research_demand", "hypothesis_card", "template_search"]);

function pipelineKindOf(record: UnknownRecord | null | undefined): AlphaFactoryPipelineKind | null {
  const kind = cleanString(record?.kind)?.toLowerCase();
  return kind && PIPELINE_KINDS.has(kind) ? (kind as AlphaFactoryPipelineKind) : null;
}

export function normalizeAlphaFactoryPipelineItem(raw: unknown): AlphaFactoryPipelineItem | undefined {
  const record = asRecord(raw);
  const kind = pipelineKindOf(record);
  if (!record || !kind) return undefined;
  const demandId = cleanString(record.demand_id ?? record.demandId);
  const seedId = cleanString(record.seed_id ?? record.seedId);
  const id = cleanString(record.id) ?? demandId ?? seedId;
  if (!id) return undefined;
  const lacking = asRecord(record.lacking) ?? {};
  const latest = asRecord(record.latest_outcome ?? record.latestOutcome) ?? {};
  const strings = (value: unknown): string[] => nullableStringArray(value) ?? [];
  const isSearch = kind === "template_search";
  return {
    id,
    kind,
    lane: isSearch ? "scaffolded" : "discovered",
    demand_id: demandId,
    persona_id: cleanString(record.persona_id ?? record.personaId),
    display_name: cleanString(record.display_name ?? record.displayName),
    seed_id: seedId,
    source_id: cleanString(record.source_id ?? record.sourceId),
    claim: cleanString(record.claim),
    short_measure: cleanString(lacking.short_measure ?? record.short_measure),
    missing_datasets: strings(lacking.missing_datasets ?? record.missing_datasets),
    tried_families: strings(lacking.tried_families ?? record.tried_families),
    since: cleanString(record.since ?? record.created_at),
    status: cleanString(record.status ?? latest.status),
    latest_reason_code: isSearch
      ? cleanString(record.reason_code)
      : cleanString(latest.reason_code),
    latest_reason: isSearch ? cleanString(record.reason) : cleanString(latest.reason),
    attempt_count: nullableInt(record.attempt_count ?? record.attemptCount),
    latest_run_id: cleanString(record.latest_run_id ?? record.latestRunId),
    latest_at: cleanString(record.latest_at ?? record.latestAt),
    outcome: cleanString(record.outcome),
  };
}

function normalizeCount(raw: unknown): AlphaFactoryCount {
  const record = asRecord(raw);
  if (!record) return { status: "unavailable", value: null, reason: "not_reported" };
  const status = cleanString(record.status)?.toLowerCase();
  const value = record.value;
  if (status === "ok" && typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return { status: "ok", value: Math.trunc(value), reason: null };
  }
  return {
    status: "unavailable",
    value: null,
    reason: cleanString(record.reason) ?? (status === "ok" ? "value_not_reported" : "owner_read_failed"),
  };
}

export function normalizeAlphaFactoryCounts(raw: unknown): AlphaFactoryCounts {
  const record = asRecord(raw) ?? {};
  return Object.fromEntries(
    ALPHA_FACTORY_COUNT_KEYS.map((key) => [key, normalizeCount(record[key])]),
  ) as AlphaFactoryCounts;
}

export interface AlphaFactoryQuery {
  lane?: AlphaFactoryLaneId | string;
  page?: number;
  pageSize?: number;
  page_size?: number;
}

const VALID_LANES = new Set<AlphaFactoryLaneId>(["discovered", "scaffolded", "replicated"]);
const VALID_RISK_LEVELS = new Set<RiskLevel>(["info", "low", "medium", "high", "critical"]);

function cleanString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function nullableInt(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === "boolean") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nullableStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map((item) => cleanString(item))
    .filter((item): item is string => item !== null);
}

function normalizeLaneId(value: unknown, fallback: AlphaFactoryLaneId = "scaffolded"): AlphaFactoryLaneId {
  const cleaned = cleanString(value)?.toLowerCase() as AlphaFactoryLaneId | undefined;
  if (cleaned && VALID_LANES.has(cleaned)) {
    return cleaned;
  }
  return fallback;
}

function normalizeOptionalSharpe(record: UnknownRecord): { hasSharpe: boolean; sharpe: number | null } {
  if (!Object.prototype.hasOwnProperty.call(record, "sharpe")) {
    return { hasSharpe: false, sharpe: null };
  }
  const raw = record.sharpe;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { hasSharpe: true, sharpe: raw };
  }
  return { hasSharpe: true, sharpe: null };
}

function normalizeOptionalRisk(record: UnknownRecord): { hasRisk: boolean; risk: RiskLevel | null } {
  const key = Object.prototype.hasOwnProperty.call(record, "risk")
    ? "risk"
    : Object.prototype.hasOwnProperty.call(record, "risk_level")
      ? "risk_level"
      : Object.prototype.hasOwnProperty.call(record, "riskLevel")
        ? "riskLevel"
        : null;
  if (!key) {
    return { hasRisk: false, risk: null };
  }
  const cleaned = cleanString(record[key])?.toLowerCase() as RiskLevel | undefined;
  if (cleaned && VALID_RISK_LEVELS.has(cleaned)) {
    return { hasRisk: true, risk: cleaned };
  }
  return { hasRisk: true, risk: null };
}

export function normalizeAlphaFactoryCard(
  raw: unknown,
  defaultLane: AlphaFactoryLaneId = "scaffolded",
): AlphaFactoryAdmissionCard | undefined {
  const record = asRecord(raw);
  if (!record || pipelineKindOf(record)) return undefined;

  const admissionId = cleanString(record.admission_id ?? record.admissionId);
  const strategySpecId = cleanString(record.strategy_spec_id ?? record.strategySpecId);
  const strategyId = cleanString(record.strategy_id ?? record.strategyId);
  const id = cleanString(record.id) ?? admissionId ?? strategySpecId ?? strategyId;
  if (!id) return undefined;

  const lane = normalizeLaneId(record.lane, defaultLane);
  const admissionStatus = cleanString(record.admission_status ?? record.admissionStatus ?? record.status);
  const status = cleanString(record.status ?? record.admission_status ?? record.admissionStatus);
  const queueStatus = cleanString(record.queue_status ?? record.queueStatus);

  const { hasSharpe, sharpe } = normalizeOptionalSharpe(record);
  const { hasRisk, risk } = normalizeOptionalRisk(record);

  const card: AlphaFactoryAdmissionCard = {
    id,
    admission_id: admissionId,
    tenant_id: cleanString(record.tenant_id ?? record.tenantId),
    lane,
    strategy_id: strategyId,
    strategy_spec_id: strategySpecId,
    spec_version: cleanString(record.spec_version ?? record.specVersion),
    checksum: cleanString(record.checksum),
    approval_decision_id: cleanString(record.approval_decision_id ?? record.approvalDecisionId),
    approver: cleanString(record.approver),
    approved_at: cleanString(record.approved_at ?? record.approvedAt),
    requested_by: cleanString(record.requested_by ?? record.requestedBy),
    review_ref: cleanString(record.review_ref ?? record.reviewRef),
    mode: cleanString(record.mode),
    created_at: cleanString(record.created_at ?? record.createdAt),
    status,
    admission_status: admissionStatus,
    queue_status: queueStatus,
    enqueued_at: cleanString(record.enqueued_at ?? record.enqueuedAt),
    enqueued_by: cleanString(record.enqueued_by ?? record.enqueuedBy),
    attempt_count: nullableInt(record.attempt_count ?? record.attemptCount),
    max_attempts: nullableInt(record.max_attempts ?? record.maxAttempts),
    experiment_task_id: cleanString(record.experiment_task_id ?? record.experimentTaskId),
    experiment_run_ids: nullableStringArray(record.experiment_run_ids ?? record.experimentRunIds),
    authority_task_id: cleanString(record.authority_task_id ?? record.authorityTaskId),
    authority_run_ids: nullableStringArray(record.authority_run_ids ?? record.authorityRunIds),
    last_revalidation_at: cleanString(record.last_revalidation_at ?? record.lastRevalidationAt),
    last_error: cleanString(record.last_error ?? record.lastError),
  };

  if (
    Object.prototype.hasOwnProperty.call(record, "replay_count") ||
    Object.prototype.hasOwnProperty.call(record, "replayCount")
  ) {
    card.replay_count = nullableInt(record.replay_count ?? record.replayCount);
  }
  if (
    Object.prototype.hasOwnProperty.call(record, "last_replayed_at") ||
    Object.prototype.hasOwnProperty.call(record, "lastReplayedAt")
  ) {
    card.last_replayed_at = cleanString(record.last_replayed_at ?? record.lastReplayedAt);
  }
  if (
    Object.prototype.hasOwnProperty.call(record, "revalidation_count") ||
    Object.prototype.hasOwnProperty.call(record, "revalidationCount")
  ) {
    card.revalidation_count = nullableInt(
      record.revalidation_count ?? record.revalidationCount,
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(record, "strategy_state") ||
    Object.prototype.hasOwnProperty.call(record, "strategyState")
  ) {
    card.strategy_state = cleanString(record.strategy_state ?? record.strategyState);
  }

  // Re-normalizing an already normalized card keeps its nested `discovery` block.
  const discovery: Record<string, unknown> = { ...(asRecord(record.discovery) ?? {}) };
  for (const key of ["metrics", "lineage", "attribution", "hypothesis_card"] as const) {
    if (record[key] !== undefined && record[key] !== null) discovery[key] = record[key];
  }
  if (Object.keys(discovery).length > 0) card.discovery = discovery;

  const reasonCode = cleanString(record.reason_code ?? record.reasonCode);
  if (reasonCode) card.reason_code = reasonCode;
  const documentCheckReason = cleanString(record.document_check_reason ?? record.documentCheckReason);
  if (documentCheckReason) card.document_check_reason = documentCheckReason;
  const gate = asRecord(record.gate);
  if (gate?.passed === true) card.gate_passed = true;

  if (hasSharpe) {
    card.sharpe = sharpe;
  }
  if (hasRisk) {
    card.risk = risk;
  }

  return card;
}

export const MOCK_DOCUMENT_CHECKED: readonly AlphaFactoryAdmissionCard[] = [
  {
    id: "adm-replicated-2330",
    admission_id: "adm-replicated-2330",
    tenant_id: "default",
    lane: "replicated",
    strategy_id: "strat-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-60f9c8a78715",
    strategy_spec_id: "reg-strategy-spec-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-da7cb8297afb",
    spec_version: "1.0.0",
    checksum: "sha256:2330",
    approval_decision_id: "apr-2330",
    approver: "pantheon-dev-approver",
    approved_at: "2026-08-14T01:00:00Z",
    requested_by: "pantheon-dev-operator",
    review_ref: "mrev-2330",
    mode: "paper",
    created_at: "2026-08-14T01:05:00Z",
    status: "admitted",
    admission_status: "admitted",
    queue_status: "completed",
    enqueued_at: "2026-08-14T01:06:00Z",
    enqueued_by: "pantheon-dev-operator",
    attempt_count: 0,
    max_attempts: 2,
    experiment_task_id: "rtask-20260814-001",
    experiment_run_ids: [
      "rrun-20260814-001",
      "rrun-20260901-004",
      "rrun-20261015-002",
      "rrun-20261016-003",
    ],
    authority_task_id: "rtask-20261015-002",
    authority_run_ids: ["rrun-20261015-002"],
    last_revalidation_at: "2026-10-15T08:30:00Z",
    last_error: null,
    replay_count: 1,
    last_replayed_at: "2026-10-16T02:54:42Z",
    revalidation_count: 1,
    strategy_state: "approved",
    document_check_reason: "no_passing_gate_result",
  },
  {
    id: "adm-replicated-spy-anchor",
    admission_id: "adm-replicated-spy-anchor",
    tenant_id: "default",
    lane: "replicated",
    strategy_id:
      "strat-src-dev-product-20260913T040439Z-7935481ca72f49629606e01098c3a54e-spy-anchor-7e96a8404f3c",
    strategy_spec_id:
      "reg-strategy-spec-src-dev-product-20260913T040439Z-7935481ca72f49629606e01098c3a54e-spy-anchor",
    spec_version: "1.0.0",
    checksum: "sha256:7e96a8404f3c",
    approval_decision_id: "apr-spy-anchor",
    approver: "pantheon-dev-approver",
    approved_at: "2026-09-13T04:05:00Z",
    requested_by: "pantheon-dev-operator",
    review_ref: "mrev-spy-anchor",
    mode: "paper",
    created_at: "2026-09-13T04:06:00Z",
    status: "admitted",
    admission_status: "admitted",
    queue_status: "completed",
    enqueued_at: "2026-09-13T04:07:00Z",
    enqueued_by: "pantheon-dev-operator",
    attempt_count: 0,
    max_attempts: 2,
    experiment_task_id: "rtask-20260913-001",
    experiment_run_ids: ["rrun-20260913-001"],
    authority_task_id: "rtask-20260913-002",
    authority_run_ids: ["rrun-20260913-002"],
    last_revalidation_at: "2026-09-13T04:10:00Z",
    last_error: null,
    replay_count: 0,
    last_replayed_at: null,
    revalidation_count: 1,
    strategy_state: "approved",
    document_check_reason: "simulation_or_raw_market_seed",
  },
  {
    id: "adm-replicated-h12-01a11",
    admission_id: "adm-replicated-h12-01a11",
    tenant_id: "default",
    lane: "replicated",
    strategy_id: "strat-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8",
    strategy_spec_id: "reg-strategy-spec-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8",
    spec_version: "1.0.0",
    checksum: "sha256:e018ff6d0eb8",
    approval_decision_id: "apr-h12-01a11",
    approver: "pantheon-dev-approver",
    approved_at: "2026-10-23T02:00:00Z",
    requested_by: "pantheon-dev-operator",
    review_ref: "mrev-h12-01a11",
    mode: "paper",
    created_at: "2026-10-23T02:05:00Z",
    status: "admitted",
    admission_status: "admitted",
    queue_status: "completed",
    enqueued_at: "2026-10-23T02:06:00Z",
    enqueued_by: "pantheon-dev-operator",
    attempt_count: 0,
    max_attempts: 2,
    experiment_task_id: "rtask-20261023-001",
    experiment_run_ids: [
      "rrun-20261023-001",
      "rrun-20261023-002",
      "rrun-20261024-001",
      "rrun-20261024-002",
    ],
    authority_task_id: "rtask-20261024-002",
    authority_run_ids: ["rrun-20261024-002"],
    last_revalidation_at: "2026-10-24T02:30:00Z",
    last_error: null,
    replay_count: 1,
    last_replayed_at: "2026-10-24T02:28:22Z",
    revalidation_count: 1,
    strategy_state: "retired",
    document_check_reason: "retired",
  },
  {
    id: "adm-replicated-h12-claude",
    admission_id: "adm-replicated-h12-claude",
    tenant_id: "default",
    lane: "replicated",
    strategy_id: "strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a",
    strategy_spec_id: "reg-strategy-spec-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a",
    spec_version: "1.0.0",
    checksum: "sha256:106b4057d07a",
    approval_decision_id: "apr-h12-claude",
    approver: "pantheon-dev-approver",
    approved_at: "2026-10-27T01:00:00Z",
    requested_by: "pantheon-dev-operator",
    review_ref: "mrev-h12-claude",
    mode: "paper",
    created_at: "2026-10-27T01:05:00Z",
    status: "admitted",
    admission_status: "admitted",
    queue_status: "completed",
    enqueued_at: "2026-10-27T01:06:00Z",
    enqueued_by: "pantheon-dev-operator",
    attempt_count: 0,
    max_attempts: 2,
    experiment_task_id: "rtask-20261027-001",
    experiment_run_ids: ["rrun-20261027-001"],
    authority_task_id: "rtask-20261027-002",
    authority_run_ids: ["rrun-20261027-002"],
    last_revalidation_at: "2026-10-27T01:10:00Z",
    last_error: null,
    replay_count: 0,
    last_replayed_at: null,
    revalidation_count: 1,
    strategy_state: "retired",
    document_check_reason: "retired",
  },
];

export const MOCK_SCAFFOLDED: readonly AlphaFactoryAdmissionCard[] = [
  {
    id: "adm-scaffolded-2317",
    admission_id: "adm-scaffolded-2317",
    tenant_id: "default",
    lane: "scaffolded",
    strategy_id: "strat-tw-official:tw_price_daily:TWSE:2317:9a8b7c6d5e4f3a2b-112233445566",
    strategy_spec_id: "reg-strategy-spec-tw-official:tw_price_daily:TWSE:2317:9a8b7c6d5e4f3a2b-665544332211",
    spec_version: "1.0.0",
    checksum: "sha256:2317",
    approval_decision_id: "apr-2317",
    approver: "pantheon-dev-approver",
    approved_at: "2026-08-15T02:00:00Z",
    requested_by: "pantheon-dev-operator",
    review_ref: "mrev-2317",
    mode: "paper",
    created_at: "2026-08-15T02:05:00Z",
    status: "admitted",
    admission_status: "admitted",
    queue_status: "failed",
    enqueued_at: "2026-08-15T02:06:00Z",
    enqueued_by: "pantheon-dev-operator",
    attempt_count: 2,
    max_attempts: 2,
    experiment_task_id: "rtask-20260815-003",
    experiment_run_ids: ["rrun-20260815-003"],
    authority_task_id: null,
    authority_run_ids: [],
    last_revalidation_at: null,
    last_error: "backtest window incomplete",
    reason_code: "backtest_window_incomplete",
    replay_count: 0,
    last_replayed_at: null,
    revalidation_count: 0,
    strategy_state: "approved",
  },
  {
    id: "adm-pending-2454",
    admission_id: "adm-pending-2454",
    tenant_id: "default",
    lane: "scaffolded",
    strategy_id: "strat-tw-official:tw_price_daily:TWSE:2454:1122334455667788-aabbccddeeff",
    strategy_spec_id: "reg-strategy-spec-tw-official:tw_price_daily:TWSE:2454:1122334455667788-ffeeddccbbaa",
    spec_version: "1.0.0",
    checksum: "sha256:2454",
    approval_decision_id: "apr-2454",
    approver: "pantheon-dev-approver",
    approved_at: "2026-08-16T03:00:00Z",
    requested_by: "pantheon-dev-operator",
    review_ref: "mrev-2454",
    mode: "paper",
    created_at: "2026-08-16T03:05:00Z",
    status: "admitted",
    admission_status: "admitted",
    queue_status: null,
    enqueued_at: null,
    enqueued_by: null,
    attempt_count: null,
    max_attempts: null,
    experiment_task_id: null,
    experiment_run_ids: null,
    authority_task_id: null,
    authority_run_ids: null,
    last_revalidation_at: null,
    last_error: null,
    replay_count: null,
    last_replayed_at: null,
    revalidation_count: null,
    strategy_state: null,
  },
];

/** No candidate has a recorded gate pass on hosted (2026-11-25); the mock says the same. */
export const MOCK_REPLICATED: readonly AlphaFactoryAdmissionCard[] = [];

export const MOCK_DISCOVERED: readonly AlphaFactoryCard[] = [];

export const MOCK_PIPELINE_DISCOVERED: readonly Record<string, unknown>[] = [
  {
    id: "rd-mock-momentum-breadth",
    lane: "discovered",
    kind: "research_demand",
    demand_id: "rd-mock-momentum-breadth",
    persona_id: "persona-mock-momentum",
    display_name: "Momentum Scout",
    lacking: {
      short_measure: "effective_bets",
      missing_datasets: ["tw_margin_daily"],
      tried_families: ["time_series"],
    },
    since: "2026-11-20T02:00:00Z",
    status: "open",
    latest_outcome: {
      reason_code: "mandate_universe_missing",
      reason: "template_search_unavailable:ValueError:mandate_universe_missing",
    },
  },
  {
    id: "rd-mock-value-idle",
    lane: "discovered",
    kind: "research_demand",
    demand_id: "rd-mock-value-idle",
    persona_id: "persona-mock-value",
    display_name: null,
    lacking: { short_measure: "idle_day_share", missing_datasets: [], tried_families: [] },
    since: "2026-11-22T05:30:00Z",
    status: "open",
    latest_outcome: { reason_code: null, reason: null },
  },
];

export const MOCK_PIPELINE_SEARCHES: readonly Record<string, unknown>[] = [
  {
    id: "template-search:rd-mock-momentum-breadth",
    lane: "scaffolded",
    kind: "template_search",
    demand_id: "rd-mock-momentum-breadth",
    persona_id: "persona-mock-momentum",
    display_name: "Momentum Scout",
    attempt_count: 3,
    latest_run_id: "rrun-mock-20261124-002",
    latest_at: "2026-11-24T10:03:00Z",
    outcome: "failed",
    reason_code: "mandate_universe_missing",
    reason: "template_search_unavailable:ValueError:mandate_universe_missing",
  },
];

export const MOCK_ALPHA_FACTORY_COUNTS = {
  collected_text_records: { value: null, status: "unavailable", reason: "no_bounded_owner_read" },
  dropped_irrelevant: { value: null, status: "unavailable", reason: "no_bounded_owner_read" },
  hypothesis_cards: { value: null, status: "unavailable", reason: "no_bounded_owner_read" },
  templates_registered: { value: 182, status: "ok" },
  templates_evaluated: { value: 0, status: "ok" },
  searches: { value: 3, status: "ok" },
  passes: { value: 0, status: "ok" },
} as const;

const MOCK_SCAFFOLDED_ITEMS: readonly unknown[] = [...MOCK_PIPELINE_SEARCHES, ...MOCK_SCAFFOLDED];

export const MOCK_ALPHA_FACTORY_ENVELOPE = {
  data: {
    id: "alpha-factory",
    snapshotAt: "2026-11-25T00:00:00Z",
    snapshot_at: "2026-11-25T00:00:00Z",
    lanes: [
      { id: "discovered", label: "Discovered", items: [...MOCK_PIPELINE_DISCOVERED] },
      { id: "scaffolded", label: "Scaffolded", items: [...MOCK_SCAFFOLDED_ITEMS] },
      { id: "replicated", label: "Replicated", items: [...MOCK_REPLICATED] },
    ],
    discovered: [...MOCK_PIPELINE_DISCOVERED],
    scaffolded: [...MOCK_SCAFFOLDED_ITEMS],
    replicated: [...MOCK_REPLICATED],
    document_checked: [...MOCK_DOCUMENT_CHECKED],
    counts: MOCK_ALPHA_FACTORY_COUNTS,
    items: [...MOCK_PIPELINE_DISCOVERED, ...MOCK_SCAFFOLDED_ITEMS],
  },
  items: [...MOCK_PIPELINE_DISCOVERED, ...MOCK_SCAFFOLDED_ITEMS],
  page_info: {
    page: 1,
    page_size: 20,
    total: MOCK_PIPELINE_DISCOVERED.length + MOCK_SCAFFOLDED_ITEMS.length,
    next_page_token: null,
  },
  meta: {
    snapshot_at: "2026-11-25T00:00:00Z",
    surfaces: {
      alpha_factory: { status: "ok", source: "mock_seed" },
      alpha_factory_strategy_state: { status: "ok", source: "mock_seed" },
      alpha_factory_demands: { status: "ok", source: "mock_seed" },
      alpha_factory_runs: { status: "ok", source: "mock_seed" },
    },
    filters: { lane: null },
  },
} as const;

function isGenericRegistryMockFallback(raw: unknown): boolean {
  if (detectMode() !== "mock") return false;
  const root = asRecord(raw);
  if (!root) return false;
  const data = asRecord(root.data);
  const meta = asRecord(root.meta);
  if (data?.lanes || data?.replicated || data?.scaffolded || data?.discovered || meta?.surfaces) {
    return false;
  }
  const items = Array.isArray(root.items) ? root.items : [];
  if (items.length === 1) {
    const first = asRecord(items[0]);
    if (first?.id === "stg_001" && first?.lane === undefined && first?.admission_id === undefined) {
      return true;
    }
  }
  return false;
}

function normalizeCardsForLane(
  rawList: unknown[] | undefined,
  lane: AlphaFactoryLaneId,
): AlphaFactoryCard[] {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .map((item) => normalizeAlphaFactoryCard(item, lane))
    .filter((card): card is AlphaFactoryCard => Boolean(card) && card.lane === lane);
}

function rawLaneList(
  data: UnknownRecord,
  laneRec: UnknownRecord | undefined,
  key: AlphaFactoryLaneId,
): unknown[] | null {
  if (Array.isArray(data[key])) return data[key] as unknown[];
  if (Array.isArray(laneRec?.items)) return laneRec.items as unknown[];
  return null;
}

function normalizePipelineItems(
  rawList: unknown[] | null,
  flatRawItems: unknown[],
  lane: "discovered" | "scaffolded",
): AlphaFactoryPipelineItem[] {
  const source = rawList ?? flatRawItems;
  return source
    .map((item) => normalizeAlphaFactoryPipelineItem(item))
    .filter((item): item is AlphaFactoryPipelineItem => Boolean(item) && item.lane === lane);
}

export function normalizeAlphaFactoryEnvelope(raw: unknown): AlphaFactoryPipelineEnvelope {
  if (isGenericRegistryMockFallback(raw)) {
    return normalizeAlphaFactoryEnvelope(MOCK_ALPHA_FACTORY_ENVELOPE);
  }

  const root = asRecord(raw) ?? {};
  const data = asRecord(root.data) ?? {};
  const meta = asRecord(root.meta) ?? {};
  const pageInfo = asRecord(root.page_info) ?? asRecord(data.page_info) ?? {};

  const rawLanes = Array.isArray(data.lanes)
    ? data.lanes
    : Array.isArray(root.lanes)
      ? root.lanes
      : [];

  const findLaneRecord = (laneId: AlphaFactoryLaneId): UnknownRecord | undefined => {
    for (const entry of rawLanes) {
      const rec = asRecord(entry);
      if (cleanString(rec?.id)?.toLowerCase() === laneId) {
        return rec;
      }
    }
    return undefined;
  };

  const discoveredLaneRec = findLaneRecord("discovered");
  const scaffoldedLaneRec = findLaneRecord("scaffolded");
  const replicatedLaneRec = findLaneRecord("replicated");

  const flatRawItems = Array.isArray(root.items)
    ? root.items
    : Array.isArray(data.items)
      ? data.items
      : Array.isArray(raw)
        ? raw
        : [];

  const flatNormalized = flatRawItems
    .map((item) => {
      const rec = asRecord(item);
      const laneName = cleanString(rec?.lane)?.toLowerCase();
      if (!rec || !laneName || !VALID_LANES.has(laneName as AlphaFactoryLaneId)) return undefined;
      return normalizeAlphaFactoryCard(rec);
    })
    .filter((card): card is AlphaFactoryCard => Boolean(card));

  const discovered = Array.isArray(data.discovered)
    ? normalizeCardsForLane(data.discovered, "discovered")
    : Array.isArray(discoveredLaneRec?.items)
      ? normalizeCardsForLane(discoveredLaneRec.items, "discovered")
      : flatNormalized.filter((card) => card.lane === "discovered");

  const scaffolded = Array.isArray(data.scaffolded)
    ? normalizeCardsForLane(data.scaffolded, "scaffolded")
    : Array.isArray(scaffoldedLaneRec?.items)
      ? normalizeCardsForLane(scaffoldedLaneRec.items, "scaffolded")
      : flatNormalized.filter((card) => card.lane === "scaffolded");

  const replicated = Array.isArray(data.replicated)
    ? normalizeCardsForLane(data.replicated, "replicated")
    : Array.isArray(replicatedLaneRec?.items)
      ? normalizeCardsForLane(replicatedLaneRec.items, "replicated")
      : flatNormalized.filter((card) => card.lane === "replicated");

  const pipelineDiscovered = normalizePipelineItems(
    rawLaneList(data, discoveredLaneRec, "discovered"),
    flatRawItems,
    "discovered",
  );
  const pipelineScaffolded = normalizePipelineItems(
    rawLaneList(data, scaffoldedLaneRec, "scaffolded"),
    flatRawItems,
    "scaffolded",
  );
  const rawDocumentChecked = Array.isArray(data.document_checked)
    ? data.document_checked
    : Array.isArray(data.documentChecked)
      ? data.documentChecked
      : [];
  const documentChecked = rawDocumentChecked
    .map((item) => normalizeAlphaFactoryCard(item, "replicated"))
    .filter((card): card is AlphaFactoryAdmissionCard => Boolean(card));

  const discoveredMeta = asRecord(meta.discovered);
  const discoveredReason =
    cleanString(data.discovered_reason ?? data.discoveredReason) ??
    cleanString(data.reason) ??
    cleanString(discoveredLaneRec?.reason) ??
    cleanString(discoveredMeta?.reason) ??
    null;

  const snapshotAt =
    cleanString(data.snapshot_at ?? data.snapshotAt) ??
    cleanString(meta.snapshot_at ?? meta.snapshotAt) ??
    null;

  const combinedItems =
    flatNormalized.length > 0
      ? flatNormalized
      : [...replicated, ...scaffolded, ...discovered];

  const rawSurfaces = asRecord(meta.surfaces) ?? {};
  const normalizedSurfaces: Record<string, ManagementSurfaceState> = {};
  for (const [key, value] of Object.entries(rawSurfaces)) {
    const surfaceRec = asRecord(value);
    if (!surfaceRec) continue;
    normalizedSurfaces[key] = {
      ...surfaceRec,
      status: cleanString(surfaceRec.status) ?? "unknown",
      source: cleanString(surfaceRec.source) ?? undefined,
      message: cleanString(surfaceRec.message) ?? undefined,
      reason: cleanString(surfaceRec.reason) ?? undefined,
    };
  }

  if (!normalizedSurfaces.alpha_factory) {
    const fallbackStatus = cleanString(meta.status ?? data.status) ?? "ok";
    const fallbackSource = cleanString(meta.source ?? data.source) ?? "research_orchestrator";
    normalizedSurfaces.alpha_factory = {
      status: fallbackStatus,
      source: fallbackSource,
      ...(cleanString(meta.message ?? data.message)
        ? { message: cleanString(meta.message ?? data.message) ?? undefined }
        : {}),
      ...(cleanString(meta.reason) ? { reason: cleanString(meta.reason) ?? undefined } : {}),
    };
  }

  const rawFilters = asRecord(meta.filters);
  const filterLane = cleanString(rawFilters?.lane)?.toLowerCase() as AlphaFactoryLaneId | undefined;

  const page = nullableInt(pageInfo.page) ?? 1;
  const pageSize = nullableInt(pageInfo.page_size ?? pageInfo.pageSize) ?? 20;
  const total = nullableInt(pageInfo.total) ?? combinedItems.length;
  const nextPageToken = cleanString(pageInfo.next_page_token ?? pageInfo.nextPageToken);

  return {
    data: {
      id: cleanString(data.id) ?? "alpha-factory",
      snapshotAt,
      snapshot_at: snapshotAt,
      reason: cleanString(data.reason) ?? discoveredReason,
      discovered_reason: discoveredReason,
      lanes: [
        {
          id: "discovered",
          label: cleanString(discoveredLaneRec?.label) ?? "Discovered",
          reason: discoveredReason,
          items: discovered,
        },
        {
          id: "scaffolded",
          label: cleanString(scaffoldedLaneRec?.label) ?? "Scaffolded",
          items: scaffolded,
        },
        {
          id: "replicated",
          label: cleanString(replicatedLaneRec?.label) ?? "Replicated",
          items: replicated,
        },
      ],
      discovered,
      scaffolded,
      replicated,
      items: combinedItems,
      ...(Array.isArray(data.templates) ? { templates: data.templates } : {}),
      pipeline: {
        discovered: pipelineDiscovered,
        scaffolded: pipelineScaffolded,
      },
      document_checked: documentChecked,
      counts: normalizeAlphaFactoryCounts(data.counts),
    },
    items: combinedItems,
    page_info: {
      page,
      page_size: pageSize,
      total,
      next_page_token: nextPageToken,
    },
    meta: {
      ...meta,
      snapshot_at: snapshotAt ?? undefined,
      surfaces: normalizedSurfaces,
      filters: {
        lane: filterLane && VALID_LANES.has(filterLane) ? filterLane : null,
      },
      discovered: {
        reason: discoveredReason,
      },
    },
  };
}

function buildMockEnvelopeForQuery(query?: AlphaFactoryQuery): AlphaFactoryPipelineEnvelope {
  const base = normalizeAlphaFactoryEnvelope(MOCK_ALPHA_FACTORY_ENVELOPE);
  const laneFilter = cleanString(query?.lane)?.toLowerCase() as AlphaFactoryLaneId | undefined;
  if (!laneFilter || !VALID_LANES.has(laneFilter)) {
    return base;
  }
  const filteredItems = base.items.filter((item) => item.lane === laneFilter);
  return {
    ...base,
    data: {
      ...base.data,
      items: filteredItems,
    },
    items: filteredItems,
    page_info: {
      ...base.page_info,
      total: filteredItems.length,
    },
    meta: {
      ...base.meta,
      filters: {
        lane: laneFilter,
      },
    },
  };
}

export async function getAlphaFactory(
  query?: AlphaFactoryQuery,
  opts?: { signal?: AbortSignal },
): Promise<AlphaFactoryPipelineEnvelope> {
  try {
    return await strictLiveRead<AlphaFactoryPipelineEnvelope>(
      "alphaFactory.get",
      {
        method: "GET",
        path: paths.alphaFactory(query),
        signal: opts?.signal,
      },
      normalizeAlphaFactoryEnvelope,
    );
  } catch (err) {
    if (
      detectMode() === "mock" &&
      err instanceof BffError &&
      err.code === "RESOURCE_NOT_FOUND" &&
      err.message.startsWith("No mock for GET /bff/alpha-factory")
    ) {
      return buildMockEnvelopeForQuery(query);
    }
    throw err;
  }
}

export const alphaFactory = {
  get: getAlphaFactory,
  read: getAlphaFactory,
  list: getAlphaFactory,
};
