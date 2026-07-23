import { detectBaseUrl } from "../client";
import { BffError, normalizeBffErrorEnvelope, type ErrorCode } from "../errors";
import { buildHeaders } from "../headers";
import { liveWriteGated } from "../writeGate";
import type {
  AdjustmentSuggestion as GeneratedAdjustmentSuggestion,
  ComplianceMetric as GeneratedComplianceMetric,
  ExecutionHistoryRow as GeneratedExecutionHistoryRow,
  InterventionRecord as GeneratedInterventionRecord,
  PerformanceProjectionEnvelope as GeneratedPerformanceProjectionEnvelope,
  PerformanceWarning as GeneratedPerformanceWarning,
  SourceAvailability as GeneratedSourceAvailability,
  StrategyPerformanceProjection as GeneratedStrategyPerformanceProjection,
  SuggestionActionEnvelope as GeneratedSuggestionActionEnvelope,
  SuggestionActionReceipt as GeneratedSuggestionActionReceipt,
  SuggestionProvenance as GeneratedSuggestionProvenance,
} from "./types";

export type PerformanceAvailability = "available" | "partial" | "unavailable";
export type PerformancePeriod = "latest" | "7d" | "30d" | "all";
export type PerformanceEnvironment = "paper" | "broker_sandbox" | "canary" | "live";
export type SuggestionAction = "apply" | "reject" | "return_to_workshop";
export type SuggestionStatus = "proposed" | "applied" | "rejected" | "returned_to_workshop";

export type SourceAvailability = GeneratedSourceAvailability;
export type ComplianceMetric = GeneratedComplianceMetric;
export type InterventionRecord = GeneratedInterventionRecord;
export type ExecutionHistoryRow = GeneratedExecutionHistoryRow;
export type PerformanceWarning = GeneratedPerformanceWarning;
export type SuggestionProvenance = GeneratedSuggestionProvenance;
export type AdjustmentSuggestion = GeneratedAdjustmentSuggestion;
export type StrategyPerformanceProjection = GeneratedStrategyPerformanceProjection;
export type PerformanceProjectionEnvelope = GeneratedPerformanceProjectionEnvelope;
export type SuggestionActionReceipt = GeneratedSuggestionActionReceipt;
export type SuggestionActionEnvelope = GeneratedSuggestionActionEnvelope;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function errorCodeForStatus(status: number): ErrorCode {
  if (status === 400 || status === 422) return "VALIDATION_FAILED";
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "RESOURCE_NOT_FOUND";
  if (status === 409 || status === 412) return "STATE_CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "BACKEND_UNAVAILABLE";
  return "UNKNOWN_ERROR";
}

function typedError(status: number, code: ErrorCode, message: string): BffError {
  const envelope = normalizeBffErrorEnvelope({ error: { code, message } }, status);
  if (!envelope) throw new Error(message);
  return new BffError(status, envelope);
}

function responseMessage(value: unknown, status: number): string {
  const root = asRecord(value);
  const error = asRecord(root?.error);
  const detail = root?.detail;
  if (typeof error?.message === "string") return error.message;
  if (typeof detail === "string") return detail;
  return `Strategy Performance request failed (${status})`;
}

async function request<T>(input: {
  method: "GET" | "POST";
  path: string;
  query?: URLSearchParams;
  body?: unknown;
  idempotencyKey?: string;
}): Promise<T> {
  const base = detectBaseUrl().replace(/\/$/, "");
  const query = input.query?.toString();
  const response = await fetch(`${base}${input.path}${query ? `?${query}` : ""}`, {
    method: input.method,
    credentials: "include",
    headers: buildHeaders({ method: input.method, idempotency: input.idempotencyKey }),
    body: input.method === "POST" ? JSON.stringify(input.body ?? {}) : undefined,
  });
  const value = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const normalized = normalizeBffErrorEnvelope(value, response.status);
    if (normalized) throw new BffError(response.status, normalized);
    throw typedError(response.status, errorCodeForStatus(response.status), responseMessage(value, response.status));
  }
  return value as T;
}

function malformed(message: string): never {
  throw typedError(503, "BACKEND_UNAVAILABLE", message);
}

function assertProjectionEnvelope(
  envelope: PerformanceProjectionEnvelope,
  expectedStrategyId: string,
  expectedPeriod: PerformancePeriod,
): void {
  const data = asRecord(envelope?.data);
  if (!data || data.strategy_id !== expectedStrategyId || data.period !== expectedPeriod) {
    malformed("Strategy Performance projection crossed the requested strategy or period binding.");
  }
  if (data.no_order_route_proof !== "agora_performance_read_only") {
    malformed("Strategy Performance projection omitted its non-execution proof.");
  }
  for (const key of ["compliance", "interventions", "execution_history", "warnings", "adjustment_suggestions"]) {
    const section = asRecord(data[key]);
    if (!section || !Array.isArray(section[key === "compliance" ? "metrics" : "items"])) {
      malformed(`Strategy Performance projection omitted ${key} availability or items.`);
    }
  }
}

