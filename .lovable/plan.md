# BFF Backend Re-Probe 2026-05-25 — Gap Status After BE "Done" Claim

## TL;DR

BE 團隊回報「完成」但實測 **仍有 27 條缺漏 + 2 條 blocker（CORS、error envelope）+ naming divergence**。FE 0 改動，純文件交付。

## 實測結果（vs 2026-05-24 delta）

Live probe `https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io/openapi.json`（HTTP 200，225 條 `/bff/*` paths）

### ✅ 新落地
- `POST /bff/approvals/batch-decide`（先前 P0 唯一缺口）→ **已存在**
- 大量新增 entity action 路徑（snake_case 版）、`/bff/sse/*` 9 條 dedicated SSE、`/bff/v1/commands`、`/bff/audit/events`、`/bff/audit/export`、`/bff/feature-flags`、`/bff/capabilities`、`/bff/switch-tenant`、`/bff/auth/dev-login`、`/bff/healthz`、`/bff/readyz`、`/bff/personas/{id}/{activity,audit,capabilities,skills,tools,test-prompt}`、`/bff/strategies/{id}/{artifacts,audit,dry-run,experiments,lineage,ooda}`、`/bff/reviews/*`、`/bff/risk/alerts/*`、`/bff/synthesis/conflict-logs`、`/bff/ooda/packets`、`/bff/research/tasks`、`/bff/experiments`、`/bff/agora/*` 大量擴充

### ❌ 仍缺漏 — 27 條

**§8 PM-Live Management — 14 條全部 404**（cockpit / persona-league {rankings,movers,heatmap} / strategy-allocation / capital-flow / risk-radar / incident-timeline / governance-ledger / cost-attribution / sentinel-pulse / loop-throughput / hiq-backlog / intervention-stream）

**§9 PM-12 quarterly/attribution — 10 條全部 404**（quarterly-ranking[/drilldown] / performance-attribution[/by-{persona,strategy,pool}] / portfolio-book[/positions,/exposure] / board-pack）

**其他 — 3 條**
1. `GET /bff/command-confirmations/{token}` 404（POST collection 有，GET-by-token 缺）
2. `POST /bff/management/portfolio-book` family（FE canonical `paths.mgmtPortfolioHoldings/Pools` 對應 0 路徑）
3. `GET /bff/management/persona-fleet`、`/human-inbox`、`/trading-pulse`、`/evolution-journal`、`/evidence` 等 FE `paths.mgmt*` builders 對應 0 路徑（與 §8 重疊但 builder 命名不同，列出供 BE 對齊）

### 🚨 Blockers — 仍未修

| 項目 | 狀態 | 影響 |
|---|---|---|
| CORS preflight | `OPTIONS` 仍回 **400**、empty `Access-Control-Allow-Origin`（ACAH 列表已備好但中介層沒套用到 OPTIONS） | 瀏覽器封鎖所有 `/bff/*` 呼叫 — 這就是 console 一直看到 `Failed to fetch` 的根因 |
| Error envelope | 仍為 `{"detail":{"error":{...}}}`，缺 `meta.correlationId`，且回 `OBJECT_NOT_FOUND`（非 Pack D §D21 canonical 26 codes，應為 `RESOURCE_NOT_FOUND`） | FE `safeAdapt` 全面 fallback mock；audit trail 失去 correlation |

### ⚠ Naming divergence（非阻塞）

BE 同時暴露多套命名（FE 不會用，但建議收斂）：
- `/bff/personas/{id}` ✅ + `/bff/personas/{persona_id}` 重複
- `/bff/mcp-servers/*` ✅ + `/bff/mcp/servers/*` 重複
- `/bff/ranking-formulas` ✅ + `/bff/ranking/formulas` 重複
- `/bff/capital-pools/{id}` ✅ + `/bff/capital-pools/{pool_id}` 重複

## 交付

純文件，無 FE 程式碼變更：

1. **新增** `.lovable/audits/bff-backend-gap-2026-05-25-delta-v3.md` — 上述完整內容 + 給 BE 的 action items 表
2. **更新** `.lovable/audits/INDEX.md` — 在「BFF Backend Live Probe 系列」表加 `2026-05-25-delta-v3 (LATEST — SUPERSEDES 05-24)`，把 05-24 標記為 superseded
3. **更新** `mem://index.md` Core 區的 BFF probe 一行 — 改為 `2026-05-25 LATEST：~63/87 + batch-decide ✅，剩 27 缺漏（24 §8/§9 + 1 confirm-token GET + 2 naming alias 對齊建議），CORS 仍 broken、envelope 仍未對齊 Pack D §D21`
4. **更新** `.lovable/plan.md` — 加入 `Pack BE-Gap-Delta-v3 2026-05-25` done 紀錄

## 給 BE 的 action items（會寫進 audit 檔）

| 優先 | 項目 | 數量 |
|---|---|---:|
| P0 | CORS middleware 套到 OPTIONS（preflight 必須 204） | 1 |
| P0 | Error envelope 去 `detail` 外層 + 加 `meta.correlationId` + 換 `RESOURCE_NOT_FOUND` | 1 |
| P1 | §8 PM-Live management endpoints | 14 |
| P1 | §9 PM-12 quarterly/attribution | 10 |
| P2 | `GET /bff/command-confirmations/{token}` | 1 |
| P3 | 命名收斂（移除 snake_case 重複別名） | 4 family |

## 不在範圍

- FE 程式碼變更（`withLiveOrMock + safeAdapt` 已能自動降級）
- BE 程式碼變更（這份是給 BE 的 gap report）
- 觸發 BE migration / deployment

---

## ✅ DONE 2026-05-25

- 寫入 `.lovable/audits/bff-backend-gap-2026-05-25-delta-v3.md`
- `.lovable/audits/INDEX.md` 加入 delta-v3 列、05-24 標 SUPERSEDED
- `mem://index.md` Core 區 BFF probe 一行更新至 2026-05-25
