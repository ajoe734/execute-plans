import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ReadinessChecklistItem } from "@/lib/v5/management/readiness";

const tone = (s: ReadinessChecklistItem["status"]) =>
  s === "pass" ? "bg-status-success/15 text-status-success border-status-success/30" :
  s === "fail" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
  s === "pending" ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
  "bg-muted text-muted-foreground border-border";

export const ReadinessChecklist = ({ items }: { items: ReadinessChecklistItem[] }) => {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("mgmt.readiness.checklist")}</h2>
      <ul className="mt-3 divide-y divide-border" role="list">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-foreground">{item.label}</div>
              <div className="text-xs text-muted-foreground">
                {t("mgmt.readiness.ownerFmt", { role: item.ownerRole })}
                {item.evidenceRequired && (
                  <> · {t("mgmt.readiness.evidenceLine")} {item.evidenceAttached ? t("mgmt.readiness.attached") : t("mgmt.readiness.missing")}</>
                )}
                {item.blocking && <> · {t("mgmt.readiness.blocking")}</>}
              </div>
            </div>
            <Badge variant="outline" className={tone(item.status)}>{item.status}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
};
