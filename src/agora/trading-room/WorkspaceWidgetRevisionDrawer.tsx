import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import type {
  DataAvailabilityStatus,
  TradingRoomViewSpec,
  TradingRoomWidgetSpec,
  TradingRoomWorkspace,
  WidgetRevisionProposal,
} from "@/lib/bff-v1/agora/tradingRoomTypes";
import {
  acceptWidgetRevisionProposal,
  createWidgetRevisionProposal,
  type WidgetRevisionAcceptResult,
} from "@/lib/bff-v1/agora/tradingRoom";
import { BffError } from "@/lib/bff-v1/errors";
import {
  getWidgetRegistryEntry,
  type ChartSpecKind,
} from "@/agora/widgets/registry";
import ChartSpecRenderer from "@/agora/widgets/ChartSpecRenderer";
import {
  safeWarningText,
  validateTradingRoomWidgetSpec,
} from "./workspaceValidation";
import { chartSpecForKind, chartSpecSummary } from "./workspaceChartSpec";

const QUICK_INSTRUCTIONS = [
  "heatmap", "cluster", "recent", "sortableTable", "split", "eventWindow",
];

type SubmitState = "idle" | "creating" | "ready" | "accepting" | "error";

interface RevisionUiError {
  code?: string;
  message: string;
  status?: number;
}

interface RevisionDraft {
  proposedSpec: TradingRoomWidgetSpec;
  rationale: string;
  warnings: string[];
  dataAvailability: DataAvailabilityStatus;
}

interface DiffRow {
  after: string;
  before: string;
  changed: boolean;
  id: string;
  label: string;
}

export interface WorkspaceWidgetRevisionDrawerProps {
  currentEtag?: string | null;
  disabledReason?: string | null;
  onClose: () => void;
  onRevisionAccepted: (result: WidgetRevisionAcceptResult) => void | Promise<void>;
  open: boolean;
  view?: TradingRoomViewSpec | null;
  widget?: TradingRoomWidgetSpec | null;
  workspace: TradingRoomWorkspace;
}

function cloneWidget(widget: TradingRoomWidgetSpec): TradingRoomWidgetSpec {
  return JSON.parse(JSON.stringify(widget)) as TradingRoomWidgetSpec;
}

function stableText(value: unknown): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value || "-";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function fieldSummary(widget: TradingRoomWidgetSpec): string {
  const fields = Object.values(widget.chartSpec.encodings ?? {})
    .map((encoding) => encoding.field)
    .filter(Boolean);
  return Array.from(new Set(fields)).join(", ") || "-";
}

function relatedEvidence(widget: TradingRoomWidgetSpec, view?: TradingRoomViewSpec | null): string {
  const evidenceInteraction = widget.interactions.find((interaction) => interaction.kind === "open_evidence");
  const parts = [
    widget.whyIncluded,
    evidenceInteraction ? "open_evidence interaction" : undefined,
    view?.rationale,
  ].filter(Boolean);
  return parts.join(" · ") || "-";
}

function interactionSummary(widget: TradingRoomWidgetSpec): string {
  return widget.interactions
    .map((interaction) => {
      const payload = interaction.payload ? ` ${stableText(interaction.payload)}` : "";
      return `${interaction.kind}${payload}`;
    })
    .join(" · ") || "-";
}

function placementSummary(widget: TradingRoomWidgetSpec): string {
  const placement = widget.placement;
  const maxWidth = placement.maxWidth ?? widget.maxSize.width;
  const maxHeight = placement.maxHeight ?? widget.maxSize.height;
  return [
    `x:${placement.x}`,
    `y:${placement.y}`,
    `w:${placement.width}`,
    `h:${placement.height}`,
    `min:${placement.minWidth}x${placement.minHeight}`,
    `max:${maxWidth}x${maxHeight}`,
  ].join(" · ");
}

function warningSummary(view?: TradingRoomViewSpec | null): string {
  const warnings = (view?.warnings ?? []).map(safeWarningText).filter(Boolean);
  return warnings.join(" · ") || "-";
}

function dataAvailabilitySummary(view?: TradingRoomViewSpec | null): string {
  return view?.dataAvailability ?? "-";
}

