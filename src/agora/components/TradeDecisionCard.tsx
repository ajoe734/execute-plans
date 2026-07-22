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
import { useNavigate } from "react-router-dom";
import {
  decideOnEvent,
  type TradingDecisionEvent,
  type DecisionChoice,
} from "@/lib/bff-v1/agora/tradingRoom";
import { createWorkshop, postWorkshopMessage } from "@/lib/bff-v1/agora/workshops";

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
  valid: "#4ade80",
  watch: "#fbbf24",
  invalidated: "#ff6b6b",
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
  const navigate = useNavigate();
  const [callState, setCallState] = useState<DecisionCallState>("idle");
  const [callError, setCallError] = useState<string | null>(null);
  const [decidedChoice, setDecidedChoice] = useState<DecisionChoice | null>(null);

  // Consultation states
  const [showConsultPanel, setShowConsultPanel] = useState(false);
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>(["per_quant", "per_risk", "per_macro"]);
  const [consultQuery, setConsultQuery] = useState("");
  const [consultLoading, setConsultLoading] = useState(false);
  const [consultError, setConsultError] = useState<string | null>(null);

  // Modify linkage states
  const [showModifyLinkage, setShowModifyLinkage] = useState(false);
  const [modifyProposalId, setModifyProposalId] = useState("");
  const [modifyProposalRevision, setModifyProposalRevision] = useState("1");
  const [modifyWorkshopId, setModifyWorkshopId] = useState("");
  const [modifyRationale, setModifyRationale] = useState("");

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
        background: "#171b22",
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
          <span style={{ fontSize: 12, color: "#8c96a6" }}>{ev.subject.venue}</span>
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
            <div style={{ fontSize: 13, color: "#f0ece4" }}>
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
          data-testid="detail-confidence"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <div data-testid={`trade-decision-card-confidence-${ev.decision_event_id}`}>
            <SectionHeading label="Confidence (evidence quality)" />
            <div style={{ fontSize: 13, color: "#f0ece4" }}>
              <strong>{(ev.confidence.value * 100).toFixed(0)}%</strong>
              <span style={{ fontSize: 12, color: "#8c96a6", marginLeft: 6 }}>
                {ev.confidence.basis}
              </span>
            </div>
            <div
              data-testid="detail-calibration"
              style={{ fontSize: 12, color: "#8c96a6" }}
            >
              <div data-testid={`trade-decision-card-calibration-${ev.decision_event_id}`}>
                Calibration: {ev.confidence.calibration_state}
              </div>
            </div>
            {ev.confidence.sample_size != null && (
              <div style={{ fontSize: 12, color: "#8c96a6" }}>
                n={ev.confidence.sample_size}
              </div>
            )}
          </div>

          {/* Probability (distinct from confidence per D4 spec) */}
          <div data-testid="detail-probability">
            <div data-testid={`trade-decision-card-probability-${ev.decision_event_id}`}>
              <SectionHeading label="Probability (outcome forecast)" />
              <div style={{ fontSize: 13, color: "#f0ece4" }}>
                <strong>{(ev.probability.value * 100).toFixed(0)}%</strong>
                {ev.probability.ci_lower != null && ev.probability.ci_upper != null && (
                  <span
                    data-testid="detail-probability-interval"
                    style={{ fontSize: 12, color: "#8c96a6", marginLeft: 6 }}
                  >
                    <span data-testid={`trade-decision-card-probability-ci-${ev.decision_event_id}`}>
                      [{(ev.probability.ci_lower * 100).toFixed(0)}%–{(ev.probability.ci_upper * 100).toFixed(0)}%]
                    </span>
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#8c96a6" }}>
                {ev.probability.target_outcome} · {ev.probability.horizon}
              </div>
            </div>
          </div>
        </div>

        {/* Expected Value — gross/cost/net/downside per D2 spec */}
        <div data-testid="detail-expected-value">
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
                    color: ev.expected_value.net >= 0 ? "#4ade80" : "#ff6b6b",
                  }}
                >
                  {ev.expected_value.net >= 0 ? "+" : ""}
                  {ev.expected_value.net.toFixed(4)}
                </span>
              </div>
              <div>
                <span style={{ color: "#8c96a6", fontSize: 12 }}>Downside </span>
                <span style={{ fontWeight: 500, color: "#ff6b6b" }}>
                  {ev.expected_value.downside.toFixed(4)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Suggested Action */}
        <div data-testid="detail-suggested-action">
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
                  <span style={{ fontSize: 11, color: "#8c96a6" }}>non-binding</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Rationale */}
        {ev.rationale.length > 0 && (
          <div data-testid="detail-rationale">
            <div data-testid={`trade-decision-card-rationale-${ev.decision_event_id}`}>
            <SectionHeading label="Rationale" />
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {ev.rationale.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 13 }}>
                  <span
                    style={{
                      minWidth: 36,
                      fontSize: 12,
                      color: "#8c96a6",
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
        </div>
      )}

        {/* Risk Notes */}
        {ev.risk_notes.length > 0 && (
          <div data-testid="detail-risk-notes">
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
          </div>
        )}

        {/* Evidence Refs */}
        {ev.evidence_refs.length > 0 && (
          <div data-testid="detail-evidence-refs">
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
          </div>
        )}

        {/* Invalidation */}
        <div data-testid="detail-invalidation">
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
          <span data-testid="detail-no-order-route">
            <span
              data-testid={`trade-decision-card-no-order-route-${ev.decision_event_id}`}
              style={{ fontSize: 11, color: "#4ade80", fontWeight: 500 }}
            >
              {ev.no_order_route_proof}
            </span>
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
          data-testid="detail-trader-actions"
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
        >
          {callState === "success" ? (
            <span
              data-testid="detail-decision-confirmed"
            >
              <span
                data-testid={`confirmed-${ev.decision_event_id}`}
                style={{ fontSize: 12, color: "#4ade80", fontWeight: 500 }}
              >
                Decision recorded: {decidedChoice}
              </span>
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
                    data-testid={`decide-${choice}-${ev.decision_event_id}`}
                    disabled={!canDecide}
                    onClick={() => {
                      if (choice === "modify") {
                        setShowModifyLinkage(true);
                        setShowConsultPanel(false);
                      } else {
                        handleDecide(choice);
                      }
                    }}
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
              <button
                type="button"
                data-testid={`ask-personas-${ev.decision_event_id}`}
                onClick={() => {
                  setShowConsultPanel(!showConsultPanel);
                  setShowModifyLinkage(false);
                }}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  border: "1px solid #6366f1",
                  borderRadius: 4,
                  cursor: "pointer",
                  background: "#e0e7ff",
                  color: "#4f46e5",
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4
                }}
              >
                💬 Ask Personas
              </button>
              {callState === "loading" && (
                <span
                  data-testid={`decision-loading-${ev.decision_event_id}`}
                  style={{ fontSize: 12, color: "#94a3b8" }}
                >
                  Sending…
                </span>
              )}
              {callState === "error" && callError && (
                <span
                  data-testid="detail-decision-error"
                >
                  <span data-testid={`error-${ev.decision_event_id}`} style={{ fontSize: 12, color: "#f87171" }}>
                    {callError}
                  </span>
                </span>
              )}
            </>
          )}
        </div>

        {/* Contextual Consultation Panel */}
        {showConsultPanel && (
          <div
            data-testid={`consult-panel-${ev.decision_event_id}`}
            style={{
              marginTop: 12,
              padding: 12,
              background: "#1e2330",
              borderRadius: 6,
              border: "1px solid #2a2e38",
              fontSize: 12,
              color: "#f0ece4",
            }}
          >
            <div style={{ fontWeight: 600, color: "#e8b750", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span>🔍 Consult Personas on Signal ({ev.subject.symbol})</span>
            </div>
            
            {/* Display carried context */}
            <div style={{ background: "#121620", padding: 8, borderRadius: 4, marginBottom: 8, border: "1px solid #2a2e38" }}>
              <div style={{ color: "#8c96a6", fontSize: 11, fontStyle: "italic", marginBottom: 4 }}>Carried Context:</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div><strong>Event ID:</strong> <span className="font-mono">{ev.decision_event_id}</span></div>
                <div><strong>Strategy Version:</strong> <span className="font-mono">{ev.strategy_spec_registry_id}</span></div>
                <div style={{ gridColumn: "span 2" }}><strong>Risk Snapshot:</strong> {ev.risk_notes.map(r => `[${r.severity}] ${r.summary}`).join("; ") || "Normal"}</div>
                <div style={{ gridColumn: "span 2" }}><strong>Evidence Refs:</strong> {ev.evidence_refs.map(r => `${r.ref_type}:${r.ref_id}`).join(", ") || "None"}</div>
              </div>
            </div>

            {/* Persona Checklist */}
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: 500, color: "#c4ccda", display: "block", marginBottom: 4 }}>Select Personas:</span>
              <div style={{ display: "flex", gap: 12 }}>
                {[
                  { id: "per_quant", name: "Quant" },
                  { id: "per_risk", name: "Risk" },
                  { id: "per_macro", name: "Macro" },
                  { id: "per_red", name: "Red Team" }
                ].map(p => (
                  <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: "#c4ccda" }}>
                    <input
                      type="checkbox"
                      checked={selectedPersonas.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPersonas([...selectedPersonas, p.id]);
                        } else {
                          setSelectedPersonas(selectedPersonas.filter(x => x !== p.id));
                        }
                      }}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>

            {/* Quick Templates */}
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: 500, color: "#c4ccda", display: "block", marginBottom: 4 }}>Quick Templates:</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    setConsultQuery(`紅隊分析：此信號是否受特定事件或流動性限制影響？`);
                    if (!selectedPersonas.includes("per_red")) setSelectedPersonas([...selectedPersonas, "per_red"]);
                  }}
                  style={{ padding: "2px 8px", background: "#171b22", border: "1px solid #2a2e38", color: "#c4ccda", borderRadius: 4, cursor: "pointer" }}
                >
                  🔴 Red-Team Analysis
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConsultQuery(`風險分析：部位規模是否超過部位與槓桿限制？`);
                    if (!selectedPersonas.includes("per_risk")) setSelectedPersonas([...selectedPersonas, "per_risk"]);
                  }}
                  style={{ padding: "2px 8px", background: "#171b22", border: "1px solid #2a2e38", color: "#c4ccda", borderRadius: 4, cursor: "pointer" }}
                >
                  ⚠️ Fast Risk Assessment
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConsultQuery(`多方案比較：是否有更優的減碼或出場時間點？`);
                    if (!selectedPersonas.includes("per_quant")) setSelectedPersonas([...selectedPersonas, "per_quant"]);
                  }}
                  style={{ padding: "2px 8px", background: "#171b22", border: "1px solid #2a2e38", color: "#c4ccda", borderRadius: 4, cursor: "pointer" }}
                >
                  📊 Option Comparison
                </button>
              </div>
            </div>

            {/* Prompt input */}
            <div style={{ marginBottom: 8 }}>
              <textarea
                placeholder="Ask your question to the selected personas..."
                value={consultQuery}
                onChange={(e) => setConsultQuery(e.target.value)}
                style={{ width: "100%", height: 60, padding: 6, borderRadius: 4, border: "1px solid #2a2e38", background: "#121620", color: "#f0ece4", resize: "none" }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                disabled={consultLoading || selectedPersonas.length === 0}
                onClick={async () => {
                  setConsultLoading(true);
                  setConsultError(null);
                  try {
                    const newWs = await createWorkshop({
                      subject: {
                        kind: "candidate_artifact",
                        ref: ev.decision_event_id,
                        title: `Contextual Consult: ${ev.subject.symbol} ${ev.event_kind}`,
                      },
                      participant_persona_ids: selectedPersonas,
                      metadata: {
                        decision_event_id: ev.decision_event_id,
                        strategy_id: ev.strategy_id,
                        strategy_version: ev.strategy_spec_registry_id,
                        position_snapshot: ev.position_snapshot,
                        risk_notes: ev.risk_notes,
                        evidence_refs: ev.evidence_refs,
                        context_type: "decision_event_consultation",
                      }
                    });
                    
                    if (consultQuery.trim()) {
                      await postWorkshopMessage(newWs.workshop_id, {
                        content: consultQuery.trim(),
                        metadata: {
                          mode: "consult",
                          participant_persona_ids: selectedPersonas,
                        }
                      });
                    }

                    navigate(`/agora/strategy-workshop/${newWs.workshop_id}`);
                  } catch (err) {
                    setConsultError(err instanceof Error ? err.message : "Failed to create consultation");
                  } finally {
                    setConsultLoading(false);
                  }
                }}
                style={{
                  padding: "4px 12px",
                  background: "#4f46e5",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  fontWeight: 600,
                  cursor: (consultLoading || selectedPersonas.length === 0) ? "not-allowed" : "pointer",
                  opacity: (consultLoading || selectedPersonas.length === 0) ? 0.7 : 1
                }}
                data-testid={`consult-panel-submit-${ev.decision_event_id}`}
              >
                {consultLoading ? "Launching..." : "🚀 Launch Workshop Consultation"}
              </button>
              <button
                type="button"
                onClick={() => setShowConsultPanel(false)}
                style={{ padding: "4px 12px", background: "#171b22", border: "1px solid #2a2e38", color: "#c4ccda", borderRadius: 4, cursor: "pointer" }}
              >
                Cancel
              </button>
              {consultError && (
                <span style={{ color: "#f87171", fontSize: 11 }}>{consultError}</span>
              )}
            </div>
          </div>
        )}

        {/* Structured Modify Linkage Panel */}
        {showModifyLinkage && (
          <div
            data-testid={`modify-linkage-panel-${ev.decision_event_id}`}
            style={{
              marginTop: 12,
              padding: 12,
              background: "#221c10",
              borderRadius: 6,
              border: "1px solid #e8b750",
              fontSize: 12,
              color: "#f0ece4",
            }}
          >
            <div style={{ fontWeight: 600, color: "#e8b750", marginBottom: 8 }}>
              🛠️ Link Modification Proposal & Consultation
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <label style={{ display: "block", color: "#c4ccda", fontWeight: 500, marginBottom: 2 }}>Linked Proposal ID:</label>
                <input
                  type="text"
                  placeholder="e.g. prop-123"
                  value={modifyProposalId}
                  onChange={(e) => setModifyProposalId(e.target.value)}
                  style={{ width: "100%", padding: "4px 8px", borderRadius: 4, border: "1px solid #2a2e38", background: "#121620", color: "#f0ece4" }}
                  data-testid={`modify-proposal-id-${ev.decision_event_id}`}
                />
              </div>
              <div>
                <label style={{ display: "block", color: "#c4ccda", fontWeight: 500, marginBottom: 2 }}>Proposal Revision:</label>
                <input
                  type="number"
                  min="1"
                  value={modifyProposalRevision}
                  onChange={(e) => setModifyProposalRevision(e.target.value)}
                  style={{ width: "100%", padding: "4px 8px", borderRadius: 4, border: "1px solid #2a2e38", background: "#121620", color: "#f0ece4" }}
                  data-testid={`modify-proposal-revision-${ev.decision_event_id}`}
                />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", color: "#c4ccda", fontWeight: 500, marginBottom: 2 }}>Linked Consultation Workshop ID:</label>
                <input
                  type="text"
                  placeholder="e.g. ws-abc (optional)"
                  value={modifyWorkshopId}
                  onChange={(e) => setModifyWorkshopId(e.target.value)}
                  style={{ width: "100%", padding: "4px 8px", borderRadius: 4, border: "1px solid #2a2e38", background: "#121620", color: "#f0ece4" }}
                  data-testid={`modify-workshop-id-${ev.decision_event_id}`}
                />
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", color: "#c4ccda", fontWeight: 500, marginBottom: 2 }}>Modification Rationale:</label>
              <textarea
                placeholder="Explain the changes to sizes, bounds, or limits..."
                value={modifyRationale}
                onChange={(e) => setModifyRationale(e.target.value)}
                style={{ width: "100%", height: 50, padding: 6, borderRadius: 4, border: "1px solid #2a2e38", background: "#121620", color: "#f0ece4", resize: "none" }}
                data-testid={`modify-rationale-${ev.decision_event_id}`}
              />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                disabled={callState === "loading" || !modifyProposalId.trim() || !modifyRationale.trim()}
                onClick={async () => {
                  setCallState("loading");
                  setCallError(null);
                  try {
                    await decideOnEvent(
                      ev.decision_event_id,
                      {
                        decision: "modify",
                        rationale: modifyRationale,
                        modifications: {
                          proposal_id: modifyProposalId.trim(),
                          proposal_revision: parseInt(modifyProposalRevision, 10) || 1,
                          consultation_workshop_id: modifyWorkshopId.trim() || undefined,
                        }
                      },
                      { ifMatch: etag, idempotencyKey: newUUID(), requestId: newUUID() }
                    );
                    setDecidedChoice("modify");
                    setCallState("success");
                    setShowModifyLinkage(false);
                    onDecisionRecorded?.("modify", ev.decision_event_id);
                  } catch (err) {
                    setCallError(err instanceof Error ? err.message : "Modify failed");
                    setCallState("error");
                  }
                }}
                style={{
                  padding: "4px 12px",
                  background: "#d97706",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  fontWeight: 600,
                  cursor: (callState === "loading" || !modifyProposalId.trim() || !modifyRationale.trim()) ? "not-allowed" : "pointer",
                  opacity: (callState === "loading" || !modifyProposalId.trim() || !modifyRationale.trim()) ? 0.7 : 1
                }}
                data-testid={`modify-linkage-submit-${ev.decision_event_id}`}
              >
                Confirm Modification
              </button>
              <button
                type="button"
                onClick={() => setShowModifyLinkage(false)}
                style={{ padding: "4px 12px", background: "#171b22", border: "1px solid #2a2e38", color: "#c4ccda", borderRadius: 4, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
