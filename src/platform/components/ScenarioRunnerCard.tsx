// Phase 19 — Scenario Runner card for QA Studio.
// Lets QA click-run any curated end-to-end scenario and see per-step ladder.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Play, PlayCircle, Loader2 } from "lucide-react";
import { useT } from "@/platform/hooks";
import { runAllScenarios, runScenario, getScenarioMeta, type ScenarioResult } from "@/lib/bff/scenarios";
import i18n from "@/i18n";
import { toast } from "sonner";

const tt = (key: string, fallback: string) => (i18n.exists(key) ? i18n.t(key) : fallback);

export const ScenarioRunnerCard = () => {
  const t = useT();
  const meta = getScenarioMeta();
  const [results, setResults] = useState<Record<string, ScenarioResult>>({});
  const [running, setRunning] = useState<string | null>(null);

  const runOne = async (id: string) => {
    setRunning(id);
    try {
      const r = await runScenario(id);
      setResults((prev) => ({ ...prev, [id]: r }));
      if (r.ok) {
        toast.success(t("qa.scenario.passed", { defaultValue: "Scenario passed" }), { description: id });
      } else {
        toast.error(t("qa.scenario.failed", { defaultValue: "Scenario failed" }), { description: id });
      }
    } finally { setRunning(null); }
  };
  const runAll = async () => {
    setRunning("__all__");
    try {
      const all = await runAllScenarios();
      const map: Record<string, ScenarioResult> = {};
      all.forEach((r) => { map[r.id] = r; });
      setResults(map);
      const passed = all.filter((r) => r.ok).length;
      toast.success(t("qa.scenario.allDone", { defaultValue: "Scenarios complete" }),
        { description: `${passed} / ${all.length}` });
    } finally { setRunning(null); }
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
        {meta.map((m) => {
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
