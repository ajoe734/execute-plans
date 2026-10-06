import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Rebalance } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";

export const ConstraintChecker = ({ rebalance }: { rebalance: Rebalance }) => {
  const t = useT();
  const weights = (rebalance.lines ?? []).map((line) => line.proposedWeight);
  const complete = weights.length > 0 && weights.every((value) => typeof value === "number" && Number.isFinite(value));
  const percent = (value: number | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
  const values = [
    { label: t("rebalance.constraints.maxWeight"), value: percent(complete ? Math.max(...weights) : undefined) },
    { label: t("rebalance.constraints.totalWeight"), value: percent(complete ? weights.reduce((sum, value) => sum + value, 0) : undefined) },
    { label: t("rebalance.constraints.expectedDD"), value: percent(rebalance.expectedDrawdown) },
  ];
  return (
    <Card className="p-4 space-y-2">
      <h4 className="text-sm font-semibold">{t("phase21.ownerFacts.preview")}</h4>
      <p className="text-xs text-muted-foreground">{t("phase21.ownerFacts.constraintsHint")}</p>
      {values.map(({ label, value }) => (
        <div key={label} className="flex items-center justify-between p-2 rounded-md border border-border">
          <span className="text-sm">{label}</span>
          <Badge variant="outline" className="text-mono text-xs">{value}</Badge>
        </div>
      ))}
    </Card>
  );
};
