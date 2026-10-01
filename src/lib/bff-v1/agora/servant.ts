// BFF client for agora.servant.v1 capability.
// Routes: /bff/agora/servant (GET), /bff/agora/servant/ensure (POST).
// Strict live: errors surface as errors; never mock data or a default status.
// Schema: servant_profile.schema.json.
// The browser must never submit another user's identity; tenant_id and
// agora_user_id are always derived server-side from the authenticated subject.

import type { AgoraCapability, AgoraServantPolicy } from "./identity";
import { bffFetch } from "../client";
import { BffError, makeBffError } from "../errors";

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

const SERVANT_STATUSES: readonly ServantStatus[] = [
  "active",
  "suspended",
  "paper_only",
  "shadow_only",
  "retired",
];

function normalizeServantProfile(raw: unknown): ServantProfile {
  const outer = (raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw
    : {}) as Record<string, unknown>;
  const r = (outer.data && typeof outer.data === "object" && !Array.isArray(outer.data)
    ? outer.data
    : outer) as Record<string, unknown>;

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
    display_name: String(r.display_name ?? "交易僕人"),
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
