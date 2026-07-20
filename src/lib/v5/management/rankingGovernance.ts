// 2026-05-22 PM12-010 — Ranking → Human Inbox bridge.
// Ranking recommendations are advisory. Submitting one creates or queues a
// governed Human Inbox review through the BFF command seam; it never mutates
// persona / capital / live deployment directly.

import type { LeagueRecommendedAction } from "./personaLeague";
import type { HumanInboxItem } from "./humanInbox";
import { buildLinkSet } from "./links";
import {
  mgmt,
  type RankingRecommendationSubmitResult,
} from "@/lib/bff-v1/management";

export type { RankingRecommendationSubmitResult } from "@/lib/bff-v1/management";
export type RankingRecommendationAction = Exclude<LeagueRecommendedAction, "no_change">;

export interface SendRankingRecommendationInput {
  personaId: string;
  personaName: string;
  recommendation: LeagueRecommendedAction;
  recommendationId?: string;
  source: "persona_league" | "quarterly_ranking";
  quarter: string;
  evidenceRefs?: string[];
  governanceDestinations?: string[];
}

export function requiredRoleFor(action: LeagueRecommendedAction): string {
  switch (action) {
    case "promote_to_canary_candidate": return "deployment_lead";
    case "increase_research_budget": return "research_lead";
    case "grant_tool_access": return "governance_lead";
    case "reduce_capital_access": return "capital_lead";
    case "require_retraining": return "research_lead";
    case "freeze_persona":
    case "suspend_persona":
    case "retire_persona": return "governance_lead";
    case "no_change": return "research_lead";
  }
}

export function buildRankingInboxItem(
  input: SendRankingRecommendationInput,
): HumanInboxItem {
  const id = makeRankingInboxId(input);
  return {
    id,
    kind: "ranking_recommendation",
    title: `Ranking recommendation: ${input.recommendation.replace(/_/g, " ")} — ${input.personaName}`,
    requiredRole: requiredRoleFor(input.recommendation),
    consequenceIfApproved: `Open a governance workflow for "${input.recommendation}" on ${input.personaName}. No direct live capital change.`,
    consequenceIfRejected: `Recommendation discarded. Persona ${input.personaName} keeps current status.`,
    consequenceIfIgnored: `Recommendation expires after TTL. Persona keeps current status.`,
    ttlSec: 7 * 24 * 3600,
    canDecide: true,
    canProceed: true,
    detailHref: `/management/human-inbox/${id}`,
    links: buildLinkSet({
      primary: { kind: "persona", id: input.personaId },
      evidence: input.evidenceRefs && input.evidenceRefs[0]
        ? { id: input.evidenceRefs[0] }
        : undefined,
    }),
  };
}

const sanitizeRecommendationPart = (value: unknown, fallback: string): string => {
  const text = String(value ?? fallback)
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || fallback;
};

export function currentPm12QuarterId(today = new Date()): string {
  const year = today.getFullYear();
  const quarter = Math.floor(today.getMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

export function makeRankingRecommendationId(input: SendRankingRecommendationInput): string {
  return [
    "pm12-rec",
    sanitizeRecommendationPart(input.source, "ranking"),
    sanitizeRecommendationPart(input.quarter, "quarter"),
    sanitizeRecommendationPart(input.personaId, "persona"),
    sanitizeRecommendationPart(input.recommendation, "action"),
  ].join("-");
}

export function makeRankingInboxId(input: SendRankingRecommendationInput): string {
  return `ranking-rec-${input.recommendationId ?? makeRankingRecommendationId(input)}`;
}

export function isGovernedRankingRecommendationAction(
  action: LeagueRecommendedAction | undefined,
): action is RankingRecommendationAction {
  return Boolean(action && action !== "no_change");
}

/** Submits the advisory recommendation into the BFF governed write seam. */
export function sendRankingRecommendation(
  input: SendRankingRecommendationInput & { recommendation: RankingRecommendationAction },
  opts: { idempotencyKey?: string } = {},
): Promise<RankingRecommendationSubmitResult> {
  const recommendationId = input.recommendationId ?? makeRankingRecommendationId(input);
  return mgmt.quarterlyRanking.submitRecommendation({
    recommendationId,
    actionId: input.recommendation,
    quarter: input.quarter,
    personaId: input.personaId,
    personaName: input.personaName,
    source: input.source,
    evidenceRefs: input.evidenceRefs ?? [],
    governanceDestinations: input.governanceDestinations,
    liveCapitalMutation: false,
  }, opts);
}
