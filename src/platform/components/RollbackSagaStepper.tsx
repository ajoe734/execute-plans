// Planner Response §D04 (2026-05-07) — RollbackSaga stepper UI.

import { ROLLBACK_SAGA_STEPS, stepIndex, isTerminalSagaStatus } from "@/lib/v4/rollbackSaga";
import type { RollbackSagaDTO, RollbackSagaStep } from "@/lib/v4/rollbackSaga";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface RollbackSagaStepperProps {
  saga: RollbackSagaDTO;
  className?: string;
}

const STEP_LABELS: Record<RollbackSagaStep, string> = {
  validate: "Validate",
  approval: "Approval",
  confirm_token: "Confirm token",
  queue_execution: "Queue",
  rolling_back: "Rolling back",
  verify: "Verify",
  link_incident: "Link incident",
  postmortem: "Postmortem",
  done: "Done",
};

export function RollbackSagaStepper({ saga, className }: RollbackSagaStepperProps) {
  const current = stepIndex(saga.currentStep);
  const terminal = isTerminalSagaStatus(saga.status);
  const failed = saga.status === "failed";

  return (
    <div className={cn("space-y-2", className)} role="status" aria-label="Rollback saga progress">
      <div className="flex items-center gap-1.5 flex-wrap">
        {ROLLBACK_SAGA_STEPS.map((step, idx) => {
          const past = idx < current;
          const active = idx === current && !terminal;
          return (
            <div key={step} className="flex items-center gap-1.5">
              <div
                className={cn(
                  "size-5 rounded-full border flex items-center justify-center text-[10px] text-mono",
                  past && "bg-primary text-primary-foreground border-primary",
                  active && "border-accent ring-2 ring-accent/30",
                  !past && !active && "border-border text-muted-foreground",
                  failed && idx === current && "bg-destructive text-destructive-foreground border-destructive",
                )}
              >
                {idx + 1}
              </div>
              <span
                className={cn(
                  "text-xs",
                  active ? "font-medium" : "text-muted-foreground",
                )}
              >
                {STEP_LABELS[step]}
              </span>
              {idx < ROLLBACK_SAGA_STEPS.length - 1 && (
                <span className="text-muted-foreground">→</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <Badge variant={failed ? "destructive" : "secondary"} className="text-mono text-[10px]">
          {saga.status}
        </Badge>
        {saga.failureReasonCode && (
          <span className="text-destructive text-mono">{saga.failureReasonCode}</span>
        )}
        <span className="text-muted-foreground text-mono">corr: {saga.correlationId}</span>
      </div>
    </div>
  );
}
