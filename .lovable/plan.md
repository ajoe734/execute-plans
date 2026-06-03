## 問題
`src/management/components/agent/FloatingAgentPanel.tsx` 在 `mode === "closed"` 時直接 `return null`，連右下角的圓形 Brain 啟動鈕都不畫。使用者按過 ✕ 後狀態被存進 localStorage，之後不論換頁、重新整理浮窗都「消失」，只能靠 `Ctrl/Cmd+Shift+A` 救回來 —— 非鍵盤使用者等同於壞掉。

## 修改範圍（純前端 UI）

**1. `FloatingAgentPanel.tsx`**
- 移除 `mode === "closed"` 時 `return null` 的分支。
- 改成：`closed` 和 `minimized` 都顯示右下角浮動的 Brain 啟動鈕（FAB）。
- 點擊 FAB → `panel.open()` 開啟正常面板。
- FAB 的 `aria-label` / `title` 維持「開啟 Management AI（Ctrl+Shift+A）」。

**2. （選擇性收尾）`useAgentPanel.ts`**
- 把預設 / 持久化的初始 `mode` 從 `"closed"` 改成 `"minimized"`，語意更一致（FAB 常駐 = 最小化）。
- `close()` 也改為設為 `"minimized"` 而非 `"closed"`，因為現在兩者視覺一致，沒必要區分；或保留 `closed` 但渲染上等同 `minimized`。

## 不動的部分
- 面板內容 (`AgentPanelBody`)、拖拉 / Resize / Snap 行為、鍵盤快捷鍵全部不變。
- 不改後端、不改 agent 邏輯、不動 tool sanitization。

## 驗收
- 首次進入 `/management/*` 任一頁面，右下角看得到圓形 Brain 啟動鈕。
- 開啟面板 → 按標題列 ✕ → 面板收起，但右下角 FAB 仍在。
- 重新整理頁面後 FAB 依然存在。
- `Ctrl/Cmd+Shift+A` 仍可開關面板。
