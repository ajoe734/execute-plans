import { useMemo } from "react";
import { usePlatform } from "@/platform/store";
import { canInvoke, filterActions } from "./permissions";

export function usePermissions() {
  const role = usePlatform((s) => s.role);
  return useMemo(
    () => ({
      role,
      can: (action: string) => canInvoke(role, action),
      allowed: (available: string[] | undefined) => filterActions(role, available),
    }),
    [role],
  );
}
