// Rebalance Simulation slider — adjusts target weights and recomputes mock metrics.
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { StatCard } from "@/platform/components/StatCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { bff } from "@/lib/bff-v1";
import type { Rebalance } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";

export const AllocationSimulationPanel = ({ rebalance }: { rebalance: Rebalance }) => {
  const t = useT();
  const lines = rebalance.lines ?? [];
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.strategyId, l.proposedWeight * 100]))
  );

  useEffect(() => {
    bff.allocationSimulations.forRebalance(rebalance.id).then(() => { /* warm cache */ });
  }, [rebalance.id]);

  const total = useMemo(() => Object.values(weights).reduce((a, b) => a + b, 0), [weights]);
  const turnover = useMemo(() => {
    let t = 0;
    for (const l of lines) t += Math.abs((weights[l.strategyId] / 100) - l.currentWeight);
    return t;
  }, [weights, lines]);

  // Mock recomputation: small linear shift around expected metrics.
  const sharpe = (rebalance.expectedSharpe ?? 1.5) - turnover * 0.1;
  const dd = (rebalance.expectedDrawdown ?? -0.05) - turnover * 0.02;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={t("rebalance.sim.sharpe")} value={sharpe.toFixed(2)} tone={sharpe > 1.5 ? "success" : "warning"} />
        <StatCard label={t("rebalance.sim.drawdown")} value={`${(dd * 100).toFixed(1)}%`} tone="danger" />
        <StatCard label={t("rebalance.sim.turnover")} value={`${(turnover * 100).toFixed(1)}%`} />
        <StatCard label={t("rebalance.sim.totalWeight")} value={`${total.toFixed(1)}%`} tone={Math.abs(total - 100) < 0.5 ? "success" : "danger"} />
      </div>
      <Card className="p-4 space-y-3">
        <div className="text-sm font-semibold">{t("rebalance.sim.weights")}</div>
        {lines.map((l) => (
          <div key={l.strategyId} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-medium">{l.strategyName}</span>
              <span className="text-mono">{weights[l.strategyId].toFixed(1)}% <span className="text-muted-foreground">/ baseline {(l.currentWeight * 100).toFixed(1)}%</span></span>
            </div>
            <Slider value={[weights[l.strategyId]]} min={0} max={50} step={0.5}
              onValueChange={(v) => setWeights((w) => ({ ...w, [l.strategyId]: v[0] }))} />
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={() => setWeights(Object.fromEntries(lines.map((l) => [l.strategyId, l.proposedWeight * 100])))}>{t("actions.reset")}</Button>
          <Button size="sm" onClick={() => toast.success(t("rebalance.sim.queued"))}>{t("rebalance.sim.run")}</Button>
        </div>
      </Card>
    </div>
  );
};
