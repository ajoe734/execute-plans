# BFF Live Wiring Probe — lupin dev
Date: 2026-05-09
Target: https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io
Method: anonymous probe (no Bearer token), classify HTTP status

## Health
- /health → 200 (operator-bff v0.2.0)
- /healthz, /readyz → 200
- /docs → 200 (Swagger UI loads, but...)
- /openapi.json → **500 Internal Server Error** (backend bug — spec generation broken)

## Verdict legend
- ✅ 2xx — public/anonymous works
- 🔒 401 — endpoint registered, auth gate active (= IMPLEMENTED)
- ❌ 404 — route NOT registered on backend
- ⚠️ 405 — wrong method (route exists)

## Per-endpoint status (FE BFF Contract v1 path catalog)

| Verdict | Method | Path |
|---|---|---|
| 🔒 401 | GET  | /bff/approvals |
| 🔒 401 | POST | /bff/mcp-servers/{id}/import-tools |
| 🔒 401 | GET  | /bff/v5/interventions |
| ✅ 200 | GET  | /bff/events/stream |
| ❌ 404 | GET  | /bff/me |
| ❌ 404 | POST | /bff/auth/refresh |
| ❌ 404 | POST | /bff/logout |
| ❌ 404 | POST | /bff/actions/{entityType}/{id}/{actionId} (canonical) |
| ❌ 404 | GET  | /bff/strategies |
| ❌ 404 | GET  | /bff/strategies/{id} |
| ❌ 404 | POST | /bff/strategies/{id}/actions/{action} (legacy) |
| ❌ 404 | GET  | /bff/personas |
| ❌ 404 | GET  | /bff/personas/{id} |
| ❌ 404 | GET  | /bff/capital-pools |
| ❌ 404 | GET  | /bff/capital-pools/{id} |
| ❌ 404 | GET  | /bff/rebalances |
| ❌ 404 | GET  | /bff/deployments |
| ❌ 404 | GET  | /bff/evolution-programs |
| ❌ 404 | GET  | /bff/jobs |
| ❌ 404 | POST | /bff/approvals/{id}/decide |
| ❌ 404 | POST | /bff/approvals/batch-decide |
| ❌ 404 | GET  | /bff/alerts |
| ❌ 404 | POST | /bff/alerts/{id}/acknowledge |
| ❌ 404 | GET  | /bff/incidents |
| ❌ 404 | GET  | /bff/audit |
| ❌ 404 | GET  | /bff/artifacts |
| ❌ 404 | GET  | /bff/runtimes |
| ❌ 404 | GET  | /bff/mcp-servers |
| ❌ 404 | GET  | /bff/mcp-tools |
| ❌ 404 | GET  | /bff/skills |
| ❌ 404 | GET  | /bff/channels |
| ❌ 404 | GET  | /bff/tools |
| ❌ 404 | GET  | /bff/ranking-formulas |
| ❌ 404 | GET  | /bff/research-experiments |
| ❌ 404 | GET  | /bff/agora/signals |
| ❌ 404 | GET  | /bff/agora/inbox |
| ❌ 404 | GET  | /bff/agora/journal |
| ❌ 404 | GET  | /bff/agora/postmortems |
| ❌ 404 | GET  | /bff/agora/ask/sessions |
| ❌ 404 | GET  | /bff/v5/loop-runs |
| ❌ 404 | GET  | /bff/v5/sentinel/findings |
| ❌ 404 | POST | /bff/v5/interventions/{id}/decide |
| ❌ 404 | GET  | /bff/v5/execution/persona-health |

## Counts
- ✅ 2xx: **1**
- 🔒 401 (implemented): **3**
- ❌ 404 (NOT implemented): **39**
- Total probed: **43**

## Confirmed implemented (4 / 43, ~9%)
1. `GET  /bff/events/stream` — SSE open works anonymously
2. `GET  /bff/approvals` — auth-gated
3. `POST /bff/mcp-servers/{id}/import-tools` — auth-gated
4. `GET  /bff/v5/interventions` — auth-gated

## Critical backend gaps to file
1. **/openapi.json → 500** — spec generation broken; FE & QA cannot self-discover routes.
2. **Session trio missing** — `/bff/me`, `/bff/auth/refresh`, `/bff/logout` all 404. Without `/bff/me`, FE cannot bootstrap session, locale, capabilities, tenant, feature flags. This blocks all auth-gated 401 routes from being usable.
3. **Canonical action endpoint missing** — `POST /bff/actions/{entityType}/{entityId}/{actionId}` (Final OpenAPI §1772) not registered. Only legacy nested form might exist (also 404 here).
4. **Decision endpoints missing** — `/bff/approvals/{id}/decide` and `/bff/v5/interventions/{id}/decide` 404 even though list endpoints are auth-gated. List → decide flow is broken.
5. **Almost all entity registries 404** — strategies, personas, capital-pools, rebalances, deployments, jobs, alerts, incidents, audit, artifacts, runtimes, mcp-tools, skills, channels, tools, ranking-formulas, research-experiments, all agora/*, all v5/* except interventions list.

## Recommended next step
Send this report to backend (lupin) team. Until then keep FE on `VITE_BFF_MODE=mock` (already the default in `.env.example`); switching to live now would mean ~91% of pages 404.
