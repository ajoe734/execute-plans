# FE-INT-GATE-ALIGN-F15 strict-mode product gap

Task: FE-INT-GATE-ALIGN-F15
Captured: 2026-05-14 UTC

## Hosted run

Command:

```bash
PANTHEON_FE_BASE_URL=https://pantheon-dev.lovable.app \
PANTHEON_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io \
PANTHEON_E2E_STRICT=1 \
PLAYWRIGHT_HTML_OUTPUT_DIR=.lovable/audits/current-run/f15-strict-playwright-report \
npx playwright test e2e/09-strict-vs-hybrid.spec.ts --trace=on \
  --output=.lovable/audits/current-run/f15-strict-test-results
```

Result: 1 failed, 1 passed, 1 skipped. The failing test is the strict 5xx
case.

Evidence:

- `.lovable/audits/current-run/f15-strict-test-results/09-strict-vs-hybrid-F15-st-a9a71-d-without-showing-mock-data-chromium/error-context.md`
- `.lovable/audits/current-run/f15-strict-test-results/09-strict-vs-hybrid-F15-st-a9a71-d-without-showing-mock-data-chromium/test-failed-1.png`
- `.lovable/audits/current-run/f15-strict-test-results/09-strict-vs-hybrid-F15-st-a9a71-d-without-showing-mock-data-chromium/trace.zip`

## Observed DOM

The hosted Lovable page renders the hybrid fallback path after the injected
`/bff/strategies` 503:

- status text: `live BFF unavailable Injected F15 5xx · serving mock data`
- topbar badge: `FALLBACK DATA`
- seed row remains visible: `Momentum Quant Alpha`

This is not a selector mismatch. The strict acceptance condition, "no seed data
after strict 5xx", is false on the hosted deployment.

## Runtime env check

I tested a Playwright-side page-init override for `window.process.env` before
page navigation. The hosted DOM still rendered the same hybrid fallback path.
That attempt was reverted from `e2e/09-strict-vs-hybrid.spec.ts`.

The hosted asset at `https://pantheon-dev.lovable.app/assets/index-BYfBkno5.js`
shows why the runtime override cannot work: Vite compiled the relevant env read
into build-local objects. The bundle includes `VITE_BFF_MODE:"live"` but no
strict fallback value, and the `process.env` branch is compiled to a closed-over
empty object, not `window.process.env`.

## Follow-up required

F15 cannot be made green against the current hosted Lovable deployment without
masking the strict acceptance. Follow-up task
`FE-INT-GATE-FOLLOWUP-F15-STRICT-LOVABLE` tracks the required product/deployment
fix: deploy a strict-capable Lovable build or add and deploy a supported runtime
config hook that lets the gate select strict mode before app bootstrap.

## Follow-up implementation

`104f06b` added the strict-capable runtime env hook in the frontend bundle:

- `src/lib/bff-v1/runtimeEnv.ts` reads `window.__PANTHEON_BFF_RUNTIME__`,
  `window.__PANTHEON_RUNTIME_CONFIG__`, `sessionStorage`, and `localStorage`
  for a dev/Lovable-host fallback override.
- `src/lib/bff-v1/liveTransport.ts` and `src/lib/bff/client.ts` now use that
  runtime env path when detecting `VITE_BFF_FALLBACK`.
- `src/lib/bff/__tests__/liveTransportSnapshot.test.ts` covers strict fallback
  selection from both storage and pre-bootstrap runtime globals.

This task updates `e2e/09-strict-vs-hybrid.spec.ts` to install the supported
runtime override before page navigation. It does not change the strict
acceptance: the strict 5xx case still requires a typed error banner and zero
seed rows.

## Follow-up verification

Local live-mode dev bundle with the runtime hook:

```bash
VITE_BFF_MODE=live \
VITE_BFF_FALLBACK=auto \
VITE_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io \
npm run dev -- --host 127.0.0.1 --port 5173
```

Passed:

```bash
npm run test -- src/lib/bff/__tests__/liveTransportSnapshot.test.ts
npm run test -- src/lib/bff-v1/__tests__/writes.test.ts
npm run build
PANTHEON_FE_BASE_URL=http://127.0.0.1:5173 \
PANTHEON_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io \
PANTHEON_E2E_STRICT=1 \
PLAYWRIGHT_HTML_OUTPUT_DIR=.lovable/audits/current-run/f15-strict-runtime-hook-playwright-report-run1 \
npx playwright test e2e/09-strict-vs-hybrid.spec.ts --trace=on \
  --output=.lovable/audits/current-run/f15-strict-runtime-hook-test-results-run1 \
  --reporter=list
PANTHEON_FE_BASE_URL=http://127.0.0.1:5173 \
PANTHEON_BFF_BASE_URL=https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io \
PANTHEON_E2E_STRICT=1 \
PLAYWRIGHT_HTML_OUTPUT_DIR=.lovable/audits/current-run/f15-strict-runtime-hook-playwright-report-run2 \
npx playwright test e2e/09-strict-vs-hybrid.spec.ts --trace=on \
  --output=.lovable/audits/current-run/f15-strict-runtime-hook-test-results-run2 \
  --reporter=list
```

Both strict Playwright runs produced `1 skipped, 2 passed`.

Hosted Lovable remains not yet deployed with the runtime hook at the time of
this follow-up: `https://pantheon-dev.lovable.app/` still references
`/assets/index-BYfBkno5.js`, and the hosted strict command still fails the
strict 5xx case by rendering the hybrid seed fallback. Evidence:

- `.lovable/audits/current-run/f15-strict-hosted-runtime-hook-test-results-run1/09-strict-vs-hybrid-F15-st-a9a71-d-without-showing-mock-data-chromium/error-context.md`
- `.lovable/audits/current-run/f15-strict-hosted-runtime-hook-test-results-run1/09-strict-vs-hybrid-F15-st-a9a71-d-without-showing-mock-data-chromium/test-failed-1.png`
- `.lovable/audits/current-run/f15-strict-hosted-runtime-hook-test-results-run1/09-strict-vs-hybrid-F15-st-a9a71-d-without-showing-mock-data-chromium/trace.zip`
