import { bffFetch, type BffRequest } from "@/lib/bff-v1/client";
import { BffError, makeBffError } from "@/lib/bff-v1/errors";
import { liveStatus } from "@/lib/bff-v1/liveStatus";

/**
 * Strict live read adapter for surfaces that must not silently fall back to
 * seeded mock data when the app is configured for live BFF mode.
 */
export async function withStrictLiveOrMock<T, TLive = unknown>(
  req: BffRequest,
  mockFn: () => Promise<T>,
  adaptLive: (data: TLive) => T,
): Promise<T> {
  if (liveStatus.get().mode !== "live") return mockFn();
  try {
    const data = await bffFetch<TLive>({ ...req, mode: "live" });
    liveStatus.reportSuccess();
    return adaptLive(data);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "live transport failed";
    liveStatus.reportFallback(`strict: ${reason}`);
    if (err instanceof BffError) throw err;
    throw makeBffError({
      code: "UNKNOWN_ERROR",
      message: `live transport failed (strict mode): ${reason}`,
    });
  }
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
