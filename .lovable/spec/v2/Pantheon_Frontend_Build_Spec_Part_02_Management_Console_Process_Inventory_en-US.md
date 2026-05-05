# Pantheon Frontend Build Spec
## Part 2 — Pantheon Management Console Complete Management Process Inventory

**Document Language: English (en-US)**  
**Target Readers: Lovable, frontend engineers, BFF engineers, product designers, Pantheon system designers**

---

## 0. Purpose of This Document

Part 1 defined the Pantheon frontend platform as two distinct applications:

```text
Pantheon Management Console
Pantheon Agora Workbench
```

This document focuses only on the **Pantheon Management Console**.  
The goal is not page design yet. The goal is to inventory every management process the console must support.

This prevents Lovable from building a UI that only displays status. The Management Console must be a real control plane for management, monitoring, reaction, approvals, deployment, rollback, and audit.

---

## 1. Core Definition of the Management Console

The Pantheon Management Console is the formal control plane used by management, risk, research leads, capital allocators, and system operators.

It must cover:

```text
Strategy management
Persona management
Capital pool management
Performance ranking formula management
Quarterly rebalance management
Alpha evolution direction management
Research / experiment management
Tool / MCP / skill management
Approval management
Paper / live deployment management
Runtime / job / experiment / tool call monitoring
Alert / incident response
Rollback / pause / retire operations
Audit for all high-risk actions
```

It is not:

```text
Not only a status dashboard
Not only a strategy list
Not an AI dashboard
Not only a trading monitor
Not only a settings backend
```

It is:

```text
Pantheon's management and execution control plane
Management + Operations + Governance + Audit in one console
```

---

## 2. Process Inventory Method

Every process must be defined using the same structure:

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

Lovable should derive UI from these processes, not the other way around.

---

## 3. Management User Roles

### 3.1 Admin

Owns system configuration, roles, permissions, tools, MCP, skills, BFF and integration settings.

### 3.2 Research Lead

Owns strategy research, Alpha lifecycle, experiments, strategy reviews, and persona assignment.

### 3.3 Risk Officer

Owns risk controls, risk budgets, paper/live promotion, incidents, rollback, and capital pool risk limits.

### 3.4 Capital Manager

Owns capital pools, performance ranking, quarterly rebalance, allocation overrides, and capital mandates.

### 3.5 Strategy Manager

Owns one or more Alpha / Strategy objects, artifacts, deployments, retirement, and replacement.

### 3.6 System Operator

Owns runtime health, jobs, deployments, MCP server health, incident response, and rollback operations.

### 3.7 Reviewer / Committee Member

Reviews strategy, promotion, rebalance, formulas, persona policies, skill approvals, and MCP approvals.

### 3.8 Capability Admin

Owns tools, MCP, skills, workflow templates, hooks, and cron registration, testing, permissioning, and deprecation.

---

## 4. Global Management Rules

All Management Console objects must follow these rules.

### 4.1 Every Object Must Have a State

Examples:

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

The frontend must not infer actions only from data presence. It should use the object state and the `availableActions` returned by the BFF.

---

### 4.2 BFF Must Return availableActions

Every detail API should return the actions available to the current user.

Example:

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

The frontend should render actions based on the BFF response instead of hardcoding all business rules locally.

---

### 4.3 All High-Risk Actions Require Confirmation

High-risk actions include:

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

The confirmation modal must show:

```text
Operation name
Target object
Current state
Target state
Affected strategies
Affected personas
Affected capital pools
Affected runtimes
Risk level
Approval requirement
Rollback option
Audit memo input
Confirm action
```

---

### 4.4 All Long-Running Tasks Must Be Job-Based

Any operation expected to take more than two seconds must not block the UI.

Jobs must be created for:

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

The frontend must provide:

```text
Job Drawer
Job Progress
Job Logs
Cancel / Retry
Output artifacts
Realtime update
```

---

### 4.5 All Important Operations Must Be Audited

Audit events should contain at least:

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

### 4.6 Alerts and Incidents Must Be Actionable

Alerts are not passive notifications. Each alert must support:

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

### 4.7 Agora Incoming Items Must Enter the Management Console

Outputs from the Agora Workbench must not disappear into chat history. They should enter the Management Console incoming queue.

Agora can generate:

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

The Management Console must support:

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

# 5. Process A: Command Center Management Loop

## 5.1 Purpose

The Command Center is the Management Console entry point. It helps managers understand:

```text
What is happening now
What needs attention
What risks require response
Which approvals are blocked
Which jobs / experiments / runtimes are failing
Which Agora incoming items need formal handling
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

The Command Center must display:

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

# 6. Process B: Strategy / Alpha Lifecycle Management

## 6.1 Purpose

Manage Alpha trading strategies from idea to retirement.

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

A strategy idea exists but does not yet have a complete spec.

Management actions:

```text
Edit thesis
Assign owner persona
Set priority
Attach insight / note / paper
Reject idea
Scaffold strategy
```

### scaffolded

Initial spec, data, and template exist.

Management actions:

```text
Edit spec
Select data source
Set parameters
Select experiment engine
Run backtest
Run OOS
```

### replicated

Reproducible experiment results exist.

Management actions:

```text
Attach evidence
Compare experiments
Invalidate weak result
Submit review
Request more experiments
```

### approved

Approved for paper deployment.

Management actions:

```text
Assign approved artifact
Bind capital pool for paper
Create paper promotion request
```

### paper

Running in paper runtime / simulated capital environment.

Management actions:

```text
Monitor paper performance
Pause paper
Request live promotion
Extend paper period
Retire paper strategy
```

### live

Running live.

Management actions:

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

Paper or live performance has degraded and requires investigation.

Management actions:

```text
Open incident
Ask persona analysis
Reduce allocation
Rollback
Create postmortem
Add evolution constraint
```

### retired

Strategy is no longer deployed but remains available for history.

Management actions:

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

Every state transition must be audited.

Required fields:

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

# 7. Process C: Strategy Spec / Artifact Management

## 7.1 Purpose

Ensure that strategy specs, parameters, artifacts, and rollback targets are versioned and auditable.

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

The BFF must provide:

```text
current active spec
spec version history
artifact version list
artifact approval state
rollback eligibility
availableActions
```

---

# 8. Process D: Research / Experiment Management

## 8.1 Purpose

Manage backtests, OOS tests, stress tests, parameter sweeps, RL training, and other research experiments.

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

Every experiment run must create a job.

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

# 9. Process E: Governance / Approval Management

## 9.1 Purpose

Manage all high-risk changes affecting strategies, personas, capital, tools, and deployments.

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

# 10. Process F: Deployment / Runtime / Risk / Incident / Rollback Management

## 10.1 Purpose

Connect paper/live deployment, runtime, risk alerts, incidents, and rollback into one response flow.

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

These must require confirmation and audit, usually also approval:

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

# 11. Process G: Persona Lifecycle Management

## 11.1 Purpose

Manage AI Personas from creation to activation, restriction, suspension, retirement, versioning, and evaluation.

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

# 12. Process H: Persona Route Policy / Permission Management

## 12.1 Purpose

Manage which tools, MCP tools, skills, workflow templates, and lifecycle state operations each persona can access.

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

# 13. Process I: Persona Memory / Training / Evaluation Governance

## 13.1 Purpose

Daily AI training work mostly happens in the Agora Workbench, but the Management Console must govern persona memory, training updates, evaluations, and version publishing.

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

# 14. Process J: Capital Pool / Risk Budget Management

## 14.1 Purpose

Manage capital pool mandates, risk budgets, persona/strategy bindings, allocation caps, and freeze/unfreeze operations.

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

# 15. Process K: Performance Ranking / Formula Management

## 15.1 Purpose

Manage investment performance rankings, ranking formulas, score breakdowns, formula backtests, and ranking publications.

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

# 16. Process L: Quarterly Rebalance / Capital Reallocation Management

## 16.1 Purpose

Re-rank and adjust capital pool allocations every quarter based on investment performance and ranking formulas.

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

# 17. Process M: Evolution Steering / Direction Management

## 17.1 Purpose

Manage Alpha evolution direction, fitness formulas, mutation rules, constraints, evolution runs, and candidate promotion.

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

# 18. Process N: Tool / MCP / Skill / Capability Management

## 18.1 Purpose

Manage all tools, MCP servers/tools, skills, workflow templates, hooks, and cron jobs available to personas.

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

# 19. Process O: Knowledge / Artifact / Lineage Management

## 19.1 Purpose

Manage insights, research notes, artifacts, committee memos, postmortems, and full lineage.

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

The lineage graph must show:

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

# 20. Process P: Jobs / Events / Audit Management

## 20.1 Purpose

Track all long-running tasks, event streams, and audit records in one place.

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

# 21. Process to UI Module Mapping

| Process | Primary UI Module |
|---|---|
| Command Center management loop | Command Center |
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

Future UI specs and implementation must support:

```text
1. Every core object has a status.
2. Every core object detail can render availableActions.
3. High-risk actions show a confirmation modal.
4. Long-running operations create jobs and expose progress/logs.
5. Alerts can be acknowledged / assigned / escalated / converted to incidents.
6. Incidents can link to strategy / runtime / capital pool / postmortem.
7. Strategy lifecycle supports discovered → retired.
8. Persona lifecycle supports draft → active → restricted / retired.
9. Route policy can manage tool / MCP / skill / workflow template permissions.
10. Capital pools can manage mandate / risk budget / binding / freeze.
11. Ranking formulas can be created, tested, compared, activated, and rolled back.
12. Quarterly rebalance supports metric freeze, ranking calculation, allocation simulation, approval, apply, and rollback.
13. Evolution programs can manage direction, fitness formula, mutation rules, runs, and candidate promotion.
14. MCP / Skill management includes sandbox / permission / approval / audit.
15. All important operations have audit trails.
16. Agora incoming items can be formally processed by the Management Console.
```

---

# 23. Next Document

Next:

```text
Part 3 — Pantheon Management Console Page and Feature Design
```

Part 3 will use the processes in this document to define each Management Console page:

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
