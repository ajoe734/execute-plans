import type { JourneyDetail, JourneyMeta, JourneyRow, JourneyTimelineEvent } from "@/lib/bff-v1/tradeJourneys";

/**
 * Rows and detail payloads in the TRADE-JOURNEY-FAILURE-CAUSE-20261121 BFF contract shape,
 * derived from recorded journeys tj_e32ead77 (completed), tj_79726064-4cc2-5510-8e11-7f5e59ff89bd
 * (event 91d55953-b575-4fe8-8d39-6e0cade58d59, pre-broker risk gate refusal for 2317 buy 452 shares),
 * tj_57418ba7-ef37-5015-9b5e-b6423872da89 (event 48c946c8-39d1-52bd-b1a1-ce72dc7f6e14, 2317 sell 1 @ 218.5),
 * tj_efaa5c30 (hold), and tj_29473e86 (variance sell).
 */
export const fixtureMeta: JourneyMeta = {
  snapshot_at: new Date().toISOString(),
  read_state: "formal",
  freshness: { materializer_revision: 2811935 },
};

const base = {
  tenant_id: "tenant-dev",
  environment: "paper" as const,
  severity: "info",
  read_state: "formal" as const,
  updated_at: "2026-11-19T23:50:03.000000Z",
  created_at: "2026-11-19T23:46:15.000000Z",
};
const noFlags = {
  waiting_human: false,
  blocked: false,
  rejected: false,
  mismatch: false,
  orphan: false,
  stalled: false,
};

export const completedRow: JourneyRow = {
  ...base,
  journey_id: "tj_e32ead77-ed06-53b5-9807-2416ef98be44",
  status: "completed",
  current_stage: "reconciliation",
  persona_id: "persona-2448c7053e33ea48da47",
  persona_name: "青禾｜2330 台股 Paper 學習 R3",
  persona_is_probe: false,
  symbol: "2330.TWSE",
  side: "buy",
  quantity: 1,
  filled_quantity: 1,
  flags: noFlags,
  outcome: { kind: "normal", reason_code: null, reason_detail: null },
  next_step: null,
};

/** Pre-broker refusal tj_79726064-4cc2-5510-8e11-7f5e59ff89bd after history repair / with producer evidence. */
export const rejectedRow: JourneyRow = {
  ...base,
  journey_id: "tj_79726064-4cc2-5510-8e11-7f5e59ff89bd",
  status: "failed",
  current_stage: "risk_evaluation",
  severity: "critical",
  persona_id: "persona-6507750312870d03a241",
  persona_name: "澄川｜2317 台股 Paper 學習 R2",
  persona_is_probe: false,
  symbol: "2317.TWSE",
  side: "buy",
  quantity: 452,
  filled_quantity: null,
  flags: { ...noFlags, rejected: true },
  outcome: {
    kind: "rejected",
    rejected_stage: "risk_evaluation",
    reason_code: "insufficient_cash",
    reason_detail: {
      required: 100034.3461,
      available: 100000.0,
      limit: 100000.0,
      requested_quantity: 452.0,
    },
    expression_reason_code: "long_cash",
    submitted_to_broker: false,
    order_status: "not_submitted",
    source_event_id: "91d55953-b575-4fe8-8d39-6e0cade58d59",
  },
  next_step: { action_needed: "review_cash_and_risk_limits", href: "/personas/persona-6507750312870d03a241" },
};

/** Pre-broker refusal tj_79726064-4cc2-5510-8e11-7f5e59ff89bd before history repair (missing producer reject_reason). */
export const rejectedBeforeRepairRow: JourneyRow = {
  ...rejectedRow,
  outcome: {
    kind: "rejected",
    rejected_stage: "risk_evaluation",
    reason_code: "reason_not_recorded",
    reason_detail: null,
    expression_reason_code: "long_cash",
    submitted_to_broker: false,
    order_status: "not_submitted",
    source_event_id: "91d55953-b575-4fe8-8d39-6e0cade58d59",
    missing_evidence: ["reject_reason"],
  },
};

/** Pre-broker refusal with partial figures (available omitted). */
export const rejectedPartialFiguresRow: JourneyRow = {
  ...rejectedRow,
  journey_id: "tj_79726064-0000-5510-8e11-000000000009",
  outcome: {
    kind: "rejected",
    rejected_stage: "risk_evaluation",
    reason_code: "insufficient_cash",
    reason_detail: { required: 100034.3461 },
    submitted_to_broker: false,
    order_status: "not_submitted",
    missing_evidence: ["available"],
  },
};

