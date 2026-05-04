// Deployment stages — environment promotion stepper (research → paper → live).
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Deployment } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { ApprovalStagesStepper } from "@/platform/components/LifecycleStepper";
import { Check, AlertTriangle } from "lucide-react";

const ENV_STAGES = ["research", "paper", "live"] as const;

interface StageInfo {
  env: (typeof ENV_STAGES)[number];
  done: boolean;
  active: boolean;
  promotedAt?: string;
  guard?: string;
}

const buildStages = (d: Deployment): StageInfo[] => {
  const currentIdx = ENV_STAGES.indexOf(d.target);
  return ENV_STAGES.map((env, i) => ({
    env,
    done: i < currentIdx,
    active: i === currentIdx,
    promotedAt: i <= currentIdx ? d.promotedAt : undefined,
    guard: env === "live" ? "Requires risk + ops sign-off" : env === "paper" ? "Auto after green research run" : undefined,
  }));
};

export const DeploymentStagesPanel = ({ deployment }: { deployment: Deployment }) => {
  const t = useT();
  const stages = buildStages(deployment);
  const currentIdx = ENV_STAGES.indexOf(deployment.target);

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div>
          <div className="text-sm font-semibold">{t("deployment.stages.title")}</div>
          <div className="text-xs text-muted-foreground mt-1">{t("deployment.stages.hint")}</div>
        </div>
        <ApprovalStagesStepper stages={[...ENV_STAGES]} currentIndex={currentIdx} i18nPrefix="env" />
      </Card>

      <Card className="p-4 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("deployment.stages.detail")}</div>
        <div className="divide-y divide-border border border-border rounded-md overflow-hidden">
          {stages.map((s) => (
            <div key={s.env} className="flex items-start justify-between px-3 py-2.5 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium border ${
                  s.done ? "bg-status-success/20 text-status-success border-status-success/40"
                  : s.active ? "bg-accent text-accent-foreground border-accent"
                  : "bg-muted text-muted-foreground border-border"
                }`}>
                  {s.done ? <Check className="h-3 w-3" /> : ENV_STAGES.indexOf(s.env) + 1}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium uppercase">{s.env}</div>
                  {s.guard && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="h-3 w-3" /> {s.guard}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                {s.active && <Badge variant="outline" className="text-[10px] uppercase">{t("deployment.stages.current")}</Badge>}
                {s.promotedAt && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(s.promotedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
