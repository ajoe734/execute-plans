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
  type ContextBinding,
  type ContextRef,
  type PersonaEligibility,
  type ResolveContextRequest,
} from "@/lib/bff-v1/agora/interaction";
import {
  DailyInteractionUnsupportedError,
  listDailyInteractions,
  submitDailyInteraction,
  type DailyInteraction,
  type DailyInteractionMode,
  type ParticipantSnapshot,
} from "@/lib/bff-v1/agora/dailyInteractions";
import { getAuthProvider } from "@/lib/bff-v1/headers";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/workshops";
import { DailyInteractionTimeline, type DailyRuntimeState } from "@/agora/components/DailyInteractionTimeline";
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

export type WorkshopInteractionMode = DailyInteractionMode;
export interface WorkshopInteractionEntry {
  mode?: WorkshopInteractionMode;
  participantIds?: string[];
  picker?: WorkshopParticipantPicker;
  returnTo?: string;
  returnLabel?: string;
  source?: {
    kind: "persona" | "strategy" | "decision_event" | "journal_entry" | "position" | "human_inbox_item" | "workshop";
    id: string;
    version?: string;
  };
  targetStrategy?: { id: string; version: string };
  environment?: "research" | "shadow" | "paper" | "canary" | "live";
  evidenceCutoff?: string;
}

function normalizedEnvironment(workshop: StrategyWorkshop | null, entry?: WorkshopInteractionEntry): "research" | "shadow" | "paper" | "canary" | "live" {
  const value = String(entry?.environment ?? recordFrom(workshop?.metadata).environment ?? "paper");
  return ["research", "shadow", "paper", "canary", "live"].includes(value)
    ? value as "research" | "shadow" | "paper" | "canary" | "live"
    : "paper";
}

interface ResolvedInteractionContext {
  bindingId: string;
  workshopId: string;
  tenantId: string;
  sourceRoute: string;
  contextRefs: ContextBinding["context_refs"];
  contextDigest: string;
  environment: "research" | "shadow" | "paper" | "canary" | "live";
  evidenceCutoff: string;
  focusedObject: ContextBinding["focused_object"];
  strategyRef: ContextBinding["strategy_ref"];
  decisionRef: ContextBinding["decision_ref"];
  journalRef: ContextBinding["journal_ref"];
  positionRiskSnapshotRefs: string[];
  selectedPersonaIds: string[];
  initialMode: DailyInteractionMode;
  returnRoute: string;
}

function sameContextRef(expected: ContextRef, actual: ContextBinding["context_refs"][number]): boolean {
  return expected.type === actual.kind
    && expected.id === actual.id
    && (expected.version_id ?? null) === (actual.version ?? null);
}

