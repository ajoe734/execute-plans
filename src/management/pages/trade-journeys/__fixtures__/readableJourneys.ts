import type { JourneyMeta, JourneyRow, JourneyTimelineEvent } from "@/lib/bff-v1/tradeJourneys";

/**
 * Rows in the BFF-TRADE-JOURNEY-READABLE contract shape, derived from the hosted rows recorded
 * 2026-11-20 (BFF 2fb152cd3): tj_e32ead77 (completed), tj_79726064 (rejected buy), tj_efaa5c30 (hold),
 * tj_29473e86 (variance sell), the 2026-11-16T06:58:29Z scheduled evaluation of rb-3823397e (runtime
 * unhealthy), and the paper runtime rejection log line
 * `reason=insufficient_cash required=100034.3461 available=100000.0`.
 * The recorded BFF predates `outcome`/`next_step`/`persona_name`, so those fields are what the contract
 * says the BFF now returns for the same journeys.
 */
export const fixtureMeta: JourneyMeta = { snapshot_at: new Date().toISOString(), read_state: "formal", freshness: { materializer_revision: 2811935 } };

const base = { environment: "paper" as const, severity: "info", read_state: "formal" as const, updated_at: "2026-11-19T23:50:03.000000Z", created_at: "2026-11-19T23:46:15.000000Z" };
const noFlags = { waiting_human: false, blocked: false, rejected: false, mismatch: false, orphan: false, stalled: false };

export const completedRow: JourneyRow = {
  ...base, journey_id: "tj_e32ead77-ed06-53b5-9807-2416ef98be44", status: "completed", current_stage: "reconciliation",
  persona_id: "persona-2448c7053e33ea48da47", persona_name: "青禾｜2330 台股 Paper 學習 R3", persona_is_probe: false,
  symbol: "2330.TWSE", side: "buy", quantity: 1, filled_quantity: 1, flags: noFlags,
  outcome: { kind: "normal", reason_code: null, reason_detail: null }, next_step: null,
};

export const rejectedRow: JourneyRow = {
  ...base, journey_id: "tj_79726064-4cc2-5510-8e11-7f5e59ff89bd", status: "failed", current_stage: "order_submission",
  persona_id: "persona-6507750312870d03a241", persona_name: "澄川｜2317 台股 Paper 學習 R2", persona_is_probe: false,
  symbol: "2317.TWSE", side: "buy", quantity: 452, filled_quantity: null, flags: { ...noFlags, rejected: true },
  outcome: { kind: "rejected", reason_code: "insufficient_cash", reason_detail: { required: 100034.3461, available: 100000.0, limit: 100000.0 }, rejected_stage: "order_submission" },
  next_step: { action_needed: "確認該 persona 的資金池額度", href: "/personas/persona-6507750312870d03a241" },
};

export const rejectedUnrecordedRow: JourneyRow = {
  ...rejectedRow, journey_id: "tj_79726064-0000-5510-8e11-000000000001",
  outcome: { kind: "rejected", reason_code: "reason_not_recorded", reason_detail: null, rejected_stage: "order_submission" },
};

export const rejectedUnknownCodeRow: JourneyRow = {
  ...rejectedRow, journey_id: "tj_79726064-0000-5510-8e11-000000000002",
  outcome: { kind: "rejected", reason_code: "venue_halted_9", reason_detail: null, rejected_stage: "order_submission" },
};

export const noTradeRow: JourneyRow = {
  ...base, journey_id: "tj_efaa5c30-7feb-5359-8873-4993ca16edb3", status: "no_order", current_stage: "order_submission",
  persona_id: "persona-d64835a203ce276b8fbb", persona_name: "Pantheon Dev Paper Release 43688794313 Attempt 1", persona_is_probe: true,
  symbol: "2330.TW", side: null, quantity: 0, filled_quantity: null, flags: noFlags,
  outcome: { kind: "no_trade", reason_code: "hold_signal", reason_detail: null }, next_step: null,
};

export const varianceRow: JourneyRow = {
  ...base, journey_id: "tj_29473e86-63ff-5384-bda1-23eef61cebb2", status: "completed_with_variance", current_stage: "reconciliation",
  persona_id: "persona-2448c7053e33ea48da47", persona_name: "青禾｜2330 台股 Paper 學習 R3", persona_is_probe: false,
  symbol: "2330.TWSE", side: "sell", quantity: 1, filled_quantity: 1, flags: { ...noFlags, mismatch: true },
  outcome: {
    kind: "variance", reason_code: "reconciliation_check_failed",
    reason_detail: [
      { check: "broker_record", status: "ok", detail: "order found" },
      { check: "position_change", status: "failed", detail: "position moved differently from the fill", expected: -1, actual: 0, difference: 1 },
      { check: "cash_change", status: "failed", detail: "cash moved differently from the fill", expected: 2165, actual: 0, difference: 2165 },
    ],
  },
  next_step: { action_needed: "核對部位與現金帳務", href: "/incidents/inc-recon-3823397e" },
};

export const deferredRow: JourneyRow = {
  ...varianceRow, journey_id: "tj_29473e86-0000-5384-bda1-000000000003",
  outcome: {
    kind: "reconciliation_deferred", reason_code: "runtime_unhealthy_at_reconciliation",
    reason_detail: [{ check: "runtime_health_summary", status: "warning", detail: "runtime health summary is missing or unhealthy", observed: { telemetry: "degraded", paper_runtime: "degraded" } }],
  },
  next_step: null,
};

export const openRow: JourneyRow = {
  ...completedRow, journey_id: "tj_e32ead77-0000-5809-9807-000000000004", status: "partially_filled", current_stage: "fill_management",
  filled_quantity: 0.4, outcome: { kind: "open", reason_code: "partially_filled", reason_detail: null },
};

export const outcomeRows = [completedRow, noTradeRow, rejectedRow, deferredRow, varianceRow, openRow];

export const rejectedTimeline: JourneyTimelineEvent[] = [
  { event_id: "e1", stage: "signal_generation", stage_status: "succeeded", occurred_at: "2026-11-19T23:46:15Z", source: "signal" },
  { event_id: "e2", stage: "trade_decision", stage_status: "succeeded", occurred_at: "2026-11-19T23:46:16Z", source: "decision" },
  { event_id: "e3", stage: "order_submission", stage_status: "failed", occurred_at: "2026-11-19T23:46:17Z", source: "paper_runtime", reason_code: "insufficient_cash", reason_detail: { required: 100034.3461, available: 100000.0, limit: 100000.0 } },
];

export const varianceTimeline: JourneyTimelineEvent[] = [
  { event_id: "v1", stage: "ledger_booking", stage_status: "succeeded", occurred_at: "2026-11-19T23:49:00Z", source: "ledger" },
  { event_id: "v2", stage: "reconciliation", stage_status: "failed", occurred_at: "2026-11-19T23:50:03Z", source: "reconciler", reason_code: "reconciliation_check_failed", reason_detail: varianceRow.outcome!.reason_detail },
];
