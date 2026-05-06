// v4 / Pack C §C076 — Committee evidence pack templates.

export type CommitteeType =
  | "strategy_review" | "live_promotion" | "incident_review" | "evolution_candidate";

export interface CommitteeTemplate {
  type: CommitteeType;
  requiredEvidence: readonly string[];
}

export const COMMITTEE_TEMPLATES: readonly CommitteeTemplate[] = [
  { type: "strategy_review", requiredEvidence: ["strategy spec", "experiment summary", "risk summary", "persona rationale"] },
  { type: "live_promotion", requiredEvidence: ["paper performance", "risk budget", "rollback target", "deployment plan"] },
  { type: "incident_review", requiredEvidence: ["alert timeline", "runtime logs", "strategy exposure", "mitigation actions"] },
  { type: "evolution_candidate", requiredEvidence: ["parent strategy", "mutation summary", "fitness score", "OOS result"] },
] as const;
