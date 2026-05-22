
# Pack PM-Live — One Ring Oversight + Studios 完整 BFF 串接

## 範圍

把目前**唯一**還在純 mock seed 的兩塊補上 `withLiveOrMock` adapter，讓 `VITE_BFF_MODE=live` 時打真 BFF、失敗 fallback seed（與其他頁面一致）。

不動：v4 / Pack D normative、Agora（已用 `withStrictLiveOrMock` 串接）、v5 Loop OS（已串）、所有 Management 核心列表/詳情（已串）。

## 目標清單

### A. Management Oversight (PM-1–PM-11) — 14 條 path 全部 live wire

`paths.ts` 已定義但無 adapter 的 14 條：

| Path 函式 | 後端 endpoint | 接到的頁面 / 元件 |
|---|---|---|
| `mgmtCockpit()` | `GET /bff/management/cockpit` | `oversight/_core.tsx` `OneRingCockpitPage` (PM-3) |
| `mgmtPersonaFleet()` | `GET /bff/management/persona-fleet` | PM-7 `PersonaFleetPage` |
| `mgmtHumanInbox()` | `GET /bff/management/human-inbox` | PM-6 `HumanInboxPage` |
| `mgmtHumanInboxItem(id)` | `GET /bff/management/human-inbox/{id}` | `HumanGateDetail.tsx` |
| `mgmtTradingPulse()` | `GET /bff/management/trading-pulse` | PM-4 `TradingPulsePage` |
| `mgmtTradingRankings()` | `GET /bff/management/trading-pulse/rankings` | PM-4 8 ranking blocks |
| `mgmtEvolutionJournal()` | `GET /bff/management/evolution-journal` | PM-11 |
| `mgmtEvidenceExplorer()` | `GET /bff/management/evidence` | PM-1 |
| `mgmtPersonaIntent()` | `GET /bff/management/persona-intent` | `PersonaIntentTraces.tsx` |
| `mgmtReadinessEp5()` | `GET /bff/management/readiness/ep5` | `Ep5CanaryReadiness.tsx` |
| `mgmtReadinessBrokerLive()` | `GET /bff/management/readiness/broker-live` | `BrokerLiveReadiness.tsx` |
| `mgmtReadinessCapitalBinding()` | `GET /bff/management/readiness/capital-binding-live` | `CapitalBindingLiveReadiness.tsx` |
| `mgmtReadinessBffHa()` | `GET /bff/management/readiness/bff-ha` | `BffHaReadiness.tsx` |
| `mgmtReadinessStrictPublish()` | `GET /bff/management/readiness/strict-publish` | `StrictPublishAudit.tsx` |

### B. Studios mock-only helpers — 11 個 helper 補 live adapter

`fitnessFormulas`, `mutationRules`, `policyViolations`, `allocationLimits`, `poolFreezes`, `mcpSecrets`, `promotions`, `metricFreezes`, `rebalanceOverrides`, `permissionMatrices`, `featureSets` → 用既有 `liveListOrSeed` / `liveDerivedListOrSeed` pattern 補上。

## 實作設計

### 1) 新增 `src/lib/bff-v1/management.ts`

集中放 PM-1–PM-11 的 live wiring，與 `lists.ts` 同 pattern：

```ts
import { withLiveOrMock } from "./liveTransport";
import { paths } from "./paths";
import { composeCockpit, defaultCockpitSeed, type CockpitModel } from "@/lib/v5/management/cockpit";
import { defaultPulseRankings, type TradingPulseRankBlock } from "@/lib/v5/management/tradingRankings";
import { ... } from "@/lib/v5/management/humanInbox";
// ...

export const mgmt = {
  cockpit: {
    get: (): Promise<CockpitModel> =>
      withLiveOrMock(
        { method: "GET", path: paths.mgmtCockpit() },
        async () => composeCockpit(defaultCockpitSeed()),
        (raw) => adaptCockpit(raw),
      ),
  },
  humanInbox: {
    list: () => withLiveOrMock({ method: "GET", path: paths.mgmtHumanInbox() }, mockInbox, adaptInbox),
    get: (id) => withLiveOrMock({ method: "GET", path: paths.mgmtHumanInboxItem(id) }, () => mockInboxItem(id), adaptInboxItem),
  },
  tradingPulse: { get: ..., rankings: ... },
  personaFleet: { get: ... },
  evolutionJournal: { list: ... },
  evidence: { list: ... },
  personaIntent: { list: ... },
  readiness: {
    ep5: () => ...,
    brokerLive: () => ...,
    capitalBinding: () => ...,
    bffHa: () => ...,
    strictPublish: () => ...,
  },
};
```

