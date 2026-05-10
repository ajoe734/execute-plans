import * as seed from "@/mocks/seed";
import type { DecisionJournalEntry, RiskLevel, Strategy } from "@/lib/bff/types";
import { paths } from "@/lib/bff-v1/paths";
import { strictItemsFrom, withStrictLiveOrMock } from "./liveRead";

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};

const asString = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const asNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const riskFrom = (value: unknown, fallback: RiskLevel = "medium"): RiskLevel => {
  const text = asString(value, fallback);
  return ["info", "low", "medium", "high", "critical"].includes(text) ? text as RiskLevel : fallback;
};

export interface AgoraSignal {
  id: string;
  strategyId: string;
  strategyName: string;
  alpha: string;
  side: "long" | "short";
  symbol: string;
  size: number;
  conviction: number;
  rationale: string;
  generatedAt: string;
  risk: RiskLevel;
  reviewStatus?: string;
}

export interface AgoraInsight {
  id: string;
  kind: "pattern" | "anomaly" | "research_idea" | "skill_suggestion";
  source: string;
  title: string;
  body: string;
  confidence: number;
  ts: string;
  read?: boolean;
}

export interface AgoraAskSession {
  id: string;
  sessionId: string;
  title: string;
  status: string;
  mode?: string;
  createdAt: string;
  updatedAt: string;
}

const mockSignalSymbols = ["TSM", "NVDA", "AAPL", "JPM", "BTCUSD", "XOM"];

function mockSignals(strategies: readonly Strategy[]): AgoraSignal[] {
  return strategies.slice(0, 5).map((s, i) => ({
    id: `sig_${i}`,
    strategyId: s.id,
    strategyName: s.name,
    alpha: s.alpha,
    side: i % 2 === 0 ? "long" : "short",
    symbol: mockSignalSymbols[i % mockSignalSymbols.length],
    size: 0.04 + (i * 0.013),
    conviction: 0.55 + (i * 0.07),
    rationale: i === 0
      ? "Momentum z-score crossed +1.8 with positive earnings drift; gross to risk budget cap."
      : i === 1
        ? "Mean-reversion trigger on overbought 14d RSI; expects fade into close."
        : "Composite score in top decile; volatility within target band.",
    generatedAt: new Date(Date.now() - i * 1800_000).toISOString(),
    risk: s.risk,
    reviewStatus: "pending_trader_review",
  }));
}

function adaptSignal(value: unknown, index: number): AgoraSignal {
  const item = asRecord(value);
  const id = asString(item.signal_id ?? item.signalId ?? item.id, `sig_${index}`);
  const side = asString(item.side, index % 2 === 0 ? "long" : "short") === "short" ? "short" : "long";
  const strategy = asRecord(item.strategy ?? item.targetStrategy);
  const symbol = asString(item.symbol ?? item.ticker ?? item.instrument, mockSignalSymbols[index % mockSignalSymbols.length]);
  return {
    id,
    strategyId: asString(item.strategy_id ?? item.strategyId ?? strategy.id, asString(item.scope_ref ?? item.scopeRef, "")),
    strategyName: asString(item.strategy_name ?? item.strategyName ?? strategy.name, asString(item.title, id)),
    alpha: asString(item.alpha ?? item.alpha_id ?? item.alphaId, "live-bff"),
    side,
    symbol,
    size: asNumber(item.size ?? item.weight ?? item.target_weight ?? item.targetWeight, 0),
    conviction: Math.max(0, Math.min(1, asNumber(item.conviction ?? item.confidence ?? item.score, 0))),
    rationale: asString(item.rationale ?? item.summary ?? item.description ?? item.title, "BFF signal"),
    generatedAt: asString(item.generated_at ?? item.generatedAt ?? item.created_at ?? item.createdAt ?? item.updated_at ?? item.updatedAt, new Date().toISOString()),
    risk: riskFrom(item.risk ?? item.riskLevel ?? item.severity, "medium"),
    reviewStatus: asString(item.reviewStatus ?? item.review_status ?? item.status, "pending_trader_review"),
  };
}

function adaptInsight(value: unknown, index: number): AgoraInsight {
  const item = asRecord(value);
  const id = asString(item.insight_id ?? item.insightId ?? item.id, `ins_${index}`);
  const tags = Array.isArray(item.tags) ? item.tags.map((tag) => String(tag).toLowerCase()) : [];
  const status = asString(item.status).toLowerCase();
  const kind: AgoraInsight["kind"] =
    tags.some((tag) => tag.includes("skill")) ? "skill_suggestion"
    : tags.some((tag) => tag.includes("research")) ? "research_idea"
    : status.includes("anomaly") || tags.some((tag) => tag.includes("anomaly")) ? "anomaly"
    : "pattern";
  const confidence = asRecord(item.confidence);
  return {
    id,
    kind,
    source: asString(item.source_ref ?? item.sourceRef ?? item.source, id),
    title: asString(item.title ?? item.summary ?? item.headline, id),
    body: asString(item.body ?? item.summary ?? item.description, ""),
    confidence: Math.max(0, Math.min(1, asNumber(confidence.score ?? item.confidence_score ?? item.confidenceScore ?? item.confidence, 0))),
    ts: asString(item.updated_at ?? item.updatedAt ?? item.created_at ?? item.createdAt, new Date().toISOString()),
    read: Boolean(item.read),
  };
}

