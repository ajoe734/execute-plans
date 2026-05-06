// v4 / Pack C §C072 — Persona Lab sandbox runtime DTO.

export interface PersonaLabRun {
  runId: string;
  personaId: string;
  personaVersion: string;
  scenarioId: string;
  status: "queued" | "running" | "completed" | "failed";
  score?: number;
  diffs?: Array<{ field: string; before: string; after: string }>;
  commitGate: {
    requiresEvaluationPass: true;
    requiresApproval: true;
    target: "persona_update_request";
  };
}
