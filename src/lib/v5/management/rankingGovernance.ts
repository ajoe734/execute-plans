// 2026-05-22 PM12-010 — Ranking → Human Inbox bridge.
// Generates a deterministic Human Inbox id from a ranking recommendation.
// The detail page (HumanGateDetail) will pick up `ranking_recommendation`
// kind from the id prefix and render an editable governance gate.
// NEVER mutates persona / capital / live deployment directly.

import type { LeagueRecommendedAction } from "./personaLeague";
import type { HumanInboxItem } from "./humanInbox";
import { buildLinkSet } from "./links";

export interface SendRankingRecommendationInput {
  personaId: string;
  personaName: string;
  recommendation: LeagueRecommendedAction;
  source: "persona_league" | "quarterly_ranking";
  quarter?: string;
  evidenceRefs?: string[];
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

export function makeRankingInboxId(input: SendRankingRecommendationInput): string {
  // Prefix "ran" so the detail page id→kind heuristic resolves to
  // `ranking_recommendation`.
  return `ranking-rec-${input.source}-${input.personaId}-${input.recommendation}`;
}

/** Returns the deterministic id so the caller can navigate to the detail. */
export function sendRankingRecommendation(input: SendRankingRecommendationInput): string {
  return makeRankingInboxId(input);
}
