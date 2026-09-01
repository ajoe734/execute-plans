// BFF Contract v1 — Live transport with mock fallback & transport status snapshot.
//
// `withLiveOrMock(req, mockFn)`:
//   - If effective mode is `live`: call `bffFetch` against the real BFF.
//       * On network/5xx/transport failure → report fallback, run `mockFn()`.
//       * On 2xx → reportSuccess(), return live data.
//       * On typed BffError (4xx/428/409) → propagate; this is a real backend
//         response, NOT a transport failure.
//   - If effective mode is `mock`: directly run `mockFn()`.
//
// Used by lists.ts / writes.ts / me.ts to keep the surface unchanged while
// adding genuine live wiring.

import { useSyncExternalStore } from "react";
import { bffFetch, type BffRequest } from "./client";
import { BffError, makeBffError } from "./errors";
import { liveStatus, shouldUseLive } from "./liveStatus";
import { readBffEnv } from "./runtimeEnv";

export type FallbackMode = "auto" | "strict";

const truthy = (value: unknown): boolean =>
  ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());

export function detectFallbackMode(): FallbackMode {
  try {
    const env = readBffEnv();
    return env?.VITE_BFF_FALLBACK === "strict" ? "strict" : "auto";
  } catch {
    return "auto";
  }
}

// ---------- Mode helpers ----------

export type ManagementMode = "mock" | "hybrid" | "real";

/** Detect the management read mode from env.
 *  - `mock`  : configured mode is mock (default; also used by tests).
 *  - `real`  : configured mode is live AND VITE_BFF_FALLBACK=strict.
 *  - `hybrid`: configured mode is live with default `auto` fallback. */
export function detectManagementMode(): ManagementMode {
  const env = readBffEnv();
  if (env.MODE === "test" || env.NODE_ENV === "test") return "mock";
  if (env.VITE_BFF_MODE !== "live") return "mock";
  return env.VITE_BFF_FALLBACK === "strict" ? "real" : "hybrid";
}

/** True if the runtime is currently allowed to silently mock on transport failure.
 *  In `real` mode this returns false (the transport will throw instead). */
export function isHybridFallbackEnabled(): boolean {
  return detectManagementMode() === "hybrid";
}

/** True if the runtime configuration forbids silent mock fallback.
 *  Use this from UI banners to label the "live, no-fallback" mode. */
export function isStrictRealMode(): boolean {
  return detectManagementMode() === "real";
}

/**
 * True only for the hosted/production posture (`VITE_BFF_MODE=live` +
 * `VITE_BFF_FALLBACK=strict`, e.g. `.env.staging-live`, the integration
 * gate). Explicit demo/test profiles (`VITE_BFF_MODE=mock`) and the
 * dev-default `auto` fallback are unaffected — they may still use seed
 * fixtures. Strict-live callers use this to refuse a seed/mock substitute
 * for a real response and surface a typed unavailable/degraded error
 * instead (PFG-FE-HONEST-LIVE-20260820).
 */
export function isStrictLiveFallback(): boolean {
  return liveStatus.get().mode === "live" && detectFallbackMode() === "strict";
}

export function realWritesEnabled(): boolean {
  try {
    const env = readBffEnv();
    return truthy(env?.VITE_BFF_REAL_WRITES);
  } catch {
    return false;
  }
}

// ---------- Strict Live Read Helpers ----------

export type StrictLiveErrorResult<T> = { handled: true; value: T };
export type StrictLiveErrorHandler<T> = (err: unknown) => StrictLiveErrorResult<T> | undefined;

export function strictNotFoundAsUndefined<T>(err: unknown): StrictLiveErrorResult<T | undefined> | undefined {
  return err instanceof BffError && err.status === 404
    ? { handled: true, value: undefined }
    : undefined;
}

export type BffListBody<T = unknown> = {
  items?: T[];
  data?: T[] | unknown;
  page_info?: { total?: number };
  meta?: unknown;
};

export type BffDetailBody<T = unknown> = {
  data?: T;
  meta?: unknown;
};

export function strictItemsFrom<T = unknown>(body: unknown): T[] {
  const record = body && typeof body === "object" && !Array.isArray(body)
    ? body as BffListBody<T>
    : {};
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.data)) return record.data as T[];
  return [];
}

export function strictDataFrom<T = unknown>(body: unknown): T | undefined {
  const record = body && typeof body === "object" && !Array.isArray(body)
    ? body as BffDetailBody<T>
    : {};
  return record.data;
}

export interface BffHealthResponse {
  status: string;
  service?: string;
  version?: string;
}

