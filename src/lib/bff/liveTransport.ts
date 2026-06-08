// BFF live transport status snapshot — combines configured management mode
// with the runtime liveStatus bus to produce a unified transport descriptor.
//
// Transport mode semantics:
//   "real"          — VITE_BFF_MODE=live + VITE_BFF_FALLBACK=strict, currently live.
//                     All reads come from the real BFF; mock seeds are never served.
//   "real-error"    — strict live transport failed; callers should surface typed errors,
//                     not seed data.
//   "hybrid"        — VITE_BFF_MODE=live + auto fallback, currently live.
//                     Reads come from the real BFF but may fall back to seed on
//                     transport failure.
//   "mock-fallback" — Configured hybrid live but currently serving seed because a
//                     transport failure triggered the fallback.
//   "mock"          — VITE_BFF_MODE=mock or test mode; seed is the only source.
//
// `getLiveStatusSnapshot()` is the synchronous read for non-reactive callers.
// `useLiveStatusSnapshot()` is the React hook that reacts to liveStatus bus changes.

import { useSyncExternalStore } from "react";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { detectManagementMode, type ManagementMode } from "@/lib/bff/client";

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
