// Pack D D44 — EmptyState canonical (icon + title + description + CTA).
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Inbox } from "lucide-react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  cta?: {
    label: string;
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
    disabledTooltip?: string;
  };
  className?: string;
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, cta, className }, ref) => {
    const button = cta ? (
      cta.href ? (
        <a href={cta.href}>
          <Button disabled={cta.disabled}>{cta.label}</Button>
        </a>
      ) : (
        <Button onClick={cta.onClick} disabled={cta.disabled}>
          {cta.label}
        </Button>
      )
    ) : null;
    return (
      <div
        ref={ref}
        role="status"
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed p-8 text-center",
          className,
        )}
      >
        <div className="text-muted-foreground" aria-hidden>
          {icon ?? <Inbox className="h-8 w-8" />}
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        </div>
        {button &&
          (cta?.disabled && cta.disabledTooltip ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>{button}</span>
                </TooltipTrigger>
                <TooltipContent>{cta.disabledTooltip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            button
          ))}
      </div>
    );
  },
);

EmptyState.displayName = "EmptyState";
