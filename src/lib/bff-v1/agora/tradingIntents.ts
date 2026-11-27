import { bffFetch } from "../client";

export interface TradingIntentHandoff {
  handoff_id: string;
  requested_stage: string;
  state: string;
  [key: string]: unknown;
}

export interface TradingIntentDetail {
  status: string;
  lifecycle_state: string;
  allowedActions: { submit_handoff: boolean; withdraw: boolean };
  data: { intent_id: string; strategy_id: string; strategy_spec_registry_id: string; [key: string]: unknown };
  handoffs: TradingIntentHandoff[];
}

/**
 * A paper fill reported by the paper execution owner for this intent.
 * Read-only evidence; never an actual broker fill and never an order action.
 */
export interface TradingIntentPaperFill {
  fill_id: string;
  symbol: string | null;
  side: string | null;
  quantity: number | null;
  price: number | null;
  filled_at: string | null;
  handoff_id: string | null;
}

export type TradingIntentProgressStep = "created" | "submitted" | "accepted" | "paper_running" | "paper_filled";

export interface TradingIntentProgress {
  /** Ordered steps with whether each has been reached. */
  steps: Array<{ step: TradingIntentProgressStep; reached: boolean }>;
  /** Terminal state that stops progress (withdrawn/rejected), if any. */
  terminal: "withdrawn" | "rejected" | null;
  paperFills: TradingIntentPaperFill[];
  /** True when the owner exposed a paper-fill field (even if empty). */
  paperFillsReported: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const PAPER_FILL_KEYS = ["paper_fills", "fills"] as const;

function paperFillsFrom(source: Record<string, unknown> | null, handoffId: string | null): {
  reported: boolean;
  fills: TradingIntentPaperFill[];
} {
  if (!source) return { reported: false, fills: [] };
  let reported = false;
  const fills: TradingIntentPaperFill[] = [];
  for (const key of PAPER_FILL_KEYS) {
    const value = source[key];
    if (!Array.isArray(value)) continue;
    reported = true;
    for (const item of value) {
      const row = record(item);
      const fillId = text(row?.fill_id) ?? text(row?.id);
      if (!row || !fillId) continue;
      // Only paper/simulated fills are shown here; anything claiming a live
      // broker fill is outside this read-only paper progress surface.
      const venue = (text(row.execution_venue) ?? text(row.settlement_source) ?? "paper").toLowerCase();
      if (venue.includes("live") || venue.includes("broker")) continue;
      fills.push({
        fill_id: fillId,
        symbol: text(row.symbol) ?? text(row.instrument),
        side: text(row.side),
        quantity: num(row.quantity) ?? num(row.qty),
        price: num(row.price) ?? num(row.fill_price),
        filled_at: text(row.filled_at) ?? text(row.occurred_at),
        handoff_id: text(row.handoff_id) ?? handoffId,
      });
    }
  }
  return { reported, fills };
}

/**
 * Derive read-only governed-intent progress from the owner readback.
 * Paper fills are shown only when the owner reports them on the intent or
 * on a paper handoff; nothing here offers or implies an order action.
 */
export function tradingIntentProgress(detail: TradingIntentDetail): TradingIntentProgress {
  const lifecycle = detail.lifecycle_state;
  const handoffs = Array.isArray(detail.handoffs) ? detail.handoffs : [];
  const intentFills = paperFillsFrom(record(detail.data), null);
  let reported = intentFills.reported;
  const fills = [...intentFills.fills];
  for (const handoff of handoffs) {
    const fromHandoff = paperFillsFrom(record(handoff), handoff.handoff_id ?? null);
    reported = reported || fromHandoff.reported;
    fills.push(...fromHandoff.fills);
  }
  const seen = new Set<string>();
  const paperFills = fills.filter((fill) => (seen.has(fill.fill_id) ? false : (seen.add(fill.fill_id), true)));
  const submitted = lifecycle !== "draft" || handoffs.some((h) => h.state !== "draft");
  const accepted = lifecycle === "accepted" || handoffs.some((h) => h.state === "accepted");
  const paperRunning = handoffs.some((h) => h.requested_stage === "paper" && h.state === "accepted") || paperFills.length > 0;
  const terminal = lifecycle === "withdrawn" ? "withdrawn" : lifecycle === "rejected" ? "rejected" : null;
  return {
    steps: [
      { step: "created", reached: true },
      { step: "submitted", reached: submitted },
      { step: "accepted", reached: accepted },
      { step: "paper_running", reached: paperRunning },
      { step: "paper_filled", reached: paperFills.length > 0 },
    ],
    terminal,
    paperFills,
    paperFillsReported: reported,
  };
}

export type IntentStage = "shadow" | "paper";
export interface IntentMutationOptions {
  ifMatch: string;
  idempotencyKey: string;
  requestId: string;
}

const intentPath = (id: string) => `/bff/agora/trading-intents/${encodeURIComponent(id)}`;

export async function getTradingIntent(id: string): Promise<TradingIntentDetail> {
  const detail = await bffFetch<TradingIntentDetail>({ method: "GET", path: intentPath(id), mode: "live" });
  if (detail?.data?.intent_id !== id || typeof detail.lifecycle_state !== "string" ||
      typeof detail.allowedActions?.submit_handoff !== "boolean" ||
      typeof detail.allowedActions?.withdraw !== "boolean" || !Array.isArray(detail.handoffs)) {
    throw new Error("交易意圖讀回格式不完整，請重新整理。");
  }
  return detail;
}

function mutateIntent(id: string, action: "handoffs" | "withdraw", body: unknown, options: IntentMutationOptions) {
  if (!options.ifMatch || !options.idempotencyKey || !options.requestId) {
    throw new Error("交易意圖操作缺少必要的版本或請求識別。");
  }
  return bffFetch({
    method: "POST", path: `${intentPath(id)}/${action}`, mode: "live", body,
    headers: { "If-Match": options.ifMatch, "Idempotency-Key": options.idempotencyKey, "X-Request-Id": options.requestId },
  });
}

export function submitTradingIntentHandoff(
  intent: TradingIntentDetail["data"], stage: IntentStage, actorId: string, options: IntentMutationOptions,
) {
  if ((stage !== "shadow" && stage !== "paper") || !actorId || !intent.strategy_spec_registry_id) {
    throw new Error("僅可申請 Shadow 或紙上測試，且必須有操作者與策略版本。");
  }
  return mutateIntent(intent.intent_id, "handoffs", {
    spec_version: "1.0", handoff_id: crypto.randomUUID(), intent_id: intent.intent_id,
    created_at: new Date().toISOString(), strategy_id: intent.strategy_id,
    strategy_spec_registry_id: intent.strategy_spec_registry_id,
    requested_by: { actor_type: "trader", actor_ref: actorId },
    requested_stage: stage, handoff_type: stage === "shadow" ? "shadow_start" : "paper_validation_request",
    state: "submitted", no_order_route_proof: "agora_request_only_no_order_route",
  }, options);
}

export function withdrawTradingIntent(id: string, options: IntentMutationOptions) {
  return mutateIntent(id, "withdraw", undefined, options);
}
