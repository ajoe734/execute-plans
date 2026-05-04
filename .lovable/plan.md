## 取消 Sidebar 獨立 scroll，改為頁面整體滾動 + Sidebar sticky

### 問題
目前 `SideNav` 用 `h-[calc(100vh-3.5rem)] overflow-y-auto`，`main` 也有 `overflow-auto`，導致 sidebar 與內容各自一條 scrollbar。Dashboard 較長時，sidebar 會出現自己的捲軸（截圖中即如此），體驗割裂。

### 改動
1. **`src/platform/components/SideNav.tsx`**
   - 移除 `h-[calc(100vh-3.5rem)] overflow-y-auto`
   - 改為 `sticky top-14 self-start max-h-[calc(100vh-3.5rem)] overflow-y-auto`
   - `sticky top-14`：跟著頁面滾動，但停在 TopBar 下緣
   - `self-start`：避免 flex 子項被拉伸到整個父容器高
   - 保留 `max-h + overflow-y-auto` 作為 fallback：只有當 nav 內容比視窗還高時才出現滾動條（一般情況下不會）
   - 加 `scrollbar-thin`/`scrollbar-none` 讓 fallback 更不擾眼（可用 Tailwind utility 或 inline）

2. **`src/agora/AgoraLayout.tsx` & `src/management/ManagementLayout.tsx`**
   - 移除 `<main>` 上的 `overflow-auto`，改為 `min-w-0`（防 flex 內容溢出計算問題）
   - 讓整個 `body`/`PlatformShell` 自然滾動

3. **`src/platform/PlatformShell.tsx`**
   - `TopBar` 已是 `sticky top-0 z-40`，無需動
   - 確認外層不要強制 `h-screen overflow-hidden`（檢查後若有則移除）

### 結果
- 只剩一條瀏覽器主滾動條
- Sidebar 在視窗高度內 sticky 固定可見
- 若 sidebar 項目特別多到超過視窗高，才退化為內部滾動

### 涉及檔案
- `src/platform/components/SideNav.tsx`
- `src/agora/AgoraLayout.tsx`
- `src/management/ManagementLayout.tsx`
- `src/platform/PlatformShell.tsx`（僅檢查）
