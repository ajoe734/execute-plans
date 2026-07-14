import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n";
import GridLayout, { type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import type {
  PersonalizationEvent,
} from "@/lib/bff-v1/agora/types";
import type {
  TradingRoomDashboardVersion,
  TradingRoomWidgetSpec,
  TradingRoomWorkspace,
  WorkspaceLayoutOperation,
  TradingRoomStrategyEntry,
} from "@/lib/bff-v1/agora/tradingRoomTypes";
import {
  listTradingRoomWorkspaceVersions,
  patchTradingRoomWorkspaceLayout,
  rollbackTradingRoomWorkspaceVersion,
  type TradingRoomWorkspaceResult,
  type TradingDecisionEvent,
  type TradingRoomRiskSummary,
} from "@/lib/bff-v1/agora/tradingRoom";
import {
  CHART_SPEC_KINDS,
  getActiveWidgetTypes,
  getWidgetRegistryEntry,
  type ChartSpecKind,
  type WidgetRegistryEntry,
} from "@/agora/widgets/registry";
import ChartSpecRenderer from "@/agora/widgets/ChartSpecRenderer";
import {
  formatSensitivityLabel,
  safeWarningText,
  validateTradingRoomWidgetSpec,
} from "./workspaceValidation";
import { chartSpecForKind, chartSpecSummary } from "./workspaceChartSpec";
import WorkspaceWidgetRevisionDrawer from "./WorkspaceWidgetRevisionDrawer";
import { agoraCopy } from "@/agora/i18n";
import { useIsNarrowViewport } from "@/agora/responsive";

const GRID_COLS = 12;
const GRID_WIDTH = 1320;
const ROW_HEIGHT = 74;
const COLORS = {
  accent: "#e8b750",
  border: "#2a2e38",
  borderStrong: "#3a4254",
  danger: "#ff6b6b",
  good: "#56d98b",
  muted: "#8c96a6",
  panel: "#171b22",
  panelElevated: "#1e2330",
  panelInset: "#11151d",
  text: "#f0ece4",
  textSoft: "#c4ccda",
  warning: "#f0b84d",
};

type SaveState = "idle" | "saving" | "error";

export interface WorkspaceGridEditorProps {
  initialEtag?: string | null;
  initialWorkspace: TradingRoomWorkspace;
  onWorkspaceChange?: (result: TradingRoomWorkspaceResult) => void;
  strategy?: TradingRoomStrategyEntry;
  workspaceEvents?: TradingDecisionEvent[];
  riskSummary?: TradingRoomRiskSummary;
  dataCutoff?: string;
  onBackToWorkshop?: () => void;
  onSwitchStrategy?: () => void;
}

function newUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneWorkspace(workspace: TradingRoomWorkspace): TradingRoomWorkspace {
  return JSON.parse(JSON.stringify(workspace)) as TradingRoomWorkspace;
}

function sortedViews(workspace: TradingRoomWorkspace) {
  return [...workspace.views].sort((a, b) => a.order - b.order);
}

function layoutFromWidgets(widgets: TradingRoomWidgetSpec[]): Layout[] {
  return widgets.map((widget) => {
    const placement = widget.placement;
    return {
      i: widget.id,
      x: placement.x,
      y: placement.y,
      w: placement.width,
      h: placement.height,
      minW: placement.minWidth ?? widget.minSize.width,
      minH: placement.minHeight ?? widget.minSize.height,
      maxW: placement.maxWidth ?? widget.maxSize.width,
      maxH: placement.maxHeight ?? widget.maxSize.height,
    };
  });
}

function maxViewY(widgets: TradingRoomWidgetSpec[]): number {
  return widgets.reduce(
    (max, widget) => Math.max(max, widget.placement.y + widget.placement.height),
    0,
  );
}

function updateWorkspaceWidget(
  workspace: TradingRoomWorkspace,
  widgetId: string,
  updater: (widget: TradingRoomWidgetSpec) => TradingRoomWidgetSpec,
): TradingRoomWorkspace {
  return {
    ...workspace,
    views: workspace.views.map((view) => ({
      ...view,
      widgets: view.widgets.map((widget) => (widget.id === widgetId ? updater(widget) : widget)),
    })),
  };
}

function updateWorkspaceView(
  workspace: TradingRoomWorkspace,
  viewId: string,
  updater: (widgets: TradingRoomWidgetSpec[]) => TradingRoomWidgetSpec[],
): TradingRoomWorkspace {
  return {
    ...workspace,
    views: workspace.views.map((view) => {
      if (view.id !== viewId) return view;
      const widgets = updater(view.widgets);
      return { ...view, widgetCount: widgets.length, widgets };
    }),
  };
}

function makePersonalizationEvent(
  event: Omit<PersonalizationEvent, "event_id" | "occurred_at" | "operator_id" | "source" | "spec_version">,
): PersonalizationEvent {
  return {
    spec_version: "1.0",
    event_id: newUUID(),
    occurred_at: new Date().toISOString(),
    operator_id: "trading-room",
    source: "operator_action",
    ...event,
  };
}

function affectedWidgets(operations: WorkspaceLayoutOperation[]): string[] {
  return operations.flatMap((operation) => operation.widgetId ? [operation.widgetId] : []);
}

function mutationErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Workspace update failed.";
}

