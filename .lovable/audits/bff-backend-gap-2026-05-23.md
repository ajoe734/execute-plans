# BFF Backend Gap — 完整盤點給 pantheon (lupin) 後端
Date: 2026-05-23
Target: `https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io`
Source of truth (FE):
- `src/lib/bff-v1/paths.ts` — 所有 canonical path builder
- `src/lib/bff-v1/management.ts` — 2026-05-22 PM-Live + PM-12 façade
- `.lovable/audits/bff-live-probe-2026-05-09.md` — 上次匿名 probe（43 條，9% 命中）
- `.lovable/audits/baseline/bff-route-probe-anonymous-2026-05-13.md` — 2026-05-13 baseline
- Live preview 網路紀錄 (2026-05-22/23)：`/bff/me`、`/bff/jobs`、`/bff/search`、`/bff/alerts`、`/bff/approvals`、`/bff/management/portfolio-book`、`/bff/management/portfolio-book/pools`、`/bff/management/portfolio-book/holdings` 全 `Failed to fetch`（CORS 或 404）

---

## §1. Executive Summary

- FE catalogued canonical paths：**~87 條**（含 2026-05-22 新增 management 22 條）
- 後端已實作：**4 / 87 ≈ 5%**
  1. `GET /health`（200）
  2. `GET /bff/events/stream`（200，anonymous SSE）
  3. `GET /bff/approvals`（401，auth-gated）
  4. `GET /bff/v5/interventions`（401，auth-gated）
  5. `POST /bff/mcp-servers/{id}/import-tools`（401，auth-gated）
- 待實作或破損：**~83 條 + `/openapi.json` 500**
- FE 已全面套用 `VITE_BFF_FALLBACK=auto` 與 `withLiveOrMock + safeAdapt`：後端可以**漸進**上線，任何 404/500/schema 不符 UI 都會回退 seed，不會炸。

---

## §2. P0 — Session Bootstrap（阻塞所有 live 流程）

| Method | Path | 用途 | 現狀 |
|---|---|---|---|
| GET   | `/bff/me` | session / locale / capabilities / tenant / featureFlags / role bootstrap | 404 |
| PATCH | `/bff/me/locale` | UI locale 持久化 | 404 |
| POST  | `/bff/auth/refresh` | token refresh | 404 |
| POST  | `/bff/logout` | session 結束 | 404 |
| GET   | `/openapi.json` | FE/QA 自描述（Swagger UI 依賴） | **500（spec 生成壞掉）** |

> 沒有 `/bff/me` ⇒ FE 永遠跑在 anonymous 模式，所有 auth-gated route 即使實作了也用不到。

---

## §3. P0 — Decision Endpoints（list 已 401，但 decide 缺）

| Method | Path |
|---|---|
| POST | `/bff/approvals/{id}/decide` |
| POST | `/bff/approvals/batch-decide` |
| POST | `/bff/v5/interventions/{id}/decide` |
| POST | `/bff/alerts/{id}/acknowledge` |

> 這 4 條補完，整個 approvals → decide 與 interventions → decide 的 live loop 就通了。

---

## §4. P0 — Canonical Action Endpoint + Confirm-Token Lifecycle

| Method | Path | 備註 |
|---|---|---|
| POST | `/bff/actions/{entityType}/{entityId}/{actionId}` | Final OpenAPI §1772 canonical |
| POST | `/bff/confirm-tokens` | 高風險動作 token 申請 |
| GET  | `/bff/confirm-tokens/{tokenId}` | 查詢 |
| POST | `/bff/confirm-tokens/{tokenId}/redeem` | 兌換 |
| POST | `/bff/command-confirmations` | 提交 token + commandId |
| GET  | `/bff/command-confirmations/{token}` | 查詢結果 |

> 影響：所有 entity 的 high-risk action（含 two-man / break-glass / cooldown）。Response 須符合 `ActionCommandStatus` named enum。

---

## §5. P1 — Entity Registries（list / get，共 27 條）

