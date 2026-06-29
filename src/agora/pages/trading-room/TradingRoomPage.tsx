import React, { useEffect, useState } from "react";
import {
  acceptTradingRoomWorkspaceProposal,
  createTradingRoomWorkspaceProposal,
  getTradingRoom,
  listDecisionEvents,
  decideOnEvent,
  type TradingRoomAggregate,
  type TradingRoomStrategyEntry,
  type TradingDecisionEvent,
  type DecisionChoice,
} from "@/lib/bff-v1/agora/tradingRoom";
import type {
  ChartSpecV1,
  TradingRoomViewSpec,
  TradingRoomWidgetSpec,
  TradingRoomWorkspace,
  TradingRoomWorkspaceProposal,
} from "@/lib/bff-v1/agora/types";
import ChartSpecRenderer from "@/agora/widgets/ChartSpecRenderer";
import {
  formatSensitivityLabel,
  safeWarningText,
  validateTradingRoomWidgetSpec,
  WorkspaceProposalPreview,
} from "@/agora/trading-room/WorkspaceProposalPreview";

function newUUID(): string {
  return crypto.randomUUID();
}

// ── Strategy Lens Switcher ────────────────────────────────────────────────────

interface StrategyLensSwitcherProps {
  strategies: TradingRoomStrategyEntry[];
  activeStrategyId?: string;
  onSelect: (strategyId: string | undefined) => void;
}

function StrategyLensSwitcher({
  strategies,
  activeStrategyId,
  onSelect,
}: StrategyLensSwitcherProps): JSX.Element {
  return (
    <div
      data-testid="strategy-lens-switcher"
      role="listbox"
      aria-label="Strategy workspace switcher"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 16px",
        borderBottom: "1px solid #e2e8f0",
        overflowX: "auto",
        flexShrink: 0,
      }}
    >
      <button
        role="option"
        aria-selected={activeStrategyId === undefined}
        data-testid="strategy-lens-all"
        onClick={() => onSelect(undefined)}
        style={{
          padding: "6px 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontWeight: activeStrategyId === undefined ? 600 : 400,
          borderBottom: activeStrategyId === undefined ? "2px solid #2563eb" : "2px solid transparent",
          whiteSpace: "nowrap",
        }}
      >
        All Strategies
      </button>
      {strategies.map((s) => (
        <button
          key={s.strategy_id}
          role="option"
          aria-selected={activeStrategyId === s.strategy_id}
          data-testid={`strategy-lens-${s.strategy_id}`}
          onClick={() => onSelect(s.strategy_id)}
          style={{
            padding: "6px 12px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontWeight: activeStrategyId === s.strategy_id ? 600 : 400,
            borderBottom:
              activeStrategyId === s.strategy_id
                ? "2px solid #2563eb"
                : "2px solid transparent",
            whiteSpace: "nowrap",
          }}
        >
          {s.title}
        </button>
      ))}
    </div>
  );
}

// ── Risk Banner ───────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  normal: "#f0fdf4",
  watch: "#fefce8",
  warning: "#fff7ed",
  critical: "#fef2f2",
};

interface RiskBannerProps {
  state: string;
  summary?: string;
  alerts?: string[];
}

