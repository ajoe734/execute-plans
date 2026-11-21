import { isNanLike, statusLabel, statusTone, type EnumTone } from "@/lib/enumLabels";
import type {
  JourneyDetail,
  JourneyDiscrepancy,
  JourneyOutcome,
  JourneyReconciliationClassification,
  JourneyRow,
  JourneyStage,
  JourneyTimelineEvent,
} from "@/lib/bff-v1/tradeJourneys";

type T = (key: string, options?: Record<string, unknown>) => string;

/** Stages 1-6 are minted before a journey exists; their absence is lineage, not an operator problem. */
export const UPSTREAM_STAGES = [
  "research_rationale",
  "strategy_candidate",
  "candidate_evaluation",
  "promotion_decision",
  "capital_binding",
  "deployment_runtime",
];

/** Reason codes with zh-TW/en-US copy under `tradeJourneys.reasons`. */
export const KNOWN_REASON_CODES = [
  "insufficient_cash",
  "insufficient_buying_power",
  "insufficient_initial_margin",
  "insufficient_position",
  "sell_without_holdings",
  "kill_switch",
  "hold_signal",
  "partially_filled",
  "runtime_unhealthy_at_reconciliation",
  "reconciliation_deferred_runtime_unhealthy",
  "reconciliation_identity_unverified",
  "reconciliation_evidence_incomplete",
  "reconciliation_check_failed",
  "broker_record_missing",
  "broker_fill_mismatch",
  "position_variance",
  "cash_variance",
  "broker_unavailable_at_reconciliation",
  "reconciliation_deferred_broker_unavailable",
  "reason_not_recorded",
] as const;

/** Expression-policy choice codes: how the order was expressed, not why it was rejected. */
export const EXPRESSION_CHOICE_CODES = ["long_cash", "long_lever", "short_via_future", "close_leg"] as const;

const CASH_REJECT_CODES = new Set(["insufficient_cash", "insufficient_buying_power", "insufficient_initial_margin"]);
const POSITION_REJECT_CODES = new Set(["insufficient_position", "sell_without_holdings"]);
const DEFERRED_RUNTIME_CODES = new Set([
  "runtime_unhealthy_at_reconciliation",
  "reconciliation_deferred_runtime_unhealthy",
]);
const DEFERRED_BROKER_CODES = new Set([
  "broker_unavailable_at_reconciliation",
  "reconciliation_deferred_broker_unavailable",
]);
const RUNTIME_HEALTH_CHECKS = new Set([
  "runtime_state",
  "runtime_health_summary",
  "queue_lag_ms",
  "event_delivery_lag_ms",
  "actual_metrics_presence",
]);
const SPECIFIC_VARIANCE_CODES = new Set([
  "cash_variance",
  "position_variance",
  "broker_fill_mismatch",
  "broker_record_missing",
]);
const COMPARISON_TOLERANCE = 1e-6;

export function formatAmount(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (value === null || value === undefined || value === "" || typeof value === "boolean" || !Number.isFinite(n)) {
    return "—";
  }
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** "澄川｜2317 台股 Paper 學習 R2" → "澄川"; the long suffix repeats the symbol the row already shows. */
export function shortPersonaName(name: string): string {
  return name.split(/[｜|]/)[0].trim() || name;
}

export function shortSymbol(symbol: string): string {
  return symbol.split(".")[0] || symbol;
}

export function personaLabel(row: JourneyRow, t: T): string {
  if (row.persona_name?.trim()) return shortPersonaName(row.persona_name);
  return row.persona_id || t("tradeJourneys.table.unknownPersona");
}

/** `澄川 買 2317 452 股`. A hold (no side) reads `persona symbol`. */
export function journeyTitle(row: JourneyRow, t: T): string {
  const parts = [personaLabel(row, t)];
  const side = String(row.side || "").toLowerCase();
  if (side === "buy" || side === "sell") parts.push(t(`tradeJourneys.sides.${side}`));
  if (row.symbol) parts.push(shortSymbol(row.symbol));
  if (side && row.quantity != null && row.quantity > 0) {
    parts.push(t("tradeJourneys.quantityShares", { quantity: formatAmount(row.quantity) }));
  }
  return parts.join(" ");
}

/** Formats instrument sub-line with side, requested quantity, and available price / filled quantity figures. */
export function instrumentFiguresText(row: JourneyRow, t: T): string {
  const rawSide = String(row.side || "").trim();
  const sideLower = rawSide.toLowerCase();
  const sideText =
    sideLower === "buy" || sideLower === "sell"
      ? t(`tradeJourneys.sides.${sideLower}`)
      : rawSide || "—";
  const qtyText = row.quantity != null && !isNanLike(row.quantity) ? formatAmount(row.quantity) : "—";
  const parts = [`${sideText} ${qtyText}`];
  if (row.price != null && !isNanLike(row.price) && Number(row.price) > 0) {
    parts.push(t("tradeJourneys.priceAt", { price: formatAmount(row.price) }));
  }
  if (row.filled_quantity != null && !isNanLike(row.filled_quantity) && Number(row.filled_quantity) > 0) {
    parts.push(t("tradeJourneys.filledShares", { quantity: formatAmount(row.filled_quantity) }));
  }
  return parts.join(" · ");
}

type Detail = Record<string, unknown>;
const asRecord = (value: unknown): Detail | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Detail) : undefined;

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "" && typeof value !== "boolean" && !isNanLike(value);
}

/** Formats an array of missing evidence field tokens into an explicit insufficient-evidence phrase. */
export function missingEvidenceText(missing: unknown, t: T): string {
  if (!Array.isArray(missing) || missing.length === 0) return "";
  const sep = t("tradeJourneys.listSep");
  const labels: string[] = [];
  for (const raw of missing) {
    const token = String(raw ?? "").trim();
    if (!token) continue;
    let label: string;
    if (token.includes(":")) {
      const [rawCheck, rawField] = token.split(":", 2);
      const checkLabel = t(`tradeJourneys.checks.${rawCheck}`, { defaultValue: rawCheck });
      const fieldLabel = t(`tradeJourneys.evidenceFields.${rawField}`, { defaultValue: rawField });
      label = t("tradeJourneys.evidenceFields.qualified", { check: checkLabel, field: fieldLabel });
    } else {
      label = t(`tradeJourneys.evidenceFields.${token}`, {
        defaultValue: t(`tradeJourneys.checks.${token}`, { defaultValue: token }),
      });
    }
    if (label && !labels.includes(label)) labels.push(label);
  }
  if (labels.length === 0) return "";
  return t("tradeJourneys.outcome.insufficientEvidence", { fields: labels.join(sep) });
}

