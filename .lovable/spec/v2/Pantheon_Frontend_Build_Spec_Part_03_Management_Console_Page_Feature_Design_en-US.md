# Pantheon Frontend Build Spec  
## Part 3 — Pantheon Management Console Page & Feature Design  
**Locale:** en-US  
**Document Type:** Lovable Frontend Build Specification  
**Scope:** Pantheon Management Console only  
**Related Docs:**  
- Part 1 — Master Blueprint  
- Part 2 — Management Console Process Inventory  

---

# 0. Purpose of This Document

This document converts the Management Console processes defined in Part 2 into page-level frontend specifications that Lovable can start building.

Pantheon Management Console is not a simple dashboard. It is the official control plane for Pantheon. It manages:

```text
strategy management
persona management
capital pool management
performance ranking formulas
quarterly rebalancing
evolution direction
research / experiment management
tool / MCP / skill management
approvals
deployment
runtime monitoring
risk and incident response
rollback / pause / retire actions
audit
```

These functions are used by the same management and operations audience.  
Therefore, this document specifies:

```text
Pantheon Management Console
= Management + Operations + Governance + Observability
```

---

# 1. Lovable Build Principles

## 1.1 Build One Unified Management Console

Lovable should not split Core and Operations into two separate apps.  
Implement one complete Management Console under the `/management` route group.

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

## 1.2 Each Page Must Show Both Management and Runtime State

For example, Strategy Detail is not only a strategy specification page. It must also show:

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

## 1.3 Object-First, Not Chat-First

Management Console is not a chat UI.  
The primary UI should be based on entities, tables, tabs, drawers, timelines, state badges, and approval panels.

## 1.4 High-Risk Actions Must Require Confirmation and Approval Awareness

High-risk actions include:

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

These actions must show:

```text
risk impact
affected object
required approval
audit memo
confirmation modal
```

## 1.5 Build with a Mock BFF First

Lovable does not need a real Pantheon backend in the first build.  
Create a mock BFF client and use mock data for all pages and actions.

---

# 2. Shared Management Console Layout

## 2.1 App Shell

All Management pages use the same shell:

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

## 2.2 Sidebar Groups

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

## 2.3 Required Top Bar Items

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

# 3. Global Shared Components

Lovable should create the following reusable components.

## 3.1 EntityHeader

Purpose: Header area for all detail pages.

Suggested props:

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

Displays:

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

Supported types:

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

All tables must support:

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

Supported inspectors:

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

Drawer contents:

```text
summary
status
linked entities
available actions
recent events
audit snippets
```

## 3.6 ActionButton / PermissionAwareButton

Buttons must be rendered from BFF-provided `availableActions`.

States:

```text
enabled
disabled with reason
requires approval
high risk
hidden if role cannot see
```

## 3.7 ConfirmationModal

Required for high-risk actions.

Fields:

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

Used for all long-running jobs:

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

Displays:

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

Used for strategy, artifact, experiment, and deployment lineage.

Nodes:

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

# 4. Page Spec Format

Each page uses the following structure:

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

The Management Console home page. It provides a unified view of:

```text
strategy lifecycle bottlenecks
pending approvals
execution status
risk and incidents
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

If there are no pending actions:

```text
There are no management actions pending.
```

If there are no alerts:

```text
There are no open risk alerts.
```

## Error State

```text
Unable to load management overview. Please check BFF connection status.
```

## Acceptance Criteria

```text
Users can see all pending management work on the home page.
Users can directly open approval, incident, job, strategy, and persona objects.
Agora incoming items must appear in Management Console, not only in Agora.
All metric cards are clickable and route to their relevant list pages.
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

Manage all alpha strategies and track their lifecycle, performance, capital, paper/live, alert, and incident status.

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
The strategy list can be filtered by lifecycle state, persona, capital pool, and risk level.
Each row must display available actions.
High-risk actions must open a confirmation modal.
Lifecycle board must group strategies by state.
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

Manage one strategy's full lifecycle, specification, experiments, paper/live status, risk, incidents, artifacts, governance, and audit history.

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

Displays:

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

Functions:

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

Displays:

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

Displays:

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

Displays:

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

Shows incidents linked to the strategy.

Actions:

```text
Open incident
Create postmortem
Link to evolution constraint
Link to training feedback
```

## Tab — Artifacts

Displays:

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

Displays:

```text
Linked evolution program
Candidate children
Mutation history
Fitness score changes
```

## Tab — Governance

Displays:

```text
Review requests
Approval history
Validator results
Committee memos
Promotion requests
```

## Tab — Lineage

Use LineageGraph.

## Tab — Audit

Use AuditTimeline.

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
Strategy Detail can manage spec, experiments, paper/live state, risk, incidents, artifacts, and governance from one page.
High-risk actions must not execute directly; they must open a confirmation modal.
Running jobs must update in real time.
Alerts and incidents can be handled directly from the strategy page.
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

