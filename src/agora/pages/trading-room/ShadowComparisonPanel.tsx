import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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

function localSanitizeExecutionLabel(
  label: unknown,
  kind: ShadowSettlementSourceKind,
): string {
  const text = typeof label === "string" ? label.trim() : "";
  if (!text) return "—";
  if (kind === "actual_fill") return text;
  const lower = text.toLowerCase();
  const claimsActualFill =
    (text.includes("實際成交") && !text.includes("非實際成交")) ||
    (lower.includes("actual fill") && !lower.includes("not an actual fill"));
  if (claimsActualFill) {
    return "交易員決策（紙上代理）";
  }
  return text;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

const DEFAULT_ARM_LABELS: Record<string, string> = {
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
  const { t } = useTranslation();
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
          data-testid="shadow-comparison-empty"
          style={{
            background: "#171b22",
            border: "1px solid #2a2e38",
            borderRadius: 6,
            color: "#8c96a6",
            padding: "10px 12px",
          }}
        >
          {t("agora.tradingRoom.shadowComparison.empty", {
            defaultValue:
              "Select or enter a decision ID to view your shadow comparison.",
          })}
        </div>
      ) : read.state === "not_found" ? (
        <div
          data-testid="shadow-comparison-not-found"
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
      ) : read.state === "unavailable" ? (
        <div
          data-testid="shadow-comparison-unavailable"
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
          <div
            style={{
              color: "#fca5a5",
              fontFamily: "monospace",
              fontSize: 12,
              marginTop: 4,
            }}
          >
            reason: {read.reason}
          </div>
        </div>
      ) : (
        <div data-testid="shadow-comparison-arms" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                {Object.entries(read.degraded)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ")}
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
                        defaultValue: DEFAULT_ARM_LABELS[arm.arm] ?? arm.arm,
                      })}
                    </strong>
                    <span
                      style={{
                        color: "#8c96a6",
                        fontFamily: "monospace",
                        fontSize: 11,
                      }}
                    >
                      {arm.arm}
                    </span>
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
                      {arm.settlement_source ? ` · ${arm.settlement_source}` : ""}
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
                    <span style={{ fontFamily: "monospace" }}>
                      {formatValue(arm.outcome)}
                    </span>
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
                    : {formatValue(arm.settled_at)}
                  </div>

                  <ul
                    data-testid={`shadow-arm-detail-${arm.arm}`}
                    style={{
                      color: "#9aa4b4",
                      fontSize: 11,
                      listStyle: "none",
                      margin: 0,
                      padding: 0,
                    }}
                  >
                    {Object.entries(detail)
                      .filter(
                        ([k]) => k !== "available" && k !== "unavailable_reason",
                      )
                      .map(([k, v]) => {
                        const displayVal =
                          k === "execution_display_label"
                            ? localSanitizeExecutionLabel(v, kind)
                            : formatValue(v);
                        return (
                          <li key={k} style={{ padding: "1px 0" }}>
                            <span style={{ fontFamily: "monospace" }}>{k}</span>:{" "}
                            {displayVal}
                          </li>
                        );
                      })}
                  </ul>

                  {unavailReason ? (
                    <div
                      data-testid={`shadow-arm-unavailable-${arm.arm}`}
                      style={{
                        color: "#8c96a6",
                        fontFamily: "monospace",
                        fontSize: 11,
                      }}
                    >
                      reason: {unavailReason}
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
