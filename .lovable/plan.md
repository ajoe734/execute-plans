
# Pack PM-12 — Competition-Style Performance Management

依 `Pathreon_Management_PM12_差異分析與工作文件_2026-05-22.md` 落地完整 PM-12 工作包，補上目前 Management 缺少的「全資金池持倉總覽 + 全人格績效聯賽 + 季度排名 + 績效歸因 + 排名驅動治理」管理層。沿用既有 v5 management seed + bff-v1 facade + withLiveOrMock + i18n + useV5Live pattern，與 PM-Live 一致。

## 範圍與不做

**做**：4 個新頁面、4 份 v5 model、bff-v1 facade 擴充、Cockpit 3 個 snapshot、Human Inbox 新增 `ranking_recommendation` kind、完整 zh-TW / en-US i18n、unit + smoke + deeplink tests。

**不做**：後端 endpoint；任何直接 mutate live capital / persona / deployment 的動作；Agora 端；改 Trading Pulse 既有 8 ranking blocks（與 League 並存）；改 v4/Pack D normative。

---

## 1) 路由與導覽（PM12-001）

`App.tsx` 新增 4 條 lazy route：

```
/management/portfolio-book          → PortfolioBookPage
/management/persona-league          → PersonaLeaguePage
/management/quarterly-ranking       → QuarterlyRankingPage
/management/performance-attribution → PerformanceAttributionPage
```

`ManagementLayout.tsx` 新增 nav group **Performance & League**，包含上述 4 條（避免 Pathreon Management group 過長）。i18n key：

```
nav.portfolioBook / nav.personaLeague / nav.quarterlyRanking / nav.performanceAttribution
groups.performanceLeague
```

---

## 2) v5 Management models（新增 4 檔）

`src/lib/v5/management/`：

- `portfolio.ts` — `PortfolioSummary`、`CapitalPoolSummaryRow`、`HoldingRow`、`defaultPortfolioSeed()`、`composePortfolio()`
- `personaLeague.ts` — `PersonaLeagueRow`、`PersonaLeaguePreset`、`LeagueRecommendedAction`、`defaultPersonaLeagueSeed()`、ranking sort helpers、tier 分布計算
- `quarterlyRanking.ts` — `QuarterlyRankingRow`、`QuarterlyRankingFormula`、`QuarterlyScoreBreakdown`、`computeQuarterlyScore(row, formula)`（純函式）、`defaultQuarterlyFormula()`、`defaultQuarterlyRankingSeed()`
- `performanceAttribution.ts` — `AttributionDimension`（12 種）、`PerformanceAttributionRow`、`defaultAttributionSeed()`

所有 row 都帶 `ManagementLinkSet`（沿用 `links.ts`），便於 deep link。

`humanInbox.ts`：`HumanInboxKind` 新增 `"ranking_recommendation"`、`humanInboxRank` 給予 rank（建議 2.5 落在 approval 與 intervention 之間）；`HumanInboxDetail` 不改 schema，由 detail page 透過 `evidenceRefs` + `consequenceIf*` 文字承載 ranking metadata。

---

## 3) bff-v1 facade 擴充

`src/lib/bff-v1/paths.ts` 新增：

```
mgmtPortfolioBook / mgmtPortfolioHoldings / mgmtPortfolioPools
mgmtPersonaLeague / mgmtPersonaLeagueRankings / mgmtPersonaLeagueTiers
mgmtQuarterlyRanking(quarter?) / mgmtQuarterlyRankingFormula / mgmtQuarterlyRankingRecommendations(quarter?)
mgmtPerformanceAttribution(dimension?, period?)
```

`src/lib/bff-v1/management.ts` 在 `mgmt` 物件新增：

```
mgmt.portfolioBook = { summary, holdings, pools }
mgmt.personaLeague = { list, rankings, tiers }
mgmt.quarterlyRanking = { list, formula, recommendations }
mgmt.performanceAttribution = { list }
```

每個 helper：`withLiveOrMock(req, seedFn, safeAdapt(adapter, seedFn))`，與既有 PM-Live 完全同 pattern。Strict mode（`VITE_BFF_FALLBACK=strict`）失敗會 throw（不 silently fallback seed） — 沿用 liveTransport 既行為。

---

## 4) 頁面實作

### 4.1 PortfolioBookPage (`/oversight/PortfolioBook.tsx`)

Sections：Header(env/currency filter) → Total Snapshot 卡片區 → Capital Pool Summary 表 → Holdings 表（支援 pool/persona/strategy/symbol/assetClass/sector/region/currency 過濾，concentration 與負 PnL 反白）→ Exposure Breakdown（by assetClass / sector / region）→ Risk Alerts → Drilldown。

### 4.2 PersonaLeaguePage (`/oversight/PersonaLeague.tsx`)

