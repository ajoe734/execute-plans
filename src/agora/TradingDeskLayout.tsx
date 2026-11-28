// TradingDeskShell — tab-based Agora shell for the three main trading sections.
//
// Structure per V6 §2 and IA 05 (contract-closure/05_execute_plans_agora_ui_ia_and_dependencies.md):
//
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │  Top Header: AGORA · 交易員名稱與風格 · 市場狀態 · 交易僕人狀態 · 登出 │
//   │  CommandBar: 交代僕人 input (context-aware) + 10 V6 §2.3 quick tasks │
//   ├─────────────────────────────────────────────────────────────────────┤
//   │  TabBar  (交易操盤室 | 策略工坊 | 策略執行與績效)                     │
//   ├───────────────────────────────────────────────────┬─────────────────┤
//   │                                                   │                 │
//   │  <Outlet />  (active tab page)                    │ ServantDrawer   │
//   │                                                   │ (right, slide)  │
//   └───────────────────────────────────────────────────┴─────────────────┘
//
// Routes (§10 IA):
//   /agora/trading-room          交易操盤室
//   /agora/strategy-workshop     策略工坊
//   /agora/strategy-performance  策略執行與績效

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { BffError } from "@/lib/bff-v1/errors";
import { getWorkshop } from "@/lib/bff-v1/agora/workshops";
import { agoraIdentityClient, type AgoraTraderIdentity } from "@/lib/bff-v1/agora/identity";
import {
  buildServantContextAttachmentRefs,
  createServantSession,
  formatServantDisplayName,
  getServantSessionStream,
  sendServantSessionMessage,
  type ServantCitation,
  type ServantClarificationCard,
  type ServantClarificationOption,
  type ServantCommandContext,
  type ServantProfile,
} from "@/lib/bff-v1/agora/servant";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import "./i18n";
import { useIsNarrowViewport } from "./responsive";
import { useAgoraWriteAccess } from "./useAgoraWriteAccess";
import { useServantStatus, type ServantStatusState } from "./useServantStatus";
import {
  ExpertReviewGlobalDrawer,
  JournalReplayGlobalDrawer,
  LayoutAdjustmentGlobalDrawer,
  PersonalizationGlobalDrawer,
  ServantSessionTasksSection,
  ShadowGlobalDrawer,
  type GlobalDrawerId,
  type ServantSessionTaskItem,
} from "./drawers/GlobalDrawers";
import { ServantCorrectionSection } from "./drawers/ServantCorrectionSection";
import "./responsive.css";

// ─── Tab definitions (V6 §2.1 & IA 05: only three visible zh-TW main tabs) ────

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
    labelKey: "agora.shell.tabs.tradingRoom",
    path: "/agora/trading-room",
  },
  {
    id: "strategy-workshop",
    labelKey: "agora.shell.tabs.strategyWorkshop",
    path: "/agora/strategy-workshop",
  },
  {
    id: "strategy-performance",
    labelKey: "agora.shell.tabs.strategyPerformance",
    path: "/agora/strategy-performance",
  },
];

const TAB_PLACEHOLDER_KEYS: Record<AgoraTab, string> = {
  "trading-room": "agora.shell.command.placeholder.trading-room",
  "strategy-workshop": "agora.shell.command.placeholder.strategy-workshop",
  "strategy-performance": "agora.shell.command.placeholder.strategy-performance",
};

const V6_QUICK_TASK_KEYS = [
  "agora.shell.command.shortcuts.createStrategyLens",
  "agora.shell.command.shortcuts.generateCandidatePool",
  "agora.shell.command.shortcuts.analyzeBranches",
  "agora.shell.command.shortcuts.findLaggards",
  "agora.shell.command.shortcuts.compareStocks",
  "agora.shell.command.shortcuts.checkEntryConditions",
  "agora.shell.command.shortcuts.checkExitConditions",
  "agora.shell.command.shortcuts.rearrangeCurrentView",
  "agora.shell.command.shortcuts.addChart",
  "agora.shell.command.shortcuts.sendToShadow",
] as const;

function safeResolveFn<T>(getter: () => T): T | null {
  try {
    const fn = getter();
    return typeof fn === "function" ? fn : null;
  } catch {
    return null;
  }
}

function tabFromPath(pathname: string): AgoraTab {
  if (
    pathname === "/agora/strategy-workshop" ||
    pathname.startsWith("/agora/strategy-workshop/") ||
    pathname === "/agora/committee" ||
    pathname.startsWith("/agora/committee/")
  ) {
    return "strategy-workshop";
  }
  if (
    pathname === "/agora/strategy-performance" ||
    pathname.startsWith("/agora/strategy-performance/")
  ) {
    return "strategy-performance";
  }
  return "trading-room";
}

// ─── Servant status helpers ───────────────────────────────────────────────────

const SERVANT_STATUS_LABEL_KEYS: Record<string, string> = {
  active: "agora.shell.servant.statusLabels.active",
  suspended: "agora.shell.servant.statusLabels.suspended",
  paper_only: "agora.shell.servant.statusLabels.paper_only",
  shadow_only: "agora.shell.servant.statusLabels.shadow_only",
  retired: "agora.shell.servant.statusLabels.retired",
};

function servantStatusText(state: ServantStatusState, t: TFunction): string {
  if (state.kind === "loading") return t("agora.shell.servant.statusLoading");
  if (state.kind === "missing") return t("agora.shell.servant.statusMissing");
  if (state.kind === "error") return t("agora.shell.servant.statusError");
  const key = SERVANT_STATUS_LABEL_KEYS[state.servant.status];
  return key ? t(key) : state.servant.status;
}

function servantCapabilityText(servant: ServantProfile, t: TFunction): string {
  const caps = servant.capability_summary;
  const labels = [
    caps?.can_ask && t("agora.shell.servant.capabilityLabels.ask"),
    caps?.can_research && t("agora.shell.servant.capabilityLabels.research"),
    caps?.can_workshop && t("agora.shell.servant.capabilityLabels.workshop"),
    caps?.can_shadow && t("agora.shell.servant.capabilityLabels.shadow"),
  ].filter((label): label is string => Boolean(label));
  return labels.length > 0 ? labels.join("、") : t("agora.shell.servant.capabilityLabels.none");
}

