# Pack F — Planner Disposition  
**文件類型**：Planning Disposition / Implementation Direction  
**日期**：2026-05-06  
**對應 Audit**：`.lovable/audits/spec-gap-2026-05-06-F.md`  
**建議存放路徑**：`.lovable/feedback/2026-05-06-F/Pack_F_Disposition.md`  
**狀態**：Approved for Pack F planning and implementation  
**範圍**：Pack E 落地後發現的 list create no-op、forwardRef warning、v4 registry vs v5 loop view IA 邊界、smoke report 語意修正  

---

## 0. Executive Decision

Pack F 應啟動，且不應等待 Pack D 全部完成。

Audit F 的問題不是 Pack E closed-loop 概念本身錯誤，而是 Pack E 進入實際使用後暴露出兩類缺口：

1. **可見操作沒有行為**：list 頁右上角「建立」按鈕存在，但沒有 onClick，形成 no-op affordance。
2. **舊 entity registry 與新 v5 loop view 的入口邊界未定**：例如 `/management/personas` 應該是 Persona Registry，還是 Persona Trading Health Matrix，尚未明確分流。

Pack F 的定位不應是「補一個 onClick」而已，而應定義為：

```text
Pack F = Write Intent + IA Boundary + QA Semantics 修正包
```

核心原則：

```text
1. 所有 visible action 必須有明確行為，不允許 no-op。
2. Create 不是傳統 CRUD，而是 closed-loop write intent。
3. v0 mock create / update 寫入 overlay，不直接污染 seed。
4. v4 entity list 保留為 registry / asset management。
5. v5 loop pages 保留為 operational health / supervisor / loop control view。
6. Smoke report 必須明確區分 read-path clean、write-path clean、loop-action clean、console-warning clean。
```

---

## 1. Source Audit Summary

Audit F 共 4 條：

| ID | Severity | Scope | Disposition |
|---|---:|---|---|
| F01 | High | 9 個 list page 的 Create button no-op | 修。Pack F v0 write-intent layer。 |
| F02 | Medium | ObjectListPage / CapitalPoolsList forwardRef warning | 修。impl-only，與 F01 同包處理。 |
| F03 | Medium | v4 PersonasList vs v5 PersonaHealthMatrix 入口語意重疊 | 修。registry route 與 loop health view 分離。 |
| F04 | Low | Smoke report 標 regression-clean 但只測 read path | 修 QA 語意。新增 smoke taxonomy。 |

---

# 2. F01 — List 頁「建立」按鈕 no-op

## 2.1 Disposition

**接受修正。Severity 維持 High。歸屬 Pack F。**

F01 不應繼續歸到 Pack D 等待，因為 Pack D D05 是 async transition timeout / failureState 問題，而 F01 是 create / edit input shape 與 UI write intent 問題。兩者同屬 write contract 缺口，但 F01 可先用 v0 mock write intent 解決，不必等待完整後端 contract。

目前的問題是：前端已經顯示「建立」按鈕，但按下沒有任何反應。這會破壞管理者對系統的信任，應優先修正。

## 2.2 規劃決策

所有 list 頁右上角「建立」按鈕不得再是無行為按鈕。每個 list page 必須明確設定一種 `createBehavior`：

```ts
type CreateBehavior =
  | { kind: "drawer"; entity: CreatableEntity }
  | { kind: "redirect"; to: string; intent?: string }
  | { kind: "disabled"; reasonI18nKey: string };
```

render 規則：

```text
createBehavior undefined:
  顯示 disabled button + tooltip: "Create flow not configured"

createBehavior.kind = "drawer":
  開啟 EntityCreateDrawer

createBehavior.kind = "redirect":
  navigate(to, { state: { intent } })

createBehavior.kind = "disabled":
  disabled + tooltip reason
```

## 2.3 受影響 list page disposition

| Entity List | Create 行為 | 說明 |
|---|---|---|
| Strategies | drawer + optional Alpha Factory redirect | 建立 Strategy Candidate / Draft，不直接建立 live strategy。 |
| Personas | drawer | 建立 Persona Draft，預設 shadow / suspended，不可直接 live。 |
| Capital Pools | drawer | 建立 Capital Pool Draft。 |
| Ranking Formulas | redirect or drawer | 優先導向 Formula Studio；也可 quick-create draft formula。 |
| Rebalances | redirect | 建立 Optimization / Rebalance Run，不直接 apply。 |
| Deployments | drawer | 建立 Deployment Plan，必須選 strategy + artifact + target env。 |
| Evolution | drawer | 建立 Evolution Program，必須選 parent strategy / alpha。 |
| Research | drawer | 建立 Research Experiment / Hypothesis。 |
| Artifacts | drawer | Register Artifact，source experiment optional。 |