export function reasonText(
  code: string | null | undefined,
  detail: JourneyOutcome["reason_detail"],
  t: T,
  missingEvidence?: string[] | null,
): string {
  const rawCode = String(code ?? "").trim();
  const isExpressionCode = (EXPRESSION_CHOICE_CODES as readonly string[]).includes(rawCode);
  const effectiveCode = isExpressionCode ? "reason_not_recorded" : rawCode;
  if (!effectiveCode) {
    if (missingEvidence && missingEvidence.length > 0) {
      return missingEvidenceText(missingEvidence, t);
    }
    return passedReconChecksText(detail, t) ?? "";
  }
  const base = (KNOWN_REASON_CODES as readonly string[]).includes(effectiveCode)
    ? t(`tradeJourneys.reasons.${effectiveCode}`)
    : t("tradeJourneys.reasons.unknown", { code: effectiveCode });

  const record = asRecord(detail);
  const sep = t("tradeJourneys.listSep");
  const figures: string[] = [];
  if (record) {
    if (hasValue(record.required)) {
      figures.push(t("tradeJourneys.figures.required", { value: formatAmount(record.required) }));
    }
    if (hasValue(record.available)) {
      figures.push(t("tradeJourneys.figures.available", { value: formatAmount(record.available) }));
    }
    if (hasValue(record.limit)) {
      figures.push(t("tradeJourneys.figures.limit", { value: formatAmount(record.limit) }));
    }
    if (hasValue(record.holding_quantity)) {
      figures.push(t("tradeJourneys.figures.holding", { value: formatAmount(record.holding_quantity) }));
    }
    if (hasValue(record.requested_quantity)) {
      const key = POSITION_REJECT_CODES.has(effectiveCode)
        ? "tradeJourneys.figures.requestedSell"
        : "tradeJourneys.figures.requestedQty";
      figures.push(t(key, { value: formatAmount(record.requested_quantity) }));
    }
  }

  const missing: string[] = Array.isArray(missingEvidence)
    ? missingEvidence.map(x => String(x ?? "").trim()).filter(Boolean)
    : [];
  if (CASH_REJECT_CODES.has(effectiveCode)) {
    if (!hasValue(record?.required) && !missing.includes("required")) {
      missing.push("required");
    }
    if (!hasValue(record?.available) && !missing.includes("available")) {
      missing.push("available");
    }
  } else if (POSITION_REJECT_CODES.has(effectiveCode)) {
    if (!hasValue(record?.holding_quantity) && !missing.includes("holding_quantity")) {
      missing.push("holding_quantity");
    }
    if (!hasValue(record?.requested_quantity) && !missing.includes("requested_quantity")) {
      missing.push("requested_quantity");
    }
  }

  let sentence = figures.length > 0 ? `${base}：${figures.join(sep)}` : base;
  const missingPhrase = missingEvidenceText(missing, t);
  if (missingPhrase) {
    sentence = `${sentence} · ${missingPhrase}`;
  }
  return sentence;
}

/** True when a rejection stopped at the pre-broker risk gate and the order was never submitted to a broker. */
export function isPreBrokerRefusal(rowOrOutcome: JourneyRow | JourneyDetail | JourneyOutcome | null | undefined): boolean {
  if (!rowOrOutcome || typeof rowOrOutcome !== "object") return false;
  const outcome = "outcome" in rowOrOutcome ? rowOrOutcome.outcome : (rowOrOutcome as JourneyOutcome);
  if (outcome) {
    if (outcome.rejected_stage === "risk_evaluation") return true;
    if (outcome.submitted_to_broker === false || outcome.order_status === "not_submitted") return true;
  }
  if ("stages" in rowOrOutcome && rowOrOutcome.stages) {
    if (rowOrOutcome.stages.risk_evaluation?.status === "rejected") return true;
    if (rowOrOutcome.stages.order_submission?.status === "not_submitted") return true;
    if (rowOrOutcome.stages.order_submission?.submitted_to_broker === false) return true;
  }
  if ("stage_events" in rowOrOutcome && rowOrOutcome.stage_events) {
    const subEv = rowOrOutcome.stage_events.order_submission;
    if (
      subEv &&
      subEv.submitted_to_broker === false &&
      (subEv.event_type === "order_rejection" || subEv.event_type === "order_rejection_simulated")
    ) {
      return true;
    }
  }
  return false;
}

/** Effective current stage, preferring the BFF's `rejected_stage` on pre-broker refusals. */
export function effectiveCurrentStage(row: JourneyRow): string {
  if (row.outcome?.kind === "rejected" && isPreBrokerRefusal(row)) {
    return "risk_evaluation";
  }
  return row.outcome?.rejected_stage || row.current_stage;
}

/** Names of the non-ok checks of a reconciliation `reason_detail`, in words. */
export function failedChecks(detail: JourneyOutcome["reason_detail"], t: T): string[] {
  if (!Array.isArray(detail)) return [];
  return detail
    .filter(item => {
      if (!item) return false;
      const st = String(item.status ?? "failed").toLowerCase();
      return st !== "ok" && st !== "passed" && st !== "not_configured";
    })
    .map(item => String(item.check ?? ""))
    .filter(Boolean)
    .map(check => t(`tradeJourneys.checks.${check}`, { defaultValue: check }));
}

export interface ReconciliationEvidenceInput {
  kind?: string | null;
  classification?: JourneyReconciliationClassification | string | null;
  accounting_variance?: boolean | null;
  comparison_completed?: boolean | null;
  reason_code?: string | null;
  reason_detail?: JourneyOutcome["reason_detail"];
  discrepancies?: JourneyDiscrepancy[] | null;
  missing_evidence?: string[] | null;
  unverified_reason_code?: string | null;
}

export interface ReconciliationAnalysisView {
  kind: "reconciliation_deferred" | "variance";
  isDeferred: boolean;
  isUnverified: boolean;
  isProvenVariance: boolean;
  tone: OutcomeTone;
  stageTone: EnumTone;
  badge?: string;
  stageStatusLabel: string;
  sentence: string;
}

function isValidDiscrepancyRecord(item: Record<string, unknown>): boolean {
  const check = String(item.check ?? "").trim();
  if (!check || RUNTIME_HEALTH_CHECKS.has(check)) return false;
  const status = String(item.status ?? "failed").toLowerCase();
  if (
    status === "unverified" ||
    status === "missing_evidence" ||
    status === "passed" ||
    status === "ok" ||
    status === "not_configured" ||
    status === "unavailable"
  ) {
    return false;
  }
  const exp = item.expected;
  const act = item.actual;
  if (exp === null || exp === undefined || exp === "" || act === null || act === undefined || act === "") {
    return false;
  }
  if (typeof exp === "boolean" || typeof act === "boolean") return false;
  const expNum = typeof exp === "number" ? exp : Number(exp);
  const actNum = typeof act === "number" ? act : Number(act);
  if (Number.isFinite(expNum) && Number.isFinite(actNum)) {
    const computed = actNum - expNum;
    if (Math.abs(computed) <= COMPARISON_TOLERANCE) return false;
    for (const key of ["delta", "difference"] as const) {
      if (item[key] !== null && item[key] !== undefined) {
        const val = typeof item[key] === "number" ? (item[key] as number) : Number(item[key]);
        if (!Number.isFinite(val) || Math.abs(val - computed) > COMPARISON_TOLERANCE) {
          return false;
        }
      }
    }
    return true;
  }
  return String(exp) !== String(act);
}

function formatDiscrepancyItem(item: Record<string, unknown>, t: T): string {
  const checkKey = String(item.check ?? "").trim();
  const checkLabel = t(`tradeJourneys.checks.${checkKey}`, { defaultValue: checkKey });
  const exp = item.expected;
  const act = item.actual;
  const expNum = typeof exp === "number" ? exp : Number(exp);
  const actNum = typeof act === "number" ? act : Number(act);
  const rawDelta =
    item.delta !== null && item.delta !== undefined
      ? item.delta
      : item.difference !== null && item.difference !== undefined
        ? item.difference
        : Number.isFinite(expNum) && Number.isFinite(actNum)
          ? actNum - expNum
          : null;
  if (rawDelta !== null && rawDelta !== undefined && Number.isFinite(Number(rawDelta))) {
    return t("tradeJourneys.outcome.comparedValuesDelta", {
      check: checkLabel,
      expected: formatAmount(exp),
      actual: formatAmount(act),
      delta: formatAmount(rawDelta),
    });
  }
  return t("tradeJourneys.outcome.comparedValues", {
    check: checkLabel,
    expected: String(exp),
    actual: String(act),
  });
}

