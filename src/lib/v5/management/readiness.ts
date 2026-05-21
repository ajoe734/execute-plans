// 2026-05-20 revamp §7 + design ruling §4 — common readiness types
// shared by EP5 canary / broker-live / capital-live / BFF-HA / strict-publish.

export type ReadinessStatus = "ready" | "blocked" | "pending" | "not_applicable";
export type ChecklistItemStatus = "pass" | "fail" | "pending" | "not_applicable";
export type BlockerSeverity = "critical" | "high" | "medium" | "low";

export interface ReadinessChecklistItem {
  id: string;
  label: string;
  status: ChecklistItemStatus;
  ownerRole: string;
  evidenceRequired: boolean;
  evidenceAttached: boolean;
  blocking: boolean;
  description?: string;
}

export interface ReadinessPacket {
  id: string;
  packetType: string;
  status: "verified" | "stale" | "missing" | "pending";
  hash?: string;
  createdAt: string;
  linkedObject?: string;
  href?: string;
}

export interface ReadinessBlocker {
  id: string;
  severity: BlockerSeverity;
  reason: string;
  requiredRole: string;
  nextAction: string;
  linkedEvidence: string[];
}

export interface ReadinessHeaderModel {
  title: string;
  status: ReadinessStatus;
  score: number;       // 0..100
  lastUpdated: string;
  environment: string;
  canProceed: boolean;
  primaryBlocker?: string;
}

export interface ReadinessPageModel {
  header: ReadinessHeaderModel;
  checklist: ReadinessChecklistItem[];
  packets: ReadinessPacket[];
  blockers: ReadinessBlocker[];
}

/** Pure: derive score & canProceed from checklist + blockers. */
export function composeReadinessHeader(
  title: string,
  env: string,
  checklist: ReadinessChecklistItem[],
  blockers: ReadinessBlocker[],
  lastUpdated: string,
): ReadinessHeaderModel {
  const considered = checklist.filter((c) => c.status !== "not_applicable");
  const passed = considered.filter((c) => c.status === "pass").length;
  const score = considered.length === 0 ? 0 : Math.round((passed / considered.length) * 100);
  const hasBlockingFail = checklist.some((c) => c.blocking && c.status === "fail");
  const hasCritical = blockers.some((b) => b.severity === "critical");
  const allPassed = considered.length > 0 && passed === considered.length && blockers.length === 0;
  const status: ReadinessStatus = allPassed ? "ready" : (hasBlockingFail || hasCritical) ? "blocked" : "pending";
  const canProceed = status === "ready";
  const primaryBlocker = blockers.sort((a, b) => sevWeight(b.severity) - sevWeight(a.severity))[0]?.reason;
  return { title, status, score, lastUpdated, environment: env, canProceed, primaryBlocker };
}

function sevWeight(s: BlockerSeverity): number {
  return s === "critical" ? 4 : s === "high" ? 3 : s === "medium" ? 2 : 1;
}
