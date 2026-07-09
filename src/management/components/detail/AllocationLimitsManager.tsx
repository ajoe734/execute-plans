import { useEffect, useState } from "react";
import { safeDateTime } from "@/lib/utils";
import { bff } from "@/lib/bff-v1";
import { mutations } from "@/lib/bff/mutations";
import type { AllocationLimit } from "@/lib/bff/types";
import { DataTable } from "@/platform/components/DataTable";
import { Section } from "@/management/pages/ObjectDetailLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";

export const AllocationLimitsManager = ({ poolId }: { poolId: string }) => {
  const t = useT();
  const [rows, setRows] = useState<AllocationLimit[]>([]);
  const [scope, setScope] = useState<"strategy" | "sector">("strategy");
  const [scopeRef, setScopeRef] = useState("");
  const [cap, setCap] = useState("0.30");
  useEffect(() => { bff.allocationLimits.forPool(poolId).then(setRows); }, [poolId]);

  const submit = async () => {
    const c = Number(cap);
    if (!scopeRef || Number.isNaN(c) || c <= 0 || c > 1) { toast.error(t("phase13.capital.limits.cap")); return; }
    const lim: AllocationLimit = {
      id: `lim_new_${Date.now().toString(36)}`,
      poolId, scope, scopeRef, cap: c,
      updatedBy: "capital", updatedAt: new Date().toISOString(),
    };
    await mutations.setAllocationLimit(poolId, scope, scopeRef, c);
    setRows((r) => [lim, ...r]);
    setScopeRef("");
    toast.success(t("phase13.capital.limits.queued"));
  };

  return (
    <div className="space-y-4">
      <Section title={t("phase13.capital.limits.add")}>
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <div className="text-xs uppercase text-muted-foreground mb-1">{t("phase13.capital.limits.scope")}</div>
            <Select value={scope} onValueChange={(v) => setScope(v as "strategy" | "sector")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="strategy">strategy</SelectItem>
                <SelectItem value="sector">sector</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-5">
            <div className="text-xs uppercase text-muted-foreground mb-1">{t("phase13.capital.limits.scopeRef")}</div>
            <Input value={scopeRef} onChange={(e) => setScopeRef(e.target.value)} placeholder="stg_001 / tech" className="text-mono" />
          </div>
          <div className="md:col-span-2">
            <div className="text-xs uppercase text-muted-foreground mb-1">{t("phase13.capital.limits.cap")}</div>
            <Input value={cap} onChange={(e) => setCap(e.target.value)} className="text-mono" />
          </div>
          <div className="md:col-span-2 flex items-end">
            <PermissionAwareButton requiredAction="set_limit" size="sm" className="w-full" onClick={submit}>{t("actions.save")}</PermissionAwareButton>
          </div>
        </div>
      </Section>
      <DataTable
        rows={rows}
        columns={[
          { key: "scope", header: t("phase13.capital.limits.scope"), cell: (r) => <Badge variant="outline" className="text-[10px] uppercase">{r.scope}</Badge> },
          { key: "ref", header: t("phase13.capital.limits.scopeRef"), cell: (r) => <span className="text-mono text-xs">{r.scopeRef}</span> },
          { key: "cap", header: t("phase13.capital.limits.cap"), cell: (r) => <span className="text-mono text-xs">{(r.cap * 100).toFixed(0)}%</span> },
          { key: "by", header: t("table.actor"), cell: (r) => <span className="text-mono text-xs">{r.updatedBy}</span> },
          { key: "ts", header: t("table.updated"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.updatedAt)}</span> },
        ]}
        empty={t("empty.none")}
      />
    </div>
  );
};
