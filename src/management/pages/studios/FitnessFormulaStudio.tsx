// Phase 12.1 — Fitness Formula Studio (evolution fitness authoring + backtest).
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bff } from "@/lib/bff-v1";
import type { FitnessFormula } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { FormulaEditor } from "@/management/components/studios/FormulaEditor";
import { FormulaBacktestChart } from "@/management/components/studios/FormulaBacktestChart";
import { toast } from "sonner";

export const FitnessFormulaStudio = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [formulas, setFormulas] = useState<FitnessFormula[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(params.get("id") ?? undefined);
  const [expr, setExpr] = useState("");

  useEffect(() => {
    bff.fitnessFormulas.list().then((rows) => {
      setFormulas(rows);
      if (!activeId && rows[0]) setActiveId(rows[0].id);
    });
  }, []);

  const active = useMemo(() => formulas.find((f) => f.id === activeId), [formulas, activeId]);
  useEffect(() => { if (active) setExpr(active.expression); }, [active]);

  return (
    <>
      <PageHeader title={t("studios.fitness")} subtitle={t("studios.fitnessSubtitle")} />
      <PageBody>
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <Select value={activeId} onValueChange={(v) => { setActiveId(v); setParams({ id: v }); }}>
            <SelectTrigger className="w-72"><SelectValue placeholder={t("studios.pickEntity")} /></SelectTrigger>
            <SelectContent>
              {formulas.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {active && (
            <>
              <Badge variant="outline" className="text-[10px] uppercase">{active.state}</Badge>
              <span className="text-mono text-xs text-muted-foreground">applied {active.appliedTo}</span>
            </>
          )}
        </Card>

        {active && (
          <Tabs defaultValue="editor">
            <TabsList>
              <TabsTrigger value="editor">{t("section.overview")}</TabsTrigger>
              <TabsTrigger value="backtest">{t("studios.backtest")}</TabsTrigger>
            </TabsList>
            <TabsContent value="editor" className="mt-4">
              <FormulaEditor initialExpression={active.expression} onChange={(s) => setExpr(s.expression)} />
            </TabsContent>
            <TabsContent value="backtest" className="mt-4 space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => toast.success(t("studios.backtestQueued"))}>{t("studios.runBacktest")}</Button>
              </div>
              <FormulaBacktestChart expression={expr || active.expression} label={active.name} />
            </TabsContent>
          </Tabs>
        )}
      </PageBody>
    </>
  );
};
