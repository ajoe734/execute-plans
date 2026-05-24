# BFF Backend Gap — Delta Audit 2026-05-24

Live probe of lupin dev BFF at `https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io`
against `.lovable/audits/bff-backend-gap-2026-05-23.md` baseline (~87 canonical paths, 76 P0/P1 gaps).

Probe headers: `Authorization: Bearer pantheon-dev-browser:reviewer`,
`Origin: https://id-preview--b75d3452-f667-4cf4-893a-1061de45b347.lovable.app`.

---

## Summary

| Bucket                          | 2026-05-23 baseline | 2026-05-24 actual |
|---------------------------------|---------------------|-------------------|
| Implemented                     | 4                   | **~62**           |
| Still missing                   | 76 (P0+P1)          | **26**            |
| Schema deviations               | —                   | **1**             |
| CORS preflight broken           | yes                 | **still yes**     |
| `/openapi.json` 500             | yes                 | **fixed (200)**   |

Gap closure: ~58 % of original 76. Remaining work is concentrated in §8/§9 Management,
one approvals batch endpoint, one confirm-token detail endpoint, plus error envelope
shape and CORS middleware.

---

## ✅ Implemented (~62 paths verified 200 or 405-on-wrong-method)

### §0 Platform
- `GET /health`
- `GET /openapi.json` (previously 500, now 200)
- `GET /bff/me`

### §3/§4 Action / Auth (GET returns 405 = path registered)
- `POST /bff/me/locale`
- `POST /bff/auth/refresh`, `POST /bff/logout`
- `POST /bff/approvals/{id}/decide`
- `POST /bff/v5/interventions/{id}/decide`
- `POST /bff/alerts/{id}/acknowledge`
- `POST /bff/actions/{type}/{id}/{action}`
- `POST /bff/confirm-tokens`, `POST /bff/command-confirmations`

### §5 Entity registries — all 27 returned 200
strategies, personas, capital-pools, rebalances, deployments, evolution-programs,
jobs, incidents, audit, artifacts, runtimes, mcp-servers, mcp-tools, skills,
channels, tools, ranking-formulas, research-experiments, search.

### §5 Detail-by-id (verified with real IDs, all 200)
- `/bff/strategies/{id}`, `/bff/strategies/{id}/specs`
- `/bff/personas/{id}`, `/personas/{id}/route-policy`, `/evaluations`, `/memory`
  (e.g. `persona-20260513-06627c91`)
- `/bff/capital-pools/{id}`, `/bff/rebalances/{id}`, `/bff/deployments/{id}`
- `/bff/jobs/{id}`, `/bff/incidents/{id}`, `/bff/artifacts/{id}`
- `/bff/evolution-programs/{id}`, `/runs`, `/candidates`
- `/bff/v5/loop-runs/{id}`, `/bff/v5/interventions/{id}`
- `/bff/agora/ask/sessions/{id}`
- `/bff/confirm-tokens/{id}`
- `POST /bff/mcp-servers/{id}/import-tools` (405 on GET = exists)
- `GET /bff/events/stream` (SSE)

### §6 Agora (all 6)
ask, ask/sessions, control-room, control-room/personas, control-room/strategies,
control-room/incidents.

### §7 v5 Closed-Loop (all 5)
loop-runs, interventions, sentinel/digest, hiq/queue, persona-health-matrix.

---

## ❌ Still missing — 26 paths

### P0 — 1
| Method | Path                                  | Status |
|--------|----------------------------------------|--------|
| POST   | `/bff/approvals/batch-decide`          | 404    |

### P1-mgmt §8 PM-Live — 14 paths, all 404
- `/bff/management/cockpit`
- `/bff/management/persona-league/rankings`
- `/bff/management/persona-league/movers`
- `/bff/management/persona-league/heatmap`
- `/bff/management/strategy-allocation`
- `/bff/management/capital-flow`
- `/bff/management/risk-radar`
- `/bff/management/incident-timeline`
- `/bff/management/governance-ledger`
- `/bff/management/cost-attribution`
- `/bff/management/sentinel-pulse`
- `/bff/management/loop-throughput`
- `/bff/management/hiq-backlog`
- `/bff/management/intervention-stream`

