// LifecycleStepper — Spec §3.4 / Part 7 §17.
// Renders the canonical states of a StateMachine as a horizontal stepper.
// Branch states (e.g. degraded, blocked, cancelled) appear after the canonical
// row when active, styled as warnings.
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/platform/hooks";
import type { StateMachine } from "@/lib/stateMachines/types";

interface Props<S extends string> {
  machine: StateMachine<S>;
  current: S;
  /** i18n key prefix, e.g. "lifecycle.strategy". Falls back to raw state name. */
  i18nPrefix?: string;
  className?: string;
}

export function LifecycleStepper<S extends string>({
  machine, current, i18nPrefix, className,
}: Props<S>) {
  const t = useT();
  const states = machine.states;
  const branch = machine.branchStates ?? [];
  const idx = states.indexOf(current);
  const onBranch = idx === -1 && branch.includes(current);

  const label = (s: S) =>
    i18nPrefix ? t(`${i18nPrefix}.${s}`, { defaultValue: s }) : s;

  return (
    <div className={cn("w-full", className)}>
      <ol className="flex items-center w-full overflow-x-auto">
        {states.map((s, i) => {
          const done = idx > -1 && i < idx;
          const active = idx === i;
          return (
            <li key={s} className="flex items-center min-w-0 flex-1 last:flex-none">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 border",
                    done && "bg-status-success/20 text-status-success border-status-success/40",
                    active && "bg-accent text-accent-foreground border-accent",
                    !done && !active && "bg-muted text-muted-foreground border-border",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "text-xs truncate",
                    active ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label(s)}
                </span>
              </div>
              {i < states.length - 1 && (
                <div
                  className={cn(
                    "h-px flex-1 mx-2",
                    done ? "bg-status-success/40" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
      {onBranch && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{t("lifecycle.branch", { defaultValue: "Branch state:" })}</span>
          <span className="px-2 py-0.5 rounded border border-status-warning/40 bg-status-warning/15 text-status-warning font-medium">
            {label(current)}
          </span>
        </div>
      )}
    </div>
  );
}

// Generic ApprovalStagesStepper — Spec §3.5.
interface ApprovalStagesProps {
  stages: string[];
  currentIndex: number;
  i18nPrefix?: string;
  className?: string;
}
export const ApprovalStagesStepper = ({
  stages, currentIndex, i18nPrefix, className,
}: ApprovalStagesProps) => {
  const t = useT();
  const label = (s: string) =>
    i18nPrefix ? t(`${i18nPrefix}.${s}`, { defaultValue: s }) : s;
  return (
    <ol className={cn("flex items-center w-full", className)}>
      {stages.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={s} className="flex items-center min-w-0 flex-1 last:flex-none">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium shrink-0 border",
                  done && "bg-status-success/20 text-status-success border-status-success/40",
                  active && "bg-accent text-accent-foreground border-accent",
                  !done && !active && "bg-muted text-muted-foreground border-border",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={cn("text-xs truncate", active ? "font-semibold" : "text-muted-foreground")}>
                {label(s)}
              </span>
            </div>
            {i < stages.length - 1 && <div className={cn("h-px flex-1 mx-2", done ? "bg-status-success/40" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
};
