import React, { useEffect, useReducer, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  listWorkshops,
  getWorkshop,
  getWorkshopCompleteness,
  getWorkshopReadiness,
  listWorkshopCards,
  listWorkshopEvents,
  postWorkshopMessage,
  openWorkshopStream,
  type WorkshopCard,
  type WorkshopCompleteness,
  type StrategyReadinessAssessment,
  type WorkshopStreamEvent,
} from "@/lib/bff-v1/agora/workshops";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/workshops";
import { WorkshopCardRenderer } from "@/agora/components/WorkshopCardRenderer";
import { StrategyCompletenessRail } from "@/agora/components/StrategyCompletenessRail";
import { materializeWorkshopCompleteness } from "@/agora/components/workshopCompletenessDisplay";

export interface TradingRoomReadinessHandoff {
  strategyId: string;
  strategyVersion: string;
  readinessGate: "trading_room";
  readinessAssessmentId: string;
  workshopId: string;
  workshopVersionId?: string;
  assessedAt?: string;
}

function readinessHighestGate(
  readiness: StrategyReadinessAssessment | null,
): StrategyReadinessAssessment["highest_ready_gate"] | null {
  if (!readiness) return null;
  if (readiness.highest_ready_gate) return readiness.highest_ready_gate;
  return readiness.passed && readiness.gate ? readiness.gate : null;
}

function readinessText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function tradingRoomHandoffFromReadiness(
  readiness: StrategyReadinessAssessment | null,
): TradingRoomReadinessHandoff | null {
  if (!readiness || readinessHighestGate(readiness) !== "trading_room") return null;

  const strategyId = readinessText(readiness.strategy_id);
  const strategyVersion = readinessText(readiness.strategy_spec_registry_id);
  if (!strategyId || !strategyVersion) return null;

  return {
    assessedAt: readiness.assessed_at,
    readinessAssessmentId: readiness.assessment_id,
    readinessGate: "trading_room",
    strategyId,
    strategyVersion,
    workshopId: readiness.workshop_id,
    workshopVersionId: readinessText(readiness.workshop_version_id) ?? undefined,
  };
}

