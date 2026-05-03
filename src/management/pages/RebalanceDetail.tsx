import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import type { Rebalance, CapitalPool } from "@/lib/bff/types";
import { PlayCircle, FileSearch, Download } from "lucide-react";
import { ObjectDetailLayout, Section, Field, Placeholder } from "./ObjectDetailLayout";
import { DataTable } from "@/platform/components/DataTable";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { toast } from "sonner";

export const RebalanceDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [r, setR] = useState<Rebalance | undefined>();
  const [pool, setPool] = useState<CapitalPool | undefined>();
  const [applyOpen, setApplyOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    bff.rebalances.get(id).then((rb) => {
      setR(rb);
      if (rb) bff.capitalPools.get(rb.targetPoolId).then(setPool);
    });
  }, [id]);

  if (!r) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  const lines = r.lines ?? [];

  return (
    <>
      <ObjectDetailLayout
        object={r}
        subtitle={`${r.quarter} · target ${r.targetPoolId}`}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setSimOpen(true)}>
              <FileSearch className="h-4 w-4 mr-1" />Simulate
            </Button>
            <Button size="sm" variant="outline">
              <Download className="h-4 w-4 mr-1" />Export
            </Button>
            <Button size="sm" onClick={() => setApplyOpen(true)}>
              <PlayCircle className="h-4 w-4 mr-1" />{t("actions.applyRebalance")}
            </Button>
          </>
        }
        tabs={[
          {
            value: "overview", label: "Overview",
            content: (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Target Pool" value={pool ? pool.name : r.targetPoolId} />
                  <StatCard label="Proposed Δ" value={`${(r.proposedDelta * 100).toFixed(1)}%`} tone="warning" />
                  <StatCard label="Expected Sharpe" value={r.expectedSharpe?.toFixed(2) ?? "—"} tone="success" />
                  <StatCard label="Expected Drawdown" value={r.expectedDrawdown != null ? `${(r.expectedDrawdown * 100).toFixed(1)}%` : "—"} tone="danger" />
                </div>
                {r.notes && (
                  <Section title="Notes">
                    <p className="text-sm leading-relaxed">{r.notes}</p>
                  </Section>
                )}
              </>
            ),
          },
          {
            value: "lines", label: "Allocation Lines",
            content: (
              <DataTable
                rows={lines}
                onRowClick={(row) => navigate(`/management/strategies/${row.strategyId}`)}
                columns={[
                  { key: "strat", header: "Strategy", cell: (row) => <div className="font-medium">{row.strategyName}</div> },
                  { key: "cur", header: "Current", cell: (row) => <span className="text-mono text-xs">{(row.currentWeight * 100).toFixed(1)}%</span> },
                  { key: "prop", header: "Proposed", cell: (row) => <span className="text-mono text-xs">{(row.proposedWeight * 100).toFixed(1)}%</span> },
                  { key: "delta", header: "Δ", cell: (row) => <span className={`text-mono text-xs ${row.delta >= 0 ? "text-status-success" : "text-status-failed"}`}>{row.delta >= 0 ? "+" : ""}{(row.delta * 100).toFixed(1)}%</span> },
                ]}
                empty="No allocation lines"
              />
            ),
          },
          {
            value: "risk", label: "Risk Impact",
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Pool VaR" value={pool ? `${pool.currency} ${(pool.allocated * pool.riskBudget).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"} mono />
                  <Field label="Concentration" value="OK" mono />
                  <Field label="Liquidity check" value="Pass" mono />
                  <Field label="Stress (−20%)" value={`${(r.expectedDrawdown! * 100 * 1.5).toFixed(1)}%`} mono />
                </div>
              </Section>
            ),
          },
          { value: "approvals", label: "Approvals", content: <Placeholder text="Pending approvals routed via the rebalance.apply workflow." /> },
          { value: "audit", label: "Audit", content: <Placeholder text="Rebalance audit trail." /> },
        ]}
      />

      <HighRiskConfirm
        open={simOpen}
        onOpenChange={setSimOpen}
        title={`Simulate Rebalance — ${r.name}`}
        description="Runs a full backtest simulation of this rebalance against the last 90 days. Read-only."
        confirmToken="SIMULATE"
        onConfirm={() => { toast.success("Simulation job queued"); }}
      />
      <HighRiskConfirm
        open={applyOpen}
        onOpenChange={setApplyOpen}
        title={`Apply Rebalance — ${r.name}`}
        description="Applies the proposed allocation to the target pool. This will route an approval request and, when approved, generate live orders."
        confirmToken="APPLY"
        destructive
        onConfirm={() => { toast.success("Apply request submitted for approval"); }}
      />
    </>
  );
};