function ServantProfileSummary({ state }: { state: ServantStatusState }) {
  const { t } = useTranslation();
  if (state.kind === "error") {
    return (
      <p className="text-xs text-[#f87171]" role="alert">
        {t("agora.shell.servant.profileReadError", { message: state.message })}
      </p>
    );
  }
  if (state.kind !== "ready") {
    return (
      <p className="text-xs text-[#737d8e]">
        {t("agora.shell.servant.label")}：{servantStatusText(state, t)}
      </p>
    );
  }
  const { servant } = state;
  const safeDisplayName = formatServantDisplayName(
    servant.display_name,
    t("agora.shell.header.servantDefaultName"),
  );
  const statusText = servantStatusText(state, t);
  return (
    <div className="mb-3 flex flex-col gap-1 text-xs text-[#8c96a6]" data-testid="servant-profile">
      <p className="text-sm font-medium text-[#f0ece4]">{safeDisplayName}</p>
      <p>{t("agora.shell.servant.profileStatusLine", { status: statusText })}</p>
      <p className="font-mono">{servant.persona_id}</p>
      <p>{t("agora.shell.servant.profileTypeLine")}</p>
      <p>
        {servant.last_active_at
          ? t("agora.shell.servant.profileReadinessActive", {
              status: statusText,
              lastActiveAt: servant.last_active_at,
            })
          : t("agora.shell.servant.profileReadinessIdle", { status: statusText })}
      </p>
      <p data-testid="servant-capabilities">
        {t("agora.shell.servant.profileCapabilitiesLine", {
          capabilities: servantCapabilityText(servant, t),
        })}
      </p>
      <p>
        {t("agora.shell.servant.profilePolicyLine", {
          authority: servant.policy.execution_authority,
        })}
      </p>
    </div>
  );
}

// ─── Servant command task types ───────────────────────────────────────────────

export type ServantCommandStatus = "submitting" | "completed" | "degraded" | "error";

const COMMAND_STATUS_LABEL_KEYS: Record<ServantCommandStatus, string> = {
  submitting: "agora.shell.command.status.submitting",
  completed: "agora.shell.command.status.completed",
  degraded: "agora.shell.command.status.degraded",
  error: "agora.shell.command.status.error",
};

export interface ServantCommandTask {
  id: string;
  instruction: string;
  context: ServantCommandContext;
  status: ServantCommandStatus;
  sessionId?: string;
  messageId?: string;
  reply?: string;
  error?: string;
  citations?: ServantCitation[];
  clarification?: ServantClarificationCard | null;
  statedAssumptions?: string[];
  selectedClarificationOptionId?: string | null;
  selectedClarificationLabel?: string | null;
}

// ─── CommandBar (Header + Persistent 交代僕人 Command Bar + 10 Quick Tasks) ───

interface CommandBarProps {
  activeDrawer: GlobalDrawerId | null;
  activeTab: AgoraTab;
  command: string;
  commandEnabled: boolean;
  context: ServantCommandContext;
  disabledReason: string | null;
  marketState: string;
  onCommandChange: (value: string) => void;
  onQuickTask: (instruction: string) => void;
  onSubmit: () => void;
  onToggleDrawer: (drawer: GlobalDrawerId) => void;
  servant: ReturnType<typeof useServantStatus>;
  submitting: boolean;
  traderDisplayName: string;
  traderStyle: string;
  triggerRef: React.RefObject<HTMLButtonElement>;
}

