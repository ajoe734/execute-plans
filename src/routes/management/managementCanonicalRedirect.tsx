// MGMT-PERF-IA-001 — generic legacy-alias redirect driven by the canonical
// route manifest (src/management/navigation/managementRouteManifest.ts).
// Replaces one-off `<Navigate>` routes for every bare legacy alias that the
// route migration matrix folds into a canonical center + tab.
import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { resolveLegacyRedirect } from "@/management/navigation/managementRouteManifest";

export function ManagementCanonicalRedirect() {
  const { pathname, search } = useLocation();
  const resolved = resolveLegacyRedirect(pathname, search);
  // Every mount point for this component must have a matching manifest rule;
  // fall back to the management root rather than rendering nothing if the
  // route table and this component's usage ever drift apart.
  const target = resolved ? `${resolved.pathname}${resolved.search}` : "/management/cockpit";
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("pantheon:management-legacy-redirect", {
      detail: { from: `${pathname}${search}`, to: target },
    }));
  }, [pathname, search, target]);
  return <Navigate to={target} replace />;
}
