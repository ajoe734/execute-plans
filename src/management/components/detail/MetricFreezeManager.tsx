import { useEffect, useState } from "react";
import { bff } from "@/lib/bff-v1";
import type { MetricFreeze } from "@/lib/bff/types";
import { DataTable } from "@/platform/components/DataTable";
import { MetricFreezeBadge } from "./MetricFreezeBadge";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";

export const MetricFreezeManager = ({ rebalanceId }: { rebalanceId: string }) => {
  const t = useT();
  const [rows, setRows] = useState<MetricFreeze[]>([]);
  const [pending, setPending] = useState<MetricFreeze | null>(null);
  useEffect(() => { bff.metricFreezes.forRebalance(rebalanceId).then(setRows); }, [rebalanceId]);

  const toggle = (m: MetricFreeze) => setPending(m);

  return (
    <>
      <DataTable
        rows={rows}
        columns={[
          { key: "metric", header: t("phase13.rebalance.freeze.metric"), cell: (r) => <span className="text-mono text-sm">{r.metric}</span> },
          { key: "state", header: t("table.state"), cell: (r) => <MetricFreezeBadge frozen={r.frozen} /> },
          { key: "by", header: t("table.actor"), cell: (r) => <span className="text-mono text-xs">{r.frozenBy ?? "—"}</span> },
          { key: "ts", header: t("table.time"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{r.frozenAt ? new Date(r.frozenAt).toLocaleString() : "—"}</span> },
          {
            key: "act", header: t("phase13.rebalance.freeze.action"),
            cell: (r) => (
              <PermissionAwareButton requiredAction="approve_rebalance" size="sm" variant="outline" onClick={() => toggle(r)}>
                {r.frozen ? t("phase13.strategy.spec.unlock") : t("phase13.strategy.spec.lock")}
              </PermissionAwareButton>
            ),
          },
        ]}
      />
      {pending && (
        <HighRiskConfirm
          open={!!pending}
          onOpenChange={(o) => !o && setPending(null)}
          title={`${pending.frozen ? "Unfreeze" : "Freeze"} metric — ${pending.metric}`}
          description={`Toggle freeze on ${pending.metric}. Frozen metrics will not update during the rebalance window.`}
          confirmToken={pending.frozen ? "UNFREEZE" : "FREEZE"}
          onConfirm={async (memo) => {
            const r = await bff.mutations.freezeMetric(rebalanceId, pending.metric, !pending.frozen, memo);
            if (!r.ok) { toast.error(t("toast.illegalTransition")); return; }
            setRows((rs) => rs.map((x) => x.id === pending.id ? { ...x, frozen: !pending.frozen, frozenBy: "ops", frozenAt: new Date().toISOString() } : x));
            toast.success(t("toast.actionQueued"));
          }}
        />
      )}
    </>
  );
};