function AddWidgetLibrary({
  onAdd,
  onClose,
  onAskServant,
}: {
  onAdd: (entry: WidgetRegistryEntry) => void;
  onClose: () => void;
  onAskServant: (prompt: string) => void;
}) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const entries = getActiveWidgetTypes()
    .map((widgetType) => getWidgetRegistryEntry(widgetType))
    .filter((entry): entry is WidgetRegistryEntry => Boolean(entry));
  const grouped = entries.reduce<Record<string, WidgetRegistryEntry[]>>((acc, entry) => {
    const category = entry.category || "General";
    acc[category] = [...(acc[category] || []), entry];
    return acc;
  }, {});

  return (
    <aside
      data-testid="workspace-add-widget-library"
      style={{
        background: COLORS.panelElevated,
        border: `1px solid ${COLORS.borderStrong}`,
        borderRadius: 8,
        boxShadow: "0 18px 42px rgba(0, 0, 0, 0.42)",
        display: "flex",
        flexDirection: "column",
        maxHeight: 520,
        overflow: "auto",
        padding: 12,
        position: "absolute",
        right: 16,
        top: 58,
        width: 360,
        zIndex: 20,
      }}
    >
      <header style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ color: COLORS.text, fontSize: 13 }}>{t("agora.tradingRoom.editor.addWidget")}</strong>
        <button aria-label="Close widget library" onClick={onClose} style={plainButtonStyle} type="button">
          ×
        </button>
      </header>

      {/* Ask Servant Input */}
      <div style={{ borderBottom: `1px solid ${COLORS.border}`, marginBottom: 12, paddingBottom: 12 }}>
        <div style={{ color: COLORS.accent, fontSize: 11, fontWeight: 800, marginBottom: 6 }}>
          ASK SERVANT TO CREATE WIDGET (交代僕人新增)
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            data-testid="workspace-ask-servant-widget-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. 比較贏家分點出現後 5、20、60 日的成本後報酬"
            style={{
              flex: 1,
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              color: COLORS.text,
              fontSize: 12,
              padding: "6px 8px",
            }}
          />
          <button
            data-testid="workspace-ask-servant-widget-submit"
            onClick={() => {
              if (prompt.trim()) {
                onAskServant(prompt);
                setPrompt("");
              }
            }}
            style={primaryButtonStyle}
            type="button"
          >
            Ask
          </button>
        </div>
      </div>

      {Object.entries(grouped).map(([category, categoryEntries]) => (
        <section key={category} style={{ marginTop: 10 }}>
          <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
            {category}
          </div>
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            {categoryEntries.map((entry) => (
              <button
                data-testid={`workspace-add-widget-${entry.widget_type}`}
                key={entry.widget_type}
                onClick={() => onAdd(entry)}
                style={{
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 6,
                  color: COLORS.textSoft,
                  cursor: "pointer",
                  fontSize: 12,
                  padding: "8px 10px",
                  textAlign: "left",
                }}
                type="button"
              >
                <span style={{ color: COLORS.text, display: "block", fontWeight: 700 }}>{entry.display_name}</span>
                <span>{entry.description}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
}

function WorkspaceWidgetCard({
  editMode,
  menuOpen,
  onChangeChart,
  onDuplicate,
  onMenuToggle,
  onRemove,
  onRequestRevision,
  onEditDataRange,
  onAddBenchmark,
  onMarkUseful,
  onMarkNotUseful,
  onWhyShown,
  onViewEvidence,
  widget,
  workspaceEvents = [],
}: {
  editMode: boolean;
  menuOpen: boolean;
  onChangeChart: (kind: ChartSpecKind) => void;
  onDuplicate: () => void;
  onMenuToggle: () => void;
  onRemove: () => void;
  onRequestRevision: () => void;
  onEditDataRange: () => void;
  onAddBenchmark: () => void;
  onMarkUseful: () => void;
  onMarkNotUseful: () => void;
  onWhyShown: () => void;
  onViewEvidence: () => void;
  widget: TradingRoomWidgetSpec;
  workspaceEvents?: TradingDecisionEvent[];
}) {
  const { t } = useTranslation();
  const validation = validateTradingRoomWidgetSpec(widget);
  const entry = getWidgetRegistryEntry(widget.widgetType);
  const chartKinds = entry?.allowed_chart_kinds ?? [...CHART_SPEC_KINDS];

  return (
    <section
      data-testid={`workspace-widget-${widget.id}`}
      onClick={(event) => {
        if (editMode) return;
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("button")) return;
        onRequestRevision();
      }}
      onKeyDown={(event) => {
        if (editMode) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onRequestRevision();
        }
      }}
      role={editMode ? undefined : "button"}
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        cursor: editMode ? "default" : "pointer",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
      }}
      tabIndex={editMode ? undefined : 0}
    >
      <header
        className="workspace-widget-drag-handle"
        style={{
          alignItems: "center",
          borderBottom: `1px solid ${COLORS.border}`,
          cursor: editMode ? "grab" : "default",
          display: "flex",
          gap: 10,
          justifyContent: "space-between",
          minHeight: 42,
          padding: "8px 10px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3 style={{ color: COLORS.text, fontSize: 13, fontWeight: 800, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {agoraCopy(t, widget.titleKey, widget.title)}
          </h3>
          <div style={{ color: COLORS.muted, fontSize: 11 }}>
            {validation.title} · {formatSensitivityLabel(widget.sensitivity)}
          </div>
        </div>
        <div
          onMouseDown={(event) => event.stopPropagation()}
          style={{ alignItems: "center", display: "flex", gap: 6, position: "relative" }}
        >
          <span
            style={{
              background: validation.ok ? "rgba(86, 217, 139, 0.13)" : "rgba(255, 107, 107, 0.13)",
              border: `1px solid ${validation.ok ? "rgba(86, 217, 139, 0.42)" : "rgba(255, 107, 107, 0.42)"}`,
              borderRadius: 999,
              color: validation.ok ? COLORS.good : COLORS.danger,
              fontSize: 10,
              fontWeight: 800,
              padding: "3px 7px",
            }}
          >
            {validation.ok ? "validated" : "review"}
          </span>
          {editMode ? (
            <button
              aria-label={`Open widget menu for ${agoraCopy(t, widget.titleKey, widget.title)}`}
              data-testid={`workspace-widget-menu-${widget.id}`}
              onClick={onMenuToggle}
              style={plainButtonStyle}
              type="button"
            >
              ⋮
            </button>
          ) : null}
          {menuOpen ? (
            <div
              data-testid={`workspace-widget-menu-panel-${widget.id}`}
              style={{
                background: COLORS.panelElevated,
                border: `1px solid ${COLORS.borderStrong}`,
                borderRadius: 8,
                boxShadow: "0 18px 42px rgba(0, 0, 0, 0.42)",
                display: "grid",
                gap: 4,
                padding: 8,
                position: "absolute",
                right: 0,
                top: 28,
                width: 220,
                zIndex: 15,
              }}
            >
              <button onClick={onRequestRevision} style={menuButtonStyle} type="button">{t("agora.tradingRoom.editor.askServant")}</button>
              <button onClick={onEditDataRange} style={menuButtonStyle} type="button">編輯資料範圍 (Edit range)</button>
              <button onClick={onAddBenchmark} style={menuButtonStyle} type="button">新增比較基準 (Add benchmark)</button>
              <button onClick={onDuplicate} style={menuButtonStyle} type="button">{t("agora.tradingRoom.editor.duplicateWidget")}</button>
              <button onClick={onMarkUseful} style={menuButtonStyle} type="button">標記有用 (Mark useful)</button>
              <button onClick={onMarkNotUseful} style={menuButtonStyle} type="button">標記無用 (Mark unuseful)</button>
              <button onClick={onWhyShown} style={menuButtonStyle} type="button">查看為何出現在此 (Why shown)</button>
              <button onClick={onViewEvidence} style={menuButtonStyle} type="button">查看資料與證據 (Evidence)</button>
              <button onClick={onRemove} style={dangerMenuButtonStyle} type="button">{t("agora.tradingRoom.editor.removeWidget")}</button>
              <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 4, paddingTop: 6 }}>
                <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 800, marginBottom: 4 }}>
                  {t("agora.tradingRoom.editor.changeChart")}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {chartKinds.map((kind) => (
                    <button
                      data-testid={`workspace-change-chart-${widget.id}-${kind}`}
                      key={kind}
                      onClick={() => onChangeChart(kind)}
                      style={{
                        ...chipButtonStyle,
                        background: widget.chartSpec.kind === kind ? "rgba(232, 183, 80, 0.14)" : COLORS.panel,
                        color: widget.chartSpec.kind === kind ? COLORS.accent : COLORS.textSoft,
                      }}
                      type="button"
                    >
                      {kind}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </header>
      <div style={{ color: COLORS.muted, display: "flex", flexWrap: "wrap", gap: 6, fontSize: 10, padding: "4px 10px", borderBottom: `1px dotted ${COLORS.border}` }}>
        <span style={{ color: COLORS.textSoft }}>{agoraCopy(t, widget.purposeKey, widget.purpose)}</span>
        <span>·</span>
        <span>{widget.dataSource}</span>
        <span>·</span>
        <span>{chartSpecSummary(widget.chartSpec)}</span>
      </div>
      <div style={{ minHeight: 0, flex: 1, padding: "0 10px 10px" }}>
        {validation.ok ? (
          <ChartSpecRenderer
            data={widget.dataAvailability === "unavailable" ? [] : getWidgetData(widget.widgetType, workspaceEvents)}
            height={170}
            spec={widget.chartSpec}
            widgetType={widget.widgetType}
            dataSource={widget.dataSource}
            dataAvailability={widget.dataAvailability}
          />
        ) : (
          <div data-testid={`workspace-widget-${widget.id}-validation`} style={{ color: COLORS.danger, fontSize: 12 }}>
            {validation.messages.join(" ")}
          </div>
        )}
      </div>
    </section>
  );
}

function parseNewWidgetPrompt(prompt: string, strategyId: string, currentY: number): {
  widgetSpec: TradingRoomWidgetSpec;
  problem: string;
  mapping: string;
} {
  const isReturn = prompt.includes("報酬") || prompt.includes("return") || prompt.includes("5") || prompt.includes("20");
  
  if (isReturn) {
    const spec: TradingRoomWidgetSpec = {
      id: `servant_widget_${Date.now()}`,
      widgetType: "branch_profitability_table",
      title: "Winner Branch Horizon Returns (5d/20d/60d)",
      purpose: "Compare cost-adjusted returns across 5, 20, and 60 days post-accumulation.",
      whyIncluded: "Servant proposal based on trader request for return comparison.",
      dataSource: "agora.winner_branch.performance",
      query: { filters: { strategy_id: strategyId }, limit: 100, window: "60d" },
      chartSpec: {
        spec_version: "1.0",
        kind: "bar",
        encodings: {
          x: { field: "horizon", type: "nominal", label: "Horizon" },
          y: { field: "avg_return", type: "quantitative", label: "Avg Return (%)" },
        },
      },
      interactions: [{ kind: "request_widget_revision" }],
      placement: { x: 0, y: currentY, width: 6, height: 3, minWidth: 2, minHeight: 2 },
      minSize: { width: 2, height: 2 },
      maxSize: { width: 12, height: 8 },
      sensitivity: "public_market",
      visible: true,
    };
    return {
      widgetSpec: spec,
      problem: "Assessing profit decay to optimize trade execution duration.",
      mapping: "X: Horizon (5d/20d/60d) | Y: Avg Return (%)",
    };
  }

  const spec: TradingRoomWidgetSpec = {
    id: `servant_widget_${Date.now()}`,
    widgetType: "strategy_status_summary",
    title: prompt.length > 30 ? prompt.slice(0, 30) + "..." : prompt,
    purpose: `Custom visualization generated for: "${prompt}"`,
    whyIncluded: "Servant proposal based on trader request.",
    dataSource: "agora.strategy.summary",
    query: { filters: { strategy_id: strategyId }, limit: 100, window: "20d" },
    chartSpec: {
      spec_version: "1.0",
      kind: "line",
      encodings: {
        x: { field: "time", type: "temporal", label: "Time" },
        y: { field: "value", type: "quantitative", label: "Value" },
      },
    },
    interactions: [{ kind: "request_widget_revision" }],
    placement: { x: 0, y: currentY, width: 6, height: 3, minWidth: 2, minHeight: 2 },
    minSize: { width: 2, height: 2 },
    maxSize: { width: 12, height: 8 },
    sensitivity: "user_private",
    visible: true,
  };
  return {
    widgetSpec: spec,
    problem: `Display trend of requested parameter: "${prompt}"`,
    mapping: "X: Time | Y: Value",
  };
}

function getWidgetData(widgetType: string, events: TradingDecisionEvent[]): Record<string, unknown>[] | undefined {
  if (widgetType === "signal_decision_queue" || widgetType === "overview_decision_queue") {
    return events.map((ev) => ({
      event_id: ev.decision_event_id,
      event_type: ev.event_kind,
      instrument: ev.subject.symbol,
      status: ev.state,
      suggested_action: ev.suggested_action,
      triggered_at: ev.triggered_at,
    }));
  }
  if (widgetType === "position_action_queue") {
    const posEvents = events.filter(
      (ev) => ev.event_kind === "add" || ev.event_kind === "reduce" || ev.event_kind === "exit"
    );
    return posEvents.map((ev) => ({
      position_id: ev.position_ref || "pos_default",
      instrument: ev.subject.symbol,
      action_type: ev.event_kind,
      status: ev.state,
      triggered_at: ev.triggered_at,
    }));
  }
  if (widgetType === "candidate_ranking_table") {
    const candEvents = events.filter((ev) => ev.event_kind === "entry" || ev.candidate_ref);
    return candEvents.map((ev) => ({
      candidate_id: ev.candidate_ref || "cand_default",
      instrument: ev.subject.symbol,
      score: Math.round(ev.confidence?.value * 100 || 85),
      confidence: ev.confidence?.value || 0.85,
      expected_value: ev.expected_value?.net || 0,
    }));
  }
  return undefined;
}

function pendingEventTotal(strategy: TradingRoomStrategyEntry): number {
  return (
    (strategy.pending_event_counts?.entry ?? 0) +
    (strategy.pending_event_counts?.add ?? 0) +
    (strategy.pending_event_counts?.reduce ?? 0) +
    (strategy.pending_event_counts?.exit ?? 0) +
    (strategy.pending_event_counts?.review ?? 0)
  );
}

export function WorkspaceGridEditor({
  initialEtag,
  initialWorkspace,
  onWorkspaceChange,
  strategy,
  workspaceEvents = [],
  riskSummary,
  dataCutoff,
  onBackToWorkshop,
  onSwitchStrategy,
}: WorkspaceGridEditorProps) {
  const { t } = useTranslation();
  const isNarrowViewport = useIsNarrowViewport();
  const [baseWorkspace, setBaseWorkspace] = useState(() => cloneWorkspace(initialWorkspace));
  const [draftWorkspace, setDraftWorkspace] = useState(() => cloneWorkspace(initialWorkspace));
  const [currentEtag, setCurrentEtag] = useState<string | null>(initialEtag ?? null);
  const [activeViewId, setActiveViewId] = useState(initialWorkspace.activeViewId || initialWorkspace.views[0]?.id || "");
  const [editMode, setEditMode] = useState(false);
  const [pendingOps, setPendingOps] = useState<WorkspaceLayoutOperation[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [menuWidgetId, setMenuWidgetId] = useState<string | null>(null);
  const [showAddLibrary, setShowAddLibrary] = useState(false);
  const [events, setEvents] = useState<PersonalizationEvent[]>([]);
  const [versions, setVersions] = useState<TradingRoomDashboardVersion[]>([]);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<{ viewId: string; widgetId: string } | null>(null);
  
  // Custom states for notifications and Ask Servant widget proposals
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [widgetProposal, setWidgetProposal] = useState<{
    prompt: string;
    widgetSpec: TradingRoomWidgetSpec;
    problem: string;
    mapping: string;
  } | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustPromptText, setAdjustPromptText] = useState("");

  useEffect(() => {
    setBaseWorkspace(cloneWorkspace(initialWorkspace));
    setDraftWorkspace(cloneWorkspace(initialWorkspace));
    setCurrentEtag(initialEtag ?? null);
    setActiveViewId(initialWorkspace.activeViewId || initialWorkspace.views[0]?.id || "");
    setEditMode(false);
    setPendingOps([]);
    setSaveState("idle");
    setError(null);
    setEvents([]);
    setRevisionTarget(null);
  }, [initialEtag, initialWorkspace]);

  useEffect(() => {
    let cancelled = false;
    listTradingRoomWorkspaceVersions(initialWorkspace.id)
      .then((items) => {
        if (cancelled) return;
        setVersions(items);
        setVersionError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setVersionError(mutationErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [initialWorkspace.id, baseWorkspace.dashboardVersion]);

  const views = useMemo(() => sortedViews(draftWorkspace), [draftWorkspace]);
  const activeView = views.find((view) => view.id === activeViewId) ?? views[0];
  const visibleWidgets = activeView?.widgets.filter((widget) => widget.visible !== false) ?? [];
  const removedWidgets = activeView?.widgets.filter((widget) => widget.visible === false) ?? [];
  const dirty = pendingOps.length > 0;
  const revisionView = revisionTarget
    ? draftWorkspace.views.find((view) => view.id === revisionTarget.viewId) ?? null
    : null;
  const revisionWidget = revisionTarget && revisionView
    ? revisionView.widgets.find((widget) => widget.id === revisionTarget.widgetId) ?? null
    : null;

  function recordEvent(event: PersonalizationEvent) {
    setEvents((prev) => [event, ...prev].slice(0, 8));
  }

  function queueOperation(operation: WorkspaceLayoutOperation, event: PersonalizationEvent) {
    setPendingOps((prev) => [...prev, operation]);
    recordEvent(event);
    setError(null);
    setSaveState("idle");
  }

  function handleLayoutChange(layout: Layout[]) {
    if (!editMode || !activeView) return;
    const widgetById = new Map(activeView.widgets.map((widget) => [widget.id, widget]));
    const operations: WorkspaceLayoutOperation[] = [];
    let changed = false;

    for (const item of layout) {
      const widget = widgetById.get(item.i);
      if (!widget) continue;
      const placement = widget.placement;
      const moved = placement.x !== item.x || placement.y !== item.y;
      const resized = placement.width !== item.w || placement.height !== item.h;
      if (moved) {
        operations.push({ kind: "move_widget", widgetId: widget.id, payload: { x: item.x, y: item.y } });
      }
      if (resized) {
        operations.push({ kind: "resize_widget", widgetId: widget.id, payload: { width: item.w, height: item.h } });
      }
      if (moved || resized) changed = true;
    }
    if (!changed) return;

    setDraftWorkspace((workspace) =>
      updateWorkspaceView(workspace, activeView.id, (widgets) =>
        widgets.map((widget) => {
          const item = layout.find((entry) => entry.i === widget.id);
          if (!item) return widget;
          return {
            ...widget,
            placement: {
              ...widget.placement,
              height: item.h,
              width: item.w,
              x: item.x,
              y: item.y,
            },
          };
        }),
      ),
    );
    setPendingOps((prev) => [...prev, ...operations]);
    recordEvent(makePersonalizationEvent({
      after_state: { operations, view_id: activeView.id },
      before_state: { widgets: affectedWidgets(operations), view_id: activeView.id },
      event_type: "widget_reordered",
      memory_writeback_eligible: false,
      target: { target_id: draftWorkspace.id, target_type: "dashboard_recipe" },
    }));
  }

  function handleRemove(widget: TradingRoomWidgetSpec) {
    setDraftWorkspace((workspace) =>
      updateWorkspaceWidget(workspace, widget.id, (current) => ({ ...current, visible: false })),
    );
    setMenuWidgetId(null);
    queueOperation(
      { kind: "remove_widget", widgetId: widget.id, payload: {} },
      makePersonalizationEvent({
        after_state: { view_id: activeView?.id, visible: false },
        before_state: { view_id: activeView?.id, visible: widget.visible !== false },
        event_type: "widget_removed",
        memory_writeback_eligible: true,
        target: { target_id: widget.id, target_type: "widget" },
      }),
    );
  }

  function handleRestore(widget: TradingRoomWidgetSpec) {
    setDraftWorkspace((workspace) =>
      updateWorkspaceWidget(workspace, widget.id, (current) => ({ ...current, visible: true })),
    );
    queueOperation(
      { kind: "add_registered_widget", payload: { widgetId: widget.id } },
      makePersonalizationEvent({
        after_state: { view_id: activeView?.id, visible: true },
        before_state: { view_id: activeView?.id, visible: false },
        event_type: "widget_added",
        memory_writeback_eligible: true,
        metadata: { action: "restore_widget" },
        target: { target_id: widget.id, target_type: "widget" },
      }),
    );
  }

  function handleChangeChart(widget: TradingRoomWidgetSpec, kind: ChartSpecKind) {
    setDraftWorkspace((workspace) =>
      updateWorkspaceWidget(workspace, widget.id, (current) => ({
        ...current,
        chartSpec: chartSpecForKind(kind),
      })),
    );
    setMenuWidgetId(null);
    queueOperation(
      { kind: "replace_chart_spec", widgetId: widget.id, payload: { chartSpec: chartSpecForKind(kind) } },
      makePersonalizationEvent({
        after_state: { chart_kind: kind, view_id: activeView?.id },
        before_state: { chart_kind: widget.chartSpec.kind, view_id: activeView?.id },
        event_type: "dashboard_recipe_changed",
        memory_writeback_eligible: true,
        metadata: { action: "replace_chart_spec" },
        target: { target_id: widget.id, target_type: "widget" },
      }),
    );
  }

  function addWidgetSpec(widgetSpec: TradingRoomWidgetSpec, action: string) {
    if (!activeView) return;
    setDraftWorkspace((workspace) =>
      updateWorkspaceView(workspace, activeView.id, (widgets) => [...widgets, widgetSpec]),
    );
    setShowAddLibrary(false);
    setMenuWidgetId(null);
    queueOperation(
      { kind: "add_registered_widget", payload: { viewId: activeView.id, widgetSpec } },
      makePersonalizationEvent({
        after_state: { view_id: activeView.id, widget_id: widgetSpec.id, widget_type: widgetSpec.widgetType },
        before_state: { view_id: activeView.id, widget_count: activeView.widgets.length },
        event_type: "widget_added",
        memory_writeback_eligible: true,
        metadata: { action },
        target: { target_id: draftWorkspace.id, target_type: "dashboard_recipe" },
      }),
    );
  }

  function handleDuplicate(widget: TradingRoomWidgetSpec) {
    if (!activeView) return;
    const nextY = maxViewY(activeView.widgets);
    addWidgetSpec(
      {
        ...cloneWorkspace({ ...draftWorkspace, views: [{ ...activeView, widgets: [widget] }] }).views[0].widgets[0],
        id: `${widget.id}_copy_${Date.now().toString(36)}`,
        placement: { ...widget.placement, y: nextY },
        title: `${widget.title} copy`,
        visible: true,
      },
      "duplicate_widget",
    );
  }

  function handleAddFromLibrary(entry: WidgetRegistryEntry) {
    if (!activeView) return;
    const chartKind = entry.allowed_chart_kinds[0] ?? "table";
    const dataSource = entry.allowed_data_sources[0] ?? "agora.strategy.summary";
    const nextY = maxViewY(activeView.widgets);
    const interactionKind = entry.allowed_interactions.includes("request_widget_revision")
      ? "request_widget_revision"
      : entry.allowed_interactions[0];
    const widgetSpec: TradingRoomWidgetSpec = {
      id: `${entry.widget_type}_${Date.now().toString(36)}`,
      widgetType: entry.widget_type,
      title: entry.display_name,
      purpose: entry.description,
      whyIncluded: "Added from the controlled Agora widget library.",
      dataSource,
      query: { filters: { strategy_id: draftWorkspace.strategyId }, limit: 250, sort: {}, window: "20d" },
      chartSpec: chartSpecForKind(chartKind),
      interactions: interactionKind ? [{ kind: interactionKind }] : [],
      placement: {
        x: 0,
        y: nextY,
        width: 4,
        height: 3,
        minWidth: 2,
        minHeight: 2,
        maxWidth: 12,
        maxHeight: 8,
      },
      minSize: { width: 2, height: 2 },
      maxSize: { width: 12, height: 8 },
      sensitivity: entry.sensitivity,
      visible: true,
    };
    addWidgetSpec(widgetSpec, "add_from_library");
  }

  async function handleSave() {
    if (!dirty) return;
    if (!currentEtag) {
      setError("Workspace ETag is required before saving layout changes.");
      setSaveState("error");
      return;
    }
    setSaveState("saving");
    setError(null);
    try {
      const result = await patchTradingRoomWorkspaceLayout(
        draftWorkspace.id,
        { operations: pendingOps },
        { ifMatch: currentEtag, idempotencyKey: newUUID() },
      );
      setBaseWorkspace(cloneWorkspace(result.workspace));
      setDraftWorkspace(cloneWorkspace(result.workspace));
      setCurrentEtag(result.etag);
      setPendingOps([]);
      setEditMode(false);
      setSaveState("idle");
      onWorkspaceChange?.(result);
    } catch (err) {
      setError(mutationErrorMessage(err));
      setSaveState("error");
    }
  }

  function handleDiscard() {
    setDraftWorkspace(cloneWorkspace(baseWorkspace));
    setPendingOps([]);
    setError(null);
    setSaveState("idle");
    setMenuWidgetId(null);
    setShowAddLibrary(false);
  }

  async function handleRollback(version: TradingRoomDashboardVersion) {
    if (!currentEtag) {
      setError("Workspace ETag is required before rollback.");
      return;
    }
    setSaveState("saving");
    setError(null);
    try {
      const result = await rollbackTradingRoomWorkspaceVersion(
        draftWorkspace.id,
        version.id,
        { reason: `rollback to dashboard version ${version.dashboardVersion}` },
        { ifMatch: currentEtag, idempotencyKey: newUUID() },
      );
      setBaseWorkspace(cloneWorkspace(result.workspace));
      setDraftWorkspace(cloneWorkspace(result.workspace));
      setCurrentEtag(result.etag);
      setPendingOps([]);
      setEditMode(false);
      setSaveState("idle");
      onWorkspaceChange?.(result);
    } catch (err) {
      setError(mutationErrorMessage(err));
      setSaveState("error");
    }
  }

  function handleRevisionAccepted(result: TradingRoomWorkspaceResult) {
    setBaseWorkspace(cloneWorkspace(result.workspace));
    setDraftWorkspace(cloneWorkspace(result.workspace));
    setCurrentEtag(result.etag);
    setPendingOps([]);
    setEditMode(false);
    setSaveState("idle");
    setError(null);
    setRevisionTarget(null);
    onWorkspaceChange?.(result);
  }

  // Menu action handlers
  function handleEditDataRange(widget: TradingRoomWidgetSpec) {
    setToastMessage(`🔧 ${widget.title}: 資料範圍編輯已開啟 (Mock Mode)`);
  }

  function handleAddBenchmark(widget: TradingRoomWidgetSpec) {
    setToastMessage(`📊 ${widget.title}: 已新增比較基準 (Mock Mode)`);
  }

  function handleMarkUseful(widget: TradingRoomWidgetSpec) {
    setToastMessage(`✓ 已收到您的回饋：Widget "${widget.title}" 已標記為有用`);
    recordEvent(makePersonalizationEvent({
      after_state: { feedback: "useful" },
      before_state: {},
      event_type: "dashboard_recipe_changed",
      memory_writeback_eligible: true,
      target: { target_id: widget.id, target_type: "widget" },
    }));
  }

  function handleMarkNotUseful(widget: TradingRoomWidgetSpec) {
    setToastMessage(`✗ 已收到您的回饋：Widget "${widget.title}" 已標記為無用`);
    recordEvent(makePersonalizationEvent({
      after_state: { feedback: "not_useful" },
      before_state: {},
      event_type: "dashboard_recipe_changed",
      memory_writeback_eligible: true,
      target: { target_id: widget.id, target_type: "widget" },
    }));
  }

  function handleWhyShown(widget: TradingRoomWidgetSpec) {
    setToastMessage(`ℹ ${widget.title} 出現原因: ${widget.whyIncluded || "系統默認配置"}`);
  }

  function handleViewEvidence(widget: TradingRoomWidgetSpec) {
    setToastMessage(`🔎 ${widget.title}: 已載入相關證據與原始數據來源 (${widget.dataSource})`);
  }

  function handleAskServant(prompt: string) {
    if (!activeView) return;
    const currentY = maxViewY(activeView.widgets);
    const parsed = parseNewWidgetPrompt(prompt, draftWorkspace.strategyId, currentY);
    setWidgetProposal({
      prompt,
      widgetSpec: parsed.widgetSpec,
      problem: parsed.problem,
      mapping: parsed.mapping,
    });
  }

  function renderWidgetCard(widget: TradingRoomWidgetSpec, viewId: string, stacked = false) {
    return (
      <div
        data-testid={`workspace-grid-cell-${widget.id}`}
        key={widget.id}
        style={stacked ? { minHeight: 260, width: "100%" } : undefined}
      >
        <WorkspaceWidgetCard
          editMode={editMode}
          menuOpen={menuWidgetId === widget.id}
          onChangeChart={(kind) => handleChangeChart(widget, kind)}
          onDuplicate={() => handleDuplicate(widget)}
          onMenuToggle={() => setMenuWidgetId((current) => current === widget.id ? null : widget.id)}
          onRemove={() => handleRemove(widget)}
          onRequestRevision={() => {
            setMenuWidgetId(null);
            setRevisionTarget({ viewId, widgetId: widget.id });
          }}
          onEditDataRange={() => handleEditDataRange(widget)}
          onAddBenchmark={() => handleAddBenchmark(widget)}
          onMarkUseful={() => handleMarkUseful(widget)}
          onMarkNotUseful={() => handleMarkNotUseful(widget)}
          onWhyShown={() => handleWhyShown(widget)}
          onViewEvidence={() => handleViewEvidence(widget)}
          widget={widget}
          workspaceEvents={workspaceEvents}
        />
      </div>
    );
  }

  if (!activeView) {
    return (
      <div data-testid="trading-room-workspace-empty" style={{ color: COLORS.muted, fontSize: 13, padding: 16 }}>
        Workspace contains no views.
      </div>
    );
  }

  return (
    <section
      data-testid="trading-room-workspace-shell"
      style={{ background: COLORS.panelInset, color: COLORS.text, display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflow: "hidden" }}
    >
      <header
        data-testid="workspace-control-strip"
        style={{
          background: COLORS.panel,
          borderBottom: `1px solid ${COLORS.border}`,
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          flexShrink: 0,
        }}
      >
        {/* Row 1: Identity & State badges */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, minWidth: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.text }}>
              {strategy?.title || "Winner Branch"}
            </span>
            <span style={{ color: COLORS.muted, fontSize: 12 }}>
              ({draftWorkspace.strategyVersion})
            </span>
            
            {/* Status indicators */}
            <span
              data-testid="workspace-readiness-badge"
              style={{
                fontSize: 11,
                fontWeight: 700,
                background: strategy?.readiness_state === "ready" ? "rgba(86, 217, 139, 0.15)" : "rgba(240, 184, 77, 0.15)",
                color: strategy?.readiness_state === "ready" ? COLORS.good : COLORS.warning,
                padding: "2px 8px",
                borderRadius: 4,
                textTransform: "uppercase",
              }}
            >
              {strategy?.readiness_state || "READY"}
            </span>
            
            <span
              data-testid="workspace-data-freshness"
              style={{
                fontSize: 11,
                color: activeView?.dataAvailability === "complete" || !activeView?.dataAvailability ? COLORS.good : activeView?.dataAvailability === "partial" ? COLORS.warning : COLORS.muted,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              ● Data: {(activeView?.dataAvailability || "complete").charAt(0).toUpperCase() + (activeView?.dataAvailability || "complete").slice(1)} {dataCutoff ? `(${dataCutoff.includes('T') ? dataCutoff.split('T')[1].slice(0, 5) : dataCutoff})` : ""}
            </span>
            
            <span
              data-testid="workspace-risk-state"
              style={{
                fontSize: 11,
                background:
                  (riskSummary?.state || "normal") === "critical"
                    ? "rgba(235, 87, 87, 0.15)"
                    : (riskSummary?.state || "normal") === "warning" || (riskSummary?.state || "normal") === "watch"
                    ? "rgba(240, 184, 77, 0.15)"
                    : "rgba(86, 217, 139, 0.15)",
                color:
                  (riskSummary?.state || "normal") === "critical"
                    ? COLORS.danger
                    : (riskSummary?.state || "normal") === "warning" || (riskSummary?.state || "normal") === "watch"
                    ? COLORS.warning
                    : COLORS.good,
                padding: "2px 6px",
                borderRadius: 4,
                textTransform: "uppercase",
              }}
            >
              Risk: {riskSummary?.state || "normal"}
            </span>
            
            <span
              data-testid="workspace-pending-decisions"
              style={{
                fontSize: 11,
                background: "rgba(240, 184, 77, 0.15)",
                color: COLORS.warning,
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              {strategy ? pendingEventTotal(strategy) : 0} Pending Decisions
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <span
              data-testid="workspace-dashboard-version"
              style={{
                color: COLORS.textSoft,
                fontSize: 12,
                background: COLORS.panelElevated,
                padding: "4px 8px",
                borderRadius: 4,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              Dashboard v{draftWorkspace.dashboardVersion}
            </span>
          </div>
        </div>

        {/* Row 2: Entrances & Tabs */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              data-testid="workspace-back-to-strategies"
              onClick={onSwitchStrategy}
              style={secondaryButtonStyle}
              type="button"
            >
              切換策略 (Switch Strategy)
            </button>
            <button
              data-testid="workspace-back-to-workshop"
              onClick={onBackToWorkshop}
              style={secondaryButtonStyle}
              type="button"
            >
              開啟策略工坊 (Workshop)
            </button>
            <button
              data-testid="workspace-header-ask-servant"
              onClick={() => {
                if (activeView.widgets[0]) {
                  setRevisionTarget({ viewId: activeView.id, widgetId: activeView.widgets[0].id });
                } else {
                  setToastMessage("Add a widget first to ask Servant for revision.");
                }
              }}
              style={secondaryButtonStyle}
              type="button"
            >
              交代僕人 (Ask Servant)
            </button>
            <button
              data-testid="workspace-header-version-history"
              onClick={() => {
                const el = document.querySelector('[data-testid="workspace-version-history"]');
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              style={secondaryButtonStyle}
              type="button"
            >
              版本紀錄 (Versions)
            </button>
            <button
              data-testid="workspace-edit-mode-toggle"
              onClick={() => setEditMode((prev) => !prev)}
              style={primaryButtonStyle}
              type="button"
            >
              {editMode ? t("agora.tradingRoom.editor.exitAdjust") : t("agora.tradingRoom.editor.adjustLayout")}
            </button>
          </div>
        </div>

        <nav data-testid="workspace-view-tabs" style={{ display: "flex", gap: 6, overflowX: "auto" }}>
          {views.map((view) => (
            <button
              aria-selected={view.id === activeView.id}
              data-testid={`workspace-view-tab-${view.id}`}
              key={view.id}
              onClick={() => setActiveViewId(view.id)}
              style={{
                background: view.id === activeView.id ? "rgba(232, 183, 80, 0.14)" : COLORS.panel,
                border: `1px solid ${view.id === activeView.id ? COLORS.accent : COLORS.border}`,
                borderBottomColor: view.id === activeView.id ? COLORS.accent : COLORS.border,
                borderRadius: 6,
                color: view.id === activeView.id ? COLORS.accent : COLORS.textSoft,
                cursor: "pointer",
                flex: "0 0 auto",
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 10px",
              }}
              type="button"
            >
              {agoraCopy(t, view.titleKey, view.title)}
            </button>
          ))}
        </nav>

        {editMode ? (
          <div
            data-testid="workspace-unsaved-bar"
            style={{
              alignItems: "center",
              background: dirty ? "rgba(240, 184, 77, 0.12)" : COLORS.panel,
              border: `1px solid ${dirty ? "rgba(240, 184, 77, 0.45)" : COLORS.border}`,
              borderRadius: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: "space-between",
              marginTop: 10,
              padding: "8px 10px",
            }}
          >
            <div style={{ color: dirty ? COLORS.warning : COLORS.textSoft, fontSize: 12, fontWeight: 700 }}>
              {dirty ? `${pendingOps.length} unsaved layout operation${pendingOps.length > 1 ? "s" : ""}` : "Grid drop targets and resize handles are active."}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button data-testid="workspace-add-widget-button" onClick={() => setShowAddLibrary((prev) => !prev)} style={secondaryButtonStyle} type="button">
                {t("agora.tradingRoom.editor.addWidget")}
              </button>
              <button data-testid="workspace-save-layout" disabled={!dirty || saveState === "saving"} onClick={handleSave} style={primaryButtonStyle} type="button">
                {saveState === "saving" ? "Saving..." : "Save as new version"}
              </button>
              <button data-testid="workspace-discard-layout" disabled={!dirty || saveState === "saving"} onClick={handleDiscard} style={secondaryButtonStyle} type="button">
                Discard
              </button>
            </div>
          </div>
        ) : null}

        {isNarrowViewport ? (
          <div
            data-testid="workspace-narrow-layout-notice"
            style={{ color: COLORS.textSoft, fontSize: 12, lineHeight: 1.5 }}
          >
            Widgets are shown as a stacked narrow preview. Desktop grid coordinates stay unchanged; explicit add,
            remove, chart, and revision actions remain available.
          </div>
        ) : null}

        {showAddLibrary ? (
          <AddWidgetLibrary
            onAdd={handleAddFromLibrary}
            onClose={() => setShowAddLibrary(false)}
            onAskServant={handleAskServant}
          />
        ) : null}
      </header>

      <div data-testid={`workspace-active-view-${activeView.id}`} style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
        <div style={{ color: COLORS.textSoft, fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
          <strong style={{ color: COLORS.text }}>{agoraCopy(t, activeView.titleKey, activeView.title)}</strong> · {agoraCopy(t, activeView.purposeKey, activeView.purpose)}
          {activeView.warnings?.length ? (
            <div style={{ color: COLORS.warning, marginTop: 4 }}>
              {activeView.warnings.map((warning, index) => (
                <span key={`${activeView.id}-warning-${index}`}>{safeWarningText(warning)}</span>
              ))}
            </div>
          ) : null}
        </div>

        {editMode && removedWidgets.length ? (
          <section data-testid="workspace-restore-library" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 8, marginBottom: 12, padding: 10 }}>
            <strong style={{ color: COLORS.text, fontSize: 12 }}>{t("agora.tradingRoom.editor.restorableWidgets")}</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {removedWidgets.map((widget) => (
                <button
                  data-testid={`workspace-restore-widget-${widget.id}`}
                  key={widget.id}
                  onClick={() => handleRestore(widget)}
                  style={chipButtonStyle}
                  type="button"
                >
                  {agoraCopy(t, widget.titleKey, widget.title)}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div
          data-testid="workspace-grid-drop-surface"
          style={{
            background: editMode
              ? "linear-gradient(rgba(232, 183, 80, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(232, 183, 80, 0.1) 1px, transparent 1px)"
              : "transparent",
            backgroundSize: editMode && !isNarrowViewport ? "110px 74px" : undefined,
            border: editMode ? `1px dashed ${COLORS.borderStrong}` : "1px solid transparent",
            borderRadius: 8,
            minWidth: isNarrowViewport ? 0 : GRID_WIDTH,
            padding: editMode ? 8 : 0,
          }}
        >
          {isNarrowViewport ? (
            <div
              data-testid="workspace-grid-stacked"
              style={{ display: "grid", gap: 12, minWidth: 0, width: "100%" }}
            >
              {[...visibleWidgets]
                .sort((left, right) => left.placement.y - right.placement.y || left.placement.x - right.placement.x)
                .map((widget) => renderWidgetCard(widget, activeView.id, true))}
            </div>
          ) : (
            <GridLayout
              className="layout"
              cols={GRID_COLS}
              draggableHandle=".workspace-widget-drag-handle"
              isDraggable={editMode}
              isResizable={editMode}
              layout={layoutFromWidgets(visibleWidgets)}
              rowHeight={ROW_HEIGHT}
              width={GRID_WIDTH}
              onLayoutChange={handleLayoutChange}
            >
              {visibleWidgets.map((widget) => renderWidgetCard(widget, activeView.id))}
            </GridLayout>
          )}
        </div>

        {error ? (
          <div data-testid="workspace-layout-error" style={{ color: COLORS.danger, fontSize: 13, marginTop: 10 }}>
            {error}
          </div>
        ) : null}

        <section data-testid="workspace-personalization-events" style={{ color: COLORS.muted, fontSize: 12, marginTop: 14 }}>
          Personalization events: {events.length}
          {events[0] ? <span> · latest {events[0].event_type}</span> : null}
        </section>

        {/* Dashboard Version History Section */}
        <section data-testid="workspace-version-history" style={{ marginTop: 24, borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", marginBottom: 12 }}>
            <strong style={{ color: COLORS.text, fontSize: 14 }}>Dashboard Version History</strong>
            {versionError ? <span style={{ color: COLORS.danger, fontSize: 12 }}>{versionError}</span> : null}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {versions.length ? versions.map((version) => {
              const isCurrent = version.dashboardVersion === draftWorkspace.dashboardVersion;
              const authorLabel =
                version.generatedBy === "trading_servant"
                  ? "交易僕人 (Servant)"
                  : version.generatedBy === "learned_personalization"
                  ? "AI 個人化 (Learner)"
                  : "交易員 (Trader)";
                  
              const badgeBg =
                version.generatedBy === "trading_servant"
                  ? "rgba(59, 130, 246, 0.15)"
                  : version.generatedBy === "learned_personalization"
                  ? "rgba(168, 85, 247, 0.15)"
                  : "rgba(232, 183, 80, 0.15)";
              const badgeColor =
                version.generatedBy === "trading_servant"
                  ? "#60a5fa"
                  : version.generatedBy === "learned_personalization"
                  ? "#c084fc"
                  : "#fbbf24";

              return (
                <div
                  data-testid={`workspace-version-${version.id}`}
                  key={version.id}
                  style={{
                    background: isCurrent ? "rgba(86, 217, 139, 0.08)" : COLORS.panel,
                    border: `1px solid ${isCurrent ? COLORS.good : COLORS.border}`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                      <span style={{ color: COLORS.text, fontSize: 13, fontWeight: 800 }}>
                        Version {version.dashboardVersion}
                      </span>
                      {isCurrent && (
                        <span style={{ fontSize: 10, background: "rgba(86, 217, 139, 0.2)", color: COLORS.good, padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                          CURRENT
                        </span>
                      )}
                      <span style={{ fontSize: 11, background: badgeBg, color: badgeColor, padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>
                        {authorLabel}
                      </span>
                    </div>
                    <span style={{ color: COLORS.muted, fontSize: 11 }}>
                      {new Date(version.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.textSoft }}>
                    <strong>Change Summary:</strong> {version.changeSummary}
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.muted }}>
                    <strong>Reason:</strong> {version.changeLog?.reason || "No explicit rationale recorded."}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                    <button
                      data-testid={`workspace-rollback-${version.id}`}
                      disabled={isCurrent || saveState === "saving"}
                      onClick={() => handleRollback(version)}
                      style={{
                        ...secondaryButtonStyle,
                        padding: "4px 10px",
                        fontSize: 11,
                        borderColor: isCurrent ? COLORS.border : COLORS.borderStrong,
                        color: isCurrent ? COLORS.muted : COLORS.text,
                      }}
                      type="button"
                    >
                      Rollback to v{version.dashboardVersion}
                    </button>
                  </div>
                </div>
              );
            }) : (
              <div style={{ color: COLORS.muted, fontSize: 12 }}>No version records returned.</div>
            )}
          </div>
        </section>
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          data-testid="workspace-feedback-toast"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: COLORS.panelElevated,
            border: `1px solid ${COLORS.accent}`,
            borderRadius: 8,
            padding: "12px 16px",
            color: COLORS.text,
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13,
          }}
        >
          <span>💡</span>
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            style={{
              background: "none",
              border: "none",
              color: COLORS.muted,
              cursor: "pointer",
              fontSize: 16,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* New Widget Proposal Preview Modal */}
      {widgetProposal && (
        <div
          data-testid="workspace-widget-proposal-modal"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: COLORS.panelElevated,
              border: `1px solid ${COLORS.borderStrong}`,
              borderRadius: 8,
              maxHeight: "calc(100dvh - 32px)",
              maxWidth: 580,
              overflowY: "auto",
              width: "100%",
              padding: 20,
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 10 }}>
              <strong style={{ color: COLORS.accent, fontSize: 15 }}>交易僕人 - 新 Widget 提案 (Proposal)</strong>
              <span style={{ fontSize: 11, background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", padding: "2px 6px", borderRadius: 4 }}>
                Servant Proposed
              </span>
            </div>

            <div style={{ fontSize: 13, color: COLORS.textSoft }}>
              <strong>Trader Request:</strong> "{widgetProposal.prompt}"
            </div>

            <div style={{ background: COLORS.panel, borderRadius: 6, padding: 12, display: "grid", gap: 6, fontSize: 12, border: `1px solid ${COLORS.border}` }}>
              <div><strong>Problem (解決痛點):</strong> {widgetProposal.problem}</div>
              <div><strong>Data Source:</strong> {widgetProposal.widgetSpec.dataSource}</div>
              <div><strong>Chart Type:</strong> {widgetProposal.widgetSpec.chartSpec.kind.toUpperCase()}</div>
              <div><strong>Mapping:</strong> {widgetProposal.mapping}</div>
              <div><strong>Sensitivity (敏感度):</strong> {widgetProposal.widgetSpec.sensitivity}</div>
            </div>

            <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: "hidden" }}>
              <div style={{ background: COLORS.panel, padding: "6px 10px", fontSize: 11, borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textSoft }}>
                Proposed Widget Preview:
              </div>
              <div style={{ padding: 10, background: COLORS.panelInset, height: 160 }}>
                <ChartSpecRenderer
                  spec={widgetProposal.widgetSpec.chartSpec}
                  widgetType={widgetProposal.widgetSpec.widgetType}
                  dataSource={widgetProposal.widgetSpec.dataSource}
                  isSampleData={true}
                />
              </div>
            </div>

            {isAdjusting ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
                <label style={{ fontSize: 13, color: COLORS.textSoft, fontWeight: "bold" }}>
                  輸入您的調整指示 (Enter adjustment instruction):
                </label>
                <input
                  type="text"
                  value={adjustPromptText}
                  onChange={(e) => setAdjustPromptText(e.target.value)}
                  placeholder="e.g. change type to bar / 換成直條圖"
                  style={{
                    background: COLORS.panel,
                    color: COLORS.text,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 4,
                    padding: "8px 12px",
                    fontSize: 13,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                  data-testid="workspace-widget-proposal-adjust-input"
                />
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    onClick={() => {
                      setIsAdjusting(false);
                      setAdjustPromptText("");
                    }}
                    style={secondaryButtonStyle}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const spec = { ...widgetProposal.widgetSpec };
                      const promptLower = adjustPromptText.toLowerCase();
                      if (promptLower.includes("bar") || promptLower.includes("條")) {
                        spec.chartSpec = { ...spec.chartSpec, kind: "bar" };
                      } else if (promptLower.includes("line") || promptLower.includes("線")) {
                        spec.chartSpec = { ...spec.chartSpec, kind: "line" };
                      } else if (promptLower.includes("restricted") || promptLower.includes("限制")) {
                        spec.sensitivity = "restricted";
                      } else if (promptLower.includes("public") || promptLower.includes("公開")) {
                        spec.sensitivity = "public_market";
                      }
                      setWidgetProposal({
                        ...widgetProposal,
                        prompt: `${widgetProposal.prompt} (Adjusted: ${adjustPromptText})`,
                        widgetSpec: spec,
                      });
                      setIsAdjusting(false);
                      setAdjustPromptText("");
                      setToastMessage("Servant adjusted the widget spec according to your feedback.");
                    }}
                    style={primaryButtonStyle}
                    type="button"
                    data-testid="workspace-widget-proposal-adjust-submit"
                  >
                    Apply Adjustment
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="agora-drawer-action-footer"
                style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 10, width: "100%" }}
              >
                <button
                  onClick={() => setWidgetProposal(null)}
                  style={secondaryButtonStyle}
                  type="button"
                  data-testid="workspace-widget-proposal-reject"
                >
                  Reject (拒絕)
                </button>
                <button
                  onClick={() => {
                    setIsAdjusting(true);
                  }}
                  style={secondaryButtonStyle}
                  type="button"
                  data-testid="workspace-widget-proposal-adjust"
                >
                  Adjust (再微調)
                </button>
                <button
                  onClick={() => {
                    const reqId = `PLG-REQ-${Date.now().toString(36).toUpperCase()}`;
                    setToastMessage(`Frontend widget component request ${reqId} registered.`);
                    setWidgetProposal(null);
                  }}
                  style={secondaryButtonStyle}
                  type="button"
                  data-testid="workspace-widget-proposal-plugin"
                >
                  Plugin Request (新增前端需求)
                </button>
                <button
                  onClick={async () => {
                    const widgetSpec = widgetProposal.widgetSpec;
                    const newOp = { kind: "add_registered_widget" as const, payload: { viewId: activeView.id, widgetSpec } };
                    
                    setSaveState("saving");
                    setError(null);
                    try {
                      const result = await patchTradingRoomWorkspaceLayout(
                        draftWorkspace.id,
                        { operations: [...pendingOps, newOp] },
                        { ifMatch: currentEtag, idempotencyKey: newUUID() },
                      );
                      setBaseWorkspace(cloneWorkspace(result.workspace));
                      setDraftWorkspace(cloneWorkspace(result.workspace));
                      setCurrentEtag(result.etag);
                      setPendingOps([]);
                      setEditMode(false);
                      setSaveState("idle");
                      onWorkspaceChange?.(result);
                      setToastMessage("🎉 New widget proposal accepted and durable layout version created successfully.");
                    } catch (err) {
                      addWidgetSpec(widgetSpec, "ask_servant_create");
                      setToastMessage("New widget proposal added to local draft layout.");
                      setSaveState("idle");
                    }
                    setWidgetProposal(null);
                  }}
                  style={primaryButtonStyle}
                  type="button"
                  data-testid="workspace-widget-proposal-accept"
                >
                  Accept & Version Add (套用)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <WorkspaceWidgetRevisionDrawer
        currentEtag={currentEtag}
        disabledReason={dirty ? t("agora.tradingRoom.editor.saveLayoutBeforeRevision") : null}
        onClose={() => setRevisionTarget(null)}
        onRevisionAccepted={handleRevisionAccepted}
        open={Boolean(revisionTarget)}
        view={revisionView}
        widget={revisionWidget}
        workspace={draftWorkspace}
      />
    </section>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  background: COLORS.accent,
  border: `1px solid ${COLORS.accent}`,
  borderRadius: 6,
  color: "#17120a",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  padding: "6px 10px",
};

const secondaryButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${COLORS.borderStrong}`,
  borderRadius: 6,
  color: COLORS.textSoft,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 10px",
};

const plainButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${COLORS.borderStrong}`,
  borderRadius: 6,
  color: COLORS.textSoft,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
  height: 28,
  lineHeight: 1,
  minWidth: 28,
};

const menuButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  borderRadius: 4,
  color: COLORS.textSoft,
  cursor: "pointer",
  fontSize: 12,
  padding: "6px 8px",
  textAlign: "left",
};

const dangerMenuButtonStyle: React.CSSProperties = {
  ...menuButtonStyle,
  color: COLORS.danger,
};

const chipButtonStyle: React.CSSProperties = {
  background: COLORS.panel,
  border: `1px solid ${COLORS.borderStrong}`,
  borderRadius: 999,
  color: COLORS.textSoft,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 700,
  padding: "4px 8px",
};

export default WorkspaceGridEditor;