function CommandBar({
  activeDrawer,
  activeTab,
  command,
  commandEnabled,
  context,
  disabledReason,
  marketState,
  onCommandChange,
  onQuickTask,
  onSubmit,
  onToggleDrawer,
  servant,
  submitting,
  traderDisplayName,
  traderStyle,
  triggerRef,
}: CommandBarProps) {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const { interactionAllowed } = useAgoraWriteAccess();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (error: unknown) {
      if (error instanceof BffError && error.status === 401) return;
      toast.error(
        t("agora.shell.header.signOutError", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setSigningOut(false);
    }
  };

  const servantDisplayName =
    servant.state.kind === "ready"
      ? formatServantDisplayName(
          servant.state.servant.display_name,
          t("agora.shell.header.servantDefaultName"),
        )
      : null;

  const pageLabel = t(
    TABS.find((item) => item.id === activeTab)?.labelKey ?? "agora.shell.tabs.tradingRoom",
  );

  const servantDrawerOpen = activeDrawer === "servant";
  const shadowDrawerOpen = activeDrawer === "shadow";
  const journalDrawerOpen = activeDrawer === "journal";
  const expertReviewDrawerOpen = activeDrawer === "expert-review";
  const layoutDrawerOpen = activeDrawer === "layout";
  const personalizationDrawerOpen = activeDrawer === "personalization";

  return (
    <header
      className="flex shrink-0 flex-col gap-2 border-b border-[#2a2e38] bg-[#1a1d23] px-4 py-2 min-w-0 max-w-full overflow-hidden"
      data-testid="trading-desk-command-bar"
    >
      {/* Top row: Brand · Trader Name & Style · Market State · 6 Global Drawers · Servant State · zh-TW Sign Out */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#e8b750] text-xs font-black text-[#1a1410]">
            A
          </span>
          <span className="text-sm font-bold tracking-wide text-[#f0ece4]">
            {t("agora.shell.header.brand")}
          </span>
        </div>

        <div
          className="flex min-w-0 items-center gap-1.5 rounded-md border border-[#2a2e38] bg-[#14171d] px-2.5 py-1 text-xs text-[#f0ece4]"
          data-testid="trading-desk-operator-context"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#43cf94]" />
          <span className="truncate font-semibold" data-testid="trader-display-name">
            {traderDisplayName}
          </span>
          <span aria-hidden="true" className="text-[#737d8e]">
            ·
          </span>
          <span className="truncate text-[#c5cad2]" data-testid="trader-style">
            {traderStyle}
          </span>
        </div>

        <div
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-[#2a2e38] bg-[#14171d] px-2.5 py-1 text-xs text-[#c5cad2]"
          data-testid="trading-desk-market-state"
        >
          <span className="text-[#8c96a6]">{t("agora.shell.header.marketStateLabel")}：</span>
          <span className="font-medium text-[#f0ece4]">{marketState}</span>
        </div>

        <span className="flex-1" />

        <div
          aria-label={t("agora.drawers.toolbar.ariaLabel")}
          className="flex shrink-0 flex-wrap items-center gap-1.5"
          data-testid="trading-desk-global-drawers"
          role="toolbar"
        >
          <div className="flex shrink-0 flex-wrap items-center gap-1.5" data-testid="trading-desk-servant-state">
            <button
              ref={triggerRef}
              aria-label={t(servantDrawerOpen ? "agora.shell.servant.close" : "agora.shell.servant.open")}
              aria-pressed={servantDrawerOpen}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                servantDrawerOpen
                  ? "border-[rgba(232,183,80,0.35)] bg-[rgba(232,183,80,0.12)] text-[#e8b750]"
                  : "border-[#2a2e38] bg-transparent text-[#c5cad2] hover:bg-[#171b22]",
              )}
              data-testid="global-drawer-trigger-servant"
              onClick={() => onToggleDrawer("servant")}
              type="button"
            >
              <span aria-hidden="true" className="h-3.5 w-3.5 select-none">
                {servantDrawerOpen ? "✕" : "⚡"}
              </span>
              <span>{t("agora.drawers.toolbar.servantTasks")}</span>
              {servantDisplayName && (
                <span className="text-[#e8b750]" data-testid="servant-display-name">
                  · {servantDisplayName}
                </span>
              )}
            </button>

            <span
              className="text-xs text-[#8c96a6]"
              data-testid="servant-status"
              role={servant.state.kind === "error" ? "alert" : undefined}
            >
              {servantStatusText(servant.state, t)}
            </span>

            {servant.state.kind === "missing" && interactionAllowed && (
              <button
                className="inline-flex h-8 shrink-0 items-center rounded-md border border-[rgba(232,183,80,0.35)] px-2.5 text-xs font-medium text-[#e8b750] disabled:opacity-60"
                disabled={servant.creating}
                onClick={() => void servant.create()}
                type="button"
              >
                {t("agora.shell.header.createServant")}
              </button>
            )}
            {servant.createError && (
              <span className="text-xs text-[#f87171]" role="alert">
                {servant.createError}
              </span>
            )}
          </div>

          <button
            aria-label={t(shadowDrawerOpen ? "agora.drawers.toolbar.closeShadow" : "agora.drawers.toolbar.openShadow")}
            aria-pressed={shadowDrawerOpen}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-md border px-2.5 text-xs font-medium transition-colors",
              shadowDrawerOpen
                ? "border-[rgba(232,183,80,0.35)] bg-[rgba(232,183,80,0.12)] text-[#e8b750]"
                : "border-[#2a2e38] bg-transparent text-[#c5cad2] hover:bg-[#171b22]",
            )}
            data-testid="global-drawer-trigger-shadow"
            onClick={() => onToggleDrawer("shadow")}
            type="button"
          >
            {t("agora.drawers.toolbar.shadow")}
          </button>

          <button
            aria-label={t(journalDrawerOpen ? "agora.drawers.toolbar.closeJournal" : "agora.drawers.toolbar.openJournal")}
            aria-pressed={journalDrawerOpen}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-md border px-2.5 text-xs font-medium transition-colors",
              journalDrawerOpen
                ? "border-[rgba(232,183,80,0.35)] bg-[rgba(232,183,80,0.12)] text-[#e8b750]"
                : "border-[#2a2e38] bg-transparent text-[#c5cad2] hover:bg-[#171b22]",
            )}
            data-testid="global-drawer-trigger-journal"
            onClick={() => onToggleDrawer("journal")}
            type="button"
          >
            {t("agora.drawers.toolbar.journal")}
          </button>

          <button
            aria-label={t(
              expertReviewDrawerOpen
                ? "agora.drawers.toolbar.closeExpertReview"
                : "agora.drawers.toolbar.openExpertReview",
            )}
            aria-pressed={expertReviewDrawerOpen}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-md border px-2.5 text-xs font-medium transition-colors",
              expertReviewDrawerOpen
                ? "border-[rgba(232,183,80,0.35)] bg-[rgba(232,183,80,0.12)] text-[#e8b750]"
                : "border-[#2a2e38] bg-transparent text-[#c5cad2] hover:bg-[#171b22]",
            )}
            data-testid="global-drawer-trigger-expert-review"
            onClick={() => onToggleDrawer("expert-review")}
            type="button"
          >
            {t("agora.drawers.toolbar.expertReview")}
          </button>

          <button
            aria-label={t(layoutDrawerOpen ? "agora.drawers.toolbar.closeLayout" : "agora.drawers.toolbar.openLayout")}
            aria-pressed={layoutDrawerOpen}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-md border px-2.5 text-xs font-medium transition-colors",
              layoutDrawerOpen
                ? "border-[rgba(232,183,80,0.35)] bg-[rgba(232,183,80,0.12)] text-[#e8b750]"
                : activeTab !== "trading-room"
                  ? "border-[#2a2e38] bg-transparent text-[#737d8e] hover:bg-[#171b22]"
                  : "border-[#2a2e38] bg-transparent text-[#c5cad2] hover:bg-[#171b22]",
            )}
            data-disabled-outside-trading-room={activeTab !== "trading-room" ? "true" : "false"}
            data-testid="global-drawer-trigger-layout"
            onClick={() => onToggleDrawer("layout")}
            title={
              activeTab !== "trading-room"
                ? t("agora.drawers.layout.disabledOutsideTradingRoom")
                : undefined
            }
            type="button"
          >
            {t("agora.drawers.toolbar.layout")}
          </button>

          <button
            aria-label={t(
              personalizationDrawerOpen
                ? "agora.drawers.toolbar.closePersonalization"
                : "agora.drawers.toolbar.openPersonalization",
            )}
            aria-pressed={personalizationDrawerOpen}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-md border px-2.5 text-xs font-medium transition-colors",
              personalizationDrawerOpen
                ? "border-[rgba(232,183,80,0.35)] bg-[rgba(232,183,80,0.12)] text-[#e8b750]"
                : "border-[#2a2e38] bg-transparent text-[#c5cad2] hover:bg-[#171b22]",
            )}
            data-testid="global-drawer-trigger-personalization"
            onClick={() => onToggleDrawer("personalization")}
            type="button"
          >
            {t("agora.drawers.toolbar.personalization")}
          </button>
        </div>

        <button
          aria-label={t("agora.shell.header.signOut")}
          className="inline-flex h-8 shrink-0 items-center rounded-md border border-[#2a2e38] bg-transparent px-2.5 text-xs font-medium text-[#c5cad2] transition-colors hover:bg-[#171b22] hover:text-[#f0ece4] disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="trading-desk-sign-out"
          disabled={signingOut}
          onClick={() => void handleSignOut()}
          type="button"
        >
          {t("agora.shell.header.signOut")}
        </button>
      </div>

      {/* Persistent 交代僕人 Command Input Row */}
      <form
        className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-[#2a2e38] bg-[#14171d] px-2.5 py-1.5"
        data-testid="trading-desk-command-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <span className="shrink-0 rounded bg-[rgba(232,183,80,0.16)] px-2 py-0.5 text-xs font-bold text-[#e8b750]">
          {t("agora.shell.command.label")}
        </span>
        <div
          className="hidden items-center gap-1.5 text-[11px] text-[#8c96a6] md:flex"
          data-testid="trading-desk-command-context"
        >
          <span>
            {t("agora.shell.context.pageLabel")}：{pageLabel}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t("agora.shell.context.strategyLabel")}：
            {context.strategy ?? t("agora.shell.context.strategyNone")}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t("agora.shell.context.widgetLabel")}：
            {context.selectedWidget ?? t("agora.shell.context.widgetNone")}
          </span>
        </div>
        <input
          aria-describedby={disabledReason ? "trading-desk-command-disabled-reason" : undefined}
          aria-label={t("agora.shell.command.input")}
          className="min-w-[140px] flex-1 bg-transparent text-xs text-[#f0ece4] outline-none placeholder:text-[#737d8e] disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="trading-desk-command-input"
          disabled={!commandEnabled || submitting}
          onChange={(event) => onCommandChange(event.target.value)}
          placeholder={t(TAB_PLACEHOLDER_KEYS[activeTab])}
          title={disabledReason ?? undefined}
          type="text"
          value={command}
        />
        <button
          className="inline-flex h-7 shrink-0 items-center rounded bg-[#e8b750] px-3 text-xs font-bold text-[#1a1410] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="trading-desk-command-submit"
          disabled={!commandEnabled || submitting || !command.trim()}
          type="submit"
        >
          {submitting ? t("agora.shell.command.submitting") : t("agora.shell.command.submit")}
        </button>
      </form>

      {disabledReason && (
        <p
          className="m-0 text-xs text-[#e8b750]"
          data-testid="trading-desk-command-disabled-reason"
          id="trading-desk-command-disabled-reason"
        >
          {disabledReason}
        </p>
      )}

      {/* Ten V6 §2.3 Quick Tasks */}
      <div
        aria-label={t("agora.shell.command.shortcutsLabel")}
        className="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-0.5"
        data-testid="trading-desk-quick-tasks"
      >
        <span className="shrink-0 text-[11px] font-medium text-[#8c96a6]">
          {t("agora.shell.command.shortcutsLabel")}：
        </span>
        {V6_QUICK_TASK_KEYS.map((shortcutKey) => {
          const label = t(shortcutKey);
          return (
            <button
              className="shrink-0 rounded-full border border-[#2a2e38] bg-[#14171d] px-2.5 py-0.5 text-xs text-[#c5cad2] transition-colors hover:border-[rgba(232,183,80,0.45)] hover:text-[#e8b750] disabled:cursor-not-allowed disabled:opacity-50"
              data-testid={`quick-task-${shortcutKey.split(".").pop()}`}
              disabled={!commandEnabled || submitting}
              key={shortcutKey}
              onClick={() => onQuickTask(label)}
              type="button"
            >
              {label}
            </button>
          );
        })}
      </div>
    </header>
  );
}

