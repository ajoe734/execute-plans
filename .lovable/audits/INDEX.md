# Spec Gap Audit — Index

本資料夾收錄歷次 Pantheon Frontend Build Spec 與現有實作之間的「規格缺漏 / 矛盾」盤點報告。

```
spec-gap-YYYY-MM-DD-{流水序}.md         # 完整報告（zh-TW）
spec-gap-YYYY-MM-DD-{流水序}-summary.csv
```

| 版本 ID | 日期 | 範圍 | 條目數 | 高 / 中 / 低 | 解決狀態 | 備註 |
|---------|------|------|--------|--------------|----------|------|
| `spec-gap-2026-05-05-A` | 2026-05-05 | Part 1–8 全量盤點 | 92 | 28 / 41 / 23 | RESOLVED by Pack A + Pack B | 首次完整盤點 |
| `feedback-2026-05-05-A` | 2026-05-05 | High severity 解決方案 | 28 | 28 / 0 / 0 | RESOLVED — 已實作 | v2 Part 9 |
| `feedback-2026-05-05-B` | 2026-05-05 | Medium / Low severity 解決方案 | 64 | 0 / 41 / 23 | RESOLVED — 已實作 | v3 Part 10 |
| `spec-gap-2026-05-05-C` | 2026-05-05 | 實作後 deeper-gap 反饋 | 78 | 14 / 38 / 26 | **RESOLVED by Pack C (v4 / 2026-05-05-C)** | 規劃團隊版 = `*-planner.md` |
| `feedback-2026-05-05-C` | 2026-05-05 | Pack C 78 條規範回應 | 78 | 14 / 38 / 26 | RESOLVED — 進入實作 | 對應 v4 spec，存於 `.lovable/feedback/2026-05-05-C/` |
| `spec-gap-2026-05-06-D` | 2026-05-06 | Pack C 落地後 second-order gaps | 63 | 21 / 28 / 14 | **OPEN — 待 Pack D 規範回應** | 5 條 blockers 另存 `*-blockers.md` |
| `spec-conflict-2026-05-06-E` | 2026-05-06 | v5 SA+SD vs v4 / Pack D / SD 內部一致性 | 19 | 6 Blocker / 7 High / 6 Medium | **OPEN — 待 Pack E 規劃回應** | intake 於 `.lovable/feedback/2026-05-06-E/` |

## 累計覆蓋

170 / 170 SA-SD gaps 已於 spec 層收斂（92 原始 + 78 deeper）。
另有 63 條 second-order gaps（Audit D）OPEN，待 Pack D 規範回應；其中 5 條為實作 blockers。
實作層由 `.lovable/plan.md` 追蹤。

## 使用建議

1. **規劃團隊**：以 `-summary.csv` 篩選 severity，逐條補定義。
2. **後續審計**：請新增列，不覆蓋既有版本。
3. **與 plan.md 關係**：本資料夾紀錄 spec 缺漏；實作異動由 `.lovable/plan.md` 追蹤。
