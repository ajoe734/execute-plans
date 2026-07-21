import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const NON_PRODUCTION_COMMAND_REASON =
  "Disabled until this action is backed by a governed command endpoint, command id, audit receipt, and dry-run/no-side-effect proof.";

type NonProductionActionButtonProps = Omit<ButtonProps, "disabled" | "onClick"> & {
  reason?: ReactNode;
};

export function NonProductionActionButton({
  reason = NON_PRODUCTION_COMMAND_REASON,
  children,
  ...props
}: NonProductionActionButtonProps) {
  const title = typeof reason === "string" ? reason : undefined;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex" title={title}>
            <Button {...props} disabled aria-disabled tabIndex={-1}>
              {children}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {reason}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