function isPassedReconCheckItem(item: Record<string, unknown>): boolean {
  const check = String(item.check ?? "").trim();
  if (!check) return false;
  const status = String(item.status ?? "").trim().toLowerCase();
  if (status === "not_configured") return true;
  if (status !== "passed" && status !== "ok") return false;
  const hasExp = hasValue(item.expected);
  const hasAct = hasValue(item.actual);
  if (!hasExp && !hasAct) return true;
  if (!hasExp || !hasAct) return false;
  const exp = item.expected;
  const act = item.actual;
  const expNum = typeof exp === "number" ? exp : Number(exp);
  const actNum = typeof act === "number" ? act : Number(act);
  if (Number.isFinite(expNum) && Number.isFinite(actNum)) {
    const computed = actNum - expNum;
    if (Math.abs(computed) > COMPARISON_TOLERANCE) return false;
    for (const key of ["delta", "difference"] as const) {
      if (item[key] !== null && item[key] !== undefined && item[key] !== "") {
        const val = typeof item[key] === "number" ? (item[key] as number) : Number(item[key]);
        if (!Number.isFinite(val) || Math.abs(val - computed) > COMPARISON_TOLERANCE) {
          return false;
        }
      }
    }
    return true;
  }
  return String(exp) === String(act);
}

function passedReconChecksList(detail: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(detail) || detail.length === 0) return undefined;
  const recordItems = detail.filter(
    (x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x),
  );
  if (recordItems.length === 0 || recordItems.length !== detail.length || !recordItems.every(isPassedReconCheckItem)) {
    return undefined;
  }
  return recordItems;
}

function formatPassedReconCheckItem(item: Record<string, unknown>, t: T): string {
  const checkKey = String(item.check ?? "").trim();
  if (!checkKey) return "";
  const checkLabel = t(`tradeJourneys.checks.${checkKey}`, { defaultValue: checkKey });
  if (hasValue(item.expected) && hasValue(item.actual)) {
    return formatDiscrepancyItem(item, t);
  }
  return checkLabel;
}

/** Formats passed check evidence on a completed reconciliation without inventing a missing cause. */
export function passedReconChecksText(
  detail: JourneyOutcome["reason_detail"],
  t: T,
): string | undefined {
  const recordItems = passedReconChecksList(detail);
  if (!recordItems) return undefined;
  const sep = t("tradeJourneys.listSep");
  const formatted = recordItems.map(item => formatPassedReconCheckItem(item, t)).filter(Boolean);
  return formatted.length > 0 ? formatted.join(sep) : undefined;
}

export function reconciliationAnalysisView(
  input: ReconciliationEvidenceInput,
  t: T,
): ReconciliationAnalysisView {
  const sep = t("tradeJourneys.listSep");
  const rawCode = String(input.reason_code ?? "").trim();
  const classification = String(input.classification ?? "").trim();
  const detailItems = Array.isArray(input.reason_detail)
    ? input.reason_detail.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    : [];

  const nonOkDetailItems = detailItems.filter(item => {
    const st = String(item.status ?? "failed").toLowerCase();
    return st !== "ok" && st !== "passed" && st !== "not_configured";
  });

  const hasBrokerUnavailableCheck = nonOkDetailItems.some(
    item => String(item.check ?? "") === "broker_record" && String(item.status ?? "").toLowerCase() === "unavailable",
  );
  const onlyRuntimeHealthChecks =
    nonOkDetailItems.length > 0 &&
    nonOkDetailItems.every(item => RUNTIME_HEALTH_CHECKS.has(String(item.check ?? "").trim()));

  const hasExplicitMissingCause =
    rawCode === "reason_not_recorded" ||
    (Array.isArray(input.missing_evidence) &&
      input.missing_evidence.some(m => String(m ?? "").trim() === "reconciliation_reason"));

  const isBrokerDeferred =
    classification !== "accounting_variance" &&
    classification !== "unverified_evidence" &&
    (DEFERRED_BROKER_CODES.has(rawCode) ||
      hasBrokerUnavailableCheck ||
      (classification === "broker_unavailable" && !hasExplicitMissingCause));
  const isRuntimeDeferred =
    !isBrokerDeferred &&
    classification !== "accounting_variance" &&
    classification !== "unverified_evidence" &&
    (DEFERRED_RUNTIME_CODES.has(rawCode) ||
      onlyRuntimeHealthChecks ||
      (classification === "runtime_health" && !hasExplicitMissingCause));

  if (isBrokerDeferred || isRuntimeDeferred) {
    const effectiveCode = isBrokerDeferred
      ? "broker_unavailable_at_reconciliation"
      : "runtime_unhealthy_at_reconciliation";
    const baseReason = t(`tradeJourneys.reasons.${effectiveCode}`);
    const checkLabels: string[] = [];
    for (const item of nonOkDetailItems) {
      const checkKey = String(item.check ?? "").trim();
      if (!checkKey) continue;
      const checkLabel = t(`tradeJourneys.checks.${checkKey}`, { defaultValue: checkKey });
      const httpMatch = /\b([45]\d\d)\b/.exec(String(item.error ?? item.detail ?? ""));
      const formatted = httpMatch
        ? t("tradeJourneys.outcome.checkWithHttp", { check: checkLabel, status: httpMatch[1] })
        : checkLabel;
      if (!checkLabels.includes(formatted)) checkLabels.push(formatted);
    }
    let sentence = baseReason;
    if (checkLabels.length > 0) {
      sentence = `${sentence}（${t("tradeJourneys.outcome.deferredChecks", { checks: checkLabels.join(sep) })}）`;
    }
    const missingPhrase = missingEvidenceText(input.missing_evidence, t);
    if (missingPhrase) {
      sentence = `${sentence} · ${missingPhrase}`;
    }
    return {
      kind: "reconciliation_deferred",
      isDeferred: true,
      isUnverified: false,
      isProvenVariance: false,
      tone: "amber",
      stageTone: "warning",
      badge: t("tradeJourneys.outcome.deferred"),
      stageStatusLabel: t("tradeJourneys.stageStatuses.reconciliationPending"),
      sentence,
    };
  }

  // Determine proven discrepancies vs unverified checks
  const rawDiscrepancies =
    Array.isArray(input.discrepancies) && input.discrepancies.length > 0
      ? input.discrepancies.filter((x): x is JourneyDiscrepancy => Boolean(x) && typeof x === "object")
      : classification === "" && input.accounting_variance !== false
        ? detailItems
        : [];
  const validDiscrepancies = rawDiscrepancies.filter(isValidDiscrepancyRecord);

  const isProvenVariance =
    validDiscrepancies.length > 0 &&
    classification !== "unverified_evidence" &&
    input.accounting_variance !== false &&
    input.comparison_completed !== false;

  if (isProvenVariance) {
    const formattedValues = validDiscrepancies.map(d => formatDiscrepancyItem(d, t)).join(sep);
    let sentence: string;
    if (SPECIFIC_VARIANCE_CODES.has(rawCode)) {
      const reasonLabel = t(`tradeJourneys.reasons.${rawCode}`);
      sentence = t("tradeJourneys.outcome.varianceWithReasonAndValues", {
        reason: reasonLabel,
        values: formattedValues,
      });
    } else {
      sentence = t("tradeJourneys.outcome.varianceChecks", { checks: formattedValues });
    }
    const missingPhrase = missingEvidenceText(input.missing_evidence, t);
    if (missingPhrase) {
      sentence = `${sentence} · ${missingPhrase}`;
    }
    return {
      kind: "variance",
      isDeferred: false,
      isUnverified: false,
      isProvenVariance: true,
      tone: "amber",
      stageTone: "danger",
      badge: undefined,
      stageStatusLabel: statusLabel("failed", t),
      sentence,
    };
  }

  // Unverified / insufficient evidence on reconciliation
  const effectiveCode =
    SPECIFIC_VARIANCE_CODES.has(rawCode)
      ? "reconciliation_evidence_incomplete"
      : rawCode || "reason_not_recorded";
  const unverifiedClaimCode =
    input.unverified_reason_code ||
    (SPECIFIC_VARIANCE_CODES.has(rawCode) ? rawCode : null);

  const parts: string[] = [];
  const baseReason = (KNOWN_REASON_CODES as readonly string[]).includes(effectiveCode)
    ? t(`tradeJourneys.reasons.${effectiveCode}`)
    : t("tradeJourneys.reasons.unknown", { code: effectiveCode });
  if (baseReason) parts.push(baseReason);

  if (unverifiedClaimCode) {
    const claimLabel = (KNOWN_REASON_CODES as readonly string[]).includes(unverifiedClaimCode)
      ? t(`tradeJourneys.reasons.${unverifiedClaimCode}`)
      : unverifiedClaimCode;
    parts.push(t("tradeJourneys.outcome.unverifiedClaim", { reason: claimLabel }));
  }

  const inferredMissing: string[] = Array.isArray(input.missing_evidence)
    ? input.missing_evidence.map(x => String(x ?? "").trim()).filter(Boolean)
    : [];

  for (const item of nonOkDetailItems) {
    const checkKey = String(item.check ?? "").trim();
    if (!checkKey) continue;
    const checkLabel = t(`tradeJourneys.checks.${checkKey}`, { defaultValue: checkKey });
    const hasExp = hasValue(item.expected);
    const hasAct = hasValue(item.actual);
    if (hasExp || hasAct) {
      const expText = hasExp ? formatAmount(item.expected) : t("tradeJourneys.outcome.missingSideValue");
      const actText = hasAct ? formatAmount(item.actual) : t("tradeJourneys.outcome.missingSideValue");
      const rawDelta = item.delta ?? item.difference;
      if (hasExp && hasAct && hasValue(rawDelta)) {
        parts.push(
          t("tradeJourneys.outcome.conflictingCheckValues", {
            check: checkLabel,
            expected: expText,
            actual: actText,
            delta: formatAmount(rawDelta),
          }),
        );
        if (!inferredMissing.some(m => m.startsWith(`${checkKey}:`))) {
          inferredMissing.push(`${checkKey}:conflicting_delta`);
        }
      } else {
        parts.push(
          t("tradeJourneys.outcome.partialCheckValues", {
            check: checkLabel,
            expected: expText,
            actual: actText,
          }),
        );
        if (!hasExp && !inferredMissing.includes(`${checkKey}:expected`)) {
          inferredMissing.push(`${checkKey}:expected`);
        }
        if (!hasAct && !inferredMissing.includes(`${checkKey}:actual`)) {
          inferredMissing.push(`${checkKey}:actual`);
        }
      }
    } else {
      parts.push(checkLabel);
    }
  }

  if (inferredMissing.length === 0) {
    if (effectiveCode === "reason_not_recorded" || input.kind === "reconciliation_deferred") {
      inferredMissing.push("reconciliation_reason", "booking_comparison");
    } else if (effectiveCode === "reconciliation_identity_unverified") {
      inferredMissing.push("authoritative_actual_identity");
    } else {
      inferredMissing.push("booking_comparison");
    }
  } else if (
    (effectiveCode === "reason_not_recorded" || input.kind === "reconciliation_deferred") &&
    !inferredMissing.includes("reconciliation_reason") &&
    !inferredMissing.some(
      m =>
        m.startsWith("cash_change:") ||
        m.startsWith("position_change:") ||
        m.startsWith("committed_snapshot_"),
    )
  ) {
    inferredMissing.unshift("reconciliation_reason");
  }

  const missingPhrase = missingEvidenceText(inferredMissing, t);
  if (missingPhrase) parts.push(missingPhrase);

  return {
    kind: "variance",
    isDeferred: false,
    isUnverified: true,
    isProvenVariance: false,
    tone: "amber",
    stageTone: "warning",
    badge: t("tradeJourneys.outcome.deferred"),
    stageStatusLabel: t("tradeJourneys.stageStatuses.reconciliationPending"),
    sentence: parts.join(" · "),
  };
}

