import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { displayNumber, displayTime } from "./paperBookDisplay";
import * as tradingRoomBff from "@/lib/bff-v1/agora/tradingRoom";
import type {
  ShadowSettlementSourceKind,
  TradingDecisionEvent,
  TradingRoomShadowArm,
  TradingRoomShadowComparisonRead,
} from "@/lib/bff-v1/agora/tradingRoom";

function getBffExport<K extends keyof typeof tradingRoomBff>(
  key: K,
): (typeof tradingRoomBff)[K] | undefined {
  if (Object.prototype.hasOwnProperty.call(tradingRoomBff, key)) {
    return tradingRoomBff[key];
  }
  return undefined;
}

function localClassifySettlementSource(
  settlementSource: string | null | undefined,
  decisionDetail?: Record<string, unknown> | null,
): ShadowSettlementSourceKind {
  const raw = String(settlementSource ?? "")
    .trim()
    .toLowerCase();
  const obs = String(decisionDetail?.execution_observation_kind ?? "")
    .trim()
    .toLowerCase();
  if (
    raw.includes("proxy") ||
    raw.includes("paper") ||
    raw.includes("simulat") ||
    obs.includes("proxy") ||
    obs.includes("paper") ||
    obs.includes("simulat")
  ) {
    return "paper_proxy";
  }
  if (raw.includes("replay")) {
    return "market_data_replay";
  }
  if (
    raw === "declared_no_trade" ||
    raw.includes("no_trade") ||
    obs === "declared_no_trade"
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

// Settlement fractions and legacy pnl are return ratios; realized/unrealized P&L are amounts.
const PERCENT_FIELDS = new Set(["pnl", "underlying_return_pct", "gross_return_pct", "cost_pct", "return_pct", "max_drawdown_pct", "weight", "exposure", "confidence"]);
const MONEY_FIELDS = new Set(["realized_pnl", "unrealized_pnl", "decision_price", "entry_price", "exit_price", "benchmark_exit_price"]);
const TIME_FIELDS = new Set(["decision_time", "window_start_date", "window_end_date", "data_cutoff"]);
const ACTION_FIELDS = new Set(["action", "decision", "suggested_action", "trading_room_verdict"]);
const ACTIONS = new Set(["enter", "exit", "buy", "sell", "hold", "reduce", "add", "approve", "reject", "defer", "no_trade", "abstain"]);

function ShadowFields({ value, sourceLabel }: { value: unknown; sourceLabel: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || "zh-TW";
  if (value === null || value === undefined) return <>—</>;
  const record = typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const entries: [string, unknown][] = record ? Object.entries(record) : [["unknown", value]];
  const currency = typeof record?.currency === "string" && /^[A-Z]{3}$/.test(record.currency)
    ? record.currency : t("agora.tradingRoom.page.paperBook.currencyUnknown");
  let omitted = 0;
  const rows: { key: string; text: string }[] = [];
  for (const [key, val] of entries) {
    if (key === "available" || key === "unavailable_reason" || key === "currency") continue;
    let text: string | undefined;
    if (PERCENT_FIELDS.has(key) && typeof val === "number" && Number.isFinite(val)) {
      text = `${displayNumber(val * 100, locale)}%`;
    } else if (MONEY_FIELDS.has(key) && typeof val === "number" && Number.isFinite(val)) {
      text = `${displayNumber(val, locale)} ${currency}`;
    } else if (TIME_FIELDS.has(key) && displayTime(val, locale) !== "—") {
      text = displayTime(val, locale);
    } else if (ACTION_FIELDS.has(key) && typeof val === "string" && ACTIONS.has(val)) {
      text = t(`agora.tradingRoom.shadowComparison.actions.${val}`);
    } else if (["execution_observation_kind", "execution_display_label"].includes(key)) {
      text = sourceLabel;
    } else if (["verified", "execution_verified", "actual_fill_claimed"].includes(key) && typeof val === "boolean") {
      text = t(`agora.tradingRoom.shadowComparison.${val ? "yes" : "no"}`);
    } else if (key === "direction" && typeof val === "number" && [-1, 0, 1].includes(val)) {
      text = t(`agora.tradingRoom.page.paperBook.sides.${val > 0 ? "long" : val < 0 ? "short" : "flat"}`);
    } else if (["slippage_bps", "turnover", "window_sessions"].includes(key) && typeof val === "number" && Number.isFinite(val)) {
      text = t(`agora.tradingRoom.shadowComparison.units.${key}`, { value: displayNumber(val, locale) });
    } else if (key === "observation_window" && typeof val === "string" && /^\d+d$/.test(val)) {
      text = t("agora.tradingRoom.shadowComparison.units.window_sessions", { value: val.slice(0, -1) });
    } else if (key === "rationale" && typeof val === "string" && !/[{}]|\b[a-z]+(?:_[a-z0-9]+)+\b/i.test(val)) {
      text = val;
    }
    if (text === undefined) { omitted++; continue; }
    rows.push({ key, text });
  }
  return <>
    <dl>{rows.map(({ key, text }) => <div key={key}>
      <dt style={{ display: "inline" }}>{t(`agora.tradingRoom.shadowComparison.fields.${key}`)}: </dt>
      <dd style={{ display: "inline", margin: 0 }}>{text}</dd>
    </div>)}</dl>
    {omitted > 0 && <small>{t("agora.tradingRoom.shadowComparison.omittedFields", { count: omitted })}</small>}
    {rows.length === 0 && omitted === 0 && "—"}
  </>;
}

const DEFAULT_ARM_LABELS: Record<string, string> = {
  human_actual: "My decision (actual)",
  committee_variant: "Committee variant",
  trader: "My decision (Trader)",
  private_servant: "Private Servant suggestion",
  base_strategy: "Base strategy",
  institutional_view: "Institutional view",
};

export interface ShadowComparisonPanelProps {
  decisionId?: string | null;
  decisionEvents?: TradingDecisionEvent[];
  onSelectDecisionId?: (decisionId: string) => void;
  baseUrl?: string;
}

export function ShadowComparisonPanel({
  decisionId,
  decisionEvents = [],
  onSelectDecisionId,
  baseUrl,
}: ShadowComparisonPanelProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const initialDecisionId =
    (decisionId ?? decisionEvents[0]?.decision_event_id ?? "").trim();
  const [activeDecisionId, setActiveDecisionId] =
    useState<string>(initialDecisionId);
  const [draftId, setDraftId] = useState<string>(initialDecisionId);
  const [read, setRead] = useState<TradingRoomShadowComparisonRead | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (decisionId !== undefined) {
      const next = (decisionId ?? "").trim();
      setActiveDecisionId(next);
      setDraftId(next);
    }
  }, [decisionId]);

  useEffect(() => {
    if (decisionId !== undefined) return;
    setActiveDecisionId((prev) => {
      if (prev) return prev;
      const firstId = (decisionEvents[0]?.decision_event_id ?? "").trim();
      if (firstId) setDraftId(firstId);
      return firstId;
    });
  }, [decisionId, decisionEvents]);

  useEffect(() => {
    const cleanId = activeDecisionId.trim();
    if (!cleanId) {
      setLoading(false);
      setRead({ state: "empty", reason: "decision_id_required" });
      return;
    }

    const fetchShadow = getBffExport("getTradingRoomShadowComparison");
    if (typeof fetchShadow !== "function") {
      setLoading(false);
      setRead({ state: "empty", reason: "shadow_client_unconfigured" });
      return;
    }

    let active = true;
    setLoading(true);

    void fetchShadow(cleanId, baseUrl)
      .then((nextRead) => {
        if (!active) return;
        setRead(nextRead);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setRead({
          state: "unavailable",
          reason: "attribution_owner_unavailable",
        });
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeDecisionId, baseUrl]);

  function handleSelectDecision(nextId: string) {
    const clean = nextId.trim();
    setActiveDecisionId(clean);
    setDraftId(clean);
    onSelectDecisionId?.(clean);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleSelectDecision(draftId);
  }

  function renderSettlementLabel(arm: TradingRoomShadowArm): {
    kind: ShadowSettlementSourceKind;
    label: string;
  } {
    const kind =
      arm.settlement_source_kind ??
      localClassifySettlementSource(arm.settlement_source, arm.decision_detail);
    if (kind === "paper_proxy") {
      return {
        kind,
        label: t("agora.tradingRoom.shadowComparison.paperProxy", {
          defaultValue: "Paper proxy (not an actual fill)",
        }),
      };
    }
    if (kind === "market_data_replay") {
      return {
        kind,
        label: t("agora.tradingRoom.shadowComparison.marketDataReplay", {
          defaultValue: "Market data replay (not an actual fill)",
        }),
      };
    }
    if (kind === "declared_no_trade") {
      return {
        kind,
        label: t("agora.tradingRoom.shadowComparison.declaredNoTrade", {
          defaultValue: "Declared no trade",
        }),
      };
    }
    if (kind === "actual_fill") {
      return {
        kind,
        label: t("agora.tradingRoom.shadowComparison.actualFill", {
          defaultValue: "Actual fill (verified)",
        }),
      };
    }
    return {
      kind: "unsettled",
      label: t("agora.tradingRoom.shadowComparison.sourceUnknown", {
        defaultValue: "Settlement source unknown / unsettled",
      }),
    };
  }

  return (
    <section
      aria-label={t("agora.tradingRoom.shadowComparison.title", {
        defaultValue: "My Shadow Comparisons",
      })}
      data-advice-only="true"
      data-execution-authority="none"
      data-no-order-route-proof="agora_decision_support_only"
      data-testid="shadow-comparison-panel"
      style={{
        background: "#12161f",
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
              {t("agora.tradingRoom.shadowComparison.title", {
                defaultValue: "My Shadow Comparisons",
              })}
            </strong>
            <span
              data-testid="shadow-comparison-read-only"
              style={{
                background: "rgba(56,189,248,0.14)",
                border: "1px solid rgba(56,189,248,0.35)",
                borderRadius: 4,
                color: "#38bdf8",
                fontSize: 11,
                fontWeight: 600,
                padding: "1px 6px",
              }}
            >
              {t("agora.tradingRoom.shadowComparison.adviceOnlyBadge", {
                defaultValue: "Read-only · Does not place orders",
              })}
            </span>
          </div>
          <div style={{ color: "#8c96a6", fontSize: 12, marginTop: 2 }}>
            {t("agora.tradingRoom.shadowComparison.subtitle", {
              defaultValue:
                "Compare your decision, private servant suggestion, base strategy, and institutional view with settlement source labels.",
            })}
          </div>
        </div>

        <form
          data-testid="shadow-decision-form"
          onSubmit={handleSubmit}
          style={{ alignItems: "center", display: "flex", gap: 6 }}
        >
          <input
            aria-label={t("agora.tradingRoom.shadowComparison.decisionIdLabel", {
              defaultValue: "Decision ID",
            })}
            data-testid="shadow-decision-input"
            onChange={(e) => setDraftId(e.target.value)}
            placeholder={t("agora.tradingRoom.shadowComparison.decisionIdLabel", {
              defaultValue: "Decision ID",
            })}
            style={{
              background: "#171b22",
              border: "1px solid #2a2e38",
              borderRadius: 6,
              color: "#f0ece4",
              fontSize: 12,
              padding: "4px 8px",
            }}
            type="text"
            value={draftId}
          />
          <button
            data-testid="shadow-decision-load"
            style={{
              background: "#1a2030",
              border: "1px solid #2a2e38",
              borderRadius: 6,
              color: "#c5cad2",
              cursor: "pointer",
              fontSize: 12,
              padding: "4px 10px",
            }}
            type="submit"
          >
            {t("agora.tradingRoom.shadowComparison.load", {
              defaultValue: "Load comparison",
            })}
          </button>
        </form>
      </div>

      {decisionEvents.length > 0 && (
        <div
          data-testid="shadow-decision-selector"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 8,
          }}
        >
          {decisionEvents.map((ev) => {
            const isSelected = ev.decision_event_id === activeDecisionId;
            return (
              <button
                aria-pressed={isSelected}
                data-testid={`shadow-select-${ev.decision_event_id}`}
                key={ev.decision_event_id}
                onClick={() => handleSelectDecision(ev.decision_event_id)}
                style={{
                  background: isSelected ? "#e8b750" : "#171b22",
                  border: isSelected
                    ? "1px solid #e8b750"
                    : "1px solid #2a2e38",
                  borderRadius: 4,
                  color: isSelected ? "#111417" : "#c5cad2",
                  cursor: "pointer",
                  fontFamily: "monospace",
                  fontSize: 11,
                  fontWeight: isSelected ? 700 : 500,
                  padding: "2px 8px",
                }}
                type="button"
              >
                {ev.decision_event_id}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div
          aria-busy="true"
          data-testid="shadow-comparison-loading"
          style={{ color: "#8c96a6", padding: "8px 0" }}
        >
          {t("agora.tradingRoom.shadowComparison.loading", {
            defaultValue: "Loading shadow comparison…",
          })}
        </div>
      ) : !activeDecisionId || read === null || read.state === "empty" ? (
        <div
          data-reason={read?.state === "empty" ? read.reason : "decision_id_required"}
          data-testid="shadow-comparison-empty"
          style={{
            background: "#171b22",
            border: "1px solid #2a2e38",
            borderRadius: 6,
            color: "#8c96a6",
            padding: "10px 12px",
          }}
        >
          {read?.state === "empty" && read.reason === "no_decision_recorded"
            ? t("agora.tradingRoom.shadowComparison.comparisonStates.no_decision_recorded", {
                defaultValue: "No decision recorded for this event",
              })
            : t("agora.tradingRoom.shadowComparison.empty", {
                defaultValue:
                  "Select or enter a decision ID to view your shadow comparison.",
              })}
        </div>
      ) : read.state === "not_found" ? (
        <div
          data-testid="shadow-comparison-not-found"
          data-reason={read.reason}
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
            {t("agora.tradingRoom.shadowComparison.notFound", {
              id: activeDecisionId,
              defaultValue: `Shadow comparison for decision ${activeDecisionId} was not found.`,
            })}
          </div>
        </div>
      ) : read.state === "unavailable" ? (
        <div
          data-testid="shadow-comparison-unavailable"
          data-reason={read.reason}
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
            {t("agora.tradingRoom.shadowComparison.unavailable", {
              defaultValue: "Shadow comparison is currently unavailable.",
            })}
          </div>
        </div>
      ) : (
        <div data-testid="shadow-comparison-arms" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {read.data.comparison_state && (
            <div
              data-comparison-state={read.data.comparison_state}
              data-testid="shadow-comparison-state"
              style={{
                alignSelf: "flex-start",
                background:
                  read.data.comparison_state === "settled"
                    ? "rgba(34,197,94,0.14)"
                    : "rgba(232,183,80,0.12)",
                border:
                  read.data.comparison_state === "settled"
                    ? "1px solid rgba(34,197,94,0.35)"
                    : "1px solid rgba(232,183,80,0.35)",
                borderRadius: 4,
                color:
                  read.data.comparison_state === "settled" ? "#4ade80" : "#e8b750",
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
              }}
            >
              {t(
                `agora.tradingRoom.shadowComparison.comparisonStates.${read.data.comparison_state}`,
                {
                  defaultValue: read.data.comparison_state,
                },
              )}
            </div>
          )}
          {read.degraded && Object.keys(read.degraded).length > 0 && (
            <div
              data-testid="shadow-comparison-degraded"
              role="status"
              style={{
                background: "rgba(232,183,80,0.12)",
                border: "1px solid rgba(232,183,80,0.35)",
                borderRadius: 6,
                color: "#e8b750",
                fontSize: 12,
                padding: "6px 10px",
              }}
            >
              {t("agora.tradingRoom.shadowComparison.degraded", {
                defaultValue: "Partial shadow data",
              })}
              :{" "}
              <span style={{ fontFamily: "monospace" }}>
                {t("agora.tradingRoom.shadowComparison.omittedFields", { count: Object.keys(read.degraded).length })}
              </span>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            {read.data.arms.map((arm) => {
              const { kind, label } = renderSettlementLabel(arm);
              const detail = arm.decision_detail ?? {};
              const unavailReason =
                arm.unavailable_reason ??
                (detail.available === false
                  ? (detail.unavailable_reason as string | undefined)
                  : null);

              return (
                <div
                  data-actual-fill={kind === "actual_fill" ? "true" : "false"}
                  data-arm={arm.arm}
                  data-settlement-kind={kind}
                  data-testid={`shadow-arm-${arm.arm}`}
                  key={arm.arm}
                  style={{
                    background: "#171b22",
                    border: "1px solid #2a2e38",
                    borderRadius: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      alignItems: "center",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <strong style={{ fontSize: 13 }}>
                      {t(`agora.tradingRoom.shadowComparison.arms.${arm.arm}`, {
                        defaultValue: DEFAULT_ARM_LABELS[arm.arm] ?? t("agora.tradingRoom.shadowComparison.otherArm"),
                      })}
                    </strong>
                  </div>

                  <div>
                    <span
                      data-settlement-kind={kind}
                      data-testid={`shadow-arm-source-${arm.arm}`}
                      style={{
                        background:
                          kind === "actual_fill"
                            ? "rgba(34,197,94,0.14)"
                            : kind === "paper_proxy" ||
                                kind === "market_data_replay"
                              ? "rgba(232,183,80,0.14)"
                              : "#1e2638",
                        border:
                          kind === "actual_fill"
                            ? "1px solid rgba(34,197,94,0.4)"
                            : kind === "paper_proxy" ||
                                kind === "market_data_replay"
                              ? "1px solid rgba(232,183,80,0.4)"
                              : "1px solid #2e3a52",
                        borderRadius: 4,
                        color:
                          kind === "actual_fill"
                            ? "#4ade80"
                            : kind === "paper_proxy" ||
                                kind === "market_data_replay"
                              ? "#e8b750"
                              : "#c5cad2",
                        display: "inline-block",
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 6px",
                      }}
                    >
                      {label}
                    </span>
                  </div>

                  <div
                    data-testid={`shadow-arm-outcome-${arm.arm}`}
                    style={{ color: "#dce0e6", fontSize: 12 }}
                  >
                    <strong>
                      {t("agora.tradingRoom.shadowComparison.outcome", {
                        defaultValue: "Outcome",
                      })}
                      :
                    </strong>{" "}
                    <ShadowFields value={arm.outcome} sourceLabel={label} />
                  </div>

                  <div
                    style={{
                      color: "#8c96a6",
                      fontFamily: "monospace",
                      fontSize: 11,
                    }}
                  >
                    {t("agora.tradingRoom.shadowComparison.settledAt", {
                      defaultValue: "Settled at",
                    })}
                    : {displayTime(arm.settled_at, i18n.resolvedLanguage || "zh-TW")}
                  </div>

                  <div
                    data-testid={`shadow-arm-detail-${arm.arm}`}
                    style={{
                      color: "#9aa4b4",
                      fontSize: 11,
                      listStyle: "none",
                      margin: 0,
                      padding: 0,
                    }}
                  >
                    <ShadowFields value={detail} sourceLabel={label} />
                  </div>

                  {unavailReason ? (
                    <div
                      data-testid={`shadow-arm-unavailable-${arm.arm}`}
                      style={{
                        color: "#8c96a6",
                        fontFamily: "monospace",
                        fontSize: 11,
                      }}
                    >
                      {t("agora.tradingRoom.shadowComparison.unavailable")}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
