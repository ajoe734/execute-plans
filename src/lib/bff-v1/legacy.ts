// Batch VII — Mock-mode seed accessors for the v1 BFF surface.
//
// Until the v1 typed client (lists/writes/sse) covers every entity, UI code
// reads/writes through these stable names exposed under `@/lib/bff-v1`:
//
//   - `bff`            — mock seed accessor (read + mutate seed objects)
//   - `runActionSafe`  — toast-aware wrapper around `tryRunAction`
//   - `useLiveList`    — legacy realtime list hook (returns `rows`)
//   - `useRealtimeStatus` — connection status store
//
// These NAMES are canonical for v0/mock mode. When the typed v1 surface
// gains coverage for a given entity, swap the call site to `bffV1.*` /
// `useLiveListV1` / `tryRunAction` directly. Until then, importing from
// `@/lib/bff-v1` is the supported boundary.
//
// Tracked migration plan: `.lovable/audits/batch-vii-migration.md`.

export { bff } from "./_legacy/client";
export { runActionSafe } from "./_legacy/runAction";
export { useLiveList, useRealtimeStatus } from "./_legacy/useLiveList";

// ---- Deprecated `legacy*` aliases (kept one release for incremental migrations) ----
/** @deprecated Use `bff` from `@/lib/bff-v1`. */
export { bff as legacyBff } from "./_legacy/client";
/** @deprecated Use `runActionSafe` from `@/lib/bff-v1`. */
export { runActionSafe as legacyRunActionSafe } from "./_legacy/runAction";
/** @deprecated Use `useLiveList` from `@/lib/bff-v1`. */
export { useLiveList as legacyUseLiveList } from "./_legacy/useLiveList";
