# EVOCHAIN-008 — round-3 verification evidence

PR: `ajoe734/execute-plans#298` ("EVOCHAIN-008: distinguish live-degraded
from snapshot badge"), commit `c9e6e0b` (round-3 fixes for round-2
re-review GitHub review `PRR_kwDOSVbR4s8AAAABF2cE0A`).

## Fixes verified

1. `LIVE_SURFACE_SOURCES` now includes `service_store` and
   `bff_cheap_count` alongside `bff_composed`/`service_client`, matching
   the real production shell-summary contract
   (`services/control-plane/bff/test_mgmt_load_002_shell_summary.py` in
   the `pantheon` repo).
2. `TopBar.tsx`'s shell-summary effect always resolves through
   `classifyShellSummarySurfaces()`, even when the primary
   `shell_summary` surface reports `status: "ok"` — removing the
   call-site bypass that let an inconsistent primary surface
   (`status: ok, source: local_snapshot`) render live.
3. The degraded full-list fallback (`hydrateFromFullLists`, non-live
   branch) now always names `shell_summary` in the degraded-surfaces
   tooltip, since it is what triggered that fallback path.

## Commands run (this checkout)

```sh
npx vitest run src/platform/components/TopBar.test.tsx      # 14 passed
npx vitest run src/lib/bff-v1/__tests__/shellSummary.test.ts # 4 passed
npx eslint src/platform/components/TopBar.tsx src/platform/components/TopBar.test.tsx  # clean
npx tsc --noEmit -p tsconfig.app.json  # no TopBar-related errors; pre-existing
                                         # repo-wide errors unrelated (consistent
                                         # with prior reviewer notes)
```

See `docs/bff/execution-tasks/2026-07-13-evolution-journal-producer-gap/EVOCHAIN-008-fe-badge-semantics.md`
in the `pantheon` repo for the full evidence record and the
EVOCHAIN-008 / EVOCHAIN-011 acceptance-dependency resolution.
