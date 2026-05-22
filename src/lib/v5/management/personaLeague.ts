// 2026-05-22 PM12-004 — Persona League view-model.

import { buildLinkSet, type ManagementLinkSet } from "./links";

export type PersonaLeagueTier = "S" | "A" | "B" | "C" | "D" | "watch" | "suspended";
export type PersonaLeagueStatus = "active" | "watch" | "suspended" | "retired";

export type LeagueRecommendedAction =
  | "promote_to_canary_candidate"
  | "increase_research_budget"
  | "grant_tool_access"
  | "reduce_capital_access"
  | "require_retraining"
  | "freeze_persona"
  | "suspend_persona"
  | "retire_persona"
  | "no_change";

export const LEAGUE_RECOMMENDED_ACTIONS: readonly LeagueRecommendedAction[] = [
  "promote_to_canary_candidate", "increase_research_budget", "grant_tool_access",
  "reduce_capital_access", "require_retraining", "freeze_persona",
  "suspend_persona", "retire_persona", "no_change",
] as const;

export type PersonaLeaguePreset =
  | "overall" | "pnl" | "risk_adjusted" | "execution_quality"
  | "consistency" | "improvement" | "risk_penalty"
  | "human_intervention" | "evolution_effectiveness";

export const PERSONA_LEAGUE_PRESETS: readonly PersonaLeaguePreset[] = [
  "overall", "pnl", "risk_adjusted", "execution_quality", "consistency",
  "improvement", "risk_penalty", "human_intervention", "evolution_effectiveness",
] as const;

export interface PersonaLeagueScoreBreakdown {
  pnlScore: number;
  sharpeScore: number;
  drawdownControlScore: number;
  executionQualityScore: number;
  riskComplianceScore: number;
  improvementScore: number;
  interventionPenalty: number;
  hardPenalty: number;
}

export interface PersonaLeagueRow {
  personaId: string;
  personaName: string;
  owner?: string;
  currentRank: number;
  previousRank?: number;
  rankDelta?: number;
  tier: PersonaLeagueTier;
  score: number;
  scoreBreakdown: PersonaLeagueScoreBreakdown;
  pnlToday: number;
  pnl7d: number;
  pnl30d: number;
  pnlQuarter: number;
  pnlYtd: number;
  sharpe: number;
  sortino?: number;
  maxDrawdown: number;
  winRate: number;
  hitRate?: number;
  turnover: number;
  slippageBps: number;
  fillRatio: number;
  orderRejectRate: number;
  latencyP95Ms?: number;
  positionMismatchCount?: number;
  riskPolicyViolations: number;
  humanInterventions: number;
  sentinelFindings: number;
  mutationCount: number;
  improvedMutations: number;
  degradedMutations: number;
  status: PersonaLeagueStatus;
  recommendedAction?: LeagueRecommendedAction;
  links: ManagementLinkSet;
}

export function sortByPreset(
  rows: readonly PersonaLeagueRow[],
  preset: PersonaLeaguePreset,
): PersonaLeagueRow[] {
  const k = (r: PersonaLeagueRow): number => {
    switch (preset) {
      case "pnl": return r.pnl30d;
      case "risk_adjusted": return r.sharpe;
      case "execution_quality": return r.scoreBreakdown.executionQualityScore;
      case "consistency": return -Math.abs(r.maxDrawdown);
      case "improvement": return r.scoreBreakdown.improvementScore;
      case "risk_penalty": return -r.scoreBreakdown.hardPenalty;
      case "human_intervention": return -r.humanInterventions;
      case "evolution_effectiveness":
        return r.improvedMutations - r.degradedMutations;
      case "overall":
      default: return r.score;
    }
  };
  return [...rows].sort((a, b) => k(b) - k(a));
}

