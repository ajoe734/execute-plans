# BFF Route Probe — anonymous

Date: 2026-10-02T17:15:55.069Z
Target: https://api.dev.mvl-cap.tw

## Counts

```json
{
  "200": 3,
  "401": 37,
  "404": 2
}
```

## Verdict

- Canonical 404 count: 2
- Transport errors: 0
- Blocking transport errors: 0
- Readiness endpoint ok: true
- Legacy health route failures ignored: 0

## Results

| Status | Method | Path | ms | Attempts |
|---:|---|---|---:|---:|
| 200 | GET | /livez | 716 | 1 |
| 200 | GET | /openapi.json | 621 | 1 |
| 200 | GET | /bff/events/stream | 235 | 1 |
| 401 | GET | /bff/me | 548 | 1 |
| 401 | POST | /bff/auth/refresh | 617 | 1 |
| 401 | POST | /bff/logout | 187 | 1 |
| 401 | POST | /bff/v1/commands | 186 | 1 |
| 401 | GET | /bff/strategies | 186 | 1 |
| 401 | GET | /bff/strategies/strategy-dev | 185 | 1 |
| 401 | GET | /bff/personas | 190 | 1 |
| 401 | GET | /bff/personas/persona-dev | 199 | 1 |
| 401 | GET | /bff/capital-pools | 190 | 1 |
| 401 | GET | /bff/capital-pools/capital-dev | 181 | 1 |
| 401 | GET | /bff/rebalances | 186 | 1 |
| 401 | GET | /bff/deployments | 185 | 1 |
| 401 | GET | /bff/evolution-programs | 187 | 1 |
| 401 | GET | /bff/jobs | 184 | 1 |
| 401 | GET | /bff/approvals | 189 | 1 |
| 401 | POST | /bff/approvals/approval-dev/decide | 185 | 1 |
| 401 | POST | /bff/approvals/batch-decide | 188 | 1 |
| 401 | GET | /bff/alerts | 185 | 1 |
| 401 | POST | /bff/alerts/alert-dev/acknowledge | 188 | 1 |
| 401 | GET | /bff/incidents | 181 | 1 |
| 401 | GET | /bff/audit | 185 | 1 |
| 401 | GET | /bff/artifacts | 183 | 1 |
| 401 | GET | /bff/runtimes | 188 | 1 |
| 401 | GET | /bff/mcp-servers | 187 | 1 |
| 401 | POST | /bff/mcp-servers/mcp-dev/import-tools | 187 | 1 |
| 401 | GET | /bff/mcp-tools | 185 | 1 |
| 401 | GET | /bff/skills | 187 | 1 |
| 401 | GET | /bff/channels | 182 | 1 |
| 401 | GET | /bff/tools | 185 | 1 |
| 401 | GET | /bff/ranking-formulas | 183 | 1 |
| 401 | GET | /bff/research-experiments | 187 | 1 |
| 404 | GET | /bff/agora/signals | 187 | 1 |
| 404 | GET | /bff/agora/inbox | 187 | 1 |
| 401 | GET | /bff/agora/journal | 188 | 1 |
| 401 | GET | /bff/agora/postmortems | 188 | 1 |
| 401 | POST | /bff/management/nl/ask | 183 | 1 |
| 401 | POST | /bff/assistant/provider/reauth | 186 | 1 |
| 401 | GET | /bff/v5/loop-runs | 184 | 1 |
| 401 | GET | /bff/v5/execution/persona-health | 183 | 1 |

## Gate

FAIL: 2 canonical routes returned 404.
