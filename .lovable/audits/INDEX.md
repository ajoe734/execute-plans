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

## BFF Backend Live Probe 系列

對 lupin dev BFF (`https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io`) 的實作覆蓋度盤點。FE 不動，純後端 handoff 清單。

| 版本 ID | 日期 | 範圍 | 已實作 / 總數 | 缺漏 | 備註 |
|---------|------|------|---------------|------|------|
| `bff-backend-gap-2026-05-23` | 2026-05-23 | ~87 條 canonical paths baseline | 4 / 87 | 76 P0+P1 + CORS + `/openapi.json` 500 | 首次盤點 |
| `bff-backend-gap-2026-05-24-delta` | 2026-05-24 | 第二輪 live probe（含 detail-by-id 真實 ID） | ~62 / 87 | 26 + 1 schema 偏差 + CORS | SUPERSEDED by delta-v3 |
| `bff-backend-gap-2026-05-25-delta-v3` | 2026-05-25 AM | 第三輪 — BE 報告「完成」後 re-probe | ~63 / 87 | 27 + 2 P0 blockers + 160 bonus | SUPERSEDED by delta-v4 |
| `bff-backend-gap-2026-05-25-delta-v4` | 2026-05-25 late | 第四輪 — BE 再次「完成」後 re-probe，270 paths | **~86 / 87** | 1 P0 CORS + P2 envelope optional fields | SUPERSEDED by delta-v5 |
| `bff-backend-gap-2026-05-25-delta-v5` | 2026-05-25 final | 第五輪 — 收尾 re-probe（**read-path only**） | **87 / 87** | **0 — read-path ALL CLEAR** | read-only scope；write-path 見下 |
| `bff-backend-write-probe-2026-05-28` | 2026-05-28 | 31 個 write endpoint | 23 / 31 | 8 P0/P1/P2 | `scripts/probe-bff-write-paths.mjs` |
| `persona-onboarding-endpoint-probe-2026-05-28` | 2026-05-28 | Wizard 8 endpoints | 1 / 8 | 7 (5 wizard stages + F4 + deprecated lifecycle) | `scripts/probe-persona-onboarding-endpoints.mjs` |

## BE 需求規格書（對後端團隊）

| Doc | 日期 | 範圍 | Open endpoints |
|---|---|---|---|
| [`BE_WRITE_GAP_SPEC_2026-05-28`](../specs/be-requirements/BE_WRITE_GAP_SPEC_2026-05-28.md) | 2026-05-28 | 整合 write probe + onboarding probe 成正式 BE 需求書 | 15（8 P0 + 6 P1 + 1 P2）+ Sentinel 規則覆蓋 |


## 使用建議

1. **規劃團隊**：以 `-summary.csv` 篩選 severity，逐條補定義。
2. **後續審計**：請新增列，不覆蓋既有版本。
3. **與 plan.md 關係**：本資料夾紀錄 spec 缺漏；實作異動由 `.lovable/plan.md` 追蹤。

