import { BffError } from "@/lib/bff-v1/errors";
import { buildHeaders, getAuthProvider } from "@/lib/bff-v1/headers";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { paths } from "@/lib/bff-v1/paths";
import { readBffEnv } from "@/lib/bff-v1/runtimeEnv";

export interface BffUnauthorizedEvent {
  /**
   * True when `POST /bff/auth/refresh` has already been attempted and failed
   * (or when a retry after refresh still returned 401), so the session can be
   * cleared immediately without an extra `/bff/me` probe.
   */
  confirmed?: boolean;
}

export type BffUnauthorizedListener = (event?: BffUnauthorizedEvent) => void;

export interface SessionExpiryInfo {
  expiresAt?: string | null;
  refreshExpiresAt?: string | null;
}

const unauthorizedListeners = new Set<BffUnauthorizedListener>();
const refreshedListeners = new Set<() => void>();

export type BffRefreshOutcome = "refreshed" | "auth_rejected" | "transient";

let refreshInFlight: Promise<BffRefreshOutcome> | null = null;
let refreshGeneration = 0;
let lastSuccessGeneration = 0;
let lastKnownBaseUrl = "";

let proactiveTimer: ReturnType<typeof setTimeout> | null = null;
let recordedExpiresAtMs: number | null = null;
let recordedRefreshExpiresAtMs: number | null = null;
let renewalActive = false;
let renewalBaseUrl: string | undefined;
let renewalFetchFn: typeof fetch | undefined;
let visibilityListenerAttached = false;

const DEFAULT_PROACTIVE_LEAD_MS = 60_000;
const MAX_TIMEOUT_MS = 2_147_483_647;

