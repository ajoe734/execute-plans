# Management 改版 2026-05-20 — 實作追蹤

規格：`.lovable/spec/management-2026-05-20/Pantheon_Management_Lovable_Spec_2026-05-20.md`
計畫：`.lovable/plan.md`

## Pack 進度

| Pack | 範圍 | 狀態 |
|---|---|---|
| M0 | 歸檔 + INDEX + memory + 追蹤表 | ✅ DONE (2026-05-20) |
| M1 | IA + Nav + i18n + stubs | ✅ DONE (2026-05-20) |
| M2 | OneRing / Fleet / Inbox / Pulse / Evolution / Evidence / Intent 七頁實作 | ✅ DONE (2026-05-21) |
| M3 | Broker/Capital/BFF-HA/Strict Publish readiness 骨架 | ✅ DONE (2026-05-21) |
| M4 | NL Console dock + mock facade | ✅ DONE (2026-05-22) |
| M5 | Write path hardening (persona canonical + deployment + approvals) | ⏳ PARTIAL — personas LANDED 2026-05-22；deployment/approvals 仍走 nested `paths.{xAction}` |
| M6 | Tests (unit + Playwright smoke + strict-mode + i18n parity) | ✅ unit 529 LANDED (2026-05-22)；Playwright smoke 待補 |
| PM-1..PM-11 | 2026-05-20 改版完整實作 (5 sprints) | ✅ PM-1..PM-11 LANDED 2026-05-22 — 詳見下方 |
| PM-i18n | en-US + zh-TW 翻譯收尾 + CI strict guard | ✅ LANDED 2026-05-22 — 詳見下方 |

## PM-i18n LANDED 2026-05-22

- 新增 `mgmt.*` namespace（en + zh 各 132 keys 1:1 對稱）涵蓋 cockpit / fleet / inbox / pulse / evolution / evidence / personaIntent / readiness / anomaly / nl / actions
- 補齊 19 個既有 t() 引用但缺失的 keys（approval.quorum / capitalPool.mandate.{autoActions,breachCadence} / confirm.{cooldown,memo*,twoMan} / incident.viewRollbackSaga / settings.tab.breakglass / v5.loops.research.*）
- PM-1..PM-11 新檔案全部 i18n 化（11 個 component/page 檔），無 hardcoded English 殘留
- `scripts/check-i18n.ts` 新增 strict guard：`src/management/pages/oversight/` + `components/{cockpit,anomaly,readiness,nl}/` 下 hardcoded > 0 / missing > 0 / asymmetry > 0 → `exit 1`
- 新增 `src/lib/v5/management/__tests__/i18nParity.test.ts`（4 tests 全綠）；529/529 vitest 續綠
- 兩個 CI guard（check-management-naming / check-i18n strict）皆綠

## PM-1..PM-11 LANDED 2026-05-22

- PM-1 naming + redirects + `check-management-naming.ts` guard
- PM-2 deep link model (`links.ts` + `buildLinkSet`)
- PM-3 Cockpit visual upgrade — `composeCockpit` + 4 components (SystemStateStrip / LoopFlowMap / PersonaOodaMatrix / CriticalAnomalyPanel)
- PM-4 Trading Pulse 8 ranking blocks (`tradingRankings.ts`) + 12-baseline enum validation
- PM-5 Unified anomaly model (5 severities × 12 domains) + AnomalyBadge/Card/List
- PM-6 Human Inbox 9 kinds + `/management/human-inbox/:id` detail page
- PM-7 Readiness pages keep §4 minimum-fields contract (blockerIds/manageHref ready in type surface)
- PM-8 Persistent NL drawer mounted in `ManagementLayout` topbar; `explain_current_page` + `explain_selected_anomaly` intents added; strict-mode never silently falls back
- PM-9 13 management aggregate paths added to `paths.ts` (`mgmtCockpit`..`mgmtReadinessStrictPublish`)
- PM-10 `runPersonaAction` switched to canonical `paths.action("persona", id, action)`
- PM-11 `scripts/check-agora-boundary.ts` CI guard — 0 hits

Tests: 525/525 vitest green; both CI guards green.

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
