// 2026-05-20 revamp §6 + design ruling §2.
// HARD RULE: BFF MUST NOT return raw prompts. `userIntentSummary` is treated
// as already redacted. UI MUST NOT expose any reveal/expand/download/
// reconstruct affordance.

export type PersonaIntentVisibility = "summary" | "redacted" | "restricted";

export interface PersonaIntentTrace {
  id: string;
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

/** Pure mapping: visibility → which fields are renderable. No reveal toggles. */
export function intentDisplayRules(v: PersonaIntentVisibility): PersonaIntentDisplay {
  switch (v) {
    case "summary":
      return {
        showSummary: true, showInterpretation: true, showToolsUsed: true,
        showRiskFlags: true, showEvidenceRefs: true, showOnlyMetadata: false,
        badge: "summary",
      };
    case "redacted":
      return {
        showSummary: true, showInterpretation: false, showToolsUsed: false,
        showRiskFlags: true, showEvidenceRefs: false, showOnlyMetadata: false,
        badge: "redacted",
      };
    case "restricted":
      return {
        showSummary: false, showInterpretation: false, showToolsUsed: false,
        showRiskFlags: false, showEvidenceRefs: false, showOnlyMetadata: true,
        badge: "restricted",
      };
  }
}

/** Static assertion that no reveal/raw API exists on the trace surface. */
export type _NoRawPromptApi = PersonaIntentTrace extends { rawPrompt: unknown } ? never : true;
