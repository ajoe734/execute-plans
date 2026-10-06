import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/platform/hooks";

/** Approval identity is not a policy-validation result. No owner result is
 * currently supplied by this route, so never synthesize one in the browser. */
export const PolicyValidatorPanel = ({ approvalId }: { approvalId: string }) => {
  const t = useT();
  return (
    <Card className="p-4 space-y-2" data-approval-id={approvalId}>
      <h4 className="text-sm font-semibold">{t("phase21.governance.validatorTitle")}</h4>
      <Badge variant="outline">{t("phase21.ownerFacts.unverified")}</Badge>
      <p className="text-xs text-muted-foreground">{t("phase21.governance.validatorHint")}</p>
    </Card>
  );
};
