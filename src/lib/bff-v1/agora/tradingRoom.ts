/**
 * BFF client for the Trading Room surface (v1.5, live strict).
 * All data reads go through these functions; pages must not call fetch() directly.
 * Read/observe/intent-request only; no execution-side mutation is performed here.
 *
 * Mutating method (decideOnEvent) requires:
 *   If-Match        — ETag from the preceding GET response
 *   Idempotency-Key — client-generated UUID per submission
 *   X-Request-Id    — client-generated UUID per request
 * AG-BE-TR-002 rejects writes that omit these headers.
 */

import type {
  DataAvailabilityStatus,
  TradingRoomDashboardVersion,
  TradingRoomViewSpec,
  TradingRoomWidgetSpec,
  TradingRoomWorkspace,
  TradingRoomWorkspaceProposal,
  WidgetRevisionProposal,
  WorkspaceLayoutOperation,
} from "./tradingRoomTypes";
import {
  BffError,
  normalizeBffErrorEnvelope,
  type BffErrorEnvelope,
  type ErrorCode,
} from "../errors";
import { readBffEnv } from "../runtimeEnv";
import { buildHeaders } from "../headers";
import { bffSessionFetch } from "@/lib/auth/sessionExpiry";

// ── Types derived from v4 schemas ──────────────────────────────────────────────

export interface TradingRoomStrategyEntry {
  strategy_id: string;
  strategy_spec_registry_id: string;
  title: string;
  readiness_state: "blocked" | "conditional" | "ready" | "stale";
  dashboard_recipe_id?: string;
  monitoring_state:
    "inactive" | "shadow" | "paper_requested" | "monitoring" | "paused";
  candidate_count?: number;
  position_count?: number;
  pending_event_counts: {
    entry?: number;
    add?: number;
    reduce?: number;
    exit?: number;
    review?: number;
  };
  shadow_status?: string;
  performance_summary?: Record<string, unknown>;
  staleness_reasons?: string[];
}

export interface TradingRoomQueueSummary {
  entry: number;
  add: number;
  reduce: number;
  exit: number;
  review: number;
}

export interface TradingRoomRiskSummary {
  state: "normal" | "watch" | "warning" | "critical";
  summary?: string;
  alerts?: string[];
}

export interface TradingRoomAggregate {
  spec_version: "1.0";
  user_scope_ref: string;
  strategies: TradingRoomStrategyEntry[];
  queue_summary: TradingRoomQueueSummary;
  top_decision_events?: TradingDecisionEvent[];
  position_summaries?: unknown[];
  risk_summary: TradingRoomRiskSummary;
  snapshot_at: string;
  data_cutoff: string;
}

export type TradingRoomPerformanceAttributionDimension =
  | "strategy"
  | "persona"
  | "pool"
  | "asset"
  | "broker"
  | "runtime"
  | "regime"
  | string;

export interface TradingRoomPerformanceAttributionMetrics {
  runtime_count: number;
  telemetry_runtime_count: number;
  holding_count: number;
  total_pnl?: number | null;
  unrealized_pnl?: number | null;
  realized_pnl?: number | null;
  total_notional?: number | null;
  total_market_value?: number | null;
  total_exposure?: number | null;
  worst_drawdown?: number | null;
  average_fill_rate?: number | null;
  average_slippage_bps?: number | null;
  total_trades: number;
  latest_telemetry_at?: string | null;
  pnl_contribution_pct?: number | null;
  notional_weight?: number | null;
  [key: string]: unknown;
}

export interface TradingRoomPerformanceAttributionRow {
  id: string;
  dimension: TradingRoomPerformanceAttributionDimension;
  dimension_key: string;
  label: string;
  period: string;
  rank: number;
  metrics: TradingRoomPerformanceAttributionMetrics;
  total_pnl?: number | null;
  pnl_contribution_pct?: number | null;
  notional_weight?: number | null;
  runtime_count: number;
  holding_count: number;
  source_refs?: {
    runtime_ids?: string[];
    capital_pool_ids?: string[];
    persona_ids?: string[];
    strategy_ids?: string[];
    [key: string]: unknown;
  };
  links?: Record<string, string | null | undefined>;
  [key: string]: unknown;
}

export interface TradingRoomPerformanceAttributionSummary {
  period: string;
  dimensions: string[];
  supported_dimensions: string[];
  row_count: number;
  returned_row_count: number;
  runtime_count: number;
  telemetry_runtime_count: number;
  holding_count: number;
  total_pnl?: number | null;
  total_notional?: number | null;
  total_exposure?: number | null;
  worst_drawdown?: number | null;
  average_fill_rate?: number | null;
  average_slippage_bps?: number | null;
  total_trades: number;
  latest_telemetry_at?: string | null;
  basis: string;
  [key: string]: unknown;
}

export interface TradingRoomPerformanceAttributionResponse {
  data: {
    id: string;
    period: string;
    dimensions: string[];
    items: TradingRoomPerformanceAttributionRow[];
    summary: TradingRoomPerformanceAttributionSummary;
    [key: string]: unknown;
  };
  page_info: {
    next_page_token: string | null;
    total: number;
    page_size: number;
  };
  meta: {
    snapshot_at?: string;
    surfaces?: Record<string, Record<string, unknown>>;
    composition_sources?: string[];
    period?: string;
    dimensions?: string[];
    policy?: string;
    [key: string]: unknown;
  };
}

export interface TradingRoomPerformanceAttributionQuery {
  period?: string;
  pageToken?: string;
  pageSize?: number;
}

export interface EvidenceRef {
  ref_type:
    | "evidence_bundle"
    | "evidence_item"
    | "source_record"
    | "citation"
    | "experiment_artifact"
    | "registry_entry"
    | "consult_memo"
    | "research_run"
    | "telemetry_snapshot"
    | "market_context";
  ref_id: string;
  summary?: string;
  data_cutoff?: string;
}

export interface TradingDecisionEvent {
  intent_ref?: string | null;
  etag?: string;
  spec_version: "1.0";
  decision_event_id: string;
  dedupe_key?: string;
  event_kind: "entry" | "add" | "reduce" | "exit" | "review";
  origin:
    | "strategy_signal"
    | "risk_rule"
    | "position_rule"
    | "servant_analysis"
    | "trader_request";
  strategy_id: string;
  strategy_spec_registry_id: string;
  candidate_ref?: string;
  position_ref?: string;
  subject: {
    symbol: string;
    asset_class?: string;
    venue?: string;
  };
  state:
    | "approaching"
    | "triggered"
    | "pending_review"
    | "decided"
    | "expired"
    | "invalidated"
    | "superseded";
  trigger?: {
    rule_id?: string;
    summary?: string;
    current_value?: unknown;
    threshold?: unknown;
    distance_to_trigger?: number;
  };
  triggered_at: string;
  expires_at?: string;
  confidence: {
    value: number;
    basis: "model" | "statistical" | "heuristic" | "mixed";
    calibration_state: "calibrated" | "partially_calibrated" | "uncalibrated";
    sample_size?: number;
    source_ref?: string;
  };
  probability: {
    target_outcome: string;
    horizon: string;
    value: number;
    ci_lower?: number;
    ci_upper?: number;
    model_ref?: string;
    as_of?: string;
  };
  expected_value: {
    horizon: string;
    unit: "pct_return" | "currency" | "risk_units";
    gross: number;
    cost: number;
    net: number;
    downside: number;
    expected_shortfall?: number;
  };
  rationale: Array<{
    claim: string;
    confidence: number;
    evidence_refs?: EvidenceRef[];
  }>;
  risk_notes: Array<{
    severity: "info" | "watch" | "warning" | "high" | "critical";
    domain: string;
    summary: string;
    mitigation?: string;
  }>;
  evidence_refs: EvidenceRef[];
  invalidation: {
    conditions: string[];
    current_state: "valid" | "watch" | "invalidated";
    last_checked_at?: string;
  };
  suggested_action:
    "enter" | "add" | "reduce" | "exit" | "review" | "no_action";
  suggested_size?: {
    size_hint?: "small" | "medium" | "large" | "full_position";
    portfolio_pct?: number;
    non_binding: true;
  };
  position_snapshot?: Record<string, unknown>;
  decision_state?:
    | "pending"
    | "approved_by_trader"
    | "rejected_by_trader"
    | "deferred"
    | "expired"
    | "handed_off"
    | "superseded";
  data_cutoff?: string;
  no_order_route_proof: "agora_decision_support_only";
}

