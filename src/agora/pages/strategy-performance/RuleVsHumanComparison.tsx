/**
 * RuleVsHumanComparison — V6 §15.5 "照規則 vs 人工干預".
 *
 * For each intervention the trader made, shows side by side:
 *   1. what the rule would have done (base_strategy arm / decision event suggestion)
 *   2. what the trader actually did (human_actual arm)
 *   3. the reason recorded for the intervention
 *   4. the realised result of the trader's decision
 *   5. the shadow outcome had the trader not intervened (base_strategy settlement)
 *
 * All values come from owner reads: the Strategy Performance projection
 * (interventions), the trader's decision events, and the Agora owner-scoped
 * shadow comparison route. Nothing is fabricated: a value the owners do not
 * report reads 未回報. Read-only; never offers an order action.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import type { InterventionRecord } from "@/lib/bff-v1/agora/performance";
import {
  getTradingRoomShadowComparison,
  type TradingDecisionEvent,
  type TradingRoomShadowArm,
  type TradingRoomShadowComparisonRead,
} from "@/lib/bff-v1/agora/tradingRoom";

const HUMAN_ARMS = ["human_actual", "trader"];
const RULE_ARMS = ["base_strategy"];

type ShadowState = { status: "loading" } | { status: "done"; read: TradingRoomShadowComparisonRead };

function findArm(read: TradingRoomShadowComparisonRead | undefined, names: string[]): TradingRoomShadowArm | null {
  if (!read || read.state !== "ok") return null;
  for (const name of names) {
    const arm = read.data.arms.find((item) => item.arm === name);
    if (arm) return arm;
  }
  return null;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function formatOutcome(outcome: unknown, missing: string): string {
  if (outcome === null || outcome === undefined || outcome === "") return missing;
  if (typeof outcome === "number") return Number.isFinite(outcome) ? outcome.toFixed(4) : missing;
  if (typeof outcome === "string") return outcome;
  if (typeof outcome === "object" && !Array.isArray(outcome)) {
    const entries = Object.entries(outcome as Record<string, unknown>).filter(([, value]) => value !== null && value !== undefined);
    if (entries.length === 0) return missing;
    return entries
      .map(([key, value]) => {
        if (typeof value === "number" && Number.isFinite(value)) {
          const shown = key.includes("pnl") || key.includes("return") ? `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%` : String(value);
          return `${key}: ${shown}`;
        }
        return `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`;
      })
      .join(" · ");
  }
  return missing;
}

function actionLabel(value: string | null, t: TFunction): string | null {
  if (!value) return null;
  return t(`agora.tradingRoom.decisionCard.choices.${value}`, { defaultValue: value });
}

/** Journey rows from the performance projection that may carry decision ids. */
export interface InterventionJourneyLink {
  evidence_refs: string[];
  decision_ids: string[];
}

/**
 * Resolve which of the trader's decision events an intervention refers to.
 * The intervention record has no structural decision link, so it is resolved
 * only through ids the owners actually report: the intervention's own
 * evidence refs / source id, or the decision ids of a journey row that shares
 * one of its evidence refs. No match means the intervention stays unlinked —
 * a link is never guessed from timing or ordering.
 */
export function interventionDecisionEventId(
  item: InterventionRecord,
  decisionEvents: TradingDecisionEvent[],
  journeys: InterventionJourneyLink[] = [],
): string | null {
  const known = new Set(decisionEvents.map((event) => event.decision_event_id));
  const direct = [item.source_id, ...(item.evidence_refs ?? [])];
  const viaJourney = journeys
    .filter((journey) => journey.evidence_refs.some((ref) => direct.includes(ref)))
    .flatMap((journey) => journey.decision_ids);
  const candidates = [...direct, ...viaJourney]
    .map((value) => (typeof value === "string" ? value.replace(/^decision_event:/, "").trim() : ""))
    .filter(Boolean);
  return candidates.find((candidate) => known.has(candidate)) ?? null;
}

export interface RuleVsHumanComparisonProps {
  interventions: InterventionRecord[];
  decisionEvents: TradingDecisionEvent[];
  journeys?: InterventionJourneyLink[];
  formatDateTime: (value: unknown) => string;
}

