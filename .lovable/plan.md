## 目標
Management AI 聊天視窗：在 A 對話送出後可立刻切到 B 對話繼續送，A 的請求不會被取消；A 回覆回來時自動寫入該 thread cache + sidebar 排序更新；點回 A 看得到回覆。

## 變更檔案
`src/management/components/agent/AgentPanelBody.tsx` (僅此一檔)

## 主要改動

### 1. State / Ref 重構
- 移除 `pending: boolean` → 新增 `pendingSessions: Record<string, true>` state。
- 移除 `abortRef: useRef<AbortController | null>` → 新增 `inflightRef: useRef<Map<string, AbortController>>`。
- 新增 `turnsRef: useRef<ChatTurn[]>` 並用 `useEffect` 與 `turns` 同步，供 submit 完成後讀最新值。
- 衍生：`const pending = sessionId ? !!pendingSessions[sessionId] : false;`（active session 才禁用送出，沿用既有 `pending` 用法）。

### 2. 切換對話 / 開新對話 — 不再 abort
- `loadSession`：拿掉 `abortInflight("switch")`。如果切到的 session 還在 inflight，顯示 notice「此對話仍在等待 BFF 回覆…」。
- `startNewConversation`：拿掉 `abortInflight("new")`。背景請求繼續跑。
- `abortInflight` helper 整個移除；`deleteSession` 改為：若該 sid 還在 inflight，個別 abort + 從 map 移除 + 從 pendingSessions 移除。

### 3. `submit()` 改寫
- key 用 `localSessionId`（cli_ 或現有 sid）。
- `inflightRef.current.set(localSessionId, controller)` + `setPendingSessions(p => ({ ...p, [localSessionId]: true }))`。
- 新 helper `appendTurnTo(sid, turn)`：
  - 若 `activeSessionRef.current === sid`：用 `turnsRef.current` 為 base，`setTurns(next)` + `saveTurnsCache`。
  - 否則：讀 `loadTurnsCache(sid)` 為 base，`saveTurnsCache` 寫回（不動 view state）。
- 結果處理：
  - **不再**用 `activeSessionRef.current !== requestBucket` 丟棄結果。
  - assistant turn 一律 `appendTurnTo(reconciledSid, turn)`。
  - `setTraceId` / `setDegraded` 只在仍為 active session 時呼叫。
  - `upsertSessionIndex(reconciledSid, titleSeed)` 永遠呼叫，讓 sidebar 排到最上。
- finally：從 `inflightRef` + `pendingSessions` 移除；只在仍 active 時才 re-focus input。

### 4. Sidebar — 每 row pending spinner
- `sessions.map` row 內，若 `pendingSessions[s.id]` 為 true，在 title 右側顯示 `<Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />`。
- 既有「整個側欄 cursor-progress」改為「只有 active session pending 才 cursor-progress」。

### 5. 送出按鈕 / 輸入框 disabled
- 維持 `disabled={pending}`（pending 已綁定到 active session），所以 B 對話的 inflight 不會擋 A 的輸入。

### 6. Unmount cleanup
- 新增 `useEffect(() => () => { inflightRef.current.forEach(c => c.abort()); inflightRef.current.clear(); }, [])`，避免元件卸載仍 fetch。

### 7. 文案
- 移除「切換對話時取消了上一則進行中的請求。」notice 文字。
- 新增 `loadSession` notice：「此對話仍在等待 BFF 回覆，請稍候。」（只在切到的 session pending 時顯示）。

## 不動
- BFF 契約、`askManagementAi`、degraded callout、provider pill、attachments、resync 邏輯、localStorage schema。

## 驗證步驟
1. 對話 A 送出 → 立刻點側欄 B → B 可立刻輸入並送出，A 不被中斷。
2. 側欄 A、B row 各自顯示 spinner。
3. A 回覆回來 → 側欄 A spinner 消失、A row 置頂；點回 A 看到 assistant 訊息，無 cancel notice。
4. 重整 → A、B 訊息都還在（從 localStorage cache）。
5. `bun x vitest run` 全綠（既有 366 tests 不應受影響）。