export type DecisionChoice = "approve" | "reject" | "defer" | "modify";

export interface DecisionBody {
  decision: DecisionChoice;
  rationale?: string;
  modifications?: Record<string, unknown>;
}

export interface DecisionReceipt extends Record<string, unknown> {
  intent_ref?: string | null;
}

export interface CreateTradingRoomWorkspaceProposalRequest {
  strategyVersion: string;
  personalizationHints?: Record<string, unknown>;
  evidenceRefs?: Record<string, unknown>[];
  dataFreshness?: Record<string, unknown>;
  tradingRoomReady?: boolean;
}

export interface AcceptTradingRoomWorkspaceProposalRequest {
  expectedStatus?: "preview";
}

export interface TradingRoomWorkspaceMutationOptions {
  ifMatch?: string | null;
  idempotencyKey?: string;
}

export interface TradingRoomWorkspaceResult {
  workspace: TradingRoomWorkspace;
  etag: string | null;
  version?: TradingRoomDashboardVersion;
  versionId?: string;
}

export interface PatchTradingRoomWorkspaceLayoutRequest {
  operations: WorkspaceLayoutOperation[];
}

export interface RollbackTradingRoomWorkspaceVersionRequest {
  reason?: string;
}

export interface CreateWidgetRevisionProposalRequest {
  viewId?: string;
  instruction: string;
  proposedSpec?: TradingRoomWidgetSpec;
  rationale?: string;
  warnings?: string[];
  dataAvailability?: "complete" | "partial" | "unavailable";
}

export interface AcceptWidgetRevisionProposalRequest {
  acceptanceAction?: "apply" | "keep_original_add_modified_copy";
  copyWidgetId?: string;
}

export interface WidgetRevisionProposalResult {
  proposal: WidgetRevisionProposal;
  etag: string | null;
}

export interface WidgetRevisionAcceptResult extends TradingRoomWorkspaceResult {
  proposal: WidgetRevisionProposal;
  appliedAction?: "apply" | "keep_original_add_modified_copy";
  copiedWidgetId?: string | null;
}

// ── System Suggestions & Shadow Comparisons (Design §12.7 / §12.9) ───────────

export const REJECTED_OR_LUCK_SUGGESTION_TOKENS = new Set([
  "luck_or_unsupported",
  "unsupported",
  "rejected",
  "failed",
  "invalidated",
  "quarantined",
  "expired",
  "confounded",
  "insufficient_sample",
  "no_testable_hypothesis",
]);

export const UNVALIDATED_PENDING_SUGGESTION_TOKENS = new Set([
  "unvalidated",
  "not_validated",
  "pending",
  "pending_review",
  "proposed",
  "draft",
  "queued",
  "running",
  "dispatching",
  "in_progress",
  "untested",
  "mechanism_untested",
]);

export const POSITIVE_VALIDATION_SUGGESTION_TOKENS = new Set([
  "validated",
  "passed",
  "approved",
  "admitted",
  "endorsed",
  "merged",
  "confirmed",
  "supported",
  "completed",
  "satisfied",
]);

export interface TradingRoomSystemSuggestionLinks {
  attribution_record?: string | null;
  validation_result?: string | null;
  lesson_record?: string | null;
  memory_entry?: string | null;
  [key: string]: string | null | undefined;
}

export interface TradingRoomSystemSuggestion {
  suggestion_id: string;
  fact_id: string;
  fact_kind:
    | "validated_attribution_finding"
    | "endorsed_lesson"
    | "validated_strategy_fact"
    | string;
  decision_event_id?: string | null;
  servant_persona_id?: string;
  title: string;
  suggestion: string;
  summary: string;
  hypothesis?: string | null;
  component?: string | null;
  validation_status: string;
  source_owner?: string | null;
  relevance_score: number;
  relevance_reasons: string[];
  attribution_record_id?: string | null;
  validation_result_id?: string | null;
  links: TradingRoomSystemSuggestionLinks;
  evidence: Record<string, unknown>;
  evidence_refs: EvidenceRef[];
  advice_only: true;
  read_only: true;
  execution_authority: "none";
  environment_ceiling: "paper";
  no_order_route_proof: "agora_decision_support_only";
}

export interface TradingRoomSystemSuggestionsQuery {
  decision_event_id?: string;
  strategy_id?: string;
  symbol?: string;
  strategy_family?: string;
  event_kind?: string;
  action?: string;
  regime_ref?: string;
}

export interface TradingRoomSystemSuggestionsData {
  decision_event_id?: string | null;
  servant_persona_id?: string;
  recall_scope?: string;
  read_only: true;
  advice_only: true;
  execution_authority: "none";
  environment_ceiling: "paper";
  no_order_route_proof: "agora_decision_support_only";
  items: TradingRoomSystemSuggestion[];
  suggestions: TradingRoomSystemSuggestion[];
  count: number;
  counts?: {
    validated_attribution_findings?: number;
    endorsed_lessons?: number;
    validated_strategy_facts?: number;
    excluded_unvalidated?: number;
    excluded_luck_or_unsupported?: number;
    returned?: number;
    [key: string]: number | undefined;
  };
  decision_context?: {
    decision_event_id?: string | null;
    symbol?: string | null;
    strategy_id?: string | null;
    strategy_spec_registry_id?: string | null;
    strategy_family?: string | null;
    event_kind?: string | null;
    suggested_action?: string | null;
    regime_ref?: string | null;
  };
}

export type TradingRoomSystemSuggestionsRead =
  | { state: "ok"; data: TradingRoomSystemSuggestionsData }
  | { state: "empty"; data: TradingRoomSystemSuggestionsData; reason?: string }
  | { state: "not_found"; reason: string }
  | { state: "unavailable"; reason: string; owner?: string };

export const TRADING_ROOM_SHADOW_ARMS = [
  "trader",
  "base_strategy",
  "private_servant",
  "institutional_view",
] as const;

export type TradingRoomShadowArmName =
  | (typeof TRADING_ROOM_SHADOW_ARMS)[number]
  | string;

export type ShadowSettlementSourceKind =
  | "paper_proxy"
  | "market_data_replay"
  | "declared_no_trade"
  | "actual_fill"
  | "unsettled";

export interface TradingRoomShadowArm {
  arm: TradingRoomShadowArmName;
  decision_detail: Record<string, unknown> & {
    available?: boolean;
    unavailable_reason?: string;
  };
  settlement_source: string | null;
  settlement_source_kind: ShadowSettlementSourceKind;
  outcome: unknown;
  settled_at: string | null;
  unavailable_reason: string | null;
}

export interface TradingRoomShadowComparisonData {
  decision_id: string;
  arms: TradingRoomShadowArm[];
  trader_identity?: Record<string, unknown> | null;
  account_id?: string | null;
  execution_authority: "none";
  no_order_route_proof: "agora_decision_support_only";
}

