# Pantheon Frontend Build Spec — Part 7
# Component System + State Machines（共用元件系統與狀態機規格）

文件版本：v1.0  
語系：zh-TW  
適用對象：Lovable 前端建置、Pantheon 前端工程、BFF 設計對齊  
關聯文件：Part 1–6

---

## 0. 文件目的

Part 7 定義 Pantheon 前端的共用元件系統與狀態機。Lovable 在建置 `Pantheon Management Console` 與 `Pantheon Agora Workbench` 時，應以本文件作為 UI 元件、狀態標籤、工作流、按鈕權限、風險確認、即時事件顯示的基礎規格。

本文件不是視覺風格指南，而是可落地的 frontend component and workflow specification。

Pantheon 前端必須做到：

```text
1. 兩套前端共用同一套 platform shell 與 design primitives。
2. Management Console 使用 object-first / state-first / action-first UI。
3. Agora Workbench 使用 analyst/trader workflow-first UI。
4. 所有高風險操作都由狀態機與 availableActions 控制。
5. 所有長任務都顯示為 Job。
6. 所有狀態、按鈕、表頭、提示、modal 都支援 zh-TW / en-US。
7. 前端不自行推理業務規則；BFF 回傳 state、riskLevel、permissions、availableActions。
```

---

## 1. 元件設計原則

### 1.1 共用原則

所有元件必須遵守：

```text
- i18n-first：使用 translation key，不硬編中文或英文。
- permission-aware：依據 availableActions / permissions 顯示、禁用或隱藏操作。
- risk-aware：高風險操作必須有風險標籤與確認流程。
- state-driven：狀態顯示由 stable enum 轉成 localized label。
- event-aware：能接收 BFF realtime events 進行局部更新。
- accessible：button、modal、drawer、table、form 必須有可讀 label。
- desktop-first：Pantheon 是管理與交易研究系統，主要支援桌面工作流。
```

### 1.2 Management Console 元件風格

Management Console 應偏向：

```text
- 高資訊密度
- 清楚狀態與風險
- 表格 + tabs + detail drawer
- workflow stepper
- approval panel
- audit timeline
- alert / incident / job 可視化
```

### 1.3 Agora Workbench 元件風格

Agora Workbench 應偏向：

```text
- 日常工作台
- 筆記與上下文卡片
- signal explanation
- AI persona 協作
- conversation canvas
- decision journal
- 低摩擦 feedback / insight capture
```

---

## 2. 元件系統總覽

Lovable 應建立以下元件層級。

```text
Component System
├── Platform Shell Components
├── Navigation Components
├── Entity Components
├── Status / Risk Components
├── Data Display Components
├── Action / Permission Components
├── Workflow Components
├── Approval / Governance Components
├── Operations Components
├── Capability Management Components
├── Lineage / Audit Components
├── Agora Collaboration Components
├── Forms / Editors
└── Utility Components
```

---

## 3. Platform Shell Components

### 3.1 `PantheonAppShell`

用途：所有頁面的最外層 layout。

使用頁面：Management Console、Agora Workbench 全域。

結構：

```text
PantheonAppShell
├── GlobalTopBar
├── ProductSideNav
├── MainContentArea
└── RightDrawerHost
```

Props 建議：

```ts
type PantheonAppShellProps = {
  product: 'management' | 'agora';
  locale: 'zh-TW' | 'en-US';
  user: UserSummary;
  navigationItems: NavItem[];
  children: React.ReactNode;
};
```

需求：

```text
- 支援 /management 與 /agora route group。
- 可顯示 sidebar collapsed / expanded。
- 可開啟右側 drawer。
- GlobalTopBar 必須固定。
- 支援 locale 切換。
```

---

### 3.2 `GlobalTopBar`

用途：顯示全域狀態、切換產品、搜尋、通知。

顯示項：

```text
Pantheon Logo
ProductSwitcher
EnvironmentIndicator
GlobalSearch
BFFStatusIndicator
RealtimeEventIndicator
PendingApprovalsBadge
OpenAlertsBadge
RunningJobsBadge
LanguageSwitcher
UserMenu
```

