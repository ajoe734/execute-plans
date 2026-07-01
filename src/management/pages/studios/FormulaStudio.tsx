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
                <NonProductionActionButton size="sm">{t("studios.runBacktest")}</NonProductionActionButton>
              </div>
              {runnerUnavailable}
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
