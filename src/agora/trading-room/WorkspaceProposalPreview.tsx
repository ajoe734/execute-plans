import React from "react";

import type {
  TradingRoomViewSpec,
  TradingRoomWidgetSpec,
  TradingRoomWorkspaceProposal,
} from "@/lib/bff-v1/agora/types";

import {
  getWidgetRegistryEntry,
  isBlockedInteractionKind,
  isWidgetInteractionKind,
  validateChartSpecGrammar,
} from "@/agora/widgets/registry";

type DataAvailabilityStatus = "complete" | "partial" | "unavailable";

export interface TradingRoomWidgetValidation {
  ok: boolean;
  title: string;
  messages: string[];
}

const STATUS_LABEL: Record<DataAvailabilityStatus, string> = {
  complete: "完整",
  partial: "部分可用",
  unavailable: "暫不可用",
};

const STATUS_COLOR: Record<DataAvailabilityStatus, { bg: string; fg: string; border: string }> = {
  complete: { bg: "#ecfdf5", fg: "#047857", border: "#a7f3d0" },
  partial: { bg: "#fffbeb", fg: "#b45309", border: "#fde68a" },
  unavailable: { bg: "#fef2f2", fg: "#b91c1c", border: "#fecaca" },
};

function sensitivityRank(value: TradingRoomWidgetSpec["sensitivity"]): number {
  if (value === "public_market") return 0;
  if (value === "user_private") return 1;
  if (value === "restricted") return 3;
  return 2;
}

export function formatSensitivityLabel(value: TradingRoomWidgetSpec["sensitivity"]): string {
  if (value === "public_market") return "公開市場";
  if (value === "user_private") return "使用者私有";
  if (value === "restricted") return "嚴格受限";
  return "受限資料";
}

export function safeWarningText(value: string): string {
  return value
    .replace(/runtime\s*bindings?/giu, "後台執行狀態")
    .replace(/management/giu, "系統治理")
    .replace(new RegExp(["bro", "ker"].join(""), "giu"), "外部連線")
    .replace(/capital\s*binding/giu, "資金連動")
    .replace(/direct\s*orders?/giu, "交易執行");
}

export function validateTradingRoomWidgetSpec(widget: TradingRoomWidgetSpec): TradingRoomWidgetValidation {
  const entry = getWidgetRegistryEntry(widget.widgetType);
  if (!entry) {
    return {
      ok: false,
      title: "Widget type 未註冊",
      messages: [`${widget.widgetType} 不在 Agora widget registry。`],
    };
  }

  const messages: string[] = [];
  if (entry.status !== "active") {
    messages.push(`${entry.display_name} 目前不是 active widget。`);
  }
  if (!entry.allowed_data_sources.includes(widget.dataSource)) {
    messages.push(`${widget.dataSource} 不是 ${entry.display_name} 的允許 data source。`);
  }

  const grammarFailure = validateChartSpecGrammar(widget.chartSpec);
  if (grammarFailure) {
    messages.push(grammarFailure.message);
  } else if (!entry.allowed_chart_kinds.includes(widget.chartSpec.kind)) {
    messages.push(`${widget.chartSpec.kind} 不是 ${entry.display_name} 的允許 ChartSpec kind。`);
  }

  for (const transform of widget.chartSpec.transforms ?? []) {
    if (!entry.allowed_transforms.includes(transform.type)) {
      messages.push(`${transform.type} 不是 ${entry.display_name} 的允許 transform。`);
    }
  }

  const interactions = [...(widget.interactions ?? []), widget.chartSpec.click_action].filter(Boolean);
  for (const interaction of interactions) {
    const kind = interaction?.kind;
    if (!isWidgetInteractionKind(kind) || isBlockedInteractionKind(kind) || !entry.allowed_interactions.includes(kind)) {
      messages.push(`${String(kind)} 不是 ${entry.display_name} 的允許 interaction。`);
    }
  }

  if (sensitivityRank(widget.sensitivity) < sensitivityRank(entry.sensitivity)) {
    messages.push(`${entry.display_name} 需要 ${formatSensitivityLabel(entry.sensitivity)}，proposal 降為 ${formatSensitivityLabel(widget.sensitivity)}。`);
  }

  return {
    ok: messages.length === 0,
    title: entry.display_name,
    messages,
  };
}

