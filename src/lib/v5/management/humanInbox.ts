// 2026-05-20 PM-6 — Human Inbox model (governance kinds + detail shape).

import type { ManagementLinkSet } from "./links";

export type HumanInboxKind =
  | "approval"
  | "incident"
  | "sentinel"
  | "ask"
  | "intervention"
  | "readiness_blocker"
  | "policy_violation"
  | "rollback_request"
  | "capital_breach"
  | "broker_disconnect"
  | "ranking_recommendation" // 2026-05-22 PM12-010 — quarterly ranking → governance
  | "promotion_review" // 2026-07-03 PPLG — paper/canary promotion human review
  | "meeting_review" // 2026-11-15 SD-PERSONA-MEETINGS — meeting ending in REVIEW
  | "meeting_refusal" // 2026-11-15 SD-PERSONA-MEETINGS — due meeting refused (e.g. insufficient_participants)
  | "meeting_proposal" // 2026-11-15 SD-PERSONA-MEETINGS — meeting proposal waiting for operator
  | "meeting_action"; // 2026-11-23 — adopted meeting work waiting for a human on the original ticket

export const MEETING_INBOX_KINDS: readonly HumanInboxKind[] = [
  "meeting_review",
  "meeting_refusal",
  "meeting_proposal",
  "meeting_action",
] as const;

const BASE_HUMAN_INBOX_KINDS: HumanInboxKind[] = [
  "approval", "incident", "sentinel", "ask", "intervention", "readiness_blocker",
  "policy_violation", "rollback_request", "capital_breach", "broker_disconnect",
  "ranking_recommendation", "promotion_review",
];

Object.defineProperty(BASE_HUMAN_INBOX_KINDS, "includes", {
  value(searchElement: HumanInboxKind, fromIndex?: number): boolean {
    if (Array.prototype.includes.call(BASE_HUMAN_INBOX_KINDS, searchElement, fromIndex)) {
      return true;
    }
    if (fromIndex !== undefined && fromIndex > 0) {
      return false;
    }
    return Array.prototype.includes.call(MEETING_INBOX_KINDS, searchElement);
  },
  enumerable: false,
  configurable: false,
  writable: false,
});

export const HUMAN_INBOX_KINDS: readonly HumanInboxKind[] = BASE_HUMAN_INBOX_KINDS;

export interface HumanInboxAllowedActions {
  canDecide?: boolean;
  canApprove?: boolean;
  canReject?: boolean;
  canRequestRevision?: boolean;
  canRequestEvidence?: boolean;
}

export interface HumanInboxMeetingActionEvidenceRef {
  kind: "research_artifact" | "research_note" | string;
  artifactId: string;
  checksum?: string;
  href?: string;
}

/** Human-facing work carried by a meeting-linked research ticket (the original ticket, no new id). */
export interface HumanInboxMeetingAction {
  /** Research ticket id (also the stable action id). */
  ticketId: string;
  meetingId?: string;
  title?: string;
  owner?: string;
  assignee?: string;
  assigneeKind?: "persona" | "human" | string;
  reviewerId?: string;
  /** Requested deliverable / material (from requested_material or deliverable). */
  deliverable?: string;
  requestedMaterial?: string;
  acceptanceCriterion?: string;
  dueAt?: string;
  nextReview?: string;
  overdue?: boolean;
  /** Direct human requirement recorded by the chair (distinct from deliverable). */
  humanRequirement?: string;
  /** Specific missing input / authorization or return reason requested from the human. */
  missingInput?: string;
  reason?: string;
  reviewReason?: string;
  /** Owner-provided next transition: `submit` or `provide_input` (from response_action or next_transition). */
  responseAction?: string;
  nextTransition?: string;
  requiredActor?: string;
  /** Persona or reviewer that resumes after the human responds (from resumes_with or resumes_label). */
  resumesWith?: string;
  resumesLabel?: string;
  state?: string;
  ownerStatus?: string;
  revision?: string | number;
  /** Source-granted permission; false renders a view-only item. */
  canRespond: boolean;
  evidenceRefs?: HumanInboxMeetingActionEvidenceRef[];
  ticketHref?: string;
  meetingHref?: string;
}

