# Pantheon Frontend Build Spec — Part 7
# Component System + State Machines

Document version: v1.0  
Locale: en-US  
Audience: Lovable frontend build, Pantheon frontend engineering, BFF alignment  
Related documents: Parts 1–6

---

## 0. Purpose

Part 7 defines the shared component system and state machines for the Pantheon frontend. Lovable should use this document as the foundation for building the UI component library, state labels, workflow steppers, permission-aware actions, high-risk confirmations, realtime job displays, and audit-aware user interactions.

This is not a pure visual style guide. It is an implementation-ready frontend component and workflow specification.

Pantheon frontend must achieve the following:

```text
1. Both frontend products share the same platform shell and design primitives.
2. Management Console uses object-first, state-first, action-first UI.
3. Agora Workbench uses analyst/trader workflow-first UI.
4. High-risk operations are controlled by state machines and availableActions.
5. Long-running tasks are represented as Jobs.
6. All statuses, buttons, headers, prompts, and modals support zh-TW and en-US.
7. The frontend does not infer business rules locally; the BFF returns state, riskLevel, permissions, and availableActions.
```

---

## 1. Component Design Principles

### 1.1 Shared Principles

All components must follow these principles:

```text
- i18n-first: use translation keys; do not hardcode Chinese or English labels.
- permission-aware: show, disable, or hide actions based on availableActions and permissions.
- risk-aware: high-risk actions must display risk labels and confirmation flows.
- state-driven: stable enum values are converted into localized labels.
- event-aware: components can respond to BFF realtime events and refresh locally.
- accessible: buttons, modals, drawers, tables, and forms must have readable labels.
- desktop-first: Pantheon is a management and trading research system, primarily designed for desktop workflows.
```

### 1.2 Management Console Component Style

Management Console should feel like:

```text
- High information density
- Clear state and risk visibility
- Tables + tabs + detail drawers
- Workflow steppers
- Approval panels
- Audit timelines
- Alert / incident / job visualization
```

### 1.3 Agora Workbench Component Style

Agora Workbench should feel like:

```text
- Daily analyst/trader workspace
- Notes and context cards
- Signal explanations
- AI persona collaboration
- Conversation canvas
- Decision journal
- Low-friction feedback and insight capture
```

---

## 2. Component System Overview

Lovable should build the following component layers.

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

Purpose: The outer layout for all pages.

Used by: Management Console and Agora Workbench.

Structure:

```text
PantheonAppShell
├── GlobalTopBar
├── ProductSideNav
├── MainContentArea
└── RightDrawerHost
```

Suggested props:

```ts
type PantheonAppShellProps = {
  product: 'management' | 'agora';
  locale: 'zh-TW' | 'en-US';
  user: UserSummary;
  navigationItems: NavItem[];
  children: React.ReactNode;
};
```

Requirements:

```text
- Supports /management and /agora route groups.
- Supports collapsed and expanded sidebar states.
- Supports opening the right-side drawer.
- GlobalTopBar must remain fixed.
- Supports locale switching.
```

---

### 3.2 `GlobalTopBar`

Purpose: Global state, product switching, search, and notifications.

Displayed items:

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

Acceptance requirements:

```text
- GlobalTopBar appears on every page.
- Product switcher can switch between Management and Agora.
- Text updates immediately when language changes.
- Degraded/offline status is visible when BFF is not healthy.
```

---

### 3.3 `ProductSwitcher`

Options:

```text
Management Console
Agora Workbench
```

Translation keys:

```text
i18n.product.management
i18n.product.agora
```

Behavior:

```text
- Switching from /management/* navigates to /agora/daily.
- Switching from /agora/* navigates to /management/command-center.
```

---

### 3.4 `LanguageSwitcher`

Supported locales:

```text
zh-TW
en-US
```

Requirements:

```text
- Displayed in GlobalTopBar.
- Writes selected locale to localStorage key: pantheon.locale.
- User profile locale from BFF takes priority when available.
- Navigation, buttons, statuses, modals, empty states, and error states must update.
```

---

### 3.5 `BFFStatusIndicator`

States:

```text
connected
degraded
offline
```

Displayed labels:

```text
Connected / 已連線
Degraded / 連線異常
Offline / 離線
```

Behavior:

```text
- Clicking opens a BFF health drawer.
- Shows recent API errors, event stream status, and last heartbeat.
```

---

## 4. Navigation Components

### 4.1 `ProductSideNav`

Purpose: Render different sidebars based on product.

Management Console nav groups:

```text
Command
Core Management
Research & Governance
Operations
Capabilities
System
```

Agora Workbench nav groups:

```text
Daily Work
Research
AI Collaboration
Training
Channels
```

Props:

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

Requirements:

```text
- Nav items without permissions may be hidden.
- Nav items with pending counts show badges.
- Current route is highlighted.
```

