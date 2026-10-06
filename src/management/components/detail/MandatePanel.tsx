import { Card } from "@/components/ui/card";
import type { CapitalPool } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";

export const MandatePanel = ({ pool }: { pool: CapitalPool }) => {
  const t = useT();
  const policyRef = pool.riskPolicyRef ?? pool.risk_policy_ref;
  return (
    <Card className="p-4 space-y-3">
      <h4 className="text-sm font-semibold">{t("capitalPool.mandate.charter")}</h4>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <dt>{t("entityCreate.field.currency")}</dt><dd>{pool.reportedFields?.currency === false ? "—" : pool.currency || "—"}</dd>
        <dt>{t("entityCreate.field.allocated")}</dt>
        <dd>{pool.reportedFields?.allocated !== false && Number.isFinite(pool.allocated) ? pool.allocated.toLocaleString() : "—"}</dd>
        <dt>{t("phase21.ownerFacts.policyRef")}</dt><dd className="break-all">{policyRef || "—"}</dd>
      </dl>
      <p className="text-xs text-muted-foreground">{t("phase21.ownerFacts.mandateUnavailable")}</p>
    </Card>
  );
};
