# Sprint A — Integration Test Package Baseline

Date: 2026-05-13
Branch: bff-luv-fe-006-dev-deploy
FE: https://pantheon-dev.lovable.app
BFF: https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io

## Sprint A status

| Step | Result |
|---|---|
| A.1 Copy package + patch package.json | ✅ |
| A.2 npm install @playwright/test, tsx, @axe-core/playwright + chromium | ✅ |
| A.3 Verify import surface (paths/dto/sse/channels, errorCodes) | ✅ all exports present |
| A.4 Integration env matrix (.env.integration.example) | ✅ |
| A.5 Baseline probes | ✅ (1 known gap, see below) |
| A.6 CI workflow activation | ⏳ awaits GitHub push + secret |

## Baseline results

### Contract drift (`npm run test:contract`)
- 4 passed, 1 failed.
- **Gap**: SSE channel `transition` is in `src/lib/bff-v1/sse/channels.ts` (Planner Response §B4 addition) but is NOT present in `.lovable/feedback/2026-05-07-final/Pantheon_BFF_AsyncAPI_SSE.md` or `Pantheon_BFF_Contract_Spec_2026-05-07_Final.md`.
- Owner: backend / contract doc maintainer to either (a) document `transition` channel in AsyncAPI + Final spec, or (b) remove `transition` from the runtime list if it was added speculatively.
- This drift gap must close before Gate 2 can be claimed green.

### Anonymous BFF route probe (`npm run probe:bff:routes`)
- Target: `https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io`
- Counts: 200×5, 401×41
- Canonical 404: **0**
- Transport errors: **0**
- Gate: PASS
- Public 200 endpoints: `/health`, `/healthz`, `/readyz`, `/openapi.json`, `/bff/events/stream`
- All 41 protected canonical routes correctly return 401 (not 404).

### Hosted browser BFF probe (`npm run probe:browser`)
- Hosted FE loaded against intended BFF.
- contains intended BFF URL: **true**
- contains old BFF URL (`pantheon-ai-system-front-dev`): **false**
- request/response count: 9/9
- failed: 0
- console errors: 0
- pass: **true**
- BFF endpoints observed during management page load: `/bff/jobs`, `/health`, `/bff/v5/control-room`, `/bff/v5/execution/persona-health`, `/bff/approvals`, `/bff/alerts`, `/bff/v5/execution/strategy-health`, `/bff/events/stream?lastEventId=...`

## Remaining Sprint A work

- **A.6** Push branch to GitHub, add `PANTHEON_BFF_SMOKE_BEARER_TOKEN` repo secret, run `pantheon-integration-gate` once via `workflow_dispatch`, attach evidence artifact to this baseline directory.
- **Authenticated smoke** (`npm run probe:bff:auth`) intentionally skipped in baseline — requires bearer token. To be run as part of A.6 within CI.

## Files touched

```
.env.integration.example                                       (new)
.github/workflows/pantheon-integration-gate.yml                (new)
.lovable/audits/baseline/sprint-A-baseline-2026-05-13.md       (this file)
.lovable/audits/baseline/bff-route-probe-anonymous-2026-05-13.md
.lovable/audits/baseline/hosted-browser-bff-probe-2026-05-13.md
docs/testing/Integration_Test_Package_README_2026-05-10.md     (new, from package)
docs/testing/Pantheon_FE_BE_Integration_Test_Blueprint_2026-05-10.md
docs/testing/Release_Gate_Checklist_2026-05-10.md
docs/testing/User_Flow_Test_Matrix_2026-05-10.csv
docs/testing/package.integration-scripts.patch.md
e2e/helpers/{bff.ts, env.ts}
e2e/{01..10}-*.spec.ts                                         (10 spec files)
playwright.config.ts                                           (new)
scripts/probe-bff-routes.mjs
scripts/probe-bff-authenticated-live.mjs
scripts/probe-hosted-browser-bff.mjs
src/lib/bff-v1/__tests__/contract-drift.test.ts                (new)
package.json                                                   (scripts + 3 devDeps)
package-lock.json
```
