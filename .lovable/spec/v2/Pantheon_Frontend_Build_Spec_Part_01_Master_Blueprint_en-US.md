# Pantheon Frontend Build Spec — Part 1
# Master Blueprint

Version: v1.0  
Locale: en-US  
Audience: Lovable, frontend engineering, BFF engineering, Pantheon product/design reviewers  
Purpose: Define the master product and frontend architecture for building the two Pantheon frontends: Pantheon Management Console and Pantheon Agora Workbench.

---

## 0. Purpose of This Document

This document is the master blueprint for Pantheon frontend planning. It is not a single dashboard spec and not an MVP proposal. Later parts will expand this blueprint into detailed workflows, page specs, data models, BFF API contracts, component systems, mock data, state machines, Lovable build prompts, and QA criteria.

Pantheon must be built as two frontend systems for different user groups:

```text
Pantheon Management Console
= Used by managers, research leads, risk officers, capital managers, and system operators.
= Management + monitoring + response + approvals + deployment + rollback + audit.

Pantheon Agora Workbench
= Used daily by analysts, traders, and AI trainers.
= Market analysis + signal review + research notes + AI persona collaboration + decision journal + insight capture.
```

Both systems share the same Pantheon Platform Shell, authentication, BFF, data models, and event streams. However, navigation, information density, risk level, workflows, and user experience must be designed separately.

---

## 1. Project Goal

### 1.1 Product Goal

Pantheon frontend must support a full AI-driven multi-persona strategy operating system, including:

```text
Strategy / Alpha management
Persona management
Capital pool management
Performance ranking formula management
Quarterly rebalance management
Evolution direction management
Research / experiment management
Tool / MCP / Skill management
Governance / approval management
Paper / live deployment management
Runtime / job / alert / incident monitoring and response
Trader and AI persona collaboration
AI training, memory review, skill drafting, and insight capture
```

This system must not be a status-only dashboard. It must provide full management control. Important objects must support creation, editing, versioning, approval, deployment, suspension, rollback, retirement, and audit.

### 1.2 Frontend Build Goal

Lovable should first build an operable frontend skeleton using a mock BFF client:

```text
1. Build the shared Platform Shell.
2. Build /management and /agora route groups.
3. Build the Management Console navigation and core page skeletons.
4. Build the Agora Workbench navigation and core page skeletons.
5. Build bilingual language switching.
6. Build mock data and mock BFF actions.
7. Build high-risk action confirmation modals.
8. Build mock realtime patterns for jobs, alerts, and events.
```

---

## 2. Product Split

## 2.1 Pantheon Management Console

### Users

```text
Admin
Research Lead
Risk Officer
Capital Manager
Strategy Manager
System Operator
Reviewer / Committee Member
Capability Admin
```

### Management Scope

The Management Console is the formal control plane. Core and Operations must be merged into a single product area because the same users manage strategies, personas, capital pools, ranking formulas, quarterly rebalances, evolution directions, tools, MCP, skills, approvals, deployments, and also monitor runtimes, paper/live execution, jobs, experiments, tool calls, alerts, incidents, and rollbacks.

The Management Console must support:

```text
Strategy & Alpha lifecycle management
Persona lifecycle and route policy management
Capital pool and risk budget management
Performance ranking formula management
Quarterly rebalance management
Evolution steering management
Research / experiment management
Governance / approval management
Deployment / runtime / risk management
Tools / MCP / Skills management
Knowledge / artifact / lineage management
Jobs / events / audit management
```

### UI Nature

The Management Console should be:

```text
High information density
Object-first
State-first
Action-aware
Risk-aware
Permission-aware
Audit-aware
Realtime-aware
```

It is not a chat interface and not a status-only dashboard. Each managed object should show:

```text
Current state
Performance state
Risk state
Execution status
Related persona
Related capital pool
Related strategy / artifact / runtime
Running jobs
Open alerts
Open incidents
Available actions
Approval status
Audit trail
```

### Anti-Patterns

The Management Console must not:

```text
Use AI chat as the main entry point.
Hide high-risk actions inside small buttons.
Only display status without response actions.
Split management and monitoring into disconnected workflows.
Turn every page into the same generic data table.
Make the frontend infer approval and action rules by itself.
```