高層驗收：

```text
- 所有頁面都顯示 GlobalTopBar。
- product switcher 可以切換 Management / Agora。
- 語言切換後文字立即更新。
- BFF offline 時顯示 degraded/offline 狀態。
```

---

### 3.3 `ProductSwitcher`

選項：

```text
Management Console
Agora Workbench
```

i18n keys：

```text
i18n.product.management
i18n.product.agora
```

互動：

```text
- 從 /management/* 切換到 /agora/daily。
- 從 /agora/* 切換到 /management/command-center。
```

---

### 3.4 `LanguageSwitcher`

支援語系：

```text
zh-TW
en-US
```

需求：

```text
- 顯示於 GlobalTopBar。
- 切換後寫入 localStorage key: pantheon.locale。
- 若 BFF user profile 有 locale，優先使用 user profile。
- 所有 navigation、button、status、modal、empty state、error state 必須更新。
```

---

### 3.5 `BFFStatusIndicator`

狀態：

```text
connected
degraded
offline
```

顯示：

```text
Connected / 已連線
Degraded / 連線異常
Offline / 離線
```

操作：

```text
- 點擊打開 BFF health drawer。
- 顯示最近 API error、event stream status、last heartbeat。
```

---

## 4. Navigation Components

### 4.1 `ProductSideNav`

用途：依 product 顯示不同 sidebar。

Management Console nav groups：

```text
Command
Core Management
Research & Governance
Operations
Capabilities
System
```

Agora Workbench nav groups：

```text
Daily Work
Research
AI Collaboration
Training
Channels
```

Props：

```ts
type NavItem = {
  id: string;
  labelKey: string;
  icon?: string;
  route: string;
  badgeCount?: number;
  requiredPermissions?: string[];
};
```

需求：

```text
- 沒有權限的 nav item 可隱藏。
- 有待處理數量的 nav item 顯示 badge。
- 目前 route 高亮。
```

---

### 4.2 `BreadcrumbTrail`

用途：Entity detail 頁顯示上下文。

範例：

```text
Management / Strategies / alpha_042
Agora / Signals / signal_9821
```

---

## 5. Entity Components

### 5.1 `EntityHeader`

用途：所有 detail page 的標準 header。

適用 entity：

```text
Strategy
Persona
CapitalPool
Rebalance
EvolutionProgram
Experiment
ReviewRequest
Deployment
Incident
Tool
MCPServer
Skill
Artifact
AgoraSession
Signal
```

顯示：

```text
Entity name
Entity ID
Entity type
StatusBadge
RiskBadge
Owner
UpdatedAt
Linked entities summary
Primary action
Secondary action menu
```

Props：

```ts
type EntityHeaderProps = {
  entity: EntitySummary;
  status: string;
  riskLevel?: RiskLevel;
  owner?: UserSummary | PersonaSummary;
  availableActions: AvailableAction[];
  onAction: (actionId: string) => void;
};
```

需求：

```text
- Primary action 由 availableActions 中 priority 最高且 enabled 的 action 決定。
- 高風險 action 顯示 RiskBadge。
- disabled action 顯示 disabledReason。
```

---

### 5.2 `EntitySummaryCard`

用途：列表、overview、related entities 區塊。

顯示：

```text
Name
ID
Status
Risk
Owner
Key metrics
Open alerts / jobs
Quick actions
```

---

### 5.3 `LinkedEntitiesPanel`

用途：顯示該物件關聯。

例如 Strategy 關聯：

```text
Owner Persona
Capital Pool
Experiments
Artifacts
Reviews
Deployments
Incidents
Agora Notes
```

---

## 6. Status / Risk Components

### 6.1 `StatusBadge`

用途：顯示 entity 狀態。

輸入：