從 `@/lib/bff-v1` barrel re-export，UI 改用 `mgmt.*`。

### 2) Adapter 設計

每個 endpoint：
- **Mock branch** = 既有 `composeCockpit(defaultCockpitSeed())` / `defaultPulseRankings()` / seed 直接回傳，不改 view-model 形狀。
- **Live adapter** = `(raw: unknown) => CockpitModel` 等，期待 BFF 回傳已是同 shape；若包在 `{ data: ... }` envelope 內則解包。**不假設後端欄位**：用 `firstArray`/`asRecord` 防禦式解析，缺欄位則退回 seed。
- 用 `fallback=auto`（預設）：live 失敗就 seed；strict mode 由全域控。

### 3) 頁面改造（最小侵入）

每個 PM 頁面從直接呼叫 seed helper 改成 hook：

```tsx
// 之前
const model = useMemo(() => composeCockpit(defaultCockpitSeed()), []);

// 之後
const model = useV5Live(() => mgmt.cockpit.get()).data ?? composeCockpit(defaultCockpitSeed());
```

複用既有 `useV5Live` hook（已支援 loading + SSE refresh）。共 8 個頁面檔案修改。

### 4) Studios mock helpers (B)

在 `src/lib/bff-v1/seed.ts` 把 `delaySeed("bff.fitnessFormulas.list", …)` 等 11 處改成 `liveListOrSeed("bff.fitnessFormulas.list", paths.fitnessFormulas(), seed.fitnessFormulas)`。需要在 `paths.ts` 補對應的 path builder（若尚未存在）。

### 5) Tests

新增 `src/lib/bff-v1/__tests__/management.test.ts`：
- mock mode 回傳形狀 = `composeCockpit(defaultCockpitSeed())`
- live mode + transport fail = fallback to seed（auto）
- live mode + valid response = adapter 正確映射
- 14 條 path 都呼叫到正確 URL

更新 `revamp-2026-05-20.test.ts`：保持 374/374+ green。

### 6) 文件 / Memory

- `.lovable/audits/mgmt-revamp-2026-05-20-plan.md` 加 PM-Live 章節，標 LANDED。
- 更新 `mem://reference/management-revamp-2026-05-20`：M0–M4 之外加註 **Live wiring complete**。
- 更新 `mem://index.md` Core：移除「PM-1–PM-11 純 mock」的暗示（如有）。

## 驗收 gates

1. `bun test` → 既有 529 + 新增 ~12 個 mgmt test，全綠。
2. `scripts/check-i18n.ts` → 0 missing / 0 hardcoded / 0 asymmetry（不退步）。
3. `scripts/check-management-naming.ts` → 0 hits。
4. Build pass。
5. **Mock mode**（預設）：所有 PM 頁面視覺與目前完全一致（cockpit / human inbox / readiness / persona intent / NL）。
6. **Live mode + fallback=auto**：BFF 不通時自動 fallback seed，頁面照常顯示，`LiveStatusBanner` 顯示 fallback。
7. **Live mode + strict + BFF 通**：直接顯示後端資料。

## 不做

- 不改 NL Console 的 `fixed_mock` provider（Phase 1 故意禁用 gateway，spec 規定）。
- 不改 Agora（已串）。
- 不改 v4/Pack D normative TS。
- 不新增 i18n keys 以外的功能變更。
- 不寫後端；只負責 FE adapter。後端若回傳形狀不同，由 adapter 防禦式吸收 + fallback seed。

## 範圍預估

- 新增 1 檔（`management.ts`，~250 行）+ 1 test 檔（~120 行）
- 修改 8 頁面 + `seed.ts` 11 處 + `paths.ts` 補 ~6 path
- ~15 i18n key 不需新增
- 預估 ~600 行變更，1 個 commit
