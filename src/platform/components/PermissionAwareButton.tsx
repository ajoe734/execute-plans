// PermissionAwareButton — Spec §3.6.
// Wraps shadcn Button. When the current role lacks `requiredAction`, the button is
// rendered disabled with a tooltip explaining which roles may invoke it.
import { forwardRef } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/lib/usePermissions";
import { useT } from "@/platform/hooks";

export interface PermissionAwareButtonProps extends ButtonProps {
  /** RBAC action id (matches `permissions.ts` ACTION_ROLES keys). */
  requiredAction: string;
  /** Optional explicit role list to display in the tooltip; falls back to the action id. */
  rolesHint?: string[];
}

export const PermissionAwareButton = forwardRef<HTMLButtonElement, PermissionAwareButtonProps>(
  ({ requiredAction, rolesHint, disabled, children, ...rest }, ref) => {
    const { can } = usePermissions();
    const t = useT();
    const allowed = can(requiredAction);

    if (allowed) {
      return <Button ref={ref} disabled={disabled} {...rest}>{children}</Button>;
    }

    const hint = rolesHint?.length
      ? t("permission.requireRoles", { roles: rolesHint.join(", ") })
      : t("permission.requireAction", { action: requiredAction });

    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* span wrapper so disabled button can still trigger tooltip */}
            <span className="inline-flex">
              <Button ref={ref} disabled aria-disabled tabIndex={-1} {...rest}>
                {children}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{hint}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
PermissionAwareButton.displayName = "PermissionAwareButton";
