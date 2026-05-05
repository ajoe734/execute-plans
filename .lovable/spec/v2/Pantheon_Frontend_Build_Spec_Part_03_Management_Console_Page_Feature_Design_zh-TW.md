# Pantheon Frontend Build Spec  
## Part 3 — Pantheon Management Console 頁面與功能設計  
**Locale:** zh-TW  
**Document Type:** Lovable Frontend Build Specification  
**Scope:** Pantheon Management Console only  
**Related Docs:**  
- Part 1 — Master Blueprint  
- Part 2 — Management Console Process Inventory  

---

# 0. 本文件目的

本文件把 Part 2 盤點出的 Pantheon Management Console 管理流程，轉換成 Lovable 可以開始建置的前端頁面規格。

Pantheon Management Console 不是單純的 dashboard。它是 Pantheon 的正式管理控制台，負責：

```text
策略管理
人格管理
資金池管理
績效排序公式管理
季度調倉
演化方向管理
Research / Experiment 管理
Tool / MCP / Skill 管理
審批
部署
runtime 監控
風險與 incident 反應
rollback / pause / retire
audit
```

這些功能屬於同一批管理使用者，不應拆成不同產品。  
因此本文件設計的是：

```text
Pantheon Management Console
= Management + Operations + Governance + Observability
```

---

# 1. Lovable 建置總原則

## 1.1 單一管理控制台

Lovable 不要把 Core / Operations 拆成兩個 app。  
請以 `/management` route group 實作一套完整 Management Console。

```text
/management
├── command-center
├── strategies
├── personas
├── capital
├── ranking
├── rebalance
├── evolution
├── experiments
├── governance
├── deployment
├── runtimes
├── risk
├── incidents
├── tools
├── mcp
├── skills
├── artifacts
├── lineage
├── jobs
├── audit
└── settings
```

## 1.2 每個頁面都要同時呈現管理與現況

例如 Strategy Detail 不只是 strategy spec 頁，也要顯示：

```text
lifecycle state
owner persona
capital pool
paper/live status
running jobs
latest experiments
risk alerts
open incidents
available actions
approval status
audit timeline
```

## 1.3 物件優先，而不是聊天優先

Management Console 不是 chat UI。  
主要 UI 應以 entity、table、tabs、drawer、timeline、state badge、approval panel 為主。

## 1.4 所有高風險操作必須有確認與審批狀態

高風險操作包括：

```text
promote to live
rollback
apply rebalance
change capital allocation
change ranking formula
change persona route policy
grant MCP tool
approve skill
retire live strategy
emergency kill
```

這些操作都必須顯示：

```text
risk impact
affected object
required approval
audit memo
confirmation modal
```

## 1.5 使用 Mock BFF 先建置

Lovable 初期不需要真實 Pantheon backend。  
請建立 mock BFF client，所有資料與操作先使用 mock data。

---

# 2. Management Console 共用 Layout

## 2.1 App Shell

所有 Management 頁面使用同一個 shell：

```text
GlobalTopBar
├── Product Switcher
├── Environment Indicator
├── Global Search
├── BFF Status
├── Pending Approvals
├── Open Alerts
├── Running Jobs
├── Notifications
└── User / Role Menu

ManagementSidebar
└── grouped navigation

MainCanvas
└── current page

RightDrawer / Inspector
└── contextual entity inspector
```

## 2.2 Sidebar 分組

```text
Command
- Command Center

Core Management
- Strategies & Alphas
- Personas
- Capital & Allocation
- Performance Ranking
- Quarterly Rebalance
- Evolution Steering

Research & Governance
- Experiments
- Governance & Approvals
- Knowledge & Artifacts
- Lineage

Operations
- Deployment
- Runtimes
- Risk Center
- Incidents
- Jobs

Capabilities
- Tools
- MCP
- Skills

System
- Audit
- Settings
```

## 2.3 Top Bar 必備資訊

```text
Current environment: Research / Paper / Live
BFF connection: Connected / Degraded / Offline
Pending approvals count
Open alerts count
Running jobs count
User role
Language switcher: zh-TW / en-US
```

---

# 3. 全域共用元件

Lovable 應建立以下 reusable components。

## 3.1 EntityHeader

用途：所有 detail page 的頂部資訊。

Props 建議：

```ts
{
  entityType: string
  entityId: string
  title: string
  status: string
  riskLevel?: "low" | "medium" | "high" | "critical"
  owner?: string
  linkedEntities?: Array<Link>
  primaryAction?: Action
  secondaryActions?: Action[]
}
```