export function onBffUnauthorized(listener: BffUnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export function reportBffUnauthorized(event?: BffUnauthorizedEvent): void {
  for (const listener of unauthorizedListeners) {
    listener(event);
  }
}

export function onBffSessionRefreshed(listener: () => void): () => void {
  refreshedListeners.add(listener);
  return () => {
    refreshedListeners.delete(listener);
  };
}

function notifySessionRefreshed(): void {
  for (const listener of refreshedListeners) {
    listener();
  }
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof BffError && error.status === 401;
}

export function isBffAuthRejection(error: unknown): boolean {
  return error instanceof BffError && (error.status === 401 || error.status === 403);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function extractSessionExpiry(payload: unknown): SessionExpiryInfo | null {
  if (!isObject(payload)) return null;
  const data = isObject(payload.data) ? payload.data : null;
  const dataSession = data && isObject(data.session) ? data.session : null;
  const rootSession = isObject(payload.session) ? payload.session : null;

  const expiresAt =
    nonEmptyString(dataSession?.expires_at) ??
    nonEmptyString(dataSession?.expiresAt) ??
    nonEmptyString(data?.expires_at) ??
    nonEmptyString(data?.expiresAt) ??
    nonEmptyString(data?.sessionExpiresAt) ??
    nonEmptyString(rootSession?.expires_at) ??
    nonEmptyString(rootSession?.expiresAt) ??
    nonEmptyString(payload.expires_at) ??
    nonEmptyString(payload.expiresAt) ??
    nonEmptyString(payload.sessionExpiresAt);

  const refreshExpiresAt =
    nonEmptyString(dataSession?.refresh_expires_at) ??
    nonEmptyString(dataSession?.refreshExpiresAt) ??
    nonEmptyString(data?.refresh_expires_at) ??
    nonEmptyString(data?.refreshExpiresAt) ??
    nonEmptyString(rootSession?.refresh_expires_at) ??
    nonEmptyString(rootSession?.refreshExpiresAt) ??
    nonEmptyString(payload.refresh_expires_at) ??
    nonEmptyString(payload.refreshExpiresAt);

  if (!expiresAt && !refreshExpiresAt) {
    return null;
  }
  return { expiresAt: expiresAt ?? null, refreshExpiresAt: refreshExpiresAt ?? null };
}

function resolveBaseUrl(explicitBaseUrl?: string): string {
  if (explicitBaseUrl !== undefined) {
    return explicitBaseUrl.replace(/\/+$/u, "");
  }
  const envBase = (readBffEnv().VITE_BFF_BASE_URL ?? "").replace(/\/+$/u, "");
  if (envBase) return envBase;
  return lastKnownBaseUrl;
}

function extractBaseUrlFromRequestUrl(url: string): string {
  const bffIdx = url.indexOf("/bff/");
  if (bffIdx > 0) {
    const prefix = url.slice(0, bffIdx).replace(/\/+$/u, "");
    lastKnownBaseUrl = prefix;
    return prefix;
  }
  return resolveBaseUrl();
}

function handleVisibilityChange(): void {
  if (!renewalActive) return;
  if (typeof document === "undefined" || document.visibilityState !== "visible") {
    return;
  }
  // GCP Identity bearer sessions are refreshed by Firebase Auth directly.
  const token = getAuthProvider().getToken();
  if (token && token.trim().length > 0) {
    return;
  }
  if (
    recordedRefreshExpiresAtMs !== null &&
    Number.isFinite(recordedRefreshExpiresAtMs) &&
    Date.now() >= recordedRefreshExpiresAtMs
  ) {
    clearSessionExpiry();
    reportBffUnauthorized({ confirmed: true });
    return;
  }
  void refreshBffSession({
    baseUrl: renewalBaseUrl,
    fetchFn: renewalFetchFn,
    reportOnFailure: true,
  });
}

function ensureVisibilityListener(): void {
  if (visibilityListenerAttached || typeof document === "undefined" || typeof document.addEventListener !== "function") {
    return;
  }
  document.addEventListener("visibilitychange", handleVisibilityChange);
  visibilityListenerAttached = true;
}

function removeVisibilityListener(): void {
  if (!visibilityListenerAttached || typeof document === "undefined" || typeof document.removeEventListener !== "function") {
    return;
  }
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  visibilityListenerAttached = false;
}

function clearProactiveTimer(): void {
  if (proactiveTimer !== null) {
    clearTimeout(proactiveTimer);
    proactiveTimer = null;
  }
}

function scheduleProactiveRefresh(): void {
  clearProactiveTimer();
  if (!renewalActive || recordedExpiresAtMs === null || !Number.isFinite(recordedExpiresAtMs)) {
    return;
  }
  const now = Date.now();
  if (
    recordedRefreshExpiresAtMs !== null &&
    Number.isFinite(recordedRefreshExpiresAtMs) &&
    now >= recordedRefreshExpiresAtMs
  ) {
    return;
  }
  const remainingMs = recordedExpiresAtMs - now;
  if (remainingMs <= 0) {
    return;
  }
  const leadMs = Math.min(DEFAULT_PROACTIVE_LEAD_MS, Math.floor(remainingMs * 0.25));
  const delayMs = Math.min(MAX_TIMEOUT_MS, Math.max(0, remainingMs - leadMs));

  proactiveTimer = setTimeout(() => {
    proactiveTimer = null;
    if (!renewalActive) return;
    const token = getAuthProvider().getToken();
    if (token && token.trim().length > 0) return;
    void refreshBffSession({
      baseUrl: renewalBaseUrl,
      fetchFn: renewalFetchFn,
      reportOnFailure: true,
      });
  }, delayMs);
}

export function recordSessionExpiry(
  info: SessionExpiryInfo,
  options?: { baseUrl?: string; fetchFn?: typeof fetch },
): void {
  if (options?.baseUrl !== undefined) {
    renewalBaseUrl = options.baseUrl;
  }
  if (options?.fetchFn !== undefined) {
    renewalFetchFn = options.fetchFn;
  }
  if (info.refreshExpiresAt) {
    const parsedRefresh = Date.parse(info.refreshExpiresAt);
    if (Number.isFinite(parsedRefresh)) {
      recordedRefreshExpiresAtMs = parsedRefresh;
    }
  }
  if (info.expiresAt) {
    const parsedAccess = Date.parse(info.expiresAt);
    if (Number.isFinite(parsedAccess)) {
      recordedExpiresAtMs = parsedAccess;
      renewalActive = true;
      ensureVisibilityListener();
      scheduleProactiveRefresh();
    }
  }
}

export function recordSessionExpiryFromPayload(
  payload: unknown,
  options?: { baseUrl?: string; fetchFn?: typeof fetch },
): SessionExpiryInfo | null {
  const extracted = extractSessionExpiry(payload);
  if (extracted) {
    recordSessionExpiry(extracted, options);
  }
  return extracted;
}

export function setSessionRenewalActive(
  active: boolean,
  options?: { baseUrl?: string; fetchFn?: typeof fetch },
): void {
  if (!active) {
    clearSessionExpiry();
    return;
  }
  renewalActive = true;
  if (options?.baseUrl !== undefined) {
    renewalBaseUrl = options.baseUrl;
  }
  if (options?.fetchFn !== undefined) {
    renewalFetchFn = options.fetchFn;
  }
  ensureVisibilityListener();
  scheduleProactiveRefresh();
}

export function clearSessionExpiry(): void {
  clearProactiveTimer();
  recordedExpiresAtMs = null;
  recordedRefreshExpiresAtMs = null;
  renewalActive = false;
  renewalBaseUrl = undefined;
  renewalFetchFn = undefined;
  removeVisibilityListener();
}

export function getRecordedSessionExpiry(): {
  expiresAtMs: number | null;
  refreshExpiresAtMs: number | null;
} {
  return {
    expiresAtMs: recordedExpiresAtMs,
    refreshExpiresAtMs: recordedRefreshExpiresAtMs,
  };
}

export function resetSessionTransportForTests(): void {
  clearSessionExpiry();
  refreshInFlight = null;
  refreshGeneration = 0;
  lastSuccessGeneration = 0;
  lastKnownBaseUrl = "";
}

export async function refreshBffSession(options?: {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  reportOnFailure?: boolean;
}): Promise<boolean> {
  return (await refreshBffSessionOutcome(options)) === "refreshed";
}

/** Like `refreshBffSession`, but distinguishes a confirmed 401/403 rejection
 *  from a transient failure (404 / 5xx / network error). */
export async function refreshBffSessionOutcome(options?: {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  reportOnFailure?: boolean;
}): Promise<BffRefreshOutcome> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const fetcher = options?.fetchFn ?? renewalFetchFn ?? globalThis.fetch;
  const baseUrl = resolveBaseUrl(options?.baseUrl ?? renewalBaseUrl);
  const refreshUrl = `${baseUrl}${paths.authRefresh()}`;
  const shouldReportOnFailure = options?.reportOnFailure ?? true;

  refreshGeneration += 1;
  const currentGen = refreshGeneration;

  const task = (async (): Promise<BffRefreshOutcome> => {
    if (typeof fetcher !== "function") {
      return "transient";
    }

    try {
      const res = await fetcher(refreshUrl, {
        method: "POST",
        credentials: "include",
        headers: buildHeaders({ method: "POST" }),
        body: JSON.stringify({}),
      });

      if (!res || !res.ok) {
        const status = res?.status;
        const isAuthFailure = status === 401 || status === 403;
        if (shouldReportOnFailure && isAuthFailure) {
          clearSessionExpiry();
          reportBffUnauthorized({ confirmed: true });
        }
        return isAuthFailure ? "auth_rejected" : "transient";
      }

      lastSuccessGeneration = currentGen;
      renewalActive = true;
      ensureVisibilityListener();
      try {
        const clone = typeof res.clone === "function" ? res.clone() : null;
        if (clone && typeof clone.text === "function") {
          const text = await clone.text();
          if (text) {
            recordSessionExpiryFromPayload(JSON.parse(text), {
              baseUrl,
              fetchFn: options?.fetchFn,
            });
          }
        }
      } catch {
        // Ignore non-JSON or consumed bodies on mock responses.
      }
      notifySessionRefreshed();
      return "refreshed";
    } catch {
      // Network error or timeout: transient, never a session expiry.
      return "transient";
    } finally {
      refreshInFlight = null;
    }
  })();

  refreshInFlight = task;
  return task;
}

function inspectExpiryResponse(
  res: Response,
  options?: { baseUrl?: string; fetchFn?: typeof fetch },
): void {
  if (!res || !res.ok || typeof res.clone !== "function") return;
  try {
    const clone = res.clone();
    if (typeof clone.text === "function") {
      void clone
        .text()
        .then((text) => {
          if (!text) return;
          recordSessionExpiryFromPayload(JSON.parse(text), options);
        })
        .catch(() => {
          // Ignore body parse errors on non-JSON responses.
        });
    }
  } catch {
    // Ignore clone errors on synthetic test Response objects.
  }
}

/**
 * Single session-aware HTTP transport for all BFF requests.
 *
 * - Automatically records access/refresh expiry from `/bff/me`, `/bff/auth/dev-login`,
 *   and `/bff/auth/refresh` responses to schedule proactive renewal.
 * - On HTTP 401 (except auth lifecycle endpoints `/bff/auth/refresh`,
 *   `/bff/auth/dev-login`, and `/bff/logout`), performs one single-flight
 *   `POST /bff/auth/refresh` and retries the original request once with the
 *   exact same `RequestInit` (preserving `Idempotency-Key` on writes).
 * - When refresh fails or the retried request still returns 401, triggers the
 *   session-expired flow via `reportBffUnauthorized({ confirmed: true })`.
 */
export async function bffSessionFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { fetchFn?: typeof fetch; baseUrl?: string },
): Promise<Response> {
  const fetcher = options?.fetchFn ?? globalThis.fetch;
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const cleanPath = url.split("?")[0];
  const isRefreshEndpoint = cleanPath.endsWith(paths.authRefresh());
  const isDevLoginEndpoint = cleanPath.endsWith("/bff/auth/dev-login");
  const isLogoutEndpoint = cleanPath.endsWith(paths.logout());
  const isMeEndpoint = cleanPath.endsWith(paths.me());

  const baseUrl = options?.baseUrl ?? extractBaseUrlFromRequestUrl(url);
  const generationAtStart = refreshGeneration;

  const res = await fetcher(input, init);
  if (!res) {
    return res;
  }

  if (res.ok && (isMeEndpoint || isRefreshEndpoint || isDevLoginEndpoint)) {
    inspectExpiryResponse(res, { baseUrl, fetchFn: options?.fetchFn });
    return res;
  }

  const isMockModeWriteGateProbe =
    isMeEndpoint &&
    !renewalActive &&
    liveStatus.get().mode !== "live" &&
    readBffEnv().VITE_BFF_MODE !== "live" &&
    readBffEnv().VITE_BFF_REAL_WRITES === "true";

  if (
    res.status !== 401 ||
    isRefreshEndpoint ||
    isDevLoginEndpoint ||
    isLogoutEndpoint ||
    isMockModeWriteGateProbe
  ) {
    return res;
  }

  let refreshed = false;
  if (!refreshInFlight && refreshGeneration > generationAtStart) {
    // Another concurrent request already completed a refresh while this request was in flight.
    refreshed = lastSuccessGeneration > generationAtStart;
  } else {
    refreshed = await refreshBffSession({
      baseUrl,
      fetchFn: options?.fetchFn,
      reportOnFailure: true,
    });
  }

  if (!refreshed) {
    return res;
  }

  const retryRes = await fetcher(input, init);
  if (!retryRes) {
    clearSessionExpiry();
    reportBffUnauthorized({ confirmed: true });
    return res;
  }

  if (retryRes.status === 401) {
    clearSessionExpiry();
    reportBffUnauthorized({ confirmed: true });
    return retryRes;
  }

  if (retryRes.ok && isMeEndpoint) {
    inspectExpiryResponse(retryRes, { baseUrl, fetchFn: options?.fetchFn });
  }

  return retryRes;
}
