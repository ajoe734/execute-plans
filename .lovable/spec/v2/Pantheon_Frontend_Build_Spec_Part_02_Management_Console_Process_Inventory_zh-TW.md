# Pantheon Frontend Build Spec
## Part 2 — Pantheon Management Console 完整管理流程盤點

**文件語系：繁體中文（zh-TW）**  
**目標讀者：Lovable、前端工程師、BFF 工程師、產品設計者、Pantheon 系統設計者**

---

## 0. 本文件目的

Part 1 已定義 Pantheon 前端平台分成兩套系統：

```text
Pantheon Management Console
Pantheon Agora Workbench
```

本文件只處理 **Pantheon Management Console**。  
重點不是頁面設計，而是先盤點管理端必須支援的完整流程。

這份文件要確保 Lovable 後續實作 UI 時，不會只做出「展示狀態的 dashboard」，而是做出真正能管理、監控、反應、審批、部署、回滾與審計的管理控制台。

---

## 1. Management Console 的核心定義

Pantheon Management Console 是同一批管理 / 風控 / 研究主管 / 系統操作角色使用的正式控制台。

它必須同時覆蓋：

```text
管理策略
管理人格
管理資金池
管理績效排序公式
管理季度調倉
管理 Alpha 演化方向
管理 research / experiment
管理 tool / MCP / skill
管理審批
管理 paper / live deployment
追蹤 runtime / job / experiment / tool call 現況
處理 alert / incident
執行 rollback / pause / retire
審計所有高風險操作
```

因此本系統不是：

```text
不是單純狀態展示頁
不是單純策略列表
不是單純 AI dashboard
不是單純 trading monitor
不是純設定後台
```

而是：

```text
Pantheon 的管理與執行控制平面
Management + Operations + Governance + Audit in one console
```

---

## 2. 管理流程盤點方法

每條流程都要被定義成以下結構：

```text
Managed Objects
States
State Transitions
Primary Actions
Secondary Actions
Validation Rules
Approval Requirements
Job Requirements
Realtime Events
Audit Requirements
BFF Responsibilities
UI Surfaces Required
```

Lovable 後續做頁面時，必須從這些流程推導 UI，而不是反過來先畫頁面。

---

## 3. 管理端使用者角色

### 3.1 Admin

負責整體系統設定、角色、權限、工具、MCP、Skill、BFF / integration 設定。

### 3.2 Research Lead

負責策略研究、Alpha lifecycle、experiment、strategy review、persona 指派。

### 3.3 Risk Officer

負責風控、risk budget、paper/live promotion、incident、rollback、資金池風險限制。

### 3.4 Capital Manager

負責 capital pool、績效排名、季度調倉、allocation override、資金池 mandate。

### 3.5 Strategy Manager

負責單一或多個 Alpha / Strategy 的狀態、artifact、deployment、退役、替換。

### 3.6 System Operator

負責 runtime、job、deployment、MCP server health、incident response、rollback 操作。

### 3.7 Reviewer / Committee Member

負責審查 strategy、promotion、rebalance、formula、persona policy、skill/MCP approval。

### 3.8 Capability Admin

負責 Tool、MCP、Skill、workflow template、hook / cron 的註冊、測試、授權與停用。

---

## 4. 全域管理規則

所有 Management Console 的管理物件都必須遵守以下規則。

### 4.1 每個物件都要有狀態

例如：

```text
Strategy.status
Persona.status
CapitalPool.status
RankingFormula.status
QuarterlyRebalance.status
Experiment.status
Skill.status
MCPServer.status
Incident.status
Job.status
```

前端不能只依據資料存在與否判斷操作，而要依據狀態與 BFF 回傳的 `availableActions`。

---

### 4.2 BFF 必須回傳 availableActions

每個 detail API 都應該回傳目前使用者可執行的 actions。

範例：

```json
{
  "id": "alpha_042",
  "type": "strategy",
  "status": "replicated",
  "riskLevel": "medium",
  "availableActions": [
    {
      "id": "submit_review",
      "labelKey": "action.submitReview",
      "enabled": true,
      "riskLevel": "medium",
      "requiresApproval": false
    },
    {
      "id": "promote_live",
      "labelKey": "action.promoteLive",
      "enabled": false,
      "riskLevel": "high",
      "requiresApproval": true,
      "disabledReasonKey": "reason.strategyNotApprovedForLive"
    }
  ]
}
```