---

## 2.2 Pantheon Agora Workbench

### Users

```text
Analyst
Trader
AI Trainer
Research Assistant
Portfolio Observer
```

### Work Scope

The Agora Workbench is the daily workspace for analysts, traders, and AI trainers. It is not the formal management console. It must not directly execute live deployment, capital rebalance, ranking formula activation, MCP production permission grants, or skill approvals.

The Agora Workbench must support:

```text
Daily trading and research brief
Market and watchlist analysis
Strategy signal review
Research notebook
Ask AI personas
Multi-persona committee / red-team sessions
Trading decision journal
Alert triage
Insight inbox
AI Trainer Studio
Memory Review
Skill Coaching
Persona Lab
Evaluation Suites
Channel management
```

### Core Value

Agora should help users by:

```text
Helping analysts understand markets faster.
Helping traders understand strategy signals.
Allowing users to ask different AI personas.
Turning research notes into strategy ideas or research tasks.
Recording trading decisions and outcomes.
Speeding up alert triage.
Generating AI training data naturally through daily work.
```

### Natural Data Capture

Agora should not force users to fill long management forms. Instead, it should produce structured data through daily interactions:

```text
signal_feedback
trader_note
research_note
decision_journal_entry
persona_response_feedback
training_example
memory_candidate
strategy_idea
research_task
committee_memo
risk_feedback
skill_draft
```

### Anti-Patterns

Agora must not:

```text
Look like a backend admin console.
Show AI training settings as the first thing traders see.
Expose high-risk actions such as Promote to Live, Apply Rebalance, or Rollback.
Force users to fill excessive forms just to train AI.
Let every interaction become an unstructured chat log.
```

---

## 3. Platform Architecture

Lovable should build two route groups under one Pantheon Platform Shell:

```text
Pantheon Platform
├── /management
│   └── Pantheon Management Console
│
└── /agora
    └── Pantheon Agora Workbench
```

Shared capabilities:

```text
Authentication
User role / permissions
Locale / language switching
Global Top Bar
Product Switcher
Global Search
Notification Center
BFF Connection Status
Realtime Event Indicator
Command Palette
Right Drawer / Inspector
Mock BFF client
Toast / notification system
High-risk confirmation modal system
```

---

## 4. Shared Platform Shell

## 4.1 Global Top Bar

The top bar must be visible on all pages.

It should include:

```text
Pantheon logo
Product Switcher: Management / Agora
Current Environment: Research / Paper / Live
Global Search
Language Switcher
BFF Status
Realtime Event Indicator
Pending Approvals
Open Alerts
Running Jobs
Notification Bell
User Role Menu
```

### Environment Indicator

Display the current operating environment:

```text
Research
Paper
Live
```

Suggested visual treatment:

```text
Research: neutral / blue
Paper: amber
Live: green with high-risk accent
```

When the environment is Live, high-risk confirmation modals should be more prominent.

---

## 4.2 Product Switcher

Location: left side of the Top Bar.

Options:

```text
Management Console
Agora Workbench
```

Switching products should preserve login, role, and locale.

---

## 4.3 Global Search

Search scope:

```text
Strategy
Alpha
Persona
Capital Pool
Ranking Formula
Quarterly Rebalance
Evolution Program
Experiment
Artifact
Review Request
Deployment
Runtime
Incident
Tool
MCP Server
MCP Tool
Skill
Insight
Signal
Research Note
Agora Session
Decision Journal
Job
Audit Event
```

Search results should show:

```text
Object type
Display name
Status
Owner
Risk level
Last updated
Quick action
```

---

## 4.4 Notification Center

Notification types:

```text
Approval Required
Risk Alert
Incident Update
Job Completed
Job Failed
Deployment Event
Rollback Event
Persona Policy Violation
Capital Rebalance Update
Ranking Formula Approval
MCP / Skill Approval Needed
Agora Insight Submitted
```

Every notification must link to the relevant object.

---

## 4.5 Right Drawer / Inspector

Use a shared right-side drawer to avoid unnecessary page jumps.

Inspector types:

```text
Strategy Inspector
Persona Inspector
Capital Pool Inspector
Ranking Formula Inspector
Rebalance Inspector
Evolution Program Inspector
Experiment Inspector
Job Inspector
Alert Inspector
Incident Inspector
Signal Inspector
Message Inspector
Artifact Inspector
Tool Call Inspector
MCP Tool Inspector
Skill Inspector
```

Each Inspector should show:

```text
Core information
Current status
Risk status
Linked objects
Available actions
Recent events
Audit snippets
```

---

## 5. Management Console Navigation

Management Console sidebar groups:

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

### Management Routes

```text
/management/command-center
/management/strategies
/management/strategies/:strategyId
/management/personas
/management/personas/:personaId
/management/capital
/management/capital/:poolId
/management/ranking
/management/ranking/formulas
/management/rebalance
/management/rebalance/:rebalanceId
/management/evolution
/management/evolution/:programId
/management/experiments
/management/experiments/:experimentId
/management/governance
/management/governance/:reviewId
/management/deployment
/management/runtimes
/management/risk
/management/incidents
/management/incidents/:incidentId
/management/tools
/management/mcp
/management/skills
/management/artifacts
/management/lineage
/management/jobs
/management/audit
/management/settings
```

---

## 6. Agora Workbench Navigation

Agora sidebar groups:

```text
Daily Work
- Daily Trading Cockpit
- Market & Watchlist
- Signal Review
- Alert Triage

Research
- Research Notebook
- Insight Inbox
- Decision Journal

AI Collaboration
- Ask Personas
- Committee Room

Training
- Trainer Studio
- Memory Review
- Skill Coaching
- Persona Lab
- Evaluations

Channels
- Web / Telegram / Discord / Webhooks
```

### Agora Routes

```text
/agora/daily
/agora/markets
/agora/watchlist
/agora/signals
/agora/signals/:signalId
/agora/notebook
/agora/ask
/agora/committee
/agora/committee/:sessionId
/agora/journal
/agora/triage
/agora/insights
/agora/trainer
/agora/trainer/:personaId
/agora/memory
/agora/skill-coaching
/agora/persona-lab
/agora/evaluations
/agora/channels
```

The primary Agora entry point should be `Daily Trading Cockpit`. Do not make trainer admin or memory admin the default landing page.

---

## 7. Management Console Module Overview

## 7.1 Command Center

Purpose: unified management and execution overview.

Must show:

```text
Lifecycle bottlenecks
Pending approvals
Open incidents
Live / paper risk
Running jobs
Persona violations
Capital pool exposure
Agora incoming queue
Recent state transitions
```

---

## 7.2 Strategy & Alpha Management

Purpose: manage full alpha strategy lifecycle and track paper/live execution state.

Core capabilities:

```text
Create / edit / clone strategy
Lifecycle state management
Spec management
Experiment evidence
Paper / live status
Risk alerts
Incidents
Rollback
Retirement
Lineage
```

---

## 7.3 Persona Directorate

Purpose: manage AI personas, permissions, capital binding, tool access, ranking, and activity state.

Core capabilities:

```text
Create / clone / edit persona
Persona lifecycle
Route policy
Tool / MCP / Skill permissions
Capital binding
Strategy ownership
Activity monitor
Policy violations
Training and memory governance
Evaluation
```

---

## 7.4 Capital, Ranking & Rebalance

Purpose: manage capital pools, performance ranking formulas, and quarterly rebalances.

Core capabilities:

```text
Capital pool management
Risk budget
Persona / strategy capital binding
Ranking formula studio
Formula backtest
Ranking publication
Quarterly rebalance
Allocation simulation
Manual override
Approval
Apply / rollback rebalance
```

---

## 7.5 Evolution Steering

Purpose: manage alpha evolution direction and evolution runs.

Core capabilities:

```text
Evolution program
Fitness formula
Mutation rules
Constraints
Run monitor
Candidate strategy browser
Candidate promotion
```

---

## 7.6 Research & Experiments

Purpose: manage backtests, OOS, stress tests, parameter sweeps, RL training, and related research jobs.

Core capabilities:

```text
Experiment registry
Experiment builder
Running job tracking
Metrics viewer
Logs
Evidence pack
Attach to review
Invalidate / rerun / compare
```

