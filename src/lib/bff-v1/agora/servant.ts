// BFF client for agora.servant.v1 and agora.session.v1 capabilities.
// Routes:
//   /bff/agora/servant (GET)
//   /bff/agora/servant/ensure (POST)
//   /bff/agora/servant/sessions (POST)
//   /bff/agora/servant/sessions/{session_id} (GET)
//   /bff/agora/servant/sessions/{session_id}/messages (POST)
//   /bff/agora/servant/sessions/{session_id}/terminate (POST)
// Strict live: errors surface as errors; never mock data or a default status.
// Schema: servant_profile.schema.json.
// The browser must never submit another user's identity; tenant_id and
// agora_user_id are always derived server-side from the authenticated subject.

import type { AgoraCapability, AgoraServantPolicy } from "./identity";
import { bffFetch, detectBaseUrl, detectMode } from "../client";
import { BffError, makeBffError, normalizeBffErrorEnvelope } from "../errors";
import { buildHeaders } from "../headers";
import { bffSessionFetch } from "@/lib/auth/sessionExpiry";

export type ServantStatus = "active" | "suspended" | "paper_only" | "shadow_only" | "retired";
export type ServantSessionType = "interactive" | "trainer" | "research_task";

export interface ServantCapabilitySummary {
  can_ask: boolean;
  can_research: boolean;
  can_workshop: boolean;
  can_shadow?: boolean;
  asset_classes?: string[];
  strategy_families?: string[];
  allowed_agora_capabilities?: AgoraCapability[];
}

export interface ServantProfile {
  spec_version: "1.0";
  persona_id: string;
  display_name: string;
  status: ServantStatus;
  tenant_id: string;
  agora_user_id: string;
  persona_class: "agora_servant";
  owner_scope: "user_private";
  visibility_scope: "private" | "redacted_management";
  memory_scope: "private_user";
  capability_summary: ServantCapabilitySummary;
  policy: AgoraServantPolicy;
  description?: string;
  avatar_ref?: string;
  last_active_at?: string;
  metadata?: Record<string, unknown>;
}

export interface ServantEnsureRequest {
  display_name?: string;
  locale?: string;
  timezone?: string;
}

export interface ServantSessionCreateRequest {
  intent?: string;
  strategy_ref?: string;
  session_type?: ServantSessionType;
  metadata?: Record<string, unknown>;
}

export interface ServantSession {
  session_id: string;
  openclaw_session_id?: string | null;
  servant_persona_id: string;
  session_type: ServantSessionType;
  status: string;
  state: string;
  intent?: string | null;
  strategy_ref?: string | null;
  metadata: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
  pending_clarification?: ServantClarificationCard | null;
}

export interface ServantCitation {
  id?: string;
  fact_id?: string;
  label?: string;
  value?: unknown;
  unit?: string;
  source: string;
  source_id?: string;
  connector_id?: string;
  owner?: string;
  as_of: string;
  freshness: string;
  query_hash?: string;
}

export interface ServantClarificationOption {
  option_id: string;
  label: string;
  description?: string;
  trade_off?: string;
  recommended?: boolean;
  is_default?: boolean;
}

export interface ServantClarificationCard {
  decision_id?: string;
  question_id?: string;
  question: string;
  options: ServantClarificationOption[];
  default_option_id?: string | null;
  servant_default?: string | null;
  provisional_assumption?: string | null;
  why_it_matters?: string | null;
  why_now?: string | null;
  style_dimension?: string | null;
  resolves?: string[];
}

export interface ServantClarificationChoiceRequest {
  decision_id?: string;
  question_id?: string;
  option_id?: string;
  selected_option_id?: string;
  option_label?: string;
  custom_response?: string;
  use_servant_default?: boolean;
  resolves?: string[];
}

export interface ServantMessageRequest {
  content: string;
  attachment_refs?: string[];
  context?: {
    page?: string;
    strategy_id?: string;
    widget_id?: string;
    selected_symbols?: string[];
    quick_task?: string;
  };
  clarification_choice?: ServantClarificationChoiceRequest;
}

export interface ServantProviderReply {
  status: string;
  answer: string | null;
  error: {
    code?: string;
    source_error_code?: string;
    status_code?: number;
    message?: string;
  } | null;
}

export interface ServantMessageReceipt {
  message_id: string;
  turn_id?: string | null;
  session_id: string;
  session_type: ServantSessionType;
  servant_persona_id: string;
  provider: ServantProviderReply;
  citations?: ServantCitation[];
  clarification?: ServantClarificationCard | null;
  stated_assumptions?: string[];
  clarification_choice?: Record<string, unknown> | null;
  habit_fact?: Record<string, unknown> | null;
}

export interface ServantCommandContext {
  page: string;
  route?: string;
  strategy?: string | null;
  selectedWidget?: string | null;
}

const RAW_ENGLISH_DEFAULT_SERVANT_NAMES = new Set([
  "agora servant",
  "trading servant",
  "your servant",
  "private servant",
  "default servant",
  "servant",
]);

export function isRawEnglishDefaultServantName(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const cleaned = value.trim();
  if (!cleaned) return true;
  return RAW_ENGLISH_DEFAULT_SERVANT_NAMES.has(cleaned.toLowerCase());
}

export function formatServantDisplayName(rawName: unknown, fallback = "專屬僕人"): string {
  if (isRawEnglishDefaultServantName(rawName)) {
    return fallback;
  }
  return String(rawName).trim();
}

