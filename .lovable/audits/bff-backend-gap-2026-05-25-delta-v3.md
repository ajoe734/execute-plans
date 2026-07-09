# BFF Backend Gap — Delta-v3 Audit 2026-05-25

Re-probe after BE team reported "BFF development complete" on 2026-05-25.

- Live target: `https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io`
- OpenAPI: `GET /openapi.json` → HTTP 200, 225 `/bff/*` paths
- Probe headers: `Authorization: Bearer pantheon-dev-browser:reviewer`,
  `Origin: https://id-preview--b75d3452-f667-4cf4-893a-1061de45b347.lovable.app`
- Supersedes: `bff-backend-gap-2026-05-24-delta.md`

---

## Summary

| Bucket                              | 2026-05-24 | 2026-05-25 |
|-------------------------------------|------------|------------|
| Canonical paths implemented         | ~62 / 87   | **~63 / 87** |
| Still missing (canonical)           | 26         | **27**     |
| Blockers (CORS / envelope)          | 2          | **2 (unchanged)** |
| Schema deviations                   | 1          | **2** (envelope + non-canonical ErrorCode) |
| BE-added non-canonical paths        | —          | **160+** (naming aliases + SSE cluster + activity/audit/skills detail) |

Net progress vs 2026-05-24: **+1 endpoint** (`POST /bff/approvals/batch-decide`).
Two P0 blockers (CORS, error envelope) **unchanged**. §8/§9 Management batch
**unchanged — still 0/24**.

---

## ✅ New since 2026-05-24

- `POST /bff/approvals/batch-decide` — previously the single P0 gap, now exists.
- Large surface expansion (not in FE canonical set but useful for future):
  - 9 dedicated SSE channels under `/bff/sse/*` (alerts, agora signals,
    command-center events/kpi, deployment events, incidents/{id}/timeline,
    jobs/{id}/progress, notifications, review updates)
  - Platform: `/bff/healthz`, `/bff/readyz`, `/bff/feature-flags`,
    `/bff/capabilities`, `/bff/switch-tenant`, `/bff/auth/dev-login`,
    `/bff/types`, `/bff/v1/commands`
  - Audit: `/bff/audit/events`, `/bff/audit/export`,
    `/bff/audit/entities/{type}/{id}`
  - Persona detail: `/activity`, `/audit`, `/capabilities`, `/skills`,
    `/tools`, `/test-prompt`
  - Strategy detail: `/artifacts`, `/audit`, `/dry-run`, `/experiments`,
    `/lineage`, `/ooda`
  - Reviews, risk alerts, synthesis/conflict-logs, ooda/packets,
    research/tasks, experiments, mcp-tools/{id} actions, ranking/formulas

---

## ❌ Still missing — 27 canonical paths

### P1 — §8 PM-Live Management (14, all 404)

```
/bff/management/cockpit
/bff/management/persona-league/rankings
/bff/management/persona-league/movers
/bff/management/persona-league/heatmap
/bff/management/strategy-allocation
/bff/management/capital-flow
/bff/management/risk-radar
/bff/management/incident-timeline
/bff/management/governance-ledger
/bff/management/cost-attribution
/bff/management/sentinel-pulse
/bff/management/loop-throughput
/bff/management/hiq-backlog
/bff/management/intervention-stream
```

### P1 — §9 PM-12 quarterly / attribution (10, all 404)

```
/bff/management/quarterly-ranking?quarter=2026-Q2
/bff/management/quarterly-ranking/drilldown
/bff/management/performance-attribution
/bff/management/performance-attribution/by-persona
/bff/management/performance-attribution/by-strategy
/bff/management/performance-attribution/by-pool
/bff/management/portfolio-book
/bff/management/portfolio-book/positions
/bff/management/portfolio-book/exposure
/bff/management/board-pack
```

### P2 — Other (3)

| Method | Path | Status | Note |
|--------|------|--------|------|
| GET    | `/bff/command-confirmations/{token}` | 404 | POST collection exists; GET-by-token unregistered. FE confirm-token query path permanently mock. |
| GET    | `/bff/management/persona-fleet` `/human-inbox` `/trading-pulse` `/evolution-journal` `/evidence` | 404 | FE `paths.mgmt*` builders defined (`paths.ts` PM-9 §12.2). Overlap with §8 above; surface for BE naming alignment. |
| GET    | `/bff/management/portfolio-book/holdings` `/pools` | 404 | FE `paths.mgmtPortfolioHoldings/Pools` (PM-12). Maps to §9 `/positions` `/exposure` — please confirm canonical name. |

---

## 🚨 Blockers — both unchanged

### 1. CORS preflight broken (P0)

```
OPTIONS /bff/me
  → HTTP 400
  → Access-Control-Allow-Origin: (empty)
  → Access-Control-Allow-Headers: Accept, Accept-Language, Authorization,
        Cache-Control, Content-Language, Content-Type, Idempotency-Key,
        Last-Event-ID, X-BFF-Api-Version, X-Confirm-Token, X-Correlation-Id,
        X-Idempotency-Key, X-MFA-Token, X-Request-Id, X-Trace-Id
  → Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
```

