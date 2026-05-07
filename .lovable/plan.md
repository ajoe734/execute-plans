## 你發現的對 — zh-TW 還有大量未中文化字串

從你提供的截圖（左側欄「Control Room / Loop Runs」）可看到 v5 IA 一票標籤仍是英文。我用腳本掃描 `src/i18n/locales/zh-TW.ts`，**還有 ~30 個 user-facing 字串沒翻**（其餘 25 個非 CJK 值是 Persona / Sharpe / Alpha / VaR / Δ Sharpe / 範例值 v1.0.0 / 公式 `0.6*sharpe-...` 這類**刻意保留的專有名詞或代碼樣本**，不該翻）。

之前 i18n 檢查腳本只比對 key 對稱與缺失，**沒檢查 zh-TW 值是否仍是英文**，所以漏掉了。

### 1) zh-TW 待翻譯字串（en-US 保持英文不動）

| 位置 | key | 現值 (zh) | 改為 |
|---|---|---|---|
| sideNav | `signals` | Signal Review | 訊號審查 |
| sideNav | `watchlist` / `markets/watchlist` | Watchlist | 觀察清單 |
| sideNav | `studios` / `phase16.hub` | Studios | 工作室 |
| sideNav | `controlRoom` | Control Room | 控制中心 |
| sideNav | `loops` | Loop Runs | 閉環執行 |
| sideNav | `postmortems` | Postmortem 知識庫 | 事後檢討知識庫 |
| v5.loops.execution | `runs` | Loop runs | 執行紀錄 |
| v5.matrix | `findings` | Findings | 監測項 |
| v5.findings | `affectedRuntime` | Runtime | 執行環境 |
| timeline (l.545) | `postmortem` | Postmortem | 事後檢討 |
| persona draft (971/985) | `systemPrompt` | System Prompt | 系統提示詞 |
| settings.tab/workspace | `workspace` / `workspace.title` | Workspace | 工作區 |
| skill (1268) | `discovered/scaffolded/replicated` | Discovered/Scaffolded/Replicated | 已探索 / 已搭建 / 已複製 |
| sandbox (1300) | `trace` | Trace | 追蹤紀錄 |
| deployment stages (1401) | `canary` | Canary | 金絲雀 |
| timeline (1441) | `artifact` | Artifact | 產出物 |
| artifact kinds (1468) | `model/dataset/report/container` | Model/Dataset/Report/Container | 模型 / 資料集 / 報告 / 容器 |
| deployment initialMode (1469) | `shadow/suspended` | Shadow/Suspended | 影子模式 / 暫停 |

### 2) 刻意保留為英文的字串（**不翻**，避免與 spec 名詞表脫節）

- 角色/契約名詞：`Persona`、`Sharpe`、`Alpha`、`Memo`、`Token`、`PnL`、`VaR 95%`、`Beta`、`Δ Sharpe`、`Δ DD`、`Hypothesis`、`Sandbox`、`Risk`、`Severity`、`Backtest`、`Score`、`Findings`（key 名）
- 範例/代碼：`v1.0.0`、`alpha-momentum`、`0.6*sharpe-0.3*|dd|`、`trader / analyst`、`Persona IDs`、`Alpha (slug)`
- 樣板字串：`{{action}} — {{name}}`、`Accept-Language`
- 既有混合詞：`MCP 伺服器`、`Pantheon`、`Watchlist` 已改為「觀察清單」但保留品牌詞 `Pantheon`

### 3) sideNav 文案 ↔ Route labels 一致性

`src/lib/v4/routeLabels.ts` 是 G08 落地的 PageHeader/breadcrumb 單一來源，**它已經透過 i18n key 解析**，所以 sideNav 改 zh-TW 值後，PageHeader 與 Breadcrumb 會自動同步，不需動 routeLabels.ts。

### 4) 強化 i18n 檢查腳本（防止再漏）

在 `scripts/check-i18n.ts` 加入第三項檢查：
- 列出 zh-TW 中**值含 [A-Za-z] 且不含 CJK** 的 key（排除一份允許清單 = 上面第 (2) 點專有名詞）
- 同樣輸出，exit 0（informational）

### 5) 驗證

- `bunx tsx scripts/check-i18n.ts` → Missing 0 + 新增的「zh-TW 疑似未翻」清單應只剩 allowlist
- `bunx vitest run` → 270 tests 應仍全綠
- 截圖驗：切到 zh-TW 後，左側欄應顯示「控制中心 / 閉環執行 / 訊號審查 / 觀察清單」等
- 寫入 `.lovable/audits/i18n-zh-tw-pass2-2026-05-07.md`

### 不在範圍

- 程式註解 `// ---------- Control Room ----------` 等（非使用者可見）
- spec / audit markdown 文件（與 IA spec 名詞表保持一致）