顯示：

```text
Entity name
ID
Status badge
Risk badge
Owner
Last updated
Primary action
Secondary action menu
```

## 3.2 StatusBadge

支援類型：

```text
strategy status
persona status
experiment status
review status
deployment status
job status
incident status
skill status
MCP status
```

## 3.3 RiskBadge

```text
Low
Medium
High
Critical
Blocked
```

## 3.4 DataTable

所有表格必須支援：

```text
search
filter
sort
pagination
row action menu
click row open detail
bulk select where applicable
```

## 3.5 RightDrawer / Inspector

支援：

```text
Strategy Inspector
Persona Inspector
Capital Pool Inspector
Job Inspector
Alert Inspector
Incident Inspector
Tool Call Inspector
Artifact Inspector
```

Drawer 內容：

```text
summary
status
linked entities
available actions
recent events
audit snippets
```

## 3.6 ActionButton / PermissionAwareButton

按鈕必須根據 BFF 的 `availableActions` 渲染。

狀態：

```text
enabled
disabled with reason
requires approval
high risk
hidden if role cannot see
```

## 3.7 ConfirmationModal

高風險操作必須使用。

欄位：

```text
operation name
target object
current state
next state
affected capital pool
affected runtime
risk impact
required approval
rollback option
audit memo textarea
confirm phrase if critical
```

## 3.8 JobProgressDrawer

用於所有長任務：

```text
job status
progress
current step
logs
target object
started by
started at
cancel / retry buttons
output artifacts
```

## 3.9 AuditTimeline

顯示：

```text
state changes
approvals
rejections
deployments
rollbacks
policy changes
tool permission changes
capital changes
```

## 3.10 LineageGraph

用於 strategy、artifact、experiment、deployment 的 lineage。

節點：

```text
Insight
Strategy Spec
Experiment
Artifact
Review
Promotion
Deployment
Telemetry
Incident
Postmortem
```

---

# 4. Page Spec 格式

後續每一頁都使用以下規格：

```text
Page
Route
Primary Users
Goal
Layout
Key Components
Primary Data
Filters
Main Actions
Secondary Actions
BFF APIs
Realtime Events
Empty State
Loading State
Error State
Permission Rules
Acceptance Criteria
```

---

# 5. Page — Command Center

## Route

```text
/management/command-center
```

## Primary Users

```text
Admin
Research Lead
Risk Officer
Capital Manager
System Operator
Reviewer
```

## Goal

作為 Management Console 首頁，統一呈現：

```text
策略生命週期瓶頸
待審批項目
執行現況
風險與 incident
running jobs
capital exposure
persona violations
Agora incoming items
```

## Layout

```text
Top KPI Strip
├── Live Risk
├── Open Incidents
├── Pending Approvals
├── Running Jobs
├── Runtime Health
└── Quarterly Rebalance Status

Main Grid
├── Lifecycle Bottlenecks
├── Pending Management Actions
├── Live / Paper Risk Snapshot
├── Running Jobs
├── Persona Activity & Violations
├── Capital Pool Exposure
├── Alerts & Incidents
├── Agora Incoming Queue
└── Recent State Transitions
```

## Key Components

```text
MetricCard
RiskBadge
LifecycleSummary
PendingActionList
AlertCard
JobMiniList
CapitalExposureCard
PersonaActivityCard
AgoraIncomingQueue
EventTimeline
```

## Primary Data

```text
managementOverview
strategyLifecycleSummary
pendingApprovals
openIncidents
runningJobs
riskSummary
capitalExposure
personaViolations
agoraIncomingItems
recentEvents
```

## Main Actions

```text
Open pending approval
Open incident
Open job drawer
Open strategy
Open persona
Open rebalance event
Convert Agora item to management workflow
```

## BFF APIs

```text
GET /bff/management/overview
GET /bff/management/pending-actions
GET /bff/management/recent-events
GET /bff/agora/incoming
POST /bff/agora/incoming/:id/actions/convert
```

## Realtime Events

```text
approval.requested
approval.decided
job.started
job.completed
job.failed
risk.alert_created
incident.updated
strategy.state_changed
rebalance.status_changed
agora.incoming_created
```

## Empty State

如果沒有 pending action：

```text
目前沒有待處理管理事項。
```

如果沒有 alert：

```text
目前沒有開啟中的風險警示。
```

## Error State

```text
無法載入管理總覽。請檢查 BFF 連線狀態。
```