export type OutcomeTone = "gray" | "red" | "amber" | "neutral";
export interface OutcomeView {
  kind: JourneyOutcome["kind"];
  tone: OutcomeTone;
  badge?: string;
  sentence: string;
  isDeferred?: boolean;
  isUnverified?: boolean;
  isProvenVariance?: boolean;
  isPreBrokerRefusal?: boolean;
}

/** One plain sentence for the status cell and summary banner; undefined when the row carries no outcome worth replacing the status badge for. */
export function outcomeView(row: JourneyRow, t: T): OutcomeView | undefined {
  const outcome = row.outcome;
  if (!outcome || outcome.kind === "normal") return undefined;
  switch (outcome.kind) {
    case "no_trade": {
      const reason = reasonText(outcome.reason_code, outcome.reason_detail, t, outcome.missing_evidence);
      return { kind: outcome.kind, tone: "gray", badge: t("tradeJourneys.outcome.noTrade"), sentence: reason };
    }
    case "rejected": {
      const preBroker = isPreBrokerRefusal(row);
      const rawCode = String(outcome.reason_code ?? "").trim();
      const isMissingReason =
        !rawCode ||
        rawCode === "reason_not_recorded" ||
        (EXPRESSION_CHOICE_CODES as readonly string[]).includes(rawCode);
      const missingList =
        Array.isArray(outcome.missing_evidence) && outcome.missing_evidence.length > 0
          ? outcome.missing_evidence
          : isMissingReason
            ? ["reject_reason"]
            : undefined;
      const reason = reasonText(outcome.reason_code, outcome.reason_detail, t, missingList);
      let sentence: string;
      if (preBroker) {
        const stageLabel = t("tradeJourneys.stages.risk_evaluation");
        sentence = t("tradeJourneys.outcome.preBrokerRejected", { stage: stageLabel, reason });
      } else if (outcome.rejected_stage === "broker_acknowledgement") {
        const stageLabel = t("tradeJourneys.stages.broker_acknowledgement");
        sentence = t("tradeJourneys.outcome.brokerRejected", { stage: stageLabel, reason });
      } else if (outcome.rejected_stage) {
        const stageLabel = t(`tradeJourneys.stages.${outcome.rejected_stage}`, {
          defaultValue: outcome.rejected_stage,
        });
        sentence = t("tradeJourneys.outcome.stageRejected", { stage: stageLabel, reason });
      } else {
        sentence = t("tradeJourneys.outcome.rejected", { reason });
      }
      return {
        kind: outcome.kind,
        tone: "red",
        sentence,
        isPreBrokerRefusal: preBroker,
      };
    }
    case "reconciliation_deferred":
    case "variance": {
      const recon = reconciliationAnalysisView(outcome, t);
      return {
        kind: recon.kind,
        tone: recon.tone,
        badge: recon.badge,
        sentence: recon.sentence,
        isDeferred: recon.isDeferred,
        isUnverified: recon.isUnverified,
        isProvenVariance: recon.isProvenVariance,
      };
    }
    case "open": {
      const reason = reasonText(outcome.reason_code, outcome.reason_detail, t, outcome.missing_evidence);
      return reason ? { kind: outcome.kind, tone: "neutral", sentence: reason } : undefined;
    }
    default:
      return undefined;
  }
}

/** BFF hrefs are app-relative (`/incidents/x`, `/personas/y`); the management shell mounts them under /management. */
export function nextStepHref(href: string): string {
  if (!href.startsWith("/") || href.startsWith("/management/")) return href;
  return `/management${href}`;
}

