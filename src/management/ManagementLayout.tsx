import { Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import { SideNav, type NavGroup } from "@/platform/components/SideNav";

import { FloatingAgentPanel } from "@/management/components/agent/FloatingAgentPanel";
import { useT } from "@/platform/hooks";
import { MANAGEMENT_SIDEBAR_GROUPS } from "@/management/navigation/managementRouteManifest";

export const ManagementLayout = () => {
  const t = useT();
  // MGMT-PERF-IA-001 — sidebar groups/items are a projection of the single
  // typed manifest (managementRouteManifest.ts), which also drives page
  // titles/breadcrumbs, the command palette, and the hosted route
  // acceptance inventory. Do not hand-edit group membership here.
  const groups: NavGroup[] = MANAGEMENT_SIDEBAR_GROUPS.map((group) => ({
    label: t(group.labelKey),
    items: group.items.map((item) => ({
      to: item.to,
      label: t(item.labelKey),
      icon: item.icon,
      dedupeKey: item.dedupeKey,
    })),
  }));

  return (
    <>
      <SideNav groups={groups} />
      <main className="flex h-full min-h-0 w-full flex-1 min-w-0 max-w-full flex-col overflow-y-auto overflow-x-hidden">
        <ErrorBoundary key={useLocation().pathname} scope="Management page">
          <Outlet />
        </ErrorBoundary>

      </main>
      <FloatingAgentPanel />
    </>
  );
};
