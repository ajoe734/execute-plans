import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ReadinessBlocker } from "@/lib/v5/management/readiness";

const tone = (s: ReadinessBlocker["severity"]) =>
  s === "critical" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
  s === "high"     ? "bg-status-failed/10 text-status-failed border-status-failed/20" :
  s === "medium"   ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
                     "bg-muted text-muted-foreground border-border";

export const BlockersList = ({ blockers }: { blockers: ReadinessBlocker[] }) => {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("mgmt.readiness.blockers")}</h2>
      {blockers.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{t("mgmt.readiness.noActiveBlockers")}</p>
      ) : (
        <ul className="mt-3 space-y-2" role="list">
          {blockers.map((b) => (
            <li key={b.id} className="rounded-md border border-border p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground font-mono">{b.id}</span>
                <Badge variant="outline" className={tone(b.severity)}>{b.severity}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{b.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("mgmt.readiness.requiredRoleFmt", { role: b.requiredRole })}
                {" · "}
                {t("mgmt.readiness.nextActionFmt", { action: b.nextAction })}
              </p>
              {b.linkedEvidence.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("mgmt.readiness.evidenceLabel")} {b.linkedEvidence.map((e) => <span key={e} className="font-mono mr-2">{e}</span>)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
