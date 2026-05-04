## Sidebar / 全站翻譯收斂

針對 zh-TW 介面中側邊欄與相關 i18n key 仍夾雜英文的問題，一次補齊。同時順手處理 KPI 與 StatCard 的 `uppercase` 副作用。

### 1. zh-TW nav / groups 補譯
`src/i18n/locales/zh-TW.ts` 修改：

- `nav.jobs`: `Jobs` → `任務`
- `nav.runtimes`: `Runtime` → `執行環境`
- `nav.tools`: `Tools` → `工具`
- `nav.mcp`: `MCP` → `MCP 伺服器`（MCP 為協定縮寫保留）
- `nav.skills`: `Skills` → `技能`
- `nav.channels`: `Channel` → `通道`
- `nav.memoryReview`: `Memory Review` → `記憶回顧`
- `nav.skillCoaching`: `Skill Coaching` → `技能教練`
- `nav.personaLab`: `Persona Lab` → `Persona 實驗室`
- `nav.eval`: `Evaluation Suites` → `評估套件`
- `nav.committee`: `Committee Room` → `委員會`
- `nav.trainerStudio`: `AI 訓練工作室`（保留）
- `groups.operations`: `Operations` → `營運`

`topbar.search` / `topbar.runningJobs` 中的 `Job` → `任務`。

### 2. en-US 對齊
`src/i18n/locales/en-US.ts` 確認對應 key 都存在（committee、memoryReview、skillCoaching、personaLab、eval），缺的補上英文值，避免 fallback 顯示 key。

### 3. StatCard / Badge `uppercase` 收斂
- `src/platform/components/StatCard.tsx`：標題容器把 `uppercase tracking-wider` 改為僅在 `locale==="en-US"` 套用（透過 `usePlatform` 讀 locale），或直接移除 `uppercase`，改用 `text-xs font-semibold tracking-wide`。中文不需要全大寫。
- `src/platform/components/StatusBadge.tsx`：移除 `capitalize`（中文無作用，英文 label 已是大寫開頭）。
- 同步修 `CommandCenter.tsx` 中 KPI 標題「LIVE 高風險策略 / RUNTIME 健康度 / 執行中 JOB」字串：拆成純語意 — `live.highRiskStrategies` → `Live 高風險策略`、`runtime.health` → `Runtime 健康度`、`jobs.running` → `執行中任務`，並把 i18n key 化（不再硬編碼於 page）。

### 4. Mock 資料中明顯的英文 UI 字串
- 不動業務性英文（incident title、actor、symbol），符合 spec「runtime data 由後端產生」原則。
- 但 `CapabilitiesLists.tsx` 中 column header `Category / Inputs / Used by / Endpoint / Tools / Envs / Mode / Eval / Personas / Subs` 全部走 i18n（新增 `table.category / table.inputs / table.usedBy / table.endpoint / table.tools / table.envs / table.mode / table.eval / table.personas / table.subscribers`）。

### 涉及檔案
- `src/i18n/locales/zh-TW.ts`
- `src/i18n/locales/en-US.ts`
- `src/platform/components/StatCard.tsx`
- `src/platform/components/StatusBadge.tsx`
- `src/management/pages/CommandCenter.tsx`
- `src/management/pages/CapabilitiesLists.tsx`

### 驗收
- 切到 zh-TW，左側欄無任何英文（除 MCP 縮寫 / Persona 專有名詞）。
- KPI 卡標題在 zh-TW 下不再全大寫、無字疊。
- `bun run scripts/check-i18n.ts` 通過、30/30 測試維持。