Lovable 前端不要自行硬編完整業務規則，而是依據 BFF 回傳內容 render action。

---

### 4.3 所有高風險操作必須 confirmation

高風險操作包括：

```text
Promote to Live
Rollback Live Strategy
Apply Quarterly Rebalance
Change Capital Allocation
Change Ranking Formula
Grant MCP Tool
Approve Skill
Change Persona Route Policy
Emergency Kill
Retire Strategy
Freeze Capital Pool
Unfreeze Capital Pool
```

Confirmation modal 必須顯示：

```text
操作名稱
目標物件
目前狀態
目標狀態
影響的策略
影響的人格
影響的資金池
影響的 runtime
風險等級
是否需要審批
rollback option
audit memo input
confirm action
```

---

### 4.4 所有長任務必須 job 化

超過 2 秒的操作不得讓 UI blocking。

必須建立 job：

```text
Backtest
OOS
Stress test
Artifact build
Validator run
Formula recalculation
Quarterly rebalance simulation
Evolution run
MCP discovery
Skill sandbox
Persona evaluation
Deployment
Rollback
Postmortem generation
```

前端必須提供：

```text
Job Drawer
Job Progress
Job Logs
Cancel / Retry
Output artifacts
Realtime update
```

---

### 4.5 所有重要操作必須 audit

Audit event 至少要包含：

```text
event_id
actor_id
actor_role
event_type
target_type
target_id
before_state
after_state
request_payload_summary
decision_memo
timestamp
ip / session metadata if available
```

---

### 4.6 Alert / Incident 必須能反應

Alert 不是純通知。每個 alert 必須能：

```text
Acknowledge
Assign Owner
Ask Persona Analysis
Open Incident
Dismiss as Noise
Escalate
Mitigate
Close
Generate Postmortem
Create Training Feedback
Create Research Task
```

---

### 4.7 Agora incoming items 必須進入 Management Console

Agora Workbench 產生的內容不能消失在聊天紀錄裡。它們要進 Management Console 的 incoming queue。

Agora 可能產生：

```text
Trader Insight
Signal Feedback
Decision Journal Outcome
Committee Memo
Training Feedback
Skill Draft
MCP Tool Request
Research Task Proposal
Strategy Proposal
Memory Update Request
```

Management Console 必須能處理：

```text
Accept
Reject
Convert to Strategy
Convert to Research Task
Attach to Existing Strategy
Attach to Review
Convert to Training Example
Submit for Approval
Archive
```

---

# 5. 流程 A：Command Center 管理閉環

## 5.1 目的

Command Center 是 Management Console 的總入口，負責讓管理者掌握：

```text
什麼事情正在發生
什麼事情需要處理
什麼風險需要反應
哪些審批卡住
哪些 job / experiment / runtime 出問題
Agora 有哪些 incoming items 需要正式處理
```

## 5.2 Managed Objects

```text
Strategy
Persona
CapitalPool
QuarterlyRebalance
Experiment
ReviewRequest
Deployment
Runtime
RiskAlert
Incident
Job
ToolCall
MCPCall
SkillCall
AgoraIncomingItem
```

## 5.3 Required Status Blocks

Command Center 必須顯示：

```text
Lifecycle Bottlenecks
Pending Approvals
Open Incidents
Live / Paper Risk Snapshot
Running Jobs
Runtime Health
Capital Pool Exposure
Persona Policy Violations
Agora Incoming Queue
Recent State Transitions
```

## 5.4 Primary Actions

```text
Open Strategy
Open Persona
Open Capital Pool
Open Incident
Open Job
Open Approval
Process Agora Incoming Item
Acknowledge Alert
Assign Owner
Run Mitigation
```

## 5.5 UI Surfaces Required

```text
Management Command Center page
Alert cards
Pending action cards
Lifecycle summary cards
Running job table
Incoming item queue
Recent event stream
Right-side inspector drawer
```

---

# 6. 流程 B：Strategy / Alpha Lifecycle 管理

## 6.1 目的

管理 Alpha 交易策略從想法到退役的完整生命週期。

