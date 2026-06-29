import React, { useEffect, useMemo, useState } from "react";
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
} from "@/lib/bff-v1/agora/tradingRoomTypes";
import {
  listTradingRoomWorkspaceVersions,
  patchTradingRoomWorkspaceLayout,
  rollbackTradingRoomWorkspaceVersion,
  type TradingRoomWorkspaceResult,
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

const GRID_COLS = 12;
const GRID_WIDTH = 1320;
const ROW_HEIGHT = 74;

type SaveState = "idle" | "saving" | "error";

export interface WorkspaceGridEditorProps {
  initialEtag?: string | null;
  initialWorkspace: TradingRoomWorkspace;
  onWorkspaceChange?: (result: TradingRoomWorkspaceResult) => void;
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
  const entries = getActiveWidgetTypes()
    .map((widgetType) => getWidgetRegistryEntry(widgetType))
    .filter((entry): entry is WidgetRegistryEntry => Boolean(entry));
  const grouped = entries.reduce<Record<string, WidgetRegistryEntry[]>>((acc, entry) => {
    const category = entry.category || "custom";
    acc[category] = [...(acc[category] ?? []), entry];
    return acc;
  }, {});

  return (
    <aside
      data-testid="workspace-add-widget-library"
      style={{
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
        maxHeight: 420,
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
        <strong style={{ color: "#0f172a", fontSize: 13 }}>新增 Widget</strong>
        <button aria-label="Close widget library" onClick={onClose} style={plainButtonStyle} type="button">
          ×
        </button>
      </header>
      {Object.entries(grouped).map(([category, categoryEntries]) => (
        <section key={category} style={{ marginTop: 10 }}>
          <div style={{ color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
            {category}
          </div>
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            {categoryEntries.map((entry) => (
              <button
                data-testid={`workspace-add-widget-${entry.widget_type}`}
                key={entry.widget_type}
                onClick={() => onAdd(entry)}
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  color: "#334155",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: "8px 10px",
                  textAlign: "left",
                }}
                type="button"
              >
                <span style={{ color: "#0f172a", display: "block", fontWeight: 700 }}>{entry.display_name}</span>
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
  widget,
}: {
  editMode: boolean;
  menuOpen: boolean;
  onChangeChart: (kind: ChartSpecKind) => void;
  onDuplicate: () => void;
  onMenuToggle: () => void;
  onRemove: () => void;
  onRequestRevision: () => void;
  widget: TradingRoomWidgetSpec;
}) {
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
        background: "#ffffff",
        border: "1px solid #e2e8f0",
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
          borderBottom: "1px solid #e2e8f0",
          cursor: editMode ? "grab" : "default",
          display: "flex",
          gap: 10,
          justifyContent: "space-between",
          minHeight: 42,
          padding: "8px 10px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3 style={{ color: "#0f172a", fontSize: 13, fontWeight: 800, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {widget.title}
          </h3>
          <div style={{ color: "#64748b", fontSize: 11 }}>
            {validation.title} · {formatSensitivityLabel(widget.sensitivity)}
          </div>
        </div>
        <div style={{ alignItems: "center", display: "flex", gap: 6, position: "relative" }}>
          <span
            style={{
              background: validation.ok ? "#ecfdf5" : "#fef2f2",
              border: `1px solid ${validation.ok ? "#a7f3d0" : "#fecaca"}`,
              borderRadius: 999,
              color: validation.ok ? "#047857" : "#b91c1c",
              fontSize: 10,
              fontWeight: 800,
              padding: "3px 7px",
            }}
          >
            {validation.ok ? "validated" : "review"}
          </span>
          {editMode ? (
            <button
              aria-label={`Open widget menu for ${widget.title}`}
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
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
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
              <button onClick={onRequestRevision} style={menuButtonStyle} type="button">交代僕人修改</button>
              <button onClick={onDuplicate} style={menuButtonStyle} type="button">複製 Widget</button>
              <button onClick={onRemove} style={dangerMenuButtonStyle} type="button">移除 Widget</button>
              <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 4, paddingTop: 6 }}>
                <div style={{ color: "#64748b", fontSize: 11, fontWeight: 800, marginBottom: 4 }}>
                  換一種圖表
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {chartKinds.map((kind) => (
                    <button
                      data-testid={`workspace-change-chart-${widget.id}-${kind}`}
                      key={kind}
                      onClick={() => onChangeChart(kind)}
                      style={{
                        ...chipButtonStyle,
                        background: widget.chartSpec.kind === kind ? "#eff6ff" : "#ffffff",
                        color: widget.chartSpec.kind === kind ? "#1d4ed8" : "#334155",
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
      <div style={{ color: "#475569", display: "grid", fontSize: 11, gap: 3, padding: "8px 10px" }}>
        <span>{widget.purpose}</span>
        <span>{widget.dataSource}</span>
        <span>{chartSpecSummary(widget.chartSpec)}</span>
      </div>
      <div style={{ minHeight: 0, flex: 1, padding: "0 10px 10px" }}>
        {validation.ok ? (
          <ChartSpecRenderer data={[]} height={170} spec={widget.chartSpec} />
        ) : (
          <div data-testid={`workspace-widget-${widget.id}-validation`} style={{ color: "#b91c1c", fontSize: 12 }}>
            {validation.messages.join(" ")}
          </div>
        )}
      </div>
    </section>
  );
}

export function WorkspaceGridEditor({
  initialEtag,
  initialWorkspace,
  onWorkspaceChange,
}: WorkspaceGridEditorProps) {
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

  async function refreshVersions(workspaceId: string) {
    try {
      const items = await listTradingRoomWorkspaceVersions(workspaceId);
      setVersions(items);
      setVersionError(null);
    } catch (err) {
      setVersionError(mutationErrorMessage(err));
    }
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
      await refreshVersions(result.workspace.id);
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
      await refreshVersions(result.workspace.id);
    } catch (err) {
      setError(mutationErrorMessage(err));
      setSaveState("error");
    }
  }

  async function handleRevisionAccepted(result: TradingRoomWorkspaceResult) {
    setBaseWorkspace(cloneWorkspace(result.workspace));
    setDraftWorkspace(cloneWorkspace(result.workspace));
    setCurrentEtag(result.etag);
    setPendingOps([]);
    setEditMode(false);
    setSaveState("idle");
    setError(null);
    setRevisionTarget(null);
    onWorkspaceChange?.(result);
    await refreshVersions(result.workspace.id);
  }

  if (!activeView) {
    return (
      <div data-testid="trading-room-workspace-empty" style={{ color: "#94a3b8", fontSize: 13, padding: 16 }}>
        Workspace contains no views.
      </div>
    );
  }

  return (
    <section data-testid="trading-room-workspace-shell" style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
      <header style={{ borderBottom: "1px solid #e2e8f0", padding: "10px 16px", position: "relative" }}>
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700 }}>Workspace Shell</div>
            <h2 style={{ color: "#0f172a", fontSize: 18, fontWeight: 800, letterSpacing: 0, margin: "2px 0 0" }}>
              {draftWorkspace.strategyVersion}
            </h2>
          </div>
          <div style={{ alignItems: "center", color: "#64748b", display: "flex", flexWrap: "wrap", fontSize: 12, gap: 8 }}>
            <span>Status: {draftWorkspace.status}</span>
            <span data-testid="workspace-dashboard-version">Dashboard v{draftWorkspace.dashboardVersion}</span>
            <span>{currentEtag ? "ETag ready" : "ETag missing"}</span>
            <button
              data-testid="workspace-edit-mode-toggle"
              onClick={() => setEditMode((prev) => !prev)}
              style={primaryButtonStyle}
              type="button"
            >
              {editMode ? "離開調整" : "調整版面"}
            </button>
          </div>
        </div>
        <nav data-testid="workspace-view-tabs" style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto" }}>
          {views.map((view) => (
            <button
              aria-selected={view.id === activeView.id}
              data-testid={`workspace-view-tab-${view.id}`}
              key={view.id}
              onClick={() => setActiveViewId(view.id)}
              style={{
                background: view.id === activeView.id ? "#eff6ff" : "#ffffff",
                border: "1px solid #cbd5e1",
                borderBottomColor: view.id === activeView.id ? "#2563eb" : "#cbd5e1",
                borderRadius: 6,
                color: view.id === activeView.id ? "#1d4ed8" : "#334155",
                cursor: "pointer",
                flex: "0 0 auto",
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 10px",
              }}
              type="button"
            >
              {view.title}
            </button>
          ))}
        </nav>

        {editMode ? (
          <div
            data-testid="workspace-unsaved-bar"
            style={{
              alignItems: "center",
              background: dirty ? "#fffbeb" : "#f8fafc",
              border: `1px solid ${dirty ? "#fde68a" : "#e2e8f0"}`,
              borderRadius: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: "space-between",
              marginTop: 10,
              padding: "8px 10px",
            }}
          >
            <div style={{ color: dirty ? "#92400e" : "#475569", fontSize: 12, fontWeight: 700 }}>
              {dirty ? `${pendingOps.length} unsaved layout operation${pendingOps.length > 1 ? "s" : ""}` : "Grid drop targets and resize handles are active."}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button data-testid="workspace-add-widget-button" onClick={() => setShowAddLibrary((prev) => !prev)} style={secondaryButtonStyle} type="button">
                ＋ 新增 Widget
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

        {showAddLibrary ? (
          <AddWidgetLibrary onAdd={handleAddFromLibrary} onClose={() => setShowAddLibrary(false)} />
        ) : null}
      </header>

      <div data-testid={`workspace-active-view-${activeView.id}`} style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
        <div style={{ color: "#475569", fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
          <strong style={{ color: "#0f172a" }}>{activeView.title}</strong> · {activeView.purpose}
          {activeView.warnings?.length ? (
            <div style={{ color: "#b45309", marginTop: 4 }}>
              {activeView.warnings.map((warning, index) => (
                <span key={`${activeView.id}-warning-${index}`}>{safeWarningText(warning)}</span>
              ))}
            </div>
          ) : null}
        </div>

        {editMode && removedWidgets.length ? (
          <section data-testid="workspace-restore-library" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 12, padding: 10 }}>
            <strong style={{ color: "#0f172a", fontSize: 12 }}>可還原 Widget</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {removedWidgets.map((widget) => (
                <button
                  data-testid={`workspace-restore-widget-${widget.id}`}
                  key={widget.id}
                  onClick={() => handleRestore(widget)}
                  style={chipButtonStyle}
                  type="button"
                >
                  {widget.title}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div
          data-testid="workspace-grid-drop-surface"
          style={{
            background: editMode
              ? "linear-gradient(#f8fafc 1px, transparent 1px), linear-gradient(90deg, #f8fafc 1px, transparent 1px)"
              : "transparent",
            backgroundSize: editMode ? "110px 74px" : undefined,
            border: editMode ? "1px dashed #cbd5e1" : "1px solid transparent",
            borderRadius: 8,
            minWidth: GRID_WIDTH,
            padding: editMode ? 8 : 0,
          }}
        >
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
            {visibleWidgets.map((widget) => (
              <div key={widget.id} data-testid={`workspace-grid-cell-${widget.id}`}>
                <WorkspaceWidgetCard
                  editMode={editMode}
                  menuOpen={menuWidgetId === widget.id}
                  onChangeChart={(kind) => handleChangeChart(widget, kind)}
                  onDuplicate={() => handleDuplicate(widget)}
                  onMenuToggle={() => setMenuWidgetId((current) => current === widget.id ? null : widget.id)}
                  onRemove={() => handleRemove(widget)}
                  onRequestRevision={() => {
                    setMenuWidgetId(null);
                    setRevisionTarget({ viewId: activeView.id, widgetId: widget.id });
                  }}
                  widget={widget}
                />
              </div>
            ))}
          </GridLayout>
        </div>

        {error ? (
          <div data-testid="workspace-layout-error" style={{ color: "#b91c1c", fontSize: 13, marginTop: 10 }}>
            {error}
          </div>
        ) : null}

        <section data-testid="workspace-personalization-events" style={{ color: "#475569", fontSize: 12, marginTop: 14 }}>
          Personalization events: {events.length}
          {events[0] ? <span> · latest {events[0].event_type}</span> : null}
        </section>

        <section data-testid="workspace-version-history" style={{ marginTop: 14 }}>
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <strong style={{ color: "#0f172a", fontSize: 13 }}>Dashboard Version History</strong>
            {versionError ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{versionError}</span> : null}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {versions.length ? versions.map((version) => {
              const isCurrent = version.dashboardVersion === draftWorkspace.dashboardVersion;
              return (
                <div
                  data-testid={`workspace-version-${version.id}`}
                  key={version.id}
                  style={{
                    alignItems: "center",
                    background: isCurrent ? "#ecfdf5" : "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    display: "grid",
                    gap: 8,
                    gridTemplateColumns: "90px 1fr auto",
                    padding: "8px 10px",
                  }}
                >
                  <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 800 }}>v{version.dashboardVersion}</span>
                  <span style={{ color: "#475569", fontSize: 12 }}>
                    {version.changeSummary} · {version.changeLog?.reason ?? "-"}
                  </span>
                  <button
                    data-testid={`workspace-rollback-${version.id}`}
                    disabled={isCurrent || saveState === "saving"}
                    onClick={() => handleRollback(version)}
                    style={secondaryButtonStyle}
                    type="button"
                  >
                    Rollback
                  </button>
                </div>
              );
            }) : (
              <div style={{ color: "#94a3b8", fontSize: 12 }}>No version records returned.</div>
            )}
          </div>
        </section>
      </div>
      <WorkspaceWidgetRevisionDrawer
        currentEtag={currentEtag}
        disabledReason={dirty ? "請先儲存或放棄未儲存的版面調整，再建立 Widget Revision Proposal。" : null}
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
  background: "#2563eb",
  border: "1px solid #1d4ed8",
  borderRadius: 6,
  color: "#ffffff",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  padding: "6px 10px",
};

const secondaryButtonStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  color: "#334155",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 10px",
};

const plainButtonStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  color: "#334155",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
  height: 28,
  lineHeight: 1,
  minWidth: 28,
};

const menuButtonStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "none",
  borderRadius: 4,
  color: "#334155",
  cursor: "pointer",
  fontSize: 12,
  padding: "6px 8px",
  textAlign: "left",
};

const dangerMenuButtonStyle: React.CSSProperties = {
  ...menuButtonStyle,
  color: "#b91c1c",
};

const chipButtonStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 999,
  color: "#334155",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 700,
  padding: "4px 8px",
};

export default WorkspaceGridEditor;
