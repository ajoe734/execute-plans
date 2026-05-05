
# Phase 14 — BFF Mutations × State Machine Wiring

對齊 Spec Part 6 (BFF mutations) × Part 7 §17 (18 entity state machines)。Phase 13 已把 detail tabs 全部接到 `bff.mutations.runAction`，但目前 mutation 層只「設 state + 寫 audit」，並未 (a) 用 stateMachines 驗證合法 transition、(b) 為 Phase 13 新加的 entity-specific 動作（lock_params / freeze_metric / promote_candidate / rotate_secret / set_limit / freeze_pool / promote_stage / submit_override / freeze_generation）建立 typed helper、(c) 在拒絕轉移時回 UI 友好錯誤。

## Slice A — runAction transition guard
- `runAction` 接 `kind` → 對映 stateMachines registry，呼叫 `findTransition(machine, fromState, action)`，找不到時回 `{ ok: false, message: "illegal_transition" }` 並寫 `audit.action = "<kind>.illegal_transition"`。
- `newState` 改成由 transition `to` 推導（如 input 帶 newState 則 assert 一致）。
- toast helper：UI 接 `result.ok === false` 顯示 `t("toast.illegalTransition")`。

## Slice B — typed mutations for Phase 13 entities
新增於 `mutations`：
- `lockParams(strategyId, lock, memo)` — 切 strategy 上的 paramsLocked flag (新欄位 on Strategy)，audit `strategy.lock_params`/`unlock_params`。
- `freezeMetric(rebalanceId, metric, frozen, memo)` — toggle `MetricFreeze` seed 一筆。
- `submitOverride(rebalanceId, strategyId, delta, reason)` — push `RebalanceOverride{state:"review"}`。
- `promoteCandidate(programId, candidateId, target, memo)` — push `PromotionRecord` + 將 candidate state 設 "promoted"。
- `rotateMcpSecret(secretId, memo)` — 更新 `lastRotatedAt`。
- `setAllocationLimit(poolId, scope, scopeRef, cap)` — upsert `AllocationLimit`。
- `freezePool(poolId, reason)` / `unfreezePool(poolId, freezeId)` — push `PoolFreeze` 或將 active 設 false；同步 capitalPool.state via runAction。
- `promoteStage(deploymentId, stageId, memo)` — 把該 stage 設 complete + 下一階段 in_progress。
- `freezeGeneration(programId, memo)` — set evolution program 一個 frozenGeneration 欄位。

每個 helper 內部最後都呼叫 `pushAudit(...)` + `realtime.emit("data", ...)`。

## Slice C — UI 接線升級
把 Phase 13 panels（`StrategySpecTab`、`MetricFreezeManager`、`OverrideManager`、`PromotionPanel`、`McpSecretsPanel`、`AllocationLimitsManager`、`FreezeUnfreezePanel`、`DeploymentStagesPanel`、`EvolutionFreezePanel`）從 generic `runAction` 改用對應 typed helper，能即時看到 seed 更新（DataTable refetch）。

## Slice D — Tests
- `mutations.test.ts` 新增：illegal transition rejected + 一個 typed helper smoke test。
- `stateMachines.test.ts` 已有 coverage，無需動。
- `check-i18n.ts` 0 missing（新增 `toast.illegalTransition` 與 helper-specific keys）。

## 完成判定
- vitest 全綠
- check-i18n 0 missing
- preview：在 Strategy detail 點 Lock Params → seed 反映 → audit 多一筆；在 Rebalance 點非法 action（手動 hack）→ 出 toast「非法狀態轉移」

每個 Slice 一個 commit point。

---

# Phase 13 — Detail Tab 完整補齊

對齊 Spec Part 3（§6 Strategy / §7 Persona / §8 Capital / §9 Rebalance / §10 Evolution / §11 MCP·Skill / §13 Artifact·Deployment）。本階段全部 mock-first、語意 token、雙語 i18n、走 PermissionAwareButton + stateMachines + HighRiskConfirm。

> 上一輪 Phase 9–12 已建構 skeleton，Phase 13 不重新建頁，只「把每個現有 Detail 的 Tab 內容補到藍圖深度」、加缺漏的 Tab、把假的清單換成有編輯/驗證/版本/比較邏輯的元件。

---

## 共用前置（P0，所有子任務都會用到）

新通用元件放 `src/management/components/detail/`：

