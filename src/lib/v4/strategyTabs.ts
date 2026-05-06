// v4 / Pack C §C071 — Strategy Costs / Calendar tab schemas.

export interface StrategyCostBreakdown {
  commissionBps: number;
  slippageBps: number;
  borrowCostBps?: number;
  financingCostBps?: number;
  exchangeFeesBps?: number;
  taxBps?: number;
  costModelId: string;
  lastUpdatedAt: string;
}

export type StrategyCalendarEventType =
  | "trading_holiday" | "half_day" | "rebalance_date"
  | "earnings" | "macro_event" | "custom";

export interface StrategyCalendarEvent {
  date: string;
  exchange: string;
  eventType: StrategyCalendarEventType;
  label: string;
  source: "exchange_calendar" | "custom" | "research_note";
}
