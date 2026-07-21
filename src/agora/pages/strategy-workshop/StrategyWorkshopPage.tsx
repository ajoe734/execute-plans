import React, { useEffect, useReducer, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import {
  listWorkshops,
  getWorkshop,
  getWorkshopCompleteness,
  getWorkshopReadiness,
  listWorkshopCards,
  listWorkshopEvents,
  openWorkshopStream,
  type WorkshopCard,
  type WorkshopCompleteness,
  type WorkshopReadinessAssessment,
  type WorkshopStreamEvent,
} from "@/lib/bff-v1/agora/workshops";
import {
  interaction,
  type ContextRef,
  type PersonaEligibility,
} from "@/lib/bff-v1/agora/interaction";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/workshops";
import { WorkshopCardRenderer } from "@/agora/components/WorkshopCardRenderer";
import { ConnectedGovernedProposalCard } from "@/agora/components/ConnectedGovernedProposalCard";
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
import { useAgoraWriteAccess } from "@/agora/useAgoraWriteAccess";
import { pickerParticipants, type WorkshopParticipantPicker } from "@/agora/participantPicker";
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
            <WorkshopSessionView key={selectedWorkshopId} workshopId={selectedWorkshopId} onAddToTradingRoom={onAddToTradingRoom} />
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
  governedProposalId?: string;
  onAddToTradingRoom?: (handoff: TradingRoomReadinessHandoff) => void;
  entry?: WorkshopInteractionEntry;
}

export type WorkshopInteractionMode = "ask" | "challenge" | "consult" | "propose_action" | "reflect";
export interface WorkshopInteractionEntry {
  mode?: WorkshopInteractionMode;
  participantIds?: string[];
  picker?: WorkshopParticipantPicker;
  returnTo?: string;
  returnLabel?: string;
}

function normalizedEnvironment(workshop: StrategyWorkshop | null): "research" | "shadow" | "paper" | "canary" | "live" {
  const value = String(recordFrom(workshop?.metadata).environment ?? "paper");
  return ["research", "shadow", "paper", "canary", "live"].includes(value)
    ? value as "research" | "shadow" | "paper" | "canary" | "live"
    : "paper";
}

function interactionContextRefs(workshop: StrategyWorkshop, participantIds: string[]): ContextRef[] {
  const metadata = recordFrom(workshop.metadata);
  const session = recordFrom(workshop);
  const refs: ContextRef[] = participantIds.map((id) => ({ type: "persona", id }));
  const strategyId = String(
    metadata.strategy_id
      ?? session.strategy_id
      ?? "",
  ).trim();
  const strategyVersion = String(
    metadata.strategy_version
      ?? metadata.strategy_spec_registry_id
      ?? metadata.active_strategy_spec_registry_id
      ?? session.active_strategy_spec_registry_id
      ?? "",
  ).trim();
  if (strategyId && strategyVersion) refs.unshift({ type: "strategy", id: strategyId, version_id: strategyVersion });
  const decisionEventId = String(metadata.decision_event_id ?? "").trim();
  if (decisionEventId) refs.push({ type: "decision_event", id: decisionEventId });
  const journalEntryId = String(metadata.journal_entry_id ?? metadata.trade_episode_id ?? "").trim();
  if (journalEntryId) refs.push({ type: "journal_entry", id: journalEntryId });
  const performanceWindowId = String(metadata.performance_window_id ?? "").trim();
  if (performanceWindowId) refs.push({ type: "performance_window", id: performanceWindowId });
  return Array.from(new Map(refs.map((ref) => [`${ref.type}:${ref.id}:${ref.version_id ?? ""}`, ref])).values());
}

