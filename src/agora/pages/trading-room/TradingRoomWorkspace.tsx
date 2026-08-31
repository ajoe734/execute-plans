import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  acceptTradingRoomWorkspaceProposalWithMeta,
  createTradingRoomWorkspaceProposal,
  type TradingRoomAggregate,
  type TradingRoomStrategyEntry,
  type TradingDecisionEvent,
  type TradingRoomWorkspaceResult,
} from "@/lib/bff-v1/agora/tradingRoom";
import { BffError } from "@/lib/bff-v1/errors";
import type { TradingRoomWorkspaceProposal } from "@/lib/bff-v1/agora/tradingRoomTypes";
import { WorkspaceProposalPreview } from "@/agora/trading-room/WorkspaceProposalPreview";
import { WorkspaceGridEditor } from "@/agora/trading-room/WorkspaceGridEditor";
import { TradeDecisionCard } from "@/agora/components/TradeDecisionCard";

function newUUID(): string {
  return crypto.randomUUID();
}

export interface TradingRoomUiError {
  message: string;
  status?: number;
  code?: string;
}

export function tradingRoomErrorMessage(err: BffError, fallback: string, t: TFunction): string {
  switch (err.status) {
    case 403:
      return t("agora.tradingRoom.errors.readForbidden");
    case 404:
      return t("agora.tradingRoom.errors.proposalNotFound");
    case 409:
      return t("agora.tradingRoom.errors.proposalConflict");
    case 412:
      return t("agora.tradingRoom.errors.proposalStale");
    case 501:
      return t("agora.tradingRoom.errors.notImplemented");
    default:
      return err.message || fallback;
  }
}

export function toTradingRoomUiError(err: unknown, fallback: string, t: TFunction): TradingRoomUiError {
  if (err instanceof BffError) {
    return {
      code: err.code,
      message: tradingRoomErrorMessage(err, fallback, t),
      status: err.status,
    };
  }
  return {
    message: err instanceof Error ? err.message : fallback,
  };
}

export function shouldClearStaleWorkspaceState(error: TradingRoomUiError): boolean {
  if (
    error.status === 403 ||
    error.status === 404 ||
    error.status === 409 ||
    error.status === 412 ||
    error.status === 501
  ) {
    return true;
  }
  return (
    error.code === "PERMISSION_DENIED" ||
    error.code === "TENANT_SCOPE_MISMATCH" ||
    error.code === "RESOURCE_NOT_FOUND" ||
    error.code === "STATE_CONFLICT" ||
    error.code === "ILLEGAL_TRANSITION" ||
    error.code === "IDEMPOTENCY_CONFLICT" ||
    error.code === "CAPABILITY_MISSING" ||
    error.code === "FEATURE_DISABLED"
  );
}

// ── Risk Banner ───────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  normal: "#111417",
  watch: "#1e1c0e",
  warning: "#231808",
  critical: "#230e0e",
};

export interface RiskBannerProps {
  state: string;
  summary?: string;
  alerts?: string[];
}

