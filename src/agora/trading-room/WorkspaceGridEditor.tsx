import React, { useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
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
}: {
  onAdd: (entry: WidgetRegistryEntry) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const entries = getActiveWidgetTypes()
    .map((widgetType) => getWidgetRegistryEntry(widgetType))
    .filter((entry): entry is WidgetRegistryEntry => Boolean(entry));
  const grouped = entries.reduce<Record<string, WidgetRegistryEntry[]>>((acc, entry) => {
    const category = entry.category || "General";
    acc[category] = [...(acc[category] || []), entry];
    return acc;
  }, {});

  return (
    <DialogPrimitive.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      open
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          style={{ background: "rgba(6, 8, 14, 0.36)", inset: 0, position: "fixed", zIndex: 19 }}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-testid="workspace-add-widget-library"
          onCloseAutoFocus={(event) => {
            const previousFocus = previousFocusRef.current;
            if (previousFocus?.isConnected) {
              event.preventDefault();
              previousFocus.focus();
            }
          }}
          onOpenAutoFocus={() => {
            previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
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
            position: "fixed",
            right: 16,
            top: 116,
            width: 360,
            zIndex: 20,
          }}
        >
          <header style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <DialogPrimitive.Title asChild>
              <strong style={{ color: COLORS.text, fontSize: 13 }}>{t("agora.tradingRoom.editor.addWidget")}</strong>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button aria-label="Close widget library" style={plainButtonStyle} type="button">
                ×
              </button>
            </DialogPrimitive.Close>
          </header>

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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
              <button onClick={onDuplicate} style={menuButtonStyle} type="button">{t("agora.tradingRoom.editor.duplicateWidget")}</button>
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
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ color: COLORS.accent, fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}>
                Trading Room Workspace
              </div>
              <h2 style={{ color: COLORS.text, fontSize: 18, fontWeight: 900, margin: 0 }}>
                {draftWorkspace.strategyId}
              </h2>
            </div>
            <span style={{ background: COLORS.panelElevated, border: `1px solid ${COLORS.borderStrong}`, borderRadius: 999, color: COLORS.textSoft, fontSize: 11, fontWeight: 700, padding: "3px 8px" }}>
              v{draftWorkspace.strategyVersion}
            </span>
            <span
              data-testid="workspace-dashboard-version"
              style={{ background: "rgba(232, 183, 80, 0.14)", border: "1px solid rgba(232, 183, 80, 0.42)", borderRadius: 999, color: COLORS.accent, fontSize: 11, fontWeight: 800, padding: "3px 8px" }}
            >
              dashboard v{draftWorkspace.dashboardVersion}
            </span>
            <span style={{ background: COLORS.panelElevated, border: `1px solid ${COLORS.borderStrong}`, borderRadius: 999, color: COLORS.good, fontSize: 11, fontWeight: 700, padding: "3px 8px" }}>
              {draftWorkspace.status}
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <button
              data-testid="workspace-switch-strategy"
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
                  setError("請先新增 Widget 才能交代僕人修改。");
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
              onClick={() => {
                if (editMode && dirty) {
                  handleDiscard();
                }
                setEditMode((prev) => !prev);
              }}
              style={editMode ? primaryButtonStyle : secondaryButtonStyle}
              type="button"
            >
              {editMode ? t("agora.tradingRoom.editor.exitEditMode") : t("agora.tradingRoom.editor.enterEditMode")}
            </button>
          </div>
        </div>

        {strategy ? (
          <div
            data-testid="workspace-strategy-telemetry"
            style={{
              alignItems: "center",
              background: COLORS.panelInset,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              padding: "8px 12px",
            }}
          >
            <div style={{ color: COLORS.text, fontSize: 12, fontWeight: 800 }}>
              {agoraCopy(t, strategy.nameKey, strategy.name)}
            </div>
            <div style={{ color: COLORS.textSoft, fontSize: 11 }}>
              狀態: <strong style={{ color: strategy.state === "live_ready" ? COLORS.good : COLORS.warning }}>{strategy.state}</strong>
            </div>
            <div style={{ color: COLORS.textSoft, fontSize: 11 }}>
              待處理決策: <strong style={{ color: pendingEventTotal(strategy) > 0 ? COLORS.accent : COLORS.muted }}>{pendingEventTotal(strategy)}</strong>
            </div>
            {riskSummary ? (
              <div style={{ color: COLORS.textSoft, fontSize: 11 }}>
                風險限制: <strong>{riskSummary.max_drawdown_limit_pct}% MDD</strong> · 使用率 <strong>{riskSummary.portfolio_risk_budget_pct}%</strong>
              </div>
            ) : null}
            {dataCutoff ? (
              <div style={{ color: COLORS.muted, fontSize: 11, marginLeft: "auto" }}>
                資料切齊: {dataCutoff}
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <nav aria-label="Workspace views" data-testid="workspace-view-tabs" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {views.map((view) => {
              const active = view.id === activeView.id;
              return (
                <button
                  aria-pressed={active}
                  data-testid={`workspace-view-tab-${view.id}`}
                  key={view.id}
                  onClick={() => setActiveViewId(view.id)}
                  style={{
                    background: active ? COLORS.panelElevated : "transparent",
                    border: `1px solid ${active ? COLORS.borderStrong : "transparent"}`,
                    borderRadius: 6,
                    color: active ? COLORS.accent : COLORS.textSoft,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: active ? 800 : 600,
                    padding: "6px 12px",
                  }}
                  type="button"
                >
                  {agoraCopy(t, view.titleKey, view.title)} ({view.widgetCount})
                </button>
              );
            })}
          </nav>
        </div>

        {error ? (
          <div data-testid="workspace-error" style={{ color: COLORS.danger, fontSize: 12 }}>
            {error}
          </div>
        ) : null}

        {editMode ? (
          <div
            data-testid={dirty ? "workspace-unsaved-bar" : "workspace-edit-toolbar"}
            style={{
              alignItems: "center",
              background: COLORS.panelElevated,
              border: `1px solid ${COLORS.borderStrong}`,
              borderRadius: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              justifyContent: "space-between",
              padding: "8px 12px",
            }}
          >
            <div style={{ color: COLORS.textSoft, fontSize: 12 }}>
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
                  style={secondaryButtonStyle}
                  type="button"
                >
                  {t("agora.tradingRoom.editor.restoreWidget", { title: agoraCopy(t, widget.titleKey, widget.title) })}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {isNarrowViewport ? (
          <div data-testid="workspace-grid-stacked" style={{ display: "grid", gap: 12 }}>
            {visibleWidgets.map((widget) => renderWidgetCard(widget, activeView.id, true))}
          </div>
        ) : (
          <div data-testid="workspace-grid-drop-surface" style={{ minWidth: 1320, width: "100%" }}>
            <GridLayout
              className="layout"
              cols={GRID_COLS}
              data-testid="workspace-grid-layout"
              isDraggable={editMode}
              isResizable={editMode}
              layout={layoutFromWidgets(visibleWidgets)}
              margin={[12, 12]}
              onLayoutChange={handleLayoutChange}
              rowHeight={ROW_HEIGHT}
              width={GRID_WIDTH}
            >
              {visibleWidgets.map((widget) => renderWidgetCard(widget, activeView.id, false))}
            </GridLayout>
          </div>
        )}

        <section
          data-testid="workspace-version-history"
          style={{
            background: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            marginTop: 20,
            padding: 14,
          }}
        >
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <strong style={{ color: COLORS.text, fontSize: 13 }}>{t("agora.tradingRoom.editor.versionHistory")}</strong>
              <div style={{ color: COLORS.muted, fontSize: 11 }}>
                Immutable snapshots and change logs persisted through BFF contracts.
              </div>
            </div>
            <span style={{ color: COLORS.textSoft, fontSize: 11 }}>{versions.length} versions</span>
          </div>

          {versionError ? (
            <div data-testid="workspace-version-error" style={{ color: COLORS.danger, fontSize: 12 }}>
              {versionError}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 8 }}>
            {versions.map((version) => {
              const isCurrent = version.dashboardVersion === draftWorkspace.dashboardVersion;
              return (
                <div
                  data-testid={`workspace-version-${version.id}`}
                  key={version.id}
                  style={{
                    background: isCurrent ? "rgba(232, 183, 80, 0.08)" : COLORS.panelElevated,
                    border: `1px solid ${isCurrent ? "rgba(232, 183, 80, 0.42)" : COLORS.borderStrong}`,
                    borderRadius: 6,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    justifyContent: "space-between",
                    padding: "8px 12px",
                  }}
                >
                  <div>
                    <div style={{ color: COLORS.text, fontSize: 12, fontWeight: 700 }}>
                      v{version.dashboardVersion} · {version.changeSummary || "Dashboard revision"}
                    </div>
                    <div style={{ color: COLORS.muted, fontSize: 11 }}>
                      {version.createdAt} · by{" "}
                      {version.generatedBy === "trading_servant"
                        ? "交易僕人 (Servant)"
                        : version.generatedBy === "user_modified"
                        ? "使用者 (User)"
                        : version.generatedBy}
                    </div>
                  </div>
                  <div style={{ alignItems: "center", display: "flex", gap: 6 }}>
                    {isCurrent ? (
                      <span style={{ color: COLORS.accent, fontSize: 11, fontWeight: 800 }}>current</span>
                    ) : (
                      <button
                        data-testid={`workspace-rollback-${version.id}`}
                        disabled={saveState === "saving"}
                        onClick={() => handleRollback(version)}
                        style={secondaryButtonStyle}
                        type="button"
                      >
                        Rollback
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {events.length ? (
          <section
            data-testid="workspace-personalization-stream"
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              marginTop: 16,
              padding: 14,
            }}
          >
            <strong style={{ color: COLORS.text, fontSize: 13 }}>Personalization telemetry</strong>
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {events.map((event) => (
                <div
                  key={event.event_id}
                  style={{ color: COLORS.textSoft, fontSize: 11 }}
                >
                  {event.occurred_at} · {event.event_type} · {event.target.target_type}:{event.target.target_id}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

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
