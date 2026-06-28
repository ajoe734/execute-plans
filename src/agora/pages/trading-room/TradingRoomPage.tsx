import React, { useEffect, useState } from "react";
import {
  getTradingRoom,
  listDecisionEvents,
  decideOnEvent,
  type TradingRoomAggregate,
  type TradingRoomStrategyEntry,
  type TradingDecisionEvent,
  type DecisionChoice,
} from "@/lib/bff-v1/agora/tradingRoom";
import { getDashboardRecipeById } from "@/lib/bff-v1/agora/dashboard";
import type { DashboardRecipeV2, WidgetSpecV2 } from "@/lib/bff-v1/agora/types";
import { DashboardGridEditor } from "@/agora/dashboard/DashboardGridEditor";
import type { WidgetPlacement } from "@/agora/dashboard/DashboardGridEditor";
import "@/agora/agoraDesign.css";

function newUUID(): string {
  return crypto.randomUUID();
}

const DESIGN_CANDIDATES = [
  { rank: "01", code: "8086", name: "宏捷科", score: 92, lag: "7", catalyst: "高", chip: "低", liquidity: "充足", state: "待討論" },
  { rank: "02", code: "6669", name: "緯穎", score: 85, lag: "6", catalyst: "高", chip: "低", liquidity: "充足", state: "待討論" },
  { rank: "03", code: "3017", name: "奇鋐", score: 88, lag: "5", catalyst: "中", chip: "中", liquidity: "充足", state: "監控中" },
  { rank: "04", code: "3035", name: "智原", score: 79, lag: "4", catalyst: "中", chip: "中", liquidity: "普通", state: "候選" },
  { rank: "05", code: "2454", name: "聯發科", score: 71, lag: "2", catalyst: "低", chip: "弱", liquidity: "高", state: "Parking" },
] as const;

const DESIGN_ALERTS = [
  "同券商分點在 3017 出現反向賣超，可能影響本 Lens 2 檔候選。",
  "8086 距離進場條件 1.2%，分點買盤仍需連續 2 日確認。",
  "技嘉跌破停損但尚未處理，需裁示是否送 Shadow 比較。",
];

const DESIGN_FALLBACK_AGGREGATE: TradingRoomAggregate = {
  spec_version: "1.0",
  user_scope_ref: "design-fallback",
  strategies: [],
  queue_summary: { entry: 3, add: 0, reduce: 1, exit: 1, review: 2 },
  top_decision_events: [],
  position_summaries: [],
  risk_summary: {
    state: "watch",
    summary: "Live Trading Room aggregate 暫時不可用，已切到設計稿示意工作區。",
    alerts: ["目前為唯讀 fallback data；待 BFF 回復後會自動顯示實際策略資料。"],
  },
  snapshot_at: "2026-06-19T02:42:00.000Z",
  data_cutoff: "2026-06-19T02:42:00.000Z",
};

function toneClass(value: string): string {
  if (/高|待|已觸發|warning|critical/i.test(value)) return "agora-badge-warn";
  if (/低|監控|ready|normal|monitoring/i.test(value)) return "agora-badge-green";
  if (/弱|剔除|expired|invalidated/i.test(value)) return "agora-badge-red";
  return "agora-badge-ai";
}

function formatUpdated(value?: string): string {
  if (!value) return "10:42";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "10:42";
  return date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
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
      className="agora-lens-bar"
      data-testid="strategy-lens-switcher"
      role="listbox"
      aria-label="Strategy workspace switcher"
    >
      <span className="agora-badge agora-badge-ai">AI personalized v7</span>
      <button
        role="option"
        aria-selected={activeStrategyId === undefined}
        data-testid="strategy-lens-all"
        onClick={() => onSelect(undefined)}
        className="agora-lens-button"
      >
        籌碼大戶部位建立
      </button>
      {strategies.map((s) => (
        <button
          key={s.strategy_id}
          role="option"
          aria-selected={activeStrategyId === s.strategy_id}
          data-testid={`strategy-lens-${s.strategy_id}`}
          onClick={() => onSelect(s.strategy_id)}
          className="agora-lens-button"
        >
          {s.title}
        </button>
      ))}
      <span className="agora-ghost-action ml-auto">技術突破</span>
      <span className="agora-ghost-action">AI server 落後補漲</span>
    </div>
  );
}

