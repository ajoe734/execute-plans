// MGMT-PERF-IA-001 — generic legacy-alias redirect driven by the canonical
// route manifest (src/management/navigation/managementRouteManifest.ts).
// Replaces one-off `<Navigate>` routes for every bare legacy alias that the
// route migration matrix folds into a canonical center + tab.
import type { ReactNode } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { resolveLegacyRedirect } from "@/management/navigation/managementRouteManifest";

export function ManagementCanonicalRedirect() {
  const { pathname, search } = useLocation();
  const resolved = resolveLegacyRedirect(pathname, search);
  // Every mount point for this component must have a matching manifest rule;
  // fall back to the management root rather than rendering nothing if the
  // route table and this component's usage ever drift apart.
  const target = resolved ? `${resolved.pathname}${resolved.search}` : "/management/cockpit";
  return <Navigate to={target} replace />;
}

// PPL-ALLOC-006 added an `emergency-actions` tab to the legacy Promotion &
// Allocation page after ROUTE_MIGRATION_MATRIX.md was written; that tab has
// no canonical-center destination yet, so /management/promotion-allocation
// keeps rendering the legacy page directly for it instead of redirecting.
// Every other tab (and the bare route) still redirects per the manifest.
const PROMOTION_ALLOCATION_LEGACY_ONLY_TABS = new Set(["emergency-actions", "emergency", "containment"]);

export function PromotionAllocationLegacyGate({ legacyPage }: { legacyPage: ReactNode }) {
  const [params] = useSearchParams();
  if (PROMOTION_ALLOCATION_LEGACY_ONLY_TABS.has(params.get("tab") ?? "")) {
    return <>{legacyPage}</>;
  }
  return <ManagementCanonicalRedirect />;
}