export const KNOWN_ACTION_CODES = [
  "review_open_incident",
  "review_cash_and_risk_limits",
  "review_reconciliation_variance",
] as const;

/** The BFF sends next_step.action_needed as a code; show words grounded in the identified cause, and name the code when it is unknown. */
export function actionText(code: string, t: T, row?: JourneyRow): string {
  if (!(KNOWN_ACTION_CODES as readonly string[]).includes(code)) {
    return t("tradeJourneys.actions.unknown", { code });
  }
  const outcome = row?.outcome;
  if (code === "review_open_incident" && outcome) {
    const recon =
      outcome.kind === "variance" || outcome.kind === "reconciliation_deferred"
        ? reconciliationAnalysisView(outcome, t)
        : undefined;
    if (recon?.isUnverified) {
      return t("tradeJourneys.actions.review_open_incident_missing_evidence");
    }
  }
  if (code === "review_reconciliation_variance" && outcome) {
    const recon = reconciliationAnalysisView(outcome, t);
    if (recon.isUnverified) {
      return t("tradeJourneys.actions.review_missing_reconciliation_evidence");
    }
  }
  if (code === "review_cash_and_risk_limits" && outcome) {
    const rawCode = String(outcome.reason_code ?? "").trim();
    if (POSITION_REJECT_CODES.has(rawCode)) {
      return t("tradeJourneys.actions.review_position_and_order_limits");
    }
    const isMissingReason =
      !rawCode ||
      rawCode === "reason_not_recorded" ||
      (EXPRESSION_CHOICE_CODES as readonly string[]).includes(rawCode) ||
      (Array.isArray(outcome.missing_evidence) && outcome.missing_evidence.includes("reject_reason"));
    if (isMissingReason) {
      return t("tradeJourneys.actions.review_missing_rejection_evidence");
    }
  }
  return t(`tradeJourneys.actions.${code}`);
}

/** Stage and timeline statuses in words and tone, through the shared enum helper. */
export function stageStatusView(
  status: string | null | undefined,
  t: T,
  stage?: string | null,
): { label: string; tone: EnumTone } {
  const normStatus = String(status ?? "").trim().toLowerCase();
  if (stage === "risk_evaluation" && normStatus === "rejected") {
    return { label: t("tradeJourneys.stageStatuses.riskRejected"), tone: "danger" };
  }
  if (stage === "broker_acknowledgement" && normStatus === "rejected") {
    return { label: t("tradeJourneys.stageStatuses.brokerRejected"), tone: "danger" };
  }
  if (normStatus === "not_submitted") {
    return { label: t("tradeJourneys.stageStatuses.notSubmitted"), tone: "paused" };
  }
  return { label: statusLabel(status, t), tone: statusTone(status) };
}

type EventIdentityCarrier = {
  source_event_id?: string | null;
  event_id?: string | null;
  canonical_event_id?: string | null;
  reconciliation_id?: string | null;
};

type ReconStatusCarrier = {
  status?: string | null;
  stage_status?: string | null;
  event_type?: string | null;
};

type ReconEvidenceCarrier = EventIdentityCarrier &
  ReconStatusCarrier & {
    kind?: string | null;
    classification?: JourneyReconciliationClassification | string | null;
    accounting_variance?: boolean | null;
    comparison_completed?: boolean | null;
    reason_code?: string | null;
    reason_detail?: JourneyOutcome["reason_detail"];
    discrepancies?: JourneyDiscrepancy[] | null;
    missing_evidence?: string[] | null;
    unverified_reason_code?: string | null;
  };

function extractEventIds(record: EventIdentityCarrier | null | undefined): string[] {
  if (!record || typeof record !== "object") return [];
  const ids: string[] = [];
  for (const raw of [record.source_event_id, record.event_id, record.canonical_event_id, record.reconciliation_id]) {
    const val = String(raw ?? "").trim();
    if (!val) continue;
    if (!ids.includes(val)) ids.push(val);
    const prefix = val.split(":")[0]?.trim();
    if (prefix && !ids.includes(prefix)) ids.push(prefix);
  }
  return ids;
}

function hasMatchingEventIdentity(
  ev: EventIdentityCarrier | null | undefined,
  candidate: EventIdentityCarrier | null | undefined,
): boolean {
  const evIds = extractEventIds(ev);
  const candIds = extractEventIds(candidate);
  if (evIds.length === 0 || candIds.length === 0) return false;
  return evIds.some(id => candIds.includes(id));
}

function isExplicitReconFailureStatus(record: ReconStatusCarrier | null | undefined): boolean {
  if (!record || typeof record !== "object") return false;
  const stageStatus = String(record.stage_status ?? "").trim().toLowerCase();
  const status = String(record.status ?? "").trim().toLowerCase();
  const eventType = String(record.event_type ?? "").trim().toLowerCase();
  return (
    stageStatus === "failed" ||
    stageStatus === "completed_with_variance" ||
    stageStatus === "unreconciled" ||
    stageStatus === "reconciliation_deferred" ||
    stageStatus === "deferred" ||
    status === "failed" ||
    status === "completed_with_variance" ||
    status === "unreconciled" ||
    status === "reconciliation_deferred" ||
    status === "deferred" ||
    eventType === "reconciliation_failed" ||
    eventType === "reconciliation_deferred"
  );
}

function isExplicitReconSuccessStatus(record: ReconStatusCarrier | null | undefined): boolean {
  if (!record || typeof record !== "object") return false;
  if (isExplicitReconFailureStatus(record)) return false;
  const stageStatus = String(record.stage_status ?? "").trim().toLowerCase();
  const status = String(record.status ?? "").trim().toLowerCase();
  const eventType = String(record.event_type ?? "").trim().toLowerCase();
  return (
    eventType === "reconciliation_completed" ||
    stageStatus === "succeeded" ||
    stageStatus === "completed" ||
    status === "succeeded" ||
    status === "completed"
  );
}

function hasReconFailureEvidenceFields(record: ReconEvidenceCarrier | null | undefined): boolean {
  if (!record || typeof record !== "object") return false;
  const kind = String(record.kind ?? "").trim().toLowerCase();
  const classification = String(record.classification ?? "").trim().toLowerCase();
  const hasFailureClassification =
    Boolean(classification) &&
    classification !== "normal" &&
    classification !== "completed" &&
    classification !== "succeeded";
  const hasNonPassedDetail =
    record.reason_detail !== undefined &&
    record.reason_detail !== null &&
    (Array.isArray(record.reason_detail)
      ? record.reason_detail.length > 0 && !passedReconChecksList(record.reason_detail)
      : true);
  return (
    kind === "variance" ||
    kind === "reconciliation_deferred" ||
    hasFailureClassification ||
    Boolean(String(record.reason_code ?? "").trim()) ||
    hasNonPassedDetail ||
    (Array.isArray(record.discrepancies) && record.discrepancies.length > 0) ||
    (Array.isArray(record.missing_evidence) && record.missing_evidence.length > 0) ||
    Boolean(String(record.unverified_reason_code ?? "").trim()) ||
    record.accounting_variance === true ||
    record.comparison_completed === false
  );
}

function isReconEventFailure(ev: JourneyTimelineEvent | null | undefined): boolean {
  if (!ev || ev.stage !== "reconciliation") return false;
  if (isExplicitReconFailureStatus(ev)) return true;
  if (hasReconFailureEvidenceFields(ev)) return true;
  return false;
}