export function resolvedInteractionContext(input: {
  workshopId: string;
  request: ResolveContextRequest;
  entry?: WorkshopInteractionEntry;
  response: Awaited<ReturnType<typeof interaction.resolveContext>>["data"];
}): ResolvedInteractionContext {
  const { response } = input;
  const binding = response.context_binding;
  if (!response.verified || response.workshop_id !== input.workshopId
    || !binding || binding.workshop_id !== input.workshopId) {
    throw new Error("The canonical Workshop context could not be verified.");
  }
  if (!binding.binding_id || !binding.tenant_id || !binding.context_digest
    || !binding.source_route || !binding.return_route) {
    throw new Error("The resolver omitted required durable context binding fields.");
  }
  if (response.context_digest !== binding.context_digest
    || response.environment !== binding.advice_environment) {
    throw new Error("The resolver returned internally inconsistent context truth.");
  }
  if (response.context_refs.length !== binding.context_refs.length
    || response.context_refs.some((ref) => !binding.context_refs.some((actual) => sameContextRef(ref, actual)))) {
    throw new Error("The resolver returned inconsistent canonical context references.");
  }
  if (!binding.resolved_at || Number.isNaN(Date.parse(binding.resolved_at))
    || !binding.evidence_cutoff || Number.isNaN(Date.parse(binding.evidence_cutoff))) {
    throw new Error("The resolver omitted its authoritative context cutoff.");
  }
  for (const requested of input.request.context_refs) {
    if (!binding.context_refs.some((actual) => sameContextRef(requested, actual))) {
      throw new Error(`Resolved context omitted or changed ${requested.type}:${requested.id}:${requested.version_id ?? "unversioned"}.`);
    }
  }
  if (binding.selected_persona_ids.length !== (input.request.selected_persona_ids?.length ?? 0)
    || binding.selected_persona_ids.some((id, index) => id !== input.request.selected_persona_ids?.[index])) {
    throw new Error("The resolver changed the selected Persona binding.");
  }
  if (binding.initial_mode !== input.request.initial_mode) {
    throw new Error("The resolver changed the interaction mode binding.");
  }
  if (input.entry?.targetStrategy) {
    const strategyRefs = binding.context_refs.filter((ref) => ref.kind === "strategy");
    if (strategyRefs.length !== 1
      || strategyRefs[0].id !== input.entry.targetStrategy.id
      || strategyRefs[0].version !== input.entry.targetStrategy.version
      || binding.strategy_ref?.strategy_id !== input.entry.targetStrategy.id
      || binding.strategy_ref.version_id !== input.entry.targetStrategy.version) {
      throw new Error("Resolved strategy target is missing, changed, or ambiguous.");
    }
  }
  return {
    bindingId: binding.binding_id,
    workshopId: binding.workshop_id,
    tenantId: binding.tenant_id,
    sourceRoute: binding.source_route,
    contextRefs: binding.context_refs,
    contextDigest: binding.context_digest,
    environment: binding.advice_environment,
    evidenceCutoff: binding.evidence_cutoff,
    focusedObject: binding.focused_object,
    strategyRef: binding.strategy_ref,
    decisionRef: binding.decision_ref,
    journalRef: binding.journal_ref,
    positionRiskSnapshotRefs: binding.position_risk_snapshot_refs ?? [],
    selectedPersonaIds: binding.selected_persona_ids,
    initialMode: binding.initial_mode,
    returnRoute: binding.return_route,
  };
}

export function selectCompareParticipants(
  included: PersonaEligibility[],
  preferred: string[],
  requiredOriginal?: string,
): string[] {
  const eligible = new Set(included.map((item) => item.persona_id));
  const original = requiredOriginal ?? preferred[0];
  if (!original || !eligible.has(original)) {
    throw new Error("The originally selected Persona is no longer eligible for comparison.");
  }
  const candidates = [
    ...preferred.slice(1),
    ...included.filter((item) => item.recommended).map((item) => item.persona_id),
    ...included.map((item) => item.persona_id),
  ];
  const second = candidates.find((id) => id !== original && eligible.has(id));
  if (!second) throw new Error("Compare requires exactly one additional eligible Persona.");
  return [original, second];
}

