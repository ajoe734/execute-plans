// 2026-05-20 revamp §7 — Readiness page header.
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ReadinessHeaderModel } from "@/lib/v5/management/readiness";
import { safeDateTime } from "@/lib/utils";

const statusTone = (s: ReadinessHeaderModel["status"]) =>
  s === "ready" ? "bg-status-success/15 text-status-success border-status-success/30" :
  s === "blocked" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
  s === "pending" ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
  "bg-muted text-muted-foreground border-border";

export const ReadinessHeader = ({ model }: { model: ReadinessHeaderModel }) => {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{model.title}</h1>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("mgmt.readiness.envFmt", { env: model.environment })}{" "}
            <time dateTime={model.lastUpdated}>{safeDateTime(model.lastUpdated)}</time>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={statusTone(model.status)}>{model.status}</Badge>
          <Badge variant="outline" className="border-border">
            {t("mgmt.readiness.scoreFmt", { n: model.score })}
          </Badge>
          <Badge variant="outline" className={model.canProceed ? "bg-status-success/15 text-status-success border-status-success/30" : "bg-muted text-muted-foreground border-border"}>
            {model.canProceed ? t("mgmt.readiness.canProceedTrue") : t("mgmt.readiness.canProceedFalse")}
          </Badge>
        </div>
      </div>
      {model.primaryBlocker && (
        <p className="mt-3 text-xs text-status-failed">{t("mgmt.readiness.primaryBlockerFmt", { r: model.primaryBlocker })}</p>
      )}
    </Card>
  );
};
