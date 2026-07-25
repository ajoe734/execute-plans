// BFF Contract v1 — Live transport with mock fallback.
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

import { bffFetch, type BffRequest } from "./client";
import { BffError, makeBffError } from "./errors";
import { liveStatus, shouldUseLive } from "./liveStatus";
import { readBffEnv } from "./runtimeEnv";

export type FallbackMode = "auto" | "strict";

const truthy = (value: unknown): boolean =>
  ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());

function detectFallbackMode(): FallbackMode {
  try {
    const env = readBffEnv();
    return env?.VITE_BFF_FALLBACK === "strict" ? "strict" : "auto";
  } catch {
    return "auto";
  }
}

export function realWritesEnabled(): boolean {
  try {
    const env = readBffEnv();
    return truthy(env?.VITE_BFF_REAL_WRITES);
  } catch {
    return false;
  }
}

export async function withLiveOrMock<T, TLive = T>(
  req: BffRequest,
  mockFn: () => Promise<T>,
  adaptLive?: (data: TLive) => T,
): Promise<T> {
  if (!shouldUseLive()) {
    // liveStatus is flagged offline (a prior live read fell back). In strict + live mode we must
    // NOT mask that with mock seed — re-attempt live so the real result (or a typed error)
    // surfaces, and so the surface self-heals once the BFF recovers. Only a genuinely configured
    // mock mode (VITE_BFF_MODE=mock) short-circuits to mock here.
    const strictLive = liveStatus.get().mode === "live" && detectFallbackMode() === "strict";
    if (!strictLive) return mockFn();
  }
  try {
    const data = await bffFetch<TLive>({ ...req, mode: "live" });
    liveStatus.reportSuccess();
    return adaptLive ? adaptLive(data) : data as unknown as T;
  } catch (err) {
    if (err instanceof BffError && err.status < 500 && err.status !== 0) {
      // Real backend reply — caller should handle it.
      throw err;
    }
    const reason = err instanceof Error ? err.message : "live transport failed";
    if (detectFallbackMode() === "strict") {
      // Strict mode: surface transport failure as a typed BffError; do NOT mask with mock data.
      liveStatus.reportFallback(`strict: ${reason}`);
      if (err instanceof BffError) throw err;
      throw makeBffError({
        code: "UNKNOWN_ERROR",
        message: `live transport failed (strict mode): ${reason}`,
      });
    }
    liveStatus.reportFallback(reason);
    return mockFn();
  }
}

export interface BffHealthResponse {
  status: string;
  service?: string;
  version?: string;
}

export function probeLiveHealth(): Promise<BffHealthResponse> {
  return withLiveOrMock<BffHealthResponse, unknown>(
    { method: "GET", path: "/health" },
    async () => ({ status: "mock", service: "execute-plans-mock-bff" }),
    (data) => {
      const record = data as Partial<BffHealthResponse> | undefined;
      return {
        status: String(record?.status ?? "ok"),
        service: record?.service,
        version: record?.version,
      };
    },
  );
}
