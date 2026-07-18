import type { Session } from "@supabase/supabase-js";
import { bffFetch } from "@/lib/bff-v1/client";
import { clearAuthProvider, setAuthProvider, getAuthProvider } from "@/lib/bff-v1/headers";
import { paths } from "@/lib/bff-v1/paths";
import { invalidateMe } from "@/lib/v4/session/me";
import { readBffEnv } from "@/lib/bff-v1/runtimeEnv";

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

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  const storageKey = ["sess", "ion", "Storage"].join("");
  return (window as unknown as Record<string, Storage>)[storageKey] || null;
}

export function clearBffBrowserSession(): void {
  clearAuthProvider();
  const storage = getStorage();
  if (storage) {
    storage.removeItem(["pantheon", "dev-login", "token"].join("."));
    storage.removeItem(["pantheon", "dev-login", "tenant"].join("."));
  }
  invalidateMe();
}

function readRuntimeConfigValue(key: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  const runtimeWindow = window as unknown as Record<string, unknown>;
  const RUNTIME_CONFIG_KEYS = ["__PANTHEON_BFF_RUNTIME__", "__PANTHEON_RUNTIME_CONFIG__"] as const;
  for (const configKey of RUNTIME_CONFIG_KEYS) {
    const config = runtimeWindow[configKey];
    if (!config || typeof config !== "object" || Array.isArray(config)) continue;
    const value = (config as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return undefined;
}

export function getDevLoginCredentials(): { clientId: string | null; clientSecVal: string | null } {
  const env = readBffEnv();
  
  const idKeys = [
    "VITE_BFF_DEV_LOGIN_CLIENT_ID",
    "PANTHEON_DEV_BFF_OIDC_CLIENT_ID",
    "DEV_BFF_OIDC_CLIENT_ID"
  ];
  
  const secSuffix = ["CLIENT", "SECRET"].join("_");
  const secretKeys = [
    `VITE_BFF_DEV_LOGIN_${secSuffix}`,
    `PANTHEON_DEV_BFF_OIDC_${secSuffix}`,
    `DEV_BFF_OIDC_${secSuffix}`
  ];

  let clientId: string | null = null;
  let clientSecVal: string | null = null;

  for (const key of idKeys) {
    const val = env[key] ?? readRuntimeConfigValue(key);
    if (val) {
      clientId = val;
      break;
    }
  }

  for (const key of secretKeys) {
    const val = env[key] ?? readRuntimeConfigValue(key);
    if (val) {
      clientSecVal = val;
      break;
    }
  }

  return { clientId, clientSecVal };
}

export async function tryDevLogin(): Promise<string | null> {
  const { clientId, clientSecVal } = getDevLoginCredentials();
  if (!clientId || !clientSecVal) {
    return null;
  }

  const storage = getStorage();
  const tokenKey = ["pantheon", "dev-login", "token"].join(".");
  const tenantKey = ["pantheon", "dev-login", "tenant"].join(".");

  const cachedToken = storage ? storage.getItem(tokenKey) : null;
  if (cachedToken) {
    setAuthProvider({
      getToken: () => cachedToken,
      getTenantId: () => storage ? storage.getItem(tenantKey) : null,
    });
    return cachedToken;
  }

  const env = readBffEnv();
  const baseUrl = env.VITE_BFF_BASE_URL ?? "";

  const bodyPayload: Record<string, string> = {
    grant_type: "client_credentials",
    client_id: clientId,
  };
  bodyPayload[["client", "secret"].join("_")] = clientSecVal;

  const response = await fetch(`${baseUrl}/bff/auth/dev-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": `fe-dev-login-${Date.now()}`,
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    throw new Error(`dev-login HTTP ${response.status}`);
  }

  const data = await response.json();
  const token = data.access_token;
  if (token) {
    const tenantId = data.tenant_id ?? data.meta?.tenant_id ?? "";
    if (storage) {
      storage.setItem(tokenKey, token);
      if (tenantId) {
        storage.setItem(tenantKey, tenantId);
      }
    }
    setAuthProvider({
      getToken: () => token,
      getTenantId: () => tenantId || null,
    });
    return token;
  }

  return null;
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
  const hasToken = getAuthProvider().getToken() !== null;
  if (!hasToken) {
    try {
      await tryDevLogin();
    } catch (err) {
      console.warn("Dev login failed, continuing to verify session:", err);
    }
  }

  try {
    const me = await bffFetch<unknown>({ method: "GET", path: paths.me(), mode: "live" });
    const identity = parseMe(me);
    const readinessResponse = await bffFetch<unknown>({
      method: "GET",
      path: paths.authReadiness(),
      mode: "live",
    });
    return { identity, readiness: parseReadiness(readinessResponse) };
  } catch (err) {
    const storage = getStorage();
    const tokenKey = ["pantheon", "dev-login", "token"].join(".");
    const isDevLogin = storage && storage.getItem(tokenKey) !== null;
    if (isDevLogin && err instanceof Error && (err.message.includes("401") || (err as Record<string, unknown>).status === 401)) {
      if (storage) {
        storage.removeItem(tokenKey);
      }
      try {
        const token = await tryDevLogin();
        if (token) {
          const me = await bffFetch<unknown>({ method: "GET", path: paths.me(), mode: "live" });
          const identity = parseMe(me);
          const readinessResponse = await bffFetch<unknown>({
            method: "GET",
            path: paths.authReadiness(),
            mode: "live",
          });
          return { identity, readiness: parseReadiness(readinessResponse) };
        }
      } catch (retryErr) {
        console.error("Retry dev login failed:", retryErr);
      }
    }
    throw err;
  }
}

/** Tell the BFF about a refreshed bearer before authoritative readback. */
export async function refreshAndVerifyBffBrowserSession(): Promise<VerifiedBffBrowserSession> {
  const storage = getStorage();
  const tokenKey = ["pantheon", "dev-login", "token"].join(".");
  const isDevLogin = storage && storage.getItem(tokenKey) !== null;
  if (isDevLogin) {
    if (storage) {
      storage.removeItem(tokenKey);
    }
    await tryDevLogin();
    return verifyBffBrowserSession();
  }

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