---

### 4.2 `BreadcrumbTrail`

Purpose: Show context on entity detail pages.

Examples:

```text
Management / Strategies / alpha_042
Agora / Signals / signal_9821
```

---

## 5. Entity Components

### 5.1 `EntityHeader`

Purpose: Standard header for all detail pages.

Applicable entities:

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

Displayed content:

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

Props:

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

Requirements:

```text
- Primary action is selected from the highest priority enabled availableAction.
- High-risk actions display a RiskBadge.
- Disabled actions show disabledReason.
```

---

### 5.2 `EntitySummaryCard`

Purpose: Used in lists, overview sections, and related entity areas.

Displayed content:

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

Purpose: Show related entities for the current object.

Example for Strategy:

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

Purpose: Display entity status.

Input:

```ts
type StatusBadgeProps = {
  domain: 'strategy' | 'persona' | 'experiment' | 'review' | 'deployment' | 'incident' | 'job' | 'skill' | 'mcp' | 'rebalance' | 'evolution' | 'memory' | 'agoraSession';
  status: string;
};
```

Requirements:

```text
- Do not display raw enum values.
- Use locale-specific translation keys.
- Use consistent color mapping.
```

---

### 6.2 `RiskBadge`

Risk levels:

```text
none
low
medium
high
critical
blocked
```

Displayed labels:

```text
zh-TW: 無 / 低 / 中 / 高 / 重大 / 已阻擋
en-US: None / Low / Medium / High / Critical / Blocked
```

---

### 6.3 `LifecycleStepper`

Purpose: Display the Strategy lifecycle.

States:

```text
discovered
scaffolded
replicated
approved
paper
live
retired
```

Requirements:

```text
- Current step is highlighted.
- Passed steps are marked completed.
- Blocked steps show a blocker icon.
- Clicking a step shows conditions and transition history.
```

---

### 6.4 `HealthIndicator`

Purpose: Display health states for runtime, BFF, MCP server, tool, and workers.

States:

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

Purpose: Common table for all list pages.

Requirements:

```text
- sorting
- filtering
- pagination
- row selection
- bulk actions
- column visibility
- optional saved views
- empty state
- loading skeleton
- error state
```

Props:

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

Purpose: Display key metrics.

Examples:

```text
Sharpe
Max Drawdown
Risk Budget Usage
Open Incidents
Running Jobs
Capital Allocation
Ranking Score
```

Props:

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

Purpose: Standard filters for list pages.

Supported filters:

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

Purpose: Standard layout for detail pages.

Structure:

```text
EntityHeader
SummaryStrip
Tabs
RightDrawer optional
```

---

## 8. Action / Permission Components

### 8.1 `PermissionAwareButton`

Purpose: Render executable, disabled, approval-required, or hidden actions based on BFF `availableActions`.

AvailableAction format:

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

Behavior:

```text
- hidden = true: do not render.
- enabled = false: render disabled and show disabled reason.
- requiresConfirmation = true: open ConfirmationModal.
- requiresApproval = true: show approval badge.
```

---

### 8.2 `ActionMenu`

Purpose: Secondary actions.

Requirements:

```text
- Separate dangerous actions visually.
- Show RiskBadge for high-risk actions.
- Disabled actions should not disappear unless hidden=true.
```

---

### 8.3 `HighRiskConfirmationModal`

Purpose: Confirm all high-risk operations.

Required fields:

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

Requirements:

```text
- Fully translated in zh-TW and en-US.
- Audit memo is required before confirmation.
- Critical operations may require a typed confirm phrase.
```

---

## 9. Workflow Components

### 9.1 `WorkflowStepper`

Purpose: Display rebalance, approval, deployment, skill approval, MCP approval, and other workflows.

Props:

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

Purpose: Show available transitions on detail pages.

Displayed content:

```text
Current state
Allowed next states
Blocked transitions
Required evidence
Required approval
```

---

### 9.3 `BlockerList`

Purpose: Show why a transition is blocked.

Examples:

```text
- OOS experiment missing
- Risk check failed
- Committee memo missing
- Capital pool not assigned
```

---

## 10. Governance Components

### 10.1 `ApprovalPanel`

Purpose: Detail view for Review / Promotion / Rebalance / Skill / MCP approvals.

Displayed content:

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

Validator states:

```text
passed
warning
failed
not_run
```

Supported validator types:

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

Purpose: Approval decisions and high-risk action audit memos.

Requirements:

```text
- Required for approve/reject/high-risk commands.
- Supports markdown.
- Displays linked evidence.
```

---

## 11. Operations Components

### 11.1 `JobDrawer`

Purpose: Show long-running task progress.

Displayed content:

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

Job states:

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

Displayed content:

