# MGMT-OPS-003-GAP-003 Hosted Workflow E2E

Status: REQUEST_CHANGES

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

## Final hosted observation

- Timestamp: 2026-07-11T16:06Z UTC
- Result: 2 failed (desktop 1440x1000, mobile 390x844)
- Live holdings: 27
- Row-level incidents: 27
- Missing bindings: 19
- Deployment stages present in the live response: paper only
- Console exceptions: 2 per viewport
- Failed browser requests: 0
- Required BFF responses with status >= 400: 1 per viewport
- Strict-mode fallback/seed labels: 0
- Frontend task PR: `ajoe734/execute-plans#257`
- Frontend task merge: `12200de4f5622b24cd844e0b649c26959baa1a55`
- Hosted frontend deployment: `12200de4f5622b24cd844e0b649c26959baa1a55`
- Hosted frontend deployment run: `29158992367`
- Hosted BFF contains GAP-002 merge: `265ca18051c8ff521bc65c7187348215cabfdfc5`

## Exact failure

The Portfolio Book, Performance Attribution, and Human Review portions preserve
the selected holding's persona, runtime, and target IDs. Persona Fleet does not
meet the hosted contract:

- the page requests `GET /bff/management/fleet` and receives 404;
- the deployment contract requires `GET /bff/management/persona-fleet`;
- the browser logs `Failed to load resource: 404` and
  `[useV5Live] loader failed BffError: Not Found`;
- deploy run `29158992367` installed the correct bundle but correctly failed its
  required browser/BFF probe for the same reason.

The task must remain blocked until the Persona Fleet client route is repaired,
merged, deployed, and this exact desktop/mobile command returns 2 passed with
zero console exceptions and zero failed required BFF responses.
