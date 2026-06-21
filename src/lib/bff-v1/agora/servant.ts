// BFF client for agora.servant.v1 capability.
// Routes: /bff/agora/servant (get/ensure).
// Schema: servant_profile.schema.json.
// Strict live-only — no mock fallback. Throws AgoraServantError on non-2xx.
// The browser must never submit another user's identity; tenant_id and
// agora_user_id are always derived server-side from the authenticated subject.

import type { AgoraCapability, AgoraServantPolicy } from "./identity";

export type ServantStatus = "active" | "suspended" | "paper_only" | "shadow_only" | "retired";

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

export class AgoraServantError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AgoraServantError";
    this.status = status;
  }
}

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

function normalizeCapabilitySummary(raw: unknown): ServantCapabilitySummary {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw
    : {}) as Record<string, unknown>;
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
  const r = (raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw
    : {}) as Record<string, unknown>;
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

function normalizeServantProfile(raw: unknown): ServantProfile {
  const outer = (raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw
    : {}) as Record<string, unknown>;
  const r = (outer.data && typeof outer.data === "object" && !Array.isArray(outer.data)
    ? outer.data
    : outer) as Record<string, unknown>;

  const VALID_STATUSES: ServantStatus[] = [
    "active",
    "suspended",
    "paper_only",
    "shadow_only",
    "retired",
  ];
  const rawStatus = String(r.status ?? "");
  const status: ServantStatus = (VALID_STATUSES.includes(rawStatus as ServantStatus)
    ? rawStatus
    : "active") as ServantStatus;

  return {
    spec_version: "1.0",
    persona_id: String(r.persona_id ?? ""),
    display_name: String(r.display_name ?? "Servant"),
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

/**
 * GET /bff/agora/servant — get the current user's servant profile.
 * Returns null when the servant is not yet provisioned (HTTP 404).
 * Throws AgoraServantError on all other non-2xx responses.
 */
export async function getServant(baseUrl?: string): Promise<ServantProfile | null> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/servant`;

  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (res.status === 404) return null;

  const body = await parseBody(res);
  if (!res.ok) throw new AgoraServantError(errorMessage(body, res.status), res.status);
  return normalizeServantProfile(body);
}

/**
 * POST /bff/agora/servant/ensure — provision or reconcile the current user's servant.
 * The BFF derives tenant_id and agora_user_id from the authenticated subject.
 * Requires a client-generated UUID idempotency key.
 */
export async function ensureServant(
  idempotencyKey: string,
  request: ServantEnsureRequest,
  baseUrl?: string,
): Promise<ServantProfile> {
  const base = resolvedBase(baseUrl);
  const url = `${base}/bff/agora/servant/ensure`;

  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "X-Request-Id": idempotencyKey,
    },
    body: JSON.stringify(request),
  });

  const body = await parseBody(res);
  if (!res.ok) throw new AgoraServantError(errorMessage(body, res.status), res.status);
  return normalizeServantProfile(body);
}
