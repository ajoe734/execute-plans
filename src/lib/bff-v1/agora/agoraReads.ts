import type { DecisionJournalEntry, RiskLevel } from "../dto";
import { paths } from "../paths";
import { strictItemsFrom } from "../liveTransport";
import { strictLiveRead } from "../domainReads";

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

function adaptSignal(value: unknown): AgoraSignal {
  const item = asRecord(value);
  const id = asString(item.signal_id ?? item.signalId ?? item.id, "");
  const side = asString(item.side, "long") === "short" ? "short" : "long";
  const strategy = asRecord(item.strategy ?? item.targetStrategy);
  const symbol = asString(item.symbol ?? item.ticker ?? item.instrument, "");
  return {
    id,
    strategyId: asString(item.strategy_id ?? item.strategyId ?? strategy.id, asString(item.scope_ref ?? item.scopeRef, "")),
    strategyName: asString(item.strategy_name ?? item.strategyName ?? strategy.name, asString(item.title, id)),
    alpha: asString(item.alpha ?? item.alpha_id ?? item.alphaId, ""),
    side,
    symbol,
    size: asNumber(item.size ?? item.weight ?? item.target_weight ?? item.targetWeight, 0),
    conviction: Math.max(0, Math.min(1, asNumber(item.conviction ?? item.confidence ?? item.score, 0))),
    rationale: asString(item.rationale ?? item.summary ?? item.description ?? item.title, ""),
    generatedAt: asString(item.generated_at ?? item.generatedAt ?? item.created_at ?? item.createdAt ?? item.updated_at ?? item.updatedAt, ""),
    risk: riskFrom(item.risk ?? item.riskLevel ?? item.severity, "medium"),
    reviewStatus: asString(item.reviewStatus ?? item.review_status ?? item.status, ""),
  };
}

function adaptInsight(value: unknown): AgoraInsight {
  const item = asRecord(value);
  const id = asString(item.insight_id ?? item.insightId ?? item.id, "");
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
    ts: asString(item.updated_at ?? item.updatedAt ?? item.created_at ?? item.createdAt, ""),
    read: Boolean(item.read),
  };
}

function adaptJournalEntry(value: unknown): DecisionJournalEntry {
  const item = asRecord(value);
  const id = asString(item.entry_id ?? item.entryId ?? item.decision_id ?? item.decisionId ?? item.id, "");
  const scope = asRecord(item.scope);
  return {
    id,
    subjectKind: asString(item.subjectKind ?? item.subject_kind ?? scope.type, "Agora"),
    subjectId: asString(item.subjectId ?? item.subject_id ?? scope.id ?? item.scope_ref ?? item.scopeRef, id),
    title: asString(item.title ?? item.decision ?? item.summary, id),
    decidedAt: asString(item.decidedAt ?? item.decided_at ?? item.updated_at ?? item.updatedAt ?? item.created_at ?? item.createdAt, ""),
    decidedBy: asString(item.decidedBy ?? item.decided_by ?? item.actor_id ?? item.actorId, "agora"),
    outcome: ["pending", "good", "neutral", "bad"].includes(asString(item.outcome))
      ? asString(item.outcome) as DecisionJournalEntry["outcome"]
      : undefined,
  };
}

function adaptAskSession(value: unknown): AgoraAskSession {
  const item = asRecord(value);
  const sessionId = asString(item.sessionId ?? item.session_id ?? item.id, "");
  return {
    id: asString(item.id, sessionId),
    sessionId,
    title: asString(item.title ?? item.objective ?? item.prompt, sessionId),
    status: asString(item.status, "active"),
    mode: asString(item.mode, "quick_ask"),
    createdAt: asString(item.createdAt ?? item.created_at, ""),
    updatedAt: asString(item.updatedAt ?? item.updated_at ?? item.createdAt ?? item.created_at, ""),
  };
}

export const bffAgora = {
  daily: {
    get: (): Promise<unknown> =>
      strictLiveRead<unknown>(
        "agora.daily",
        { method: "GET", path: "/bff/agora/daily" },
        (data) => data,
      ),
  },
  signals: {
    list: (): Promise<AgoraSignal[]> =>
      strictLiveRead<AgoraSignal[]>(
        "agora.signals.list",
        { method: "GET", path: paths.agoraSignals() },
        (data) => strictItemsFrom(data).map(adaptSignal),
      ),
    get: (id: string): Promise<AgoraSignal | undefined> =>
      strictLiveRead<AgoraSignal | undefined>(
        "agora.signals.get",
        { method: "GET", path: paths.agoraSignals() },
        (data) => strictItemsFrom(data).map(adaptSignal).find((signal) => signal.id === id),
      ),
  },
  inbox: {
    list: (): Promise<AgoraInsight[]> =>
      strictLiveRead<AgoraInsight[]>(
        "agora.inbox.list",
        { method: "GET", path: paths.agoraInbox() },
        (data) => strictItemsFrom(data).map(adaptInsight),
      ),
  },
  journal: {
    list: (): Promise<DecisionJournalEntry[]> =>
      strictLiveRead<DecisionJournalEntry[]>(
        "agora.journal.list",
        { method: "GET", path: paths.agoraJournal() },
        (data) => strictItemsFrom(data).map(adaptJournalEntry),
      ),
  },
  ask: {
    sessions: (): Promise<AgoraAskSession[]> =>
      strictLiveRead<AgoraAskSession[]>(
        "agora.ask.sessions",
        { method: "GET", path: paths.agoraAskSessions() },
        (data) => strictItemsFrom(data).map(adaptAskSession),
      ),
  },
};

export type BffAgora = typeof bffAgora;
