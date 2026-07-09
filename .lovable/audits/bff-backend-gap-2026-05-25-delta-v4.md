# BFF Backend Gap — Delta-v4 Audit 2026-05-25 (late)

Second re-probe of the same day after BE landed another large batch.

- Live target: `https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io`
- OpenAPI: `GET /openapi.json` → HTTP 200, **270** `/bff/*` paths (was 225)
- Supersedes: `bff-backend-gap-2026-05-25-delta-v3.md`

---

## Summary

| Bucket                          | delta-v3 (05-25 AM) | delta-v4 (05-25 late) |
|---------------------------------|--------------------:|----------------------:|
| Canonical paths implemented     | ~63 / 87            | **~86 / 87**          |
| Still missing (canonical)       | 27                  | **0–1**               |
| Total live `/bff/*` paths       | 225                 | **270**               |
| P0 blockers                     | 2 (CORS + envelope) | **1 (CORS only)**     |
| Error envelope canonical        | ❌                  | **✅**                |
| §8 PM-Live Management (14)      | 0/14                | **14/14**             |
| §9 PM-12 (10)                   | 0/10                | **10/10**             |
| `GET /bff/command-confirmations/{token}` | ❌         | **✅**                |
| FE `paths.mgmt*` builders match | partial             | **full**              |

---

## ✅ Landed since delta-v3

### §8 PM-Live Management — all 14 endpoints exist (sample probes 200)
`/bff/management/`{cockpit, persona-league, persona-league/rankings, persona-league/movers, persona-league/heatmap, persona-league/tiers, strategy-allocation, capital-flow, risk-radar, incident-timeline, governance-ledger, cost-attribution, sentinel-pulse, loop-throughput, hiq-backlog, intervention-stream}

### §9 PM-12 — all 10 endpoints exist
`/bff/management/`{quarterly-ranking, quarterly-ranking/drilldown, quarterly-ranking/formula, quarterly-ranking/recommendations, performance-attribution, performance-attribution/by-persona, performance-attribution/by-strategy, performance-attribution/by-pool, portfolio-book, portfolio-book/positions, portfolio-book/exposure, portfolio-book/holdings, portfolio-book/pools, board-pack}

### FE `paths.mgmt*` builder targets all present
`persona-fleet`, `persona-intent`, `human-inbox` (+`/{item_id}`), `trading-pulse` (+`/rankings`), `evolution-journal`, `evidence`, `nl/ask`, `readiness/{bff-ha,broker-live,capital-binding-live,ep5,strict-publish}` — 全部 200/registered.

### Confirm-token surface complete
`/bff/command-confirmations`, `/bff/command-confirmations/{token}`, `/bff/confirm-tokens`, `/bff/confirm-tokens/{tokenId}`, `/bff/confirm-tokens/{tokenId}/redeem`

### Error envelope now canonical (P0 fixed)

```json
GET /bff/strategies/__nonexistent__
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Strategy not found",
    "details": {"reason":"...", "precondition_failed":null, "suggestion":null}
  },
  "meta": { "correlationId": "17319081-80b9-4846-8c48-00f49ba36872" }
}
```

- `detail` wrapper removed ✅
- `OBJECT_NOT_FOUND` → `RESOURCE_NOT_FOUND` (Pack D §D21) ✅
- `meta.correlationId` present ✅

---

## 🚨 Remaining blocker — **CORS preflight (P0, unchanged)**

```
OPTIONS /bff/me
  Origin: https://id-preview--b75d3452-f667-4cf4-893a-1061de45b347.lovable.app
  Access-Control-Request-Method: GET
  Access-Control-Request-Headers: authorization,content-type
→ HTTP 400
  access-control-allow-credentials: true
  access-control-allow-headers: Accept, ..., Authorization, ...
  access-control-allow-methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
  access-control-max-age: 600
  (access-control-allow-origin: MISSING)
```

ACAH / ACAM / Max-Age 都 OK，但 OPTIONS 仍 **400 + 缺 ACAO**。瀏覽器 spec 要求 ACAO
明確 echo Origin（或 `*`，但帶 credentials 時不允許 `*`），且 preflight 必須 2xx。
這是 preview console `Failed to fetch` 的單一根因。

**最小修法（BE）**：CORS middleware 在 `req.method === "OPTIONS"` 時：
1. 短路 return **204 No Content**（不要進 router 導致 400）
2. echo 白名單 Origin 到 `Access-Control-Allow-Origin`：
   - `https://id-preview--b75d3452-f667-4cf4-893a-1061de45b347.lovable.app`
   - `https://b75d3452-f667-4cf4-893a-1061de45b347.lovableproject.com`
   - `https://pantheon-dev.lovable.app`
3. 加 `Access-Control-Expose-Headers: x-correlation-id, x-request-id`

---

## ⚠ P2 — Envelope 殘缺欄位（Pack D §D21 / §C027）

目前 envelope 缺：

- `error.i18nKey`（FE 用於 `t(errors.RESOURCE_NOT_FOUND)` 翻譯）
- `error.retryable: boolean`
- `error.userActionable: boolean`

FE 端 `src/lib/v4/errorEnvelope.ts` 預期完整 `BffErrorPayload`。沒有不會壞，但
toast/i18n/重試判斷會走 fallback。建議補上。

---

## ⚠ P3 — `correlationId` 命名

- Envelope 用 `meta.correlationId` ✅（符合 spec）
- Header 仍是 `x-correlation-id`（kebab）✅
- FE `normalizeRedactedEvidenceRef` 與 `ensureCorrelationId` 兩邊都已對齊，無 action。

---

## Action items for lupin BE（更新）

| 優先 | 項目 | 數量 |
|---|---|---:|
| **P0** | **CORS OPTIONS handler — return 204 + echo Origin into ACAO** | **1** |
| P2 | Error envelope 補 `i18nKey` / `retryable` / `userActionable` | 1 |
| P3 | （可選）收斂 snake_case duplicate routes（仍 12 families） | 12 |

§8 / §9 / command-confirmations / envelope 全部清掉。**只剩 CORS 一條 P0**。

---

## FE-side status

**Zero changes required.** 一旦 CORS 修好，`withLiveOrMock` 會立刻切到 live；
所有 §8/§9 Management 頁面、portfolio-book、quarterly-ranking、command
confirm-token flow 都能直接命中真實 BFF。