export type TradingRoomShadowComparisonRead =
  | {
      state: "ok";
      data: TradingRoomShadowComparisonData;
      degraded?: Record<string, string>;
    }
  | { state: "empty"; reason?: string }
  | { state: "not_found"; reason: string }
  | { state: "unavailable"; reason: string };

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * The Agora SPA is served as a static bundle with no same-origin BFF reverse
 * proxy, so a bare window.location.origin fallback here silently 404s (or
 * hits the SPA's own index.html fallback) in live mode instead of reaching
 * the BFF. Precedence: explicit arg > VITE_BFF_BASE_URL > origin.
 */
function resolvedBase(baseUrl?: string): string {
  if (baseUrl) return baseUrl.replace(/\/+$/, "");
  const configured = readBffEnv().VITE_BFF_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "";
}

/**
 * Every route in this file is `require_read_role`/user-scoped on the BFF
 * side (see AG-BE-TR-002) and 401s with AUTH_REQUIRED when the Authorization
 * header is absent. `credentials: "include"` alone does not satisfy that —
 * the BFF checks for a Bearer token, not a cookie. Reuse `buildHeaders()` so
 * live auth transport stays aligned with the shared BFF client. Hosted dev
 * authentication must come from an interactive browser session, never a
 * credential compiled into the public bundle.
 */
function authHeaders(): Record<string, string> {
  const shared = buildHeaders({ method: "GET" });
  const headers: Record<string, string> = {};
  if (shared.Authorization) headers.Authorization = shared.Authorization;
  if (shared["X-Tenant-Id"]) headers["X-Tenant-Id"] = shared["X-Tenant-Id"];
  return headers;
}

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberFrom(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumberFrom(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringFrom(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function stringArrayFrom(value: unknown): string[] {
  return arrayFrom(value).filter(
    (item): item is string => typeof item === "string",
  );
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

function normalizeQueueSummary(value: unknown): TradingRoomQueueSummary {
  const record = recordFrom(value);
  return {
    entry: numberFrom(record.entry),
    add: numberFrom(record.add),
    reduce: numberFrom(record.reduce),
    exit: numberFrom(record.exit),
    review: numberFrom(record.review),
  };
}

const READINESS_STATES = new Set(["blocked", "conditional", "ready", "stale"]);
const MONITORING_STATES = new Set([
  "inactive",
  "shadow",
  "paper_requested",
  "monitoring",
  "paused",
]);
const RISK_STATES = new Set(["normal", "watch", "warning", "critical"]);

function normalizeStrategyEntry(
  value: unknown,
): TradingRoomStrategyEntry | null {
  const record = recordFrom(value);
  const strategyId = stringFrom(record.strategy_id ?? record.id);
  if (!strategyId) return null;
  const readiness = stringFrom(record.readiness_state);
  const monitoring = stringFrom(record.monitoring_state);
  return {
    strategy_id: strategyId,
    strategy_spec_registry_id: stringFrom(
      record.strategy_spec_registry_id ?? record.registry_id,
      strategyId,
    ),
    title: stringFrom(record.title ?? record.name, strategyId),
    readiness_state: READINESS_STATES.has(readiness)
      ? (readiness as TradingRoomStrategyEntry["readiness_state"])
      : "blocked",
    dashboard_recipe_id: stringFrom(record.dashboard_recipe_id) || undefined,
    monitoring_state: MONITORING_STATES.has(monitoring)
      ? (monitoring as TradingRoomStrategyEntry["monitoring_state"])
      : "inactive",
    candidate_count: optionalNumberFrom(record.candidate_count),
    position_count: optionalNumberFrom(record.position_count),
    pending_event_counts: normalizeQueueSummary(record.pending_event_counts),
    shadow_status: stringFrom(record.shadow_status) || undefined,
    performance_summary: recordFrom(record.performance_summary),
    staleness_reasons: stringArrayFrom(record.staleness_reasons),
  };
}

function normalizeRiskSummary(value: unknown): TradingRoomRiskSummary {
  const record = recordFrom(value);
  const state = stringFrom(record.state);
  return {
    state: RISK_STATES.has(state)
      ? (state as TradingRoomRiskSummary["state"])
      : "normal",
    summary: stringFrom(record.summary) || undefined,
    alerts: stringArrayFrom(record.alerts),
  };
}

function extractAggregate(value: unknown): TradingRoomAggregate {
  const root = recordFrom(value);
  const data = recordFrom(root.data ?? root);
  const strategies = arrayFrom(data.strategies)
    .map(normalizeStrategyEntry)
    .filter((entry): entry is TradingRoomStrategyEntry => entry !== null);
  return {
    ...(data as unknown as Partial<TradingRoomAggregate>),
    spec_version: "1.0",
    user_scope_ref: stringFrom(data.user_scope_ref, "unknown"),
    strategies,
    queue_summary: normalizeQueueSummary(data.queue_summary),
    top_decision_events: arrayFrom(
      data.top_decision_events,
    ) as TradingDecisionEvent[],
    position_summaries: arrayFrom(data.position_summaries),
    risk_summary: normalizeRiskSummary(data.risk_summary),
    snapshot_at: stringFrom(data.snapshot_at),
    data_cutoff: stringFrom(data.data_cutoff),
  };
}

function extractDecisionEvents(value: unknown): TradingDecisionEvent[] {
  const root = recordFrom(value);
  const items = root.data ?? root;
  if (Array.isArray(items)) return items as TradingDecisionEvent[];
  const data = recordFrom(items);
  const list = data.items ?? data.events ?? data.results;
  return Array.isArray(list) ? (list as TradingDecisionEvent[]) : [];
}

function extractDecisionEvent(value: unknown): TradingDecisionEvent {
  const root = recordFrom(value);
  const data = recordFrom(root.data ?? root);
  return data as unknown as TradingDecisionEvent;
}

function extractDetail<T>(value: unknown): T {
  const root = recordFrom(value);
  const data = recordFrom(root.data ?? root);
  return data as T;
}

/**
 * The BFF canonicalized availability to full/partial/missing in AG-UIPOL-003,
 * while the existing workspace UI still consumes complete/partial/unavailable.
 * Normalize at the transport boundary so a canonical live response cannot
 * escape into render-time status maps (and legacy persisted responses remain
 * readable during the migration window).
 */
function normalizeDataAvailabilityStatus(
  value: unknown,
): DataAvailabilityStatus {
  if (value === "full" || value === "complete") return "complete";
  if (value === "partial") return "partial";
  return "unavailable";
}

function normalizeWidgetAvailability(value: unknown): TradingRoomWidgetSpec {
  const widget = recordFrom(value);
  const hasAvailability = Object.prototype.hasOwnProperty.call(
    widget,
    "dataAvailability",
  );
  return {
    ...(widget as unknown as TradingRoomWidgetSpec),
    ...(hasAvailability
      ? {
          dataAvailability: normalizeDataAvailabilityStatus(
            widget.dataAvailability,
          ),
        }
      : {}),
  };
}

function normalizeViewAvailability(value: unknown): TradingRoomViewSpec {
  const view = recordFrom(value);
  const hasAvailability = Object.prototype.hasOwnProperty.call(
    view,
    "dataAvailability",
  );
  return {
    ...(view as unknown as TradingRoomViewSpec),
    ...(hasAvailability
      ? {
          dataAvailability: normalizeDataAvailabilityStatus(
            view.dataAvailability,
          ),
        }
      : {}),
    widgets: arrayFrom(view.widgets).map(normalizeWidgetAvailability),
  };
}

function normalizeWorkspaceProposal(
  value: unknown,
): TradingRoomWorkspaceProposal {
  const proposal = recordFrom(extractDetail<unknown>(value));
  const availability = recordFrom(proposal.dataAvailability);
  return {
    ...(proposal as unknown as TradingRoomWorkspaceProposal),
    views: arrayFrom(proposal.views).map(normalizeViewAvailability),
    dataAvailability: {
      ...(availability as unknown as TradingRoomWorkspaceProposal["dataAvailability"]),
      status: normalizeDataAvailabilityStatus(availability.status),
      sources: arrayFrom(availability.sources).map((sourceValue) => {
        const source = recordFrom(sourceValue);
        return {
          ...(source as unknown as TradingRoomWorkspaceProposal["dataAvailability"]["sources"][number]),
          status: normalizeDataAvailabilityStatus(source.status),
        };
      }),
    },
  };
}

function normalizeWorkspaceAvailability(
  workspace: TradingRoomWorkspace,
): TradingRoomWorkspace {
  return {
    ...workspace,
    views: arrayFrom(workspace.views).map(normalizeViewAvailability),
  };
}

function normalizeDashboardVersionAvailability(
  value: unknown,
): TradingRoomDashboardVersion {
  const version = recordFrom(value);
  return {
    ...(version as unknown as TradingRoomDashboardVersion),
    views: arrayFrom(version.views).map(normalizeViewAvailability),
  };
}

function normalizeWidgetRevisionAvailability(
  proposal: WidgetRevisionProposal,
): WidgetRevisionProposal {
  return {
    ...proposal,
    beforeSpec: normalizeWidgetAvailability(proposal.beforeSpec),
    proposedSpec: normalizeWidgetAvailability(proposal.proposedSpec),
    dataAvailability: normalizeDataAvailabilityStatus(
      proposal.dataAvailability,
    ),
  };
}

function fallbackErrorCode(status: number): ErrorCode {
  if (status === 400 || status === 422) return "VALIDATION_FAILED";
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "RESOURCE_NOT_FOUND";
  if (status === 409 || status === 412) return "STATE_CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status === 501) return "CAPABILITY_MISSING";
  if (status >= 500) return "BACKEND_UNAVAILABLE";
  return "UNKNOWN_ERROR";
}

function errorMessageFrom(value: unknown, fallback: string): string {
  const root = recordFrom(value);
  const error = recordFrom(root.error);
  if (typeof error.message === "string" && error.message.trim())
    return error.message;
  if (typeof root.message === "string" && root.message.trim())
    return root.message;
  return fallback;
}

function errorDetailsFrom(value: unknown): Record<string, unknown> | undefined {
  const root = recordFrom(value);
  const error = recordFrom(root.error);
  const details = error.details;
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : undefined;
}

function makeTypedBffError(
  res: Response,
  body: unknown,
  fallbackMessage: string,
): BffError {
  const correlationId = res.headers.get("X-Correlation-Id") ?? undefined;
  const normalized = normalizeBffErrorEnvelope(body, res.status, correlationId);
  if (normalized) return new BffError(res.status, normalized);

  const code = fallbackErrorCode(res.status);
  const envelope: BffErrorEnvelope = {
    error: {
      code,
      i18nKey: `errors.${code}`,
      message: errorMessageFrom(body, fallbackMessage),
      retryable: res.status === 0 || res.status === 429 || res.status >= 500,
      userActionable: res.status >= 400 && res.status < 500,
      correlationId:
        correlationId ?? `corr_${Math.random().toString(36).slice(2, 10)}`,
      details: errorDetailsFrom(body),
    },
  };
  return new BffError(res.status, envelope);
}

async function throwTypedBffError(
  res: Response,
  method: string,
  url: string,
): Promise<never> {
  const body = await parseJson(res);
  throw makeTypedBffError(res, body, `${method} ${url} failed ${res.status}`);
}

function makeMalformedBffEnvelope(message: string): BffError {
  return new BffError(502, {
    error: {
      code: "BACKEND_UNAVAILABLE",
      i18nKey: "errors.BACKEND_UNAVAILABLE",
      message,
      retryable: true,
      userActionable: false,
      correlationId: `corr_${Math.random().toString(36).slice(2, 10)}`,
    },
  });
}

function isTradingRoomWorkspace(value: unknown): value is TradingRoomWorkspace {
  const candidate = recordFrom(value);
  return typeof candidate.id === "string" && Array.isArray(candidate.views);
}

function extractAcceptedWorkspace(value: unknown): {
  workspace?: TradingRoomWorkspace;
  workspaceId?: string;
  version?: TradingRoomDashboardVersion;
} {
  const root = recordFrom(value);
  const data = recordFrom(root.data ?? root);
  if (isTradingRoomWorkspace(data.workspace)) {
    const version = recordFrom(data.version);
    return {
      workspace: normalizeWorkspaceAvailability(data.workspace),
      version: version.id
        ? normalizeDashboardVersionAvailability(version)
        : undefined,
    };
  }
  if (isTradingRoomWorkspace(data)) {
    return {
      workspace: normalizeWorkspaceAvailability(
        data as unknown as TradingRoomWorkspace,
      ),
    };
  }
  return {
    workspaceId:
      typeof data.workspaceId === "string" ? data.workspaceId : undefined,
    version: recordFrom(data.version).id
      ? normalizeDashboardVersionAvailability(data.version)
      : undefined,
  };
}

function extractWorkspaceResult(
  value: unknown,
  etag: string | null,
): TradingRoomWorkspaceResult {
  const root = recordFrom(value);
  const data = recordFrom(root.data ?? root);
  const meta = recordFrom(root.meta);
  const accepted = extractAcceptedWorkspace(value);
  if (accepted.workspace) {
    return {
      etag,
      version: accepted.version,
      versionId:
        accepted.version?.id ??
        (typeof meta.version_id === "string" ? meta.version_id : undefined),
      workspace: accepted.workspace,
    };
  }
  if (isTradingRoomWorkspace(data)) {
    return {
      etag,
      versionId:
        typeof meta.version_id === "string" ? meta.version_id : undefined,
      workspace: normalizeWorkspaceAvailability(
        data as unknown as TradingRoomWorkspace,
      ),
    };
  }
  throw makeMalformedBffEnvelope(
    "Trading Room workspace response did not include a workspace.",
  );
}

function extractWidgetRevisionProposal(
  value: unknown,
  etag: string | null,
): WidgetRevisionProposalResult {
  const root = recordFrom(value);
  const data = recordFrom(root.data ?? root);
  const proposal = recordFrom(data.proposal ?? data);
  if (
    !proposal.id ||
    !recordFrom(proposal.beforeSpec).id ||
    !recordFrom(proposal.proposedSpec).id
  ) {
    throw makeMalformedBffEnvelope(
      "Widget revision proposal response did not include before/after specs.",
    );
  }
  return {
    etag,
    proposal: normalizeWidgetRevisionAvailability(
      proposal as unknown as WidgetRevisionProposal,
    ),
  };
}

function extractWidgetRevisionAcceptResult(
  value: unknown,
  etag: string | null,
): WidgetRevisionAcceptResult {
  const root = recordFrom(value);
  const data = recordFrom(root.data ?? root);
  const workspaceResult = extractWorkspaceResult(value, etag);
  const proposal = recordFrom(data.proposal);
  if (!proposal.id) {
    throw makeMalformedBffEnvelope(
      "Widget revision accept response did not include a proposal.",
    );
  }
  const appliedAction =
    typeof data.appliedAction === "string"
      ? (data.appliedAction as WidgetRevisionAcceptResult["appliedAction"])
      : undefined;
  const copiedWidgetId =
    typeof data.copiedWidgetId === "string" ? data.copiedWidgetId : null;
  return {
    ...workspaceResult,
    appliedAction,
    copiedWidgetId,
    proposal: normalizeWidgetRevisionAvailability(
      proposal as unknown as WidgetRevisionProposal,
    ),
  };
}

function extractWorkspaceVersions(
  value: unknown,
): TradingRoomDashboardVersion[] {
  const root = recordFrom(value);
  const data = root.data ?? root;
  if (!Array.isArray(data)) return [];
  return data.map(normalizeDashboardVersionAvailability);
}

function mutationHeaders(
  options?: TradingRoomWorkspaceMutationOptions,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...authHeaders(),
  };
  if (options?.ifMatch) headers["If-Match"] = options.ifMatch;
  if (options?.idempotencyKey)
    headers["Idempotency-Key"] = options.idempotencyKey;
  return headers;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Get the user-scoped Trading Room aggregate (all strategies, queue summary, risk). */
export async function getTradingRoom(
  baseUrl?: string,
): Promise<TradingRoomAggregate> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/trading-room`;
  const res = await bffSessionFetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  if (!res.ok) {
    const body = await parseJson(res);
    const message =
      recordFrom(recordFrom(body).error).message ??
      `GET ${url} failed ${res.status}`;
    throw new Error(String(message));
  }
  const body = await parseJson(res);
  return extractAggregate(body);
}

/** Get strategy-level Trading Room detail. Returns the raw payload (DetailEnvelope). */
export async function getTradingRoomStrategy(
  strategyId: string,
  baseUrl?: string,
): Promise<Record<string, unknown> | null> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/trading-room/strategies/${encodeURIComponent(strategyId)}`;
  const res = await bffSessionFetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await parseJson(res);
    const message =
      recordFrom(recordFrom(body).error).message ??
      `GET ${url} failed ${res.status}`;
    throw new Error(String(message));
  }
  const body = await parseJson(res);
  const root = recordFrom(body);
  return recordFrom(root.data ?? root);
}

export interface ListDecisionEventsParams {
  event_kind?: "entry" | "add" | "reduce" | "exit" | "review";
  state?: string;
}

export interface DecisionEventsResult {
  items: TradingDecisionEvent[];
  /** ETag from the response — forward as If-Match in subsequent writes. */
  etag: string | null;
}

/** List Trading Room decision events. Filterable by kind and state. Returns items + ETag for If-Match. */
export async function listDecisionEvents(
  params?: ListDecisionEventsParams,
  baseUrl?: string,
): Promise<DecisionEventsResult> {
  const base = resolvedBase(baseUrl);
  const qs = new URLSearchParams();
  if (params?.event_kind) qs.set("event_kind", params.event_kind);
  if (params?.state) qs.set("state", params.state);
  const query = qs.toString();
  const url = `${base}/bff/agora/trading-room/decision-events${query ? `?${query}` : ""}`;
  const res = await bffSessionFetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  if (!res.ok) {
    const body = await parseJson(res);
    const message =
      recordFrom(recordFrom(body).error).message ??
      `GET ${url} failed ${res.status}`;
    throw new Error(String(message));
  }
  const body = await parseJson(res);
  return {
    items: extractDecisionEvents(body),
    etag: res.headers.get("ETag"),
  };
}

/** Get read-only performance attribution grouped by strategy for the Agora Performance tab. */
export async function getTradingRoomPerformanceAttribution(
  query?: TradingRoomPerformanceAttributionQuery,
  baseUrl?: string,
): Promise<TradingRoomPerformanceAttributionResponse> {
  const base = resolvedBase(baseUrl);
  const qs = new URLSearchParams();
  qs.set("period", query?.period ?? "latest");
  qs.set("page_size", String(query?.pageSize ?? 50));
  if (query?.pageToken) qs.set("page_token", query.pageToken);
  const url = `${base}/bff/management/performance-attribution/by-strategy?${qs.toString()}`;
  const res = await bffSessionFetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  if (!res.ok) {
    await throwTypedBffError(res, "GET", url);
  }
  const body = await parseJson(res);
  return body as TradingRoomPerformanceAttributionResponse;
}

/** Get a single decision event by ID. */
export async function getDecisionEvent(
  decisionEventId: string,
  baseUrl?: string,
): Promise<TradingDecisionEvent | null> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/trading-room/decision-events/${encodeURIComponent(decisionEventId)}`;
  const res = await bffSessionFetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await parseJson(res);
    const message =
      recordFrom(recordFrom(body).error).message ??
      `GET ${url} failed ${res.status}`;
    throw new Error(String(message));
  }
  const body = await parseJson(res);
  return { ...extractDecisionEvent(body), etag: res.headers.get("ETag") ?? undefined };
}

/** Generate a Trading Room workspace proposal for a strategy version. */
export async function createTradingRoomWorkspaceProposal(
  strategyId: string,
  body: CreateTradingRoomWorkspaceProposalRequest,
  options?: { idempotencyKey?: string },
  baseUrl?: string,
): Promise<TradingRoomWorkspaceProposal> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/strategies/${encodeURIComponent(strategyId)}/trading-room/proposals`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...authHeaders(),
  };
  if (options?.idempotencyKey)
    headers["Idempotency-Key"] = options.idempotencyKey;
  const res = await bffSessionFetch(url, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await throwTypedBffError(res, "POST", url);
  }
  const responseBody = await parseJson(res);
  return normalizeWorkspaceProposal(responseBody);
}

/** Get a previously generated Trading Room workspace proposal. */
export async function getTradingRoomWorkspaceProposal(
  strategyId: string,
  proposalId: string,
  baseUrl?: string,
): Promise<TradingRoomWorkspaceProposal> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/strategies/${encodeURIComponent(strategyId)}/trading-room/proposals/${encodeURIComponent(proposalId)}`;
  const res = await bffSessionFetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  if (!res.ok) {
    await throwTypedBffError(res, "GET", url);
  }
  const responseBody = await parseJson(res);
  return normalizeWorkspaceProposal(responseBody);
}

/** Accept a preview proposal and materialize the generated workspace shell. */
export async function acceptTradingRoomWorkspaceProposal(
  strategyId: string,
  proposalId: string,
  body: AcceptTradingRoomWorkspaceProposalRequest = {
    expectedStatus: "preview",
  },
  options?: { idempotencyKey?: string },
  baseUrl?: string,
): Promise<TradingRoomWorkspace> {
  const result = await acceptTradingRoomWorkspaceProposalWithMeta(
    strategyId,
    proposalId,
    body,
    options,
    baseUrl,
  );
  return result.workspace;
}

/** Accept a preview proposal and keep its workspace ETag/version metadata. */
export async function acceptTradingRoomWorkspaceProposalWithMeta(
  strategyId: string,
  proposalId: string,
  body: AcceptTradingRoomWorkspaceProposalRequest = {
    expectedStatus: "preview",
  },
  options?: { idempotencyKey?: string },
  baseUrl?: string,
): Promise<TradingRoomWorkspaceResult> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/strategies/${encodeURIComponent(strategyId)}/trading-room/proposals/${encodeURIComponent(proposalId)}/accept`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...authHeaders(),
  };
  if (options?.idempotencyKey)
    headers["Idempotency-Key"] = options.idempotencyKey;
  const res = await bffSessionFetch(url, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await throwTypedBffError(res, "POST", url);
  }
  const responseBody = await parseJson(res);
  const accepted = extractAcceptedWorkspace(responseBody);
  if (accepted.workspace) {
    return {
      etag: res.headers.get("ETag"),
      version: accepted.version,
      workspace: accepted.workspace,
    };
  }
  if (accepted.workspaceId) {
    return getTradingRoomWorkspaceWithMeta(accepted.workspaceId, baseUrl);
  }
  throw makeMalformedBffEnvelope(
    "Trading Room accept response did not include a workspace.",
  );
}

