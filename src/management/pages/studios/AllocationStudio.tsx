// Phase 12.3 — Allocation Studio (slider rebalancer driven by mock simulator).
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bff } from "@/lib/bff-v1";
import type { Rebalance } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { AllocationSimulationPanel } from "@/management/components/detail/AllocationSimulationPanel";

export const AllocationStudio = () => {
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
      <PageHeader title={t("studios.allocation")} subtitle={t("studios.allocationSubtitle")} />
      <PageBody>
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <Select value={activeId} onValueChange={(v) => { setActiveId(v); setParams({ id: v }); }}>
            <SelectTrigger className="w-72"><SelectValue placeholder={t("studios.pickEntity")} /></SelectTrigger>
            <SelectContent>
              {list.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name} · {r.quarter}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>
        {active && <AllocationSimulationPanel rebalance={active} />}
      </PageBody>
    </>
  );
};