function chartDiffSummary(widget: TradingRoomWidgetSpec): string {
  return `${chartSpecSummary(widget.chartSpec)} · ${stableText(widget.chartSpec)}`;
}

function buildWidgetDiffRows(before: TradingRoomWidgetSpec, after: TradingRoomWidgetSpec | null, t: TFunction): DiffRow[] {
  if (!after) return [];
  const rows: Array<Omit<DiffRow, "changed">> = [
    { id: "title", label: t("agora.tradingRoom.drawer.fields.title"), before: before.title, after: after.title },
    { id: "widget-type", label: t("agora.tradingRoom.drawer.fields.widgetType"), before: before.widgetType, after: after.widgetType },
    { id: "data-source", label: t("agora.tradingRoom.drawer.fields.dataSource"), before: before.dataSource, after: after.dataSource },
    { id: "query-filters", label: t("agora.tradingRoom.drawer.fields.queryFilters"), before: stableText(before.query.filters), after: stableText(after.query.filters) },
    { id: "query-window", label: t("agora.tradingRoom.drawer.fields.queryWindow"), before: before.query.window ?? "-", after: after.query.window ?? "-" },
    { id: "query-sort", label: t("agora.tradingRoom.drawer.fields.querySort"), before: stableText(before.query.sort), after: stableText(after.query.sort) },
    { id: "query-limit", label: t("agora.tradingRoom.drawer.fields.queryLimit"), before: stableText(before.query.limit), after: stableText(after.query.limit) },
    { id: "chart-spec", label: t("agora.tradingRoom.drawer.fields.chartSpec"), before: chartDiffSummary(before), after: chartDiffSummary(after) },
    { id: "interactions", label: t("agora.tradingRoom.drawer.fields.interactions"), before: interactionSummary(before), after: interactionSummary(after) },
    { id: "sensitivity", label: t("agora.tradingRoom.drawer.fields.sensitivity"), before: before.sensitivity, after: after.sensitivity },
    { id: "placement", label: t("agora.tradingRoom.drawer.fields.placement"), before: placementSummary(before), after: placementSummary(after) },
  ];
  return rows.map((row) => ({ ...row, changed: row.before !== row.after }));
}

function revisionErrorMessage(error: BffError, fallback: string, t: TFunction): string {
  switch (error.status) {
    case 403:
      return t("agora.tradingRoom.errors.createRevisionForbidden");
    case 404:
      return t("agora.tradingRoom.errors.workspaceNotFound");
    case 412:
      return t("agora.tradingRoom.errors.workspaceStale");
    case 422:
      return error.message || t("agora.tradingRoom.errors.proposalInvalid");
    case 502:
      return t("agora.tradingRoom.errors.proposalIncomplete");
    default:
      return error.message || fallback;
  }
}

function toRevisionUiError(error: unknown, fallback: string, t: TFunction): RevisionUiError {
  if (error instanceof BffError) {
    return {
      code: error.code,
      message: revisionErrorMessage(error, fallback, t),
      status: error.status,
    };
  }
  return {
    message: error instanceof Error ? error.message : fallback,
  };
}

function requestedChartKind(instruction: string, allowedKinds: readonly ChartSpecKind[]): ChartSpecKind | null {
  const text = instruction.toLowerCase();
  const candidates: Array<[RegExp, ChartSpecKind]> = [
    [/熱圖|heatmap/u, "heatmap"],
    [/表格|table|排序/u, "table"],
    [/network|網路圖|關係/u, "network"],
    [/timeline|時間軸|事件/u, "timeline"],
    [/line|折線|疊加/u, "line"],
    [/bar|長條/u, "bar"],
    [/scatter|散佈/u, "scatter"],
    [/sankey|流向/u, "sankey"],
    [/gauge|儀表/u, "gauge"],
    [/metric|指標/u, "metric"],
  ];
  const match = candidates.find(([pattern, kind]) => pattern.test(text) && allowedKinds.includes(kind));
  return match?.[1] ?? null;
}