## 2.4 v0 write-intent type

Pack F 應新增 v0 write intent DTO。這不是最終後端 DTO，而是 mock / frontend write-intent contract。

```ts
export type CreatableEntity =
  | "strategy"
  | "persona"
  | "capitalPool"
  | "rankingFormula"
  | "rebalance"
  | "deployment"
  | "evolutionProgram"
  | "researchExperiment"
  | "artifact";

export type BaseCreateInput = {
  name: string;
  owner?: string;
  risk?: "low" | "medium" | "high" | "critical";
  memo?: string;
};

export type CreateIntentResult<T> = {
  ok: boolean;
  entityType: CreatableEntity;
  entityId?: string;
  created?: T;
  auditEventId: string;
  message?: string;
  validationErrors?: Record<string, string>;
};
```

---

## 2.5 Per-entity Create DTO

### 2.5.1 StrategyCreateInput

```ts
export type StrategyCreateInput = BaseCreateInput & {
  alpha: string;
  capitalPoolId: string;
  personaIds: string[];
  hypothesis?: string;
  initialLifecycleStatus?: "discovered" | "scaffolded";
};
```

Validation：

```text
name required, 3–120 chars
alpha required, slug format
capitalPoolId required
personaIds length >= 1
risk default = medium
initialLifecycleStatus default = discovered
```

行為：

```text
建立 Strategy Candidate，不可直接 live / deployed。
可從 Strategies list 建立，也可導向 Alpha Factory。
```

### 2.5.2 PersonaCreateInput

```ts
export type PersonaCreateInput = BaseCreateInput & {
  archetype: string;
  description?: string;
  initialMode?: "shadow" | "suspended";
};
```

Validation：

```text
name required, 3–120 chars
archetype required
initialMode default = shadow
risk default = low
routedStrategies = 0
successRate = 0
```

行為：

```text
建立 Persona Draft / Shadow Persona。
不可直接給 live routing 權限。
```

### 2.5.3 CapitalPoolCreateInput

```ts
export type CapitalPoolCreateInput = BaseCreateInput & {
  currency: "USD" | "USDT" | "TWD";
  allocated: number;
  riskBudget: number;
};
```

Validation：

```text
allocated > 0
riskBudget > 0 and <= 1
utilized default = 0
state default = draft
risk default = medium
```

### 2.5.4 RankingFormulaCreateInput

```ts
export type RankingFormulaCreateInput = BaseCreateInput & {
  expression: string;
  scope?: "strategy" | "persona" | "capitalPool" | "portfolio";
};
```

Validation：

```text
expression required
state default = draft
appliedTo default = 0
```

行為：

```text
quick-create draft formula；進階編輯導向 Formula Studio。
```

### 2.5.5 RebalanceCreateInput

```ts
export type RebalanceCreateInput = BaseCreateInput & {
  quarter: string;
  targetPoolId: string;
  proposedDelta?: number;
  notes?: string;
};
```

Validation：

```text
quarter required, format YYYY-Qn
targetPoolId required
state default = draft
risk default = high
```

行為：

```text
建立 Rebalance Draft 或 Optimization Run，不直接 apply。
```

### 2.5.6 DeploymentCreateInput

```ts
export type DeploymentCreateInput = BaseCreateInput & {
  strategyId: string;
  artifactId: string;
  target: "research" | "paper" | "live";
  version: string;
  previousVersion?: string;
};
```

Validation：

```text
strategyId required
artifactId required
target required
version required
live target requires later approval / HighRiskConfirm
state default = draft
risk default = high if target=live else medium
```

### 2.5.7 EvolutionProgramCreateInput

```ts
export type EvolutionProgramCreateInput = BaseCreateInput & {
  parentAlpha: string;
  population: number;
  fitnessFormulaId?: string;
};
```

Validation：

```text
parentAlpha required
population > 0
generation default = 0
progress default = 0
state default = draft
```

### 2.5.8 ResearchExperimentCreateInput

```ts
export type ResearchExperimentCreateInput = BaseCreateInput & {
  hypothesis: string;
  metric: string;
  strategyId?: string;
};
```

Validation：

```text
hypothesis required
metric required
status default = queued
state default = draft
risk default = low
```

### 2.5.9 ArtifactCreateInput

