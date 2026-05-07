import { useEffect, useState } from "react";
import { bff } from "@/lib/bff-v1";
import type { RebalanceOverride, Strategy } from "@/lib/bff/types";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { Section } from "@/management/pages/ObjectDetailLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";

export const OverrideManager = ({ rebalanceId, strategies }: { rebalanceId: string; strategies: Strategy[] }) => {
  const t = useT();
  const [rows, setRows] = useState<RebalanceOverride[]>([]);
  const [stratId, setStratId] = useState<string>(strategies[0]?.id ?? "");
  const [delta, setDelta] = useState("0.02");
  const [reason, setReason] = useState("");
  useEffect(() => { bff.rebalanceOverrides.forRebalance(rebalanceId).then(setRows); }, [rebalanceId]);

  const submit = async () => {
    const parsed = Number(delta);
    if (!stratId || Number.isNaN(parsed) || reason.trim().length < 8) {
      toast.error(t("phase13.rebalance.override.reasonPh"));
      return;
    }
    const ov: RebalanceOverride = {
      id: `ro_new_${Date.now().toString(36)}`,
      rebalanceId, strategyId: stratId, delta: parsed,
      reason: reason.trim(), state: "review",
      proposedBy: "ops", proposedAt: new Date().toISOString(),
    };
    await bff.mutations.submitOverride(rebalanceId, stratId, parsed, reason.trim());
    setRows((r) => [ov, ...r]);
    setReason("");
    toast.success(t("phase13.rebalance.override.queued"));
  };

  return (
    <div className="space-y-4">
      <Section title={t("phase13.rebalance.override.add")}>
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-4">
            <div className="text-xs uppercase text-muted-foreground mb-1">{t("phase13.rebalance.override.strategy")}</div>
            <Select value={stratId} onValueChange={setStratId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {strategies.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs uppercase text-muted-foreground mb-1">{t("phase13.rebalance.override.delta")}</div>
            <Input value={delta} onChange={(e) => setDelta(e.target.value)} className="text-mono" />
          </div>
          <div className="md:col-span-6">
            <div className="text-xs uppercase text-muted-foreground mb-1">{t("section.rationale")}</div>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("phase13.rebalance.override.reasonPh")} rows={2} />
          </div>
        </div>
        <div className="flex justify-end">
          <PermissionAwareButton requiredAction="submit_for_review" size="sm" onClick={submit}>{t("actions.submitForReview")}</PermissionAwareButton>
        </div>
      </Section>
      <DataTable
        rows={rows}
        columns={[
          { key: "strat", header: t("phase13.rebalance.override.strategy"), cell: (r) => <span className="text-mono text-xs">{r.strategyId}</span> },
          { key: "delta", header: t("phase13.rebalance.override.delta"), cell: (r) => <span className={`text-mono text-xs ${r.delta >= 0 ? "text-status-success" : "text-status-failed"}`}>{r.delta >= 0 ? "+" : ""}{(r.delta * 100).toFixed(1)}%</span> },
          { key: "reason", header: t("section.rationale"), cell: (r) => <span className="text-xs text-muted-foreground">{r.reason}</span> },
          { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
          { key: "by", header: t("table.requester"), cell: (r) => <span className="text-mono text-xs">{r.proposedBy}</span> },
        ]}
        empty={t("empty.none")}
      />
    </div>
  );
};
