import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { TradingRoomViewSpec } from "@/lib/bff-v1/agora/tradingRoomTypes";
import {
  buildWorkspaceLayoutProposal,
  WORKSPACE_LAYOUT_QUICK_INTENTS,
  type WorkspaceLayoutProposalChange,
  type WorkspaceLayoutProposal,
} from "./workspaceLayoutProposal";

const COLORS = {
  accent: "#e8b750",
  border: "#303745",
  danger: "#ff7478",
  good: "#56d98b",
  muted: "#929baa",
  panel: "#171b22",
  panelElevated: "#202631",
  panelInset: "#11151d",
  text: "#f0ece4",
  textSoft: "#c4ccda",
};

export interface WorkspaceLayoutProposalDrawerProps {
  open: boolean;
  views: readonly TradingRoomViewSpec[];
  currentVersion: number;
  initialInstruction?: string;
  busy?: boolean;
  error?: string | null;
  onApply: (proposal: WorkspaceLayoutProposal) => void | Promise<void>;
  onReject: (proposal: WorkspaceLayoutProposal) => void | Promise<void>;
  onClose: () => void;
}

interface MiniLayoutProps {
  label: string;
  testId: string;
  view: TradingRoomViewSpec;
}

function finiteInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function MiniLayout({ label, testId, view }: MiniLayoutProps) {
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <strong style={{ color: COLORS.textSoft, fontSize: 11 }}>{label}</strong>
      <div
        aria-label={`${view.title} ${label}`}
        data-testid={testId}
        style={{
          background: COLORS.panelInset,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 7,
          display: "grid",
          gap: 2,
          gridAutoRows: "8px",
          gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          minHeight: 96,
          overflow: "hidden",
          padding: 7,
        }}
      >
        {view.widgets.map((widget, index) => {
          const placement = widget.placement ?? {
            x: 0,
            y: index,
            width: 1,
            height: 1,
          };
          const column = Math.max(1, Math.min(12, finiteInteger(placement.x, 0) + 1));
          const width = Math.max(1, Math.min(13 - column, finiteInteger(placement.width, 1)));
          const row = Math.max(1, finiteInteger(placement.y, index) + 1);
          const height = Math.max(1, Math.min(8, finiteInteger(placement.height, 1)));
          const visible = widget.visible !== false;
          return (
            <span
              data-visible={visible ? "true" : "false"}
              key={`${widget.id}-${index}`}
              title={widget.title}
              style={{
                alignItems: "center",
                background: visible ? "rgba(232,183,80,.18)" : "rgba(146,155,170,.08)",
                border: `1px ${visible ? "solid" : "dashed"} ${visible ? "rgba(232,183,80,.48)" : "rgba(146,155,170,.35)"}`,
                borderRadius: 3,
                color: visible ? COLORS.textSoft : COLORS.muted,
                display: "flex",
                fontSize: 8,
                gridColumn: `${column} / span ${width}`,
                gridRow: `${row} / span ${height}`,
                lineHeight: 1.1,
                minHeight: 0,
                opacity: visible ? 1 : 0.65,
                overflow: "hidden",
                padding: "0 3px",
                textDecoration: visible ? "none" : "line-through",
                whiteSpace: "nowrap",
              }}
            >
              {widget.title}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function WorkspaceLayoutProposalDrawer({
  busy = false,
  currentVersion,
  error,
  initialInstruction = "",
  onApply,
  onClose,
  onReject,
  open,
  views,
}: WorkspaceLayoutProposalDrawerProps) {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState(initialInstruction);
  const [proposal, setProposal] = useState<WorkspaceLayoutProposal | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [decidedProposalId, setDecidedProposalId] = useState<string | null>(null);
  const actionInFlight = useRef(false);

  useEffect(() => {
    if (!open) return;
    setInstruction(initialInstruction);
    setProposal(null);
    setActionPending(false);
    setDecidedProposalId(null);
    actionInFlight.current = false;
  }, [initialInstruction, open, views]);

  if (!open) return null;

  const copy = (key: string, fallback: string, values: Record<string, unknown> = {}) => String(t(key, {
    defaultValue: fallback,
    ...values,
  }));

  const selectInstruction = (nextInstruction: string) => {
    setInstruction(nextInstruction);
    setProposal(null);
    setDecidedProposalId(null);
  };

  const generate = () => {
    setProposal(buildWorkspaceLayoutProposal({ instruction, views }));
    setDecidedProposalId(null);
  };

  const changeText = (change: WorkspaceLayoutProposalChange) => copy(
    `agora.tradingRoom.layoutProposal.changeKinds.${change.kind}`,
    change.summary,
    {
      afterHeight: change.after.placement.height,
      afterWidth: change.after.placement.width,
      afterX: change.after.placement.x,
      afterY: change.after.placement.y,
      beforeHeight: change.before.placement.height,
      beforeWidth: change.before.placement.width,
      beforeX: change.before.placement.x,
      beforeY: change.before.placement.y,
      view: change.viewTitle,
      widget: change.widgetTitle,
    },
  );

  const canApply = Boolean(
    proposal
    && proposal.validation.valid
    && proposal.operations.length > 0
    && decidedProposalId !== proposal.id
    && !busy
    && !actionPending,
  );

  const apply = async () => {
    if (
      !proposal
      || !proposal.validation.valid
      || !proposal.operations.length
      || decidedProposalId === proposal.id
      || busy
      || actionInFlight.current
    ) return;
    actionInFlight.current = true;
    setActionPending(true);
    try {
      await onApply(proposal);
      setDecidedProposalId(proposal.id);
    } finally {
      actionInFlight.current = false;
      setActionPending(false);
    }
  };

  const reject = async () => {
    if (!proposal || decidedProposalId === proposal.id || busy || actionInFlight.current) return;
    actionInFlight.current = true;
    setActionPending(true);
    try {
      await onReject(proposal);
      setDecidedProposalId(proposal.id);
      onClose();
    } finally {
      actionInFlight.current = false;
      setActionPending(false);
    }
  };

  return (
    <div
      data-testid="workspace-layout-proposal-drawer"
      role="presentation"
      style={{
        alignItems: "stretch",
        background: "rgba(5,8,12,.72)",
        display: "flex",
        inset: 0,
        justifyContent: "flex-end",
        position: "fixed",
        zIndex: 80,
      }}
    >
      <aside
        aria-label={copy("agora.tradingRoom.layoutProposal.title", "Workspace layout proposal")}
        aria-modal="true"
        role="dialog"
        style={{
          background: COLORS.panel,
          borderLeft: `1px solid ${COLORS.border}`,
          boxShadow: "-18px 0 44px rgba(0,0,0,.38)",
          color: COLORS.text,
          display: "flex",
          flexDirection: "column",
          maxWidth: "100%",
          overflow: "hidden",
          width: 660,
        }}
      >
        <header style={{ alignItems: "flex-start", borderBottom: `1px solid ${COLORS.border}`, display: "flex", gap: 16, justifyContent: "space-between", padding: 18 }}>
          <div>
            <h2 style={{ fontSize: 17, margin: 0 }}>
              {copy("agora.tradingRoom.layoutProposal.title", "Workspace layout proposal")}
            </h2>
            <p style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.45, margin: "5px 0 0" }}>
              {copy(
                "agora.tradingRoom.layoutProposal.subtitle",
                "Generate a transient, reviewable preview. Nothing changes until Apply is selected.",
              )}
            </p>
          </div>
          <button
            aria-label={copy("agora.tradingRoom.layoutProposal.close", "Close")}
            disabled={busy || actionPending}
            onClick={onClose}
            style={{ background: "transparent", border: 0, color: COLORS.textSoft, cursor: "pointer", fontSize: 20 }}
            type="button"
          >
            ×
          </button>
        </header>

        <div style={{ display: "grid", gap: 18, overflowY: "auto", padding: 18 }}>
          <section style={{ display: "grid", gap: 9 }}>
            <label htmlFor="workspace-layout-proposal-instruction" style={{ color: COLORS.textSoft, fontSize: 12, fontWeight: 700 }}>
              {copy("agora.tradingRoom.layoutProposal.instruction", "Layout instruction")}
            </label>
            <textarea
              data-testid="workspace-layout-proposal-input"
              disabled={busy || actionPending}
              id="workspace-layout-proposal-instruction"
              onChange={(event) => selectInstruction(event.target.value)}
              placeholder={copy(
                "agora.tradingRoom.layoutProposal.instructionPlaceholder",
                "For example: Put risk and exposure widgets first in every view",
              )}
              rows={3}
              style={{
                background: COLORS.panelInset,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 7,
                color: COLORS.text,
                font: "inherit",
                lineHeight: 1.45,
                padding: 10,
                resize: "vertical",
              }}
              value={instruction}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {WORKSPACE_LAYOUT_QUICK_INTENTS.map((quickIntent) => (
                (() => {
                  const localizedInstruction = copy(
                    `agora.tradingRoom.layoutProposal.quickInstructions.${quickIntent.kind}`,
                    quickIntent.instruction,
                  );
                  const selected = instruction === localizedInstruction;
                  return (
                    <button
                      data-testid={`workspace-layout-proposal-chip-${quickIntent.kind}`}
                      disabled={busy || actionPending}
                      key={quickIntent.kind}
                      onClick={() => selectInstruction(localizedInstruction)}
                      style={{
                        background: selected ? "rgba(232,183,80,.14)" : COLORS.panelElevated,
                        border: `1px solid ${selected ? COLORS.accent : COLORS.border}`,
                        borderRadius: 999,
                        color: selected ? COLORS.accent : COLORS.textSoft,
                        cursor: "pointer",
                        fontSize: 11,
                        padding: "6px 9px",
                      }}
                      type="button"
                    >
                      {copy(
                        `agora.tradingRoom.layoutProposal.quickIntents.${quickIntent.kind}`,
                        quickIntent.label,
                      )}
                    </button>
                  );
                })()
              ))}
            </div>
            <button
              data-testid="workspace-layout-proposal-generate"
              disabled={!instruction.trim() || busy || actionPending}
              onClick={generate}
              style={{
                alignSelf: "start",
                background: COLORS.accent,
                border: 0,
                borderRadius: 7,
                color: "#17130a",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 800,
                padding: "8px 12px",
              }}
              type="button"
            >
              {copy("agora.tradingRoom.layoutProposal.generate", "Generate preview")}
            </button>
          </section>

          {proposal ? (
            <div data-testid="workspace-layout-proposal-preview" style={{ display: "grid", gap: 16 }}>
              <section
                data-testid="workspace-layout-proposal-understanding"
                style={{ background: COLORS.panelElevated, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12 }}
              >
                <strong style={{ display: "block", fontSize: 12, marginBottom: 5 }}>
                  {copy("agora.tradingRoom.layoutProposal.understanding", "Understood intent")}
                </strong>
                <span style={{ color: COLORS.textSoft, fontSize: 12, lineHeight: 1.45 }}>
                  {proposal.intent
                    ? copy(
                      `agora.tradingRoom.layoutProposal.intentKinds.${proposal.intent.kind}`,
                      proposal.intent.summary,
                    )
                    : copy(
                      "agora.tradingRoom.layoutProposal.noUnderstanding",
                      "No single allowlisted layout intent was understood.",
                    )}
                </span>
              </section>

              <section data-testid="workspace-layout-proposal-changes" style={{ display: "grid", gap: 8 }}>
                <strong style={{ fontSize: 12 }}>
                  {copy("agora.tradingRoom.layoutProposal.changes", "Proposed changes")}
                </strong>
                {proposal.changes.length ? (
                  <ol style={{ color: COLORS.textSoft, display: "grid", fontSize: 12, gap: 5, margin: 0, paddingLeft: 20 }}>
                    {proposal.changes.map((change) => <li key={change.id}>{changeText(change)}</li>)}
                  </ol>
                ) : (
                  <span style={{ color: COLORS.muted, fontSize: 12 }}>
                    {copy("agora.tradingRoom.layoutProposal.noChanges", "No applicable changes were generated.")}
                  </span>
                )}
              </section>

              <section style={{ display: "grid", gap: 12 }}>
                <strong style={{ fontSize: 12 }}>
                  {copy("agora.tradingRoom.layoutProposal.fullPreview", "Every view · before and after")}
                </strong>
                {proposal.beforeViews.map((beforeView, index) => {
                  const afterView = proposal.afterViews[index];
                  return (
                    <article
                      data-testid={`workspace-layout-proposal-view-${beforeView.id}`}
                      key={`${beforeView.id}-${index}`}
                      style={{ background: COLORS.panelElevated, border: `1px solid ${COLORS.border}`, borderRadius: 8, display: "grid", gap: 9, padding: 10 }}
                    >
                      <strong style={{ fontSize: 12 }}>{beforeView.title}</strong>
                      <div style={{ display: "grid", gap: 9, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                        <MiniLayout
                          label={copy("agora.tradingRoom.layoutProposal.before", "Before")}
                          testId={`workspace-layout-proposal-view-${beforeView.id}-before`}
                          view={beforeView}
                        />
                        <MiniLayout
                          label={copy("agora.tradingRoom.layoutProposal.after", "After")}
                          testId={`workspace-layout-proposal-view-${beforeView.id}-after`}
                          view={afterView ?? beforeView}
                        />
                      </div>
                    </article>
                  );
                })}
              </section>

              <section
                data-testid="workspace-layout-proposal-validation"
                style={{
                  background: proposal.validation.valid ? "rgba(86,217,139,.08)" : "rgba(255,116,120,.08)",
                  border: `1px solid ${proposal.validation.valid ? "rgba(86,217,139,.4)" : "rgba(255,116,120,.42)"}`,
                  borderRadius: 8,
                  color: proposal.validation.valid ? COLORS.good : COLORS.danger,
                  display: "grid",
                  fontSize: 12,
                  gap: 6,
                  padding: 10,
                }}
              >
                <strong>
                  {proposal.validation.valid
                    ? copy("agora.tradingRoom.layoutProposal.validationValid", "Validation passed")
                    : copy("agora.tradingRoom.layoutProposal.validationInvalid", "Validation failed")}
                </strong>
                {proposal.validation.errors.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {proposal.validation.errors.map((issue, index) => (
                      <li key={`${issue.code}-${issue.viewId ?? "workspace"}-${issue.widgetId ?? index}`}>
                        {copy(
                          `agora.tradingRoom.layoutProposal.issueCodes.${issue.code}`,
                          issue.message,
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <div data-testid="workspace-layout-proposal-version" style={{ color: COLORS.textSoft, fontSize: 12 }}>
                {copy(
                  "agora.tradingRoom.layoutProposal.versionConsequence",
                  "Applying creates one new dashboard version: v{{before}} → v{{after}}.",
                  { before: currentVersion, after: currentVersion + 1 },
                )}
              </div>
            </div>
          ) : null}

          {error ? (
            <div role="alert" style={{ background: "rgba(255,116,120,.08)", border: "1px solid rgba(255,116,120,.42)", borderRadius: 7, color: COLORS.danger, fontSize: 12, padding: 10 }}>
              {error}
            </div>
          ) : null}
        </div>

        <footer style={{ alignItems: "center", borderTop: `1px solid ${COLORS.border}`, display: "flex", gap: 9, justifyContent: "flex-end", marginTop: "auto", padding: 14 }}>
          <button
            data-testid="workspace-layout-proposal-reject"
            disabled={!proposal || decidedProposalId === proposal.id || busy || actionPending}
            onClick={() => void reject()}
            style={{ background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 7, color: COLORS.textSoft, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "8px 12px" }}
            type="button"
          >
            {copy("agora.tradingRoom.layoutProposal.reject", "Reject")}
          </button>
          <button
            data-testid="workspace-layout-proposal-apply"
            disabled={!canApply}
            onClick={() => void apply()}
            style={{ background: canApply ? COLORS.accent : "#3a3d43", border: 0, borderRadius: 7, color: canApply ? "#17130a" : COLORS.muted, cursor: canApply ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 800, padding: "8px 12px" }}
            type="button"
          >
            {actionPending
              ? copy("agora.tradingRoom.layoutProposal.applying", "Applying…")
              : copy("agora.tradingRoom.layoutProposal.apply", "Apply")}
          </button>
        </footer>
      </aside>
    </div>
  );
}
