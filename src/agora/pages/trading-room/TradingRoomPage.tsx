import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { reasonCodeDisplay, statusLabel } from "@/lib/enumLabels";
import {
  getTradingRoom,
  listDecisionEvents,
  subscribeTradingRoomStream,
  type TradingRoomAggregate,
  type TradingRoomStrategyEntry,
  type TradingDecisionEvent,
  type TradingRoomStreamMode,
} from "@/lib/bff-v1/agora/tradingRoom";
import {
  getAgoraOperationalReadiness,
  type AgoraOperationalReadiness,
} from "@/lib/bff-v1/agora/operationalReadiness";
import { CandidateReviewDrawer as SharedCandidateReviewDrawer } from "@/agora/components/CandidateReviewDrawer";
import { lookupCandidatePool } from "@/lib/bff-v1/agora/candidatePool";
import {
  RiskBanner,
  TradingRoomWorkspace,
  StrategyWorkspaceView,
} from "./TradingRoomWorkspace";

export { TradingRoomWorkspace };

/** Debounce for stream-driven resyncs so a burst of events re-reads once. */
const STREAM_RESYNC_DEBOUNCE_MS = 250;

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
          {t("agora.tradingRoom.candidateContext.noStrategyWorkspace")}
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
              {strategy.strategy_spec_registry_id} · {statusLabel(strategy.readiness_state, t)}
            </span>
          </button>
        );
      })}
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
  if (strategies.length === 0) {
    return (
      <div
        data-entry-state="empty"
        data-testid="trading-room-default-entry"
        style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflow: "auto" }}
      >
        <section
          data-testid="trading-room-workshop-empty-entry"
          style={{ margin: 16, maxWidth: 680, padding: 16, background: "#171b22", border: "1px solid #2a2e38", borderRadius: 8 }}
        >
          <h2 style={{ color: "#f0ece4", fontSize: 15, fontWeight: 700, margin: 0 }}>
            {t("agora.tradingRoom.page.noWorkshopStrategiesTitle", { defaultValue: "你還沒有工坊策略" })}
          </h2>
          <p style={{ color: "#aab1bc", fontSize: 12, lineHeight: 1.5, margin: "8px 0 12px" }}>
            {t("agora.tradingRoom.page.noWorkshopStrategiesDescription", {
              defaultValue: "交易操盤室會顯示你在策略工坊完成並加入的策略。",
            })}
          </p>
          <button
            data-testid="trading-room-open-workshop"
            onClick={onOpenWorkshop}
            style={{ background: "#e8b750", border: "none", borderRadius: 4, color: "#111417", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "6px 10px" }}
            type="button"
          >
            {t("agora.tradingRoom.page.goToWorkshop", { defaultValue: "前往策略工坊" })}
          </button>
        </section>
      </div>
    );
  }
  return (
    <div
      data-entry-state="no-ready-strategy"
      data-testid="trading-room-default-entry"
      style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflow: "auto" }}
    >
      <QueueSummaryStrip {...aggregate.queue_summary} />
      <RiskBanner state={aggregate.risk_summary.state} summary={aggregate.risk_summary.summary} alerts={aggregate.risk_summary.alerts} />
      <section style={{ margin: 16, maxWidth: 680, padding: 16, background: "#171b22", border: "1px solid #2a2e38", borderRadius: 8 }}>
        <h2 style={{ color: "#f0ece4", fontSize: 15, fontWeight: 700, margin: 0 }}>
          {t("agora.tradingRoom.page.noReadyStrategy")}
        </h2>
        <p style={{ color: "#aab1bc", fontSize: 12, lineHeight: 1.5 }}>
          {t("agora.tradingRoom.page.notReadyDescription")}
        </p>
        <button
          data-testid="trading-room-open-workshop"
          onClick={onOpenWorkshop}
          style={{ background: "#e8b750", border: "none", borderRadius: 4, color: "#111417", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "6px 10px" }}
          type="button"
        >
          {t("agora.tradingRoom.page.goToWorkshop", { defaultValue: "前往策略工坊" })}
        </button>
      </section>
      <div style={{ display: "none" }}>
        <div data-testid="trading-room-readiness-entry">
          {strategies.map((strategy) => (
            <div key={strategy.strategy_id} data-testid={`trading-room-readiness-${strategy.strategy_id}`}>
              <button data-testid={`trading-room-open-strategy-${strategy.strategy_id}`} onClick={() => onStrategySelect(strategy.strategy_id)} type="button">{t("agora.tradingRoom.candidateContext.open")}</button>
              <button data-testid={`trading-room-open-workshop-${strategy.strategy_id}`} onClick={onOpenWorkshop} type="button">{t("agora.tradingRoom.candidateContext.workshop")}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// ── Root Page ─────────────────────────────────────────────────────────────────

type LoadState = "loading" | "loaded" | "error";
type OperationalReadinessLoadState = "loading" | "ready" | "unavailable";

const TRADING_ROOM_READINESS_SURFACES = ["signals", "decision_events", "candidates"];

function isNoWorkshopStrategiesReadiness(readiness: AgoraOperationalReadiness | null): boolean {
  if (!readiness) return false;
  if (readiness.signal_producer.reason === "no_workshop_strategies") return true;
  return Object.values(readiness.surfaces).some((surface) => surface.reason === "no_workshop_strategies");
}

function operationalReadinessMessage(readiness: AgoraOperationalReadiness, t: TFunction): string {
  switch (readiness.source.freshness) {
    case "stale":
      return t("agora.tradingRoom.page.readiness.messages.stale");
    case "empty_fresh":
      return t("agora.tradingRoom.page.readiness.messages.empty_fresh");
    case "not_configured":
      return t("agora.tradingRoom.page.readiness.messages.not_configured");
    case "unavailable":
      return t("agora.tradingRoom.page.readiness.messages.unavailable");
    case "degraded":
      return t("agora.tradingRoom.page.readiness.messages.degraded");
    default:
      return t("agora.tradingRoom.page.readiness.messages.fresh");
  }
}

function operationalReadinessColor(readiness: AgoraOperationalReadiness): string {
  if (readiness.source.freshness === "fresh") return "#56d98b";
  if (readiness.source.freshness === "empty_fresh") return "#e8b750";
  if (
    readiness.source.freshness === "not_configured" ||
    readiness.status === "not_configured" ||
    isNoWorkshopStrategiesReadiness(readiness)
  ) {
    return "#8c96a6";
  }
  return "#f87171";
}

function operationalReadinessFreshnessLabel(readiness: AgoraOperationalReadiness, t: TFunction): string {
  if (isNoWorkshopStrategiesReadiness(readiness) || readiness.source.freshness === "not_configured") {
    return t("agora.tradingRoom.page.readiness.freshness.not_configured");
  }
  return t(`agora.tradingRoom.page.readiness.freshness.${readiness.source.freshness}`, {
    defaultValue: statusLabel(readiness.source.freshness, t),
  });
}

function operationalReadinessSourceLine(
  source: AgoraOperationalReadiness["source"],
  t: TFunction,
): string {
  const instanceId = source.source_instance_id?.trim() || null;
  const snapshotId = source.snapshot_id?.trim() || null;
  if (instanceId && snapshotId && instanceId !== snapshotId) {
    return t("agora.tradingRoom.page.readiness.sourceWithSnapshot", {
      source: instanceId,
      snapshot: snapshotId,
    });
  }
  if (instanceId) {
    return t("agora.tradingRoom.page.readiness.sourceOnly", { source: instanceId });
  }
  if (snapshotId) {
    return t("agora.tradingRoom.page.readiness.snapshotOnly", { snapshot: snapshotId });
  }
  return t("agora.tradingRoom.page.readiness.sourceMissing");
}

function operationalReadinessProducerLine(
  producer: AgoraOperationalReadiness["signal_producer"],
  t: TFunction,
): string {
  if (producer.active_binding) {
    return t("agora.tradingRoom.page.readiness.producerWithBinding", {
      producer: producer.producer_id,
      binding: producer.active_binding,
    });
  }
  return t("agora.tradingRoom.page.readiness.producer", {
    producer: producer.producer_id,
  });
}

function TradingRoomOperationalReadiness({
  readiness,
  state,
}: {
  readiness: AgoraOperationalReadiness | null;
  state: OperationalReadinessLoadState;
}): JSX.Element | null {
  const { t } = useTranslation();
  if (state === "loading") {
    return (
      <div
        data-testid="trading-room-operational-readiness-loading"
        style={{ background: "#171b22", borderBottom: "1px solid #2a2e38", color: "#8c96a6", fontSize: 12, padding: "7px 16px" }}
      >
        {t("agora.tradingRoom.page.readiness.loading")}
      </div>
    );
  }

  if (state === "unavailable" || !readiness) {
    return (
      <div
        data-testid="trading-room-operational-readiness-unavailable"
        style={{ background: "#2a1d1d", borderBottom: "1px solid #5c3232", color: "#f3b1b1", fontSize: 12, padding: "7px 16px" }}
      >
        {t("agora.tradingRoom.page.readiness.unavailable")}
      </div>
    );
  }

  if (readiness.status === "not_configured" && isNoWorkshopStrategiesReadiness(readiness)) {
    return null;
  }

  const source = readiness.source;
  const producer = readiness.signal_producer;
  const badgeColor = operationalReadinessColor(readiness);
  return (
    <section
      data-operational-status={readiness.status}
      data-source-freshness={source.freshness}
      data-testid="trading-room-operational-readiness"
      style={{ background: "#171b22", borderBottom: "1px solid #2a2e38", display: "grid", gap: 6, padding: "8px 16px" }}
    >
      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 }}>
        <strong style={{ color: "#f0ece4", fontSize: 12 }}>
          {t("agora.tradingRoom.page.readiness.title")}
        </strong>
        <span
          data-testid="trading-room-readiness-badge"
          style={{ border: `1px solid ${badgeColor}`, borderRadius: 999, color: badgeColor, fontSize: 11, fontWeight: 700, padding: "2px 7px" }}
        >
          {operationalReadinessFreshnessLabel(readiness, t)}
        </span>
        <span data-testid="trading-room-readiness-source" style={{ color: "#c4ccda", fontSize: 12 }}>
          {operationalReadinessSourceLine(source, t)}
        </span>
        <span data-testid="trading-room-readiness-producer" style={{ color: "#c4ccda", fontSize: 12 }}>
          {operationalReadinessProducerLine(producer, t)}
        </span>
        <span style={{ color: "#8c96a6", fontSize: 11, marginLeft: "auto" }}>
          {t("agora.tradingRoom.page.readiness.readOnlyProjection")}
        </span>
      </div>
      <div style={{ color: "#aab1bc", fontSize: 12 }}>{operationalReadinessMessage(readiness, t)}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {TRADING_ROOM_READINESS_SURFACES.map((name) => {
          const surface = readiness.surfaces[name];
          if (!surface) return null;
          const surfaceLabel = t(`agora.tradingRoom.page.readiness.surfaces.${name}`, {
            defaultValue: name.replace(/_/g, " "),
          });
          const surfaceStatus = statusLabel(surface.status, t);
          const surfaceReason = surface.reason && surface.reason !== "healthy"
            ? reasonCodeDisplay(surface.reason, t).text
            : null;
          return (
            <span data-testid={`trading-room-readiness-surface-${name}`} key={name} style={{ color: "#c4ccda", fontSize: 11 }}>
              {surfaceLabel}：{surfaceStatus}（{surface.count}）{surfaceReason ? ` · ${surfaceReason}` : ""}
            </span>
          );
        })}
      </div>
    </section>
  );
}

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
  const navigate = useNavigate();
  const handleOpenWorkshop = onOpenWorkshop ?? (() => navigate("/agora/strategy-workshop"));
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [aggregate, setAggregate] = useState<TradingRoomAggregate | null>(null);
  const [events, setEvents] = useState<TradingDecisionEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsEtag, setEventsEtag] = useState<string | null>(null);
  const [operationalReadiness, setOperationalReadiness] = useState<AgoraOperationalReadiness | null>(null);
  const [operationalReadinessState, setOperationalReadinessState] = useState<OperationalReadinessLoadState>("loading");

  const [candidateReviewOpen, setCandidateReviewOpen] = useState(false);
  const [candidatePoolId, setCandidatePoolId] = useState<string | null>(null);
  const [candidatePoolState, setCandidatePoolState] = useState<"idle" | "loading" | "ready" | "unavailable" | "error">("idle");
  const [candidatePoolError, setCandidatePoolError] = useState<string | null>(null);
  const [activeStrategyIdOverride, setActiveStrategyIdOverride] = useState<string | null>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [streamMode, setStreamMode] = useState<TradingRoomStreamMode>("connecting");
  const [queueUpdatedAt, setQueueUpdatedAt] = useState<string | null>(null);
  const resyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    getAgoraOperationalReadiness()
      .then((next) => {
        if (cancelled) return;
        setOperationalReadiness(next);
        setOperationalReadinessState("ready");
      })
      .catch(() => {
        if (!cancelled) setOperationalReadinessState("unavailable");
      });
    return () => { cancelled = true; };
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
        setCandidatePoolError(error instanceof Error ? error.message : null);
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
        setQueueUpdatedAt(new Date().toISOString());
      })
      .catch(() => {
        if (!cancelled) setEventsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Live decision queue (SA AD-AG-06): the authenticated SSE stream — or its
  // bounded polling fallback — triggers a silent re-read of the resync routes
  // so the queue updates without reloading the page.
  const resyncQueue = useCallback(() => {
    listDecisionEvents()
      .then(({ items, etag }) => {
        setEvents(items);
        setEventsEtag(etag);
        setQueueUpdatedAt(new Date().toISOString());
      })
      .catch(() => undefined);
    getTradingRoom()
      .then((agg) => setAggregate(agg))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeTradingRoomStream({
      onChange: () => {
        if (resyncTimer.current) clearTimeout(resyncTimer.current);
        resyncTimer.current = setTimeout(resyncQueue, STREAM_RESYNC_DEBOUNCE_MS);
      },
      onModeChange: setStreamMode,
    });
    return () => {
      unsubscribe();
      if (resyncTimer.current) clearTimeout(resyncTimer.current);
    };
  }, [resyncQueue]);

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
      <div style={{ background: "#111417", color: "#f0ece4", display: "flex", flexDirection: "column", height: "100%" }}>
        <TradingRoomOperationalReadiness readiness={operationalReadiness} state={operationalReadinessState} />
        <div
          data-testid="trading-room-error"
          style={{ alignItems: "center", color: "#f87171", display: "flex", flex: 1, fontSize: 13, justifyContent: "center" }}
        >
          {t("agora.tradingRoom.page.loadFailed")}
        </div>
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
  const hasNoWorkshopStrategies = aggregate.strategies.length === 0 && !effectiveStrategyId;

  if (hasNoWorkshopStrategies) {
    return (
      <div
        data-testid="trading-room-page"
        style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden", background: "#111417", color: "#f0ece4" }}
      >
        <TradingRoomDefaultEntry
          aggregate={aggregate}
          onOpenWorkshop={handleOpenWorkshop}
          onStrategySelect={(id) => handleStrategySelect(id)}
        />
      </div>
    );
  }

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
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#8c96a6]">{t("agora.tradingRoom.mobile.currentTask")}</div>
          <div className="truncate text-xs font-semibold text-[#f0ece4]">
            {activeStrategy?.title ?? t("agora.tradingRoom.mobile.tradingRoom")}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={aggregate.risk_summary.state === "normal" ? "text-xs font-bold text-[#43cf94]" : "text-xs font-bold text-[#f05c61]"}>
            {t("agora.tradingRoom.mobile.risk", {
              state: t(`agora.tradingRoom.riskStates.${aggregate.risk_summary.state}`, { defaultValue: aggregate.risk_summary.state }),
            })}
          </div>
          <div className="text-[10px] text-[#e8b750]">
            {t("agora.tradingRoom.mobile.pending", {
              count: Object.values(aggregate.queue_summary).reduce((total, count) => total + count, 0),
            })}
          </div>
        </div>
        <button
          aria-expanded={mobileNavigationOpen}
          className="shrink-0 rounded border border-[#2a2e38] px-2.5 py-1.5 text-xs font-semibold text-[#c5cad2]"
          onClick={() => setMobileNavigationOpen((open) => !open)}
          type="button"
        >
          {mobileNavigationOpen ? t("agora.tradingRoom.mobile.hideStrategies") : t("agora.tradingRoom.mobile.strategies")}
        </button>
      </div>

      <TradingRoomOperationalReadiness readiness={operationalReadiness} state={operationalReadinessState} />

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
            ? t("agora.tradingRoom.candidateContext.strategySpec", { id: selectedStrategyForPool.strategy_spec_registry_id })
            : t("agora.tradingRoom.candidateContext.selectStrategy")}
        </span>
        {candidatePoolState === "loading" && (
          <span data-testid="candidate-pool-loading" style={{ color: "#e8b750", fontSize: 12 }}>
            {t("agora.tradingRoom.candidateContext.resolving")}
          </span>
        )}
        {candidatePoolState === "unavailable" && (
          <span data-testid="candidate-pool-unavailable" style={{ color: "#8c96a6", fontSize: 12 }}>
            {t("agora.tradingRoom.candidateContext.unavailable")}
          </span>
        )}
        {candidatePoolState === "error" && (
          <span data-testid="candidate-pool-error" style={{ color: "#f87171", fontSize: 12 }}>
            {candidatePoolError ?? t("agora.tradingRoom.candidateContext.lookupFailed")}
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
          {t("agora.tradingRoom.candidateContext.review")}
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
          streamMode={streamMode}
          queueUpdatedAt={queueUpdatedAt}
        />
      ) : (
        <TradingRoomDefaultEntry
          aggregate={aggregate}
          onOpenWorkshop={handleOpenWorkshop}
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