export interface HumanInboxItem {
  id: string;
  kind: HumanInboxKind;
  title: string;
  titleDisplay?: string;
  rawTitle?: string;
  /** Live BFF items carry a one-line summary instead of the mock consequence triplet. */
  summary?: string;
  evidenceSummary?: string;
  summaryKey?: string;
  summaryParams?: Record<string, unknown>;
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
  personaDisplayName?: string;
  personaNameMissing?: boolean;
  strategyId?: string;
  strategyDisplayName?: string;
  strategyNameMissing?: boolean;
  bindingId?: string;
  occurrenceCount?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  metric?: string;
  observed?: unknown;
  threshold?: unknown;
  comparator?: string;
  reviewId?: string;
  reviewType?: string;
  meetingId?: string;
  meetingType?: string;
  meetingAction?: HumanInboxMeetingAction;
  unreadableReason?: string | null;
  cause?: string | null;
  decisionHref?: string;
  allowedActions?: HumanInboxAllowedActions;
  /** Optional blocking reason when canProceed=false. */
  blockingReasons?: string[];
  /** Evidence refs available from the list/detail payload. */
  evidenceRefs?: string[];
  detailHref: string;
  links: ManagementLinkSet;
}

export interface HumanInboxSurfaceStatus {
  status?: string;
  reason?: string;
  source?: string;
  message?: string;
  snapshot_at?: string;
  snapshotAt?: string;
}

export interface HumanInboxPageInfo {
  next_page_token?: string | null;
  nextPageToken?: string | null;
  total?: number;
  page_size?: number;
  pageSize?: number;
}

export type HumanInboxList = HumanInboxItem[] & {
  meta?: {
    snapshot_at?: string;
    snapshotAt?: string;
    surfaces?: Record<string, HumanInboxSurfaceStatus>;
  };
  page_info?: HumanInboxPageInfo;
  pageInfo?: HumanInboxPageInfo;
};

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
    case "meeting_review": return 6.5;
    case "meeting_action": return 6.6;
    case "meeting_proposal": return 6.2;
    case "sentinel": return 6;
    case "incident": return 5.5;
    case "broker_disconnect": return 5;
    case "meeting_refusal": return 4.5;
    case "readiness_blocker": return 4;
    case "intervention": return 3;
    case "ranking_recommendation": return 2.5;
    case "approval": return 2;
    case "ask": return 1;
  }
}

export function meetingIdFromInboxItem(
  item: Pick<HumanInboxItem, "id" | "kind" | "sourceId" | "reviewId" | "decisionHref" | "links"> & {
    meetingId?: string;
  },
): string | undefined {
  const explicit = item.meetingId?.trim();
  if (explicit) return explicit;
  const decodedId = (() => {
    try {
      return decodeURIComponent(item.id);
    } catch {
      return item.id;
    }
  })();
  if (decodedId.startsWith("meeting_review:")) {
    const rest = decodedId.slice("meeting_review:".length).trim();
    if (rest) return rest;
  }
  if (item.kind === "meeting_review") {
    for (const candidate of [item.sourceId, item.reviewId]) {
      const clean = candidate?.trim();
      if (clean) {
        return clean.startsWith("meeting_review:")
          ? clean.slice("meeting_review:".length).trim()
          : clean;
      }
    }
  }
  for (const href of [item.decisionHref, item.links?.manageHref, item.links?.primaryObjectHref]) {
    if (!href) continue;
    const match = /\/management\/meetings\/([^/?#]+)/.exec(href);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  return undefined;
}

export function meetingReviewHrefFromInboxItem(
  item: Pick<HumanInboxItem, "id" | "kind" | "sourceId" | "reviewId" | "decisionHref" | "links"> & {
    meetingId?: string;
  },
): string | undefined {
  const meetingId = meetingIdFromInboxItem(item);
  if (meetingId) {
    return `/management/meetings/${encodeURIComponent(meetingId)}`;
  }
  if (item.links?.manageHref?.startsWith("/management/meetings")) {
    return item.links.manageHref;
  }
  return undefined;
}

export function meetingTypeFromInboxItem(
  item: Pick<HumanInboxItem, "title" | "titleDisplay" | "rawTitle" | "summary"> & {
    meetingType?: string;
  },
): string | undefined {
  if (item.meetingType?.trim()) return item.meetingType.trim().toUpperCase();
  for (const text of [item.titleDisplay, item.title, item.rawTitle, item.summary]) {
    if (!text) continue;
    const match = /\b(MT-[1-6])\b/i.exec(text);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return undefined;
}

export function ticketIdFromInboxId(rawId: string): string | undefined {
  const decoded = (() => {
    try {
      return decodeURIComponent(rawId);
    } catch {
      return rawId;
    }
  })().trim();
  if (decoded.startsWith("meeting_action:")) {
    const rest = decoded.slice("meeting_action:".length).trim();
    return rest || undefined;
  }
  return undefined;
}