function addToTradingRoomDisabledReason(
  readiness: StrategyReadinessAssessment | null,
  handoff: TradingRoomReadinessHandoff | null,
  t: TFunction,
): string | null {
  if (!readiness) return t("agora.workshop.readinessNotAssessed");
  const highestGate = readinessHighestGate(readiness);
  if (highestGate !== "trading_room") {
    return t("agora.workshop.gateNotReady", { gate: highestGate ?? t("agora.workshop.none") });
  }
  if (!readinessText(readiness.strategy_id)) {
    return t("agora.workshop.missingStrategyId");
  }
  if (!readinessText(readiness.strategy_spec_registry_id)) {
    return t("agora.workshop.missingStrategyVersion");
  }
  return handoff ? null : t("agora.workshop.incompleteHandoff");
}

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataString(workshop: StrategyWorkshop | null | undefined, key: string): string | null {
  const value = recordFrom(workshop?.metadata)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function workshopTitle(workshop: StrategyWorkshop | null | undefined, fallback = "Strategy workshop"): string {
  return (
    metadataString(workshop, "strategy_name") ??
    metadataString(workshop, "title") ??
    metadataString(workshop, "display_name") ??
    workshop?.subject?.title?.trim() ??
    fallback
  );
}

function timestampValue(workshop: StrategyWorkshop): number {
  const updatedAt = metadataString(workshop, "updated_at");
  const value = updatedAt ?? workshop.concluded_at ?? workshop.created_at;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function statusPriority(workshop: StrategyWorkshop): number {
  if (workshop.status === "open") return 4;
  if (workshop.status === "in_review") return 3;
  if (workshop.status === "concluded") return 2;
  return 1;
}

function orderWorkshops(workshops: StrategyWorkshop[]): StrategyWorkshop[] {
  return workshops.slice().sort((a, b) => {
    const statusDiff = statusPriority(b) - statusPriority(a);
    if (statusDiff !== 0) return statusDiff;
    return timestampValue(b) - timestampValue(a);
  });
}

function compactTime(workshop: StrategyWorkshop, unavailable = "time unavailable"): string {
  const updatedAt = metadataString(workshop, "updated_at");
  const value = updatedAt ?? workshop.concluded_at ?? workshop.created_at;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unavailable;
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

function readinessSummary(readiness: StrategyReadinessAssessment | null, t: TFunction): string {
  return t("agora.workshop.readiness", {
    gate: readiness ? readinessHighestGate(readiness) ?? t("agora.workshop.none") : t("agora.workshop.pending"),
  });
}

// ---------------------------------------------------------------------------
// Card list reducer
// ---------------------------------------------------------------------------

interface CardState {
  cards: WorkshopCard[];
  lastEventId: string | null;
}

type CardAction =
  | { type: "RESET"; cards: WorkshopCard[] }
  | { type: "UPSERT"; card: WorkshopCard }
  | { type: "SET_LAST_EVENT_ID"; id: string };

function cardReducer(state: CardState, action: CardAction): CardState {
  switch (action.type) {
    case "RESET":
      return { ...state, cards: action.cards };
    case "UPSERT": {
      const idx = state.cards.findIndex((c) => c.card_id === action.card.card_id);
      if (idx === -1) {
        return { ...state, cards: [...state.cards, action.card] };
      }
      const updated = [...state.cards];
      updated[idx] = action.card;
      return { ...state, cards: updated };
    }
    case "SET_LAST_EVENT_ID":
      return { ...state, lastEventId: action.id };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Workshop list view
// ---------------------------------------------------------------------------

type ListState = "loading" | "empty" | "loaded" | "error";

interface WorkshopListViewProps {
  onAddToTradingRoom?: (handoff: TradingRoomReadinessHandoff) => void;
}

function WorkshopListView({ onAddToTradingRoom }: WorkshopListViewProps): JSX.Element {
  const { t } = useTranslation();
  const [state, setState] = useState<ListState>("loading");
  const [workshops, setWorkshops] = useState<StrategyWorkshop[]>([]);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listWorkshops()
      .then((items) => {
        if (cancelled) return;
        const ordered = orderWorkshops(items);
        setWorkshops(ordered);
        setSelectedWorkshopId((current) => {
          if (current && ordered.some((workshop) => workshop.workshop_id === current)) return current;
          return ordered[0]?.workshop_id ?? null;
        });
        setState(ordered.length === 0 ? "empty" : "loaded");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="strategy-workshop-page-list">
      {state === "loading" && (
        <div className="p-6 text-sm text-slate-500" data-testid="workshop-list-loading">{t("agora.workshop.loadingList")}</div>
      )}
      {state === "empty" && (
        <div className="p-6 text-sm text-slate-500" data-testid="workshop-list-empty">{t("agora.workshop.emptyList")}</div>
      )}
      {state === "error" && (
        <div className="p-6 text-sm text-red-600" data-testid="workshop-list-error">{t("agora.workshop.listError")}</div>
      )}
      {state === "loaded" && selectedWorkshopId && (
        <div
          className="grid min-h-0 flex-1 grid-cols-[minmax(210px,260px)_minmax(0,1fr)]"
          data-testid="strategy-workshop-live-tab"
        >
          <aside className="min-h-0 overflow-auto border-r border-slate-200 bg-slate-50 p-3" data-testid="workshop-selector">
            <div className="mb-2 text-[11px] font-semibold uppercase text-slate-500">
              {t("agora.workshop.liveWorkshops")}
            </div>
            <div className="grid gap-2" data-testid="workshop-list">
              {workshops.map((ws) => {
                const selected = ws.workshop_id === selectedWorkshopId;
                return (
                  <button
                    aria-current={selected ? "page" : undefined}
                    className={
                      selected
                        ? "rounded-md border border-blue-300 bg-blue-50 p-2 text-left"
                        : "rounded-md border border-slate-200 bg-white p-2 text-left hover:border-slate-300"
                    }
                    data-testid={`workshop-item-${ws.workshop_id}`}
                    data-workshop-id={ws.workshop_id}
                    key={ws.workshop_id}
                    onClick={() => setSelectedWorkshopId(ws.workshop_id)}
                    type="button"
                  >
                    <span className="block text-xs font-semibold text-slate-800">{workshopTitle(ws, t("agora.workshop.defaultTitle"))}</span>
                    <span className="block text-[11px] text-slate-500">{ws.status} - {compactTime(ws, t("agora.workshop.timeUnavailable"))}</span>
                  </button>
                );
              })}
            </div>
          </aside>
          <section className="min-h-0 overflow-hidden" data-testid="selected-workshop-runtime">
            <WorkshopSessionView workshopId={selectedWorkshopId} onAddToTradingRoom={onAddToTradingRoom} />
          </section>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workshop session view
// ---------------------------------------------------------------------------

interface SessionViewProps {
  workshopId: string;
  onAddToTradingRoom?: (handoff: TradingRoomReadinessHandoff) => void;
}

function WorkshopSessionView({ workshopId, onAddToTradingRoom }: SessionViewProps): JSX.Element {
  const { t } = useTranslation();
  const [workshop, setWorkshop] = useState<StrategyWorkshop | null>(null);
  const [completeness, setCompleteness] = useState<WorkshopCompleteness | null>(null);
  const [readiness, setReadiness] = useState<StrategyReadinessAssessment | null>(null);
  const [workshopEvents, setWorkshopEvents] = useState<WorkshopStreamEvent[]>([]);
  const [composerValue, setComposerValue] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [cardState, dispatch] = useReducer(cardReducer, {
    cards: [],
    lastEventId: null,
  });

  // Initial data load
  useEffect(() => {
    let cancelled = false;
    getWorkshop(workshopId)
      .then((ws) => { if (!cancelled) setWorkshop(ws); })
      .catch(() => undefined);
    getWorkshopCompleteness(workshopId)
      .then((c) => { if (!cancelled && c) setCompleteness(c); })
      .catch(() => undefined);
    getWorkshopReadiness(workshopId)
      .then((r) => { if (!cancelled && r) setReadiness(r); })
      .catch(() => undefined);
    listWorkshopCards(workshopId)
      .then((items) => { if (!cancelled) dispatch({ type: "RESET", cards: items }); })
      .catch(() => undefined);
    listWorkshopEvents(workshopId)
      .then((response) => { if (!cancelled) setWorkshopEvents(response.items ?? []); })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workshopId]);

  // SSE stream subscription — refreshes completeness/readiness on relevant events
  const refreshCompleteness = useCallback(() => {
    getWorkshopCompleteness(workshopId)
      .then((c) => { if (c) setCompleteness(c); })
      .catch(() => undefined);
  }, [workshopId]);

  const refreshReadiness = useCallback(() => {
    getWorkshopReadiness(workshopId)
      .then((r) => { if (r) setReadiness(r); })
      .catch(() => undefined);
  }, [workshopId]);

  const refreshCards = useCallback(() => {
    listWorkshopCards(workshopId)
      .then((items) => dispatch({ type: "RESET", cards: items }))
      .catch(() => undefined);
  }, [workshopId]);

  const refreshEvents = useCallback(() => {
    listWorkshopEvents(workshopId)
      .then((response) => setWorkshopEvents(response.items ?? []))
      .catch(() => undefined);
  }, [workshopId]);

  useEffect(() => {
    const teardown = openWorkshopStream(workshopId, (event: WorkshopStreamEvent) => {
      dispatch({ type: "SET_LAST_EVENT_ID", id: event.event_id });
      switch (event.event_type) {
        case "workshop.completeness.updated":
          refreshCompleteness();
          refreshCards();
          break;
        case "workshop.readiness.updated":
          refreshReadiness();
          refreshCards();
          break;
        case "workshop.servant.response.completed":
        case "research.plan.created":
        case "research.plan.approved":
        case "research.run.queued":
        case "research.run.progress":
        case "research.run.completed":
        case "research.run.failed":
        case "consultation.started":
        case "consultation.completed":
        case "workshop.patch.proposed":
        case "workshop.patch.validated":
        case "workshop.version.created":
          refreshCards();
          refreshEvents();
          break;
        case "workshop.snapshot":
          refreshCards();
          refreshCompleteness();
          refreshReadiness();
          refreshEvents();
          break;
        default:
          break;
      }
    });
    return teardown;
  }, [workshopId, refreshCards, refreshCompleteness, refreshEvents, refreshReadiness]);

  // Derive the most recent next_question card for the rail
  const nextQuestion =
    cardState.cards
      .filter((c) => c.card_type === "next_question")
      .sort((a, b) => b.sequence_no - a.sequence_no)[0] ?? null;
  const completenessCard =
    cardState.cards
      .filter((c) => c.card_type === "completeness_update")
      .sort((a, b) => b.sequence_no - a.sequence_no)[0] ?? null;
  const displayCompleteness = materializeWorkshopCompleteness(completeness, completenessCard);

  const handleContinueDiscussion = useCallback((cardId: string) => {
    setComposerValue((prev) => (prev ? prev : `Re: card ${cardId} - `));
  }, []);

  const handleSubmit = useCallback(async () => {
    const content = composerValue.trim();
    if (!content || submitState === "submitting") return;
    setSubmitState("submitting");
    setSubmitError(null);
    try {
      await postWorkshopMessage(workshopId, { content });
      setComposerValue("");
      refreshCards();
      refreshEvents();
      refreshCompleteness();
      refreshReadiness();
      setSubmitState("idle");
    } catch (error) {
      setSubmitState("error");
      setSubmitError(error instanceof Error ? error.message : t("agora.workshop.messageFailed"));
    }
  }, [
    composerValue,
    refreshCards,
    refreshCompleteness,
    refreshEvents,
    refreshReadiness,
    submitState,
    workshopId,
    t,
  ]);

  return (
    <div
      data-testid="strategy-workshop-page-session"
      style={{ display: "flex", height: "100%", overflow: "hidden" }}
    >
      {/* Left: conversation + composer */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header
          aria-label={`${workshopTitle(workshop)} status`}
          className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2"
          data-testid="strategy-workshop-runtime-header"
        >
          <span className="text-xs text-slate-500">{workshop?.status ?? t("agora.workshop.loading")}</span>
          <span className="text-xs text-slate-500" data-testid="workshop-readiness-summary">
            {readinessSummary(readiness, t)}
          </span>
          <span className="text-xs text-slate-500" data-testid="workshop-card-summary">
            {t("agora.workshop.cards", { count: cardState.cards.length })}
          </span>
          <span className="text-xs text-slate-500" data-testid="workshop-event-summary">
            {t("agora.workshop.events", { count: workshopEvents.length })}
          </span>
        </header>
        <div
          data-testid="workshop-conversation"
          style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
        >
          {!workshop && (
            <div data-testid="workshop-session-loading">{t("agora.workshop.loading")}</div>
          )}
          {cardState.cards
            .slice()
            .sort((a, b) => a.sequence_no - b.sequence_no)
            .map((card) => (
              <WorkshopCardRenderer
                key={card.card_id}
                card={card}
                onContinueDiscussion={handleContinueDiscussion}
              />
            ))}
        </div>

        <div
          data-testid="servant-composer"
          style={{ borderTop: "1px solid #e2e8f0", padding: 12 }}
        >
          <input
            type="text"
            value={composerValue}
            onChange={(e) => setComposerValue(e.target.value)}
            placeholder={t("agora.workshop.messagePlaceholder")}
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
          <button
            className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-300"
            data-testid="servant-composer-submit"
            disabled={!composerValue.trim() || submitState === "submitting"}
            onClick={handleSubmit}
            type="button"
          >
            {submitState === "submitting" ? t("agora.workshop.sending") : t("agora.workshop.send")}
          </button>
          {submitState === "error" && submitError ? (
            <div className="mt-1 text-xs text-red-600" data-testid="servant-composer-error">
              {submitError}
            </div>
          ) : null}
        </div>
      </div>

      {/* Right: completeness rail + trading room CTA */}
      <div
        data-testid="completeness-rail"
        style={{
          width: 240,
          borderLeft: "1px solid #e2e8f0",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: 1, overflow: "auto" }}>
          <StrategyCompletenessRail
            completeness={completeness}
            completenessCard={completenessCard}
            readiness={readiness}
            nextQuestion={nextQuestion}
          />
        </div>

        {/* Add to Trading Room — enabled only when trading_room gate ready AND handler provided */}
        <div
          style={{
            padding: "10px 12px",
            borderTop: "1px solid #e2e8f0",
            flexShrink: 0,
          }}
        >
          {(() => {
            const handoff = tradingRoomHandoffFromReadiness(readiness);
            const disabledReason = addToTradingRoomDisabledReason(readiness, handoff, t);
            const isActive = !!handoff && !!onAddToTradingRoom;
            return (
              <>
                <button
                  data-testid="add-to-trading-room-btn"
                  disabled={!isActive}
                  aria-disabled={!isActive}
                  title={disabledReason ?? undefined}
                  onClick={isActive ? () => onAddToTradingRoom?.(handoff) : undefined}
                  style={{
                    width: "100%",
                    padding: "7px 12px",
                    borderRadius: 6,
                    border: "none",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: isActive ? "pointer" : "not-allowed",
                    background: isActive ? "#1d4ed8" : "#e5e7eb",
                    color: isActive ? "#fff" : "#9ca3af",
                    transition: "background 0.15s",
                  }}
                >
                  {t("agora.workshop.addToTradingRoom")}
                </button>
                {disabledReason && (
                  <div
                    data-testid="add-to-trading-room-reason"
                    style={{ fontSize: 10, color: "#9ca3af", marginTop: 4, textAlign: "center" }}
                  >
                    {disabledReason}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Legacy test-id shims for existing tests */}
        {displayCompleteness && (
          <div data-testid="completeness-grade" style={{ display: "none" }}>
            {displayCompleteness.overall_grade}
          </div>
        )}
        {readiness && (
          <div data-testid="workshop-readiness" style={{ display: "none" }}>
            {readiness.highest_ready_gate ?? "Not ready"}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

interface StrategyWorkshopPageProps {
  workshopId?: string;
  onAddToTradingRoom?: (handoff: TradingRoomReadinessHandoff) => void;
}

export function StrategyWorkshopPage({ workshopId, onAddToTradingRoom }: StrategyWorkshopPageProps): JSX.Element {
  if (workshopId) {
    return <WorkshopSessionView workshopId={workshopId} onAddToTradingRoom={onAddToTradingRoom} />;
  }
  return <WorkshopListView onAddToTradingRoom={onAddToTradingRoom} />;
}