---

## 7.7 Governance & Approvals

Purpose: manage approvals for all high-risk operations.

Approval types:

```text
Strategy review
Paper promotion
Live promotion
Rollback
Capital rebalance
Ranking formula change
Persona policy change
MCP approval
Skill approval
Tool permission change
Evolution program approval
```

---

## 7.8 Deployment, Runtime & Risk

Purpose: monitor and respond to paper/live deployments, runtimes, risks, alerts, and incidents.

Core capabilities:

```text
Runtime monitor
Paper strategy monitor
Live strategy monitor
Risk center
Alert center
Incident center
Rollback manager
Emergency actions
```

---

## 7.9 Tools, MCP & Skills

Purpose: manage tools, MCP servers/tools, and skills available to personas.

Core capabilities:

```text
Tool registry
Tool schema
Tool permission matrix
MCP server management
MCP tool discovery
MCP permission matrix
Skill registry
Skill sandbox
Skill approval
Skill versioning
```

---

## 7.10 Knowledge, Artifacts & Lineage

Purpose: manage insights, research notes, artifacts, postmortems, and lineage.

Core capabilities:

```text
Artifact store
Artifact versions
Research notes
Postmortems
Committee memos
Lineage graph
Insight linkage
```

---

## 7.11 Jobs, Events & Audit

Purpose: track all long-running jobs, events, and audit records.

Core capabilities:

```text
Job queue
Job logs
Realtime event stream
Audit explorer
Entity audit timeline
Approval history
```

---

## 8. Agora Workbench Module Overview

## 8.1 Daily Trading Cockpit

Purpose: the daily landing page for analysts and traders.

Must show:

```text
Market summary
Watchlist changes
Important signals
Paper/live strategy highlights
Open alerts requiring human judgement
Persona daily brief
Research questions
```

Produces:

```text
Trader note
Insight
Research task
Signal feedback
```

---

## 8.2 Market & Watchlist

Purpose: help users analyze markets and track instruments.

Features:

```text
Watchlist
Market events
Persona commentary
Strategy exposure
Related signals
Trader annotations
```

---

## 8.3 Strategy Signal Review

Purpose: let traders review whether strategy signals make sense.

Features:

```text
Signal explanation
Similar historical cases
Persona opinions
Agree / Disagree / Flag
Create research task
Attach trader rationale
```

Produces:

```text
signal_feedback
risk_feedback
strategy_improvement_signal
training_example
```

---

## 8.4 Research Notebook

Purpose: allow analysts to write research notes and convert ideas into actionable objects.

Features:

```text
Structured note
Markdown editor
Attach chart / signal / strategy
Ask persona to expand
Ask persona to critique
Convert to insight
Convert to strategy idea
Convert to experiment request
```

---

## 8.5 Ask Personas

Purpose: allow users to ask AI personas with context.

Features:

```text
Select persona
Select context
Ask explain / critique / propose / red-team
Save as note
Create insight
Create training example
Start committee
```

---

## 8.6 Committee Room

Purpose: structured multi-persona debate.

Features:

```text
Select target strategy / signal / incident / note
Select personas
Load evidence pack
Run discussion rounds
Capture disagreement
Generate committee memo
Submit to governance
```

---

## 8.7 Decision Journal

Purpose: record trader decisions and rationale.

Features:

```text
Create decision entry
Link signal / strategy / market
Record confidence
Ask persona
Schedule follow-up
Mark actual outcome
Convert to training / insight
```

---

## 8.8 Alert Triage

Purpose: help traders judge whether alerts are important.

Features:

```text
View alert
Market context
Strategy context
Persona explanation
Similar past incidents
Acknowledge / dismiss / escalate
Add trader interpretation
```

---

## 8.9 Insight Inbox

Purpose: process insights naturally generated from Agora workflows.

Features:

```text
Promote to strategy idea
Attach to existing strategy
Create research task
Create training example
Send to Management Console
Archive
```

---

## 8.10 Trainer Studio

Purpose: allow AI trainers to manage persona behavior and feedback.

Features:

