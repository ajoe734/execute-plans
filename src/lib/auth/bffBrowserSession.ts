import type { Session } from "@supabase/supabase-js";
import { bffFetch } from "@/lib/bff-v1/client";
import { clearAuthProvider, setAuthProvider } from "@/lib/bff-v1/headers";
import { paths } from "@/lib/bff-v1/paths";
import { invalidateMe } from "@/lib/v4/session/me";

type JsonRecord = Record<string, unknown>;

export interface BffBrowserIdentity {
  authenticated: true;
  sessionKind: "bearer" | "cookie";
  userId: string;
  tenantId: string;
  roles: string[];
  capabilities: string[];
}

export interface BffBrowserReadiness {
  ready: boolean;
  authReady: boolean;
  providerReady: boolean;
  sourceCommitSha: string | null;
  authMode: string;
  authStub: boolean;
  operatorRoleReady: boolean;
  interactionCapabilityReady: boolean;
}

export interface VerifiedBffBrowserSession {
  identity: BffBrowserIdentity;
  readiness: BffBrowserReadiness;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function dataEnvelope(value: unknown): JsonRecord {
  const root = record(value);
  return Object.keys(record(root.data)).length > 0 ? record(root.data) : root;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function nonBlank(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Only server-owned, signed Supabase app_metadata may select a tenant header.
 * Missing metadata safely falls back to no header so the BFF chooses and
 * validates its own default. user_metadata is intentionally never consulted.
 */
export function signedTenantId(session: Session | null): string | null {
  const appMetadata = record(session?.user?.app_metadata);
  const nestedTenant = record(appMetadata.tenant);
  return nonBlank(appMetadata.tenant_id)
    ?? nonBlank(appMetadata.tenantId)
    ?? nonBlank(nestedTenant.id);
}

/** Register the current Supabase bearer as an in-memory BFF header source. */
export function registerBffBrowserSession(session: Session): void {
  const accessToken = nonBlank(session.access_token);
  const tenantId = signedTenantId(session);
  setAuthProvider({
    getToken: () => accessToken,
    getTenantId: () => tenantId,
  });
  invalidateMe();
}

export function clearBffBrowserSession(): void {
  clearAuthProvider();
  invalidateMe();
}

function parseMe(value: unknown): BffBrowserIdentity {
  const data = dataEnvelope(value);
  const session = record(data.session);
  const user = record(data.user);
  const tenant = record(data.tenant);
  const sessionKind = nonBlank(session.session_kind) ?? nonBlank(session.sessionKind);

  if (session.authenticated !== true) {
    throw new Error("BFF did not authenticate the browser session");
  }
  if (sessionKind !== "bearer" && sessionKind !== "cookie") {
    throw new Error("BFF browser session is not a strict bearer or cookie session");
  }

  const userId = nonBlank(user.id) ?? nonBlank(data.operator_id) ?? nonBlank(data.operatorId);
  const tenantId = nonBlank(tenant.id) ?? nonBlank(data.tenant_id) ?? nonBlank(data.tenantId);
  if (!userId || !tenantId) {
    throw new Error("BFF identity readback is missing user or tenant authority");
  }

  return {
    authenticated: true,
    sessionKind,
    userId,
    tenantId,
    roles: stringArray(data.roles),
    capabilities: stringArray(data.capabilities),
  };
}

function parseReadiness(value: unknown): BffBrowserReadiness {
  const data = dataEnvelope(value);
  const auth = record(data.auth);
  const authMode = nonBlank(auth.mode) ?? "unknown";
  const authStub = auth.stub === true;
  const strict = auth.strict === true || authMode === "strict";
  const sessionKind = nonBlank(auth.sessionKind) ?? nonBlank(auth.session_kind);

  if (!strict || authStub || (sessionKind !== "bearer" && sessionKind !== "cookie")) {
    throw new Error("BFF strict browser readiness rejected this session");
  }

  return {
    ready: data.ready === true,
    authReady: data.authReady === true,
    providerReady: data.providerReady === true,
    sourceCommitSha: nonBlank(data.sourceCommitSha),
    authMode,
    authStub,
    operatorRoleReady: auth.operatorRoleReady === true,
    interactionCapabilityReady: auth.interactionCapabilityReady === true,
  };
}

/** Verify identity and product readiness through BFF-owned readback. */
export async function verifyBffBrowserSession(): Promise<VerifiedBffBrowserSession> {
  const me = await bffFetch<unknown>({ method: "GET", path: paths.me(), mode: "live" });
  const identity = parseMe(me);
  const readinessResponse = await bffFetch<unknown>({
    method: "GET",
    path: paths.authReadiness(),
    mode: "live",
  });
  return { identity, readiness: parseReadiness(readinessResponse) };
}

/** Tell the BFF about a refreshed bearer before authoritative readback. */
export async function refreshAndVerifyBffBrowserSession(): Promise<VerifiedBffBrowserSession> {
  await bffFetch<unknown>({
    method: "POST",
    path: paths.authRefresh(),
    body: {},
    mode: "live",
  });
  return verifyBffBrowserSession();
}

/** Invalidate the current BFF session while its bearer is still registered. */
export async function logoutBffBrowserSession(): Promise<void> {
  await bffFetch<unknown>({ method: "POST", path: paths.logout(), mode: "live" });
}
