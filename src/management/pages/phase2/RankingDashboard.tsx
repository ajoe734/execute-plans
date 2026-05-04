// Ranking Dashboard — Spec Part 3 §15.7.
// Performance ranking main table + Score Breakdown drawer.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/platform/components/DataTable";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { bff } from "@/lib/bff/client";
import type { Strategy, RankingFormula } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";

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
  const [formulas, setFormulas] = useState<RankingFormula[]>([]);
  const [formulaId, setFormulaId] = useState<string>("");
  const [active, setActive] = useState<Row | null>(null);

  useEffect(() => {
    Promise.all([bff.strategies.list(), bff.rankingFormulas.list()]).then(([s, f]) => {
      setStrategies(s); setFormulas(f); if (f[0]) setFormulaId(f[0].id);
    });
  }, []);

  const rows = useMemo<Row[]>(() => {
    return strategies
      .map((s) => {
        const components = [
          { metric: "sharpe", value: s.sharpe, weight: 0.4, contribution: s.sharpe * 0.4 },
          { metric: "pnl_30d", value: s.pnl30d, weight: 0.35, contribution: s.pnl30d * 0.35 * 10 },
          { metric: "drawdown", value: s.drawdown, weight: -0.25, contribution: s.drawdown * -0.25 * 10 },
        ];
        const score = components.reduce((a, c) => a + c.contribution, 0);
        return { rank: 0, id: s.id, name: s.name, score, pnl: s.pnl30d, sharpe: s.sharpe, drawdown: s.drawdown, components };
      })
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [strategies]);

  return (
    <>
      <PageHeader title={t("nav.ranking")} subtitle={t("rankingDashboard.subtitle")} actions={
        <select className="h-9 px-3 rounded-md border border-border bg-background text-sm" value={formulaId} onChange={(e) => setFormulaId(e.target.value)}>
          {formulas.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      }/>
      <PageBody>
        <Card>
          <DataTable<Row> rows={rows} onRowClick={setActive} columns={[
            { key: "rank", header: "#", cell: (r) => <span className="text-mono text-sm font-semibold">{r.rank}</span> },
            { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
            { key: "score", header: t("rankingDashboard.score"), cell: (r) => <span className="text-mono text-sm">{r.score.toFixed(3)}</span> },
            { key: "sharpe", header: t("table.sharpe"), cell: (r) => <span className="text-mono text-xs">{r.sharpe.toFixed(2)}</span> },
            { key: "pnl", header: "PnL 30d", cell: (r) => <span className={`text-mono text-xs ${r.pnl >= 0 ? "text-status-success" : "text-status-failed"}`}>{(r.pnl * 100).toFixed(2)}%</span> },
            { key: "dd", header: t("table.drawdown"), cell: (r) => <span className="text-mono text-xs text-status-failed">{(r.drawdown * 100).toFixed(2)}%</span> },
          ]} />
        </Card>
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
                    <thead><tr className="text-xs text-muted-foreground"><th className="text-left py-1">Metric</th><th className="text-right">Value</th><th className="text-right">Weight</th><th className="text-right">Contribution</th></tr></thead>
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
                        <td colSpan={3} className="py-1.5 text-right text-xs text-muted-foreground">Total</td>
                        <td className="text-right text-mono text-sm font-bold">{active.score.toFixed(3)}</td>
                      </tr>
                    </tbody>
                  </table>
                </Card>
                <Button size="sm" onClick={() => nav(`/management/strategies/${active.id}`)}>{t("rankingDashboard.openStrategy")}</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