```ts
type StatusBadgeProps = {
  domain: 'strategy' | 'persona' | 'experiment' | 'review' | 'deployment' | 'incident' | 'job' | 'skill' | 'mcp' | 'rebalance' | 'evolution' | 'memory' | 'agoraSession';
  status: string;
};
```

需求：

```text
- status enum 不直接顯示。
- 依 locale 使用 translation key。
- 使用一致顏色映射。
```

---

### 6.2 `RiskBadge`

風險等級：

```text
none
low
medium
high
critical
blocked
```

顯示：

```text
zh-TW: 無 / 低 / 中 / 高 / 重大 / 已阻擋
en-US: None / Low / Medium / High / Critical / Blocked
```

---

### 6.3 `LifecycleStepper`

用途：顯示 Strategy lifecycle。

狀態：

```text
discovered
scaffolded
replicated
approved
paper
live
retired
```

需求：

```text
- current step 高亮。
- passed steps 顯示 completed。
- blocked step 顯示 blocker icon。
- 點擊 step 可顯示該 state 的條件與歷史。
```

---

### 6.4 `HealthIndicator`

用途：runtime、BFF、MCP server、tool、job workers 等健康狀態。

狀態：

```text
healthy
degraded
offline
unknown
paused
```

---

## 7. Data Display Components

### 7.1 `PantheonDataTable`

用途：所有列表頁通用 table。

需求：

```text
- sorting
- filtering
- pagination
- row selection
- bulk actions
- column visibility
- saved views optional
- empty state
- loading skeleton
- error state
```

Props：

```ts
type PantheonDataTableProps<T> = {
  data: T[];
  columns: TableColumn<T>[];
  filters?: FilterConfig[];
  rowActions?: AvailableAction[] | ((row: T) => AvailableAction[]);
  bulkActions?: AvailableAction[];
  isLoading?: boolean;
  error?: ApiError | null;
  emptyState?: EmptyStateConfig;
};
```

---

### 7.2 `MetricCard`

用途：顯示關鍵指標。

範例：

```text
Sharpe
Max Drawdown
Risk Budget Usage
Open Incidents
Running Jobs
Capital Allocation
Ranking Score
```

Props：

```ts
type MetricCardProps = {
  labelKey: string;
  value: string | number;
  trend?: 'up' | 'down' | 'flat';
  status?: 'good' | 'warning' | 'bad' | 'neutral';
  descriptionKey?: string;
};
```

---

### 7.3 `FilterBar`

用途：列表頁的標準 filter。

支援：

```text
status
riskLevel
owner
persona
capitalPool
date range
tag
state
```

---

### 7.4 `TabbedDetailLayout`

用途：detail page 標準 layout。

結構：

```text
EntityHeader
SummaryStrip
Tabs
RightDrawer optional
```

---

## 8. Action / Permission Components

### 8.1 `PermissionAwareButton`

用途：依 BFF `availableActions` 顯示可執行、不可執行、需審批、隱藏。

AvailableAction 格式：

```ts
type AvailableAction = {
  id: string;
  labelKey: string;
  enabled: boolean;
  hidden?: boolean;
  disabledReasonKey?: string;
  riskLevel?: RiskLevel;
  requiresApproval?: boolean;
  requiresConfirmation?: boolean;
  confirmationType?: 'standard' | 'highRisk' | 'destructive';
  priority?: 'primary' | 'secondary' | 'danger';
};
```

行為：

```text
- hidden = true 時不顯示。
- enabled = false 時 disabled，hover/click 顯示 disabled reason。
- requiresConfirmation = true 時打開 ConfirmationModal。
- requiresApproval = true 時顯示 approval badge。
```

---

### 8.2 `ActionMenu`

用途：secondary actions。

需求：

```text
- 將 dangerous action 分隔顯示。
- 高風險 action 顯示 RiskBadge。
- disabled action 不應完全消失，除非 hidden=true。
```

---

### 8.3 `HighRiskConfirmationModal`

用途：所有高風險操作確認。

必備欄位：

