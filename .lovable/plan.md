
# Spec Gap Audit 報告產出計畫（已確認）

## 確認項
1. 檔名：`.lovable/audits/spec-gap-2026-05-05-A.md`（後續重盤遞增 B/C 或下個日期）
2. 語言：zh-TW（沿用現有風格）
3. 同步產出 CSV 摘要：`.lovable/audits/spec-gap-2026-05-05-A-summary.csv`

## 將產出的檔案
- `.lovable/audits/INDEX.md` — 盤點版本索引（每次新增一行）
- `.lovable/audits/spec-gap-2026-05-05-A.md` — 完整報告（10 個 Section，預估 70–90 條 gaps，1500–2500 行）
- `.lovable/audits/spec-gap-2026-05-05-A-summary.csv` — 試算表摘要（欄位：id, severity, part, section, line, title, area, current_workaround, suggested_resolution）

## 報告每條 gap 固定 8 欄位
標題行 / 藍圖原文摘錄 / spec 缺項 / 跨章矛盾 / 目前實作 / 影響 / 建議方向 A-B-C / 受影響範圍 / 驗收條件

## 報告分章
1. Part 1 Master Blueprint gaps
2. Part 2 Process Inventory gaps（Process A–P）
3. Part 3 Management Console Page Spec gaps（22 頁逐頁）
4. Part 4–5 Agora Workbench gaps（W1–W12 + 12 頁）
5. Part 6 Data Model + BFF Contract gaps
6. Part 7 Components + 18 State Machines gaps
7. Part 8 Build Prompts + Mock Data + QA gaps
8. Cross-Part Contradictions
9. 統計總覽（H/M/L 分布、熱力圖、Top-10 阻塞）
10. 給規劃團隊的優先順序建議

## 工作步驟
1. 建立 `.lovable/audits/` 目錄與 `INDEX.md`
2. 重新逐 Part 詳閱 spec（已掌握 Part 1/2/3/8 大綱，需補讀 Part 4–7 細節 + zh-TW 對照差異）
3. 對照現有實作（src/management、src/agora、src/lib/bff、src/lib/stateMachines、src/platform）
4. 分 2–3 次 `code--write` 完成單一報告檔
5. 產出 CSV
6. 更新 INDEX
7. 不修改任何 src/ 程式碼

## 不做的事
- 不改 src/ 任何程式
- 不修 spec 原檔
- 不覆蓋既有 .lovable/plan.md