export function buildServantContextAttachmentRefs(context: ServantCommandContext): string[] {
  const refs = [`page:${context.page}`];
  if (context.route) {
    refs.push(`route:${context.route}`);
  }
  if (context.strategy) {
    refs.push(`strategy:${context.strategy}`);
  }
  if (context.selectedWidget) {
    refs.push(`widget:${context.selectedWidget}`);
  }
  return refs;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function unwrapData(raw: unknown): Record<string, unknown> {
  const outer = asRecord(raw);
  const inner = asRecord(outer.data);
  return Object.keys(inner).length > 0 ? inner : outer;
}

function normalizeCapabilitySummary(raw: unknown): ServantCapabilitySummary {
  const r = asRecord(raw);
  return {
    can_ask: r.can_ask === true,
    can_research: r.can_research === true,
    can_workshop: r.can_workshop === true,
    can_shadow: r.can_shadow === true ? true : undefined,
    asset_classes: Array.isArray(r.asset_classes) ? (r.asset_classes as string[]) : undefined,
    strategy_families: Array.isArray(r.strategy_families)
      ? (r.strategy_families as string[])
      : undefined,
    allowed_agora_capabilities: Array.isArray(r.allowed_agora_capabilities)
      ? (r.allowed_agora_capabilities as AgoraCapability[])
      : undefined,
  };
}

function normalizePolicy(raw: unknown): AgoraServantPolicy {
  const r = asRecord(raw);
  return {
    persona_class: "agora_servant",
    owner_scope: "user_private",
    visibility_scope:
      r.visibility_scope === "redacted_management" ? "redacted_management" : "private",
    memory_scope: "private_user",
    persona_registry_backed: true,
    execution_authority: "none",
    prohibited_authority: ["runtime_binding", "broker_order", "capital_binding"],
  };
}

const SERVANT_STATUSES: readonly ServantStatus[] = [
  "active",
  "suspended",
  "paper_only",
  "shadow_only",
  "retired",
];

function normalizeServantProfile(raw: unknown): ServantProfile {
  const r = unwrapData(raw);

  const status = r.status as ServantStatus;
  if (!SERVANT_STATUSES.includes(status) || typeof r.persona_id !== "string" || !r.persona_id) {
    throw makeBffError({
      code: "UNKNOWN_ERROR",
      message: "Servant response is missing persona_id or has an unknown status",
    });
  }

  return {
    spec_version: "1.0",
    persona_id: r.persona_id,
    display_name: formatServantDisplayName(r.display_name, "專屬僕人"),
    status,
    tenant_id: String(r.tenant_id ?? ""),
    agora_user_id: String(r.agora_user_id ?? ""),
    persona_class: "agora_servant",
    owner_scope: "user_private",
    visibility_scope:
      r.visibility_scope === "redacted_management" ? "redacted_management" : "private",
    memory_scope: "private_user",
    capability_summary: normalizeCapabilitySummary(r.capability_summary),
    policy: normalizePolicy(r.policy),
    description: typeof r.description === "string" ? r.description : undefined,
    avatar_ref: typeof r.avatar_ref === "string" ? r.avatar_ref : undefined,
    last_active_at: typeof r.last_active_at === "string" ? r.last_active_at : undefined,
    metadata:
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : undefined,
  };
}

function normalizeSessionType(raw: unknown): ServantSessionType {
  if (raw === "trainer" || raw === "research_task") return raw;
  return "interactive";
}

function normalizeCitation(raw: unknown): ServantCitation | null {
  const r = asRecord(raw);
  const source =
    (typeof r.source === "string" && r.source.trim()) ||
    (typeof r.source_id === "string" && r.source_id.trim()) ||
    (typeof r.connector_id === "string" && r.connector_id.trim()) ||
    "";
  const asOf = typeof r.as_of === "string" && r.as_of.trim() ? r.as_of.trim() : "";
  const freshness =
    typeof r.freshness === "string" && r.freshness.trim() ? r.freshness.trim() : "fresh";
  if (!source && !asOf) return null;
  return {
    id: typeof r.id === "string" ? r.id : typeof r.fact_id === "string" ? r.fact_id : undefined,
    fact_id: typeof r.fact_id === "string" ? r.fact_id : undefined,
    label: typeof r.label === "string" ? r.label : undefined,
    value: r.value,
    unit: typeof r.unit === "string" ? r.unit : undefined,
    source: source || "agora",
    source_id: typeof r.source_id === "string" ? r.source_id : undefined,
    connector_id: typeof r.connector_id === "string" ? r.connector_id : undefined,
    owner: typeof r.owner === "string" ? r.owner : undefined,
    as_of: asOf || "—",
    freshness,
    query_hash: typeof r.query_hash === "string" ? r.query_hash : undefined,
  };
}

export function normalizeServantCitations(raw: unknown): ServantCitation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizeCitation(item))
    .filter((item): item is ServantCitation => item !== null);
}

