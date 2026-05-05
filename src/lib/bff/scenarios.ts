// Phase 19 — Scenario Runner.
// Curated end-to-end mock flows that exercise the BFF mutation layer the same
// way an operator would, but in one click. Used by:
//   • QA Studio "Scenario Runner" card (manual smoke).
//   • src/lib/bff/scenarios.test.ts (CI smoke for the whole pipeline).
//
// Each step calls a real mutation; the runner records per-step ok/duration so
// the UI can render a green/red ladder. Steps are intentionally idempotent —
// they reset relevant seed rows before mutating so reruns stay deterministic.

import * as seed from "@/mocks/seed";
import { mutations } from "./mutations";
import type { Strategy, Rebalance, ApprovalRequest, Alert, Incident } from "./types";

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

interface Step {
  label: string;
  run: () => Promise<{ ok: boolean; message?: string }>;
}

interface Scenario {
  id: string;
  /** i18n label key (with sensible fallback). */
  labelKey: string;
  fallbackLabel: string;
  reset: () => void;
  steps: Step[];
}

// ---------- Scenario A — Strategy full lifecycle ----------
const scenarioStrategy: Scenario = {
  id: "strategy_lifecycle",
  labelKey: "qa.scenario.strategyLifecycle",
  fallbackLabel: "Strategy: discovered → live",
  reset() {
    const s = seed.strategies.find((x) => x.id === "stg_005") as Strategy | undefined;
    if (s) s.state = "discovered" as Strategy["state"];
  },
  steps: [
    { label: "scaffold_spec", run: () => mutations.runAction({ kind: "Strategy", id: "stg_005", action: "scaffold_spec" }) },
    { label: "run_replication", run: () => mutations.runAction({ kind: "Strategy", id: "stg_005", action: "run_replication" }) },
    { label: "submit_review", run: () => mutations.runAction({ kind: "Strategy", id: "stg_005", action: "submit_review" }) },
    { label: "promote_paper", run: () => mutations.runAction({ kind: "Strategy", id: "stg_005", action: "promote_paper" }) },
    { label: "promote_live", run: () => mutations.runAction({ kind: "Strategy", id: "stg_005", action: "promote_live" }) },
  ],
};

// ---------- Scenario B — Multi-stage approval ----------
const scenarioApproval: Scenario = {
  id: "approval_multistage",
  labelKey: "qa.scenario.approvalMultistage",
  fallbackLabel: "Approval: stage A → stage B → approved",
  reset() {
    const a = seed.approvals.find((x) => x.id === "ap_302") as ApprovalRequest | undefined;
    if (!a) return;
    a.state = "pending";
    a.stages?.forEach((s) => { s.state = "pending"; s.decidedAt = undefined; s.decidedBy = undefined; s.escalated = false; });
  },
  steps: [
    { label: "decide stage 1: approve", run: () => mutations.decideApproval("ap_302", "approve", "scenario: stage 1") },
    { label: "decide stage 2: approve", run: () => mutations.decideApproval("ap_302", "approve", "scenario: stage 2") },
    { label: "verify state=approved", run: async () => {
        const a = seed.approvals.find((x) => x.id === "ap_302");
        return { ok: a?.state === "approved", message: `state=${a?.state}` };
      } },
  ],
};

// ---------- Scenario C — Rebalance flow ----------
const scenarioRebalance: Scenario = {
  id: "rebalance_flow",
  labelKey: "qa.scenario.rebalanceFlow",
  fallbackLabel: "Rebalance: freeze metric + submit override",
  reset() {
    const r = seed.rebalances.find((x) => x.id === "rb_q2_2026") as Rebalance | undefined;
    if (r) r.state = "review";
  },
  steps: [
    { label: "freeze metric: sharpe", run: () => mutations.freezeMetric("rb_q2_2026", "sharpe", true, "scenario freeze") },
    { label: "submit override", run: () => mutations.submitOverride("rb_q2_2026", "stg_001", -0.02, "scenario override") },
    { label: "unfreeze metric: sharpe", run: () => mutations.freezeMetric("rb_q2_2026", "sharpe", false, "scenario unfreeze") },
  ],
};

// ---------- Scenario D — Incident triage ----------
const scenarioIncident: Scenario = {
  id: "incident_triage",
  labelKey: "qa.scenario.incidentTriage",
  fallbackLabel: "Incident: acknowledge alert → mitigate → resolve",
  reset() {
    const a = seed.alerts[0] as Alert | undefined;
    if (a) a.acknowledged = false;
    const i = seed.incidents[0] as Incident | undefined;
    if (i) i.status = "open";
  },
  steps: [
    { label: "acknowledge first alert", run: () => mutations.acknowledgeAlert(seed.alerts[0]?.id ?? "al_500", "scenario ack") },
    { label: "incident → mitigating", run: () => mutations.setIncidentStatus(seed.incidents[0]?.id ?? "inc_1", "mitigating", "scenario") },
    { label: "incident → resolved", run: () => mutations.setIncidentStatus(seed.incidents[0]?.id ?? "inc_1", "resolved", "scenario") },
  ],
};