```text
discovered → scaffolded → replicated → approved → paper → live → retired
```

## 6.2 Managed Objects

```text
Strategy
StrategySpec
Experiment
Artifact
ReviewRequest
PromotionRequest
Deployment
RiskAlert
Incident
Postmortem
```

## 6.3 Strategy States

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

## 6.4 State Definitions

### discovered

策略想法已建立，但尚未有完整 spec。

管理操作：

```text
Edit thesis
Assign owner persona
Set priority
Attach insight / note / paper
Reject idea
Scaffold strategy
```

### scaffolded

已有初步 spec、資料與 template。

管理操作：

```text
Edit spec
Select data source
Set parameters
Select experiment engine
Run backtest
Run OOS
```

### replicated

已有可重現實驗結果。

管理操作：

```text
Attach evidence
Compare experiments
Invalidate weak result
Submit review
Request more experiments
```

### approved

通過審查，可進 paper。

管理操作：

```text
Assign approved artifact
Bind capital pool for paper
Create paper promotion request
```

### paper

已進 paper runtime / 模擬資金環境。

管理操作：

```text
Monitor paper performance
Pause paper
Request live promotion
Extend paper period
Retire paper strategy
```

### live

已進實盤執行。

管理操作：

```text
Monitor live
Pause
Resume
Reduce allocation
Rollback
Replace
Open incident
Retire
Emergency kill
```

### degraded

live 或 paper 表現惡化，需調查。

管理操作：

```text
Open incident
Ask persona analysis
Reduce allocation
Rollback
Create postmortem
Add evolution constraint
```

### retired

策略退役，不再部署，但保留歷史。

管理操作：

```text
View history
Clone as new strategy
Generate postmortem
Archive
```

## 6.5 Required BFF Actions

```text
POST /bff/strategies
POST /bff/strategies/:id/actions/scaffold
POST /bff/strategies/:id/actions/run-experiment
POST /bff/strategies/:id/actions/submit-review
POST /bff/strategies/:id/actions/promote-paper
POST /bff/strategies/:id/actions/request-live-promotion
POST /bff/strategies/:id/actions/pause
POST /bff/strategies/:id/actions/resume
POST /bff/strategies/:id/actions/rollback
POST /bff/strategies/:id/actions/retire
```

## 6.6 Realtime Events

```text
strategy.created
strategy.state_changed
strategy.spec_updated
strategy.experiment_attached
strategy.review_submitted
strategy.promoted_paper
strategy.promoted_live
strategy.rollback_started
strategy.rollback_completed
strategy.retired
```

## 6.7 Audit Requirements

每次 state transition 必須 audit。

必要欄位：

```text
strategy_id
from_state
to_state
actor
reason
linked_evidence
approval_id if any
```

## 6.8 UI Surfaces Required

```text
Strategy Registry
Alpha Factory Board
Strategy Detail
Lifecycle Stepper
State Transition Modal
Strategy Action Drawer
Risk / Alert Panel
Incident Panel
Audit Timeline
```

---

# 7. 流程 C：Strategy Spec / Artifact 管理

## 7.1 目的

確保策略規格、參數、artifact、rollback target 都可版本化與審計。

## 7.2 Managed Objects

```text
StrategySpec
ParameterSet
Artifact
ArtifactVersion
RollbackTarget
EvidencePack
```

## 7.3 StrategySpec States

```text
draft
validated
locked
approved
deprecated
rolled_back
```

## 7.4 Artifact States

```text
candidate
validated
approved
paper_deployed
live_deployed
deprecated
retired
```

## 7.5 Primary Actions

```text
Create Spec
Edit Spec
Clone Spec
Compare Spec Versions
Lock Spec
Unlock with Approval
Rollback Spec
Create Parameter Set
Run Parameter Sweep
Register Artifact
Compare Artifacts
Approve Artifact
Set Rollback Target
Deprecate Artifact
```

## 7.6 Required UI Surfaces

```text
Spec Editor
Spec Version Diff
Parameter Manager
Artifact Store
Artifact Detail
Artifact Compare
Rollback Target Manager
Evidence Pack Viewer
```

## 7.7 BFF Responsibilities

BFF 必須提供：

```text
current active spec
spec version history
artifact version list
artifact approval state
rollback eligibility
availableActions
```