- `VersionDiffViewer.tsx` — 通用左右 diff（接 string / json）
- `WorkflowStepper.tsx` — 多階段 stepper（steps[]、current、onStepClick），可用於 Rebalance/Deployment
- `MetricFreezeBadge.tsx` — 顯示 metric frozen / liveness
- `LinkedBlock.tsx` — Detail tab 內「指向其他物件」的連結卡片（Identity / Watchers / Decision Journal 共用）
- BFF 新增：`policyVersions` 已有，`strategyVersions`、`paramSnapshots`、`policyViolations`、`evaluationRuns`、`watchers`、`featureSets`、`performanceSeries`、`deploymentStages` seed
- `src/lib/bff/types.ts` 對應 type 補齊；`bff.client.ts` 加 list/get
- `src/i18n/locales/{en-US,zh-TW}.ts` 同步補 key（檢查 `scripts/check-i18n.ts` 0 missing 為 gate）

完成判定：vitest 全綠 + check-i18n 0 missing + 每個新 endpoint ≥3 筆 seed。

---

## A. Persona Detail（§7）— 補 6 個缺漏 Tab

`src/management/pages/PersonaDetail.tsx`（現有 7 tab：overview/routes/performance/routePolicy/permissions/activity/memory/audit）

新增 Tab：
1. `identity` — Identity & Role：archetype、charter、role taxonomy、tone profile
2. `workspace` — Private Workspace：scratchpad notes、pinned artifacts、private memory（與 governance memory 區隔）
3. `capitalBinding` — 顯示此 persona bound 到的 CapitalPool 子集 + 限額（embed `BindingsMatrix` filtered）
4. `strategyOwnership` — owned / co-owned strategies（DataTable + ownership type column）
5. `policyViolations` — 清單（severity、policy id、ts、resolution status），row → governance/{id}
6. `evaluations` — Evaluation Runs（suite name、score、pass/fail、trend mini-chart）
7. `versionHistory` — Persona spec 版本（用 `VersionDiffViewer`，列 v1/v2/v3 + diff）

完成判定：14 tab 齊；每 tab 有 mock 資料 + 空狀態 + 至少一顆 PermissionAwareButton；Persona spec 版本可在 v1 vs v2 切換看 diff。

---

## C. Strategy Detail（§6）— Spec 版本化 + Data/Performance

`src/management/pages/StrategyDetail.tsx`

- 改造 `Spec & Parameters` Tab：把 `StrategyParamsEditor` 包進「version selector + VersionDiffViewer」雙欄；加 `Lock/Unlock` 按鈕（freeze parameters）
- 新增 `dataFeatures` Tab：feature set 清單、上游 dataset、freshness、缺失率
- 新增 `performance` Tab：日 / 週 / 月 PnL series（簡易 sparkline 用 recharts）+ 對 benchmark 比較
- 在 Overview 加 `LinkedBlock`：Identity（owner persona）、Watchers（監看者清單）、Decision Journal（最近 3 筆相關決策）

完成判定：13 tab；Spec tab 可選 v1/v2 看 diff 並顯示 lock 狀態；Performance tab 至少 3 個 chart。

---

## D. Capital Pool Detail（§8）— 補 8 個 Tab

`src/management/pages/CapitalPoolDetail.tsx`（現只有 overview/strategies/risk/rebalance/audit）

新增/強化：
1. `mandate` — 嵌入既有 `MandatePanel`（章程文字 + binding rules）
2. `riskBudget` — 嵌入既有 `RiskBudgetPanel`（編輯器 + history）
3. `bindings` — 嵌入 `BindingsMatrix`（strategy×persona binding cells）
4. `allocationLimits` — per-strategy / per-sector 上限編輯
5. `freeze` — `FreezeUnfreezePanel`：freeze 名單、freeze 原因、解凍按鈕（HighRiskConfirm）
6. `simulation` — embed 簡化版 `AllocationSimulationPanel`
7. `lineage` — pool ↔ rebalance ↔ strategy LineageGraph
8. `governance` — pending approvals 過濾為此 pool

完成判定：13 tab；MandatePanel/RiskBudgetPanel/BindingsMatrix 三個既有元件全部接上；Freeze 流程能跑到 HighRiskConfirm。

---

## E. Rebalance Detail（§9）— 11-step Workflow Stepper

`src/management/pages/RebalanceDetail.tsx`

