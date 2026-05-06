// v4 / Pack C §C001 — Legacy → v3 mapping table.
// Used by BFF type bridges; UI must NOT read legacy fields directly.

export interface LegacyMappingRule {
  entity: string;
  legacyField: string;
  v3Field: string;
  rule: string;
  deprecation: string; // ISO date
}

export const LEGACY_MAPPING: readonly LegacyMappingRule[] = [
  { entity: "Strategy", legacyField: "state", v3Field: "lifecycleStatus",
    rule: "Map legacy state into lifecycleStatus. under_review → reviewStatus=pending; paused → deploymentStatus=stopped.",
    deprecation: "2026-06-30" },
  { entity: "Strategy", legacyField: "reviewState", v3Field: "reviewStatus",
    rule: "If reviewState exists, overrides inferred reviewStatus.", deprecation: "2026-06-30" },
  { entity: "Strategy", legacyField: "deploymentState", v3Field: "deploymentStatus",
    rule: "If deploymentState exists, overrides inferred deploymentStatus.", deprecation: "2026-06-30" },
  { entity: "Persona", legacyField: "state", v3Field: "status",
    rule: "degraded is invalid; map to restricted and emit migrationWarning.", deprecation: "2026-06-30" },
  { entity: "CapitalPool", legacyField: "state", v3Field: "status",
    rule: "Direct map: draft/active/frozen/retired.", deprecation: "2026-06-30" },
  { entity: "Skill", legacyField: "deprecating", v3Field: "deprecated",
    rule: "Collapse intermediate deprecating into deprecated.", deprecation: "2026-06-30" },
  { entity: "Memory", legacyField: "isolated", v3Field: "quarantined",
    rule: "Rename isolated to quarantined.", deprecation: "2026-06-30" },
  { entity: "availableActions", legacyField: "string[]", v3Field: "ActionDescriptor[]",
    rule: "Each string must be expanded through action catalog.", deprecation: "2026-06-30" },
] as const;

export function mapPersonaState(legacy: string): { value: string; warning?: string } {
  if (legacy === "degraded") return { value: "restricted", warning: "Persona.state=degraded is invalid; mapped to restricted." };
  return { value: legacy };
}