## Acceptance Criteria

```text
使用者可以在首頁看到所有待處理管理事項。
使用者可以直接打開 approval、incident、job、strategy、persona。
Agora incoming items 必須顯示在 Management Console，而不是只留在 Agora。
所有數字卡可點擊進入對應列表。
```

---

# 6. Page — Strategy & Alpha Management List

## Route

```text
/management/strategies
```

## Primary Users

```text
Research Lead
Strategy Manager
Risk Officer
Capital Manager
System Operator
```

## Goal

管理所有 alpha / strategy，並追蹤其 lifecycle、績效、資金、paper/live、alert、incident 狀態。

## Layout

```text
Page Header
├── Title
├── Create Strategy button
└── View switcher: Table / Lifecycle Board / Risk View / Capital View

Filter Bar
├── lifecycle state
├── owner persona
├── capital pool
├── paper/live status
├── risk level
├── open alerts
├── open incidents
└── search

Main Content
├── Strategy Table or Board
└── Right Drawer on row click
```

## Table Columns

```text
Strategy ID
Name
Lifecycle State
Owner Persona
Capital Pool
Paper Status
Live Status
Latest Performance
Risk Level
Open Alerts
Open Jobs
Current Artifact
Evolution Program
Last Updated
Actions
```

## Views

```text
Table View
Lifecycle Board
Risk View
Capital Exposure View
Persona Ownership View
```

## Main Actions

```text
Create Strategy
Clone Strategy
Open Strategy Detail
Assign Persona
Submit Review
Promote to Paper
Request Live Promotion
Pause
Rollback
Retire
Open Incident
```

## BFF APIs

```text
GET /bff/strategies
POST /bff/strategies
POST /bff/strategies/:id/actions/clone
POST /bff/strategies/:id/actions/assign-persona
POST /bff/strategies/:id/actions/submit-review
POST /bff/strategies/:id/actions/promote-paper
POST /bff/strategies/:id/actions/request-live-promotion
POST /bff/strategies/:id/actions/pause
POST /bff/strategies/:id/actions/rollback
POST /bff/strategies/:id/actions/retire
```

## Realtime Events

```text
strategy.created
strategy.updated
strategy.state_changed
strategy.alert_created
strategy.incident_created
deployment.status_changed
job.progress
```

## Acceptance Criteria

```text
策略列表必須能按 lifecycle state、persona、capital pool、risk level 篩選。
每列 strategy 必須顯示 available actions。
高風險 action 必須打開 confirmation modal。
Lifecycle board 必須支援按 state 分欄。
```

---

# 7. Page — Strategy Detail

## Route

```text
/management/strategies/:strategyId
```

## Primary Users

```text
Research Lead
Strategy Manager
Risk Officer
Capital Manager
System Operator
Reviewer
```

## Goal

管理單一 strategy 的完整 lifecycle、spec、experiments、paper/live 狀態、風險、incident、artifact、governance 與 audit。

## Layout

```text
EntityHeader
├── Strategy name
├── Lifecycle state
├── Owner persona
├── Capital pool
├── Risk badge
├── Paper / Live status
├── Primary action
└── Secondary actions

Summary Strip
├── Latest return
├── Sharpe
├── Max drawdown
├── Risk budget usage
├── Open alerts
├── Running jobs
└── Current artifact

Tabs
├── Overview
├── Spec & Parameters
├── Data & Features
├── Experiments
├── Performance
├── Paper / Live Execution
├── Risk & Alerts
├── Incidents
├── Artifacts
├── Evolution
├── Governance
├── Lineage
└── Audit
```

## Tab — Overview

顯示：

```text
Current lifecycle state
Owner persona
Capital pool
Decision readiness panel
Open blockers
Latest metrics
Linked insights
Latest committee memo
Next allowed actions
```

## Tab — Spec & Parameters

功能：

```text
View / edit strategy spec
View spec versions
Compare versions
Lock / unlock spec
Manage parameter sets
Run parameter sweep
```

Fields:

```text
Hypothesis
Market
Asset universe
Signal definition
Entry logic
Exit logic
Position sizing
Risk control
Data requirement
Cost model
Failure modes
```

## Tab — Experiments

顯示：

```text
Backtests
OOS runs
Stress tests
Ablations
Parameter sweeps
Produced artifacts
Evidence attachments
```

Actions:

```text
Create Experiment
Clone Experiment
Rerun
Compare
Invalidate
Attach to Review
```

