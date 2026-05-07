## 其他頁面盤點：92 處硬編碼英文字串散在 32 個檔

第一輪只查 JSX 文字 `>Word<`，**漏抓**了 attribute 字串如 `<Section title="...">`、`<PageHeader subtitle="...">`、`<input placeholder="...">`、`<ConfirmDialog description="...">`。重新掃 `(title|subtitle|placeholder|label|description|header)="[A-Z]..."` 後 **共 92 處 / 32 檔**。

掃過你截圖之外其他主要頁面後，這些是**真的還沒中文化**的地方：

### A) Detail 頁 Section title + ConfirmDialog description（11 個檔）
| 檔案 | 內容類型 |
|---|---|
| `ArtifactDetail` | confirm description |
| `CapitalPoolDetail` | `Section title="Pack D · Breach assessment"` + confirm desc |
| `ChannelDetail` | `Section title="Routing"` |
| `DeploymentDetail` | `Section title="Linked objects"` + confirm desc |
| `EvolutionDetail` | `Section title="Generation Progress"` + confirm desc |
| `McpDetail` | `Section title="Runtime health"`, `"Allowed environments"` + confirm desc |
| `PersonaDetail` | confirm desc |
| `RankingFormulaDetail` | confirm desc |
| `RebalanceDetail` | confirm/section |
| `ResearchDetail` | `Section title="Hypothesis"` + confirm desc |
| `SkillDetail`, `StrategyDetail`, `ToolDetail` | section titles |

→ 處理：新增 `detail.confirm.*` + `detail.section.*` i18n 命名空間；逐檔把字串換成 `t("detail.section.routing")` 等；中文翻譯一併寫入。

### B) 內嵌 Detail Panels（4 個）
- `EvolutionFreezePanel` / `FreezeUnfreezePanel` / `McpSecretsPanel` / `SkillRiskPanel` — confirm dialog descriptions

→ 處理：使用既有 `detail.confirm.*` 同套 key。

### C) Agora 頁面 PageHeader subtitle / placeholder（9 個）
| 檔案 | 待中文化 |
|---|---|
| `AlertTriage` | subtitle + textarea placeholder |
| `AskPersonas` | subtitle + input placeholder |
| `DecisionJournal` | subtitle |
| `EvaluationSuites` | subtitle |
| `InsightInbox` | subtitle |
| `PersonaLab` | subtitle |
| `SignalReview` | subtitle |
| `SkillCoaching` | subtitle |
| `SignalDetail` | DriverBar label `"Momentum"` `"Earnings"` (mock 範例詞，**保留英文**) |

→ 處理：新增 `agora.<page>.subtitle` / `.placeholder` keys，全部走 `t(...)`；DriverBar mock 標籤保留。

### D) Studio 與圖表（2 個）
- `FormulaBacktestChart` — chart series labels（`"Equity"`, `"Drawdown"` 等）
- `phase2/Settings.tsx` — `<Row label="English (US)">` 應改成從 i18n 拉 locale 顯示名

### E) 既有保留（不翻）
- `AuditViewer` PageHeader title/subtitle（內部 spec 文件 viewer，文檔語言混搭刻意保留）
- `QAChecklist` PageHeader title（內部 QA tool）
- `pagination.tsx` `aria-label="Pagination"` — 已被 `ui.pagination.*` 包裝；本檔是 shadcn 預設元件，已透過 wrapper 提供 i18n
- `carousel.tsx` 同上
- `BTC-PERP / ETH-PERP` 等 ticker

### F) 強化 lint（防回歸）
擴充 `scripts/check-i18n.ts` `HARD_RE` 系列：再加一個正則檢查 `(title|subtitle|placeholder|label|description|header)="[A-Z][^"{]{4,}"`，輸出檔案統計（exit 0）。

---

### 工作量估計
- 約 **32 檔 × 1–4 處** 改 `t(...)`
- 新增 ~70 個 i18n key（en/zh 同步）
- lint 擴充 1 個正則
- 跑 270 tests 確認不破

### 驗證
- `bunx tsx scripts/check-i18n.ts` → Missing 0、attr-hardcoded 應降至 ≤ 5（僅 AuditViewer/QAChecklist/碼）
- `bunx vitest run` → 270 passed
- 寫入 `.lovable/audits/i18n-zh-tw-pass3-2026-05-07.md`
