## 問題診斷

`/management/readiness/bff-ha` 切走再切回來，整個畫面變黑（連側邊欄、導覽列都沒了）。這代表 **React tree 整個 unmount**，不是 loading 卡住（卡住會看到 skeleton）也不是 CSS 問題。

關鍵發現：
- `rg ErrorBoundary src/` → **零個結果**。整個 app 沒有任何 error boundary
- `useV5Live` 的 loader promise **沒有 `.catch()`**，rejection 變成 unhandledRejection；若 adapter / render 階段拋例外，整棵樹就掛掉
- 沒有 runtime error log，是因為 published build 的 error 沒被 Lovable preview 攔到（pantheon-dev.lovable.app 不是 preview iframe）
- 重新整理後就好 → 典型 render-time exception + 無 boundary 的症狀

很可能的觸發點：BFF live call 回來資料形狀和 seed 不同 → `mgmt.readiness.bffHa` adapter 已經有 fallback，但 ReadinessChecklist / EvidencePacketList 內部某個 `.map` 在新 render 時拿到 undefined 欄位。

## 修復計畫

### 1. 加全域 ErrorBoundary（根因修復）
新增 `src/components/ErrorBoundary.tsx`：class component，`componentDidCatch` 印 console、render 時顯示**紅字錯誤卡**（符合既有「錯誤呈現用紅字錯誤卡」memory），含：
- 錯誤訊息 + stack 摘要
- 「重新載入」按鈕（`window.location.reload()`）
- 「回首頁」按鈕

在 `src/App.tsx` 最外層（QueryClientProvider 內、Routes 外）包一層 ErrorBoundary，這樣任何子頁 crash 都不會把 layout 一起炸掉。

### 2. `useV5Live` 加 `.catch()`
loader rejection 改成 `setLoading(false)` 並保留舊 data，避免：
- 黑屏（unhandledRejection 在某些瀏覽器設定下會卡 UI）
- 永遠停在 loading

### 3. 在 ManagementLayout 內再包一層 ErrorBoundary
這樣單一頁 crash 時，左側選單還在、使用者可以切走。

## 不動的東西
- BFF / agent edge function / auth 一律不碰（與此 bug 無關）
- 不改任何 readiness page 的商業邏輯

## 驗收
- 開 `/management/readiness/bff-ha` → 切到 cockpit → 切回來 ✅ 不黑屏
- 故意拋錯 → 看到紅字錯誤卡而不是黑屏
