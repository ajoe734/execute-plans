import React, { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getWorkshop } from "@/lib/bff-v1/agora/workshops";
import { submitAgoraAsk, type AgoraAskReceipt } from "@/lib/bff-v1/agora/ask";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/types";
import {
  AGORA_LAYOUT_PROPOSAL_STATUS_EVENT,
  requestAgoraLayoutProposal,
  type AgoraLayoutProposalStatusDetail,
} from "./deskEvents";

const MOBILE_BREAKPOINT_PX = 768;

const DESK_COLORS = {
  accent: "#e3a94e",
  canvas: "#1b1f27",
  danger: "#f05c61",
  good: "#43cf94",
  line: "rgba(255,255,255,.08)",
  lineStrong: "rgba(255,255,255,.14)",
  muted: "#9aa1ad",
  panel: "#232831",
  panelRaised: "#2a303b",
  text: "#eef0f3",
} as const;

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

function newUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `agora-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type AgoraTab = "trading-room" | "strategy-workshop" | "strategy-performance";

interface TabDef {
  id: AgoraTab;
  labelKey: string;
  path: string;
}

const TABS: TabDef[] = [
  { id: "trading-room", labelKey: "nav.tradingRoom", path: "/agora/trading-room" },
  { id: "strategy-workshop", labelKey: "nav.strategyWorkshop", path: "/agora/strategy-workshop" },
  { id: "strategy-performance", labelKey: "nav.strategyPerformance", path: "/agora/strategy-performance" },
];

const TAB_SHORTCUTS: Record<AgoraTab, string[]> = {
  "trading-room": ["riskReview", "branchAnalysis", "rearrangeLayout"],
  "strategy-workshop": ["describeStrategy", "organizeUniverse", "generateBacktest"],
  "strategy-performance": ["complianceCheck", "interventionReview", "adjustmentIdeas"],
};

function tabFromPath(pathname: string): AgoraTab {
  for (const tab of TABS) {
    if (pathname === tab.path || pathname.startsWith(`${tab.path}/`)) return tab.id;
  }
  return "trading-room";
}

function instructionRequestsLayout(instruction: string): boolean {
  return /(layout|dashboard|rearrange|reorder|版面|重排|重新排列|先看風險|風險優先)/i.test(instruction);
}

type DeskTaskStatus =
  | "submitting"
  | "ready"
  | "proposal_open"
  | "applied"
  | "rejected"
  | "error";

interface DeskCommandTask {
  id: string;
  instruction: string;
  surface: AgoraTab;
  status: DeskTaskStatus;
  createdAt: string;
  isLayoutTask: boolean;
  summary?: string;
  understood?: string;
  plan: string[];
  evidence: string[];
  risks: string[];
  receipt?: AgoraAskReceipt;
  error?: string;
  dashboardVersion?: number;
}

type ServantWorkshopState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; workshop: StrategyWorkshop }
  | { status: "error"; message: string };

function workshopTitle(workshop: StrategyWorkshop, fallback: string): string {
  const subject = (workshop as StrategyWorkshop & {
    subject?: { title?: unknown; ref?: unknown };
  }).subject;
  const metadata = workshop.metadata && typeof workshop.metadata === "object"
    ? workshop.metadata
    : {};
  for (const candidate of [
    metadata.strategy_name,
    metadata.title,
    metadata.display_name,
    subject?.title,
    subject?.ref,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function useServantWorkshopContext(
  workshopId: string | undefined,
  enabled: boolean,
): ServantWorkshopState {
  const [state, setState] = useState<ServantWorkshopState>({ status: "idle" });

  useEffect(() => {
    if (!enabled || !workshopId) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    getWorkshop(workshopId)
      .then((workshop) => {
        if (!cancelled) setState({ status: "loaded", workshop });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load workshop context",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, workshopId]);

  return state;
}

function TaskStatusPill({ status }: { status: DeskTaskStatus }) {
  const { t } = useTranslation();
  const tone = status === "applied"
    ? { background: "rgba(67,207,148,.13)", border: "rgba(67,207,148,.45)", color: DESK_COLORS.good }
    : status === "error" || status === "rejected"
      ? { background: "rgba(240,92,97,.13)", border: "rgba(240,92,97,.45)", color: DESK_COLORS.danger }
      : { background: "rgba(227,169,78,.13)", border: "rgba(227,169,78,.45)", color: DESK_COLORS.accent };
  return (
    <span
      data-testid="servant-task-status"
      style={{
        background: tone.background,
        border: `1px solid ${tone.border}`,
        borderRadius: 999,
        color: tone.color,
        fontSize: 10,
        fontWeight: 800,
        padding: "4px 8px",
      }}
    >
      {t(`agora.shell.command.status.${status}`)}
    </span>
  );
}

function TaskSections({ task }: { task: DeskCommandTask }) {
  const { t } = useTranslation();
  if (task.status === "submitting") {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-[#9aa1ad]" data-testid="servant-task-loading">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-[#e3a94e]" />
        {t("agora.shell.command.loading")}
      </div>
    );
  }
  if (task.status === "error") {
    return <p className="text-xs leading-5 text-[#f05c61]" role="alert">{task.error}</p>;
  }

  const sections = [
    { id: "understood", label: t("agora.shell.command.understood"), items: task.understood ? [task.understood] : [] },
    { id: "plan", label: t("agora.shell.command.plan"), items: task.plan },
    { id: "evidence", label: t("agora.shell.command.evidence"), items: task.evidence },
    { id: "risks", label: t("agora.shell.command.risks"), items: task.risks },
  ];

  return (
    <div className="grid gap-3" data-testid="servant-task-sections">
      {task.summary ? <p className="m-0 text-[13px] leading-5 text-[#eef0f3]">{task.summary}</p> : null}
      {sections.map((section) => section.items.length ? (
        <section className="rounded-lg border border-white/10 bg-[#2a303b] p-3" data-testid={`servant-task-${section.id}`} key={section.id}>
          <h4 className={cn(
            "mb-2 text-[10px] font-bold uppercase tracking-[.14em]",
            section.id === "risks" ? "text-[#e3a94e]" : "text-[#6b7280]",
          )}>
            {section.label}
          </h4>
          <ol className="m-0 grid list-none gap-1.5 p-0">
            {section.items.map((item, index) => (
              <li className="flex gap-2 text-xs leading-[1.5] text-[#c5cad2]" key={`${section.id}-${index}`}>
                <span className="font-mono text-[10px] text-[#e3a94e]">{String(index + 1).padStart(2, "0")}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null)}
    </div>
  );
}

interface CommandBarProps {
  activeTab: AgoraTab;
  command: string;
  drawerOpen: boolean;
  operatorLabel: string;
  resultOpen: boolean;
  task: DeskCommandTask | null;
  onCloseResult: () => void;
  onCommandChange: (value: string) => void;
  onOpenLayoutProposal: (task: DeskCommandTask, source: "command" | "servant_drawer") => void;
  onSubmit: (instruction?: string) => void;
  onToggleDrawer: () => void;
}

function CommandBar({
  activeTab,
  command,
  drawerOpen,
  operatorLabel,
  resultOpen,
  task,
  onCloseResult,
  onCommandChange,
  onOpenLayoutProposal,
  onSubmit,
  onToggleDrawer,
}: CommandBarProps) {
  const { t } = useTranslation();
  return (
    <header
      className="relative z-40 flex h-[60px] shrink-0 items-center gap-4 border-b border-white/10 bg-[#232831] px-3 sm:px-5"
      data-testid="trading-desk-command-bar"
    >
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="flex h-[29px] w-[29px] items-center justify-center rounded-[9px] bg-[#e3a94e] text-base font-black text-[#241a06]">A</span>
        <span className="hidden text-sm font-bold tracking-[.15em] text-[#eef0f3] sm:inline">AGORA</span>
      </div>
      <div
        className="hidden shrink-0 items-center gap-2 rounded-full bg-[#2a303b] px-3 py-1.5 text-xs text-[#9aa1ad] lg:flex"
        data-testid="trading-desk-operator-context"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[#43cf94]" />
        <span>{operatorLabel}</span>
        <span aria-hidden="true">·</span>
        <span>{t("agora.shell.context.persona")}</span>
      </div>
      <div className="relative min-w-0 flex-1">
        <form
          className="flex h-[42px] items-center gap-2 rounded-full border border-white/15 bg-[#2a303b] py-1 pl-3 pr-1 focus-within:border-[#e3a94e]"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <span aria-hidden="true" className="shrink-0 text-[#e3a94e]">✦</span>
          <input
            aria-label={t("agora.shell.command.input")}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[#eef0f3] outline-none placeholder:text-[#6b7280]"
            data-testid="trading-desk-command-input"
            onChange={(event) => onCommandChange(event.target.value)}
            placeholder={t(`agora.shell.command.placeholder.${activeTab}`)}
            value={command}
          />
          <button
            className="shrink-0 rounded-full bg-[#e3a94e] px-3 py-2 text-xs font-bold text-[#241a06] disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
            data-testid="trading-desk-command-submit"
            disabled={!command.trim() || task?.status === "submitting"}
            type="submit"
          >
            <span className="hidden sm:inline">{t("agora.shell.command.submit")}</span>
            <span className="sm:hidden">↵</span>
          </button>
        </form>

        {resultOpen && task ? (
          <section
            className="absolute left-0 right-0 top-[50px] max-h-[62vh] overflow-auto rounded-[14px] border border-white/15 bg-[#232831] p-4 shadow-2xl sm:p-5"
            data-testid="trading-desk-command-result"
          >
            <header className="mb-3 flex items-center gap-2 text-xs text-[#9aa1ad]">
              <span className="text-[#e3a94e]">✦</span>
              <span>{t("agora.shell.command.context", { context: t(TABS.find((tab) => tab.id === task.surface)?.labelKey ?? "nav.tradingRoom") })}</span>
              <TaskStatusPill status={task.status} />
              <button aria-label={t("agora.shell.command.close")} className="ml-auto px-2 text-lg text-[#6b7280]" onClick={onCloseResult} type="button">×</button>
            </header>
            <TaskSections task={task} />
            {task.isLayoutTask && task.surface === "trading-room" && task.status !== "applied" && task.status !== "rejected" ? (
              <div className="mt-3 border-t border-white/10 pt-3" data-testid="servant-task-actions">
                <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#6b7280]">{t("agora.shell.command.actions")}</h4>
                <button className="rounded-lg border border-[#e3a94e]/50 bg-[#e3a94e]/10 px-3 py-2 text-xs font-bold text-[#e3a94e]" data-testid="command-open-layout-proposal" onClick={() => onOpenLayoutProposal(task, "command")} type="button">
                  {t("agora.shell.command.openLayoutProposal")}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
      <button
        aria-label={t(drawerOpen ? "agora.shell.servant.close" : "agora.shell.servant.open")}
        aria-pressed={drawerOpen}
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
          drawerOpen
            ? "border-[#e3a94e]/50 bg-[#e3a94e]/10 text-[#e3a94e]"
            : "border-white/10 text-[#9aa1ad] hover:bg-[#2a303b]",
        )}
        onClick={onToggleDrawer}
        type="button"
      >
        <span aria-hidden="true">{drawerOpen ? "✕" : "⚡"}</span>
        <span className="hidden xl:inline">{t("agora.shell.servant.label")}</span>
      </button>
    </header>
  );
}

function TabBar({ activeTab, onShortcut, onTabChange }: {
  activeTab: AgoraTab;
  onShortcut: (instruction: string) => void;
  onTabChange: (tab: AgoraTab) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("agora.shell.sections")}
      className="flex h-[52px] shrink-0 items-center gap-5 overflow-x-auto border-b border-white/10 bg-[#1b1f27] px-3 sm:gap-[30px] sm:px-5"
      data-testid="trading-desk-tab-bar"
    >
      {TABS.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <button
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-full shrink-0 items-center border-b-2 px-1 text-sm font-semibold sm:text-[15px]",
              active ? "border-[#e3a94e] text-[#eef0f3]" : "border-transparent text-[#9aa1ad] hover:text-[#eef0f3]",
            )}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {t(tab.labelKey)}
          </button>
        );
      })}
      <div className="ml-auto flex shrink-0 gap-2" data-testid="trading-desk-shortcuts">
        {TAB_SHORTCUTS[activeTab].map((key) => (
          <button className="rounded-full border border-white/15 bg-[#232831] px-3 py-1.5 text-xs text-[#9aa1ad] hover:border-[#e3a94e]/50 hover:text-[#e3a94e]" key={key} onClick={() => onShortcut(t(`agora.shell.command.shortcuts.${key}`))} type="button">
            {t(`agora.shell.command.shortcuts.${key}`)}
          </button>
        ))}
      </div>
    </nav>
  );
}

interface ServantDrawerProps {
  activeTab: AgoraTab;
  command: string;
  isMobile: boolean;
  onClose: () => void;
  onCommandChange: (value: string) => void;
  onOpenLayoutProposal: (task: DeskCommandTask, source: "command" | "servant_drawer") => void;
  onRejectTask: (taskId: string) => void;
  onSubmit: (instruction?: string) => void;
  open: boolean;
  pathname: string;
  tasks: DeskCommandTask[];
  workshopId?: string;
}

function ServantDrawer({
  activeTab,
  command,
  isMobile,
  onClose,
  onCommandChange,
  onOpenLayoutProposal,
  onRejectTask,
  onSubmit,
  open,
  pathname,
  tasks,
  workshopId,
}: ServantDrawerProps) {
  const { t } = useTranslation();
  const contextState = useServantWorkshopContext(workshopId, open && activeTab === "strategy-workshop");
  const activeTask = tasks.find((task) => task.surface === activeTab) ?? null;
  if (!open) return null;

  const contextTitle = contextState.status === "loaded"
    ? workshopTitle(contextState.workshop, t("agora.shell.context.workshopFallback", { id: workshopId?.slice(0, 8) ?? "-" }))
    : t(TABS.find((tab) => tab.id === activeTab)?.labelKey ?? "nav.tradingRoom");

  return (
    <aside
      aria-label={t("agora.shell.servant.drawer")}
      className={cn(
        "flex shrink-0 flex-col border-l border-white/10 bg-[#232831]",
        isMobile ? "fixed inset-x-0 bottom-10 top-[112px] z-30 w-full" : "w-[360px] max-w-[40vw]",
      )}
      data-testid="trading-desk-servant-drawer"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 px-4">
        <span className="text-[#e3a94e]">✦</span>
        <span className="text-xs font-bold uppercase tracking-[.12em] text-[#e3a94e]">{t("agora.shell.servant.label")}</span>
        <button aria-label={t("agora.shell.servant.close")} className="ml-auto px-2 text-lg text-[#6b7280]" onClick={onClose} type="button">×</button>
      </header>

      <div className="flex-1 overflow-auto p-3" data-testid="servant-drawer-context">
        <section className="rounded-lg border border-white/10 bg-[#2a303b] p-3" data-testid="servant-current-context">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#6b7280]">{t("agora.shell.servant.currentContext")}</div>
          <div className="text-sm font-semibold text-[#eef0f3]">{contextTitle}</div>
          <div className="mt-1 break-all font-mono text-[10px] text-[#9aa1ad]">{pathname}</div>
          {workshopId ? <div className="mt-1 font-mono text-[10px] text-[#9aa1ad]">{t("agora.shell.servant.workshopId", { id: workshopId })}</div> : null}
          {contextState.status === "loading" ? <p className="mt-2 text-xs text-[#9aa1ad]">{t("agora.shell.servant.loading")}</p> : null}
          {contextState.status === "error" ? <p className="mt-2 text-xs text-[#f05c61]" role="alert">{t("agora.shell.servant.unavailable", { message: contextState.message })}</p> : null}
          {contextState.status === "loaded" ? (
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[#9aa1ad]">
              <span>{t("agora.shell.servant.status", { status: contextState.workshop.status })}</span>
              {typeof contextState.workshop.message_count === "number" ? <span>{t("agora.shell.servant.messages", { count: contextState.workshop.message_count })}</span> : null}
            </div>
          ) : null}
        </section>

        <form
          className="mt-3 rounded-lg border border-white/10 bg-[#2a303b] p-3"
          data-testid="servant-task-composer"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-[.14em] text-[#6b7280]" htmlFor="servant-drawer-command">{t("agora.shell.servant.composer")}</label>
          <textarea
            className="min-h-20 w-full resize-y rounded-lg border border-white/15 bg-[#1b1f27] p-2.5 text-xs leading-5 text-[#eef0f3] outline-none focus:border-[#e3a94e]"
            data-testid="servant-task-input"
            id="servant-drawer-command"
            onChange={(event) => onCommandChange(event.target.value)}
            placeholder={t(`agora.shell.command.placeholder.${activeTab}`)}
            value={command}
          />
          <button className="mt-2 rounded-lg bg-[#e3a94e] px-3 py-2 text-xs font-bold text-[#241a06] disabled:opacity-50" data-testid="servant-task-submit" disabled={!command.trim() || activeTask?.status === "submitting"} type="submit">{t("agora.shell.command.submit")}</button>
        </form>

        <section className="mt-3" data-testid="servant-current-task">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[10px] font-bold uppercase tracking-[.14em] text-[#6b7280]">{t("agora.shell.servant.currentTask")}</h3>
            {activeTask ? <TaskStatusPill status={activeTask.status} /> : null}
          </div>
          {activeTask ? (
            <div className="rounded-lg border border-white/10 bg-[#1b1f27] p-3">
              <p className="mb-3 text-xs font-semibold leading-5 text-[#eef0f3]">{activeTask.instruction}</p>
              <TaskSections task={activeTask} />
              {activeTask.isLayoutTask && activeTask.surface === "trading-room" && activeTask.status !== "applied" && activeTask.status !== "rejected" ? (
                <div className="mt-3 flex gap-2 border-t border-white/10 pt-3" data-testid="servant-approval-boundary">
                  <button className="flex-1 rounded-lg bg-[#e3a94e] px-3 py-2 text-xs font-bold text-[#241a06]" data-testid="servant-open-layout-proposal" onClick={() => onOpenLayoutProposal(activeTask, "servant_drawer")} type="button">{t("agora.shell.command.openLayoutProposal")}</button>
                  <button className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-[#9aa1ad]" data-testid="servant-reject-task" onClick={() => onRejectTask(activeTask.id)} type="button">{t("agora.shell.servant.reject")}</button>
                </div>
              ) : null}
              <p className="mt-3 text-[10px] leading-4 text-[#43cf94]" data-testid="servant-no-write-proof">{t("agora.shell.servant.noWriteProof")}</p>
            </div>
          ) : <p className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-[#6b7280]">{t("agora.shell.servant.noTasks")}</p>}
        </section>

        <section className="mt-4" data-testid="servant-recent-tasks">
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#6b7280]">{t("agora.shell.servant.recentTasks")}</h3>
          <div className="grid gap-2">
            {tasks.slice(0, 5).map((task) => (
              <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-[#2a303b] p-2.5" key={task.id}>
                <span className="mt-0.5 text-[#e3a94e]">✦</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-[#eef0f3]">{task.instruction}</div>
                  <div className="mt-1 font-mono text-[9px] text-[#6b7280]">{task.id.slice(0, 12)}</div>
                </div>
                <TaskStatusPill status={task.status} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

const BOTTOM_SECTIONS = [
  { id: "jobs", labelKey: "agora.shell.bottom.jobs" },
  { id: "shadow", labelKey: "agora.shell.bottom.shadow" },
  { id: "journal", labelKey: "agora.shell.bottom.journal" },
] as const;

type BottomSectionId = typeof BOTTOM_SECTIONS[number]["id"];

function BottomPanel({ section, tasks, onClose }: { section: BottomSectionId; tasks: DeskCommandTask[]; onClose: () => void }) {
  const { t } = useTranslation();
  const isJobs = section === "jobs";
  return (
    <section className="shrink-0 border-t border-white/10 bg-[#232831] px-4 py-3" data-testid={`trading-desk-bottom-panel-${section}`}>
      <header className="flex items-center gap-2">
        <h3 className="text-xs font-bold text-[#eef0f3]">{t(`agora.shell.bottom.${section}`)}</h3>
        {!isJobs ? <span className="rounded-full border border-[#e3a94e]/40 bg-[#e3a94e]/10 px-2 py-0.5 text-[10px] font-bold text-[#e3a94e]">{t("agora.shell.bottom.unavailable")}</span> : null}
        <button aria-label={t("agora.shell.bottom.close")} className="ml-auto px-2 text-[#6b7280]" onClick={onClose} type="button">×</button>
      </header>
      {isJobs ? (
        tasks.length ? (
          <div className="mt-2 flex gap-2 overflow-x-auto" data-testid="trading-desk-jobs-list">
            {tasks.slice(0, 5).map((task) => <div className="min-w-48 rounded-lg border border-white/10 bg-[#2a303b] p-2 text-xs text-[#9aa1ad]" key={task.id}><span className="block truncate text-[#eef0f3]">{task.instruction}</span><span className="mt-1 block font-mono text-[9px]">{t(`agora.shell.command.status.${task.status}`)}</span></div>)}
          </div>
        ) : <p className="mt-2 text-xs text-[#6b7280]">{t("agora.shell.bottom.noJobs")}</p>
      ) : <p className="mt-2 text-xs text-[#9aa1ad]">{t(`agora.shell.bottom.${section}Unavailable`)}</p>}
    </section>
  );
}

function BottomStrip({ activeSection, onSectionChange }: {
  activeSection: BottomSectionId | null;
  onSectionChange: (id: BottomSectionId | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <footer className="flex h-10 shrink-0 items-center border-t border-white/10 bg-[#232831] px-4" data-testid="trading-desk-bottom-strip">
      {BOTTOM_SECTIONS.map((section) => {
        const active = section.id === activeSection;
        return (
          <button
            aria-controls={`trading-desk-bottom-panel-${section.id}`}
            aria-expanded={active}
            className={cn("h-full border-t-2 px-3 text-xs font-semibold", active ? "border-[#e3a94e] bg-[#2a303b] text-[#e3a94e]" : "border-transparent text-[#6b7280] hover:text-[#eef0f3]")}
            key={section.id}
            onClick={() => onSectionChange(active ? null : section.id)}
            type="button"
          >
            {t(section.labelKey)}
          </button>
        );
      })}
    </footer>
  );
}

export interface TradingDeskLayoutProps {
  workshopId?: string;
  className?: string;
}

export function TradingDeskLayout({ workshopId, className }: TradingDeskLayoutProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bottomSection, setBottomSection] = useState<BottomSectionId | null>(null);
  const [command, setCommand] = useState("");
  const [commandResultOpen, setCommandResultOpen] = useState(false);
  const [tasks, setTasks] = useState<DeskCommandTask[]>([]);
  const isMobile = useIsMobileViewport();
  const activeTab = tabFromPath(location.pathname);
  const activeTask = tasks.find((task) => task.surface === activeTab) ?? null;
  const servantWorkshopId = activeTab === "strategy-workshop" ? workshopId : undefined;
  const operatorLabel = useMemo(() => {
    const metadata = user?.user_metadata as Record<string, unknown> | undefined;
    for (const candidate of [metadata?.display_name, metadata?.name, user?.email]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return t("agora.shell.context.operator");
  }, [t, user]);

  useEffect(() => {
    setCommand("");
    setCommandResultOpen(false);
    setBottomSection(null);
  }, [activeTab]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AgoraLayoutProposalStatusDetail>).detail;
      if (!detail?.taskId) return;
      setTasks((current) => current.map((task) => task.id === detail.taskId ? {
        ...task,
        dashboardVersion: detail.dashboardVersion ?? task.dashboardVersion,
        error: detail.status === "error" ? detail.message : task.error,
        status: detail.status === "preview"
          ? "proposal_open"
          : detail.status === "applied"
            ? "applied"
            : detail.status === "rejected"
              ? "rejected"
              : "error",
      } : task));
    };
    window.addEventListener(AGORA_LAYOUT_PROPOSAL_STATUS_EVENT, handler);
    return () => window.removeEventListener(AGORA_LAYOUT_PROPOSAL_STATUS_EVENT, handler);
  }, []);

  function replaceTask(taskId: string, updater: (task: DeskCommandTask) => DeskCommandTask) {
    setTasks((current) => current.map((task) => task.id === taskId ? updater(task) : task));
  }

  async function submitCommand(instructionArg?: string) {
    const instruction = (instructionArg ?? command).trim();
    if (!instruction) return;
    const taskId = newUUID();
    const isLayoutTask = instructionRequestsLayout(instruction);
    const task: DeskCommandTask = {
      id: taskId,
      instruction,
      surface: activeTab,
      status: "submitting",
      createdAt: new Date().toISOString(),
      isLayoutTask,
      plan: [],
      evidence: [],
      risks: [],
    };
    setTasks((current) => [task, ...current].slice(0, 12));
    setCommand(instruction);
    setCommandResultOpen(true);

    try {
      const receipt = await submitAgoraAsk(
        {
          contextRefs: [
            { type: "route", id: location.pathname },
            ...(servantWorkshopId ? [{ type: "workshop", id: servantWorkshopId }] : []),
          ],
          messageId: `msg-${taskId}`,
          prompt: instruction,
          route: location.pathname,
          sessionId: `desk-${taskId}`,
        },
        { idempotencyKey: `desk-${taskId}` },
      );
      const plan = isLayoutTask
        ? [
            t("agora.shell.command.planSteps.inspectLayout"),
            t("agora.shell.command.planSteps.buildPreview"),
            t("agora.shell.command.planSteps.validateLayout"),
            t("agora.shell.command.planSteps.awaitDecision"),
          ]
        : [
            t("agora.shell.command.planSteps.parseIntent"),
            t("agora.shell.command.planSteps.collectEvidence"),
            t("agora.shell.command.planSteps.assessRisk"),
            t("agora.shell.command.planSteps.proposeActions"),
          ];
      const evidence = [
        t("agora.shell.command.routeEvidence", { route: location.pathname }),
        t("agora.shell.command.receiptEvidence", { session: receipt.sessionId, command: receipt.commandId ?? "-" }),
        receipt.answer
          ? t("agora.shell.command.providerEvidence", { answer: receipt.answer })
          : t("agora.shell.command.providerUnavailable", { status: receipt.providerStatus }),
      ];
      replaceTask(taskId, (current) => ({
        ...current,
        evidence,
        plan,
        receipt,
        risks: [
          t("agora.shell.command.riskEvidenceFreshness"),
          t("agora.shell.command.riskDecisionSupport"),
          t("agora.shell.command.riskWriteBoundary"),
        ],
        status: "ready",
        summary: receipt.answer || t(isLayoutTask ? "agora.shell.command.layoutSummary" : "agora.shell.command.researchSummary"),
        understood: t(isLayoutTask ? "agora.shell.command.layoutUnderstanding" : "agora.shell.command.researchUnderstanding", { instruction }),
      }));
    } catch (error) {
      replaceTask(taskId, (current) => ({
        ...current,
        error: error instanceof Error ? error.message : t("agora.shell.command.failed"),
        status: "error",
      }));
    }
  }

  function openLayoutProposal(task: DeskCommandTask, source: "command" | "servant_drawer") {
    if (!task.isLayoutTask || task.surface !== "trading-room") return;
    replaceTask(task.id, (current) => ({ ...current, status: "proposal_open" }));
    requestAgoraLayoutProposal({ instruction: task.instruction, source, taskId: task.id });
    setDrawerOpen(false);
    setCommandResultOpen(false);
  }

  function rejectTask(taskId: string) {
    replaceTask(taskId, (current) => ({ ...current, status: "rejected" }));
  }

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden bg-[#1b1f27] text-[#eef0f3]", className)}
      data-testid="trading-desk-shell"
      data-viewport={isMobile ? "mobile" : "desktop"}
      style={{
        background: DESK_COLORS.canvas,
        color: DESK_COLORS.text,
        fontFamily: "'Noto Sans TC', Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <CommandBar
        activeTab={activeTab}
        command={command}
        drawerOpen={drawerOpen}
        onCloseResult={() => setCommandResultOpen(false)}
        onCommandChange={setCommand}
        onOpenLayoutProposal={openLayoutProposal}
        onSubmit={submitCommand}
        onToggleDrawer={() => setDrawerOpen((value) => !value)}
        operatorLabel={operatorLabel}
        resultOpen={commandResultOpen}
        task={activeTask}
      />
      <TabBar
        activeTab={activeTab}
        onShortcut={(instruction) => {
          setCommand(instruction);
          void submitCommand(instruction);
        }}
        onTabChange={(tab) => {
          const destination = TABS.find((item) => item.id === tab);
          if (destination) navigate(destination.path);
        }}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain" data-testid="trading-desk-main" id="trading-desk-content">
          <Outlet />
        </main>
        <ServantDrawer
          activeTab={activeTab}
          command={command}
          isMobile={isMobile}
          onClose={() => setDrawerOpen(false)}
          onCommandChange={setCommand}
          onOpenLayoutProposal={openLayoutProposal}
          onRejectTask={rejectTask}
          onSubmit={submitCommand}
          open={drawerOpen}
          pathname={location.pathname}
          tasks={tasks}
          workshopId={servantWorkshopId}
        />
      </div>

      {bottomSection ? <BottomPanel onClose={() => setBottomSection(null)} section={bottomSection} tasks={tasks} /> : null}
      <BottomStrip activeSection={bottomSection} onSectionChange={setBottomSection} />
    </div>
  );
}

export default TradingDeskLayout;
