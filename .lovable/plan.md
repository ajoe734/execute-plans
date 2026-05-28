# 修：Management AI 小幫手 refresh 後對話消失

## 問題

1. **歷史訊息消失（主因）**：`AgentPanelBody.tsx` line 103 為了避免 loading 卡住，在 thread 切換時立刻 `setInitialMessages([])`，讓 `<ChatWindow key={threadId} initialMessages={[]} />` mount。等 Supabase 回來 25 筆訊息再 `setInitialMessages(msgs)`，但 `useChat({ messages })` 只在 mount 當下吃，後續更新無效 → 畫面永遠停在 empty state。截圖 debug bar `msgs:25 boot:ok` 但右側是 welcome screen，就是這個證據。

2. **活動 thread 跳走**：`bootstrap()` 永遠選 `list[0]`（最新 updated_at），沒持久化「使用者上次在哪個 thread」，refresh 後可能跳到別的 thread。

3. （非 bug，確認過）panel 的開關/位置/大小已經有 `localStorage` 持久化（`useAgentPanel.ts`），這部分不用改。

## 修法

### A. 修 ChatWindow 永不啟動就空的問題

`src/management/components/agent/AgentPanelBody.tsx`：

- 移除 line 103 的 `setInitialMessages([])` 樂觀 unblock。改成在 thread 切換時 `setInitialMessages(null)`（loading 狀態）。
- fetch 完成後一律 `setInitialMessages(msgs ?? [])`（即使 0 筆也要設定，讓 UI 解鎖）。
- watchdog 已存在（line 149），保留 5s 卡住的 console.warn；但「真的卡住」時，提供「點此繼續（從空白開始）」按鈕，把 initialMessages 設成 `[]` 由使用者手動 unblock，而不是自動清空。
- 這樣 `<ChatWindow>` 一定是用「真實歷史」mount，refresh 後對話完整呈現。

### B. 記住上次活動的 thread

- 新增 localStorage key：`pantheon.agentPanel.activeThreadId`。
- `bootstrap()` 改成：先讀 localStorage，若 id 還存在於 `list` 裡，用它當 active；否則 fall back 到 `list[0]`。
- `setActiveThreadId` 寫一個 wrapper（或 useEffect 監聽）同步寫入 localStorage。
- `deleteThread` 若刪到的是 active，清掉 localStorage 那筆。

### C. （順手）loading 文案小調整

把 `flex-1 flex flex-col items-center justify-center` 的「載入中…」加上 thread 標題，提示「正在載入『xxx』的歷史訊息…」，讓人知道並不是被洗掉了。

## 驗證

1. 打開小幫手 → 在某 thread 打幾句話 → reload → 同一個 thread 仍 active、25 筆歷史完整出現、debug bar `msgs:25 boot:ok` 且右側顯示對話而不是 empty state。
2. 刪掉 active thread → 自動切到 list[0]，localStorage 同步更新。
3. localStorage 被清掉的情境 → 回到「選 list[0]」原行為，沒 regression。
4. 看一次 console，watchdog 5s 警告在正常路徑下不該觸發。

## 範圍

只動 `src/management/components/agent/AgentPanelBody.tsx`，不碰 BFF、不碰 useAgentPanel、不碰 schema。純 UI / 前端 state 修復。