function interactionContextRefs(workshop: StrategyWorkshop, workshopId: string, participantIds: string[], entry?: WorkshopInteractionEntry): ContextRef[] {
  const metadata = recordFrom(workshop.metadata);
  const session = recordFrom(workshop);
  const refs: ContextRef[] = participantIds.map((id) => ({ type: "persona", id }));
  if (!entry?.source) refs.unshift({ type: "workshop", id: workshopId });
  if (entry?.source && ["persona", "strategy", "decision_event", "journal_entry", "position", "human_inbox_item", "workshop"].includes(entry.source.kind)) {
    refs.unshift({
      type: entry.source.kind as ContextRef["type"],
      id: entry.source.id,
      version_id: entry.source.version,
    });
  }
  if (entry?.targetStrategy) {
    refs.unshift({ type: "strategy", id: entry.targetStrategy.id, version_id: entry.targetStrategy.version });
  }
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

function interactionResolveRequest(
  workshop: StrategyWorkshop,
  workshopId: string,
  participantIds: string[],
  mode: WorkshopInteractionMode,
  entry?: WorkshopInteractionEntry,
): ResolveContextRequest {
  const route = entry?.returnTo ?? `/agora/strategy-workshop/${encodeURIComponent(workshopId)}`;
  const focusedObject = entry?.source
    ? { kind: entry.source.kind, id: entry.source.id, version: entry.source.version ?? null }
    : { kind: "workshop", id: workshopId };
  const cutoffHint = String(entry?.evidenceCutoff
    ?? recordFrom(workshop.metadata).evidence_cutoff
    ?? workshop.created_at
    ?? "").trim();
  if (!cutoffHint || Number.isNaN(Date.parse(cutoffHint))) {
    throw new Error("The canonical Workshop projection omitted an evidence cutoff.");
  }
  return {
    workshop_id: workshopId,
    context_refs: interactionContextRefs(workshop, workshopId, participantIds, entry),
    environment: normalizedEnvironment(workshop, entry),
    source_route: route,
    focused_object: focusedObject,
    evidence_cutoff: cutoffHint,
    selected_persona_ids: participantIds,
    initial_mode: mode,
    return_route: route,
  };
}

function eligibilityMode(mode: WorkshopInteractionMode): "ask" | "challenge" | "consult" | "propose_action" | "reflect" {
  return mode === "compare" ? "consult" : mode;
}

function participantSnapshot(item: PersonaEligibility): ParticipantSnapshot | null {
  const snapshot = item.participant_snapshot;
  if (!snapshot) return null;
  if (!snapshot.persona_id || !snapshot.persona_version || !snapshot.session_persona_id
    || !snapshot.provider_agent_id || !snapshot.workspace_id || !snapshot.captured_at
    || !Array.isArray(snapshot.capability_snapshot) || snapshot.capability_snapshot.length === 0) return null;
  return snapshot;
}

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Secure request digest support is unavailable in this browser.");
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function WorkshopSessionView({ governedProposalId, workshopId, onAddToTradingRoom, entry }: SessionViewProps): JSX.Element {
  const writeAccess = useAgoraWriteAccess();
  const [workshop, setWorkshop] = useState<StrategyWorkshop | null>(null);
  const [completeness, setCompleteness] = useState<WorkshopCompleteness | null>(null);
  const [readiness, setReadiness] = useState<WorkshopReadinessAssessment | null>(null);
  const [workshopEvents, setWorkshopEvents] = useState<WorkshopStreamEvent[]>([]);
  const [composerValue, setComposerValue] = useState("");
  const [dailyInteractions, setDailyInteractions] = useState<DailyInteraction[]>([]);
  const [dailyRuntimeState, setDailyRuntimeState] = useState<DailyRuntimeState>("loading");
  const [dailyRuntimeMessage, setDailyRuntimeMessage] = useState<string | null>(null);

  // Custom states for PINT-005
  const [selectedMode, setSelectedMode] = useState<WorkshopInteractionMode>(entry?.mode ?? "ask");
  const [pickerSelectionType, setPickerSelectionType] = useState<WorkshopParticipantPicker>(entry?.picker ?? (entry?.participantIds?.length ? "named" : "recommended"));
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(entry?.participantIds ?? []);
  const [eligibleParticipants, setEligibleParticipants] = useState<PersonaEligibility[]>([]);
  const [excludedParticipants, setExcludedParticipants] = useState<PersonaEligibility[]>([]);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [resolvedContext, setResolvedContext] = useState<ResolvedInteractionContext | null>(null);
  const [contextResolving, setContextResolving] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  
  const [cardState, dispatch] = useReducer(cardReducer, {
    cards: [],
    lastEventId: null,
  });

  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [mobilePane, setMobilePane] = useState<"conversation" | "readiness">("conversation");
  const [mobileComposerOptionsOpen, setMobileComposerOptionsOpen] = useState(false);

  const refreshDailyInteractions = useCallback(async () => {
    try {
      const items = await listDailyInteractions(workshopId);
      setDailyInteractions(items);
      setDailyRuntimeState("ready");
      setDailyRuntimeMessage(null);
    } catch (error) {
      setDailyInteractions([]);
      if (error instanceof DailyInteractionUnsupportedError) {
        setDailyRuntimeState("unsupported");
        setDailyRuntimeMessage(error.message);
      } else {
        setDailyRuntimeState("error");
        setDailyRuntimeMessage(error instanceof Error ? error.message : "Authoritative daily interaction readback failed.");
      }
    }
  }, [workshopId]);

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

  useEffect(() => {
    setDailyRuntimeState("loading");
    void refreshDailyInteractions();
  }, [refreshDailyInteractions]);

  useEffect(() => {
    if (!dailyInteractions.some((item) => item.status === "queued" || item.status === "running")) return;
    const timer = window.setInterval(() => void refreshDailyInteractions(), 3000);
    return () => window.clearInterval(timer);
  }, [dailyInteractions, refreshDailyInteractions]);

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
        mode: eligibilityMode(mode),
        environment: normalizedEnvironment(workshop, entry),
        required_capability: "persona_opinion",
      });
      setEligibleParticipants(result.data.included);
      setExcludedParticipants(result.data.excluded);
      const picked = mode === "compare"
        ? selectCompareParticipants(result.data.included, preferred, entry?.mode === "compare" ? entry.participantIds?.[0] : undefined)
        : pickerParticipants(picker, result.data.included, preferred);
      setSelectedParticipants(picked);
    } catch (error) {
      setEligibleParticipants([]);
      setExcludedParticipants([]);
      setSelectedParticipants([]);
      setEligibilityError(error instanceof Error ? error.message : "Participant eligibility is unavailable.");
    } finally {
      setEligibilityLoading(false);
    }
  }, [entry, pickerSelectionType, selectedParticipants, workshop, workshopId]);

  useEffect(() => {
    if (!workshop) return;
    void refreshEligibility(selectedMode, entry?.participantIds ?? selectedParticipants, pickerSelectionType);
    // The entry context is intentionally applied only when the resolved workshop first loads.
    // Subsequent picker/mode changes call refreshEligibility from their controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshop, workshopId]);

  useEffect(() => {
    if (!workshop || selectedParticipants.length === 0) {
      setResolvedContext(null);
      return;
    }
    let cancelled = false;
    let request: ResolveContextRequest;
    try {
      request = interactionResolveRequest(workshop, workshopId, selectedParticipants, selectedMode, entry);
    } catch (error) {
      setResolvedContext(null);
      setContextError(error instanceof Error ? error.message : "Authoritative context request could not be built.");
      return;
    }
    setContextResolving(true);
    setContextError(null);
    setResolvedContext(null);
    interaction.resolveContext(request)
      .then((response) => {
        if (cancelled) return;
        setResolvedContext(resolvedInteractionContext({
          workshopId, request, entry, response: response.data,
        }));
      })
      .catch((error) => {
        if (cancelled) return;
        setResolvedContext(null);
        setContextError(error instanceof Error ? error.message : "Authoritative context resolution failed.");
      })
      .finally(() => { if (!cancelled) setContextResolving(false); });
    return () => { cancelled = true; };
  }, [entry, selectedMode, selectedParticipants, workshop, workshopId]);

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
      switch (String(event.event_type)) {
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
        case "interaction.queued":
        case "interaction.running":
        case "interaction.completed":
        case "interaction.degraded":
        case "interaction.failed":
        case "candidate.decision.recorded":
        case "candidate.validation.updated":
          void refreshDailyInteractions();
          refreshEvents();
          break;
        case "workshop.snapshot":
          refreshCards();
          refreshCompleteness();
          refreshReadiness();
          refreshEvents();
          void refreshDailyInteractions();
          break;
        default:
          break;
      }
    });
    return teardown;
  }, [workshopId, refreshCards, refreshCompleteness, refreshDailyInteractions, refreshEvents, refreshReadiness]);

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

  const handleSend = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!workshopId || !workshop || !content || sendLoading || !writeAccess.interactionAllowed || dailyRuntimeState !== "ready") return;
      setSendLoading(true);
      setSendError(null);
      try {
        if (selectedParticipants.length === 0) {
          throw new Error("Choose at least one eligible Persona before submitting.");
        }
        if (!resolvedContext) {
          throw new Error(contextError ?? "Wait for authoritative context resolution before submitting.");
        }
        const requiredOriginal = entry?.mode === "compare" ? entry.participantIds?.[0] : undefined;
        if (selectedMode === "compare" && (selectedParticipants.length !== 2
          || new Set(selectedParticipants).size !== 2
          || (requiredOriginal && !selectedParticipants.includes(requiredOriginal)))) {
          throw new Error("Compare requires exactly two distinct eligible Personas and must retain the originally selected Persona.");
        }
        const request = interactionResolveRequest(workshop, workshopId, selectedParticipants, selectedMode, entry);
        const resolved = await interaction.resolveContext(request);
        const truth = resolvedInteractionContext({
          workshopId, request, entry, response: resolved.data,
        });
        if (truth.contextDigest !== resolvedContext.contextDigest
          || truth.environment !== resolvedContext.environment
          || truth.evidenceCutoff !== resolvedContext.evidenceCutoff
          || truth.sourceRoute !== resolvedContext.sourceRoute
          || truth.returnRoute !== resolvedContext.returnRoute
          || truth.tenantId !== resolvedContext.tenantId
          || truth.initialMode !== resolvedContext.initialMode
          || JSON.stringify(truth.contextRefs) !== JSON.stringify(resolvedContext.contextRefs)
          || JSON.stringify(truth.strategyRef ?? null) !== JSON.stringify(resolvedContext.strategyRef ?? null)
          || truth.decisionRef !== resolvedContext.decisionRef
          || truth.journalRef !== resolvedContext.journalRef
          || JSON.stringify(truth.positionRiskSnapshotRefs) !== JSON.stringify(resolvedContext.positionRiskSnapshotRefs)
          || JSON.stringify(truth.selectedPersonaIds) !== JSON.stringify(resolvedContext.selectedPersonaIds)
          || truth.focusedObject.kind !== resolvedContext.focusedObject.kind
          || truth.focusedObject.id !== resolvedContext.focusedObject.id
          || (truth.focusedObject.version ?? null) !== (resolvedContext.focusedObject.version ?? null)) {
          throw new Error("Authoritative context changed after the page resolved it. Refresh before submitting.");
        }
        const eligibility = await interaction.participants({
          workshop_id: workshopId,
          mode: eligibilityMode(selectedMode),
          environment: truth.environment,
          required_capability: "persona_opinion",
        });
        const eligibleIds = new Set(eligibility.data.included.map((item) => item.persona_id));
        if (!selectedParticipants.every((id) => eligibleIds.has(id))) {
          throw new Error("One or more selected Personas are no longer eligible. Refresh the participant list.");
        }
        const selectedSnapshots = selectedParticipants.map((id) => {
          const eligible = eligibility.data.included.find((item) => item.persona_id === id);
          return eligible ? participantSnapshot(eligible) : null;
        });
        if (selectedSnapshots.some((snapshot) => !snapshot)) {
          throw new Error("The BFF eligibility response did not include v1.9 immutable Persona snapshots. PINT-012 runtime support is required.");
        }
        const operatorId = writeAccess.actorId?.trim();
        const tenantId = getAuthProvider().getTenantId()?.trim();
        if (!operatorId || !tenantId) {
          throw new Error("The authenticated BFF operator and tenant are required for an immutable v1.9 request.");
        }
        if (tenantId !== truth.tenantId) {
          throw new Error("The resolver tenant binding does not match the authenticated tenant.");
        }
        if (!globalThis.crypto?.randomUUID) {
          throw new Error("Secure request identity support is unavailable in this browser.");
        }
        const submittedAt = new Date().toISOString();
        const requestId = globalThis.crypto.randomUUID();
        if (selectedMode === "propose_action" && !truth.strategyRef?.version_id) {
          throw new Error("Propose requires a resolver-verified immutable strategy id and version.");
        }
        await submitDailyInteraction({
          workshop_id: workshopId,
          human_request: {
            request_id: requestId,
            operator_id: operatorId,
            mode: selectedMode,
            request_text: content,
            submitted_at: submittedAt,
            request_sha256: await sha256(content),
          },
          context_snapshot: {
            tenant_id: truth.tenantId,
            source_route: truth.sourceRoute,
            focused_object: truth.focusedObject,
            context_refs: truth.contextRefs,
            strategy_ref: truth.strategyRef,
            decision_ref: truth.decisionRef,
            journal_ref: truth.journalRef,
            position_risk_snapshot_refs: truth.positionRiskSnapshotRefs,
            evidence_cutoff: truth.evidenceCutoff,
            selected_persona_ids: truth.selectedPersonaIds,
            initial_mode: truth.initialMode,
            return_route: truth.returnRoute,
            captured_at: submittedAt,
          },
          participants: selectedSnapshots as ParticipantSnapshot[],
        });
        setComposerValue("");
        refreshEvents();
        void refreshDailyInteractions();
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
      sendLoading,
      writeAccess.interactionAllowed,
      writeAccess.actorId,
      dailyRuntimeState,
      entry,
      contextError,
      resolvedContext,
      refreshDailyInteractions,
      refreshEvents,
    ],
  );

  const composerInputDisabled = !workshop
    || sessionLoading
    || sendLoading
    || contextResolving
    || !resolvedContext
    || Boolean(contextError)
    || !writeAccess.interactionAllowed
    || dailyRuntimeState !== "ready"
    || workshop.status === "concluded";
  const canSubmitInteraction = !composerInputDisabled
    && !eligibilityLoading
    && Boolean(composerValue.trim())
    && selectedParticipants.length > 0
    && (selectedMode !== "compare" || (selectedParticipants.length === 2 && new Set(selectedParticipants).size === 2));

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

        {/* Lifecycle warnings come only from authoritative v1.9 readback. */}
        {(dailyInteractions.some((item) => item.status === "degraded" || item.status === "failed") || !writeAccess.interactionAllowed || workshop?.status === "concluded") && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex flex-col gap-1.5 text-xs text-amber-800 shrink-0">
            {dailyInteractions.some((item) => item.status === "degraded" || item.status === "failed") && (
              <div className="flex items-center gap-1.5" data-testid="warning-degraded">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span><strong>Provider degradation:</strong> One or more selected Personas failed. Successful independent opinions remain visible; no fallback opinion was fabricated.</span>
              </div>
            )}
            {!writeAccess.interactionAllowed && (
              <div className="flex items-center gap-1.5 text-red-800 bg-red-50 p-1.5 rounded border border-red-100" data-testid="warning-denied">
                <ShieldAlert className="h-3.5 w-3.5 text-red-600 shrink-0" />
                <span><strong>Access restricted:</strong> {writeAccess.interactionDisabledReason ?? "The authenticated BFF session does not permit Persona interaction writes."}</span>
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
          {sessionLoading && dailyRuntimeState === "loading" && (
            <div data-testid="workshop-session-loading" className="flex items-center justify-center py-20 text-slate-400 gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent" />
              Loading session cards…
            </div>
          )}
          <DailyInteractionTimeline
            interactions={dailyInteractions}
            onRefresh={refreshDailyInteractions}
            runtimeMessage={dailyRuntimeMessage}
            runtimeState={dailyRuntimeState}
            writeAllowed={writeAccess.interactionAllowed}
          />
          {!sessionLoading && governedProposalId ? (
            <ConnectedGovernedProposalCard key={governedProposalId} proposalId={governedProposalId} />
          ) : null}
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
                <strong>Focused object:</strong> {resolvedContext ? `${resolvedContext.focusedObject.kind}:${resolvedContext.focusedObject.id}` : "resolving"}
              </span>
              <span className="text-slate-300">•</span>
              <span>
                <strong>Strategy version:</strong> {resolvedContext?.strategyRef?.version_id ?? "not supplied"}
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                <strong>Environment:</strong> {resolvedContext?.environment ?? "resolving"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                Evidence cutoff: {resolvedContext?.evidenceCutoff ?? "resolving"}
              </span>
            </div>
          </div>
          {contextError ? <p className="rounded border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700" data-testid="context-resolution-error" role="alert">{contextError}</p> : null}

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
                    <SelectItem value="compare" className="text-xs">Compare (Independent Views)</SelectItem>
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
                    try {
                      setEligibilityError(null);
                      setSelectedParticipants(selectedMode === "compare"
                        ? selectCompareParticipants(eligibleParticipants, selectedParticipants, entry?.mode === "compare" ? entry.participantIds?.[0] : undefined)
                        : pickerParticipants(picker, eligibleParticipants, selectedParticipants));
                    } catch (error) {
                      setEligibilityError(error instanceof Error ? error.message : "Unable to select comparison Personas.");
                    }
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
          {selectedParticipants.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Selected Persona participants">
              {selectedParticipants.map((id) => (
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-800" key={id}>
                  {eligibleParticipants.find((persona) => persona.persona_id === id)?.display_name ?? id}
                </span>
              ))}
              {pickerSelectionType !== "named" && (
                <span className="self-center text-[11px] text-slate-500">Choose Named Personas above to adjust this panel.</span>
              )}
            </div>
          )}

          {/* Named Persona check boxes when Named is selected */}
          {pickerSelectionType === "named" && (
            <div className="flex flex-wrap gap-4 border border-slate-100 bg-slate-50 p-2.5 rounded shrink-0" data-testid="named-checkbox-panel">
              {eligibleParticipants.map((persona) => (
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer" key={persona.persona_id}>
                  <input
                    type="checkbox"
                    checked={selectedParticipants.includes(persona.persona_id)}
                    disabled={selectedMode === "compare" && entry?.mode === "compare" && persona.persona_id === entry.participantIds?.[0]}
                    onChange={(event) => setSelectedParticipants((current) => {
                      if (selectedMode !== "compare") {
                        return event.target.checked ? Array.from(new Set([...current, persona.persona_id])) : current.filter((id) => id !== persona.persona_id);
                      }
                      const original = entry?.mode === "compare" ? entry.participantIds?.[0] : current[0];
                      if (!original || persona.persona_id === original) return current;
                      return event.target.checked ? [original, persona.persona_id] : current.filter((id) => id !== persona.persona_id);
                    })}
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
              disabled={composerInputDisabled}
              placeholder={!writeAccess.interactionAllowed ? "Access restricted..." : dailyRuntimeState !== "ready" ? "Daily Persona runtime unavailable" : "描述你的問題，Persona 將獨立回覆… (Ctrl+Enter 送出)"}
              rows={3}
              value={composerValue}
              onChange={(e) => setComposerValue(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmitInteraction) {
                  e.preventDefault();
                  void handleSend(composerValue);
                }
              }}
            />
            <Button
              className="self-end bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 px-4 h-9 font-semibold disabled:opacity-50"
              data-testid="servant-composer-submit"
              disabled={!canSubmitInteraction}
              title={writeAccess.interactionDisabledReason ?? undefined}
              onClick={() => void handleSend(composerValue)}
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
