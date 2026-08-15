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

import React, { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { getWorkshop } from "@/lib/bff-v1/agora/workshops";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsNarrowViewport } from "./responsive";
import "./responsive.css";

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
  triggerRef,
}: {
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
}) {
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
        ref={triggerRef}
        aria-label={drawerOpen ? "Close servant drawer" : "Open servant drawer"}
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
      className="flex h-10 shrink-0 items-end gap-0 overflow-x-auto border-b border-[#2a2e38] bg-[#171b22] px-4"
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
                ? "border-b-2 border-[#e8b750] text-[#e8b750]"
                : "text-[#8c96a6] hover:text-[#f0ece4]",
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
  isNarrow,
  onOpenChange,
  triggerRef,
}: {
  open: boolean;
  workshopId?: string;
  isNarrow: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
}) {
  const contextState = useServantWorkshopContext(workshopId);

  const context = (
    <div className="flex-1 overflow-auto p-3" data-testid="servant-drawer-context">
      {!workshopId && (
        <p className="text-xs text-[#737d8e]">
          Servant panel — open a strategy workshop session for contextual state.
        </p>
      )}
      {workshopId && contextState.status === "loading" && (
        <p className="text-xs text-[#737d8e]">Loading workshop context…</p>
      )}
      {workshopId && contextState.status === "error" && (
        <p className="text-xs text-[#f87171]" role="alert">
          Workshop context unavailable: {contextState.message}
        </p>
      )}
      {workshopId && contextState.status === "loaded" && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-[#f0ece4]">
            {contextState.workshop.subject?.title ?? contextState.workshop.subject?.ref}
          </p>
          <p className="text-xs text-[#8c96a6]">Status: {contextState.workshop.status}</p>
          {typeof contextState.workshop.message_count === "number" && (
            <p className="text-xs text-[#8c96a6]">
              Messages: {contextState.workshop.message_count}
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (isNarrow) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          aria-describedby="servant-drawer-description"
          aria-label="Servant drawer"
          className="agora-narrow-drawer flex h-[100dvh] w-full max-w-none flex-col gap-0 border-l border-[#2a2e38] bg-[#171b22] p-0 text-[#f0ece4] sm:max-w-none"
          data-testid="trading-desk-servant-drawer"
          onCloseAutoFocus={(event) => {
            if (triggerRef.current?.isConnected) {
              event.preventDefault();
              triggerRef.current.focus();
            }
          }}
          side="right"
        >
          <div className="flex min-h-12 shrink-0 items-center border-b border-[#2a2e38] px-4 pr-14">
            <SheetTitle className="text-xs font-semibold uppercase tracking-wide text-[#e8b750]">
              Servant
            </SheetTitle>
            <SheetDescription className="sr-only" id="servant-drawer-description">
              Contextual task, decision, and workshop status.
            </SheetDescription>
            {workshopId && (
              <span className="ml-auto font-mono text-xs text-[#737d8e]">
                {workshopId.slice(0, 8)}…
              </span>
            )}
          </div>
          {context}
        </SheetContent>
      </Sheet>
    );
  }

  if (!open) return null;

  return (
    <aside
      aria-label="Servant drawer"
      className="flex w-80 shrink-0 flex-col border-l border-[#2a2e38] bg-[#171b22]"
      data-testid="trading-desk-servant-drawer"
    >
      <div className="flex h-10 shrink-0 items-center border-b border-[#2a2e38] px-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#e8b750]">
          Servant
        </span>
        {workshopId && (
          <span className="ml-auto font-mono text-xs text-[#737d8e]">
            {workshopId.slice(0, 8)}…
          </span>
        )}
      </div>
      {context}
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
  const isNarrow = useIsNarrowViewport();
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const mainRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mainRegion = mainRegionRef.current;
    if (!mainRegion) return;
    if (isNarrow && drawerOpen) {
      mainRegion.setAttribute("inert", "");
      mainRegion.setAttribute("aria-hidden", "true");
    } else {
      mainRegion.removeAttribute("inert");
      mainRegion.removeAttribute("aria-hidden");
    }
    return () => {
      mainRegion.removeAttribute("inert");
      mainRegion.removeAttribute("aria-hidden");
    };
  }, [drawerOpen, isNarrow]);

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
      data-viewport={isNarrow ? "mobile" : "desktop"}
    >
      <CommandBar
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen((v) => !v)}
        triggerRef={drawerTriggerRef}
      />

      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="flex min-h-0 flex-1 overflow-hidden" ref={mainRegionRef}>
        <main
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
          data-testid="trading-desk-main"
          id="trading-desk-content"
        >
          <Outlet />
        </main>

        <ServantDrawer
          isNarrow={isNarrow}
          onOpenChange={setDrawerOpen}
          open={drawerOpen}
          triggerRef={drawerTriggerRef}
          workshopId={servantWorkshopId}
        />
      </div>

      <BottomStrip activeSection={bottomSection} onSectionChange={setBottomSection} />
    </div>
  );
}

export default TradingDeskLayout;
