// v3 §17 Agora KPI / Daily Brief Formulas. Resolves G56.

export interface AgoraKpiSpec {
  id: string;
  formula: string;
  source: string;
  /** Refresh cadence: "realtime" | seconds. */
  refresh: "realtime" | number;
}

export const AGORA_KPI_SPECS: readonly AgoraKpiSpec[] = [
  { id: "watchlistMoveCount",       formula: "count watchlist assets where abs(return1dPct) >= user.watchlistMoveThresholdPct", source: "/bff/agora/watchlist", refresh: 60 },
  { id: "openRiskAlerts",           formula: "count risk alerts where status in [new, acknowledged, assigned, investigating]", source: "/bff/alerts", refresh: "realtime" },
  { id: "signalReviewQueue",        formula: "count signals where reviewStatus = pending_trader_review", source: "/bff/agora/signals", refresh: "realtime" },
  { id: "paperLiveDivergenceCount", formula: "count strategies where abs(paperReturnWindow - liveReturnWindow) >= divergenceThresholdPct", source: "/bff/strategies", refresh: 300 },
  { id: "personaBriefCount",        formula: "count persona daily notes generated in last 24h", source: "/bff/agora/daily", refresh: 300 },
  { id: "researchQuestionCount",    formula: "count research tasks where status in [new, triaged]", source: "/bff/research/tasks", refresh: "realtime" },
  { id: "incidentNeedsTraderInput", formula: "count incidents where requiredInputRole includes 'trader'", source: "/bff/incidents", refresh: "realtime" },
] as const;

export const AGORA_KPI_THRESHOLDS = {
  watchlistMoveThresholdPct: 2.0,
  divergenceThresholdPct: 5.0,
  dailyBriefLookbackHours: 24,
} as const;
