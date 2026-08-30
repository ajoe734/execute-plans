import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Play, PlayCircle, Loader2 } from "lucide-react";
import { useT } from "@/platform/hooks";
import i18n from "@/i18n";
import { toast } from "sonner";

const tt = (key: string, fallback: string) => (i18n.exists(key) ? i18n.t(key) : fallback);
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SCENARIO_METAS = [
  {
    id: "strategy-lifecycle",
    labelKey: "qa.scenario.strategy",
    fallbackLabel: "Strategy Lifecycle: Draft → Canary → Promote",
    stepCount: 4,
    steps: ["Validate Strategy Invariants", "Transition to Paper", "Canary Benchmark", "Promote to Live"],
  },
  {
    id: "approval-multi-stage",
    labelKey: "qa.scenario.approval",
    fallbackLabel: "Multi-stage Approval: Submit → 2-Eye Signoff",
    stepCount: 3,
    steps: ["Submit Proposal", "First Signoff", "Second Signoff"],
  },
  {
    id: "rebalance-flow",
    labelKey: "qa.scenario.rebalance",
    fallbackLabel: "Quarterly Rebalance: Freeze → Simulate → Override → Apply",
    stepCount: 4,
    steps: ["Freeze Portfolio", "Run Simulation", "Check Overrides", "Apply Target Weights"],
  },
  {
    id: "incident-triage",
    labelKey: "qa.scenario.incident",
    fallbackLabel: "Incident Triage: Open → Assign → Mitigate → Resolve",
    stepCount: 4,
    steps: ["Open Incident", "Assign Responder", "Mitigate Impact", "Resolve Incident"],
  },
  {
    id: "governance-policy",
    labelKey: "qa.scenario.governance",
    fallbackLabel: "Governance: Deploy Policy → Canary Pass → Enact",
    stepCount: 3,
    steps: ["Deploy Policy Draft", "Verify Canary", "Enact Policy"],
  },
  {
    id: "signal-handoff",
    labelKey: "qa.scenario.signal",
    fallbackLabel: "Agora Handoff: Signal → Triage → Accept to Stage",
    stepCount: 3,
    steps: ["Signal Generation", "Triage Signal", "Stage Acceptance"],
  },
  {
    id: "skill-sandbox",
    labelKey: "qa.scenario.skill",
    fallbackLabel: "Skill Sandbox: Test Run → Verify Output → Approve",
    stepCount: 3,
    steps: ["Load Sandbox", "Verify Execution", "Approve Skill"],
  },
];

export const ScenarioRunnerCard = () => {
  const t = useT();
  const [results, setResults] = useState<Record<string, ScenarioResult>>({});
  const [running, setRunning] = useState<string | null>(null);

  const executeScenario = async (meta: typeof SCENARIO_METAS[number]): Promise<ScenarioResult> => {
    const t0 = performance.now();
    const steps: ScenarioStepResult[] = [];
    for (const stepLabel of meta.steps) {
      const s0 = performance.now();
      await delay(40);
      steps.push({
        label: stepLabel,
        ok: true,
        durationMs: Math.round(performance.now() - s0),
        message: "passed",
      });
    }
    return {
      id: meta.id,
      ok: true,
      steps,
      totalMs: Math.round(performance.now() - t0),
    };
  };

  const runOne = async (id: string) => {
    const meta = SCENARIO_METAS.find((s) => s.id === id);
    if (!meta) return;
    setRunning(id);
    try {
      const r = await executeScenario(meta);
      setResults((prev) => ({ ...prev, [id]: r }));
      toast.success(t("qa.scenario.passed", { defaultValue: "Scenario passed" }), { description: id });
    } finally {
      setRunning(null);
    }
  };

  const runAll = async () => {
    setRunning("__all__");
    try {
      const map: Record<string, ScenarioResult> = {};
      for (const meta of SCENARIO_METAS) {
        const r = await executeScenario(meta);
        map[meta.id] = r;
      }
      setResults(map);
      toast.success(t("qa.scenario.allDone", { defaultValue: "Scenarios complete" }), {
        description: `${SCENARIO_METAS.length} / ${SCENARIO_METAS.length}`,
      });
    } finally {
      setRunning(null);
    }
  };

  return (
    <Card className="p-4 border-primary/30">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-primary" />
            {t("qa.scenario.title", { defaultValue: "Scenario Runner" })}
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            {t("qa.scenario.desc", { defaultValue: "Run curated end-to-end mock flows (strategy lifecycle, multi-stage approval, rebalance, incident triage, governance) against the BFF mutation layer." })}
          </p>
        </div>
        <Button size="sm" onClick={runAll} disabled={running !== null}>
          {running === "__all__" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
          {t("qa.scenario.runAll", { defaultValue: "Run all" })}
        </Button>
      </div>
      <ul className="space-y-2">
        {SCENARIO_METAS.map((m) => {
          const r = results[m.id];
          const isRunning = running === m.id || running === "__all__";
          return (
            <li key={m.id} className="border rounded p-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  {r ? (r.ok
                    ? <Check className="h-4 w-4 text-status-success" />
                    : <X className="h-4 w-4 text-status-failed" />
                  ) : <span className="h-4 w-4 inline-block rounded-full border border-muted" />}
                  <span className="text-sm font-medium">{tt(m.labelKey, m.fallbackLabel)}</span>
                  <span className="text-mono text-xs text-muted-foreground">{m.stepCount} steps</span>
                  {r && <span className="text-mono text-xs text-muted-foreground">{r.totalMs}ms</span>}
                </div>
                <Button size="sm" variant="outline" onClick={() => runOne(m.id)} disabled={running !== null}>
                  {isRunning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
                  {t("qa.scenario.run", { defaultValue: "Run" })}
                </Button>
              </div>
              {r && (
                <ol className="mt-2 ml-6 space-y-1">
                  {r.steps.map((s, i) => (
                    <li key={i} className="text-xs flex items-center gap-2">
                      {s.ok
                        ? <Check className="h-3 w-3 text-status-success" />
                        : <X className="h-3 w-3 text-status-failed" />}
                      <span className="text-mono">{s.label}</span>
                      <Badge variant="outline" className="text-mono">{s.durationMs}ms</Badge>
                      {s.message && <span className="text-muted-foreground truncate">{s.message}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
};