/** Get an accepted Trading Room workspace by ID. */
export async function getTradingRoomWorkspace(
  workspaceId: string,
  baseUrl?: string,
): Promise<TradingRoomWorkspace> {
  const result = await getTradingRoomWorkspaceWithMeta(workspaceId, baseUrl);
  return result.workspace;
}

/** Get an accepted Trading Room workspace by ID with the current ETag. */
export async function getTradingRoomWorkspaceWithMeta(
  workspaceId: string,
  baseUrl?: string,
): Promise<TradingRoomWorkspaceResult> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/trading-room/workspaces/${encodeURIComponent(workspaceId)}`;
  const res = await bffSessionFetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  if (!res.ok) {
    await throwTypedBffError(res, "GET", url);
  }
  const responseBody = await parseJson(res);
  return extractWorkspaceResult(responseBody, res.headers.get("ETag"));
}

/**
 * Read the caller's saved workspace for a strategy/version from the existing
 * tenant/user-scoped owner lookup. Rejects with a typed BffError (404 when none).
 */
export async function getTradingRoomWorkspaceByStrategyWithMeta(
  strategyId: string,
  strategyVersion: string,
  baseUrl?: string,
): Promise<TradingRoomWorkspaceResult> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/strategies/${encodeURIComponent(strategyId)}/trading-room/workspace?strategy_version=${encodeURIComponent(strategyVersion)}`;
  const res = await bffSessionFetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  if (!res.ok) {
    await throwTypedBffError(res, "GET", url);
  }
  const responseBody = await parseJson(res);
  return extractWorkspaceResult(responseBody, res.headers.get("ETag"));
}