Manage AI personas, their lifecycle, role, policy, tool/MCP/skill permissions, capital binding, strategy ownership, activity, training, and evaluation status.

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
The persona list must show both management state and runtime activity.
Policy violations must be visually prominent.
Users can navigate directly to persona detail from each row.
```

---

# 9. Page — Persona Detail

## Route

```text
/management/personas/:personaId
```

## Goal

Manage a single persona's identity, permissions, tools, capital, performance, activity, memory, training, evaluations, and audit trail.

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

Displays permission matrix:

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

Displays three matrices:

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

Displays:

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

Displays:

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
Persona Detail must manage identity, policy, capital, strategy ownership, activity, memory, and training.
Route Policy and Tools/MCP/Skills permissions must be clearly visible.
Policy changes must be able to enter an approval flow.
```

---

# 10. Page — Capital Pool List

## Route

```text
/management/capital
```

## Goal

Manage capital pools, risk budgets, persona/strategy binding, current exposure, and rebalance state.

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
Capital Pool Detail must show both configuration and live status.
Current Exposure must include persona exposure, strategy exposure, and risk usage.
Rebalance history must be traceable.
```

---

# 12. Page — Performance Ranking

## Route

```text
/management/ranking
```

## Goal

Manage performance ranking for personas, strategies, alpha families, and capital pools.

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

Manage performance ranking formulas and allocation formulas.

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
Formula Studio must support weights, penalties, normalization, caps, and floors.
It must support formula version comparison.
Activating a formula must be treated as a high-risk action or approval-gated operation.
```

---

# 14. Page — Quarterly Rebalance

## Route

```text
/management/rebalance
/management/rebalance/:rebalanceId
```

## Goal

Manage quarterly performance-based ranking and capital pool reallocation.

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
Quarterly Rebalance must be a workflow UI.
It must show ranking results, allocation simulation, constraint warnings, and manual overrides.
Applying a rebalance must be a high-risk action.
```

---

# 15. Page — Evolution Steering

## Route

```text
/management/evolution
/management/evolution/:programId
```

## Goal

Manage alpha evolution direction, fitness formulas, mutation rules, runs, and candidate promotion.

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
Evolution Program must manage direction, not only show results.
Candidates can be converted into scaffolded strategy proposals.
Fitness formula changes must be approval-capable.
```

---

# 16. Page — Research & Experiments

## Route

```text
/management/experiments
/management/experiments/:experimentId
```

## Goal

Manage experiments and track long-running experiment jobs.

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

Manage approvals for all high-risk actions.

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
Approval detail must show before/after, risk, evidence, and validator results.
All decisions must require a memo.
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

Displays:

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

Displays:

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
Incident must link back to strategy, runtime, capital pool, training feedback, and evolution constraints.
High-severity incidents must require a postmortem before closing.
```

---

# 20. Page — Tools Management

## Route

```text
/management/tools
```

## Goal

Manage generic tools and persona tool permissions.

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

Manage MCP servers, MCP tools, schemas, secrets, permissions, and calls.

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
MCP tools must be assignable to personas through a permission matrix.
Sensitive MCP permission changes must go through approval.
```

---

# 22. Page — Skill Management

## Route

```text
/management/skills
/management/skills/:skillId
```

## Goal

Manage skill registry, drafts, sandbox tests, approvals, versions, and persona permissions.

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
A skill cannot move directly from draft to active.
It must go through sandbox, scan, and approval.
Skill permissions must be manageable per persona.
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

Supports entity filter:

```text
strategy
artifact
experiment
deployment
incident
persona
```

Displays graph:

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

Any entity detail page can embed AuditTimeline.

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

Each empty state should include an appropriate CTA:

```text
Create Strategy
Add MCP Server
Create Skill Draft
Open Agora Insight Inbox
```

## Loading State

Use skeleton loading states, not blank pages.

## Error State

Display:

```text
Error title
Short explanation
Retry button
BFF status
Optional diagnostics drawer
```

---

# 28. Management Console Acceptance Criteria

After Lovable implements Part 3, the build should satisfy:

```text
Management Console sidebar structure is complete.
Command Center shows both management and execution status.
Strategy list/detail can manage lifecycle and runtime state.
Persona list/detail can manage role, policy, tools, MCP, skills, capital, and activity.
Capital / Ranking / Rebalance pages can manage formulas, rankings, and rebalance workflow.
Evolution pages can manage direction, fitness formulas, runs, and candidates.
Experiment pages can track jobs and metrics.
Governance pages can handle approvals.
Deployment / Runtime / Risk pages can track and respond to execution state.
Tools / MCP / Skills pages can manage permissions and approvals.
Artifacts / Lineage pages can track full lineage.
Jobs / Audit pages can trace all operations.
All high-risk actions have confirmation modals.
All pages support zh-TW / en-US translation keys.
All actions use the mock BFF client first.