## Tab — Paper / Live Execution

顯示：

```text
Paper runtime
Live runtime
Deployment state
Current artifact
Capital allocation
PnL
Drawdown
Exposure
Last signal
Last trade
Broker status
Rollback target
```

Actions:

```text
Pause
Resume
Reduce Allocation
Rollback
Open Incident
Request Retirement
```

## Tab — Risk & Alerts

顯示：

```text
Risk budget usage
Drawdown
Exposure
Concentration
Slippage
Alert timeline
```

Actions:

```text
Acknowledge alert
Assign owner
Ask persona analysis
Open incident
Apply mitigation
```

## Tab — Incidents

顯示與 strategy 相關 incident。

Actions:

```text
Open incident
Create postmortem
Link to evolution constraint
Link to training feedback
```

## Tab — Artifacts

顯示：

```text
Artifact versions
Artifact type
Hash
Produced by experiment
Approved for
Deployment usage
Rollback eligibility
```

## Tab — Evolution

顯示：

```text
Linked evolution program
Candidate children
Mutation history
Fitness score changes
```

## Tab — Governance

顯示：

```text
Review requests
Approval history
Validator results
Committee memos
Promotion requests
```

## Tab — Lineage

使用 LineageGraph。

## Tab — Audit

使用 AuditTimeline。

## BFF APIs

```text
GET /bff/strategies/:id
GET /bff/strategies/:id/experiments
GET /bff/strategies/:id/artifacts
GET /bff/strategies/:id/deployments
GET /bff/strategies/:id/alerts
GET /bff/strategies/:id/incidents
GET /bff/strategies/:id/audit
POST /bff/strategies/:id/actions/:actionId
```

## Realtime Events

```text
strategy.updated
strategy.state_changed
experiment.completed
deployment.updated
risk.alert_created
incident.updated
job.progress
artifact.created
review.updated
```

## Acceptance Criteria

```text
Strategy Detail 必須能從同一頁管理 spec、experiments、paper/live、risk、incident、artifacts、governance。
高風險操作不可直接執行，必須 confirmation。
Running jobs 必須即時更新。
Alerts 與 incidents 必須可直接從 strategy 頁處理。
```

---

# 8. Page — Persona Directorate List

## Route

```text
/management/personas
```

## Primary Users

```text
Admin
Research Lead
Capability Admin
Capital Manager
AI Governance Manager
```

## Goal

管理 AI personas 的 lifecycle、role、policy、tool/MCP/skill permission、capital binding、strategy ownership、activity、training/evaluation 狀態。

## Layout

```text
Page Header
├── Create Persona
├── Clone Persona
└── View switcher: Table / Policy Matrix / Capital View / Activity View

Filter Bar
├── status
├── role
├── capital pool
├── performance rank
├── policy violation
├── tool access
└── search

Persona Table
```

## Table Columns

```text
Persona ID
Name
Role
Status
Current Version
Performance Rank
Capital Binding
Active Strategies
Running Jobs
Tool Calls
MCP Calls
Skill Calls
Policy Violations
Last Evaluation
Actions
```

## Main Actions

```text
Create Persona
Clone Persona
Open Detail
Activate
Suspend
Restrict
Put on Probation
Assign Capital
Run Evaluation
Retire
```

## BFF APIs

```text
GET /bff/personas
POST /bff/personas
POST /bff/personas/:id/actions/clone
POST /bff/personas/:id/actions/activate
POST /bff/personas/:id/actions/suspend
POST /bff/personas/:id/actions/restrict
POST /bff/personas/:id/actions/probation
POST /bff/personas/:id/actions/retire
```

## Acceptance Criteria

```text
Persona list 必須能看到管理狀態與執行活動。
Policy violations 必須明顯顯示。
Persona 可從列表直接進入 detail。
```

---

# 9. Page — Persona Detail

## Route

```text
/management/personas/:personaId
```

## Goal

管理單一 persona 的身份、權限、工具、資金、績效、活動、記憶、訓練、評估與 audit。

## Layout

```text
EntityHeader
Summary Strip
Tabs
```

## Tabs

```text
Overview
Identity & Role
Private Workspace
Route Policy
Tools / MCP / Skills
Capital Binding
Strategy Ownership
Performance & Ranking
Activity Monitor
Policy Violations
Training & Memory
Evaluations
Version History
Audit
```

## Tab — Route Policy

顯示 permission matrix：

```text
Capability
Allowed
Requires Approval
Scope
Lifecycle Limit
Rate Limit
Environment
```

