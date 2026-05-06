
# 規劃：Spec Gap Audit 2026-05-05-C（實作後反饋）

## 目標

在完成 Pack A（28 H）+ Pack B（64 M/L）共 92 條 spec 修補、並走過階段 1A–3 實作後，盤點「實作期間 v3 spec 仍無法獨立支撐落地」的 deeper gaps。輸出一份新的、獨立命名的稽核文件給規劃團隊。

## 命名與檔案

- 主報告：`.lovable/audits/spec-gap-2026-05-05-C.md`（zh-TW 完整詳列）
- 試算表摘要：`.lovable/audits/spec-gap-2026-05-05-C-summary.csv`（id, area, severity, spec_ref, gap, impact, suggested_resolution）
- 同步更新 `.lovable/audits/INDEX.md` 加入 2026-05-05-C 列（不覆蓋 A/B 既有列）

> 命名遵循既有規則 `spec-gap-YYYY-MM-DD-{流水序}`，C 為今日第三輪。

## 內容範圍（Audit C 11 大分區）

每條目格式：`C### · [Severity] · Area · Spec ref · Gap · Impact · Suggested resolution`。

### 1. 跨層 Normative 衝突（v1 / v2 / v3 三層）
- 同一 enum 在三層出現不同字面值（例：lifecycle vs state、quarantined vs isolated）但 v3 §2 僅說「v3 wins」，未提供完整 mapping table 與遷移期 BFF dual-write 規則。
- v3 §13 page tab 修正未列出被刪除 tab 的資料遷移目的地。
- Disposition.csv 條目與 v3 章節未做 1:1 reverse index。

### 2. 狀態機完整性
- 18 狀態機僅列 happy-path transition，未定義：error / timeout / cancellation / 強制 admin override 路徑。
- 缺少 terminal state 之後 archive / purge SLA。
- 缺少並發 transition（同一 entity 兩個 actor 同時 dispatch）的衝突解決規則（optimistic lock token？version？）。
- Strategy 的 lifecycle × review × deployment 三軸合法組合矩陣未列出（理論 8×4×5 = 160 組合，需要白名單）。

### 3. 權限矩陣與 ActionDescriptor
- §5 Truth table 僅覆蓋 5 個主要 entity；Tool/MCP/Skill/Memory/Insight/Artifact/Job 的細部 action × role 未列。
- ActionDescriptor 未定義：disabled reason 的 i18nKey 命名空間、ttl、requiresEnv、requiresTwoMan 規則。
- 「emergency override」誰能授予、留痕欄位未定。

### 4. 高風險動作 / Confirm Token
- §6.2 token API 缺 token 撤銷、token reuse 偵測、token 與 idempotency key 關係。
- Memo 必填的最小語意檢查規則（字數、是否引用 incident id）僅在 Pack B G77 提到上限，未定下限/格式。
- Two-man rule 觸發條件清單不完整（只列 5 條 high-risk，實際 §6.1 有更多）。

### 5. BFF API Contract
- `availableActions` 只規定「必含」，未規定排序、分組（primary / secondary / destructive），UI 無法穩定渲染。
- 分頁、排序、過濾的 query 參數命名約定（offset/limit vs cursor）未統一。
- Error envelope（`BffError.i18nKey` 已定）但 retryable / userActionable / correlationId 欄位語意未定。
- SSE 重連時的 last-event-id / replay window 未定。
- Idempotency key header、request id propagation 未定。

### 6. Agora ↔ Management Handoff
- 7 種 handoff type 已定，但 SLA 計時起點（建立時 vs 接手時）、逾期升級行為（升級到誰）未定。
- 接手後若 Management 拒絕，回信給 Agora 的欄位 schema 未定。
- Handoff 內含 attachment 大小 / mime / 病毒掃描規則未定。

### 7. Capital / Ranking / Rebalance
- Mandate JSON schema 已定，但 mandate breach 偵測週期、breach 後自動動作未定。
- Ranking formula 的 metric 缺 unit、direction（higher-better）、normalization 規則。
- Rebalance 6/9 step 之間的回退（step 5 → step 3）合法性未列。
- Reviewer / Approver quorum 規則（最少幾人、是否需跨角色）未列。

### 8. Evolution / Experiment
- Constraints / Alerts / Approvals schema 僅列欄位，未列驗證器與限制（如 max population, max cost budget）。
- Experiment 結果 → Strategy promote 的 gating 標準（min sample, p-value）未列。

### 9. i18n / Locale
- Persona response language fallback 鏈已定，但 mixed-locale UGC（user 中英混打）儲存與顯示策略未定。
- Date / number / currency 格式 token 未列 ICU pattern。
- 地區（region）與語言分離（zh-TW vs zh-HK）未討論。

### 10. UI 元件 / Design Tokens
- 9 design tokens 已定，但 dark mode、reduced motion、density（compact/comfortable）未定。
- Empty / Loading / Error 模板已定，但 skeleton 對 table / card / chart 各別規格未定。
- LineageGraph 節點上限、效能 budget 未定。
- RightDrawer 多開、堆疊行為未定。

### 11. 測試 / 驗收 / Mock 資料
- Acceptance Criteria 寫在每頁底部，但缺 cross-page acceptance（端到端 scenario）。
- Mock seed 量級（每 entity 應有幾筆？涵蓋多少 state？）未列。
- Demo scenario 僅有名稱，未列 step-by-step 預期結果。
- 沒有 contract test / consumer-driven contract 規範。
- 沒有 a11y（WCAG level）/ performance（LCP/TTI 目標）/ security（CSP, auth token storage）chapter。

## 預估數量

預估 60–90 條新缺漏。Severity 分布粗估：H 10–15、M 30–40、L 20–35。

## 工作步驟（進入 build mode 後執行）

1. 重讀 v3 spec §1–§21（Pack A）與 §22–§45（Pack B）對照實作，逐區列出條目。
2. 寫 `spec-gap-2026-05-05-C.md`（每區 H2，每條 H3，含 Impact 與 Suggested resolution）。
3. 寫 `spec-gap-2026-05-05-C-summary.csv`。
4. 更新 `.lovable/audits/INDEX.md` 加入新列。
5. 不修改任何程式碼，不動 v3 spec 文件。

## 不做

- 不直接修補 spec（這份是反饋給規劃團隊）。
- 不覆蓋 A / B 報告。
- 不在程式碼新增 placeholder。