function revisedTitle(title: string, instruction: string): string {
  if (/熱圖|heatmap/u.test(instruction)) return `${title} Heatmap`;
  if (/表格|table|排序/u.test(instruction)) return `${title} Table`;
  if (/cluster|疊加|統一/u.test(instruction)) return `${title} Cluster-adjusted`;
  if (/20 ?日|最近/u.test(instruction)) return `${title} 20D`;
  return `${title} Revised`;
}

function buildRevisionDraft(
  widget: TradingRoomWidgetSpec,
  view: TradingRoomViewSpec | null | undefined,
  workspace: TradingRoomWorkspace,
  instruction: string,
): RevisionDraft {
  const entry = getWidgetRegistryEntry(widget.widgetType);
  const proposedSpec = cloneWidget(widget);
  const allowedKinds = entry?.allowed_chart_kinds ?? [];
  const nextKind = requestedChartKind(instruction, allowedKinds);
  const warnings: string[] = [];
  let dataAvailability: DataAvailabilityStatus = view?.dataAvailability ?? "complete";

  if (nextKind && nextKind !== widget.chartSpec.kind) {
    proposedSpec.chartSpec = chartSpecForKind(nextKind);
  }

  if (/20 ?日|最近/u.test(instruction)) {
    proposedSpec.query = { ...proposedSpec.query, window: "20d" };
  }
  if (/三億|3 ?億|低量|成交/u.test(instruction)) {
    proposedSpec.query = {
      ...proposedSpec.query,
      filters: {
        ...proposedSpec.query.filters,
        min_daily_turnover_twd: 300000000,
      },
    };
  }
  if (/前 ?60|後 ?20|重大訊息|事件/u.test(instruction)) {
    proposedSpec.query = { ...proposedSpec.query, window: "event_-60d_to_20d" };
  }
  if (/前 ?10|top ?10|前十/u.test(instruction)) {
    proposedSpec.query = { ...proposedSpec.query, limit: 10 };
  }
  if (/cluster|統一|疊加/u.test(instruction)) {
    proposedSpec.query = {
      ...proposedSpec.query,
      filters: {
        ...proposedSpec.query.filters,
        cluster_adjusted: true,
      },
    };
    dataAvailability = dataAvailability === "unavailable" ? "unavailable" : "partial";
    warnings.push("Cluster-adjusted flow uses probabilistic branch relationship evidence; inferred links remain marked.");
  }

  proposedSpec.title = revisedTitle(widget.title, instruction).slice(0, 96);
  proposedSpec.purpose = `${widget.purpose} Revision requested by the trader for: ${instruction}`.slice(0, 240);
  proposedSpec.whyIncluded = `${widget.whyIncluded} Revision keeps the same allowlisted widget type and data source for ${workspace.strategyVersion}.`.slice(0, 260);
  proposedSpec.interactions = widget.interactions.some((interaction) => interaction.kind === "request_widget_revision")
    ? widget.interactions
    : [...widget.interactions, { kind: "request_widget_revision" }];

  const rationale = nextKind && nextKind !== widget.chartSpec.kind
    ? `目前 ${widget.chartSpec.kind} 適合觀察原始脈絡；${nextKind} 更適合回應這次調整需求並保留原 data source。`
    : "我會保留原 Widget 型別與資料來源，只調整受控 query/chart spec，讓這張圖更貼近這次裁示。";

  return {
    dataAvailability,
    proposedSpec,
    rationale,
    warnings: [...(view?.warnings ?? []), ...warnings].map(safeWarningText),
  };
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 3 }}>
      <span style={{ color: "#8793a8", fontSize: 11, fontWeight: 800 }}>{label}</span>
      <span style={{ color: "#e9edf5", fontSize: 12, lineHeight: 1.45, overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );
}

