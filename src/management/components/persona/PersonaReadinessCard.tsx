// Persona readiness card — spec §6.
// 5-stage checklist + health chip + "Start Onboarding Wizard" CTA.
// Tolerant of partial persona-management shape (F4 not yet live).

import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle2, Circle, AlertTriangle, Activity, ArrowRight, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/platform/hooks";
import {
  derivePersonaReadiness, reasonI18nKey, reasonNextStepI18nKey,
  type HealthStatus,
} from "@/management/lib/personaReadiness";
import type { Persona } from "@/lib/bff/types";

interface Props {
  personaId: string;
  /** Pass any of: flat Persona | wrapped { data: {...} } | full mgmt surface. */
  persona: Persona | { data?: unknown } | null | undefined;
  personaName?: string;
  className?: string;
}

const HEALTH_CHIP: Record<HealthStatus, { tone: string; label: string }> = {
  healthy:  { tone: "bg-status-success/15 text-status-success border-status-success/40", label: "persona.health.status.healthy" },
  degraded: { tone: "bg-status-warning/15 text-status-warning border-status-warning/40", label: "persona.health.status.degraded" },
  critical: { tone: "bg-status-danger/15 text-status-danger border-status-danger/40",     label: "persona.health.status.critical" },
  unknown:  { tone: "bg-muted text-muted-foreground border-border",                       label: "persona.health.status.unknown" },
};

export function PersonaReadinessCard({ personaId, persona, personaName, className }: Props) {
  const t = useT();
  const navigate = useNavigate();
  const r = derivePersonaReadiness(persona as Parameters<typeof derivePersonaReadiness>[0]);
  const chip = HEALTH_CHIP[r.healthStatus];

  const wizardHref = `/management/personas/${encodeURIComponent(personaId)}/onboarding`;
  const happy = r.completed === 5;

  return (
    <Card className={cn("p-4 space-y-3", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold truncate">
              {personaName ?? personaId}
            </h2>
            <Badge variant="outline" className={cn("text-[10px]", chip.tone)}>
              {t(chip.label, { defaultValue: r.healthStatus })}
            </Badge>
            {r.reasons.length > 0 && (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 text-xs text-status-warning cursor-help">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t("persona.health.reasonCount", { count: r.reasons.length })}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <ul className="space-y-1 text-xs">
                      {r.reasons.map((reason) => (
                        <li key={reason}>
                          • {t(reasonI18nKey(reason), { defaultValue: reason })}
                        </li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t("persona.onboarding.stepProgress", { current: r.completed, total: r.total })} ·{" "}
            {personaId}
          </p>
        </div>
        {!happy && (
          <Button size="sm" onClick={() => navigate(wizardHref)}>
            {t("persona.onboarding.openWizard")}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </header>

      {happy ? (
        <div className="rounded border border-status-success/30 bg-status-success/5 px-3 py-2 text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-status-success" />
          <span>
            {t("persona.onboarding.banner.liveStatus", { sessions: r.activeSessions ?? 0 })}
          </span>
          {(typeof r.pnl === "number" || typeof r.drawdown === "number") && (
            <span className="ml-2 text-xs text-muted-foreground">
              {typeof r.pnl === "number" && <>PnL: {(r.pnl * 100).toFixed(1)}% · </>}
              {typeof r.drawdown === "number" && <>DD: {(r.drawdown * 100).toFixed(1)}%</>}
            </span>
          )}
        </div>
      ) : (
        <ol className="space-y-1">
          {r.stages.map((s, i) => {
            const label = t(`persona.onboarding.stages.${s.key}`);
            const statusText = s.done
              ? t("persona.onboarding.stageStatus.done")
              : s.key === "lifecycle"
                ? t("persona.onboarding.stageStatus.notUpgraded")
                : s.key === "approval"
                  ? t("persona.onboarding.stageStatus.notSubmitted")
                  : s.key === "runtime"
                    ? t("persona.onboarding.stageStatus.notStarted")
                    : t("persona.onboarding.stageStatus.notCreated");
            const isNext = s.key === r.nextStage;
            const nextStepKey = s.blockedReason ? reasonNextStepI18nKey(s.blockedReason) : undefined;
            return (
              <li key={s.key} className={cn(
                "flex items-center justify-between rounded px-2 py-1 text-sm",
                isNext && "bg-accent/40",
              )}>
                <div className="flex items-center gap-2 min-w-0">
                  {s.done
                    ? <CheckCircle2 className="h-4 w-4 text-status-success shrink-0" />
                    : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className={cn("truncate", s.done ? "text-foreground" : "text-muted-foreground")}>
                    {label}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-1">({i + 1}/5)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{statusText}</span>
                  {isNext && !s.done && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                            onClick={() => navigate(wizardHref + `?step=${i + 1}`)}>
                      {nextStepKey ? t(nextStepKey) : t("persona.onboarding.openWizard")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {!happy && (
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <Link to={`/management/personas/${encodeURIComponent(personaId)}`}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <Settings2 className="h-3 w-3" />
            {t("persona.onboarding.advancedMode")}
          </Link>
        </div>
      )}
    </Card>
  );
}
