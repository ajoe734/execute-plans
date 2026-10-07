import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/platform/hooks";

export const NON_PRODUCTION_COMMAND_REASON =
  "Disabled until this action is backed by a governed command endpoint, command id, audit receipt, and dry-run/no-side-effect proof.";

export type NonProductionActionStatus =
  | "owner endpoint exists with frontend wiring pending"
  | "no executing owner";

type NonProductionActionButtonProps = Omit<ButtonProps, "disabled" | "onClick"> & {
  status?: NonProductionActionStatus;
  reason?: ReactNode;
};

export function NonProductionActionButton({
  status,
  reason = NON_PRODUCTION_COMMAND_REASON,
  children,
  ...props
}: NonProductionActionButtonProps) {
  const t = useT();
  const statusReason = status
    ? t(
        status === "no executing owner"
          ? "actions.disabledStatus.noOwner"
          : "actions.disabledStatus.ownerPending",
        { defaultValue: status },
      )
    : undefined;
  const effectiveReason = statusReason ?? reason;
  const title = typeof effectiveReason === "string" ? effectiveReason : undefined;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex" title={title} data-status={status}>
            <Button
              {...props}
              disabled
              aria-disabled
              tabIndex={-1}
              title={title}
              data-reason={title}
              data-status={status}
            >
              {children}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {effectiveReason}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