export function normalizeServantClarificationCard(raw: unknown): ServantClarificationCard | null {
  const r = asRecord(raw);
  const question = typeof r.question === "string" && r.question.trim() ? r.question.trim() : "";
  if (!question || !Array.isArray(r.options) || r.options.length === 0) return null;
  const options: ServantClarificationOption[] = [];
  for (let i = 0; i < r.options.length; i += 1) {
    const opt = asRecord(r.options[i]);
    const optionId =
      (typeof opt.option_id === "string" && opt.option_id.trim()) ||
      (typeof opt.id === "string" && opt.id.trim()) ||
      `opt-${i + 1}`;
    const label =
      (typeof opt.label === "string" && opt.label.trim()) ||
      (typeof opt.text === "string" && opt.text.trim()) ||
      (typeof opt.title === "string" && opt.title.trim()) ||
      "";
    if (!label) continue;
    options.push({
      option_id: optionId,
      label,
      description: typeof opt.description === "string" ? opt.description : undefined,
      trade_off: typeof opt.trade_off === "string" ? opt.trade_off : undefined,
      recommended: opt.recommended === true,
      is_default: opt.is_default === true,
    });
  }
  if (options.length === 0) return null;
  let servantDefault: string | null = null;
  if (typeof r.servant_default === "string" && r.servant_default.trim()) {
    servantDefault = r.servant_default.trim();
  } else if (r.servant_default && typeof r.servant_default === "object") {
    const sd = asRecord(r.servant_default);
    servantDefault =
      (typeof sd.label === "string" && sd.label.trim()) ||
      (typeof sd.summary === "string" && sd.summary.trim()) ||
      (typeof sd.rationale === "string" && sd.rationale.trim()) ||
      null;
  }
  return {
    decision_id: typeof r.decision_id === "string" ? r.decision_id : undefined,
    question_id: typeof r.question_id === "string" ? r.question_id : undefined,
    question,
    options,
    default_option_id:
      typeof r.default_option_id === "string" ? r.default_option_id : null,
    servant_default: servantDefault,
    provisional_assumption:
      typeof r.provisional_assumption === "string"
        ? r.provisional_assumption
        : servantDefault,
    why_it_matters:
      (typeof r.why_it_matters === "string" && r.why_it_matters.trim()) ||
      (typeof r.why_now === "string" && r.why_now.trim()) ||
      null,
    why_now: typeof r.why_now === "string" ? r.why_now : null,
    style_dimension: typeof r.style_dimension === "string" ? r.style_dimension : null,
    resolves: Array.isArray(r.resolves)
      ? r.resolves.filter((x): x is string => typeof x === "string")
      : undefined,
  };
}

function normalizeServantSession(raw: unknown): ServantSession {
  const r = unwrapData(raw);
  const sessionId = typeof r.session_id === "string" && r.session_id.trim()
    ? r.session_id.trim()
    : typeof r.id === "string" && r.id.trim()
      ? r.id.trim()
      : "";
  if (!sessionId) {
    throw makeBffError({
      code: "UNKNOWN_ERROR",
      message: "Servant session response is missing session_id",
    });
  }
  const state = typeof r.state === "string" && r.state.trim()
    ? r.state.trim()
    : typeof r.status === "string" && r.status.trim()
      ? r.status.trim()
      : "active";
  const pendingClarification = normalizeServantClarificationCard(r.pending_clarification);
  return {
    session_id: sessionId,
    openclaw_session_id: typeof r.openclaw_session_id === "string" ? r.openclaw_session_id : null,
    servant_persona_id: typeof r.servant_persona_id === "string" ? r.servant_persona_id : "",
    session_type: normalizeSessionType(r.session_type),
    status: typeof r.status === "string" && r.status.trim() ? r.status.trim() : state,
    state,
    intent: typeof r.intent === "string" ? r.intent : null,
    strategy_ref: typeof r.strategy_ref === "string" ? r.strategy_ref : null,
    metadata: asRecord(r.metadata),
    created_at: typeof r.created_at === "string" ? r.created_at : null,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
    ...(pendingClarification ? { pending_clarification: pendingClarification } : {}),
  };
}

function normalizeServantMessageReceipt(raw: unknown): ServantMessageReceipt {
  const r = unwrapData(raw);
  const messageId = typeof r.message_id === "string" && r.message_id.trim()
    ? r.message_id.trim()
    : "";
  const sessionId = typeof r.session_id === "string" && r.session_id.trim()
    ? r.session_id.trim()
    : "";
  if (!messageId || !sessionId) {
    throw makeBffError({
      code: "UNKNOWN_ERROR",
      message: "Servant message receipt is missing message_id or session_id",
    });
  }
  const providerRaw = asRecord(r.provider);
  const errorRaw = providerRaw.error && typeof providerRaw.error === "object" && !Array.isArray(providerRaw.error)
    ? (providerRaw.error as Record<string, unknown>)
    : null;
  const answer = typeof providerRaw.answer === "string" && providerRaw.answer.trim()
    ? providerRaw.answer.trim()
    : typeof r.answer === "string" && r.answer.trim()
      ? r.answer.trim()
      : null;
  const citations = normalizeServantCitations(r.citations ?? providerRaw.citations);
  const clarification = normalizeServantClarificationCard(
    r.clarification ?? providerRaw.clarification,
  );
  const statedAssumptionsRaw = Array.isArray(r.stated_assumptions)
    ? r.stated_assumptions
    : Array.isArray(providerRaw.stated_assumptions)
      ? providerRaw.stated_assumptions
      : [];
  const statedAssumptions = statedAssumptionsRaw.filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0,
  );

  return {
    message_id: messageId,
    ...(typeof r.turn_id === "string" ? { turn_id: r.turn_id } : {}),
    session_id: sessionId,
    session_type: normalizeSessionType(r.session_type),
    servant_persona_id: typeof r.servant_persona_id === "string" ? r.servant_persona_id : "",
    provider: {
      status: typeof providerRaw.status === "string" && providerRaw.status.trim()
        ? providerRaw.status.trim()
        : "accepted",
      answer,
      error: errorRaw
        ? {
            code: typeof errorRaw.code === "string" ? errorRaw.code : undefined,
            source_error_code:
              typeof errorRaw.source_error_code === "string" ? errorRaw.source_error_code : undefined,
            status_code: typeof errorRaw.status_code === "number" ? errorRaw.status_code : undefined,
            message: typeof errorRaw.message === "string" ? errorRaw.message : undefined,
          }
        : null,
    },
    ...(citations.length > 0 ? { citations } : {}),
    ...(clarification ? { clarification } : {}),
    ...(statedAssumptions.length > 0 ? { stated_assumptions: statedAssumptions } : {}),
    ...(r.clarification_choice && typeof r.clarification_choice === "object"
      ? { clarification_choice: asRecord(r.clarification_choice) }
      : {}),
    ...(r.habit_fact && typeof r.habit_fact === "object"
      ? { habit_fact: asRecord(r.habit_fact) }
      : {}),
  };
}

