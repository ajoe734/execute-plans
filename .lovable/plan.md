# Pack M2–M6 實作計畫（依 2026-05-20 設計團隊五項裁示）

M0 + M1 已 LANDED。本計畫涵蓋 M2–M6，全程依據裁示寫成硬規則。

## 硬規則（寫進 code 與 test）

1. **NL Console**：Phase 1 `fixed_mock` only；前端**禁止**直接呼叫 Lovable AI Gateway 或 google/gemini-*；strict mode 不靜默 fallback；endpoint `POST /bff/management/nl/ask` Phase 1 不實作。Env：`VITE_MANAGEMENT_NL_PROVIDER=fixed_mock`、`VITE_MANAGEMENT_NL_GATEWAY_ENABLED=false`。
2. **Persona Intent Traces**：BFF 不回 raw prompt；`userIntentSummary` 視為已 redact；UI 三層 `summary | redacted | restricted`；**禁止** reveal / expand / download / reconstruct。
3. **Trading Pulse**：拆 `baselineKind` (12-value enum) + `baselineLabel` (display)；預設 3 卡：`previous_artifact / 7d_rolling / last_review`，其餘進 dropdown。
4. **Readiness 5 頁**：三段式（Header + Checklist + EvidencePackets + Blockers）；Phase 1 **照裁示 §4.1–4.5 全部最小欄位實作**，不留 TODO；enable/activate 鈕只能是 human-gate placeholder。
5. **Archive**：標 Management UX Overlay Spec，**不取代** BFF OpenAPI / Pack D / v5。

## Pack M2 — Core 7 Pages

每頁：`src/lib/v5/management/<page>.ts` (pure view-model, 100% testable) + `src/management/pages/oversight/<Page>.tsx` (UI via `useV5Live` + `bff-v1/lists`)；三態齊全 + strict-mode 不靜默 fallback + axe smoke。

- OneRingCockpit `/management/one-ring`
- PersonaFleet `/management/persona-fleet`
- HumanInbox `/management/human-inbox`（沿用 D26 ApprovalEvent / AskEvent）
- TradingPulse `/management/trading-pulse`（新增 `TradingBaselineKind` enum）
- EvolutionJournal `/management/evolution-journal`
- EvidenceExplorer `/management/evidence-explorer`（19+3 EvidenceKind）
- PersonaIntentTraces `/management/persona-intent-traces`（新增 `PersonaIntentTrace` + `PersonaIntentVisibility`，**無 reveal UI**）

## Pack M3 — Readiness 5 Pages

共用元件 (`src/management/components/readiness/`)：`ReadinessHeader`、`ReadinessChecklist`、`EvidencePacketList`、`BlockersList`。

Types：`src/lib/v5/management/readiness.ts` — `ReadinessStatus`、`ReadinessChecklistItem`、`ReadinessBlocker`、`ReadinessPacket`。

各頁 checklist items 完全照裁示列：
- Ep5CanaryReadiness `/management/readiness/ep5` — 12 items；actions: View Evidence / Open Human Gate / Refresh / Export；**禁** Enable Canary/Live
- BrokerLiveReadiness `/management/readiness/broker-live` — 10 items + 6 blocker codes
- CapitalBindingLiveReadiness `/management/readiness/capital-binding-live` — 14 items
- BffHaReadiness `/management/readiness/bff-ha` — 11 items
- StrictPublishAudit `/management/readiness/strict-publish` — 12 items（含 env manifest 三項）

## Pack M4 — NL Console (mock-only)

- `src/lib/bff-v1/managementNl.ts` — `ManagementNlIntent` (7 值) + `ManagementNlProvider`；deterministic fixed responder；strict mode 直接報錯；high/critical risk intent 只回 human gate 連結
- `src/management/components/NlConsoleDock.tsx`（TopBar dock）
- `src/management/pages/oversight/NlConsole.tsx` `/management/ask`
- `.env.example` 補兩個 flag，預設關閉

## Pack M5 — Write Path Hardening

- 統一 `paths.personaAction` → `paths.action("persona", id, action)`
- `DeploymentDetail` 改 `runActionSafe`
- 新 `src/lib/v4/__tests__/noLegacyMutations.test.ts` AST scan 防 regression

## Pack M6 — Testing & Acceptance

- Vitest：每個 view-model + readiness composer + NL responder + PersonaIntent visibility 規則（驗無 reveal API）
- Playwright smoke：12 routes + NL dock
- i18n parity 補齊新 keys
- §14 acceptance checklist tick-off → `.lovable/audits/mgmt-revamp-2026-05-20-plan.md`
- `mem://index.md` 標 M2–M6 LANDED

## 技術細節

新檔布局：
```text
src/lib/v5/management/
  personaIntent.ts       // PersonaIntentVisibility + PersonaIntentTrace
  tradingBaseline.ts     // TradingBaselineKind (12) + label helpers
  readiness.ts           // shared readiness types
  oneRing.ts             // cockpit composer
  evolutionJournal.ts    // baseline diff composer
  evidenceExplorer.ts    // packet browser composer
  nl.ts                  // ManagementNlIntent + Provider
src/management/components/readiness/
  ReadinessHeader.tsx
  ReadinessChecklist.tsx
  EvidencePacketList.tsx
  BlockersList.tsx
```

Mock 資料：`src/lib/bff-v1/seed.ts` 補 5 種 readiness packets、三 visibility 的 intent traces、NL canned responses。Strict mode 不寫 seed（沿用 writeOverlay 規則）。

i18n：`management.readiness.*`、`management.nl.*`、`management.intent.visibility.*`、`management.trading.baseline.*`，en-US / zh-TW 並行。

驗證：`tsc --noEmit` + vitest + playwright smoke + i18n parity。axe smoke 跑 4 個 Oversight 主頁。

範圍：新檔 ~25、修改 ~10；不動 v4 normative / Pack D 契約 / BFF client paths（除 M5）。

執行順序：M2 → M3 → M4 → M5 → M6，每 pack 收尾 tsc + 對應 test 全綠才推下一 pack。
