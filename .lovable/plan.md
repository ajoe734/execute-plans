## 問題
左側「對話紀錄」只有在 BFF `/bff/management/nl/ask` 回傳 `data.sessionId` 後（`AgentPanelBody.tsx` L612 / L632 的 `upsertSessionIndex`）才會新增。所以：
- 按 `+` 開新對話 → 左側不會立刻多一筆（這是設計上的留白）
- 但即使送出第一則訊息，只要 BFF 回應還沒回來、或回應 degraded 沒給 `sessionId`、或 transport_failure，左側就永遠不會出現該對話 → 使用者覺得「新對話消失了」
- 截圖正是這個狀態：header 顯示 `new session · 1 則訊息`，但 sidebar 仍只有兩筆舊對話

## 修法（純前端，不動 BFF）
在 `src/management/components/agent/AgentPanelBody.tsx`：

1. **送出第一則訊息時立刻建立 client-side sessionId**，並寫入 sidebar
   - 在 `submit()` 內，若 `sessionId == null`，先 `mkClientSessionId()` 產生 `cli_xxx`，立刻 `setSessionId` + `activeSessionRef.current = cli_xxx` + `upsertSessionIndex(cli_xxx, question | filename)`
   - 用該 id 作為 `requestBucket`，turns cache 也立即落到該 id

2. **BFF 回應時 reconcile 成 BFF sessionId**
   - 若 result 帶回 `sessionId` 且不同於 client id：
     - 從 sessions index 移除 client id、新增 BFF id（保留 title / updatedAt）
     - `clearTurnsCache(cli id)` → `saveTurnsCache(bff id, turns)`
     - `setSessionId(bff id)`、`activeSessionRef.current = bff id`
   - 若 BFF 沒給 sessionId（degraded / transport_failure）：保留 client id，使用者下一輪仍能繼續同一條 thread（送出時若 sessionId 是 `cli_*` 則 **不** 傳給 BFF — 維持 `sessionId: undefined`，避免 BE 收到不認識的 id）

3. **送 BFF 時過濾 client-side id**
   - `askManagementAi({ sessionId: sessionId?.startsWith("cli_") ? null : sessionId, ... })`

4. **小細節**
   - `loadSession(cli_id)` 仍能 hydrate 本地 cache，但呼叫 `resync` 時若是 `cli_*` 直接 short-circuit（不打 BFF，免得 404）
   - `deleteSession` 對 cli id 一樣可用
   - sidebar 顯示時 `cli_*` 的 id 截斷顯示沒問題；可選擇對 cli id 加灰色「本地」小標（範圍內加，不擴張）

## 驗證
- 開新對話 → 送一則訊息 → 左側立刻出現該對話、active 高亮
- BFF degraded 回應後，左側那筆仍在；再送一則仍是同一筆
- BFF 成功回應後，sidebar 該筆的 id 從 `cli_*` 變成 BFF 真實 sessionId，刷新後仍能 Resync
- 既有 BFF id 對話不受影響

## 不動範圍
- BFF / `managementAi.ts` 契約
- degraded callout、provider status pill、attachment 流程

檔案：`src/management/components/agent/AgentPanelBody.tsx`（單檔）