// ---------- Scenario E — Governance grant ----------
const scenarioGovernance: Scenario = {
  id: "governance_grant",
  labelKey: "qa.scenario.governanceGrant",
  fallbackLabel: "Governance: permission grant + route policy publish",
  reset() { /* idempotent — the mutations themselves upsert. */ },
  steps: [
    { label: "update permission cell", run: () => {
        const matrix = seed.permissionMatrices[0];
        const cell = matrix?.cells[0];
        if (!matrix || !cell) return Promise.resolve({ ok: false, message: "no matrix seed" });
        const target = cell.grant === "manage" ? "use" : "manage";
        return mutations.updatePermissionMatrix(matrix.instance,
          [{ rowId: cell.rowId, colId: cell.colId, grant: target }], "scenario");
      } },
    { label: "publish route policy", run: () => {
        const policy = seed.routePolicies[0];
        if (!policy) return Promise.resolve({ ok: false, message: "no policy seed" });
        return mutations.publishRoutePolicy(policy.id, policy.rules.slice(0, Math.max(1, policy.rules.length - 1)), "scenario trim");
      } },
  ],
};

// ---------- Scenario F — Signal review → Research handoff ----------
const scenarioSignalHandoff: Scenario = {
  id: "signal_research_handoff",
  labelKey: "qa.scenario.signalResearchHandoff",
  fallbackLabel: "Signal review → research task scaffold",
  reset() { /* idempotent — produces a fresh job each run. */ },
  steps: [
    { label: "convert note → research task", run: () => mutations.createResearchTaskFromNote("nt_signal_001", "scenario handoff") },
    { label: "verify job queued", run: async () => {
        const j = seed.jobs.find((x) => x.kind === "research_task.scaffold");
        return { ok: !!j, message: j ? `job=${j.id}` : "no job seen" };
      } },
  ],
};

// ---------- Scenario G — Skill draft → sandbox → approval ----------
const scenarioSkillSandbox: Scenario = {
  id: "skill_sandbox_approval",
  labelKey: "qa.scenario.skillSandboxApproval",
  fallbackLabel: "Skill: draft → sandbox → validate → approval",
  reset() {
    const s = seed.skills.find((x) => x.id === "sk_macro_brief") as { state?: string; draft?: boolean } | undefined;
    if (s) { s.state = "draft"; s.draft = true; }
  },
  steps: [
    { label: "deploy_sandbox", run: () => mutations.runAction({ kind: "Skill", id: "sk_macro_brief", action: "deploy_sandbox" }) },
    { label: "validate_skill", run: () => mutations.runAction({ kind: "Skill", id: "sk_macro_brief", action: "validate_skill" }) },
    { label: "create approval request", run: async () => {
        const r = await mutations.createApproval({
          kind: "skill_publish",
          subject: "sk_macro_brief publish",
          rationale: "scenario runner — sandbox passed validators",
          riskLevel: "medium",
          stages: [{ name: "reviewer", slaHours: 6 }, { name: "head_of_research", slaHours: 12 }],
        });
        return { ok: r.ok, message: `approval=${r.approval.id}` };
      } },
  ],
};

export const scenarios: Scenario[] = [
  scenarioStrategy,
  scenarioApproval,
  scenarioRebalance,
  scenarioIncident,
  scenarioGovernance,
  scenarioSignalHandoff,
  scenarioSkillSandbox,
];

export async function runScenario(id: string): Promise<ScenarioResult> {
  const scn = scenarios.find((s) => s.id === id);
  if (!scn) throw new Error(`Unknown scenario: ${id}`);
  scn.reset();
  const t0 = performance.now();
  const steps: ScenarioStepResult[] = [];
  for (const step of scn.steps) {
    const s0 = performance.now();
    try {
      const r = await step.run();
      steps.push({ label: step.label, ok: !!r.ok, durationMs: Math.round(performance.now() - s0), message: r.message });
    } catch (e) {
      steps.push({ label: step.label, ok: false, durationMs: Math.round(performance.now() - s0), message: (e as Error).message });
    }
  }
  return {
    id: scn.id,
    ok: steps.every((s) => s.ok),
    steps,
    totalMs: Math.round(performance.now() - t0),
  };
}

export async function runAllScenarios(): Promise<ScenarioResult[]> {
  const out: ScenarioResult[] = [];
  for (const s of scenarios) out.push(await runScenario(s.id));
  return out;
}

export function getScenarioMeta() {
  return scenarios.map((s) => ({ id: s.id, labelKey: s.labelKey, fallbackLabel: s.fallbackLabel, stepCount: s.steps.length }));
}