---

# 8. 流程 D：Research / Experiment 管理

## 8.1 目的

管理 backtest、OOS、stress test、parameter sweep、RL training 等研究與實驗。

## 8.2 Managed Objects

```text
Experiment
ExperimentRun
Dataset
FeaturePipeline
EvidencePack
ExperimentArtifact
```

## 8.3 Experiment Types

```text
backtest
OOS
stress_test
ablation
parameter_sweep
simulation
RL_training
policy_evaluation
paper_validation
```

## 8.4 Experiment States

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

## 8.5 Primary Actions

```text
Create Experiment
Select Engine
Select Dataset
Set Time Range
Set Cost Model
Set Validation Method
Run Experiment
Pause Experiment
Cancel Experiment
Retry Experiment
Clone Experiment
Compare Experiments
Invalidate Result
Attach to Strategy
Attach to Review
Export Evidence Pack
```

## 8.6 Job Requirement

所有 experiment run 必須建立 job。

```text
experiment.queued
experiment.running
experiment.completed
experiment.failed
job.progress
job.logs_updated
```

## 8.7 UI Surfaces Required

```text
Experiment Registry
Experiment Builder
Experiment Detail
Experiment Compare
Metrics Viewer
Logs Drawer
Evidence Pack Builder
Dataset Catalog
Feature Pipeline Manager
```

---

# 9. 流程 E：Governance / Approval 管理

## 9.1 目的

管理所有會影響策略、人格、資金、工具、部署的高風險變更。

## 9.2 Review Types

```text
strategy_review
patch_review
artifact_review
paper_promotion_review
live_promotion_review
capital_rebalance_review
ranking_formula_review
persona_policy_review
skill_approval_review
mcp_approval_review
evolution_program_review
rollback_review
```

## 9.3 Review States

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

## 9.4 Primary Actions

```text
Submit Review
Run Validators
Assign Reviewer
Add Committee
Approve
Reject
Request Changes
Escalate
Attach Memo
Attach Evidence
Lock Decision
```

## 9.5 Validator Types

```text
Schema Validator
Scope Validator
Data Leakage Check
Backtest Gate
OOS Gate
Risk Check
Reproducibility Check
Capital Compatibility Check
Tool Permission Check
Policy Violation Check
```

## 9.6 UI Surfaces Required

```text
Governance Queue
Review Detail
Validator Result Panel
Approval Chain Viewer
Decision Memo Editor
Committee Memo Viewer
Evidence Pack Viewer
```

---

# 10. 流程 F：Deployment / Runtime / Risk / Incident / Rollback 管理

## 10.1 目的

把 paper/live deployment、runtime、risk alert、incident、rollback 放在同一條反應流程中。

## 10.2 Managed Objects

```text
Deployment
Runtime
RiskAlert
Incident
RollbackRequest
Postmortem
MitigationAction
```

## 10.3 Deployment States

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

## 10.4 Runtime States

```text
healthy
degraded
disconnected
draining
halted
maintenance
```

## 10.5 Alert States

```text
new
acknowledged
assigned
investigating
mitigated
resolved
postmortem_required
closed
```

## 10.6 Incident States

```text
opened
triaged
investigating
mitigating
monitoring
resolved
closed
```

## 10.7 Primary Actions

```text
Deploy Paper
Deploy Live
Pause Strategy
Resume Strategy
Reduce Allocation
Rollback
Replace Strategy
Open Alert
Acknowledge Alert
Open Incident
Assign Incident Owner
Ask Persona Analysis
Apply Mitigation
Generate Postmortem
Close Incident
Emergency Kill
```

## 10.8 Required UI Surfaces

```text
Deployment Console
Runtime Monitor
Live Strategy Monitor
Paper Strategy Monitor
Risk Center
Alert Center
Incident Detail
Rollback Manager
Postmortem Editor
```

## 10.9 High-Risk Actions

以下必須 confirmation + audit，通常也需要 approval：

```text
Promote to Live
Rollback Live
Emergency Kill
Reduce Live Allocation
Replace Live Strategy
Retire Live Strategy
Restart Runtime with Active Strategies
```

---

# 11. 流程 G：Persona Lifecycle 管理

## 11.1 目的

