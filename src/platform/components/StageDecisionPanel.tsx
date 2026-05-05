// StageDecisionPanel — Phase 17.
// Renders per-stage decision UI with SLA badge + Approve/Reject buttons.
// Only the current pending stage is actionable; previous stages show their decision.
import { Check, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/platform/hooks";
import { SlaCountdown } from "./SlaCountdown";
import { PermissionAwareButton } from "./PermissionAwareButton";
import type { ApprovalStage } from "@/lib/bff/types";

interface Props {
  stages: ApprovalStage[];
  i18nPrefix?: string;
  onDecide: (stageName: string, decision: "approve" | "reject") => void;
  disabled?: boolean;
}

const stateTone: Record<ApprovalStage["state"], string> = {
  pending: "bg-muted text-muted-foreground border-border",
  approved: "bg-status-success/15 text-status-success border-status-success/40",
  rejected: "bg-status-error/15 text-status-error border-status-error/40",
  skipped: "bg-muted text-muted-foreground border-border opacity-60",
};

export const StageDecisionPanel = ({ stages, i18nPrefix = "lifecycle.approval", onDecide, disabled }: Props) => {
  const t = useT();
  const activeIdx = stages.findIndex((s) => s.state === "pending");
  const label = (s: string) => t(`${i18nPrefix}.${s}`, { defaultValue: s });

  return (
    <ol className="space-y-2">
      {stages.map((stage, i) => {
        const isActive = i === activeIdx;
        return (
          <li
            key={`${stage.name}-${i}`}
            className={cn(
              "rounded-md border p-3 space-y-2",
              isActive ? "border-accent bg-accent/5" : "border-border",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium border shrink-0",
                  stateTone[stage.state],
                )}>
                  {stage.state === "approved" ? <Check className="h-3 w-3" />
                    : stage.state === "rejected" ? <X className="h-3 w-3" />
                    : i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{label(stage.name)}</div>
                  {stage.decidedBy && (
                    <div className="text-mono text-[10px] text-muted-foreground">
                      {stage.decidedBy} · {stage.decidedAt ? new Date(stage.decidedAt).toLocaleString() : ""}
                    </div>
                  )}
                </div>
              </div>
              <SlaCountdown
                startedAt={stage.startedAt}
                slaHours={stage.slaHours}
                escalated={stage.escalated}
              />
            </div>
            {stage.memo && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">{stage.memo}</p>
            )}
            {isActive && !disabled && (
              <div className="flex items-center gap-2 pt-1">
                <PermissionAwareButton
                  requiredAction="approve"
                  size="sm"
                  onClick={() => onDecide(stage.name, "approve")}
                  className="gap-1"
                >
                  <Check className="h-3 w-3" />
                  {t("approval.stage.approve", { defaultValue: "Approve stage" })}
                </PermissionAwareButton>
                <PermissionAwareButton
                  requiredAction="reject"
                  variant="outline"
                  size="sm"
                  onClick={() => onDecide(stage.name, "reject")}
                  className="gap-1"
                >
                  <X className="h-3 w-3" />
                  {t("approval.stage.reject", { defaultValue: "Reject" })}
                </PermissionAwareButton>
                {i + 1 < stages.length && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <ArrowRight className="h-3 w-3" />
                    {label(stages[i + 1].name)}
                  </span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
};

// Re-export with a button helper for non-React contexts.
export { Button };
