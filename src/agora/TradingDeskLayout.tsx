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
import "./agoraDesign.css";

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
      className="agora-topbar shrink-0"
      data-testid="trading-desk-command-bar"
    >
      <div className="flex items-center gap-3">
        <span className="agora-logo-mark">A</span>
        <span className="agora-logo-text">AGORA</span>
      </div>
      <span className="agora-market-pill">陳柏宇 · 籌碼派</span>
      <div className="agora-command">
        <span className="text-[13px] text-[var(--ag-ai)]">✦</span>
        <span className="truncate">交代助理：描述您的交易策略想法，例如「我想找有大戶建立部位的落後股」</span>
      </div>
      <button
        aria-label={drawerOpen ? "Close servant drawer" : "Open servant drawer"}
        aria-pressed={drawerOpen}
        className="agora-action"
        onClick={onToggleDrawer}
        type="button"
      >
        {drawerOpen ? "關閉助理" : "交代助理"}
      </button>
      <span className="agora-status-pill">監控中</span>
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
      className="agora-section-tabs shrink-0"
      data-testid="trading-desk-tab-bar"
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            aria-current={isActive ? "page" : undefined}
            aria-label={`${tab.label} (${tab.labelZh})`}
            className="agora-tab"
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.id === "trading-room"
              ? "Trading Room · 交易操盤室"
              : tab.id === "strategy-workshop"
                ? "Strategy Workshop · 策略工坊"
                : "Performance · 策略執行與績效"}
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
      className="agora-drawer flex shrink-0 flex-col"
      data-testid="trading-desk-servant-drawer"
    >
      <div className="agora-drawer-header shrink-0">
        <span className="text-xs font-bold uppercase text-[var(--ag-ai)]">✦ Trading Servant</span>
        {workshopId && (
          <span className="ml-auto font-mono text-xs text-[var(--ag-faint)]">
            {workshopId.slice(0, 8)}…
          </span>
        )}
      </div>
      <div className="flex-1 space-y-3 p-4">
        <div className="agora-card-soft p-3">
          <div className="agora-card-title">助手理解</div>
          <p className="agora-card-body mt-2">
            目前工作區以「贏家分點 V4」為中心，追蹤候選、進場、加碼、減碼、出場與分點遷移風險。
          </p>
        </div>
        <div className="agora-card-soft p-3">
          <div className="agora-card-title">可交代事項</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {["先看風險", "重排候選", "新增比較圖", "回到策略工坊"].map((item) => (
              <span className="agora-chip" key={item}>{item}</span>
            ))}
          </div>
        </div>
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
      className="agora-bottom shrink-0"
      data-testid="trading-desk-bottom-strip"
    >
      {BOTTOM_SECTIONS.map((section) => {
        const isActive = activeSection === section.id;
        return (
          <button
            aria-pressed={isActive}
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
      className={cn("agora-shell flex flex-1 flex-col overflow-hidden min-h-0", className)}
      data-testid="trading-desk-shell"
    >
      <CommandBar
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen((v) => !v)}
      />

      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main
          className="agora-main flex-1 overflow-auto"
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