管理 AI Persona 的建立、啟用、限制、停用、退役、版本與評估。

## 11.2 Managed Objects

```text
Persona
PersonaVersion
PersonaProfile
PersonaEvaluation
PersonaRestriction
PersonaAssignment
```

## 11.3 Persona States

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

## 11.4 Primary Actions

```text
Create Persona
Clone Persona
Edit Persona
Activate Persona
Suspend Persona
Restrict Persona
Put Persona on Probation
Retire Persona
Archive Persona
Assign Role
Assign Capital Pool
Assign Strategies
Run Evaluation
Compare Versions
Rollback Version
```

## 11.5 Management Fields

```text
Name
Role
Trading Style
Research Style
Risk Appetite
Allowed Markets
Forbidden Markets
Decision Style
Communication Style
Autonomy Level
Owner
Status
Version
```

## 11.6 UI Surfaces Required

```text
Persona Registry
Persona Detail
Persona Version Manager
Persona Activation Panel
Persona Restriction Panel
Persona Evaluation Dashboard
Persona Activity Monitor
Audit Timeline
```

---

# 12. 流程 H：Persona Route Policy / 權限管理

## 12.1 目的

管理每個 persona 可以使用哪些工具、MCP、Skill、workflow template，以及可以操作哪些 lifecycle state。

## 12.2 Managed Objects

```text
RoutePolicy
ToolPermission
MCPPermission
SkillPermission
WorkflowTemplatePermission
ConsultRule
RateLimitRule
ApprovalRule
```

## 12.3 RoutePolicy States

```text
draft
active
pending_review
deprecated
rolled_back
```

## 12.4 Primary Actions

```text
Create Route Policy
Clone Policy
Edit Policy
Grant Tool
Revoke Tool
Grant MCP Tool
Revoke MCP Tool
Grant Skill
Revoke Skill
Set Approval Requirement
Set Rate Limit
Set Strategy State Scope
Set Environment Scope
Submit Policy Review
Activate Policy
Rollback Policy
```

## 12.5 Permission Dimensions

```text
Persona
Tool / MCP / Skill
Environment: research / paper / live
Strategy State Scope
Side Effect Level
Rate Limit
Approval Requirement
Secret Scope
Audit Level
```

## 12.6 UI Surfaces Required

```text
Route Policy Editor
Persona Permission Matrix
Tool Permission Matrix
MCP Permission Matrix
Skill Permission Matrix
Consult Rule Manager
Policy Version Diff
Policy Approval Flow
```

---

# 13. 流程 I：Persona Memory / Training / Evaluation 治理

## 13.1 目的

雖然 AI 訓練日常主要在 Agora Workbench，但 Management Console 必須能治理 persona memory、training update、evaluation、版本發佈。

## 13.2 Managed Objects

```text
MemoryItem
TrainingExample
TrainerFeedback
PersonaEvaluation
PersonaVersion
BehaviorRule
```

## 13.3 Memory States

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

## 13.4 Training Update States

```text
draft
submitted
under_review
approved
published
rejected
rolled_back
```

## 13.5 Primary Actions

```text
Approve Memory
Reject Memory
Edit Memory
Merge Memory
Delete Memory
Move to Shared
Move to Private
Mark Sensitive
Mark Do-Not-Remember
Run Evaluation
Approve Persona Update
Publish Persona Version
Rollback Persona Version
```

## 13.6 UI Surfaces Required

```text
Persona Memory Governance
Training Update Review
Evaluation Result Viewer
Persona Version Publication Panel
Memory Conflict Resolver
```

---

# 14. 流程 J：Capital Pool / Risk Budget 管理

## 14.1 目的

管理資金池 mandate、risk budget、人格 / 策略綁定、allocation cap、freeze / unfreeze。

## 14.2 Managed Objects

```text
CapitalPool
RiskBudget
CapitalMandate
PersonaCapitalBinding
StrategyCapitalBinding
AllocationLimit
CapitalOverride
```

## 14.3 CapitalPool States

```text
draft
active
frozen
rebalancing
restricted
retired
```

## 14.4 Primary Actions