```text
Operation name
Target object
Current state
New state / expected result
Affected strategy
Affected persona
Affected capital pool
Affected runtime
Risk impact
Rollback target if any
Required approval if any
Audit memo input
Confirm button
Cancel button
```

需求：

```text
- zh-TW / en-US 完整翻譯。
- 確認前 audit memo 必填。
- critical operation 可要求輸入 confirm phrase。
```

---

## 9. Workflow Components

### 9.1 `WorkflowStepper`

用途：顯示季度調倉、審批、deployment、skill approval、MCP approval 等流程。

Props：

```ts
type WorkflowStep = {
  id: string;
  labelKey: string;
  status: 'not_started' | 'active' | 'completed' | 'blocked' | 'failed' | 'skipped';
  requiredRole?: string;
  blockerReasonKey?: string;
};
```

---

### 9.2 `StateTransitionPanel`

用途：detail page 顯示可用 transition。

顯示：

```text
Current state
Allowed next states
Blocked transitions
Required evidence
Required approval
```

---

### 9.3 `BlockerList`

用途：顯示為什麼不能進下一步。

例：

```text
- OOS experiment missing
- Risk check failed
- Committee memo missing
- Capital pool not assigned
```

---

## 10. Governance Components

### 10.1 `ApprovalPanel`

用途：Review / Promotion / Rebalance / Skill / MCP approval detail。

顯示：

```text
Request summary
Target object
Before / after
Evidence
Validator results
Required approvers
Decision history
Decision memo
Approve / Reject / Request Changes
```

---

### 10.2 `ValidatorResultList`

Validator 狀態：

```text
passed
warning
failed
not_run
```

支援：

```text
Schema Validator
Scope Validator
Risk Check
Data Leakage Check
Reproducibility Check
Capital Compatibility Check
Tool Permission Check
```

---

### 10.3 `DecisionMemoEditor`

用途：所有審批決策與高風險操作 audit memo。

需求：

```text
- required for approve/reject/high-risk command。
- 支援 markdown。
- 顯示 linked evidence。
```

---

## 11. Operations Components

### 11.1 `JobDrawer`

用途：顯示長任務進度。

顯示：

```text
Job ID
Type
Target
Triggered by
Status
Progress
Current step
Logs
Output artifacts
Actions: cancel / retry / clone / open target
```

Job 狀態：

```text
queued
running
waiting_for_approval
completed
failed
cancelled
retrying
```

---

### 11.2 `AlertCard`

顯示：

```text
Severity
Alert type
Linked object
Summary
Created time
Status
Suggested actions
```

Alert 狀態：

```text
new
acknowledged
assigned
investigating
mitigated
resolved
closed
```

---

### 11.3 `IncidentTimeline`

用途：Incident detail。

顯示：

```text
Created
Assigned
Investigation notes
Mitigation actions
Rollback events
Postmortem updates
Closed
```

---

### 11.4 `RuntimeHealthCard`

顯示：

```text
Runtime ID
Status
Heartbeat
Running strategies
CPU / memory
Broker status
Order latency
Open incidents
```

---

### 11.5 `EventStreamPanel`

用途：即時事件流。

支援事件：

```text
job.started
job.progress
job.completed
strategy.state_changed
risk.alert_created
incident.updated
deployment.started
mcp.call_failed
skill.sandbox_completed
rebalance.applied
```

---

## 12. Capability Management Components

### 12.1 `PermissionMatrix`

用途：Persona × Tool / MCP / Skill permission matrix。

欄位：

```text
Capability
Persona A
Persona B
Persona C
Approval Mode
Scope
Rate Limit
```

狀態：

```text
allowed
requires_approval
blocked
sandbox_only
```

---

### 12.2 `PolicyMatrix`

用途：Route Policy 管理。

維度：

```text
Capability
Allowed strategy state
Allowed environment
Requires approval
Rate limit
Parameter constraints
```

---

### 12.3 `SchemaViewer`

用途：Tool / MCP / Skill input/output schema。

需求：