function hasLocalReconFailureAnalysisPayload(record: ReconEvidenceCarrier | null | undefined): boolean {
  if (!record || typeof record !== "object") return false;
  const evClass = String(record.classification ?? "").trim();
  const hasNonPassedDetail =
    record.reason_detail !== undefined &&
    record.reason_detail !== null &&
    (Array.isArray(record.reason_detail)
      ? record.reason_detail.length > 0 && !passedReconChecksList(record.reason_detail)
      : Object.keys(record.reason_detail).length > 0);
  return (
    Boolean(evClass) ||
    hasNonPassedDetail ||
    (Array.isArray(record.discrepancies) && record.discrepancies.length > 0) ||
    (Array.isArray(record.missing_evidence) && record.missing_evidence.length > 0)
  );
}

function areReconCausesCompatible(
  primary: ReconEvidenceCarrier | null | undefined,
  secondary: ReconEvidenceCarrier | null | undefined,
): boolean {
  if (!primary || !secondary) return true;
  const pClass = String(primary.classification ?? "").trim();
  const sClass = String(secondary.classification ?? "").trim();
  if (pClass && sClass && pClass !== sClass) return false;
  const pCode = String(primary.reason_code ?? "").trim();
  const sCode = String(secondary.reason_code ?? "").trim();
  if (pCode && sCode && pCode !== sCode) return false;
  const pMissingCause =
    pCode === "reason_not_recorded" ||
    (Array.isArray(primary.missing_evidence) && primary.missing_evidence.includes("reconciliation_reason"));
  const sMissingCause =
    sCode === "reason_not_recorded" ||
    (Array.isArray(secondary.missing_evidence) && secondary.missing_evidence.includes("reconciliation_reason"));
  const pHasKnownCause =
    (Boolean(pCode) && pCode !== "reason_not_recorded") ||
    (Boolean(pClass) && pClass !== "unverified_evidence");
  const sHasKnownCause =
    (Boolean(sCode) && sCode !== "reason_not_recorded") ||
    (Boolean(sClass) && sClass !== "unverified_evidence");
  if ((pMissingCause && sHasKnownCause) || (sMissingCause && pHasKnownCause)) {
    return false;
  }
  if (
    typeof primary.accounting_variance === "boolean" &&
    typeof secondary.accounting_variance === "boolean" &&
    primary.accounting_variance !== secondary.accounting_variance
  ) {
    return false;
  }
  if (
    typeof primary.comparison_completed === "boolean" &&
    typeof secondary.comparison_completed === "boolean" &&
    primary.comparison_completed !== secondary.comparison_completed
  ) {
    return false;
  }
  return true;
}

function canHydrateReconTimelineEventFrom(
  ev: JourneyTimelineEvent,
  candidate: ReconEvidenceCarrier | null | undefined,
): boolean {
  if (!candidate || typeof candidate !== "object") return false;
  if (isExplicitReconSuccessStatus(candidate) && !hasReconFailureEvidenceFields(candidate)) return false;
  if (!hasReconFailureEvidenceFields(candidate)) return false;
  if (!hasMatchingEventIdentity(ev, candidate)) return false;
  if (!areReconCausesCompatible(ev, candidate)) return false;
  if (hasLocalReconFailureAnalysisPayload(ev)) return false;
  return true;
}

function canHydratePassedReconTimelineEventFrom(
  ev: JourneyTimelineEvent,
  candidate: ReconEvidenceCarrier | null | undefined,
): boolean {
  if (!candidate || typeof candidate !== "object") return false;
  if (isExplicitReconFailureStatus(candidate) || hasReconFailureEvidenceFields(candidate)) return false;
  if (ev.reason_detail !== undefined) return false;
  if (!passedReconChecksList(candidate.reason_detail)) return false;
  const evIds = extractEventIds(ev);
  const candIds = extractEventIds(candidate);
  if (evIds.length > 0 && candIds.length > 0) {
    return hasMatchingEventIdentity(ev, candidate);
  }
  return evIds.length === 0 && candIds.length === 0;
}