export function RuleVsHumanComparison({
  interventions,
  decisionEvents,
  journeys,
  formatDateTime,
}: RuleVsHumanComparisonProps): JSX.Element {
  const { t } = useTranslation();
  const missing = t("agora.performance.ruleVsHuman.notReported");
  const rows = useMemo(
    () => interventions.map((item) => ({ item, decisionEventId: interventionDecisionEventId(item, decisionEvents, journeys) })),
    [interventions, decisionEvents, journeys],
  );
  const decisionIds = useMemo(
    () => [...new Set(rows.map((row) => row.decisionEventId).filter((id): id is string => Boolean(id)))],
    [rows],
  );
  const [shadow, setShadow] = useState<Record<string, ShadowState>>({});

  useEffect(() => {
    let cancelled = false;
    setShadow(Object.fromEntries(decisionIds.map((id) => [id, { status: "loading" } as ShadowState])));
    for (const id of decisionIds) {
      getTradingRoomShadowComparison(id)
        .then((read) => {
          if (!cancelled) setShadow((current) => ({ ...current, [id]: { status: "done", read } }));
        })
        .catch(() => {
          if (!cancelled) {
            setShadow((current) => ({
              ...current,
              [id]: { status: "done", read: { state: "unavailable", reason: "attribution_owner_unavailable" } },
            }));
          }
        });
    }
    return () => { cancelled = true; };
  }, [decisionIds]);

  if (interventions.length === 0) {
    return <p className="text-xs italic text-[#8c96a6]">{t("agora.performance.ruleVsHuman.noInterventions")}</p>;
  }

  return (
    <div className="flex flex-col gap-3" data-testid="rule-vs-human-comparison">
      {rows.map(({ item, decisionEventId }) => {
        const event = decisionEvents.find((candidate) => candidate.decision_event_id === decisionEventId) ?? null;
        const state = decisionEventId ? shadow[decisionEventId] : undefined;
        const read = state?.status === "done" ? state.read : undefined;
        const humanArm = findArm(read, HUMAN_ARMS);
        const ruleArm = findArm(read, RULE_ARMS);
        const humanDetail = humanArm?.decision_detail ?? {};
        const ruleDetail = ruleArm?.decision_detail ?? {};
        const linked = Boolean(decisionEventId);

        const ruleAction =
          actionLabel(text(ruleDetail.suggested_action) ?? text(ruleDetail.decision), t) ??
          (event ? `${t(`agora.tradingRoom.page.eventKinds.${event.event_kind}`, { defaultValue: event.event_kind })} · ${event.subject.symbol} · ${event.suggested_action}` : null);
        const humanAction =
          actionLabel(text(humanDetail.decision) ?? text(humanDetail.trading_room_verdict), t) ??
          text(item.kind);
        const reason =
          text(humanDetail.rationale) ?? text(humanDetail.reason) ?? text((item as unknown as Record<string, unknown>).reason);
        const pending = read?.state === "ok" && read.data.comparison_state === "pending_settlement";
        const result = humanArm ? formatOutcome(humanArm.outcome, pending ? t("agora.tradingRoom.shadowComparison.comparisonStates.pending_settlement") : missing) : missing;
        const shadowOutcome = ruleArm ? formatOutcome(ruleArm.outcome, pending ? t("agora.tradingRoom.shadowComparison.comparisonStates.pending_settlement") : missing) : missing;

        const cells: Array<{ key: string; label: string; value: string; testId: string }> = [
          { key: "rule", label: t("agora.performance.ruleVsHuman.rule"), value: ruleAction ?? missing, testId: "rule" },
          { key: "human", label: t("agora.performance.ruleVsHuman.human"), value: humanAction ?? missing, testId: "human" },
          { key: "reason", label: t("agora.performance.ruleVsHuman.reason"), value: reason ?? missing, testId: "reason" },
          { key: "result", label: t("agora.performance.ruleVsHuman.result"), value: result, testId: "result" },
          { key: "shadow", label: t("agora.performance.ruleVsHuman.shadowOutcome"), value: shadowOutcome, testId: "shadow" },
        ];

        return (
          <article
            className="rounded-xl border border-[#2a2e38] bg-[#101318]/50 p-3"
            data-testid={`rule-vs-human-${item.intervention_id}`}
            key={item.intervention_id}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#8c96a6]">
              <span>
                {formatDateTime(item.occurred_at)}
                {decisionEventId ? ` · ${t("agora.performance.ruleVsHuman.decisionEvent", { id: decisionEventId })}` : ""}
              </span>
              <span className="rounded border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-sky-200">{item.status}</span>
            </div>
            {state?.status === "loading" ? (
              <p className="text-xs text-[#8c96a6]" role="status">{t("agora.performance.ruleVsHuman.loading")}</p>
            ) : null}
            {!linked ? (
              <p className="mb-2 text-xs text-amber-100/85" data-testid={`rule-vs-human-${item.intervention_id}-unlinked`}>
                {t("agora.performance.ruleVsHuman.unlinked")}
              </p>
            ) : null}
            <dl className="grid grid-cols-1 gap-2 md:grid-cols-5">
              {cells.map((cell) => (
                <div
                  className={cell.key === "human" ? "rounded-lg border border-amber-400/30 bg-amber-400/5 p-2" : "rounded-lg border border-[#2a2e38] bg-[#171b22] p-2"}
                  data-testid={`rule-vs-human-${item.intervention_id}-${cell.testId}`}
                  key={cell.key}
                >
                  <dt className="text-[10px] font-semibold text-[#8c96a6]">{cell.label}</dt>
                  <dd className={cell.value === missing ? "mt-1 text-xs italic text-[#8c96a6]" : "mt-1 break-words text-xs text-[#f0ece4]"}>{cell.value}</dd>
                </div>
              ))}
            </dl>
          </article>
        );
      })}
    </div>
  );
}

export default RuleVsHumanComparison;
