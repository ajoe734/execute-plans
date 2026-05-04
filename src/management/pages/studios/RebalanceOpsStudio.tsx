// Phase 12.3 — Rebalance Ops Studio: metric freeze + constraint check + override manager.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bff } from "@/lib/bff/client";
import type { Rebalance } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { ConstraintChecker } from "@/management/components/detail/ConstraintChecker";
import { DataTable } from "@/platform/components/DataTable";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { Snowflake, Flame } from "lucide-react";
import { toast } from "sonner";

const MetricFreezePanel = ({ rebalanceId }: { rebalanceId: string }) => {
  const t = useT();
  const [frozen, setFrozen] = useState(false);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{t("studios.freeze.title")}</div>
          <div className="text-xs text-muted-foreground">{t("studios.freeze.hint")}</div>
        </div>
        <Badge variant="outline" className={`text-[10px] uppercase ${frozen ? "border-accent/40 text-accent" : "border-status-warning/40 text-status-warning"}`}>
          {frozen ? t("studios.freeze.frozen") : t("studios.freeze.liquid")}
        </Badge>
      </div>
      <div className="flex justify-end gap-2">
        {frozen
          ? <Button size="sm" variant="outline" onClick={() => { setFrozen(false); toast.success(t("studios.freeze.queued")); }}><Flame className="h-4 w-4 mr-1" />{t("studios.freeze.unfreeze")}</Button>
          : <Button size="sm" onClick={() => { setFrozen(true); toast.success(t("studios.freeze.queued")); }}><Snowflake className="h-4 w-4 mr-1" />{t("studios.freeze.freeze")}</Button>}
      </div>
      <div className="text-mono text-[10px] text-muted-foreground">target: {rebalanceId}</div>
    </Card>
  );
};

const OverrideManager = ({ r }: { r: Rebalance }) => {
  const t = useT();
  const nav = useNavigate();
  const lines = r.lines ?? [];
  const overrides = lines
    .filter((l) => Math.abs(l.delta) >= 0.03)
    .map((l) => ({
      id: `${r.id}_${l.strategyId}`,
      strategyId: l.strategyId,
      strategyName: l.strategyName,
      delta: l.delta,
      reason: l.delta > 0 ? t("rebalance.overrides.increase") : t("rebalance.overrides.decrease"),
      state: Math.abs(l.delta) > 0.06 ? "review" : "approved",
    }));
  if (overrides.length === 0) {
    return <Card className="p-6 text-sm text-muted-foreground text-center">{t("studios.overrides.emptyHint")}</Card>;
  }
  return (
    <DataTable
      rows={overrides}
      onRowClick={(row) => nav(`/management/strategies/${row.strategyId}`)}
      columns={[
        { key: "strategy", header: t("nav.strategies"), cell: (row) => <div className="font-medium">{row.strategyName}</div> },
        { key: "delta", header: "Δ", cell: (row) => <span className={`text-mono text-xs ${row.delta >= 0 ? "text-status-success" : "text-status-failed"}`}>{row.delta >= 0 ? "+" : ""}{(row.delta * 100).toFixed(1)}%</span> },
        { key: "reason", header: t("section.rationale"), cell: (row) => <span className="text-sm">{row.reason}</span> },
        { key: "state", header: t("table.state"), cell: (row) => <Badge variant="outline" className="text-[10px] uppercase">{row.state}</Badge> },
        { key: "action", header: t("common.actions"), cell: () => <PermissionAwareButton requiredAction="approve_rebalance" size="sm" variant="outline">{t("actions.approve")}</PermissionAwareButton> },
      ]}
    />
  );
};

export const RebalanceOpsStudio = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState<Rebalance[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(params.get("id") ?? undefined);

  useEffect(() => {
    bff.rebalances.list().then((rows) => {
      setList(rows);
      if (!activeId && rows[0]) setActiveId(rows[0].id);
    });
  }, []);

  const active = useMemo(() => list.find((r) => r.id === activeId), [list, activeId]);

  return (
    <>
      <PageHeader title={t("studios.rebalanceOps")} subtitle={t("studios.rebalanceOpsSubtitle")} />
      <PageBody>
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <Select value={activeId} onValueChange={(v) => { setActiveId(v); setParams({ id: v }); }}>
            <SelectTrigger className="w-72"><SelectValue placeholder={t("studios.pickEntity")} /></SelectTrigger>
            <SelectContent>
              {list.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} · {r.quarter}</SelectItem>)}
            </SelectContent>
          </Select>
        </Card>
        {active && (
          <Tabs defaultValue="freeze">
            <TabsList>
              <TabsTrigger value="freeze">{t("studios.freeze.title")}</TabsTrigger>
              <TabsTrigger value="constraints">{t("rebalance.tabs.constraints")}</TabsTrigger>
              <TabsTrigger value="overrides">{t("studios.overrides.title")}</TabsTrigger>
            </TabsList>
            <TabsContent value="freeze" className="mt-4"><MetricFreezePanel rebalanceId={active.id} /></TabsContent>
            <TabsContent value="constraints" className="mt-4"><ConstraintChecker rebalance={active} /></TabsContent>
            <TabsContent value="overrides" className="mt-4"><OverrideManager r={active} /></TabsContent>
          </Tabs>
        )}
      </PageBody>
    </>
  );
};
