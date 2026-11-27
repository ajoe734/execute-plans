/**
 * DecisionQueueWidget — V11 View A "Decision Queue" rendered inside a
 * generated Trading Room view.
 *
 * Entry, add, reduce, and exit lanes are always visible together so the
 * trader sees every pending decision at once. Rows come from the live
 * decision-event feed (GET /bff/agora/trading-room/stream with a bounded
 * polling fallback), so the queue updates without reloading the page.
 *
 * Decision support only: this widget never offers an order action.
 */

import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import type {
  TradingDecisionEvent,
  TradingRoomStreamMode,
} from "@/lib/bff-v1/agora/tradingRoom";

export const DECISION_QUEUE_WIDGET_TYPES = new Set([
  "signal_decision_queue",
  "overview_decision_queue",
]);

export const DECISION_QUEUE_LANES = ["entry", "add", "reduce", "exit"] as const;
export type DecisionQueueLane = (typeof DECISION_QUEUE_LANES)[number];

const PENDING_STATES = new Set(["approaching", "triggered", "pending_review"]);

const LANE_COLOR: Record<DecisionQueueLane, string> = {
  entry: "#4ade80",
  add: "#60a5fa",
  reduce: "#fbbf24",
  exit: "#f87171",
};

const MODE_COLOR: Record<TradingRoomStreamMode, string> = {
  connecting: "#8c96a6",
  live: "#56d98b",
  polling: "#e8b750",
  closed: "#8c96a6",
};

const MAX_ROWS_PER_LANE = 5;

export function isDecisionQueueWidget(widgetType: string): boolean {
  return DECISION_QUEUE_WIDGET_TYPES.has(widgetType);
}

export function groupDecisionQueue(
  events: TradingDecisionEvent[],
): Record<DecisionQueueLane, TradingDecisionEvent[]> {
  const lanes: Record<DecisionQueueLane, TradingDecisionEvent[]> = {
    entry: [],
    add: [],
    reduce: [],
    exit: [],
  };
  for (const event of events) {
    if (!PENDING_STATES.has(event.state)) continue;
    const lane = event.event_kind as DecisionQueueLane;
    if (lane in lanes) lanes[lane].push(event);
  }
  for (const lane of DECISION_QUEUE_LANES) {
    lanes[lane].sort((a, b) => String(b.triggered_at ?? "").localeCompare(String(a.triggered_at ?? "")));
  }
  return lanes;
}

function formatTime(value: string | null | undefined, locale: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function laneLabel(lane: DecisionQueueLane, t: TFunction): string {
  return t(`agora.tradingRoom.page.eventKinds.${lane}`);
}

export interface DecisionQueueWidgetProps {
  events: TradingDecisionEvent[];
  streamMode?: TradingRoomStreamMode;
  updatedAt?: string | null;
  onSelectEvent?: (decisionEventId: string) => void;
}

export function DecisionQueueWidget({
  events,
  streamMode,
  updatedAt,
  onSelectEvent,
}: DecisionQueueWidgetProps): JSX.Element {
  const { i18n, t } = useTranslation();
  const lanes = groupDecisionQueue(events);
  const updated = formatTime(updatedAt, i18n.resolvedLanguage);

  return (
    <div
      data-testid="decision-queue-widget"
      data-stream-mode={streamMode ?? "connecting"}
      style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%", minHeight: 0, paddingTop: 6 }}
    >
      <div style={{ alignItems: "center", color: "#8c96a6", display: "flex", flexWrap: "wrap", fontSize: 10, gap: 8 }}>
        <span
          data-testid="decision-queue-stream-mode"
          style={{ color: MODE_COLOR[streamMode ?? "connecting"], fontWeight: 700 }}
        >
          ● {t(`agora.tradingRoom.live.modes.${streamMode ?? "connecting"}`)}
        </span>
        {updated ? <span data-testid="decision-queue-updated-at">{t("agora.tradingRoom.live.updatedAt", { time: updated })}</span> : null}
        <span style={{ marginLeft: "auto" }}>{t("agora.tradingRoom.live.readOnly")}</span>
      </div>
      <div
        data-testid="decision-queue-lanes"
        style={{ display: "grid", flex: 1, gap: 6, gridTemplateColumns: "repeat(4, minmax(0, 1fr))", minHeight: 0 }}
      >
        {DECISION_QUEUE_LANES.map((lane) => {
          const items = lanes[lane];
          return (
            <section
              aria-label={laneLabel(lane, t)}
              data-testid={`decision-queue-lane-${lane}`}
              key={lane}
              style={{
                background: "#11151d",
                border: "1px solid #2a2e38",
                borderRadius: 6,
                borderTop: `2px solid ${LANE_COLOR[lane]}`,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <header style={{ alignItems: "baseline", display: "flex", justifyContent: "space-between", padding: "4px 6px" }}>
                <strong style={{ color: LANE_COLOR[lane], fontSize: 11 }}>{laneLabel(lane, t)}</strong>
                <span data-testid={`decision-queue-lane-${lane}-count`} style={{ color: "#f0ece4", fontSize: 12, fontWeight: 800 }}>
                  {items.length}
                </span>
              </header>
              {items.length === 0 ? (
                <div style={{ color: "#737d8e", fontSize: 10, padding: "2px 6px 6px" }}>{t("agora.tradingRoom.live.laneEmpty")}</div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, overflow: "auto", padding: "0 4px 4px" }}>
                  {items.slice(0, MAX_ROWS_PER_LANE).map((event) => (
                    <li key={event.decision_event_id}>
                      <button
                        data-testid={`decision-queue-item-${event.decision_event_id}`}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          onSelectEvent?.(event.decision_event_id);
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          borderBottom: "1px solid #1e2330",
                          color: "#c4ccda",
                          cursor: onSelectEvent ? "pointer" : "default",
                          display: "flex",
                          fontSize: 11,
                          gap: 4,
                          justifyContent: "space-between",
                          padding: "3px 2px",
                          textAlign: "left",
                          width: "100%",
                        }}
                        type="button"
                      >
                        <span style={{ color: "#f0ece4", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {event.subject.symbol}
                        </span>
                        <span style={{ color: "#8c96a6", whiteSpace: "nowrap" }}>
                          {t(`agora.tradingRoom.page.states.${event.state}`, { defaultValue: event.state })}
                        </span>
                      </button>
                    </li>
                  ))}
                  {items.length > MAX_ROWS_PER_LANE ? (
                    <li style={{ color: "#8c96a6", fontSize: 10, padding: "2px" }}>
                      {t("agora.tradingRoom.live.more", { count: items.length - MAX_ROWS_PER_LANE })}
                    </li>
                  ) : null}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default DecisionQueueWidget;
