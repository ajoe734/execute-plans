// Evolution Fitness + Mutation rules display (read-only Phase 10 stub).
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { bff } from "@/lib/bff/client";
import type { FitnessFormula, MutationRule } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";

export const FitnessFormulaPanel = () => {
  const t = useT();
  const [formulas, setFormulas] = useState<FitnessFormula[]>([]);
  const [rules, setRules] = useState<MutationRule[]>([]);
  useEffect(() => {
    bff.fitnessFormulas.list().then(setFormulas);
    bff.mutationRules.list().then(setRules);
  }, []);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
        {formulas.length === 0 && <div className="text-xs text-muted-foreground">{t("empty.none")}</div>}
      </Card>
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
        {rules.length === 0 && <div className="text-xs text-muted-foreground">{t("empty.none")}</div>}
      </Card>
    </div>
  );
};
