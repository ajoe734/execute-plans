# 驗證 BE 規格書實作狀態

## 目標
重新跑 `.lovable/specs/be-requirements/BE_WRITE_GAP_SPEC_2026-05-28.md` 列出的 15 個 open endpoints + persona onboarding 8 個 stages，確認 BE 是否已全數開發完成。

## 步驟

1. **重跑 3 支既有 probe 腳本**（read-only，不改任何檔案）
   - `node scripts/probe-bff-write-paths.mjs` → 全 31 個 write endpoints
   - `node scripts/probe-persona-onboarding-endpoints.mjs` → 8 個 wizard stages
   - `node scripts/probe-create-persona-then-fleet.mjs` → write→read 一致性

2. **逐筆比對 15 個 P0/P1/P2 開放路由**，分類：
   - ✅ 新通：原 4xx/5xx → 200/201/202 或 typed envelope
   - ⚠️ 部分通：route 存在但 schema/權限仍未對齊
   - ❌ 仍 open：404/405/410/501

3. **產出驗證報告** `.lovable/audits/be-write-gap-verification-2026-05-30.md`
   - Headline 表（15 列，BEFORE → AFTER 狀態）
   - 每筆原始 status code + response snippet
   - Persona onboarding 8 stages 對照表
   - Sentinel rule coverage 重檢（13 degraded personas → findings 數）

4. **依結果更新**：
   - 若全綠：更新 `mem://index.md` 把 write-gap 條目從 OPEN 改 CLOSED，並標註可移除 `withWriteFallback`
   - 若部分綠：更新 `BE_WRITE_GAP_SPEC_2026-05-28.md` 表格欄位 + 補一份 delta
   - 若仍紅：在報告中明列剩餘 endpoint 給 BE owner

## 技術說明
- 不動 src/、不動 supabase/functions/、不動 spec 文件本身（只在第 4 步視結果決定）
- 所有 probe 用 dev bearer + `X-Dry-Run: 1`，不會污染 BE 真實資料
- 預計 3 個 probe 共跑 ~30 秒
