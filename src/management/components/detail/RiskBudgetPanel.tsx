import { Card } from "@/components/ui/card";
import type { CapitalPool } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";

export const RiskBudgetPanel = ({ pool }: { pool: CapitalPool }) => {
  const t = useT();
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{t("phase21.ownerFacts.reportedRiskBudget")}</h4>
        <span className="text-mono text-xs">{pool.reportedFields?.riskBudget !== false && Number.isFinite(pool.riskBudget) ? `${(pool.riskBudget * 100).toFixed(2)}%` : "—"}</span>
      </div>
      <h4 className="text-sm font-semibold">{t("capitalPool.risk.breakdown")}</h4>
      <p className="text-xs text-muted-foreground">{t("phase21.ownerFacts.riskBreakdownUnavailable")}</p>
      <NonProductionActionButton size="sm">{t("actions.proposeChange")}</NonProductionActionButton>
    </Card>
  );
};
