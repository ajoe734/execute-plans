// Management AI runtime client.
//
// Runtime path (per 2026-06-03 directive):
//   User → Lovable FE → Pantheon BFF → OpenClaw gateway adapter / Codex provider
//                    ← Pantheon BFF ← provider
//
// FE rules enforced by this client:
//   • NEVER generate an answer locally. No Lovable AI / Supabase Edge fallback.
//   • If providerStatus.used !== true OR status ∈ {degraded, disabled, error},
//     return a typed `ProviderDegraded` result; UI MUST render degraded banner
//     (not a synthetic answer).
//   • If the BFF endpoint itself is unreachable / 404 / 5xx, return a typed
//     `TransportFailure`; UI MUST render the same degraded banner.

import { buildHeaders } from "./headers";
import { paths } from "./paths";

function detectBaseUrl(): string {
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  return env.VITE_BFF_BASE_URL ?? "";
}

export type ProviderRuntimeStatus = "completed" | "running" | "degraded" | "disabled" | "error";

export interface ProviderStatus {
  provider: string;        // e.g. "codex_cli"
  runtime: string;         // e.g. "openclaw_gateway_cli_mount"
  status: ProviderRuntimeStatus | string;
  used: boolean;
  fallback: string | null;
}

export interface ManagementAiAnswerOk {
  ok: true;
  kind: "ok";
  answer: string;
  sessionId: string | null;
  traceId: string | null;
  providerStatus: ProviderStatus;
  auditLogHref: string | null;
  conversationHref: string | null;
}

export interface ManagementAiAnswerDegraded {
  ok: false;
  kind: "provider_degraded";
  providerStatus: ProviderStatus | null;
  sessionId: string | null;
  traceId: string | null;
  message: string;
}

export interface ManagementAiTransportFailure {
  ok: false;
  kind: "transport_failure";
  status: number | null;
  message: string;
}

export interface ManagementAiAborted {
  ok: false;
  kind: "aborted";
}

export interface ManagementAiUiAction {
  id?: string;
  kind: string;
  label?: string;
  rationale?: string;
  params?: Record<string, unknown>;
  requiresConfirmation?: boolean;
}

export type ManagementAiResult =
  | (ManagementAiAnswerOk & { uiActions: ManagementAiUiAction[] })
  | ManagementAiAnswerDegraded
  | ManagementAiTransportFailure
  | ManagementAiAborted;


export interface ManagementAiRecentTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ManagementAiUiSnapshot {
  currentRoute: string;
  selectedEntity?: { kind: string; id: string } | null;
  visiblePanels?: string[];
  filters?: Record<string, string>;
  availableUiActions: Array<{ kind: string; description: string; paramsSchema: string }>;
}

export interface ManagementAiAskInput {
  question: string;
  focus?: string;
  /** Free-form JSON-stringified frontend context (route, selection, etc). */
  context?: string;
  sessionId?: string | null;
  conversation?: {
    recentTurns: ManagementAiRecentTurn[];
    summary?: string;
  };
  ui?: ManagementAiUiSnapshot;
}

interface RawAskResponse {
  data?: {
    answer?: string;
    session_id?: string;
    sessionId?: string;
    trace_id?: string;
    traceId?: string;
    provider_status?: Partial<ProviderStatus>;
    providerStatus?: Partial<ProviderStatus>;
    auditLog?: { href?: string };
    audit_log?: { href?: string };
    conversation?: { href?: string };
    uiActions?: ManagementAiUiAction[];
    ui_actions?: ManagementAiUiAction[];
    suggestedActions?: ManagementAiUiAction[];
    suggested_actions?: ManagementAiUiAction[];
    actions?: ManagementAiUiAction[];
  };
}

function adaptUiActions(raw: RawAskResponse["data"]): ManagementAiUiAction[] {
  const merged = [
    ...(raw?.uiActions ?? []),
    ...(raw?.ui_actions ?? []),
    ...(raw?.suggestedActions ?? []),
    ...(raw?.suggested_actions ?? []),
    ...(raw?.actions ?? []),
  ];
  return merged
    .filter((a) => a && typeof a.kind === "string")
    .map((a) => ({
      id: a.id ? String(a.id) : undefined,
      kind: String(a.kind),
      label: a.label ? String(a.label) : undefined,
      rationale: a.rationale ? String(a.rationale) : undefined,
      params: (a.params && typeof a.params === "object") ? a.params : {},
      requiresConfirmation: Boolean(a.requiresConfirmation),
    }));
}

function adaptProviderStatus(raw: Partial<ProviderStatus> | undefined): ProviderStatus | null {
  if (!raw) return null;
  return {
    provider: String(raw.provider ?? "unknown"),
    runtime: String(raw.runtime ?? "unknown"),
    status: String(raw.status ?? "unknown"),
    used: Boolean(raw.used),
    fallback: raw.fallback ?? null,
  };
}

function isDegraded(s: ProviderStatus | null): boolean {
  if (!s) return true;
  if (!s.used) return true;
  return ["degraded", "disabled", "error"].includes(String(s.status).toLowerCase());
}

