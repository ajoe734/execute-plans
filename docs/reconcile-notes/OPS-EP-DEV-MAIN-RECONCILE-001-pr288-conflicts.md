# PR #288 post-open conflict resolution (OPS-EP-DEV-MAIN-RECONCILE-001)

`dev` advanced past PR #288's base after the PR opened:
`AG-UIPOL-004` (`f224267`) landed a live completeness-snapshot display
feature that touched the same two files the original `main`→`dev`
reconcile had already resolved:

- `src/agora/pages/strategy-workshop/StrategyWorkshopPage.tsx`
- `src/agora/pages/strategy-workshop/StrategyWorkshopPage.test.tsx`

## Resolution

`src/lib/bff-v1/agora/workshops.ts` merged cleanly and is the source of
truth for the exported type names: `WorkshopReadinessAssessment` and
`WorkshopCompleteness` (a `StrategyCompleteness | WorkshopCompletenessSnapshot`
union). AG-UIPOL-004's diff, taken from a pre-reconcile `dev` state, referenced
an older `StrategyReadinessAssessment` name that no longer exists post-merge.
The two page files were reconciled to import the names `workshops.ts` actually
exports, while keeping every behavioral addition from AG-UIPOL-004
(`completenessCard`, `displayCompleteness`, `materializeWorkshopCompleteness`,
the extra `refreshCards()` calls on SSE events) — those hunks auto-merged
without conflict.

Verified after resolution: `vitest` on the touched files plus
`StrategyCompletenessRail`/`workshops` (42/42), full `npm run test`
(1326/1328 — the 2 failures, `IncidentDetail.tradeJourneys.test.tsx` and
`useV5Live.test.tsx`, are pre-existing flakes unrelated to this diff and
pass in isolation), `npm run build`, and `eslint` on the changed files.

## Known separate gate failure (not in this diff's scope)

`integration-gate`'s `test:contract` step independently fails with:

```
[contract-drift] Pantheon Agora bundle is not reproducible:
specs/agora/trading_room_workspace.schema.json: expected c810e4aa..., actual ce36f515...
```

This is a `pantheon` `dev`-side bug: `AG-UIPOL-003` (pantheon commits
`a7418a820`/`0c678af12`) edited
`services/control-plane/specs/agora/trading_room_workspace.schema.json`
without regenerating `services/control-plane/specs/agora/bundle_index.v1_5.json`
(last touched by `AG-XR-DYNUI-001`, `a2b2932c5`), so the bundle's recorded
hash no longer matches the live schema file. The gate's own aggregate
summary tags this and the downstream Playwright fallout as `owner: Codex`.
Not addressed here; tracked separately from the `main`→`dev` reconcile.
