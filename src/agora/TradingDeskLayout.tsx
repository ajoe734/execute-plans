// TradingDeskShell — tab-based Agora shell for the three main trading sections.
//
// Structure per §10 IA (contract-closure/05_execute_plans_agora_ui_ia_and_dependencies.md):
//
//   ┌──────────────────────────────────────────────────────────┐
//   │  CommandBar  (top command bar)                           │
//   ├──────────────────────────────────────────────────────────┤
//   │  TabBar  (Trading Room | Strategy Workshop | Performance)│
//   ├────────────────────────────────────────┬─────────────────┤
//   │                                        │                 │
//   │  <Outlet />  (active tab page)         │ ServantDrawer   │
//   │                                        │ (right, slide)  │
//   ├────────────────────────────────────────┴─────────────────┤
//   │  BottomStrip  (jobs · shadow · journal)                  │
//   └──────────────────────────────────────────────────────────┘
//
// Routes (§10 IA):
//   /agora/trading-room          交易操盤室
//   /agora/strategy-workshop     策略工坊
//   /agora/strategy-performance  策略執行與績效

import React, { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

// ─── Tab definitions ──────────────────────────────────────────────────────────

export type AgoraTab =
  | "trading-room"
  | "strategy-workshop"
  | "strategy-performance";

interface TabDef {
  id: AgoraTab;
  label: string;
  labelZh: string;
  path: string;
}

const TABS: TabDef[] = [
  {
    id: "trading-room",
    label: "Trading Room",
    labelZh: "交易操盤室",
    path: "/agora/trading-room",
  },
  {
    id: "strategy-workshop",
    label: "Strategy Workshop",
    labelZh: "策略工坊",
    path: "/agora/strategy-workshop",
  },
  {
    id: "strategy-performance",
    label: "Performance",
    labelZh: "策略執行與績效",
    path: "/agora/strategy-performance",
  },
];

function tabFromPath(pathname: string): AgoraTab {
  for (const tab of TABS) {
    if (pathname === tab.path || pathname.startsWith(tab.path + "/")) {
      return tab.id;
    }
  }
  return "trading-room";
}

// ─── CommandBar ───────────────────────────────────────────────────────────────

function CommandBar({
  drawerOpen,
  onToggleDrawer,
}: {
  drawerOpen: boolean;
  onToggleDrawer: () => void;
}) {
  return (
    <header
      className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4"
      data-testid="trading-desk-command-bar"
    >
      <span className="text-sm font-semibold text-slate-900">Trading Desk</span>
      <span className="flex-1" />
      <button
        aria-label={drawerOpen ? "Close servant drawer" : "Open servant drawer"}
        aria-pressed={drawerOpen}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
          drawerOpen
            ? "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
        )}
        onClick={onToggleDrawer}
        type="button"
      >
        <span aria-hidden="true" className="h-3.5 w-3.5 select-none">
          {drawerOpen ? "✕" : "⚡"}
        </span>
        Servant
      </button>
    </header>
  );
}

// ─── TabBar ───────────────────────────────────────────────────────────────────

function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: AgoraTab;
  onTabChange: (tab: AgoraTab) => void;
}) {
  return (
    <nav
      aria-label="Trading desk sections"
      className="flex h-10 shrink-0 items-end gap-0 border-b border-slate-200 bg-white px-4"
      data-testid="trading-desk-tab-bar"
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            aria-current={isActive ? "page" : undefined}
            aria-label={`${tab.label} (${tab.labelZh})`}
            className={cn(
              "relative -mb-px flex h-9 items-center px-4 text-sm font-medium transition-colors",
              isActive
                ? "border-b-2 border-blue-600 text-blue-700"
                : "text-slate-600 hover:text-slate-900",
            )}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

// ─── ServantDrawer ────────────────────────────────────────────────────────────

function ServantDrawer({ open, workshopId }: { open: boolean; workshopId?: string }) {
  if (!open) return null;
  return (
    <aside
      aria-label="Servant drawer"
      className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white"
      data-testid="trading-desk-servant-drawer"
    >
      <div className="flex h-10 shrink-0 items-center border-b border-slate-100 px-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Servant
        </span>
        {workshopId && (
          <span className="ml-auto font-mono text-xs text-slate-400">
            {workshopId.slice(0, 8)}…
          </span>
        )}
      </div>
      <div className="flex-1 p-3">
        <p className="text-xs text-slate-400">Servant panel — workshop context loads here.</p>
      </div>
    </aside>
  );
}

// ─── BottomStrip ──────────────────────────────────────────────────────────────

const BOTTOM_SECTIONS = [
  { id: "jobs", label: "Jobs" },
  { id: "shadow", label: "Shadow" },
  { id: "journal", label: "Journal" },
] as const;

function BottomStrip({
  activeSection,
  onSectionChange,
}: {
  activeSection: string | null;
  onSectionChange: (id: string | null) => void;
}) {
  return (
    <footer
      className="flex h-10 shrink-0 items-center gap-0 border-t border-slate-200 bg-slate-50 px-4"
      data-testid="trading-desk-bottom-strip"
    >
      {BOTTOM_SECTIONS.map((section) => {
        const isActive = activeSection === section.id;
        return (
          <button
            aria-pressed={isActive}
            className={cn(
              "h-full px-3 text-xs font-medium transition-colors",
              isActive
                ? "border-t-2 border-blue-600 bg-white text-blue-700"
                : "text-slate-500 hover:text-slate-800",
            )}
            key={section.id}
            onClick={() => onSectionChange(isActive ? null : section.id)}
            type="button"
          >
            {section.label}
          </button>
        );
      })}
    </footer>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────

export interface TradingDeskLayoutProps {
  /** Workshop ID propagated to the servant drawer when on strategy-workshop tab. */
  workshopId?: string;
  className?: string;
}

export function TradingDeskLayout({ workshopId, className }: TradingDeskLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bottomSection, setBottomSection] = useState<string | null>(null);

  const activeTab = tabFromPath(location.pathname);

  const handleTabChange = (tab: AgoraTab) => {
    const tabDef = TABS.find((t) => t.id === tab);
    if (tabDef) navigate(tabDef.path);
  };

  const servantWorkshopId =
    activeTab === "strategy-workshop" ? workshopId : undefined;

  return (
    <div
      className={cn("flex flex-1 flex-col overflow-hidden min-h-0", className)}
      data-testid="trading-desk-shell"
    >
      <CommandBar
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen((v) => !v)}
      />

      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main
          className="flex-1 overflow-auto"
          data-testid="trading-desk-main"
          id="trading-desk-content"
        >
          <Outlet />
        </main>

        <ServantDrawer open={drawerOpen} workshopId={servantWorkshopId} />
      </div>

      <BottomStrip activeSection={bottomSection} onSectionChange={setBottomSection} />
    </div>
  );
}

export default TradingDeskLayout;