Actions:

```text
Grant capability
Revoke capability
Change approval rule
Change rate limit
Submit policy change approval
Rollback policy version
```

## Tab — Tools / MCP / Skills

顯示三個矩陣：

```text
Tool permissions
MCP permissions
Skill permissions
```

Actions:

```text
Grant Tool
Revoke Tool
Grant MCP Tool
Revoke MCP Tool
Grant Skill
Revoke Skill
Test as Persona
```

## Tab — Activity Monitor

顯示：

```text
Current task
Active sessions
Running jobs
Recent tool calls
Recent MCP calls
Recent skill calls
Generated strategies
Generated notes
Policy violations
Open feedback
```

Actions:

```text
Pause persona
Restrict tools temporarily
Reassign task
Open violation
Create training feedback
Run evaluation
```

## Tab — Training & Memory

顯示：

```text
Approved memories
Pending memories
Rejected memories
Training examples
Feedback queue
```

Actions:

```text
Approve memory
Reject memory
Edit memory
Merge memory
Convert feedback to training example
```

## BFF APIs

```text
GET /bff/personas/:id
GET /bff/personas/:id/route-policy
GET /bff/personas/:id/tool-permissions
GET /bff/personas/:id/activity
GET /bff/personas/:id/memory
GET /bff/personas/:id/evaluations
POST /bff/personas/:id/actions/:actionId
```

## Acceptance Criteria

```text
Persona Detail 必須同時管理身份、權限、資金、策略、活動、記憶與訓練。
Route policy 與 Tools/MCP/Skills permission 必須清楚可見。
Policy change 必須能進 approval flow。
```

---

# 10. Page — Capital Pool List

## Route

```text
/management/capital
```

## Goal

管理資金池、risk budget、persona/strategy binding、current exposure 與調倉狀態。

## Table Columns

```text
Pool ID
Name
Status
Mandate
Total Capital
Allocated Capital
Available Capital
Risk Budget
Risk Usage
Linked Personas
Linked Strategies
Current Rebalance
Open Alerts
Actions
```

## Main Actions

```text
Create Capital Pool
Open Detail
Freeze Pool
Unfreeze Pool
Create Rebalance
Edit Mandate
```

## BFF APIs

```text
GET /bff/capital-pools
POST /bff/capital-pools
POST /bff/capital-pools/:id/actions/freeze
POST /bff/capital-pools/:id/actions/unfreeze
POST /bff/capital-pools/:id/actions/create-rebalance
```

---

# 11. Page — Capital Pool Detail

## Route

```text
/management/capital/:poolId
```

## Tabs

```text
Overview
Mandate
Persona Binding
Strategy Binding
Risk Budget
Current Exposure
Performance
Ranking Inputs
Rebalance History
Overrides
Alerts
Audit
```

## Key Actions

```text
Edit Mandate
Set Risk Budget
Bind Persona
Unbind Persona
Bind Strategy
Unbind Strategy
Freeze Pool
Unfreeze Pool
Create Quarterly Rebalance
Apply Override
Open Incident
```

## Acceptance Criteria

```text
Capital Pool Detail 必須同時顯示設定與現況。
Current Exposure 必須包含 persona exposure、strategy exposure、risk usage。
Rebalance history 必須可追蹤。
```

---

# 12. Page — Performance Ranking

## Route

```text
/management/ranking
```

## Goal

管理 persona / strategy / alpha family / capital pool 的績效排名。

## Layout

```text
Ranking Scope Tabs
├── Persona Ranking
├── Strategy Ranking
├── Alpha Family Ranking
├── Capital Pool Ranking
├── Paper Strategy Ranking
└── Live Strategy Ranking

Formula Selector
Ranking Table
Score Breakdown Drawer
```

## Table Columns

```text
Rank
Entity
Score
Previous Rank
Rank Change
Return
Sharpe
Sortino
Max Drawdown
Volatility
Turnover
Risk Violations
Formula Version
Recommended Allocation
Actions
```

## Actions

```text
Recalculate
Change Formula
Freeze Ranking
Publish Ranking
Apply Override
Open Score Breakdown
Compare Formula Results
```

## BFF APIs

```text
GET /bff/rankings
GET /bff/rankings/:scope
POST /bff/rankings/:scope/actions/recalculate
POST /bff/rankings/:scope/actions/publish
POST /bff/rankings/:scope/actions/freeze
POST /bff/rankings/:scope/actions/override
```

---

