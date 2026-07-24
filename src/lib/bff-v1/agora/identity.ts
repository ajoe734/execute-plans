// BFF client for agora.identity.v1 capability.
// Routes: /bff/agora/me, /bff/agora/capabilities, /bff/agora/sessions.
// Schemas: agora_user_scope.schema.json, servant_profile.schema.json.
// Strict live-only — no mock fallback on network errors. Throws BffError on non-2xx.

import { withStrictLiveOrMock } from "@/lib/bff/liveRead";

export type AgoraCapability =
  | "agora.identity.v1"
  | "agora.session.v1"
  | "agora.workshop.v1"
  | "agora.research.v1"
  | "agora.trading.v1"
  | "agora.dashboard.v1"
  | "agora.personalization.v1";

export interface AgoraReadPredicate {
  tenant_id: string;
  user_id: string;
  required_fields: ["tenant_id", "user_id"];
  fail_closed: true;
}

export interface AgoraServantPolicy {
  persona_class: "agora_servant";
  owner_scope: "user_private";
  visibility_scope: "private" | "redacted_management";
  memory_scope: "private_user";
  persona_registry_backed: true;
  execution_authority: "none";
  prohibited_authority: ["runtime_binding", "broker_order", "capital_binding"];
}

export interface AgoraUserScope {
  spec_version: "1.0";
  scope_id: string;
  tenant_id: string;
  user_id: string;
  operator_id: string;
  granted_capabilities: AgoraCapability[];
  capabilities?: AgoraCapability[];
  roles?: string[];
  denied_capabilities?: string[];
  surfaces?: Array<"agora">;
  persona_ids?: string[];
  read_predicate: AgoraReadPredicate;
  servant_policy: AgoraServantPolicy;
  created_at: string;
  expires_at?: string | null;
  policy_refs?: string[];
  metadata?: Record<string, unknown>;
}

export interface AgoraSession {
  session_id: string;
  persona_id: string;
  subject?: string;
  status?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
}

export interface AgoraSessionListResponse {
  items: AgoraSession[];
  page_token?: string;
}

export interface AgoraSessionCreateRequest {
  persona_id: string;
  subject?: string;
  metadata?: Record<string, unknown>;
}

export class AgoraIdentityError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AgoraIdentityError";
    this.status = status;
  }
}

// ── /bff/agora/me and /bff/agora/capabilities ─────────────────────────────

const MOCK_USER_SCOPE: AgoraUserScope = {
  spec_version: "1.0",
  scope_id: "mock-scope",
  tenant_id: "mock-tenant",
  user_id: "mock-user",
  operator_id: "mock-operator",
  granted_capabilities: [],
  read_predicate: {
    tenant_id: "mock-tenant",
    user_id: "mock-user",
    required_fields: ["tenant_id", "user_id"],
    fail_closed: true,
  },
  servant_policy: {
    persona_class: "agora_servant",
    owner_scope: "user_private",
    visibility_scope: "private",
    memory_scope: "private_user",
    persona_registry_backed: true,
    execution_authority: "none",
    prohibited_authority: ["runtime_binding", "broker_order", "capital_binding"],
  },
  created_at: "2026-01-01T00:00:00Z",
};

function adaptUserScope(body: unknown): AgoraUserScope {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid /bff/agora/me response");
  }
  const envelope = body as Record<string, unknown>;
  const data = envelope.data ?? envelope;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid /bff/agora/me response: missing data");
  }
  const scope = data as Record<string, unknown>;
  if (typeof scope.scope_id !== "string") {
    throw new Error("Invalid /bff/agora/me response: missing scope_id");
  }
  return scope as unknown as AgoraUserScope;
}

