// BFF Contract v1 — Live mode runtime status & fallback bus.
//
// Single source of truth for "are we currently talking to a real BFF?"
//   - mode:        configured mode (`mock` | `live`) per VITE_BFF_MODE
//   - effective:   what we are actually using right now. When `mode==='live'`
//                  but a transport call has failed, we fall back to mock and
//                  flip `effective` → `mock` until the next manual retry or
//                  successful health probe.
//   - lastError:   short error label for UI banner.
//
// Subscriptions are React-friendly via `useSyncExternalStore`.

import { useSyncExternalStore } from "react";

import type { BffMode } from "./client";

export interface LiveStatus {
  mode: BffMode;
  effective: BffMode;
  baseUrl: string;
  lastError?: string;
  lastErrorAt?: number;
  fellBackAt?: number;
  /** H1+ — last server-reported X-BFF-Api-Version (when seen). */
  serverApiVersion?: string;
  /** H1+ — true when serverApiVersion mismatches client BFF_API_VERSION. */
  apiVersionMismatch?: boolean;
}

function readEnv(): { mode: BffMode; baseUrl: string } {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
    const mode: BffMode = env.VITE_BFF_MODE === "live" ? "live" : "mock";
    return { mode, baseUrl: env.VITE_BFF_BASE_URL ?? "" };
  } catch {
    return { mode: "mock", baseUrl: "" };
  }
}

const initial = readEnv();
let state: LiveStatus = {
  mode: initial.mode,
  effective: initial.mode,
  baseUrl: initial.baseUrl,
};

const listeners = new Set<() => void>();
function notify() { for (const l of listeners) l(); }

export const liveStatus = {
  get(): LiveStatus { return state; },
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  },
  /** Mark a live-mode transport failure → fallback to mock. */
  reportFallback(reason: string): void {
    if (state.mode !== "live") return;
    if (state.effective === "mock" && state.lastError === reason) return;
    state = { ...state, effective: "mock", lastError: reason, lastErrorAt: Date.now(), fellBackAt: Date.now() };
    notify();
  },
  /** Manual retry — reset effective back to configured mode. */
  retry(): void {
    if (state.mode !== "live") return;
    state = { ...state, effective: "live", lastError: undefined, lastErrorAt: undefined, fellBackAt: undefined };
    notify();
  },
  /** Live request succeeded → clear any prior fallback. */
  reportSuccess(): void {
    if (state.mode !== "live") return;
    if (state.effective === "live" && !state.lastError) return;
    state = { ...state, effective: "live", lastError: undefined, lastErrorAt: undefined, fellBackAt: undefined };
    notify();
  },
  /** H1+ — record server-advertised api version for mismatch detection. */
  reportApiVersion(serverVersion: string | undefined, clientVersion: string): void {
    if (!serverVersion) return;
    const mismatch = serverVersion !== clientVersion;
    if (state.serverApiVersion === serverVersion && state.apiVersionMismatch === mismatch) return;
    if (mismatch && state.apiVersionMismatch !== true) {
      // Only warn on the rising edge to avoid console spam.
      // eslint-disable-next-line no-console
      console.warn(
        `[bff-v1] X-BFF-Api-Version mismatch: server=${serverVersion} client=${clientVersion}`,
      );
    }
    state = { ...state, serverApiVersion: serverVersion, apiVersionMismatch: mismatch };
    notify();
  },
  /** Test-only reset. */
  _reset(next?: Partial<LiveStatus>): void {
    const env = readEnv();
    state = { mode: env.mode, effective: env.mode, baseUrl: env.baseUrl, ...next };
    notify();
  },
};

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(liveStatus.subscribe, liveStatus.get, liveStatus.get);
}

/** Convenience: should this call attempt live transport right now? */
export function shouldUseLive(): boolean {
  return state.effective === "live";
}