# 13. Page — Formula Studio

## Route

```text
/management/ranking/formulas
```

## Goal

管理績效排序公式與資金配置公式。

## Layout

```text
Formula List
Formula Editor
Metric Library
Weight Builder
Penalty Builder
Preview / Backtest Panel
Version History
```

## Formula Fields

```text
Formula name
Scope
Version
Status
Metrics
Weights
Penalties
Normalization method
Caps / floors
Outlier handling
Effective date
```

## Actions

```text
Create Formula
Clone Formula
Edit Formula
Test Formula
Backtest on Past Quarters
Compare Formula Versions
Submit Approval
Activate Formula
Rollback Formula
Retire Formula
```

## Acceptance Criteria

```text
Formula Studio 必須支援權重、penalty、normalization、caps/floors。
必須能比較公式版本。
Activate formula 必須走 high-risk confirmation 或 approval。
```

---

# 14. Page — Quarterly Rebalance

## Route

```text
/management/rebalance
/management/rebalance/:rebalanceId
```

## Goal

管理每季依據投資績效重新排序與資金池調整。

## List Columns

```text
Rebalance ID
Quarter
Capital Pool
Status
Formula Version
Metric Freeze Status
Ranking Status
Simulation Status
Approval Status
Effective Date
Actions
```

## Detail Workflow Steps

```text
1. Metric Freeze
2. Ranking Calculation
3. Allocation Simulation
4. Constraint Check
5. Manual Override
6. Review
7. Approval
8. Schedule
9. Apply
10. Monitor
11. Rollback
```

## Actions

```text
Create Rebalance
Freeze Metrics
Unfreeze Metrics
Calculate Ranking
Run Simulation
Apply Override
Submit Review
Approve
Schedule
Apply Rebalance
Rollback
Publish Report
```

## BFF APIs

```text
GET /bff/rebalances
GET /bff/rebalances/:id
POST /bff/rebalances
POST /bff/rebalances/:id/actions/freeze-metrics
POST /bff/rebalances/:id/actions/calculate-ranking
POST /bff/rebalances/:id/actions/run-simulation
POST /bff/rebalances/:id/actions/apply-override
POST /bff/rebalances/:id/actions/submit-review
POST /bff/rebalances/:id/actions/approve
POST /bff/rebalances/:id/actions/apply
POST /bff/rebalances/:id/actions/rollback
```

## Acceptance Criteria

```text
Quarterly Rebalance 頁必須是流程式 UI。
必須顯示 ranking result、allocation simulation、constraint warnings、manual overrides。
Apply rebalance 必須是 high-risk action。
```

---

# 15. Page — Evolution Steering

## Route

```text
/management/evolution
/management/evolution/:programId
```

## Goal

管理 alpha 演化方向、fitness formula、mutation rules、runs、candidate promotion。

## List Columns

```text
Program ID
Name
Target Alpha Family
Owner Persona
Status
Fitness Formula
Active Runs
Best Candidate
Open Jobs
Last Result
Actions
```

## Detail Tabs

```text
Overview
Direction
Fitness Formula
Mutation Rules
Constraints
Active Runs
Candidates
Experiments
Alerts
Approvals
Audit
```

## Actions

```text
Create Program
Edit Direction
Set Fitness Formula
Set Mutation Rules
Set Constraints
Assign Persona
Start Run
Pause Run
Stop Run
Inspect Candidate
Promote Candidate to Strategy
Retire Program
```

## Acceptance Criteria

```text
Evolution Program 必須能管理方向，不只是顯示結果。
Candidate 必須能轉成 scaffolded strategy proposal。
Fitness formula changes 必須可審批。
```

---

# 16. Page — Research & Experiments

## Route

```text
/management/experiments
/management/experiments/:experimentId
```

## Goal

管理 experiments 與追蹤長任務。

## Table Columns

```text
Experiment ID
Strategy
Owner Persona
Engine
Type
Status
Current Step
Metrics
Produced Artifact
Attached Review
Started At
Duration
Actions
```

## Actions

```text
Create Experiment
Run
Pause
Cancel
Retry
Clone
Compare
Invalidate
Attach to Review
Create Incident
Open Logs
```

## Detail Tabs

```text
Overview
Config
Metrics
Charts
Logs
Artifacts
Evidence
Audit
```

## BFF APIs

```text
GET /bff/experiments
GET /bff/experiments/:id
POST /bff/experiments
POST /bff/experiments/:id/actions/run
POST /bff/experiments/:id/actions/cancel
POST /bff/experiments/:id/actions/retry
POST /bff/experiments/:id/actions/invalidate
```

