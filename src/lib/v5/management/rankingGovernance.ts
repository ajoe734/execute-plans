// 2026-05-22 PM12-010 — Ranking → Human Inbox bridge.
// Mock-only: writes a HumanInboxItem into writeOverlay so the user can land on
// /management/human-inbox/:id and review. Never mutates persona/capital/live.

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

// Required-role mapping per recommendation (defensive default = governance_lead).
function requiredRoleFor(action: LeagueRecommendedAction): string {
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
  const id = `inbox-rank-${input.personaId}-${Date.now()}`;
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

/** Mock: pushes the item into writeOverlay (browser-only) and returns its id. */
export function sendRankingRecommendation(input: SendRankingRecommendationInput): string {
  const item = buildRankingInboxItem(input);
  if (typeof window !== "undefined") {
    try {
      // Lazy import to avoid SSR / test breakage.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const w = require("@/lib/bff/writeOverlay") as typeof import("@/lib/bff/writeOverlay");
      // Best-effort — overlay api may not have a typed channel; ignore if unsupported.
      const fn = (w as unknown as Record<string, unknown>).appendOverlay;
      if (typeof fn === "function") {
        (fn as (k: string, v: unknown) => void)("mgmt.humanInbox", item);
      }
    } catch {
      // Phase 1 silent — user still lands on the inbox detail page.
    }
  }
  return item.id;
}
