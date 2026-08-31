// Strict-live mock scenarios stub — fails closed in production bundle.
export interface ScenarioStepResult {
  label: string;
  ok: boolean;
  durationMs: number;
  message?: string;
}

export interface ScenarioResult {
  id: string;
  ok: boolean;
  steps: ScenarioStepResult[];
  totalMs: number;
}

export function getScenarioMeta(): Array<{ id: string; labelKey: string; fallbackLabel: string; stepCount: number }> {
  return [
    { id: "strategy_lifecycle", labelKey: "qa.scenario.strategyLifecycle", fallbackLabel: "Strategy: discovered → live", stepCount: 5 },
    { id: "approval_multistage", labelKey: "qa.scenario.approvalMultistage", fallbackLabel: "Approval: stage A → stage B → approved", stepCount: 3 },
    { id: "rebalance_flow", labelKey: "qa.scenario.rebalanceFlow", fallbackLabel: "Rebalance: freeze metric + submit override", stepCount: 3 },
    { id: "incident_triage", labelKey: "qa.scenario.incidentTriage", fallbackLabel: "Incident: open → mitigate → resolve", stepCount: 3 },
    { id: "governance_policy", labelKey: "qa.scenario.governancePolicy", fallbackLabel: "Governance: draft → enacted", stepCount: 3 },
    { id: "signal_research_handoff", labelKey: "qa.scenario.signalResearchHandoff", fallbackLabel: "Signal review → research task scaffold", stepCount: 2 },
    { id: "skill_sandbox_approval", labelKey: "qa.scenario.skillSandboxApproval", fallbackLabel: "Skill: draft → sandbox → validate → approval", stepCount: 3 },
  ];
}

export async function runScenario(id: string): Promise<ScenarioResult> {
  return {
    id,
    ok: false,
    steps: [{ label: "mock_unavailable", ok: false, durationMs: 0, message: "Mock scenarios unavailable in strict-live production build" }],
    totalMs: 0,
  };
}

export async function runAllScenarios(): Promise<ScenarioResult[]> {
  const meta = getScenarioMeta();
  return meta.map((m) => ({
    id: m.id,
    ok: false,
    steps: [{ label: "mock_unavailable", ok: false, durationMs: 0, message: "Mock scenarios unavailable in strict-live production build" }],
    totalMs: 0,
  }));
}
