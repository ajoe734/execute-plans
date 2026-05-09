// BFF Contract v1 — v5 closed-loop OS namespace re-export.
//
// Batch VII-c (2026-05-09): provides a single `@/lib/bff-v1` entrypoint for
// v5 surface pages. The implementation lives in `src/lib/bff/v5.ts` and is
// FROZEN; this file exists only to consolidate the import path.
//
// Usage:
//   import { v5 } from "@/lib/bff-v1";
//   const summary = await v5.controlRoom.get();
//
// `bff.v5` (via `seed.ts`) remains available for backwards compatibility
// during call-site migration.

export { bffV5 as v5, type BffV5 } from "@/lib/bff/v5";