---

# 17. Page — Governance & Approvals

## Route

```text
/management/governance
/management/governance/:reviewId
```

## Goal

集中管理所有高風險操作審批。

## Approval Types

```text
Strategy Review
Paper Promotion
Live Promotion
Rollback
Capital Rebalance
Ranking Formula Change
Persona Policy Change
Tool Permission Change
MCP Approval
Skill Approval
Evolution Program Approval
```

## Table Columns

```text
Request ID
Type
Target Object
Requested By
Risk Level
Required Approvers
Status
Age
Linked Evidence
Actions
```

## Detail Layout

```text
Left: Request Summary
Center: Evidence / Validator Results
Right: Decision Panel
Bottom: Audit Timeline
```

## Decision Actions

```text
Approve
Reject
Request Changes
Escalate
Attach Memo
Freeze Target
```

## Acceptance Criteria

```text
Approval detail 必須顯示 before / after、risk、evidence、validator result。
所有 decision 必須要求 memo。
```

---

# 18. Page — Deployment, Runtime & Risk

## Routes

```text
/management/deployment
/management/runtimes
/management/risk
```

## Deployment Page

顯示：

```text
Paper deployments
Live deployments
Deployment status
Current artifact
Runtime
Capital allocation
Rollback target
```

Actions:

```text
Schedule Deployment
Pause
Resume
Rollback
Retire
Open Incident
```

## Runtime Page

Columns:

```text
Runtime ID
Status
Heartbeat
Running Strategies
CPU
Memory
Queue Depth
Broker Connection
Order Latency
Last Error
Open Incidents
Actions
```

Actions:

```text
Restart Runtime
Drain Runtime
Move Strategy
Disable New Deployments
Open Logs
Open Incident
```

## Risk Center

顯示：

```text
Capital Risk
Strategy Risk
Persona Risk
Runtime Risk
Tool / MCP / Skill Risk
```

Actions:

```text
Acknowledge
Assign
Open Incident
Ask Persona
Mitigate
Escalate
```

---

# 19. Page — Incident Center

## Route

```text
/management/incidents
/management/incidents/:incidentId
```

## List Columns

```text
Incident ID
Severity
Status
Linked Strategy
Linked Runtime
Linked Capital Pool
Owner
Created At
Last Update
Actions
```

## Detail Sections

```text
Incident Summary
Timeline
Linked Alerts
Affected Strategies
Affected Capital
Root Cause Hypothesis
Actions Taken
Mitigation
Postmortem
Training Feedback
Evolution Constraint
Audit
```

## Actions

```text
Assign Owner
Ask Persona Analysis
Pause Strategy
Rollback
Create Postmortem
Create Training Feedback
Create Evolution Constraint
Close Incident
```

## Acceptance Criteria

```text
Incident 必須能連回 strategy、runtime、capital pool、training feedback、evolution constraint。
Incident close 前若 severity high，必須要求 postmortem。
```

---

# 20. Page — Tools Management

## Route

```text
/management/tools
```

## Goal

管理 generic tools 與 persona tool permissions。

## Columns

```text
Tool ID
Name
Type
Status
Side Effect Level
Risk Level
Allowed Personas
Requires Approval
Last Health Check
Last Used
Error Rate
Actions
```

## Actions

```text
Register Tool
Edit Schema
Classify Risk
Assign Persona
Set Approval Rule
Disable Tool
Retire Tool
View Calls
```

---

# 21. Page — MCP Management

## Route

```text
/management/mcp
/management/mcp/:serverId
```

## Goal

管理 MCP servers、MCP tools、schemas、secrets、permissions、calls。

## Server Columns

```text
Server ID
Name
Transport
Endpoint
Status
Tools Count
Auth Type
Allowed Personas
Risk Level
Last Health Check
Actions
```

## Detail Tabs

```text
Overview
Connection
Tools
Schemas
Permissions
Secrets
Health
Calls
Audit
```

## Actions

```text
Add MCP Server
Edit Connection
Test Connection
Discover Tools
Import Schemas
Grant Persona Permission
Revoke Permission
Rotate Secret
Disable Server
Delete Server
```

## Acceptance Criteria

```text
MCP tools 必須能以 permission matrix 指派給 persona。
Sensitive MCP permission changes 必須走 approval。
```

---

# 22. Page — Skill Management

## Route

```text
/management/skills
/management/skills/:skillId
```

