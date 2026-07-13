import React from "react";

import type {
  DataAvailabilityStatus,
  TradingRoomViewSpec,
  TradingRoomWorkspaceProposal,
} from "@/lib/bff-v1/agora/tradingRoomTypes";
import { normalizeDataAvailabilityStatus } from "@/lib/bff-v1/agora/dataAvailability";
import {
  safeWarningText,
  validateTradingRoomWidgetSpec,
} from "./workspaceValidation";

const STATUS_LABEL: Record<DataAvailabilityStatus, string> = {
  complete: "完整",
  partial: "部分可用",
  unavailable: "暫不可用",
};

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

const STATUS_COLOR: Record<DataAvailabilityStatus, { bg: string; fg: string; border: string }> = {
  complete: { bg: "rgba(86, 217, 139, 0.13)", fg: COLORS.good, border: "rgba(86, 217, 139, 0.42)" },
  partial: { bg: "rgba(240, 184, 77, 0.14)", fg: COLORS.warning, border: "rgba(240, 184, 77, 0.44)" },
  unavailable: { bg: "rgba(255, 107, 107, 0.13)", fg: COLORS.danger, border: "rgba(255, 107, 107, 0.42)" },
};

function StatusPill({ status }: { status: DataAvailabilityStatus }) {
  const normalizedStatus = normalizeDataAvailabilityStatus(status);
  const color = STATUS_COLOR[normalizedStatus];
  return (
    <span
      style={{
        alignItems: "center",
        background: color.bg,
        border: `1px solid ${color.border}`,
        borderRadius: 999,
        color: color.fg,
        display: "inline-flex",
        flex: "0 0 auto",
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
        padding: "4px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {STATUS_LABEL[normalizedStatus]}
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
        background: COLORS.panelInset,
        border: `1px solid ${COLORS.border}`,
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
              background: valid ? "rgba(232, 183, 80, 0.22)" : "rgba(255, 107, 107, 0.2)",
              border: `1px solid ${valid ? "rgba(232, 183, 80, 0.46)" : "rgba(255, 107, 107, 0.48)"}`,
              borderRadius: 4,
              gridColumn: `${column} / span ${Math.min(width, 13 - column)}`,
              gridRow: `${row} / span ${height}`,
              minHeight: 10,
            }}
          />
        );
      })}
      {widgets.length === 0 ? (
        <span style={{ alignSelf: "center", color: COLORS.muted, fontSize: 12, gridColumn: "1 / -1", justifySelf: "center" }}>
          No widgets
        </span>
      ) : null}
    </div>
  );
}