- 新 `workflow` Tab：用 `WorkflowStepper` 顯示 11 步（draft → simulate → constraint check → risk review → committee → ops review → schedule → freeze metrics → apply → monitor → close-out），每步有 status / actor / ts
- `Approval` Tab：把現有 `LifecycleStepper` 換成 `WorkflowStepper`（與上同步）+ approval 列表 + per-stage approve/reject 按鈕（綁 transitions）
- 新 `freezeMetrics` Tab：`MetricFreezeManager` —  選定 metrics → freeze（HighRiskConfirm）
- Override tab 補 `OverrideManager`：可加 override（reason + amount）並送審

完成判定：11 step 顯示且 current 高亮；freeze 操作走完整 confirm；override 新增後出現在列表。

---

## F. Evolution Detail（§10）— Promotion / Mutation 深度

`src/management/pages/EvolutionDetail.tsx`

- `promotion` Tab：升級為 `PromotionPanel`：候選 vs parent A/B 表格、Δ Sharpe / Δ DD / Δ capacity、PermissionAware `Promote to Paper` / `Promote to Live`，走 HighRiskConfirm
- `mutation` Tab：`MutationRuleManager`（rule 列表 + enable/disable + 新增）
- `candidates` Tab：補 filter（state/fitness range）+ 批次 discard / promote
- 新 `freeze` Tab：freeze generation（不再產新代）

完成判定：可在 candidates 選一條 → promote → 出現在 promotion 紀錄；mutation rule 可 toggle。

---

## G. MCP Detail / Skill Detail（§11）

`McpDetail.tsx`：補 `Schema`（每個 tool 的 input/output JSON schema viewer）、`Secrets`（masked + rotate 按鈕）、`Audit`（filter target=mcp）三個 Tab，並把 Tools tab 加 envGrants / scope chips。

`SkillDetail.tsx`：把 `Sandbox` Tab 接到 `SkillSandboxStudio` 元件（input → mock trace → token cost），加 `Risk` Tab（risk score、historical incidents）。

完成判定：MCP 6 tab 齊（Server/Tools/Schema/Permissions/Secrets/Audit）；Skill sandbox 跑得出 mock trace。

---

## H. Artifact Detail / Deployment Detail（§13）

`ArtifactDetail.tsx`：
- `diff` Tab：用 `VersionDiffViewer`（vs previous version）
- `lineage` Tab：用 `LineageGraph` 顯示 experiment → artifact → deployment
- `rollback` Tab：列可回滾版本 + HighRiskConfirm

`DeploymentDetail.tsx`：
- `stages` Tab：`WorkflowStepper`（research → paper → canary → live），每階段 health / promote 按鈕
- `rollback` Tab：選版本 → confirm（destructive）

完成判定：Artifact 可在 diff tab 看左右版本、可選舊版觸發 rollback confirm；Deployment 4 個 stage 顯示 + promote 流程。

---

## Acceptance Gate（每個子任務結束都跑）

```text
bunx vitest run        →  全綠
bun scripts/check-i18n.ts  →  0 missing
manual smoke：每個新 Tab 點開 → 顯示資料 / 空狀態 / 動作按鈕能觸發 confirm
```

收尾時把 `.lovable/plan.md` 更新一段「Phase 13 完成狀態」，並在 `/platform/qa` Spec Part 8 對應條目打勾。

---

## 規模估計

| 子任務 | 新 Tab | 接入既有元件 | 新元件 | BFF seed |
|---|---|---|---|---|
| A Persona | 7 | 0 | 1 (LinkedBlock) | 4 (violations/evals/versions/workspace) |
| C Strategy | 2 | StrategyParamsEditor 改造 | VersionDiffViewer | 3 (strategyVersions/featureSets/perfSeries) |
| D Capital | 8 | Mandate/Risk/Bindings | FreezeUnfreezePanel | 2 (limits/freezes) |
| E Rebalance | 3 | LifecycleStepper→Workflow | WorkflowStepper, MetricFreezeManager, OverrideManager | 1 (workflowSteps) |
| F Evolution | 1 | — | PromotionPanel, MutationRuleManager | 1 (promotions) |
| G MCP/Skill | 5 | SkillSandboxStudio | — | 2 (schemas/secrets) |
| H Artifact/Deploy | 5 | LineageGraph, VersionDiff | — | 1 (deploymentStages) |

合計：約 31 新 Tab、5 個新通用元件、14 組新 mock seed。

---

## 建議執行順序

P0 共用前置 → A (Persona, 用戶最常停留) → C (Strategy, 業務最有感) → E (Rebalance, 治理動線) → D (Capital) → F (Evolution) → H (Artifact/Deployment) → G (MCP/Skill)。

每個子任務一個 commit point，跑完 acceptance gate 才推下一個。
