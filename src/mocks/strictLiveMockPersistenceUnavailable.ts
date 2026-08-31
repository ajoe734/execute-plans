// Strict-live mock persistence stub — fails closed in production bundle.

export class StrictLiveMockPersistenceError extends Error {
  readonly code = "MOCK_PERSISTENCE_UNAVAILABLE";

  constructor(message = "Mock persistence is unavailable in a strict-live build.") {
    super(message);
    this.name = "StrictLiveMockPersistenceError";
  }
}

export function rehydrate(): void {}
export function schedulePersist(): void {}

export function persistNow(): void {
  throw new StrictLiveMockPersistenceError("Mock persistence snapshot is unavailable in a strict-live build.");
}

export function clearPersisted(): void {
  throw new StrictLiveMockPersistenceError("Mock persistence reset is unavailable in a strict-live build.");
}