function newIdempotencyKey(): string {
  return `idk_mai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** POST /bff/management/nl/ask — never returns a locally-synthesized answer. */
export async function askManagementAi(input: ManagementAiAskInput): Promise<ManagementAiResult> {
  const base = detectBaseUrl();
  if (!base) {
    return {
      ok: false,
      kind: "transport_failure",
      status: null,
      message: "BFF base URL is not configured (VITE_BFF_BASE_URL missing).",
    };
  }
  const headers = buildHeaders({
    method: "POST",
    idempotency: newIdempotencyKey(),
  });
  const body = JSON.stringify({
    question: input.question,
    focus: input.focus ?? "all",
    context: input.context ?? "",
    sessionId: input.sessionId ?? undefined,
    conversation: input.conversation ?? undefined,
    ui: input.ui ?? undefined,
  });

  let res: Response;
  try {
    res = await fetch(`${base}${paths.managementNlAsk()}`, {
      method: "POST",
      headers,
      body,
      credentials: "include",
    });
  } catch (err) {
    return {
      ok: false,
      kind: "transport_failure",
      status: null,
      message: (err as Error)?.message ?? "Network error contacting Pantheon BFF.",
    };
  }

  const text = await res.text();
  let parsed: RawAskResponse | undefined;
  try { parsed = text ? JSON.parse(text) as RawAskResponse : undefined; } catch { parsed = undefined; }

  if (!res.ok) {
    return {
      ok: false,
      kind: "transport_failure",
      status: res.status,
      message: `BFF ${res.status} ${res.statusText || ""}`.trim(),
    };
  }

  const data = parsed?.data ?? {};
  const providerStatus = adaptProviderStatus(data.provider_status ?? data.providerStatus);
  const sessionId = data.sessionId ?? data.session_id ?? null;
  const traceId = data.traceId ?? data.trace_id ?? null;

  if (isDegraded(providerStatus)) {
    return {
      ok: false,
      kind: "provider_degraded",
      providerStatus,
      sessionId,
      traceId,
      message: providerStatus
        ? `Provider ${providerStatus.provider}/${providerStatus.runtime} status=${providerStatus.status} used=${providerStatus.used}`
        : "Pantheon BFF returned no providerStatus.",
    };
  }

  return {
    ok: true,
    kind: "ok",
    answer: String(data.answer ?? ""),
    sessionId,
    traceId,
    providerStatus: providerStatus!,
    auditLogHref: data.auditLog?.href ?? data.audit_log?.href ?? null,
    conversationHref: data.conversation?.href ?? null,
    uiActions: adaptUiActions(data),
  };

}

// ---- Conversation resync ----

export interface ManagementAiTurn {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string | null;
  providerStatus?: ProviderStatus | null;
}

export interface ConversationResyncOk {
  ok: true;
  kind: "ok";
  sessionId: string;
  turns: ManagementAiTurn[];
}

export interface ConversationResyncFailure {
  ok: false;
  kind: "failure";
  status: number | null;
  message: string;
}

export type ConversationResyncResult = ConversationResyncOk | ConversationResyncFailure;


interface RawConversationResponse {
  data?: {
    session_id?: string;
    sessionId?: string;
    turns?: Array<{
      id?: string;
      turn_id?: string;
      role?: string;
      text?: string;
      content?: string;
      created_at?: string;
      createdAt?: string;
      provider_status?: Partial<ProviderStatus>;
      providerStatus?: Partial<ProviderStatus>;
    }>;
  };
}

/**
 * Read the full conversation history for a session.
 *
 * Per 2026-06-03 directive: do NOT pass trace_id when loading the full
 * conversation — trace_id is for single-turn audit linking only. The
 * second parameter is accepted but ignored to preserve call sites.
 */
export async function fetchManagementAiConversation(
  sessionId: string,
  _traceIdIgnored?: string | null,
): Promise<ConversationResyncResult> {
  const base = detectBaseUrl();
  if (!base) return { ok: false, kind: "failure", status: null, message: "BFF base URL is not configured." };
  const headers = buildHeaders({ method: "GET" });
  const url = `${base}${paths.managementAiConversation(sessionId)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers, credentials: "include" });
  } catch (err) {
    return { ok: false, kind: "failure", status: null, message: (err as Error)?.message ?? "Network error." };
  }
  const text = await res.text();
  if (!res.ok) return { ok: false, kind: "failure", status: res.status, message: `BFF ${res.status}` };
  let parsed: RawConversationResponse | undefined;
  try { parsed = text ? JSON.parse(text) as RawConversationResponse : undefined; } catch { parsed = undefined; }
  const data = parsed?.data ?? {};
  const turns: ManagementAiTurn[] = (data.turns ?? []).map((t, i) => ({
    id: String(t.id ?? t.turn_id ?? `turn_${i}`),
    role: (["user", "assistant", "system"].includes(String(t.role)) ? t.role : "assistant") as ManagementAiTurn["role"],
    text: String(t.text ?? t.content ?? ""),
    createdAt: t.createdAt ?? t.created_at ?? null,
    providerStatus: adaptProviderStatus(t.provider_status ?? t.providerStatus),
  }));
  return { ok: true, kind: "ok", sessionId: String(data.sessionId ?? data.session_id ?? sessionId), turns };
}
