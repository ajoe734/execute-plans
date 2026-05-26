## 目標

把 Management AI 從「獨佔全螢幕路由」改成「浮在系統上的可縮放面板」，並修掉目前卡住的問題。

## 問題分析

1. **卡住** = 目前 `ManagementAgent.tsx` 是整頁 `h-screen` route (`/management/agent/:id`)，導覽過去就離開 Cockpit，回不去也無法同時操作。Empty/Loading 狀態（`routeThreadId === "new"` 時、thread bootstrap 競態）會卡在 "Loading…"。
2. **無法同時操作** = 它是 route 不是 overlay。

## 方案：Floating Agent Panel（浮窗）

### A. 新元件 `src/management/components/agent/FloatingAgentPanel.tsx`
- 用 Portal 掛到 `document.body`，`position: fixed`，預設右下角 `width: 420px, height: 600px`。
- 三種狀態：`minimized`（只剩右下角圓形 FAB icon）/ `normal`（預設浮窗）/ `maximized`（佔大部分視窗但仍是 overlay，不蓋住側邊欄）。
- Header bar：拖曳移動、最小化 `–`、最大化 `▢`、關閉 `×`。
- Resize handle：右下角 corner（CSS `resize: both` + `overflow: hidden`，最簡實作）。
- 位置/尺寸/狀態存 `localStorage`（`pantheon.agentPanel.state`）下次開啟還原。
- z-index 高於系統 UI，但 toast / dialog 仍可疊上。
- **背景不加 backdrop**，原系統完全可操作（點擊不會被攔截）。

### B. Panel 內容 = 現有 ChatWindow 抽出
- 把 `ManagementAgent.tsx` 的 `ChatWindow` + thread sidebar 拆成 `AgentPanelBody.tsx`，移除 `h-screen` 並改用 `h-full`。
- Sidebar 在 panel 中變成可摺疊 drawer（窄寬度時自動隱藏），預設只顯示對話視窗 + 頂部「☰ 對話列表 / + 新對話」按鈕。
- 修掉卡死：
  - `routeThreadId` 不再從 URL 取，改成 panel 內部 state `activeThreadId`。
  - 初次開啟若無 thread → 直接建立並選中（單一 effect、用 ref 防 StrictMode 重入）。
  - Loading 狀態加 timeout fallback，error 顯示重試按鈕。

### C. 全域掛載
- `src/management/ManagementLayout.tsx` 底部加 `<FloatingAgentPanel />`（只在 management 範圍內出現）。
- 由 `useAgentPanel()` zustand-lite store（`src/management/components/agent/useAgentPanel.ts`）控制 open/minimize/maximize。
- `src/management/pages/oversight/_core.tsx` 的「💬 詢問 AI Management」按鈕改成 `useAgentPanel().open()`，不再 `nav('/management/agent')`。

### D. Route 處理
- 保留 `/management/agent/:threadId?` route 但改成 redirect 到 `/management/cockpit` 並自動 `open(threadId)`，這樣舊連結還能用。
- 移除 ManagementAgent 整頁版本（或留為 deprecated debug-only）。

### E. 測試模式 banner
- 從原本「全頁 top banner」改成 panel header 內一條細紅線，不再侵入主系統畫面。

## 驗收

1. 在 Cockpit 點「詢問 AI」→ 右下角浮窗開啟，cockpit 內容仍可滾動/點擊。
2. 浮窗可拖曳、可右下角拖拉縮放、可最小化成 FAB、可最大化、可關閉。
3. 重新整理頁面後，浮窗位置/尺寸/開關狀態保留。
4. 訊息能正常 stream，不再卡 "Loading…"。
5. 切換 thread / 新建 thread 在 panel 內完成，不改變主路由。

## 不在範圍

- 不動 edge function、不改 RLS、不改 BFF；純前端 UI 重構。
- 不重做 thread persistence schema。
