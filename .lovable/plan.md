
# 補齊到藍圖：完整 Phase 計畫

目標：把現況（59 頁 + Shell 完整、但 Sidebar 不對、子表面缺）推進到 Spec Part 1–3、Part 4–5 列出的所有模組與 UI Surface。

每個 Phase 結束都應該可單獨驗收、不破壞前一階段。預估規模以「新增/重構頁面數」為單位，1 頁 ≈ 中等複雜度元件。

---

## Phase 1 — Sidebar、群組、路由對齊（小，~1 sprint）

不新增功能，只動結構，先讓導覽符合藍圖。

**Management Sidebar 重排成 6 群：**
```text
Command          → Command Center
Core Management  → Strategies / Personas / Capital / Ranking / Rebalance / Evolution
Research & Gov.  → Experiments / Governance / Knowledge / Lineage
Operations       → Deployment / Runtimes / Risk Center / Incidents / Jobs
Capabilities     → Tools / MCP / Skills
System           → Audit / Settings
```

**Agora Sidebar 重排成 5 群：**
```text
Daily Work       → Daily / Market / Signals / Triage
Research         → Notebook / Insights / Decisions
AI Collaboration → Ask Personas / Committee Room
Training         → Trainer / Memory / Skill Coaching / Persona Lab / Evaluations
Channels         → Channels
```

**路由名稱對齊：**
- `capital-pools` → `capital`（保留 redirect）
- `rebalances` → `rebalance`
- `ranking-formulas` → `ranking/formulas`，新增 `ranking` dashboard 殼
- 拆 `governance` 與 `approvals` 為兩個獨立路由
- 新增 `/management/lineage`、`/management/settings`
- Agora：`agora` → 對應 `agora/daily`；`market` 拆 `markets` + `watchlist`；`decisions` → `journal`；`skills` → `skill-coaching`；`eval` → `evaluations`；新增 `agora/trainer/:personaId`

**涉及檔案：** `ManagementLayout.tsx`、`AgoraLayout.tsx`、`App.tsx`、`i18n/locales/*`、`Placeholder` 殼填空頁。

**驗收：** Sidebar 群組與藍圖 §5/§6 一字不差；舊路由 301 redirect；所有新路由不 404。

---

## Phase 2 — 缺漏模組殼 + Settings/Lineage/Knowledge（中，~1–2 sprint）

把 Phase 1 開出的空路由補成「可導覽、有骨架、有 Mock 資料」的頁面，先求覆蓋率。

**新建頁面：**
1. `Settings`（§System）— 個人偏好、Workspace、整合、API Keys、Locale、Theme、Feature Flags 6 個 Tab。
2. `LineageExplorer`（§19.6）— 重用 `LineageGraph` 元件，加上 entity selector + filter。
3. `KnowledgeInbox`（§19.6）— Insight triage queue，可推到 Artifact / Postmortem。
4. `PostmortemLibrary`（§19.6）— 列表 + Detail（從 Incident `postmortem_id` 跳入）。
5. `GovernanceQueue` 與 `GovernanceReview`（§9.6）— 從 Approvals 拆出，獨立 review 流程。
6. `RankingDashboard`（§15.7）— Performance ranking 主表 + Score Breakdown drawer。
7. `WorkflowTemplates` + `HookCronManager`（§18.9）— Capabilities 群下兩個獨立頁。
8. `AlphaFactoryBoard`（§6.8）— Strategies 子頁，Discovered/Scaffolded/Replicated 三欄看板。

**驗收：** 所有藍圖 §5 列出的 Sidebar 項目都點得進去且有非 Placeholder 內容。

---

## Phase 3 — Detail Page 補齊 Tab（中，~2 sprint）

對齊 Spec Part 3 列出的每個 Detail 頁 Tab 數。

| 頁面 | 現況 Tabs | 藍圖要求 |
|---|---|---|
| StrategyDetail | 2–3 | Overview / Spec & Parameters / Experiments / Paper-Live / Risk & Alerts / Incidents / Artifacts / Evolution / Governance / Lineage / Audit（11） |
| PersonaDetail | 1–2 | Overview / Route Policy / Tools-MCP-Skills / Activity Monitor / Training & Memory（5） |
| CapitalPoolDetail | 1 | Mandate / Risk Budget / Bindings / Activity / Audit（5） |
| RebalanceDetail | 2 | Overview / Simulation / Constraints / Overrides / Approval / History（6） |
| EvolutionDetail | 1 | Direction / Fitness / Mutation / Runs / Candidates / Promotion（6） |
| McpServerDetail | 2 | Server / Tools / Schema / Permissions / Secrets / Audit（6） |
| SkillDetail | 2 | Overview / Versions / Sandbox / Permissions / Risk / Audit（6） |
| ArtifactDetail | 2 | Overview / Diff / Lineage / Rollback / Audit（5） |
| DeploymentDetail | 1 | Overview / Stages / Rollback / Audit（4） |

每個 Tab 需含：標題、Mock 資料、空狀態、可選 action（接 PermissionAwareButton）。

