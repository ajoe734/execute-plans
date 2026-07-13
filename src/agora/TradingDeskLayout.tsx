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

import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getWorkshop } from "@/lib/bff-v1/agora/workshops";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/types";

/** Below this width the servant drawer becomes a full-width overlay instead of a fixed side column. */
const MOBILE_BREAKPOINT_PX = 768;

function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT_PX : false,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_PX);
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return isMobile;
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

export type AgoraTab =
  | "trading-room"
  | "strategy-workshop"
  | "strategy-performance";

interface TabDef {
  id: AgoraTab;
  labelKey: string;
  path: string;
}

const TABS: TabDef[] = [
  {
    id: "trading-room",
    labelKey: "nav.tradingRoom",
    path: "/agora/trading-room",
  },
  {
    id: "strategy-workshop",
    labelKey: "nav.strategyWorkshop",
    path: "/agora/strategy-workshop",
  },
  {
    id: "strategy-performance",
    labelKey: "nav.strategyPerformance",
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
  const { t } = useTranslation();
  return (
    <header
      className="flex h-12 shrink-0 items-center gap-3 border-b border-[#2a2e38] bg-[#1a1d23] px-4"
      data-testid="trading-desk-command-bar"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#e8b750] text-xs font-black text-[#1a1410]">
        A
      </span>
      <span className="text-sm font-bold tracking-wide text-[#f0ece4]">AGORA</span>
      <span className="flex-1" />
      <button
        aria-label={t(drawerOpen ? "agora.shell.servant.close" : "agora.shell.servant.open")}
        aria-pressed={drawerOpen}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
          drawerOpen
            ? "border-[rgba(232,183,80,0.35)] bg-[rgba(232,183,80,0.12)] text-[#e8b750]"
            : "border-[#2a2e38] bg-transparent text-[#8c96a6] hover:bg-[#171b22]",
        )}
        onClick={onToggleDrawer}
        type="button"
      >
        <span aria-hidden="true" className="h-3.5 w-3.5 select-none">
          {drawerOpen ? "✕" : "⚡"}
        </span>
        {t("agora.shell.servant.label")}
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
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("agora.shell.sections")}
      className="flex h-10 shrink-0 items-end gap-0 overflow-x-auto border-b border-[#2a2e38] bg-[#171b22] px-4"
      data-testid="trading-desk-tab-bar"
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const label = t(tab.labelKey);
        return (
          <button
            aria-current={isActive ? "page" : undefined}
            aria-label={label}
            className={cn(
              "relative -mb-px flex h-9 items-center px-4 text-sm font-medium transition-colors",
              isActive
                ? "border-b-2 border-[#e8b750] text-[#e8b750]"
                : "text-[#8c96a6] hover:text-[#f0ece4]",
            )}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}

// ─── ServantDrawer ────────────────────────────────────────────────────────────

type ServantWorkshopState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; workshop: StrategyWorkshop }
  | { status: "error"; message: string };

function useServantWorkshopContext(workshopId: string | undefined): ServantWorkshopState {
  const [state, setState] = useState<ServantWorkshopState>({ status: "idle" });

  useEffect(() => {
    if (!workshopId) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    getWorkshop(workshopId)
      .then((workshop) => {
        if (!cancelled) setState({ status: "loaded", workshop });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Unable to load workshop context",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workshopId]);

  return state;
}

function ServantDrawer({
  open,
  workshopId,
  isMobile,
}: {
  open: boolean;
  workshopId?: string;
  isMobile: boolean;
}) {
  const { t } = useTranslation();
  const contextState = useServantWorkshopContext(workshopId);
  if (!open) return null;

  return (
    <aside
      aria-label={t("agora.shell.servant.drawer")}
      className={cn(
        "flex shrink-0 flex-col border-l border-[#2a2e38] bg-[#171b22]",
        isMobile ? "fixed inset-x-0 bottom-10 top-[122px] z-30 w-full" : "w-80",
      )}
      data-testid="trading-desk-servant-drawer"
    >
      <div className="flex h-10 shrink-0 items-center border-b border-[#2a2e38] px-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#e8b750]">
          {t("agora.shell.servant.label")}
        </span>
        {workshopId && (
          <span className="ml-auto font-mono text-xs text-[#737d8e]">
            {workshopId.slice(0, 8)}…
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3" data-testid="servant-drawer-context">
        {!workshopId && (
          <p className="text-xs text-[#737d8e]">
            {t("agora.shell.servant.empty")}
          </p>
        )}
        {workshopId && contextState.status === "loading" && (
          <p className="text-xs text-[#737d8e]">{t("agora.shell.servant.loading")}</p>
        )}
        {workshopId && contextState.status === "error" && (
          <p className="text-xs text-[#f87171]" role="alert">
            {t("agora.shell.servant.unavailable", { message: contextState.message })}
          </p>
        )}
        {workshopId && contextState.status === "loaded" && (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-[#f0ece4]">
              {contextState.workshop.subject.title ?? contextState.workshop.subject.ref}
            </p>
            <p className="text-xs text-[#8c96a6]">
              {t("agora.shell.servant.status", { status: contextState.workshop.status })}
            </p>
            {typeof contextState.workshop.message_count === "number" && (
              <p className="text-xs text-[#8c96a6]">
                {t("agora.shell.servant.messages", { count: contextState.workshop.message_count })}
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── BottomStrip ──────────────────────────────────────────────────────────────

const BOTTOM_SECTIONS = [
  { id: "jobs", labelKey: "agora.shell.bottom.jobs" },
  { id: "shadow", labelKey: "agora.shell.bottom.shadow" },
  { id: "journal", labelKey: "agora.shell.bottom.journal" },
] as const;

function BottomStrip({
  activeSection,
  onSectionChange,
}: {
  activeSection: string | null;
  onSectionChange: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <footer
      className="flex h-10 shrink-0 items-center gap-0 border-t border-[#2a2e38] bg-[#1a1d23] px-4"
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
                ? "border-t-2 border-[#e8b750] bg-[#171b22] text-[#e8b750]"
                : "text-[#737d8e] hover:text-[#f0ece4]",
            )}
            key={section.id}
            onClick={() => onSectionChange(isActive ? null : section.id)}
            type="button"
          >
            {t(section.labelKey)}
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
  const isMobile = useIsMobileViewport();

  const activeTab = tabFromPath(location.pathname);

  const handleTabChange = (tab: AgoraTab) => {
    const tabDef = TABS.find((t) => t.id === tab);
    if (tabDef) navigate(tabDef.path);
  };

  const servantWorkshopId =
    activeTab === "strategy-workshop" ? workshopId : undefined;

  return (
    <div
      className={cn("flex flex-1 flex-col overflow-hidden min-h-0 bg-[#111417] text-[#f0ece4]", className)}
      data-testid="trading-desk-shell"
      data-viewport={isMobile ? "mobile" : "desktop"}
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

        <ServantDrawer open={drawerOpen} workshopId={servantWorkshopId} isMobile={isMobile} />
      </div>

      <BottomStrip activeSection={bottomSection} onSectionChange={setBottomSection} />
    </div>
  );
}

export default TradingDeskLayout;
