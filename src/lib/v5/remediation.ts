// Q24 — Remediation action catalogue with advisory / guarded_automation /
// emergency_override flow. Emergency always requires HighRiskConfirm.

import type { RemediationAction } from "./types";
import type { RemediationMode } from "./enums";

interface CatalogueEntry {
  kind: string;
  mode: RemediationMode;
  label: string;
  description: string;
  requiredRoles: string[];
  requiresHumanApproval: boolean;
}

export const REMEDIATION_CATALOGUE: readonly CatalogueEntry[] = [
  // advisory
  { kind: "request_human_approval", mode: "advisory", label: "Request human approval", description: "Open an approval request for the linked target.", requiredRoles: ["risk", "ops"], requiresHumanApproval: true },
  { kind: "open_incident", mode: "advisory", label: "Open incident", description: "Create an incident from this finding.", requiredRoles: ["ops"], requiresHumanApproval: false },
  { kind: "escalate_intervention", mode: "advisory", label: "Escalate intervention", description: "Escalate to higher-tier reviewer.", requiredRoles: ["ops"], requiresHumanApproval: false },

  // guarded_automation
  { kind: "reduce_allocation", mode: "guarded_automation", label: "Reduce allocation", description: "Temporarily reduce capital allocation.", requiredRoles: ["capital"], requiresHumanApproval: true },
  { kind: "switch_persona_to_shadow", mode: "guarded_automation", label: "Switch persona to shadow", description: "Mark persona shadow in v5 overlay only.", requiredRoles: ["risk"], requiresHumanApproval: true },
  { kind: "start_evolution_run", mode: "guarded_automation", label: "Start evolution run", description: "Trigger an evolution program for the strategy.", requiredRoles: ["ai_trainer"], requiresHumanApproval: false },
  { kind: "route_to_backup_runtime", mode: "guarded_automation", label: "Route to backup runtime", description: "Switch traffic to backup runtime.", requiredRoles: ["ops"], requiresHumanApproval: true },
  { kind: "freeze_rebalance", mode: "guarded_automation", label: "Freeze rebalance", description: "Pause active rebalance window.", requiredRoles: ["capital"], requiresHumanApproval: true },

  // emergency_override
  { kind: "pause_persona_routing", mode: "emergency_override", label: "Pause persona routing", description: "Stop routing strategies to persona (v5 overlay only).", requiredRoles: ["risk", "committee"], requiresHumanApproval: true },
  { kind: "emergency_rollback", mode: "emergency_override", label: "Emergency rollback", description: "Roll back the most recent deployment.", requiredRoles: ["ops", "committee"], requiresHumanApproval: true },
];

export function buildRemediationAction(
  entry: CatalogueEntry,
  args: { id: string; targetKind?: RemediationAction["targetKind"]; targetId?: string },
): RemediationAction {
  return {
    id: args.id,
    kind: entry.kind,
    mode: entry.mode,
    label: entry.label,
    description: entry.description,
    requiredRoles: [...entry.requiredRoles],
    requiresHumanApproval: entry.requiresHumanApproval,
    requiresHighRiskConfirm: entry.mode === "emergency_override", // Q24
    targetKind: args.targetKind,
    targetId: args.targetId,
  };
}

export function findCatalogueEntry(kind: string): CatalogueEntry | undefined {
  return REMEDIATION_CATALOGUE.find((c) => c.kind === kind);
}
