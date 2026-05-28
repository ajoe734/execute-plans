# 計畫：write-path 真相對齊 + create_intervention 修正 + 全域 404 fallback

目的：把「BFF handoff COMPLETE」修正為「read-path COMPLETE / write-path 未驗證」，用真實 probe 拿到 write 端點實際狀態，修掉 spec 不存在的 `POST /bff/v5/interventions`，並讓所有 write 在 BE 未上線時優雅降級。

## A. 記憶與審計範圍修正

1. 改寫 `mem://index.md` Core，把「BFF handoff = COMPLETE」改為「**read-path** COMPLETE；**write-path** 未驗證 (P0-D / P1-A / P1-C / P1-E)」。
2. 新增 `mem://audits/bff-write-gap-2026-05-28`，列出四個 write 區塊 OPEN 狀態 + delta-v5 只覆蓋 GET 的事實。
3. 新增 `.lovable/audits/bff-backend-write-gap-2026-05-28.md`，內容含：
   - 範圍說明（delta-v5 = read only）
   - P0-D / P1-A / P1-C / P1-E 端點清單 + 預期狀態
   - 與 `Pantheon_BFF_Backend_Handoff.md` 批次對照

## B. 真實 write-path probe

擴充 `scripts/probe-bff-authenticated-live.mjs`（或新增 `scripts/probe-bff-write-paths.mjs`），加入：

- **P0-D create**：`POST /bff/strategies` `/personas` `/capital-pools` `/rebalances` `/deployments` `/runtimes` `/ranking-formulas` `/research-experiments` `/skills`（共 9 條，dry-run payload）
- **P1-A action**：`POST /bff/actions/strategies/{id}/promote_live|pause|throttle|archive|edit`（取樣 5 條）
- **P1-C v5 write**：`POST /bff/v5/sentinel/findings/{id}/status` `/sentinel/remediation/build` `/interventions/{id}/claim|release|escalate|decide|two-man-sign` `/interventions/batch-decide`（共 8 條）
- **P1-E agora write**：`POST /bff/agora/signals` `/agora/feedback` `/agora/inbox/{id}/triage` `/agora/journal` `/agora/skill-coaching` `/agora/postmortems` `/agora/ask/sessions`（共 7 條）

每條期望：200/201/202（已上線）、404（未實作）、501（明確未實作）、4xx typed envelope（precondition）。輸出 markdown 表格到 `.lovable/audits/bff-backend-write-probe-2026-05-28.md`。

## C. 修 create_intervention 工具

Spec 沒有 `POST /bff/v5/interventions`，只有 `/{id}/decide`。Interventions 是 Sentinel remediation 自動產生，不是直接 POST create。

1. `supabase/functions/management-agent/index.ts`：移除 `create_intervention` 直接打 `POST /bff/v5/interventions` 的分支；改為兩個工具：
   - `decide_intervention(id, decision, memo)` → `POST /bff/v5/interventions/{id}/decide`
   - `request_sentinel_remediation(findingId, plan)` → `POST /bff/v5/sentinel/remediation/build`（會自動生 intervention）
2. 更新 agent system prompt：說明 intervention 不能直接 create，需從 Sentinel finding 走 remediation 流程。
3. FE 端 `createEntity.ts` 移除 `intervention` 從 `CreatableEntity`，或改成 overlay-only（標 dev-only badge）。

## D. 全域 FE write fallback

新增 `src/lib/bff-v1/writeFallback.ts`：

- 包一個 `withWriteFallback<T>(fn, { entity, payload })`：執行 BE write；若 `404 / 501 / NOT_IMPLEMENTED / METHOD_NOT_ALLOWED` 則：
  1. 寫入 `writeOverlay`（30min TTL）
  2. 發 `realtime.emitEnvelope` 模擬成功
  3. 觸發全域 banner（`LiveBffBanner` 加紅色 badge：「BE write endpoint not live — local draft only (30min TTL)」）
- 接入點：`src/lib/bff/mutations.ts`、`src/lib/bff/commandClient.ts`、`src/lib/bff/runAction.ts`、`src/lib/bff-v1/v5.ts` 的所有 POST。
- `LiveStatusBanner.tsx` 加 `writeDegraded` 狀態 + 計數（過去 5min 有幾個 write fallback）。

## 技術細節

- 不動 read-path（已驗證 OK）
- writeOverlay 已有 idempotencyKey + correlationId chain，可直接用
- probe script 帶 `X-Dry-Run: 1` header 並用 `dev-*` ID 避免污染
- agent 工具改動需同步 `src/management/components/write/createEntity.ts` 的 entity 白名單

## 驗收

- `mem://index.md` Core 不再宣稱 write-path complete
- `.lovable/audits/bff-backend-write-probe-2026-05-28.md` 產出真實 status 表
- 使用者問 agent「建立 intervention」→ agent 解釋並導去 Sentinel remediation
- 任何 write 端點 404 不再噴錯，UI 顯示 degraded banner + overlay 生效
