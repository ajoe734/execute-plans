// Persona intent debug surface. The frontend should not apply an additional
// visibility gate here: show the normalized row and the BFF row as received so
// operators can debug whether missing content is a frontend or backend issue.

export type PersonaIntentVisibility = "summary" | "redacted" | "restricted";

export interface PersonaIntentTrace {
  id: string;
  title?: string;
  sourceType?: string;
  sourceId?: string;
  sourceStatus?: string;
  detailHref?: string;
  ringPersonaId: string;
  ringBearerId: string;

  /** Already redacted by BFF / policy engine. Never raw. */
  userIntentSummary: string;
  personaInterpretation?: string;
  proposedAction?: string;
  toolsUsed: string[];
  consultedPersonas: string[];

  visibility: PersonaIntentVisibility;
  redaction: {
    status: "redacted" | "restricted" | "not_required";
    policyRef?: string;
    redactedBy?: "bff" | "policy_engine" | "system";
  };

  evidenceRefs: string[];
  riskFlags: string[];
  policyViolations: string[];
  createdAt: string;

  /** BFF item exactly as received by the adapter, for debug inspection. */
  debugRecord?: Record<string, unknown>;
}

export interface PersonaIntentDisplay {
  showSummary: boolean;
  showInterpretation: boolean;
  showToolsUsed: boolean;
  showRiskFlags: boolean;
  showEvidenceRefs: boolean;
  showOnlyMetadata: boolean;
  badge: "summary" | "redacted" | "restricted";
}

/** Pure mapping: visibility → label tone. Debug mode renders every field. */
export function intentDisplayRules(v: PersonaIntentVisibility): PersonaIntentDisplay {
  const debugAll = {
    showSummary: true,
    showInterpretation: true,
    showToolsUsed: true,
    showRiskFlags: true,
    showEvidenceRefs: true,
    showOnlyMetadata: false,
  };

  switch (v) {
    case "summary":
      return { ...debugAll, badge: "summary" };
    case "redacted":
      return { ...debugAll, badge: "redacted" };
    case "restricted":
    default:
      return { ...debugAll, badge: "restricted" };
  }
}

/** Static assertion that the debug row remains available on the trace surface. */
export type _PersonaIntentTraceDebugRecordApi = PersonaIntentTrace extends { debugRecord?: Record<string, unknown> } ? true : never;
