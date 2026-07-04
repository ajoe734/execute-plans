import React, { useEffect, useState } from "react";
import {
  acceptTradingRoomWorkspaceProposalWithMeta,
  createTradingRoomWorkspaceProposal,
  getTradingRoom,
  listDecisionEvents,
  decideOnEvent,
  type TradingRoomAggregate,
  type TradingRoomStrategyEntry,
  type TradingDecisionEvent,
  type DecisionChoice,
  type TradingRoomWorkspaceResult,
} from "@/lib/bff-v1/agora/tradingRoom";
import { BffError } from "@/lib/bff-v1/errors";
import type {
  TradingRoomWorkspaceProposal,
} from "@/lib/bff-v1/agora/tradingRoomTypes";
import { WorkspaceProposalPreview } from "@/agora/trading-room/WorkspaceProposalPreview";
import { WorkspaceGridEditor } from "@/agora/trading-room/WorkspaceGridEditor";

function newUUID(): string {
  return crypto.randomUUID();
}

interface TradingRoomUiError {
  message: string;
  status?: number;
  code?: string;
}

function tradingRoomErrorMessage(err: BffError, fallback: string): string {
  switch (err.status) {
    case 403:
      return "目前權限或範圍無法讀取這個操盤室提案。";
    case 404:
      return "這個操盤室提案或工作區已不存在，請重新產生。";
    case 409:
      return "操盤室提案狀態已變更，請重新產生後再套用。";
    case 412:
      return "操盤室狀態已過期，請重新整理後再繼續。";
    case 501:
      return "交易操盤室生成功能尚未在目前 BFF 啟用。";
    default:
      return err.message || fallback;
  }
}

function toTradingRoomUiError(err: unknown, fallback: string): TradingRoomUiError {
  if (err instanceof BffError) {
    return {
      code: err.code,
      message: tradingRoomErrorMessage(err, fallback),
      status: err.status,
    };
  }
  return {
    message: err instanceof Error ? err.message : fallback,
  };
}

