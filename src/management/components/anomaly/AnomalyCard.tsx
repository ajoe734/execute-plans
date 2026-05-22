import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnomalyBadge } from "./AnomalyBadge";
import type { ManagementAnomaly } from "@/lib/v5/management/anomaly";

export const AnomalyCard = ({ anomaly }: { anomaly: ManagementAnomaly }) => {
  const { t } = useTranslation();
  const { links } = anomaly;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AnomalyBadge severity={anomaly.severity} />
          <Badge variant="outline">{anomaly.domain}</Badge>
          <span className="text-sm font-medium text-foreground">{anomaly.title}</span>
        </div>
        <time className="text-xs text-muted-foreground" dateTime={anomaly.detectedAt}>
          {new Date(anomaly.detectedAt).toLocaleString()}
        </time>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{t("mgmt.anomaly.whyLabel")}</span> {anomaly.why}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{t("mgmt.anomaly.actionLabel")}</span> {anomaly.recommendedAction}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={links.manageHref}>{t("mgmt.actions.manage")}</Link>
        </Button>
        {links.evidenceHref ? (
          <Button asChild size="sm" variant="outline">
            <Link to={links.evidenceHref}>{t("mgmt.actions.evidence")}</Link>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground self-center">{t("mgmt.actions.evidenceMissing")}</span>
        )}
        {links.recommendedActionHref ? (
          <Button asChild size="sm" variant="outline">
            <Link to={links.recommendedActionHref}>{t("mgmt.actions.nextAction")}</Link>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground self-center">{t("mgmt.actions.noAction")}</span>
        )}
      </div>
    </Card>
  );
};
