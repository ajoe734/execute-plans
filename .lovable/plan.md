你說得對，我前面把需求理解錯了：你要的不是側邊欄跟著整頁一起跑，也不是一直顯示 sidebar scrollbar；而是側邊欄固定在左側不動，只有滑鼠移到左邊 sidebar 區域時，sidebar 內部才可以滾動。

目前狀態我已確認：
- `SideNav.tsx` 現在是 `sticky top-14 self-start`，沒有內部 overflow。
- `ManagementLayout.tsx` / `AgoraLayout.tsx` 主內容是自然頁面捲動。
- 所以目前行為確實不符合你現在講的需求：sidebar 內容會跟頁面捲動邏輯混在一起，而不是「固定 + hover 才 scroll」。

修正計畫：

1. 修改 `src/platform/components/SideNav.tsx`
   - 讓 sidebar 固定在 TopBar 下方：`sticky top-14`。
   - 設定 sidebar 高度為視窗扣掉 TopBar：`h-[calc(100vh-3.5rem)]`。
   - 設定 `overflow-hidden` 作為預設狀態，避免平常出現 scrollbar 或跟著頁面產生滾動感。
   - 加上 `hover:overflow-y-auto`，讓滑鼠移到左側 sidebar 時才允許 sidebar 內容上下捲動。
   - 保留 `overscroll-contain`，避免在 sidebar 滾到底時把滾動事件傳給主頁面造成抖動或連動感。

2. 微調 sidebar 內距與 scrollbar 體驗
   - 保留現有寬度、顏色、分組、active route 樣式，不重做視覺。
   - 若需要 scrollbar，只在 hover 時出現；平常 sidebar 看起來就是固定靜態欄位。
   - 使用較薄的 scrollbar class，避免視覺太重。

3. 保持 main content 的自然頁面捲動
   - `ManagementLayout.tsx` 和 `AgoraLayout.tsx` 維持 `main className="flex-1 min-w-0"`。
   - 不恢復主內容區的局部 `overflow-auto`，避免又變回 dashboard 自己一個 scroll container。

預期結果：

```text
TopBar 固定在上方
Sidebar 固定在左側 TopBar 下方
主內容用瀏覽器主頁面 scroll
Sidebar 平常不顯示 scrollbar
滑鼠移到 Sidebar 上，才可以滾 Sidebar 選單
滑鼠離開 Sidebar，Sidebar 停在原地，不跟主內容一起做 scroll 效果
```

涉及檔案：
- `src/platform/components/SideNav.tsx`

驗收重點：
- 在 `/management` 長頁面上下捲動時，左側 sidebar 視覺位置不跟著頁面移動。
- 滑鼠沒有放在 sidebar 上時，sidebar 不出現獨立 scrollbar。
- 滑鼠移到 sidebar 上時，如果選單高度超過視窗，sidebar 可以自己滾動。
- 主內容仍然用整頁自然捲動，不恢復雙主內容 scrollbar。