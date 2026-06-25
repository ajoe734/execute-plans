import { Check, Circle, Loader2, AlertCircle, MinusCircle } from "lucide-react";
import { cn, safeDateTime } from "@/lib/utils";
import type { WorkflowStep } from "@/lib/bff/types";

interface Props {
  steps: ReadonlyArray<WorkflowStep>;
  onStepClick?: (step: WorkflowStep) => void;
  orientation?: "horizontal" | "vertical";
}

const iconFor = (status: WorkflowStep["status"]) => {
  switch (status) {
    case "complete": return <Check className="h-4 w-4" />;
    case "in_progress": return <Loader2 className="h-4 w-4 animate-spin" />;
    case "blocked": return <AlertCircle className="h-4 w-4" />;
    case "skipped": return <MinusCircle className="h-4 w-4" />;
    default: return <Circle className="h-4 w-4" />;
  }
};

const toneFor = (status: WorkflowStep["status"]) => {
  switch (status) {
    case "complete": return "text-status-success border-status-success/40 bg-status-success/10";
    case "in_progress": return "text-primary border-primary/40 bg-primary/10";
    case "blocked": return "text-status-failed border-status-failed/40 bg-status-failed/10";
    case "skipped": return "text-muted-foreground border-border bg-muted/40";
    default: return "text-muted-foreground border-border";
  }
};

export const WorkflowStepper = ({ steps, onStepClick, orientation = "horizontal" }: Props) => {
  if (orientation === "vertical") {
    return (
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onStepClick?.(s)}
              className={cn(
                "w-full flex items-start gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/40",
                toneFor(s.status),
              )}
            >
              <div className="mt-0.5">{iconFor(s.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{i + 1}. {s.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {s.actor ? `${s.actor} · ` : ""}{s.ts ? safeDateTime(s.ts) : "—"}
                </div>
                {s.note && <div className="text-xs mt-1">{s.note}</div>}
              </div>
            </button>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
      {steps.map((s, i) => (
        <button
          type="button"
          key={s.id}
          onClick={() => onStepClick?.(s)}
          className={cn(
            "flex-shrink-0 min-w-[140px] rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/40",
            toneFor(s.status),
          )}
        >
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider opacity-80">
            {iconFor(s.status)} <span>Step {i + 1}</span>
          </div>
          <div className="text-sm font-medium mt-1 truncate">{s.label}</div>
          {s.actor && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{s.actor}</div>}
        </button>
      ))}
    </div>
  );
};
