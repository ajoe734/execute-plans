## 目標

修掉 `AgentPanelBody` 切換 session 時把畫面 `turns` 整碗覆蓋、且 in-flight request 會污染別的 session 的問題。範圍只在 FE，不動 BFF contract。

## 問題回顧（已在上一則訊息確認）

1. `loadSession → resync` 會 `setTurns(res.turns.map(...))` 直接覆蓋，BFF 回空或漏訊息就視覺消失。
2. `resync` 失敗時雖未清空，但成功分支無 merge / dedupe。
3. `submit()` 進行中切換 session，舊 response 回來會 `setTurns(prev => [...assistantTurn])` 塞進新 session。
4. 缺少使用者可見的「歷史載入失敗 / 為空」狀態，看起來像被截斷。

## 修改計畫

**檔案**：`src/management/components/agent/AgentPanelBody.tsx`（單檔，無新檔）

### A. resync：merge 而非 replace
- 改 `resync()`：以 `turn.id` 為 key 做 merge。BFF 回的 turns 為準（更新 `providerStatus` 等欄位），不在 BFF 結果內、但目前畫面已有的 turn 保留（避免歷史尚未持久化時就被抹掉）。
- 排序統一用 `createdAt` 升冪。
- BFF 回 `turns: []` 且目前 `turns.length > 0`：保留現有 turns，顯示一個輕量 inline 提示「BFF 未回傳歷史，顯示本地快取」（不是 degraded banner，避免誤導）。
- `resync` failure：保留現有 turns，inline 顯示「Resync 失敗：<reason>，點 Resync 重試」。

### B. abort in-flight on session switch
- 新增 `abortRef = useRef<AbortController | null>(null)` 與 `activeSessionRef = useRef<string | null>(null)`。
- `submit()` 開始時：建立新 `AbortController`、紀錄 `requestSessionId = sessionId`（可能 null = new）。
- `askManagementAi` 需要支援 `signal` 參數（見 D）。
- response 回來時比對 `requestSessionId` 與當下 `activeSessionRef.current`，不一致就丟棄、不 setTurns。
- `loadSession` / `startNewConversation` 進入時呼叫 `abortRef.current?.abort()`，並更新 `activeSessionRef`。

### C. pending 時切換的 UX
- 切換 session 時若 `pending`：abort + 清 `pending=false`，並在新 session 顯示一次性 toast / inline note「上一則對話的請求已取消」。
- Sessions sidebar 在 `pending` 時保留可點（abort），但加 `cursor-progress` 視覺提示。

### D. `askManagementAi` 加 `signal`
- `src/lib/bff-v1/managementAi.ts`：`askManagementAi(params)` 新增可選 `signal?: AbortSignal`，內部 fetch 帶上。abort 時回傳 `{ kind: "aborted" }`（新 result variant），讓 caller 知道不要 setTurns。
- `AgentPanelBody` 處理 `kind === "aborted"`：no-op。

### E. 診斷 log（開發環境）
- `resync` 結束加 `console.debug("[mgmtAi] resync", { sessionId, received: res.turns.length, mergedTotal })`，方便日後驗證 BE 是否真的回了全部歷史。

### F. 不動的部分
- `RECENT_TURNS_LIMIT = 12`：這只影響傳給 BE 的 context，不影響畫面顯示，保留。
- `startNewConversation` 清空行為（有意）：保留。
- localStorage `SESSION_INDEX_KEY`：不動。
- BFF 任何 contract / endpoint：不動。

## Definition of Done

- 切換 session 後，畫面 turns 不會無聲消失；BFF 回空時保留本地畫面 + inline 提示。
- 切換 session / 開新對話會 abort in-flight request，舊回應不會塞進新 session。
- `resync` 失敗有可見的 inline 訊息與重試入口。
- 既有 366 test 仍綠（本變更不該破壞 mock 模式或 contract test）。
- 手動驗證：
  1. 連送 3 則 → 切到別的 session → 切回來：3 則仍在。
  2. 送 1 則尚未回應時切到別的 session：舊回應不會出現在新 session，原 session 切回顯示 user message + 「請求已取消」提示。
  3. 把 BFF `conversations/{id}` mock 成 `turns: []`：畫面保留本地快取，不空白。

## 技術細節 / Diff shape

`AgentPanelBody.tsx`
- 加 `abortRef`、`activeSessionRef`。
- `resync` 改寫：merge by id，sort by createdAt，空回應 / 失敗都不清空。
- 新增 state `resyncNotice: string | null` 渲染在 ProviderStatusBar 下方。
- `submit` 用 abort controller + session guard。
- `loadSession` / `startNewConversation` 先 abort。

`src/lib/bff-v1/managementAi.ts`
- `askManagementAi` 簽章加 `signal?: AbortSignal`，傳入 fetch。
- `ManagementAiResult` union 加 `{ kind: "aborted" }`。
- `AbortError` 捕捉 → 回 `aborted`，不變成 `transport_failure`。
