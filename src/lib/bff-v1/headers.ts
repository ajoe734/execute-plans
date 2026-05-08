// BFF Contract v1 — Request header helpers.
// Final C.1: Idempotency-Key is HEADER (not body). C.4 ETag/If-Match for optimistic lock.
//
// Live-Wiring Alignment Patch (2026-05-08):
//   - Authorization (Bearer)        — from getAuthToken() provider
//   - X-Tenant-Id                   — from getTenantId() provider
//   - X-Correlation-Id              — auto-minted root chain (or caller-supplied)
//   - Idempotency-Key               — mutations only (unchanged)
// Providers default to no-op so mock mode and tests continue to pass without
// real credentials. Live deployments register real providers via
// `setAuthProvider({ getToken, getTenantId })`.

const HTTP_MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutation(method: string): boolean {
  return HTTP_MUTATION_METHODS.has(method.toUpperCase());
}

/** ULID-like sortable key. */
export function idempotencyKey(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 12);
  return `idk_${ts}_${rnd}`;
}

export function xRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Root correlation id (also used as fallback when caller does not supply one). */
export function newCorrelationId(): string {
  return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function ifMatch(lockVersion: number | string): string {
  return `"${lockVersion}"`;
}

export function acceptLanguage(locale?: string): string {
  if (locale) return locale;
  if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
  return "en-US";
}

/** H1 closed — aligned with OpenAPI `components.parameters.BffApiVersion.default`. */
export const BFF_API_VERSION = "2026-05-07";
export function xBffApiVersion(): string {
  return BFF_API_VERSION;
}

// ---- Auth / Tenant providers (pluggable, synchronous) ----
export interface AuthProvider {
  /** Returns Bearer token (without "Bearer " prefix), or null if unauthenticated. */
  getToken: () => string | null;
  /** Returns active tenant id, or null when caller is tenant-agnostic. */
  getTenantId: () => string | null;
}

const noopProvider: AuthProvider = {
  getToken: () => null,
  getTenantId: () => null,
};

let authProvider: AuthProvider = noopProvider;

export function setAuthProvider(p: Partial<AuthProvider>): void {
  authProvider = {
    getToken: p.getToken ?? authProvider.getToken,
    getTenantId: p.getTenantId ?? authProvider.getTenantId,
  };
}

export function getAuthProvider(): AuthProvider {
  return authProvider;
}

export interface BuildHeadersInput {
  method: string;
  locale?: string;
  idempotency?: string;
  ifMatchVersion?: number | string;
  /** Caller-supplied correlation id (else auto-minted). */
  correlationId?: string;
  extra?: Record<string, string>;
}

export function buildHeaders(input: BuildHeadersInput): Record<string, string> {
  const correlationId = input.correlationId ?? newCorrelationId();
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Accept-Language": acceptLanguage(input.locale),
    "X-Request-Id": xRequestId(),
    "X-Correlation-Id": correlationId,
    "X-BFF-Api-Version": xBffApiVersion(),
  };
  // Auth / tenant injection (live mode). Mock / test providers return null → headers omitted.
  try {
    const token = authProvider.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const tenant = authProvider.getTenantId();
    if (tenant) headers["X-Tenant-Id"] = tenant;
  } catch {
    // Auth provider failures must not block requests; live mode will surface 401 from server.
  }
  if (isMutation(input.method)) {
    headers["Content-Type"] = "application/json";
    headers["Idempotency-Key"] = input.idempotency ?? idempotencyKey();
    if (input.ifMatchVersion !== undefined) {
      headers["If-Match"] = ifMatch(input.ifMatchVersion);
    }
  }
  if (input.extra) Object.assign(headers, input.extra);
  return headers;
}
