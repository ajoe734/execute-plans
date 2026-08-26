import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  acceptTradingRoomWorkspaceProposalWithMeta,
  createTradingRoomWorkspaceProposal,
  getTradingRoom,
  listDecisionEvents,
  decideOnEvent,
  type TradingRoomAggregate,
  type TradingRoomStrategyEntry,
  type TradingDecisionEvent,
  type DecisionChoice,
  type TradingRoomWorkspaceResult,
} from "@/lib/bff-v1/agora/tradingRoom";
import { BffError } from "@/lib/bff-v1/errors";
import type {
  TradingRoomWorkspaceProposal,
} from "@/lib/bff-v1/agora/tradingRoomTypes";
import { WorkspaceProposalPreview } from "@/agora/trading-room/WorkspaceProposalPreview";
import { WorkspaceGridEditor } from "@/agora/trading-room/WorkspaceGridEditor";
import { TradeDecisionCard } from "@/agora/components/TradeDecisionCard";
import { CandidateReviewDrawer as SharedCandidateReviewDrawer } from "@/agora/components/CandidateReviewDrawer";
import { lookupCandidatePool } from "@/lib/bff-v1/agora/candidatePool";

function newUUID(): string {
  return crypto.randomUUID();
}

interface TradingRoomUiError {
  message: string;
  status?: number;
  code?: string;
}

