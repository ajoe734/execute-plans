// CapitalPool Risk Budget editor preview (slider + breakdown).
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import type { CapitalPool } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";

export const RiskBudgetPanel = ({ pool }: { pool: CapitalPool }) => {
  const t = useT();
  const [budget, setBudget] = useState(pool.riskBudget * 100);
  const allocations = [
    { name: "VaR 95%", v: budget * 0.55 },
    { name: "Stress reserve", v: budget * 0.25 },
    { name: "Liquidity buffer", v: budget * 0.20 },
  ];
  const dirty = Math.abs(budget - pool.riskBudget * 100) > 0.01;
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">{t("capitalPool.risk.editor")}</div>
          <div className="text-mono text-xs">{budget.toFixed(2)}%</div>
        </div>
        <Slider value={[budget]} min={0.5} max={15} step={0.1} onValueChange={(v) => setBudget(v[0])} />
        <div className="flex justify-between text-[10px] text-mono text-muted-foreground">
          <span>0.5%</span><span>baseline {(pool.riskBudget * 100).toFixed(2)}%</span><span>15%</span>
        </div>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="text-sm font-semibold">{t("capitalPool.risk.breakdown")}</div>
        {allocations.map((a) => (
          <div key={a.name} className="space-y-1">
            <div className="flex justify-between text-xs"><span>{a.name}</span><span className="text-mono">{a.v.toFixed(2)}%</span></div>
            <Progress value={(a.v / budget) * 100} className="h-1.5" />
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={() => setBudget(pool.riskBudget * 100)} disabled={!dirty}>{t("actions.reset")}</Button>
          <Button size="sm" disabled={!dirty} onClick={() => toast.success(t("capitalPool.risk.queued"))}>{t("actions.proposeChange")}</Button>
        </div>
      </Card>
    </div>
  );
};