function RiskBanner({ state, summary, alerts }: RiskBannerProps): JSX.Element | null {
  if (state === "normal") return null;
  return (
    <div
      data-testid="risk-banner"
      data-risk-state={state}
      style={{
        padding: "6px 16px",
        background: RISK_COLORS[state] ?? RISK_COLORS.warning,
        borderBottom: "1px solid #e2e8f0",
        fontSize: 13,
      }}
    >
      <strong>Risk: {state}</strong>
      {summary ? ` — ${summary}` : null}
      {alerts && alerts.length > 0 ? (
        <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
          {alerts.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ── Queue Summary Strip ───────────────────────────────────────────────────────

interface QueueSummaryStripProps {
  entry: number;
  add: number;
  reduce: number;
  exit: number;
  review: number;
}

function QueueSummaryStrip({ entry, add, reduce, exit, review }: QueueSummaryStripProps): JSX.Element {
  return (
    <div
      data-testid="queue-summary-strip"
      style={{
        display: "flex",
        gap: 16,
        padding: "4px 16px",
        borderBottom: "1px solid #e2e8f0",
        fontSize: 12,
        color: "#64748b",
      }}
    >
      <span data-testid="queue-entry-count">Entry: {entry}</span>
      <span data-testid="queue-add-count">Add: {add}</span>
      <span data-testid="queue-reduce-count">Reduce: {reduce}</span>
      <span data-testid="queue-exit-count">Exit: {exit}</span>
      <span data-testid="queue-review-count">Review: {review}</span>
    </div>
  );
}

// ── Decision Event Detail Panel ───────────────────────────────────────────────

type DecisionCallState = "idle" | "loading" | "success" | "error";

interface DecisionEventDetailPanelProps {
  event: TradingDecisionEvent;
  /** ETag from the listDecisionEvents response — forwarded as If-Match to decideOnEvent. */
  etag?: string | null;
}

function DecisionEventDetailPanel({ event, etag }: DecisionEventDetailPanelProps): JSX.Element {
  const [callState, setCallState] = useState<DecisionCallState>("idle");
  const [callError, setCallError] = useState<string | null>(null);
  const [decidedChoice, setDecidedChoice] = useState<DecisionChoice | null>(null);

  const canDecide =
    callState !== "loading" &&
    callState !== "success" &&
    (event.state === "pending_review" || event.state === "triggered" || event.state === "approaching");

  async function handleDecide(choice: DecisionChoice) {
    setCallState("loading");
    setCallError(null);
    try {
      await decideOnEvent(
        event.decision_event_id,
        { decision: choice },
        { ifMatch: etag ?? undefined, idempotencyKey: newUUID(), requestId: newUUID() },
      );
      setDecidedChoice(choice);
      setCallState("success");
    } catch (err) {
      setCallError(err instanceof Error ? err.message : "Decision failed");
      setCallState("error");
    }
  }

  const ev = event;

  return (
    <tr data-testid={`event-detail-${ev.decision_event_id}`}>
      <td colSpan={5} style={{ padding: "8px 16px", background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, fontSize: 12 }}>

          {/* Signal Quality */}
          <div data-testid="detail-confidence">
            <div style={{ fontWeight: 600, color: "#475569", marginBottom: 4 }}>Signal Quality</div>
            <div>Confidence: {(ev.confidence.value * 100).toFixed(0)}% ({ev.confidence.basis})</div>
            <div data-testid="detail-calibration">Calibration: {ev.confidence.calibration_state}</div>
            {ev.confidence.sample_size != null && (
              <div>Sample size: {ev.confidence.sample_size}</div>
            )}
            <div data-testid="detail-probability">
              Probability: {(ev.probability.value * 100).toFixed(0)}% — {ev.probability.target_outcome}
            </div>
            <div>Horizon: {ev.probability.horizon}</div>
            {ev.probability.ci_lower != null && ev.probability.ci_upper != null && (
              <div data-testid="detail-probability-interval">
                CI: [{(ev.probability.ci_lower * 100).toFixed(0)}%, {(ev.probability.ci_upper * 100).toFixed(0)}%]
              </div>
            )}
          </div>

          {/* Expected Value */}
          <div data-testid="detail-expected-value">
            <div style={{ fontWeight: 600, color: "#475569", marginBottom: 4 }}>Expected Value</div>
            <div>Horizon: {ev.expected_value.horizon} ({ev.expected_value.unit})</div>
            <div>Gross: {ev.expected_value.gross > 0 ? "+" : ""}{ev.expected_value.gross.toFixed(4)}</div>
            <div>Cost: {ev.expected_value.cost.toFixed(4)}</div>
            <div>Net: {ev.expected_value.net > 0 ? "+" : ""}{ev.expected_value.net.toFixed(4)}</div>
            <div>Downside: {ev.expected_value.downside.toFixed(4)}</div>
          </div>

          {/* Suggested Action */}
          <div data-testid="detail-suggested-action">
            <div style={{ fontWeight: 600, color: "#475569", marginBottom: 4 }}>Suggested Action</div>
            <div style={{ textTransform: "capitalize", fontWeight: 500 }}>{ev.suggested_action}</div>
            {ev.suggested_size && (
              <>
                {ev.suggested_size.size_hint && <div>Size hint: {ev.suggested_size.size_hint}</div>}
                {ev.suggested_size.portfolio_pct != null && (
                  <div>Portfolio %: {(ev.suggested_size.portfolio_pct * 100).toFixed(1)}%</div>
                )}
                <div style={{ color: "#94a3b8", fontSize: 11 }}>Non-binding</div>
              </>
            )}
            {ev.data_cutoff && (
              <div style={{ marginTop: 4, color: "#64748b" }}>Data cutoff: {ev.data_cutoff}</div>
            )}
            <div
              data-testid="detail-no-order-route"
              style={{ marginTop: 4, fontSize: 11, color: "#22c55e", fontWeight: 500 }}
            >
              {ev.no_order_route_proof}
            </div>
          </div>

          {/* Invalidation */}
          <div data-testid="detail-invalidation">
            <div style={{ fontWeight: 600, color: "#475569", marginBottom: 4 }}>Invalidation</div>
            <div>State: <span style={{ fontWeight: 500 }}>{ev.invalidation.current_state}</span></div>
            {ev.invalidation.conditions.length > 0 && (
              <ul style={{ margin: "4px 0 0 12px", padding: 0 }}>
                {ev.invalidation.conditions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
          </div>

        </div>

        {/* Rationale */}
        {ev.rationale.length > 0 && (
          <div data-testid="detail-rationale" style={{ marginTop: 10, fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: "#475569", marginBottom: 4 }}>Rationale</div>
            {ev.rationale.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 2 }}>
                <span style={{ color: "#94a3b8", minWidth: 32 }}>{(r.confidence * 100).toFixed(0)}%</span>
                <span>{r.claim}</span>
              </div>
            ))}
          </div>
        )}

        {/* Risk Notes */}
        {ev.risk_notes.length > 0 && (
          <div data-testid="detail-risk-notes" style={{ marginTop: 10, fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: "#475569", marginBottom: 4 }}>Risk Notes</div>
            {ev.risk_notes.map((rn, i) => (
              <div
                key={i}
                style={{
                  padding: "4px 8px",
                  background: rn.severity === "critical" || rn.severity === "high" ? "#fef2f2" : "#fefce8",
                  borderRadius: 4,
                  marginBottom: 2,
                }}
              >
                <span style={{ fontWeight: 500 }}>[{rn.severity}] {rn.domain}:</span> {rn.summary}
                {rn.mitigation && <span style={{ color: "#64748b" }}> — {rn.mitigation}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Evidence Refs */}
        {ev.evidence_refs.length > 0 && (
          <div data-testid="detail-evidence-refs" style={{ marginTop: 10, fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: "#475569", marginBottom: 4 }}>
              Evidence ({ev.evidence_refs.length})
            </div>
            {ev.evidence_refs.map((ref, i) => (
              <div key={i} style={{ color: "#475569" }}>
                <span style={{ color: "#94a3b8" }}>{ref.ref_type}</span> {ref.ref_id}
                {ref.summary ? ` — ${ref.summary}` : null}
              </div>
            ))}
          </div>
        )}

        {/* Trader Decision Actions */}
        <div data-testid="detail-trader-actions" style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
          {callState === "success" ? (
            <span data-testid="detail-decision-confirmed" style={{ fontSize: 12, color: "#22c55e", fontWeight: 500 }}>
              Decision recorded: {decidedChoice}
            </span>
          ) : (
            <>
              <span style={{ fontSize: 12, color: "#64748b", marginRight: 4 }}>Trader decision:</span>
              {(["approve", "reject", "defer", "modify"] as DecisionChoice[]).map((choice) => (
                <button
                  key={choice}
                  data-testid={`decide-${choice}-${ev.decision_event_id}`}
                  disabled={!canDecide}
                  onClick={() => handleDecide(choice)}
                  style={{
                    padding: "3px 10px",
                    fontSize: 12,
                    border: "1px solid #e2e8f0",
                    borderRadius: 4,
                    cursor: canDecide ? "pointer" : "not-allowed",
                    background: choice === "approve" ? "#f0fdf4" : choice === "reject" ? "#fef2f2" : "#fff",
                    color: choice === "approve" ? "#16a34a" : choice === "reject" ? "#dc2626" : "#475569",
                    opacity: canDecide ? 1 : 0.5,
                  }}
                >
                  {choice.charAt(0).toUpperCase() + choice.slice(1)}
                </button>
              ))}
              {callState === "loading" && (
                <span data-testid="detail-decision-loading" style={{ fontSize: 12, color: "#94a3b8" }}>
                  Sending…
                </span>
              )}
              {callState === "error" && callError && (
                <span data-testid="detail-decision-error" style={{ fontSize: 12, color: "#dc2626" }}>
                  {callError}
                </span>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Trading Event Queue ───────────────────────────────────────────────────────

const EVENT_KIND_LABEL: Record<string, string> = {
  entry: "Entry",
  add: "Add",
  reduce: "Reduce",
  exit: "Exit",
  review: "Review",
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

interface TradingEventQueueProps {
  events: TradingDecisionEvent[];
  loading: boolean;
  /** ETag from listDecisionEvents — forwarded to each DecisionEventDetailPanel as If-Match. */
  eventsEtag?: string | null;
}

function TradingEventQueue({ events, loading, eventsEtag }: TradingEventQueueProps): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div data-testid="trading-event-queue" style={{ flex: 1, overflow: "auto" }}>
      <div style={{ padding: "8px 16px", fontWeight: 600, fontSize: 13, borderBottom: "1px solid #e2e8f0" }}>
        Decision Event Queue
      </div>
      {loading ? (
        <div data-testid="event-queue-loading" style={{ padding: 16, fontSize: 13, color: "#94a3b8" }}>
          Loading events…
        </div>
      ) : events.length === 0 ? (
        <div data-testid="event-queue-empty" style={{ padding: 16, fontSize: 13, color: "#94a3b8" }}>
          No pending decision events.
        </div>
      ) : (
        <table
          data-testid="event-queue-table"
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ textAlign: "left", padding: "6px 16px", fontWeight: 500, color: "#64748b" }}>Symbol</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "#64748b" }}>Kind</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "#64748b" }}>State</th>
              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500, color: "#64748b" }}>Confidence</th>
              <th style={{ textAlign: "right", padding: "6px 16px", fontWeight: 500, color: "#64748b" }}>EV (net)</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <React.Fragment key={ev.decision_event_id}>
                <tr
                  data-testid={`event-row-${ev.decision_event_id}`}
                  aria-expanded={expandedId === ev.decision_event_id}
                  style={{
                    borderBottom: expandedId === ev.decision_event_id ? "none" : "1px solid #f1f5f9",
                    cursor: "pointer",
                    background: expandedId === ev.decision_event_id ? "#f8fafc" : undefined,
                  }}
                  onClick={() => toggleExpand(ev.decision_event_id)}
                >
                  <td style={{ padding: "6px 16px" }}>{ev.subject.symbol}</td>
                  <td style={{ padding: "6px 8px" }}>{EVENT_KIND_LABEL[ev.event_kind] ?? ev.event_kind}</td>
                  <td style={{ padding: "6px 8px" }}>{STATE_LABEL[ev.state] ?? ev.state}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    {(ev.confidence.value * 100).toFixed(0)}%
                  </td>
                  <td style={{ padding: "6px 16px", textAlign: "right" }}>
                    {ev.expected_value.net > 0 ? "+" : ""}
                    {ev.expected_value.net.toFixed(2)}
                  </td>
                </tr>
                {expandedId === ev.decision_event_id && (
                  <DecisionEventDetailPanel event={ev} etag={eventsEtag} />
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Position Action Queue ─────────────────────────────────────────────────────

interface PositionActionQueueProps {
  positionSummaries: unknown[];
}

function PositionActionQueue({ positionSummaries }: PositionActionQueueProps): JSX.Element {
  return (
    <div
      data-testid="position-action-queue"
      style={{ borderLeft: "1px solid #e2e8f0", width: 240, overflow: "auto", flexShrink: 0 }}
    >
      <div style={{ padding: "8px 12px", fontWeight: 600, fontSize: 13, borderBottom: "1px solid #e2e8f0" }}>
        Position Actions
      </div>
      {positionSummaries.length === 0 ? (
        <div style={{ padding: 12, fontSize: 13, color: "#94a3b8" }}>No open positions.</div>
      ) : (
        <ul style={{ margin: 0, padding: "8px 12px", listStyle: "none" }}>
          {positionSummaries.map((p, i) => (
            <li key={i} style={{ fontSize: 13, borderBottom: "1px solid #f1f5f9", padding: "4px 0" }}>
              {JSON.stringify(p)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Strategy List (aggregate view) ────────────────────────────────────────────

interface StrategyListProps {
  strategies: TradingRoomStrategyEntry[];
  onSelect: (strategyId: string) => void;
}

function StrategyList({ strategies, onSelect }: StrategyListProps): JSX.Element {
  return (
    <div data-testid="strategy-list" style={{ padding: "8px 16px" }}>
      {strategies.length === 0 ? (
        <div data-testid="strategy-list-empty" style={{ fontSize: 13, color: "#94a3b8" }}>
          No strategies in the Trading Room.
        </div>
      ) : (
        <table
          data-testid="strategy-list-table"
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 500, color: "#64748b" }}>Strategy</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "#64748b" }}>Readiness</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "#64748b" }}>Monitoring</th>
              <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 500, color: "#64748b" }}>Pending</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((s) => {
              const total =
                (s.pending_event_counts.entry ?? 0) +
                (s.pending_event_counts.add ?? 0) +
                (s.pending_event_counts.reduce ?? 0) +
                (s.pending_event_counts.exit ?? 0) +
                (s.pending_event_counts.review ?? 0);
              return (
                <tr
                  key={s.strategy_id}
                  data-testid={`strategy-row-${s.strategy_id}`}
                  style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                  onClick={() => onSelect(s.strategy_id)}
                >
                  <td style={{ padding: "6px 0" }}>{s.title}</td>
                  <td style={{ padding: "6px 8px" }}>{s.readiness_state}</td>
                  <td style={{ padding: "6px 8px" }}>{s.monitoring_state}</td>
                  <td style={{ padding: "6px 0", textAlign: "right" }}>{total > 0 ? total : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Aggregate View (no strategy selected) ────────────────────────────────────

interface AggregateViewProps {
  aggregate: TradingRoomAggregate;
  events: TradingDecisionEvent[];
  eventsLoading: boolean;
  eventsEtag: string | null;
  onStrategySelect: (strategyId: string) => void;
}

function AggregateView({
  aggregate,
  events,
  eventsLoading,
  eventsEtag,
  onStrategySelect,
}: AggregateViewProps): JSX.Element {
  return (
    <div
      data-testid="trading-room-aggregate-view"
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}
    >
      <QueueSummaryStrip {...aggregate.queue_summary} />
      <RiskBanner
        state={aggregate.risk_summary.state}
        summary={aggregate.risk_summary.summary}
        alerts={aggregate.risk_summary.alerts}
      />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <StrategyList strategies={aggregate.strategies} onSelect={onStrategySelect} />
          <TradingEventQueue events={events} loading={eventsLoading} eventsEtag={eventsEtag} />
        </div>
        <PositionActionQueue positionSummaries={aggregate.position_summaries ?? []} />
      </div>
    </div>
  );
}

// ── V11 Proposal Generation And Workspace Shell ──────────────────────────────

const GENERATION_STEPS = [
  "讀取 Winner Branch Score、confidence 與 trust",
  "分析分點關係映射與資金遷移",
  "整理分點群組、遷移與分布模型",
  "建立事件領先研究與證據索引",
  "轉譯候選、進場、加碼、減碼與出場規則",
  "校準部位、槓桿、流動性與風險限制",
  "串接回測、shadow 與監控規則",
  "產生 Views 與 widgets",
  "安排 layout 並套用個人化偏好",
];

function TradingRoomGenerationProgress({
  strategyTitle,
  strategyVersion,
}: {
  strategyTitle: string;
  strategyVersion: string;
}) {
  return (
    <section
      data-testid="trading-room-generation-progress"
      style={{
        background: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
      }}
    >
      <div>
        <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700 }}>Trading Servant</div>
        <h2 style={{ color: "#0f172a", fontSize: 18, fontWeight: 800, letterSpacing: 0, margin: "2px 0 0" }}>
          交易僕人正在建立「{strategyTitle || strategyVersion}」交易操盤室
        </h2>
        <p style={{ color: "#475569", fontSize: 13, lineHeight: 1.5, margin: "6px 0 0", maxWidth: 840 }}>
          我會先替您把完整操盤頁面準備好。您不需要從空白版面開始；完成後可自行拖曳、刪除、增加、縮放，或直接交代我修改任何圖表。
        </p>
      </div>
      <ol
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {GENERATION_STEPS.map((step, index) => (
          <li
            key={step}
            style={{
              alignItems: "center",
              background: index < 2 ? "#eff6ff" : "#f8fafc",
              border: `1px solid ${index < 2 ? "#bfdbfe" : "#e2e8f0"}`,
              borderRadius: 8,
              color: "#334155",
              display: "flex",
              fontSize: 12,
              gap: 8,
              minHeight: 42,
              padding: "8px 10px",
            }}
          >
            <span
              style={{
                alignItems: "center",
                background: index < 2 ? "#2563eb" : "#cbd5e1",
                borderRadius: 999,
                color: "#ffffff",
                display: "inline-flex",
                flex: "0 0 20px",
                fontSize: 11,
                fontWeight: 700,
                height: 20,
                justifyContent: "center",
                width: 20,
              }}
            >
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function chartSpecSummary(spec: ChartSpecV1): string {
  const channels = Object.entries(spec.encodings ?? {})
    .map(([channel, encoding]) => `${channel}:${encoding.field}`)
    .join(" · ");
  return channels ? `${spec.kind} · ${channels}` : spec.kind;
}

function WorkspaceWidgetCard({ widget }: { widget: TradingRoomWidgetSpec }) {
  const validation = validateTradingRoomWidgetSpec(widget);
  const placement = widget.placement;
  const columnStart = Math.max(1, Math.min(12, (placement.x ?? 0) + 1));
  const width = Math.max(1, Math.min(12, placement.width || 4));
  const rowStart = Math.max(1, (placement.y ?? 0) + 1);
  const height = Math.max(1, Math.min(6, placement.height || 3));

  return (
    <section
      data-testid={`workspace-widget-${widget.id}`}
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        gridColumn: `${columnStart} / span ${Math.min(width, 13 - columnStart)}`,
        gridRow: `${rowStart} / span ${height}`,
        minHeight: 220,
        minWidth: 0,
        padding: 12,
      }}
    >
      <header style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ color: "#0f172a", fontSize: 14, fontWeight: 700, margin: 0 }}>{widget.title}</h3>
          <p style={{ color: "#475569", fontSize: 12, lineHeight: 1.45, margin: "4px 0 0" }}>{widget.purpose}</p>
        </div>
        <span
          style={{
            background: validation.ok ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${validation.ok ? "#a7f3d0" : "#fecaca"}`,
            borderRadius: 999,
            color: validation.ok ? "#047857" : "#b91c1c",
            flex: "0 0 auto",
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 8px",
          }}
        >
          {validation.ok ? "validated" : "review"}
        </span>
      </header>

      <div style={{ color: "#64748b", display: "grid", fontSize: 12, gap: 4 }}>
        <span>{validation.title}</span>
        <span>{widget.dataSource}</span>
        <span>{formatSensitivityLabel(widget.sensitivity)}</span>
        <span>{chartSpecSummary(widget.chartSpec)}</span>
      </div>

      <p style={{ color: "#334155", fontSize: 12, lineHeight: 1.45, margin: 0 }}>{widget.whyIncluded}</p>

      {validation.ok ? (
        <ChartSpecRenderer data={[]} height={180} spec={widget.chartSpec} />
      ) : (
        <div data-testid={`workspace-widget-${widget.id}-validation`} style={{ color: "#b91c1c", fontSize: 12 }}>
          {validation.messages.join(" ")}
        </div>
      )}
    </section>
  );
}

function TradingRoomWorkspaceShell({ workspace }: { workspace: TradingRoomWorkspace }) {
  const sortedViews = [...workspace.views].sort((a, b) => a.order - b.order);
  const initialViewId = workspace.activeViewId || sortedViews[0]?.id;
  const [activeViewId, setActiveViewId] = useState(initialViewId);
  const activeView = sortedViews.find((view) => view.id === activeViewId) ?? sortedViews[0];

  useEffect(() => {
    setActiveViewId(initialViewId);
  }, [initialViewId, workspace.id]);

  if (!activeView) {
    return (
      <div data-testid="trading-room-workspace-empty" style={{ color: "#94a3b8", fontSize: 13, padding: 16 }}>
        Workspace contains no views.
      </div>
    );
  }

  return (
    <section data-testid="trading-room-workspace-shell" style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
      <header style={{ borderBottom: "1px solid #e2e8f0", padding: "10px 16px" }}>
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700 }}>Workspace Shell</div>
            <h2 style={{ color: "#0f172a", fontSize: 18, fontWeight: 800, letterSpacing: 0, margin: "2px 0 0" }}>
              {workspace.strategyVersion}
            </h2>
          </div>
          <div style={{ color: "#64748b", display: "flex", flexWrap: "wrap", fontSize: 12, gap: 8 }}>
            <span>Status: {workspace.status}</span>
            <span>Dashboard v{workspace.dashboardVersion}</span>
            <span>Updated {new Date(workspace.updatedAt).toLocaleString()}</span>
          </div>
        </div>
        <nav data-testid="workspace-view-tabs" style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto" }}>
          {sortedViews.map((view) => (
            <button
              aria-selected={view.id === activeView.id}
              data-testid={`workspace-view-tab-${view.id}`}
              key={view.id}
              onClick={() => setActiveViewId(view.id)}
              style={{
                background: view.id === activeView.id ? "#eff6ff" : "#ffffff",
                border: "1px solid #cbd5e1",
                borderBottomColor: view.id === activeView.id ? "#2563eb" : "#cbd5e1",
                borderRadius: 6,
                color: view.id === activeView.id ? "#1d4ed8" : "#334155",
                cursor: "pointer",
                flex: "0 0 auto",
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 10px",
              }}
              type="button"
            >
              {view.title}
            </button>
          ))}
        </nav>
      </header>

      <div data-testid={`workspace-active-view-${activeView.id}`} style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
        <div style={{ color: "#475569", fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
          <strong style={{ color: "#0f172a" }}>{activeView.title}</strong> · {activeView.purpose}
          {activeView.warnings?.length ? (
            <div style={{ color: "#b45309", marginTop: 4 }}>
              {activeView.warnings.map((warning, index) => (
                <span key={`${activeView.id}-warning-${index}`}>{safeWarningText(warning)}</span>
              ))}
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridAutoRows: "minmax(72px, auto)",
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          }}
        >
          {activeView.widgets.map((widget) => (
            <WorkspaceWidgetCard key={widget.id} widget={widget} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Strategy Workspace View (specific strategy selected) ──────────────────────

interface StrategyWorkspaceViewProps {
  strategyId: string;
  strategy: TradingRoomStrategyEntry | undefined;
  aggregate: TradingRoomAggregate;
  events: TradingDecisionEvent[];
  eventsLoading: boolean;
  eventsEtag: string | null;
  strategyVersion?: string;
  onBackToWorkshop?: () => void;
}

function StrategyWorkspaceView({
  strategyId,
  strategy,
  aggregate,
  events,
  eventsLoading,
  eventsEtag,
  strategyVersion,
  onBackToWorkshop,
}: StrategyWorkspaceViewProps): JSX.Element {
  const filteredEvents = events.filter((ev) => ev.strategy_id === strategyId);

  const resolvedStrategyVersion = strategyVersion ?? strategy?.strategy_spec_registry_id ?? "";
  const [proposal, setProposal] = useState<TradingRoomWorkspaceProposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposalRevision, setProposalRevision] = useState(0);
  const [selectedPreviewViewId, setSelectedPreviewViewId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<TradingRoomWorkspace | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    setWorkspace(null);
    setSelectedPreviewViewId(null);
  }, [strategyId, resolvedStrategyVersion]);

  useEffect(() => {
    if (!resolvedStrategyVersion) {
      setProposal(null);
      setProposalLoading(false);
      setProposalError(null);
      return;
    }

    let cancelled = false;
    setProposal(null);
    setProposalError(null);
    setProposalLoading(true);

    createTradingRoomWorkspaceProposal(
      strategyId,
      {
        personalizationHints: { source: "trading_room_join", surface: "agora" },
        strategyVersion: resolvedStrategyVersion,
        tradingRoomReady: strategy?.readiness_state === "ready",
      },
      { idempotencyKey: newUUID() },
    )
      .then((nextProposal) => {
        if (cancelled) return;
        setProposal(nextProposal);
        setSelectedPreviewViewId(nextProposal.views[0]?.id ?? null);
        setProposalLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setProposalError(err instanceof Error ? err.message : "Workspace proposal generation failed.");
        setProposalLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [proposalRevision, resolvedStrategyVersion, strategy?.readiness_state, strategyId]);

  async function handleAcceptProposal() {
    if (!proposal) return;
    setAccepting(true);
    setProposalError(null);
    try {
      const nextWorkspace = await acceptTradingRoomWorkspaceProposal(
        strategyId,
        proposal.proposalId,
        { expectedStatus: "preview" },
        { idempotencyKey: newUUID() },
      );
      setWorkspace(nextWorkspace);
    } catch (err) {
      setProposalError(err instanceof Error ? err.message : "Workspace proposal acceptance failed.");
    } finally {
      setAccepting(false);
    }
  }

  function regenerateProposal() {
    setWorkspace(null);
    setProposal(null);
    setSelectedPreviewViewId(null);
    setProposalRevision((prev) => prev + 1);
  }

  return (
    <div
      data-testid={`strategy-workspace-${strategyId}`}
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}
    >
      <div style={{ padding: "8px 16px", borderBottom: "1px solid #e2e8f0", fontSize: 13, flexShrink: 0 }}>
        <strong>{strategy?.title ?? strategyId}</strong>
        {strategy && (
          <span style={{ marginLeft: 12, color: "#64748b" }}>
            {strategy.readiness_state} · {strategy.monitoring_state}
          </span>
        )}
      </div>
      <RiskBanner
        state={aggregate.risk_summary.state}
        summary={aggregate.risk_summary.summary}
        alerts={aggregate.risk_summary.alerts}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!resolvedStrategyVersion ? (
            <div
              data-testid="trading-room-strategy-version-required"
              style={{ padding: 16, fontSize: 13, color: "#b45309" }}
            >
              Strategy version is required before Trading Room proposal generation.
            </div>
          ) : workspace ? (
            <TradingRoomWorkspaceShell workspace={workspace} />
          ) : proposalLoading ? (
            <TradingRoomGenerationProgress
              strategyTitle={strategy?.title ?? strategyId}
              strategyVersion={resolvedStrategyVersion}
            />
          ) : proposal ? (
            <div style={{ flex: 1, overflow: "auto" }}>
              <WorkspaceProposalPreview
                busy={accepting}
                error={proposalError}
                onAccept={handleAcceptProposal}
                onAdjustLayout={() => setSelectedPreviewViewId(proposal.views[0]?.id ?? null)}
                onBackToWorkshop={onBackToWorkshop}
                onPreviewView={(view) => setSelectedPreviewViewId(view.id)}
                onRegenerate={regenerateProposal}
                proposal={proposal}
                selectedViewId={selectedPreviewViewId}
              />
            </div>
          ) : (
            <div
              data-testid="trading-room-proposal-error"
              style={{ padding: 16, fontSize: 13, color: "#b91c1c" }}
            >
              {proposalError ?? "Workspace proposal unavailable."}
              <div>
                <button
                  data-testid="trading-room-proposal-retry"
                  onClick={regenerateProposal}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    color: "#334155",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    marginTop: 8,
                    padding: "6px 10px",
                  }}
                  type="button"
                >
                  重新產生
                </button>
              </div>
            </div>
          )}

          <TradingEventQueue events={filteredEvents} loading={eventsLoading} eventsEtag={eventsEtag} />
        </div>
        <PositionActionQueue positionSummaries={aggregate.position_summaries ?? []} />
      </div>
    </div>
  );
}

// ── Root Page ─────────────────────────────────────────────────────────────────

type LoadState = "loading" | "loaded" | "error";

interface TradingRoomPageProps {
  strategyId?: string;
  strategyVersion?: string;
  onBackToWorkshop?: () => void;
  onStrategySelect?: (strategyId: string | undefined) => void;
}

export function TradingRoomPage({
  strategyId,
  strategyVersion,
  onBackToWorkshop,
  onStrategySelect,
}: TradingRoomPageProps): JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [aggregate, setAggregate] = useState<TradingRoomAggregate | null>(null);
  const [events, setEvents] = useState<TradingDecisionEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsEtag, setEventsEtag] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");

    getTradingRoom()
      .then((agg) => {
        if (cancelled) return;
        setAggregate(agg);
        setLoadState("loaded");
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setEventsLoading(true);

    listDecisionEvents()
      .then(({ items, etag }) => {
        if (cancelled) return;
        setEvents(items);
        setEventsEtag(etag);
        setEventsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setEventsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleStrategySelect = (id: string | undefined) => {
    onStrategySelect?.(id);
  };

  if (loadState === "loading") {
    return (
      <div
        data-testid="trading-room-loading"
        style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#94a3b8" }}
      >
        Loading Trading Room…
      </div>
    );
  }

  if (loadState === "error" || !aggregate) {
    return (
      <div
        data-testid="trading-room-error"
        style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#ef4444" }}
      >
        Failed to load Trading Room.
      </div>
    );
  }

  const activeStrategy = strategyId
    ? aggregate.strategies.find((s) => s.strategy_id === strategyId)
    : undefined;

  return (
    <div
      data-testid="trading-room-page"
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}
    >
      <StrategyLensSwitcher
        strategies={aggregate.strategies}
        activeStrategyId={strategyId}
        onSelect={handleStrategySelect}
      />

      {strategyId ? (
        <StrategyWorkspaceView
          strategyId={strategyId}
          strategy={activeStrategy}
          aggregate={aggregate}
          events={events}
          eventsLoading={eventsLoading}
          eventsEtag={eventsEtag}
          onBackToWorkshop={onBackToWorkshop}
          strategyVersion={strategyVersion}
        />
      ) : (
        <AggregateView
          aggregate={aggregate}
          events={events}
          eventsLoading={eventsLoading}
          eventsEtag={eventsEtag}
          onStrategySelect={(id) => handleStrategySelect(id)}
        />
      )}
    </div>
  );
}