// ── Risk Banner ───────────────────────────────────────────────────────────────

interface RiskBannerProps {
  state: string;
  summary?: string;
  alerts?: string[];
}

function RiskBanner({ state, summary, alerts }: RiskBannerProps): JSX.Element | null {
  if (state === "normal") return null;
  return (
    <div
      className="border-b border-[var(--ag-line)] bg-[rgba(245,192,79,0.12)] px-5 py-2 text-xs text-[var(--ag-warn)]"
      data-testid="risk-banner"
      data-risk-state={state}
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
      className="grid grid-cols-5 gap-2 border-b border-[var(--ag-line)] bg-[#151922] px-5 py-3"
      data-testid="queue-summary-strip"
    >
      {[
        ["Entry", entry, "queue-entry-count"],
        ["Add", add, "queue-add-count"],
        ["Reduce", reduce, "queue-reduce-count"],
        ["Exit", exit, "queue-exit-count"],
        ["Review", review, "queue-review-count"],
      ].map(([label, value, testId]) => (
        <span className="agora-kpi" data-testid={String(testId)} key={String(testId)}>
          <strong>{value}</strong>
          <span>{label}</span>
        </span>
      ))}
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
    <div className="agora-widget min-h-[220px]" data-testid="trading-event-queue">
      <div className="agora-widget-header">
        <span className="h-2 w-2 rounded-full bg-[var(--ag-green)]" />
        <div className="agora-card-title">交易候選 / 待確認</div>
        <span className="ml-auto font-mono text-[11px] text-[var(--ag-faint)]">{events.length}</span>
      </div>
      {loading ? (
        <div className="p-4 text-xs text-[var(--ag-muted)]" data-testid="event-queue-loading">
          Loading events…
        </div>
      ) : events.length === 0 ? (
        <div className="agora-widget-body" data-testid="event-queue-empty">
          <div className="space-y-2">
            {DESIGN_ALERTS.map((alert, index) => (
              <div className="agora-card-soft flex gap-3 p-3" key={alert}>
                <span className={index === 2 ? "text-[var(--ag-red)]" : "text-[var(--ag-ai)]"}>●</span>
                <span className="text-xs leading-5 text-[var(--ag-muted)]">{alert}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <table
          data-testid="event-queue-table"
          className="agora-table"
        >
          <thead>
            <tr>
              <th>標的</th>
              <th>種類</th>
              <th>狀態</th>
              <th>信賴</th>
              <th>EV</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <React.Fragment key={ev.decision_event_id}>
                <tr
                  data-testid={`event-row-${ev.decision_event_id}`}
                  aria-expanded={expandedId === ev.decision_event_id}
                  className="cursor-pointer"
                  onClick={() => toggleExpand(ev.decision_event_id)}
                >
                  <td><strong>{ev.subject.symbol}</strong></td>
                  <td>{EVENT_KIND_LABEL[ev.event_kind] ?? ev.event_kind}</td>
                  <td><span className={`agora-badge ${toneClass(ev.state)}`}>{STATE_LABEL[ev.state] ?? ev.state}</span></td>
                  <td>
                    {(ev.confidence.value * 100).toFixed(0)}%
                  </td>
                  <td>
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
      className="h-full overflow-auto"
      data-testid="position-action-queue"
    >
      <div className="agora-right-section">
        <div className="agora-card-title">部位 / 候選影響</div>
        <p className="agora-card-body mt-2">「技嘉」已跌破停損但尚未處理，且為人工加入的候選池外標的。</p>
      </div>
      {positionSummaries.length === 0 ? (
        <div className="space-y-3 p-4">
          {[
            ["2454", "聯發科", "持有 5 張", "事件波動高，建議事件前減半"],
            ["3035", "智原", "候選", "IP 連動，受益但波動較小"],
          ].map(([code, name, pos, risk]) => (
            <div className="agora-card-soft p-3" key={code}>
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm text-[var(--ag-text)]">{code} {name}</strong>
                <span className="agora-badge agora-badge-warn">{pos}</span>
              </div>
              <p className="agora-card-body mt-2">{risk}</p>
            </div>
          ))}
        </div>
      ) : (
        <ul className="m-0 list-none p-4">
          {positionSummaries.map((p, i) => (
            <li className="border-b border-[var(--ag-line)] py-2 text-xs text-[var(--ag-muted)]" key={i}>
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
    <div className="agora-widget" data-testid="strategy-list">
      <div className="agora-widget-header">
        <div>
          <div className="agora-card-title">候選池</div>
          <div className="mt-1 text-[11px] text-[var(--ag-faint)]">Winner Branch Score × 漲幅落後 × 籌碼支持</div>
        </div>
        <span className="agora-badge agora-badge-ai ml-auto">{strategies.length > 0 ? strategies.length : 38}</span>
      </div>
      {strategies.length > 0 ? (
        <table
          data-testid="strategy-list-table"
          className="agora-table"
        >
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Readiness</th>
              <th>Monitoring</th>
              <th>Pending</th>
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
                  className="cursor-pointer"
                  onClick={() => onSelect(s.strategy_id)}
                >
                  <td><strong>{s.title}</strong></td>
                  <td><span className={`agora-badge ${toneClass(s.readiness_state)}`}>{s.readiness_state}</span></td>
                  <td>{s.monitoring_state}</td>
                  <td>{total > 0 ? total : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <>
          <div className="sr-only" data-testid="strategy-list-empty">No strategies in the Trading Room.</div>
          <table className="agora-table">
            <thead>
              <tr>
                <th>#</th>
                <th>標的</th>
                <th>籌碼分數</th>
                <th>漲幅落後</th>
                <th>催化</th>
                <th>籌碼</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {DESIGN_CANDIDATES.map((candidate) => (
                <tr key={candidate.code}>
                  <td>{candidate.rank}</td>
                  <td>
                    <strong>{candidate.code}</strong>
                    <div className="text-[11px] text-[var(--ag-faint)]">{candidate.name}</div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span>{candidate.score}</span>
                      <span className="agora-spark w-16"><span style={{ width: `${candidate.score}%` }} /></span>
                    </div>
                  </td>
                  <td>{candidate.lag}</td>
                  <td><span className={`agora-badge ${toneClass(candidate.catalyst)}`}>{candidate.catalyst}</span></td>
                  <td><span className={`agora-badge ${toneClass(candidate.chip)}`}>{candidate.chip}</span></td>
                  <td><span className={`agora-badge ${toneClass(candidate.state)}`}>{candidate.state}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
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
      className="agora-page flex h-full flex-col overflow-hidden"
      data-testid="trading-room-aggregate-view"
    >
      <QueueSummaryStrip {...aggregate.queue_summary} />
      <RiskBanner
        state={aggregate.risk_summary.state}
        summary={aggregate.risk_summary.summary}
        alerts={aggregate.risk_summary.alerts}
      />
      <div className="agora-radar-layout flex-1">
        <aside className="agora-left-rail p-4">
          <div className="agora-card p-4">
            <div className="agora-card-title">籌碼大戶部位建立</div>
            <p className="agora-card-body mt-2">
              追蹤分點連續吸貨、買盤集中且價格仍處低檔的個股，捕捉主力建立部位早期訊號。
            </p>
            <div className="mt-4 text-[11px] text-[var(--ag-green)]">● AI 最近更新 · 3 分鐘前</div>
          </div>
          <div className="mt-5 space-y-2">
            {[
              ["候選池", "38", "agora-badge-ai"],
              ["待討論", "12", "agora-badge-warn"],
              ["監控中", "9", "agora-badge-green"],
              ["Shadow 中", "4", "agora-badge-ai"],
            ].map(([label, value, tone]) => (
              <div className="flex items-center justify-between rounded-lg bg-[#202634] px-3 py-2" key={label}>
                <span className="text-sm text-[var(--ag-muted)]">{label}</span>
                <span className={`agora-badge ${tone}`}>{value}</span>
              </div>
            ))}
          </div>
        </aside>

        <section className="agora-dashboard">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase text-[var(--ag-faint)]">候選與監控池</div>
              <h2 className="mt-1 text-lg font-extrabold text-[var(--ag-text)]">落後補漲候選排名</h2>
            </div>
            <button className="agora-action" type="button">候選清單</button>
          </div>
          <div className="agora-widget-grid">
            <div className="col-span-12 xl:col-span-8">
              <StrategyList strategies={aggregate.strategies} onSelect={onStrategySelect} />
            </div>
            <div className="agora-widget col-span-12 xl:col-span-4">
              <div className="agora-widget-header">
                <div className="agora-card-title">相似度 × 漲幅落後</div>
                <span className="ml-auto text-[10px] text-[var(--ag-faint)]">size=流動性</span>
              </div>
              <div className="agora-widget-body">
                <div className="relative h-52 rounded-md border border-[var(--ag-line)] bg-[#151922]">
                  {DESIGN_CANDIDATES.map((candidate, index) => (
                    <div
                      className="absolute rounded-full border border-[rgba(255,255,255,.18)] bg-[var(--ag-ai-soft)] text-[10px] font-bold text-[var(--ag-ai)]"
                      key={candidate.code}
                      style={{
                        left: `${18 + index * 14}%`,
                        bottom: `${18 + Number(candidate.lag) * 8}%`,
                        width: `${28 + index * 4}px`,
                        height: `${28 + index * 4}px`,
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      {candidate.code}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-3 text-[10px] text-[var(--ag-faint)]">
                  <span className="text-[var(--ag-red)]">● 籌碼強</span>
                  <span className="text-[var(--ag-warn)]">● 中</span>
                  <span className="text-[var(--ag-green)]">● 弱</span>
                </div>
              </div>
            </div>
            <div className="col-span-12 xl:col-span-7">
              <TradingEventQueue events={events} loading={eventsLoading} eventsEtag={eventsEtag} />
            </div>
            <div className="agora-widget col-span-12 xl:col-span-5">
              <div className="agora-widget-header">
                <div className="agora-card-title">關聯分點賣超風險</div>
                <span className="agora-badge agora-badge-warn ml-auto">需確認</span>
              </div>
              <div className="agora-widget-body space-y-3">
                {DESIGN_ALERTS.map((alert) => (
                  <div className="agora-card-soft p-3 text-xs leading-5 text-[var(--ag-muted)]" key={alert}>
                    {alert}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="agora-right-rail">
          <div className="agora-right-section">
            <div className="agora-card-title">助手理解</div>
            <p className="agora-card-body mt-2">
              您希望優先掌握大戶分點建立部位，助理會新增一張同券商反向流風險，並將候選排名提前。
            </p>
          </div>
          <PositionActionQueue positionSummaries={aggregate.position_summaries ?? []} />
        </aside>
      </div>
    </div>
  );
}

// ── Strategy Recipe Section ───────────────────────────────────────────────────

interface StrategyRecipeSectionProps {
  recipe: DashboardRecipeV2;
}

function StrategyRecipeSection({ recipe }: StrategyRecipeSectionProps): JSX.Element {
  const [activeViewIdx, setActiveViewIdx] = useState(0);
  const [viewPlacements, setViewPlacements] = useState<Record<string, WidgetPlacement[]>>(
    () => Object.fromEntries(recipe.views.map((v) => [v.view_id, v.placements as WidgetPlacement[]]))
  );

  const activeView = recipe.views[activeViewIdx];
  const placements = (activeView ? viewPlacements[activeView.view_id] : undefined) ?? [];
  const widgets: WidgetSpecV2[] = activeView?.widgets ?? [];

  if (!activeView) return <></>;

  return (
    <div data-testid="strategy-recipe-workspace" style={{ flex: 1, overflow: "auto", padding: 8 }}>
      {recipe.views.length > 1 && (
        <div
          data-testid="recipe-view-tabs"
          style={{ display: "flex", gap: 4, marginBottom: 8, borderBottom: "1px solid #e2e8f0", paddingBottom: 4 }}
        >
          {recipe.views.map((v, idx) => (
            <button
              key={v.view_id}
              data-testid={`recipe-view-tab-${v.view_id}`}
              aria-selected={idx === activeViewIdx}
              onClick={() => setActiveViewIdx(idx)}
              style={{
                padding: "4px 12px",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: idx === activeViewIdx ? 600 : 400,
                borderBottom: idx === activeViewIdx ? "2px solid #2563eb" : "2px solid transparent",
              }}
            >
              {v.title}
            </button>
          ))}
        </div>
      )}

      <DashboardGridEditor
        viewId={activeView.view_id}
        recipeId={recipe.recipe_id}
        placements={placements}
        widgets={widgets}
        operatorId="trading-room"
        onPlacementsChange={(newPlacements) =>
          setViewPlacements((prev) => ({ ...prev, [activeView.view_id]: newPlacements }))
        }
        onWidgetRemove={() => {}}
        onWidgetAdd={() => {}}
        onWidgetChartChange={() => {}}
        onPersonalizationEvent={() => {}}
      />
    </div>
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
}

function StrategyWorkspaceView({
  strategyId,
  strategy,
  aggregate,
  events,
  eventsLoading,
  eventsEtag,
}: StrategyWorkspaceViewProps): JSX.Element {
  const filteredEvents = events.filter((ev) => ev.strategy_id === strategyId);

  const [recipe, setRecipe] = useState<DashboardRecipeV2 | null>(null);
  const [recipeLoading, setRecipeLoading] = useState(true);

  const recipeId = strategy?.dashboard_recipe_id;

  useEffect(() => {
    if (!recipeId) {
      setRecipe(null);
      setRecipeLoading(false);
      return;
    }

    let cancelled = false;
    setRecipe(null);
    setRecipeLoading(true);

    getDashboardRecipeById(recipeId)
      .then((r) => {
        if (cancelled) return;
        setRecipe(r);
        setRecipeLoading(false);
      })
      .catch(() => {
        if (!cancelled) setRecipeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [recipeId]);

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
          {recipeLoading ? (
            <div
              data-testid="strategy-recipe-loading"
              style={{ padding: 16, fontSize: 13, color: "#94a3b8" }}
            >
              Loading strategy workspace…
            </div>
          ) : recipe ? (
            <StrategyRecipeSection key={strategyId} recipe={recipe} />
          ) : (
            <div
              data-testid="strategy-recipe-unavailable"
              style={{ padding: 16, fontSize: 13, color: "#94a3b8" }}
            >
              Dashboard recipe unavailable for this strategy.
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
  onStrategySelect?: (strategyId: string | undefined) => void;
}

export function TradingRoomPage({ strategyId, onStrategySelect }: TradingRoomPageProps): JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [aggregate, setAggregate] = useState<TradingRoomAggregate | null>(null);
  const [aggregateLoadIssue, setAggregateLoadIssue] = useState<string | null>(null);
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
        setAggregateLoadIssue(null);
        setLoadState("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setAggregate(DESIGN_FALLBACK_AGGREGATE);
        setAggregateLoadIssue(err instanceof Error ? err.message : "Trading Room aggregate unavailable");
        setLoadState("loaded");
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
      className="agora-page"
      data-testid="trading-room-page"
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}
    >
      <div className="agora-subheader">
        <div className="agora-title-row">
          <span className="agora-title">贏家分點 V4</span>
          <span className="agora-badge agora-badge-green">監控中</span>
          <span className="text-xs text-[var(--ag-muted)]">Dashboard：個人化 v3</span>
          <span className="text-xs text-[var(--ag-muted)]">最近更新：{formatUpdated(aggregate.snapshot_at)}</span>
          <div className="agora-progress"><span style={{ width: "82%" }} /></div>
          <span className="text-xs font-bold text-[var(--ag-ai)]">完整度 82%</span>
        </div>
        <button className="agora-ghost-action" type="button">切換策略</button>
        <button className="agora-action" type="button">調整版面</button>
        <button className="agora-ghost-action" type="button">版本紀錄</button>
        <button className="agora-ghost-action" type="button">策略工坊</button>
        {aggregateLoadIssue && (
          <span
            className="agora-badge agora-badge-warn"
            data-testid="trading-room-error"
            title={aggregateLoadIssue}
          >
            FALLBACK DATA
          </span>
        )}
      </div>
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
