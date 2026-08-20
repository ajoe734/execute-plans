# PFG-FE-HONEST-LIVE-20260820 — production caller inventory

Acceptance requires evidence that inventories production callers across
`src/lib/bff` and `src/lib/bff-v1`, and records the consolidation target
without a broad rewrite. This is that inventory.

## 1. `runActionSafe` production call sites (18)

`grep -rn "runActionSafe(" src --include="*.tsx" --include="*.ts" | grep -v
"\.test\." | grep -v __tests__ | grep -v lib/bff-v1/writes.ts | grep -v
lib/bff-v1/runActionSafe.ts` — 18 call sites across 12 detail/list pages:

- `src/management/components/detail/StrategyParamsEditor.tsx`
- `src/management/pages/RebalanceDetail.tsx` (×2)
- `src/management/pages/Runtimes.tsx` (×2)
- `src/management/pages/ArtifactDetail.tsx`
- `src/management/pages/StrategyDetail.tsx`
- `src/management/pages/RankingFormulaDetail.tsx`
- `src/management/pages/DeploymentDetail.tsx` (×4)
- `src/management/pages/ResearchDetail.tsx`
- `src/management/pages/CapitalPoolDetail.tsx`
- `src/management/pages/Operations.tsx` (×2)
- `src/management/pages/EvolutionDetail.tsx` (×2)

Every call site routes through the single `runActionSafe` →
`tryRunAction`/`runAction` seam in `src/lib/bff-v1/{runActionSafe,writes}.ts`.
No call site duplicates the write/mock-fallback decision locally, so the
strict-live fix in `writes.ts` (see below) closes the gap for all 18 sites
without touching any of them individually.

## 2. `safeAdapt(..., seedFn)` read call sites (24)

All 24 are private to `src/lib/bff-v1/management.ts`'s `mgmt` façade
(cockpit, trading-pulse rankings/overview, persona-league, quarterly-ranking,
performance-attribution, portfolio-book summary/pools/holdings, readiness
ep5/broker/capital-binding/bff-ha/strict-publish, persona-intent, evidence
overview/detail). They are not duplicated elsewhere — every management page
reads through the `mgmt` façade rather than calling `withLiveOrMock` +
`safeAdapt` directly. Fixing `safeAdapt` once (see below) closes the gap for
all 24 sites without a page-by-page rewrite.

## 3. `src/lib/bff` (legacy) vs `src/lib/bff-v1` (current) surface

- `src/lib/bff-v1`: 54 non-test files, ~20.7k lines — the canonical BFF
  Contract v1 seam (`client.ts`, `writes.ts`, `liveTransport.ts`,
  `management.ts`, `lists.ts`, `me.ts`, `sse/*`, `agora/*`, ...).
- `src/lib/bff` (legacy): 14 files, ~5.3k lines. `bff-v1` imports from it
  selectively:
  - `mutations.ts` — the mock mutation engine. This **is** the "explicit
    demo/test fixture" the code disposition says to retain
    (`mutations.runAction` backs every `mockBranch()` in `writes.ts`). It is
    correctly scoped: only reached when `VITE_BFF_MODE=mock` or the
    dev-default `auto` fallback degrades, never in strict-live per this
    task's fix.
  - `commandClient.ts` — the real live-command POST builder/adapter
    (`buildRunActionCommand`, `adaptRunActionCommandResponse`); this is
    production live-path code, not a fixture.
  - `types.ts` — pure type re-exports (`Alert`, `Incident`, `Runtime`,
    `Persona`, `CapitalPool`, ...), used widely across `management/`,
    `platform/`, and `lib/v5/` for typing only.
  - `liveRead.ts` — `withStrictLiveOrMock` / `strictNotFoundAsUndefined`,
    the strict-live-no-seed helper already used by `management.ts` for
    Human Inbox and the `*LiveOnly` readers.
  - `realtime.ts`, `v5.ts`, `agora.ts`, `writeOverlay.ts` — re-exported
    through thin `bff-v1` wrappers (`seed.ts`, `v5.ts`, `useLiveList*.ts`,
    `writeFallback.ts`, `sse/liveSse.ts`) for backward-compatible call
    sites that still import the `bff-v1` names.

**Consolidation target (not executed by this task — out of scope per
`out_of_scope: ["new UI pages", "security redesign", ...]` and the "without
a broad rewrite" acceptance bound):** fold `mutations.ts` and
`commandClient.ts` into `bff-v1` directly (they are already `bff-v1`-only
dependencies with no other legacy consumer), and retire the remaining
`lib/bff` re-export files by having each `bff-v1` wrapper own its
implementation instead of importing it. `types.ts` can move last since it
has the widest fan-out (100+ non-test importers, all type-only). No file in
`src/lib/bff` is dead code today; the split is a historical layering
artifact, not unreachable legacy.

## 4. What this task actually changed (scoped, not a rewrite)

Two single-function fixes close every gap listed above:

1. `src/lib/bff-v1/writes.ts` — `runAction` / `requestConfirmToken` now
   refuse the mock-completed branch (`refuseStrictLiveWrite`) when
   `isStrictLiveFallback()` is true (VITE_BFF_MODE=live +
   VITE_BFF_FALLBACK=strict, the hosted/production profile) and
   `liveWriteGated()` is false. `runActionSafe` is unchanged — it already
   surfaces any non-`ok` result as `toast.error`, never `toast.success`.
2. `src/lib/bff-v1/management.ts` — `safeAdapt` now rethrows instead of
   swallowing to `seedFn()` when `isStrictLiveFallback()` is true, so an
   HTTP-200-but-contract-mismatch response surfaces as the typed
   unavailable/degraded error `withLiveOrMock`'s strict branch already
   produces, instead of masquerading as real data.

Both checks share one new helper,
`isStrictLiveFallback()` in `src/lib/bff-v1/liveTransport.ts`, so the
strict/demo boundary is defined in exactly one place.
