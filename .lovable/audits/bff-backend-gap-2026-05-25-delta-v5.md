# BFF Backend Gap — Delta v5 (2026-05-25 final)

**Status:** ✅ ALL P0/P1/P2 CLEAR — BFF live integration unblocked
**Supersedes:** `bff-backend-gap-2026-05-25-delta-v4.md`
**BFF base:** `https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io`
**Preview origin verified:** `https://id-preview--b75d3452-f667-4cf4-893a-1061de45b347.lovable.app`

## Re-probe results

### ✅ P0-1: CORS preflight — FIXED

```
OPTIONS /bff/me
  Origin: https://id-preview--b75d3452-f667-4cf4-893a-1061de45b347.lovable.app
  Access-Control-Request-Method: GET
→ HTTP/2 204
  access-control-allow-origin: https://id-preview--b75d3452-f667-4cf4-893a-1061de45b347.lovable.app
  access-control-allow-credentials: true
  access-control-allow-methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
  access-control-allow-headers: Accept, Accept-Language, Authorization, Cache-Control,
    Content-Language, Content-Type, Idempotency-Key, Last-Event-ID, X-BFF-Api-Version,
    X-Confirm-Token, X-Correlation-Id, X-Idempotency-Key, X-MFA-Token, X-Refresh-Token,
    X-Request-Id, X-Trace-Id
  access-control-max-age: 600
```

Preview browser network panel confirms `/bff/me`, `/bff/management/cockpit`,
`/bff/management/persona-league`, `/bff/management/portfolio-book`,
`/bff/approvals`, `/bff/alerts`, `/bff/jobs`, `/bff/search` all return 200
directly from the preview origin — no `Failed to fetch`.

### ✅ P0-2: Error envelope — FIXED & canonical

```
GET /bff/personas/does-not-exist-zzz
→ {
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "i18nKey": "errors.RESOURCE_NOT_FOUND",
    "message": "Persona not found",
    "retryable": false,
    "userActionable": true,
    "details": {...}
  },
  "meta": { "correlationId": "296186e6-..." }
}
```

Matches Pack D §D21 / §C027 exactly: `code`, `i18nKey`, `message`, `retryable`,
`userActionable`, `details`, `meta.correlationId`. No more `{detail:{error:...}}`
wrapping. `RESOURCE_NOT_FOUND` (not `OBJECT_NOT_FOUND`).

### ✅ P2: Envelope optional fields — present
`i18nKey`, `retryable`, `userActionable` all populated.

### ✅ §8 PM-Live + §9 PM-12 + paths.mgmt* — 21/21 = 200

| Status | Path |
|---|---|
| 200 | /bff/management/cockpit |
| 200 | /bff/management/persona-league |
| 200 | /bff/management/strategy-allocation |
| 200 | /bff/management/capital-flow |
| 200 | /bff/management/risk-radar |
| 200 | /bff/management/incident-timeline |
| 200 | /bff/management/governance-ledger |
| 200 | /bff/management/cost-attribution |
| 200 | /bff/management/sentinel-pulse |
| 200 | /bff/management/loop-throughput |
| 200 | /bff/management/hiq-backlog |
| 200 | /bff/management/intervention-stream |
| 200 | /bff/management/quarterly-ranking |
| 200 | /bff/management/performance-attribution |
| 200 | /bff/management/portfolio-book |
| 200 | /bff/management/board-pack |
| 200 | /bff/management/persona-fleet |
| 200 | /bff/management/human-inbox |
| 200 | /bff/management/trading-pulse |
| 200 | /bff/management/evolution-journal |
| 200 | /bff/management/evidence |

### ✅ `GET /bff/command-confirmations/{token}` — 200

## FE-side impact

**Zero code changes required.** `withLiveOrMock + safeAdapt` already auto-degraded
to mock during the broken window; now that CORS + envelope + management routes
are all live, the FE switches to live BFF on next page load with no intervention.

## Remaining (non-blocking, P3)

- ~12 families of snake_case duplicate routes (e.g. `/bff/personas/{persona_id}`
  alongside canonical `/bff/personas/{id}`). FE only uses canonical; BE can
  deprecate the snake_case mirrors at their convenience.

## Conclusion

**BFF backend handoff = COMPLETE.** No further BE work required for FE live
integration. Both Operator and Management surfaces are now end-to-end live.