/** GET /bff/agora/servant — null when the servant is not yet created (404). */
export async function getServant(): Promise<ServantProfile | null> {
  try {
    return normalizeServantProfile(
      await bffFetch<unknown>({ method: "GET", path: "/bff/agora/servant" }),
    );
  } catch (err) {
    if (err instanceof BffError && err.status === 404) return null;
    throw err;
  }
}

/**
 * POST /bff/agora/servant/ensure — idempotent create. bffFetch supplies
 * Idempotency-Key and X-Request-Id; tenant/user are derived server-side.
 */
export async function ensureServant(request: ServantEnsureRequest = {}): Promise<ServantProfile> {
  return normalizeServantProfile(
    await bffFetch<unknown>({
      method: "POST",
      path: "/bff/agora/servant/ensure",
      body: request,
    }),
  );
}

/** POST /bff/agora/servant/sessions — creates an interactive/trainer/research servant session. */
export async function createServantSession(
  request: ServantSessionCreateRequest = {},
): Promise<ServantSession> {
  const body: Record<string, unknown> = {
    session_type: request.session_type ?? "interactive",
    metadata: request.metadata ?? {},
  };
  if (request.intent) body.intent = request.intent;
  if (request.strategy_ref) body.strategy_ref = request.strategy_ref;

  return normalizeServantSession(
    await bffFetch<unknown>({
      method: "POST",
      path: "/bff/agora/servant/sessions",
      body,
    }),
  );
}

/** GET /bff/agora/servant/sessions/{session_id} — fetches the trader's servant session. */
export async function getServantSession(sessionId: string): Promise<ServantSession> {
  return normalizeServantSession(
    await bffFetch<unknown>({
      method: "GET",
      path: `/bff/agora/servant/sessions/${encodeURIComponent(sessionId)}`,
    }),
  );
}

/** POST /bff/agora/servant/sessions/{session_id}/messages — sends a message to the trader's servant session. */
export async function sendServantSessionMessage(
  sessionId: string,
  request: ServantMessageRequest,
): Promise<ServantMessageReceipt> {
  const body: Record<string, unknown> = {
    content: request.content,
    attachment_refs: request.attachment_refs ?? [],
  };
  if (request.context) {
    body.context = request.context;
  }
  if (request.clarification_choice) {
    body.clarification_choice = request.clarification_choice;
  }
  return normalizeServantMessageReceipt(
    await bffFetch<unknown>({
      method: "POST",
      path: `/bff/agora/servant/sessions/${encodeURIComponent(sessionId)}/messages`,
      body,
    }),
  );
}

/** POST /bff/agora/servant/sessions/{session_id}/terminate — terminates the servant session. */
export async function terminateServantSession(sessionId: string): Promise<ServantSession> {
  return normalizeServantSession(
    await bffFetch<unknown>({
      method: "POST",
      path: `/bff/agora/servant/sessions/${encodeURIComponent(sessionId)}/terminate`,
      body: {},
    }),
  );
}

export interface ServantSessionStreamEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface ServantSessionStreamMessage {
  message_id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string | null;
  status: "accepted" | "completed" | "degraded";
  created_at?: string | null;
  turn_id?: string | null;
  reply_to?: string | null;
  attachment_refs?: string[];
  error?: Record<string, unknown> | null;
  citations?: ServantCitation[];
  clarification?: ServantClarificationCard | null;
  stated_assumptions?: string[];
  missing_data?: string[];
  answer_mode?: string | null;
  clarification_choice?: Record<string, unknown> | null;
  habit_fact?: Record<string, unknown> | null;
  trader_report?: Record<string, unknown> | null;
}

export interface ServantSessionRunningTurn {
  turn_id: string;
  message_id?: string | null;
  status: string;
}

export interface ServantSessionStreamSnapshot {
  session_id: string;
  events: ServantSessionStreamEvent[];
  messages: ServantSessionStreamMessage[];
  runningTurns: ServantSessionRunningTurn[];
  sessionStatus: string | null;
}

