# Management 改版 2026-05-20 — 實作追蹤

規格：`.lovable/spec/management-2026-05-20/Pantheon_Management_Lovable_Spec_2026-05-20.md`
計畫：`.lovable/plan.md`

## Pack 進度

| Pack | 範圍 | 狀態 |
|---|---|---|
| M0 | 歸檔 + INDEX + memory + 追蹤表 | ✅ DONE (2026-05-20) |
| M1 | IA + Nav + i18n + stubs | ✅ DONE (2026-05-20) |
| M2 | OneRing / Fleet / Inbox / Pulse / Evolution / Evidence / Intent 七頁實作 | ⏳ TODO |
| M3 | Broker/Capital/BFF-HA/Strict Publish readiness 骨架 | ⏳ TODO |
| M4 | NL Console dock + mock facade | ⏳ TODO |
| M5 | Write path hardening (persona canonical + deployment + approvals) | ⏳ TODO |
| M6 | Tests (unit + Playwright smoke + strict-mode + i18n parity) | ⏳ TODO |

## 預設方案（plan §0，待用戶確認 / 否則沿用）

1. NL Console Phase 1 = pure mock（不接 AI Gateway，避免 strict 雷區）
2. Persona Intent Traces 原始 prompt 一律不從 BFF 取回；UI 只顯示 summary/redacted/restricted
3. Trading Pulse baseline 枚舉：`previous_artifact | 7d_rolling | last_canary | last_review`
4. 5 條 readiness 頁先做骨架（ReadinessChecklist + EvidencePacket list + Blockers），detail 等規格補完
5. 歸檔位置 = `.lovable/spec/management-2026-05-20/`，INDEX + memory 已更新

## M1 落地內容

- 新增 stub 頁：`src/management/pages/oversight/_stubs.tsx`（12 個 Stub）
- `src/App.tsx`：
  - `/management` index → `Navigate to /management/one-ring`
  - 新增 `one-ring`, `persona-fleet`, `human-inbox`, `trading-pulse`, `evolution-journal`,
    `evidence`, `evidence/:id`, `persona-intent`, `persona-intent/:id`,
    `broker-live`, `capital-live`, `system/bff-ha`, `system/strict-publish`
  - `control-room` alias 改指 OneRingCockpit（保留 deep link）
  - `control-room-legacy` 保留舊 ControlRoom 進入點
- `src/management/ManagementLayout.tsx`：6 group 重排（Oversight / LiveReadiness / AdvancedRegistry / Operations / Capabilities / System / Legacy）
- i18n: en-US + zh-TW 補齊 §10 全部 keys（nav.*、groups.{oversight,liveReadiness,advancedRegistry}、oneRing/personaFleet/humanInbox/tradingPulse/evolutionJournal/evidence/personaIntent/readiness.*）

## 驗收閘門（每 Pack）

- tsc 0 error
- vitest pass
- i18n parity（`scripts/check-i18n.ts`）pass
- a11y axe smoke pass