export const rejectedUnrecordedRow: JourneyRow = {
  ...rejectedRow,
  journey_id: "tj_79726064-0000-5510-8e11-000000000001",
  outcome: {
    kind: "rejected",
    reason_code: "reason_not_recorded",
    reason_detail: null,
    rejected_stage: "risk_evaluation",
    submitted_to_broker: false,
    order_status: "not_submitted",
    missing_evidence: ["reject_reason"],
  },
};

export const rejectedUnknownCodeRow: JourneyRow = {
  ...rejectedRow,
  journey_id: "tj_79726064-0000-5510-8e11-000000000002",
  current_stage: "broker_acknowledgement",
  outcome: {
    kind: "rejected",
    reason_code: "venue_halted_9",
    reason_detail: null,
    rejected_stage: "broker_acknowledgement",
    submitted_to_broker: true,
  },
};

export const noTradeRow: JourneyRow = {
  ...base,
  journey_id: "tj_efaa5c30-7feb-5359-8873-4993ca16edb3",
  status: "no_order",
  current_stage: "order_submission",
  persona_id: "persona-d64835a203ce276b8fbb",
  persona_name: "Pantheon Dev Paper Release 43688794313 Attempt 1",
  persona_is_probe: true,
  symbol: "2330.TW",
  side: null,
  quantity: 0,
  filled_quantity: null,
  flags: noFlags,
  outcome: { kind: "no_trade", reason_code: "hold_signal", reason_detail: null },
  next_step: null,
};

export const varianceRow: JourneyRow = {
  ...base,
  journey_id: "tj_29473e86-63ff-5384-bda1-23eef61cebb2",
  status: "completed_with_variance",
  current_stage: "reconciliation",
  persona_id: "persona-2448c7053e33ea48da47",
  persona_name: "青禾｜2330 台股 Paper 學習 R3",
  persona_is_probe: false,
  symbol: "2330.TWSE",
  side: "sell",
  quantity: 1,
  filled_quantity: 1,
  price: 2215,
  flags: { ...noFlags, mismatch: true },
  outcome: {
    kind: "variance",
    classification: "accounting_variance",
    accounting_variance: true,
    comparison_completed: true,
    reason_code: "reconciliation_check_failed",
    reason_detail: [
      { check: "broker_record", status: "ok", detail: "order found" },
      {
        check: "position_change",
        status: "failed",
        detail: "position moved differently from the fill",
        expected: -1,
        actual: 0,
        difference: 1,
        delta: 1,
      },
      {
        check: "cash_change",
        status: "failed",
        detail: "cash moved differently from the fill",
        expected: 2165,
        actual: 0,
        difference: -2165,
        delta: -2165,
      },
    ],
    discrepancies: [
      { check: "position_change", status: "failed", expected: -1, actual: 0, difference: 1, delta: 1 },
      { check: "cash_change", status: "failed", expected: 2165, actual: 0, difference: -2165, delta: -2165 },
    ],
  },
  next_step: { action_needed: "review_open_incident", href: "/incidents/inc-drift-3025dd61c462" },
};

export const deferredRow: JourneyRow = {
  ...varianceRow,
  journey_id: "tj_29473e86-0000-5384-bda1-000000000003",
  flags: noFlags,
  outcome: {
    kind: "reconciliation_deferred",
    classification: "runtime_health",
    accounting_variance: false,
    comparison_completed: false,
    reason_code: "runtime_unhealthy_at_reconciliation",
    reason_detail: [
      {
        check: "runtime_health_summary",
        status: "warning",
        detail: "runtime health summary is missing or unhealthy",
        observed: { telemetry: "degraded", paper_runtime: "degraded" },
      },
    ],
    discrepancies: [],
  },
  next_step: null,
};

export const openRow: JourneyRow = {
  ...completedRow,
  journey_id: "tj_e32ead77-0000-5809-9807-000000000004",
  status: "partially_filled",
  current_stage: "fill_management",
  filled_quantity: 0.4,
  outcome: { kind: "open", reason_code: "partially_filled", reason_detail: null },
};

export const outcomeRows = [completedRow, noTradeRow, rejectedRow, deferredRow, varianceRow, openRow];

export const rejectedDetailStages: JourneyDetail["stages"] = {
  signal_generation: { status: "succeeded" },
  trade_decision: { status: "succeeded" },
  risk_evaluation: {
    status: "rejected",
    reason_code: "insufficient_cash",
    reason_detail: {
      required: 100034.3461,
      available: 100000.0,
      limit: 100000.0,
      requested_quantity: 452.0,
    },
    expression_reason_code: "long_cash",
    source_event_id: "91d55953-b575-4fe8-8d39-6e0cade58d59",
  },
  order_submission: {
    status: "not_submitted",
    order_status: "not_submitted",
    submitted_to_broker: false,
  },
};

