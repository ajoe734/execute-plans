## 背景

- `/management/cockpit` 整頁白 = console 顯示 `[vite] server connection lost` + `/` 404，是 Vite dev server 暫時斷線（你截圖時剛好遇上），不是程式錯誤。重新整理頁面就會恢復。**不需要改任何 cockpit 程式**。
- 浮窗 `FloatingAgentPanel` 已存在且支援：拖曳、右下角 CSS `resize: both` 拉大縮小、最小化成右下 FAB、最大化、localStorage 記憶位置/尺寸。

## 你真正要的補強

把現有浮窗升級為「可貼到任何角落、四邊都能 resize、不卡 viewport」：

### 1. 拖曳行為強化（`FloatingAgentPanel.tsx`）
- 拖放結束時，若中心點距任一角落 < 80px，**自動 snap 到該角落**（4 角：左上 / 右上 / 左下 / 右下，邊距 16px）。
- 拖曳中允許暫時超出 viewport（目前 clamp 太緊），放手時 clamp 回可見區（保留至少 80×40px 在畫面內，避免拖出去找不回來）。
- 雙擊 header = 最大化 / 還原（現在只有按鈕，雙擊更順手）。

### 2. 四邊 / 四角都能 resize
- 移除目前的 CSS `resize: both`（只能從右下角）。
- 改成自己畫 8 個 resize handle：N / S / E / W / NE / NW / SE / SW，各自 `cursor` 對應，pointer-drag 改 `width`/`height`/`x`/`y`。
- 最小尺寸 320×360，最大不超過 viewport - 16。
- 拖左上角時同步改 `x` 和 `width`，符合自然手感。

### 3. 鍵盤捷徑（小加分，純前端）
- `Ctrl/Cmd + Shift + A`：toggle 浮窗 open / minimize。
- `Esc`：浮窗 focused 時最小化。

### 4. 不在範圍
- 不動 cockpit、不動 edge function、不動 auth、不動 BFF。
- 不改 chat 內容（`AgentPanelBody`）。

## 預計改動檔案

- `src/management/components/agent/FloatingAgentPanel.tsx`（主要：加 8 個 handle、snap、雙擊 header）
- `src/management/components/agent/useAgentPanel.ts`（小調：放寬 clamp 邊界、加 `snapToCorner(corner)` action）

## 驗收

1. 浮窗可以拖到視窗左上 / 右上 / 左下 / 右下並貼齊。
2. 從 8 個方向都能 resize（包括從左邊拉，視窗會同步移動 x）。
3. 雙擊 header 切換最大化。
4. 重整後位置、尺寸、模式都保留。
5. Cockpit 內容仍可同時操作（浮窗不擋互動）。