export function parseServantSessionSse(
  sessionId: string,
  rawPayload: unknown,
): ServantSessionStreamSnapshot {
  const events: ServantSessionStreamEvent[] = [];

  if (typeof rawPayload === "string") {
    const blocks = rawPayload.split(/\r?\n\r?\n/);
    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      let id = "";
      let type = "message";
      const dataLines: string[] = [];
      for (const line of trimmed.split(/\r?\n/)) {
        if (line.startsWith("id:")) {
          id = line.slice(3).trim();
        } else if (line.startsWith("event:")) {
          type = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (!id && dataLines.length === 0) continue;
      let parsedData: Record<string, unknown> = {};
      const joined = dataLines.join("\n");
      if (joined) {
        try {
          parsedData = asRecord(JSON.parse(joined));
        } catch {
          parsedData = { raw: joined };
        }
      }
      events.push({ id: id || `${sessionId}:${events.length}`, type, data: parsedData });
    }
  } else if (Array.isArray(rawPayload)) {
    for (const item of rawPayload) {
      const rec = asRecord(item);
      if (typeof rec.type === "string") {
        events.push({
          id: String(rec.id ?? `${sessionId}:${events.length}`),
          type: rec.type,
          data: asRecord(rec.data),
        });
      }
    }
  } else if (rawPayload && typeof rawPayload === "object") {
    const rec = asRecord(rawPayload);
    const list = Array.isArray(rec.events)
      ? rec.events
      : Array.isArray(rec.data)
        ? rec.data
        : [];
    for (const item of list) {
      const ev = asRecord(item);
      if (typeof ev.type === "string") {
        events.push({
          id: String(ev.id ?? `${sessionId}:${events.length}`),
          type: ev.type,
          data: asRecord(ev.data),
        });
      }
    }
  }

  const messages: ServantSessionStreamMessage[] = [];
  const runningTurns: ServantSessionRunningTurn[] = [];
  let sessionStatus: string | null = null;

  for (const ev of events) {
    const d = ev.data;
    if (ev.type === "servant.session.created") {
      sessionStatus = "active";
    } else if (ev.type === "servant.session.snapshot") {
      sessionStatus = typeof d.status === "string" ? d.status : sessionStatus;
    } else if (ev.type === "servant.session.terminated") {
      sessionStatus = typeof d.status === "string" ? d.status : "canceled";
    } else if (ev.type === "servant.message.accepted") {
      messages.push({
        message_id: String(d.message_id ?? ev.id),
        session_id: String(d.session_id ?? sessionId),
        role: d.role === "assistant" ? "assistant" : "user",
        content: typeof d.content === "string" ? d.content : null,
        status: "accepted",
        created_at: typeof d.created_at === "string" ? d.created_at : null,
        attachment_refs: Array.isArray(d.attachment_refs)
          ? (d.attachment_refs.filter((r): r is string => typeof r === "string"))
          : [],
        ...(d.clarification_choice && typeof d.clarification_choice === "object"
          ? { clarification_choice: asRecord(d.clarification_choice) }
          : {}),
        ...(d.habit_fact && typeof d.habit_fact === "object"
          ? { habit_fact: asRecord(d.habit_fact) }
          : {}),
      });
    } else if (ev.type === "servant.message.completed" || ev.type === "servant.message.degraded") {
      const degraded = ev.type === "servant.message.degraded" || d.provider_status === "degraded";
      const citations = normalizeServantCitations(d.citations);
      const clarification = normalizeServantClarificationCard(d.clarification);
      const statedAssumptions = Array.isArray(d.stated_assumptions)
        ? d.stated_assumptions.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : [];
      const missingData = Array.isArray(d.missing_data)
        ? d.missing_data.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : [];
      messages.push({
        message_id: String(d.message_id ?? ev.id),
        session_id: String(d.session_id ?? sessionId),
        role: "assistant",
        content: typeof d.answer === "string" ? d.answer : null,
        status: degraded ? "degraded" : "completed",
        created_at: typeof d.created_at === "string" ? d.created_at : null,
        turn_id: typeof d.turn_id === "string" ? d.turn_id : null,
        reply_to: typeof d.reply_to === "string" ? d.reply_to : null,
        error: d.error && typeof d.error === "object" && !Array.isArray(d.error)
          ? (d.error as Record<string, unknown>)
          : null,
        ...(citations.length > 0 ? { citations } : {}),
        ...(clarification ? { clarification } : {}),
        ...(statedAssumptions.length > 0 ? { stated_assumptions: statedAssumptions } : {}),
        ...(missingData.length > 0 ? { missing_data: missingData } : {}),
        ...(typeof d.answer_mode === "string" ? { answer_mode: d.answer_mode } : {}),
        ...(d.trader_report && typeof d.trader_report === "object"
          ? { trader_report: asRecord(d.trader_report) }
          : {}),
      });
    } else if (ev.type === "servant.message.queued") {
      const turnId = typeof d.turn_id === "string" && d.turn_id ? d.turn_id : ev.id;
      runningTurns.push({
        turn_id: turnId,
        message_id: typeof d.message_id === "string" ? d.message_id : null,
        status: typeof d.status === "string" ? d.status : "queued",
      });
    }
  }

  return {
    session_id: sessionId,
    events,
    messages,
    runningTurns,
    sessionStatus,
  };
}

/** GET /bff/agora/servant/sessions/{session_id}/stream — replays durable session messages and running turns. */
export async function getServantSessionStream(
  sessionId: string,
): Promise<ServantSessionStreamSnapshot> {
  const path = `/bff/agora/servant/sessions/${encodeURIComponent(sessionId)}/stream`;
  if (detectMode() === "mock") {
    const raw = await bffFetch<unknown>({ method: "GET", path });
    return parseServantSessionSse(sessionId, raw);
  }
  const headers = buildHeaders({ method: "GET" });
  const url = `${detectBaseUrl()}${path}`;
  const res = await bffSessionFetch(url, {
    method: "GET",
    headers,
    credentials: "include",
  });
  const text = await res.text();
  if (!res.ok) {
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    const envelope = normalizeBffErrorEnvelope(parsed, res.status, headers["X-Correlation-Id"]);
    if (envelope) {
      throw new BffError(res.status, envelope);
    }
    throw makeBffError({
      code: "UNKNOWN_ERROR",
      message: `HTTP ${res.status}`,
      correlationId: headers["X-Request-Id"],
    });
  }
  return parseServantSessionSse(sessionId, text);
}

// ─── Servant Habit Profile & Private Interpretations (AGORA-TRADER-HABIT-PROFILE-20261127) ───

export interface ServantHabitFeature {
  key: string;
  label: string;
  sample_size: number;
  min_sample: number;
  shown: boolean;
  unavailable_reason: string | null;
  value: Record<string, unknown> | null;
  headline: {
    metric?: string;
    value?: unknown;
    unit?: string;
  } | null;
  inputs: string[];
  source_refs: string[];
}

export interface ServantHabitProfile {
  profile_key: string;
  version: number;
  tenant_id: string;
  user_id: string;
  strategy_id: string;
  decision_count: number;
  journal_count: number;
  interaction_count: number;
  min_sample: number;
  computed_at: string;
  features: ServantHabitFeature[];
}

export interface ServantHabitInterpretation {
  interpretation_id: string;
  memory_id?: string;
  feature_key: string;
  feature_label: string;
  statement: string;
  origin: "servant" | "trader_correction" | string;
  status: string;
  fact_refs: string[];
  profile_version?: number;
  written_at?: string;
}

export interface ServantHabitsResponse {
  servant_persona_id: string;
  profile: ServantHabitProfile;
  interpretations: ServantHabitInterpretation[];
  interpretations_status: {
    status: "ok" | "unavailable" | string;
    reason: string | null;
  };
  correction?: {
    action: "reject" | "replace" | "add" | string;
    interpretation: ServantHabitInterpretation;
    superseded_interpretation_id?: string | null;
    training_example?: Record<string, unknown> | null;
  } | null;
}

export interface ServantHabitCorrectionRequest {
  action: "reject" | "replace" | "add";
  interpretation_id?: string;
  feature_key?: string;
  statement?: string;
  reason?: string;
  strategy_id?: string;
}

function normalizeHabitFeature(raw: unknown): ServantHabitFeature {
  const r = asRecord(raw);
  const headlineRaw = r.headline && typeof r.headline === "object" ? asRecord(r.headline) : null;
  return {
    key: String(r.key ?? ""),
    label: String(r.label ?? r.key ?? ""),
    sample_size: typeof r.sample_size === "number" ? r.sample_size : 0,
    min_sample: typeof r.min_sample === "number" ? r.min_sample : 10,
    shown: r.shown === true,
    unavailable_reason: typeof r.unavailable_reason === "string" ? r.unavailable_reason : null,
    value:
      r.value && typeof r.value === "object" && !Array.isArray(r.value)
        ? (r.value as Record<string, unknown>)
        : null,
    headline: headlineRaw
      ? {
          metric: typeof headlineRaw.metric === "string" ? headlineRaw.metric : undefined,
          value: headlineRaw.value,
          unit: typeof headlineRaw.unit === "string" ? headlineRaw.unit : undefined,
        }
      : null,
    inputs: Array.isArray(r.inputs) ? r.inputs.map(String) : [],
    source_refs: Array.isArray(r.source_refs) ? r.source_refs.map(String) : [],
  };
}

function normalizeHabitInterpretation(raw: unknown): ServantHabitInterpretation {
  const r = asRecord(raw);
  return {
    interpretation_id: String(r.interpretation_id ?? r.memory_id ?? ""),
    memory_id: typeof r.memory_id === "string" ? r.memory_id : undefined,
    feature_key: String(r.feature_key ?? ""),
    feature_label: String(r.feature_label ?? r.feature_key ?? ""),
    statement: String(r.statement ?? ""),
    origin: typeof r.origin === "string" && r.origin ? r.origin : "servant",
    status: typeof r.status === "string" && r.status ? r.status : "active",
    fact_refs: Array.isArray(r.fact_refs) ? r.fact_refs.map(String) : [],
    profile_version: typeof r.profile_version === "number" ? r.profile_version : undefined,
    written_at: typeof r.written_at === "string" ? r.written_at : undefined,
  };
}

function normalizeServantHabitsResponse(raw: unknown): ServantHabitsResponse {
  const r = unwrapData(raw);
  const p = asRecord(r.profile);
  const features = Array.isArray(p.features)
    ? p.features.map((item) => normalizeHabitFeature(item))
    : [];
  const interpretations = Array.isArray(r.interpretations)
    ? r.interpretations.map((item) => normalizeHabitInterpretation(item))
    : [];
  const statusRaw = asRecord(r.interpretations_status);
  const corrRaw = r.correction && typeof r.correction === "object" ? asRecord(r.correction) : null;

  return {
    servant_persona_id: String(r.servant_persona_id ?? ""),
    profile: {
      profile_key: String(p.profile_key ?? ""),
      version: typeof p.version === "number" ? p.version : 1,
      tenant_id: String(p.tenant_id ?? ""),
      user_id: String(p.user_id ?? ""),
      strategy_id: String(p.strategy_id ?? "*"),
      decision_count: typeof p.decision_count === "number" ? p.decision_count : 0,
      journal_count: typeof p.journal_count === "number" ? p.journal_count : 0,
      interaction_count: typeof p.interaction_count === "number" ? p.interaction_count : 0,
      min_sample: typeof p.min_sample === "number" ? p.min_sample : 10,
      computed_at: String(p.computed_at ?? ""),
      features,
    },
    interpretations,
    interpretations_status: {
      status: typeof statusRaw.status === "string" ? statusRaw.status : "ok",
      reason: typeof statusRaw.reason === "string" ? statusRaw.reason : null,
    },
    correction: corrRaw
      ? {
          action: String(corrRaw.action ?? "replace"),
          interpretation: normalizeHabitInterpretation(corrRaw.interpretation),
          superseded_interpretation_id:
            typeof corrRaw.superseded_interpretation_id === "string"
              ? corrRaw.superseded_interpretation_id
              : null,
          training_example:
            corrRaw.training_example && typeof corrRaw.training_example === "object"
              ? asRecord(corrRaw.training_example)
              : null,
        }
      : null,
  };
}

/** GET /bff/agora/servant/habits — reads deterministic habit facts and private servant interpretations. */
export async function getServantHabits(params?: {
  strategyId?: string | null;
}): Promise<ServantHabitsResponse> {
  const qs = new URLSearchParams();
  if (params?.strategyId) {
    qs.set("strategy_id", params.strategyId);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return normalizeServantHabitsResponse(
    await bffFetch<unknown>({
      method: "GET",
      path: `/bff/agora/servant/habits${suffix}`,
    }),
  );
}

/** PATCH /bff/agora/servant/habits — records a trader habit correction (stored as training_example evidence). */
export async function patchServantHabits(
  request: ServantHabitCorrectionRequest,
  idempotencyKey?: string,
): Promise<ServantHabitsResponse> {
  return normalizeServantHabitsResponse(
    await bffFetch<unknown>({
      method: "PATCH",
      path: "/bff/agora/servant/habits",
      body: request,
      ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
    }),
  );
}

// ─── Servant Weekly & On-Demand Trader Reports (AGORA-SERVANT-REVISIONS-AND-REPORT-20261127) ───

export interface ServantTraderReportFact {
  id: string;
  fact_id?: string;
  section?: string;
  metric_key?: string;
  label: string;
  value: unknown;
  unit: string;
  owner: string;
  source: string;
  source_id?: string;
  as_of: string;
  freshness: string;
}

export interface ServantTraderReportSuggestion {
  proposal_type?: string;
  title: string;
  reason?: string;
  owner?: string;
  source?: string;
  as_of?: string;
}

export interface ServantTraderReport {
  report_id: string;
  spec_version?: string;
  tenant_id?: string;
  user_id?: string;
  trader_id?: string;
  servant_persona_id: string;
  strategy_id: string;
  strategy_version: string;
  trigger: string;
  cadence: "weekly" | "on_demand" | string;
  day?: string;
  report_day?: string;
  iso_week: string;
  calendar_iso_week?: string;
  window_start: string;
  window_end: string;
  window_days: number;
  status: string;
  attribution_run_id?: string | null;
  narrative: string;
  narrative_mode?: string;
  facts: ServantTraderReportFact[];
  citations: ServantTraderReportFact[];
  sections: Record<string, Record<string, unknown>>;
  suggested_next_steps: ServantTraderReportSuggestion[];
  created_at: string;
  updated_at?: string;
}

export interface ServantTraderReportsListResponse {
  items: ServantTraderReport[];
  total: number;
  servant_persona_id: string;
  on_demand_daily_used: number;
  on_demand_daily_cap: number;
  weekly_history_cap: number;
}

export interface CreateServantTraderReportRequest {
  strategy_id?: string | null;
  trigger?: "on_demand" | string;
  window_days?: number;
}

function normalizeTraderReportFact(raw: unknown): ServantTraderReportFact {
  const r = asRecord(raw);
  const source =
    (typeof r.source === "string" && r.source.trim()) ||
    (typeof r.source_id === "string" && r.source_id.trim()) ||
    "agora";
  return {
    id: String(r.id ?? r.fact_id ?? ""),
    fact_id: typeof r.fact_id === "string" ? r.fact_id : undefined,
    section: typeof r.section === "string" ? r.section : undefined,
    metric_key: typeof r.metric_key === "string" ? r.metric_key : undefined,
    label: String(r.label ?? r.metric_key ?? r.id ?? ""),
    value: r.value,
    unit: typeof r.unit === "string" ? r.unit : "",
    owner: typeof r.owner === "string" ? r.owner : "agora",
    source,
    source_id: typeof r.source_id === "string" ? r.source_id : source,
    as_of: typeof r.as_of === "string" ? r.as_of : "—",
    freshness: typeof r.freshness === "string" && r.freshness ? r.freshness : "fresh",
  };
}

function normalizeServantTraderReport(raw: unknown): ServantTraderReport {
  const r = unwrapData(raw);
  const sectionsRaw = asRecord(r.sections);
  const sections: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(sectionsRaw)) {
    sections[k] = asRecord(v);
  }
  const facts = Array.isArray(r.facts)
    ? r.facts.map((item) => normalizeTraderReportFact(item))
    : [];
  const citations = Array.isArray(r.citations)
    ? r.citations.map((item) => normalizeTraderReportFact(item))
    : facts;
  const nextStepsSection = asRecord(sections.suggested_next_steps);
  const rawItems = Array.isArray(nextStepsSection.items) ? nextStepsSection.items : [];
  const suggestedNextSteps: ServantTraderReportSuggestion[] = rawItems.map((item) => {
    const s = asRecord(item);
    return {
      proposal_type: typeof s.proposal_type === "string" ? s.proposal_type : undefined,
      title: String(s.title ?? ""),
      reason: typeof s.reason === "string" ? s.reason : undefined,
      owner: typeof s.owner === "string" ? s.owner : undefined,
      source: typeof s.source === "string" ? s.source : undefined,
      as_of: typeof s.as_of === "string" ? s.as_of : undefined,
    };
  });

  return {
    report_id: String(r.report_id ?? ""),
    spec_version: typeof r.spec_version === "string" ? r.spec_version : undefined,
    tenant_id: typeof r.tenant_id === "string" ? r.tenant_id : undefined,
    user_id: typeof r.user_id === "string" ? r.user_id : undefined,
    trader_id: typeof r.trader_id === "string" ? r.trader_id : undefined,
    servant_persona_id: String(r.servant_persona_id ?? ""),
    strategy_id: String(r.strategy_id ?? "__all__"),
    strategy_version: String(r.strategy_version ?? "v1"),
    trigger: String(r.trigger ?? "on_demand"),
    cadence: String(r.cadence ?? (r.trigger === "weekly_post_attribution" ? "weekly" : "on_demand")),
    day: typeof r.day === "string" ? r.day : undefined,
    report_day: typeof r.report_day === "string" ? r.report_day : undefined,
    iso_week: String(r.iso_week ?? r.calendar_iso_week ?? ""),
    calendar_iso_week: typeof r.calendar_iso_week === "string" ? r.calendar_iso_week : undefined,
    window_start: String(r.window_start ?? ""),
    window_end: String(r.window_end ?? ""),
    window_days: typeof r.window_days === "number" ? r.window_days : 7,
    status: String(r.status ?? "completed"),
    attribution_run_id:
      typeof r.attribution_run_id === "string" ? r.attribution_run_id : null,
    narrative: String(r.narrative ?? ""),
    narrative_mode: typeof r.narrative_mode === "string" ? r.narrative_mode : undefined,
    facts,
    citations,
    sections,
    suggested_next_steps: suggestedNextSteps,
    created_at: String(r.created_at ?? ""),
    updated_at: typeof r.updated_at === "string" ? r.updated_at : undefined,
  };
}

/** GET /bff/agora/servant/reports — lists the caller's weekly and on-demand trader reports. */
export async function listServantTraderReports(params?: {
  strategyId?: string | null;
  trigger?: string;
  limit?: number;
}): Promise<ServantTraderReportsListResponse> {
  const qs = new URLSearchParams();
  if (params?.strategyId) qs.set("strategy_id", params.strategyId);
  if (params?.trigger) qs.set("trigger", params.trigger);
  if (typeof params?.limit === "number") qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const raw = await bffFetch<unknown>({
    method: "GET",
    path: `/bff/agora/servant/reports${suffix}`,
  });
  const r = unwrapData(raw);
  const items = Array.isArray(r.items)
    ? r.items.map((item) => normalizeServantTraderReport(item))
    : [];
  return {
    items,
    total: typeof r.total === "number" ? r.total : items.length,
    servant_persona_id: String(r.servant_persona_id ?? ""),
    on_demand_daily_used:
      typeof r.on_demand_daily_used === "number" ? r.on_demand_daily_used : 0,
    on_demand_daily_cap:
      typeof r.on_demand_daily_cap === "number" ? r.on_demand_daily_cap : 3,
    weekly_history_cap:
      typeof r.weekly_history_cap === "number" ? r.weekly_history_cap : 26,
  };
}

/** POST /bff/agora/servant/reports — requests a new on-demand trader report (capped at 3/day). */
export async function createServantTraderReport(
  request: CreateServantTraderReportRequest = {},
  idempotencyKey?: string,
): Promise<ServantTraderReport> {
  return normalizeServantTraderReport(
    await bffFetch<unknown>({
      method: "POST",
      path: "/bff/agora/servant/reports",
      body: {
        ...(request.strategy_id ? { strategy_id: request.strategy_id } : {}),
        trigger: request.trigger ?? "on_demand",
        window_days: request.window_days ?? 7,
      },
      ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
    }),
  );
}

/** GET /bff/agora/servant/reports/{report_id} — fetches a single trader report owned by the caller. */
export async function getServantTraderReport(reportId: string): Promise<ServantTraderReport> {
  return normalizeServantTraderReport(
    await bffFetch<unknown>({
      method: "GET",
      path: `/bff/agora/servant/reports/${encodeURIComponent(reportId)}`,
    }),
  );
}