```text
- 顯示 JSON schema。
- 可切換 raw / friendly view。
- 可顯示 required fields。
```

---

### 12.4 `SkillSandboxPanel`

用途：Skill draft sandbox 測試。

顯示：

```text
Skill draft
Input test payload
Sandbox result
Security scan
Risk classification
Submit approval
```

---

## 13. Formula / Rebalance Components

### 13.1 `FormulaBuilder`

用途：績效排名公式與 fitness formula 編輯。

功能：

```text
Metric selection
Weight editing
Penalty editing
Normalization method
Caps / floors
Outlier handling
Formula preview
Test calculation
```

需求：

```text
- 支援 no-code builder。
- 支援 read-only formula expression preview。
- 修改後公式狀態為 draft。
```

---

### 13.2 `ScoreBreakdownPanel`

用途：解釋 ranking score / fitness score。

顯示：

```text
Metric
Raw value
Normalized value
Weight
Contribution
Penalty
Final score
```

---

### 13.3 `AllocationSimulationPanel`

用途：季度調倉模擬。

顯示：

```text
Current allocation
Recommended allocation
Delta
Risk impact
Constraint violations
Manual overrides
```

---

## 14. Lineage / Audit Components

### 14.1 `LineageGraph`

用途：顯示 Strategy / Artifact / Experiment / Review / Deployment lineage。

節點類型：

```text
Insight
Strategy
Spec
Experiment
Artifact
Review
Promotion
Deployment
Runtime
Telemetry
Incident
Postmortem
```

需求：

```text
- 節點可點擊打開 Inspector。
- 支援 filter by persona / strategy / time / status。
```

---

### 14.2 `AuditTimeline`

用途：所有 entity detail 的 audit。

顯示：

```text
Timestamp
Actor
Action
Before / after optional
Risk level
Decision memo
Linked approval
```

---

## 15. Agora Collaboration Components

### 15.1 `ConversationCanvas`

用途：Ask Personas、Committee Room、Session detail。

功能：

```text
Message list
Persona avatar
Thread / reply
Annotation bar
Save as note
Create insight
Create training example
Start committee
```

---

### 15.2 `MessageAnnotationBar`

每則訊息可操作：

```text
Useful
Not useful
Incorrect
Save as note
Remember
Do not remember
Create insight
Create training example
Attach to strategy
```

這些動作會自然捕捉有用資料。

---

### 15.3 `SignalReviewPanel`

用途：Strategy Signal Review。

顯示：

```text
Signal summary
Strategy context
Market context
Feature explanation
Similar historical cases
Persona opinions
Agree / Disagree / Flag
Trader rationale
```

---

### 15.4 `ResearchNotebookEditor`

功能：

```text
Markdown editing
Attach signal
Attach strategy
Attach chart
Ask persona to expand
Ask persona to critique
Convert to insight
Convert to research task
Convert to strategy idea
```

---

### 15.5 `DecisionJournalEditor`

欄位：

```text
Market context
Linked signal
Linked strategy
Decision
Rationale
Confidence
Expected outcome
Follow-up date
Actual outcome
Persona consulted
```

---

### 15.6 `CommitteeRoomPanel`

功能：

```text
Select target
Select personas
Load evidence pack
Structured rounds
Capture disagreement
Generate committee memo
Submit to governance
```

---

## 16. Forms / Editors

### 16.1 `StructuredForm`

需求：

```text
- 支援 localized labels。
- 支援 validation messages。
- 支援 dirty state。
- 支援 submit / cancel。
```

### 16.2 `MarkdownEditor`

用於：

```text
Research notes
Decision memo
Postmortem
Committee memo
Strategy thesis
```

### 16.3 `JsonSchemaForm`

用於：

```text
Tool schema
MCP schema
Experiment config
Skill test payload
```

---

# 17. State Machines

以下狀態機是 Lovable 建置 UI 的基礎。前端不應自行判斷 transition 是否允許；BFF 應回傳 `availableActions`，但 UI 必須能依狀態顯示正確 stepper、badge、workflow。

