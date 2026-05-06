// v4 / Pack C §C012 — LifecycleStepper render hints.

export type RenderHint = "linear" | "branchy";

export interface RenderHintRow {
  machine: string;
  renderHint: RenderHint;
  uiComponent: string;
}

export const RENDER_HINTS: readonly RenderHintRow[] = [
  { machine: "Strategy", renderHint: "linear", uiComponent: "LifecycleStepper horizontal" },
  { machine: "Review", renderHint: "branchy", uiComponent: "WorkflowStepper with branch badges" },
  { machine: "Rebalance", renderHint: "linear", uiComponent: "WizardStepper vertical on detail page" },
  { machine: "Evolution", renderHint: "branchy", uiComponent: "Run timeline + candidate cards" },
  { machine: "Deployment", renderHint: "linear", uiComponent: "DeploymentStepper" },
  { machine: "Incident", renderHint: "branchy", uiComponent: "IncidentTimeline" },
  { machine: "Memory", renderHint: "linear", uiComponent: "StatusBadge + audit timeline" },
  { machine: "Skill", renderHint: "linear", uiComponent: "SandboxApprovalStepper" },
] as const;
