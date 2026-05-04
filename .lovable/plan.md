
# 補齊到藍圖：Phase 9–12 實作計畫

承接前次盤點（zh-TW + en-US 雙版），目前缺口集中在 **Detail Tab 深度**、**治理表面（§12–13）**、**Studio 類（§15–18）**、**Agora 拆頁與個人 Trainer**、以及對應的 **BFF mock seeds**。以下分四個 Phase，全部 mock-first、不接真後端、語意 token only、雙語 i18n、走 PermissionAwareButton + stateMachines。

---

## Phase 9 — Agora 拆頁 + BFF Seeds 擴充（S, ~1 sprint）

把後續 Phase 都會踩到的「資料缺口」與「Agora 雙頁共用」先處理掉。

### 9.1 Agora 拆頁
- 拆 `MarketWatchlist.tsx`：
  - `Markets.tsx`：總覽、熱門資產、市場熱力。
  - `Watchlist.tsx`：個人關注清單、可加減、排序、推到 Signal Triage。
- 新增 `TrainerStudio/:personaId` 路由與分支邏輯：
  - 無 personaId → 現有總覽（queues + sources）。
  - 有 personaId → 個人 Trainer：persona header、memory edit、skill assign、eval run 三個區塊（重用 §4 元件）。
- `AskPersonas.tsx`：personas multi-select、context attach、handoff to Committee 按鈕。
- `Notebook.tsx`：tag、link to artifact、convert to research_task（觸發 mock job）。

### 9.2 BFF Seeds 擴充
在 `src/mocks/seed.ts` + `src/lib/bff/client.ts` + `src/lib/bff/types.ts` 新增：
- `routePolicies`（persona → tool/mcp/skill 路由規則 + version）
- `permissionMatrix`（4 個 instance 的 cell-level grants）
- `memoryUpdates`、`trainingUpdates`（Persona memory governance queue）
- `evolutionRuns`、`evolutionCandidates`（演化執行 + 候選）
- `fitnessFormulas`、`mutationRules`
- `allocationSimulations`（rebalance slider 結果）
- `policyVersions`（policy v1/v2 diff）

驗收：跑 vitest 全綠；每個新 endpoint 有至少 3 筆 seed；Agora sidebar 兩條路由各自獨立頁。

---

## Phase 10 — Detail Tab 深度補齊（M, ~2 sprint）

對齊 Spec Part 3 的 Tab 結構，把現有以 DataTable/AuditTimeline 帶過的 Tab 換成藍圖指定內容。

| 頁面 | 補上的 Tab 內容 |
|---|---|
| `PersonaDetail` | Route Policy（Editor 預覽 + 版本）、Tools-MCP-Skills（PermissionMatrix 嵌入）、Activity Monitor（即時 mock stream）、Training & Memory（governance queue 連結） |
| `CapitalPoolDetail` | Mandate（章程 + binding 規則）、Risk Budget（編輯器）、Bindings（strategy/persona binding matrix） |
| `RebalanceDetail` | Simulation（slider + 重算）、Constraints（checker）、Overrides（手動覆寫清單）、Approval（多階段 stepper） |
| `EvolutionDetail` | Direction、Fitness（formula 顯示）、Mutation（rule list）、Runs、Candidates、Promotion |
| `McpDetail` | Server / Tools / Schema / Permissions / Secrets / Audit |
| `SkillDetail` | 補 Sandbox（輸入框 + mock trace）、Risk |
| `StrategyDetail` | 補 Spec & Parameters、Paper-Live、Evolution、Lineage（與 §11 共用 LineageGraph） |
| `ArtifactDetail` | Diff、Lineage、Rollback |
| `DeploymentDetail` | Stages（環境 stepper）、Rollback |

每 Tab：標題 + mock 資料 + 空狀態 + PermissionAwareButton。所有 high-risk 動作走 HighRiskConfirm。

---

## Phase 11 — 治理深度表面 §12 / §13（L, ~2 sprint）

藍圖治理核心，目前完全沒做。新元件放在 `src/management/components/governance/`。

### 11.1 通用元件
- `PermissionMatrix`（reusable，row/col/cell/状态/批次選取）
- `RoutePolicyEditor`（Visual + JSON 雙模式 toggle）
- `PolicyVersionDiff`（左右 diff）
- `PolicyApprovalFlow`（用既有 Approvals model）

### 11.2 新建頁面（路由放 `/management/governance/...` 與 Persona 子頁）
- `RoutePoliciesList` + `RoutePolicyDetail`
- `PermissionMatrixPage`（4 個 instance：Persona×Tool / ×MCP / ×Skill / ×LifecycleAction，用 tab 切換）
- `ConsultRuleManager`
- `PersonaMemoryGovernance`、`TrainingUpdateReview`、`MemoryConflictResolver`
- `PersonaActivationPanel`、`PersonaRestrictionPanel`、`PersonaEvaluationDashboard`、`PersonaActivityMonitor`（多數能在 PersonaDetail Tab 內嵌）

驗收：可選一個 Persona → 開 Permission Matrix → 編輯 cell → 送審；可看 policy v1 vs v2 diff；Memory governance queue 可 approve / reject / merge。

---

## Phase 12 — Studio 類 §15–18（L, ~2 sprint）

### 12.1 Ranking / Fitness Studio
- `FormulaStudio`（§15.7）：metric library 拖拉 + 表達式驗證
- `FormulaBacktest`、`FormulaCompare`（A/B 並列）
- `FitnessFormulaStudio`（§17.6）

### 12.2 Evolution
- `MutationRuleManager`、`EvolutionRunMonitor`、`CandidateBrowser`、`PromotionPanel`

### 12.3 Skill / Capital / Rebalance
- `SkillSandboxRunner`（§18.9）：輸入 → mock 執行 → trace 結果
- `AllocationSimulation`（§16.6）：slider 拖動即時重算 portfolio
- `MetricFreezeManager`、`ConstraintChecker`、`OverrideManager`
- `RiskBudgetEditor`、`BindingMatrix`、`AllocationLimitManager`、`FreezeUnfreezePanel`

每個 Studio：完整跑「編輯 → 驗證 → 結果」於 mock data 上。

---

## 跨階段保證
- 每 Phase 結束跑 `bunx vitest run` + `scripts/check-i18n.ts`，必須 0 missing。
- 所有新 string 同步進 `zh-TW.ts` + `en-US.ts`。
- 嚴禁直寫 color；走 semantic token。
- 結束時更新 `QAChecklist`，把 Spec Part 8 acceptance 標記至對應項。

---

## 規模

| Phase | 新頁/拆頁 | 重構 | 新元件 | BFF seeds | 規模 |
|---|---|---|---|---|---|
| 9 | 4 | 1 | 0 | 8 | S |
| 10 | 0 | 9 | 0 | 0 | M |
| 11 | 8 | 2 | 4 | 0 | L |
| 12 | 14 | 1 | 0 | 0 | L |

合計：約 26 新頁、13 重構、4 新通用元件、8 組新 mock endpoint。

---

## 建議啟動順序

**先做 Phase 9**（拆頁 + seeds），因為 Phase 10/11/12 都依賴新 mock endpoint。確認 Phase 9 後再進 Phase 10（Detail Tab，使用者最有感），最後 Phase 11 → 12（治理 → Studio）。

要不要直接核准 Phase 9 開工？或想先調整 Phase 順序 / 範圍？