---

## 17.1 Strategy Lifecycle State Machine

狀態：

```text
discovered
scaffolded
replicated
approved
paper
live
degraded
replaced
retired
archived
```

主要 transition：

| From | To | Action | Requires Approval | UI Pattern |
|---|---|---|---|---|
| discovered | scaffolded | scaffold_spec | No | standard action |
| scaffolded | replicated | run_replication | No | create job |
| replicated | approved | submit_review / approve | Yes | review workflow |
| approved | paper | promote_paper | Yes | confirmation + job |
| paper | live | promote_live | Yes | high-risk modal |
| live | degraded | mark_degraded | Yes | risk workflow |
| live | replaced | replace_strategy | Yes | high-risk modal |
| live | retired | retire_live | Yes | high-risk modal |
| live | paper | rollback_to_paper | Yes | rollback modal |
| any | archived | archive | Yes | destructive modal |

UI 顯示：

```text
- LifecycleStepper 顯示 discovered → scaffolded → replicated → approved → paper → live → retired。
- degraded / replaced 是 live 旁支狀態，應以 warning banner 顯示。
```

---

## 17.2 Persona Lifecycle State Machine

狀態：

```text
draft
sandbox
active
probation
restricted
suspended
retired
archived
```

transition：

| From | To | Action | Requires Approval |
|---|---|---|---|
| draft | sandbox | create_sandbox | No |
| sandbox | active | activate_persona | Yes |
| active | probation | put_on_probation | Yes |
| active | restricted | restrict_persona | Yes |
| active | suspended | suspend_persona | Yes |
| probation | active | restore_active | Yes |
| restricted | active | remove_restriction | Yes |
| active | retired | retire_persona | Yes |
| retired | archived | archive_persona | Yes |

UI 注意：

```text
- restricted 狀態要在 Tools/MCP/Skills tabs 顯示限制 banner。
- probation 狀態要在 Capital Binding tab 顯示 capital cap warning。
```

---

## 17.3 Capital Pool Lifecycle

狀態：

```text
draft
active
frozen
rebalancing
restricted
retired
```

transition：

| From | To | Action | Requires Approval |
|---|---|---|---|
| draft | active | activate_pool | Yes |
| active | frozen | freeze_pool | Yes |
| frozen | active | unfreeze_pool | Yes |
| active | rebalancing | start_rebalance | Yes |
| rebalancing | active | apply_rebalance | Yes |
| active | restricted | restrict_pool | Yes |
| active | retired | retire_pool | Yes |

---

## 17.4 Ranking Formula Lifecycle

狀態：

```text
draft
testing
approved
active
deprecated
retired
```

transition：

| From | To | Action |
|---|---|---|
| draft | testing | test_formula |
| testing | approved | submit_formula_review / approve |
| approved | active | activate_formula |
| active | deprecated | deprecate_formula |
| deprecated | retired | retire_formula |

UI 注意：

```text
- active formula 不可直接編輯，只能 clone new draft。
- FormulaBuilder 在 active 狀態為 read-only。
```

---

## 17.5 Quarterly Rebalance Workflow

狀態：

```text
draft
metrics_freezing
metrics_frozen
ranking_calculated
simulation_ready
under_review
approved
scheduled
applied
rolled_back
cancelled
```

流程：

```text
draft
→ metrics_freezing
→ metrics_frozen
→ ranking_calculated
→ simulation_ready
→ under_review
→ approved
→ scheduled
→ applied
```

可逆 / 例外：

```text
applied → rolled_back
any pre-applied state → cancelled
metrics_frozen → metrics_freezing if unfreeze requested
```

UI 元件：

```text
WorkflowStepper
MetricFreezePanel
RankingResultViewer
AllocationSimulationPanel
OverrideManager
ApprovalPanel
```

---

## 17.6 Evolution Program State Machine

狀態：

```text
draft
active
paused
under_review
completed
retired
```

transition：