function FieldDiffTable({ durable, rows }: { durable: boolean; rows: DiffRow[] }) {
  const { t } = useTranslation();
  return (
    <div
      data-durable-snapshot={durable ? "backend-proposal" : "draft-preview"}
      data-testid="workspace-widget-before-after-diff"
      style={{
        background: "#171b25",
        border: "1px solid #343b4c",
        borderRadius: 10,
        display: "grid",
        gap: 0,
        marginTop: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ color: "#8793a8", fontSize: 11, fontWeight: 900, padding: "9px 10px" }}>
        {t(durable ? "agora.tradingRoom.drawer.backendDiff" : "agora.tradingRoom.drawer.draftDiff")}
      </div>
      <div
        style={{
          background: "#202532",
          borderTop: "1px solid #343b4c",
          color: "#8793a8",
          display: "grid",
          fontSize: 11,
          fontWeight: 900,
          gridTemplateColumns: "112px minmax(0, 1fr) minmax(0, 1fr)",
        }}
      >
        <span style={{ padding: "8px 10px" }}>{t("agora.tradingRoom.drawer.field")}</span>
        <span style={{ padding: "8px 10px" }}>{t("agora.tradingRoom.drawer.before")}</span>
        <span style={{ padding: "8px 10px" }}>{t("agora.tradingRoom.drawer.after")}</span>
      </div>
      {rows.map((row) => (
        <div
          data-changed={row.changed ? "true" : "false"}
          data-testid={`workspace-widget-diff-${row.id}`}
          key={row.id}
          style={{
            borderTop: "1px solid #343b4c",
            display: "grid",
            gridTemplateColumns: "112px minmax(0, 1fr) minmax(0, 1fr)",
          }}
        >
          <span style={{ color: row.changed ? "#f0b84d" : "#8793a8", fontSize: 11, fontWeight: 900, padding: "8px 10px" }}>
            {row.label}
          </span>
          <span style={diffCellStyle}>{row.before}</span>
          <span style={{ ...diffCellStyle, color: row.changed ? "#f6f8fc" : "#9aa5b8" }}>{row.after}</span>
        </div>
      ))}
    </div>
  );
}