```text
Create Capital Pool
Edit Mandate
Set Risk Budget
Set Drawdown Limit
Set Allocation Cap
Bind Persona
Unbind Persona
Bind Strategy
Unbind Strategy
Freeze Pool
Unfreeze Pool
Run Rebalance
Approve Rebalance
Rollback Rebalance
Retire Pool
```

## 14.5 Mandate Fields

```text
Pool Name
Mandate
Allowed Markets
Allowed Strategy Types
Allowed Personas
Allowed Risk Profile
Max Allocation
Min Cash Reserve
Max Drawdown
Max Concentration
Leverage Policy
Deploy Mode
```

## 14.6 UI Surfaces Required

```text
Capital Pool Registry
Capital Pool Detail
Risk Budget Editor
Persona-Capital Binding Matrix
Strategy-Capital Binding Matrix
Allocation Limit Manager
Capital Freeze / Unfreeze Panel
```

---

# 15. 流程 K：Performance Ranking / Formula 管理

## 15.1 目的

管理投資績效排序、排序公式、分數拆解、公式 backtest、ranking publication。

## 15.2 Ranking Scopes

```text
Persona Ranking
Strategy Ranking
Alpha Family Ranking
Capital Pool Ranking
Paper Strategy Ranking
Live Strategy Ranking
Research Productivity Ranking
Risk-Adjusted Ranking
```

## 15.3 Formula States

```text
draft
testing
approved
active
deprecated
retired
```

## 15.4 Ranking States

```text
draft
calculated
under_review
approved
published
frozen
superseded
```

## 15.5 Primary Actions

```text
Create Formula
Clone Formula
Edit Formula
Set Metrics
Set Weights
Set Penalties
Set Normalization Method
Set Caps / Floors
Set Outlier Handling
Backtest Formula on Past Quarters
Compare Formula Versions
Submit Formula Review
Approve Formula
Activate Formula
Rollback Formula
Retire Formula
Calculate Ranking
Freeze Ranking
Publish Ranking
Apply Manual Override
```

## 15.6 Metric Library

```text
quarterly_return
annualized_return
sharpe
sortino
calmar
max_drawdown
volatility
turnover
hit_rate
profit_factor
tail_risk
slippage
capacity
stability
live_paper_gap
risk_violation_count
drawdown_recovery_days
research_productivity
experiment_success_rate
human_override_penalty
policy_violation_penalty
```

## 15.7 UI Surfaces Required

```text
Performance Ranking Dashboard
Formula Studio
Metric Library
Formula Backtest
Formula Compare
Score Breakdown Viewer
Ranking Publication Manager
Ranking Override Manager
```

---

# 16. 流程 L：Quarterly Rebalance / 資金重分配管理

## 16.1 目的

每季依據投資績效與 ranking formula，重新排序並調整資金池分配。

## 16.2 Managed Objects

```text
QuarterlyRebalance
MetricFreeze
RankingResult
AllocationSimulation
AllocationOverride
RebalanceApproval
RebalanceReport
```

## 16.3 Rebalance States

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

## 16.4 Full Workflow

```text
1. Select Quarter
2. Select Capital Pool
3. Freeze Performance Metrics
4. Select Ranking Formula Version
5. Calculate Persona / Strategy Ranking
6. Generate Recommended Allocation
7. Run Allocation Simulation
8. Check Risk Constraints
9. Apply Manual Overrides
10. Generate Rebalance Proposal
11. Risk Officer Review
12. Investment Committee Approval
13. Schedule Effective Date
14. Apply Rebalance
15. Monitor Post-Rebalance
16. Rollback if needed
```

## 16.5 Primary Actions

```text
Create Rebalance Event
Freeze Metrics
Unfreeze Metrics
Calculate Ranking
Select Formula
Run Simulation
Apply Override
Submit Approval
Approve Rebalance
Reject Rebalance
Schedule Rebalance
Apply Rebalance
Rollback Rebalance
Publish Report
```

## 16.6 UI Surfaces Required

```text
Quarterly Rebalance Console
Metric Freeze Manager
Ranking Result Viewer
Allocation Simulation
Constraint Checker
Override Manager
Rebalance Approval Flow
Rebalance History
```

---

# 17. 流程 M：Evolution Steering / 演化方向管理

## 17.1 目的

管理 Alpha 演化方向、fitness formula、mutation rules、constraints、evolution run 與 candidate promotion。