export async function probeLiveHealth(): Promise<BffHealthResponse> {
  try {
    const data = await bffFetch<Partial<BffHealthResponse>>({ method: "GET", path: "/health" });
    return {
      status: String(data?.status ?? "ok"),
      service: data?.service,
      version: data?.version,
    };
  } catch {
    return { status: "unavailable", service: "execute-plans" };
  }
}

// ---------- Live Status Snapshot & Hook ----------

export type LiveTransportMode = "real" | "real-error" | "hybrid" | "mock-fallback" | "mock";

export interface LiveStatusSnapshot {
  transportMode: LiveTransportMode;
  /** Configured management mode (env-derived, static per build). */
  configuredMode: ManagementMode;
  /** True only when the current rendered data source is seed/mock. */
  usingSeed: boolean;
  /** True when live mode is healthy and automatic fallback is available but idle. */
  fallbackStandby: boolean;
  /** Deprecated compatibility flag. True only after seed fallback is actually active. */
  seedFallbackArmed: boolean;
  /** True when strict live failed and the UI should show typed-error state. */
  typedError: boolean;
  /** True when live mode fell back to seed due to transport failure. */
  fellBack: boolean;
  fallbackReason?: string;
  fellBackAt?: number;
  apiVersionMismatch?: boolean;
  serverApiVersion?: string;
}

let cachedSnapshot: LiveStatusSnapshot | undefined;
let cachedSnapshotKey = "";

function snapshotKey(snapshot: LiveStatusSnapshot): string {
  return [
    snapshot.transportMode,
    snapshot.configuredMode,
    snapshot.usingSeed,
    snapshot.fallbackStandby,
    snapshot.seedFallbackArmed,
    snapshot.typedError,
    snapshot.fellBack,
    snapshot.fallbackReason ?? "",
    snapshot.fellBackAt ?? "",
    snapshot.apiVersionMismatch ?? "",
    snapshot.serverApiVersion ?? "",
  ].join("\x1f");
}

function cached(next: LiveStatusSnapshot): LiveStatusSnapshot {
  const key = snapshotKey(next);
  if (cachedSnapshot && cachedSnapshotKey === key) return cachedSnapshot;
  cachedSnapshot = next;
  cachedSnapshotKey = key;
  return next;
}

function computeSnapshot(): LiveStatusSnapshot {
  const status = liveStatus.get();
  const configuredMode = detectManagementMode();

  if (configuredMode === "mock") {
    return {
      transportMode: "mock",
      configuredMode,
      usingSeed: true,
      fallbackStandby: false,
      seedFallbackArmed: false,
      typedError: false,
      fellBack: false,
    };
  }

  if (configuredMode === "real" && status.effective === "mock") {
    return {
      transportMode: "real-error",
      configuredMode,
      usingSeed: false,
      fallbackStandby: false,
      seedFallbackArmed: false,
      typedError: true,
      fellBack: false,
      fallbackReason: status.lastError,
      fellBackAt: status.fellBackAt,
      apiVersionMismatch: status.apiVersionMismatch,
      serverApiVersion: status.serverApiVersion,
    };
  }

  if (status.effective === "mock") {
    return {
      transportMode: "mock-fallback",
      configuredMode,
      usingSeed: true,
      fallbackStandby: false,
      seedFallbackArmed: true,
      typedError: false,
      fellBack: true,
      fallbackReason: status.lastError,
      fellBackAt: status.fellBackAt,
      apiVersionMismatch: status.apiVersionMismatch,
      serverApiVersion: status.serverApiVersion,
    };
  }

  if (configuredMode === "real") {
    return {
      transportMode: "real",
      configuredMode,
      usingSeed: false,
      fallbackStandby: false,
      seedFallbackArmed: false,
      typedError: false,
      fellBack: false,
      apiVersionMismatch: status.apiVersionMismatch,
      serverApiVersion: status.serverApiVersion,
    };
  }

  return {
    transportMode: "hybrid",
    configuredMode,
    usingSeed: false,
    fallbackStandby: true,
    seedFallbackArmed: false,
    typedError: false,
    fellBack: false,
    apiVersionMismatch: status.apiVersionMismatch,
    serverApiVersion: status.serverApiVersion,
  };
}

/** Synchronous snapshot of the current BFF transport mode.
 *  For non-reactive reads (e.g. logging, non-component code). */
export function getLiveStatusSnapshot(): LiveStatusSnapshot {
  return cached(computeSnapshot());
}

/** React hook — reactively tracks transport mode changes via the liveStatus bus. */
export function useLiveStatusSnapshot(): LiveStatusSnapshot {
  return useSyncExternalStore(
    liveStatus.subscribe,
    getLiveStatusSnapshot,
    getLiveStatusSnapshot,
  );
}

