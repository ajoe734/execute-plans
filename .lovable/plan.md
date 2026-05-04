## Command Center UI 收斂

針對 `/management` (CommandCenter.tsx) 的 5 處可見問題一次處理。

### 1. 生命週期瓶頸卡片 compact 化
- 將四個狀態桶從 `grid-cols-3 sm:grid-cols-6` 大方塊改為水平 chip 列：每個 chip 一行顯示 `[STATE_BADGE] [count]`，使用 `flex flex-wrap gap-2`。
- 移除大字 `text-xl` 留白，改用 `StatusBadge` + `text-mono` 計數，整張卡片高度縮減約 50%。
- 修正 DEPLOYED/REVIEW 字疊問題（根因是 grid cell 寬度不足 + uppercase 全寫）。

### 2. 資金池曝險配色補中間色階
目前邏輯 `pct > 90 → critical(紅), > 75 → high(橘), else accent(藍)`，但截圖中 Beta 60% 顯示為藍、Tactical 96% 為紅，缺中間警示。
- 新增 `> 60` → `bg-risk-medium`（黃）一階，符合 spec 4 級 risk 配色。
- 在 bar 右側百分比旁加上 `RiskBadge` 對應 level，雙重編碼（顏色 + 標籤）避免色盲誤讀。

### 3. Agora 移交表格欄名修正
- `t("common.state")` 改為 `t("common.risk")`（已存在 key），語意對齊欄位內容（RiskBadge）。
- 同步調整 i18n（若 `common.risk` 缺 zh-TW 翻譯則補上「風險」）。

### 4. 告警與事件補時間脈絡
- 每筆 incident/alert 列加上 `relative time`（例如 `12 分鐘前`），使用 `Intl.RelativeTimeFormat` 配合 i18n locale。
- 將 `in_021` 這類 ID 從標題位置降級為 `text-mono text-xs text-muted-foreground` 的副標。

### 5. Persona 活躍度語意分離
- 將「成功率%」與「風險 badge」拆成兩欄，並加上 micro label（`成功率` / `風險`）於卡片頂部 header row，避免 91% 配「低」看似矛盾。
- 使用 `grid grid-cols-[1fr_auto_auto] gap-3` 對齊。

### 6. （順手）三欄高度對齊
- 包住三欄 grid 加 `items-stretch`，每張 Card 內部用 `flex flex-col h-full`，讓資金池 / 告警 / Persona 高度一致，避免 Persona 欄出現大量空白。

### 技術細節
- 僅修改 `src/management/pages/CommandCenter.tsx`。
- 若 `common.risk` 在 `zh-TW.ts`/`en-US.ts` 缺鍵則補上（zh: 風險, en: Risk）。
- 不新增依賴，`Intl.RelativeTimeFormat` 為原生 API。
- 不影響既有測試（30/30 應維持）。

### 驗收
- `/management` 在 1120px viewport 下，KPI Strip 應出現在 above-the-fold（瓶頸卡片變矮後自然上移）。
- 瓶頸卡片無字疊。
- 資金池 60–75% 區間顯示黃色 bar。
- Agora 表格欄名為「風險」/`Risk`。
- 告警列每筆顯示相對時間。
- 三欄高度齊平。