/** Normalizes detail stages and timeline items so pre-broker refusals and reconciliation causes render consistently across banner, stages, and timeline. */
export function resolveDetailStagesAndTimeline(
  row: JourneyDetail | undefined,
  timelineItems: JourneyTimelineEvent[] | undefined,
  t: T,
): {
  stages: Record<string, JourneyStage>;
  stageViews: Record<string, { label: string; tone: EnumTone; reason?: string }>;
  timeline: Array<
    JourneyTimelineEvent & {
      displayStage?: string;
      displayStatusLabel: string;
      displayReason?: string;
    }
  >;
} {
  const rawStages: Record<string, JourneyStage> = {};
  for (const [k, v] of Object.entries(row?.stages ?? {})) {
    if (v && typeof v === "object") rawStages[k] = { ...v };
  }
  const items = (timelineItems ?? []).map(item => ({ ...item }));
  const preBroker = isPreBrokerRefusal(row);

  if (preBroker && row) {
    const subStage = rawStages.order_submission;
    const subEvent = row.stage_events?.order_submission;
    const riskEvent = row.stage_events?.risk_evaluation;
    const outcome = row.outcome;
    const rawReasonCode =
      rawStages.risk_evaluation?.reason_code ??
      riskEvent?.reason_code ??
      outcome?.reason_code ??
      subStage?.reason_code ??
      subEvent?.reason_code ??
      "reason_not_recorded";
    const effReasonCode = (EXPRESSION_CHOICE_CODES as readonly string[]).includes(String(rawReasonCode))
      ? "reason_not_recorded"
      : rawReasonCode;
    const effDetail =
      rawStages.risk_evaluation?.reason_detail !== undefined
        ? rawStages.risk_evaluation.reason_detail
        : riskEvent?.reason_detail !== undefined
          ? riskEvent.reason_detail
          : outcome?.reason_detail !== undefined
            ? outcome.reason_detail
            : subStage?.reason_detail !== undefined
              ? subStage.reason_detail
              : subEvent?.reason_detail ?? null;
    const effMissing =
      rawStages.risk_evaluation?.missing_evidence !== undefined
        ? rawStages.risk_evaluation.missing_evidence
        : riskEvent?.missing_evidence !== undefined
          ? riskEvent.missing_evidence
          : outcome?.missing_evidence !== undefined
            ? outcome.missing_evidence
            : effReasonCode === "reason_not_recorded"
              ? ["reject_reason"]
              : undefined;
    const effSourceEventId =
      rawStages.risk_evaluation?.source_event_id ??
      riskEvent?.source_event_id ??
      riskEvent?.event_id ??
      outcome?.source_event_id ??
      subStage?.source_event_id ??
      subEvent?.source_event_id ??
      subEvent?.event_id;

    rawStages.risk_evaluation = {
      ...rawStages.risk_evaluation,
      status: "rejected",
      reason_code: effReasonCode,
      reason_detail: effDetail,
      missing_evidence: effMissing,
      source_event_id: effSourceEventId,
      submitted_to_broker: false,
      order_status: "not_submitted",
      updated_at: rawStages.risk_evaluation?.updated_at ?? subStage?.updated_at,
    };
    rawStages.order_submission = {
      ...subStage,
      status: "not_submitted",
      order_status: "not_submitted",
      submitted_to_broker: false,
      reason_code: undefined,
      reason_detail: undefined,
    };

    const rowRejCarrier: EventIdentityCarrier = { source_event_id: effSourceEventId };
    const hasRowRejIdentity = extractEventIds(rowRejCarrier).length > 0;

    for (const ev of items) {
      const isRejEv =
        ev.event_type === "order_rejection" ||
        ev.event_type === "order_rejection_simulated" ||
        (ev.stage === "order_submission" && (ev.stage_status === "failed" || ev.stage_status === "rejected")) ||
        (ev.stage === "risk_evaluation" && (ev.stage_status === "rejected" || ev.stage_status === "failed"));
      if (isRejEv) {
        const rawEvCode = String(ev.reason_code ?? "").trim();
        const hasValidLocalRejCode =
          Boolean(rawEvCode) && !(EXPRESSION_CHOICE_CODES as readonly string[]).includes(rawEvCode);
        const matchesRowRej = hasMatchingEventIdentity(ev, rowRejCarrier);
        const canHydrateFromRow =
          matchesRowRej || (!hasRowRejIdentity && extractEventIds(ev).length === 0);

        ev.stage = "risk_evaluation";
        ev.stage_status = "rejected";
        ev.status = "rejected";
        ev.submitted_to_broker = false;
        ev.order_status = "not_submitted";
        if (hasValidLocalRejCode) {
          ev.reason_code = rawEvCode;
          if (ev.reason_detail === undefined && rawEvCode === effReasonCode && canHydrateFromRow) {
            ev.reason_detail = effDetail;
          }
          if (ev.missing_evidence === undefined && rawEvCode === effReasonCode && canHydrateFromRow) {
            ev.missing_evidence = effMissing;
          }
        } else if (canHydrateFromRow) {
          ev.reason_code = effReasonCode;
          if (ev.reason_detail === undefined) ev.reason_detail = effDetail;
          if (ev.missing_evidence === undefined) ev.missing_evidence = effMissing;
        } else {
          ev.reason_code = "reason_not_recorded";
          if (ev.missing_evidence === undefined) ev.missing_evidence = ["reject_reason"];
        }
      }
    }
  }

  // Merge stage reasons and status views
  const stageViews: Record<string, { label: string; tone: EnumTone; reason?: string }> = {};
  const allStageNames = new Set([
    "signal_generation",
    "trade_decision",
    "risk_evaluation",
    "order_submission",
    "broker_acknowledgement",
    "fill_management",
    "ledger_booking",
    "reconciliation",
    ...Object.keys(rawStages),
  ]);

  const reconOutcome: ReconEvidenceCarrier | undefined =
    row?.outcome?.kind === "variance" || row?.outcome?.kind === "reconciliation_deferred"
      ? row.outcome
      : undefined;

  for (const stage of allStageNames) {
    const stInfo = rawStages[stage];
    const stEv = row?.stage_events?.[stage];
    const tlEv = [...items].reverse().find(e => e.stage === stage);
    const status = stInfo?.status;

    if (stage === "reconciliation") {
      const failedTlEv = [...items].reverse().find(e => e.stage === "reconciliation" && isReconEventFailure(e));
      const successTlEv = [...items].reverse().find(e => e.stage === "reconciliation" && !isReconEventFailure(e));
      const stageExplicitlySucceeded =
        isExplicitReconSuccessStatus(stInfo) &&
        !hasReconFailureEvidenceFields(stInfo) &&
        !reconOutcome;
      const hasReconFailure =
        !stageExplicitlySucceeded &&
        (isExplicitReconFailureStatus(stInfo) ||
          Boolean(reconOutcome) ||
          hasReconFailureEvidenceFields(stInfo) ||
          isExplicitReconFailureStatus(stEv) ||
          hasReconFailureEvidenceFields(stEv) ||
          Boolean(failedTlEv));

      if (hasReconFailure && (status || failedTlEv || reconOutcome)) {
        const stagePrimary: ReconEvidenceCarrier | undefined = hasReconFailureEvidenceFields(stInfo)
          ? stInfo
          : hasReconFailureEvidenceFields(stEv)
            ? stEv
            : hasReconFailureEvidenceFields(reconOutcome)
              ? reconOutcome
              : failedTlEv;
        const stageFallback: ReconEvidenceCarrier | undefined =
          stagePrimary === stInfo && areReconCausesCompatible(stInfo, reconOutcome)
            ? reconOutcome
            : undefined;
        const effStageKind =
          reconOutcome?.kind === "reconciliation_deferred" || reconOutcome?.kind === "variance"
            ? areReconCausesCompatible(stagePrimary, reconOutcome)
              ? reconOutcome.kind
              : undefined
            : undefined;
        const primaryHasLocalPayload = hasLocalReconFailureAnalysisPayload(stagePrimary);
        const mergedRecon: ReconciliationEvidenceInput = {
          kind: stagePrimary?.kind ?? effStageKind,
          classification: stagePrimary?.classification ?? stageFallback?.classification,
          accounting_variance: stagePrimary?.accounting_variance ?? stageFallback?.accounting_variance,
          comparison_completed: stagePrimary?.comparison_completed ?? stageFallback?.comparison_completed,
          reason_code: stagePrimary?.reason_code ?? stageFallback?.reason_code,
          reason_detail:
            stagePrimary?.reason_detail !== undefined && stagePrimary?.reason_detail !== null
              ? stagePrimary.reason_detail
              : stageFallback?.reason_detail,
          discrepancies:
            stagePrimary?.discrepancies !== undefined && stagePrimary?.discrepancies !== null
              ? stagePrimary.discrepancies
              : stageFallback?.discrepancies,
          missing_evidence:
            stagePrimary?.missing_evidence !== undefined && stagePrimary?.missing_evidence !== null
              ? stagePrimary.missing_evidence
              : primaryHasLocalPayload
                ? undefined
                : stageFallback?.missing_evidence,
          unverified_reason_code:
            stagePrimary?.unverified_reason_code !== undefined && stagePrimary?.unverified_reason_code !== null
              ? stagePrimary.unverified_reason_code
              : primaryHasLocalPayload
                ? undefined
                : stageFallback?.unverified_reason_code,
        };
        const reconView = reconciliationAnalysisView(mergedRecon, t);
        stageViews[stage] = {
          label: status ? reconView.stageStatusLabel : t("tradeJourneys.detail.unknownStatus"),
          tone: status ? reconView.stageTone : "neutral",
          reason: reconView.sentence,
        };
        continue;
      }

      const baseReconView = stageStatusView(status, t, stage);
      const canUseStEvForPassed =
        stInfo?.reason_detail === undefined &&
        !isExplicitReconFailureStatus(stEv) &&
        !hasReconFailureEvidenceFields(stEv) &&
        (extractEventIds(stInfo).length === 0 || hasMatchingEventIdentity(stInfo, stEv));
      const canUseTlEvForPassed =
        stInfo?.reason_detail === undefined &&
        (!canUseStEvForPassed || stEv?.reason_detail === undefined) &&
        Boolean(successTlEv) &&
        ((extractEventIds(stInfo).length === 0 && extractEventIds(stEv).length === 0) ||
          hasMatchingEventIdentity(successTlEv, stInfo ?? stEv));
      const passedStageDetail =
        stInfo?.reason_detail !== undefined
          ? stInfo.reason_detail
          : canUseStEvForPassed && stEv?.reason_detail !== undefined
            ? stEv.reason_detail
            : canUseTlEvForPassed
              ? successTlEv?.reason_detail
              : undefined;
      const passedStageReason = passedReconChecksText(passedStageDetail, t);
      stageViews[stage] = {
        label: status ? baseReconView.label : t("tradeJourneys.detail.unknownStatus"),
        tone: baseReconView.tone,
        reason: passedStageReason,
      };
      continue;
    }

    const baseView = stageStatusView(status, t, stage);
    let reason: string | undefined;
    if (stage !== "order_submission" || status !== "not_submitted") {
      const canUseTlEv =
        tlEv &&
        (!hasReconFailureEvidenceFields(stInfo) && stInfo?.reason_code === undefined) &&
        (hasMatchingEventIdentity(tlEv, stInfo ?? stEv ?? row?.outcome) ||
          (extractEventIds(stInfo).length === 0 && extractEventIds(stEv).length === 0));
      const code = stInfo?.reason_code ?? stEv?.reason_code ?? (canUseTlEv ? tlEv?.reason_code : undefined);
      const detail =
        stInfo?.reason_detail !== undefined
          ? stInfo.reason_detail
          : stEv?.reason_detail !== undefined
            ? stEv.reason_detail
            : canUseTlEv
              ? tlEv?.reason_detail
              : undefined;
      const missing =
        stInfo?.missing_evidence !== undefined
          ? stInfo.missing_evidence
          : stEv?.missing_evidence !== undefined
            ? stEv.missing_evidence
            : canUseTlEv
              ? tlEv?.missing_evidence
              : undefined;
      if (code || (Array.isArray(missing) && missing.length > 0)) {
        reason = reasonText(code, detail, t, missing);
      }
    }
    stageViews[stage] = {
      label: status ? baseView.label : t("tradeJourneys.detail.unknownStatus"),
      tone: baseView.tone,
      reason,
    };
  }

  const resolvedTimeline = items.map(ev => {
    const stage = ev.stage;
    if (
      stage === "risk_evaluation" &&
      (ev.stage_status === "rejected" || ev.submitted_to_broker === false || ev.order_status === "not_submitted")
    ) {
      const riskLabel = t("tradeJourneys.stageStatuses.riskRejected");
      const notSubLabel =
        ev.submitted_to_broker === false || ev.order_status === "not_submitted"
          ? ` · ${t("tradeJourneys.stageStatuses.notSubmitted")}`
          : "";
      const rawCode = String(ev.reason_code ?? "").trim();
      const isMissingReason =
        !rawCode ||
        rawCode === "reason_not_recorded" ||
        (EXPRESSION_CHOICE_CODES as readonly string[]).includes(rawCode);
      const effMissing =
        Array.isArray(ev.missing_evidence) && ev.missing_evidence.length > 0
          ? ev.missing_evidence
          : isMissingReason
            ? ["reject_reason"]
            : undefined;
      return {
        ...ev,
        displayStage: stage,
        displayStatusLabel: `${riskLabel}${notSubLabel}`,
        displayReason: reasonText(ev.reason_code || "reason_not_recorded", ev.reason_detail, t, effMissing),
      };
    }

    if (isReconEventFailure(ev)) {
      const stInfo = rawStages.reconciliation;
      const stEv = row?.stage_events?.reconciliation;
      const hydrationSource: ReconEvidenceCarrier | undefined = canHydrateReconTimelineEventFrom(ev, stInfo)
        ? stInfo
        : canHydrateReconTimelineEventFrom(ev, stEv)
          ? stEv
          : canHydrateReconTimelineEventFrom(ev, reconOutcome)
            ? reconOutcome
            : undefined;
      const evHasLocalPayload = hasLocalReconFailureAnalysisPayload(ev);
      const evKind = typeof ev.kind === "string" ? ev.kind : undefined;
      const mergedRecon: ReconciliationEvidenceInput = {
        kind:
          evKind ??
          (!evHasLocalPayload &&
          hydrationSource &&
          (reconOutcome?.kind === "reconciliation_deferred" || reconOutcome?.kind === "variance") &&
          areReconCausesCompatible(hydrationSource, reconOutcome)
            ? reconOutcome.kind
            : hydrationSource?.kind ?? undefined),
        classification:
          ev.classification !== undefined && ev.classification !== null
            ? ev.classification
            : hydrationSource?.classification,
        accounting_variance:
          ev.accounting_variance !== undefined && ev.accounting_variance !== null
            ? ev.accounting_variance
            : hydrationSource?.accounting_variance,
        comparison_completed:
          ev.comparison_completed !== undefined && ev.comparison_completed !== null
            ? ev.comparison_completed
            : hydrationSource?.comparison_completed,
        reason_code:
          ev.reason_code !== undefined && ev.reason_code !== null && String(ev.reason_code).trim() !== ""
            ? ev.reason_code
            : hydrationSource?.reason_code,
        reason_detail:
          ev.reason_detail !== undefined && ev.reason_detail !== null
            ? ev.reason_detail
            : hydrationSource?.reason_detail,
        discrepancies:
          Array.isArray(ev.discrepancies) && ev.discrepancies.length > 0
            ? ev.discrepancies
            : hydrationSource?.discrepancies,
        missing_evidence:
          Array.isArray(ev.missing_evidence) && ev.missing_evidence.length > 0
            ? ev.missing_evidence
            : evHasLocalPayload
              ? undefined
              : hydrationSource?.missing_evidence,
        unverified_reason_code:
          ev.unverified_reason_code !== undefined && ev.unverified_reason_code !== null
            ? ev.unverified_reason_code
            : evHasLocalPayload
              ? undefined
              : hydrationSource?.unverified_reason_code,
      };
      const reconView = reconciliationAnalysisView(mergedRecon, t);
      return {
        ...ev,
        displayStage: stage,
        displayStatusLabel: reconView.stageStatusLabel,
        displayReason: reconView.sentence,
      };
    }

    if (stage === "reconciliation") {
      const stInfo = rawStages.reconciliation;
      const stEv = row?.stage_events?.reconciliation;
      const passedDetail =
        ev.reason_detail !== undefined
          ? ev.reason_detail
          : canHydratePassedReconTimelineEventFrom(ev, stInfo)
            ? stInfo?.reason_detail
            : canHydratePassedReconTimelineEventFrom(ev, stEv)
              ? stEv?.reason_detail
              : undefined;
      const passedReason = passedReconChecksText(passedDetail, t);
      const effStatus =
        ev.stage_status ||
        ev.status ||
        (ev.event_type === "reconciliation_completed" || Boolean(passedReason) ? "succeeded" : undefined);
      const baseStatus = effStatus
        ? stageStatusView(effStatus, t, stage).label
        : t("tradeJourneys.detail.unknownStageStatus");
      const displayReason =
        passedReason ??
        (ev.reason_code || (Array.isArray(ev.missing_evidence) && ev.missing_evidence.length > 0)
          ? reasonText(ev.reason_code, ev.reason_detail, t, ev.missing_evidence)
          : undefined);
      return {
        ...ev,
        displayStage: stage,
        displayStatusLabel: baseStatus,
        displayReason,
      };
    }

    const baseStatus = ev.stage_status
      ? stageStatusView(ev.stage_status, t, stage).label
      : t("tradeJourneys.detail.unknownStageStatus");
    const displayReason =
      ev.reason_code || (Array.isArray(ev.missing_evidence) && ev.missing_evidence.length > 0)
        ? reasonText(ev.reason_code, ev.reason_detail, t, ev.missing_evidence)
        : undefined;
    return {
      ...ev,
      displayStage: stage,
      displayStatusLabel: baseStatus,
      displayReason,
    };
  });

  return { stages: rawStages, stageViews, timeline: resolvedTimeline };
}

/** Producers with a plain-name entry under `tradeJourneys.sources`. */
export const KNOWN_SOURCES = [
  "execution.paper_runtime",
  "broker.paper_sidecar",
  "reconciliation-drift.scheduled",
  "canonical.lifecycle_projector",
  "canonical.telemetry",
] as const;

/** A producer's plain name; "" (render nothing) when the source is missing or not one we can name. */
export function sourceText(source: string | null | undefined, t: T): string {
  if (!source || !(KNOWN_SOURCES as readonly string[]).includes(source)) return "";
  return t(`tradeJourneys.sources.${source.replaceAll(".", "_").replaceAll("-", "_")}`);
}

/** Row/page read_state in words; never the raw partial/degraded word. */
export function readStateText(state: string | null | undefined, t: T): string {
  const key = String(state || "").toLowerCase();
  return ["partial", "degraded", "unavailable"].includes(key)
    ? t(`tradeJourneys.readStates.${key}`)
    : t("tradeJourneys.readStates.other");
}