Header(period selector + preset selector 9 種) → League KPI → Ranking Table（rank delta arrow + tier badge + 可展開 scoreBreakdown drawer + 支援 sort by rank/PnL/Sharpe/DD/slippage/intervention/violation）→ Tier Distribution → Top Movers → Disqualified/Suspended → Governance Recommendation 欄位（deep link Human Inbox）。

### 4.3 QuarterlyRankingPage (`/oversight/QuarterlyRanking.tsx`)

Header(quarter selector + cutoff/days remaining + formula version) → Quarterly Snapshot → Formula Weights 面板（透明顯示權重與 hardPenalties + minDataRequirements）→ Ranking Table（含 previousQuarterRank + delta + tier）→ Eligibility/Disqualification → Recommendations Panel（每列「Send to Governance」按鈕 → 開 Human Inbox detail）→ Evidence Packets list。

### 4.4 PerformanceAttributionPage (`/oversight/PerformanceAttribution.tsx`)

Dimension selector（12 種）+ period selector → Contribution Table（PnL contribution、risk contribution 分欄、正負染色、可排序、點 row → 該 entity detail、evidence link）。

所有頁面：以 `useV5Live(() => mgmt.X.Y(seedFn))` 取資料，loading skeleton + `LiveStatusBanner` fallback 訊息一致。

---

## 5) Cockpit 整合（PM12-005 / -009）

`src/management/components/cockpit/` 新增 3 元件，插入 `OneRingCockpitPage`：

- `TotalCapitalSnapshot.tsx` — 顯示 totalNav / cash / gross / net / leverage / unrealizedPnL / realizedPnL / activePools / highestRiskPool / largestExposure；卡片點擊 → `/management/portfolio-book`
- `PersonaLeagueSnapshot.tsx` — Top 3 / Bottom 3 / Biggest rank up / down / Most unstable after training / Most improved after evolution；點擊 → `/management/persona-league`
- `QuarterlyRankingCountdown.tsx` — current quarter / cutoff / days remaining / formula version / eligible / disqualified / pending evidence gaps；點擊 → `/management/quarterly-ranking`

資料來源：複用 `mgmt.portfolioBook.summary` / `mgmt.personaLeague.list` / `mgmt.quarterlyRanking.list` + `mgmt.quarterlyRanking.formula`。

---

## 6) Ranking → Human Inbox（PM12-006 / -010）

- `HumanInboxKind` += `"ranking_recommendation"`；i18n 補對應 label / consequence 模板。
- `PersonaLeagueRow.recommendedAction` 與 `QuarterlyRankingRow.recommendation` UI 渲染為 button「Send to Governance」。
- 點擊：mock 端使用 `writeOverlay`（既有 30min TTL pattern）寫入一筆 `HumanInboxItem`，kind=`ranking_recommendation`，subject=personaId，evidenceRefs 帶 ranking snapshot ref；live 端打 `POST /bff/management/human-inbox`（若未來提供）— Phase 1 統一走 writeOverlay。
- 跳轉至 `/management/human-inbox/:id`。**絕對不直接 mutate persona / capital / deployment**。

---

## 7) i18n（PM12-011）

zh-TW 與 en-US 同步補：nav 5 keys、頁面 header / section title / column header / preset name / tier label / recommendation 9 種 enum、cockpit snapshot 標題、ranking_recommendation kind label/consequence。`scripts/check-i18n.ts` 必須 0 missing / 0 hardcoded / 0 asymmetry。

---

## 8) Tests

新增測試：

- `src/lib/v5/management/__tests__/portfolio.test.ts` — summary 加總、links 合法
- `__tests__/personaLeague.test.ts` — 排序、rank delta、preset 切換
- `__tests__/quarterlyRanking.test.ts` — `computeQuarterlyScore` 公式正確、eligibility / disqualification 判定、recommendation 對應
- `__tests__/performanceAttribution.test.ts` — sort by contribution、正負染色資料正確
- `src/lib/bff-v1/__tests__/management.test.ts` 擴充 — 4 個新 namespace 各驗 mock shape + path URL + strict-mode error 路徑
- Route smoke test（沿用既有 ManagementLayout test pattern）4 條新路由可渲染、nav 有對應項
- Deep link test — 每類 row links 命中合法目標
- i18nParity 自動覆蓋新 key

驗收：`bun test` 全綠（既有 536 + 新增 ~30）；`check-i18n` / `check-management-naming` 0 hit。

---

## 9) 範圍預估

- 新增：4 v5 model + 4 page + 3 cockpit 元件 + 1 facade 段 + ~6 測試檔
- 修改：`App.tsx`、`ManagementLayout.tsx`、`paths.ts`、`management.ts`、`humanInbox.ts`、`OneRingCockpitPage`、i18n 兩檔
- 估 ~2400 行新增 + ~250 行修改，1 commit

完成後 Pathreon Management 才真正具備「競賽式多人格交易管理」管理層。
