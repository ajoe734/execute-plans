
# Pack PM-BE-Gap: 完整 BFF 缺漏盤點（給後端 pantheon repo）

## 目標

把 FE 目前 `src/lib/bff-v1/paths.ts` + `management.ts` 所有 canonical path（含 2026-05-22 新增 PM-Live / PM-12 共 22 條 management 路徑）對照 2026-05-09 live probe 結果與最新網路請求記錄，輸出一份單一權威盤點檔，給後端 lupin 團隊照表實作。

## 交付物

**新增** `.lovable/audits/bff-backend-gap-2026-05-23.md`，包含：

### §1. Executive Summary
- 探測時間、目標 URL（lupin dev）、總缺漏數
- 目前 FE catalogued path 總數：**約 87 條**（含 PM-Live 14 + PM-12 11 新增）
- 已實作：4（`/health`、`/bff/events/stream`、`/bff/approvals` 401-gated、`/bff/v5/interventions` 401-gated、`/bff/mcp-servers/{id}/import-tools` 401-gated）
- 未實作（404 或未驗證）：**~83 條**

### §2. P0 — Session bootstrap（阻塞所有 live 流程）
| Method | Path | 用途 |
|---|---|---|
| GET  | `/bff/me` | session/locale/capabilities/tenant/feature-flags bootstrap |
| PATCH | `/bff/me/locale` | UI locale 持久化 |
| POST | `/bff/auth/refresh` | token refresh |
| POST | `/bff/logout` | session 結束 |
| GET  | `/openapi.json` | **目前 500** — FE/QA 自描述 |

### §3. P0 — Decision endpoints（list 已 401，但 decide 缺）
- `POST /bff/approvals/{id}/decide`
- `POST /bff/approvals/batch-decide`
- `POST /bff/v5/interventions/{id}/decide`
- `POST /bff/alerts/{id}/acknowledge`

### §4. P0 — Canonical action endpoint
- `POST /bff/actions/{entityType}/{entityId}/{actionId}`（Final OpenAPI §1772）
- 影響：所有 entity 的高風險動作（含 confirm-token flow）
- 對應 `POST /bff/confirm-tokens`、`GET /bff/confirm-tokens/{id}`、`POST /bff/confirm-tokens/{id}/redeem`、`POST /bff/command-confirmations`

### §5. P1 — Entity registries（CRUD list / get）
列出 27 條：strategies, strategy/{id}, strategy/{id}/specs, personas, persona/{id}, persona/{id}/route-policy, persona/{id}/evaluations, persona/{id}/memory, capital-pools(+{id}), rebalances(+{id}), deployments(+{id}), evolution-programs(+{id}/runs/{id}/candidates), jobs(+{id}), alerts, incidents(+{id}), audit, artifacts(+{id}), runtimes, mcp-servers, mcp-tools, skills, channels, tools, ranking-formulas, research-experiments, search

### §6. P1 — Agora（6 條）
signals, inbox, journal, postmortems, ask/sessions(+{id})

### §7. P1 — v5 closed-loop（5 條）
loop-runs(+{id}), sentinel/findings, v5/execution/persona-health（interventions 已實作）

### §8. P1 — **NEW** Management Oversight（PM-Live, 14 條，2026-05-22 加入）
| Path | 對應頁面 |
|---|---|
| `GET /bff/management/cockpit` | One-Ring Cockpit |
| `GET /bff/management/persona-fleet` | Persona Fleet |
| `GET /bff/management/human-inbox` | Human Inbox |
| `GET /bff/management/human-inbox/{id}` | HumanGateDetail |
| `GET /bff/management/trading-pulse` | Trading Pulse |
| `GET /bff/management/trading-pulse/rankings` | Trading Pulse rankings |
| `GET /bff/management/evolution-journal` | Evolution Journal |
| `GET /bff/management/evidence` | Evidence Explorer |
| `GET /bff/management/persona-intent` | PersonaIntentTraces |
| `GET /bff/management/readiness/ep5` | Ep5CanaryReadiness |
| `GET /bff/management/readiness/broker-live` | BrokerLiveReadiness |
| `GET /bff/management/readiness/capital-binding-live` | CapitalBindingLiveReadiness |
| `GET /bff/management/readiness/bff-ha` | BffHaReadiness |
| `GET /bff/management/readiness/strict-publish` | StrictPublishAudit |

### §9. P1 — **NEW** Management Performance（PM-12, 8 條，2026-05-22 加入）
| Path | 對應頁面 |
|---|---|
| `GET /bff/management/portfolio-book` | PortfolioBook summary |
| `GET /bff/management/portfolio-book/pools` | PortfolioBook pools tab |
| `GET /bff/management/portfolio-book/holdings` | PortfolioBook holdings tab |
| `GET /bff/management/persona-league` | PersonaLeague list |
| `GET /bff/management/persona-league/rankings` | PersonaLeague rankings |
| `GET /bff/management/persona-league/tiers` | PersonaLeague tiers |
| `GET /bff/management/quarterly-ranking?quarter=YYYY-Qn` | QuarterlyRanking list |
| `GET /bff/management/quarterly-ranking/formula` | formula version |
| `GET /bff/management/quarterly-ranking/recommendations?quarter=...` | promote/demote 建議 |
| `GET /bff/management/performance-attribution?dimension=&period=` | PerformanceAttribution |

### §10. Schema / DTO 對齊提醒
- 每組 endpoint 直接引用 FE seed shape 作為 reference（`src/lib/v5/management/*.ts` 的 `default*()` 函式即是合約預期形狀）
- response envelope：採 Final OpenAPI 既定（`data` / `error` / `meta.correlationId`）
- 高風險動作須回 `ActionCommandStatus` named enum
- SSE `correlationId` 必填

### §11. 優先序建議
1. **Block-1 (P0)**：§2 + §3 + §4 + `/openapi.json` 修復
2. **Block-2 (P1-core)**：§5 entity registries + §6 Agora
3. **Block-3 (P1-management)**：§8 PM-Live + §9 PM-12（FE 已 100% 完成 + safeAdapt fallback，後端按 shape 補即可）
4. **Block-4 (P1-v5)**：§7 v5 loop/sentinel

### §12. FE 端目前的容錯設計（後端可放心漸進實作）
- `VITE_BFF_MODE=mock` 為 default
- `VITE_BFF_FALLBACK=auto` — 任一 path 404/500 自動退回 seed
- 所有 management endpoint 已套 `withLiveOrMock + safeAdapt`，schema 不符也不會炸 UI

## 流程
1. 讀 `src/lib/bff-v1/paths.ts`、`management.ts` 抽出 87 條 canonical path 表
2. 對照 2026-05-09 probe 結果（`bff-live-probe-2026-05-09.md`）與 2026-05-13 baseline probe 補新狀態
3. 寫成單檔 markdown
4. 更新 `mem://index.md` 加一行指向新檔
5. 不動任何 runtime code

## 不做
- 不改 `paths.ts` / `management.ts`
- 不重新跑 live probe（會被 CORS 擋）
- 不動後端 repo
