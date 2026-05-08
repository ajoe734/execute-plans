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
import { BffError } from "./errors";
import { liveStatus, shouldUseLive } from "./liveStatus";

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
    liveStatus.reportFallback(reason);
    return mockFn();
  }
}