```text
Behavior rules
Training examples
Feedback queue
Evaluation suites
Drift monitor
Version history
Submit persona update
```

---

## 8.11 Memory Review

Purpose: review AI memory.

Features:

```text
Approve
Reject
Edit
Merge
Move to private
Move to shared
Mark sensitive
Mark do-not-remember
```

---

## 8.12 Skill Coaching

Purpose: generate skill drafts from daily needs without directly deploying them.

Flow:

```text
Skill idea
→ AI draft
→ trainer edit
→ sandbox test
→ submit to Management Skill Approval
```

---

## 9. Core Data Flow

## 9.1 Management Console Flow

```text
Strategy / Persona / Capital / Tool / MCP / Skill
        ↓
Management actions
        ↓
BFF Command API
        ↓
Job / approval / state transition
        ↓
Realtime events
        ↓
UI refresh / notifications / audit
```

Example:

```text
Manager approves quarterly rebalance
→ POST /bff/rebalances/:id/actions/approve
→ BFF creates job / state transition
→ event: rebalance.approved
→ Management Console updates status
→ Audit timeline records action
```

---

## 9.2 Agora Workbench Flow

```text
Analyst / Trader interaction
        ↓
Note / feedback / signal annotation / AI session
        ↓
Structured insight / training example / research task
        ↓
BFF saves event
        ↓
Management Console receives incoming item
```

Example:

```text
Trader disagrees with a strategy signal
→ Agora creates signal_feedback event
→ BFF saves insight candidate
→ Management Command Center shows Incoming Signal Disagreement
→ Manager converts it into research task or strategy review question
```

---

## 10. BFF Integration Principle

The frontend only communicates with the BFF. It must not call Pantheon backend services directly.

## 10.1 BFF Responsibility

The BFF is responsible for:

```text
Aggregating Pantheon backend data
Converting backend data into frontend-friendly DTOs
Handling role-based permissions
Providing availableActions
Providing riskLevel
Providing linkedEntities
Providing realtime events
Creating jobs
Handling command actions
```

## 10.2 Frontend Responsibility

The frontend is responsible for:

```text
Rendering UI
Calling BFF query APIs
Calling BFF command APIs
Subscribing to realtime events
Displaying jobs / alerts / incidents
Showing actions based on permissions
Showing confirmation modals
```

## 10.3 Entity DTOs Must Include availableActions

All entity detail APIs should return:

```json
{
  "id": "strategy_001",
  "type": "strategy",
  "status": "replicated",
  "riskLevel": "medium",
  "availableActions": [
    {
      "id": "submit_review",
      "labelKey": "action.submitReview",
      "riskLevel": "medium",
      "requiresApproval": false,
      "enabled": true
    },
    {
      "id": "promote_live",
      "labelKey": "action.promoteLive",
      "riskLevel": "high",
      "requiresApproval": true,
      "enabled": false,
      "disabledReasonKey": "reason.strategyMustBeApprovedAndPaperTested"
    }
  ]
}
```

The frontend should not infer all action rules itself. It should render actions based on `availableActions` returned by the BFF.

---

## 11. Shared Entity Types

Both frontends share the following entities:

```text
Strategy
Alpha
Persona
CapitalPool
RankingFormula
QuarterlyRebalance
EvolutionProgram
Experiment
Artifact
ReviewRequest
PromotionRequest
Deployment
Runtime
RiskAlert
Incident
Job
Tool
MCPServer
MCPTool
Skill
Insight
Signal
ResearchNote
DecisionJournalEntry
AgoraSession
Message
MemoryItem
TrainingExample
AuditEvent
```

Each entity should include:

```text
id
displayName
type
status
owner
riskLevel
createdAt
updatedAt
linkedEntities
availableActions
auditSummary
```

---

## 12. High-Risk Action Model

