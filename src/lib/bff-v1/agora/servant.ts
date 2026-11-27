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
}

export interface ServantMessageRequest {
  content: string;
  attachment_refs?: string[];
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
  session_id: string;
  session_type: ServantSessionType;
  servant_persona_id: string;
  provider: ServantProviderReply;
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

  return {
    message_id: messageId,
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
  return normalizeServantMessageReceipt(
    await bffFetch<unknown>({
      method: "POST",
      path: `/bff/agora/servant/sessions/${encodeURIComponent(sessionId)}/messages`,
      body: {
        content: request.content,
        attachment_refs: request.attachment_refs ?? [],
      },
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
      });
    } else if (ev.type === "servant.message.completed" || ev.type === "servant.message.degraded") {
      const degraded = ev.type === "servant.message.degraded" || d.provider_status === "degraded";
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
