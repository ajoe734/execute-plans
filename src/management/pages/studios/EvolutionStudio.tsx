// Phase 12.2 — Evolution Studio. Composes mutation rules, run monitor,
// candidate browser and promotion panel into one workspace.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { legacyBff as bff } from "@/lib/bff-v1";
import type { EvolutionProgram, MutationRule } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { Badge } from "@/components/ui/badge";
import { EvolutionRunsPanel } from "@/management/components/detail/EvolutionRunsPanel";
import { FitnessFormulaPanel } from "@/management/components/detail/FitnessFormulaPanel";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { toast } from "sonner";
import { Field, Section } from "@/management/pages/ObjectDetailLayout";

const MutationRuleManager = () => {
  const t = useT();
  const [rules, setRules] = useState<MutationRule[]>([]);
  useEffect(() => { bff.mutationRules.list().then(setRules); }, []);
  const toggle = (id: string) => {
    setRules((rs) => rs.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r));
    toast.success(t("toast.actionQueued"));
  };
  return (
    <Card className="p-4 space-y-2">
      <div className="text-sm font-semibold">{t("evolution.mutation.title")}</div>
      {rules.map((r) => (
        <div key={r.id} className="p-3 rounded-md border border-border flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-medium">{r.name}</div>
            <div className="text-mono text-[10px] text-muted-foreground">{r.expression}</div>
            <div className="text-mono text-[10px] text-muted-foreground">scope: {r.scope} · rate {r.rateBps}bps</div>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase">{r.state}</Badge>
          <Switch checked={r.enabled} onCheckedChange={() => toggle(r.id)} />
        </div>
      ))}
      {rules.length === 0 && <div className="text-xs text-muted-foreground">{t("empty.none")}</div>}
    </Card>
  );
};

export const EvolutionStudio = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [programs, setPrograms] = useState<EvolutionProgram[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(params.get("id") ?? undefined);

  useEffect(() => {
    bff.evolution.list().then((rows) => {
      setPrograms(rows);
      if (!activeId && rows[0]) setActiveId(rows[0].id);
    });
  }, []);

  const active = useMemo(() => programs.find((p) => p.id === activeId), [programs, activeId]);

  return (
    <>
      <PageHeader title={t("studios.evolution")} subtitle={t("studios.evolutionSubtitle")} />
      <PageBody>
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <Select value={activeId} onValueChange={(v) => { setActiveId(v); setParams({ id: v }); }}>
            <SelectTrigger className="w-72"><SelectValue placeholder={t("studios.pickEntity")} /></SelectTrigger>
            <SelectContent>
              {programs.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {active && <span className="text-mono text-xs text-muted-foreground">G{active.generation} · pop {active.population}</span>}
        </Card>

        {active && (
          <Tabs defaultValue="mutation">
            <TabsList>
              <TabsTrigger value="mutation">{t("evolution.tabs.mutation")}</TabsTrigger>
              <TabsTrigger value="fitness">{t("evolution.tabs.fitness")}</TabsTrigger>
              <TabsTrigger value="runs">{t("evolution.tabs.runs")}</TabsTrigger>
              <TabsTrigger value="candidates">{t("evolution.tabs.candidates")}</TabsTrigger>
              <TabsTrigger value="promotion">{t("evolution.tabs.promotion")}</TabsTrigger>
            </TabsList>
            <TabsContent value="mutation" className="mt-4"><MutationRuleManager /></TabsContent>
            <TabsContent value="fitness" className="mt-4"><FitnessFormulaPanel mode="fitness" /></TabsContent>
            <TabsContent value="runs" className="mt-4"><EvolutionRunsPanel programId={active.id} mode="runs" /></TabsContent>
            <TabsContent value="candidates" className="mt-4"><EvolutionRunsPanel programId={active.id} mode="candidates" /></TabsContent>
            <TabsContent value="promotion" className="mt-4">
              <Section title={t("evolution.promotion.title")}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label={t("evolution.promotion.candidate")} value={`${active.id}_best_g${active.generation}`} mono />
                  <Field label={t("evolution.promotion.fitnessLift")} value={`+${(active.bestFitness * 8).toFixed(1)}%`} mono />
                  <Field label={t("evolution.promotion.target")} value={active.parentAlpha} mono />
                </div>
                <div className="flex justify-end">
                  <PermissionAwareButton requiredAction="promote_best" size="sm" onClick={() => toast.success(t("evolution.promotion.queued"))}>
                    {t("evolution.promotion.promote")}
                  </PermissionAwareButton>
                </div>
              </Section>
            </TabsContent>
          </Tabs>
        )}
      </PageBody>
    </>
  );
};
