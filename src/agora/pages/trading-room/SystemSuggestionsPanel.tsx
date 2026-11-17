import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as tradingRoomBff from "@/lib/bff-v1/agora/tradingRoom";
import type {
  TradingDecisionEvent,
  TradingRoomSystemSuggestion,
  TradingRoomSystemSuggestionsData,
  TradingRoomSystemSuggestionsQuery,
  TradingRoomSystemSuggestionsRead,
} from "@/lib/bff-v1/agora/tradingRoom";

const LOCAL_REJECTED_OR_LUCK = new Set([
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

const LOCAL_UNVALIDATED_PENDING = new Set([
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

const LOCAL_POSITIVE_VALIDATED = new Set([
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

function hasForbiddenStatusToken(value: unknown): boolean {
  if (typeof value === "string") {
    const clean = value.trim().toLowerCase();
    return (
      LOCAL_REJECTED_OR_LUCK.has(clean) || LOCAL_UNVALIDATED_PENDING.has(clean)
    );
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasForbiddenStatusToken(entry));
  }
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    for (const k of [
      "validation_status",
      "status",
      "verdict",
      "outcome",
      "classification",
      "review_state",
      "hypothesis_status",
    ]) {
      if (hasForbiddenStatusToken(rec[k])) return true;
    }
  }
  return false;
}

function isSuggestionStrictlyValidated(item: TradingRoomSystemSuggestion): boolean {
  const status = String(item.validation_status ?? "").trim().toLowerCase();
  if (
    !status ||
    LOCAL_REJECTED_OR_LUCK.has(status) ||
    LOCAL_UNVALIDATED_PENDING.has(status) ||
    !LOCAL_POSITIVE_VALIDATED.has(status)
  ) {
    return false;
  }
  if (
    hasForbiddenStatusToken(item) ||
    hasForbiddenStatusToken(item.evidence) ||
    hasForbiddenStatusToken(item.evidence?.hypothesis_validation) ||
    hasForbiddenStatusToken(item.evidence?.structured_payload)
  ) {
    return false;
  }
  const hasValidationRef = Boolean(
    (item.validation_result_id && item.validation_result_id.trim()) ||
      (item.links?.validation_result && item.links.validation_result.trim()),
  );
  const hasEvidence = Boolean(
    (Array.isArray(item.evidence_refs) && item.evidence_refs.length > 0) ||
      (item.evidence && Object.keys(item.evidence).length > 0),
  );
  return hasValidationRef && hasEvidence;
}

function getBffExport<K extends keyof typeof tradingRoomBff>(
  key: K,
): (typeof tradingRoomBff)[K] | undefined {
  if (Object.prototype.hasOwnProperty.call(tradingRoomBff, key)) {
    return tradingRoomBff[key];
  }
  return undefined;
}

function formatEvidenceMetrics(evidence: Record<string, unknown>): string[] {
  const chips: string[] = [];
  const metrics =
    evidence.validation_metrics &&
    typeof evidence.validation_metrics === "object" &&
    !Array.isArray(evidence.validation_metrics)
      ? (evidence.validation_metrics as Record<string, unknown>)
      : {};
  const combined: Record<string, unknown> = { ...metrics, ...evidence };

  for (const key of [
    "effect_bps",
    "p_value",
    "sample_size",
    "sharpe_ratio",
    "oos_sharpe",
    "confidence",
    "review_state",
    "direction",
  ]) {
    const val = combined[key];
    if (typeof val === "number" || typeof val === "string") {
      chips.push(`${key}: ${String(val)}`);
    }
  }
  if (
    combined.luck_interval &&
    typeof combined.luck_interval === "object" &&
    !Array.isArray(combined.luck_interval)
  ) {
    const li = combined.luck_interval as Record<string, unknown>;
    if (li.low !== undefined && li.high !== undefined) {
      chips.push(`luck_interval: [${String(li.low)}, ${String(li.high)}]`);
    }
  } else if (Array.isArray(combined.luck_interval) && combined.luck_interval.length >= 2) {
    chips.push(
      `luck_interval: [${String(combined.luck_interval[0])}, ${String(combined.luck_interval[1])}]`,
    );
  }
  return chips;
}

export interface SystemSuggestionsPanelProps {
  decisionEvent?: TradingDecisionEvent | null;
  decisionEventId?: string | null;
  strategyId?: string;
  symbol?: string;
  strategyFamily?: string;
  eventKind?: string;
  action?: string;
  regimeRef?: string;
  baseUrl?: string;
}

export function SystemSuggestionsPanel({
  decisionEvent,
  decisionEventId,
  strategyId,
  symbol,
  strategyFamily,
  eventKind,
  action,
  regimeRef,
  baseUrl,
}: SystemSuggestionsPanelProps): JSX.Element {
  const { t } = useTranslation();
  const effectiveDecisionEventId =
    (decisionEventId ?? decisionEvent?.decision_event_id ?? "").trim() || null;
  const effectiveStrategyId =
    (strategyId ?? decisionEvent?.strategy_id ?? "").trim() || undefined;
  const effectiveSymbol =
    (symbol ?? decisionEvent?.subject?.symbol ?? "").trim() || undefined;
  const effectiveEventKind =
    (eventKind ?? decisionEvent?.event_kind ?? "").trim() || undefined;
  const effectiveAction =
    (action ?? decisionEvent?.suggested_action ?? "").trim() || undefined;

  const [read, setRead] = useState<TradingRoomSystemSuggestionsRead | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshSeq, setRefreshSeq] = useState<number>(0);

  useEffect(() => {
    const fetchDecisionSuggestions = getBffExport(
      "getDecisionEventSystemSuggestions",
    );
    const fetchSuggestions = getBffExport("getTradingRoomSystemSuggestions");

    if (
      typeof fetchDecisionSuggestions !== "function" &&
      typeof fetchSuggestions !== "function"
    ) {
      setLoading(false);
      setRead({
        state: "empty",
        data: {
          advice_only: true,
          count: 0,
          decision_event_id: effectiveDecisionEventId,
          environment_ceiling: "paper",
          execution_authority: "none",
          items: [],
          no_order_route_proof: "agora_decision_support_only",
          read_only: true,
          suggestions: [],
        },
      });
      return;
    }

    let active = true;
    setLoading(true);

    const query: TradingRoomSystemSuggestionsQuery = {
      decision_event_id: effectiveDecisionEventId ?? undefined,
      strategy_id: effectiveStrategyId,
      symbol: effectiveSymbol,
      strategy_family: strategyFamily,
      event_kind: effectiveEventKind,
      action: effectiveAction,
      regime_ref: regimeRef,
    };

    const hasExplicitFilterOverrides = Boolean(
      strategyFamily || regimeRef || (!effectiveDecisionEventId && (effectiveStrategyId || effectiveSymbol || effectiveEventKind || effectiveAction)),
    );

    const requestPromise =
      effectiveDecisionEventId &&
      !hasExplicitFilterOverrides &&
      typeof fetchDecisionSuggestions === "function"
        ? fetchDecisionSuggestions(effectiveDecisionEventId, baseUrl)
        : typeof fetchSuggestions === "function"
          ? fetchSuggestions(query, baseUrl)
          : fetchDecisionSuggestions!(effectiveDecisionEventId ?? "", baseUrl);

    void requestPromise
      .then((nextRead) => {
        if (!active) return;
        if (nextRead.state === "ok" || nextRead.state === "empty") {
          const rawSuggestions =
            nextRead.data.suggestions ?? nextRead.data.items ?? [];
          const filtered = rawSuggestions.filter(isSuggestionStrictlyValidated);
          const sanitizedData: TradingRoomSystemSuggestionsData = {
            ...nextRead.data,
            advice_only: true,
            read_only: true,
            execution_authority: "none",
            environment_ceiling: "paper",
            no_order_route_proof: "agora_decision_support_only",
            items: filtered,
            suggestions: filtered,
            count: filtered.length,
          };
          if (filtered.length === 0) {
            setRead({
              state: "empty",
              data: sanitizedData,
              reason: nextRead.state === "empty" ? nextRead.reason : undefined,
            });
          } else {
            setRead({ state: "ok", data: sanitizedData });
          }
        } else {
          setRead(nextRead);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setRead({
          state: "unavailable",
          reason: "institutional_knowledge_unavailable",
        });
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    baseUrl,
    effectiveAction,
    effectiveDecisionEventId,
    effectiveEventKind,
    effectiveStrategyId,
    effectiveSymbol,
    refreshSeq,
    regimeRef,
    strategyFamily,
  ]);

  const validatedItems =
    read && (read.state === "ok" || read.state === "empty")
      ? (read.data.suggestions ?? read.data.items ?? []).filter(
          isSuggestionStrictlyValidated,
        )
      : [];

  return (
    <section
      aria-label={t("agora.tradingRoom.suggestions.title", {
        defaultValue: "Validated System Suggestions",
      })}
      data-advice-only="true"
      data-execution-authority="none"
      data-no-order-route-proof="agora_decision_support_only"
      data-testid="system-suggestions-panel"
      style={{
        background: "#141821",
        borderTop: "1px solid #2a2e38",
        color: "#f0ece4",
        fontSize: 13,
        padding: "12px 16px",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div>
          <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
            <strong style={{ fontSize: 13 }}>
              {t("agora.tradingRoom.suggestions.title", {
                defaultValue: "Validated System Suggestions",
              })}
            </strong>
            <span
              data-testid="system-suggestions-advice-only"
              style={{
                background: "rgba(232,183,80,0.14)",
                border: "1px solid rgba(232,183,80,0.35)",
                borderRadius: 4,
                color: "#e8b750",
                fontSize: 11,
                fontWeight: 600,
                padding: "1px 6px",
              }}
            >
              {t("agora.tradingRoom.suggestions.adviceOnlyBadge", {
                defaultValue: "Advice only · Does not place orders",
              })}
            </span>
            <span
              style={{
                color: "#8c96a6",
                fontFamily: "monospace",
                fontSize: 11,
              }}
            >
              agora_decision_support_only
            </span>
          </div>
          <div style={{ color: "#8c96a6", fontSize: 12, marginTop: 2 }}>
            {t("agora.tradingRoom.suggestions.subtitle", {
              defaultValue:
                "Institutional findings, endorsed lessons, and validated strategy facts relevant to the current decision.",
            })}
          </div>
        </div>
        <button
          data-testid="system-suggestions-refresh"
          onClick={() => setRefreshSeq((prev) => prev + 1)}
          style={{
            background: "#1a2030",
            border: "1px solid #2a2e38",
            borderRadius: 6,
            color: "#c5cad2",
            cursor: "pointer",
            fontSize: 12,
            padding: "4px 10px",
          }}
          type="button"
        >
          {t("agora.tradingRoom.suggestions.refresh", {
            defaultValue: "Refresh suggestions",
          })}
        </button>
      </div>

      {loading ? (
        <div
          aria-busy="true"
          data-testid="system-suggestions-loading"
          style={{ color: "#8c96a6", padding: "8px 0" }}
        >
          {t("agora.tradingRoom.suggestions.loading", {
            defaultValue: "Loading validated system suggestions…",
          })}
        </div>
      ) : read?.state === "unavailable" ? (
        <div
          data-testid="system-suggestions-unavailable"
          role="status"
          style={{
            background: "#231418",
            border: "1px solid #5c2b33",
            borderRadius: 6,
            color: "#f87171",
            padding: "10px 12px",
          }}
        >
          <div>
            {t("agora.tradingRoom.suggestions.unavailable", {
              defaultValue: "System suggestions are currently unavailable.",
            })}
          </div>
          <div
            style={{
              color: "#fca5a5",
              fontFamily: "monospace",
              fontSize: 12,
              marginTop: 4,
            }}
          >
            {read.owner ? `owner: ${read.owner} · ` : ""}
            reason: {read.reason}
          </div>
        </div>
      ) : read?.state === "not_found" ? (
        <div
          data-testid="system-suggestions-not-found"
          role="status"
          style={{
            background: "#1a2030",
            border: "1px solid #2a2e38",
            borderRadius: 6,
            color: "#c5cad2",
            padding: "10px 12px",
          }}
        >
          <div>
            {t("agora.tradingRoom.suggestions.notFound", {
              id: effectiveDecisionEventId ?? "unknown",
              defaultValue: `Decision event ${effectiveDecisionEventId ?? "unknown"} was not found.`,
            })}
          </div>
          <div
            style={{
              color: "#8c96a6",
              fontFamily: "monospace",
              fontSize: 12,
              marginTop: 4,
            }}
          >
            reason: {read.reason}
          </div>
        </div>
      ) : validatedItems.length === 0 ? (
        <div
          data-testid="system-suggestions-empty"
          style={{
            background: "#171b22",
            border: "1px solid #2a2e38",
            borderRadius: 6,
            color: "#8c96a6",
            padding: "10px 12px",
          }}
        >
          <div>
            {t("agora.tradingRoom.suggestions.empty", {
              defaultValue:
                "No validated system suggestions match the current decision.",
            })}
          </div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            {t("agora.tradingRoom.suggestions.emptyFilteredNote", {
              defaultValue:
                "Unvalidated and luck_or_unsupported hypotheses are excluded.",
            })}
          </div>
        </div>
      ) : (
        <div
          data-testid="system-suggestions-list"
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          {validatedItems.map((s) => {
            const metricChips = formatEvidenceMetrics(s.evidence ?? {});
            return (
              <article
                data-fact-kind={s.fact_kind}
                data-suggestion-id={s.suggestion_id}
                data-testid={`system-suggestion-${s.suggestion_id}`}
                data-validation-status={s.validation_status}
                key={s.suggestion_id}
                style={{
                  background: "#171b22",
                  border: "1px solid #2a2e38",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{s.title}</div>
                  <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <span
                      data-testid={`suggestion-fact-kind-${s.suggestion_id}`}
                      style={{
                        background: "#1e2638",
                        border: "1px solid #2e3a52",
                        borderRadius: 4,
                        color: "#c5cad2",
                        fontSize: 11,
                        padding: "1px 6px",
                      }}
                    >
                      {t(`agora.tradingRoom.suggestions.factKinds.${s.fact_kind}`, {
                        defaultValue: s.fact_kind,
                      })}
                    </span>
                    <span
                      data-testid={`suggestion-validation-status-${s.suggestion_id}`}
                      style={{
                        background: "rgba(34,197,94,0.14)",
                        border: "1px solid rgba(34,197,94,0.4)",
                        borderRadius: 4,
                        color: "#4ade80",
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "1px 6px",
                      }}
                    >
                      {t("agora.tradingRoom.suggestions.validationStatus", {
                        defaultValue: "Validation status",
                      })}
                      : {s.validation_status}
                    </span>
                    {s.component ? (
                      <span
                        style={{
                          background: "#1a2030",
                          border: "1px solid #2a2e38",
                          borderRadius: 4,
                          color: "#8c96a6",
                          fontSize: 11,
                          padding: "1px 6px",
                        }}
                      >
                        {t("agora.tradingRoom.suggestions.component", {
                          defaultValue: "Component",
                        })}
                        : {s.component}
                      </span>
                    ) : null}
                    <span
                      data-testid={`suggestion-relevance-${s.suggestion_id}`}
                      style={{
                        color: "#8c96a6",
                        fontFamily: "monospace",
                        fontSize: 11,
                      }}
                    >
                      {t("agora.tradingRoom.suggestions.relevance", {
                        defaultValue: "Relevance",
                      })}
                      : {(s.relevance_score * 100).toFixed(0)}%
                      {s.relevance_reasons.length > 0
                        ? ` (${s.relevance_reasons.join(", ")})`
                        : ""}
                    </span>
                  </div>
                </div>

                <p style={{ color: "#dce0e6", margin: "6px 0" }}>
                  {s.suggestion || s.summary}
                </p>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                     fontSize: 12,
                    gap: 12,
                    marginTop: 6,
                  }}
                >
                  <div
                    data-testid={`suggestion-validation-result-${s.suggestion_id}`}
                    style={{ color: "#c5cad2" }}
                  >
                    <strong>
                      {t("agora.tradingRoom.suggestions.validationResult", {
                        defaultValue: "Validation result",
                      })}
                      :
                    </strong>{" "}
                    <span style={{ fontFamily: "monospace" }}>
                      {s.validation_result_id ?? "—"}
                    </span>
                    {s.links.validation_result ? (
                      <>
                        {" · "}
                        <a
                          data-testid={`suggestion-validation-link-${s.suggestion_id}`}
                          href={s.links.validation_result}
                          rel="noreferrer"
                          style={{ color: "#e8b750", fontFamily: "monospace" }}
                        >
                          {s.links.validation_result}
                        </a>
                      </>
                    ) : null}
                  </div>

                  {(s.attribution_record_id || s.links.attribution_record) && (
                    <div
                      data-testid={`suggestion-attribution-record-${s.suggestion_id}`}
                      style={{ color: "#c5cad2" }}
                    >
                      <strong>
                        {t("agora.tradingRoom.suggestions.attributionRecord", {
                          defaultValue: "Attribution record",
                        })}
                        :
                      </strong>{" "}
                      <span style={{ fontFamily: "monospace" }}>
                        {s.attribution_record_id ?? "—"}
                      </span>
                      {s.links.attribution_record ? (
                        <>
                          {" · "}
                          <a
                            data-testid={`suggestion-attribution-link-${s.suggestion_id}`}
                            href={s.links.attribution_record}
                            rel="noreferrer"
                            style={{ color: "#e8b750", fontFamily: "monospace" }}
                          >
                            {s.links.attribution_record}
                          </a>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>

                {metricChips.length > 0 && (
                  <div
                    data-testid={`suggestion-evidence-metrics-${s.suggestion_id}`}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginTop: 6,
                    }}
                  >
                    {metricChips.map((chip) => (
                      <span
                        key={chip}
                        style={{
                          background: "#12161f",
                          border: "1px solid #2a2e38",
                          borderRadius: 4,
                          color: "#9aa4b4",
                          fontFamily: "monospace",
                          fontSize: 11,
                          padding: "1px 6px",
                        }}
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}

                {s.evidence_refs.length > 0 && (
                  <ul
                    data-testid={`suggestion-evidence-refs-${s.suggestion_id}`}
                    style={{
                      color: "#8c96a6",
                      fontSize: 12,
                      listStyle: "none",
                      margin: "6px 0 0",
                      padding: 0,
                    }}
                  >
                    {s.evidence_refs.map((ref) => (
                      <li
                        key={`${ref.ref_type}:${ref.ref_id}`}
                        style={{ padding: "2px 0" }}
                      >
                        <span style={{ fontFamily: "monospace", color: "#c5cad2" }}>
                          [{ref.ref_type}] {ref.ref_id}
                        </span>
                        {ref.summary ? ` — ${ref.summary}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