function adaptCapabilities(body: unknown): AgoraCapability[] {
  const namesFrom = (value: unknown): AgoraCapability[] => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((capability) => {
      if (typeof capability === "string") return [capability as AgoraCapability];
      if (!capability || typeof capability !== "object" || Array.isArray(capability)) return [];
      const name = (capability as Record<string, unknown>).name;
      return typeof name === "string" && name.trim()
        ? [name as AgoraCapability]
        : [];
    });
  };

  if (Array.isArray(body)) return namesFrom(body);
  if (!body || typeof body !== "object") return [];
  const envelope = body as Record<string, unknown>;
  const direct = envelope.capabilities ?? envelope.granted_capabilities;
  if (Array.isArray(direct)) return namesFrom(direct);
  const data = envelope.data;
  if (Array.isArray(data)) return namesFrom(data);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const nested = (data as Record<string, unknown>).capabilities ?? (data as Record<string, unknown>).granted_capabilities;
    if (Array.isArray(nested)) return namesFrom(nested);
  }
  return [];
}

async function getMe(): Promise<AgoraUserScope> {
  return withStrictLiveOrMock<AgoraUserScope>(
    { method: "GET", path: "/bff/agora/me" },
    async () => MOCK_USER_SCOPE,
    adaptUserScope,
  );
}

async function getCapabilities(): Promise<AgoraCapability[]> {
  return withStrictLiveOrMock<AgoraCapability[]>(
    { method: "GET", path: "/bff/agora/capabilities" },
    async () => [],
    adaptCapabilities,
  );
}

export const agoraIdentityClient = { getMe, getCapabilities } as const;

// ── /bff/agora/sessions ────────────────────────────────────────────────────

function resolvedBase(baseUrl?: string): string {
  if (baseUrl) return baseUrl.replace(/\/+$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "";
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const err = b.error;
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      if (typeof e.message === "string") return e.message;
      if (typeof e.code === "string") return e.code;
    }
  }
  return `BFF responded with HTTP ${status}`;
}

function normalizeSession(raw: unknown): AgoraSession {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const data = (r.data && typeof r.data === "object" ? r.data : r) as Record<string, unknown>;
  return {
    session_id: String(data.session_id ?? ""),
    persona_id: String(data.persona_id ?? ""),
    subject: typeof data.subject === "string" ? data.subject : undefined,
    status: typeof data.status === "string" ? data.status : undefined,
    created_at: typeof data.created_at === "string" ? data.created_at : undefined,
    metadata:
      data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : undefined,
  };
}

/** GET /bff/agora/sessions — list Agora sessions. Strict live-only. */
export async function listAgoraSessions(
  opts?: { pageToken?: string; limit?: number },
  baseUrl?: string,
): Promise<AgoraSessionListResponse> {
  const base = resolvedBase(baseUrl);
  const params = new URLSearchParams();
  if (opts?.pageToken) params.set("page_token", opts.pageToken);
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const url = `${base}/bff/agora/sessions${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  const body = await parseBody(res);
  if (!res.ok) throw new AgoraIdentityError(errorMessage(body, res.status), res.status);

  const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.data)
      ? data.data
      : [];
  return {
    items: rawItems.map(normalizeSession),
    page_token: typeof data.page_token === "string" ? data.page_token : undefined,
  };
}

/** POST /bff/agora/sessions — create a new Agora session. */
export async function createAgoraSession(
  body: AgoraSessionCreateRequest,
  baseUrl?: string,
): Promise<AgoraSession> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/sessions`;

  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const resBody = await parseBody(res);
  if (!res.ok) throw new AgoraIdentityError(errorMessage(resBody, res.status), res.status);
  return normalizeSession(resBody);
}

/** GET /bff/agora/sessions/{session_id} — get session detail. */
export async function getAgoraSession(
  sessionId: string,
  baseUrl?: string,
): Promise<AgoraSession> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/sessions/${encodeURIComponent(sessionId)}`;

  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  const resBody = await parseBody(res);
  if (!res.ok) throw new AgoraIdentityError(errorMessage(resBody, res.status), res.status);
  return normalizeSession(resBody);
}
