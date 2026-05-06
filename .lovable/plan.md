## Pack D 規格缺漏盤點 — 落地計畫

執行先前提出的 **Spec Gap Audit D (2026-05-06)** 記錄工作，把 63 條 second-order gaps 正式存檔，供規劃團隊接手。

### 目標

把 Audit D 的盤點結果留存為可追蹤、可被未來 Pack D 規格回應引用的審計紀錄，與既有 A/B/C 系列審計檔案命名一致、可被 INDEX 索引。

### 將建立的檔案

1. **`.lovable/audits/spec-gap-2026-05-06-D.md`**
   - zh-TW 完整報告
   - 結構：摘要 → 方法論 → 63 條完整列表（D01–D63），每條含：ID / 嚴重度 / 範圍 / 現況 / 缺漏描述 / 建議規範方向 / 對應 Pack C 條目
   - 分類：21 High / 28 Medium / 14 Low
   - 主題分群：State Machines、Permissions、API/BFF、SSE、Operational Rules、UI/UX Tokens、Session/Auth、i18n、Observability

2. **`.lovable/audits/spec-gap-2026-05-06-D-summary.csv`**
   - 欄位：`id, severity, area, title, current_state, gap, recommendation, related_pack_c_id, status`
   - 63 列 + header
   - 預設 status = `OPEN`，方便規劃團隊用 sheet 篩選

3. **`.lovable/audits/spec-gap-2026-05-06-D-blockers.md`**（新增區隔檔）
   - 抽出 5 條最阻塞實作的 High：D05 / D12 / D22 / D26 / D59
   - 每條給規劃團隊一頁式 brief：為什麼阻塞、最小可接受規範、建議 DTO/enum 草案

### 將更新的檔案

4. **`.lovable/audits/INDEX.md`**
   - 新增列：`spec-gap-2026-05-06-D` / 2026-05-06 / 實作後 second-order gaps / 63 / 21 / 28 / 14 / **OPEN — 待 Pack D 規範回應** / Audit D
   - 更新「累計覆蓋」段：170 已收斂 + 63 second-order 待處理

5. **`mem://audits/open-gaps`**（新建 memory 檔）
   - type: `feature`
   - 內容：Audit D 63 條 OPEN，引用 `.lovable/audits/spec-gap-2026-05-06-D.md`，5 條 blockers 列名
   - 用途：未來 session 規劃時自動知道有未解 gaps

6. **`mem://index.md`**
   - Memories 段新增一行：`- [Open spec gaps](mem://audits/open-gaps) — Audit D 63 條 second-order gaps OPEN，5 條 blockers 阻塞 Pack D 實作`

### 不會做

- 不新增任何 `src/` 程式碼或測試（這是 spec-level 反饋，不是實作工作）
- 不修改 `.lovable/spec/v4/`（規範由規劃團隊回應，不由實作端自行補）
- 不執行 `vitest` 或 build（純文件工作）
- 不產生英文版 — 與 Audit C 同樣先 zh-TW，等規劃團隊需要時再翻

### 命名一致性

延續既有約定 `spec-gap-YYYY-MM-DD-{序}`，本次序號為 `D`（前次為 `A`、`C`、`C-planner`），確保留存且不覆蓋。

### 驗收

- 三個新檔可在 `.lovable/audits/` 看到
- INDEX.md 與 mem://index.md 同步更新
- 63 條每條都有 ID、severity、建議方向，無 placeholder
- CSV 可直接被規劃團隊匯入 sheet 篩選
