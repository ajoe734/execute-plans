// Batch VII — Mock-mode seed accessors for the v1 BFF surface.
//
// `@/lib/bff-v1` re-exports the canonical mock-mode names directly. UI code
// imports them from the package root:
//
//   - `bff`               — mock seed accessor (read + mutate seed objects)
//   - `runActionSafe`     — toast-aware wrapper around `tryRunAction`
//   - `useLiveList`       — realtime list hook (returns `rows`)
//   - `useRealtimeStatus` — connection status store
//
// When the typed v1 surface gains coverage for a given entity, swap the call
// site to `bffV1.*` / `useLiveListV1` / `tryRunAction` directly.
//
// The deprecated `legacy*` aliases (B1h transitional) have been removed —
// this file is kept only as the documented integration point and to retain a
// stable barrel for future mock/live mode swaps.

export { bff, type BffClient } from "./seed";
export { runActionSafe, type RunActionSafeOpts } from "./runActionSafe";
export { useLiveList, useRealtimeStatus } from "./useLiveList";