function shouldClearStaleWorkspaceState(error: TradingRoomUiError): boolean {
  if (
    error.status === 403 ||
    error.status === 404 ||
    error.status === 409 ||
    error.status === 412 ||
    error.status === 501
  ) {
    return true;
  }
  return (
    error.code === "PERMISSION_DENIED" ||
    error.code === "TENANT_SCOPE_MISMATCH" ||
    error.code === "RESOURCE_NOT_FOUND" ||
    error.code === "STATE_CONFLICT" ||
    error.code === "ILLEGAL_TRANSITION" ||
    error.code === "IDEMPOTENCY_CONFLICT" ||
    error.code === "CAPABILITY_MISSING" ||
    error.code === "FEATURE_DISABLED"
  );
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
        borderBottom: "1px solid #2a2e38",
        overflowX: "auto",
        flexShrink: 0,
        background: "#171b22",
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
          borderBottom: activeStrategyId === undefined ? "2px solid #e8b750" : "2px solid transparent",
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
                ? "2px solid #e8b750"
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
  normal: "#111417",
  watch: "#1e1c0e",
  warning: "#231808",
  critical: "#230e0e",
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
        borderBottom: "1px solid #2a2e38",
        fontSize: 13,
        color: "#f0ece4",
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
        borderBottom: "1px solid #2a2e38",
        fontSize: 12,
        color: "#8c96a6",
        background: "#171b22",
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
      <td colSpan={5} style={{ padding: "8px 16px", background: "#1a2030", borderBottom: "2px solid #2a2e38" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, fontSize: 12 }}>

          {/* Signal Quality */}
          <div data-testid="detail-confidence">
            <div style={{ fontWeight: 600, color: "#8c96a6", marginBottom: 4 }}>Signal Quality</div>
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
            <div style={{ fontWeight: 600, color: "#8c96a6", marginBottom: 4 }}>Expected Value</div>
            <div>Horizon: {ev.expected_value.horizon} ({ev.expected_value.unit})</div>
            <div>Gross: {ev.expected_value.gross > 0 ? "+" : ""}{ev.expected_value.gross.toFixed(4)}</div>
            <div>Cost: {ev.expected_value.cost.toFixed(4)}</div>
            <div>Net: {ev.expected_value.net > 0 ? "+" : ""}{ev.expected_value.net.toFixed(4)}</div>
            <div>Downside: {ev.expected_value.downside.toFixed(4)}</div>
          </div>

          {/* Suggested Action */}
          <div data-testid="detail-suggested-action">
            <div style={{ fontWeight: 600, color: "#8c96a6", marginBottom: 4 }}>Suggested Action</div>
            <div style={{ textTransform: "capitalize", fontWeight: 500 }}>{ev.suggested_action}</div>
            {ev.suggested_size && (
              <>
                {ev.suggested_size.size_hint && <div>Size hint: {ev.suggested_size.size_hint}</div>}
                {ev.suggested_size.portfolio_pct != null && (
                  <div>Portfolio %: {(ev.suggested_size.portfolio_pct * 100).toFixed(1)}%</div>
                )}
                <div style={{ color: "#737d8e", fontSize: 11 }}>Non-binding</div>
              </>
            )}
            {ev.data_cutoff && (
              <div style={{ marginTop: 4, color: "#8c96a6" }}>Data cutoff: {ev.data_cutoff}</div>
            )}
            <div
              data-testid="detail-no-order-route"
              style={{ marginTop: 4, fontSize: 11, color: "#4ade80", fontWeight: 500 }}
            >
              {ev.no_order_route_proof}
            </div>
          </div>

          {/* Invalidation */}
          <div data-testid="detail-invalidation">
            <div style={{ fontWeight: 600, color: "#8c96a6", marginBottom: 4 }}>Invalidation</div>
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
            <div style={{ fontWeight: 600, color: "#8c96a6", marginBottom: 4 }}>Rationale</div>
            {ev.rationale.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 2 }}>
                <span style={{ color: "#737d8e", minWidth: 32 }}>{(r.confidence * 100).toFixed(0)}%</span>
                <span>{r.claim}</span>
              </div>
            ))}
          </div>
        )}

        {/* Risk Notes */}
        {ev.risk_notes.length > 0 && (
          <div data-testid="detail-risk-notes" style={{ marginTop: 10, fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: "#8c96a6", marginBottom: 4 }}>Risk Notes</div>
            {ev.risk_notes.map((rn, i) => (
              <div
                key={i}
                style={{
                  padding: "4px 8px",
                  background: rn.severity === "critical" || rn.severity === "high" ? "#230e0e" : "#1e1c0e",
                  borderRadius: 4,
                  marginBottom: 2,
                }}
              >
                <span style={{ fontWeight: 500 }}>[{rn.severity}] {rn.domain}:</span> {rn.summary}
                {rn.mitigation && <span style={{ color: "#8c96a6" }}> — {rn.mitigation}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Evidence Refs */}
        {ev.evidence_refs.length > 0 && (
          <div data-testid="detail-evidence-refs" style={{ marginTop: 10, fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: "#8c96a6", marginBottom: 4 }}>
              Evidence ({ev.evidence_refs.length})
            </div>
            {ev.evidence_refs.map((ref, i) => (
              <div key={i} style={{ color: "#8c96a6" }}>
                <span style={{ color: "#737d8e" }}>{ref.ref_type}</span> {ref.ref_id}
                {ref.summary ? ` — ${ref.summary}` : null}
              </div>
            ))}
          </div>
        )}

        {/* Trader Decision Actions */}
        <div data-testid="detail-trader-actions" style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
          {callState === "success" ? (
            <span data-testid="detail-decision-confirmed" style={{ fontSize: 12, color: "#4ade80", fontWeight: 500 }}>
              Decision recorded: {decidedChoice}
            </span>
          ) : (
            <>
              <span style={{ fontSize: 12, color: "#8c96a6", marginRight: 4 }}>Trader decision:</span>
              {(["approve", "reject", "defer", "modify"] as DecisionChoice[]).map((choice) => (
                <button
                  key={choice}
                  data-testid={`decide-${choice}-${ev.decision_event_id}`}
                  disabled={!canDecide}
                  onClick={() => handleDecide(choice)}
                  style={{
                    padding: "3px 10px",
                    fontSize: 12,
                    border: "1px solid #2a2e38",
                    borderRadius: 4,
                    cursor: canDecide ? "pointer" : "not-allowed",
                    background: choice === "approve" ? "rgba(74,222,128,0.12)" : choice === "reject" ? "rgba(248,113,113,0.12)" : "#1e2330",
                    color: choice === "approve" ? "#4ade80" : choice === "reject" ? "#f87171" : "#8c96a6",
                    opacity: canDecide ? 1 : 0.5,
                  }}
                >
                  {choice.charAt(0).toUpperCase() + choice.slice(1)}
                </button>
              ))}
              {callState === "loading" && (
                <span data-testid="detail-decision-loading" style={{ fontSize: 12, color: "#737d8e" }}>
                  Sending…
                </span>
              )}
              {callState === "error" && callError && (
                <span data-testid="detail-decision-error" style={{ fontSize: 12, color: "#f87171" }}>
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
      <div style={{ padding: "8px 16px", fontWeight: 600, fontSize: 13, borderBottom: "1px solid #2a2e38" }}>
        Decision Event Queue
      </div>
      {loading ? (
        <div data-testid="event-queue-loading" style={{ padding: 16, fontSize: 13, color: "#737d8e" }}>
          Loading events…
        </div>
      ) : events.length === 0 ? (
        <div data-testid="event-queue-empty" style={{ padding: 16, fontSize: 13, color: "#737d8e" }}>
          No pending decision events.
        </div>
      ) : (
        <table
          data-testid="event-queue-table"
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid #2a2e38" }}>
              <th style={{ textAlign: "left", padding: "6px 16px", fontWeight: 500, color: "#8c96a6" }}>Symbol</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "#8c96a6" }}>Kind</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "#8c96a6" }}>State</th>
              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500, color: "#8c96a6" }}>Confidence</th>
              <th style={{ textAlign: "right", padding: "6px 16px", fontWeight: 500, color: "#8c96a6" }}>EV (net)</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <React.Fragment key={ev.decision_event_id}>
                <tr
                  data-testid={`event-row-${ev.decision_event_id}`}
                  aria-expanded={expandedId === ev.decision_event_id}
                  style={{
                    borderBottom: expandedId === ev.decision_event_id ? "none" : "1px solid #2a2e38",
                    cursor: "pointer",
                    background: expandedId === ev.decision_event_id ? "#1a2030" : undefined,
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
      style={{ borderLeft: "1px solid #2a2e38", width: 240, overflow: "auto", flexShrink: 0, background: "#171b22" }}
    >
      <div style={{ padding: "8px 12px", fontWeight: 600, fontSize: 13, borderBottom: "1px solid #2a2e38" }}>
        Position Actions
      </div>
      {positionSummaries.length === 0 ? (
        <div style={{ padding: 12, fontSize: 13, color: "#737d8e" }}>No open positions.</div>
      ) : (
        <ul style={{ margin: 0, padding: "8px 12px", listStyle: "none" }}>
          {positionSummaries.map((p, i) => (
            <li key={i} style={{ fontSize: 13, borderBottom: "1px solid #2a2e38", padding: "4px 0" }}>
              {JSON.stringify(p)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Default Dynamic Entry (no explicit strategy selected) ────────────────────

function pendingEventTotal(strategy: TradingRoomStrategyEntry): number {
  return (
    (strategy.pending_event_counts.entry ?? 0) +
    (strategy.pending_event_counts.add ?? 0) +
    (strategy.pending_event_counts.reduce ?? 0) +
    (strategy.pending_event_counts.exit ?? 0) +
    (strategy.pending_event_counts.review ?? 0)
  );
}

const MONITORING_PRIORITY: Record<TradingRoomStrategyEntry["monitoring_state"], number> = {
  monitoring: 5,
  paper_requested: 4,
  shadow: 3,
  paused: 2,
  inactive: 1,
};

function selectDefaultReadyStrategy(
  strategies: TradingRoomStrategyEntry[],
): TradingRoomStrategyEntry | undefined {
  return strategies
    .filter((strategy) => strategy.readiness_state === "ready")
    .slice()
    .sort((a, b) => {
      const recipeDiff = Number(Boolean(b.dashboard_recipe_id)) - Number(Boolean(a.dashboard_recipe_id));
      if (recipeDiff !== 0) return recipeDiff;
      const pendingDiff = pendingEventTotal(b) - pendingEventTotal(a);
      if (pendingDiff !== 0) return pendingDiff;
      const monitoringDiff = MONITORING_PRIORITY[b.monitoring_state] - MONITORING_PRIORITY[a.monitoring_state];
      if (monitoringDiff !== 0) return monitoringDiff;
      return a.title.localeCompare(b.title);
    })[0];
}

function readinessReason(strategy: TradingRoomStrategyEntry): string {
  if (strategy.readiness_state === "conditional") {
    return "Conditional readiness: continue Strategy Workshop validation before proposal generation.";
  }
  if (strategy.readiness_state === "stale") {
    return strategy.staleness_reasons?.[0] ?? "Readiness is stale; refresh workshop evidence.";
  }
  return "Blocked readiness: Strategy Workshop must close the missing gate before Trading Room entry.";
}

interface TradingRoomDefaultEntryProps {
  aggregate: TradingRoomAggregate;
  onOpenWorkshop?: () => void;
  onStrategySelect: (strategyId: string) => void;
}

function TradingRoomDefaultEntry({
  aggregate,
  onOpenWorkshop,
  onStrategySelect,
}: TradingRoomDefaultEntryProps): JSX.Element {
  const strategies = aggregate.strategies;
  const pendingTotal = strategies.reduce((total, strategy) => total + pendingEventTotal(strategy), 0);
  const entryState = strategies.length === 0 ? "empty" : "no-ready-strategy";
  const readinessRows = strategies
    .slice()
    .sort((a, b) => {
      const readinessOrder: Record<TradingRoomStrategyEntry["readiness_state"], number> = {
        conditional: 0,
        stale: 1,
        blocked: 2,
        ready: 3,
      };
      const orderDiff = readinessOrder[a.readiness_state] - readinessOrder[b.readiness_state];
      if (orderDiff !== 0) return orderDiff;
      return (b.candidate_count ?? 0) - (a.candidate_count ?? 0);
    });

  return (
    <div
      data-entry-state={entryState}
      data-testid="trading-room-default-entry"
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}
    >
      <QueueSummaryStrip {...aggregate.queue_summary} />
      <RiskBanner
        state={aggregate.risk_summary.state}
        summary={aggregate.risk_summary.summary}
        alerts={aggregate.risk_summary.alerts}
      />

      <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
        <section
          style={{
            background: "#171b22",
            border: "1px solid #2a2e38",
            borderRadius: 8,
            display: "grid",
            gap: 14,
            padding: 18,
          }}
        >
          <div>
            <div style={{ color: "#8c96a6", fontSize: 12, fontWeight: 700 }}>Dynamic Entry</div>
            <h2 style={{ color: "#f0ece4", fontSize: 20, fontWeight: 800, letterSpacing: 0, margin: "4px 0 0" }}>
              {strategies.length === 0
                ? "Strategy Workshop is the next step"
                : "No strategy is ready for proposal generation yet"}
            </h2>
            <p style={{ color: "#8c96a6", fontSize: 13, lineHeight: 1.55, margin: "8px 0 0", maxWidth: 860 }}>
              {strategies.length === 0
                ? "The BFF returned no user-scoped Trading Room strategies, so the default route starts from workshop intake instead of an empty table shell."
                : "The BFF returned strategies, but none has reached the trading_room readiness gate. Continue the readiness workflow before opening a generated workspace."}
            </p>
          </div>

          <div
            data-testid="trading-room-default-snapshot"
            style={{
              color: "#8c96a6",
              display: "flex",
              flexWrap: "wrap",
              fontSize: 12,
              gap: 12,
            }}
          >
            <span>Strategies: {strategies.length}</span>
            <span>Ready: 0</span>
            <span>Pending decisions: {pendingTotal}</span>
            <span>Snapshot: {aggregate.snapshot_at || "unavailable"}</span>
            <span>Data cutoff: {aggregate.data_cutoff || "unavailable"}</span>
          </div>

          <div>
            <button
              data-testid="trading-room-open-workshop"
              disabled={!onOpenWorkshop}
              onClick={onOpenWorkshop}
              style={{
                background: onOpenWorkshop ? "#e8b750" : "#1e2330",
                border: "1px solid rgba(232,183,80,0.45)",
                borderRadius: 6,
                color: onOpenWorkshop ? "#111417" : "#737d8e",
                cursor: onOpenWorkshop ? "pointer" : "not-allowed",
                fontSize: 13,
                fontWeight: 800,
                padding: "8px 12px",
              }}
              type="button"
            >
              Open Strategy Workshop
            </button>
          </div>
        </section>

        {strategies.length > 0 ? (
          <section
            data-testid="trading-room-readiness-entry"
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              marginTop: 14,
            }}
          >
            {readinessRows.map((strategy) => (
              <article
                data-testid={`trading-room-readiness-${strategy.strategy_id}`}
                key={strategy.strategy_id}
                style={{
                  background: "#171b22",
                  border: "1px solid #2a2e38",
                  borderRadius: 8,
                  color: "#f0ece4",
                  padding: 14,
                }}
              >
                <div style={{ color: "#8c96a6", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                  {strategy.readiness_state} · {strategy.monitoring_state}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: "4px 0 0" }}>{strategy.title}</h3>
                <p style={{ color: "#8c96a6", fontSize: 12, lineHeight: 1.45, margin: "8px 0 0" }}>
                  {readinessReason(strategy)}
                </p>
                <div style={{ color: "#737d8e", display: "flex", flexWrap: "wrap", fontSize: 12, gap: 10, marginTop: 10 }}>
                  <span>Version: {strategy.strategy_spec_registry_id}</span>
                  <span>Candidates: {strategy.candidate_count ?? 0}</span>
                  <span>Pending: {pendingEventTotal(strategy)}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    data-testid={`trading-room-open-workshop-${strategy.strategy_id}`}
                    disabled={!onOpenWorkshop}
                    onClick={onOpenWorkshop}
                    style={{
                      background: "transparent",
                      border: "1px solid #2a2e38",
                      borderRadius: 6,
                      color: onOpenWorkshop ? "#e8b750" : "#737d8e",
                      cursor: onOpenWorkshop ? "pointer" : "not-allowed",
                      fontSize: 12,
                      padding: "6px 10px",
                    }}
                    type="button"
                  >
                    Review readiness
                  </button>
                  {strategy.readiness_state === "ready" && (
                    <button
                      data-testid={`trading-room-open-strategy-${strategy.strategy_id}`}
                      onClick={() => onStrategySelect(strategy.strategy_id)}
                      style={{
                        background: "#1e2330",
                        border: "1px solid #2a2e38",
                        borderRadius: 6,
                        color: "#f0ece4",
                        cursor: "pointer",
                        fontSize: 12,
                        padding: "6px 10px",
                      }}
                      type="button"
                    >
                      Open workspace
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section
            data-testid="trading-room-workshop-empty-entry"
            style={{
              background: "#171b22",
              border: "1px solid #2a2e38",
              borderRadius: 8,
              color: "#8c96a6",
              fontSize: 13,
              lineHeight: 1.5,
              marginTop: 14,
              padding: 14,
            }}
          >
            No BFF strategy records were available for this scope. Continue in the Strategy Workshop to create
            or restore a strategy-specific readiness packet.
          </section>
        )}
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
        background: "#171b22",
        borderBottom: "1px solid #2a2e38",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
      }}
    >
      <div>
        <div style={{ color: "#8c96a6", fontSize: 12, fontWeight: 700 }}>Trading Servant</div>
        <h2 style={{ color: "#f0ece4", fontSize: 18, fontWeight: 800, letterSpacing: 0, margin: "2px 0 0" }}>
          交易僕人正在建立「{strategyTitle || strategyVersion}」交易操盤室
        </h2>
        <p style={{ color: "#8c96a6", fontSize: 13, lineHeight: 1.5, margin: "6px 0 0", maxWidth: 840 }}>
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
              background: index < 2 ? "rgba(232,183,80,0.12)" : "#1a2030",
              border: `1px solid ${index < 2 ? "rgba(232,183,80,0.35)" : "#2a2e38"}`,
              borderRadius: 8,
              color: "#8c96a6",
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
                background: index < 2 ? "#e8b750" : "#2a2e38",
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
  const [proposalError, setProposalError] = useState<TradingRoomUiError | null>(null);
  const [proposalRevision, setProposalRevision] = useState(0);
  const [selectedPreviewViewId, setSelectedPreviewViewId] = useState<string | null>(null);
  const [workspaceResult, setWorkspaceResult] = useState<TradingRoomWorkspaceResult | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    setWorkspaceResult(null);
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
        const nextError = toTradingRoomUiError(err, "Workspace proposal generation failed.");
        if (shouldClearStaleWorkspaceState(nextError)) {
          setProposal(null);
          setWorkspaceResult(null);
          setSelectedPreviewViewId(null);
        }
        setProposalError(nextError);
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
      const nextWorkspace = await acceptTradingRoomWorkspaceProposalWithMeta(
        strategyId,
        proposal.proposalId,
        { expectedStatus: "preview" },
        { idempotencyKey: newUUID() },
      );
      setWorkspaceResult(nextWorkspace);
    } catch (err) {
      const nextError = toTradingRoomUiError(err, "Workspace proposal acceptance failed.");
      if (shouldClearStaleWorkspaceState(nextError)) {
        setProposal(null);
        setWorkspaceResult(null);
        setSelectedPreviewViewId(null);
      }
      setProposalError(nextError);
    } finally {
      setAccepting(false);
    }
  }

  function regenerateProposal() {
    setWorkspaceResult(null);
    setProposal(null);
    setSelectedPreviewViewId(null);
    setProposalRevision((prev) => prev + 1);
  }

  return (
    <div
      data-testid={`strategy-workspace-${strategyId}`}
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}
    >
      <div style={{ padding: "8px 16px", borderBottom: "1px solid #2a2e38", fontSize: 13, flexShrink: 0 }}>
        <strong>{strategy?.title ?? strategyId}</strong>
        {strategy && (
          <span style={{ marginLeft: 12, color: "#8c96a6" }}>
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
              style={{ padding: 16, fontSize: 13, color: "#e8b750" }}
            >
              Strategy version is required before Trading Room proposal generation.
            </div>
          ) : workspaceResult ? (
            <WorkspaceGridEditor
              initialEtag={workspaceResult.etag}
              initialWorkspace={workspaceResult.workspace}
              onWorkspaceChange={setWorkspaceResult}
            />
          ) : proposalLoading ? (
            <TradingRoomGenerationProgress
              strategyTitle={strategy?.title ?? strategyId}
              strategyVersion={resolvedStrategyVersion}
            />
          ) : proposal ? (
            <div style={{ flex: 1, overflow: "auto" }}>
              <WorkspaceProposalPreview
                busy={accepting}
                error={proposalError?.message ?? null}
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
              data-error-code={proposalError?.code ?? ""}
              data-error-status={proposalError?.status ?? ""}
              style={{ padding: 16, fontSize: 13, color: "#f87171" }}
            >
              {proposalError?.message ?? "Workspace proposal unavailable."}
              <div>
                <button
                  data-testid="trading-room-proposal-retry"
                  onClick={regenerateProposal}
                  style={{
                    background: "#171b22",
                    border: "1px solid #2a2e38",
                    borderRadius: 6,
                    color: "#8c96a6",
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
  onOpenWorkshop?: () => void;
  onStrategySelect?: (strategyId: string | undefined) => void;
}

export function TradingRoomPage({
  strategyId,
  strategyVersion,
  onBackToWorkshop,
  onOpenWorkshop,
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
        style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#737d8e", background: "#111417" }}
      >
        Loading Trading Room…
      </div>
    );
  }

  if (loadState === "error" || !aggregate) {
    return (
      <div
        data-testid="trading-room-error"
        style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#f87171", background: "#111417" }}
      >
        Failed to load Trading Room.
      </div>
    );
  }

  const defaultReadyStrategy =
    !strategyId && aggregate ? selectDefaultReadyStrategy(aggregate.strategies) : undefined;
  const effectiveStrategyId = strategyId ?? defaultReadyStrategy?.strategy_id;
  const activeStrategy = effectiveStrategyId
    ? aggregate.strategies.find((s) => s.strategy_id === effectiveStrategyId)
    : undefined;

  return (
    <div
      data-testid="trading-room-page"
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "#111417", color: "#f0ece4" }}
    >
      <StrategyLensSwitcher
        strategies={aggregate.strategies}
        activeStrategyId={effectiveStrategyId}
        onSelect={handleStrategySelect}
      />

      {effectiveStrategyId ? (
        <StrategyWorkspaceView
          strategyId={effectiveStrategyId}
          strategy={activeStrategy}
          aggregate={aggregate}
          events={events}
          eventsLoading={eventsLoading}
          eventsEtag={eventsEtag}
          onBackToWorkshop={onBackToWorkshop}
          strategyVersion={strategyVersion}
        />
      ) : (
        <TradingRoomDefaultEntry
          aggregate={aggregate}
          onOpenWorkshop={onOpenWorkshop}
          onStrategySelect={(id) => handleStrategySelect(id)}
        />
      )}
    </div>
  );
}