```ts
export type ArtifactCreateInput = BaseCreateInput & {
  kind: "model" | "dataset" | "report" | "container";
  version: string;
  sourceExperimentId?: string;
  sizeMb?: number;
  hash?: string;
};
```

Validation：

```text
kind required
version required
hash optional in mock, default = pending
state default = draft
```

---

## 2.6 Update / Edit DTO

Pack F 可以先規範 update DTO，但不要求本輪完成所有 edit UI。

```ts
export type EntityUpdateInput<TPatch> = {
  id: string;
  expectedVersion?: number;
  patch: Partial<TPatch>;
  memo?: string;
};
```

原則：

```text
Create flow 本輪必做。
Edit flow 可先只在 detail pages 規範，不要求所有 list inline edit。
所有 edit 必須保留 audit。
高風險欄位變更必須導向 approval / HighRiskConfirm。
```

---

## 2.7 Mock 寫入策略

**不得直接修改原始 seed 常數。**

採用 overlay：

```ts
export type MockWriteOverlay = {
  created: Record<CreatableEntity, unknown[]>;
  updated: Record<CreatableEntity, Record<string, unknown>>;
  deleted?: Record<CreatableEntity, string[]>;
  expiresAt: number;
};
```

建議檔案：

```text
src/lib/bff/writeOverlay.ts
```

或若 Pack F 要延續 v5：

```text
src/lib/v5/writeOverlay.ts
```

行為：

```text
1. create 寫入 overlay。
2. list loader 合併 seed + overlay。
3. detail loader 可讀 overlay-created item。
4. overlay TTL = 30 分鐘。
5. refresh 後可清空；不保證持久化。
6. 每次 create/update 寫 audit event。
7. 每次 create/update emit realtime data event。
```

---

## 2.8 ObjectListPage API 調整

```ts
interface ObjectListPageProps<T extends BaseObject> {
  title: string;
  loader: () => Promise<T[]>;
  basePath: string;
  extraColumns?: Column<T>[];
  liveKinds?: string[];
  createBehavior?: CreateBehavior;
}
```

Create button render 規則：

```text
createBehavior undefined:
  button disabled + tooltip "Create flow not configured"

createBehavior.kind = "drawer":
  open EntityCreateDrawer

createBehavior.kind = "redirect":
  navigate(to, state: { intent })

createBehavior.kind = "disabled":
  disabled + tooltip reason
```

---

## 2.9 F01 Acceptance Criteria

```text
1. 9 個 list page 的 Create button 不得 no-op。
2. 每個 Create button 至少有 drawer / redirect / disabled tooltip 三者之一。
3. strategies / personas / capital / research / artifacts 至少完成 v0 drawer create。
4. ranking / rebalance / deployment / evolution 可先 redirect 到對應 studio / loop flow，但不可無反應。
5. Create 成功後 list 立即看到新 item。
6. Create 成功後有 toast、audit event、realtime refresh event。
7. Create validation failure 顯示錯誤。
8. 高風險 create 不直接進 live / active / deployed。
```

---

# 3. F02 — forwardRef warning

## 3.1 Disposition

**接受修正。Severity Medium。歸屬 impl-only。**

F02 不需要規格決策，應與 F01 同一輪一起修掉。此問題屬 pre-Pack-E 既存問題，不是 Pack E regression。

## 3.2 規劃決策

F02 不阻塞 F01，但 Pack F 完成時不得再有 console warning。

修正方向：

```text
1. 定位 warning 來源：ObjectListPage / CapitalPoolsList / PageHeader / Button Slot / Tooltip / DataTable row wrapper。
2. 任何被 Radix Slot / TooltipTrigger / asChild / ref 傳遞的 function component 必須 forwardRef。
3. 若某 action wrapper 不需要 ref，避免作為 asChild child。
4. 不修改 business behavior。
```

## 3.3 F02 Acceptance Criteria

```text
1. 打開 /management/capital 不再出現 Function components cannot be given refs warning。
2. /management/strategies、/management/personas、/management/capital-pools 三頁 console clean。
3. 修正不影響 DataTable row click。
4. 修正不影響 PageHeader actions render。
```

---

# 4. F03 — v4 PersonasList vs v5 PersonaHealthMatrix 入口重疊

## 4.1 Disposition

**接受修正。Severity Medium。歸屬 Pack F IA convergence。**

F03 反映 v5 closed-loop OS 與 v4 entity registry 的邊界還沒完全定義。

規劃裁示：