function StatusPill({ status }: { status: DataAvailabilityStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      style={{
        alignItems: "center",
        background: color.bg,
        border: `1px solid ${color.border}`,
        borderRadius: 999,
        color: color.fg,
        display: "inline-flex",
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
        padding: "4px 8px",
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function ProposalThumbnail({ view }: { view: TradingRoomViewSpec }) {
  const widgets = view.widgets.slice(0, 12);
  return (
    <div
      aria-label={`${view.title} thumbnail`}
      data-testid={`workspace-proposal-thumbnail-${view.id}`}
      style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        display: "grid",
        gap: 3,
        gridAutoRows: "10px",
        gridTemplateColumns: "repeat(12, 1fr)",
        minHeight: 92,
        padding: 8,
      }}
    >
      {widgets.map((widget, index) => {
        const placement = widget.placement;
        const width = Math.max(1, Math.min(12, placement.width || 3));
        const height = Math.max(1, Math.min(4, placement.height || 2));
        const column = Math.max(1, Math.min(12, (placement.x ?? 0) + 1));
        const row = Math.max(1, (placement.y ?? index) + 1);
        const valid = validateTradingRoomWidgetSpec(widget).ok;
        return (
          <span
            key={widget.id}
            title={widget.title}
            style={{
              background: valid ? "#dbeafe" : "#fee2e2",
              border: `1px solid ${valid ? "#93c5fd" : "#fecaca"}`,
              borderRadius: 4,
              gridColumn: `${column} / span ${Math.min(width, 13 - column)}`,
              gridRow: `${row} / span ${height}`,
              minHeight: 10,
            }}
          />
        );
      })}
      {widgets.length === 0 ? (
        <span style={{ alignSelf: "center", color: "#94a3b8", fontSize: 12, gridColumn: "1 / -1", justifySelf: "center" }}>
          No widgets
        </span>
      ) : null}
    </div>
  );
}

function ViewProposalCard({
  selected,
  view,
  onPreview,
}: {
  selected: boolean;
  view: TradingRoomViewSpec;
  onPreview?: (view: TradingRoomViewSpec) => void;
}) {
  const status = view.dataAvailability ?? "complete";
  const invalidWidgets = view.widgets
    .map((widget) => ({ widget, validation: validateTradingRoomWidgetSpec(widget) }))
    .filter((entry) => !entry.validation.ok);
  const unavailableWidgets = status === "complete" ? [] : view.widgets.map((widget) => widget.title).slice(0, 3);

  return (
    <section
      data-testid={`workspace-proposal-view-${view.id}`}
      style={{
        background: "#ffffff",
        border: selected ? "2px solid #2563eb" : "1px solid #e2e8f0",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
        padding: 12,
      }}
    >
      <ProposalThumbnail view={view} />
      <div style={{ alignItems: "flex-start", display: "flex", gap: 10, justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ color: "#0f172a", fontSize: 14, fontWeight: 700, margin: 0 }}>{view.title}</h3>
          <p style={{ color: "#475569", fontSize: 12, lineHeight: 1.45, margin: "4px 0 0" }}>{view.purpose}</p>
        </div>
        <StatusPill status={status} />
      </div>
      <div style={{ color: "#64748b", display: "flex", flexWrap: "wrap", fontSize: 12, gap: 8 }}>
        <span data-testid={`workspace-proposal-view-${view.id}-widget-count`}>{view.widgetCount ?? view.widgets.length} widgets</span>
        <span>{view.layoutTemplate}</span>
      </div>
      {view.rationale ? (
        <p style={{ color: "#334155", fontSize: 12, lineHeight: 1.45, margin: 0 }}>{view.rationale}</p>
      ) : null}
      {unavailableWidgets.length ? (
        <div style={{ color: "#b45309", fontSize: 12 }} data-testid={`workspace-proposal-view-${view.id}-data-gaps`}>
          資料狀態需確認: {unavailableWidgets.join("、")}
        </div>
      ) : null}
      {view.warnings?.length ? (
        <ul style={{ color: "#b45309", fontSize: 12, margin: 0, paddingLeft: 16 }}>
          {view.warnings.map((warning, index) => (
            <li key={`${view.id}-warning-${index}`}>{safeWarningText(warning)}</li>
          ))}
        </ul>
      ) : null}
      {invalidWidgets.length ? (
        <div data-testid={`workspace-proposal-view-${view.id}-validation`} style={{ color: "#b91c1c", fontSize: 12 }}>
          {invalidWidgets.length} widget validation issue{invalidWidgets.length > 1 ? "s" : ""}
        </div>
      ) : (
        <div data-testid={`workspace-proposal-view-${view.id}-validation`} style={{ color: "#047857", fontSize: 12 }}>
          Registry validated
        </div>
      )}
      <button
        data-testid={`workspace-proposal-preview-view-${view.id}`}
        onClick={() => onPreview?.(view)}
        style={{
          alignSelf: "flex-start",
          background: selected ? "#eff6ff" : "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: 6,
          color: "#1e40af",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          padding: "6px 10px",
        }}
        type="button"
      >
        逐頁預覽
      </button>
    </section>
  );
}

export interface WorkspaceProposalPreviewProps {
  busy?: boolean;
  error?: string | null;
  proposal: TradingRoomWorkspaceProposal;
  selectedViewId?: string | null;
  onAccept: () => void;
  onAdjustLayout?: () => void;
  onBackToWorkshop?: () => void;
  onPreviewView?: (view: TradingRoomViewSpec) => void;
  onRegenerate?: () => void;
}

export function WorkspaceProposalPreview({
  busy = false,
  error,
  onAccept,
  onAdjustLayout,
  onBackToWorkshop,
  onPreviewView,
  onRegenerate,
  proposal,
  selectedViewId,
}: WorkspaceProposalPreviewProps) {
  const availability = proposal.dataAvailability.status;
  const personalizationItems = proposal.personalizationApplied.items ?? [];
  const selected = selectedViewId ?? proposal.views[0]?.id ?? null;

  return (
    <div data-testid="workspace-proposal-preview" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 16 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#64748b", fontSize: 12, fontWeight: 600 }}>Trading Servant Proposal</div>
          <h2 style={{ color: "#0f172a", fontSize: 20, fontWeight: 800, letterSpacing: 0, margin: "2px 0 0" }}>
            {proposal.strategyVersion} — 操盤室提案
          </h2>
          <p style={{ color: "#475569", fontSize: 13, lineHeight: 1.5, margin: "6px 0 0", maxWidth: 760 }}>
            {proposal.rationale}
          </p>
        </div>
        <div style={{ alignItems: "flex-end", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ color: "#475569", fontSize: 12 }}>Generated {new Date(proposal.generatedAt).toLocaleString()}</span>
          <StatusPill status={availability} />
        </div>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <span style={{ background: "#eef2ff", borderRadius: 999, color: "#3730a3", fontSize: 12, fontWeight: 700, padding: "5px 10px" }}>
          {proposal.views.length} 個 View
        </span>
        <span style={{ background: "#f1f5f9", borderRadius: 999, color: "#334155", fontSize: 12, fontWeight: 700, padding: "5px 10px" }}>
          {proposal.views.reduce((sum, view) => sum + (view.widgetCount ?? view.widgets.length), 0)} widgets
        </span>
        <span style={{ background: "#f1f5f9", borderRadius: 999, color: "#334155", fontSize: 12, fontWeight: 700, padding: "5px 10px" }}>
          Personalization {proposal.personalizationApplied.status === "applied" ? "applied" : "not applied"}
        </span>
      </div>

      <section
        data-testid="workspace-proposal-data-availability"
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          padding: 12,
        }}
      >
        {proposal.dataAvailability.sources.map((source) => (
          <div key={source.dataSource} style={{ minWidth: 0 }}>
            <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <StatusPill status={source.status} />
              <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 700 }}>{source.dataSource}</span>
            </div>
            {source.reason ? <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{source.reason}</div> : null}
          </div>
        ))}
      </section>

      {personalizationItems.length ? (
        <section data-testid="workspace-proposal-personalization" style={{ color: "#334155", fontSize: 12 }}>
          Personalization: {personalizationItems.map((item) => `${item.key}: ${String(item.value)}`).join(" · ")}
        </section>
      ) : null}

      {proposal.warnings.length ? (
        <section data-testid="workspace-proposal-warnings" style={{ color: "#b45309", fontSize: 12 }}>
          {proposal.warnings.map((warning, index) => (
            <div key={`proposal-warning-${index}`}>{safeWarningText(warning)}</div>
          ))}
        </section>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}
      >
        {proposal.views.map((view) => (
          <ViewProposalCard
            key={view.id}
            onPreview={onPreviewView}
            selected={selected === view.id}
            view={view}
          />
        ))}
      </div>

      {error ? (
        <div data-testid="workspace-proposal-error" style={{ color: "#b91c1c", fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <footer style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          data-testid="workspace-proposal-accept"
          disabled={busy}
          onClick={onAccept}
          style={{
            background: busy ? "#94a3b8" : "#2563eb",
            border: "1px solid #1d4ed8",
            borderRadius: 6,
            color: "#ffffff",
            cursor: busy ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 700,
            padding: "8px 12px",
          }}
          type="button"
        >
          套用完整提案
        </button>
        <button data-testid="workspace-proposal-preview-first" onClick={() => proposal.views[0] && onPreviewView?.(proposal.views[0])} style={secondaryButtonStyle} type="button">
          逐頁預覽
        </button>
        <button data-testid="workspace-proposal-adjust-layout" onClick={onAdjustLayout} style={secondaryButtonStyle} type="button">
          先調整版面
        </button>
        <button data-testid="workspace-proposal-regenerate" onClick={onRegenerate} style={secondaryButtonStyle} type="button">
          重新產生
        </button>
        <button data-testid="workspace-proposal-back" onClick={onBackToWorkshop} style={secondaryButtonStyle} type="button">
          回到策略工坊
        </button>
      </footer>
    </div>
  );
}

const secondaryButtonStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  color: "#334155",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  padding: "8px 12px",
};

export default WorkspaceProposalPreview;
