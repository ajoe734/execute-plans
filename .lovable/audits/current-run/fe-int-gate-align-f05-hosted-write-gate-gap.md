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

Follow-up required: deploy `pantheon-dev.lovable.app` with an explicit,
dev-scoped real-write gate for integration testing, then rerun F05 hosted twice.