| From | To | Action |
|---|---|---|
| draft | under_review | submit_evolution_review |
| under_review | active | approve_program |
| active | paused | pause_program |
| paused | active | resume_program |
| active | completed | complete_program |
| completed | retired | retire_program |

Evolution Run 狀態：

```text
queued
running
paused
completed
failed
cancelled
```

---

## 17.7 Experiment Workflow

狀態：

```text
draft
queued
running
completed
failed
invalidated
attached_to_review
archived
```

transition：

| From | To | Action |
|---|---|---|
| draft | queued | run_experiment |
| queued | running | job_started |
| running | completed | job_completed |
| running | failed | job_failed |
| completed | attached_to_review | attach_to_review |
| completed | invalidated | invalidate_result |
| failed | queued | retry |
| completed | archived | archive |

---

## 17.8 Review / Approval Workflow

狀態：

```text
draft
submitted
validator_running
in_review
changes_requested
approved
rejected
cancelled
```

transition：

```text
draft → submitted
submitted → validator_running
validator_running → in_review
in_review → approved
in_review → rejected
in_review → changes_requested
changes_requested → submitted
submitted / in_review → cancelled
```

UI 元件：

```text
ApprovalPanel
ValidatorResultList
DecisionMemoEditor
EvidencePackViewer
```

---

## 17.9 Deployment Workflow

狀態：

```text
draft
submitted
under_review
approved
scheduled
deploying
deployed
failed
rolled_back
cancelled
```

transition：

```text
draft → submitted → under_review → approved → scheduled → deploying → deployed
failed → rolled_back
 deployed → rolled_back
pre-deploy states → cancelled
```

UI 注意：

```text
- promote_live、rollback、emergency_kill 都必須 high-risk modal。
- deployed 狀態 detail 應顯示 runtime、artifact、capital pool、rollback target。
```

---

## 17.10 Risk Alert Workflow

狀態：

```text
new
acknowledged
assigned
investigating
mitigated
resolved
closed
```

transition：

```text
new → acknowledged
acknowledged → assigned
assigned → investigating
investigating → mitigated
mitigated → resolved
resolved → closed
```

可從任意未關閉狀態：

```text
→ create_incident
```

---

## 17.11 Incident Workflow

狀態：

```text
open
assigned
investigating
mitigation_in_progress
mitigated
postmortem_required
closed
```

transition：

```text
open → assigned → investigating → mitigation_in_progress → mitigated → postmortem_required → closed
```

UI 必備：

```text
IncidentTimeline
LinkedObjectsPanel
MitigationActions
PostmortemEditor
AuditTimeline
```

---

## 17.12 Tool Lifecycle

狀態：

```text
draft
testing
active
restricted
deprecated
blocked
retired
```

transition：

```text
draft → testing → active
active → restricted
active → deprecated → retired
active → blocked
restricted → active
```

---

## 17.13 MCP Server Lifecycle

狀態：

```text
draft
connected
healthy
degraded
disabled
retired
```

transition：

```text
draft → connected → healthy
healthy → degraded
healthy / degraded → disabled
disabled → healthy
any → retired
```

MCP Tool permission 狀態：

```text
not_granted
granted
requires_approval
sandbox_only
blocked
```

---

## 17.14 Skill Lifecycle

狀態：

```text
draft
sandboxed
validated
approved
active
deprecated
blocked
retired
```

transition：

```text
draft → sandboxed → validated → approved → active
active → deprecated → retired
active → blocked
blocked → sandboxed if reopened
```

UI 元件：

```text
SkillSandboxPanel
SchemaViewer
PermissionMatrix
ApprovalPanel
```

---

## 17.15 Memory Review Workflow

狀態：

```text
proposed
approved
rejected
edited
merged
deprecated
deleted
sensitive
```

transition：

```text
proposed → approved
proposed → rejected
approved → edited
approved → merged
approved → sensitive
approved → deprecated
any → deleted with permission
```

---

## 17.16 Insight Workflow

