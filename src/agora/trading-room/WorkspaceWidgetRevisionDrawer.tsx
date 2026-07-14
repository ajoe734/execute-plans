import * as DialogPrimitive from "@radix-ui/react-dialog";
import React, { useEffect, useMemo, useRef, useState } from "react";

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
  "改成分點為列、日期為欄的熱圖",
  "疊加 cluster-adjusted flow",
  "只看最近 20 日並排除低量",
  "改成可排序表格",
  "拆成關係人與出貨兩張",
  "畫事件前後並標重大訊息",
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

function buildWidgetDiffRows(before: TradingRoomWidgetSpec, after: TradingRoomWidgetSpec | null): DiffRow[] {
  if (!after) return [];
  const rows: Array<Omit<DiffRow, "changed">> = [
    { id: "title", label: "Title", before: before.title, after: after.title },
    { id: "widget-type", label: "Widget type", before: before.widgetType, after: after.widgetType },
    { id: "data-source", label: "Data source", before: before.dataSource, after: after.dataSource },
    { id: "query-filters", label: "Query filters", before: stableText(before.query.filters), after: stableText(after.query.filters) },
    { id: "query-window", label: "Query window", before: before.query.window ?? "-", after: after.query.window ?? "-" },
    { id: "query-sort", label: "Query sort", before: stableText(before.query.sort), after: stableText(after.query.sort) },
    { id: "query-limit", label: "Query limit", before: stableText(before.query.limit), after: stableText(after.query.limit) },
    { id: "chart-spec", label: "Chart spec", before: chartDiffSummary(before), after: chartDiffSummary(after) },
    { id: "interactions", label: "Interactions", before: interactionSummary(before), after: interactionSummary(after) },
    { id: "sensitivity", label: "Sensitivity", before: before.sensitivity, after: after.sensitivity },
    { id: "placement", label: "Placement", before: placementSummary(before), after: placementSummary(after) },
  ];
  return rows.map((row) => ({ ...row, changed: row.before !== row.after }));
}

function revisionErrorMessage(error: BffError, fallback: string): string {
  switch (error.status) {
    case 403:
      return "目前權限或範圍無法建立這個 Widget revision proposal。";
    case 404:
      return "這個 Workspace、View 或 Widget 已不存在，請重新整理後再試。";
    case 412:
      return "Workspace 版本已過期，請重新整理後再套用。";
    case 422:
      return error.message || "Widget revision proposal 未通過驗證。";
    case 502:
      return "BFF 回傳的 Widget revision proposal 格式不完整。";
    default:
      return error.message || fallback;
  }
}

