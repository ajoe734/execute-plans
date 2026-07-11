# MGMT-OPS-003-GAP-003 Hosted Workflow E2E

Status: pre-deployment verification passed; final hosted rerun pending task PR deployment

## Gate

The hosted-only Playwright gate is `e2e/21-portfolio-workflow-hosted.spec.ts`.
It captures the exact Portfolio Book holdings response observed by the browser
and compares its stable IDs and counters to the rendered UI. It then follows a
degraded holding into Performance Attribution and Human Review at desktop and
mobile widths while preserving persona, runtime, and holding context.

Run with:

```sh
PANTHEON_HOSTED_E2E=1 \
PANTHEON_FE_BASE_URL=https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io \
PANTHEON_BFF_BASE_URL=https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io \
VITE_BFF_MODE=live VITE_BFF_FALLBACK=strict \
npx playwright test e2e/21-portfolio-workflow-hosted.spec.ts --project=chromium
```

## Pre-deployment observation

- Timestamp: 2026-07-11T15:53Z UTC
- Result: 2 passed (desktop 1440x1000, mobile 390x844)
- Live holdings: 27
- Row-level incidents: 27
- Missing bindings: 19
- Deployment stages present in the live response: paper only
- Console exceptions: 0
- Failed browser requests: 0
- Required BFF responses with status >= 400: 0
- Strict-mode fallback/seed labels: 0
- Hosted frontend deployment: `30bc432f8a4e095e9947da4f076886828a2bcd58`
- Hosted frontend deployment run: `29156996097`
- Hosted BFF contains GAP-002 merge: `265ca18051c8ff521bc65c7187348215cabfdfc5`

This observation is not final acceptance because the hosted frontend commit
does not contain the GAP-001 `main` merge `ce8e57ec434d3ec6f34170a6e9e3e8f737ce5197`.
The final evidence must replace this section after deploying the task merge SHA
and rerunning the same command.