```text
Severity
Alert type
Linked object
Summary
Created time
Status
Suggested actions
```

Alert states:

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

Purpose: Incident detail page.

Displayed content:

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

Displayed content:

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

Purpose: Realtime event stream.

Supported events:

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

Purpose: Persona × Tool / MCP / Skill permission matrix.

Columns:

```text
Capability
Persona A
Persona B
Persona C
Approval Mode
Scope
Rate Limit
```

Permission states:

```text
allowed
requires_approval
blocked
sandbox_only
```

---

### 12.2 `PolicyMatrix`

Purpose: Route Policy management.

Dimensions:

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

Purpose: Tool / MCP / Skill input/output schema.

Requirements:

```text
- Display JSON schema.
- Toggle between raw and friendly views.
- Show required fields.
```

---

### 12.4 `SkillSandboxPanel`

Purpose: Skill draft sandbox testing.

Displayed content:

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

Purpose: Edit performance ranking formulas and fitness formulas.

Features:

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

Requirements:

```text
- Supports no-code builder.
- Supports read-only formula expression preview.
- Any edit sets formula status to draft.
```

---

### 13.2 `ScoreBreakdownPanel`

Purpose: Explain ranking score or fitness score.

Displayed content:

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

Purpose: Quarterly rebalance simulation.

Displayed content:

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

Purpose: Display Strategy / Artifact / Experiment / Review / Deployment lineage.

Node types:

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

Requirements:

```text
- Nodes are clickable and open the Inspector.
- Supports filtering by persona, strategy, time, and status.
```

---

### 14.2 `AuditTimeline`

Purpose: Entity-level audit timeline.

Displayed content:

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

Purpose: Ask Personas, Committee Room, and Session detail.

Features:

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

Actions on each message:

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

These actions naturally capture useful workflow data.

---

### 15.3 `SignalReviewPanel`

Purpose: Strategy Signal Review.

Displayed content:

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

Features:

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

Fields:

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

Features:

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

Requirements:

```text
- Supports localized labels.
- Supports validation messages.
- Supports dirty state.
- Supports submit and cancel.
```

### 16.2 `MarkdownEditor`

Used for:

```text
Research notes
Decision memo
Postmortem
Committee memo
Strategy thesis
```

### 16.3 `JsonSchemaForm`

Used for:

```text
Tool schema
MCP schema
Experiment config
Skill test payload
```

---

# 17. State Machines

The following state machines are the UI foundation for Lovable. The frontend should not independently decide whether a transition is allowed; the BFF returns `availableActions`. However, the UI must display the correct steppers, badges, and workflow states.

---

## 17.1 Strategy Lifecycle State Machine

States:

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

Main transitions:

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

UI display:

```text
- LifecycleStepper displays discovered → scaffolded → replicated → approved → paper → live → retired.
- degraded and replaced are live-side branch states and should be shown with warning banners.
```

---

## 17.2 Persona Lifecycle State Machine

States:

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

Transitions:

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

UI notes:

```text
- restricted state must show a limitation banner in Tools/MCP/Skills tabs.
- probation state must show a capital cap warning in Capital Binding tab.
```

---

## 17.3 Capital Pool Lifecycle

States:

```text
draft
active
frozen
rebalancing
restricted
retired
```

Transitions:

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

States:

```text
draft
testing
approved
active
deprecated
retired
```

Transitions:

| From | To | Action |
|---|---|---|
| draft | testing | test_formula |
| testing | approved | submit_formula_review / approve |
| approved | active | activate_formula |
| active | deprecated | deprecate_formula |
| deprecated | retired | retire_formula |

UI notes:

```text
- Active formulas cannot be edited directly; users must clone a new draft.
- FormulaBuilder is read-only when formula status is active.
```

---

## 17.5 Quarterly Rebalance Workflow

States:

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

Flow:

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

Reversible / exception states:

```text
applied → rolled_back
any pre-applied state → cancelled
metrics_frozen → metrics_freezing if unfreeze requested
```

UI components:

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

States:

```text
draft
active
paused
under_review
completed
retired
```

Transitions:

| From | To | Action |
|---|---|---|
| draft | under_review | submit_evolution_review |
| under_review | active | approve_program |
| active | paused | pause_program |
| paused | active | resume_program |
| active | completed | complete_program |
| completed | retired | retire_program |

Evolution Run states:

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

States:

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

Transitions:

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

States:

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

Transitions:

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

UI components:

```text
ApprovalPanel
ValidatorResultList
DecisionMemoEditor
EvidencePackViewer
```

---

## 17.9 Deployment Workflow

States:

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

Transitions:

```text
draft → submitted → under_review → approved → scheduled → deploying → deployed
failed → rolled_back
deployed → rolled_back
pre-deploy states → cancelled
```

UI notes:

