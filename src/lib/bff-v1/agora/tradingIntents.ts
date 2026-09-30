import { bffFetch } from "../client";

export interface TradingIntentDetail {
  status: string;
  lifecycle_state: string;
  allowedActions: { submit_handoff: boolean; withdraw: boolean };
  data: { intent_id: string; strategy_id: string; strategy_spec_registry_id: string };
  handoffs: Array<{ handoff_id: string; requested_stage: string; state: string }>;
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