function WorkshopSessionView({ governedProposalId, workshopId, onAddToTradingRoom, entry }: SessionViewProps): JSX.Element {
  const writeAccess = useAgoraWriteAccess();
  const [workshop, setWorkshop] = useState<StrategyWorkshop | null>(null);
  const [completeness, setCompleteness] = useState<WorkshopCompleteness | null>(null);
  const [readiness, setReadiness] = useState<WorkshopReadinessAssessment | null>(null);
  const [workshopEvents, setWorkshopEvents] = useState<WorkshopStreamEvent[]>([]);
  const [composerValue, setComposerValue] = useState("");

  // Custom states for PINT-005
  const [selectedMode, setSelectedMode] = useState<WorkshopInteractionMode>(entry?.mode ?? "ask");
  const [pickerSelectionType, setPickerSelectionType] = useState<WorkshopParticipantPicker>(entry?.picker ?? (entry?.participantIds?.length ? "named" : "recommended"));
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(entry?.participantIds ?? []);
  const [eligibleParticipants, setEligibleParticipants] = useState<PersonaEligibility[]>([]);
  const [excludedParticipants, setExcludedParticipants] = useState<PersonaEligibility[]>([]);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
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
  const [mobilePane, setMobilePane] = useState<"conversation" | "readiness">("conversation");
  const [mobileComposerOptionsOpen, setMobileComposerOptionsOpen] = useState(false);

  // Initial data load
  useEffect(() => {
    let cancelled = false;
    setSessionLoading(true);

    Promise.all([
      getWorkshop(workshopId)
        .then((ws) => { if (!cancelled) setWorkshop(ws || null); })
        .catch(() => { if (!cancelled) setWorkshop(null); }),
      getWorkshopCompleteness(workshopId)
        .then((c) => { if (!cancelled) setCompleteness(c || null); })
        .catch(() => { if (!cancelled) setCompleteness(null); }),
      getWorkshopReadiness(workshopId)
        .then((r) => { if (!cancelled) setReadiness(r || null); })
        .catch(() => { if (!cancelled) setReadiness(null); }),
      listWorkshopCards(workshopId)
        .then((items) => {
          if (!cancelled) dispatch({ type: "RESET", cards: items || [] });
        })
        .catch(() => { if (!cancelled) dispatch({ type: "RESET", cards: [] }); }),
      listWorkshopEvents(workshopId)
        .then((response) => { if (!cancelled) setWorkshopEvents(response?.items ?? []); })
        .catch(() => { if (!cancelled) setWorkshopEvents([]); }),
    ]).finally(() => {
      if (!cancelled) setSessionLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [workshopId]);

  const refreshEligibility = useCallback(async (
    mode: WorkshopInteractionMode,
    preferred: string[] = selectedParticipants,
    picker: WorkshopParticipantPicker = pickerSelectionType,
  ) => {
    if (!workshop) return;
    setEligibilityLoading(true);
    setEligibilityError(null);
    try {
      const result = await interaction.participants({
        workshop_id: workshopId,
        mode,
        environment: normalizedEnvironment(workshop),
        required_capability: "persona_opinion",
      });
      setEligibleParticipants(result.data.included);
      setExcludedParticipants(result.data.excluded);
      setSelectedParticipants(pickerParticipants(picker, result.data.included, preferred));
    } catch (error) {
      setEligibleParticipants([]);
      setExcludedParticipants([]);
      setSelectedParticipants([]);
      setEligibilityError(error instanceof Error ? error.message : "Participant eligibility is unavailable.");
    } finally {
      setEligibilityLoading(false);
    }
  }, [pickerSelectionType, selectedParticipants, workshop, workshopId]);

  useEffect(() => {
    if (!workshop) return;
    void refreshEligibility(selectedMode, entry?.participantIds ?? selectedParticipants, pickerSelectionType);
    // The entry context is intentionally applied only when the resolved workshop first loads.
    // Subsequent picker/mode changes call refreshEligibility from their controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshop, workshopId]);

  // SSE stream subscription — refreshes completeness/readiness on relevant events
  const refreshCompleteness = useCallback(() => {
    getWorkshopCompleteness(workshopId)
      .then((c) => { setCompleteness(c || null); })
      .catch(() => { setCompleteness(null); });
  }, [workshopId]);

  const refreshReadiness = useCallback(() => {
    getWorkshopReadiness(workshopId)
      .then((r) => { setReadiness(r || null); })
      .catch(() => { setReadiness(null); });
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
  const nextQuestionText = (() => {
    if (!nextQuestion || nextQuestion.card_type !== "next_question") return null;
    const question = nextQuestion.payload?.question;
    return typeof question === "string" && question.trim() ? question.trim() : null;
  })();

  const handleContinueDiscussion = useCallback((cardId: string) => {
    setComposerValue((prev) => (prev ? prev : `Re: card ${cardId} - `));
    setFocusedRef(cardId);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!workshopId || !workshop || !content || isDenied || sendLoading || !writeAccess.interactionAllowed) return;
      setSendLoading(true);
      setSendError(null);
      try {
        if (selectedParticipants.length === 0) {
          throw new Error("Choose at least one eligible Persona before submitting.");
        }
        const contextRefs = interactionContextRefs(workshop, selectedParticipants);
        const resolved = await interaction.resolveContext({
          workshop_id: workshopId,
          context_refs: contextRefs,
          environment: normalizedEnvironment(workshop),
        });
        if (!resolved.data.verified || resolved.data.workshop_id !== workshopId) {
          throw new Error("The canonical Workshop context could not be verified.");
        }
        const eligibility = await interaction.participants({
          workshop_id: workshopId,
          mode: selectedMode,
          environment: normalizedEnvironment(workshop),
          required_capability: "persona_opinion",
        });
        const eligibleIds = new Set(eligibility.data.included.map((item) => item.persona_id));
        if (!selectedParticipants.every((id) => eligibleIds.has(id))) {
          throw new Error("One or more selected Personas are no longer eligible. Refresh the participant list.");
        }
        const result = await interaction.submit({
          workshop_id: workshopId,
          mode: selectedMode,
          environment: normalizedEnvironment(workshop),
          required_capability: "persona_opinion",
          topic: content,
          participant_persona_ids: selectedParticipants,
          context_refs: resolved.data.context_refs,
        });
        if (result.data.execution_authority !== "none") {
          throw new Error("The interaction response violated the no-execution authority boundary.");
        }
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
      workshop,
      selectedMode,
      selectedParticipants,
      isDenied,
      sendLoading,
      writeAccess.interactionAllowed,
      refreshCards,
      refreshCompleteness,
      refreshEvents,
      refreshReadiness,
    ],
  );

  return (
    <div
      data-testid="strategy-workshop-page-session"
      data-mobile-workshop-pane={mobilePane}
      className="flex h-full w-full overflow-hidden bg-slate-50"
    >
      <div
        className="agora-mobile-only shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2"
        data-testid="workshop-mobile-pane-selector"
      >
        <button
          aria-pressed={mobilePane === "conversation"}
          className={mobilePane === "conversation" ? "rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white" : "rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"}
          onClick={() => setMobilePane("conversation")}
          type="button"
        >
          Conversation
        </button>
        <button
          aria-pressed={mobilePane === "readiness"}
          className={mobilePane === "readiness" ? "rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white" : "rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"}
          onClick={() => setMobilePane("readiness")}
          type="button"
        >
          Next question & readiness
        </button>
      </div>

      {/* Left: conversation + composer */}
      <div
        className="flex flex-1 flex-col overflow-hidden bg-white border-r border-slate-200"
        data-mobile-pane-hidden={mobilePane !== "conversation"}
        data-testid="workshop-conversation-pane"
      >

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
            {entry?.returnTo ? (
              <a className="text-xs font-medium text-indigo-600 underline" data-testid="workshop-return-link" href={entry.returnTo}>
                {entry.returnLabel ?? "Back to source"}
              </a>
            ) : null}
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

        <div
          className="agora-mobile-only shrink-0 flex-col gap-1 border-b border-indigo-100 bg-indigo-50 px-3 py-2 text-indigo-950"
          data-testid="workshop-mobile-priority"
        >
          <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">Next question</span>
          <span className="line-clamp-2 text-xs font-medium leading-5">
            {nextQuestionText ?? "Awaiting the next highest-value question."}
          </span>
        </div>

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
          {!sessionLoading && cardState.cards.length === 0 && !governedProposalId && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400 gap-2">
              <Bot className="h-10 w-10 text-slate-300" />
              <p className="text-sm font-semibold">No activity cards found</p>
              <p className="text-xs">Submit a prompt below to start the conversation with the Servant.</p>
            </div>
          )}
          {!sessionLoading && governedProposalId ? (
            <ConnectedGovernedProposalCard key={governedProposalId} proposalId={governedProposalId} />
          ) : null}
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
          <button
            aria-expanded={mobileComposerOptionsOpen}
            className="agora-mobile-only items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
            data-testid="workshop-composer-options-toggle"
            onClick={() => setMobileComposerOptionsOpen((open) => !open)}
            type="button"
          >
            <span>Mode, participants & context</span>
            <span aria-hidden="true">{mobileComposerOptionsOpen ? "−" : "+"}</span>
          </button>

          <div
            className="flex flex-col gap-3"
            data-mobile-collapsed={!mobileComposerOptionsOpen}
            data-testid="workshop-composer-options"
          >
          
          {/* Context Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600 border border-slate-100 shrink-0" data-testid="context-bar">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-slate-400" />
                <strong>Subject:</strong> {workshop?.subject?.kind ?? "none"} ({workshop?.subject?.ref ?? "none"})
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
                  onValueChange={(val: string) => {
                    const mode = val as WorkshopInteractionMode;
                    setSelectedMode(mode);
                    void refreshEligibility(mode, selectedParticipants, pickerSelectionType);
                  }}
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
                    const picker = val as WorkshopParticipantPicker;
                    setPickerSelectionType(picker);
                    setSelectedParticipants(pickerParticipants(picker, eligibleParticipants, selectedParticipants));
                  }}
                >
                  <SelectTrigger className="w-[200px] h-8 text-xs font-semibold bg-white border-slate-200" data-testid="participant-picker">
                    <SelectValue placeholder="Select panel" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    <SelectItem value="recommended" className="text-xs">Recommended-or-Eligible Panel</SelectItem>
                    <SelectItem value="eligible-one" className="text-xs">First Eligible Persona</SelectItem>
                    <SelectItem value="eligible-two" className="text-xs">First Two Eligible Personas</SelectItem>
                    <SelectItem value="eligible-three" className="text-xs">First Three Eligible Personas</SelectItem>
                    <SelectItem value="named" className="text-xs">Named Personas (Select)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Explanation box */}
            <div className="flex-1 min-w-[200px] max-w-[400px] bg-slate-50 border border-slate-100 p-2 rounded text-[11px] text-slate-500 leading-normal" data-testid="eligibility-explanation">
              {eligibilityLoading ? "Checking Persona eligibility…" : eligibilityError ? `Eligibility unavailable: ${eligibilityError}` : (() => {
                const selected = selectedParticipants.length;
                const excluded = excludedParticipants.length;
                switch (pickerSelectionType) {
                  case "recommended":
                    return `Recommended-or-Eligible Panel — up to ${selected} canonical eligible selected (recommended first when supplied); ${excluded} excluded by the capability gate.`;
                  case "eligible-one":
                    return `First Eligible Persona — ${selected} selected in canonical eligibility order.`;
                  case "eligible-two":
                    return `First Two Eligible Personas — ${selected} selected in canonical eligibility order.`;
                  case "eligible-three":
                    return `First Three Eligible Personas — ${selected} selected in canonical eligibility order.`;
                  case "named":
                    return `Named Personas — choose from ${eligibleParticipants.length} canonical eligible participant(s).`;
                  default:
                    return "";
                }
              })()}
            </div>
          </div>

          {/* Named Persona check boxes when Named is selected */}
          {pickerSelectionType === "named" && (
            <div className="flex flex-wrap gap-4 border border-slate-100 bg-slate-50 p-2.5 rounded shrink-0" data-testid="named-checkbox-panel">
              {eligibleParticipants.map((persona) => (
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer" key={persona.persona_id}>
                  <input
                    type="checkbox"
                    checked={selectedParticipants.includes(persona.persona_id)}
                    onChange={(event) => setSelectedParticipants((current) => event.target.checked
                      ? Array.from(new Set([...current, persona.persona_id]))
                      : current.filter((id) => id !== persona.persona_id))}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span title={`Capability snapshot: ${persona.capability_snapshot_id ?? "verified"}`}>{persona.display_name}</span>
                </label>
              ))}
              {excludedParticipants.map((persona) => (
                <span className="text-xs text-slate-400" key={persona.persona_id} title={persona.reasons.join(", ")}>
                  {persona.display_name} (Unavailable: {persona.reasons.join(", ")})
                </span>
              ))}
            </div>
          )}
          </div>

          {/* Composer Input Area */}
          <div className="flex gap-2">
            <textarea
              className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
              data-testid="servant-composer-input"
              disabled={sendLoading || isDenied || !writeAccess.interactionAllowed || workshop?.status === "concluded"}
              placeholder={isDenied || !writeAccess.interactionAllowed ? "Access restricted..." : "描述你的策略構想或與 Persona 進行諮詢… (Ctrl+Enter 送出)"}
              rows={3}
              value={composerValue}
              onChange={(e) => setComposerValue(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && composerValue.trim() && !sendLoading && !isDenied && writeAccess.interactionAllowed) {
                  e.preventDefault();
                  handleSend(composerValue);
                }
              }}
            />
            <Button
              className="self-end bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 px-4 h-9 font-semibold disabled:opacity-50"
              data-testid="servant-composer-submit"
              disabled={sendLoading || eligibilityLoading || isDenied || !writeAccess.interactionAllowed || !composerValue.trim() || selectedParticipants.length === 0 || workshop?.status === "concluded"}
              title={writeAccess.interactionDisabledReason ?? undefined}
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
          {writeAccess.interactionDisabledReason ? (
            <p className="text-xs font-semibold text-amber-700" data-testid="interaction-disabled-reason">
              {writeAccess.interactionDisabledReason}
            </p>
          ) : null}
          {sendError && (
            <p className="text-xs text-red-500 font-semibold" data-testid="servant-composer-error">{sendError}</p>
          )}
        </div>
      </div>

      {/* Right: completeness rail + trading room CTA */}
      <div
        data-testid="completeness-rail"
        data-mobile-pane-hidden={mobilePane !== "readiness"}
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
  governedProposalId?: string;
  workshopId?: string;
  onAddToTradingRoom?: (handoff: TradingRoomReadinessHandoff) => void;
  entry?: WorkshopInteractionEntry;
}

export function StrategyWorkshopPage({ governedProposalId, workshopId, onAddToTradingRoom, entry }: StrategyWorkshopPageProps): JSX.Element {
  if (workshopId) {
    return <WorkshopSessionView governedProposalId={governedProposalId} key={workshopId} workshopId={workshopId} onAddToTradingRoom={onAddToTradingRoom} entry={entry} />;
  }
  return <WorkshopListView onAddToTradingRoom={onAddToTradingRoom} />;
}
