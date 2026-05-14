// Evolution Fitness + Mutation rules display (read-only Phase 10 stub).
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { bff } from "@/lib/bff-v1";
import type { FitnessFormula, MutationRule } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import {
  MockDataEmptyState,
} from "@/components/data/MockDataBadge";
import { getMockDataBadgeModel } from "@/components/data/mockDataBadgeModel";
import { useLiveStatusSnapshot } from "@/lib/bff/liveTransport";

export const FitnessFormulaPanel = ({ mode = "all" }: { mode?: "all" | "fitness" | "mutation" }) => {
  const t = useT();
  const liveStatus = useLiveStatusSnapshot();
  const fitnessGate = getMockDataBadgeModel("bff.fitnessFormulas.list", liveStatus);
  const mutationGate = getMockDataBadgeModel("bff.mutationRules.list", liveStatus);
  const [formulas, setFormulas] = useState<FitnessFormula[]>([]);
  const [rules, setRules] = useState<MutationRule[]>([]);
  useEffect(() => {
    bff.fitnessFormulas.list().then(setFormulas);
    bff.mutationRules.list().then(setRules);
  }, []);
  const showFitness = mode === "all" || mode === "fitness";
  const showMutation = mode === "all" || mode === "mutation";
  return (
    <div className={mode === "all" ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "space-y-4"}>
      {showFitness && (
      <Card className="p-4 space-y-3">
        <div className="text-sm font-semibold">{t("evolution.fitness.title")}</div>
        {formulas.map((f) => (
          <div key={f.id} className="p-3 rounded-md border border-border">
            <div className="flex justify-between"><div className="text-sm font-medium">{f.name}</div>
              <Badge variant="outline" className="text-[10px] uppercase">{f.state}</Badge></div>
            <div className="text-mono text-xs mt-1 break-all">{f.expression}</div>
            <div className="text-mono text-[10px] text-muted-foreground mt-1">
              metrics: {f.metrics.join(", ")} · applied {f.appliedTo}
            </div>
          </div>
        ))}
        {formulas.length === 0 && fitnessGate ? (
          <MockDataEmptyState helperName="bff.fitnessFormulas.list" className="border-0 p-4" />
        ) : formulas.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t("empty.none")}</div>
        ) : null}
      </Card>
      )}
      {showMutation && (
      <Card className="p-4 space-y-3">
        <div className="text-sm font-semibold">{t("evolution.mutation.title")}</div>
        {rules.map((r) => (
          <div key={r.id} className="p-3 rounded-md border border-border">
            <div className="flex justify-between items-center">
              <div className="text-sm font-medium">{r.name}</div>
              <Badge variant="outline" className={`text-[10px] uppercase ${r.enabled ? "border-status-success/40 text-status-success" : "text-muted-foreground"}`}>{r.enabled ? "on" : "off"}</Badge>
            </div>
            <div className="text-mono text-xs mt-1 break-all">{r.expression}</div>
            <div className="text-mono text-[10px] text-muted-foreground mt-1">
              scope: {r.scope} · rate {r.rateBps}bps
            </div>
          </div>
        ))}
        {rules.length === 0 && mutationGate ? (
          <MockDataEmptyState helperName="bff.mutationRules.list" className="border-0 p-4" />
        ) : rules.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t("empty.none")}</div>
        ) : null}
      </Card>
      )}
    </div>
  );
};
