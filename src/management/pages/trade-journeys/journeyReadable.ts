import { statusLabel, statusTone, type EnumTone } from "@/lib/enumLabels";
import type { JourneyOutcome, JourneyRow } from "@/lib/bff-v1/tradeJourneys";

type T = (key: string, options?: Record<string, unknown>) => string;

/** Stages 1-6 are minted before a journey exists; their absence is lineage, not an operator problem. */
export const UPSTREAM_STAGES = ["research_rationale", "strategy_candidate", "candidate_evaluation", "promotion_decision", "capital_binding", "deployment_runtime"];

/** Reason codes with zh-TW/en-US copy under `tradeJourneys.reasons`. */
export const KNOWN_REASON_CODES = [
  "insufficient_cash", "insufficient_buying_power", "insufficient_initial_margin", "insufficient_position", "kill_switch",
  "hold_signal", "partially_filled",
  "runtime_unhealthy_at_reconciliation", "reconciliation_identity_unverified", "reconciliation_check_failed",
  "broker_record_missing", "broker_fill_mismatch", "position_variance", "cash_variance", "broker_unavailable_at_reconciliation",
  "reason_not_recorded",
] as const;

/** Expression-policy choice codes: how the order was expressed, not why it was rejected. */
export const EXPRESSION_CHOICE_CODES = ["long_cash", "long_lever", "short_via_future", "close_leg"] as const;

export function formatAmount(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 });
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
  if (side && row.quantity != null && row.quantity > 0) parts.push(t("tradeJourneys.quantityShares", { quantity: formatAmount(row.quantity) }));
  return parts.join(" ");
}

type Detail = Record<string, unknown>;
const asRecord = (value: unknown): Detail | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Detail : undefined;

export function reasonText(code: string | null | undefined, detail: JourneyOutcome["reason_detail"], t: T): string {
  if (!code) return "";
  // Expression-policy choice codes (long_cash, long_lever, short_via_future, close_leg) are never a rejection reason.
  if ((EXPRESSION_CHOICE_CODES as readonly string[]).includes(code)) return t("tradeJourneys.reasons.reason_not_recorded");
  if (!(KNOWN_REASON_CODES as readonly string[]).includes(code)) return t("tradeJourneys.reasons.unknown", { code });
  const record = asRecord(detail);
  const params = record
    ? { required: formatAmount(record.required), available: formatAmount(record.available), limit: formatAmount(record.limit), holding: formatAmount(record.holding_quantity), requested: formatAmount(record.requested_quantity) }
    : undefined;
  // Numbers are only worth a sentence when the producer sent them.
  if (params && record?.required != null && record?.available != null && (code === "insufficient_cash" || code === "insufficient_buying_power" || code === "insufficient_initial_margin")) {
    return t(`tradeJourneys.reasons.${code}Detail`, params);
  }
  if (params && code === "insufficient_position" && record?.holding_quantity != null && record?.requested_quantity != null) {
    return t("tradeJourneys.reasons.insufficient_positionDetail", params);
  }
  return t(`tradeJourneys.reasons.${code}`);
}

/** Names of the non-ok checks of a reconciliation `reason_detail`, in words. */
export function failedChecks(detail: JourneyOutcome["reason_detail"], t: T): string[] {
  if (!Array.isArray(detail)) return [];
  return detail
    .filter(item => item && String(item.status ?? "failed").toLowerCase() !== "ok" && String(item.status ?? "").toLowerCase() !== "passed")
    .map(item => String(item.check ?? ""))
    .filter(Boolean)
    .map(check => t(`tradeJourneys.checks.${check}`, { defaultValue: check }));
}

export type OutcomeTone = "gray" | "red" | "amber" | "neutral";
export interface OutcomeView { kind: JourneyOutcome["kind"]; tone: OutcomeTone; badge?: string; sentence: string }

/** One plain sentence for the status cell; undefined when the row carries no outcome worth replacing the status badge for. */
export function outcomeView(row: JourneyRow, t: T): OutcomeView | undefined {
  const outcome = row.outcome;
  if (!outcome || outcome.kind === "normal") return undefined;
  const reason = reasonText(outcome.reason_code, outcome.reason_detail, t);
  switch (outcome.kind) {
    case "no_trade":
      return { kind: outcome.kind, tone: "gray", badge: t("tradeJourneys.outcome.noTrade"), sentence: reason };
    case "rejected":
      return { kind: outcome.kind, tone: "red", sentence: t("tradeJourneys.outcome.rejected", { reason }) };
    case "reconciliation_deferred":
      return { kind: outcome.kind, tone: "amber", badge: t("tradeJourneys.outcome.deferred"), sentence: reason };
    case "variance": {
      const checks = failedChecks(outcome.reason_detail, t);
      return { kind: outcome.kind, tone: "amber", sentence: checks.length ? t("tradeJourneys.outcome.varianceChecks", { checks: checks.join("、") }) : t("tradeJourneys.outcome.variance", { reason }) };
    }
    case "open":
      return reason ? { kind: outcome.kind, tone: "neutral", sentence: reason } : undefined;
    default:
      return undefined;
  }
}

/** BFF hrefs are app-relative (`/incidents/x`, `/personas/y`); the management shell mounts them under /management. */
export function nextStepHref(href: string): string {
  if (!href.startsWith("/") || href.startsWith("/management/")) return href;
  return `/management${href}`;
}

export const KNOWN_ACTION_CODES = ["review_open_incident", "review_cash_and_risk_limits", "review_reconciliation_variance"] as const;

/** The BFF sends next_step.action_needed as a code; show words, and name the code when it is unknown. */
export function actionText(code: string, t: T): string {
  if ((KNOWN_ACTION_CODES as readonly string[]).includes(code)) return t(`tradeJourneys.actions.${code}`);
  return t("tradeJourneys.actions.unknown", { code });
}

/** Stage and timeline statuses in words and tone, through the shared enum helper. */
export function stageStatusView(status: string | null | undefined, t: T): { label: string; tone: EnumTone } {
  return { label: statusLabel(status, t), tone: statusTone(status) };
}

/** Producers with a plain-name entry under `tradeJourneys.sources`. */
export const KNOWN_SOURCES = ["execution.paper_runtime", "broker.paper_sidecar", "reconciliation-drift.scheduled", "canonical.lifecycle_projector", "canonical.telemetry"] as const;

/** A producer's plain name; "" (render nothing) when the source is missing or not one we can name. */
export function sourceText(source: string | null | undefined, t: T): string {
  if (!source || !(KNOWN_SOURCES as readonly string[]).includes(source)) return "";
  return t(`tradeJourneys.sources.${source.replaceAll(".", "_").replaceAll("-", "_")}`);
}

/** Row/page read_state in words; never the raw partial/degraded word. */
export function readStateText(state: string | null | undefined, t: T): string {
  const key = String(state || "").toLowerCase();
  return ["partial", "degraded", "unavailable"].includes(key) ? t(`tradeJourneys.readStates.${key}`) : t("tradeJourneys.readStates.other");
}
