// Strict-live mock adapters stub — fails closed in production bundle.
export function bootstrapMockAdapters(): void {
  throw new Error("Mock adapters are unavailable in a strict-live build.");
}