export const rejectedTimeline: JourneyTimelineEvent[] = [
  {
    event_id: "cbf0acd1-86af-4637-ab0e-830d2c299cb4",
    stage: "signal_generation",
    stage_status: "succeeded",
    occurred_at: "2026-11-19T23:46:15Z",
    source: "execution.paper_runtime",
  },
  {
    event_id: "7bf9116e-7f19-57ef-b519-778ef869ce3a",
    stage: "trade_decision",
    stage_status: "succeeded",
    occurred_at: "2026-11-19T23:46:16Z",
    source: "execution.paper_runtime",
  },
  {
    event_id: "91d55953-b575-4fe8-8d39-6e0cade58d59:order_submission",
    source_event_id: "91d55953-b575-4fe8-8d39-6e0cade58d59",
    stage: "risk_evaluation",
    rejected_stage: "risk_evaluation",
    event_type: "order_rejection",
    stage_status: "rejected",
    status: "rejected",
    occurred_at: "2026-11-19T23:46:17Z",
    source: "execution.paper_runtime",
    reason_code: "insufficient_cash",
    reason_detail: {
      required: 100034.3461,
      available: 100000.0,
      limit: 100000.0,
      requested_quantity: 452.0,
    },
    expression_reason_code: "long_cash",
    submitted_to_broker: false,
    order_status: "not_submitted",
  },
];

export const rejectedBeforeRepairTimeline: JourneyTimelineEvent[] = [
  rejectedTimeline[0],
  rejectedTimeline[1],
  {
    event_id: "91d55953-b575-4fe8-8d39-6e0cade58d59:order_submission",
    source_event_id: "91d55953-b575-4fe8-8d39-6e0cade58d59",
    stage: "risk_evaluation",
    rejected_stage: "risk_evaluation",
    event_type: "order_rejection",
    stage_status: "rejected",
    status: "rejected",
    occurred_at: "2026-11-19T23:46:17Z",
    source: "execution.paper_runtime",
    reason_code: "reason_not_recorded",
    reason_detail: null,
    expression_reason_code: "long_cash",
    submitted_to_broker: false,
    order_status: "not_submitted",
    missing_evidence: ["reject_reason"],
  },
];

export const varianceTimeline: JourneyTimelineEvent[] = [
  { event_id: "v1", stage: "ledger_booking", stage_status: "succeeded", occurred_at: "2026-11-19T23:49:00Z", source: "execution.paper_runtime" },
  {
    event_id: "v2",
    stage: "reconciliation",
    event_type: "reconciliation_failed",
    stage_status: "failed",
    occurred_at: "2026-11-19T23:50:03Z",
    source: "reconciliation-drift.scheduled",
    classification: "accounting_variance",
    accounting_variance: true,
    comparison_completed: true,
    reason_code: "reconciliation_check_failed",
    reason_detail: varianceRow.outcome!.reason_detail,
    discrepancies: varianceRow.outcome!.discrepancies,
  },
];

/** Recorded second reported journey tj_57418ba7-ef37-5015-9b5e-b6423872da89 (event 48c946c8-39d1-52bd-b1a1-ce72dc7f6e14) before history repair. */
export const tj57418ba7UnverifiedRow: JourneyRow = {
  ...base,
  journey_id: "tj_57418ba7-ef37-5015-9b5e-b6423872da89",
  status: "completed_with_variance",
  current_stage: "reconciliation",
  severity: "warning",
  persona_id: "persona-6507750312870d03a241",
  persona_name: "澄川｜2317 台股 Paper 學習 R2",
  persona_is_probe: false,
  symbol: "2317.TWSE",
  side: "sell",
  quantity: 1.0,
  filled_quantity: 1.0,
  price: 218.5,
  order_id: "b00575cfc62f44d18ed052dad34d23ea",
  broker_order_id: "b00575cfc62f44d18ed052dad34d23ea",
  flags: { ...noFlags, mismatch: true },
  outcome: {
    kind: "variance",
    classification: "unverified_evidence",
    accounting_variance: false,
    comparison_completed: false,
    reason_code: "reason_not_recorded",
    reason_detail: null,
    discrepancies: [],
    source_event_id: "48c946c8-39d1-52bd-b1a1-ce72dc7f6e14",
    missing_evidence: ["reconciliation_reason", "booking_comparison"],
  },
  next_step: { action_needed: "review_reconciliation_variance", href: "/personas/persona-6507750312870d03a241" },
};