```text
/management/personas 保留為 Persona Registry。
/management/loops/execution 顯示 Persona Trading Health / PersonaHealthMatrix。
兩者不互相取代。
```

`PersonaHealthMatrix` 是 Execution Loop 的 health / operational view，不應佔用 `/management/personas` 這種 entity registry route。

---

## 4.2 Route 語意定義

| Route | Canonical 語意 | 頁面 |
|---|---|---|
| `/management/personas` | Persona Registry / Persona 管理列表 | `PersonasList` |
| `/management/personas/:id` | Persona Detail / drill-down | `PersonaDetail` |
| `/management/loops/execution` | Execution Loop Overview | `ExecutionLoopPage` |
| `/management/loops/execution?focus=personas` | Persona Trading Health Matrix | `ExecutionLoopPage + PersonaHealthMatrix` |
| `/management/sentinel?subjectType=persona` | Persona 相關 Sentinel findings | `SentinelFindingsPage` |

---

## 4.3 Nav 命名調整

為避免人類混淆，nav label 不應兩邊都叫 Personas。

建議：

```text
Multi-Persona System
- Persona Registry       → /management/personas
- Persona Lab
- Memory Governance
- Consult Rules

Execution Loop
- Execution Overview     → /management/loops/execution
- Persona Trading Health → /management/loops/execution?focus=personas
- Live Strategy Monitor
- Jobs / Runtime
- Alerts / Incidents
```

---

## 4.4 Similar Boundary Rule

F03 不只適用 personas，也適用 strategies / deployments：

| Entity Registry | Loop View |
|---|---|
| `/management/strategies` = Strategy Registry | `/management/loops/execution?focus=strategies` = Live Strategy Monitor |
| `/management/deployments` = Deployment Registry | `/management/loops/execution?focus=deployments` = Deployment Monitor |
| `/management/evolution` = Evolution Program Registry | `/management/loops/optimization?stage=evolution` = Evolution stage |
| `/management/rebalance` = Rebalance Registry | `/management/loops/optimization?stage=rebalance` = Rebalance stage |

---

## 4.5 F03 Acceptance Criteria

```text
1. /management/personas 顯示 registry/list，不顯示 PersonaHealthMatrix。
2. PersonaHealthMatrix 只出現在 Execution Loop context。
3. Sidebar 不出現兩個完全同名 Personas。
4. 若同一 route 在兩個 nav group 重複，必須有 dedupeKey 或不同 label。
5. Strategy / Deployment 也採相同 registry-vs-loop 分離原則。
```

---

# 5. F04 — Smoke report 標註 regression-clean 但只測 read path

## 5.1 Disposition

**接受修正。Severity Low。歸屬 audit / QA process。**

F04 不需要 spec，也不應阻塞 Pack F implementation。但從此之後 smoke report 必須明確區分測試範圍。

## 5.2 規劃決策

禁止在只測 read path 時使用無限定語的 `regression-clean`。

改用以下標籤：

```text
read-path-clean
write-path-clean
loop-action-clean
console-warning-clean
full-regression-clean
```

## 5.3 Smoke Report 新規則

```text
read-path-clean:
  route 可進入
  data 可讀取
  table / cards / tabs render 正常

write-path-clean:
  create / edit / update / approve / reject / emergency action 至少有行為
  不允許 visible no-op button
  成功 / 失敗皆有 toast 或 UI feedback

loop-action-clean:
  v5 loop action / sentinel action / intervention action 可觸發 overlay/audit/realtime

console-warning-clean:
  無 React ref warning
  無 hydration / key / uncontrolled input warning

full-regression-clean:
  read-path + write-path + loop-action + console-warning 全部通過
```

## 5.4 新增 Smoke Checklist

Pack F 後，smoke 至少要覆蓋：

```text
1. /management/personas Create button
2. /management/capital Create button
3. /management/strategies Create button
4. /management/artifacts Create button
5. /management/ranking Create / Studio redirect
6. /management/rebalance Create / Optimization redirect
7. /management/deployments Create deployment plan
8. /management/loops/execution PersonaHealthMatrix route
9. /management/sentinel remediation action
10. /management/interventions approve/reject action
11. console warning check
```

---

# 6. Pack F Implementation Plan

## F0 — Disposition / Addendum

新增：

```text
.lovable/feedback/2026-05-06-F/Pack_F_Disposition.md
```

若需要 CSV 版，可另存：

```text
.lovable/feedback/2026-05-06-F/Pack_F_Disposition.csv
```

## F1 — Create Intent Infrastructure