```text
- promote_live, rollback, and emergency_kill must use high-risk modals.
- Deployed detail views should show runtime, artifact, capital pool, and rollback target.
```

---

## 17.10 Risk Alert Workflow

States:

```text
new
acknowledged
assigned
investigating
mitigated
resolved
closed
```

Transitions:

```text
new → acknowledged
acknowledged → assigned
assigned → investigating
investigating → mitigated
mitigated → resolved
resolved → closed
```

From any non-closed state:

```text
→ create_incident
```

---

## 17.11 Incident Workflow

States:

```text
open
assigned
investigating
mitigation_in_progress
mitigated
postmortem_required
closed
```

Transitions:

```text
open → assigned → investigating → mitigation_in_progress → mitigated → postmortem_required → closed
```

Required UI:

```text
IncidentTimeline
LinkedObjectsPanel
MitigationActions
PostmortemEditor
AuditTimeline
```

---

## 17.12 Tool Lifecycle

States:

```text
draft
testing
active
restricted
deprecated
blocked
retired
```

Transitions:

```text
draft → testing → active
active → restricted
active → deprecated → retired
active → blocked
restricted → active
```

---

## 17.13 MCP Server Lifecycle

States:

```text
draft
connected
healthy
degraded
disabled
retired
```

Transitions:

```text
draft → connected → healthy
healthy → degraded
healthy / degraded → disabled
disabled → healthy
any → retired
```

MCP Tool permission states:

```text
not_granted
granted
requires_approval
sandbox_only
blocked
```

---

## 17.14 Skill Lifecycle

States:

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

Transitions:

```text
draft → sandboxed → validated → approved → active
active → deprecated → retired
active → blocked
blocked → sandboxed if reopened
```

UI components:

```text
SkillSandboxPanel
SchemaViewer
PermissionMatrix
ApprovalPanel
```

---

## 17.15 Memory Review Workflow

States:

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

Transitions:

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

States:

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

Transitions:

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

States:

```text
open
active
waiting_for_user
summary_generated
submitted_to_management
closed
archived
```

Transitions:

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

States:

```text
queued
running
waiting_for_approval
completed
failed
cancelled
retrying
```

Transitions:

```text
queued → running
running → completed
running → failed
running → waiting_for_approval
waiting_for_approval → running
failed → retrying → running
queued / running → cancelled
```

UI:

```text
JobDrawer
JobProgressBar
JobLogViewer
```

---

# 18. Localization Requirements for Components

All components must:

```text
- Receive labelKey instead of fixed text.
- Localize enum statuses through the i18n dictionary.
- Provide zh-TW and en-US copy for high-risk modals, empty states, and error states.
- Preserve user-generated content in its original language, while optionally offering Translate / Summarize actions.
```

Example keys:

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

Lovable should build:

```text
1. Shared component library.
2. Management / Agora shared AppShell.
3. StatusBadge / RiskBadge / LifecycleStepper.
4. PermissionAwareButton / ActionMenu / HighRiskConfirmationModal.
5. PantheonDataTable / MetricCard / FilterBar.
6. JobDrawer / AlertCard / IncidentTimeline / EventStreamPanel.
7. FormulaBuilder / AllocationSimulationPanel.
8. PermissionMatrix / PolicyMatrix / SchemaViewer / SkillSandboxPanel.
9. LineageGraph / AuditTimeline.
10. ConversationCanvas / SignalReviewPanel / Notebook / DecisionJournal / CommitteeRoom.
11. State machine constants and localized labels.
```

The frontend may initially operate with mock state machines and mock BFF availableActions.

---

# 20. Acceptance Criteria

After Part 7 is implemented, Lovable frontend should satisfy:

```text
1. Both frontend products share the same AppShell.
2. Navigation, buttons, statuses, and risk labels can switch between zh-TW and en-US.
3. Management entity detail pages use EntityHeader, StatusBadge, RiskBadge, and ActionMenu.
4. Strategy lifecycle is shown through LifecycleStepper.
5. High-risk actions open a confirmation modal.
6. Disabled actions show disabled reason.
7. JobDrawer can display mock job progress.
8. Alert / Incident components show states and response actions.
9. FormulaBuilder can render formula draft UI.
10. PermissionMatrix can render persona × tool/MCP/skill permissions.
11. ConversationCanvas supports message annotation.
12. State machine enums and UI badges map consistently.
13. The frontend does not hardcode business transitions; actual executable actions come from BFF availableActions.
```

---

# 21. Next Document

The next document is:

```text
Part 8 — Lovable Build Prompts + Mock Data + QA Checklist
```

Part 8 will provide:

```text
- Directly usable Lovable build prompts
- Management Console mock data
- Agora Workbench mock data
- demo scenarios
- QA checklist
- acceptance test cases
```
