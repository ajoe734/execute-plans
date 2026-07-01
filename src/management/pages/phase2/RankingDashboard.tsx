// Ranking Dashboard — Spec Part 3 §15.7.
// 6 scope tabs (Persona/Strategy/Alpha Family/Capital Pool/Paper/Live)
// + Recalculate / Freeze / Publish / Override / Compare / Active formula switch.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/platform/components/DataTable";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { bff, runActionSafe } from "@/lib/bff-v1";
import type { Strategy, RankingFormula, Persona, CapitalPool } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { RefreshCw, Snowflake, Send, GitCompare, Sliders } from "lucide-react";
import { isLive, isPaper } from "@/lib/v4/strategyTripleDerive";

type Scope = "persona" | "strategy" | "alphaFamily" | "capitalPool" | "paper" | "live";
const SCOPES: Scope[] = ["persona", "strategy", "alphaFamily", "capitalPool", "paper", "live"];

interface Row {
  rank: number;
  id: string;
  name: string;
  score: number;
  pnl: number;
  sharpe: number;
  drawdown: number;
  components: { metric: string; value: number; weight: number; contribution: number }[];
}

export const RankingDashboardPage = () => {
  const t = useT();
  const nav = useNavigate();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [pools, setPools] = useState<CapitalPool[]>([]);
  const [formulas, setFormulas] = useState<RankingFormula[]>([]);
  const [formulaId, setFormulaId] = useState<string>("");
  const [scope, setScope] = useState<Scope>("strategy");
  const [active, setActive] = useState<Row | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      bff.strategies.list(), bff.rankingFormulas.list(),
      bff.personas.list(), bff.capitalPools.list(),
    ]).then(([s, f, p, c]) => {
      setStrategies(s); setFormulas(f); setPersonas(p); setPools(c);
      if (f[0]) setFormulaId(f[0].id);
    });
  }, []);

  const rows = useMemo<Row[]>(() => {
    const mkRow = (id: string, name: string, sharpe: number, pnl: number, dd: number): Row => {
      const components = [
        { metric: "sharpe", value: sharpe, weight: 0.4, contribution: sharpe * 0.4 },
        { metric: "pnl_30d", value: pnl, weight: 0.35, contribution: pnl * 0.35 * 10 },
        { metric: "drawdown", value: dd, weight: -0.25, contribution: dd * -0.25 * 10 },
      ];
      const score = components.reduce((a, c) => a + c.contribution, 0);
      return { rank: 0, id, name, score, pnl, sharpe, drawdown: dd, components };
    };

    let raw: Row[] = [];
    if (scope === "strategy") raw = strategies.map((s) => mkRow(s.id, s.name, s.sharpe, s.pnl30d, s.drawdown));
    else if (scope === "paper") raw = strategies.filter((s) => isPaper(s)).map((s) => mkRow(s.id, s.name, s.sharpe, s.pnl30d, s.drawdown));
    else if (scope === "live") raw = strategies.filter((s) => isLive(s)).map((s) => mkRow(s.id, s.name, s.sharpe, s.pnl30d, s.drawdown));
    else if (scope === "persona") {
      raw = personas.map((p) => {
        const owned = strategies.filter((s) => s.personaIds.includes(p.id));
        const avg = (k: keyof Pick<Strategy, "sharpe"|"pnl30d"|"drawdown">) =>
          owned.length ? owned.reduce((a, s) => a + (s[k] as number), 0) / owned.length : 0;
        return mkRow(p.id, p.name, avg("sharpe"), avg("pnl30d"), avg("drawdown"));
      });
    } else if (scope === "capitalPool") {
      raw = pools.map((cp) => {
        const owned = strategies.filter((s) => s.capitalPoolId === cp.id);
        const avg = (k: keyof Pick<Strategy, "sharpe"|"pnl30d"|"drawdown">) =>
          owned.length ? owned.reduce((a, s) => a + (s[k] as number), 0) / owned.length : 0;
        return mkRow(cp.id, cp.name, avg("sharpe"), avg("pnl30d"), avg("drawdown"));
      });
    } else if (scope === "alphaFamily") {
      const families = new Map<string, Strategy[]>();
      strategies.forEach((s) => {
        const f = s.alpha ?? "unknown";
        const arr = families.get(f) ?? []; arr.push(s); families.set(f, arr);
      });
      raw = Array.from(families.entries()).map(([f, list]) => {
        const avg = (k: keyof Pick<Strategy, "sharpe"|"pnl30d"|"drawdown">) =>
          list.reduce((a, s) => a + (s[k] as number), 0) / list.length;
        return mkRow(f, f, avg("sharpe"), avg("pnl30d"), avg("drawdown"));
      });
    }
    return raw.sort((a, b) => b.score - a.score).map((r, i) => ({ ...r, rank: i + 1 }));
  }, [strategies, personas, pools, scope]);

  const runScopeAction = async (action: "recalculate" | "freeze" | "publish" | "override" | "compare", memo = "") => {
    await runActionSafe({
      kind: "Ranking",
      id: `ranking:${scope}`,
      action,
      memo: memo || `${scope}/${formulaId}`,
    }, {
      successTitle: t(`rankingDashboard.toast.${action === "freeze" ? "frozen" : action === "publish" ? "published" : action === "compare" ? "compareQueued" : action === "recalculate" ? "recalculated" : "override"}`, { scope }),
    });
  };

  const activeFormulaName = formulas.find((f) => f.id === formulaId)?.name ?? "";

  return (
    <>
      <PageHeader title={t("nav.ranking")} subtitle={t("rankingDashboard.subtitle")} actions={
        <div className="flex items-center gap-2">
          <select className="h-9 px-3 rounded-md border border-border bg-background text-sm" value={formulaId} onChange={(e) => setFormulaId(e.target.value)}>
            {formulas.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={() => setSwitchOpen(true)}>{t("rankingDashboard.actions.activeVersion")}</Button>
          <Button size="sm" variant="outline" onClick={() => runScopeAction("recalculate")}><RefreshCw className="h-4 w-4 mr-1" />{t("rankingDashboard.actions.recalculate")}</Button>
          <Button size="sm" variant="outline" onClick={() => runScopeAction("compare", `vs ${formulas[1]?.id ?? "n/a"}`)}><GitCompare className="h-4 w-4 mr-1" />{t("rankingDashboard.actions.compare")}</Button>
          <Button size="sm" variant="outline" onClick={() => setFreezeOpen(true)}><Snowflake className="h-4 w-4 mr-1" />{t("rankingDashboard.actions.freeze")}</Button>
          <Button size="sm" onClick={() => setPublishOpen(true)}><Send className="h-4 w-4 mr-1" />{t("rankingDashboard.actions.publish")}</Button>
        </div>
      }/>
      <PageBody>
        <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <TabsList>
            {SCOPES.map((s) => <TabsTrigger key={s} value={s}>{t(`rankingDashboard.scope.${s}`)}</TabsTrigger>)}
          </TabsList>
          {SCOPES.map((s) => (
            <TabsContent key={s} value={s} className="mt-4">
              <Card>
                <DataTable<Row> rows={rows} onRowClick={setActive} columns={[
                  { key: "rank", header: "#", cell: (r) => <span className="text-mono text-sm font-semibold">{r.rank}</span> },
                  { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
                  { key: "score", header: t("rankingDashboard.score"), cell: (r) => <span className="text-mono text-sm">{r.score.toFixed(3)}</span> },
                  { key: "sharpe", header: t("table.sharpe"), cell: (r) => <span className="text-mono text-xs">{r.sharpe.toFixed(2)}</span> },
                  { key: "pnl", header: "PnL 30d", cell: (r) => <span className={`text-mono text-xs ${r.pnl >= 0 ? "text-status-success" : "text-status-failed"}`}>{(r.pnl * 100).toFixed(2)}%</span> },
                  { key: "dd", header: t("table.drawdown"), cell: (r) => <span className="text-mono text-xs text-status-failed">{(r.drawdown * 100).toFixed(2)}%</span> },
                  { key: "act", header: "", cell: (r) => (
                    <Button size="sm" variant="ghost" className="h-7" onClick={(e) => { e.stopPropagation(); runScopeAction("override", `${r.id}`); }}>
                      <Sliders className="h-3.5 w-3.5 mr-1" />{t("rankingDashboard.actions.override")}
                    </Button>
                  ) },
                ]} />
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </PageBody>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px]">
          {active && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2 mb-2"><Badge variant="outline">#{active.rank}</Badge><span className="text-mono text-xs text-muted-foreground">{active.id}</span></div>
                <SheetTitle>{active.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <Card className="p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("rankingDashboard.breakdown")}</div>
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-muted-foreground"><th className="text-left py-1">{t("table.metric")}</th><th className="text-right">{t("table.value")}</th><th className="text-right">{t("section.weight")}</th><th className="text-right">{t("section.contribution")}</th></tr></thead>
                    <tbody>
                      {active.components.map((c) => (
                        <tr key={c.metric} className="border-t border-border">
                          <td className="py-1.5 text-mono text-xs">{c.metric}</td>
                          <td className="text-right text-mono text-xs">{c.value.toFixed(3)}</td>
                          <td className="text-right text-mono text-xs">{c.weight.toFixed(2)}</td>
                          <td className="text-right text-mono text-xs font-semibold">{c.contribution.toFixed(3)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border">
                        <td colSpan={3} className="py-1.5 text-right text-xs text-muted-foreground">{t("section.total")}</td>
                        <td className="text-right text-mono text-sm font-bold">{active.score.toFixed(3)}</td>
                      </tr>
                    </tbody>
                  </table>
                </Card>
                {scope === "strategy" || scope === "paper" || scope === "live" ? (
                  <Button size="sm" onClick={() => nav(`/management/strategies/${active.id}`)}>{t("rankingDashboard.openStrategy")}</Button>
                ) : null}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <HighRiskConfirm
        open={switchOpen} onOpenChange={setSwitchOpen}
        operation="ranking.formula.set_active"
        target={{ type: "RankingFormula", id: formulaId, name: activeFormulaName }}
        risk="high"
        riskImpact={t("rankingDashboard.confirm.switchFormulaImpact")}
        title={t("rankingDashboard.confirm.switchFormula")}
        confirmToken="ACTIVATE"
        onConfirm={async (memo) => {
          await runActionSafe({
            kind: "RankingFormula",
            id: formulaId,
            action: "set_active",
            memo,
          }, {
            successTitle: t("rankingDashboard.toast.formulaSwitched", { name: activeFormulaName }),
          });
        }}
      />
      <HighRiskConfirm
        open={freezeOpen} onOpenChange={setFreezeOpen}
        operation="ranking.freeze"
        target={{ type: "Ranking", id: scope, name: t(`rankingDashboard.scope.${scope}`) }}
        risk="high"
        title={t("rankingDashboard.confirm.freeze")}
        riskImpact={t("rankingDashboard.confirm.freezeImpact")}
        confirmToken="FREEZE"
        onConfirm={async (memo) => { await runScopeAction("freeze", memo); }}
      />
      <HighRiskConfirm
        open={publishOpen} onOpenChange={setPublishOpen}
        operation="ranking.publish"
        target={{ type: "Ranking", id: scope, name: t(`rankingDashboard.scope.${scope}`) }}
        risk="high"
        title={t("rankingDashboard.confirm.publish")}
        riskImpact={t("rankingDashboard.confirm.publishImpact")}
        confirmToken="PUBLISH"
        onConfirm={async (memo) => { await runScopeAction("publish", memo); }}
      />
    </>
  );
};