## 17.2 Managed Objects

```text
EvolutionProgram
EvolutionDirection
FitnessFormula
MutationRule
EvolutionRun
CandidateStrategy
CandidatePromotion
```

## 17.3 EvolutionProgram States

```text
draft
active
paused
completed
under_review
retired
```

## 17.4 Primary Actions

```text
Create Evolution Program
Edit Objective
Set Fitness Formula
Set Mutation Operators
Set Hard Constraints
Set Soft Penalties
Set Exploration Budget
Assign Persona
Assign Alpha Family
Start Evolution Run
Pause Run
Stop Run
Inspect Candidate
Reject Candidate
Promote Candidate to Strategy
Submit Candidate Review
Retire Program
```

## 17.5 Fitness Formula Example

```text
fitness =
  0.25 * z(OOS_sharpe)
+ 0.20 * z(stability)
+ 0.15 * z(capacity)
+ 0.15 * z(novelty)
- 0.15 * z(max_drawdown)
- 0.05 * z(turnover)
- 0.05 * z(correlation_with_existing_live)
```

## 17.6 UI Surfaces Required

```text
Evolution Program Registry
Evolution Direction Editor
Fitness Formula Studio
Mutation Rule Manager
Evolution Run Monitor
Candidate Strategy Browser
Candidate Promotion Panel
```

---

# 18. 流程 N：Tool / MCP / Skill / Capability 管理

## 18.1 目的

管理所有 persona 可用的工具、MCP server/tool、skills、workflow templates、hooks / cron。

## 18.2 Managed Objects

```text
Tool
ToolSchema
MCPServer
MCPTool
MCPPermission
Skill
SkillVersion
SkillSandboxRun
WorkflowTemplate
Hook
CronJob
CapabilityPolicy
```

## 18.3 Tool States

```text
draft
testing
active
restricted
deprecated
blocked
retired
```

## 18.4 MCPServer States

```text
draft
connected
healthy
degraded
disabled
retired
```

## 18.5 Skill States

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

## 18.6 Primary Tool Actions

```text
Register Tool
Edit Tool Schema
Classify Risk
Set Side Effect Level
Set Allowed Personas
Set Allowed Environments
Set Approval Rule
Set Rate Limit
Run Tool Test
Disable Tool
Retire Tool
View Tool Calls
```

## 18.7 Primary MCP Actions

```text
Add MCP Server
Edit Connection
Rotate Credentials
Test Connection
Discover Tools
Import Schemas
Set Tool Permissions
Set Persona Permissions
Set Secret Scope
Set Rate Limit
Disable Server
Delete Server
View MCP Calls
```

## 18.8 Primary Skill Actions

```text
Create Skill
Import Skill
Generate Skill Draft
Edit Skill
Run Sandbox Test
Run Security Scan
Classify Risk
Approve Skill
Assign Skill to Persona
Revoke Skill from Persona
Deprecate Skill
Rollback Skill Version
Retire Skill
```

## 18.9 Required UI Surfaces

```text
Tool Registry
Tool Schema Manager
Tool Risk Classifier
Tool Permission Matrix
MCP Server Registry
MCP Tool Explorer
MCP Schema Viewer
MCP Permission Matrix
MCP Secret Manager
MCP Call Audit
Skill Registry
Skill Draft Manager
Skill Sandbox Runner
Skill Risk Classifier
Skill Permission Matrix
Skill Version Manager
Skill Audit
Workflow Template Manager
Hook / Cron Manager
```

---

# 19. 流程 O：Knowledge / Artifact / Lineage 管理

## 19.1 目的

管理 insight、research notes、artifacts、committee memo、postmortem 與完整 lineage。

## 19.2 Managed Objects

```text
Insight
ResearchNote
Artifact
CommitteeMemo
Postmortem
LineageEdge
KnowledgeItem
```

## 19.3 Insight States

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

## 19.4 Primary Actions

```text
Create Insight
Classify Insight
Set Priority
Assign Persona
Link Strategy
Convert to Strategy
Convert to Research Task
Convert to Training Example
Attach to Review
Dismiss
Archive
```

## 19.5 Lineage Requirements

Lineage graph 必須能顯示：

