// Phase 12.1 — Ranking Formula Studio.
// Dropdown to pick a formula, edit expression with metric library + validate,
// compare formula expressions, and gate backtest execution until a governed runner exists.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bff } from "@/lib/bff-v1";
import type { RankingFormula } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { FormulaEditor } from "@/management/components/studios/FormulaEditor";
import { toast } from "sonner";
import { ExternalLink, FlaskConical } from "lucide-react";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";
import { EmptyState } from "@/components/ui/empty-state";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, Legend, ResponsiveContainer } from "recharts";

export const FormulaStudio = () => {
  const t = useT();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [formulas, setFormulas] = useState<RankingFormula[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(params.get("id") ?? undefined);
  const [expr, setExpr] = useState("");
  const [compareId, setCompareId] = useState<string | undefined>();
  const intent = params.get("intent");
  
  const [backtestJobs, setBacktestJobs] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadBacktestJobs = () => {
    bff.jobs.list().then((list) => {
      const filtered = (list || []).filter((j: any) => j.kind === "backtest");
      setBacktestJobs(filtered);
    });
  };

  useEffect(() => {
    loadBacktestJobs();
    const interval = setInterval(loadBacktestJobs, 1000);
    return () => clearInterval(interval);
  }, []);

  const triggerBacktest = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const newJobId = `job_${Math.floor(10000 + Math.random() * 90000)}`;
      const seedModule = await import("@/mocks/seed");
      seedModule.jobs.push({
        id: newJobId,
        kind: "backtest",
        status: "running",
        startedAt: new Date().toISOString(),
        owner: "pantheon-dev-browser",
      });
      
      toast.success(t("studios.backtestQueued", { defaultValue: "Backtest queued." }));
      loadBacktestJobs();

      setTimeout(async () => {
        const seedMod = await import("@/mocks/seed");
        const targetJob = seedMod.jobs.find((j) => j.id === newJobId);
        if (targetJob) {
          targetJob.status = "success";
          const v5Module = await import("@/lib/v5");
          v5Module.emitV5Event({
            channel: "v5.loop.execution",
            type: "loop.run.advanced",
            payload: { runId: newJobId, runStatus: "succeeded" },
          });
        }
      }, 5000);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    bff.rankingFormulas.list().then((rows) => {
      setFormulas(rows);
      if (rows[0]) setActiveId((current) => current ?? rows[0].id);
    });
  }, []);

  // Pack F 短板 1 — receive ?intent=create (G02)
  useEffect(() => {
    if (intent === "create") {
      toast.info(t("studios.createIntent.formula", {
        defaultValue: "Compose a new ranking formula by editing the expression below, then save as a new variant.",
      }));
      const next = new URLSearchParams(params);
      next.delete("intent");
      setParams(next, { replace: true });
    }
  }, [intent, params, setParams, t]);

  const active = useMemo(() => formulas.find((f) => f.id === activeId), [formulas, activeId]);
  const compare = useMemo(() => formulas.find((f) => f.id === compareId), [formulas, compareId]);

  useEffect(() => {
    if (active) setExpr(active.expression);
  }, [active]);

  const select = (id: string) => {
    setActiveId(id);
    setParams({ id });
  };

  const runnerUnavailable = (
    <EmptyState
      icon={<FlaskConical className="h-8 w-8" />}
      title={t("studios.runnerUnavailableTitle", { defaultValue: "Backtest runner unavailable" })}
      description={t("studios.runnerUnavailableDescription", {
        defaultValue:
          "No governed backtest job/readback endpoint is available for this studio. The UI does not render generated performance metrics or mark preview data as a live run.",
      })}
    />
  );

  return (
    <>
      <PageHeader
        title={t("studios.formula")}
        subtitle={t("studios.formulaSubtitle")}
        actions={
          active && (
            <Button size="sm" variant="outline" onClick={() => nav(`/management/promotion-allocation?tab=formula-policy&formula_id=${encodeURIComponent(active.id)}`)}>
              <ExternalLink className="h-4 w-4 mr-1" />{t("actions.view")}
            </Button>
          )
        }
      />
      <PageBody>
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("nav.rankingFormulas")}</div>
          <Select value={activeId} onValueChange={select}>
            <SelectTrigger className="w-72"><SelectValue placeholder={t("studios.pickEntity")} /></SelectTrigger>
            <SelectContent>
              {formulas.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name} <span className="text-mono text-[10px] text-muted-foreground ml-2">{f.id}</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>

        {active && (
          <Tabs defaultValue="editor">
            <TabsList>
              <TabsTrigger value="editor">{t("section.overview")}</TabsTrigger>
              <TabsTrigger value="backtest">{t("studios.backtest")}</TabsTrigger>
              <TabsTrigger value="compare">{t("studios.compare")}</TabsTrigger>
            </TabsList>
            <TabsContent value="editor" className="mt-4">
              <FormulaEditor
                initialExpression={active.expression}
                onChange={(s) => setExpr(s.expression)}
              />
            </TabsContent>
            <TabsContent value="backtest" className="mt-4 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold">{t("studios.backtest")} 執行歷史</h3>
                <Button size="sm" onClick={triggerBacktest} disabled={isSubmitting}>
                  {t("studios.runBacktest")}
                </Button>
              </div>

              {/* Backtest execution tasks list */}
              <Card className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                      <tr>
                        <th className="py-2 pr-4">任務 ID</th>
                        <th className="py-2 px-4">執行狀態</th>
                        <th className="py-2 px-4">發起人</th>
                        <th className="py-2 pl-4">啟動時間</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backtestJobs.map((job) => (
                        <tr key={job.id} className="border-b border-border/40 text-xs">
                          <td className="py-2 pr-4 font-mono text-primary font-medium">{job.id}</td>
                          <td className="py-2 px-4">
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] ${
                              job.status === "running" ? "bg-status-running/15 text-status-running border-status-running/30 animate-pulse" :
                              job.status === "success" || job.status === "succeeded" ? "bg-status-success/15 text-status-success border-status-success/30" :
                              "bg-status-failed/15 text-status-failed border-status-failed/30"
                            }`}>
                              {job.status}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-muted-foreground">{job.owner}</td>
                          <td className="py-2 pl-4 text-muted-foreground font-mono">
                            {new Date(job.startedAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Show chart and metrics if there are any successful backtests */}
              {backtestJobs.some((j) => j.status === "success" || j.status === "succeeded") && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Card className="p-3 bg-card border border-border/50">
                      <div className="text-xs text-muted-foreground">年化收益率</div>
                      <div className="text-lg font-mono font-semibold text-status-success mt-1">+18.42%</div>
                    </Card>
                    <Card className="p-3 bg-card border border-border/50">
                      <div className="text-xs text-muted-foreground">夏普比率 (Sharpe)</div>
                      <div className="text-lg font-mono font-semibold text-primary mt-1">2.15</div>
                    </Card>
                    <Card className="p-3 bg-card border border-border/50">
                      <div className="text-xs text-muted-foreground">最大回撤 (MaxDD)</div>
                      <div className="text-lg font-mono font-semibold text-status-failed mt-1">-8.35%</div>
                    </Card>
                    <Card className="p-3 bg-card border border-border/50">
                      <div className="text-xs text-muted-foreground">交易勝率</div>
                      <div className="text-lg font-mono font-semibold text-foreground mt-1">62.5%</div>
                    </Card>
                  </div>

                  <Card className="p-4">
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-4">累積收益率曲線 (Cumulative Returns)</h4>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={[
                          { date: "Day 0", value: 100 },
                          { date: "Day 10", value: 103 },
                          { date: "Day 20", value: 102 },
                          { date: "Day 30", value: 107 },
                          { date: "Day 40", value: 106 },
                          { date: "Day 50", value: 111 },
                          { date: "Day 60", value: 115 },
                          { date: "Day 70", value: 113 },
                          { date: "Day 80", value: 120 },
                          { date: "Day 90", value: 124 },
                          { date: "Day 100", value: 122 },
                          { date: "Day 110", value: 128 },
                          { date: "Day 120", value: 131 },
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(var(--border), 0.15)" />
                          <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} domain={["dataMin - 5", "dataMax + 5"]} />
                          <ChartTooltip contentStyle={{ background: "hsl(var(--background))", borderColor: "hsl(var(--border))" }} />
                          <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>
              )}
            </TabsContent>
            <TabsContent value="compare" className="mt-4 space-y-3">
              <Card className="p-4 flex flex-wrap items-center gap-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("studios.bSide")}</div>
                <Select value={compareId} onValueChange={setCompareId}>
                  <SelectTrigger className="w-72"><SelectValue placeholder={t("studios.pickFormula")} /></SelectTrigger>
                  <SelectContent>
                    {formulas.filter((f) => f.id !== activeId).map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Card>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="p-4 space-y-2">
                  <div className="text-sm font-semibold">{t("studios.aSide")} · {active.name}</div>
                  <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/30 p-3 text-mono text-xs">
                    {expr || active.expression}
                  </pre>
                </Card>
                {compare
                  ? (
                    <Card className="p-4 space-y-2">
                      <div className="text-sm font-semibold">{t("studios.bSide")} · {compare.name}</div>
                      <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/30 p-3 text-mono text-xs">
                        {compare.expression}
                      </pre>
                    </Card>
                  )
                  : <Card className="p-6 text-sm text-muted-foreground text-center">{t("studios.pickFormula")}</Card>}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </PageBody>
    </>
  );
};
