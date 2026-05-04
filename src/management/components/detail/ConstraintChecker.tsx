// Rebalance Constraints checker (mock pass/fail list).
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Rebalance } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { CheckCircle2, AlertTriangle } from "lucide-react";

export const ConstraintChecker = ({ rebalance }: { rebalance: Rebalance }) => {
  const t = useT();
  const lines = rebalance.lines ?? [];
  const maxWeight = Math.max(...lines.map((l) => l.proposedWeight), 0);
  const checks = [
    { id: "c1", label: t("rebalance.constraints.maxWeight"), pass: maxWeight <= 0.35, value: `${(maxWeight * 100).toFixed(1)}%`, threshold: "≤35%" },
    { id: "c2", label: t("rebalance.constraints.totalWeight"), pass: true, value: "100%", threshold: "=100%" },
    { id: "c3", label: t("rebalance.constraints.expectedDD"), pass: (rebalance.expectedDrawdown ?? -1) > -0.08, value: `${((rebalance.expectedDrawdown ?? 0) * 100).toFixed(1)}%`, threshold: "≥−8%" },
    { id: "c4", label: t("rebalance.constraints.turnover"), pass: Math.abs(rebalance.proposedDelta) < 0.20, value: `${(Math.abs(rebalance.proposedDelta) * 100).toFixed(1)}%`, threshold: "<20%" },
  ];
  return (
    <Card className="p-4 space-y-2">
      {checks.map((c) => (
        <div key={c.id} className="flex items-center gap-3 p-2 rounded-md border border-border">
          {c.pass
            ? <CheckCircle2 className="h-4 w-4 text-status-success" />
            : <AlertTriangle className="h-4 w-4 text-status-warning" />}
          <div className="flex-1">
            <div className="text-sm">{c.label}</div>
            <div className="text-mono text-[10px] text-muted-foreground">{t("table.threshold")}: {c.threshold}</div>
          </div>
          <Badge variant="outline" className={`text-mono text-xs ${c.pass ? "border-status-success/40 text-status-success" : "border-status-warning/40 text-status-warning"}`}>{c.value}</Badge>
        </div>
      ))}
    </Card>
  );
};
