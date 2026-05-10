# Spec Gap Audit — Index

> **Latest（2026-05-10）**：唯一最新整合狀態表 = [`fe-spec-status-2026-05-10.md`](./fe-spec-status-2026-05-10.md)；對應 spec snapshot = `.lovable/spec/current/`。
> Supersedes：`fe-blueprint-gap-2026-05-09.md`（已加 banner）。

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
| `spec-gap-2026-05-06-D` | 2026-05-06 | Pack C 落地後 second-order gaps | 63 | 21 / 28 / 14 | **RESOLVED BY PACK D DISPOSITION (8 sub-packs D-A~D-H)** | disposition 於 `.lovable/feedback/2026-05-06-D/`；canonical contracts 於 `.lovable/spec/v4/pack-d/`（7 份）|
| `spec-conflict-2026-05-06-E` | 2026-05-06 | v5 SA+SD vs v4 / Pack D / SD 內部一致性 | 19 | 6 Blocker / 7 High / 6 Medium | **RESOLVED (28/28) — E0 已落地** | disposition 於 `.lovable/feedback/2026-05-06-E/Pack_E_Disposition.csv` |
| `spec-gap-2026-05-06-F` | 2026-05-06 | 實作層 placeholder / no-op（list 頁建立按鈕等） | 4 | 1 / 2 / 1 | **RESOLVED by Pack F (disposition + impl landed)** | disposition 於 `.lovable/feedback/2026-05-06-F/Pack_F_Disposition.md` |
| `spec-conflict-2026-05-06-G` | 2026-05-06 | Pack D canonical vs 當前 src/ 衝突 | 14 | 4 / 5 / 5 | **6 RESOLVED + 8 OPEN（impl-pending，分 Batch II/III/IV）** | 改名自 spec-gap-G；詳見 `spec-conflict-2026-05-06-G.md` |

## 累計覆蓋

233 / 233 spec-level gaps 已收斂（92 Pack A+B + 78 Pack C + 63 Pack D + 19 Pack E - 已 RESOLVED）。
4 條 Audit F 實作層 RESOLVED；8 條 spec-conflict-G 為 impl-pending（不影響 spec 完整度）。
實作層分 Batch II / III / IV 推進，由 `.lovable/plan.md` 追蹤。

## 使用建議

1. **規劃團隊**：以 `-summary.csv` 篩選 severity，逐條補定義。
2. **後續審計**：請新增列，不覆蓋既有版本。
3. **與 plan.md 關係**：本資料夾紀錄 spec 缺漏；實作異動由 `.lovable/plan.md` 追蹤。