/** Reported journey tj_57418ba7-ef37-5015-9b5e-b6423872da89 after history repair: fill 1 @ 218.5 restored with runtime health warning and unverified accounting comparison. */
export const tj57418ba7RepairedRuntimeRow: JourneyRow = {
  ...tj57418ba7UnverifiedRow,
  flags: noFlags,
  outcome: {
    kind: "reconciliation_deferred",
    classification: "runtime_health",
    accounting_variance: false,
    comparison_completed: false,
    reason_code: "runtime_unhealthy_at_reconciliation",
    reason_detail: [
      {
        check: "runtime_health_summary",
        status: "critical",
        detail: "Runtime heartbeat stale during deployment window",
        observed: "unhealthy",
        threshold: "healthy",
      },
    ],
    discrepancies: [],
    missing_evidence: ["booking_comparison"],
    source_event_id: "48c946c8-39d1-52bd-b1a1-ce72dc7f6e14",
  },
  next_step: null,
};

/** Broker read failure at reconciliation on tj_57418ba7-ef37-5015-9b5e-b6423872da89. */
export const tj57418ba7BrokerUnavailableRow: JourneyRow = {
  ...tj57418ba7UnverifiedRow,
  flags: noFlags,
  outcome: {
    kind: "reconciliation_deferred",
    classification: "broker_unavailable",
    accounting_variance: false,
    comparison_completed: false,
    reason_code: "broker_unavailable_at_reconciliation",
    reason_detail: [
      {
        check: "broker_record",
        status: "unavailable",
        broker_order_id: "b00575cfc62f44d18ed052dad34d23ea",
        error: "paper broker status 503",
      },
    ],
    discrepancies: [],
    source_event_id: "48c946c8-39d1-52bd-b1a1-ce72dc7f6e14",
  },
  next_step: null,
};

/** Genuine accounting variance control on tj_57418ba7-ef37-5015-9b5e-b6423872da89. */
export const tj57418ba7GenuineMismatchRow: JourneyRow = {
  ...tj57418ba7UnverifiedRow,
  flags: { ...noFlags, mismatch: true },
  outcome: {
    kind: "variance",
    classification: "accounting_variance",
    accounting_variance: true,
    comparison_completed: true,
    reason_code: "cash_variance",
    reason_detail: [
      {
        check: "position_change",
        status: "passed",
        expected: -1.0,
        actual: -1.0,
        difference: 0.0,
        delta: 0.0,
      },
      {
        check: "cash_change",
        status: "failed",
        expected: 217.5331375,
        actual: 172.5331375,
        difference: -45.0,
        delta: -45.0,
      },
    ],
    discrepancies: [
      {
        check: "cash_change",
        status: "failed",
        expected: 217.5331375,
        actual: 172.5331375,
        difference: -45.0,
        delta: -45.0,
      },
    ],
    source_event_id: "48c946c8-39d1-52bd-b1a1-ce72dc7f6e14",
  },
};

/** Upstream omission in booking comparison control on tj_57418ba7-ef37-5015-9b5e-b6423872da89. */
export const tj57418ba7UpstreamOmissionRow: JourneyRow = {
  ...tj57418ba7UnverifiedRow,
  flags: { ...noFlags, mismatch: true },
  outcome: {
    kind: "variance",
    classification: "unverified_evidence",
    accounting_variance: false,
    comparison_completed: false,
    reason_code: "reconciliation_evidence_incomplete",
    unverified_reason_code: "cash_variance",
    reason_detail: [
      {
        check: "cash_change",
        status: "unverified",
        expected: 217.5331375,
        actual: null,
        difference: null,
        delta: null,
      },
    ],
    discrepancies: [],
    missing_evidence: ["cash_change:actual"],
    source_event_id: "48c946c8-39d1-52bd-b1a1-ce72dc7f6e14",
  },
};

export function makeTj57418ba7Timeline(row: JourneyRow): JourneyTimelineEvent[] {
  const out = row.outcome!;
  return [
    {
      event_id: "000600fb-6496-47d9-a550-1fa23449c1e2",
      stage: "fill_management",
      event_type: "paper_fill_simulated",
      stage_status: "succeeded",
      occurred_at: "2026-11-16T06:52:04.000000Z",
      recorded_at: "2026-11-16T06:52:04.500000Z",
      source: "execution.paper_runtime",
    },
    {
      event_id: "48c946c8-39d1-52bd-b1a1-ce72dc7f6e14",
      source_event_id: "48c946c8-39d1-52bd-b1a1-ce72dc7f6e14",
      stage: "reconciliation",
      event_type: "reconciliation_failed",
      stage_status: "failed",
      status: "failed",
      occurred_at: "2026-11-16T06:58:29.000000Z",
      recorded_at: "2026-11-16T06:58:29.106651Z",
      source: "reconciliation-drift.scheduled",
      classification: out.classification,
      accounting_variance: out.accounting_variance,
      comparison_completed: out.comparison_completed,
      reason_code: out.reason_code,
      reason_detail: out.reason_detail,
      discrepancies: out.discrepancies,
      missing_evidence: out.missing_evidence,
      unverified_reason_code: out.unverified_reason_code,
    },
  ];
}
