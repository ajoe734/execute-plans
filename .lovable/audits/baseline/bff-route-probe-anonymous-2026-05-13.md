# BFF Route Probe — anonymous

Date: 2026-05-13T04:06:55.526Z
Target: https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io

## Counts

```json
{
  "200": 5,
  "401": 41
}
```

## Verdict

- Canonical 404 count: 0
- Transport errors: 0

## Results

| Status | Method | Path | ms |
|---:|---|---|---:|
| 200 | GET | /health | 1668 |
| 200 | GET | /healthz | 51 |
| 200 | GET | /readyz | 12 |
| 200 | GET | /openapi.json | 2372 |
| 200 | GET | /bff/events/stream | 24 |
| 401 | GET | /bff/me | 93 |
| 401 | POST | /bff/auth/refresh | 73 |
| 401 | POST | /bff/logout | 12 |
| 401 | POST | /bff/actions/strategies/strategy-dev/promote | 31 |
| 401 | GET | /bff/strategies | 21 |
| 401 | GET | /bff/strategies/strategy-dev | 16 |
| 401 | GET | /bff/personas | 12 |
| 401 | GET | /bff/personas/persona-dev | 19 |
| 401 | GET | /bff/capital-pools | 31 |
| 401 | GET | /bff/capital-pools/capital-dev | 12 |
| 401 | GET | /bff/rebalances | 22 |
| 401 | GET | /bff/deployments | 17 |
| 401 | GET | /bff/evolution-programs | 10 |
| 401 | GET | /bff/jobs | 9 |
| 401 | GET | /bff/approvals | 7 |
| 401 | POST | /bff/approvals/approval-dev/decide | 12 |
| 401 | POST | /bff/approvals/batch-decide | 12 |
| 401 | GET | /bff/alerts | 9 |
| 401 | POST | /bff/alerts/alert-dev/acknowledge | 11 |
| 401 | GET | /bff/incidents | 14 |
| 401 | GET | /bff/audit | 15 |
| 401 | GET | /bff/artifacts | 8 |
| 401 | GET | /bff/runtimes | 9 |
| 401 | GET | /bff/mcp-servers | 12 |
| 401 | POST | /bff/mcp-servers/mcp-dev/import-tools | 14 |
| 401 | GET | /bff/mcp-tools | 8 |
| 401 | GET | /bff/skills | 11 |
| 401 | GET | /bff/channels | 9 |
| 401 | GET | /bff/tools | 10 |
| 401 | GET | /bff/ranking-formulas | 18 |
| 401 | GET | /bff/research-experiments | 6 |
| 401 | GET | /bff/agora/signals | 8 |
| 401 | GET | /bff/agora/inbox | 7 |
| 401 | GET | /bff/agora/journal | 10 |
| 401 | GET | /bff/agora/postmortems | 9 |
| 401 | GET | /bff/agora/ask/sessions | 8 |
| 401 | GET | /bff/v5/loop-runs | 7 |
| 401 | GET | /bff/v5/sentinel/findings | 7 |
| 401 | GET | /bff/v5/interventions | 7 |
| 401 | POST | /bff/v5/interventions/intervention-dev/decide | 13 |
| 401 | GET | /bff/v5/execution/persona-health | 6 |

## Gate

PASS: no canonical route returned 404.