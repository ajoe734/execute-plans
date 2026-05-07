# Batch VII — Legacy `src/lib/bff/` Migration Plan

**Status:** B1g landed 2026-05-07 — deprecated files relocated to `src/lib/bff-v1/_legacy/` (single ownership boundary). 92 call sites still use `legacyBff/legacyRunActionSafe/legacyUseLiveList` re-exports; physical deletion deferred until v1 surface covers all seed accessors.
**Goal:** Reduce direct `@/lib/bff/client`, `@/lib/bff/runAction`, `@/lib/useLiveList` imports to zero outside `src/lib/bff-v1/`.

## Deprecation Strategy

1. **Soft layer (this batch — DONE)**
   - `src/lib/bff-v1/legacy.ts` re-exports `bff`, `runActionSafe`, `useLiveList` as `legacy*` symbols.
   - JSDoc `@deprecated` tags on `src/lib/bff/client.ts`, `runAction.ts`, `useLiveList.ts`.
   - This audit file lists every call site to migrate.
   - **No behavioral change.** All 311 tests stay green.

2. **Hard migration (later batches)**
   - Migrate by feature area (Platform → Management detail → Agora → Studios).
   - Each batch must keep the test suite green and resolve any regressions before merging.
   - When the count below reaches 0, delete `legacy.ts` and the deprecated files.

## Call-site inventory (snapshot 2026-05-07, post-B1a)

### Platform shell (7) — ✅ MIGRATED 2026-05-07 (B1a)
- `src/platform/components/TopBar.tsx` → `legacyBff` via `@/lib/bff-v1`
- `src/platform/components/NotificationCenter.tsx` → `legacyBff`
- `src/platform/components/CommandPalette.tsx` → `legacyBff`
- `src/platform/components/JobProgressDrawer.tsx` → `legacyBff`
- `src/platform/components/RightDrawer.tsx` → `legacyBff`
- `src/platform/components/RealtimeStatusBadge.tsx` → `useRealtimeStatus` from `@/lib/bff-v1`
- `src/platform/pages/QAChecklist.tsx` → `useRealtimeStatus` from `@/lib/bff-v1`

### Management detail panels (~35)
- All files under `src/management/components/detail/*.tsx`
- All files under `src/management/components/governance/*.tsx`

### Management pages (~25)
- All files under `src/management/pages/**/*.tsx` that touch `bff.*`

### Agora pages (10)
- All files under `src/agora/pages/*.tsx`

### Studios (6)
- `src/management/pages/studios/*.tsx`

### v5 surface (5)
- `src/management/pages/v5/*.tsx`

### Tests (3) — leave for last; migrate when contract diff is zero
- `src/lib/v4/__tests__/batch-iii.test.ts`
- `src/lib/v4/h1-wiring.test.ts`
- `src/lib/v5/__tests__/bff.test.ts`

## Migration recipe (per file)

```ts
// Before
import { bff } from "@/lib/bff/client";
const rows = await bff.strategies.list();

// After (Phase 1 — typed read)
import { bffV1 } from "@/lib/bff-v1";
const env = await bffV1.lists.list("strategies", { limit: 50 });
const rows = env.items;
```

```ts
// Before
import { runActionSafe } from "@/lib/bff/runAction";

// After
import { tryRunAction } from "@/lib/bff-v1";
const r = await tryRunAction({ kind, id, action }, { confirmToken });
```

```ts
// Before
import { useLiveList } from "@/lib/useLiveList";

// After
import { useLiveListV1 } from "@/lib/bff-v1";
const { rows, pending, refresh } = useLiveListV1("strategies", ["strategy"]);
```

## Lint guidance

Until ESLint rule lands, treat any new import of:
- `@/lib/bff/client`
- `@/lib/bff/runAction`
- `@/lib/useLiveList`

…in code review as a blocker. Use `@/lib/bff-v1` (or `legacy*` re-exports if the v1 surface is genuinely missing the call).

## B1h — legacy-alias collapse (2026-05-07)

All 92 call sites that imported `legacyBff as bff` / `legacyRunActionSafe as runActionSafe`
/ `legacyUseLiveList as useLiveList` from `@/lib/bff-v1` now import the canonical
names directly:

- `bff` → mock seed accessor (still backed by `_legacy/client`)
- `runActionSafe` → toast-aware mutation wrapper (delegates to `tryRunAction`)
- `useLiveList` → realtime list hook (delegates to legacy `realtime` bus)

`legacy*` aliases remain in `legacy.ts` as `@deprecated` re-exports for one
cycle so any in-flight branch keeps compiling. Once the v1 typed surface
covers each entity, swap call sites to `bffV1.*` / `useLiveListV1` /
`tryRunAction`. Tests: 323 green.

## B1i — canonical surface promotion (2026-05-07)

`src/lib/bff-v1/_legacy/` directory removed. Files promoted to canonical
v1 surface:
- `_legacy/client.ts` → `seed.ts` (mock seed accessor; exports `bff`)
- `_legacy/runAction.ts` → `runActionSafe.ts`
- `_legacy/useLiveList.ts` → `useLiveList.ts`

`@deprecated` headers replaced with canonical-surface docs. `legacy.ts`
keeps `legacy*` aliases as @deprecated re-exports for one cycle. No call
site changes required (everything imports from `@/lib/bff-v1`). Tests:
323 green; tsc clean.