新增：

```text
src/lib/bff/writeOverlay.ts
src/lib/writeIntents/types.ts
src/lib/writeIntents/createDefaults.ts
src/lib/writeIntents/validation.ts
src/management/components/write/EntityCreateDrawer.tsx
```

調整：

```text
src/management/pages/ObjectListPage.tsx
src/management/pages/Lists.tsx
```

## F2 — Per-Entity Create Behaviors

為 9 個 list page 補 create behavior。

優先順序：

```text
1. Personas
2. Strategies
3. Capital Pools
4. Research Experiments
5. Artifacts
6. Ranking Formulas
7. Rebalances
8. Deployments
9. Evolution Programs
```

## F3 — IA Boundary 修正

調整 nav label 與 route 語意：

```text
Persona Registry ≠ Persona Trading Health
Strategy Registry ≠ Live Strategy Monitor
Deployment Registry ≠ Deployment Monitor
```

## F4 — forwardRef / Console Clean

修 F02。

## F5 — Smoke Report 更新

更新 smoke report template，加入 read/write/loop-action/console-warning 分級。

---

# 7. Lovable Implementation Prompt

```md
Implement Pack F — Write Intent and IA Boundary Fixes.

Do not rewrite existing entity pages.
Do not remove existing v5 loop pages.
Do not implement final backend CRUD contract.

Scope:

1. Fix F01:
   - ObjectListPage Create button must never be no-op.
   - Add createBehavior prop.
   - Supported behaviors: drawer / redirect / disabled-with-tooltip.
   - Configure all 9 affected list pages:
     strategies, personas, capital-pools, ranking-formulas, rebalances, deployments, evolution, research, artifacts.
   - Implement v0 mock create DTOs and validation.
   - Create writes to overlay, not seed constants.
   - Merge overlay into list loaders.
   - Emit audit + realtime event.
   - Show toast success/error.

2. Fix F02:
   - Remove Function components cannot be given refs warning.
   - Confirm /management/capital and related list pages are console-clean.

3. Fix F03:
   - /management/personas remains Persona Registry.
   - PersonaHealthMatrix only appears under /management/loops/execution.
   - Rename nav labels to avoid duplicate "Personas" ambiguity.
   - Apply same registry-vs-loop boundary to strategies and deployments.

4. Fix F04:
   - Update smoke report language.
   - "regression-clean" must not be used unless read + write + loop actions + console warnings are covered.
   - Add write-path smoke checklist.

Acceptance:
- No visible Create button is no-op.
- At least Personas, Strategies, Capital Pools, Research, and Artifacts support v0 create drawer.
- Ranking/Rebalance/Deployment/Evolution may redirect to appropriate studio/loop create intent if full drawer is not ready.
- Created mock item appears in list for current session.
- Audit event is written.
- Realtime refresh event is emitted.
- /management/personas and /management/loops/execution have distinct meanings.
- No forwardRef warning on CapitalPoolsList.
```

---

# 8. CSV-style Disposition

```csv
id,answer,addendum_to,notes
F01,Implement Pack F v0 write-intent layer; Create buttons must use drawer/redirect/disabled-tooltip and never no-op,.lovable/audits/spec-gap-2026-05-06-F.md,"Create DTOs defined for 9 entities; write to overlay not seed; audit+realtime required"
F02,Fix immediately as impl-only bug; bundle with F01,.lovable/audits/spec-gap-2026-05-06-F.md,"No spec needed; acceptance = no forwardRef warning on capital/personas/strategies list pages"
F03,Keep /management/personas as Persona Registry; keep PersonaHealthMatrix inside /management/loops/execution,.lovable/audits/spec-gap-2026-05-06-F.md,"Registry route and loop health view must be semantically separate; update nav labels/dedupe"
F04,Update smoke report taxonomy; do not claim full regression-clean for read-only smoke,.lovable/audits/spec-gap-2026-05-06-F.md,"Use read-path-clean/write-path-clean/loop-action-clean/console-warning-clean/full-regression-clean"
```

---

# 9. Final Decision

Pack F 可以啟動，且應作為 **Write Intent + IA Boundary + QA Semantics** 修正包。

最重要的產品原則：

```text
Visible action must be actionable.
Entity registry must not be confused with loop operations.
Mock write must be auditable and reversible.
Smoke reports must state what was actually tested.
```

這樣修完後，Pack E 的閉環管理概念才能與既有管理頁真正共融，而不會讓使用者覺得「按鈕很多，但系統沒有真的可操作」。
