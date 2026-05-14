import { useEffect, useState } from "react";
import { bff } from "@/lib/bff-v1";
import { mutations } from "@/lib/bff/mutations";
import type { PoolFreeze } from "@/lib/bff/types";
import { DataTable } from "@/platform/components/DataTable";
import { Section } from "@/management/pages/ObjectDetailLayout";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";

export const FreezeUnfreezePanel = ({ poolId }: { poolId: string }) => {
  const t = useT();
  const [rows, setRows] = useState<PoolFreeze[]>([]);
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unfreezeTarget, setUnfreezeTarget] = useState<PoolFreeze | null>(null);
  useEffect(() => { bff.poolFreezes.forPool(poolId).then(setRows); }, [poolId]);

  const active = rows.filter((r) => r.active);
  const history = rows.filter((r) => !r.active);

  return (
    <div className="space-y-4">
      <Section title={t("phase13.capital.freeze.active")}>
        {active.length === 0 ? (
          <div className="text-sm text-muted-foreground">—</div>
        ) : (
          active.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded border border-status-warning/40 bg-status-warning/10 px-3 py-2">
              <div>
                <div className="text-sm font-medium">{f.reason}</div>
                <div className="text-[11px] text-muted-foreground">{f.frozenBy} · {new Date(f.frozenAt).toLocaleString()}</div>
              </div>
              <PermissionAwareButton requiredAction="unfreeze_pool" size="sm" variant="outline" onClick={() => setUnfreezeTarget(f)}>
                {t("phase13.capital.freeze.unfreeze")}
              </PermissionAwareButton>
            </div>
          ))
        )}
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("phase13.capital.freeze.reason")} rows={2} />
        <div className="flex justify-end">
          <PermissionAwareButton requiredAction="freeze_pool" size="sm" onClick={() => { if (reason.trim().length < 8) { toast.error(t("phase13.capital.freeze.reason")); return; } setConfirmOpen(true); }}>
            {t("phase13.capital.freeze.freeze")}
          </PermissionAwareButton>
        </div>
      </Section>
      <Section title={t("phase13.capital.freeze.history")}>
        <DataTable
          rows={history}
          columns={[
            { key: "reason", header: t("phase13.capital.freeze.reason"), cell: (r) => <span className="text-sm">{r.reason}</span> },
            { key: "by", header: t("table.actor"), cell: (r) => <span className="text-mono text-xs">{r.frozenBy}</span> },
            { key: "ts", header: t("table.time"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.frozenAt).toLocaleString()}</span> },
            { key: "active", header: t("table.state"), cell: (r) => <Badge variant="outline" className="text-[10px]">{r.active ? "active" : "lifted"}</Badge> },
          ]}
          empty={t("empty.none")}
        />
      </Section>
      <HighRiskConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Freeze pool — ${poolId}`}
        description={`Freezing this pool halts new allocations. Reason: ${reason}`}
        confirmToken="FREEZE"
        destructive
        onConfirm={async () => {
          await mutations.freezePool(poolId, reason);
          setRows((r) => [{ id: `pf_new_${Date.now().toString(36)}`, poolId, reason, frozenBy: "capital", frozenAt: new Date().toISOString(), active: true }, ...r]);
          setReason("");
          toast.success(t("phase13.capital.freeze.queued"));
        }}
      />
      {unfreezeTarget && (
        <HighRiskConfirm
          open={!!unfreezeTarget}
          onOpenChange={(o) => !o && setUnfreezeTarget(null)}
          title={`Unfreeze — ${unfreezeTarget.reason}`}
          description={t("detail.confirm.unfreezePool")}
          confirmToken="UNFREEZE"
          onConfirm={async (memo) => {
            await mutations.unfreezePool(poolId, unfreezeTarget.id, memo);
            setRows((r) => r.map((x) => x.id === unfreezeTarget.id ? { ...x, active: false } : x));
            toast.success(t("phase13.capital.freeze.queued"));
          }}
        />
      )}
    </div>
  );
};