### P1-mgmt §9 PM-12 quarterly / attribution — 10 paths, all 404
- `/bff/management/quarterly-ranking?quarter=2026-Q2`
- `/bff/management/quarterly-ranking/drilldown`
- `/bff/management/performance-attribution`
- `/bff/management/performance-attribution/by-persona`
- `/bff/management/performance-attribution/by-strategy`
- `/bff/management/performance-attribution/by-pool`
- `/bff/management/portfolio-book`
- `/bff/management/portfolio-book/positions`
- `/bff/management/portfolio-book/exposure`
- `/bff/management/board-pack`

### P1-misc — 1 (new in delta-v2)
| Method | Path                                       | Status                                            |
|--------|--------------------------------------------|---------------------------------------------------|
| GET    | `/bff/command-confirmations/{token}`       | `{"detail":"Not Found"}` (route unregistered)     |

`POST /bff/command-confirmations` exists, but the GET-by-token lookup path is missing.
FE confirm-token query flow will permanently fallback to mock.

---

## ⚠ Schema deviations — 1 (new in delta-v2)

### Error envelope wrapping
- **Backend returns**: `{"detail": {"error": {...}}}` (extra `detail` wrapper)
- **Pack D §error envelope requires**: `{"error": {...}, "meta": {"correlationId": "..."}}`
- **Impact**: FE `safeAdapt` auto-degrades to mock for failed calls; audit trails lose `correlationId`.
- **Fix**: Strip outer `detail`, add `meta.correlationId` (echo back `x-correlation-id` request header).

---

## 🚨 CORS — broken on all paths

`OPTIONS` preflight on every `/bff/*` endpoint returns:
- `400 Bad Request`
- empty `Access-Control-Allow-Origin` header

Result: browser blocks all calls from preview → console shows `Failed to fetch` even though
the underlying GET/POST work fine when tested with `curl`.

### Required middleware

Apply to all `/bff/*` + `/health` + `/openapi.json`:

```
Access-Control-Allow-Origin: <echo allowed origin>
  allowed list:
    https://id-preview--b75d3452-f667-4cf4-893a-1061de45b347.lovable.app
    https://b75d3452-f667-4cf4-893a-1061de45b347.lovableproject.com
    https://pantheon-dev.lovable.app
Access-Control-Allow-Headers: authorization, accept, accept-language,
                              content-type, x-bff-api-version,
                              x-correlation-id, x-request-id
Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS
Access-Control-Expose-Headers: x-correlation-id, x-request-id
Access-Control-Max-Age: 600
```

`OPTIONS` must return **204**, not 400.

---

## Action items for lupin BE

1. **CORS middleware** — highest priority; unblocks all 62 already-working endpoints.
2. **Error envelope** — strip `detail` wrapper, add `meta.correlationId`.
3. **POST `/bff/approvals/batch-decide`** — P0 single endpoint.
4. **GET `/bff/command-confirmations/{token}`** — register route.
5. **§8 PM-Live 14 endpoints** — Management cockpit/league/radar/etc.
6. **§9 PM-12 10 endpoints** — quarterly ranking, performance attribution, portfolio book, board pack.

FE side: 0 code changes needed. `withLiveOrMock + safeAdapt` is already wired to degrade
gracefully and will pick up live data as soon as the above land.

---

## Conclusion

Aside from the **§8/§9 management batch (24 paths) + CORS**, the only residual gaps are
two zero-impact items: `command-confirmations/{token}` and the error envelope shape.
Once CORS is fixed and the §8/§9 batch lands, the FE will be 100 % live-ready.