High-risk actions in the Management Console must use confirmation modals.

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
```

The confirmation modal must show:

```text
Operation
Target object
Current state
New state
Affected capital pool
Affected strategy
Affected persona
Affected runtime
Risk impact
Required approval
Rollback option
Audit memo field
Confirm button
```

Agora must not execute high-risk actions directly. It can only create requests or proposals.

---

## 13. Localization & Language Switching Requirements

Pantheon frontend must support bilingual language switching. This is a hard requirement, not a later add-on.

## 13.1 Supported Locales

```text
zh-TW — Traditional Chinese, default locale
en-US — English
```

Default:

```text
defaultLocale = "zh-TW"
```

---

## 13.2 Language Switcher UI

Management Console and Agora Workbench must share the same language switcher.

Location:

```text
Global Top Bar → User Menu or Language Switcher
```

Display options:

```text
繁體中文
English
```

or compact:

```text
ZH
EN
```

Suggested UI:

```text
[🌐 English ▼]
```

After switching language, update immediately:

```text
sidebar labels
page titles
button labels
table headers
status labels
modal text
form labels
empty states
error messages
confirmation messages
tooltips
```

---

## 13.3 Locale Persistence

Locale selection must persist.

Priority:

```text
1. User profile locale from BFF
2. Local storage
3. Browser language
4. default zh-TW
```

Suggested local storage key:

```text
pantheon.locale
```

BFF user profile may return:

```json
{
  "user": {
    "id": "user_001",
    "name": "Arvin",
    "role": "Admin",
    "locale": "zh-TW"
  }
}
```

---

## 13.4 Routing Strategy

For the first version, do not require locale route prefixes. This avoids unnecessary implementation complexity for Lovable.

Use:

```text
/management/command-center
/agora/daily
```

The active locale is controlled by app state.

If localized shareable URLs are needed later, extend to:

```text
/zh-TW/management/command-center
/en-US/management/command-center
```

---

## 13.5 Translation Dictionary

The frontend should use translation keys. Do not hardcode UI text in components.

Example:

```ts
const translations = {
  "zh-TW": {
    "nav.management.commandCenter": "指揮中心",
    "nav.management.strategies": "策略與 Alpha 管理",
    "nav.management.personas": "人格管理",
    "nav.management.capital": "資金池與配置",
    "action.submitReview": "送出審查",
    "action.rollback": "回滾",
    "status.strategy.live": "實盤",
    "status.strategy.paper": "模擬盤",
    "risk.high": "高風險"
  },
  "en-US": {
    "nav.management.commandCenter": "Command Center",
    "nav.management.strategies": "Strategies & Alphas",
    "nav.management.personas": "Persona Directorate",
    "nav.management.capital": "Capital & Allocation",
    "action.submitReview": "Submit Review",
    "action.rollback": "Rollback",
    "status.strategy.live": "Live",
    "status.strategy.paper": "Paper",
    "risk.high": "High Risk"
  }
}
```

---

## 13.6 BFF Locale Contract

The BFF should return stable enum codes or translation keys. It should not return fixed Chinese or English UI labels.

Example BFF payload:

```json
{
  "strategy": {
    "id": "alpha_042",
    "status": "replicated",
    "riskLevel": "medium",
    "availableActions": [
      {
        "id": "submit_review",
        "labelKey": "action.submitReview",
        "riskLevel": "medium"
      }
    ]
  }
}
```

The frontend displays based on the active locale:

```text
zh-TW: 送出審查
en-US: Submit Review
```

---

## 13.7 User Generated Content Rules

The following user-generated content should preserve its original language by default:

```text
Research notes
Trader notes
Decision journal
AI session transcript
Committee memo
Strategy thesis
Postmortem
```

Optional helper actions may be offered:

```text
Translate View
Summarize in Current Language
```

---

## 13.8 AI Persona Response Language

AI persona responses in Agora should follow the current UI locale by default.

Rules:

```text
locale = zh-TW → AI personas respond in Traditional Chinese by default.
locale = en-US → AI personas respond in English by default.
```

A session may override this:

```text
Follow UI Language
zh-TW
en-US
Mixed / Original
```

---

## 13.9 i18n QA Checklist

Lovable delivery must verify:

```text
Management Console can switch between zh-TW and en-US.
Agora Workbench can switch between zh-TW and en-US.
Sidebar labels are translated.
Top bar labels are translated.
Buttons are translated.
Status badges are translated.
Risk labels are translated.
Table headers are translated.
Empty states are translated.
Error messages are translated.
Confirmation modals are translated.
Locale persists after reload.
Agora AI sessions follow the active language by default.
BFF returns enum codes or labelKey, and frontend displays localized labels.
```

---

## 14. User Experience Principles

## 14.1 Management Console UX

```text
Dense but clear
Tables + detail drawers + status badges
Every object has available actions
Every risky action has confirmation
Every object has audit trail
Use tabs for deep object detail
Use filters heavily
Support bulk actions carefully
Realtime updates for jobs / alerts / incidents
```

## 14.2 Agora Workbench UX

```text
Friendly daily workflow
Less dense than Management Console
Prioritize context, explanation, notes, AI collaboration
Use cards, notebooks, conversation panels
Make insight conversion one-click
Make feedback lightweight
Avoid asking users to fill long forms
Use structured capture behind simple UI
```

---

## 15. Visual Design Direction

## 15.1 Overall

```text
Professional fintech / research operating system
Dark-friendly but not mandatory
High contrast for risk states
Clear status badges
Minimal decorative noise
Information hierarchy over visual gimmicks
```

## 15.2 Management Console

Visual style:

```text
Control room
Institutional dashboard
Dense tables
Status chips
Risk indicators
Timeline / audit panels
State machine steppers
```

## 15.3 Agora Workbench

Visual style:

```text
Analyst workspace
Research notebook
AI collaboration desk
Cleaner spacing
Conversation-friendly
Context cards
Signal explanation panels
```

---

## 16. Build Assumptions for Lovable

Lovable should assume:

```text
Frontend only
BFF APIs are mocked first
Use route groups: /management and /agora
Use reusable components
Use mock data models
Implement responsive desktop-first layout
No direct Pantheon backend calls
No real trading operations
No real secrets
All high-risk actions simulated through modal + mock BFF command
Realtime events simulated through mock event feed
```

Recommended first build order:

```text
1. Shared App Shell
2. i18n / Language Switcher
3. Management Command Center
4. Strategy Management pages
5. Persona Directorate pages
6. Capital / Ranking / Rebalance pages
7. Deployment / Risk / Jobs pages
8. Tools / MCP / Skills pages
9. Agora Daily Cockpit
10. Agora Signal Review
11. Agora Research Notebook
12. Agora Ask Personas / Committee
13. Agora Trainer / Memory / Skill Coaching
```

---

## 17. Acceptance Criteria for Part 1 Build

The first Lovable build must satisfy:

```text
Platform has two product areas: Management and Agora.
User can switch between Management and Agora.
Management has correct sidebar structure.
Agora has correct sidebar structure.
Top bar shows environment, BFF status, language switcher, alerts, jobs, approvals.
Language can switch between zh-TW and en-US.
Management pages are object / state / action oriented.
Agora pages are analyst / trader workflow oriented.
High-risk actions are not exposed in Agora.
High-risk actions in Management use confirmation modal.
All pages can run on mock data.
All actions call mock BFF client.
Realtime jobs / alerts can be simulated.
```

---

## 18. Locked Decisions

The following decisions are locked for later spec parts:

```text
1. Core + Operations are merged into Pantheon Management Console.
2. Agora Workbench is separate and serves analysts, traders, and AI trainers.
3. Both products share platform shell, BFF, data models, and event bus.
4. Management Console is object-first / state-first / action-first.
5. Agora is daily workflow-first / AI collaboration-first.
6. Agora can only create proposals / insights / feedback, not perform live or capital high-risk actions.
7. All high-risk operations in Management Console require confirmation + approval + audit.
8. Lovable builds first with a mock BFF client.
9. Frontend must support zh-TW / en-US language switching.
10. BFF returns enum codes / labelKey, and frontend handles localization.
```

---

## 19. Next Document

The next document is:

```text
Part 2 — Pantheon Management Console Full Management Workflow Inventory
```

Part 2 will not start with pages. It will inventory all management workflows required by the Management Console:

```text
Strategy lifecycle
Persona lifecycle
Capital pool
Ranking formula
Quarterly rebalance
Evolution program
Experiment
Governance
Deployment / rollback
Runtime / alert / incident
Tool / MCP / Skill
Jobs / audit
```

This ensures the UI design will not miss core management functions.
