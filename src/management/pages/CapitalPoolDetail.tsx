import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import type { CapitalPool, Strategy } from "@/lib/bff/types";
import { Edit, ShieldAlert } from "lucide-react";
import { ObjectDetailLayout, Section, Field, Placeholder } from "./ObjectDetailLayout";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { StatCard } from "@/platform/components/StatCard";
import { Progress } from "@/components/ui/progress";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { toast } from "sonner";

export const CapitalPoolDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [c, setC] = useState<CapitalPool | undefined>();
  const [strats, setStrats] = useState<Strategy[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    bff.capitalPools.get(id).then(setC);
    bff.strategies.list().then((all) => setStrats(all.filter((s) => s.capitalPoolId === id)));
  }, [id]);

  if (!c) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  const utilizationPct = (c.utilized / c.allocated) * 100;

  return (
    <>
      <ObjectDetailLayout
        object={c}
        subtitle={`${c.currency} · ${c.id}`}
        actions={
          <>
            <Button size="sm" variant="outline"><Edit className="h-4 w-4 mr-1" />{t("actions.edit")}</Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)}>
              <ShieldAlert className="h-4 w-4 mr-1" />Adjust Risk Budget
            </Button>
          </>
        }
        tabs={[
          {
            value: "overview", label: "Overview",
            content: (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <StatCard label="Allocated" value={`${c.currency} ${c.allocated.toLocaleString()}`} />
                  <StatCard label="Utilized" value={`${c.currency} ${c.utilized.toLocaleString()}`} hint={`${utilizationPct.toFixed(1)}%`} />
                  <StatCard label="Risk Budget" value={`${(c.riskBudget * 100).toFixed(2)}%`} tone="warning" />
                </div>
                <Section title="Utilization">
                  <Progress value={utilizationPct} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground text-mono">
                    <span>0</span>
                    <span>{c.allocated.toLocaleString()}</span>
                  </div>
                </Section>
              </>
            ),
          },
          {
            value: "strategies", label: "Strategies",
            content: (
              <DataTable
                rows={strats}
                onRowClick={(r) => navigate(`/management/strategies/${r.id}`)}
                columns={[
                  { key: "name", header: "Strategy", cell: (r) => <div className="font-medium">{r.name}</div> },
                  { key: "state", header: "State", cell: (r) => <StatusBadge state={r.state} /> },
                  { key: "risk", header: "Risk", cell: (r) => <RiskBadge level={r.risk} /> },
                  { key: "pnl", header: "PnL 30d", cell: (r) => <span className={`text-mono text-xs ${r.pnl30d >= 0 ? "text-status-success" : "text-status-failed"}`}>{(r.pnl30d * 100).toFixed(2)}%</span> },
                ]}
                empty="No strategies in this pool"
              />
            ),
          },
          {
            value: "risk", label: "Risk",
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="VaR (mock)" value={`${c.currency} ${(c.allocated * c.riskBudget).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} mono />
                  <Field label="Risk Budget" value={`${(c.riskBudget * 100).toFixed(2)}%`} mono />
                  <Field label="Headroom" value={`${(100 - utilizationPct).toFixed(1)}%`} mono />
                  <Field label="Currency" value={c.currency} mono />
                </div>
              </Section>
            ),
          },
          { value: "rebalance", label: "Rebalance History", content: <Placeholder text="Rebalance history will appear here." /> },
          { value: "audit", label: "Audit", content: <Placeholder text="Capital pool audit trail." /> },
        ]}
      />

      <HighRiskConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Adjust Risk Budget — ${c.name}`}
        description="Changing the risk budget will affect every strategy assigned to this pool."
        confirmToken="ADJUST"
        destructive
        onConfirm={async (memo) => { await bff.mutations.runAction({ kind: "CapitalPool", id: pool.id, action: "adjust_budget", memo }); toast.success("Risk budget change submitted for approval"); }}
      />
    </>
  );
};
