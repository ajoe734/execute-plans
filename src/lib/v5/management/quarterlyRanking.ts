// 2026-05-22 PM12-006 — Quarterly Ranking view-model.

import { buildLinkSet, type ManagementLinkSet } from "./links";
import type { LeagueRecommendedAction, PersonaLeagueTier } from "./personaLeague";

export type QuarterlyEligibility = "eligible" | "insufficient_data" | "disqualified";

export interface QuarterlyScoreBreakdown {
  pnlScore: number;
  sharpeScore: number;
  drawdownControlScore: number;
  executionQualityScore: number;
  riskComplianceScore: number;
  improvementScore: number;
  humanInterventionPenalty: number;
  hardPenalty: number;
}

export interface QuarterlyRankingFormula {
  formulaId: string;
  version: string;
  activeFrom: string;
  weights: {
    pnl: number;
    sharpe: number;
    drawdownControl: number;
    executionQuality: number;
    riskCompliance: number;
    improvement: number;
    humanInterventionPenalty: number;
  };
  hardPenalties: {
    riskPolicyViolation: number;
    unresolvedCriticalIncident: number;
    missingEvidence: number;
    capitalBreach: number;
  };
  minDataRequirements: {
    minTradingDays: number;
    minPaperDays?: number;
    minCanaryDays?: number;
    minTrades: number;
  };
}

export interface QuarterlyRankingRow {
  quarter: string;
  personaId: string;
  personaName: string;
  currentRank: number;
  previousQuarterRank?: number;
  rankDelta?: number;
  tier: PersonaLeagueTier | "disqualified";
  score: number;
  scoreBreakdown: QuarterlyScoreBreakdown;
  pnlQuarter: number;
  sharpeQuarter: number;
  maxDrawdownQuarter: number;
  executionQualityScore: number;
  riskComplianceScore: number;
  improvementScore: number;
  humanInterventionPenalty: number;
  eligibility: QuarterlyEligibility;
  disqualificationReason?: string;
  recommendation?: LeagueRecommendedAction;
  evidenceRefs: string[];
  links: ManagementLinkSet;
}

export interface QuarterlySnapshot {
  quarter: string;
  cutoffDate: string;
  daysRemaining: number;
  eligiblePersonas: number;
  disqualifiedPersonas: number;
  pendingEvidenceGaps: number;
  formulaVersion: string;
}

export function defaultQuarterlyFormula(): QuarterlyRankingFormula {
  return {
    formulaId: "quarterly-default",
    version: "1.0.0",
    activeFrom: "2026-04-01",
    weights: {
      pnl: 0.25, sharpe: 0.20, drawdownControl: 0.15,
      executionQuality: 0.15, riskCompliance: 0.15,
      improvement: 0.05, humanInterventionPenalty: 0.05,
    },
    hardPenalties: {
      riskPolicyViolation: 5,
      unresolvedCriticalIncident: 10,
      missingEvidence: 3,
      capitalBreach: 15,
    },
    minDataRequirements: {
      minTradingDays: 45, minPaperDays: 10, minCanaryDays: 10, minTrades: 200,
    },
  };
}

/** Pure formula computer. */
export function computeQuarterlyScore(
  breakdown: QuarterlyScoreBreakdown,
  formula: QuarterlyRankingFormula,
): number {
  const w = formula.weights;
  const positive =
    breakdown.pnlScore * w.pnl +
    breakdown.sharpeScore * w.sharpe +
    breakdown.drawdownControlScore * w.drawdownControl +
    breakdown.executionQualityScore * w.executionQuality +
    breakdown.riskComplianceScore * w.riskCompliance +
    breakdown.improvementScore * w.improvement;
  const penalty =
    breakdown.humanInterventionPenalty * w.humanInterventionPenalty +
    breakdown.hardPenalty;
  return Math.round((positive - penalty) * 100) / 100;
}

export function defaultQuarterlySnapshot(): QuarterlySnapshot {
  return {
    quarter: "2026-Q2",
    cutoffDate: "2026-06-30",
    daysRemaining: 39,
    eligiblePersonas: 7,
    disqualifiedPersonas: 1,
    pendingEvidenceGaps: 2,
    formulaVersion: "1.0.0",
  };
}

export function defaultQuarterlyRanking(): QuarterlyRankingRow[] {
  const f = defaultQuarterlyFormula();
  const mk = (
    rank: number, prevRank: number, personaId: string, name: string,
    o: Partial<QuarterlyRankingRow> = {},
  ): QuarterlyRankingRow => {
    const breakdown: QuarterlyScoreBreakdown = {
      pnlScore: 80 - rank * 6, sharpeScore: 75 - rank * 5,
      drawdownControlScore: 72 - rank * 4, executionQualityScore: 85 - rank * 5,
      riskComplianceScore: 90 - rank * 3, improvementScore: 60 + (3 - rank) * 5,
      humanInterventionPenalty: rank * 4, hardPenalty: rank > 6 ? 8 : 0,
    };
    return {
      quarter: "2026-Q2",
      personaId, personaName: name,
      currentRank: rank, previousQuarterRank: prevRank, rankDelta: prevRank - rank,
      tier: rank <= 2 ? "S" : rank <= 4 ? "A" : rank <= 6 ? "B" : "C",
      score: computeQuarterlyScore(breakdown, f),
      scoreBreakdown: breakdown,
      pnlQuarter: 820_000 - rank * 110_000,
      sharpeQuarter: 2.4 - rank * 0.2,
      maxDrawdownQuarter: -(0.02 + rank * 0.012),
      executionQualityScore: breakdown.executionQualityScore,
      riskComplianceScore: breakdown.riskComplianceScore,
      improvementScore: breakdown.improvementScore,
      humanInterventionPenalty: breakdown.humanInterventionPenalty,
      eligibility: "eligible",
      recommendation:
        rank === 1 ? "promote_to_canary_candidate" :
        rank === 2 ? "increase_research_budget" :
        rank > 6 ? "require_retraining" : "no_change",
      evidenceRefs: [`ev-q2-${personaId}`],
      links: buildLinkSet({
        primary: { kind: "persona", id: personaId },
        evidence: { id: `ev-q2-${personaId}` },
      }),
      ...o,
    };
  };
  return [
    mk(1, 2, "alpha-trader", "Alpha Trader"),
    mk(2, 1, "risk-guard", "Risk Guard"),
    mk(3, 3, "fx-scout", "FX Scout"),
    mk(4, 6, "capital-steward", "Capital Steward"),
    mk(5, 4, "vol-hunter", "Vol Hunter"),
    mk(6, 5, "crypto-scout", "Crypto Scout"),
    mk(7, 7, "macro-watcher", "Macro Watcher"),
    mk(8, 8, "earnings-sniper", "Earnings Sniper", {
      eligibility: "disqualified",
      disqualificationReason: "Unresolved critical incident",
      tier: "disqualified",
      recommendation: "suspend_persona",
    }),
    mk(9, 9, "new-rookie", "New Rookie", {
      eligibility: "insufficient_data",
      disqualificationReason: "Below minTradingDays=45",
      tier: "watch",
      recommendation: "no_change",
    }),
  ];
}