| Method | Path |
|---|---|
| GET  | `/bff/strategies` |
| GET  | `/bff/strategies/{id}` |
| GET  | `/bff/strategies/{id}/specs` |
| GET  | `/bff/personas` |
| GET  | `/bff/personas/{id}` |
| GET  | `/bff/personas/{id}/route-policy` |
| GET  | `/bff/personas/{id}/evaluations` |
| GET  | `/bff/personas/{id}/memory` |
| GET  | `/bff/capital-pools` |
| GET  | `/bff/capital-pools/{id}` |
| GET  | `/bff/rebalances` |
| GET  | `/bff/rebalances/{id}` |
| GET  | `/bff/deployments` |
| GET  | `/bff/deployments/{id}` |
| GET  | `/bff/evolution-programs` |
| GET  | `/bff/evolution-programs/{id}` |
| GET  | `/bff/evolution-programs/{id}/runs` |
| GET  | `/bff/evolution-programs/{id}/candidates` |
| GET  | `/bff/jobs` |
| GET  | `/bff/jobs/{id}` |
| GET  | `/bff/alerts` |
| GET  | `/bff/incidents` |
| GET  | `/bff/incidents/{id}` |
| GET  | `/bff/audit` |
| GET  | `/bff/artifacts` |
| GET  | `/bff/artifacts/{id}` |
| GET  | `/bff/runtimes` |
| GET  | `/bff/mcp-servers` |
| GET  | `/bff/mcp-tools` |
| GET  | `/bff/skills` |
| GET  | `/bff/channels` |
| GET  | `/bff/tools` |
| GET  | `/bff/ranking-formulas` |
| GET  | `/bff/research-experiments` |
| GET  | `/bff/search?q=...` |

> 所有 list endpoint 應遵守 Pack D §cursor pagination + 標準 error envelope。

---

## §6. P1 — Agora（6 條）

| Method | Path |
|---|---|
| GET  | `/bff/agora/signals` |
| GET  | `/bff/agora/inbox` |
| GET  | `/bff/agora/journal` |
| GET  | `/bff/agora/postmortems` |
| GET  | `/bff/agora/ask/sessions` |
| GET  | `/bff/agora/ask/sessions/{id}` |

---

## §7. P1 — v5 Closed-Loop OS（5 條）

| Method | Path |
|---|---|
| GET  | `/bff/v5/loop-runs` |
| GET  | `/bff/v5/loop-runs/{id}` |
| GET  | `/bff/v5/sentinel/findings` |
| GET  | `/bff/v5/execution/persona-health` |
| GET  | `/bff/v5/interventions/{id}` |

---

## §8. P1 — **NEW** Management Oversight (PM-Live, 14 條)

加入時間：2026-05-22。對應 `src/lib/v5/management/*.ts` 的 seed shape。

| Method | Path | 對應 FE 頁面 / seed |
|---|---|---|
| GET | `/bff/management/cockpit` | One-Ring Cockpit / `defaultCockpit()` |
| GET | `/bff/management/persona-fleet` | Persona Fleet / `defaultPersonaFleet()` |
| GET | `/bff/management/human-inbox` | Human Inbox / `defaultHumanInbox()` |
| GET | `/bff/management/human-inbox/{id}` | HumanGateDetail |
| GET | `/bff/management/trading-pulse` | Trading Pulse / `defaultTradingPulse()` |
| GET | `/bff/management/trading-pulse/rankings` | Trading Pulse rankings |
| GET | `/bff/management/evolution-journal` | Evolution Journal |
| GET | `/bff/management/evidence` | Evidence Explorer |
| GET | `/bff/management/persona-intent` | PersonaIntentTraces |
| GET | `/bff/management/readiness/ep5` | Ep5CanaryReadiness |
| GET | `/bff/management/readiness/broker-live` | BrokerLiveReadiness |
| GET | `/bff/management/readiness/capital-binding-live` | CapitalBindingLiveReadiness |
| GET | `/bff/management/readiness/bff-ha` | BffHaReadiness |
| GET | `/bff/management/readiness/strict-publish` | StrictPublishAudit |

---

## §9. P1 — **NEW** Management Performance (PM-12, 10 條)

加入時間：2026-05-22。對應 `src/lib/v5/management/{portfolio,personaLeague,quarterlyRanking,performanceAttribution}.ts`。