/** Apply controlled layout operations, creating a new workspace dashboard version. */
export async function patchTradingRoomWorkspaceLayout(
  workspaceId: string,
  body: PatchTradingRoomWorkspaceLayoutRequest,
  options?: TradingRoomWorkspaceMutationOptions,
  baseUrl?: string,
): Promise<TradingRoomWorkspaceResult> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/trading-room/workspaces/${encodeURIComponent(workspaceId)}/layout`;
  const res = await bffSessionFetch(url, {
    method: "PATCH",
    credentials: "include",
    headers: mutationHeaders(options),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await throwTypedBffError(res, "PATCH", url);
  }
  const responseBody = await parseJson(res);
  return extractWorkspaceResult(responseBody, res.headers.get("ETag"));
}

/** List append-only workspace dashboard versions/change-log records. */
export async function listTradingRoomWorkspaceVersions(
  workspaceId: string,
  baseUrl?: string,
): Promise<TradingRoomDashboardVersion[]> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/trading-room/workspaces/${encodeURIComponent(workspaceId)}/versions`;
  const res = await bffSessionFetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  if (!res.ok) {
    await throwTypedBffError(res, "GET", url);
  }
  const responseBody = await parseJson(res);
  return extractWorkspaceVersions(responseBody);
}

/** Roll back to a previous workspace dashboard version by appending a new version. */
export async function rollbackTradingRoomWorkspaceVersion(
  workspaceId: string,
  versionId: string,
  body: RollbackTradingRoomWorkspaceVersionRequest = {},
  options?: TradingRoomWorkspaceMutationOptions,
  baseUrl?: string,
): Promise<TradingRoomWorkspaceResult> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/trading-room/workspaces/${encodeURIComponent(workspaceId)}/versions/${encodeURIComponent(versionId)}/rollback`;
  const res = await bffSessionFetch(url, {
    method: "POST",
    credentials: "include",
    headers: mutationHeaders(options),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await throwTypedBffError(res, "POST", url);
  }
  const responseBody = await parseJson(res);
  return extractWorkspaceResult(responseBody, res.headers.get("ETag"));
}

/** Create a widget-scoped before/after revision proposal preview. */
export async function createWidgetRevisionProposal(
  workspaceId: string,
  widgetId: string,
  body: CreateWidgetRevisionProposalRequest,
  options?: Pick<TradingRoomWorkspaceMutationOptions, "idempotencyKey">,
  baseUrl?: string,
): Promise<WidgetRevisionProposalResult> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/trading-room/workspaces/${encodeURIComponent(workspaceId)}/widgets/${encodeURIComponent(widgetId)}/revision-proposals`;
  const res = await bffSessionFetch(url, {
    method: "POST",
    credentials: "include",
    headers: mutationHeaders(options),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await throwTypedBffError(res, "POST", url);
  }
  const responseBody = await parseJson(res);
  return extractWidgetRevisionProposal(responseBody, res.headers.get("ETag"));
}