function ViewProposalCard({
  selected,
  sourceStatuses,
  view,
  onPreview,
}: {
  selected: boolean;
  sourceStatuses: ReadonlyMap<string, DataAvailabilityStatus>;
  view: TradingRoomViewSpec;
  onPreview?: (view: TradingRoomViewSpec) => void;
}) {
  const invalidWidgets = view.widgets
    .map((widget) => ({ widget, validation: validateTradingRoomWidgetSpec(widget) }))
    .filter((entry) => !entry.validation.ok);
  const widgetAvailability = view.widgets.map((widget) => ({
    status: normalizeDataAvailabilityStatus(
      widget.dataAvailability ?? sourceStatuses.get(widget.dataSource) ?? view.dataAvailability,
    ),
    widget,
  }));
  const counts = widgetAvailability.reduce(
    (summary, entry) => ({ ...summary, [entry.status]: summary[entry.status] + 1 }),
    { complete: 0, partial: 0, unavailable: 0 } satisfies Record<DataAvailabilityStatus, number>,
  );
  const degradedWidgets = widgetAvailability.filter((entry) => entry.status !== "complete");
  const availabilitySummary = `${counts.complete} full / ${counts.partial} partial / ${counts.unavailable} missing`;

  return (
    <section
      data-testid={`workspace-proposal-view-${view.id}`}
      style={{
        background: selected ? "#222535" : COLORS.panel,
        border: selected ? `2px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`,
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
        padding: 12,
      }}
    >
      <ProposalThumbnail view={view} />
      <div style={{ alignItems: "flex-start", display: "flex", gap: 10, justifyContent: "space-between", minWidth: 0 }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <h3 style={{ color: COLORS.text, fontSize: 14, fontWeight: 700, lineHeight: 1.25, margin: 0, overflowWrap: "anywhere" }}>{view.title}</h3>
          <p style={{ color: COLORS.textSoft, fontSize: 12, lineHeight: 1.45, margin: "4px 0 0", overflowWrap: "anywhere" }}>{view.purpose}</p>
        </div>
      </div>
      <div style={{ color: COLORS.muted, display: "flex", flexWrap: "wrap", fontSize: 12, gap: 8 }}>
        <span data-testid={`workspace-proposal-view-${view.id}-widget-count`}>{view.widgetCount ?? view.widgets.length} widgets</span>
        <span>{view.layoutTemplate}</span>
      </div>
      {view.rationale ? (
        <p style={{ color: COLORS.textSoft, fontSize: 12, lineHeight: 1.45, margin: 0 }}>{view.rationale}</p>
      ) : null}
      {degradedWidgets.length ? (
        <details data-testid={`workspace-proposal-view-${view.id}-availability`} style={{ color: COLORS.textSoft, fontSize: 12 }}>
          <summary style={{ color: COLORS.warning, cursor: "pointer", fontWeight: 700 }}>
            Data availability: {availabilitySummary}
          </summary>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {degradedWidgets.map(({ status, widget }) => (
              <div key={widget.id} style={{ alignItems: "center", display: "flex", gap: 8, minWidth: 0 }}>
                <StatusPill status={status} />
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{widget.title} · {widget.dataSource}</span>
              </div>
            ))}
          </div>
        </details>
      ) : (
        <div data-testid={`workspace-proposal-view-${view.id}-availability`} style={{ color: COLORS.good, fontSize: 12, fontWeight: 700 }}>
          Data availability: {availabilitySummary}
        </div>
      )}
      {view.warnings?.length ? (
        <ul style={{ color: COLORS.warning, fontSize: 12, margin: 0, paddingLeft: 16 }}>
          {view.warnings.map((warning, index) => (
            <li key={`${view.id}-warning-${index}`}>{safeWarningText(warning)}</li>
          ))}
        </ul>
      ) : null}
      {invalidWidgets.length ? (
        <div data-testid={`workspace-proposal-view-${view.id}-validation`} style={{ color: COLORS.danger, fontSize: 12 }}>
          {invalidWidgets.length} widget validation issue{invalidWidgets.length > 1 ? "s" : ""}
        </div>
      ) : (
        <div data-testid={`workspace-proposal-view-${view.id}-validation`} style={{ color: COLORS.good, fontSize: 12 }}>
          Registry validated
        </div>
      )}
      <button
        data-testid={`workspace-proposal-preview-view-${view.id}`}
        onClick={() => onPreview?.(view)}
        style={{
          alignSelf: "flex-start",
          background: selected ? "rgba(232, 183, 80, 0.14)" : "transparent",
          border: `1px solid ${selected ? COLORS.accent : COLORS.borderStrong}`,
          borderRadius: 6,
          color: selected ? COLORS.accent : COLORS.textSoft,
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
  const availability = normalizeDataAvailabilityStatus(proposal.dataAvailability.status);
  const sourceStatuses = new Map(
    proposal.dataAvailability.sources.map((source) => [
      source.dataSource,
      normalizeDataAvailabilityStatus(source.status),
    ] as const),
  );
  const personalizationItems = proposal.personalizationApplied.items ?? [];
  const selected = selectedViewId ?? proposal.views[0]?.id ?? null;

  return (
    <div
      data-testid="workspace-proposal-preview"
      style={{
        background: COLORS.panelInset,
        color: COLORS.text,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: 16,
      }}
    >
      <header style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", minWidth: 0 }}>
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          <div style={{ color: COLORS.accent, fontSize: 12, fontWeight: 600 }}>Trading Servant Proposal</div>
          <h2 style={{ color: COLORS.text, fontSize: 20, fontWeight: 800, letterSpacing: 0, lineHeight: 1.25, margin: "2px 0 0", overflowWrap: "anywhere" }}>
            {proposal.strategyVersion} - 操盤室提案
          </h2>
          <p style={{ color: COLORS.textSoft, fontSize: 13, lineHeight: 1.5, margin: "6px 0 0", maxWidth: 760 }}>
            {proposal.rationale}
          </p>
        </div>
        <div style={{ alignItems: "flex-end", display: "flex", flex: "0 0 auto", flexDirection: "column", gap: 8 }}>
          <span style={{ color: COLORS.muted, fontSize: 12 }}>Generated {new Date(proposal.generatedAt).toLocaleString()}</span>
          <StatusPill status={availability} />
        </div>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <span style={summaryPillStyle}>
          {proposal.views.length} 個 View
        </span>
        <span style={summaryPillStyle}>
          {proposal.views.reduce((sum, view) => sum + (view.widgetCount ?? view.widgets.length), 0)} widgets
        </span>
        <span style={summaryPillStyle}>
          Personalization {proposal.personalizationApplied.status === "applied" ? "applied" : "not applied"}
        </span>
      </div>

      <section
        data-testid="workspace-proposal-data-availability"
        style={{
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          alignItems: "center",
          display: "flex",
          gap: 8,
          justifyContent: "space-between",
          padding: 12,
        }}
      >
        <span style={{ color: COLORS.textSoft, fontSize: 12, fontWeight: 700 }}>Workspace data availability</span>
        <StatusPill status={availability} />
      </section>

      {personalizationItems.length ? (
        <section data-testid="workspace-proposal-personalization" style={{ color: COLORS.textSoft, fontSize: 12 }}>
          Personalization: {personalizationItems.map((item) => `${item.key}: ${String(item.value)}`).join(" · ")}
        </section>
      ) : null}

      {proposal.warnings.length ? (
        <section data-testid="workspace-proposal-warnings" style={{ color: COLORS.warning, fontSize: 12 }}>
          {proposal.warnings.map((warning, index) => (
            <div key={`proposal-warning-${index}`}>{safeWarningText(warning)}</div>
          ))}
        </section>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
        }}
      >
        {proposal.views.map((view) => (
          <ViewProposalCard
            key={view.id}
            onPreview={onPreviewView}
            selected={selected === view.id}
            sourceStatuses={sourceStatuses}
            view={view}
          />
        ))}
      </div>

      {error ? (
        <div data-testid="workspace-proposal-error" style={{ color: COLORS.danger, fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <footer style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          data-testid="workspace-proposal-accept"
          disabled={busy}
          onClick={onAccept}
          style={{
            background: busy ? "#343b4c" : COLORS.accent,
            border: `1px solid ${busy ? "#485064" : COLORS.accent}`,
            borderRadius: 6,
            color: busy ? COLORS.muted : "#17120a",
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
  background: "transparent",
  border: `1px solid ${COLORS.borderStrong}`,
  borderRadius: 6,
  color: COLORS.textSoft,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  padding: "8px 12px",
};

const summaryPillStyle: React.CSSProperties = {
  background: COLORS.panelElevated,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 999,
  color: COLORS.textSoft,
  fontSize: 12,
  fontWeight: 700,
  padding: "5px 10px",
};

export default WorkspaceProposalPreview;