function tradingRoomErrorMessage(err: BffError, fallback: string, t: TFunction): string {
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

function toTradingRoomUiError(err: unknown, fallback: string, t: TFunction): TradingRoomUiError {
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

function shouldClearStaleWorkspaceState(error: TradingRoomUiError): boolean {
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

// ── Strategy Workspace Switcher ───────────────────────────────────────────────

interface StrategyLensSwitcherProps {
  strategies: TradingRoomStrategyEntry[];
  activeStrategyId?: string;
  onSelect: (strategyId: string) => void;
}

function StrategyLensSwitcher({
  strategies,
  activeStrategyId,
  onSelect,
}: StrategyLensSwitcherProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      data-testid="strategy-lens-switcher"
      role="listbox"
      aria-label={t("agora.tradingRoom.page.strategySwitcher")}
      style={{ background: "#171b22", borderBottom: "1px solid #2a2e38", display: "flex", gap: 8, overflowX: "auto", padding: "10px 16px" }}
    >
      {strategies.length === 0 ? (
        <span data-testid="strategy-workspace-empty" style={{ color: "#8c96a6", fontSize: 12 }}>
          No StrategySpec workspace is currently available.
        </span>
      ) : strategies.map((strategy) => {
        const selected = strategy.strategy_id === activeStrategyId;
        return (
          <button
            aria-selected={selected}
            data-testid={`strategy-lens-${strategy.strategy_id}`}
            key={strategy.strategy_id}
            onClick={() => onSelect(strategy.strategy_id)}
            role="option"
            style={{
              background: selected ? "#e8b750" : "#1a2030",
              border: selected ? "1px solid #e8b750" : "1px solid #2a2e38",
              borderRadius: 6, color: selected ? "#111417" : "#c5cad2",
              cursor: "pointer", fontSize: 12, fontWeight: selected ? 700 : 500,
              padding: "6px 10px", textAlign: "left", whiteSpace: "nowrap",
            }}
            type="button"
          >
            <span>{strategy.title}</span>
            <span style={{ display: "block", fontSize: 10, marginTop: 2, opacity: 0.8 }}>
              {strategy.strategy_spec_registry_id} · {strategy.readiness_state}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Risk Banner ───────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  normal: "#111417",
  watch: "#1e1c0e",
  warning: "#231808",
  critical: "#230e0e",
};

interface RiskBannerProps {
  state: string;
  summary?: string;
  alerts?: string[];
}

function RiskBanner({ state, summary, alerts }: RiskBannerProps): JSX.Element | null {
  const { t } = useTranslation();
  if (state === "normal") return null;
  return (
    <div
      data-testid="risk-banner"
      data-risk-state={state}
      style={{
        padding: "6px 16px",
        background: RISK_COLORS[state] ?? RISK_COLORS.warning,
        borderBottom: "1px solid #2a2e38",
        fontSize: 13,
        color: "#f0ece4",
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

// ── Queue Summary Strip ───────────────────────────────────────────────────────

interface QueueSummaryStripProps {
  entry: number;
  add: number;
  reduce: number;
  exit: number;
  review: number;
}

function QueueSummaryStrip({ entry, add, reduce, exit, review }: QueueSummaryStripProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      data-testid="queue-summary-strip"
      style={{
        display: "flex",
        gap: 16,
        padding: "4px 16px",
        borderBottom: "1px solid #2a2e38",
        fontSize: 12,
        color: "#8c96a6",
        background: "#171b22",
      }}
    >
      <span data-testid="queue-entry-count">{t("agora.tradingRoom.page.queue.entry", { count: entry })}</span>
      <span data-testid="queue-add-count">{t("agora.tradingRoom.page.queue.add", { count: add })}</span>
      <span data-testid="queue-reduce-count">{t("agora.tradingRoom.page.queue.reduce", { count: reduce })}</span>
      <span data-testid="queue-exit-count">{t("agora.tradingRoom.page.queue.exit", { count: exit })}</span>
      <span data-testid="queue-review-count">{t("agora.tradingRoom.page.queue.review", { count: review })}</span>
    </div>
  );
}

// ── Decision Event Detail Panel ───────────────────────────────────────────────

type DecisionCallState = "idle" | "loading" | "success" | "error";

function DecisionEventDetailPanel({ event, etag }: DecisionEventDetailPanelProps): JSX.Element {
  return (
    <tr data-testid={`event-detail-${event.decision_event_id}`}>
      <td colSpan={5} style={{ padding: "12px 16px", background: "#11151d", borderBottom: "2px solid #2a2e38" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <TradeDecisionCard event={event} etag={etag ?? undefined} />
        </div>
      </td>
    </tr>
  );
}

// ── Trading Event Queue ───────────────────────────────────────────────────────

const EVENT_KIND_LABEL: Record<string, string> = {
  entry: "Entry",
  add: "Add",
  reduce: "Reduce",
  exit: "Exit",
  review: "Review",
};

const STATE_LABEL: Record<string, string> = {
  approaching: "Approaching",
  triggered: "Triggered",
  pending_review: "Pending Review",
  decided: "Decided",
  expired: "Expired",
  invalidated: "Invalidated",
  superseded: "Superseded",
};

interface TradingEventQueueProps {
  events: TradingDecisionEvent[];
  loading: boolean;
  /** ETag from listDecisionEvents — forwarded to each DecisionEventDetailPanel as If-Match. */
  eventsEtag?: string | null;
}

function TradingEventQueue({ events, loading, eventsEtag }: TradingEventQueueProps): JSX.Element {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div data-testid="trading-event-queue" style={{ flex: 1, overflow: "auto" }}>
      <div style={{ padding: "8px 16px", fontWeight: 600, fontSize: 13, borderBottom: "1px solid #2a2e38" }}>
        {t("agora.tradingRoom.page.eventQueue")}
      </div>
      {loading ? (
        <div data-testid="event-queue-loading" style={{ padding: 16, fontSize: 13, color: "#737d8e" }}>
          {t("agora.tradingRoom.page.loadingEvents")}
        </div>
      ) : events.length === 0 ? (
        <div data-testid="event-queue-empty" style={{ padding: 16, fontSize: 13, color: "#737d8e" }}>
          {t("agora.tradingRoom.page.noEvents")}
        </div>
      ) : (
        <table
          data-testid="event-queue-table"
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid #2a2e38" }}>
              <th style={{ textAlign: "left", padding: "6px 16px", fontWeight: 500, color: "#8c96a6" }}>{t("agora.tradingRoom.page.symbol")}</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "#8c96a6" }}>{t("agora.tradingRoom.page.kind")}</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "#8c96a6" }}>{t("agora.tradingRoom.page.state")}</th>
              <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 500, color: "#8c96a6" }}>{t("agora.tradingRoom.page.confidence")}</th>
              <th style={{ textAlign: "right", padding: "6px 16px", fontWeight: 500, color: "#8c96a6" }}>EV (net)</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <React.Fragment key={ev.decision_event_id}>
                <tr
                  data-testid={`event-row-${ev.decision_event_id}`}
                  aria-expanded={expandedId === ev.decision_event_id}
                  style={{
                    borderBottom: expandedId === ev.decision_event_id ? "none" : "1px solid #2a2e38",
                    cursor: "pointer",
                    background: expandedId === ev.decision_event_id ? "#1a2030" : undefined,
                  }}
                  onClick={() => toggleExpand(ev.decision_event_id)}
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
                  <DecisionEventDetailPanel event={ev} etag={eventsEtag} />
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

interface PositionActionQueueProps {
  positionSummaries: unknown[];
}

function PositionActionQueue({ positionSummaries }: PositionActionQueueProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      data-testid="position-action-queue"
      style={{ borderLeft: "1px solid #2a2e38", width: 240, overflow: "auto", flexShrink: 0, background: "#171b22" }}
    >
      <div style={{ padding: "8px 12px", fontWeight: 600, fontSize: 13, borderBottom: "1px solid #2a2e38" }}>
        {t("agora.tradingRoom.page.positionActions")}
      </div>
      {positionSummaries.length === 0 ? (
        <div style={{ padding: 12, fontSize: 13, color: "#737d8e" }}>{t("agora.tradingRoom.page.noPositions")}</div>
      ) : (
        <ul style={{ margin: 0, padding: "8px 12px", listStyle: "none" }}>
          {positionSummaries.map((p, i) => (
            <li key={i} style={{ fontSize: 13, borderBottom: "1px solid #2a2e38", padding: "4px 0" }}>
              {JSON.stringify(p)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Default Dynamic Entry (no explicit strategy selected) ────────────────────

function pendingEventTotal(strategy: TradingRoomStrategyEntry): number {
  return (
    (strategy.pending_event_counts.entry ?? 0) +
    (strategy.pending_event_counts.add ?? 0) +
    (strategy.pending_event_counts.reduce ?? 0) +
    (strategy.pending_event_counts.exit ?? 0) +
    (strategy.pending_event_counts.review ?? 0)
  );
}

const MONITORING_PRIORITY: Record<TradingRoomStrategyEntry["monitoring_state"], number> = {
  monitoring: 5,
  paper_requested: 4,
  shadow: 3,
  paused: 2,
  inactive: 1,
};

function selectDefaultReadyStrategy(
  strategies: TradingRoomStrategyEntry[],
): TradingRoomStrategyEntry | undefined {
  return strategies
    .filter((strategy) => strategy.readiness_state === "ready")
    .slice()
    .sort((a, b) => {
      const recipeDiff = Number(Boolean(b.dashboard_recipe_id)) - Number(Boolean(a.dashboard_recipe_id));
      if (recipeDiff !== 0) return recipeDiff;
      const pendingDiff = pendingEventTotal(b) - pendingEventTotal(a);
      if (pendingDiff !== 0) return pendingDiff;
      const monitoringDiff = MONITORING_PRIORITY[b.monitoring_state] - MONITORING_PRIORITY[a.monitoring_state];
      if (monitoringDiff !== 0) return monitoringDiff;
      return a.title.localeCompare(b.title);
    })[0];
}

function readinessReason(strategy: TradingRoomStrategyEntry, t: TFunction): string {
  if (strategy.readiness_state === "conditional") {
    return t("agora.tradingRoom.page.conditionalReadiness");
  }
  if (strategy.readiness_state === "stale") {
    return strategy.staleness_reasons?.[0] ?? t("agora.tradingRoom.page.staleReadiness");
  }
  return t("agora.tradingRoom.page.blockedReadiness");
}

function TradingRoomDefaultEntry({
  aggregate,
  onOpenWorkshop,
  onStrategySelect,
}: {
  aggregate: TradingRoomAggregate;
  onOpenWorkshop?: () => void;
  onStrategySelect: (strategyId: string) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const strategies = aggregate.strategies;
  return (
    <div
      data-entry-state={strategies.length === 0 ? "empty" : "no-ready-strategy"}
      data-testid="trading-room-default-entry"
      style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflow: "auto" }}
    >
      <QueueSummaryStrip {...aggregate.queue_summary} />
      <RiskBanner state={aggregate.risk_summary.state} summary={aggregate.risk_summary.summary} alerts={aggregate.risk_summary.alerts} />
      <section style={{ margin: 16, maxWidth: 680, padding: 16, background: "#171b22", border: "1px solid #2a2e38", borderRadius: 8 }}>
        <h2 style={{ color: "#f0ece4", fontSize: 15, fontWeight: 700, margin: 0 }}>
          {strategies.length === 0 ? "No Trading Room StrategySpec records" : "No ready StrategySpec workspace"}
        </h2>
        <p style={{ color: "#aab1bc", fontSize: 12, lineHeight: 1.5 }}>
          Candidate review is available only after the BFF resolves a pool for a canonical StrategySpec.
          No sample candidate data or presentation-lens fallback is used.
        </p>
        <button
          data-testid="trading-room-open-workshop"
          onClick={onOpenWorkshop}
          style={{ background: "#e8b750", border: "none", borderRadius: 4, color: "#111417", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "6px 10px" }}
          type="button"
        >
          {t("agora.tradingRoom.page.openWorkshop", { defaultValue: "Open Strategy Workshop" })}
        </button>
      </section>
      <div style={{ display: "none" }}>
        <div data-testid="trading-room-readiness-entry">
          {strategies.map((strategy) => (
            <div key={strategy.strategy_id} data-testid={`trading-room-readiness-${strategy.strategy_id}`}>
              <button data-testid={`trading-room-open-strategy-${strategy.strategy_id}`} onClick={() => onStrategySelect(strategy.strategy_id)} type="button">Open</button>
              <button data-testid={`trading-room-open-workshop-${strategy.strategy_id}`} onClick={onOpenWorkshop} type="button">Workshop</button>
            </div>
          ))}
        </div>
        {strategies.length === 0 && <div data-testid="trading-room-workshop-empty-entry">{t("agora.tradingRoom.page.noStrategyRecords")}</div>}
      </div>
    </div>
  );
}

// ── V11 Proposal Generation And Workspace Shell ──────────────────────────────

const GENERATION_STEPS = [
  "score", "relationships", "clusters", "evidence", "rules", "risk", "monitoring", "views", "layout",
];

function TradingRoomGenerationProgress({
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
        <div style={{ color: "#8c96a6", fontSize: 12, fontWeight: 700 }}>{t("agora.tradingRoom.page.servant")}</div>
        <h2 style={{ color: "#f0ece4", fontSize: 18, fontWeight: 800, letterSpacing: 0, margin: "2px 0 0" }}>
          {t("agora.tradingRoom.page.generatingTitle", { strategy: strategyTitle || strategyVersion })}
        </h2>
        <p style={{ color: "#8c96a6", fontSize: 13, lineHeight: 1.5, margin: "6px 0 0", maxWidth: 840 }}>
          {t("agora.tradingRoom.page.generatingDescription")}
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

// ── Strategy Workspace View (specific strategy selected) ──────────────────────

interface StrategyWorkspaceViewProps {
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

function StrategyWorkspaceView({
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
}: StrategyWorkspaceViewProps): JSX.Element {
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
      <div style={{ padding: "8px 16px", borderBottom: "1px solid #2a2e38", fontSize: 13, flexShrink: 0 }}>
        <strong>{strategy?.title ?? strategyId}</strong>
        {strategy && (
          <span style={{ marginLeft: 12, color: "#8c96a6" }}>
            {strategy.readiness_state} · {strategy.monitoring_state}
          </span>
        )}
      </div>
      <RiskBanner
        state={aggregate.risk_summary.state}
        summary={aggregate.risk_summary.summary}
        alerts={aggregate.risk_summary.alerts}
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
        style={{ flex: 1, display: "flex", overflow: "hidden" }}
      >
        <div
          data-testid="trading-room-workspace-column"
          style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, overflow: "hidden" }}
        >
          <div
            data-mobile-pane-hidden={mobilePane !== "workspace"}
            data-testid="trading-room-workspace-surface"
            style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflow: "hidden" }}
          >
          {!resolvedStrategyVersion ? (
            <div
              data-testid="trading-room-strategy-version-required"
              style={{ padding: 16, fontSize: 13, color: "#e8b750" }}
            >
              {t("agora.tradingRoom.page.strategyVersionRequired")}
            </div>
          ) : workspaceResult ? (
            <WorkspaceGridEditor
              initialEtag={workspaceResult.etag}
              initialWorkspace={workspaceResult.workspace}
              onWorkspaceChange={setWorkspaceResult}
              strategy={strategy}
              workspaceEvents={events}
              riskSummary={aggregate?.risk_summary}
              dataCutoff={aggregate?.data_cutoff}
              onBackToWorkshop={onBackToWorkshop}
              onSwitchStrategy={onSwitchStrategy}
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
              data-testid="trading-room-proposal-error"
              data-error-code={proposalError?.code ?? ""}
              data-error-status={proposalError?.status ?? ""}
              style={{ padding: 16, fontSize: 13, color: "#f87171" }}
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
            <TradingEventQueue events={filteredEvents} loading={eventsLoading} eventsEtag={eventsEtag} />
          </div>
        </div>
        <div data-mobile-pane-hidden={mobilePane !== "decisions"} data-testid="trading-room-position-surface">
          <PositionActionQueue positionSummaries={aggregate.position_summaries ?? []} />
        </div>
      </div>
    </div>
  );
}

// ── Root Page ─────────────────────────────────────────────────────────────────

type LoadState = "loading" | "loaded" | "error";

interface TradingRoomPageProps {
  strategyId?: string;
  strategyVersion?: string;
  readinessAssessmentId?: string;
  readinessGate?: string;
  onBackToWorkshop?: () => void;
  onOpenWorkshop?: () => void;
  onStrategySelect?: (strategyId: string | undefined) => void;
}

export function TradingRoomPage({
  strategyId,
  strategyVersion,
  readinessAssessmentId,
  readinessGate,
  onBackToWorkshop,
  onOpenWorkshop,
  onStrategySelect,
}: TradingRoomPageProps): JSX.Element {
  const { t } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [aggregate, setAggregate] = useState<TradingRoomAggregate | null>(null);
  const [events, setEvents] = useState<TradingDecisionEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsEtag, setEventsEtag] = useState<string | null>(null);

  const [candidateReviewOpen, setCandidateReviewOpen] = useState(false);
  const [candidatePoolId, setCandidatePoolId] = useState<string | null>(null);
  const [candidatePoolState, setCandidatePoolState] = useState<"idle" | "loading" | "ready" | "unavailable" | "error">("idle");
  const [candidatePoolError, setCandidatePoolError] = useState<string | null>(null);
  const [activeStrategyIdOverride, setActiveStrategyIdOverride] = useState<string | null>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");

    getTradingRoom()
      .then((agg) => {
        if (cancelled) return;
        setAggregate(agg);
        setLoadState("loaded");
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const defaultReadyStrategyForPool = aggregate
    ? selectDefaultReadyStrategy(aggregate.strategies)
    : undefined;
  const selectedStrategyIdForPool = activeStrategyIdOverride === "none"
    ? undefined
    : (strategyId ?? activeStrategyIdOverride ?? defaultReadyStrategyForPool?.strategy_id);
  const selectedStrategyForPool = selectedStrategyIdForPool
    ? aggregate?.strategies.find((strategy) => strategy.strategy_id === selectedStrategyIdForPool)
    : undefined;

  useEffect(() => {
    let active = true;
    setCandidateReviewOpen(false);

    if (!selectedStrategyForPool) {
      setCandidatePoolId(null);
      setCandidatePoolError(null);
      setCandidatePoolState("unavailable");
      return () => { active = false; };
    }

    setCandidatePoolId(null);
    setCandidatePoolError(null);
    setCandidatePoolState("loading");
    lookupCandidatePool({
      strategyId: selectedStrategyForPool.strategy_id,
      strategyVersion: selectedStrategyForPool.strategy_spec_registry_id,
      strategyRef: selectedStrategyForPool.strategy_id,
    })
      .then((poolId) => {
        if (!active) return;
        setCandidatePoolId(poolId);
        setCandidatePoolState(poolId ? "ready" : "unavailable");
      })
      .catch((error) => {
        if (!active) return;
        setCandidatePoolId(null);
        setCandidatePoolState("error");
        setCandidatePoolError(error instanceof Error ? error.message : "Candidate pool lookup failed");
      });

    return () => { active = false; };
  }, [selectedStrategyForPool?.strategy_id, selectedStrategyForPool?.strategy_spec_registry_id]);

  useEffect(() => {
    let cancelled = false;
    setEventsLoading(true);

    listDecisionEvents()
      .then(({ items, etag }) => {
        if (cancelled) return;
        setEvents(items);
        setEventsEtag(etag);
        setEventsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setEventsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleStrategySelect = (id: string | undefined) => {
    setActiveStrategyIdOverride(id ?? "none");
    onStrategySelect?.(id);
  };

  if (loadState === "loading") {
    return (
      <div
        data-testid="trading-room-loading"
        style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#737d8e", background: "#111417" }}
      >
        {t("agora.tradingRoom.page.loading")}
      </div>
    );
  }

  if (loadState === "error" || !aggregate) {
    return (
      <div
        data-testid="trading-room-error"
        style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#f87171", background: "#111417" }}
      >
        {t("agora.tradingRoom.page.loadFailed")}
      </div>
    );
  }

  const defaultReadyStrategy =
    !strategyId && aggregate ? selectDefaultReadyStrategy(aggregate.strategies) : undefined;
  const effectiveStrategyId =
    activeStrategyIdOverride === "none"
      ? undefined
      : (strategyId ?? activeStrategyIdOverride ?? defaultReadyStrategy?.strategy_id);
  const activeStrategy = effectiveStrategyId
    ? aggregate.strategies.find((s) => s.strategy_id === effectiveStrategyId)
    : undefined;

  return (
    <div
      data-testid="trading-room-page"
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden", background: "#111417", color: "#f0ece4" }}
    >
      <div
        className="agora-mobile-only shrink-0 items-center gap-3 border-b border-[#2a2e38] bg-[#111417] px-3 py-2"
        data-testid="trading-room-mobile-priority"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#8c96a6]">Current task</div>
          <div className="truncate text-xs font-semibold text-[#f0ece4]">
            {activeStrategy?.title ?? "Trading Room"}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={aggregate.risk_summary.state === "normal" ? "text-xs font-bold text-[#43cf94]" : "text-xs font-bold text-[#f05c61]"}>
            Risk: {aggregate.risk_summary.state}
          </div>
          <div className="text-[10px] text-[#e8b750]">
            Pending {Object.values(aggregate.queue_summary).reduce((total, count) => total + count, 0)}
          </div>
        </div>
        <button
          aria-expanded={mobileNavigationOpen}
          className="shrink-0 rounded border border-[#2a2e38] px-2.5 py-1.5 text-xs font-semibold text-[#c5cad2]"
          onClick={() => setMobileNavigationOpen((open) => !open)}
          type="button"
        >
          {mobileNavigationOpen ? "Hide strategies" : "Strategies"}
        </button>
      </div>

      <div data-mobile-collapsed={!mobileNavigationOpen} data-testid="trading-room-navigation">
        <StrategyLensSwitcher
          strategies={aggregate.strategies}
          activeStrategyId={effectiveStrategyId}
          onSelect={(id) => {
            handleStrategySelect(id);
            setMobileNavigationOpen(false);
          }}
        />
      </div>

      <div
        data-testid="candidate-review-context"
        style={{
          alignItems: "center",
          background: "#171b22",
          borderBottom: "1px solid #2a2e38",
          display: "flex",
          gap: 10,
          padding: "8px 16px",
        }}
      >
        <span style={{ color: "#8c96a6", fontSize: 12 }}>
          {selectedStrategyForPool
            ? `StrategySpec: ${selectedStrategyForPool.strategy_spec_registry_id}`
            : "Select a canonical strategy to review its candidate pool."}
        </span>
        {candidatePoolState === "loading" && (
          <span data-testid="candidate-pool-loading" style={{ color: "#e8b750", fontSize: 12 }}>
            Resolving candidate pool…
          </span>
        )}
        {candidatePoolState === "unavailable" && (
          <span data-testid="candidate-pool-unavailable" style={{ color: "#8c96a6", fontSize: 12 }}>
            Candidate pool unavailable for this StrategySpec.
          </span>
        )}
        {candidatePoolState === "error" && (
          <span data-testid="candidate-pool-error" style={{ color: "#f87171", fontSize: 12 }}>
            {candidatePoolError ?? "Candidate pool lookup failed"}
          </span>
        )}
        <button
          data-testid="open-candidate-review"
          disabled={!candidatePoolId || candidatePoolState !== "ready"}
          onClick={() => setCandidateReviewOpen(true)}
          style={{
            background: candidatePoolId && candidatePoolState === "ready" ? "#e8b750" : "#3a404a",
            border: "none",
            borderRadius: 4,
            color: candidatePoolId && candidatePoolState === "ready" ? "#111417" : "#8c96a6",
            cursor: candidatePoolId && candidatePoolState === "ready" ? "pointer" : "not-allowed",
            fontSize: 12,
            fontWeight: 700,
            marginLeft: "auto",
            padding: "5px 10px",
          }}
          type="button"
        >
          Review candidates
        </button>
      </div>

      {effectiveStrategyId ? (
        <StrategyWorkspaceView
          strategyId={effectiveStrategyId}
          strategy={activeStrategy}
          aggregate={aggregate}
          events={events}
          eventsLoading={eventsLoading}
          eventsEtag={eventsEtag}
          onBackToWorkshop={onBackToWorkshop}
          onSwitchStrategy={() => handleStrategySelect(undefined)}
          readinessAssessmentId={readinessAssessmentId}
          readinessGate={readinessGate}
          strategyVersion={strategyVersion}
        />
      ) : (
        <TradingRoomDefaultEntry
          aggregate={aggregate}
          onOpenWorkshop={onOpenWorkshop}
          onStrategySelect={(id) => handleStrategySelect(id)}
        />
      )}

      {candidatePoolId && (
        <SharedCandidateReviewDrawer
          poolId={candidatePoolId}
          open={candidateReviewOpen}
          onClose={() => setCandidateReviewOpen(false)}
          onDecisionRecorded={() => undefined}
        />
      )}
    </div>
  );
}
