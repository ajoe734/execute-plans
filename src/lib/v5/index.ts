// Pack E — v5 closed-loop view-model layer barrel.
// All decisions Q1–Q28 from .lovable/feedback/2026-05-06-E/Pack_E_Disposition.csv.

export * from "./enums";
export * from "./types";
export * from "./list";
export * from "./events";
export * from "./timeoutPolicy";
export * from "./health";
export * from "./remediation";
export * from "./overlay";
export * from "./sentinel";
export { adaptPersonaHealth } from "./adapters/persona";
export { adaptStrategyHealth } from "./adapters/strategy";
export { deriveLoopRuns, loopRunsByKind } from "./adapters/loopRun";
export {
  adaptApprovalToIntervention,
  adaptFindingToIntervention,
  adaptIncidentToIntervention,
} from "./adapters/intervention";
