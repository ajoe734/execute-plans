// Batch VII — Mock-mode seed accessors for the v1 BFF surface.
//
// Until the v1 typed client (lists/writes/sse) covers every entity, UI code
// reads/writes through these stable names exposed under `@/lib/bff-v1`:
//
//   - `bff`            — mock seed accessor (read + mutate seed objects)
//   - `runActionSafe`  — toast-aware wrapper around `tryRunAction`
//   - `useLiveList`    — realtime list hook (returns `rows`)
//   - `useRealtimeStatus` — connection status store
//
// These NAMES are canonical for v0/mock mode. When the typed v1 surface
// gains coverage for a given entity, swap the call site to `bffV1.*` /
// `useLiveListV1` / `tryRunAction` directly.

export { bff, type BffClient } from "./seed";
export { runActionSafe, type RunActionSafeOpts } from "./runActionSafe";
export { useLiveList, useRealtimeStatus } from "./useLiveList";

// ---- Deprecated `legacy*` aliases (kept one release for incremental migrations) ----
/** @deprecated Use `bff` from `@/lib/bff-v1`. */
export { bff as legacyBff } from "./seed";
/** @deprecated Use `runActionSafe` from `@/lib/bff-v1`. */
export { runActionSafe as legacyRunActionSafe } from "./runActionSafe";
/** @deprecated Use `useLiveList` from `@/lib/bff-v1`. */
export { useLiveList as legacyUseLiveList } from "./useLiveList";
