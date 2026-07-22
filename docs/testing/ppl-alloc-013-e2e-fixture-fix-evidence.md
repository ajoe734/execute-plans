# PPL-ALLOC-013 E2E Persona-Fleet Linked-Page Fixture Fix Evidence

Date: 2026-07-13
Head commit: `f2e02f7`
Branch: `task/PPL-ALLOC-013`

## Scope

- `e2e/25-persona-fleet-live-linked-pages.spec.ts` previously asserted the
  hardcoded `Crypto-Alt-Hunter` persona name in the quarterly ranking table,
  causing hosted smoke false-reds whenever the run's dynamically created
  persona used a different name.
- Commits `d72be60` / `32a02c4` on this branch replaced the hardcoded
  expectation with the dynamic `personaName` read from the live fleet row.
- `origin/dev` independently rewrote the same file (`AG-UIPOL-004: anchor
  deterministic live gate`) with a hardened retry/focused-read helper that
  already carries the same dynamic-`personaName` fix.
- This branch's earlier merge (`e1c6329`) resolved that conflict by keeping
  this branch's older, simpler version, which silently reverted dev's
  hardened rewrite. Re-merged `origin/dev` at `f2e02f7` and this time took
  dev's version of `e2e/25-persona-fleet-live-linked-pages.spec.ts` in full,
  while keeping this branch's own stabilization additions to
  `e2e/helpers/auth.ts` (EventSource cleanup so JSDOM/SSE quiet mode does not
  leak into live auth bootstrap) and `playwright.config.ts` (`retries: 3`,
  `--no-sandbox`/`--disable-gpu` launch args).

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean, no errors, after the merge.
- No hardcoded persona name expectations remain:
  `grep -n "Crypto-Alt-Hunter" e2e/25-persona-fleet-live-linked-pages.spec.ts`
  returns no matches.
- Full hosted Playwright run against a live BFF was not exercised in this
  session; the merge only reconciles branch history so the already-verified
  dynamic-name fix (validated in commit `32a02c4`'s
  `npx playwright test e2e/25-persona-fleet-live-linked-pages.spec.ts` run)
  survives cleanly on top of dev's newer implementation.
