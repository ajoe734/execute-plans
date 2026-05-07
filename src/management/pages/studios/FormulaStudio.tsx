// Phase 12.1 — Ranking Formula Studio.
// Dropdown to pick a formula, edit expression with metric library + validate,
// run mock backtest, and compare against another formula.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bff } from "@/lib/bff/client";
import type { RankingFormula } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { FormulaEditor } from "@/management/components/studios/FormulaEditor";
import { FormulaBacktestChart } from "@/management/components/studios/FormulaBacktestChart";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";

export const FormulaStudio = () => {
  const t = useT();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [formulas, setFormulas] = useState<RankingFormula[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(params.get("id") ?? undefined);
  const [expr, setExpr] = useState("");
  const [compareId, setCompareId] = useState<string | undefined>();
  const intent = params.get("intent");

  useEffect(() => {
    bff.rankingFormulas.list().then((rows) => {
      setFormulas(rows);
      if (!activeId && rows[0]) setActiveId(rows[0].id);
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
  }, [intent]);

  const active = useMemo(() => formulas.find((f) => f.id === activeId), [formulas, activeId]);
  const compare = useMemo(() => formulas.find((f) => f.id === compareId), [formulas, compareId]);

  useEffect(() => {
    if (active) setExpr(active.expression);
  }, [active]);

  const select = (id: string) => {
    setActiveId(id);
    setParams({ id });
  };

  return (
    <>
      <PageHeader
        title={t("studios.formula")}
        subtitle={t("studios.formulaSubtitle")}
        actions={
          active && (
            <Button size="sm" variant="outline" onClick={() => nav(`/management/ranking/formulas/${active.id}`)}>
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
            <TabsContent value="backtest" className="mt-4 space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => toast.success(t("studios.backtestQueued"))}>{t("studios.runBacktest")}</Button>
              </div>
              <FormulaBacktestChart expression={expr || active.expression} label={active.name} />
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
                <FormulaBacktestChart expression={expr || active.expression} label={`${t("studios.aSide")} · ${active.name}`} />
                {compare
                  ? <FormulaBacktestChart expression={compare.expression} label={`${t("studios.bSide")} · ${compare.name}`} />
                  : <Card className="p-6 text-sm text-muted-foreground text-center">{t("studios.pickFormula")}</Card>}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </PageBody>
    </>
  );
};
