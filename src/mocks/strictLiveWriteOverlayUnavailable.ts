// Strict-live writeOverlay stub — fails closed if invoked in production bundle.
export const WRITE_OVERLAY_TTL_MS = 0;
export const WRITE_OVERLAY_GC_INTERVAL_MS = 0;

export const writeOverlay = new Proxy({}, {
  get: () => {
    throw new Error("writeOverlay is unavailable in a strict-live build.");
  },
}) as unknown as Record<string, unknown>;

export function withOverlay<T>(_entity: unknown, loader: () => Promise<T[]>): () => Promise<T[]> {
  return loader;
}