**驗收：** Detail 頁 Tab 數量與藍圖一致，每 Tab 有可呈現內容（非 placeholder）。

---

## Phase 4 — 治理深度表面：Route Policy / Permission Matrix / Memory Governance（大，~2 sprint）

藍圖 §12 / §13 整組沒做，這是治理核心。

**新建：**
- `RoutePolicyEditor`（visual editor + JSON 雙模式）
- `PermissionMatrix` 通用元件（Persona×Tool / Persona×MCP / Persona×Skill / Persona×LifecycleAction 四個 instance）
- `ConsultRuleManager`
- `PolicyVersionDiff`（左右 diff）
- `PolicyApprovalFlow`（用 Approvals model）
- `PersonaMemoryGovernance`、`TrainingUpdateReview`、`MemoryConflictResolver`
- `PersonaActivationPanel`、`PersonaRestrictionPanel`、`PersonaEvaluationDashboard`、`PersonaActivityMonitor`

**新增 BFF mock endpoint：** `routePolicies`, `permissionMatrix`, `memoryUpdates`, `trainingUpdates`。

**驗收：** 可用 Persona 為單位開啟一張 Permission Matrix 並編輯/送審；可看 policy v1 vs v2 diff。

---

## Phase 5 — Studio 類：Formula / Fitness / Sandbox / Allocation Simulation（大，~2 sprint）

**新建：**
- `FormulaStudio`（§15.7）— 編輯器 + Metric library 拖拉 + 表達式驗證
- `FormulaBacktest`、`FormulaCompare`（A/B 並列）
- `FitnessFormulaStudio`（§17.6）
- `MutationRuleManager`、`EvolutionRunMonitor`、`CandidateBrowser`、`PromotionPanel`
- `SkillSandboxRunner`（§18.9）— 可塞輸入、跑 mock、看 trace
- `AllocationSimulation`（§16.6）— 拖 slider 看 portfolio 重算
- `MetricFreezeManager`、`ConstraintChecker`、`OverrideManager`（rebalance 子流程）
- `RiskBudgetEditor`、`Persona/Strategy-Capital BindingMatrix`、`AllocationLimitManager`、`FreezeUnfreezePanel`

**驗收：** 每個 Studio 可在 Mock 資料上完整跑一次「編輯 → 驗證 → 結果」；不需要真實計算引擎，但要呈現結果結構。

---

## Phase 6 — 觀測性與 Audit 深度（中，~1 sprint）

- `JobLogs` viewer（從 JobProgressDrawer 抽出獨立路由 + filter）
- `SystemEventStream`（realtime tail）
- `ApprovalHistory`（獨立查詢頁）
- `EntityAuditTimeline` 接到所有 Detail Tab
- `MCPCallAudit`、`SkillAudit` 獨立頁

**驗收：** 每個核心 entity 在 Detail 頁的 Audit Tab 都顯示真實 mock 事件；可從 Audit Explorer 反查 entity。

---

## Phase 7 — Agora 補完 + i18n / QA（小，~1 sprint）

- `Markets` / `Watchlist` 拆成兩頁（目前合併）
- `TrainerStudio/:personaId` 個人 trainer 頁（含 memory edit、skill assign、eval run）
- `AskPersonas` 補：personas multi-select、context attach、handoff to Committee
- `Notebook` 補：tag、link to artifact、convert to research_task with job
- 跑 `scripts/check-i18n.ts` 確保新增 key 兩語系都有
- 更新 `QAChecklist` 把 Spec Part 8 的 acceptance 全部列入並打勾

**驗收：** 跑完 i18n check 0 missing；QA Checklist 全綠。

---

## 規模估算

| Phase | 新建頁面 | 重構頁面 | 新元件 | 預估 |
|---|---|---|---|---|
| 1 | 0 | 3 | 0 | S |
| 2 | 8 | 1 | 1 | M |
| 3 | 0 | 9 | 0 | M |
| 4 | 11 | 2 | 2 | L |
| 5 | 14 | 1 | 0 | L |
| 6 | 5 | 多 | 0 | M |
| 7 | 2 | 3 | 0 | S |

合計：約 40 新頁、20 重構、3 新通用元件。全做完估 8–10 sprint。

---

## 執行原則

- **Mock 先行**：所有新頁先用 `bff` mock client，不打真實後端。
- **語意 token only**：嚴禁直寫 color；走 `index.css` / `tailwind.config.ts`。
- **Permission gating**：所有 action 走 `PermissionAwareButton`，high-risk 走 `HighRiskConfirm`。
- **狀態機驅動**：state badge / 可用 action 一律從 `stateMachines/` 推導。
- **i18n 雙語**：每個 string 進 `locales/*.ts`。
- **每 Phase 結束跑** `bunx vitest run` + `scripts/check-i18n.ts`。

---

## 建議下一步

如果同意，先動 **Phase 1**（最小破壞、最大「對齊感」），約 1–2 個 commit 即可看到整個 Sidebar 變成藍圖樣子。確認 Phase 1 行為後再啟動 Phase 2。

要不要直接核准我開始 Phase 1？或你想先調整哪個 Phase 的順序/範圍？