ACAH / ACAM are correctly populated, but **OPTIONS returns 400 and ACAO is empty**.
Browser blocks every `/bff/*` call. This is the root cause of all `Failed to fetch`
errors in the preview console.

**Fix**: CORS middleware must short-circuit `OPTIONS` to **204** and echo
the request `Origin` (whitelist below) into `Access-Control-Allow-Origin`:

```
https://id-preview--b75d3452-f667-4cf4-893a-1061de45b347.lovable.app
https://b75d3452-f667-4cf4-893a-1061de45b347.lovableproject.com
https://pantheon-dev.lovable.app
```

Also add: `Access-Control-Expose-Headers: x-correlation-id, x-request-id` and
`Access-Control-Max-Age: 600`.

### 2. Error envelope still non-canonical (P0)

```
GET /bff/strategies/__nonexistent__
  → {"detail":{"error":{"code":"OBJECT_NOT_FOUND",
                        "message":"Strategy not found",
                        "details":{"reason":"...","precondition_failed":null,
                                   "suggestion":null}}}}
```

Two issues:
1. **Extra `detail` wrapper** and missing `meta.correlationId`.
2. **`OBJECT_NOT_FOUND` is not in Pack D §D21** canonical 26 codes — should be
   `RESOURCE_NOT_FOUND`.

**Required shape** (Pack D §D20/D21):

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "i18nKey": "errors.RESOURCE_NOT_FOUND",
    "message": "Strategy not found",
    "retryable": false,
    "userActionable": true,
    "correlationId": "<echo x-correlation-id>",
    "details": { "kind": "validation", "fields": { ... } }
  },
  "meta": { "correlationId": "<echo x-correlation-id>" }
}
```

---

## ⚠ Naming divergence (non-blocking, advisory)

BE exposes parallel naming families. FE uses only the first; the second is
redundant surface. Recommend deprecating snake_case duplicates:

| FE canonical (kept) | BE duplicate (remove?) |
|---|---|
| `/bff/personas/{id}` | `/bff/personas/{persona_id}` |
| `/bff/capital-pools/{id}` | `/bff/capital-pools/{pool_id}` |
| `/bff/deployments/{id}` | `/bff/deployments/{deployment_id}` |
| `/bff/rebalances/{id}` | `/bff/rebalances/{rebalance_id}` |
| `/bff/incidents/{id}` | `/bff/incidents/{incident_id}` |
| `/bff/runtimes/{id}` | `/bff/runtimes/{runtime_id}` |
| `/bff/skills/{id}` | `/bff/skills/{skill_id}` |
| `/bff/tools/{id}` | `/bff/tools/{tool_id}` |
| `/bff/mcp-servers/*` | `/bff/mcp/servers/*` |
| `/bff/mcp-tools` | `/bff/mcp/tools/*` |
| `/bff/ranking-formulas` | `/bff/ranking/formulas` |
| `/bff/strategies/{id}/actions/{action}` (legacy) → use `/bff/actions/{type}/{id}/{action}` | `/bff/strategies/{strategy_id}/actions/{action_id}` |

---

## Action items for lupin BE

| 優先 | 項目 | 數量 |
|---|---|---:|
| P0 | CORS middleware — OPTIONS must 204 + echo allowed Origin | 1 |
| P0 | Error envelope — strip `detail`, add `meta.correlationId`, use Pack D §D21 26 canonical codes (`RESOURCE_NOT_FOUND` ≠ `OBJECT_NOT_FOUND`) | 1 |
| P1 | §8 PM-Live management endpoints | 14 |
| P1 | §9 PM-12 quarterly / attribution / portfolio-book / board-pack | 10 |
| P2 | `GET /bff/command-confirmations/{token}` route | 1 |
| P2 | Naming alignment for `paths.mgmt*` PM-9 / PM-12 (FE builder vs BE path) | 5 |
| P3 | Consolidate snake_case duplicate routes (12 families) | 12 |

---

## FE-side status

**Zero changes required.** `withLiveOrMock + safeAdapt` (src/lib/bff-v1/) already
degrades to mock when any of (a) CORS preflight fails, (b) envelope doesn't
match, or (c) endpoint 404s. The `bff.search live transport failed (strict mode):
Failed to fetch` runtime error in the preview is a direct symptom of (a) — it
will self-resolve the moment CORS is fixed.

---

## Conclusion

BE team's "complete" claim is accurate for **entity registries + detail-by-id +
actions + v5 + agora** (≈ 63/87 canonical + 160 bonus). However:

- **Both P0 blockers (CORS, error envelope) remain** — these alone keep the
  preview at 0 % live coverage despite the work that's landed.
- **The entire §8/§9 Management batch (24 endpoints) is still 0/24** — this is
  what powers the Management Oversight pages the user is currently viewing
  (`/management/portfolio-book` etc.).

Once CORS + envelope are fixed and §8/§9 land, FE will be 100 % live-ready
with no further frontend work.