function assertReceipt(
  envelope: SuggestionActionEnvelope,
  expected?: { receiptId?: string; strategyId?: string; suggestionId?: string; action?: SuggestionAction },
): SuggestionActionReceipt {
  const receipt = envelope?.data;
  if (!receipt || typeof receipt !== "object") malformed("Suggestion action response omitted its receipt.");
  if (receipt.execution_authority !== "none" || receipt.no_order_route_proof !== "agora_suggestion_state_only") {
    malformed("Suggestion action receipt crossed the non-execution boundary.");
  }
  if (
    receipt.authoritative_readback?.no_order_route_proof !== "agora_suggestion_state_only"
    || receipt.authoritative_readback?.suggestion_id !== receipt.suggestion_id
    || receipt.authoritative_readback?.strategy_id !== receipt.strategy_id
    || receipt.authoritative_readback?.status !== receipt.status
    || receipt.authoritative_readback?.version !== receipt.version
  ) {
    malformed("Suggestion action receipt did not match its authoritative suggestion readback.");
  }
  if (
    (expected?.receiptId && receipt.receipt_id !== expected.receiptId)
    || (expected?.strategyId && receipt.strategy_id !== expected.strategyId)
    || (expected?.suggestionId && receipt.suggestion_id !== expected.suggestionId)
    || (expected?.action && receipt.action !== expected.action)
  ) {
    malformed("Suggestion action receipt crossed the requested action binding.");
  }
  return receipt;
}

export async function getStrategyPerformance(
  strategyId: string,
  options: { period?: PerformancePeriod; environment?: PerformanceEnvironment } = {},
): Promise<PerformanceProjectionEnvelope> {
  const period = options.period ?? "latest";
  const query = new URLSearchParams({
    period,
    environment: options.environment ?? "paper",
  });
  const envelope = await request<PerformanceProjectionEnvelope>({
    method: "GET",
    path: `/bff/agora/trading-room/strategies/${encodeURIComponent(strategyId)}/performance`,
    query,
  });
  assertProjectionEnvelope(envelope, strategyId, period);
  return envelope;
}

export async function getPerformanceActionReceipt(
  receiptId: string,
  expected?: { strategyId?: string; suggestionId?: string; action?: SuggestionAction },
): Promise<SuggestionActionEnvelope> {
  const envelope = await request<SuggestionActionEnvelope>({
    method: "GET",
    path: `/bff/agora/performance/action-receipts/${encodeURIComponent(receiptId)}`,
  });
  assertReceipt(envelope, { receiptId, ...expected });
  return envelope;
}

export async function actOnPerformanceSuggestion(input: {
  strategyId: string;
  suggestionId: string;
  action: SuggestionAction;
  expectedVersion: number;
  idempotencyKey: string;
  reason?: string | null;
}): Promise<SuggestionActionEnvelope> {
  if (!(await liveWriteGated())) {
    throw typedError(
      403,
      "PERMISSION_DENIED",
      "Strategy Performance writes are disabled by deployment or session policy.",
    );
  }
  if (!/^[A-Za-z0-9._:-]{8,}$/.test(input.idempotencyKey)) {
    throw typedError(400, "VALIDATION_FAILED", "Suggestion action requires an ASCII-safe idempotency key.");
  }
  const posted = await request<SuggestionActionEnvelope>({
    method: "POST",
    path: `/bff/agora/trading-room/strategies/${encodeURIComponent(input.strategyId)}/performance/suggestions/${encodeURIComponent(input.suggestionId)}/actions`,
    idempotencyKey: input.idempotencyKey,
    body: {
      action: input.action,
      expected_version: input.expectedVersion,
      reason: input.reason?.trim() || null,
    },
  });
  const postedReceipt = assertReceipt(posted, {
    strategyId: input.strategyId,
    suggestionId: input.suggestionId,
    action: input.action,
  });

  const readback = await getPerformanceActionReceipt(postedReceipt.receipt_id, {
    strategyId: input.strategyId,
    suggestionId: input.suggestionId,
    action: input.action,
  });
  const receipt = readback.data;
  if (
    receipt.audit_event_id !== postedReceipt.audit_event_id
    || receipt.status !== postedReceipt.status
    || receipt.version !== postedReceipt.version
    || receipt.recorded_at !== postedReceipt.recorded_at
  ) {
    malformed("Suggestion receipt readback did not match the action response.");
  }
  return readback;
}
