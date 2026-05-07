## 翻譯完整性檢查結果

跑了 `bunx tsx scripts/check-i18n.ts`，現況：

- en-US **1696 keys** ／ zh-TW **1696 keys** — **數量對稱、無單側遺漏** ✅
- t() 共參照 **1391** 個 key
- **缺失 12 個 key**（兩個語系都沒有，目前靠 `defaultValue` 撐著）
- 硬編碼英文候選 **4 處**

---

### 1) 12 個缺失 key（會在兩個語系同時補齊）

| 命名空間 | key | 使用處 | 英文 | 中文 |
|---|---|---|---|---|
| `ui` | `loading` | `v5/V5Pages.tsx` | Loading… | 載入中… |
| `v5.loops.execution` | `emptyTitle` | `v5/ExecutionLoop.tsx` | No execution loops | 暫無執行迴圈 |
| `v5.loops.execution` | `emptyDesc` | 同上 | No runs match the current focus. Trigger a run from a Strategy or Deployment to see it here. | 目前條件下沒有執行紀錄。請從 Strategy 或 Deployment 觸發新的 run。 |
| `v5.loops.optimization` | `subtitle` | `v5/OptimizationLoop.tsx` | One run per pending rebalance. Approval is the gating stage. | 一個 pending rebalance 對應一條 run，approval 為門檻階段。 |
| `v5.optimization` | `createIntent` | 同上 | Start a new rebalance from /management/rebalance, then return here to monitor the optimization loop. | 請先在 /management/rebalance 建立新的調倉，再回到此處監控最佳化迴圈。 |
| `v5.sentinel` | `noFindingsTitle` | `v5/Sentinel.tsx` | No findings | 暫無監測項 |
| `v5.sentinel` | `noFindingsDesc` | 同上 | Sentinel hasn't surfaced any findings for the current scope. | 目前範圍下 Sentinel 尚未產出任何 finding。 |
| `v5.sentinel` | `noMatchTitle` | 同上 | No matches | 無符合項目 |
| `v5.sentinel` | `noMatchDesc` | 同上 | Adjust the search or severity filter to see more findings. | 調整搜尋或嚴重度過濾條件以查看更多 finding。 |
| `studios.createIntent` | `formula` | `studios/FormulaStudio.tsx` | Compose a new ranking formula by editing the expression below, then save as a new variant. | 在下方編輯表達式以撰寫新的排名公式，再另存為新變體。 |
| `capital` | `rankingInputs` | `CapitalPoolDetail.tsx` | Ranking Inputs | 排名輸入 |
| `strategyDetail` | `costsTab` | `StrategyDetail.tsx` | Costs & Slippage | 成本與滑價 |

→ 在 en-US.ts / zh-TW.ts 對應命名空間插入：
- `ui.loading`（top-level 既有 `ui` 區塊內）
- `v5.loops.execution.emptyTitle/emptyDesc`、`v5.loops.optimization.subtitle`、`v5.optimization.createIntent`、`v5.sentinel.no*`（既有 v5 子樹）
- `studios.createIntent.formula`（既有 studios 區塊新增子物件）
- 新增 top-level `capital: { rankingInputs }`（zh/en 兩側）
- `strategyDetail.costsTab`（既有 strategyDetail 區塊）

### 2) 4 個硬編碼英文候選（移到 i18n）

| 檔案 | 內容 | 處理 |
|---|---|---|
| `management/components/detail/StrategyPerformanceTab.tsx` (×2) | 圖表內聯英文標籤 | 移至 `strategyDetail.perf.*` |
| `management/pages/ObjectListPage.tsx` | 表頭/狀態文字 | 改用既有 `common.*` / `status.*` |
| `platform/pages/AuditViewer.tsx` | 列頭文字 | 移至 `audit.*` 或 `common.*` |

實際展開時會逐檔讀取確認原文後 1:1 替換為 `t(...)`。

### 3) 驗證

完成後再跑：
- `bunx tsx scripts/check-i18n.ts` → 預期：Missing 0、Only-en 0、Only-zh 0、Hard-coded 0
- `bunx vitest run` → 預期 268+ passed，無回歸
- 寫入 `.lovable/audits/i18n-completeness-2026-05-07.md` 紀錄結果

### 4) 不在範圍

- `defaultValue` 機制本身不是 bug：目前 12 個缺 key 在 runtime 還是會顯示英文預設，使用者不會看到 raw key。本輪只是把它們轉為正式 zh-TW 翻譯。
- 未動到 v5 SA+SD 任何契約，純 UI 字串補齊。