```text
Insight → Strategy → Spec → Experiment → Artifact → Review → Promotion → Deployment → Telemetry → Incident → Postmortem → Evolution Constraint
```

## 19.6 UI Surfaces Required

```text
Knowledge Inbox
Insight Triage
Artifact Store
Artifact Detail
Research Notes
Committee Memo Viewer
Postmortem Library
Lineage Explorer
```

---

# 20. 流程 P：Jobs / Events / Audit 管理

## 20.1 目的

集中追蹤所有長任務、事件流與審計紀錄。

## 20.2 Job Types

```text
backtest
OOS
stress_test
artifact_build
validator_run
formula_recalculation
quarterly_rebalance_simulation
evolution_run
MCP_discovery
skill_sandbox
persona_evaluation
deployment
rollback
memory_evaluation
postmortem_generation
```

## 20.3 Job States

```text
queued
running
waiting_for_approval
completed
failed
cancelled
retrying
```

## 20.4 Primary Actions

```text
Create Job
View Progress
View Logs
Cancel Job
Retry Job
Clone Job
Attach Result
Archive Job
Create Incident from Job Failure
```

## 20.5 Event Types

```text
job.started
job.progress
job.completed
job.failed
strategy.state_changed
persona.policy_changed
deployment.started
deployment.failed
risk.alert_created
incident.updated
tool.call_completed
mcp.call_failed
skill.sandbox_completed
rebalance.applied
```

## 20.6 UI Surfaces Required

```text
Job Queue
Job Detail Drawer
Job Logs
System Event Stream
Audit Explorer
Entity Audit Timeline
Approval History
```

---

# 21. 流程與 UI 模組映射

| 管理流程 | 主要 UI 模組 |
|---|---|
| Command Center 管理閉環 | Command Center |
| Strategy lifecycle | Strategy & Alpha Management |
| Spec / Artifact | Strategy Detail, Artifact Store |
| Research / Experiment | Research & Experiments |
| Governance / Approval | Governance & Approvals |
| Deployment / Risk / Incident | Deployment, Runtime & Risk |
| Persona lifecycle | Persona Directorate |
| Route Policy / Permissions | Persona Directorate, Tools/MCP/Skills |
| Memory / Training Governance | Persona Directorate, Knowledge |
| Capital Pool | Capital & Allocation |
| Ranking Formula | Performance Ranking |
| Quarterly Rebalance | Quarterly Rebalance |
| Evolution Steering | Evolution Steering |
| Tool / MCP / Skill | Tools, MCP & Skills |
| Knowledge / Lineage | Knowledge, Artifacts & Lineage |
| Jobs / Audit | Jobs, Events & Audit |

---

# 22. Lovable Part 2 Acceptance Criteria

Lovable 後續 UI 規格與實作必須能支援：

```text
1. 每個核心物件都有 status。
2. 每個核心物件 detail 都能 render availableActions。
3. 高風險 action 會顯示 confirmation modal。
4. 長任務會建立 job 並可追蹤 progress/logs。
5. alert 可 acknowledge / assign / escalate / incident。
6. incident 可連到 strategy / runtime / capital pool / postmortem。
7. strategy lifecycle 完整支援 discovered → retired。
8. persona lifecycle 完整支援 draft → active → restricted / retired。
9. route policy 可管理 tool / MCP / skill / workflow template。
10. capital pool 可管理 mandate / risk budget / binding / freeze。
11. ranking formula 可建立、測試、比較、啟用、回滾。
12. quarterly rebalance 可 freeze metrics、calculate ranking、simulate allocation、approval、apply、rollback。
13. evolution program 可管理 direction、fitness formula、mutation rules、runs、candidate promotion。
14. MCP / Skill 管理必須有 sandbox / permission / approval / audit。
15. 所有重要操作都有 audit trail。
16. Agora incoming items 可被 Management Console 正式處理。
```

---

# 23. 下一份文件

下一份：

```text
Part 3 — Pantheon Management Console 頁面與功能設計
```

Part 3 會根據本文件的流程，開始定義每個 Management Console 頁面：

```text
Route
Primary Users
Goal
Layout
Tables
Cards
Tabs
Actions
Filters
Drawers
BFF APIs
Realtime Events
Empty / Loading / Error states
Permission rules
```