| Method | Path | FE seed |
|---|---|---|
| GET | `/bff/management/portfolio-book` | `defaultPortfolioBook()` (summary) |
| GET | `/bff/management/portfolio-book/pools` | `defaultPortfolioPools()` |
| GET | `/bff/management/portfolio-book/holdings` | `defaultPortfolioHoldings()` |
| GET | `/bff/management/persona-league` | `defaultPersonaLeague()` |
| GET | `/bff/management/persona-league/rankings` | (rankings tab) |
| GET | `/bff/management/persona-league/tiers` | (tier config) |
| GET | `/bff/management/quarterly-ranking?quarter=YYYY-Qn` | `defaultQuarterlyRanking()` |
| GET | `/bff/management/quarterly-ranking/formula` | `defaultQuarterlyFormula()` (version `1.0.0`) |
| GET | `/bff/management/quarterly-ranking/recommendations?quarter=...` | promote/demote 建議 |
| GET | `/bff/management/performance-attribution?dimension=&period=` | `defaultPerformanceAttribution()` |

---

## §10. Schema / DTO 對齊提醒

- **Response envelope**：Final OpenAPI（`data` / `error` / `meta.correlationId`）
- **Error codes**：26 條 canonical（Pack D §D21）
- **Action commands**：必回 `ActionCommandStatus` named enum
- **SSE**：`correlationId` 為 required（AsyncAPI §1.0）
- **EvidenceKind**：19+3 enum（Pack D §D-EvidenceKind）
- **Seed = contract**：每一個 management endpoint 的 response shape，請以 `src/lib/v5/management/*.ts` 的 `default*()` pure function 為唯一參考（已隨 PM-Live + PM-12 落地），不要重新發明欄位名稱。

---

## §11. CORS / Preview 觀察

最新 preview 紀錄顯示 `https://id-preview--*.lovable.app` origin 對 lupin dev 的請求全部 `Failed to fetch`。建議後端確認：

```
Access-Control-Allow-Origin: https://id-preview--b75d3452-f667-4cf4-893a-1061de45b347.lovable.app, https://b75d3452-f667-4cf4-893a-1061de45b347.lovableproject.com, https://pantheon-dev.lovable.app
Access-Control-Allow-Headers: authorization, accept, accept-language, content-type, x-bff-api-version, x-correlation-id, x-request-id
Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS
Access-Control-Expose-Headers: x-correlation-id, x-request-id
```

否則即使 endpoint 都實作了，preview 仍會 strict-mode `Failed to fetch`。

---

## §12. 優先序建議

| Block | 範圍 | 條數 | 解鎖效果 |
|---|---|---:|---|
| **B1 (P0)** | §2 + §3 + §4 + `/openapi.json` 修復 + CORS | 14 | 整套 auth + action + decide loop 可 live |
| **B2 (P1-core)** | §5 entity registries + §6 Agora | 33 | 90% 主流頁面可 live |
| **B3 (P1-mgmt)** | §8 PM-Live + §9 PM-12 | 24 | 整套 management oversight + performance live；FE 已 100% adapter-ready |
| **B4 (P1-v5)** | §7 v5 loop / sentinel / persona-health | 5 | v5 closed-loop OS 可 live |

合計 **76 條** P0/P1（不含 deprecated alias 與 mock-only path）。

---

## §13. FE 端容錯設計（後端可放心漸進實作）

- `VITE_BFF_MODE=mock` 為 default（`.env.example`）；live 切換靠 `VITE_BFF_MODE=live`
- `VITE_BFF_FALLBACK=auto` — 任一 path 404/500/schema invalid 自動退回 seed
- 所有 management endpoint 已套 `withLiveOrMock + safeAdapt`：schema 漂移不會 crash
- `ensureCorrelationId()` 自動補 `x-correlation-id` header
- `setAuthProvider()` 已掛好 Bearer token 注入
- `liveStatus` banner 會在 live mode 自動顯示後端 reachability

---

## §14. Out of Scope

- 不含 FE 應自行解決的 mock-only path（`writeOverlay` GC、UI overlay TTL 等）
- 不含 deprecated alias（`/bff/session/*`、`/bff/strategies/{id}/actions/{action}` 等）— FE 仍指向 canonical
- 不含 `/bff/health*` / `/bff/docs`（已實作）
