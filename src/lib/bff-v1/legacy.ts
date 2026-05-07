// Batch VII — Centralized escape hatch for legacy `src/lib/bff/` consumers.
//
// New code MUST import from `@/lib/bff-v1` (typed v1 client). Existing call
// sites that still need the mock seed accessors (`bff.strategies.list()`,
// `bff.runtimes.list()`, etc.) should import from this module instead of
// reaching into `@/lib/bff/client` directly. This makes the migration
// boundary visible in code review and ESLint reports.
//
// Tracked migration plan: `.lovable/audits/batch-vii-migration.md`.

/** @deprecated Use `bffV1.*` typed client. Read-only seed accessors still allowed via this re-export until Batch VII lands. */
export { bff as legacyBff } from "@/lib/bff/client";

/** @deprecated Use `tryRunAction` / `runActionV1` from `@/lib/bff-v1`. */
export { runActionSafe as legacyRunActionSafe } from "@/lib/bff/runAction";

/** @deprecated Use `bffV1.lists.useLiveList` (cursor + ListClass aware). */
export { useLiveList as legacyUseLiveList } from "@/lib/useLiveList";
