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

export type FallbackMode = "auto" | "strict";

function detectFallbackMode(): FallbackMode {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.VITE_BFF_FALLBACK === "strict" ? "strict" : "auto";
  } catch {
    return "auto";
  }
}

export async function withLiveOrMock<T>(
  req: BffRequest,
  mockFn: () => Promise<T>,
): Promise<T> {
  if (!shouldUseLive()) return mockFn();
  try {
    const data = await bffFetch<T>({ ...req, mode: "live" });
    liveStatus.reportSuccess();
    return data;
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
