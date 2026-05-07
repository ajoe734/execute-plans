import { useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useT } from "@/platform/hooks";
import { Beaker, Play, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { toast } from "sonner";

interface EvalCase {
  id: string;
  prompt: string;
  expected: string;
  observed?: string;
  status: "pass" | "fail" | "skipped" | "pending";
}

interface EvalSuite {
  id: string;
  name: string;
  target: string;
  archetype: string;
  cases: EvalCase[];
  lastRun?: string;
}

const seed: EvalSuite[] = [
  {
    id: "es_macro", name: "macro_briefing v2.0 regression", target: "skill:sk_macro_brief", archetype: "Macro",
    lastRun: new Date(Date.now() - 3600_000).toISOString(),
    cases: [
      { id: "c1", prompt: "Brief on USD strength today.", expected: "starts with 'Regime: USD-'", observed: "Regime: USD-strong. Drivers: …", status: "pass" },
      { id: "c2", prompt: "Brief on gold rally.", expected: "mentions real yields", observed: "Regime: risk-off. Real 10y −5bp …", status: "pass" },
      { id: "c3", prompt: "Brief on JPY weakness.", expected: "mentions BoJ stance", observed: "Yen weakening on widening yield gap…", status: "fail" },
      { id: "c4", prompt: "Brief on copper.", expected: "mentions China demand", status: "pending" },
    ],
  },
  {
    id: "es_signal", name: "signal_review v1.4", target: "skill:sk_signal_review", archetype: "Quant",
    lastRun: new Date(Date.now() - 86400_000).toISOString(),
    cases: [
      { id: "c1", prompt: "High-risk low-conviction signal.", expected: "default = flag", observed: "flag", status: "pass" },
      { id: "c2", prompt: "Low-risk high-conviction signal.", expected: "default = approve", observed: "approve", status: "pass" },
      { id: "c3", prompt: "Adversarial input.", expected: "graceful degradation", observed: "—", status: "skipped" },
    ],
  },
];

const statusIcon = (s: EvalCase["status"]) =>
  s === "pass" ? <CheckCircle2 className="h-4 w-4 text-status-success" />
  : s === "fail" ? <XCircle className="h-4 w-4 text-status-failed" />
  : s === "skipped" ? <MinusCircle className="h-4 w-4 text-muted-foreground" />
  : <div className="h-4 w-4 rounded-full bg-muted animate-pulse" />;

export const EvaluationSuites = () => {
  const t = useT();
  const [suites, setSuites] = useState<EvalSuite[]>(seed);
  const [active, setActive] = useState<EvalSuite>(seed[0]);
  const [running, setRunning] = useState(false);

  const summary = (s: EvalSuite) => {
    const total = s.cases.length;
    const pass = s.cases.filter((c) => c.status === "pass").length;
    const fail = s.cases.filter((c) => c.status === "fail").length;
    return { total, pass, fail, score: total ? pass / total : 0 };
  };

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      setSuites((ss) =>
        ss.map((s) => s.id === active.id
          ? { ...s, lastRun: new Date().toISOString(), cases: s.cases.map((c) => c.status === "pending" ? { ...c, status: "pass", observed: "(re-run mock pass)" } : c) }
          : s)
      );
      setActive((a) => ({ ...a, lastRun: new Date().toISOString(), cases: a.cases.map((c) => c.status === "pending" ? { ...c, status: "pass", observed: "(re-run mock pass)" } : c) }));
      setRunning(false);
      toast.success("Suite re-run complete");
    }, 1000);
  };

  return (
    <>
      <PageHeader title={t("nav.eval")} subtitle={t("agora.evaluations.subtitle")} />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 space-y-2">
            {suites.map((s) => {
              const sm = summary(s);
              return (
                <Card key={s.id} onClick={() => setActive(s)} className={`p-3 cursor-pointer transition ${active.id === s.id ? "ring-2 ring-accent" : "hover:bg-muted/40"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Beaker className="h-4 w-4 text-accent" />
                    <span className="text-sm font-semibold flex-1 truncate">{s.name}</span>
                    <Badge variant="outline" className={`text-[10px] ${sm.fail > 0 ? "bg-status-failed/15 text-status-failed border-status-failed/30" : "bg-status-success/15 text-status-success border-status-success/30"}`}>
                      {sm.pass}/{sm.total}
                    </Badge>
                  </div>
                  <div className="text-mono text-[10px] text-muted-foreground">{s.target}</div>
                  <Progress value={sm.score * 100} className="h-1 mt-2" />
                </Card>
              );
            })}
          </div>

          <Card className="lg:col-span-3 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold">{active.name}</h3>
                <div className="text-mono text-xs text-muted-foreground mt-0.5">{active.target} · {active.archetype}</div>
                {active.lastRun && <div className="text-mono text-[10px] text-muted-foreground mt-1">Last run: {new Date(active.lastRun).toLocaleString()}</div>}
              </div>
              <Button size="sm" onClick={run} disabled={running}><Play className="h-4 w-4 mr-1" />{running ? "Running…" : "Re-run"}</Button>
            </div>

            <div className="space-y-2">
              {active.cases.map((c) => (
                <div key={c.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    {statusIcon(c.status)}
                    <span className="text-mono text-xs font-semibold uppercase tracking-wider">{c.status}</span>
                    <span className="text-mono text-[10px] text-muted-foreground ml-auto">{c.id}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("agora.evaluation.prompt")}</div>
                      {c.prompt}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("agora.evaluation.expected")}</div>
                      {c.expected}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("agora.evaluation.observed")}</div>
                      {c.observed ?? <span className="text-muted-foreground">—</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </PageBody>
    </>
  );
};