export function WorkspaceWidgetRevisionDrawer({
  currentEtag,
  disabledReason,
  onClose,
  onRevisionAccepted,
  open,
  view,
  widget,
  workspace,
}: WorkspaceWidgetRevisionDrawerProps) {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<WidgetRevisionProposal | null>(null);
  const [proposalEtag, setProposalEtag] = useState<string | null>(null);
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<RevisionUiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setInstruction("");
    setProposal(null);
    setProposalEtag(null);
    setState("idle");
    setError(null);
  }, [open, widget?.id]);

  const draft = useMemo(() => {
    const text = instruction.trim();
    if (!widget || !text) return null;
    return buildRevisionDraft(widget, view, workspace, text);
  }, [instruction, view, widget, workspace]);

  if (!open || !widget) return null;

  const validation = draft ? validateTradingRoomWidgetSpec(draft.proposedSpec) : null;
  const canSubmit = Boolean(instruction.trim()) && state !== "creating" && state !== "accepting" && !disabledReason;
  const canAccept = Boolean(proposal && currentEtag) && state !== "accepting";

  async function submitProposal(event: React.FormEvent) {
    event.preventDefault();
    if (!widget || !draft || !view) return;
    if (disabledReason) {
      setError({ message: disabledReason });
      setState("error");
      return;
    }
    if (!validation?.ok) {
      setError({ message: validation?.messages.join(" ") || "Widget revision validation failed." });
      setState("error");
      return;
    }
    setState("creating");
    setError(null);
    setProposal(null);
    setProposalEtag(null);
    try {
      const result = await createWidgetRevisionProposal(
        workspace.id,
        widget.id,
        {
          dataAvailability: draft.dataAvailability,
          instruction: instruction.trim(),
          proposedSpec: draft.proposedSpec,
          rationale: draft.rationale,
          viewId: view.id,
          warnings: draft.warnings,
        },
        { idempotencyKey: newUUID() },
      );
      setProposal(result.proposal);
      setProposalEtag(result.etag);
      setState("ready");
    } catch (err) {
      setError(toRevisionUiError(err, "Widget revision proposal failed.", t));
      setState("error");
    }
  }

  async function acceptProposal(acceptanceAction: "apply" | "keep_original_add_modified_copy") {
    if (!proposal || !currentEtag) {
      setError({ message: "Workspace ETag is required before applying a widget revision." });
      setState("error");
      return;
    }
    setState("accepting");
    setError(null);
    try {
      const result = await acceptWidgetRevisionProposal(
        proposal.id,
        {
          acceptanceAction,
          copyWidgetId: acceptanceAction === "keep_original_add_modified_copy"
            ? `${proposal.widgetId}_copy_${Date.now().toString(36)}`
            : undefined,
        },
        { ifMatch: currentEtag, idempotencyKey: newUUID() },
      );
      await onRevisionAccepted(result);
      onClose();
    } catch (err) {
      setError(toRevisionUiError(err, "Widget revision acceptance failed.", t));
      setState("error");
    }
  }

  function adjustAgain() {
    setProposal(null);
    setProposalEtag(null);
    setState("idle");
    setError(null);
  }

  const beforeSpec = proposal?.beforeSpec ?? widget;
  const afterSpec = proposal?.proposedSpec ?? draft?.proposedSpec ?? null;
  const diffRows = buildWidgetDiffRows(beforeSpec, afterSpec, t);

  return (
    <div
      data-testid="workspace-widget-revision-overlay"
      onClick={onClose}
      style={{
        background: "rgba(6, 8, 14, 0.64)",
        bottom: 0,
        display: "flex",
        justifyContent: "flex-end",
        left: 0,
        position: "fixed",
        right: 0,
        top: 0,
        zIndex: 80,
      }}
    >
      <aside
        aria-label={t("agora.tradingRoom.drawer.title")}
        data-testid="workspace-widget-revision-drawer"
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "#202532",
          borderLeft: "1px solid #3a4254",
          color: "#f6f8fc",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          maxWidth: "100%",
          width: 520,
        }}
      >
        <header style={{ borderBottom: "1px solid #343b4c", display: "flex", justifyContent: "space-between", gap: 12, padding: "18px 20px" }}>
          <div>
            <div style={{ color: "#f0b84d", fontSize: 12, fontWeight: 900 }}>{t("agora.tradingRoom.drawer.title")}</div>
            <h2 style={{ color: "#ffffff", fontSize: 16, fontWeight: 900, letterSpacing: 0, margin: "3px 0 0" }}>
              {t("agora.tradingRoom.drawer.heading")}
            </h2>
            <div style={{ color: "#9aa5b8", fontSize: 12, marginTop: 3 }}>{widget.title}</div>
          </div>
          <button aria-label={t("agora.tradingRoom.drawer.close")} onClick={onClose} style={iconButtonStyle} type="button">
            ×
          </button>
        </header>

        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 18px" }}>
          <section data-testid="workspace-widget-revision-context" style={{ background: "#171b25", border: "1px solid #343b4c", borderRadius: 10, display: "grid", gap: 12, padding: 14 }}>
            <ContextRow label={t("agora.tradingRoom.drawer.context.workspace")} value={`${workspace.id} / dashboard v${workspace.dashboardVersion}`} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.strategy")} value={`${workspace.strategyId} / ${workspace.strategyVersion}`} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.view")} value={view ? `${view.title} (${view.id})` : "-"} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.widgetId")} value={widget.id} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.widgetTitle")} value={widget.title} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.widgetType")} value={widget.widgetType} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.purpose")} value={widget.purpose} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.whyIncluded")} value={widget.whyIncluded} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.dataSource")} value={widget.dataSource} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.fields")} value={fieldSummary(widget)} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.filters")} value={stableText(widget.query.filters)} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.sort")} value={stableText(widget.query.sort)} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.limit")} value={stableText(widget.query.limit)} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.window")} value={widget.query.window ?? "-"} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.chart")} value={chartSpecSummary(widget.chartSpec)} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.interactions")} value={interactionSummary(widget)} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.sensitivity")} value={widget.sensitivity} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.placement")} value={placementSummary(widget)} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.availability")} value={dataAvailabilitySummary(view)} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.warnings")} value={warningSummary(view)} />
            <ContextRow label={t("agora.tradingRoom.drawer.context.evidence")} value={relatedEvidence(widget, view)} />
          </section>

          {disabledReason ? (
            <div data-testid="workspace-widget-revision-disabled" style={warningStyle}>
              {disabledReason}
            </div>
          ) : null}

          <form onSubmit={submitProposal} style={{ display: "grid", gap: 10, marginTop: 14 }}>
            <textarea
              data-testid="workspace-widget-revision-input"
              onChange={(event) => setInstruction(event.target.value)}
              placeholder={t("agora.tradingRoom.drawer.placeholder")}
              style={textareaStyle}
              value={instruction}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {QUICK_INSTRUCTIONS.map((key) => {
                const text = t(`agora.tradingRoom.drawer.quick.${key}`);
                return (
                <button
                  key={key}
                  onClick={() => {
                    setInstruction(text);
                    adjustAgain();
                  }}
                  style={chipButtonStyle}
                  type="button"
                >
                  {text}
                </button>
                );
              })}
            </div>
            <button
              data-testid="workspace-widget-revision-submit"
              disabled={!canSubmit}
              style={canSubmit ? primaryButtonStyle : disabledButtonStyle}
              type="submit"
            >
              {state === "creating" ? t("agora.tradingRoom.drawer.creating") : t("agora.tradingRoom.drawer.submit")}
            </button>
          </form>

          {error ? (
            <div
              data-error-code={error.code}
              data-error-status={error.status}
              data-testid="workspace-widget-revision-error"
              role="alert"
              style={errorStyle}
            >
              {error.message}
            </div>
          ) : null}

          {proposal ? (
            <section data-testid="workspace-widget-revision-proposal" style={{ display: "grid", gap: 12, marginTop: 16 }}>
              <div style={{ background: "#283021", border: "1px solid #76652e", borderRadius: 10, padding: 13 }}>
                <div style={{ color: "#f0b84d", fontSize: 11, fontWeight: 900, marginBottom: 6 }}>{t("agora.tradingRoom.drawer.proposalReady")}</div>
                <div style={{ color: "#f3f6fb", fontSize: 13, lineHeight: 1.6 }}>{proposal.rationale}</div>
                {proposalEtag ? <div style={{ color: "#8793a8", fontSize: 11, marginTop: 8 }}>{t("agora.tradingRoom.drawer.etagReady")}</div> : null}
              </div>
              {proposal.warnings.length ? (
                <div style={warningStyle}>
                  {proposal.warnings.map((warning, index) => (
                    <div key={`${proposal.id}-warning-${index}`}>{safeWarningText(warning)}</div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section data-testid="workspace-widget-before-after-preview" style={{ marginTop: 16 }}>
            <div style={{ color: "#8793a8", fontSize: 11, fontWeight: 900, marginBottom: 9 }}>{t("agora.tradingRoom.drawer.preview")}</div>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <PreviewCard label={t("agora.tradingRoom.drawer.current")} widget={beforeSpec} />
              <PreviewCard label={t("agora.tradingRoom.drawer.suggested")} widget={afterSpec} />
            </div>
            {diffRows.length ? (
              <FieldDiffTable durable={Boolean(proposal)} rows={diffRows} />
            ) : null}
          </section>
        </div>

        <footer style={{ background: "#1a1f2a", borderTop: "1px solid #343b4c", display: "flex", flexWrap: "wrap", gap: 8, padding: "14px 20px" }}>
          {proposal ? (
            <>
              <button
                data-testid="workspace-widget-revision-apply"
                disabled={!canAccept}
                onClick={() => acceptProposal("apply")}
                style={canAccept ? primaryButtonStyle : disabledButtonStyle}
                type="button"
              >
                {state === "accepting" ? t("agora.tradingRoom.drawer.applying") : t("agora.tradingRoom.drawer.apply")}
              </button>
              <button
                data-testid="workspace-widget-revision-adjust-again"
                onClick={adjustAgain}
                style={secondaryButtonStyle}
                type="button"
              >
                {t("agora.tradingRoom.drawer.adjustAgain")}
              </button>
              <button
                data-testid="workspace-widget-revision-keep-copy"
                disabled={!canAccept}
                onClick={() => acceptProposal("keep_original_add_modified_copy")}
                style={secondaryButtonStyle}
                type="button"
              >
                {t("agora.tradingRoom.drawer.keepCopy")}
              </button>
            </>
          ) : null}
          <button data-testid="workspace-widget-revision-cancel" onClick={onClose} style={secondaryButtonStyle} type="button">
            {t("agora.tradingRoom.drawer.cancel")}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function PreviewCard({ label, widget }: { label: string; widget: TradingRoomWidgetSpec | null }) {
  const { t } = useTranslation();
  if (!widget) {
    return (
      <div style={previewCardStyle}>
        <div style={{ color: "#8793a8", fontSize: 11 }}>{label}</div>
        <div style={{ color: "#8793a8", fontSize: 12, marginTop: 14 }}>{t("agora.tradingRoom.drawer.noProposal")}</div>
      </div>
    );
  }
  const validation = validateTradingRoomWidgetSpec(widget);
  return (
    <div style={previewCardStyle}>
      <div style={{ color: label === t("agora.tradingRoom.drawer.current") ? "#8793a8" : "#f0b84d", fontSize: 11, fontWeight: 900, marginBottom: 8 }}>{label}</div>
      <div style={{ color: "#f6f8fc", fontSize: 12, fontWeight: 800, marginBottom: 6 }}>{widget.title}</div>
      <div style={{ color: "#9aa5b8", fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>{chartSpecSummary(widget.chartSpec)}</div>
      {validation.ok ? (
        <div style={{ background: "#111620", borderRadius: 8, minHeight: 118, overflow: "hidden", padding: 8 }}>
          <ChartSpecRenderer data={[]} height={110} spec={widget.chartSpec} />
        </div>
      ) : (
        <div style={{ color: "#fca5a5", fontSize: 11 }}>{validation.messages.join(" ")}</div>
      )}
    </div>
  );
}

function newUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const iconButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #3a4254",
  borderRadius: 8,
  color: "#9aa5b8",
  cursor: "pointer",
  fontSize: 20,
  height: 34,
  lineHeight: 1,
  width: 34,
};

const textareaStyle: React.CSSProperties = {
  background: "#171b25",
  border: "1px solid #3a4254",
  borderRadius: 10,
  color: "#f6f8fc",
  fontSize: 13,
  lineHeight: 1.5,
  minHeight: 84,
  outline: "none",
  padding: 12,
  resize: "vertical",
  width: "100%",
};

const chipButtonStyle: React.CSSProperties = {
  background: "#252b39",
  border: "1px solid #3a4254",
  borderRadius: 999,
  color: "#c4ccda",
  cursor: "pointer",
  fontSize: 11,
  padding: "5px 10px",
};

const primaryButtonStyle: React.CSSProperties = {
  background: "#f0b84d",
  border: "1px solid #f0b84d",
  borderRadius: 9,
  color: "#17120a",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 900,
  padding: "10px 14px",
};

const secondaryButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #3a4254",
  borderRadius: 9,
  color: "#e2e8f0",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  padding: "10px 12px",
};

const disabledButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  color: "#657086",
  cursor: "not-allowed",
};

const warningStyle: React.CSSProperties = {
  background: "#312b1c",
  border: "1px solid #8a6b2f",
  borderRadius: 9,
  color: "#f8dfa6",
  fontSize: 12,
  lineHeight: 1.5,
  marginTop: 12,
  padding: 11,
};

const errorStyle: React.CSSProperties = {
  background: "#3a1f26",
  border: "1px solid #99404f",
  borderRadius: 9,
  color: "#ffd6dc",
  fontSize: 12,
  lineHeight: 1.5,
  marginTop: 12,
  padding: 11,
};

const previewCardStyle: React.CSSProperties = {
  background: "#171b25",
  border: "1px solid #343b4c",
  borderRadius: 10,
  minHeight: 188,
  minWidth: 0,
  padding: 11,
};

const diffCellStyle: React.CSSProperties = {
  borderLeft: "1px solid #343b4c",
  color: "#9aa5b8",
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 10.5,
  lineHeight: 1.4,
  overflowWrap: "anywhere",
  padding: "8px 10px",
};

export default WorkspaceWidgetRevisionDrawer;