// ─── TabBar (Three Chinese Main Pages Only) ───────────────────────────────────

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
            className={cn(
              "relative -mb-px flex h-9 shrink-0 items-center px-4 text-sm font-medium transition-colors",
              isActive
                ? "border-b-2 border-[#e8b750] text-[#e8b750]"
                : "text-[#8c96a6] hover:text-[#f0ece4]",
            )}
            data-testid={`trading-desk-tab-${tab.id}`}
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

function useServantWorkshopContext(workshopId: string | undefined, open: boolean): ServantWorkshopState {
  const { t } = useTranslation();
  const [state, setState] = useState<ServantWorkshopState>({ status: "idle" });

  useEffect(() => {
    if (!workshopId || !open) {
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
            message: err instanceof Error ? err.message : t("agora.shell.command.failed"),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workshopId, open, t]);

  return state;
}

function ServantDrawer({
  activeTab,
  commandDisabledReason,
  commandSubmitting,
  context,
  isNarrow,
  onOpenChange,
  onOpenOptionalPersonaConsult,
  onSelectClarificationOption,
  onSubmitCommand,
  open,
  servantState,
  tasks,
  trainerActive,
  triggerRef,
  workshopId,
}: {
  activeTab: AgoraTab;
  commandDisabledReason: string | null;
  commandSubmitting: boolean;
  context: ServantCommandContext;
  isNarrow: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenOptionalPersonaConsult: () => void;
  onSelectClarificationOption: (
    task: ServantCommandTask,
    card: ServantClarificationCard,
    option: ServantClarificationOption,
  ) => Promise<void>;
  onSubmitCommand: (text: string) => Promise<void>;
  open: boolean;
  servantState: ServantStatusState;
  tasks: ServantCommandTask[];
  trainerActive: boolean;
  triggerRef: React.RefObject<HTMLButtonElement>;
  workshopId?: string;
}) {
  const { t } = useTranslation();
  const contextState = useServantWorkshopContext(workshopId, open);
  const pageLabel = t(
    TABS.find((item) => item.id === activeTab)?.labelKey ?? "agora.shell.tabs.tradingRoom",
  );
  const servantPersonaId =
    servantState.kind === "ready" ? servantState.servant.persona_id : null;
  const servantDisplayName =
    servantState.kind === "ready"
      ? formatServantDisplayName(
          servantState.servant.display_name,
          t("agora.shell.header.servantDefaultName"),
        )
      : t("agora.shell.header.servantDefaultName");
  const defaultSubjectRef = context.strategy
    ? `strategy:${context.strategy}`
    : `page:${activeTab}`;

  const sessionTaskItems: ServantSessionTaskItem[] = tasks.map((task) => ({
    id: task.id,
    command: task.instruction,
    status: task.status,
    sessionId: task.sessionId ?? null,
    answer: task.reply ?? null,
    errorMessage: task.error ?? null,
    contextSnapshot: task.context,
  }));

  const drawerBody = (
    <div className="flex-1 overflow-auto p-3 space-y-3" data-testid="servant-drawer-context">
      <ServantProfileSummary state={servantState} />

      <section
        className="rounded-md border border-[#2a2e38] bg-[#14171d] p-2.5 text-xs text-[#c5cad2]"
        data-testid="servant-current-context"
      >
        <p className="mb-1 text-[11px] font-semibold text-[#e8b750]">
          {t("agora.shell.servant.currentContext")}
        </p>
        <p>
          {t("agora.shell.context.pageLabel")}：{pageLabel}
        </p>
        <p>
          {t("agora.shell.context.strategyLabel")}：
          {context.strategy ?? t("agora.shell.context.strategyNone")}
        </p>
        <p>
          {t("agora.shell.context.widgetLabel")}：
          {context.selectedWidget ?? t("agora.shell.context.widgetNone")}
        </p>
        {workshopId && (
          <p className="font-mono text-[11px] text-[#8c96a6]">
            {t("agora.shell.servant.workshopId", { id: workshopId })}
          </p>
        )}
      </section>

      {!workshopId && (
        <p className="text-xs text-[#737d8e]">{t("agora.shell.servant.empty")}</p>
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
            {contextState.workshop.subject?.title ??
              contextState.workshop.subject?.ref ??
              t("agora.shell.context.workshopFallback", { id: workshopId.slice(0, 8) })}
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

      <section className="space-y-2 border-t border-[#2a2e38] pt-3" data-testid="servant-command-history">
        <p className="text-xs font-semibold text-[#e8b750]">
          {t("agora.shell.servant.currentTask")}
        </p>
        {tasks.length === 0 ? (
          <p className="text-xs text-[#737d8e]">{t("agora.shell.servant.noTasks")}</p>
        ) : (
          tasks.map((task) => (
            <div
              className="space-y-1.5 rounded-md border border-[#2a2e38] bg-[#14171d] p-2.5 text-xs"
              data-testid="servant-command-task"
              key={task.id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[#f0ece4]" data-testid="servant-command-instruction">
                  {task.instruction}
                </span>
                <span className="shrink-0 text-[11px] text-[#e8b750]" data-testid="servant-command-status">
                  {t(COMMAND_STATUS_LABEL_KEYS[task.status])}
                </span>
              </div>
              <p className="text-[11px] text-[#8c96a6]" data-testid="servant-command-context">
                {t("agora.shell.context.pageLabel")}：{task.context.page} ·{" "}
                {t("agora.shell.context.strategyLabel")}：
                {task.context.strategy ?? t("agora.shell.context.strategyNone")} ·{" "}
                {t("agora.shell.context.widgetLabel")}：
                {task.context.selectedWidget ?? t("agora.shell.context.widgetNone")}
              </p>
              {task.sessionId && (
                <p className="font-mono text-[10px] text-[#737d8e]" data-testid="servant-command-session">
                  {t("agora.shell.servant.sessionId", { id: task.sessionId })}
                </p>
              )}
              {task.reply && (
                <p className="whitespace-pre-wrap text-xs text-[#f0ece4]" data-testid="servant-command-reply">
                  {task.reply}
                </p>
              )}
              {task.statedAssumptions && task.statedAssumptions.length > 0 && (
                <div
                  className="rounded border border-[#2a2e38] bg-[#12161f] p-2 text-[11px] text-[#c5cad2]"
                  data-testid="servant-stated-assumptions"
                >
                  <p className="font-semibold text-[#e8b750]">
                    {t("agora.shell.servant.statedAssumptionsTitle")}
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {task.statedAssumptions.map((assumption, idx) => (
                      <li key={`${task.id}-assumption-${idx}`}>{assumption}</li>
                    ))}
                  </ul>
                </div>
              )}
              {task.citations && task.citations.length > 0 && (
                <div
                  className="rounded border border-[#2a2e38] bg-[#12161f] p-2 text-[11px] text-[#c5cad2]"
                  data-testid="servant-answer-citations"
                >
                  <p className="font-semibold text-[#e8b750]">
                    {t("agora.shell.servant.citationsTitle")}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {task.citations.map((citation, idx) => (
                      <li
                        className="font-mono text-[10px] text-[#8c96a6]"
                        data-testid="servant-citation-item"
                        key={`${task.id}-citation-${idx}`}
                      >
                        {t("agora.shell.servant.citationLine", {
                          source: citation.source,
                          asOf: citation.as_of,
                          freshness: citation.freshness,
                        })}
                        {citation.detail ? ` · ${citation.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {task.clarification && (
                <div
                  className="space-y-1.5 rounded border border-[rgba(232,183,80,0.4)] bg-[#171b22] p-2.5 text-xs"
                  data-testid="servant-clarification-card"
                >
                  <p className="text-[11px] font-semibold text-[#e8b750]">
                    {t("agora.shell.servant.clarificationTitle")}
                  </p>
                  <p className="font-medium text-[#f0ece4]" data-testid="servant-clarification-question">
                    {task.clarification.question}
                  </p>
                  {task.clarification.why_it_matters && (
                    <p className="text-[11px] text-[#c5cad2]" data-testid="servant-clarification-why">
                      {t("agora.shell.servant.clarificationWhy", {
                        why: task.clarification.why_it_matters,
                      })}
                    </p>
                  )}
                  {task.clarification.servant_default && (
                    <p className="text-[11px] text-[#8c96a6]" data-testid="servant-clarification-default">
                      {t("agora.shell.servant.clarificationDefault", {
                        defaultChoice: task.clarification.servant_default,
                      })}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1" data-testid="servant-clarification-options">
                    {task.clarification.options.map((opt) => {
                      const isSelected = task.selectedClarificationOptionId === opt.option_id;
                      const card = task.clarification!;
                      return (
                        <button
                          aria-pressed={isSelected}
                          className={cn(
                            "rounded border px-2.5 py-1 text-left text-[11px] font-medium transition-colors",
                            isSelected
                              ? "border-[#e8b750] bg-[rgba(232,183,80,0.18)] text-[#e8b750]"
                              : "border-[#2a2e38] bg-[#12161f] text-[#f0ece4] hover:border-[#e8b750]",
                          )}
                          data-testid={`servant-clarification-option-${opt.option_id}`}
                          disabled={commandSubmitting}
                          key={opt.option_id}
                          onClick={() => void onSelectClarificationOption(task, card, opt)}
                          type="button"
                        >
                          <span>{opt.label}</span>
                          {opt.description ? (
                            <span className="block text-[10px] text-[#8c96a6]">{opt.description}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {task.selectedClarificationLabel && (
                    <p
                      className="text-[11px] font-medium text-[#43cf94]"
                      data-testid="servant-clarification-selected"
                    >
                      {t("agora.shell.servant.clarificationSelected", {
                        label: task.selectedClarificationLabel,
                      })}
                    </p>
                  )}
                </div>
              )}
              {task.error && (
                <p className="text-xs text-[#f87171]" data-testid="servant-command-error" role="alert">
                  {task.error}
                </p>
              )}
              <p className="text-[10px] text-[#43cf94]">{t("agora.shell.servant.noWriteProof")}</p>
            </div>
          ))
        )}
      </section>

      <section
        className="space-y-1.5 rounded-md border border-[#2a2e38] bg-[#14171d] p-2.5 text-xs"
        data-testid="servant-optional-persona-consult-control"
      >
        <p className="text-[11px] font-semibold text-[#c5cad2]">
          {t("agora.shell.servant.optionalPersonaConsultTitle")}
        </p>
        <p className="text-[11px] leading-relaxed text-[#8c96a6]">
          {t("agora.shell.servant.optionalPersonaConsultHint")}
        </p>
        <button
          className="inline-flex items-center rounded border border-[#2a2e38] bg-[#171b22] px-2.5 py-1 text-[11px] font-medium text-[#c5cad2] hover:border-[#e8b750] hover:text-[#e8b750]"
          data-testid="servant-open-optional-persona-consult"
          onClick={onOpenOptionalPersonaConsult}
          type="button"
        >
          {t("agora.shell.servant.optionalPersonaConsultButton")}
        </button>
      </section>

      {open && (
        <>
          <ServantSessionTasksSection
            commandDisabledReason={commandDisabledReason}
            commandSubmitting={commandSubmitting}
            onSubmitCommand={onSubmitCommand}
            tasks={sessionTaskItems}
          />
          <ServantCorrectionSection
            defaultSubjectRef={defaultSubjectRef}
            servantDisplayName={servantDisplayName}
            servantPersonaId={servantPersonaId}
            trainerActive={trainerActive}
          />
        </>
      )}
    </div>
  );

  if (isNarrow) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          aria-describedby="servant-drawer-description"
          aria-label={t("agora.shell.servant.drawer")}
          className="dark agora-narrow-drawer flex h-[100dvh] w-full max-w-none flex-col gap-0 border-l border-[#2a2e38] bg-[#171b22] p-0 text-[#f0ece4] sm:max-w-none"
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
              {t("agora.shell.servant.drawer")}
            </SheetTitle>
            <SheetDescription className="sr-only" id="servant-drawer-description">
              {t("agora.shell.servant.drawerDescription")}
            </SheetDescription>
            {workshopId && (
              <span className="ml-auto font-mono text-xs text-[#737d8e]">
                {workshopId.slice(0, 8)}…
              </span>
            )}
          </div>
          {drawerBody}
        </SheetContent>
      </Sheet>
    );
  }

  if (!open) return null;

  return (
    <aside
      aria-label={t("agora.shell.servant.drawer")}
      className="flex w-80 shrink-0 flex-col border-l border-[#2a2e38] bg-[#171b22]"
      data-testid="trading-desk-servant-drawer"
    >
      <div className="flex h-10 shrink-0 items-center border-b border-[#2a2e38] px-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#e8b750]">
          {t("agora.shell.servant.drawer")}
        </span>
        {workshopId && (
          <span className="ml-auto font-mono text-xs text-[#737d8e]">
            {workshopId.slice(0, 8)}…
          </span>
        )}
      </div>
      {drawerBody}
    </aside>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────

function resolveDrawerRequest(raw: unknown): {
  drawer: GlobalDrawerId;
  trainerActive: boolean;
} | null {
  if (typeof raw !== "string") return null;
  const clean = raw.trim().toLowerCase();
  if (clean === "servant" || clean === "ask") {
    return { drawer: "servant", trainerActive: false };
  }
  if (clean === "trainer") {
    return { drawer: "servant", trainerActive: true };
  }
  if (clean === "shadow") {
    return { drawer: "shadow", trainerActive: false };
  }
  if (clean === "journal" || clean === "replay") {
    return { drawer: "journal", trainerActive: false };
  }
  if (clean === "expert-review" || clean === "expert_review") {
    return { drawer: "expert-review", trainerActive: false };
  }
  if (clean === "layout") {
    return { drawer: "layout", trainerActive: false };
  }
  if (clean === "personalization") {
    return { drawer: "personalization", trainerActive: false };
  }
  return null;
}

export interface TradingDeskLayoutProps {
  /** Workshop ID propagated to the servant drawer when on strategy-workshop tab. */
  workshopId?: string;
  /** Strategy ID propagated to the command bar context when on trading-room tab. */
  strategyId?: string;
  /** Currently selected widget ID for context-aware servant commands. */
  selectedWidget?: string;
  /** Optional market state override for header display. */
  marketState?: string;
  className?: string;
}

export function TradingDeskLayout({
  workshopId: propWorkshopId,
  strategyId: propStrategyId,
  selectedWidget: propSelectedWidget,
  marketState: propMarketState,
  className,
}: TradingDeskLayoutProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ workshopId?: string; strategyId?: string }>();
  const [searchParams] = useSearchParams();
  const [activeDrawer, setActiveDrawer] = useState<GlobalDrawerId | null>(null);
  const [trainerActive, setTrainerActive] = useState<boolean>(false);
  const [command, setCommand] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tasks, setTasks] = useState<ServantCommandTask[]>([]);
  const [traderIdentity, setTraderIdentity] = useState<AgoraTraderIdentity | null>(null);
  const [clickedWidgetId, setClickedWidgetId] = useState<string | null>(null);
  const activeSessionRef = useRef<{ sessionId: string; contextKey: string } | null>(null);
  const isNarrow = useIsNarrowViewport();
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const mainRegionRef = useRef<HTMLDivElement>(null);
  const servant = useServantStatus();
  const { interactionAllowed } = useAgoraWriteAccess();

  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    if (!hadDark) {
      root.classList.add("dark");
    }
    return () => {
      if (!hadDark) {
        root.classList.remove("dark");
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    agoraIdentityClient
      .getTraderIdentity()
      .then((identity) => {
        if (cancelled || !identity) return;
        const hasCustomIdentity =
          (Boolean(identity.displayName) && identity.displayName !== "mock-user") ||
          Boolean(identity.style) ||
          Boolean(identity.marketState);
        if (hasCustomIdentity) {
          setTraderIdentity(identity);
        }
      })
      .catch(() => {
        // Ignore unmocked identity read failures in isolated unit tests;
        // synchronous fallback from auth/servant scope remains displayed.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Open the matching global drawer when navigated from a legacy drawer route
  // (/agora/ask, /agora/journal, /agora/trainer) or via ?drawer=<name>.
  useEffect(() => {
    const stateRecord =
      location.state && typeof location.state === "object"
        ? (location.state as Record<string, unknown>)
        : null;
    const fromState = resolveDrawerRequest(stateRecord?.openDrawer);
    const fromQuery = resolveDrawerRequest(searchParams.get("drawer"));
    const target = fromState ?? fromQuery;
    if (target) {
      setActiveDrawer(target.drawer);
      setTrainerActive(target.trainerActive);
    }
  }, [location.state, searchParams]);

  const anyDrawerOpen = activeDrawer !== null;

  useEffect(() => {
    const mainRegion = mainRegionRef.current;
    if (!mainRegion) return;
    if (isNarrow && anyDrawerOpen) {
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
  }, [anyDrawerOpen, isNarrow]);

  const activeTab = tabFromPath(location.pathname);

  const handleTabChange = (tab: AgoraTab) => {
    const tabDef = TABS.find((item) => item.id === tab);
    if (tabDef) navigate(tabDef.path);
  };

  const resolvedWorkshopId = propWorkshopId ?? params.workshopId;
  const servantWorkshopId =
    activeTab === "strategy-workshop" ? resolvedWorkshopId : undefined;

  const currentStrategy = useMemo(() => {
    return (
      propStrategyId ??
      params.strategyId ??
      searchParams.get("strategyId") ??
      searchParams.get("target_strategy_id") ??
      searchParams.get("strategy") ??
      servantWorkshopId ??
      null
    );
  }, [
    params.strategyId,
    propStrategyId,
    searchParams,
    servantWorkshopId,
  ]);

  const currentSelectedWidget = useMemo(() => {
    return (
      propSelectedWidget ??
      searchParams.get("widget") ??
      searchParams.get("selectedWidget") ??
      clickedWidgetId ??
      null
    );
  }, [clickedWidgetId, propSelectedWidget, searchParams]);

  const commandContext: ServantCommandContext = useMemo(
    () => ({
      page: activeTab,
      route: location.pathname,
      strategy: currentStrategy,
      selectedWidget: currentSelectedWidget,
    }),
    [activeTab, currentSelectedWidget, currentStrategy, location.pathname],
  );

  const traderDisplayName = useMemo(() => {
    if (traderIdentity?.displayName && traderIdentity.displayName !== "mock-user") {
      return traderIdentity.displayName;
    }
    if (auth.bffSession?.identity.userId) {
      return auth.bffSession.identity.userId;
    }
    if (auth.user?.displayName) {
      return auth.user.displayName;
    }
    if (servant.state.kind === "ready" && servant.state.servant.agora_user_id) {
      return servant.state.servant.agora_user_id;
    }
    if (traderIdentity?.displayName) {
      return traderIdentity.displayName;
    }
    return t("agora.shell.header.defaultTraderName");
  }, [auth.bffSession, auth.user, servant.state, t, traderIdentity]);

  const traderStyle = useMemo(() => {
    if (traderIdentity?.style) {
      return traderIdentity.style;
    }
    return t("agora.shell.header.defaultTraderStyle");
  }, [t, traderIdentity]);

  const marketState = useMemo(() => {
    if (propMarketState) return propMarketState;
    if (traderIdentity?.marketState) return traderIdentity.marketState;
    return t("agora.shell.header.marketStateDefault");
  }, [propMarketState, t, traderIdentity]);

  const disabledReason = useMemo(() => {
    if (servant.state.kind === "loading") {
      return t("agora.shell.command.disabledReasons.servantLoading");
    }
    if (servant.state.kind === "missing") {
      return t("agora.shell.command.disabledReasons.servantMissing");
    }
    if (servant.state.kind === "error") {
      return t("agora.shell.command.disabledReasons.servantError");
    }
    if (!interactionAllowed) {
      return t("agora.shell.command.disabledReasons.writeAccessDenied");
    }
    return null;
  }, [interactionAllowed, servant.state.kind, t]);

  const commandEnabled = disabledReason === null;

  const submitServantCommand = async (rawInstruction?: string) => {
    const instruction = (rawInstruction ?? command).trim();
    if (!instruction || !commandEnabled || submitting) return;

    const taskId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const snapshotContext: ServantCommandContext = { ...commandContext };
    const contextKey = JSON.stringify(snapshotContext);

    setSubmitting(true);
    setActiveDrawer("servant");
    setTasks((prev) => [
      {
        id: taskId,
        instruction,
        context: snapshotContext,
        status: "submitting",
      },
      ...prev,
    ]);

    try {
      let sessionId =
        activeSessionRef.current?.contextKey === contextKey
          ? activeSessionRef.current.sessionId
          : "";

      if (!sessionId) {
        const session = await createServantSession({
          intent: instruction,
          strategy_ref: snapshotContext.strategy ?? undefined,
          session_type: "interactive",
          metadata: {
            page: snapshotContext.page,
            route: snapshotContext.route ?? null,
            strategy: snapshotContext.strategy ?? null,
            selected_widget: snapshotContext.selectedWidget ?? null,
          },
        });
        sessionId = session.session_id;
        activeSessionRef.current = { sessionId, contextKey };
      }

      const receipt = await sendServantSessionMessage(sessionId, {
        content: instruction,
        attachment_refs: buildServantContextAttachmentRefs(snapshotContext),
      });

      let answerText = receipt.provider?.answer ?? null;
      let citations: ServantCitation[] = Array.isArray(receipt.citations)
        ? receipt.citations
        : Array.isArray(receipt.provider?.citations)
          ? receipt.provider.citations
          : [];
      let clarification: ServantClarificationCard | null =
        receipt.clarification ?? receipt.provider?.clarification ?? null;
      let statedAssumptions: string[] = Array.isArray(receipt.stated_assumptions)
        ? receipt.stated_assumptions
        : Array.isArray(receipt.provider?.stated_assumptions)
          ? receipt.provider.stated_assumptions
          : [];

      const streamFn = safeResolveFn(() => getServantSessionStream);
      if (streamFn && (!answerText || citations.length === 0)) {
        try {
          const streamSnap = await streamFn(receipt.session_id);
          const assistantMsgs = Array.isArray(streamSnap?.messages)
            ? streamSnap.messages.filter((m) => m.role === "assistant")
            : [];
          const latestAssistant = assistantMsgs[assistantMsgs.length - 1];
          if (latestAssistant) {
            if (!answerText && latestAssistant.content) {
              answerText = latestAssistant.content;
            }
            if (
              citations.length === 0 &&
              Array.isArray(latestAssistant.citations) &&
              latestAssistant.citations.length > 0
            ) {
              citations = latestAssistant.citations;
            }
            if (!clarification && latestAssistant.clarification) {
              clarification = latestAssistant.clarification;
            }
            if (
              statedAssumptions.length === 0 &&
              Array.isArray(latestAssistant.stated_assumptions) &&
              latestAssistant.stated_assumptions.length > 0
            ) {
              statedAssumptions = latestAssistant.stated_assumptions;
            }
          }
        } catch {
          // Stream hydration is best-effort; receipt truth remains primary.
        }
      }

      const isDegraded = receipt.provider.status === "degraded";
      const reply = answerText
        ? answerText
        : isDegraded
          ? t("agora.shell.command.degradedReply", {
              message: receipt.provider.error?.message || receipt.provider.status,
            })
          : t("agora.shell.command.emptyReply", { session: receipt.session_id });

      setCommand("");
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? {
                ...task,
                sessionId: receipt.session_id,
                messageId: receipt.message_id,
                status: isDegraded ? "degraded" : "completed",
                reply,
                citations,
                clarification,
                statedAssumptions,
              }
            : task,
        ),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("agora.shell.command.failed");
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: "error",
                error: message,
              }
            : task,
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectClarificationOption = async (
    targetTask: ServantCommandTask,
    card: ServantClarificationCard,
    option: ServantClarificationOption,
  ) => {
    if (!targetTask.sessionId || submitting) return;
    setSubmitting(true);
    setTasks((prev) =>
      prev.map((item) =>
        item.id === targetTask.id
          ? {
              ...item,
              selectedClarificationOptionId: option.option_id,
              selectedClarificationLabel: option.label,
            }
          : item,
      ),
    );
    try {
      const receipt = await sendServantSessionMessage(targetTask.sessionId, {
        content: option.label,
        attachment_refs: buildServantContextAttachmentRefs(targetTask.context),
        clarification_choice: {
          decision_id: card.decision_id ?? undefined,
          question_id: card.question_id ?? undefined,
          option_id: option.option_id,
          selected_option_id: option.option_id,
          option_label: option.label,
          resolves: card.resolves,
        },
        context: {
          page: targetTask.context.page,
          route: targetTask.context.route ?? null,
          strategy: targetTask.context.strategy ?? null,
          selected_widget: targetTask.context.selectedWidget ?? null,
        },
      });

      let nextAnswer = receipt.provider?.answer ?? null;
      let nextCitations: ServantCitation[] = Array.isArray(receipt.citations)
        ? receipt.citations
        : Array.isArray(receipt.provider?.citations)
          ? receipt.provider.citations
          : [];
      let nextAssumptions: string[] = Array.isArray(receipt.stated_assumptions)
        ? receipt.stated_assumptions
        : Array.isArray(receipt.provider?.stated_assumptions)
          ? receipt.provider.stated_assumptions
          : [];

      const streamFn = safeResolveFn(() => getServantSessionStream);
      if (streamFn && (!nextAnswer || nextCitations.length === 0)) {
        try {
          const streamSnap = await streamFn(receipt.session_id);
          const assistantMsgs = Array.isArray(streamSnap?.messages)
            ? streamSnap.messages.filter((m) => m.role === "assistant")
            : [];
          const latestAssistant = assistantMsgs[assistantMsgs.length - 1];
          if (latestAssistant) {
            if (!nextAnswer && latestAssistant.content) {
              nextAnswer = latestAssistant.content;
            }
            if (
              nextCitations.length === 0 &&
              Array.isArray(latestAssistant.citations) &&
              latestAssistant.citations.length > 0
            ) {
              nextCitations = latestAssistant.citations;
            }
            if (
              nextAssumptions.length === 0 &&
              Array.isArray(latestAssistant.stated_assumptions) &&
              latestAssistant.stated_assumptions.length > 0
            ) {
              nextAssumptions = latestAssistant.stated_assumptions;
            }
          }
        } catch {
          // Best-effort stream hydration.
        }
      }

      setTasks((prev) =>
        prev.map((item) =>
          item.id === targetTask.id
            ? {
                ...item,
                reply: nextAnswer || item.reply,
                citations:
                  nextCitations.length > 0 ? nextCitations : item.citations,
                statedAssumptions:
                  nextAssumptions.length > 0 ? nextAssumptions : item.statedAssumptions,
                selectedClarificationOptionId: option.option_id,
                selectedClarificationLabel: option.label,
              }
            : item,
        ),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("agora.shell.command.failed");
      setTasks((prev) =>
        prev.map((item) =>
          item.id === targetTask.id
            ? {
                ...item,
                error: message,
              }
            : item,
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleMainClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const widgetNode = target.closest<HTMLElement>(
      '[data-widget-id], [data-testid^="workspace-grid-cell-"]',
    );
    if (!widgetNode) return;
    const explicitId = widgetNode.getAttribute("data-widget-id");
    if (explicitId) {
      setClickedWidgetId(explicitId);
      return;
    }
    const testId = widgetNode.getAttribute("data-testid") ?? "";
    if (testId.startsWith("workspace-grid-cell-")) {
      setClickedWidgetId(testId.slice("workspace-grid-cell-".length));
    }
  };

  const handleToggleDrawer = (drawer: GlobalDrawerId) => {
    setActiveDrawer((prev) => {
      const next = prev === drawer ? null : drawer;
      if (next !== "servant") {
        setTrainerActive(false);
      }
      return next;
    });
  };

  const servantPersonaId =
    servant.state.kind === "ready" ? servant.state.servant.persona_id : null;
  const servantDisplayName =
    servant.state.kind === "ready"
      ? formatServantDisplayName(
          servant.state.servant.display_name,
          t("agora.shell.header.servantDefaultName"),
        )
      : t("agora.shell.header.servantDefaultName");
  const defaultSubjectRef = currentStrategy
    ? `strategy:${currentStrategy}`
    : `page:${activeTab}`;

  return (
    <div
      className={cn("dark flex flex-1 flex-col overflow-hidden min-h-0 bg-[#111417] text-[#f0ece4]", className)}
      data-testid="trading-desk-shell"
      data-viewport={isNarrow ? "mobile" : "desktop"}
    >
      <CommandBar
        activeDrawer={activeDrawer}
        activeTab={activeTab}
        command={command}
        commandEnabled={commandEnabled}
        context={commandContext}
        disabledReason={disabledReason}
        marketState={marketState}
        onCommandChange={setCommand}
        onQuickTask={(instruction) => {
          setCommand(instruction);
          void submitServantCommand(instruction);
        }}
        onSubmit={() => void submitServantCommand()}
        onToggleDrawer={handleToggleDrawer}
        servant={servant}
        submitting={submitting}
        traderDisplayName={traderDisplayName}
        traderStyle={traderStyle}
        triggerRef={drawerTriggerRef}
      />

      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />

      <div
        className="flex min-h-0 flex-1 overflow-hidden"
        onClickCapture={handleMainClickCapture}
        ref={mainRegionRef}
      >
        <main
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
          data-testid="trading-desk-main"
          id="trading-desk-content"
        >
          <Outlet />
        </main>

        <ServantDrawer
          activeTab={activeTab}
          commandDisabledReason={disabledReason}
          commandSubmitting={submitting}
          context={commandContext}
          isNarrow={isNarrow}
          onOpenChange={(open) => {
            setActiveDrawer(open ? "servant" : null);
            if (!open) setTrainerActive(false);
          }}
          onOpenOptionalPersonaConsult={() => {
            setTrainerActive(false);
            setActiveDrawer("expert-review");
          }}
          onSelectClarificationOption={handleSelectClarificationOption}
          onSubmitCommand={(text) => submitServantCommand(text)}
          open={activeDrawer === "servant"}
          servantState={servant.state}
          tasks={tasks}
          trainerActive={trainerActive}
          triggerRef={drawerTriggerRef}
          workshopId={servantWorkshopId}
        />

        {activeDrawer === "shadow" && (
          <ShadowGlobalDrawer
            isNarrowViewport={isNarrow}
            onClose={() => setActiveDrawer(null)}
          />
        )}

        {activeDrawer === "journal" && (
          <JournalReplayGlobalDrawer
            isNarrowViewport={isNarrow}
            onClose={() => setActiveDrawer(null)}
          />
        )}

        {activeDrawer === "expert-review" && (
          <ExpertReviewGlobalDrawer
            isNarrowViewport={isNarrow}
            onClose={() => setActiveDrawer(null)}
            onNavigateToWorkshop={(path) => {
              setActiveDrawer(null);
              navigate(path);
            }}
            servantPersonaId={servantPersonaId}
            strategyId={currentStrategy}
            workshopId={resolvedWorkshopId ?? null}
          />
        )}

        {activeDrawer === "layout" && (
          <LayoutAdjustmentGlobalDrawer
            isNarrowViewport={isNarrow}
            isTradingRoom={activeTab === "trading-room"}
            onClose={() => setActiveDrawer(null)}
            onNavigateToTradingRoom={() => {
              navigate("/agora/trading-room");
            }}
            selectedWidget={currentSelectedWidget}
            strategyId={currentStrategy}
          />
        )}

        {activeDrawer === "personalization" && (
          <PersonalizationGlobalDrawer
            defaultSubjectRef={defaultSubjectRef}
            isNarrowViewport={isNarrow}
            onClose={() => setActiveDrawer(null)}
            servantDisplayName={servantDisplayName}
            servantPersonaId={servantPersonaId}
            strategyId={currentStrategy}
          />
        )}
      </div>
    </div>
  );
}

export default TradingDeskLayout;
