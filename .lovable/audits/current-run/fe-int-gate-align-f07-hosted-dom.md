# FE-INT-GATE-ALIGN-F07 Hosted DOM Evidence

Generated: 2026-05-14
Owner: Codex2

## Scope

Aligned `e2e/06-entity-registry.spec.ts` to the hosted Lovable DOM at
`https://pantheon-dev.lovable.app` with the dev BFF base
`https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io`.

## Verification

Run 1:

```bash
PANTHEON_FE_BASE_URL=https://pantheon-dev.lovable.app \
PANTHEON_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io \
npx playwright test e2e/06-entity-registry.spec.ts --trace=on --reporter=list
```

Result: 4 passed, 1 skipped.

Run 2:

```bash
xvfb-run -a env \
PANTHEON_FE_BASE_URL=https://pantheon-dev.lovable.app \
PANTHEON_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io \
npx playwright test e2e/06-entity-registry.spec.ts --headed --trace=on --reporter=list
```

Result: 4 passed, 1 skipped.

## Hosted Runtime Gap

The hosted `/management/runtimes` page currently renders the legacy runtime
label `executor-us-east-1` and does not read `/bff/runtimes` under the F07 route
interception. The spec keeps the BFF list/detail contract coverage and marks
this hosted runtime surface exception explicitly.

Follow-up filed in `ai-status.json`:
`FE-INT-GATE-F07-RUNTIME-LIVE-WIRING`.

## Closeout Verification

Closeout rerun on 2026-05-14 found the hosted global status banner now renders
`資料來源：live / seed fallback armed`. That banner is the healthy hybrid-live
armed state covered by `LiveStatusBanner`; it is not an active seed/mock
fallback. The F07 active-fallback assertion was narrowed to continue rejecting
active fallback states (`資料來源：seed`, `seed fallback active`,
`hybrid fallback active`, `mock data`, and `fallback data`) without failing on
the global armed-state banner.

Closeout run 1:

```bash
PANTHEON_FE_BASE_URL=https://pantheon-dev.lovable.app \
PANTHEON_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io \
npx playwright test e2e/06-entity-registry.spec.ts --trace=on --reporter=list \
  --output=.lovable/audits/current-run/f07-closeout-test-results-run1
```

Result: 4 passed, 1 skipped.

Closeout run 2:

```bash
PANTHEON_FE_BASE_URL=https://pantheon-dev.lovable.app \
PANTHEON_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io \
npx playwright test e2e/06-entity-registry.spec.ts --trace=on --reporter=list \
  --output=.lovable/audits/current-run/f07-closeout-test-results-run2
```

Result: 4 passed, 1 skipped.