/** Apply or keep-copy an accepted widget revision proposal, appending a workspace version. */
export async function acceptWidgetRevisionProposal(
  proposalId: string,
  body: AcceptWidgetRevisionProposalRequest = { acceptanceAction: "apply" },
  options?: TradingRoomWorkspaceMutationOptions,
  baseUrl?: string,
): Promise<WidgetRevisionAcceptResult> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/trading-room/widget-revision-proposals/${encodeURIComponent(proposalId)}/accept`;
  const res = await bffSessionFetch(url, {
    method: "POST",
    credentials: "include",
    headers: mutationHeaders(options),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await throwTypedBffError(res, "POST", url);
  }
  const responseBody = await parseJson(res);
  return extractWidgetRevisionAcceptResult(
    responseBody,
    res.headers.get("ETag"),
  );
}

/**
 * Record a trader decision on a decision event.
 * "approve" may create a TradingIntent request, without execution-side effects.
 *
 * options.ifMatch       — ETag from listDecisionEvents or getDecisionEvent; required by AG-BE-TR-002.
 * options.idempotencyKey — client-generated UUID per submission; required by AG-BE-TR-002.
 * options.requestId      — client-generated UUID per request; required by AG-BE-TR-002.
 */
export async function decideOnEvent(
  decisionEventId: string,
  body: DecisionBody,
  options?: { ifMatch?: string; idempotencyKey?: string; requestId?: string },
  baseUrl?: string,
): Promise<DecisionReceipt> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/trading-room/decision-events/${encodeURIComponent(decisionEventId)}/decisions`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...authHeaders(),
  };
  if (options?.ifMatch) headers["If-Match"] = options.ifMatch;
  if (options?.idempotencyKey)
    headers["Idempotency-Key"] = options.idempotencyKey;
  if (options?.requestId) headers["X-Request-Id"] = options.requestId;
  const res = await bffSessionFetch(url, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const responseBody = await parseJson(res);
    const message =
      recordFrom(recordFrom(responseBody).error).message ??
      `POST ${url} failed ${res.status}`;
    throw new Error(String(message));
  }
  const responseBody = await parseJson(res);
  const root = recordFrom(responseBody);
  return recordFrom(root.data ?? root);
}

// ── System Suggestions & Shadow Comparisons Helpers & Public API ──────────────

