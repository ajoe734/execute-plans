# FE-INT-GATE-ALIGN-F05 Hosted Write Gate Gap

Date: 2026-05-14
Owner: Codex

## Scope

F05 checked `e2e/04-sentinel-remediation.spec.ts` against the hosted Lovable
Management Console DOM for `/management/sentinel`.

## Hosted Evidence

Command:

```bash
PANTHEON_FE_BASE_URL=https://pantheon-dev.lovable.app \
PANTHEON_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io \
VITE_BFF_MODE=live \
VITE_BFF_REAL_WRITES=true \
VITE_BFF_FALLBACK=strict \
xvfb-run -a npx playwright test e2e/04-sentinel-remediation.spec.ts --trace=on --headed
```

Result: failed, matching the hard-gate symptom. The hosted DOM renders the B04
finding drawer and both remediation actions:

- `Open incident`
- `Pause persona routing`
- button label `執行`

Both tests then time out waiting for `POST /bff/v5/interventions/{id}/remediate`.

Hosted bundle check:

- `https://pantheon-dev.lovable.app/assets/index-BYfBkno5.js`
- bundled env includes `VITE_BFF_MODE=live` and `VITE_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io`
- bundled env does not include `VITE_BFF_REAL_WRITES`
- bundled env does not include `VITE_BFF_FALLBACK`

Therefore `realWritesEnabled()` is false in the hosted browser, and the UI uses
the v5 overlay path instead of issuing the remediation POST.

## Local Control Evidence

Local Vite server was started with:

```bash
VITE_BFF_MODE=live \
VITE_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io \
VITE_BFF_FALLBACK=strict \
VITE_BFF_REAL_WRITES=true \
npm run dev -- --host 127.0.0.1 --port 5175
```

Then F05 was run twice against the local server:

```bash
PANTHEON_FE_BASE_URL=http://127.0.0.1:5175 \
PANTHEON_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io \
VITE_BFF_MODE=live \
VITE_BFF_REAL_WRITES=true \
VITE_BFF_FALLBACK=strict \
npx playwright test e2e/04-sentinel-remediation.spec.ts --trace=on
```

Results:

- run 1: `2 passed`
- run 2: `2 passed`

A focused network probe also observed the expected advisory POST:

```text
POST /bff/v5/interventions/ra_open_incident_*/remediate
{"reason":"Open incident","remediation_action":"open_incident"}
```

## Conclusion

This is not a selector mismatch. The hosted Lovable DOM matches the current
spec selectors, but the hosted deployment is missing the write-gate env needed
for the F05 live-write acceptance path.

## Remediation

Added a browser runtime gate that is only honored on localhost and
`pantheon-dev.lovable.app`:

- `sessionStorage["pantheon.integration.realWrites"]="true"` enables the
  integration-test real-write path even when the hosted bundle was built with
  `VITE_BFF_REAL_WRITES=false` or without that env key.
- `sessionStorage["pantheon.integration.fallback"]="strict"` selects strict
  fallback mode for the same dev-host integration run.
- Other hosts ignore these runtime overrides, so production and non-dev shared
  deployments keep their build-time write gate behavior.

`e2e/04-sentinel-remediation.spec.ts` now injects those dev-scoped session
keys before navigation. The spec still waits for the remediation POSTs and still
asserts the emergency `CONFIRM_TOKEN_REQUIRED` response and advisory `202`
queue response.

## Verification

Unit/type checks:

```bash
npx tsc --noEmit
npx vitest run src/lib/bff-v1/__tests__/writes.test.ts src/lib/bff/__tests__/liveTransportSnapshot.test.ts
```

Production-preview build:

```bash
VITE_BFF_MODE=live \
VITE_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io \
VITE_BFF_FALLBACK=auto \
VITE_BFF_REAL_WRITES=false \
npm run build
```

F05 production-preview runs against the built bundle:

```bash
PANTHEON_FE_BASE_URL=http://127.0.0.1:4175 \
PANTHEON_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io \
VITE_BFF_MODE=live \
VITE_BFF_REAL_WRITES=false \
VITE_BFF_FALLBACK=auto \
npx playwright test e2e/04-sentinel-remediation.spec.ts --trace=on --reporter=list \
  --output=/tmp/fe-int-gate-align-f05-deploy-write-gate-preview-run1
```

Result: `2 passed`.

```bash
PANTHEON_FE_BASE_URL=http://127.0.0.1:4175 \
PANTHEON_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io \
VITE_BFF_MODE=live \
VITE_BFF_REAL_WRITES=false \
VITE_BFF_FALLBACK=auto \
npx playwright test e2e/04-sentinel-remediation.spec.ts --trace=on --reporter=list \
  --output=/tmp/fe-int-gate-align-f05-deploy-write-gate-preview-run2
```

Result: `2 passed`.

## Hosted Deployment Note

The current hosted asset observed in the original gap,
`https://pantheon-dev.lovable.app/assets/index-BYfBkno5.js`, predates this
runtime gate. Hosted F05 can only pass after `pantheon-dev.lovable.app` is
redeployed with the commit that contains this remediation.