export function tierDistribution(rows: readonly PersonaLeagueRow[]): Record<PersonaLeagueTier, number> {
  const out: Record<PersonaLeagueTier, number> = {
    S: 0, A: 0, B: 0, C: 0, D: 0, watch: 0, suspended: 0,
  };
  rows.forEach((r) => { out[r.tier] += 1; });
  return out;
}

export function defaultPersonaLeague(): PersonaLeagueRow[] {
  const mk = (
    rank: number, prev: number, personaId: string, name: string,
    o: Partial<PersonaLeagueRow> = {},
  ): PersonaLeagueRow => ({
    personaId, personaName: name, owner: "research-1",
    currentRank: rank, previousRank: prev, rankDelta: prev - rank,
    tier: rank <= 2 ? "S" : rank <= 4 ? "A" : rank <= 6 ? "B" : "C",
    score: 100 - rank * 6,
    scoreBreakdown: {
      pnlScore: 80 - rank * 5, sharpeScore: 75 - rank * 4,
      drawdownControlScore: 70 - rank * 3, executionQualityScore: 85 - rank * 4,
      riskComplianceScore: 90 - rank * 2, improvementScore: 50 + (4 - rank) * 5,
      interventionPenalty: rank * 2, hardPenalty: rank > 6 ? 10 : 0,
    },
    pnlToday: 12_000 - rank * 2_000, pnl7d: 90_000 - rank * 12_000,
    pnl30d: 320_000 - rank * 45_000, pnlQuarter: 820_000 - rank * 110_000,
    pnlYtd: 1_400_000 - rank * 180_000,
    sharpe: 2.4 - rank * 0.2, sortino: 3.1 - rank * 0.25,
    maxDrawdown: -(0.02 + rank * 0.012), winRate: 0.62 - rank * 0.02,
    hitRate: 0.55 - rank * 0.015,
    turnover: 1.8 + rank * 0.1, slippageBps: 2.1 + rank * 0.4,
    fillRatio: 0.98 - rank * 0.005, orderRejectRate: 0.004 + rank * 0.001,
    latencyP95Ms: 110 + rank * 8, positionMismatchCount: rank > 5 ? rank - 4 : 0,
    riskPolicyViolations: rank > 4 ? rank - 3 : 0,
    humanInterventions: rank, sentinelFindings: Math.max(0, rank - 2),
    mutationCount: 8, improvedMutations: Math.max(0, 6 - rank),
    degradedMutations: Math.min(rank, 4),
    status: rank > 7 ? "watch" : "active",
    recommendedAction:
      rank === 1 ? "promote_to_canary_candidate" :
      rank === 2 ? "increase_research_budget" :
      rank > 6 ? "require_retraining" : "no_change",
    links: buildLinkSet({ primary: { kind: "persona", id: personaId } }),
    ...o,
  });
  return [
    mk(1, 2, "alpha-trader", "Alpha Trader"),
    mk(2, 1, "risk-guard", "Risk Guard"),
    mk(3, 3, "fx-scout", "FX Scout"),
    mk(4, 6, "capital-steward", "Capital Steward"),
    mk(5, 4, "vol-hunter", "Vol Hunter"),
    mk(6, 5, "crypto-scout", "Crypto Scout"),
    mk(7, 7, "macro-watcher", "Macro Watcher", { status: "watch" }),
    mk(8, 8, "earnings-sniper", "Earnings Sniper", {
      status: "suspended", tier: "suspended",
      recommendedAction: "suspend_persona",
    }),
  ];
}

export interface PersonaLeagueTopMovers {
  topUp: PersonaLeagueRow[];
  topDown: PersonaLeagueRow[];
}

export function computeTopMovers(rows: readonly PersonaLeagueRow[], n = 3): PersonaLeagueTopMovers {
  const withDelta = rows.filter((r) => typeof r.rankDelta === "number");
  return {
    topUp: [...withDelta].sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0)).slice(0, n),
    topDown: [...withDelta].sort((a, b) => (a.rankDelta ?? 0) - (b.rankDelta ?? 0)).slice(0, n),
  };
}
