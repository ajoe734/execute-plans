/**
 * TradeDecisionCard — standalone card for a single TradingDecisionEvent.
 *
 * Shows all D2 required fields: event kind, subject, trigger, confidence,
 * probability, EV breakdown, rationale, risk notes, evidence refs,
 * invalidation state, suggested action/size, position snapshot,
 * and trader decision buttons (approve/reject/defer/modify).
 *
 * Approve/modify creates a TradingIntent via AG-BE-TR-002; no order is placed.
 * Confidence and probability are displayed as distinct fields per D2 spec.
 */

import React, { useState } from "react";
import {
  decideOnEvent,
  type TradingDecisionEvent,
  type DecisionChoice,
} from "@/lib/bff-v1/agora/tradingRoom";

function newUUID(): string {
  return crypto.randomUUID();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EVENT_KIND_LABEL: Record<string, string> = {
  entry: "Entry",
  add: "Add",
  reduce: "Reduce",
  exit: "Exit",
  review: "Review",
};

const EVENT_KIND_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  entry: { bg: "rgba(21, 128, 61, 0.15)", text: "#4ade80", border: "#22c55e" },
  add: { bg: "rgba(29, 78, 216, 0.15)", text: "#60a5fa", border: "#3b82f6" },
  reduce: { bg: "rgba(161, 98, 7, 0.15)", text: "#fbbf24", border: "#f59e0b" },
  exit: { bg: "rgba(185, 28, 28, 0.15)", text: "#f87171", border: "#ef4444" },
  review: { bg: "rgba(126, 34, 206, 0.15)", text: "#c084fc", border: "#a855f7" },
};

const STATE_LABEL: Record<string, string> = {
  approaching: "Approaching",
  triggered: "Triggered",
  pending_review: "Pending Review",
  decided: "Decided",
  expired: "Expired",
  invalidated: "Invalidated",
  superseded: "Superseded",
};

const SEVERITY_COLOR: Record<string, { bg: string; text: string }> = {
  info: { bg: "rgba(3, 105, 161, 0.15)", text: "#38bdf8" },
  watch: { bg: "rgba(161, 98, 7, 0.15)", text: "#fbbf24" },
  warning: { bg: "rgba(194, 65, 12, 0.15)", text: "#fb923c" },
  high: { bg: "rgba(220, 38, 38, 0.15)", text: "#f87171" },
  critical: { bg: "rgba(153, 27, 27, 0.25)", text: "#f87171" },
};

const INVALIDATION_COLOR: Record<string, string> = {
  valid: "#16a34a",
  watch: "#d97706",
  invalidated: "#dc2626",
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface SectionHeadingProps {
  label: string;
}

function SectionHeading({ label }: SectionHeadingProps): JSX.Element {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        marginBottom: 4,
      }}
    >
      {label}
    </div>
  );
}

// ── TradeDecisionCard ─────────────────────────────────────────────────────────

type DecisionCallState = "idle" | "loading" | "success" | "error";

export interface TradeDecisionCardProps {
  event: TradingDecisionEvent;
  /**
   * ETag from the GET that loaded this event — forwarded as If-Match to decideOnEvent.
   * Required by AG-BE-TR-002; the route rejects writes that omit If-Match.
   */
  etag?: string;
  /** Called after a successful trader decision. */
  onDecisionRecorded?: (choice: DecisionChoice, eventId: string) => void;
}