export function RiskBanner({ state, summary, alerts }: RiskBannerProps): JSX.Element | null {
  const { t } = useTranslation();
  if (state === "normal") return null;
  return (
    <div
      data-risk-state={state}
      data-testid="risk-banner"
      style={{
        background: RISK_COLORS[state] ?? RISK_COLORS.warning,
        borderBottom: "1px solid #2a2e38",
        color: "#f0ece4",
        fontSize: 13,
        padding: "6px 16px",
      }}
    >
      <strong>{t("agora.tradingRoom.page.risk", { state })}</strong>
      {summary ? ` — ${summary}` : null}
      {alerts && alerts.length > 0 ? (
        <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
          {alerts.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ── Decision Event Detail Panel ───────────────────────────────────────────────

interface DecisionEventDetailPanelProps {
  event: TradingDecisionEvent;
  etag?: string | null;
}

export function DecisionEventDetailPanel({ event, etag }: DecisionEventDetailPanelProps): JSX.Element {
  return (
    <tr data-testid={`event-detail-${event.decision_event_id}`}>
      <td colSpan={5} style={{ background: "#11151d", borderBottom: "2px solid #2a2e38", padding: "12px 16px" }}>
        <div style={{ margin: "0 auto", maxWidth: 800 }}>
          <TradeDecisionCard event={event} etag={etag ?? undefined} />
        </div>
      </td>
    </tr>
  );
}

// ── Trading Event Queue ───────────────────────────────────────────────────────

const EVENT_KIND_LABEL: Record<string, string> = {
  add: "Add",
  entry: "Entry",
  exit: "Exit",
  reduce: "Reduce",
  review: "Review",
};

const STATE_LABEL: Record<string, string> = {
  approaching: "Approaching",
  decided: "Decided",
  expired: "Expired",
  invalidated: "Invalidated",
  pending_review: "Pending Review",
  superseded: "Superseded",
  triggered: "Triggered",
};

export interface TradingEventQueueProps {
  events: TradingDecisionEvent[];
  loading: boolean;
  /** ETag from listDecisionEvents — forwarded to each DecisionEventDetailPanel as If-Match. */
  eventsEtag?: string | null;
}

export function TradingEventQueue({ events, loading, eventsEtag }: TradingEventQueueProps): JSX.Element {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div data-testid="trading-event-queue" style={{ flex: 1, overflow: "auto" }}>
      <div style={{ borderBottom: "1px solid #2a2e38", fontSize: 13, fontWeight: 600, padding: "8px 16px" }}>
        {t("agora.tradingRoom.page.eventQueue")}
      </div>
      {loading ? (
        <div data-testid="event-queue-loading" style={{ color: "#737d8e", fontSize: 13, padding: 16 }}>
          {t("agora.tradingRoom.page.loadingEvents")}
        </div>
      ) : events.length === 0 ? (
        <div data-testid="event-queue-empty" style={{ color: "#737d8e", fontSize: 13, padding: 16 }}>
          {t("agora.tradingRoom.page.noEvents")}
        </div>
      ) : (
        <table
          data-testid="event-queue-table"
          style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid #2a2e38" }}>
              <th style={{ color: "#8c96a6", fontWeight: 500, padding: "6px 16px", textAlign: "left" }}>{t("agora.tradingRoom.page.symbol")}</th>
              <th style={{ color: "#8c96a6", fontWeight: 500, padding: "6px 8px", textAlign: "left" }}>{t("agora.tradingRoom.page.kind")}</th>
              <th style={{ color: "#8c96a6", fontWeight: 500, padding: "6px 8px", textAlign: "left" }}>{t("agora.tradingRoom.page.state")}</th>
              <th style={{ color: "#8c96a6", fontWeight: 500, padding: "6px 8px", textAlign: "right" }}>{t("agora.tradingRoom.page.confidence")}</th>
              <th style={{ color: "#8c96a6", fontWeight: 500, padding: "6px 16px", textAlign: "right" }}>EV (net)</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <React.Fragment key={ev.decision_event_id}>
                <tr
                  aria-expanded={expandedId === ev.decision_event_id}
                  data-testid={`event-row-${ev.decision_event_id}`}
                  onClick={() => toggleExpand(ev.decision_event_id)}
                  style={{
                    background: expandedId === ev.decision_event_id ? "#1a2030" : undefined,
                    borderBottom: expandedId === ev.decision_event_id ? "none" : "1px solid #2a2e38",
                    cursor: "pointer",
                  }}
                >
                  <td style={{ padding: "6px 16px" }}>{ev.subject.symbol}</td>
                  <td style={{ padding: "6px 8px" }}>{t(`agora.tradingRoom.page.eventKinds.${ev.event_kind}`, { defaultValue: EVENT_KIND_LABEL[ev.event_kind] ?? ev.event_kind })}</td>
                  <td style={{ padding: "6px 8px" }}>{t(`agora.tradingRoom.page.states.${ev.state}`, { defaultValue: STATE_LABEL[ev.state] ?? ev.state })}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    {(ev.confidence.value * 100).toFixed(0)}%
                  </td>
                  <td style={{ padding: "6px 16px", textAlign: "right" }}>
                    {ev.expected_value.net > 0 ? "+" : ""}
                    {ev.expected_value.net.toFixed(2)}
                  </td>
                </tr>
                {expandedId === ev.decision_event_id && (
                  <DecisionEventDetailPanel etag={eventsEtag} event={ev} />
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Position Action Queue ─────────────────────────────────────────────────────

export interface PositionActionQueueProps {
  positionSummaries: unknown[];
}

export function PositionActionQueue({ positionSummaries }: PositionActionQueueProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      data-testid="position-action-queue"
      style={{ background: "#171b22", borderLeft: "1px solid #2a2e38", flexShrink: 0, overflow: "auto", width: 240 }}
    >
      <div style={{ borderBottom: "1px solid #2a2e38", fontSize: 13, fontWeight: 600, padding: "8px 12px" }}>
        {t("agora.tradingRoom.page.positionActions", { defaultValue: "Position Actions" })}
      </div>
      {positionSummaries.length === 0 ? (
        <div style={{ color: "#737d8e", fontSize: 13, padding: 12 }}>
          {t("agora.tradingRoom.page.noPositions", { defaultValue: "No position actions" })}
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: "8px 12px" }}>
          {positionSummaries.map((p, i) => (
            <li key={i} style={{ borderBottom: "1px solid #2a2e38", fontSize: 13, padding: "4px 0" }}>
              {JSON.stringify(p)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Generation Progress ───────────────────────────────────────────────────────

const GENERATION_STEPS = [
  "score", "relationships", "clusters", "evidence", "rules", "risk", "monitoring", "views", "layout",
];

export function TradingRoomGenerationProgress({
  strategyTitle,
  strategyVersion,
}: {
  strategyTitle: string;
  strategyVersion: string;
}) {
  const { t } = useTranslation();
  return (
    <section
      data-testid="trading-room-generation-progress"
      style={{
        background: "#171b22",
        borderBottom: "1px solid #2a2e38",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
      }}
    >
      <div>
        <div style={{ color: "#8c96a6", fontSize: 12, fontWeight: 700 }}>{t("agora.tradingRoom.page.servant", { defaultValue: "Agora Servant" })}</div>
        <h2 style={{ color: "#f0ece4", fontSize: 18, fontWeight: 800, letterSpacing: 0, margin: "2px 0 0" }}>
          {t("agora.tradingRoom.page.generatingTitle", { defaultValue: `Generating Workspace Proposal for ${strategyTitle || strategyVersion}`, strategy: strategyTitle || strategyVersion })}
        </h2>
        <p style={{ color: "#8c96a6", fontSize: 13, lineHeight: 1.5, margin: "6px 0 0", maxWidth: 840 }}>
          {t("agora.tradingRoom.page.generatingDescription", { defaultValue: "Synthesizing widgets and layout proposal from active signals, candidate pools, and decision events." })}
        </p>
      </div>
      <ol
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {GENERATION_STEPS.map((step, index) => (
          <li
            key={step}
            style={{
              alignItems: "center",
              background: index < 2 ? "rgba(232,183,80,0.12)" : "#1a2030",
              border: `1px solid ${index < 2 ? "rgba(232,183,80,0.35)" : "#2a2e38"}`,
              borderRadius: 8,
              color: "#8c96a6",
              display: "flex",
              fontSize: 12,
              gap: 8,
              minHeight: 42,
              padding: "8px 10px",
            }}
          >
            <span
              style={{
                alignItems: "center",
                background: index < 2 ? "#e8b750" : "#2a2e38",
                borderRadius: 999,
                color: "#ffffff",
                display: "inline-flex",
                flex: "0 0 20px",
                fontSize: 11,
                fontWeight: 700,
                height: 20,
                justifyContent: "center",
                width: 20,
              }}
            >
              {index + 1}
            </span>
            <span>{t(`agora.tradingRoom.page.generationSteps.${step}`)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── Main TradingRoomWorkspace (StrategyWorkspaceView) ─────────────────────────

export interface TradingRoomWorkspaceProps {
  strategyId: string;
  strategy: TradingRoomStrategyEntry | undefined;
  aggregate: TradingRoomAggregate;
  events: TradingDecisionEvent[];
  eventsLoading: boolean;
  eventsEtag: string | null;
  readinessAssessmentId?: string;
  readinessGate?: string;
  strategyVersion?: string;
  onBackToWorkshop?: () => void;
  onSwitchStrategy?: () => void;
}

export function TradingRoomWorkspace({
  strategyId,
  strategy,
  aggregate,
  events,
  eventsLoading,
  eventsEtag,
  readinessAssessmentId,
  readinessGate,
  strategyVersion,
  onBackToWorkshop,
  onSwitchStrategy,
}: TradingRoomWorkspaceProps): JSX.Element {
  const { t } = useTranslation();
  const filteredEvents = events.filter((ev) => ev.strategy_id === strategyId);

  const resolvedStrategyVersion = strategyVersion ?? strategy?.strategy_spec_registry_id ?? "";
  const routeTradingRoomReady = readinessGate === "trading_room";
  const aggregateTradingRoomReady = strategy?.readiness_state === "ready";
  const [proposal, setProposal] = useState<TradingRoomWorkspaceProposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState<TradingRoomUiError | null>(null);
  const [proposalRevision, setProposalRevision] = useState(0);
  const [selectedPreviewViewId, setSelectedPreviewViewId] = useState<string | null>(null);
  const [workspaceResult, setWorkspaceResult] = useState<TradingRoomWorkspaceResult | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [mobilePane, setMobilePane] = useState<"decisions" | "workspace">("decisions");

  useEffect(() => {
    setWorkspaceResult(null);
    setSelectedPreviewViewId(null);
    setMobilePane("decisions");
  }, [strategyId, resolvedStrategyVersion]);

  useEffect(() => {
    if (!resolvedStrategyVersion) {
      setProposal(null);
      setProposalLoading(false);
      setProposalError(null);
      return;
    }

    let cancelled = false;
    setProposal(null);
    setProposalError(null);
    setProposalLoading(true);
    setMobilePane("workspace");

    createTradingRoomWorkspaceProposal(
      strategyId,
      {
        personalizationHints: {
          readinessAssessmentId,
          readinessGate,
          source: "trading_room_join",
          surface: "agora",
        },
        strategyVersion: resolvedStrategyVersion,
        tradingRoomReady: routeTradingRoomReady || aggregateTradingRoomReady,
      },
      { idempotencyKey: newUUID() },
    )
      .then((nextProposal) => {
        if (cancelled) return;
        setProposal(nextProposal);
        setSelectedPreviewViewId(nextProposal.views[0]?.id ?? null);
        setProposalLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const nextError = toTradingRoomUiError(err, "Workspace proposal generation failed.", t);
        if (shouldClearStaleWorkspaceState(nextError)) {
          setProposal(null);
          setWorkspaceResult(null);
          setSelectedPreviewViewId(null);
        }
        setProposalError(nextError);
        setProposalLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    aggregateTradingRoomReady,
    proposalRevision,
    readinessAssessmentId,
    readinessGate,
    resolvedStrategyVersion,
    routeTradingRoomReady,
    strategyId,
    t,
  ]);

  async function handleAcceptProposal() {
    if (!proposal) return;
    setAccepting(true);
    setProposalError(null);
    try {
      const nextWorkspace = await acceptTradingRoomWorkspaceProposalWithMeta(
        strategyId,
        proposal.proposalId,
        { expectedStatus: "preview" },
        { idempotencyKey: newUUID() },
      );
      setWorkspaceResult(nextWorkspace);
    } catch (err) {
      const nextError = toTradingRoomUiError(err, "Workspace proposal acceptance failed.", t);
      if (shouldClearStaleWorkspaceState(nextError)) {
        setProposal(null);
        setWorkspaceResult(null);
        setSelectedPreviewViewId(null);
      }
      setProposalError(nextError);
    } finally {
      setAccepting(false);
    }
  }

  function regenerateProposal() {
    setWorkspaceResult(null);
    setProposal(null);
    setSelectedPreviewViewId(null);
    setProposalRevision((prev) => prev + 1);
  }

  return (
    <div
      data-testid={`strategy-workspace-${strategyId}`}
      style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflow: "hidden" }}
    >
      <div style={{ borderBottom: "1px solid #2a2e38", fontSize: 13, flexShrink: 0, padding: "8px 16px" }}>
        <strong>{strategy?.title ?? strategyId}</strong>
        {strategy && (
          <span style={{ color: "#8c96a6", marginLeft: 12 }}>
            {strategy.readiness_state} · {strategy.monitoring_state}
          </span>
        )}
      </div>
      <RiskBanner
        alerts={aggregate.risk_summary.alerts}
        state={aggregate.risk_summary.state}
        summary={aggregate.risk_summary.summary}
      />

      <div
        className="agora-mobile-only shrink-0 items-center gap-2 border-b border-[#2a2e38] bg-[#171b22] px-3 py-2"
        data-testid="trading-room-workspace-pane-selector"
      >
        <button
          aria-pressed={mobilePane === "decisions"}
          className={mobilePane === "decisions" ? "rounded bg-[#e8b750] px-3 py-1.5 text-xs font-bold text-[#111417]" : "rounded border border-[#2a2e38] px-3 py-1.5 text-xs text-[#c5cad2]"}
          onClick={() => setMobilePane("decisions")}
          type="button"
        >
          Decisions ({filteredEvents.length})
        </button>
        <button
          aria-pressed={mobilePane === "workspace"}
          className={mobilePane === "workspace" ? "rounded bg-[#e8b750] px-3 py-1.5 text-xs font-bold text-[#111417]" : "rounded border border-[#2a2e38] px-3 py-1.5 text-xs text-[#c5cad2]"}
          onClick={() => setMobilePane("workspace")}
          type="button"
        >
          Workspace
        </button>
      </div>

      <div
        data-mobile-workspace-pane={mobilePane}
        data-testid="trading-room-workspace-layout"
        style={{ display: "flex", flex: 1, overflow: "hidden" }}
      >
        <div
          data-testid="trading-room-workspace-column"
          style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, minWidth: 0, overflow: "hidden" }}
        >
          <div
            data-mobile-pane-hidden={mobilePane !== "workspace"}
            data-testid="trading-room-workspace-surface"
            style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflow: "hidden" }}
          >
          {!resolvedStrategyVersion ? (
            <div
              data-testid="trading-room-strategy-version-required"
              style={{ color: "#e8b750", fontSize: 13, padding: 16 }}
            >
              {t("agora.tradingRoom.page.strategyVersionRequired")}
            </div>
          ) : workspaceResult ? (
            <WorkspaceGridEditor
              dataCutoff={aggregate?.data_cutoff}
              initialEtag={workspaceResult.etag}
              initialWorkspace={workspaceResult.workspace}
              onBackToWorkshop={onBackToWorkshop}
              onSwitchStrategy={onSwitchStrategy}
              onWorkspaceChange={setWorkspaceResult}
              riskSummary={aggregate?.risk_summary}
              strategy={strategy}
              workspaceEvents={events}
            />
          ) : proposalLoading ? (
            <TradingRoomGenerationProgress
              strategyTitle={strategy?.title ?? strategyId}
              strategyVersion={resolvedStrategyVersion}
            />
          ) : proposal ? (
            <div style={{ flex: 1, overflow: "auto" }}>
              <WorkspaceProposalPreview
                busy={accepting}
                error={proposalError?.message ?? null}
                onAccept={handleAcceptProposal}
                onAdjustLayout={() => setSelectedPreviewViewId(proposal.views[0]?.id ?? null)}
                onBackToWorkshop={onBackToWorkshop}
                onPreviewView={(view) => setSelectedPreviewViewId(view.id)}
                onRegenerate={regenerateProposal}
                proposal={proposal}
                selectedViewId={selectedPreviewViewId}
              />
            </div>
          ) : (
            <div
              data-error-code={proposalError?.code ?? ""}
              data-error-status={proposalError?.status ?? ""}
              data-testid="trading-room-proposal-error"
              style={{ color: "#f87171", fontSize: 13, padding: 16 }}
            >
              {proposalError?.message ?? t("agora.tradingRoom.page.proposalUnavailable")}
              <div>
                <button
                  data-testid="trading-room-proposal-retry"
                  onClick={regenerateProposal}
                  style={{
                    background: "#171b22",
                    border: "1px solid #2a2e38",
                    borderRadius: 6,
                    color: "#8c96a6",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    marginTop: 8,
                    padding: "6px 10px",
                  }}
                  type="button"
                >
                  {t("agora.tradingRoom.proposal.regenerate")}
                </button>
              </div>
            </div>
          )}
          </div>

          <div
            data-mobile-pane-hidden={mobilePane !== "decisions"}
            data-testid="trading-room-decision-surface"
            style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}
          >
            <TradingEventQueue events={filteredEvents} eventsEtag={eventsEtag} loading={eventsLoading} />
          </div>
        </div>
        <div data-mobile-pane-hidden={mobilePane !== "decisions"} data-testid="trading-room-position-surface">
          <PositionActionQueue positionSummaries={aggregate.position_summaries ?? []} />
        </div>
      </div>
    </div>
  );
}

// Named alias for backward compatibility
export const StrategyWorkspaceView = TradingRoomWorkspace;
