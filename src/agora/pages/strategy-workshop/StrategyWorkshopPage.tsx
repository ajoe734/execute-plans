import React, { useEffect, useReducer, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
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
  type WorkshopReadinessAssessment,
  type WorkshopStreamEvent,
} from "@/lib/bff-v1/agora/workshops";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/workshops";
import { WorkshopCardRenderer } from "@/agora/components/WorkshopCardRenderer";
import { StrategyCompletenessRail } from "@/agora/components/StrategyCompletenessRail";
import { materializeWorkshopCompleteness } from "@/agora/components/workshopCompletenessDisplay";
import {
  ArrowLeft,
  Bot,
  Layers,
  AlertTriangle,
  Send,
  XCircle,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  readiness: WorkshopReadinessAssessment | null,
): WorkshopReadinessAssessment["highest_ready_gate"] | null {
  if (!readiness) return null;
  if (readiness.highest_ready_gate) return readiness.highest_ready_gate;
  return readiness.passed && readiness.gate ? readiness.gate : null;
}

function readinessText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function tradingRoomHandoffFromReadiness(
  readiness: WorkshopReadinessAssessment | null,
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
  readiness: WorkshopReadinessAssessment | null,
  handoff: TradingRoomReadinessHandoff | null,
): string | null {
  if (!readiness) return "Readiness not yet assessed";
  const highestGate = readinessHighestGate(readiness);
  if (highestGate !== "trading_room") {
    return `Trading Room gate not yet ready (highest: ${highestGate ?? "none"})`;
  }
  if (!readinessText(readiness.strategy_id)) {
    return "Trading Room handoff is missing strategy id";
  }
  if (!readinessText(readiness.strategy_spec_registry_id)) {
    return "Trading Room handoff is missing strategy version";
  }
  return handoff ? null : "Trading Room handoff is incomplete";
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

function workshopTitle(workshop: StrategyWorkshop | null | undefined): string {
  return (
    metadataString(workshop, "strategy_name") ??
    metadataString(workshop, "title") ??
    metadataString(workshop, "display_name") ??
    workshop?.subject?.title?.trim() ??
    "Strategy workshop"
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

function compactTime(workshop: StrategyWorkshop): string {
  const updatedAt = metadataString(workshop, "updated_at");
  const value = updatedAt ?? workshop.concluded_at ?? workshop.created_at;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time unavailable";
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

function readinessSummary(readiness: WorkshopReadinessAssessment | null): string {
  if (!readiness) return "Readiness: pending";
  return `Readiness: ${readinessHighestGate(readiness) ?? "none"}`;
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
  const [state, setState] = useState<ListState>("loading");
  const [workshops, setWorkshops] = useState<StrategyWorkshop[]>([]);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listWorkshops()
      .then((res) => {
        if (cancelled) return;
        const ordered = orderWorkshops(res);
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
        <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-500" data-testid="workshop-list-loading">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          Loading workshops...
        </div>
      )}
      {state === "empty" && (
        <div className="flex flex-col items-center gap-2 p-6 text-sm text-slate-500" data-testid="workshop-list-empty">
          <Bot className="h-10 w-10 text-slate-300" />
          No workshops found.
        </div>
      )}
      {state === "error" && (
        <div className="p-6 text-sm text-red-600" data-testid="workshop-list-error">Unable to load workshops.</div>
      )}
      {state === "loaded" && selectedWorkshopId && (
        <div
          className="grid min-h-0 flex-1 grid-cols-[minmax(210px,260px)_minmax(0,1fr)]"
          data-testid="strategy-workshop-live-tab"
        >
          <aside className="min-h-0 overflow-auto border-r border-slate-200 bg-slate-50 p-3" data-testid="workshop-selector">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase text-slate-500">
              <span>Live workshops</span>
              <span className="normal-case text-slate-400">{workshops.length} 個工坊</span>
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
                    <span className="block text-xs font-semibold text-slate-800">{workshopTitle(ws)}</span>
                    <span className="block text-[11px] text-slate-500">{ws.status} - {compactTime(ws)}</span>
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
  const [workshop, setWorkshop] = useState<StrategyWorkshop | null>(null);
  const [completeness, setCompleteness] = useState<WorkshopCompleteness | null>(null);
  const [readiness, setReadiness] = useState<WorkshopReadinessAssessment | null>(null);
  const [workshopEvents, setWorkshopEvents] = useState<WorkshopStreamEvent[]>([]);
  const [composerValue, setComposerValue] = useState("");

  // Custom states for PINT-005
  const [selectedMode, setSelectedMode] = useState<"ask" | "challenge" | "consult" | "propose_action" | "reflect">("ask");
  const [pickerSelectionType, setPickerSelectionType] = useState<"named" | "recommended" | "committee" | "red-team" | "same-style" | "cross-style">("recommended");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(["per_quant", "per_macro", "per_risk"]);
  const [focusedRef, setFocusedRef] = useState<string | null>(null);
  
  // Warning/Banner simulator states
  const [isStale, setIsStale] = useState(false);
  const [isDegraded, setIsDegraded] = useState(false);
  const [isDenied, setIsDenied] = useState(false);

  const [cardState, dispatch] = useReducer(cardReducer, {
    cards: [],
    lastEventId: null,
  });

  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  // Initial data load
  useEffect(() => {
    let cancelled = false;
    setSessionLoading(true);

    Promise.all([
      getWorkshop(workshopId)
        .then((ws) => { if (!cancelled) setWorkshop(ws); })
        .catch(() => undefined),
      getWorkshopCompleteness(workshopId)
        .then((c) => { if (!cancelled && c) setCompleteness(c); })
        .catch(() => undefined),
      getWorkshopReadiness(workshopId)
        .then((r) => { if (!cancelled && r) setReadiness(r); })
        .catch(() => undefined),
      listWorkshopCards(workshopId)
        .then((items) => {
          if (!cancelled) dispatch({ type: "RESET", cards: items });
        })
        .catch(() => undefined),
      listWorkshopEvents(workshopId)
        .then((response) => { if (!cancelled) setWorkshopEvents(response.items ?? []); })
        .catch(() => undefined),
    ]).finally(() => {
      if (!cancelled) setSessionLoading(false);
    });

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
    setFocusedRef(cardId);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!workshopId || !content || isDenied || sendLoading) return;
      setSendLoading(true);
      setSendError(null);
      try {
        await postWorkshopMessage(workshopId, {
          content,
          metadata: {
            mode: selectedMode,
            participant_persona_ids: selectedParticipants,
            focused_ref: focusedRef,
            subject_kind: workshop?.subject?.kind,
            subject_ref: workshop?.subject?.ref,
            picker_type: pickerSelectionType,
          },
        });
        setComposerValue("");
        setFocusedRef(null);
        refreshCards();
        refreshEvents();
        refreshCompleteness();
        refreshReadiness();
      } catch (err) {
        setSendError(err instanceof Error ? err.message : "Failed to send message");
      } finally {
        setSendLoading(false);
      }
    },
    [
      workshopId,
      selectedMode,
      selectedParticipants,
      focusedRef,
      workshop,
      pickerSelectionType,
      isDenied,
      sendLoading,
      refreshCards,
      refreshCompleteness,
      refreshEvents,
      refreshReadiness,
    ],
  );

  return (
    <div
      data-testid="strategy-workshop-page-session"
      className="flex h-full w-full overflow-hidden bg-slate-50"
    >
      {/* Left: conversation + composer */}
      <div className="flex flex-1 flex-col overflow-hidden bg-white border-r border-slate-200">

        {/* Session header */}
        <div
          aria-label={`${workshopTitle(workshop)} status`}
          className="flex h-auto min-h-12 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-2 bg-white z-10"
          data-testid="strategy-workshop-runtime-header"
        >
          <div className="flex flex-wrap items-center gap-3">
            <a
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
              href="/agora/strategy-workshop"
            >
              <ArrowLeft className="h-4 w-4" /> 工坊列表
            </a>
            <span className="text-slate-300">|</span>
            <span className="text-xs text-slate-500" data-testid="workshop-readiness-summary">
              {readinessSummary(readiness)}
            </span>
            <span className="text-xs text-slate-500" data-testid="workshop-card-summary">
              Cards: {cardState.cards.length}
            </span>
            <span className="text-xs text-slate-500" data-testid="workshop-event-summary">
              Events: {workshopEvents.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider",
              workshop?.status === "open"
                ? "bg-green-50 text-green-700 border border-green-100"
                : workshop?.status === "in_review"
                  ? "bg-amber-50 text-amber-700 border border-amber-100"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
            )}>
              {workshop?.status ?? "Loading"}
            </span>
          </div>
        </div>

        {/* Contextual Consultation Banner */}
        {workshop?.metadata?.decision_event_id && (
          <div
            data-testid="consultation-context-banner"
            className="bg-indigo-50 border-b border-indigo-200 px-4 py-3 text-xs text-indigo-900 shrink-0 flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-indigo-600 shrink-0" />
                <span className="font-semibold text-sm">Contextual Consultation Active</span>
              </div>
              <a
                href={`/agora/trading-room/${workshop.metadata.strategy_id || ""}`}
                className="text-indigo-600 hover:text-indigo-800 underline font-medium"
              >
                Back to Trading Room
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1 bg-white/60 p-2.5 rounded border border-indigo-100/50">
              <div>
                <strong>Decision Event ID:</strong> <span className="font-mono" data-testid="consultation-event-id">{workshop.metadata.decision_event_id as string}</span>
              </div>
              <div>
                <strong>Strategy Version:</strong> <span className="font-mono" data-testid="consultation-strategy-version">{(workshop.metadata.strategy_version as string) ?? "N/A"}</span>
              </div>
              {workshop.metadata.position_snapshot && (
                <div className="col-span-1 sm:col-span-2">
                  <strong>Position/Risk Snapshot:</strong>{" "}
                  <code className="text-[10px] bg-slate-100 px-1 py-0.5 rounded font-mono block mt-1 overflow-x-auto whitespace-pre" data-testid="consultation-position-snapshot">
                    {JSON.stringify(workshop.metadata.position_snapshot, null, 2)}
                  </code>
                </div>
              )}
              {Array.isArray(workshop.metadata.evidence_refs) && (workshop.metadata.evidence_refs.length > 0) && (
                <div className="col-span-1 sm:col-span-2">
                  <strong>Evidence References:</strong>
                  <div className="flex flex-wrap gap-1.5 mt-1" data-testid="consultation-evidence-refs">
                    {(workshop.metadata.evidence_refs as { ref_type: string; ref_id: string }[]).map((ref, idx) => (
                      <span key={idx} className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] text-slate-700">
                        {ref.ref_type}: {ref.ref_id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Warning messages if stale/degraded/denied */}
        {(isStale || isDegraded || isDenied || workshop?.status === "concluded") && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex flex-col gap-1.5 text-xs text-amber-800 shrink-0">
            {isStale && (
              <div className="flex items-center gap-1.5" data-testid="warning-stale">
                <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span><strong>Context Stale:</strong> The underlying strategy or evidence has changed. Reassessment recommended.</span>
              </div>
            )}
            {isDegraded && (
              <div className="flex items-center gap-1.5" data-testid="warning-degraded">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span><strong>Degraded Mode:</strong> LLM provider latency is high. Cached fallback models are active.</span>
              </div>
            )}
            {isDenied && (
              <div className="flex items-center gap-1.5 text-red-800 bg-red-50 p-1.5 rounded border border-red-100" data-testid="warning-denied">
                <ShieldAlert className="h-3.5 w-3.5 text-red-600 shrink-0" />
                <span><strong>Access Restricted:</strong> Write actions and live consultations are blocked for this user.</span>
              </div>
            )}
            {workshop?.status === "concluded" && (
              <div className="flex items-center gap-1.5 text-slate-800 bg-slate-50 p-1.5 rounded border border-slate-100">
                <XCircle className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                <span>This workshop has been concluded. No further messages can be posted.</span>
              </div>
            )}
          </div>
        )}

        {/* Conversation flow */}
        <div
          data-testid="workshop-conversation"
          className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-slate-50/50"
        >
          {sessionLoading && (
            <div data-testid="workshop-session-loading" className="flex items-center justify-center py-20 text-slate-400 gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent" />
              Loading session cards…
            </div>
          )}
          {!sessionLoading && cardState.cards.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400 gap-2">
              <Bot className="h-10 w-10 text-slate-300" />
              <p className="text-sm font-semibold">No activity cards found</p>
              <p className="text-xs">Submit a prompt below to start the conversation with the Servant.</p>
            </div>
          )}
          {!sessionLoading && cardState.cards
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

        {/* Composer section */}
        <div data-testid="servant-composer" className="border-t border-slate-200 bg-white p-4 shrink-0 flex flex-col gap-3">
          
          {/* Context Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600 border border-slate-100 shrink-0" data-testid="context-bar">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-slate-400" />
                <strong>Subject:</strong> {workshop?.subject.kind ?? "none"} ({workshop?.subject.ref ?? "none"})
              </span>
              <span className="text-slate-300">•</span>
              <span>
                <strong>Strategy Spec:</strong> v1.0
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                <strong>Environment:</strong> {((workshop?.metadata?.environment) as string) ?? "paper"}
              </span>
              {focusedRef && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
                    Focused: #{focusedRef}
                    <button 
                      onClick={() => setFocusedRef(null)}
                      className="text-indigo-400 hover:text-indigo-600 ml-1 font-bold"
                    >
                      ×
                    </button>
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                Latest Cutoff: 2026-07-12
              </span>
              <span className="text-slate-300">|</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsStale(!isStale)} 
                  className={cn("px-1.5 py-0.5 rounded border text-[9px] font-medium transition-colors", isStale ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-white text-slate-400 border-slate-200")}
                  data-testid="toggle-stale-btn"
                >
                  Stale
                </button>
                <button 
                  onClick={() => setIsDegraded(!isDegraded)} 
                  className={cn("px-1.5 py-0.5 rounded border text-[9px] font-medium transition-colors", isDegraded ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-white text-slate-400 border-slate-200")}
                  data-testid="toggle-degraded-btn"
                >
                  Degrade
                </button>
                <button 
                  onClick={() => setIsDenied(!isDenied)} 
                  className={cn("px-1.5 py-0.5 rounded border text-[9px] font-medium transition-colors", isDenied ? "bg-red-100 text-red-800 border-red-200" : "bg-white text-slate-400 border-slate-200")}
                  data-testid="toggle-denied-btn"
                >
                  Deny
                </button>
              </div>
            </div>
          </div>

          {/* Mode Selector & Participant Picker Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex flex-wrap items-center gap-4">
              {/* Mode Selector */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Interaction Mode</label>
                <Select
                  value={selectedMode}
                  onValueChange={(val: string) => setSelectedMode(val as typeof selectedMode)}
                >
                  <SelectTrigger className="w-[160px] h-8 text-xs font-semibold bg-white border-slate-200" data-testid="mode-selector">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    <SelectItem value="ask" className="text-xs">Ask (Explain & Analyse)</SelectItem>
                    <SelectItem value="challenge" className="text-xs">Challenge (Attack assumptions)</SelectItem>
                    <SelectItem value="consult" className="text-xs">Consult (Multiple Views)</SelectItem>
                    <SelectItem value="propose_action" className="text-xs">Propose (Candidate Measure)</SelectItem>
                    <SelectItem value="reflect" className="text-xs">Reflect (Thesis vs Outcome)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Participant Picker */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Participants</label>
                <Select
                  value={pickerSelectionType}
                  onValueChange={(val: string) => {
                    setPickerSelectionType(val as typeof pickerSelectionType);
                    if (val === "recommended") setSelectedParticipants(["per_quant", "per_macro", "per_risk"]);
                    else if (val === "committee") setSelectedParticipants(["per_risk", "per_macro"]);
                    else if (val === "red-team") setSelectedParticipants(["per_red"]);
                    else if (val === "same-style") setSelectedParticipants(["per_quant"]);
                    else if (val === "cross-style") setSelectedParticipants(["per_quant", "per_macro"]);
                    else if (val === "named") setSelectedParticipants(["per_quant"]);
                  }}
                >
                  <SelectTrigger className="w-[200px] h-8 text-xs font-semibold bg-white border-slate-200" data-testid="participant-picker">
                    <SelectValue placeholder="Select panel" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    <SelectItem value="recommended" className="text-xs">Recommended Panel</SelectItem>
                    <SelectItem value="committee" className="text-xs">Risk Committee</SelectItem>
                    <SelectItem value="red-team" className="text-xs">Red Team</SelectItem>
                    <SelectItem value="same-style" className="text-xs">Same-Style Comparison</SelectItem>
                    <SelectItem value="cross-style" className="text-xs">Cross-Style Comparison</SelectItem>
                    <SelectItem value="named" className="text-xs">Named Personas (Select)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Explanation box */}
            <div className="flex-1 min-w-[200px] max-w-[400px] bg-slate-50 border border-slate-100 p-2 rounded text-[11px] text-slate-500 leading-normal" data-testid="eligibility-explanation">
              {(() => {
                switch (pickerSelectionType) {
                  case "recommended":
                    return "Recommended Panel - Servant selected panel optimized for checking strategy completeness. Eligible.";
                  case "committee":
                    return "Risk Committee - Requires Risk Officer and Macro Strategist for capital allocations. Eligible.";
                  case "red-team":
                    return "Red Team - Adversary probing of strategy assumptions. Restricted to research/paper environment. Eligible.";
                  case "same-style":
                    return "Same-Style Comparison - Contrasts similar archetype models (e.g. Quant-to-Quant) to measure parameter sensitivity. Eligible.";
                  case "cross-style":
                    return "Cross-Style Comparison - Matches opposing styles (e.g. Quant vs Macro) to find regime blind spots. Eligible.";
                  case "named":
                    return "Named Personas - Check individual personas below to include them in the workshop session.";
                  default:
                    return "";
                }
              })()}
            </div>
          </div>

          {/* Named Persona check boxes when Named is selected */}
          {pickerSelectionType === "named" && (
            <div className="flex flex-wrap gap-4 border border-slate-100 bg-slate-50 p-2.5 rounded shrink-0" data-testid="named-checkbox-panel">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={selectedParticipants.includes("per_quant")}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedParticipants([...selectedParticipants, "per_quant"]);
                    else setSelectedParticipants(selectedParticipants.filter(p => p !== "per_quant"));
                  }}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span title="Deployed. Approved for all strategy scopes. Eligible.">Quant Architect</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={selectedParticipants.includes("per_macro")}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedParticipants([...selectedParticipants, "per_macro"]);
                    else setSelectedParticipants(selectedParticipants.filter(p => p !== "per_macro"));
                  }}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span title="Deployed. Approved for macro regime analysis. Eligible.">Macro Strategist</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={selectedParticipants.includes("per_risk")}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedParticipants([...selectedParticipants, "per_risk"]);
                    else setSelectedParticipants(selectedParticipants.filter(p => p !== "per_risk"));
                  }}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span title="Deployed. Approved for all risk assessment. Eligible.">Risk Officer Bot</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-400 cursor-not-allowed">
                <input 
                  type="checkbox" 
                  disabled
                  checked={false}
                  className="rounded border-slate-200 text-slate-300 cursor-not-allowed"
                />
                <span title="Under Review. Blocked: Restricted to research/paper environments.">Red Team Adversary (Disabled)</span>
              </label>
            </div>
          )}

          {/* Composer Input Area */}
          <div className="flex gap-2">
            <textarea
              className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
              data-testid="servant-composer-input"
              disabled={sendLoading || isDenied || workshop?.status === "concluded"}
              placeholder={isDenied ? "Access restricted..." : "描述你的策略構想或與 Persona 進行諮詢… (Ctrl+Enter 送出)"}
              rows={3}
              value={composerValue}
              onChange={(e) => setComposerValue(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && composerValue.trim() && !sendLoading && !isDenied) {
                  e.preventDefault();
                  handleSend(composerValue);
                }
              }}
            />
            <Button
              className="self-end bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 px-4 h-9 font-semibold disabled:opacity-50"
              data-testid="servant-composer-submit"
              disabled={sendLoading || isDenied || !composerValue.trim() || workshop?.status === "concluded"}
              onClick={() => handleSend(composerValue)}
              type="button"
            >
              {sendLoading ? (
                <span className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              送出
            </Button>
          </div>
          {sendError && (
            <p className="text-xs text-red-500 font-semibold" data-testid="servant-composer-error">{sendError}</p>
          )}
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
        className="shrink-0 bg-slate-50"
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
          className="bg-white"
        >
          {(() => {
            const handoff = tradingRoomHandoffFromReadiness(readiness);
            const disabledReason = addToTradingRoomDisabledReason(readiness, handoff);
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
                  Add to Trading Room
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