export function TradeDecisionCard({
  event,
  etag,
  onDecisionRecorded,
}: TradeDecisionCardProps): JSX.Element {
  const [callState, setCallState] = useState<DecisionCallState>("idle");
  const [callError, setCallError] = useState<string | null>(null);
  const [decidedChoice, setDecidedChoice] = useState<DecisionChoice | null>(null);

  const kindStyle = EVENT_KIND_COLOR[event.event_kind] ?? {
    bg: "#f8fafc",
    text: "#475569",
    border: "#e2e8f0",
  };

  const canDecide =
    callState !== "loading" &&
    callState !== "success" &&
    (event.state === "pending_review" ||
      event.state === "triggered" ||
      event.state === "approaching");

  async function handleDecide(choice: DecisionChoice) {
    setCallState("loading");
    setCallError(null);
    try {
      await decideOnEvent(
        event.decision_event_id,
        { decision: choice },
        {
          ifMatch: etag,
          idempotencyKey: newUUID(),
          requestId: newUUID(),
        },
      );
      setDecidedChoice(choice);
      setCallState("success");
      onDecisionRecorded?.(choice, event.decision_event_id);
    } catch (err) {
      setCallError(err instanceof Error ? err.message : "Decision failed");
      setCallState("error");
    }
  }

  const ev = event;
  const invalidationColor =
    INVALIDATION_COLOR[ev.invalidation.current_state] ?? "#64748b";

  return (
    <div
      data-testid={`trade-decision-card-${ev.decision_event_id}`}
      style={{
        border: `1px solid ${kindStyle.border}`,
        borderRadius: 8,
        background: "#1e2330",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: kindStyle.bg,
          borderBottom: `1px solid ${kindStyle.border}`,
        }}
      >
        <span
          data-testid={`trade-decision-card-kind-${ev.decision_event_id}`}
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: kindStyle.text,
            padding: "2px 8px",
            borderRadius: 4,
            border: `1px solid ${kindStyle.border}`,
            background: "#171b22",
            textTransform: "uppercase",
          }}
        >
          {EVENT_KIND_LABEL[ev.event_kind] ?? ev.event_kind}
        </span>

        <span
          style={{ fontWeight: 700, fontSize: 15, color: "#f0ece4" }}
          data-testid={`trade-decision-card-symbol-${ev.decision_event_id}`}
        >
          {ev.subject.symbol}
        </span>

        {ev.subject.asset_class && (
          <span style={{ fontSize: 12, color: "#8c96a6" }}>
            {ev.subject.asset_class}
          </span>
        )}

        {ev.subject.venue && (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{ev.subject.venue}</span>
        )}

        <div style={{ flex: 1 }} />

        <span
          data-testid={`trade-decision-card-state-${ev.decision_event_id}`}
          style={{ fontSize: 12, color: "#8c96a6" }}
        >
          {STATE_LABEL[ev.state] ?? ev.state}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Trigger */}
        {ev.trigger && (
          <div data-testid={`trade-decision-card-trigger-${ev.decision_event_id}`}>
            <SectionHeading label="Trigger" />
            <div style={{ fontSize: 13, color: "#c4ccda" }}>
              {ev.trigger.summary}
              {ev.trigger.distance_to_trigger != null && (
                <span style={{ marginLeft: 8, color: "#8c96a6", fontSize: 12 }}>
                  Distance: {ev.trigger.distance_to_trigger.toFixed(4)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Signal Quality: Confidence (≠ Probability) */}
        <div
          data-testid={`trade-decision-card-confidence-${ev.decision_event_id}`}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <div>
            <SectionHeading label="Confidence (evidence quality)" />
            <div style={{ fontSize: 13, color: "#f0ece4" }}>
              <strong>{(ev.confidence.value * 100).toFixed(0)}%</strong>
              <span style={{ fontSize: 12, color: "#8c96a6", marginLeft: 6 }}>
                {ev.confidence.basis}
              </span>
            </div>
            <div
              data-testid={`trade-decision-card-calibration-${ev.decision_event_id}`}
              style={{ fontSize: 12, color: "#8c96a6" }}
            >
              Calibration: {ev.confidence.calibration_state}
            </div>
            {ev.confidence.sample_size != null && (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                n={ev.confidence.sample_size}
              </div>
            )}
          </div>

          {/* Probability (distinct from confidence per D4 spec) */}
          <div data-testid={`trade-decision-card-probability-${ev.decision_event_id}`}>
            <SectionHeading label="Probability (outcome forecast)" />
            <div style={{ fontSize: 13, color: "#f0ece4" }}>
              <strong>{(ev.probability.value * 100).toFixed(0)}%</strong>
              {ev.probability.ci_lower != null && ev.probability.ci_upper != null && (
                <span
                  data-testid={`trade-decision-card-probability-ci-${ev.decision_event_id}`}
                  style={{ fontSize: 12, color: "#8c96a6", marginLeft: 6 }}
                >
                  [{(ev.probability.ci_lower * 100).toFixed(0)}%–{(ev.probability.ci_upper * 100).toFixed(0)}%]
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#8c96a6" }}>
              {ev.probability.target_outcome} · {ev.probability.horizon}
            </div>
          </div>
        </div>

        {/* Expected Value — gross/cost/net/downside per D2 spec */}
        <div data-testid={`trade-decision-card-ev-${ev.decision_event_id}`}>
          <SectionHeading label={`Expected Value (${ev.expected_value.horizon}, ${ev.expected_value.unit})`} />
          <div style={{ display: "flex", gap: 20, fontSize: 13, flexWrap: "wrap" }}>
            <div>
              <span style={{ color: "#8c96a6", fontSize: 12 }}>Gross </span>
              <span style={{ fontWeight: 500, color: "#f0ece4" }}>
                {ev.expected_value.gross >= 0 ? "+" : ""}
                {ev.expected_value.gross.toFixed(4)}
              </span>
            </div>
            <div>
              <span style={{ color: "#8c96a6", fontSize: 12 }}>Cost </span>
              <span style={{ fontWeight: 500, color: "#f0ece4" }}>
                {ev.expected_value.cost.toFixed(4)}
              </span>
            </div>
            <div>
              <span style={{ color: "#8c96a6", fontSize: 12 }}>Net </span>
              <span
                data-testid={`trade-decision-card-ev-net-${ev.decision_event_id}`}
                style={{
                  fontWeight: 600,
                  color: ev.expected_value.net >= 0 ? "#16a34a" : "#dc2626",
                }}
              >
                {ev.expected_value.net >= 0 ? "+" : ""}
                {ev.expected_value.net.toFixed(4)}
              </span>
            </div>
            <div>
              <span style={{ color: "#8c96a6", fontSize: 12 }}>Downside </span>
              <span style={{ fontWeight: 500, color: "#dc2626" }}>
                {ev.expected_value.downside.toFixed(4)}
              </span>
            </div>
          </div>
        </div>

        {/* Suggested Action */}
        <div data-testid={`trade-decision-card-suggested-${ev.decision_event_id}`}>
          <SectionHeading label="Suggested Action (non-binding)" />
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "#f0ece4" }}>
            <span style={{ fontWeight: 600, textTransform: "capitalize" }}>
              {ev.suggested_action}
            </span>
            {ev.suggested_size && (
              <>
                {ev.suggested_size.size_hint && (
                  <span style={{ color: "#8c96a6" }}>
                    Size: {ev.suggested_size.size_hint}
                  </span>
                )}
                {ev.suggested_size.portfolio_pct != null && (
                  <span style={{ color: "#8c96a6" }}>
                    {(ev.suggested_size.portfolio_pct * 100).toFixed(1)}% portfolio
                  </span>
                )}
                <span style={{ fontSize: 11, color: "#94a3b8" }}>non-binding</span>
              </>
            )}
          </div>
        </div>

        {/* Rationale */}
        {ev.rationale.length > 0 && (
          <div data-testid={`trade-decision-card-rationale-${ev.decision_event_id}`}>
            <SectionHeading label="Rationale" />
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {ev.rationale.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 13 }}>
                  <span
                    style={{
                      minWidth: 36,
                      fontSize: 12,
                      color: "#94a3b8",
                      paddingTop: 1,
                    }}
                  >
                    {(r.confidence * 100).toFixed(0)}%
                  </span>
                  <span style={{ color: "#c4ccda", lineHeight: 1.4 }}>{r.claim}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risk Notes */}
        {ev.risk_notes.length > 0 && (
          <div data-testid={`trade-decision-card-risk-notes-${ev.decision_event_id}`}>
            <SectionHeading label="Risk Notes" />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {ev.risk_notes.map((rn, i) => {
                const color = SEVERITY_COLOR[rn.severity] ?? SEVERITY_COLOR.info;
                return (
                  <div
                    key={i}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      background: color.bg,
                      fontSize: 12,
                      color: color.text,
                      border: `1px solid ${color.text}33`,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>[{rn.severity}]</span>{" "}
                    <span style={{ fontWeight: 500 }}>{rn.domain}:</span> {rn.summary}
                    {rn.mitigation && (
                      <span style={{ color: "#8c96a6", marginLeft: 4 }}> — {rn.mitigation}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Evidence Refs */}
        {ev.evidence_refs.length > 0 && (
          <div data-testid={`trade-decision-card-evidence-${ev.decision_event_id}`}>
            <SectionHeading label={`Evidence (${ev.evidence_refs.length})`} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {ev.evidence_refs.map((ref, i) => (
                <div key={i} style={{ fontSize: 12, color: "#c4ccda" }}>
                  <span style={{ color: "#8c96a6", fontWeight: 600 }}>{ref.ref_type.toUpperCase()}</span>{" "}
                  {ref.ref_id}
                  {ref.summary ? ` — ${ref.summary}` : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invalidation */}
        <div data-testid={`trade-decision-card-invalidation-${ev.decision_event_id}`}>
          <SectionHeading label="Invalidation" />
          <div style={{ fontSize: 13, color: "#f0ece4" }}>
            State:{" "}
            <span style={{ fontWeight: 600, color: invalidationColor }}>
              {ev.invalidation.current_state.toUpperCase()}
            </span>
          </div>
          {ev.invalidation.conditions.length > 0 && (
            <ul style={{ margin: "4px 0 0 16px", padding: 0, fontSize: 12, color: "#8c96a6" }}>
              {ev.invalidation.conditions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Position snapshot (for add/reduce/exit/review events) */}
        {ev.position_snapshot && Object.keys(ev.position_snapshot).length > 0 && (
          <div data-testid={`trade-decision-card-position-${ev.decision_event_id}`}>
            <SectionHeading label="Position Snapshot" />
            <pre style={{
              fontSize: 11,
              color: "#c4ccda",
              fontFamily: "monospace",
              background: "#121620",
              padding: 8,
              borderRadius: 4,
              border: "1px solid #2a2e38",
              overflow: "auto",
              margin: 0,
            }}>
              {JSON.stringify(ev.position_snapshot, null, 2)}
            </pre>
          </div>
        )}

        {/* Data cutoff + no-order-route proof */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {ev.data_cutoff && (
            <span style={{ fontSize: 11, color: "#8c96a6" }}>
              Data cutoff: {ev.data_cutoff}
            </span>
          )}
          <span
            data-testid={`trade-decision-card-no-order-route-${ev.decision_event_id}`}
            style={{ fontSize: 11, color: "#4ade80", fontWeight: 500 }}
          >
            {ev.no_order_route_proof}
          </span>
        </div>

        {/* Governed TradingIntent notice */}
        <div
          data-testid={`trade-decision-card-intent-notice-${ev.decision_event_id}`}
          style={{
            padding: "6px 10px",
            borderRadius: 4,
            background: "rgba(3, 105, 161, 0.15)",
            border: "1px solid rgba(3, 105, 161, 0.3)",
            fontSize: 11,
            color: "#38bdf8",
          }}
        >
          Approve or Modify creates a governed TradingIntent via AG-BE-TR-002.
          No order is placed. Canary/live promotion requires separate governance review.
        </div>

        {/* Trader Decision Buttons */}
        <div
          data-testid={`trade-decision-card-actions-${ev.decision_event_id}`}
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
        >
          {callState === "success" ? (
            <span
              data-testid={`trade-decision-card-confirmed-${ev.decision_event_id}`}
              style={{ fontSize: 12, color: "#4ade80", fontWeight: 500 }}
            >
              Decision recorded: {decidedChoice?.toUpperCase()}
            </span>
          ) : (
            <>
              <span style={{ fontSize: 12, color: "#8c96a6", marginRight: 2 }}>
                Trader decision:
              </span>
              {(["approve", "reject", "defer", "modify"] as DecisionChoice[]).map(
                (choice) => (
                  <button
                    key={choice}
                    data-testid={`trade-decision-card-decide-${choice}-${ev.decision_event_id}`}
                    disabled={!canDecide}
                    onClick={() => handleDecide(choice)}
                    style={{
                      padding: "4px 12px",
                      fontSize: 12,
                      border: choice === "approve" ? "1px solid #22c55e" : choice === "reject" ? "1px solid #ef4444" : "1px solid #2a2e38",
                      borderRadius: 4,
                      cursor: canDecide ? "pointer" : "not-allowed",
                      background:
                        choice === "approve"
                          ? "rgba(34, 197, 94, 0.15)"
                          : choice === "reject"
                          ? "rgba(239, 68, 68, 0.15)"
                          : "#1e2330",
                      color:
                        choice === "approve"
                          ? "#4ade80"
                          : choice === "reject"
                          ? "#f87171"
                          : "#c4ccda",
                      opacity: canDecide ? 1 : 0.5,
                      fontWeight: choice === "approve" || choice === "reject" ? 600 : 400,
                    }}
                  >
                    {choice.charAt(0).toUpperCase() + choice.slice(1)}
                  </button>
                ),
              )}
              {callState === "loading" && (
                <span
                  data-testid={`trade-decision-card-loading-${ev.decision_event_id}`}
                  style={{ fontSize: 12, color: "#8c96a6" }}
                >
                  Sending…
                </span>
              )}
              {callState === "error" && callError && (
                <span
                  data-testid={`trade-decision-card-error-${ev.decision_event_id}`}
                  style={{ fontSize: 12, color: "#f87171" }}
                >
                  {callError}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