function toRevisionUiError(error: unknown, fallback: string): RevisionUiError {
  if (error instanceof BffError) {
    return {
      code: error.code,
      message: revisionErrorMessage(error, fallback),
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
        {durable ? "Backend beforeSpec / proposedSpec field diff" : "Draft field diff before proposal"}
      </div>
      <div
        className="workspace-widget-diff-header"
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
        <span style={{ padding: "8px 10px" }}>Field</span>
        <span style={{ padding: "8px 10px" }}>Before</span>
        <span style={{ padding: "8px 10px" }}>After</span>
      </div>
      {rows.map((row) => (
        <div
          className="workspace-widget-diff-row"
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
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<WidgetRevisionProposal | null>(null);
  const [proposalEtag, setProposalEtag] = useState<string | null>(null);
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<RevisionUiError | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

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
      setError(toRevisionUiError(err, "Widget revision proposal failed."));
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
      setError(toRevisionUiError(err, "Widget revision acceptance failed."));
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
  const diffRows = buildWidgetDiffRows(beforeSpec, afterSpec);

  return (
    <DialogPrimitive.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      open={open}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-testid="workspace-widget-revision-overlay"
          style={{ background: "rgba(6, 8, 14, 0.64)", inset: 0, position: "fixed", zIndex: 80 }}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="agora-narrow-workspace-revision"
          data-testid="workspace-widget-revision-drawer"
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
            background: "#202532",
            borderLeft: "1px solid #3a4254",
            bottom: 0,
            color: "#f6f8fc",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            maxWidth: "100%",
            position: "fixed",
            right: 0,
            top: 0,
            width: 520,
            zIndex: 81,
          }}
        >
        <header className="agora-narrow-drawer" style={{ borderBottom: "1px solid #343b4c", display: "flex", justifyContent: "space-between", gap: 12, padding: "18px 20px" }}>
          <div>
            <div style={{ color: "#f0b84d", fontSize: 12, fontWeight: 900 }}>Widget Adjustment Drawer</div>
            <DialogPrimitive.Title asChild>
              <h2 style={{ color: "#ffffff", fontSize: 16, fontWeight: 900, letterSpacing: 0, margin: "3px 0 0" }}>
                交代僕人修改 Widget
              </h2>
            </DialogPrimitive.Title>
            <div style={{ color: "#9aa5b8", fontSize: 12, marginTop: 3 }}>{widget.title}</div>
          </div>
          <DialogPrimitive.Close asChild>
            <button aria-label="Close widget revision drawer" style={iconButtonStyle} type="button">
              ×
            </button>
          </DialogPrimitive.Close>
        </header>

        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 18px" }}>
          <section data-testid="workspace-widget-revision-context" style={{ background: "#171b25", border: "1px solid #343b4c", borderRadius: 10, display: "grid", gap: 12, padding: 14 }}>
            <ContextRow label="Workspace" value={`${workspace.id} / dashboard v${workspace.dashboardVersion}`} />
            <ContextRow label="所屬策略" value={`${workspace.strategyId} / ${workspace.strategyVersion}`} />
            <ContextRow label="所屬 View" value={view ? `${view.title} (${view.id})` : "-"} />
            <ContextRow label="Widget ID" value={widget.id} />
            <ContextRow label="Widget 標題" value={widget.title} />
            <ContextRow label="Widget type" value={widget.widgetType} />
            <ContextRow label="Widget 目的" value={widget.purpose} />
            <ContextRow label="為何納入" value={widget.whyIncluded} />
            <ContextRow label="資料來源" value={widget.dataSource} />
            <ContextRow label="目前欄位" value={fieldSummary(widget)} />
            <ContextRow label="目前篩選" value={stableText(widget.query.filters)} />
            <ContextRow label="目前排序" value={stableText(widget.query.sort)} />
            <ContextRow label="目前筆數上限" value={stableText(widget.query.limit)} />
            <ContextRow label="目前時間窗口" value={widget.query.window ?? "-"} />
            <ContextRow label="目前圖表型態" value={chartSpecSummary(widget.chartSpec)} />
            <ContextRow label="可用互動" value={interactionSummary(widget)} />
            <ContextRow label="資料敏感度" value={widget.sensitivity} />
            <ContextRow label="目前 Placement" value={placementSummary(widget)} />
            <ContextRow label="資料可用性" value={dataAvailabilitySummary(view)} />
            <ContextRow label="Warnings" value={warningSummary(view)} />
            <ContextRow label="相關證據" value={relatedEvidence(widget, view)} />
          </section>

          {disabledReason ? (
            <div data-testid="workspace-widget-revision-disabled" style={warningStyle}>
              {disabledReason}
            </div>
          ) : null}

          <form onSubmit={submitProposal} style={{ display: "grid", gap: 10, marginTop: 14 }}>
            <label htmlFor="workspace-widget-revision-instruction" style={{ color: "#c4ccda", fontSize: 12, fontWeight: 800 }}>
              Revision instruction
            </label>
            <textarea
              data-testid="workspace-widget-revision-input"
              id="workspace-widget-revision-instruction"
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="例如：把這張圖改成分點為列、日期為欄的熱圖..."
              style={textareaStyle}
              value={instruction}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {QUICK_INSTRUCTIONS.map((text) => (
                <button
                  key={text}
                  onClick={() => {
                    setInstruction(text);
                    adjustAgain();
                  }}
                  style={chipButtonStyle}
                  type="button"
                >
                  {text}
                </button>
              ))}
            </div>
            <button
              data-testid="workspace-widget-revision-submit"
              disabled={!canSubmit}
              style={canSubmit ? primaryButtonStyle : disabledButtonStyle}
              type="submit"
            >
              {state === "creating" ? "建立 Proposal..." : "交代"}
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
                <div style={{ color: "#f0b84d", fontSize: 11, fontWeight: 900, marginBottom: 6 }}>僕人準備這樣調整</div>
                <div style={{ color: "#f3f6fb", fontSize: 13, lineHeight: 1.6 }}>{proposal.rationale}</div>
                {proposalEtag ? <div style={{ color: "#8793a8", fontSize: 11, marginTop: 8 }}>Proposal ETag ready</div> : null}
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
            <div style={{ color: "#8793a8", fontSize: 11, fontWeight: 900, marginBottom: 9 }}>Before / After Preview</div>
            <div className="workspace-widget-before-after-grid" style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <PreviewCard label="目前" widget={beforeSpec} />
              <PreviewCard label="僕人建議" widget={afterSpec} />
            </div>
            {diffRows.length ? (
              <FieldDiffTable durable={Boolean(proposal)} rows={diffRows} />
            ) : null}
          </section>
        </div>

        <footer className="agora-drawer-action-footer" style={{ background: "#1a1f2a", borderTop: "1px solid #343b4c", display: "flex", flexWrap: "wrap", gap: 8, padding: "14px 20px" }}>
          {proposal ? (
            <>
              <button
                data-testid="workspace-widget-revision-apply"
                disabled={!canAccept}
                onClick={() => acceptProposal("apply")}
                style={canAccept ? primaryButtonStyle : disabledButtonStyle}
                type="button"
              >
                {state === "accepting" ? "套用中..." : "套用修改"}
              </button>
              <button
                data-testid="workspace-widget-revision-adjust-again"
                onClick={adjustAgain}
                style={secondaryButtonStyle}
                type="button"
              >
                再調整
              </button>
              <button
                data-testid="workspace-widget-revision-keep-copy"
                disabled={!canAccept}
                onClick={() => acceptProposal("keep_original_add_modified_copy")}
                style={secondaryButtonStyle}
                type="button"
              >
                保留原圖並新增一張
              </button>
            </>
          ) : null}
          <button data-testid="workspace-widget-revision-cancel" onClick={onClose} style={secondaryButtonStyle} type="button">
            取消
          </button>
        </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PreviewCard({ label, widget }: { label: string; widget: TradingRoomWidgetSpec | null }) {
  if (!widget) {
    return (
      <div style={previewCardStyle}>
        <div style={{ color: "#8793a8", fontSize: 11 }}>{label}</div>
        <div style={{ color: "#8793a8", fontSize: 12, marginTop: 14 }}>尚未建立 proposal</div>
      </div>
    );
  }
  const validation = validateTradingRoomWidgetSpec(widget);
  return (
    <div style={previewCardStyle}>
      <div style={{ color: label === "目前" ? "#8793a8" : "#f0b84d", fontSize: 11, fontWeight: 900, marginBottom: 8 }}>{label}</div>
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
