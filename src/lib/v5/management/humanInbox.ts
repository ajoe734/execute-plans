// 2026-05-20 PM-6 — Human Inbox model (governance kinds + detail shape).

import type { ManagementLinkSet } from "./links";

export type HumanInboxKind =
  | "approval"
  | "sentinel"
  | "ask"
  | "intervention"
  | "readiness_blocker"
  | "policy_violation"
  | "rollback_request"
  | "capital_breach"
  | "broker_disconnect"
  | "ranking_recommendation" // 2026-05-22 PM12-010 — quarterly ranking → governance
  | "promotion_review"; // 2026-07-03 PPLG — paper/canary promotion human review

export const HUMAN_INBOX_KINDS: readonly HumanInboxKind[] = [
  "approval", "sentinel", "ask", "intervention", "readiness_blocker",
  "policy_violation", "rollback_request", "capital_breach", "broker_disconnect",
  "ranking_recommendation", "promotion_review",
] as const;

export interface HumanInboxAllowedActions {
  canDecide?: boolean;
  canApprove?: boolean;
  canReject?: boolean;
  canRequestRevision?: boolean;
  canRequestEvidence?: boolean;
}

export interface HumanInboxItem {
  id: string;
  kind: HumanInboxKind;
  title: string;
  /** Live BFF items carry a one-line summary instead of the mock consequence triplet. */
  summary?: string;
  requiredRole: string;
  consequenceIfApproved: string;
  consequenceIfRejected: string;
  consequenceIfIgnored: string;
  ttlSec?: number;
  canDecide: boolean;
  canProceed: boolean;
  status?: string;
  sourceId?: string;
  personaId?: string;
  reviewId?: string;
  reviewType?: string;
  decisionHref?: string;
  allowedActions?: HumanInboxAllowedActions;
  /** Optional blocking reason when canProceed=false. */
  blockingReasons?: string[];
  /** Evidence refs available from the list/detail payload. */
  evidenceRefs?: string[];
  detailHref: string;
  links: ManagementLinkSet;
}

export interface HumanInboxDecisionRecord {
  decidedAt: string;
  decidedBy: string;
  decision: "approve" | "reject" | "defer" | "request_more_evidence";
  note?: string;
}

export interface HumanInboxDetail extends HumanInboxItem {
  decisionType: "single" | "two_man" | "quorum";
  signatures: { role: string; signedBy?: string; signedAt?: string }[];
  evidenceRefs: string[];
  decisionHistory: HumanInboxDecisionRecord[];
  auditRefs: string[];
}

/** Stable visual rank for ordering the inbox. */
export function humanInboxRank(kind: HumanInboxKind): number {
  switch (kind) {
    case "policy_violation": return 9;
    case "capital_breach": return 8;
    case "promotion_review": return 7.5;
    case "rollback_request": return 7;
    case "sentinel": return 6;
    case "broker_disconnect": return 5;
    case "readiness_blocker": return 4;
    case "intervention": return 3;
    case "ranking_recommendation": return 2.5;
    case "approval": return 2;
    case "ask": return 1;
  }
}