function hasForbiddenHypothesisMarker(value: unknown): boolean {
  if (typeof value === "string") {
    const token = value.trim().toLowerCase();
    return (
      REJECTED_OR_LUCK_SUGGESTION_TOKENS.has(token) ||
      UNVALIDATED_PENDING_SUGGESTION_TOKENS.has(token)
    );
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenHypothesisMarker(item));
  }
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    for (const key of [
      "validation_status",
      "status",
      "verdict",
      "outcome",
      "classification",
      "review_state",
      "hypothesis_status",
    ]) {
      if (hasForbiddenHypothesisMarker(rec[key])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Defense-in-depth validation predicate (Acceptance #1):
 * Only positively validated suggestions with validation result and evidence are accepted.
 * Unvalidated or luck_or_unsupported / rejected hypotheses are strictly excluded.
 */
export function isValidatedSystemSuggestion(value: unknown): boolean {
  const rec = recordFrom(value);
  const validationStatus = stringFrom(rec.validation_status)
    .trim()
    .toLowerCase();
  if (
    !validationStatus ||
    REJECTED_OR_LUCK_SUGGESTION_TOKENS.has(validationStatus) ||
    UNVALIDATED_PENDING_SUGGESTION_TOKENS.has(validationStatus) ||
    !POSITIVE_VALIDATION_SUGGESTION_TOKENS.has(validationStatus)
  ) {
    return false;
  }
  const evidence = recordFrom(rec.evidence);
  if (
    hasForbiddenHypothesisMarker(rec) ||
    hasForbiddenHypothesisMarker(evidence) ||
    hasForbiddenHypothesisMarker(evidence.hypothesis_validation) ||
    hasForbiddenHypothesisMarker(evidence.structured_payload)
  ) {
    return false;
  }
  if (
    rec.advice_only === false ||
    rec.read_only === false ||
    (typeof rec.execution_authority === "string" &&
      rec.execution_authority !== "none")
  ) {
    return false;
  }
  const links = recordFrom(rec.links);
  const validationResultId = stringFrom(
    rec.validation_result_id ?? evidence.validation_result_id,
  );
  const validationLink = stringFrom(links.validation_result);
  if (!validationResultId && !validationLink) {
    return false;
  }
  const evidenceRefs = arrayFrom(rec.evidence_refs ?? evidence.evidence_refs);
  const hasEvidence =
    evidenceRefs.length > 0 || Object.keys(evidence).length > 0;
  return hasEvidence;
}

function normalizeSystemSuggestion(
  value: unknown,
): TradingRoomSystemSuggestion | null {
  if (!isValidatedSystemSuggestion(value)) {
    return null;
  }
  const rec = recordFrom(value);
  const evidence = recordFrom(rec.evidence);
  const linksRaw = recordFrom(rec.links);
  const links: TradingRoomSystemSuggestionLinks = {};
  for (const [k, v] of Object.entries(linksRaw)) {
    if (typeof v === "string") {
      links[k] = v;
    } else if (v === null) {
      links[k] = null;
    }
  }
  const rawRefs = arrayFrom(rec.evidence_refs ?? evidence.evidence_refs);
  const evidenceRefs: EvidenceRef[] = rawRefs
    .map((item): EvidenceRef | null => {
      const ref = recordFrom(item);
      const refId = stringFrom(ref.ref_id);
      if (!refId) return null;
      return {
        ref_type: (stringFrom(ref.ref_type, "evidence_item") as EvidenceRef["ref_type"]),
        ref_id: refId,
        summary: stringFrom(ref.summary) || undefined,
        data_cutoff: stringFrom(ref.data_cutoff) || undefined,
      };
    })
    .filter((item): item is EvidenceRef => item !== null);

  const factId = stringFrom(rec.fact_id, stringFrom(rec.suggestion_id));
  const suggestionId = stringFrom(rec.suggestion_id, factId);
  if (!suggestionId) return null;
  const summary = stringFrom(rec.suggestion ?? rec.summary ?? rec.title);
  const title = stringFrom(rec.title, summary);

  return {
    suggestion_id: suggestionId,
    fact_id: factId || suggestionId,
    fact_kind: stringFrom(rec.fact_kind, "validated_attribution_finding"),
    decision_event_id: stringFrom(rec.decision_event_id) || null,
    servant_persona_id: stringFrom(rec.servant_persona_id) || undefined,
    title,
    suggestion: stringFrom(rec.suggestion, summary),
    summary,
    hypothesis: stringFrom(rec.hypothesis, summary) || null,
    component: stringFrom(rec.component) || null,
    validation_status: stringFrom(rec.validation_status).trim(),
    source_owner: stringFrom(rec.source_owner) || null,
    relevance_score: numberFrom(rec.relevance_score, 0),
    relevance_reasons: stringArrayFrom(rec.relevance_reasons),
    attribution_record_id:
      stringFrom(rec.attribution_record_id ?? evidence.attribution_record_id) ||
      null,
    validation_result_id:
      stringFrom(rec.validation_result_id ?? evidence.validation_result_id) ||
      null,
    links,
    evidence,
    evidence_refs: evidenceRefs,
    advice_only: true,
    read_only: true,
    execution_authority: "none",
    environment_ceiling: "paper",
    no_order_route_proof: "agora_decision_support_only",
  };
}

export function filterValidatedSystemSuggestions(
  items: unknown[],
): TradingRoomSystemSuggestion[] {
  return arrayFrom(items)
    .map(normalizeSystemSuggestion)
    .filter((item): item is TradingRoomSystemSuggestion => item !== null);
}

function extractUnavailableReasonAndOwner(
  body: unknown,
  fallbackReason: string,
): { reason: string; owner?: string } {
  const root = recordFrom(body);
  const detail = recordFrom(root.detail);
  const error = recordFrom(root.error);
  const errorDetails = recordFrom(error.details);
  const meta = recordFrom(root.meta);

  const reason =
    stringFrom(root.reason) ||
    stringFrom(detail.reason) ||
    stringFrom(errorDetails.reason) ||
    stringFrom(error.cause) ||
    stringFrom(meta.reason) ||
    stringFrom(error.code) ||
    stringFrom(detail.code) ||
    fallbackReason;

  const owner =
    stringFrom(root.owner) ||
    stringFrom(detail.owner) ||
    stringFrom(errorDetails.owner) ||
    undefined;

  return { reason, owner };
}

function normalizeSystemSuggestionsPayload(
  body: unknown,
): TradingRoomSystemSuggestionsRead {
  const root = recordFrom(body);
  const detail = recordFrom(root.detail);
  const meta = recordFrom(root.meta);
  if (
    root.status === "unavailable" ||
    detail.status === "unavailable" ||
    meta.status === "unavailable"
  ) {
    const { reason, owner } = extractUnavailableReasonAndOwner(
      body,
      "institutional_knowledge_unavailable",
    );
    return { state: "unavailable", reason, owner };
  }
  const data = recordFrom(root.data ?? root);
  if (data.status === "unavailable") {
    const { reason, owner } = extractUnavailableReasonAndOwner(
      data,
      "institutional_knowledge_unavailable",
    );
    return { state: "unavailable", reason, owner };
  }

  const rawList = Array.isArray(data.suggestions)
    ? data.suggestions
    : Array.isArray(data.items)
      ? data.items
      : [];
  const validated = filterValidatedSystemSuggestions(rawList);
  const countsRec = recordFrom(data.counts);
  const ctxRec = recordFrom(data.decision_context);

  const normalizedData: TradingRoomSystemSuggestionsData = {
    decision_event_id: stringFrom(data.decision_event_id) || null,
    servant_persona_id: stringFrom(data.servant_persona_id) || undefined,
    recall_scope: stringFrom(
      data.recall_scope,
      "institutional_facts_read_only",
    ),
    read_only: true,
    advice_only: true,
    execution_authority: "none",
    environment_ceiling: "paper",
    no_order_route_proof: "agora_decision_support_only",
    items: validated,
    suggestions: validated,
    count: validated.length,
    counts:
      Object.keys(countsRec).length > 0
        ? (countsRec as TradingRoomSystemSuggestionsData["counts"])
        : undefined,
    decision_context:
      Object.keys(ctxRec).length > 0
        ? {
            decision_event_id: stringFrom(ctxRec.decision_event_id) || null,
            symbol: stringFrom(ctxRec.symbol) || null,
            strategy_id: stringFrom(ctxRec.strategy_id) || null,
            strategy_spec_registry_id:
              stringFrom(ctxRec.strategy_spec_registry_id) || null,
            strategy_family: stringFrom(ctxRec.strategy_family) || null,
            event_kind: stringFrom(ctxRec.event_kind) || null,
            suggested_action: stringFrom(ctxRec.suggested_action) || null,
            regime_ref: stringFrom(ctxRec.regime_ref) || null,
          }
        : undefined,
  };

  if (root.status === "empty" || validated.length === 0) {
    return {
      state: "empty",
      data: normalizedData,
      reason: stringFrom(root.reason ?? data.reason) || undefined,
    };
  }
  return { state: "ok", data: normalizedData };
}

/**
 * Fetch validated system suggestions relevant to the trader's current decision context.
 * Strictly read-only GET; never places orders or changes capital.
 */
export async function getTradingRoomSystemSuggestions(
  query?: TradingRoomSystemSuggestionsQuery,
  baseUrl?: string,
): Promise<TradingRoomSystemSuggestionsRead> {
  const base = resolvedBase(baseUrl);
  const qs = new URLSearchParams();
  if (query?.decision_event_id?.trim())
    qs.set("decision_event_id", query.decision_event_id.trim());
  if (query?.strategy_id?.trim())
    qs.set("strategy_id", query.strategy_id.trim());
  if (query?.symbol?.trim()) qs.set("symbol", query.symbol.trim());
  if (query?.strategy_family?.trim())
    qs.set("strategy_family", query.strategy_family.trim());
  if (query?.event_kind?.trim()) qs.set("event_kind", query.event_kind.trim());
  if (query?.action?.trim()) qs.set("action", query.action.trim());
  if (query?.regime_ref?.trim()) qs.set("regime_ref", query.regime_ref.trim());
  const qsText = qs.toString();
  const url = `${base}/bff/agora/trading-room/system-suggestions${qsText ? `?${qsText}` : ""}`;
  try {
    const res = await bffSessionFetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json", ...authHeaders() },
    });
    const body = await parseJson(res);
    if (res.status === 404) {
      const { reason } = extractUnavailableReasonAndOwner(
        body,
        "decision_event_not_found",
      );
      return { state: "not_found", reason };
    }
    if (!res.ok) {
      const { reason, owner } = extractUnavailableReasonAndOwner(
        body,
        `http_${res.status}`,
      );
      return { state: "unavailable", reason, owner };
    }
    return normalizeSystemSuggestionsPayload(body);
  } catch (err) {
    if (err instanceof BffError) {
      if (err.status === 404 || err.code === "RESOURCE_NOT_FOUND") {
        return {
          state: "not_found",
          reason: err.code || "decision_event_not_found",
        };
      }
      return {
        state: "unavailable",
        reason: err.code || "institutional_knowledge_unavailable",
      };
    }
    return {
      state: "unavailable",
      reason: "institutional_knowledge_unavailable",
    };
  }
}

/**
 * Fetch validated system suggestions for a specific decision event ID.
 * Strictly read-only GET; never places orders or changes capital.
 */
export async function getDecisionEventSystemSuggestions(
  decisionEventId: string,
  baseUrl?: string,
): Promise<TradingRoomSystemSuggestionsRead> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/trading-room/decision-events/${encodeURIComponent(decisionEventId)}/system-suggestions`;
  try {
    const res = await bffSessionFetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json", ...authHeaders() },
    });
    const body = await parseJson(res);
    if (res.status === 404) {
      const { reason } = extractUnavailableReasonAndOwner(
        body,
        "decision_event_not_found",
      );
      return { state: "not_found", reason };
    }
    if (!res.ok) {
      const { reason, owner } = extractUnavailableReasonAndOwner(
        body,
        `http_${res.status}`,
      );
      return { state: "unavailable", reason, owner };
    }
    return normalizeSystemSuggestionsPayload(body);
  } catch (err) {
    if (err instanceof BffError) {
      if (err.status === 404 || err.code === "RESOURCE_NOT_FOUND") {
        return {
          state: "not_found",
          reason: err.code || "decision_event_not_found",
        };
      }
      return {
        state: "unavailable",
        reason: err.code || "institutional_knowledge_unavailable",
      };
    }
    return {
      state: "unavailable",
      reason: "institutional_knowledge_unavailable",
    };
  }
}

/**
 * Classify a shadow arm's settlement source (Acceptance #2 / Design A4 §1):
 * A paper proxy is never classified or shown as an actual fill.
 */
export function classifyShadowSettlementSource(
  settlementSource: string | null | undefined,
  decisionDetail?: Record<string, unknown> | null,
): ShadowSettlementSourceKind {
  const raw = String(settlementSource ?? "")
    .trim()
    .toLowerCase();
  const obsKind = String(decisionDetail?.execution_observation_kind ?? "")
    .trim()
    .toLowerCase();

  if (
    raw.includes("proxy") ||
    raw.includes("paper") ||
    raw.includes("simulat") ||
    obsKind.includes("proxy") ||
    obsKind.includes("paper") ||
    obsKind.includes("simulat")
  ) {
    return "paper_proxy";
  }
  if (raw.includes("replay")) {
    return "market_data_replay";
  }
  if (
    raw === "declared_no_trade" ||
    raw.includes("no_trade") ||
    obsKind === "declared_no_trade"
  ) {
    return "declared_no_trade";
  }
  if (!raw) {
    return "unsettled";
  }
  if (
    (raw === "actual_fill" ||
      raw === "verified_broker_fill" ||
      raw === "verified_custodian_fill" ||
      raw === "broker_fill" ||
      raw === "fill") &&
    decisionDetail?.execution_verified !== false &&
    decisionDetail?.actual_fill_claimed !== false
  ) {
    return "actual_fill";
  }
  return "unsettled";
}

export function isPaperProxySettlement(
  settlementSource: string | null | undefined,
  decisionDetail?: Record<string, unknown> | null,
): boolean {
  return (
    classifyShadowSettlementSource(settlementSource, decisionDetail) ===
    "paper_proxy"
  );
}

/**
 * Ensure no execution display label on a non-actual-fill arm ever claims "Actual fill" / "實際成交".
 */
export function sanitizeShadowExecutionLabel(
  label: string | null | undefined,
  sourceKind: ShadowSettlementSourceKind,
): string | null {
  const clean = stringFrom(label).trim();
  if (!clean) return null;
  if (sourceKind === "actual_fill") return clean;
  const lower = clean.toLowerCase();
  const mentionsUnnegatedActualFill =
    (clean.includes("實際成交") && !clean.includes("非實際成交")) ||
    (lower.includes("actual fill") && !lower.includes("not an actual fill"));
  if (mentionsUnnegatedActualFill) {
    return "交易員決策（紙上代理）";
  }
  return clean;
}

function normalizeShadowComparisonPayload(
  decisionId: string,
  body: unknown,
): TradingRoomShadowComparisonRead {
  const root = recordFrom(body);
  const detail = recordFrom(root.detail);
  const meta = recordFrom(root.meta);
  if (
    root.status === "unavailable" ||
    detail.status === "unavailable" ||
    meta.status === "unavailable"
  ) {
    const { reason } = extractUnavailableReasonAndOwner(
      body,
      "attribution_owner_unavailable",
    );
    return { state: "unavailable", reason };
  }
  if (root.status === "empty") {
    return {
      state: "empty",
      reason: stringFrom(root.reason) || undefined,
    };
  }

  const data = recordFrom(root.data ?? root);
  if (!Array.isArray(data.arms)) {
    return { state: "unavailable", reason: "invalid_owner_response" };
  }

  const rawArms = data.arms.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
  );
  if (rawArms.length === 0) {
    return { state: "empty" };
  }

  const arms: TradingRoomShadowArm[] = rawArms.map((armRec) => {
    const armName = stringFrom(armRec.arm, "unknown");
    const detailRec = { ...recordFrom(armRec.decision_detail) };
    const settlementSource =
      typeof armRec.settlement_source === "string" &&
      armRec.settlement_source.trim().length > 0
        ? armRec.settlement_source.trim()
        : null;
    const kind = classifyShadowSettlementSource(settlementSource, detailRec);
    if (typeof detailRec.execution_display_label === "string") {
      detailRec.execution_display_label = sanitizeShadowExecutionLabel(
        detailRec.execution_display_label,
        kind,
      );
    }
    return {
      arm: armName,
      decision_detail: detailRec,
      settlement_source: settlementSource,
      settlement_source_kind: kind,
      outcome: armRec.outcome ?? null,
      settled_at:
        typeof armRec.settled_at === "string" && armRec.settled_at.trim()
          ? armRec.settled_at.trim()
          : null,
      unavailable_reason:
        typeof armRec.unavailable_reason === "string" &&
        armRec.unavailable_reason.trim()
          ? armRec.unavailable_reason.trim()
          : null,
    };
  });

  const sources = recordFrom(meta.sources);
  const degraded: Record<string, string> = {};
  for (const [k, v] of Object.entries(sources)) {
    if (typeof v === "string" && v !== "ok") {
      degraded[k] = v;
    }
  }

  return {
    state: "ok",
    data: {
      decision_id: stringFrom(data.decision_id, decisionId),
      arms,
      trader_identity: isRecordOrNull(data.trader_identity),
      account_id:
        typeof data.account_id === "string" && data.account_id.trim()
          ? data.account_id.trim()
          : null,
      execution_authority: "none",
      no_order_route_proof: "agora_decision_support_only",
    },
    degraded: Object.keys(degraded).length > 0 ? degraded : undefined,
  };
}

function isRecordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Fetch the trader's own shadow comparison (all 4 arms and their settlement source labels)
 * for a decision ID from the BFF attribution/shadow route.
 * Strictly read-only GET; never places orders or changes capital.
 */
export async function getTradingRoomShadowComparison(
  decisionId: string,
  baseUrl?: string,
): Promise<TradingRoomShadowComparisonRead> {
  const cleanId = decisionId.trim();
  if (!cleanId) {
    return { state: "empty", reason: "decision_id_required" };
  }
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/management/attribution/shadow/${encodeURIComponent(cleanId)}`;
  try {
    const res = await bffSessionFetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json", ...authHeaders() },
    });
    const body = await parseJson(res);
    if (res.status === 404) {
      const { reason } = extractUnavailableReasonAndOwner(
        body,
        "decision_not_found",
      );
      return { state: "not_found", reason };
    }
    if (!res.ok) {
      const { reason } = extractUnavailableReasonAndOwner(
        body,
        `http_${res.status}`,
      );
      return { state: "unavailable", reason };
    }
    return normalizeShadowComparisonPayload(cleanId, body);
  } catch (err) {
    if (err instanceof BffError) {
      if (err.status === 404 || err.code === "RESOURCE_NOT_FOUND") {
        return {
          state: "not_found",
          reason: err.code || "decision_not_found",
        };
      }
      return {
        state: "unavailable",
        reason: err.code || "attribution_owner_unavailable",
      };
    }
    return {
      state: "unavailable",
      reason: "attribution_owner_unavailable",
    };
  }
}

/**
 * Read the trader's immutable Agora shadow-mode decision lock for a decision event.
 * Returns null on 404 (not found or not owned by caller).
 */
export async function getTradingRoomDecisionLock(
  decisionEventId: string,
  baseUrl?: string,
): Promise<Record<string, unknown> | null> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/trading-room/decision-events/${encodeURIComponent(decisionEventId)}/decision-lock`;
  const res = await bffSessionFetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    await throwTypedBffError(res, "GET", url);
  }
  const body = await parseJson(res);
  const root = recordFrom(body);
  return recordFrom(root.data ?? root);
}