## Goal

管理 skill registry、draft、sandbox、approval、version、persona permission。

## Skill Columns

```text
Skill ID
Name
Status
Version
Author
Risk Level
Required Tools
Allowed Personas
Validation Status
Sandbox Result
Last Used
Actions
```

## Detail Tabs

```text
Overview
Source / Definition
Sandbox Tests
Security Scan
Risk Classification
Permissions
Versions
Calls
Approval History
Audit
```

## Actions

```text
Create Skill
Import Skill
Generate Draft
Run Sandbox Test
Run Security Scan
Classify Risk
Approve Skill
Assign Persona
Revoke Persona
Rollback Version
Deprecate
Retire
```

## Acceptance Criteria

```text
Skill 不可從 draft 直接 active。
必須經過 sandbox / scan / approval。
Skill permissions 必須能按 persona 管理。
```

---

# 23. Page — Knowledge, Artifacts & Lineage

## Routes

```text
/management/artifacts
/management/artifacts/:artifactId
/management/lineage
```

## Artifact Columns

```text
Artifact ID
Type
Version
Strategy
Produced By
Status
Hash
Approved For
Used In Runtime
Created At
Actions
```

## Actions

```text
Open Artifact
Compare Version
Promote Artifact
Deprecate Artifact
Set Rollback Target
Attach Evidence
View Lineage
```

## Lineage Page

支援 entity filter：

```text
strategy
artifact
experiment
deployment
incident
persona
```

顯示 graph：

```text
Insight → Strategy → Experiment → Artifact → Review → Promotion → Deployment → Telemetry → Incident → Postmortem
```

---

# 24. Page — Jobs

## Route

```text
/management/jobs
```

## Columns

```text
Job ID
Type
Target Object
Triggered By
Persona
Status
Progress
Current Step
Started At
Duration
Output
Actions
```

## Actions

```text
Open Logs
Cancel
Retry
Clone
Attach Result
Create Incident
```

## BFF APIs

```text
GET /bff/jobs
GET /bff/jobs/:id
GET /bff/jobs/:id/logs
POST /bff/jobs/:id/actions/cancel
POST /bff/jobs/:id/actions/retry
```

---

# 25. Page — Audit

## Route

```text
/management/audit
```

## Filters

```text
entity type
entity id
actor
event type
risk level
date range
approval status
```

## Columns

```text
Timestamp
Actor
Event Type
Entity
Before
After
Risk Level
Approval ID
Audit Memo
```

## Entity Audit Timeline

任何 entity detail page 都可嵌入 AuditTimeline。

---

# 26. Page — Settings

## Route

```text
/management/settings
```

## Sections

```text
User & Roles
Locales
BFF Connection
Feature Flags
Notification Rules
Risk Threshold Defaults
Environment Settings
Audit Retention
```

## i18n Settings

```text
Default locale
Supported locales
User locale override
Translation fallback
```

---

# 27. Management Console Empty / Loading / Error Patterns

## Empty State Examples

```text
No strategies found.
No pending approvals.
No running jobs.
No open incidents.
No MCP servers configured.
No skill drafts waiting for approval.
```

每個 empty state 都要有合適 CTA：

```text
Create Strategy
Add MCP Server
Create Skill Draft
Open Agora Insight Inbox
```

## Loading State

使用 skeleton，不要整頁空白。

## Error State

顯示：

```text
Error title
Short explanation
Retry button
BFF status
Optional diagnostics drawer
```

---

# 28. Management Console Acceptance Criteria

Lovable 完成 Part 3 對應建置後，至少需要滿足：

```text
Management Console sidebar 結構完整。
Command Center 顯示管理 + 執行現況。
Strategy list / detail 可管理 lifecycle 與執行狀態。
Persona list / detail 可管理 role、policy、tools、MCP、skills、capital、activity。
Capital / Ranking / Rebalance 頁可管理公式、排名、調倉流程。
Evolution 頁可管理方向、fitness formula、runs、candidates。
Experiments 頁可追蹤 job 與 metrics。
Governance 頁可處理 approval。
Deployment / Runtime / Risk 頁可追蹤與反應執行現況。
Tools / MCP / Skills 頁可管理權限與審批。
Artifacts / Lineage 頁可追蹤完整鏈路。
Jobs / Audit 頁可追蹤所有操作。
所有高風險操作都有 confirmation modal。
所有頁面支援 zh-TW / en-US translation keys。
所有 action 先走 mock BFF client。