function adaptJournalEntry(value: unknown, index: number): DecisionJournalEntry {
  const item = asRecord(value);
  const id = asString(item.entry_id ?? item.entryId ?? item.decision_id ?? item.decisionId ?? item.id, `journal_${index}`);
  const scope = asRecord(item.scope);
  return {
    id,
    subjectKind: asString(item.subjectKind ?? item.subject_kind ?? scope.type, "Agora"),
    subjectId: asString(item.subjectId ?? item.subject_id ?? scope.id ?? item.scope_ref ?? item.scopeRef, id),
    title: asString(item.title ?? item.decision ?? item.summary, id),
    decidedAt: asString(item.decidedAt ?? item.decided_at ?? item.updated_at ?? item.updatedAt ?? item.created_at ?? item.createdAt, new Date().toISOString()),
    decidedBy: asString(item.decidedBy ?? item.decided_by ?? item.actor_id ?? item.actorId, "agora"),
    outcome: ["pending", "good", "neutral", "bad"].includes(asString(item.outcome))
      ? asString(item.outcome) as DecisionJournalEntry["outcome"]
      : undefined,
  };
}

function adaptAskSession(value: unknown, index: number): AgoraAskSession {
  const item = asRecord(value);
  const sessionId = asString(item.sessionId ?? item.session_id ?? item.id, `ask_${index}`);
  return {
    id: asString(item.id, sessionId),
    sessionId,
    title: asString(item.title ?? item.objective ?? item.prompt, sessionId),
    status: asString(item.status, "active"),
    mode: asString(item.mode, "quick_ask"),
    createdAt: asString(item.createdAt ?? item.created_at, new Date().toISOString()),
    updatedAt: asString(item.updatedAt ?? item.updated_at ?? item.createdAt ?? item.created_at, new Date().toISOString()),
  };
}

const mockInsights = (): AgoraInsight[] => [
  { id: "ins_01", kind: "pattern", source: "ev_001", title: "Earnings drift on Asia Tech holds 4+ days post-print", body: "Across the last 8 quarters, Asia Tech names show statistically significant drift on day 4 (t=2.7). Worth productizing as a tactical strategy.", confidence: 0.86, ts: new Date(Date.now() - 3600_000).toISOString() },
  { id: "ins_02", kind: "anomaly", source: "stg_004", title: "FX Carry slippage 2.3x expected", body: "Slippage on FX Carry Tactical exceeded modeled by 2.3x over the past week. Likely book-quality issue.", confidence: 0.78, ts: new Date(Date.now() - 7200_000).toISOString() },
  { id: "ins_03", kind: "research_idea", source: "rx_203", title: "Cross-asset momentum blend looks robust under regime gating", body: "Preliminary backtest suggests a 0.31 Sharpe lift when blending bond/equity momentum with VIX gating.", confidence: 0.72, ts: new Date(Date.now() - 18_000_000).toISOString() },
  { id: "ins_04", kind: "skill_suggestion", source: "ai_trainer", title: "Coach 'risk_override_review' skill", body: "Operators routinely override risk pauses without structured rationale. A new skill could prompt the right questions.", confidence: 0.81, ts: new Date(Date.now() - 86400_000).toISOString() },
];

const mockAskSessions = (): AgoraAskSession[] => [
  {
    id: "ask_mock_001",
    sessionId: "ask_mock_001",
    title: "Mock signal review",
    status: "active",
    mode: "quick_ask",
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 1800_000).toISOString(),
  },
];

export const bffAgora = {
  daily: {
    get: (): Promise<unknown> =>
      withStrictLiveOrMock<unknown>(
        { method: "GET", path: "/bff/agora/daily" },
        async () => ({ data: { generatedAt: new Date().toISOString() } }),
        (data) => data,
      ),
  },
  signals: {
    list: (): Promise<AgoraSignal[]> =>
      withStrictLiveOrMock<AgoraSignal[]>(
        { method: "GET", path: paths.agoraSignals() },
        async () => mockSignals(seed.strategies),
        (data) => strictItemsFrom(data).map(adaptSignal),
      ),
    get: (id: string): Promise<AgoraSignal | undefined> =>
      withStrictLiveOrMock<AgoraSignal | undefined>(
        { method: "GET", path: paths.agoraSignals() },
        async () => mockSignals(seed.strategies).find((signal) => signal.id === id),
        (data) => strictItemsFrom(data).map(adaptSignal).find((signal) => signal.id === id),
      ),
  },
  inbox: {
    list: (): Promise<AgoraInsight[]> =>
      withStrictLiveOrMock<AgoraInsight[]>(
        { method: "GET", path: paths.agoraInbox() },
        async () => mockInsights(),
        (data) => strictItemsFrom(data).map(adaptInsight),
      ),
  },
  journal: {
    list: (): Promise<DecisionJournalEntry[]> =>
      withStrictLiveOrMock<DecisionJournalEntry[]>(
        { method: "GET", path: paths.agoraJournal() },
        async () => seed.decisionJournal,
        (data) => strictItemsFrom(data).map(adaptJournalEntry),
      ),
  },
  ask: {
    sessions: (): Promise<AgoraAskSession[]> =>
      withStrictLiveOrMock<AgoraAskSession[]>(
        { method: "GET", path: paths.agoraAskSessions() },
        async () => mockAskSessions(),
        (data) => strictItemsFrom(data).map(adaptAskSession),
      ),
  },
};

export type BffAgora = typeof bffAgora;
