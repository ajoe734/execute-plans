import React, { useEffect, useReducer, useRef, useCallback, useState } from "react";
import {
  listWorkshops,
  getWorkshop,
  getWorkshopCompleteness,
  getWorkshopReadiness,
  listWorkshopCards,
  openWorkshopStream,
  type WorkshopCard,
  type StrategyReadinessAssessment,
  type WorkshopStreamEvent,
} from "@/lib/bff-v1/agora/workshops";
import type { StrategyWorkshop, StrategyCompleteness } from "@/lib/bff-v1/agora/workshops";
import { WorkshopCardRenderer } from "@/agora/components/WorkshopCardRenderer";
import { StrategyCompletenessRail } from "@/agora/components/StrategyCompletenessRail";
import "@/agora/agoraDesign.css";

// ---------------------------------------------------------------------------
// Card list reducer
// ---------------------------------------------------------------------------

interface CardState {
  cards: WorkshopCard[];
  lastEventId: string | null;
}

type CardAction =
  | { type: "RESET"; cards: WorkshopCard[] }
  | { type: "UPSERT"; card: WorkshopCard }
  | { type: "SET_LAST_EVENT_ID"; id: string };

function cardReducer(state: CardState, action: CardAction): CardState {
  switch (action.type) {
    case "RESET":
      return { ...state, cards: action.cards };
    case "UPSERT": {
      const idx = state.cards.findIndex((c) => c.card_id === action.card.card_id);
      if (idx === -1) {
        return { ...state, cards: [...state.cards, action.card] };
      }
      const updated = [...state.cards];
      updated[idx] = action.card;
      return { ...state, cards: updated };
    }
    case "SET_LAST_EVENT_ID":
      return { ...state, lastEventId: action.id };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Workshop list view
// ---------------------------------------------------------------------------

type ListState = "loading" | "empty" | "loaded" | "error";

function WorkshopListView(): JSX.Element {
  const [state, setState] = useState<ListState>("loading");
  const [workshops, setWorkshops] = useState<StrategyWorkshop[]>([]);

  useEffect(() => {
    let cancelled = false;
    listWorkshops()
      .then((items) => {
        if (cancelled) return;
        setWorkshops(items);
        setState(items.length === 0 ? "empty" : "loaded");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="agora-page flex h-full flex-col" data-testid="strategy-workshop-page-list">
      <div className="agora-subheader">
        <div className="agora-title-row">
          <span className="agora-title">贏家分點策略討論</span>
          <span className="agora-badge agora-badge-ai">V4</span>
          <span className="text-xs text-[var(--ag-muted)]">研究狀態：回測完成 · 待裁示</span>
          <div className="agora-progress"><span style={{ width: "82%" }} /></div>
          <span className="text-xs font-bold text-[var(--ag-ai)]">完整度 82%</span>
        </div>
        <button className="agora-action" type="button">加入交易操盤室</button>
      </div>
      <div className="agora-workshop-layout min-h-0 flex-1">
        <main className="agora-conversation">
          <div className="agora-hypothesis">
            <div className="mb-3 text-[11px] font-bold uppercase text-[var(--ag-ai)]">交易員原始假說</div>
            從每一檔股票的關係人持股開始，找出可能對應的交易分點，計算分點過去進出場是否賺錢、
            穩定性如何，建立贏家分點分數。若分點買進後由另一分點賣出，要掃描可能的關聯分點與資金遷移，
            並對照未來三到六個月重大訊息、併購或財報變化，建立信賴值、上漲機率與部位方式。
          </div>
          <div className="mx-auto mt-4 grid max-w-[760px] gap-3">
            {[
              ["僕人理解的策略核心", "識別具有持續獲利能力或資訊領先特徵的券商分點／分點群組，再以其最新異常交易作為股票候選與進出場信號。"],
              ["推導出的研究子問題", "關係人與分點如何映射、分點是否具重複獲利能力、資金遷移如何辨識、異常交易是否領先事件。"],
              ["不可直接斷言事項", "公開資料只能建立資訊領先關聯或可能對應的統計證據，不能直接斷言違法或內線。"],
            ].map(([title, body]) => (
              <section className="agora-card p-4" key={title}>
                <div className="agora-card-title">✦ {title}</div>
                <p className="agora-card-body mt-2">{body}</p>
              </section>
            ))}
          </div>
          <div className="mx-auto mt-4 max-w-[760px]">
            {state === "loading" && (
              <div className="agora-card p-4 text-xs text-[var(--ag-muted)]" data-testid="workshop-list-loading">Loading workshops…</div>
            )}
            {(state === "empty" || state === "error") && (
              <div className="agora-card p-4" data-testid="workshop-list-empty">
                <div className="agora-card-title">目前沒有 live workshop session</div>
                <p className="agora-card-body mt-2">已顯示設計稿指定的策略工坊工作區骨架，等待 BFF 回補實際 session。</p>
              </div>
            )}
            {state === "loaded" && (
              <ul className="grid gap-2" data-testid="workshop-list">
                {workshops.map((ws) => (
                  <li className="agora-card p-3" key={ws.workshop_id} data-testid={`workshop-item-${ws.workshop_id}`}>
                    <div className="agora-card-title">{ws.subject.title ?? ws.workshop_id}</div>
                    <div className="agora-card-body mt-1">{ws.workshop_id}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mx-auto mt-4 flex max-w-[760px] flex-wrap gap-2">
            {["完整 V4 評斷", "把 V4 改更保守", "合併 V2 與 V4", "只重跑 V1/V4/V5", "要求事件領先細節"].map((item) => (
              <span className="agora-chip" key={item}>{item}</span>
            ))}
          </div>
          <div className="mx-auto mt-4 max-w-[760px]">
            <div className="agora-composer">
              <span className="text-xs font-bold text-[var(--ag-muted)]">交代策略 · 修改規則 · 要求研究 · 實驗結果 · 指定版本或要求重跑</span>
              <button className="agora-action" type="button">交代</button>
            </div>
          </div>
        </main>
        <aside className="agora-right-rail">
          <div className="agora-right-section">
            <div className="agora-card-title">事前完整度 · 12 圖等</div>
            <p className="agora-card-body mt-2">研究項目會被標成已確認、僕人推定、尚缺或薄弱，交易操盤室只接收已通過門檻的版本。</p>
          </div>
          {[
            ["已確認", "研究對象與市場範圍", "agora-badge-green"],
            ["僕人推定", "關係人與分點映射", "agora-badge-warn"],
            ["已確認", "贏家分點評分", "agora-badge-green"],
            ["僕人推定", "分點遷移與反向流", "agora-badge-warn"],
            ["已確認", "事件領先關聯", "agora-badge-green"],
            ["尚缺", "進場與持有週期", "agora-badge-warn"],
            ["尚缺", "加碼 / 減碼 / 出場", "agora-badge-warn"],
            ["薄弱 / 衝突", "部位與槓桿", "agora-badge-red"],
          ].map(([stateLabel, body, tone]) => (
            <div className="agora-right-section" key={body}>
              <div className="agora-card-title">
                <span className={`agora-badge ${tone} mr-2`}>{stateLabel}</span>
              </div>
              <p className="agora-card-body mt-2">{body}</p>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workshop session view
// ---------------------------------------------------------------------------

interface SessionViewProps {
  workshopId: string;
  onAddToTradingRoom?: () => void;
}

function WorkshopSessionView({ workshopId, onAddToTradingRoom }: SessionViewProps): JSX.Element {
  const [workshop, setWorkshop] = useState<StrategyWorkshop | null>(null);
  const [completeness, setCompleteness] = useState<StrategyCompleteness | null>(null);
  const [readiness, setReadiness] = useState<StrategyReadinessAssessment | null>(null);
  const [composerValue, setComposerValue] = useState("");

  const [cardState, dispatch] = useReducer(cardReducer, {
    cards: [],
    lastEventId: null,
  });

  // Initial data load
  useEffect(() => {
    let cancelled = false;
    getWorkshop(workshopId)
      .then((ws) => { if (!cancelled) setWorkshop(ws); })
      .catch(() => undefined);
    getWorkshopCompleteness(workshopId)
      .then((c) => { if (!cancelled && c) setCompleteness(c); })
      .catch(() => undefined);
    getWorkshopReadiness(workshopId)
      .then((r) => { if (!cancelled && r) setReadiness(r); })
      .catch(() => undefined);
    listWorkshopCards(workshopId)
      .then((items) => { if (!cancelled) dispatch({ type: "RESET", cards: items }); })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workshopId]);

  // SSE stream subscription — refreshes completeness/readiness on relevant events
  const refreshCompleteness = useCallback(() => {
    getWorkshopCompleteness(workshopId)
      .then((c) => { if (c) setCompleteness(c); })
      .catch(() => undefined);
  }, [workshopId]);

  const refreshReadiness = useCallback(() => {
    getWorkshopReadiness(workshopId)
      .then((r) => { if (r) setReadiness(r); })
      .catch(() => undefined);
  }, [workshopId]);

  const refreshCards = useCallback(() => {
    listWorkshopCards(workshopId)
      .then((items) => dispatch({ type: "RESET", cards: items }))
      .catch(() => undefined);
  }, [workshopId]);

  useEffect(() => {
    const teardown = openWorkshopStream(workshopId, (event: WorkshopStreamEvent) => {
      dispatch({ type: "SET_LAST_EVENT_ID", id: event.event_id });
      switch (event.event_type) {
        case "workshop.completeness.updated":
          refreshCompleteness();
          break;
        case "workshop.readiness.updated":
          refreshReadiness();
          break;
        case "workshop.servant.response.completed":
        case "research.plan.created":
        case "research.plan.approved":
        case "research.run.queued":
        case "research.run.progress":
        case "research.run.completed":
        case "research.run.failed":
        case "consultation.started":
        case "consultation.completed":
        case "workshop.patch.proposed":
        case "workshop.patch.validated":
        case "workshop.version.created":
          refreshCards();
          break;
        case "workshop.snapshot":
          refreshCards();
          refreshCompleteness();
          refreshReadiness();
          break;
        default:
          break;
      }
    });
    return teardown;
  }, [workshopId, refreshCards, refreshCompleteness, refreshReadiness]);

  // Derive the most recent next_question card for the rail
  const nextQuestion =
    cardState.cards
      .filter((c) => c.card_type === "next_question")
      .sort((a, b) => b.sequence_no - a.sequence_no)[0] ?? null;

  const handleContinueDiscussion = useCallback((cardId: string) => {
    setComposerValue((prev) => (prev ? prev : `Re: card ${cardId} — `));
  }, []);

  return (
    <div
      data-testid="strategy-workshop-page-session"
      style={{ display: "flex", height: "100%", overflow: "hidden" }}
    >
      {/* Left: conversation + composer */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div
          data-testid="workshop-conversation"
          style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
        >
          {!workshop && (
            <div data-testid="workshop-session-loading">Loading…</div>
          )}
          {cardState.cards
            .slice()
            .sort((a, b) => a.sequence_no - b.sequence_no)
            .map((card) => (
              <WorkshopCardRenderer
                key={card.card_id}
                card={card}
                onContinueDiscussion={handleContinueDiscussion}
              />
            ))}
        </div>

        <div
          data-testid="servant-composer"
          style={{ borderTop: "1px solid #e2e8f0", padding: 12 }}
        >
          <input
            type="text"
            value={composerValue}
            onChange={(e) => setComposerValue(e.target.value)}
            placeholder="Message the workshop servant…"
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
        </div>
      </div>

      {/* Right: completeness rail + trading room CTA */}
      <div
        data-testid="completeness-rail"
        style={{
          width: 240,
          borderLeft: "1px solid #e2e8f0",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: 1, overflow: "auto" }}>
          <StrategyCompletenessRail
            completeness={completeness}
            readiness={readiness}
            nextQuestion={nextQuestion}
          />
        </div>

        {/* Add to Trading Room — enabled only when trading_room gate ready AND handler provided */}
        <div
          style={{
            padding: "10px 12px",
            borderTop: "1px solid #e2e8f0",
            flexShrink: 0,
          }}
        >
          {(() => {
            const tradingRoomReady = readiness?.highest_ready_gate === "trading_room";
            const isActive = tradingRoomReady && !!onAddToTradingRoom;
            const disabledReason = readiness
              ? tradingRoomReady
                ? null
                : `Trading Room gate not yet ready (highest: ${readiness.highest_ready_gate ?? "none"})`
              : "Readiness not yet assessed";
            return (
              <>
                <button
                  data-testid="add-to-trading-room-btn"
                  disabled={!isActive}
                  aria-disabled={!isActive}
                  title={disabledReason ?? undefined}
                  onClick={isActive ? onAddToTradingRoom : undefined}
                  style={{
                    width: "100%",
                    padding: "7px 12px",
                    borderRadius: 6,
                    border: "none",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: isActive ? "pointer" : "not-allowed",
                    background: isActive ? "#1d4ed8" : "#e5e7eb",
                    color: isActive ? "#fff" : "#9ca3af",
                    transition: "background 0.15s",
                  }}
                >
                  Add to Trading Room
                </button>
                {disabledReason && (
                  <div
                    data-testid="add-to-trading-room-reason"
                    style={{ fontSize: 10, color: "#9ca3af", marginTop: 4, textAlign: "center" }}
                  >
                    {disabledReason}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Legacy test-id shims for existing tests */}
        {completeness && (
          <div data-testid="completeness-grade" style={{ display: "none" }}>
            {completeness.overall_grade}
          </div>
        )}
        {readiness && (
          <div data-testid="workshop-readiness" style={{ display: "none" }}>
            {readiness.highest_ready_gate ?? "Not ready"}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

interface StrategyWorkshopPageProps {
  workshopId?: string;
  onAddToTradingRoom?: () => void;
}

export function StrategyWorkshopPage({ workshopId, onAddToTradingRoom }: StrategyWorkshopPageProps): JSX.Element {
  if (workshopId) {
    return <WorkshopSessionView workshopId={workshopId} onAddToTradingRoom={onAddToTradingRoom} />;
  }
  return <WorkshopListView />;
}