狀態：

```text
raw
triaged
classified
linked
converted_to_strategy
converted_to_research_task
converted_to_training_example
dismissed
archived
```

transition：

```text
raw → triaged → classified
classified → linked
classified → converted_to_strategy
classified → converted_to_research_task
classified → converted_to_training_example
any → dismissed
any → archived
```

---

## 17.17 Agora Session Workflow

狀態：

```text
open
active
waiting_for_user
summary_generated
submitted_to_management
closed
archived
```

transition：

```text
open → active
active → waiting_for_user
waiting_for_user → active
active → summary_generated
summary_generated → submitted_to_management
active / summary_generated → closed
closed → archived
```

---

## 17.18 Job Workflow

狀態：

```text
queued
running
waiting_for_approval
completed
failed
cancelled
retrying
```

transition：

```text
queued → running
running → completed
running → failed
running → waiting_for_approval
waiting_for_approval → running
failed → retrying → running
queued / running → cancelled
```

UI：

```text
JobDrawer
JobProgressBar
JobLogViewer
```

---

# 18. Localization Requirements for Components

所有元件必須：

```text
- 接收 labelKey，而不是固定文字。
- enum 狀態轉譯由 i18n dictionary 控制。
- 高風險 modal、empty state、error state 必須有 zh-TW / en-US。
- 使用者產生內容不強制翻譯，但可以提供 Translate / Summarize action。
```

範例 keys：

```text
status.strategy.discovered
status.strategy.scaffolded
status.strategy.replicated
status.strategy.approved
status.strategy.paper
status.strategy.live
status.strategy.retired

action.submitReview
action.promotePaper
action.promoteLive
action.rollback
action.retire

risk.low
risk.medium
risk.high
risk.critical
```

---

# 19. Lovable Build Instructions for Part 7

Lovable 應依本文件建立：

```text
1. Shared component library。
2. Management / Agora 共用 AppShell。
3. StatusBadge / RiskBadge / LifecycleStepper。
4. PermissionAwareButton / ActionMenu / HighRiskConfirmationModal。
5. PantheonDataTable / MetricCard / FilterBar。
6. JobDrawer / AlertCard / IncidentTimeline / EventStreamPanel。
7. FormulaBuilder / AllocationSimulationPanel。
8. PermissionMatrix / PolicyMatrix / SchemaViewer / SkillSandboxPanel。
9. LineageGraph / AuditTimeline。
10. ConversationCanvas / SignalReviewPanel / Notebook / DecisionJournal / CommitteeRoom。
11. State machine constants and localized labels。
```

前端可先以 mock state machines 與 mock BFF availableActions 運作。

---

# 20. Acceptance Criteria

Part 7 完成後，Lovable 的前端應滿足：

```text
1. 兩套前端共用同一套 AppShell。
2. 所有 navigation、button、status、risk label 都可切換 zh-TW / en-US。
3. Management entity detail page 可使用 EntityHeader、StatusBadge、RiskBadge、ActionMenu。
4. Strategy lifecycle 可用 LifecycleStepper 顯示。
5. High-risk actions 必須打開 confirmation modal。
6. Disabled actions 顯示 disabled reason。
7. JobDrawer 可顯示 mock job progress。
8. Alert / Incident 元件可顯示狀態與反應操作。
9. FormulaBuilder 可呈現 formula draft UI。
10. PermissionMatrix 可呈現 persona × tool/MCP/skill 權限。
11. ConversationCanvas 可支援 message annotation。
12. State machine enum 與 UI badge 對應一致。
13. 前端不硬編任何業務 transition；實際可用操作以 BFF availableActions 為準。
```

---

# 21. 下一份文件

下一份文件是：

```text
Part 8 — Lovable Build Prompts + Mock Data + QA Checklist
```

Part 8 將直接提供：

```text
- 可貼給 Lovable 的 build prompts
- Management Console mock data
- Agora Workbench mock data
- demo scenarios
- QA checklist
- acceptance test cases
```
