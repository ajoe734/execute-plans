// Phase 12.3 — Capital Studio: risk budget + bindings + allocation limits + freeze.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { legacyBff as bff } from "@/lib/bff-v1";
import type { CapitalPool, Strategy } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { RiskBudgetPanel } from "@/management/components/detail/RiskBudgetPanel";
import { BindingsMatrix } from "@/management/components/detail/BindingsMatrix";
import { Snowflake, Flame } from "lucide-react";
import { toast } from "sonner";

const AllocationLimitManager = ({ pool }: { pool: CapitalPool }) => {
  const t = useT();
  const [perCap, setPerCap] = useState(25);
  const [aggCap, setAggCap] = useState(80);
  const [lev, setLev] = useState(2);
  return (
    <Card className="p-4 space-y-4">
      <div className="text-sm font-semibold">{t("studios.limits.title")}</div>
      {[
        { id: "per", label: t("studios.limits.per"), v: perCap, set: setPerCap, max: 50, unit: "%" },
        { id: "agg", label: t("studios.limits.aggregate"), v: aggCap, set: setAggCap, max: 100, unit: "%" },
        { id: "lev", label: t("studios.limits.maxLeverage"), v: lev, set: setLev, max: 5, unit: "x" },
      ].map((row) => (
        <div key={row.id} className="space-y-1">
          <div className="flex justify-between text-xs"><span>{row.label}</span><span className="text-mono">{row.v}{row.unit}</span></div>
          <Slider value={[row.v]} min={0} max={row.max} step={row.id === "lev" ? 0.1 : 1} onValueChange={(v) => row.set(v[0])} />
        </div>
      ))}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => toast.success(t("studios.limits.queued"))}>{t("actions.proposeChange")}</Button>
      </div>
      <div className="text-mono text-[10px] text-muted-foreground">target: {pool.id}</div>
    </Card>
  );
};

const FreezeUnfreezePanel = ({ pool }: { pool: CapitalPool }) => {
  const t = useT();
  const [frozen, setFrozen] = useState(false);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{t("studios.freezePool.title")}</div>
          <div className="text-xs text-muted-foreground">{t("studios.freezePool.hint")}</div>
        </div>
        <Badge variant="outline" className={`text-[10px] uppercase ${frozen ? "border-accent/40 text-accent" : "border-status-success/40 text-status-success"}`}>
          {frozen ? t("studios.freeze.frozen") : t("studios.freeze.liquid")}
        </Badge>
      </div>
      <div className="flex justify-end gap-2">
        {frozen
          ? <Button size="sm" variant="outline" onClick={() => { setFrozen(false); toast.success(t("studios.freezePool.queued")); }}><Flame className="h-4 w-4 mr-1" />{t("studios.freeze.unfreeze")}</Button>
          : <Button size="sm" variant="destructive" onClick={() => { setFrozen(true); toast.success(t("studios.freezePool.queued")); }}><Snowflake className="h-4 w-4 mr-1" />{t("studios.freeze.freeze")}</Button>}
      </div>
      <div className="text-mono text-[10px] text-muted-foreground">{pool.name} · {pool.id}</div>
    </Card>
  );
};

export const CapitalStudio = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [pools, setPools] = useState<CapitalPool[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(params.get("id") ?? undefined);

  useEffect(() => {
    bff.capitalPools.list().then((rows) => {
      setPools(rows);
      if (!activeId && rows[0]) setActiveId(rows[0].id);
    });
    bff.strategies.list().then(setStrategies);
  }, []);

  const active = useMemo(() => pools.find((p) => p.id === activeId), [pools, activeId]);
  const bound = useMemo(() => active ? strategies.filter((s) => s.capitalPoolId === active.id) : [], [active, strategies]);

  return (
    <>
      <PageHeader title={t("studios.capital")} subtitle={t("studios.capitalSubtitle")} />
      <PageBody>
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <Select value={activeId} onValueChange={(v) => { setActiveId(v); setParams({ id: v }); }}>
            <SelectTrigger className="w-72"><SelectValue placeholder={t("studios.pickEntity")} /></SelectTrigger>
            <SelectContent>
              {pools.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.currency}</SelectItem>)}
            </SelectContent>
          </Select>
        </Card>
        {active && (
          <Tabs defaultValue="risk">
            <TabsList>
              <TabsTrigger value="risk">{t("capitalPool.risk.editor")}</TabsTrigger>
              <TabsTrigger value="bindings">{t("capitalPool.bindings.title")}</TabsTrigger>
              <TabsTrigger value="limits">{t("studios.limits.title")}</TabsTrigger>
              <TabsTrigger value="freeze">{t("studios.freezePool.title")}</TabsTrigger>
            </TabsList>
            <TabsContent value="risk" className="mt-4"><RiskBudgetPanel pool={active} /></TabsContent>
            <TabsContent value="bindings" className="mt-4"><BindingsMatrix strategies={bound} poolId={active.id} /></TabsContent>
            <TabsContent value="limits" className="mt-4"><AllocationLimitManager pool={active} /></TabsContent>
            <TabsContent value="freeze" className="mt-4"><FreezeUnfreezePanel pool={active} /></TabsContent>
          </Tabs>
        )}
      </PageBody>
    </>
  );
};
