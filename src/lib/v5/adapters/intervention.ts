// Q11 — Unified Human Intervention Queue: approvals + sentinel + incidents +
// policy exceptions + emergency reviews. Approvals NOT removed; HIQ is unified entry.

import type { ApprovalRequest, Incident } from "@/lib/bff/types";
import type { InterventionItem, SentinelFinding, EvidenceRef } from "../types";
import type { InterventionDecision, InterventionSeverity } from "../enums";

function severityFromRisk(r: string): InterventionSeverity {
  if (r === "critical") return "critical";
  if (r === "high") return "warning";
  if (r === "medium") return "watch";
  return "info";
}

function deriveModifyAllowed(it: Pick<InterventionItem, "allowedDecisions" | "requiredRoles" | "source">): boolean {
  // Q7 — derived: true if user could change outcome (more than just info display).
  return it.allowedDecisions.length > 1 && it.requiredRoles.length > 0;
}

function buildItem(partial: Omit<InterventionItem, "modifyAllowed">): InterventionItem {
  return { ...partial, modifyAllowed: deriveModifyAllowed(partial) };
}

export function adaptApprovalToIntervention(a: ApprovalRequest): InterventionItem {
  const allowed: InterventionDecision[] = ["approve", "reject", "request_changes", "escalate"];
  return buildItem({
    id: `iv_app_${a.id}`,
    source: "approval",
    severity: severityFromRisk(a.riskLevel),
    title: `Approval — ${a.kind}`,
    summary: a.rationale ?? a.diffSummary,
    createdAt: a.createdAt,
    updatedAt: a.createdAt,
    requiredRoles: a.requiresStages ?? ["committee"],
    linkedApprovalId: a.id,
    recommendedDecision: "approve",
    allowedDecisions: allowed,
  });
}

export function adaptFindingToIntervention(f: SentinelFinding): InterventionItem {
  const allowed: InterventionDecision[] = ["approve", "reject", "defer", "escalate"];
  return buildItem({
    id: `iv_sf_${f.id}`,
    source: "sentinel",
    severity:
      f.severity === "critical" ? "critical" :
      f.severity === "warning"  ? "warning"  :
      f.severity === "watch"    ? "watch"    : "info",
    title: `Sentinel — ${f.title}`,
    summary: f.summary,
    createdAt: f.detectedAt,
    updatedAt: f.updatedAt,
    requiredRoles: f.severity === "critical" ? ["risk", "committee"] : ["risk"],
    linkedFindingId: f.id,
    recommendedDecision: "approve",
    allowedDecisions: allowed,
  });
}

export function adaptIncidentToIntervention(i: Incident): InterventionItem {
  const evidenceRefs: EvidenceRef[] = [{ kind: "incident", id: i.id }];
  return buildItem({
    id: `iv_inc_${i.id}`,
    source: "incident",
    severity: severityFromRisk(i.severity),
    title: `Incident — ${i.title}`,
    summary: i.description,
    createdAt: i.openedAt,
    updatedAt: i.openedAt,
    requiredRoles: ["ops", "committee"],
    linkedIncidentId: i.id,
    allowedDecisions: ["approve", "escalate", "defer"],
    evidenceRefs,
  });
}
