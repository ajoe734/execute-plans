# Pantheon Frontend Build Spec — Full Planning Document
## Management Console + Agora Workbench

Version: v1.0
Locale: en-US
Date: 2026-05-03

This document combines Parts 1–8 as the complete frontend planning package for Lovable to build Pantheon Management Console and Pantheon Agora Workbench.

## Document Index
- Part 1 — Master Blueprint
- Part 2 — Management Console Process Inventory
- Part 3 — Management Console Page & Feature Design
- Part 4 — Agora Workbench User Workflow Inventory
- Part 5 — Agora Workbench Page & Feature Design
- Part 6 — Shared Data Model + BFF API Contract
- Part 7 — Component System + State Machines
- Part 8 — Lovable Build Prompts + Mock Data + QA Checklist

---


---

# Part 1 — Master Blueprint
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


---

# Part 2 — Management Console Process Inventory
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


---

# Part 3 — Management Console Page & Feature Design
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


---

# Part 4 — Agora Workbench User Workflow Inventory
**Version**: v1.0  
**Locale**: en-US  
**Audience**: Lovable frontend implementation, product design, BFF design, Pantheon review  
**Scope**: User roles, daily workflows, insight capture, and Management Console handoff flows for Pantheon Agora Workbench.

---

# 1. Purpose of This Document

Part 1 defined the overall Pantheon Platform split:

```text
Pantheon Management Console
= management, monitoring, response, approval, deployment, rollback, and audit.

Pantheon Agora Workbench
= daily AI-assisted workbench for analysts, traders, and AI trainers.
```

Parts 2 and 3 focused on the Management Console.  
This Part 4 inventories the complete user workflows for the **Pantheon Agora Workbench**.

This document does not yet define detailed page layouts. It first answers:

```text
Who uses Agora?
Why would they open it every day?
How does each workflow help analysts, traders, and AI trainers?
Which interactions naturally generate useful data?
Which artifacts are handed off to the Management Console?
Which actions are not allowed inside Agora?
```

Part 5 will convert these workflows into Lovable-ready page specifications.

---

# 2. Product Positioning

Pantheon Agora Workbench is not an AI training admin panel, and it is not just a chat tool.

It should be:

> A daily AI collaboration workbench for analysts, traders, and AI trainers.

Agora's core value is:

```text
1. Help analysts understand markets, strategies, and signals faster.
2. Help traders review signals, alerts, risks, and decisions.
3. Let users consult AI personas and multi-persona committees in context.
4. Turn research notes, trading judgments, AI responses, and human corrections into structured insights.
5. Feed useful information back into the Pantheon Management Console as strategies, research tasks, training data, review evidence, or risk feedback.
```

In short:

```text
On the surface, Agora is an analyst/trader assistance workbench.
Behind the scenes, Agora is Pantheon's high-quality human judgment and AI training data capture layer.
```

Data capture should happen naturally through the user's workflow, not through forced forms.

---

# 3. Boundary Between Agora and the Management Console

## 3.1 What Agora Can Do

```text
View market summaries
View watchlists
View paper/live strategy summaries
Review strategy signals
Ask AI personas
Start committee rooms
Write research notes
Create decision journal entries
Triage alerts
Create trader insights
Create research task requests
Create strategy idea proposals
Create training examples
Create memory review items
Create skill drafts
Create MCP/tool requests
Create committee memos
```

## 3.2 What Agora Must Not Do Directly

Agora must not directly execute high-risk management actions:

```text
Do not directly promote a strategy to paper
Do not directly promote a strategy to live
Do not directly apply a capital rebalance
Do not directly change a ranking formula
Do not directly change capital allocation
Do not directly deploy a live artifact
Do not directly roll back a live strategy
Do not directly grant a production MCP tool
Do not directly approve a production skill
Do not directly activate a persona route policy version
```

If such intent appears in Agora, it must create a request/proposal and hand it off to the Management Console governance flow.

Example:

```text
A trader believes a live strategy should be de-risked during Signal Review
→ Agora creates risk_feedback + allocation_review_request
→ Management Console displays the item in Capital / Risk / Governance queues
→ Risk Officer / Capital Manager reviews and approves inside Management Console
```

---

# 4. Primary Agora User Roles

## 4.1 Analyst

Analysts use Agora to:

```text
Read market summaries
Organize research notebooks
Ask AI personas about strategies or market events
Convert market observations into insights
Convert hypotheses into strategy ideas or experiment requests
Compare different persona perspectives
```

Analysts need:

```text
Fast understanding of data
Easy note-taking
A smooth path from note to research task
A way to track what happened to submitted ideas
```

## 4.2 Trader

Traders use Agora to:

```text
Review strategy signals
Review alerts
Understand live/paper strategy anomalies
Record decision rationale
Ask AI personas for explanations
Start quick committee discussions
Label signals as reasonable or suspicious
Label alerts as important or noise
```

Traders need:

```text
Fast understanding of what happened
Fast explanation of why a strategy generated a signal
Persona agreement/disagreement at a glance
Low-friction capture of why a signal was accepted or rejected
```

## 4.3 AI Trainer

AI trainers use Agora to:

```text
Review AI responses
Accept or reject training feedback
Manage training examples
Review memory items
Observe persona drift
Create or revise persona behavior rules
Turn poor responses into evaluation cases
Turn skill ideas into skill drafts
```

AI trainers need:

```text
Clarity on where the AI failed
A way to convert human corrections into training data
Memory review and conflict resolution
A path for skill drafts to enter Management Console approval
```

## 4.4 Research Assistant

Research assistants can:

```text
Organize data
Tag insights
Prepare committee evidence packs
Organize notebooks
Create draft research tasks
```

## 4.5 Portfolio Observer

Portfolio observers can view:

```text
Daily summaries
Signal reviews
Alerts
Persona commentary
Decision journal entries
```

They should not perform high-risk actions.

---

# 5. Core Artifacts Produced by Agora

Agora workflows must produce structured artifacts, not only chat logs.

Core artifacts:

```text
Insight
SignalFeedback
TraderNote
ResearchNote
ResearchTaskRequest
StrategyIdeaProposal
DecisionJournalEntry
PersonaResponseFeedback
TrainingExample
MemoryReviewItem
CommitteeMemo
AlertTriageRecord
SkillDraft
MCPToolRequest
RiskFeedback
PostmortemInput
```

These artifacts are handed off to the Management Console for formal processing.

---

# 6. Agora Workflow Overview

Agora must support the following major user workflows:

```text
W1. Daily Trading Cockpit Workflow
W2. Market & Watchlist Workflow
W3. Strategy Signal Review Workflow
W4. Research Notebook Workflow
W5. Ask Personas Workflow
W6. Committee Room Workflow
W7. Decision Journal Workflow
W8. Alert Triage Workflow
W9. Insight Inbox Workflow
W10. AI Trainer Feedback Workflow
W11. Memory Review Workflow
W12. Skill Coaching Workflow
W13. Persona Lab Workflow
W14. Evaluation Workflow
W15. Channel / External Conversation Workflow
W16. Agora → Management Handoff Workflow
```

The sections below inventory each workflow.

---

# 7. W1 — Daily Trading Cockpit Workflow

## 7.1 Users

```text
Trader
Analyst
Portfolio Observer
Research Lead
```

## 7.2 Purpose

Daily Trading Cockpit is the Agora home page.  
It should answer, at the start of the day:

```text
What happened in the market?
Which signals are important?
Which strategies need attention?
Which alerts require human judgment?
What do the AI personas think today?
What happened to yesterday's research questions?
```

## 7.3 Primary Flow

```text
1. User opens Daily Trading Cockpit.
2. System shows market summary, watchlist changes, strategy highlights, alerts, and persona daily briefs.
3. User opens any item to inspect context.
4. User marks an item as important or not important.
5. User asks a persona.
6. User converts an item into an insight, research note, strategy idea, or alert triage record.
7. System converts these actions into structured events.
```

## 7.4 Main Data Blocks

```text
Market Summary
Watchlist Movers
Strategy Highlights
Signal Highlights
Open Alerts
Persona Briefs
Research Questions
Incoming Insights
```

## 7.5 User Actions

```text
Mark as Important
Dismiss
Ask Persona
Open Signal Review
Open Alert Triage
Create Trader Note
Create Insight
Create Research Task
Create Strategy Idea
Send to Committee
```

## 7.6 Naturally Captured Data

```text
Which markets the user cares about daily
Which signals were opened
Which alerts were considered important
Which AI persona briefs were useful
Which summaries became research notes
Which items were dismissed as noise
```

## 7.7 Artifacts Sent to Management Console

```text
Insight
ResearchTaskRequest
StrategyIdeaProposal
AlertTriageRecord
PersonaResponseFeedback
```

## 7.8 Prohibited Actions

Daily Cockpit must not directly:

```text
deploy a strategy
roll back a strategy
change capital allocation
approve a promotion
apply a rebalance
```

---

# 8. W2 — Market & Watchlist Workflow

## 8.1 Users

```text
Analyst
Trader
Research Assistant
```

## 8.2 Purpose

Help users monitor markets and watchlists, then convert market observations into actionable research insights.

## 8.3 Primary Flow

```text
1. User views a watchlist.
2. System shows price changes, event summaries, related strategy exposure, related signals, and AI commentary.
3. User annotates a symbol or market event.
4. User asks a persona: "Why did this move today?"
5. User converts the annotation into an insight or strategy idea.
```

## 8.4 Main Data Blocks

```text
Watchlist
Market Events
Price / Volume / Volatility Summary
Related Strategies
Related Signals
Persona Commentary
Trader Annotations
```

## 8.5 User Actions

```text
Add Watchlist Item
Remove Watchlist Item
Add Annotation
Ask Why Moved
Ask Related Strategies
Ask Persona
Create Insight
Create Strategy Idea
Attach to Existing Strategy
Create Research Task
```

## 8.6 Naturally Captured Data

```text
Symbols the user cares about
Manual links between market events and strategies
Trader regime-change judgments
Which instruments are frequently discussed with AI
Which market observations become strategy hypotheses
```

## 8.7 Artifacts Sent to Management Console

```text
MarketInsight
StrategyIdeaProposal
ResearchTaskRequest
StrategyAnnotation
```

---

# 9. W3 — Strategy Signal Review Workflow

## 9.1 Users

```text
Trader
Analyst
Risk Officer observer
```

## 9.2 Purpose

Let traders review whether a strategy signal is reasonable and naturally capture human judgment on the signal.

This is one of Agora's most important data capture workflows.

## 9.3 Primary Flow

```text
1. System lists recent or important strategy signals.
2. User opens a signal.
3. System shows signal explanation, strategy context, market context, similar historical cases, and persona opinions.
4. User marks Agree / Disagree / Unsure / Flag Suspicious.
5. User enters rationale.
6. User asks a persona or starts a committee.
7. User converts the signal feedback into a research task, risk feedback, or strategy improvement request.
```

## 9.4 Signal Review Must Show

```text
Signal ID
Strategy
Asset
Direction
Timestamp
Confidence
Expected Holding Period
Current Market Context
Key Features
Historical Similar Cases
Backtest / Paper / Live Context
Risk Warnings
Persona Opinions
Related Alerts
```

## 9.5 User Actions

```text
Agree
Disagree
Unsure
Flag Suspicious
Add Rationale
Ask Persona
Ask Committee
Create Research Task
Create Risk Feedback
Attach to Decision Journal
Create Training Example from Persona Explanation
```

## 9.6 Naturally Captured Data

```text
Which signals traders agree with
Which signals traders disagree with
Why they disagree
Which market regimes humans believe are different
Which features humans distrust
Which persona explanations are useful
Which signals later failed
```

## 9.7 Artifacts Sent to Management Console

```text
SignalFeedback
RiskFeedback
StrategyImprovementRequest
ResearchTaskRequest
PersonaResponseFeedback
DecisionJournalLink
```

## 9.8 Prohibited Actions

Signal Review must not directly:

```text
cancel live orders
change live allocation
roll back a live strategy
approve or reject live promotion
```

It can create requests:

```text
Request Risk Review
Request Strategy Pause
Request Allocation Review
```

---

# 10. W4 — Research Notebook Workflow

## 10.1 Users

```text
Analyst
Research Assistant
Trader
AI Trainer
```

## 10.2 Purpose

Research Notebook is where analysts organize ideas and convert them into research tasks.  
It should feel like a useful research note-taking tool, not a database form.

## 10.3 Primary Flow

```text
1. User creates a note.
2. User inserts market events, strategies, signals, charts, persona responses, or experiment results.
3. User records ideas using markdown or structured fields.
4. User asks a persona to expand, critique, or summarize.
5. User converts the note into an insight, strategy idea, experiment request, or committee question.
```

## 10.4 Note Types

```text
Market Observation
Strategy Hypothesis
Risk Concern
Model Failure
Paper Summary
Postmortem Thought
Trader Intuition
Experiment Idea
```

## 10.5 User Actions

```text
Create Note
Edit Note
Pin Note
Attach Strategy
Attach Signal
Attach Market Event
Ask Persona to Expand
Ask Persona to Critique
Convert to Insight
Convert to Strategy Idea
Convert to Experiment Request
Send to Committee
Archive Note
```

## 10.6 Naturally Captured Data

```text
Analyst hypotheses
Trader market regime judgments
Strategy failure intuition
Frequently mentioned features, markets, or risks
Which notes become formal strategies or experiments
```

## 10.7 Artifacts Sent to Management Console

```text
ResearchNote
Insight
StrategyIdeaProposal
ExperimentRequest
CommitteeQuestion
```

---

# 11. W5 — Ask Personas Workflow

## 11.1 Users

```text
Analyst
Trader
AI Trainer
Research Assistant
```

## 11.2 Purpose

Allow users to ask AI personas with context, instead of using an empty chat box.

## 11.3 Primary Flow

```text
1. User selects context: market / signal / strategy / alert / note / incident.
2. User selects a persona.
3. User selects mode: explain / critique / propose / red-team / summarize / compare.
4. Persona responds.
5. User marks the response as useful / not useful / incorrect.
6. User saves the response as a note, insight, training example, or committee input.
```

## 11.4 Persona Ask Modes

```text
Explain
Critique
Propose
Red-Team
Summarize
Compare
Find Risk
Suggest Experiment
Generate Questions
```

## 11.5 User Actions

```text
Select Persona
Select Context
Ask Question
Rate Response
Correct Response
Save as Note
Create Insight
Create Training Example
Ask Another Persona
Start Committee
Attach to Strategy
```

## 11.6 Naturally Captured Data

```text
Which personas are useful for which problems
Which responses are adopted
Which responses are corrected
What questions users ask most often
Which persona performs poorly in which task type
```

## 11.7 Artifacts Sent to Management Console

```text
PersonaResponseFeedback
TrainingExample
ResearchNote
Insight
CommitteeSeed
```

---

# 12. W6 — Committee Room Workflow

## 12.1 Users

```text
Analyst
Trader
Research Lead
Reviewer
AI Trainer
```

## 12.2 Purpose

Let multiple AI personas conduct a structured debate around the same strategy, signal, alert, incident, or note.

Committee Room is not a generic group chat. It should produce a usable committee memo or review evidence.

## 12.3 Primary Flow

```text
1. User selects target object: strategy / signal / alert / incident / note.
2. User selects a committee template.
3. User selects personas.
4. System loads an evidence pack.
5. Personas speak in structured rounds.
6. User asks follow-up questions.
7. System summarizes disagreements, risk objections, and recommendations.
8. System generates a committee memo.
9. User submits the memo to Governance / Review in Management Console.
```

## 12.4 Committee Templates

```text
Strategy Review
Signal Trustworthiness Review
Risk Red-Team
Live Incident Review
Paper-to-Live Promotion Debate
Postmortem Discussion
New Strategy Ideation
```

## 12.5 User Actions

```text
Create Committee Session
Select Target
Select Personas
Add Evidence
Ask Follow-up
Mark Strong Argument
Mark Weak Argument
Generate Memo
Submit Memo to Governance
Create Research Task
Create Training Example
```

## 12.6 Naturally Captured Data

```text
Disagreements among personas
Which arguments users adopt
Which risk objections are valuable
Whether committee memos help review approval
Which personas provide useful objections
```

## 12.7 Artifacts Sent to Management Console

```text
CommitteeMemo
ReviewEvidence
ResearchTaskRequest
RiskFeedback
TrainingExample
```

---

# 13. W7 — Decision Journal Workflow

## 13.1 Users

```text
Trader
Analyst
Portfolio Observer
```

## 13.2 Purpose

Capture the real decision logic and rationale of traders and analysts.  
This is a high-value data source.

## 13.3 Primary Flow

```text
1. User creates a decision entry.
2. User links a strategy, signal, alert, or market event.
3. User records decision, rationale, confidence, and expected outcome.
4. User asks a persona if needed.
5. User sets a follow-up date.
6. User later marks actual outcome.
7. System converts decision and outcome into training, ranking, or strategy improvement signals.
```

## 13.4 Journal Entry Fields

```text
Date
Linked Strategy
Linked Signal
Linked Market Event
Decision
Rationale
Confidence
Expected Outcome
Risk Concern
Personas Consulted
Follow-up Date
Actual Outcome
Outcome Review
```

## 13.5 User Actions

```text
Create Decision Entry
Link Signal
Link Strategy
Ask Persona
Add Rationale
Set Confidence
Schedule Follow-up
Mark Outcome
Convert to Insight
Convert to Training Example
Create Strategy Improvement Request
```

## 13.6 Naturally Captured Data

```text
Real trader decision logic
Relationship between trader confidence and outcome
Whether AI advice was adopted
Whether AI advice improved outcomes
Which strategies frequently need human override
```

## 13.7 Artifacts Sent to Management Console

```text
DecisionJournalEntry
TraderJudgementSignal
PersonaTrustSignal
StrategyImprovementRequest
TrainingExample
```

---

# 14. W8 — Alert Triage Workflow

## 14.1 Users

```text
Trader
Analyst
Risk Officer observer
```

## 14.2 Purpose

Let analysts and traders help determine whether alerts are important and add market context.

Management Console handles formal incident management.  
Agora Alert Triage captures human judgment and explanation.

## 14.3 Primary Flow

```text
1. User sees an alert.
2. System shows alert summary, strategy context, market context, persona explanation, and similar incidents.
3. User marks the alert as noise / important / needs investigation / escalate.
4. User adds trader interpretation.
5. User asks a persona or starts a committee.
6. If escalated, the alert is sent to Management Console Incident Center.
```

## 14.4 User Actions

```text
Acknowledge
Dismiss as Noise
Mark Important
Needs Investigation
Ask Persona
Start Committee
Add Trader Interpretation
Escalate to Incident
Create Research Task
```

## 14.5 Naturally Captured Data

```text
Which alerts are noise
Which alerts are truly important
How traders assess severity
Which alert patterns need new rules
Which persona explanations help triage
```

## 14.6 Artifacts Sent to Management Console

```text
AlertTriageRecord
RiskFeedback
IncidentEscalationRequest
ResearchTaskRequest
PostmortemInput
```

---

# 15. W9 — Insight Inbox Workflow

## 15.1 Users

```text
Analyst
Trader
Research Assistant
AI Trainer
```

## 15.2 Purpose

Centralize insight candidates naturally generated from Agora workflows.

## 15.3 Insight Sources

```text
Trader Note
Signal Feedback
Research Notebook
Persona Answer
Committee Discussion
Alert Triage
Decision Journal
Market Annotation
Postmortem Input
```

## 15.4 Primary Flow

```text
1. System collects insight candidates.
2. User reviews candidate.
3. User classifies and tags it.
4. User converts it into strategy idea, research task, training example, risk feedback, or archive.
5. Important items are handed off to Management Console.
```

## 15.5 User Actions

```text
Classify
Tag
Set Priority
Promote to Strategy Idea
Attach to Existing Strategy
Create Research Task
Create Training Example
Send to Committee
Archive
Dismiss
```

## 15.6 Artifacts Sent to Management Console

```text
Insight
StrategyIdeaProposal
ResearchTaskRequest
TrainingExample
RiskFeedback
```

---

# 16. W10 — AI Trainer Feedback Workflow

## 16.1 Users

```text
AI Trainer
Research Lead
Analyst
```

## 16.2 Purpose

Allow AI trainers to manage human feedback and convert it into training data, persona rule updates, or evaluation cases.

## 16.3 Feedback Sources

```text
Persona response marked incorrect
Trader correction
Analyst correction
Signal explanation disagreement
Committee weak argument
Memory conflict
Bad tool use
Policy violation
```

## 16.4 Primary Flow

```text
1. System collects feedback items.
2. AI trainer reviews.
3. AI trainer chooses: ignore / create training example / update behavior rule / create eval case / request persona policy change.
4. If the change affects an active persona version, it is submitted to Management Console approval.
```

## 16.5 User Actions

```text
Accept Feedback
Reject Feedback
Create Training Example
Create Evaluation Case
Update Draft Behavior Rule
Submit Persona Update Request
Mark Duplicate
Archive
```

## 16.6 Artifacts Sent to Management Console

```text
TrainingExample
PersonaUpdateRequest
EvaluationCase
PolicyReviewRequest
```

---

# 17. W11 — Memory Review Workflow

## 17.1 Users

```text
AI Trainer
Analyst
Research Lead
```

## 17.2 Purpose

Manage whether AI persona memory should be saved, modified, merged, moved, or deleted.

## 17.3 Memory Types

```text
Persona Private Memory
Shared Knowledge Memory
Trader Feedback Memory
Research Memory
Do-Not-Remember Item
Sensitive Memory
```

## 17.4 Memory Statuses

```text
proposed
approved
rejected
edited
merged
moved
deprecated
deleted
sensitive
```

## 17.5 User Actions

```text
Approve Memory
Reject Memory
Edit Memory
Merge Memory
Move to Private
Move to Shared
Mark Sensitive
Mark Do-Not-Remember
Delete Memory
Resolve Conflict
```

## 17.6 Artifacts Sent to Management Console

```text
MemoryApprovalEvent
MemoryPolicyEvent
PersonaMemoryUpdate
SharedKnowledgeUpdate
```

---

# 18. W12 — Skill Coaching Workflow

## 18.1 Users

```text
AI Trainer
Analyst
Capability Admin observer
```

## 18.2 Purpose

Turn daily user needs into skill drafts without directly activating production skills.  
Formal approval must happen in Management Console Skill Management.

## 18.3 Primary Flow

```text
1. User creates a skill idea from a conversation, note, or repeated task.
2. AI generates a skill draft.
3. AI trainer edits skill description, expected input/output, and risk notes.
4. Agora performs sandbox preview.
5. User submits the draft to Management Skill Approval.
```

## 18.4 User Actions

```text
Create Skill Idea
Generate Skill Draft
Edit Draft
Define Expected Inputs
Define Expected Outputs
Add Risk Notes
Run Sandbox Preview
Submit to Skill Approval
Archive Draft
```

## 18.5 Artifacts Sent to Management Console

```text
SkillDraft
SkillApprovalRequest
CapabilityRequest
ToolRequirementRequest
```

## 18.6 Prohibited Actions

Agora Skill Coaching must not directly:

```text
approve skill
assign production skill to persona
grant MCP permission
deploy skill into live runtime
```

---

# 19. W13 — Persona Lab Workflow

## 19.1 Users

```text
AI Trainer
Research Lead
Admin observer
```

## 19.2 Purpose

Create or test persona drafts, then submit them to Management Console for formal activation and policy approval.

## 19.3 Primary Flow

```text
1. Create a persona draft or clone an existing persona.
2. Set role, style, risk appetite, and research preference.
3. Test the persona with scenario tests.
4. Compare with existing persona versions.
5. Generate a persona activation proposal.
6. Submit proposal to Management Console approval.
```

## 19.4 User Actions

```text
Create Persona Draft
Clone Persona
Edit Draft Rules
Run Simulation
Run Scenario Test
Compare Versions
Generate Persona Proposal
Submit to Management Approval
Archive Draft
```

## 19.5 Artifacts Sent to Management Console

```text
PersonaDraft
PersonaActivationRequest
PersonaVersionProposal
RoutePolicyDraft
```

---

# 20. W14 — Evaluation Workflow

## 20.1 Users

```text
AI Trainer
Research Lead
Reviewer
```

## 20.2 Purpose

Evaluate persona quality across different task types.

## 20.3 Evaluation Types

```text
Risk Caution Suite
Evidence Quality Suite
Tool Use Suite
Hallucination Suite
Trading Scenario Suite
Committee Debate Suite
Memory Consistency Suite
Signal Explanation Suite
```

## 20.4 Primary Flow

```text
1. Select persona version.
2. Select evaluation suite.
3. Run evaluation.
4. Review failures.
5. Convert failures into training examples or behavior rule updates.
6. If a new version passes, submit it to Management Console approval.
```

## 20.5 Artifacts Sent to Management Console

```text
EvaluationRun
EvaluationFailure
PersonaVersionProposal
TrainingExample
```

---

# 21. W15 — Channel / External Conversation Workflow

## 21.1 Users

```text
Trader
Analyst
AI Trainer
Admin
```

## 21.2 Purpose

Support Web, Telegram, Discord, or other conversation channels, while ensuring no high-risk action is executed directly from an external channel.

## 21.3 Channel Types

```text
Web Agora
Telegram
Discord
Webhook
Optional Slack / Email
```

## 21.4 Management / Usage Flow

```text
1. User interacts with a persona through an external channel.
2. System syncs the conversation into an Agora session.
3. User can create insights, training examples, or notes from the conversation.
4. If external channel attempts a high-risk action, system creates a request only; it does not execute the action.
```

## 21.5 Artifacts Sent to Management Console

```text
ChannelSession
ExternalInsight
TrainingExample
ActionRequest
```

---

# 22. W16 — Agora → Management Handoff Workflow

## 22.1 Purpose

Move useful work products created in Agora into formal Management Console workflows.

## 22.2 Handoff Types

```text
Insight → Management Insight Queue
Strategy Idea → Strategy / Alpha Management
Research Task → Research & Experiments
Committee Memo → Governance Review Evidence
Training Example → Persona Training Governance
Memory Update → Persona Memory Governance
Skill Draft → Skill Management Approval
MCP Tool Request → MCP Management Approval
Risk Feedback → Risk Center / Incident Center
Decision Journal Outcome → Performance / Persona Evaluation
```

## 22.3 Handoff Statuses

```text
draft
submitted
accepted
rejected
converted
archived
```

## 22.4 User Actions

```text
Submit to Management
Set Priority
Assign Target Object
Add Rationale
Attach Evidence
Withdraw Submission
View Management Status
```

## 22.5 Required UX

Agora users must be able to see:

```text
Where did my submitted insight go?
Was my strategy idea accepted?
Was my training feedback adopted?
Did my signal disagreement become a research task?
```

Therefore Agora needs a `My Submissions` view or handoff status inside Insight Inbox.

---

# 23. Natural Data Capture Design

Agora should not ask users to fill out long forms.  
It should convert daily work actions into structured events.

## 23.1 Captured Events

```text
signal_feedback
persona_response_feedback
trader_note_created
research_note_created
decision_journal_created
alert_triage_recorded
committee_memo_generated
memory_review_decision
training_example_created
skill_draft_created
insight_promoted
```

## 23.2 Example: Signal Feedback

```json
{
  "eventType": "signal_feedback",
  "actorType": "trader",
  "actorId": "trader_001",
  "targetType": "signal",
  "targetId": "signal_9821",
  "linkedStrategyId": "alpha_042",
  "feedback": "disagree",
  "reason": "Market regime appears different after the macro event.",
  "confidence": 0.72,
  "createdAt": "2026-05-03T09:30:00Z"
}
```

## 23.3 Example: Persona Response Feedback

```json
{
  "eventType": "persona_response_feedback",
  "personaId": "persona_A",
  "sessionId": "session_123",
  "linkedStrategyId": "alpha_017",
  "rating": "useful",
  "usedForDecision": true,
  "convertedToNote": true,
  "createdAt": "2026-05-03T09:35:00Z"
}
```

---

# 24. Agora Permission Principles

## 24.1 Agora Can Create Requests

Agora users can create:

```text
ResearchTaskRequest
StrategyIdeaProposal
SkillApprovalRequest
MCPToolRequest
RiskReviewRequest
PersonaUpdateRequest
```

## 24.2 Agora Must Not Execute High-Risk Actions Directly

Not allowed:

```text
direct live deployment
direct rollback
direct capital rebalance
direct route policy activation
direct MCP production grant
direct skill production approval
```

## 24.3 Role-Specific UX

```text
Trader: Signal Review, Alert Triage, Decision Journal, Ask Personas
Analyst: Notebook, Market Watchlist, Insight Inbox, Committee
AI Trainer: Trainer Studio, Memory Review, Skill Coaching, Persona Lab, Evaluations
Observer: read-only views
```

---

# 25. Agora i18n / Language Requirements

Agora must support:

```text
zh-TW
en-US
```

UI copy must use translation keys.  
User-generated content should not be force-translated, but the UI may provide:

```text
Translate View
Summarize in Current Language
```

AI persona responses should follow session language:

```text
Follow UI Language
zh-TW
en-US
Mixed / Original
```

---

# 26. Implementation Notes for Lovable

Part 5 will detail page specs, but Lovable should understand the following from Part 4:

```text
1. Agora is an analyst/trader workbench, not an AI admin panel.
2. Daily Trading Cockpit is the Agora home page.
3. Chat is not the only interaction form. Signal review, notebook, journal, and triage are required.
4. Every workflow should produce a structured artifact.
5. Agora must not directly execute high-risk Management Console operations.
6. Agora must show status for submissions sent to Management Console.
7. AI Trainer functions must exist, but they should not dominate trader/analyst daily entry points.
```

---

# 27. Part 4 Acceptance Criteria

After this Part 4 specification, Part 5 must ensure that:

```text
Agora has clear trader / analyst / AI trainer workflows.
Daily Trading Cockpit is the primary entry point.
Signal Review captures agree / disagree / rationale.
Research Notebook can convert notes into insight / strategy idea / experiment request.
Ask Personas supports context-aware Q&A.
Committee Room produces committee memos.
Decision Journal captures decision rationale and outcomes.
Alert Triage can send human alert judgment back to Management Console.
Insight Inbox processes insight candidates created from daily work.
Trainer Studio / Memory Review / Skill Coaching / Persona Lab exist but are not the only Agora focus.
All high-risk actions in Agora create requests only and do not execute directly.
All key interactions produce structured events.
Agora supports zh-TW / en-US language switching.
```

---

# 28. Next Document

The next document is:

```text
Part 5 — Pantheon Agora Workbench Page & Feature Design
```

Part 5 will convert these workflows into Lovable-ready page specifications, including:

```text
routes
layouts
components
tables
cards
drawers
chat/session canvas
signal review panel
notebook editor
decision journal editor
committee room UI
BFF APIs
realtime events
empty/loading/error states
role-based UX
acceptance criteria
```


---

# Part 5 — Agora Workbench Page & Feature Design
Version: v1.0  
Locale: English (en-US)  
Audience: Lovable, frontend engineering, product design, BFF design  
Related documents:
- Part 1 — Master Blueprint
- Part 4 — Agora Workbench User Workflow Inventory

---

## 1. Purpose of This Document

This document converts the Agora Workbench user workflows from Part 4 into concrete page-level frontend specifications that Lovable can start building.

The primary users of Agora are not Pantheon administrators. They are:

```text
Analysts
Traders
AI Trainers
Research Assistants
Portfolio Observers
```

Therefore, Agora must not feel like an admin backend or a training-data database. It should feel like a practical AI-assisted workspace for daily market research, signal review, persona collaboration, decision journaling, and insight capture.

Agora's core purpose is to:

```text
Help users understand markets
Help users review strategy signals
Help users ask AI personas contextual questions
Help users write research notes
Help users record trading decisions
Help users triage alerts
Help AI trainers review feedback, memory, and skill drafts
Naturally generate insights, training examples, research tasks, and strategy proposals from daily work
```

Agora must not directly execute high-risk management operations:

```text
No direct live strategy deployment
No direct capital rebalance application
No direct ranking formula changes
No direct production MCP / Tool / Skill authorization
No direct live capital allocation changes
No direct live strategy rollback
```

Agora may create requests, proposals, insights, memos, and training feedback that are handed off to the Management Console for formal review and approval.

---

## 2. Agora Product Principles

### 2.1 Workflow-first, not admin-first

Agora should start from the user's real daily workflow, not from system object management.

Primary workflows:

```text
Daily market and strategy briefing
Market and watchlist analysis
Strategy signal review
Research notes
Ask AI personas
Multi-persona committee sessions
Trading decision journal
Alert triage
Insight inbox
AI training and memory review
```

### 2.2 AI-assisted, but not chat-only

AI persona interaction is important, but Agora should not be a single chat box. Different tasks require different interfaces:

```text
Signal Review uses a signal panel + persona commentary
Research Notebook uses an editor + AI sidecar
Committee uses structured discussion rounds
Decision Journal uses a structured decision form
Alert Triage uses alert context + action cards
Ask Personas is the full conversation interface
```

### 2.3 Capture high-quality data naturally

Agora should capture useful signals from normal user behavior:

```text
agree / disagree with signal
flag suspicious signal
write trader note
ask persona
mark AI answer useful / not useful
convert note to insight
create research task
start committee
record decision outcome
correct persona response
approve / reject memory
```

These interactions should produce structured events that can be used by Management Console, persona training, strategy improvement, and risk review.

### 2.4 User-friendly and low-friction

Agora should be easier and less dense than the Management Console:

```text
Use fewer dense tables
Use cards, contextual panels, notes, timelines, conversations, and quick annotations
Keep one-click conversion to insight / research task / training example
Hide complex management workflows behind handoff drawers
```

---

## 3. Agora Workbench Navigation

Route group:

```text
/agora
```

Recommended sidebar grouping:

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
- Channels
```

Full route list:

```text
/agora/daily
/agora/markets
/agora/watchlist
/agora/signals
/agora/signals/:signalId
/agora/notebook
/agora/notebook/:noteId
/agora/ask
/agora/sessions/:sessionId
/agora/committee
/agora/committee/:sessionId
/agora/journal
/agora/journal/:entryId
/agora/triage
/agora/triage/:alertId
/agora/insights
/agora/trainer
/agora/trainer/:personaId
/agora/memory
/agora/skill-coaching
/agora/skill-coaching/:draftId
/agora/persona-lab
/agora/persona-lab/:draftPersonaId
/agora/evaluations
/agora/evaluations/:evaluationId
/agora/channels
```

---

## 4. Shared Agora Layout

### 4.1 Base Page Structure

```text
Global Top Bar
├── Product Switcher
├── Current Locale
├── Search
├── BFF Status
├── Notifications
└── User Menu

Agora Sidebar
├── Daily Work
├── Research
├── AI Collaboration
├── Training
└── Channels

Main Canvas
└── Page-specific content

Right Context Panel / Drawer
├── Selected entity inspector
├── Persona sidecar
├── Insight conversion
├── Training feedback
└── Linked objects
```

### 4.2 Right Context Panel Types

Agora pages should share a contextual right panel.

Supported panel types:

```text
Signal Inspector
Market Inspector
Persona Inspector
Message Inspector
Note Inspector
Alert Inspector
Insight Conversion Panel
Training Feedback Panel
Linked Strategy Panel
```

### 4.3 Global Quick Actions

All Agora pages should support quick actions:

```text
Ask Persona
Create Note
Create Insight
Create Research Task
Start Committee
Create Training Example
Attach to Strategy
Send to Management
```

Action availability is driven by `availableActions` returned by the BFF.

---

## 5. Page Spec Format

Each page below uses the following structure:

```text
Page Name
Route
Primary Users
Goal
Main User Value
Layout
Primary Data
Main Components
Primary Actions
Secondary Actions
Captured Signals
BFF APIs
Realtime Events
Empty State
Loading State
Error State
Permission Rules
Acceptance Criteria
```

---

# 6. Daily Trading Cockpit

## Route

```text
/agora/daily
```

## Primary Users

```text
Analyst
Trader
Research Assistant
Portfolio Observer
```

## Goal

Give analysts and traders a daily starting point that immediately shows what matters today.

## Main User Value

```text
Users can see market summaries, strategy signals, risk alerts, persona briefs, and open research questions without jumping across multiple pages.
```

## Layout

```text
Header: date, trading day status, market timezone, session language
Top Cards:
- Market Brief
- Strategy Signals Needing Review
- Open Alerts
- Persona Daily Brief
- Watchlist Changes

Main Grid:
Left: Daily Brief Feed
Center: Priority Work Queue
Right: Persona Suggestions / Quick Ask
Bottom: Recent Notes / Decisions / Insights
```

## Main Components

```text
DailyBriefCard
MarketSummaryCard
PrioritySignalCard
OpenAlertCard
PersonaBriefCard
WatchlistChangeCard
DailyWorkQueue
QuickAskPersonaBox
RecentInsightList
```

## Primary Actions

```text
Review Signal
Ask Persona
Create Trader Note
Create Insight
Create Research Task
Start Committee
Open Alert Triage
Dismiss Item
Mark Important
```

## Captured Signals

```text
which cards user opens
which alerts user dismisses
which signals user reviews
which persona briefs user expands
which items are marked important
which items are converted to insight / task
```

## BFF APIs

```text
GET /bff/agora/daily
POST /bff/agora/insights
POST /bff/agora/research-tasks
POST /bff/agora/events/interaction
POST /bff/agora/sessions
```

## Realtime Events

```text
market.brief_updated
signal.created
risk.alert_created
persona.brief_ready
job.completed
```

## Empty State

```text
No priority items for today. You can review your Watchlist, open the Research Notebook, or ask a Persona.
```

## Loading State

Show skeleton cards.

## Error State

```text
Unable to load the daily brief. Please check the BFF connection or try again later.
```

## Permission Rules

```text
Trader: can review signals, write notes, create insights, ask personas
Analyst: can create research tasks, notes, and insights
Observer: read-only plus personal notes
AI Trainer: can create training examples from AI responses
```

## Acceptance Criteria

```text
The page must show daily summary, priority queue, open alerts, and persona brief.
Each card must open a detail drawer.
Users can create an insight or research task from any priority item.
All text must support zh-TW and en-US.
```

---

# 7. Market & Watchlist

## Route

```text
/agora/markets
/agora/watchlist
```

## Primary Users

```text
Analyst
Trader
Research Assistant
```

## Goal

Provide a market observation and watchlist analysis workspace that helps users convert market intuition into usable insights.

## Layout

```text
Top: market filter / asset universe / time range
Left: watchlist table or card list
Center: selected market / asset context
Right: persona commentary and note sidecar
Bottom: related strategies / signals / alerts
```

## Main Components

```text
WatchlistTable
MarketEventFeed
AssetContextCard
RelatedStrategyList
RelatedSignalList
PersonaCommentaryPanel
TraderAnnotationBox
```

## Primary Actions

```text
Add Watchlist Item
Remove Watchlist Item
Add Market Note
Ask Why Moved
Ask Related Strategies
Create Insight
Create Strategy Idea
Attach to Existing Strategy
Start Committee
```

## Captured Signals

```text
watchlist additions
asset notes
market regime tags
ask-persona topics
insight conversions
```

## BFF APIs

```text
GET /bff/agora/markets
GET /bff/agora/watchlist
POST /bff/agora/watchlist
POST /bff/agora/market-notes
POST /bff/agora/insights
GET /bff/agora/assets/:assetId/context
```

## Realtime Events

```text
market.event_created
watchlist.updated
signal.created
risk.alert_created
```

## Empty State

```text
No Watchlist yet. Add markets or assets you care about, and Agora will help track related strategies, signals, and events.
```

## Acceptance Criteria

```text
Users can add watchlist items.
Users can add notes to markets or assets.
Users can convert a note into an insight.
The persona commentary panel must support switching personas.
```

---

# 8. Strategy Signal Review

## Routes

```text
/agora/signals
/agora/signals/:signalId
```

## Primary Users

```text
Trader
Analyst
Research Assistant
```

## Goal

Let traders and analysts review strategy signals, judge whether they make sense, and naturally capture human judgment.

## Signal List Layout

```text
Header: filters by strategy, asset, severity, review status
Main: signal review queue
Right: selected signal quick inspector
```

## Signal Detail Layout

```text
Header: Signal ID, strategy, asset, direction, confidence, timestamp
Top Summary: signal explanation, risk tags, review status
Tabs:
- Explanation
- Market Context
- Similar Historical Cases
- Persona Opinions
- Trader Feedback
- Linked Research Tasks
- Audit
Right Panel:
- Agree / Disagree / Flag
- Ask Persona
- Create Research Task
- Attach Rationale
```

## Main Components

```text
SignalQueueTable
SignalExplanationPanel
MarketContextPanel
SimilarCaseList
PersonaOpinionCards
TraderFeedbackForm
SignalReviewActionBar
ResearchTaskCreationDrawer
```

## Primary Actions

```text
Agree
Disagree
Flag Suspicious
Ask Persona
Ask Committee
Create Research Task
Attach Trader Rationale
Convert to Insight
Mark Follow-up Needed
```

## Captured Signals

```text
signal_agree
signal_disagree
flag_reason
trader_rationale
persona_opinion_selected
research_task_created
committee_started
```

## BFF APIs

```text
GET /bff/agora/signals
GET /bff/agora/signals/:signalId
POST /bff/agora/signals/:signalId/feedback
POST /bff/agora/signals/:signalId/flag
POST /bff/agora/signals/:signalId/research-task
POST /bff/agora/signals/:signalId/ask-persona
POST /bff/agora/committee-sessions
```

## Realtime Events

```text
signal.created
signal.updated
persona.response_ready
research_task.created
```

## Empty State

```text
There are no signals requiring review.
```

## Error State

```text
Unable to load signal detail. Please try again later.
```

## Permission Rules

```text
Trader: can agree / disagree / flag / attach rationale
Analyst: can create research tasks / insights
AI Trainer: can convert incorrect AI explanations into training examples
Observer: read-only
```

## Acceptance Criteria

```text
Signal detail must show explanation, market context, and persona opinions.
Agree / Disagree must support selecting or entering a reason.
Flag Suspicious must create a structured feedback event.
Users can create a research task from a signal.
```

---

# 9. Research Notebook

## Routes

```text
/agora/notebook
/agora/notebook/:noteId
```

## Primary Users

```text
Analyst
Trader
Research Assistant
AI Trainer
```

## Goal

Let users write research notes, market observations, and trading hypotheses, then convert them into insights, strategy ideas, experiment requests, or training examples.

## Layout

```text
Notebook List:
- filter by tag, strategy, asset, author, note type
- note cards / table toggle

Notebook Detail:
Left: note editor
Right: AI sidecar / linked entities / conversion actions
Bottom: version history / comments
```

## Main Components

```text
NotebookList
NoteTypeBadge
MarkdownEditor
StructuredFieldsPanel
LinkedEntityPanel
AIAssistSidecar
InsightConversionDrawer
NoteVersionHistory
```

## Note Types

```text
Market Observation
Strategy Hypothesis
Risk Concern
Model Failure
Paper Summary
Postmortem Thought
Trader Intuition
Training Feedback
```

## Primary Actions

```text
Create Note
Edit Note
Ask Persona to Expand
Ask Persona to Critique
Convert to Insight
Convert to Strategy Idea
Convert to Experiment Request
Convert to Training Example
Attach to Strategy
Attach to Signal
Send to Committee
```

## Captured Signals

```text
note_type
linked_strategy
linked_signal
hypothesis_tags
conversion_action
AI assistance accepted / rejected
```

## BFF APIs

```text
GET /bff/agora/notes
POST /bff/agora/notes
GET /bff/agora/notes/:noteId
PATCH /bff/agora/notes/:noteId
POST /bff/agora/notes/:noteId/actions/convert-insight
POST /bff/agora/notes/:noteId/actions/convert-strategy-idea
POST /bff/agora/notes/:noteId/actions/convert-experiment-request
POST /bff/agora/notes/:noteId/actions/ask-persona
```

## Realtime Events

```text
note.updated
persona.response_ready
insight.created
research_task.created
```

## Empty State

```text
No research notes yet. Create your first market observation, strategy hypothesis, or risk concern.
```

## Acceptance Criteria

```text
The page must support a Markdown editor.
Users can assign a note type.
Users can link strategies, signals, and assets.
Users can convert notes into insights, strategy ideas, or experiment requests.
AI sidecar cannot automatically change note content; user must accept suggestions.
```

---

# 10. Ask Personas

## Route

```text
/agora/ask
/agora/sessions/:sessionId
```

## Primary Users

```text
Analyst
Trader
AI Trainer
Research Assistant
```

## Goal

Provide context-aware AI persona conversations, not generic chat.

## Layout

```text
Left: session list / saved contexts
Center: conversation canvas
Right: context panel + persona panel + conversion actions
Top: persona selector, context selector, response mode, language selector
```

## Main Components

```text
PersonaSelector
ContextPicker
ResponseModeSelector
ConversationCanvas
MessageAnnotationBar
PersonaMemoryHint
SessionLanguageSelector
ConversionActionDrawer
```

## Context Types

```text
Strategy
Signal
Market / Asset
Alert
Incident
Research Note
Decision Journal Entry
Experiment
Artifact
```

## Response Modes

```text
Explain
Critique
Propose
Red-Team
Summarize
Compare
Find Risk
Suggest Experiment
```

## Primary Actions

```text
Ask Persona
Ask Another Persona
Save as Note
Create Insight
Create Training Example
Attach to Strategy
Start Committee
Mark Useful
Mark Not Useful
Flag Incorrect
```

## Captured Signals

```text
question_intent
context_type
persona_selected
response_mode
useful / not useful
converted_to_note
converted_to_training_example
```

## BFF APIs

```text
GET /bff/agora/personas/available
POST /bff/agora/sessions
GET /bff/agora/sessions/:sessionId
POST /bff/agora/sessions/:sessionId/messages
POST /bff/agora/messages/:messageId/feedback
POST /bff/agora/messages/:messageId/actions/create-note
POST /bff/agora/messages/:messageId/actions/create-insight
POST /bff/agora/messages/:messageId/actions/create-training-example
```

## Realtime Events

```text
session.message_created
persona.response_stream
persona.response_ready
message.feedback_recorded
```

## Empty State

```text
Select a persona and context to start asking questions.
```

## Permission Rules

```text
AI Trainer: can create training examples
Trader / Analyst: can create notes, insights, and research tasks
Observer: read-only sessions
```

## Acceptance Criteria

```text
Ask Personas must require a selected persona or a default persona.
Context selection must be supported.
Every AI response must support Useful / Not Useful / Flag Incorrect.
Users can create notes, insights, and training examples from responses.
Session language must follow current locale unless overridden.
```

---

# 11. Committee Room

## Routes

```text
/agora/committee
/agora/committee/:sessionId
```

## Primary Users

```text
Analyst
Trader
Research Lead
AI Trainer
```

## Goal

Provide structured multi-persona debate for strategy review, signal doubt, alert triage, incident analysis, and research decisions.

## Layout

```text
Committee List:
- open sessions
- recent memos
- templates

Committee Detail:
Header: target object, objective, participants, status
Left: agenda / evidence pack
Center: round-based discussion
Right: decision / memo / follow-up actions
Bottom: timeline and artifacts
```

## Main Components

```text
CommitteeTemplatePicker
ParticipantPersonaSelector
EvidencePackPanel
RoundTableConversation
DisagreementCapturePanel
VoteRecommendationPanel
CommitteeMemoEditor
FollowUpActionPanel
```

## Committee Templates

```text
Signal Trustworthiness Review
Strategy Promotion Debate
Risk Incident Analysis
Market Regime Debate
Postmortem Review
Alpha Idea Red-Team
```

## Primary Actions

```text
Create Committee Session
Add Persona
Add Evidence
Start Round
Ask Follow-up
Capture Objection
Generate Memo
Submit Memo to Governance
Create Research Task
Create Insight
Close Session
```

## Captured Signals

```text
persona_disagreement
objection_type
accepted_argument
trader_follow_up
memo_submitted
research_task_created
```

## BFF APIs

```text
GET /bff/agora/committee-sessions
POST /bff/agora/committee-sessions
GET /bff/agora/committee-sessions/:sessionId
POST /bff/agora/committee-sessions/:sessionId/rounds
POST /bff/agora/committee-sessions/:sessionId/memo
POST /bff/agora/committee-sessions/:sessionId/actions/submit-governance
```

## Realtime Events

```text
committee.round_started
committee.persona_response_ready
committee.memo_generated
committee.submitted_to_governance
```

## Empty State

```text
No committee sessions yet. You can create one from a signal, strategy, alert, or research note.
```

## Acceptance Criteria

```text
Committee sessions must support a target object.
Users must be able to select multiple personas.
The session must be able to generate a memo.
The memo can be submitted to Management Console as Governance / Review evidence.
```

---

# 12. Decision Journal

## Routes

```text
/agora/journal
/agora/journal/:entryId
```

## Primary Users

```text
Trader
Analyst
Portfolio Observer
```

## Goal

Capture real trading judgment, confidence, rationale, and outcomes as high-value training and strategy improvement data.

## Layout

```text
List View:
- entries by date, strategy, asset, outcome, confidence

Detail View:
- structured decision form
- linked signal / strategy / market
- AI personas consulted
- follow-up outcome
- conversion actions
```

## Main Components

```text
DecisionJournalList
DecisionEntryEditor
ConfidenceSlider
LinkedObjectPicker
OutcomeTracker
PersonaConsultationSummary
FollowUpScheduler
```

## Entry Fields

```text
Date
Market Context
Linked Strategy
Linked Signal
Decision
Rationale
Confidence
Expected Outcome
Risk Concern
Personas Consulted
Follow-up Date
Actual Outcome
Lesson Learned
```

## Primary Actions

```text
Create Decision Entry
Link Signal
Link Strategy
Ask Persona
Schedule Follow-up
Mark Outcome
Convert to Insight
Convert to Training Example
Create Research Task
```

## Captured Signals

```text
decision_rationale
confidence_score
actual_outcome
AI_advice_used
human_override_reason
lesson_learned
```

## BFF APIs

```text
GET /bff/agora/decision-journal
POST /bff/agora/decision-journal
GET /bff/agora/decision-journal/:entryId
PATCH /bff/agora/decision-journal/:entryId
POST /bff/agora/decision-journal/:entryId/actions/convert-insight
POST /bff/agora/decision-journal/:entryId/actions/create-training-example
```

## Acceptance Criteria

```text
Users can create structured decision entries.
Confidence and actual outcome must be supported.
Entries can link signals and strategies.
Entries can be converted into insights or training examples.
```

---

# 13. Alert Triage

## Routes

```text
/agora/triage
/agora/triage/:alertId
```

## Primary Users

```text
Trader
Analyst
Research Assistant
```

## Goal

Let analysts and traders help judge the market and strategy meaning of alerts, producing useful risk feedback.

## Layout

```text
Alert Queue:
- severity, source, strategy, status

Alert Detail:
Header: alert severity, linked strategy, runtime, time
Left: alert detail and timeline
Center: market / strategy context
Right: persona explanation and triage actions
Bottom: similar past alerts / incidents
```

## Main Components

```text
AlertQueue
AlertDetailCard
MarketContextForAlert
StrategyContextForAlert
PersonaAlertExplanation
SimilarIncidentList
TriageActionPanel
```

## Primary Actions

```text
Acknowledge
Dismiss as Noise
Escalate to Incident
Ask Persona
Start Committee
Add Trader Interpretation
Create Research Task
Create Risk Feedback
```

## Captured Signals

```text
alert_importance_label
noise_label
trader_interpretation
escalation_reason
persona_explanation_usefulness
```

## BFF APIs

```text
GET /bff/agora/alerts
GET /bff/agora/alerts/:alertId
POST /bff/agora/alerts/:alertId/actions/acknowledge
POST /bff/agora/alerts/:alertId/actions/dismiss
POST /bff/agora/alerts/:alertId/actions/escalate
POST /bff/agora/alerts/:alertId/notes
POST /bff/agora/alerts/:alertId/research-task
```

## Realtime Events

```text
risk.alert_created
risk.alert_updated
incident.created
persona.response_ready
```

## Permission Rules

```text
Agora users may triage or escalate, but cannot pause or roll back directly.
Pause and rollback must be performed in Management Console.
```

## Acceptance Criteria

```text
Alert detail must show market context, strategy context, and similar past incidents.
Dismiss must support selecting or entering a reason.
Escalate must create an incident request or handoff to Management Console.
```

---

# 14. Insight Inbox

## Route

```text
/agora/insights
```

## Primary Users

```text
Analyst
Trader
Research Assistant
AI Trainer
```

## Goal

Centralize insight candidates naturally generated by Agora usage.

## Layout

```text
Top: filters by source, type, priority, linked strategy, status
Main: insight candidate list
Right: selected insight detail and conversion actions
```

## Insight Sources

```text
Signal Review
Research Notebook
Ask Personas
Committee Room
Decision Journal
Alert Triage
Market Watchlist
Trainer Feedback
```

## Primary Actions

```text
Promote to Strategy Idea
Attach to Existing Strategy
Create Research Task
Create Training Example
Send to Management Console
Archive
Merge Duplicate
Set Priority
Assign Persona
```

## Captured Signals

```text
which insights are promoted
which are archived
which source generates useful insights
priority assigned by human
linked strategy
```

## BFF APIs

```text
GET /bff/agora/insights
GET /bff/agora/insights/:insightId
PATCH /bff/agora/insights/:insightId
POST /bff/agora/insights/:insightId/actions/promote-strategy
POST /bff/agora/insights/:insightId/actions/create-research-task
POST /bff/agora/insights/:insightId/actions/send-management
POST /bff/agora/insights/:insightId/actions/archive
```

## Acceptance Criteria

```text
Insight Inbox must support filtering by source.
Each insight can be converted into a strategy idea, research task, or training example.
After sending to Management Console, insight status must update to submitted_to_management.
```

---

# 15. Trainer Studio

## Routes

```text
/agora/trainer
/agora/trainer/:personaId
```

## Primary Users

```text
AI Trainer
Research Lead
```

## Goal

Manage AI persona behavior rules, feedback queue, training examples, evaluation results, and drift.

## Layout

```text
Persona selector
Persona training summary
Tabs:
- Behavior Rules
- Training Examples
- Feedback Queue
- Evaluation Suites
- Drift Monitor
- Version History
```

## Main Components

```text
PersonaTrainingHeader
BehaviorRuleEditor
TrainingExampleTable
FeedbackQueue
EvaluationSummaryCards
DriftMonitorChart
PersonaVersionHistory
SubmitPersonaUpdatePanel
```

## Primary Actions

```text
Edit Behavior Rule Draft
Add Training Example
Accept Feedback
Reject Feedback
Run Evaluation
Compare Persona Versions
Submit Persona Update to Management
Rollback Draft
```

## Captured Signals

```text
accepted_feedback
rejected_feedback
behavior_rule_change
evaluation_failure
persona_drift_signal
```

## BFF APIs

```text
GET /bff/agora/trainer/personas
GET /bff/agora/trainer/personas/:personaId
PATCH /bff/agora/trainer/personas/:personaId/draft-rules
POST /bff/agora/trainer/personas/:personaId/training-examples
POST /bff/agora/trainer/feedback/:feedbackId/actions/accept
POST /bff/agora/trainer/feedback/:feedbackId/actions/reject
POST /bff/agora/trainer/personas/:personaId/actions/run-evaluation
POST /bff/agora/trainer/personas/:personaId/actions/submit-management
```

## Permission Rules

```text
Only AI Trainer and Research Lead can edit behavior rules or submit persona updates.
Traders can create feedback but cannot edit persona rules.
```

## Acceptance Criteria

```text
Trainer Studio must show the feedback queue.
Feedback can be converted into training examples.
Persona rule changes remain draft until submitted to Management Console.
```

---

# 16. Memory Review

## Route

```text
/agora/memory
```

## Primary Users

```text
AI Trainer
Research Lead
Admin
```

## Goal

Review, merge, delete, move, and label AI persona memory.

## Layout

```text
Filters: persona, memory type, status, confidence, source
Main: memory queue table / cards
Right: memory detail, source message, actions
```

## Memory Types

```text
Core Rule
Private Note
Conversation Memory
Trader Feedback
Research Memory
Shared Knowledge
Do-Not-Remember
```

## Primary Actions

```text
Approve Memory
Reject Memory
Edit Memory
Merge Memory
Move to Shared
Move to Private
Mark Sensitive
Mark Do-Not-Remember
Delete Memory
Create Training Example
```

## BFF APIs

```text
GET /bff/agora/memory
GET /bff/agora/memory/:memoryId
POST /bff/agora/memory/:memoryId/actions/approve
POST /bff/agora/memory/:memoryId/actions/reject
PATCH /bff/agora/memory/:memoryId
POST /bff/agora/memory/:memoryId/actions/merge
POST /bff/agora/memory/:memoryId/actions/mark-sensitive
```

## Acceptance Criteria

```text
Memory items must show source session / message.
Approve / Reject actions must record reviewer and timestamp.
Sensitive memory must be clearly labeled.
```

---

# 17. Skill Coaching

## Routes

```text
/agora/skill-coaching
/agora/skill-coaching/:draftId
```

## Primary Users

```text
AI Trainer
Analyst
Capability Admin
```

## Goal

Convert user needs or AI conversation outputs into skill drafts. Skill drafts cannot be activated directly; they must be submitted to Management Console for Skill Approval.

## Layout

```text
Draft List:
- skill drafts by status, author, persona, risk

Draft Detail:
Header: draft name, status, risk estimate
Tabs:
- Requirement
- Draft Design
- Input / Output Schema
- Sandbox Test
- Risk Notes
- Management Handoff
```

## Draft Status

```text
idea
drafting
ready_for_sandbox
sandbox_failed
sandbox_passed
submitted_to_management
rejected
archived
```

## Primary Actions

```text
Create Skill Idea
Generate Draft
Edit Requirement
Edit Schema
Run Sandbox Test
Add Risk Note
Submit to Management Skill Approval
Archive Draft
```

## BFF APIs

```text
GET /bff/agora/skill-drafts
POST /bff/agora/skill-drafts
GET /bff/agora/skill-drafts/:draftId
PATCH /bff/agora/skill-drafts/:draftId
POST /bff/agora/skill-drafts/:draftId/actions/generate
POST /bff/agora/skill-drafts/:draftId/actions/sandbox
POST /bff/agora/skill-drafts/:draftId/actions/submit-management
```

## Acceptance Criteria

```text
Skill Coaching must not provide direct skill activation.
Submitting to Management must create a Management Skill Approval request.
Sandbox results must show pass / fail / logs.
```

---

# 18. Persona Lab

## Routes

```text
/agora/persona-lab
/agora/persona-lab/:draftPersonaId
```

## Primary Users

```text
AI Trainer
Research Lead
```

## Goal

Create, test, and compare persona drafts before submitting them to Management Console for formal approval.

## Layout

```text
Persona Draft List
Persona Draft Detail
Tabs:
- Identity
- Behavior Rules
- Simulations
- Evaluations
- Comparison
- Submit to Management
```

## Primary Actions

```text
Create Persona Draft
Clone Existing Persona
Edit Draft Rules
Run Simulation
Run Evaluation
Compare with Existing Persona
Submit Persona Draft to Management
Archive Draft
```

## BFF APIs

```text
GET /bff/agora/persona-drafts
POST /bff/agora/persona-drafts
GET /bff/agora/persona-drafts/:draftPersonaId
PATCH /bff/agora/persona-drafts/:draftPersonaId
POST /bff/agora/persona-drafts/:draftPersonaId/actions/run-simulation
POST /bff/agora/persona-drafts/:draftPersonaId/actions/run-evaluation
POST /bff/agora/persona-drafts/:draftPersonaId/actions/submit-management
```

## Acceptance Criteria

```text
Persona Lab only handles drafts.
No draft persona becomes active without Management approval.
Comparison view must show differences in behavior rules and evaluation scores.
```

---

# 19. Evaluations

## Routes

```text
/agora/evaluations
/agora/evaluations/:evaluationId
```

## Primary Users

```text
AI Trainer
Research Lead
Admin
```

## Goal

Manage persona evaluation suites and evaluation runs.

## Evaluation Suites

```text
Risk Caution Suite
Evidence Quality Suite
Tool Use Suite
Hallucination Suite
Trading Scenario Suite
Committee Debate Suite
Memory Consistency Suite
Language Consistency Suite
```

## Layout

```text
Evaluation Dashboard
Suite List
Run List
Evaluation Detail
Failure Cases
Suggested Fixes
```

## Primary Actions

```text
Run Evaluation
Compare Runs
Open Failure Case
Create Training Example
Create Persona Feedback
Submit Persona Update
```

## BFF APIs

```text
GET /bff/agora/evaluations
GET /bff/agora/evaluations/:evaluationId
POST /bff/agora/evaluations/actions/run
POST /bff/agora/evaluations/:evaluationId/actions/create-training-example
```

## Acceptance Criteria

```text
Evaluation detail must show score, failures, linked persona version, and suggested fixes.
Failure cases can be converted into training examples.
```

---

# 20. Channels

## Route

```text
/agora/channels
```

## Primary Users

```text
Admin
AI Trainer
Trader
Analyst
```

## Goal

Manage external entry points for Agora, such as Web, Telegram, Discord, and Webhook. This page manages Agora channels only, not Core live operations.

## Channel Types

```text
Web
Telegram
Discord
Webhook
Email / Slack optional
```

## Layout

```text
Channel list
Channel detail drawer
Permissions
Persona binding
Message retention
Audit
```

## Primary Actions

```text
Enable Channel
Disable Channel
Bind Persona
Set Allowed Users
Set Allowed Actions
Set Retention
View Channel Sessions
```

## BFF APIs

```text
GET /bff/agora/channels
GET /bff/agora/channels/:channelId
PATCH /bff/agora/channels/:channelId
POST /bff/agora/channels/:channelId/actions/enable
POST /bff/agora/channels/:channelId/actions/disable
```

## Acceptance Criteria

```text
Channels can only trigger Agora-safe actions.
No external channel can directly trigger live deployment, rollback, or capital rebalance.
```

---

# 21. Agora → Management Handoff Pattern

All high-risk or formal management actions from Agora must use a handoff flow.

## Handoff Types

```text
Insight → Management Insight Queue
Strategy Idea → Strategy discovered candidate
Research Task → Experiment / Research queue
Committee Memo → Governance evidence
Training Feedback → Persona update request
Skill Draft → Skill approval request
MCP Tool Request → MCP permission request
Alert Escalation → Incident request
```

## Handoff Drawer Fields

```text
Handoff Type
Source Object
Target Object
Summary
Evidence
Priority
Suggested Owner
Suggested Persona
Notes
Submit Button
```

## BFF API

```text
POST /bff/agora/handoffs
```

## Acceptance Criteria

```text
Every handoff must create a traceable record.
After successful handoff, Agora shows submitted status.
Management Console Command Center can display the incoming queue.
```

---

# 22. Localization Requirements

Agora must support:

```text
zh-TW
en-US
```

## Rules

```text
All navigation labels must use translation keys.
All buttons must use translation keys.
All status badges must use translation keys.
All empty/error/loading states must use translation keys.
User-generated content remains in the original language by default.
AI persona responses default to the current UI locale unless session language overrides it.
```

## Session Language Options

```text
Follow UI Language
zh-TW
en-US
Mixed / Original
```

## Translation-related BFF Rule

The BFF should return enum codes and label keys, not hardcoded Chinese or English labels.

---

# 23. Lovable Build Notes for Agora

Lovable should implement Agora as a friendly analyst/trader workspace.

Do:

```text
Use cards, panels, notebooks, conversation canvases, and review queues.
Make insight conversion one-click.
Make feedback lightweight.
Keep AI collaboration contextual.
Use mock BFF data.
Use translation keys.
```

Do not:

```text
Do not make Agora look like a dense admin dashboard.
Do not expose live deployment actions.
Do not expose capital rebalance actions.
Do not allow Skill activation directly from Skill Coaching.
Do not force long forms for every insight.
Do not make chat the only interface.
```

---

# 24. Part 5 Acceptance Criteria

Lovable output for Agora should satisfy:

```text
Agora has a distinct user experience from Management Console.
Daily Trading Cockpit is the main entry point.
Signal Review supports Agree / Disagree / Flag / Ask Persona / Create Research Task.
Research Notebook supports note-to-insight and note-to-research-task conversion.
Ask Personas supports context-aware sessions and feedback on AI responses.
Committee Room supports multi-persona structured discussion and memo generation.
Decision Journal captures rationale, confidence, and outcome.
Alert Triage allows dismiss / escalate / ask persona but not direct rollback.
Insight Inbox handles conversion and Management handoff.
Trainer Studio manages feedback, training examples, evaluations, and persona update requests.
Memory Review supports approve / reject / edit / merge.
Skill Coaching only creates skill drafts and submits them to Management approval.
All pages support zh-TW and en-US.
All high-risk actions are blocked from Agora and converted into handoff requests.
```

---

## Next Document

```text
Part 6 — Shared Data Model + BFF API Contract
```

Part 6 will define Lovable mock data and BFF DTO structures for Strategy, Persona, CapitalPool, Signal, AgoraSession, Message, Insight, Job, Alert, MCP, Skill, and other core models.


---

# Part 6 — Shared Data Model + BFF API Contract
> Document version: v1.0  
> Scope: Pantheon Management Console, Pantheon Agora Workbench  
> Audience: Lovable frontend builders, BFF engineers, Pantheon backend integrators, product/system reviewers

---

# 1. Purpose of This Document

Part 6 defines the shared data model and BFF API contract for both Pantheon frontend systems.

The Pantheon frontend must not call Pantheon core backend services directly. All frontend applications must communicate through a BFF (Backend-for-Frontend). The BFF is responsible for data aggregation, DTO transformation, permission resolution, available action computation, job orchestration, and realtime event delivery.

This document allows Lovable to build the full frontend with a mock BFF client first, while leaving the real BFF integration for later.

---

# 2. BFF Design Principles

## 2.1 The frontend only calls the BFF

The frontend must not directly call Pantheon core, broker systems, runtime services, MCP servers, or skill runners.

```text
Frontend
  → BFF Query / Command / Job / Event APIs
  → Pantheon backend / services / runtime / registries
```

## 2.2 The BFF returns frontend-ready DTOs

The BFF should return data that can be rendered directly. The frontend should not be required to infer complex business rules.

Every core entity detail DTO should include:

```text
id
type
displayName
status
riskLevel
owner
linkedEntities
availableActions
auditSummary
updatedAt
```

## 2.3 availableActions must be computed by the BFF

The frontend should not decide whether a lifecycle transition is allowed.

The BFF should return:

```json
{
  "availableActions": [
    {
      "id": "submit_review",
      "labelKey": "action.submitReview",
      "riskLevel": "medium",
      "requiresApproval": false,
      "enabled": true
    }
  ]
}
```

If an action is disabled, the BFF should provide disabledReasonKey.

## 2.4 The BFF returns enum codes, not fixed display text

The frontend supports zh-TW and en-US language switching. The BFF should return stable codes.

Example:

```json
{
  "status": "replicated",
  "riskLevel": "medium",
  "labelKey": "status.strategy.replicated"
}
```

The frontend renders localized labels based on the current locale.

## 2.5 High-risk operations must use command APIs and confirmation

The frontend does not directly mutate state. Any operation that affects strategies, capital, deployment, tool permissions, MCP, skills, or persona policy must go through a command API.

```text
POST /bff/{resource}/:id/actions/{actionId}
```

A high-risk command may return:

```text
approval_required
job_started
completed
rejected
blocked
```

---

# 3. Common API Contract

## 3.1 Base URL

```text
/bff
```

## 3.2 Auth Header

```http
Authorization: Bearer <token>
X-Pantheon-Locale: zh-TW | en-US
X-Pantheon-Client: management | agora
```

## 3.3 Request ID

The frontend should send a request ID for each command to support traceability.

```http
X-Request-Id: req_abc123
```

## 3.4 Query Response Envelope

```ts
interface QueryResponse<T> {
  data: T;
  meta?: ResponseMeta;
}

interface ResponseMeta {
  requestId: string;
  generatedAt: string;
  locale: LocaleCode;
  permissions?: string[];
}
```

## 3.5 List Response Envelope

```ts
interface ListResponse<T> {
  data: T[];
  page: PageInfo;
  filters?: AppliedFilter[];
  meta?: ResponseMeta;
}

interface PageInfo {
  cursor?: string;
  nextCursor?: string | null;
  pageSize: number;
  totalCount?: number;
  hasMore: boolean;
}
```

## 3.6 Command Response Envelope

```ts
interface CommandResponse {
  result: 'completed' | 'job_started' | 'approval_required' | 'blocked' | 'failed';
  messageKey?: string;
  jobId?: string;
  approvalRequestId?: string;
  target?: EntityReference;
  nextState?: string;
  auditEventId?: string;
  warnings?: WarningMessage[];
}
```

## 3.7 Error Format

```ts
interface BffError {
  error: {
    code: string;
    messageKey: string;
    message?: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}
```

Common error codes:

```text
unauthorized
forbidden
not_found
validation_error
conflict
approval_required
state_transition_blocked
risk_limit_exceeded
job_already_running
backend_unavailable
rate_limited
unknown_error
```

## 3.8 Date and Time Format

All timestamps should use ISO 8601 UTC strings.

```text
2026-05-03T08:30:00.000Z
```

The frontend displays timestamps in the user's local timezone and locale.

## 3.9 Money / Decimal Format

Amounts and important decimal values should be stringified to avoid floating-point issues.

```ts
interface MoneyAmount {
  amount: string;
  currency: 'USD' | 'TWD' | 'USDT' | string;
}

interface DecimalMetric {
  value: string;
  unit?: string;
}
```

---

# 4. Common Types

```ts
type LocaleCode = 'zh-TW' | 'en-US';
type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
type EnvironmentCode = 'research' | 'paper' | 'live';
type EntityType =
  | 'strategy'
  | 'persona'
  | 'capital_pool'
  | 'ranking_formula'
  | 'rebalance'
  | 'evolution_program'
  | 'experiment'
  | 'artifact'
  | 'review_request'
  | 'deployment'
  | 'runtime'
  | 'risk_alert'
  | 'incident'
  | 'job'
  | 'tool'
  | 'mcp_server'
  | 'mcp_tool'
  | 'skill'
  | 'insight'
  | 'signal'
  | 'agora_session'
  | 'message'
  | 'research_note'
  | 'decision_journal_entry'
  | 'memory_item'
  | 'training_example'
  | 'audit_event';

interface EntityReference {
  id: string;
  type: EntityType;
  displayName: string;
  status?: string;
  riskLevel?: RiskLevel;
  route?: string;
}

interface ActorReference {
  id: string;
  type: 'user' | 'persona' | 'system' | 'bff' | 'runtime';
  displayName: string;
  role?: string;
}

interface ActionDescriptor {
  id: string;
  labelKey: string;
  descriptionKey?: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  requiresConfirmation?: boolean;
  enabled: boolean;
  disabledReasonKey?: string;
  commandEndpoint?: string;
  confirmationKey?: string;
}

interface AuditSummary {
  lastChangedBy?: ActorReference;
  lastChangedAt?: string;
  lastAuditEventId?: string;
  changeCount?: number;
}

interface WarningMessage {
  code: string;
  messageKey: string;
  riskLevel?: RiskLevel;
}
```

---

# 5. Status Enum Contract

## 5.1 Strategy Lifecycle

```ts
type StrategyStatus =
  | 'discovered'
  | 'scaffolded'
  | 'replicated'
  | 'approved'
  | 'paper'
  | 'live'
  | 'degraded'
  | 'replaced'
  | 'retired'
  | 'archived';
```

## 5.2 Persona Status

```ts
type PersonaStatus =
  | 'draft'
  | 'sandbox'
  | 'active'
  | 'probation'
  | 'restricted'
  | 'suspended'
  | 'retired'
  | 'archived';
```

## 5.3 Job Status

```ts
type JobStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'retrying';
```

## 5.4 Review Status

```ts
type ReviewStatus =
  | 'draft'
  | 'submitted'
  | 'validator_running'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'cancelled';
```

## 5.5 Incident Status

```ts
type IncidentStatus =
  | 'new'
  | 'acknowledged'
  | 'assigned'
  | 'investigating'
  | 'mitigated'
  | 'resolved'
  | 'postmortem_required'
  | 'closed';
```

---

# 6. Management Console Data Models

## 6.1 Strategy

```ts
interface Strategy {
  id: string;
  type: 'strategy';
  displayName: string;
  status: StrategyStatus;
  ownerPersona?: EntityReference;
  capitalPool?: EntityReference;
  currentArtifact?: EntityReference;
  evolutionProgram?: EntityReference;
  paperDeployment?: EntityReference;
  liveDeployment?: EntityReference;
  latestMetrics?: PerformanceMetricSummary;
  riskLevel: RiskLevel;
  openAlertsCount: number;
  openIncidentsCount: number;
  runningJobsCount: number;
  linkedEntities: EntityReference[];
  availableActions: ActionDescriptor[];
  auditSummary: AuditSummary;
  createdAt: string;
  updatedAt: string;
}

interface PerformanceMetricSummary {
  period: string;
  returnPct?: string;
  sharpe?: string;
  sortino?: string;
  maxDrawdownPct?: string;
  volatilityPct?: string;
  turnover?: string;
  score?: string;
}
```

## 6.2 Strategy Spec

```ts
interface StrategySpec {
  id: string;
  strategyId: string;
  version: string;
  status: 'draft' | 'validated' | 'locked' | 'approved' | 'deprecated' | 'rolled_back';
  hypothesis: string;
  market: string;
  assetUniverse: string[];
  signalLogic: string;
  entryRules: string;
  exitRules: string;
  positionSizing: string;
  riskRules: string;
  dataRequirements: string[];
  costModel?: string;
  failureModes?: string[];
  createdBy: ActorReference;
  createdAt: string;
  updatedAt: string;
}
```

## 6.3 Persona

```ts
interface Persona {
  id: string;
  type: 'persona';
  displayName: string;
  status: PersonaStatus;
  role: string;
  currentVersion: string;
  tradingStyle?: string;
  researchStyle?: string;
  riskAppetite?: 'low' | 'medium' | 'high';
  capitalBindings: EntityReference[];
  activeStrategies: EntityReference[];
  allowedToolsCount: number;
  allowedMcpToolsCount: number;
  allowedSkillsCount: number;
  policyViolationsCount: number;
  runningJobsCount: number;
  latestEvaluationScore?: string;
  performanceRank?: number;
  riskLevel: RiskLevel;
  availableActions: ActionDescriptor[];
  auditSummary: AuditSummary;
  createdAt: string;
  updatedAt: string;
}
```

## 6.4 Route Policy

```ts
interface RoutePolicy {
  id: string;
  personaId: string;
  version: string;
  status: 'draft' | 'active' | 'pending_review' | 'deprecated' | 'rolled_back';
  toolPermissions: CapabilityPermission[];
  mcpPermissions: CapabilityPermission[];
  skillPermissions: CapabilityPermission[];
  consultRules: ConsultRule[];
  createdAt: string;
  updatedAt: string;
}

interface CapabilityPermission {
  capabilityId: string;
  capabilityType: 'tool' | 'mcp_tool' | 'skill' | 'workflow_template';
  displayName: string;
  allowed: boolean;
  requiresApproval: boolean;
  allowedEnvironments: EnvironmentCode[];
  allowedStrategyStates?: StrategyStatus[];
  rateLimit?: string;
  parameterRestrictions?: Record<string, unknown>;
}

interface ConsultRule {
  targetPersonaId: string;
  allowed: boolean;
  maxPerDay?: number;
  requiresApproval?: boolean;
}
```

## 6.5 Capital Pool

```ts
interface CapitalPool {
  id: string;
  type: 'capital_pool';
  displayName: string;
  status: 'draft' | 'active' | 'frozen' | 'rebalancing' | 'restricted' | 'retired';
  mandate: string;
  totalCapital: MoneyAmount;
  allocatedCapital: MoneyAmount;
  availableCapital: MoneyAmount;
  riskBudgetPct: string;
  maxDrawdownPct?: string;
  linkedPersonas: EntityReference[];
  linkedStrategies: EntityReference[];
  currentRebalance?: EntityReference;
  riskLevel: RiskLevel;
  openAlertsCount: number;
  availableActions: ActionDescriptor[];
  auditSummary: AuditSummary;
  createdAt: string;
  updatedAt: string;
}
```

## 6.6 Ranking Formula

```ts
interface RankingFormula {
  id: string;
  type: 'ranking_formula';
  displayName: string;
  scope: 'persona' | 'strategy' | 'alpha_family' | 'capital_pool';
  version: string;
  status: 'draft' | 'testing' | 'approved' | 'active' | 'deprecated' | 'retired';
  metrics: FormulaMetricWeight[];
  normalizationMethod: 'z_score' | 'min_max' | 'rank_percentile' | 'none';
  outlierHandling?: string;
  capsAndFloors?: Record<string, unknown>;
  effectiveFrom?: string;
  effectiveTo?: string;
  availableActions: ActionDescriptor[];
  auditSummary: AuditSummary;
}

interface FormulaMetricWeight {
  metricCode: string;
  labelKey: string;
  weight: string;
  direction: 'positive' | 'negative';
  hardConstraint?: boolean;
}
```

## 6.7 Quarterly Rebalance

```ts
interface QuarterlyRebalance {
  id: string;
  type: 'rebalance';
  displayName: string;
  quarter: string;
  status:
    | 'draft'
    | 'metrics_freezing'
    | 'metrics_frozen'
    | 'ranking_calculated'
    | 'simulation_ready'
    | 'under_review'
    | 'approved'
    | 'scheduled'
    | 'applied'
    | 'rolled_back'
    | 'cancelled';
  capitalPool: EntityReference;
  formula: EntityReference;
  metricFreezeAt?: string;
  effectiveAt?: string;
  rankingSummary?: RankingSummary;
  allocationSimulation?: AllocationSimulation;
  openApproval?: EntityReference;
  availableActions: ActionDescriptor[];
  auditSummary: AuditSummary;
}

interface RankingSummary {
  totalEntities: number;
  topEntity?: EntityReference;
  formulaVersion: string;
  calculatedAt: string;
}

interface AllocationSimulation {
  currentAllocation: AllocationRow[];
  recommendedAllocation: AllocationRow[];
  riskImpactSummary?: string;
  constraintsPassed: boolean;
}

interface AllocationRow {
  entity: EntityReference;
  allocationPct: string;
  capitalAmount?: MoneyAmount;
}
```

## 6.8 Evolution Program

```ts
interface EvolutionProgram {
  id: string;
  type: 'evolution_program';
  displayName: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'under_review' | 'retired';
  targetAlphaFamily?: string;
  ownerPersona?: EntityReference;
  fitnessFormula?: EntityReference;
  activeRunsCount: number;
  bestCandidate?: EntityReference;
  constraintsSummary?: string;
  riskLevel: RiskLevel;
  availableActions: ActionDescriptor[];
  auditSummary: AuditSummary;
}
```

## 6.9 Experiment

```ts
interface Experiment {
  id: string;
  type: 'experiment';
  displayName: string;
  status: 'draft' | 'queued' | 'running' | 'completed' | 'failed' | 'invalidated' | 'attached_to_review' | 'archived';
  experimentType: 'backtest' | 'oos' | 'stress_test' | 'ablation' | 'parameter_sweep' | 'simulation' | 'rl_training' | 'policy_evaluation';
  engine: 'qlib' | 'vectorbt' | 'statmodels' | 'finrl' | 'rllib' | 'custom';
  strategy?: EntityReference;
  ownerPersona?: EntityReference;
  dataset?: string;
  period?: string;
  metrics?: PerformanceMetricSummary;
  producedArtifacts: EntityReference[];
  job?: EntityReference;
  reproducibilityHash?: string;
  availableActions: ActionDescriptor[];
  createdAt: string;
  updatedAt: string;
}
```

## 6.10 Review Request

```ts
interface ReviewRequest {
  id: string;
  type: 'review_request';
  displayName: string;
  reviewType:
    | 'strategy_review'
    | 'patch_review'
    | 'artifact_review'
    | 'paper_promotion'
    | 'live_promotion'
    | 'capital_rebalance'
    | 'persona_policy'
    | 'skill_approval'
    | 'mcp_approval'
    | 'evolution_program';
  status: ReviewStatus;
  target: EntityReference;
  requestedBy: ActorReference;
  reviewers: ActorReference[];
  validatorResults: ValidatorResult[];
  riskLevel: RiskLevel;
  dueAt?: string;
  availableActions: ActionDescriptor[];
  auditSummary: AuditSummary;
}

interface ValidatorResult {
  id: string;
  validatorType: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'warning';
  messageKey?: string;
  details?: Record<string, unknown>;
}
```

## 6.11 Deployment / Runtime / Alert / Incident / Job

```ts
interface Deployment {
  id: string;
  type: 'deployment';
  displayName: string;
  environment: 'paper' | 'live';
  status: 'draft' | 'scheduled' | 'deploying' | 'running' | 'paused' | 'failed' | 'rolled_back' | 'retired';
  strategy: EntityReference;
  artifact: EntityReference;
  runtime?: EntityReference;
  capitalPool?: EntityReference;
  allocationPct?: string;
  rollbackTarget?: EntityReference;
  riskLevel: RiskLevel;
  availableActions: ActionDescriptor[];
}

interface Runtime {
  id: string;
  type: 'runtime';
  displayName: string;
  status: 'healthy' | 'degraded' | 'disconnected' | 'halted';
  runtimeType: 'lean' | 'paper_sim' | 'custom';
  runningStrategies: EntityReference[];
  lastHeartbeatAt?: string;
  cpuPct?: string;
  memoryPct?: string;
  brokerStatus?: 'connected' | 'degraded' | 'disconnected';
  openIncidentsCount: number;
  availableActions: ActionDescriptor[];
}

interface RiskAlert {
  id: string;
  type: 'risk_alert';
  displayName: string;
  status: 'new' | 'acknowledged' | 'assigned' | 'investigating' | 'mitigated' | 'resolved' | 'closed';
  severity: RiskLevel;
  alertType: string;
  target: EntityReference;
  createdAt: string;
  assignedTo?: ActorReference;
  availableActions: ActionDescriptor[];
}

interface Incident {
  id: string;
  type: 'incident';
  displayName: string;
  status: IncidentStatus;
  severity: RiskLevel;
  linkedStrategy?: EntityReference;
  linkedRuntime?: EntityReference;
  linkedCapitalPool?: EntityReference;
  timeline: IncidentTimelineEvent[];
  owner?: ActorReference;
  postmortem?: EntityReference;
  availableActions: ActionDescriptor[];
}

interface IncidentTimelineEvent {
  id: string;
  timestamp: string;
  actor: ActorReference;
  eventType: string;
  description: string;
}

interface Job {
  id: string;
  type: 'job';
  displayName: string;
  jobType: string;
  status: JobStatus;
  progressPct: number;
  currentStep?: string;
  target?: EntityReference;
  triggeredBy: ActorReference;
  startedAt?: string;
  completedAt?: string;
  outputArtifacts?: EntityReference[];
  availableActions: ActionDescriptor[];
}
```

## 6.12 Tool / MCP / Skill

```ts
interface Tool {
  id: string;
  type: 'tool';
  displayName: string;
  toolType: 'research' | 'backtest' | 'data' | 'execution' | 'memory' | 'mcp' | 'skill' | 'notification' | 'file' | 'browser';
  status: 'draft' | 'testing' | 'active' | 'restricted' | 'deprecated' | 'blocked' | 'retired';
  sideEffectLevel: 'read_only' | 'write_research' | 'write_strategy' | 'write_artifact' | 'capital_affecting' | 'execution_affecting' | 'dangerous';
  schema?: Record<string, unknown>;
  allowedPersonas: EntityReference[];
  lastHealthCheckAt?: string;
  lastUsedAt?: string;
  riskLevel: RiskLevel;
  availableActions: ActionDescriptor[];
}

interface MCPServer {
  id: string;
  type: 'mcp_server';
  displayName: string;
  status: 'draft' | 'connected' | 'healthy' | 'degraded' | 'disabled' | 'retired';
  endpoint?: string;
  transport: 'stdio' | 'http' | 'sse' | 'websocket';
  toolsCount: number;
  authType?: 'none' | 'api_key' | 'oauth' | 'custom';
  allowedPersonas: EntityReference[];
  riskLevel: RiskLevel;
  availableActions: ActionDescriptor[];
}

interface MCPTool {
  id: string;
  type: 'mcp_tool';
  displayName: string;
  server: EntityReference;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  sideEffectLevel: Tool['sideEffectLevel'];
  allowedPersonas: EntityReference[];
  requiresApproval: boolean;
  rateLimit?: string;
  availableActions: ActionDescriptor[];
}

interface Skill {
  id: string;
  type: 'skill';
  displayName: string;
  version: string;
  status: 'draft' | 'sandboxed' | 'validated' | 'approved' | 'active' | 'deprecated' | 'blocked' | 'retired';
  author?: ActorReference;
  requiredTools: EntityReference[];
  allowedPersonas: EntityReference[];
  sandboxResult?: 'not_run' | 'passed' | 'failed' | 'warning';
  riskLevel: RiskLevel;
  availableActions: ActionDescriptor[];
}
```

---

# 7. Agora Workbench Data Models

## 7.1 Signal

```ts
interface Signal {
  id: string;
  type: 'signal';
  displayName: string;
  strategy: EntityReference;
  assetSymbol: string;
  direction: 'long' | 'short' | 'flat' | 'exit';
  confidence?: string;
  generatedAt: string;
  explanation?: string;
  relatedFeatures?: string[];
  riskLevel: RiskLevel;
  traderFeedback?: 'agree' | 'disagree' | 'flag_suspicious' | 'not_reviewed';
  availableActions: ActionDescriptor[];
}
```

## 7.2 Insight

```ts
interface Insight {
  id: string;
  type: 'insight';
  displayName: string;
  source: 'trader_note' | 'signal_review' | 'market_watchlist' | 'ai_response' | 'committee' | 'alert_triage' | 'decision_journal' | 'postmortem';
  status: 'raw' | 'triaged' | 'classified' | 'linked' | 'converted_to_strategy' | 'converted_to_research_task' | 'converted_to_training_example' | 'dismissed' | 'archived';
  summary: string;
  linkedStrategy?: EntityReference;
  linkedPersona?: EntityReference;
  priority?: 'low' | 'medium' | 'high';
  createdBy: ActorReference;
  createdAt: string;
  availableActions: ActionDescriptor[];
}
```

## 7.3 Agora Session / Message

```ts
interface AgoraSession {
  id: string;
  type: 'agora_session';
  displayName: string;
  sessionType: 'trader_persona' | 'trainer_persona' | 'persona_persona' | 'committee' | 'signal_review' | 'incident_postmortem' | 'daily_brief';
  status: 'active' | 'paused' | 'closed' | 'archived';
  participants: ActorReference[];
  linkedStrategy?: EntityReference;
  linkedSignal?: EntityReference;
  linkedIncident?: EntityReference;
  languageMode: 'follow_ui' | 'zh-TW' | 'en-US' | 'mixed';
  messagesCount: number;
  createdAt: string;
  updatedAt: string;
  availableActions: ActionDescriptor[];
}

interface Message {
  id: string;
  type: 'message';
  sessionId: string;
  sender: ActorReference;
  content: string;
  contentLanguage?: LocaleCode | 'mixed';
  createdAt: string;
  annotations: MessageAnnotation[];
  availableActions: ActionDescriptor[];
}

interface MessageAnnotation {
  id: string;
  annotationType: 'remember' | 'do_not_remember' | 'useful' | 'not_useful' | 'incorrect' | 'create_insight' | 'create_training_example' | 'attach_to_strategy';
  createdBy: ActorReference;
  createdAt: string;
  note?: string;
}
```

## 7.4 Research Note / Decision Journal

```ts
interface ResearchNote {
  id: string;
  type: 'research_note';
  displayName: string;
  noteType: 'market_observation' | 'strategy_hypothesis' | 'risk_concern' | 'model_failure' | 'paper_summary' | 'postmortem_thought' | 'trader_intuition';
  content: string;
  linkedEntities: EntityReference[];
  createdBy: ActorReference;
  createdAt: string;
  updatedAt: string;
  availableActions: ActionDescriptor[];
}

interface DecisionJournalEntry {
  id: string;
  type: 'decision_journal_entry';
  displayName: string;
  linkedStrategy?: EntityReference;
  linkedSignal?: EntityReference;
  marketContext?: string;
  decision: string;
  rationale: string;
  confidence?: string;
  expectedOutcome?: string;
  actualOutcome?: string;
  followUpAt?: string;
  createdBy: ActorReference;
  createdAt: string;
  availableActions: ActionDescriptor[];
}
```

## 7.5 Memory Item / Training Example

```ts
interface MemoryItem {
  id: string;
  type: 'memory_item';
  displayName: string;
  memoryType: 'core_rule' | 'private_note' | 'conversation_memory' | 'trader_feedback' | 'research_memory' | 'do_not_remember' | 'shared_knowledge' | 'policy_memory';
  status: 'proposed' | 'approved' | 'rejected' | 'edited' | 'merged' | 'deprecated' | 'deleted' | 'sensitive';
  persona?: EntityReference;
  content: string;
  source?: EntityReference;
  confidence?: string;
  createdAt: string;
  availableActions: ActionDescriptor[];
}

interface TrainingExample {
  id: string;
  type: 'training_example';
  displayName: string;
  persona?: EntityReference;
  input: string;
  expectedResponse?: string;
  badResponse?: string;
  correction?: string;
  reason?: string;
  tags: string[];
  source?: EntityReference;
  status: 'draft' | 'approved' | 'rejected' | 'used_in_evaluation' | 'archived';
  createdBy: ActorReference;
  createdAt: string;
  availableActions: ActionDescriptor[];
}
```

---

# 8. BFF Route Overview

## 8.1 Strategies

```http
GET    /bff/strategies
POST   /bff/strategies
GET    /bff/strategies/:strategyId
PATCH  /bff/strategies/:strategyId
GET    /bff/strategies/:strategyId/specs
POST   /bff/strategies/:strategyId/specs
GET    /bff/strategies/:strategyId/experiments
GET    /bff/strategies/:strategyId/artifacts
GET    /bff/strategies/:strategyId/lineage
GET    /bff/strategies/:strategyId/audit
POST   /bff/strategies/:strategyId/actions/:actionId
```

Action examples:

```text
scaffold
run_experiment
submit_review
promote_paper
request_live_promotion
pause
resume
rollback
replace
retire
open_incident
```

## 8.2 Personas

```http
GET    /bff/personas
POST   /bff/personas
GET    /bff/personas/:personaId
PATCH  /bff/personas/:personaId
GET    /bff/personas/:personaId/route-policy
GET    /bff/personas/:personaId/activity
GET    /bff/personas/:personaId/evaluations
GET    /bff/personas/:personaId/memory
GET    /bff/personas/:personaId/audit
POST   /bff/personas/:personaId/actions/:actionId
```

Action examples:

```text
activate
restrict
suspend
put_on_probation
retire
run_evaluation
assign_tool
assign_mcp_tool
assign_skill
```

## 8.3 Capital / Ranking / Rebalance

```http
GET    /bff/capital-pools
POST   /bff/capital-pools
GET    /bff/capital-pools/:poolId
PATCH  /bff/capital-pools/:poolId
POST   /bff/capital-pools/:poolId/actions/:actionId

GET    /bff/ranking/formulas
POST   /bff/ranking/formulas
GET    /bff/ranking/formulas/:formulaId
PATCH  /bff/ranking/formulas/:formulaId
POST   /bff/ranking/formulas/:formulaId/actions/:actionId

GET    /bff/rebalances
POST   /bff/rebalances
GET    /bff/rebalances/:rebalanceId
POST   /bff/rebalances/:rebalanceId/actions/:actionId
```

Rebalance actions:

```text
freeze_metrics
calculate_ranking
run_simulation
apply_override
submit_review
approve
schedule
apply
rollback
cancel
```

## 8.4 Evolution

```http
GET    /bff/evolution-programs
POST   /bff/evolution-programs
GET    /bff/evolution-programs/:programId
PATCH  /bff/evolution-programs/:programId
GET    /bff/evolution-programs/:programId/runs
GET    /bff/evolution-programs/:programId/candidates
POST   /bff/evolution-programs/:programId/actions/:actionId
```

## 8.5 Experiments

```http
GET    /bff/experiments
POST   /bff/experiments
GET    /bff/experiments/:experimentId
POST   /bff/experiments/:experimentId/actions/:actionId
GET    /bff/experiments/:experimentId/logs
GET    /bff/experiments/:experimentId/metrics
GET    /bff/experiments/:experimentId/artifacts
```

## 8.6 Governance

```http
GET    /bff/reviews
POST   /bff/reviews
GET    /bff/reviews/:reviewId
POST   /bff/reviews/:reviewId/actions/:actionId
GET    /bff/reviews/:reviewId/validators
GET    /bff/reviews/:reviewId/audit
```

Review actions:

```text
run_validators
approve
reject
request_changes
escalate
attach_memo
```

## 8.7 Deployment / Runtime / Risk / Incident

```http
GET    /bff/deployments
GET    /bff/deployments/:deploymentId
POST   /bff/deployments/:deploymentId/actions/:actionId

GET    /bff/runtimes
GET    /bff/runtimes/:runtimeId
POST   /bff/runtimes/:runtimeId/actions/:actionId

GET    /bff/risk/alerts
GET    /bff/risk/alerts/:alertId
POST   /bff/risk/alerts/:alertId/actions/:actionId

GET    /bff/incidents
POST   /bff/incidents
GET    /bff/incidents/:incidentId
POST   /bff/incidents/:incidentId/actions/:actionId
```

## 8.8 Tools / MCP / Skills

```http
GET    /bff/tools
POST   /bff/tools
GET    /bff/tools/:toolId
PATCH  /bff/tools/:toolId
POST   /bff/tools/:toolId/actions/:actionId

GET    /bff/mcp/servers
POST   /bff/mcp/servers
GET    /bff/mcp/servers/:serverId
POST   /bff/mcp/servers/:serverId/actions/:actionId
GET    /bff/mcp/servers/:serverId/tools
POST   /bff/mcp/tools/:toolId/actions/:actionId

GET    /bff/skills
POST   /bff/skills
GET    /bff/skills/:skillId
PATCH  /bff/skills/:skillId
POST   /bff/skills/:skillId/actions/:actionId
```

Skill actions:

```text
generate_draft
run_sandbox
run_security_scan
submit_approval
approve
assign_persona
revoke_persona
rollback_version
deprecate
retire
```

## 8.9 Jobs / Events / Audit

```http
GET    /bff/jobs
GET    /bff/jobs/:jobId
GET    /bff/jobs/:jobId/logs
POST   /bff/jobs/:jobId/actions/:actionId

GET    /bff/events
GET    /bff/events/stream

GET    /bff/audit/events
GET    /bff/audit/entities/:entityType/:entityId
```

## 8.10 Agora APIs

```http
GET    /bff/agora/daily
GET    /bff/agora/signals
GET    /bff/agora/signals/:signalId
POST   /bff/agora/signals/:signalId/feedback

GET    /bff/agora/sessions
POST   /bff/agora/sessions
GET    /bff/agora/sessions/:sessionId
GET    /bff/agora/sessions/:sessionId/messages
POST   /bff/agora/sessions/:sessionId/messages
POST   /bff/agora/messages/:messageId/actions/:actionId

GET    /bff/agora/notes
POST   /bff/agora/notes
GET    /bff/agora/journal
POST   /bff/agora/journal
GET    /bff/agora/insights
POST   /bff/agora/insights
POST   /bff/agora/insights/:insightId/actions/:actionId

GET    /bff/agora/memory
POST   /bff/agora/memory/:memoryId/actions/:actionId
GET    /bff/agora/training-examples
POST   /bff/agora/training-examples
```

---

# 9. Realtime Event Contract

The frontend should subscribe to events via SSE or WebSocket.

```http
GET /bff/events/stream
```

Event format:

```ts
interface RealtimeEvent {
  id: string;
  eventType: string;
  entity: EntityReference;
  actor?: ActorReference;
  occurredAt: string;
  severity?: RiskLevel;
  payload?: Record<string, unknown>;
}
```

Event types:

```text
job.started
job.progress
job.completed
job.failed
strategy.state_changed
persona.policy_changed
capital.rebalance_updated
ranking.formula_activated
deployment.started
deployment.completed
deployment.failed
runtime.status_changed
risk.alert_created
risk.alert_updated
incident.created
incident.updated
tool.call_completed
mcp.call_failed
skill.sandbox_completed
review.requested
review.approved
review.rejected
agora.insight_created
agora.signal_feedback_created
```

---

# 10. i18n Contract

## 10.1 Supported Locales

```text
zh-TW
en-US
```

## 10.2 BFF Header

```http
X-Pantheon-Locale: zh-TW
```

## 10.3 User Profile Locale

```http
GET /bff/me
```

```ts
interface MeResponse {
  user: {
    id: string;
    displayName: string;
    role: string;
    locale: LocaleCode;
    permissions: string[];
  };
}
```

## 10.4 Translation Rules

The BFF returns enum codes, labelKey, and messageKey.
The frontend renders labels through a translation dictionary.

User-generated content such as notes, messages, and memos should not be automatically translated. The UI may provide:

```text
Translate View
Summarize in Current Language
```

---

# 11. Mock BFF Client Requirements

Lovable should start with a mock BFF client:

```text
src/lib/bffClient.ts
src/mocks/strategies.ts
src/mocks/personas.ts
src/mocks/capitalPools.ts
src/mocks/experiments.ts
src/mocks/jobs.ts
src/mocks/alerts.ts
src/mocks/incidents.ts
src/mocks/tools.ts
src/mocks/mcp.ts
src/mocks/skills.ts
src/mocks/agora.ts
```

The mock client must support:

```text
list
get detail
run action
return command response
simulate job progress
simulate realtime events
return availableActions
return localized labelKey/messageKey
```

---

# 12. Acceptance Criteria for Part 6

The initial Lovable / BFF implementation should satisfy:

```text
1. All frontend data is loaded through the BFF client.
2. Every core entity has id/type/status/riskLevel/availableActions.
3. All list APIs support pagination.
4. All command APIs use CommandResponse.
5. All errors use the BffError format.
6. All enums use codes and translation keys, not hardcoded Chinese or English.
7. High-risk operations are marked through requiresConfirmation / requiresApproval in availableActions.
8. Jobs, alerts, incidents, deployments, and reviews can be updated via realtime events.
9. Agora-generated insight / training example / signal feedback can flow back into the Management Console.
10. The mock BFF client is sufficient to power the first version of both the Management Console and Agora Workbench.
```

---

# 13. Next Document

The next document is:

```text
Part 7 — Component System + State Machines
```

Part 7 will define:

```text
Shared component system
Management Console components
Agora Workbench components
Strategy lifecycle state machine
Persona lifecycle state machine
Quarterly rebalance workflow
Review / approval workflow
Deployment / rollback workflow
Skill / MCP approval workflow
Incident workflow
Agora insight conversion workflow
```


---

# Part 7 — Component System + State Machines
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


---

# Part 8 — Lovable Build Prompts + Mock Data + QA Checklist
Document Version: v1.0  
Locale: en-US  
Audience: Lovable, frontend engineers, BFF engineers, product designers, Pantheon system owners

---

## 0. Purpose of This Document

This document is Part 8 of the Pantheon frontend planning package. Its purpose is to give Lovable enough concrete instructions to begin implementation.

This document includes:

```text
1. Lovable build strategy
2. Copy-ready Lovable build prompts
3. Frontend routes and build order
4. Mock BFF client requirements
5. Mock data requirements
6. Demo scenarios
7. QA checklist
8. Acceptance criteria
9. Non-negotiable product boundaries
```

This document builds on the previous seven specs:

```text
Part 01 — Master Blueprint
Part 02 — Management Console Process Inventory
Part 03 — Management Console Page & Feature Design
Part 04 — Agora Workbench User Workflow Inventory
Part 05 — Agora Workbench Page & Feature Design
Part 06 — Shared Data Model + BFF API Contract
Part 07 — Component System + State Machines
```

---

## 1. Lovable Build Strategy

Pantheon frontend must be implemented as two product areas under one shared platform shell:

```text
Pantheon Management Console
Pantheon Agora Workbench
```

The two product areas serve different users and must therefore have different UX styles and interaction models.

---

## 1.1 Management Console Build Goal

The Management Console is used by administrators, research leads, risk officers, capital managers, and system operators.

It must support:

```text
Strategy and alpha management
AI persona management
Capital pool management
Performance ranking formula management
Quarterly rebalance management
Alpha evolution steering
Research and experiment management
Governance approvals
Paper / live deployment management
Runtime, risk, alert, and incident response
Tool / MCP / Skill management
Knowledge, artifact, and lineage management
Jobs, events, and audit management
```

The Management Console is not just a dashboard. It is a management and response system. Every page must show:

```text
Current state
Risk state
Available actions
Approval requirements
Running jobs
Open alerts
Open incidents
Audit timeline
```

---

## 1.2 Agora Workbench Build Goal

The Agora Workbench is used daily by analysts, traders, and AI trainers.

It must support:

```text
Daily trading cockpit
Market and watchlist analysis
Strategy signal review
Research notebook
Ask AI personas
Multi-persona committee
Decision journal
Alert triage
Insight inbox
Trainer Studio
Memory Review
Skill Coaching
Persona Lab
Evaluations
Channels
```

Agora should not feel like an admin dashboard. It should feel useful to analysts and traders and naturally produce valuable structured data:

```text
trader notes
signal feedback
decision rationale
persona feedback
training examples
research tasks
strategy ideas
committee memos
```

---

## 1.3 Shared Build Principles

Lovable must follow these rules:

```text
Frontend only
Use mock BFF APIs first
Do not call Pantheon backend directly
Do not implement real trading operations
Do not store real secrets
All high-risk operations must use mock command APIs plus confirmation modals
All UI text must use i18n translation keys
Support zh-TW and en-US language switching
```

---

## 2. Recommended Build Order

Lovable should build in phases.

```text
Phase 1 — Shared Platform Shell
Phase 2 — Management Console Core Pages
Phase 3 — Management Console Deep Management Pages
Phase 4 — Agora Workbench Daily Workflow Pages
Phase 5 — Agora AI Collaboration / Trainer Pages
Phase 6 — Realtime events, jobs, audit, and final polish
```

---

## 2.1 Phase 1 — Shared Platform Shell

Build the shared shell first:

```text
AppShell
GlobalTopBar
ProductSwitcher
LanguageSwitcher
BFF Status Indicator
Notification Center
Global Search
Role Menu
Management Sidebar
Agora Sidebar
Right Drawer / Inspector
Mock BFF Client
Mock Event Feed
```

Acceptance:

```text
Users can switch between /management and /agora.
Users can switch between zh-TW and en-US.
Top bar shows environment, BFF status, alerts, jobs, and approvals.
Sidebar changes depending on product area.
Visible UI text must use translation keys.
```

---

## 2.2 Phase 2 — Management Console Core Pages

Build the core Management pages first:

```text
/management/command-center
/management/strategies
/management/strategies/:strategyId
/management/personas
/management/personas/:personaId
/management/capital
/management/rebalance
/management/governance
/management/jobs
```

These pages should support the core demo scenarios.

---

## 2.3 Phase 3 — Management Console Deep Management Pages

Then build deeper management pages:

```text
/management/ranking
/management/evolution
/management/experiments
/management/deployment
/management/runtimes
/management/risk
/management/incidents
/management/tools
/management/mcp
/management/skills
/management/artifacts
/management/lineage
/management/audit
/management/settings
```

---

## 2.4 Phase 4 — Agora Workbench Daily Workflow Pages

Build the pages analysts and traders will use daily:

```text
/agora/daily
/agora/markets
/agora/watchlist
/agora/signals
/agora/signals/:signalId
/agora/notebook
/agora/ask
/agora/journal
/agora/triage
/agora/insights
```

---

## 2.5 Phase 5 — Agora AI Collaboration / Trainer Pages

Then build collaboration and training pages:

```text
/agora/committee
/agora/committee/:sessionId
/agora/trainer
/agora/trainer/:personaId
/agora/memory
/agora/skill-coaching
/agora/persona-lab
/agora/evaluations
/agora/channels
```

---

## 2.6 Phase 6 — Realtime / Polish

Finally add:

```text
Realtime event simulation
Job drawer behavior
Notification behavior
Audit timeline
Empty states
Loading states
Error states
High-risk confirmation modal
Role-based action disabling
Responsive desktop layout
```

---

## 3. Lovable Master Prompt — Platform Shell

The following prompt can be given directly to Lovable.

```text
Build a frontend-only web application named Pantheon Platform.

The app has two product areas under one shared platform shell:

1. Pantheon Management Console
   Route group: /management
   Users: admins, research leads, risk officers, capital managers, system operators.
   Purpose: manage strategies, AI personas, capital pools, performance ranking formulas, quarterly rebalancing, evolution programs, experiments, governance approvals, deployments, runtimes, risk, incidents, tools, MCP servers, skills, artifacts, jobs, events, and audit.

2. Pantheon Agora Workbench
   Route group: /agora
   Users: analysts, traders, AI trainers.
   Purpose: support daily market analysis, strategy signal review, research notes, AI persona collaboration, committee discussions, decision journals, alert triage, insight capture, training feedback, memory review, and skill coaching.

Create a shared AppShell with:
- Global top bar
- Product switcher: Management / Agora
- Language switcher: zh-TW / en-US
- Environment indicator: Research / Paper / Live
- BFF connection status
- Pending approvals count
- Open alerts count
- Running jobs count
- Notification center
- User role menu
- Global search
- Right-side contextual drawer / inspector

Use mock BFF client functions only. Do not call a real backend.
Use mock data for all screens.
Use translation keys and dictionaries for zh-TW and en-US. Do not hardcode visible UI strings.
Use desktop-first responsive layout.
Use professional fintech UI style.
Management Console should feel like a high-density operational control plane.
Agora Workbench should feel like an analyst/trader AI workbench, not an admin dashboard.
```

---

## 4. Lovable Prompt — Management Console

```text
Build the Pantheon Management Console under /management.

This console combines management, monitoring, response, approvals, deployment, rollback, and audit into one system because the same operational users manage these workflows.

Create the following Management navigation groups:

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

For each page, include:
- Page title
- Status summary cards
- Primary data table or working canvas
- Filters
- Right drawer / inspector for selected objects
- Primary and secondary actions
- Empty state
- Loading state
- Error state
- Mock BFF API calls
- Mock realtime events where relevant
- Role-based disabled actions
- High-risk confirmation modal for dangerous actions

Core requirement:
Every management object should show its current state, risk state, available actions, linked entities, running jobs, open alerts/incidents, and audit summary.
```

---

## 5. Lovable Prompt — Agora Workbench

```text
Build the Pantheon Agora Workbench under /agora.

Agora is not an admin system. It is a daily AI-assisted workbench for analysts, traders, and AI trainers.

Create the following Agora navigation groups:

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
- Channels

Design principles:
- Friendly to analysts and traders.
- Help users understand markets, signals, strategy behavior, and risks.
- Make it easy to ask AI personas contextual questions.
- Make it easy to write notes, record decisions, and convert ideas into structured insights.
- Capture useful data naturally through daily workflow actions.
- Do not allow direct live deployment, capital rebalance, rollback, or MCP/Skill production approval in Agora.
- Agora can create proposals, insights, training examples, research tasks, and committee memos that flow into the Management Console.

For each page, include:
- Main work area
- Context cards
- AI persona assistance panel where appropriate
- One-click capture actions: Save as Note, Create Insight, Create Research Task, Create Training Example, Send to Management
- Empty/loading/error states
- i18n support for zh-TW and en-US
```

---

## 6. Required Routes

### 6.1 Management Routes

```text
/management
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

### 6.2 Agora Routes

```text
/agora
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

---

## 7. Mock Data Requirements

Lovable should create mock data in a local mock BFF layer.

Suggested folder structure:

```text
/src/lib/mockBff
  strategies.ts
  personas.ts
  capitalPools.ts
  rankingFormulas.ts
  rebalances.ts
  evolutionPrograms.ts
  experiments.ts
  governance.ts
  deployments.ts
  runtimes.ts
  alerts.ts
  incidents.ts
  jobs.ts
  tools.ts
  mcp.ts
  skills.ts
  artifacts.ts
  agora.ts
  events.ts
  audit.ts
```

---

## 7.1 Mock Strategies

```ts
export const mockStrategies = [
  {
    id: "alpha_042",
    displayName: "Taiwan ETF Basket Mean Reversion",
    type: "strategy",
    lifecycleState: "replicated",
    ownerPersonaId: "persona_a",
    capitalPoolId: "pool_alpha",
    paperStatus: "not_deployed",
    liveStatus: "not_deployed",
    currentArtifactId: "artifact_042_v3",
    riskLevel: "medium",
    rankingScore: 82.4,
    latestMetrics: {
      quarterlyReturn: 0.084,
      sharpe: 1.62,
      sortino: 1.91,
      maxDrawdown: 0.071,
      turnover: 0.32
    },
    openAlertIds: [],
    runningJobIds: ["job_backtest_042"],
    blockerIds: ["blocker_committee_memo_missing"],
    availableActions: [
      { id: "run_oos", labelKey: "action.runOos", riskLevel: "low", enabled: true, requiresApproval: false },
      { id: "submit_review", labelKey: "action.submitReview", riskLevel: "medium", enabled: true, requiresApproval: false },
      { id: "promote_live", labelKey: "action.promoteLive", riskLevel: "high", enabled: false, requiresApproval: true, disabledReasonKey: "disabled.strategyMustBeApprovedAndPaperTested" }
    ]
  },
  {
    id: "alpha_017",
    displayName: "US Tech Momentum Rotation",
    type: "strategy",
    lifecycleState: "live",
    ownerPersonaId: "persona_b",
    capitalPoolId: "pool_growth",
    paperStatus: "completed",
    liveStatus: "running",
    currentArtifactId: "artifact_017_v8",
    riskLevel: "high",
    rankingScore: 74.1,
    latestMetrics: {
      quarterlyReturn: 0.052,
      sharpe: 1.21,
      sortino: 1.36,
      maxDrawdown: 0.112,
      turnover: 0.48
    },
    openAlertIds: ["alert_dd_017"],
    runningJobIds: [],
    blockerIds: [],
    availableActions: [
      { id: "pause", labelKey: "action.pause", riskLevel: "high", enabled: true, requiresApproval: true },
      { id: "rollback", labelKey: "action.rollback", riskLevel: "critical", enabled: true, requiresApproval: true },
      { id: "open_incident", labelKey: "action.openIncident", riskLevel: "medium", enabled: true, requiresApproval: false }
    ]
  }
];
```

---

## 7.2 Mock Personas

```ts
export const mockPersonas = [
  {
    id: "persona_a",
    displayName: "Athena",
    role: "Statistical Arbitrage Researcher",
    status: "active",
    currentVersion: "v12",
    performanceRank: 1,
    capitalPoolIds: ["pool_alpha"],
    ownedStrategyIds: ["alpha_042"],
    allowedToolIds: ["tool_qlib", "tool_vectorbt", "tool_research_notes"],
    allowedMcpToolIds: ["mcp_market_data.read", "mcp_backtest.run"],
    allowedSkillIds: ["skill_signal_explainer"],
    riskLevel: "low",
    policyViolationCount: 0,
    activeSessionIds: ["session_signal_042"],
    runningJobIds: ["job_backtest_042"],
    availableActions: [
      { id: "edit_policy", labelKey: "action.editRoutePolicy", riskLevel: "medium", enabled: true, requiresApproval: true },
      { id: "run_evaluation", labelKey: "action.runEvaluation", riskLevel: "low", enabled: true, requiresApproval: false },
      { id: "restrict_tools", labelKey: "action.restrictTools", riskLevel: "high", enabled: true, requiresApproval: true }
    ]
  },
  {
    id: "persona_b",
    displayName: "Hermes",
    role: "Momentum Strategy Operator",
    status: "probation",
    currentVersion: "v7",
    performanceRank: 3,
    capitalPoolIds: ["pool_growth"],
    ownedStrategyIds: ["alpha_017"],
    allowedToolIds: ["tool_market_summary", "tool_signal_review"],
    allowedMcpToolIds: ["mcp_market_data.read"],
    allowedSkillIds: ["skill_daily_brief"],
    riskLevel: "medium",
    policyViolationCount: 2,
    activeSessionIds: [],
    runningJobIds: [],
    availableActions: [
      { id: "review_policy_violation", labelKey: "action.reviewPolicyViolation", riskLevel: "medium", enabled: true, requiresApproval: false },
      { id: "suspend", labelKey: "action.suspend", riskLevel: "high", enabled: true, requiresApproval: true }
    ]
  }
];
```

---

## 7.3 Mock Capital Pools

```ts
export const mockCapitalPools = [
  {
    id: "pool_alpha",
    displayName: "Alpha Research Pool",
    status: "active",
    mandate: "Risk-adjusted allocation to validated alpha strategies.",
    totalCapital: 10000000,
    availableCapital: 2800000,
    allocatedCapital: 7200000,
    riskBudget: {
      maxDrawdown: 0.12,
      maxConcentration: 0.35,
      minCashReserve: 0.15
    },
    linkedPersonaIds: ["persona_a"],
    linkedStrategyIds: ["alpha_042"],
    currentRebalanceId: "rebalance_2026_q2_pool_alpha",
    riskLevel: "medium",
    availableActions: [
      { id: "create_rebalance", labelKey: "action.createRebalance", riskLevel: "medium", enabled: true, requiresApproval: false },
      { id: "freeze_pool", labelKey: "action.freezePool", riskLevel: "high", enabled: true, requiresApproval: true }
    ]
  }
];
```

---

## 7.4 Mock Ranking Formula

```ts
export const mockRankingFormulas = [
  {
    id: "formula_persona_rank_v3",
    displayName: "Persona Risk-Adjusted Quarterly Ranking v3",
    scope: "persona",
    status: "active",
    version: "v3",
    metrics: [
      { key: "quarterly_return", weight: 0.2 },
      { key: "sharpe", weight: 0.2 },
      { key: "sortino", weight: 0.1 },
      { key: "stability", weight: 0.1 },
      { key: "capacity", weight: 0.1 },
      { key: "max_drawdown", weight: -0.2 },
      { key: "risk_violation_count", weight: -0.1 }
    ],
    normalization: "z_score",
    outlierHandling: "winsorize_5_95",
    effectiveFrom: "2026-04-01",
    availableActions: [
      { id: "clone_formula", labelKey: "action.cloneFormula", riskLevel: "low", enabled: true, requiresApproval: false },
      { id: "retire_formula", labelKey: "action.retireFormula", riskLevel: "high", enabled: true, requiresApproval: true }
    ]
  }
];
```

---

## 7.5 Mock Quarterly Rebalance

```ts
export const mockRebalances = [
  {
    id: "rebalance_2026_q2_pool_alpha",
    displayName: "2026 Q2 Alpha Research Pool Rebalance",
    quarter: "2026-Q2",
    capitalPoolId: "pool_alpha",
    formulaId: "formula_persona_rank_v3",
    status: "simulation_ready",
    metricFreezeStatus: "frozen",
    rankingStatus: "calculated",
    simulationStatus: "ready",
    approvalStatus: "not_submitted",
    recommendedAllocations: [
      { entityId: "persona_a", entityType: "persona", currentWeight: 0.24, recommendedWeight: 0.32, score: 88.2 },
      { entityId: "persona_b", entityType: "persona", currentWeight: 0.18, recommendedWeight: 0.12, score: 69.4 }
    ],
    constraints: [
      { id: "max_concentration", status: "pass", messageKey: "constraint.maxConcentrationPass" },
      { id: "cash_reserve", status: "pass", messageKey: "constraint.cashReservePass" }
    ],
    availableActions: [
      { id: "submit_review", labelKey: "action.submitReview", riskLevel: "high", enabled: true, requiresApproval: true },
      { id: "rerun_simulation", labelKey: "action.rerunSimulation", riskLevel: "low", enabled: true, requiresApproval: false }
    ]
  }
];
```

---

## 7.6 Mock Alerts and Incidents

```ts
export const mockAlerts = [
  {
    id: "alert_dd_017",
    type: "drawdown_breach",
    severity: "high",
    status: "new",
    titleKey: "alert.drawdownBreach.title",
    description: "alpha_017 live drawdown exceeded warning threshold.",
    linkedStrategyId: "alpha_017",
    linkedRuntimeId: "runtime_b",
    linkedCapitalPoolId: "pool_growth",
    createdAt: "2026-05-03T09:12:00+08:00",
    availableActions: [
      { id: "acknowledge", labelKey: "action.acknowledge", riskLevel: "low", enabled: true, requiresApproval: false },
      { id: "open_incident", labelKey: "action.openIncident", riskLevel: "medium", enabled: true, requiresApproval: false },
      { id: "rollback", labelKey: "action.rollback", riskLevel: "critical", enabled: true, requiresApproval: true }
    ]
  }
];

export const mockIncidents = [
  {
    id: "incident_017_dd",
    severity: "high",
    status: "investigating",
    displayName: "alpha_017 drawdown investigation",
    linkedStrategyId: "alpha_017",
    linkedAlertIds: ["alert_dd_017"],
    ownerUserId: "risk_001",
    timeline: [
      { ts: "2026-05-03T09:12:00+08:00", event: "Alert created" },
      { ts: "2026-05-03T09:20:00+08:00", event: "Risk officer assigned" }
    ],
    availableActions: [
      { id: "ask_persona_analysis", labelKey: "action.askPersonaAnalysis", riskLevel: "low", enabled: true, requiresApproval: false },
      { id: "create_postmortem", labelKey: "action.createPostmortem", riskLevel: "medium", enabled: true, requiresApproval: false },
      { id: "close_incident", labelKey: "action.closeIncident", riskLevel: "medium", enabled: true, requiresApproval: true }
    ]
  }
];
```

---

## 7.7 Mock Agora Signals

```ts
export const mockSignals = [
  {
    id: "signal_042_20260503",
    strategyId: "alpha_042",
    asset: "0050.TW",
    direction: "long",
    confidence: 0.74,
    status: "pending_review",
    generatedAt: "2026-05-03T10:30:00+08:00",
    explanation: "Mean reversion signal triggered after basket spread exceeded threshold.",
    relatedFeatureIds: ["feature_zscore_spread", "feature_volume_filter"],
    personaOpinionIds: ["opinion_persona_a_signal_042", "opinion_persona_b_signal_042"],
    availableActions: [
      { id: "agree", labelKey: "action.agree", riskLevel: "low", enabled: true, requiresApproval: false },
      { id: "disagree", labelKey: "action.disagree", riskLevel: "low", enabled: true, requiresApproval: false },
      { id: "flag_suspicious", labelKey: "action.flagSuspicious", riskLevel: "medium", enabled: true, requiresApproval: false },
      { id: "create_research_task", labelKey: "action.createResearchTask", riskLevel: "low", enabled: true, requiresApproval: false }
    ]
  }
];
```

---

## 7.8 Mock Agora Sessions

```ts
export const mockAgoraSessions = [
  {
    id: "session_signal_042",
    type: "signal_review",
    title: "Signal review for alpha_042 / 0050.TW",
    linkedStrategyId: "alpha_042",
    linkedSignalId: "signal_042_20260503",
    participantPersonaIds: ["persona_a", "persona_b"],
    humanParticipantIds: ["trader_001"],
    status: "active",
    languageMode: "follow_ui",
    createdAt: "2026-05-03T10:35:00+08:00",
    messageIds: ["msg_001", "msg_002", "msg_003"],
    availableActions: [
      { id: "generate_summary", labelKey: "action.generateSummary", riskLevel: "low", enabled: true, requiresApproval: false },
      { id: "create_insight", labelKey: "action.createInsight", riskLevel: "low", enabled: true, requiresApproval: false },
      { id: "send_to_management", labelKey: "action.sendToManagement", riskLevel: "medium", enabled: true, requiresApproval: false }
    ]
  }
];
```

---

## 8. Demo Scenarios

Lovable should implement mock UI flows for the following demo scenarios.

---

## 8.1 Scenario A — Strategy Review Flow

```text
Goal:
Show a replicated strategy being submitted for review.

Steps:
1. User opens /management/strategies.
2. User selects alpha_042.
3. Strategy detail shows lifecycle state = replicated.
4. Overview shows blocker: missing committee memo.
5. User opens Governance tab.
6. User clicks Submit Review.
7. A confirmation / review request drawer opens.
8. User attaches mock evidence pack.
9. User submits.
10. Strategy state updates to under_review or review_submitted.
11. Job / event appears in Jobs and Event Stream.
```

Acceptance:

```text
Submit Review action is visible only when enabled.
Audit event is created.
Notification appears.
Review request appears in Governance queue.
```

---

## 8.2 Scenario B — Live Drawdown Alert to Incident to Rollback

```text
Goal:
Show Management Console handling an execution issue.

Steps:
1. User opens /management/command-center.
2. High severity alert appears for alpha_017.
3. User opens Alert Inspector.
4. User clicks Open Incident.
5. Incident detail page opens.
6. User asks Persona B for analysis.
7. Mock analysis appears in incident timeline.
8. User clicks Rollback.
9. High-risk confirmation modal appears.
10. User enters audit memo and confirms.
11. Mock rollback job starts.
12. Runtime / strategy status updates after job completion.
```

Acceptance:

```text
Rollback requires high-risk modal.
Rollback creates a job.
Incident timeline updates.
Audit trail records the action.
```

---

## 8.3 Scenario C — Quarterly Ranking and Capital Rebalance

```text
Goal:
Show capital manager running a quarterly rebalance.

Steps:
1. User opens /management/rebalance.
2. Selects rebalance_2026_q2_pool_alpha.
3. Page shows metrics frozen, ranking calculated, simulation ready.
4. User reviews ranking result.
5. User opens allocation simulation.
6. User applies a manual override.
7. User submits rebalance for review.
8. Governance request is created.
9. After approval, user applies rebalance.
10. Capital pool allocation changes.
```

Acceptance:

```text
Formula version is visible.
Score breakdown is visible.
Manual override requires reason.
Apply Rebalance is high-risk and requires confirmation.
```

---

## 8.4 Scenario D — New Persona Tool / MCP / Skill Permission

```text
Goal:
Show persona permission management.

Steps:
1. User opens /management/personas/persona_a.
2. User opens Tools / MCP / Skills tab.
3. Permission matrix shows current permissions.
4. User grants new MCP tool permission.
5. System shows approval required.
6. Approval request appears in Governance queue.
7. After approval, persona permission updates.
```

Acceptance:

```text
Permission matrix supports grant / revoke.
MCP permission change creates approval request.
Audit timeline records before / after.
```

---

## 8.5 Scenario E — Agora Signal Review to Research Task

```text
Goal:
Show trader using Agora and creating valuable structured feedback.

Steps:
1. Trader opens /agora/signals.
2. Selects signal_042_20260503.
3. Signal detail shows explanation and persona opinions.
4. Trader clicks Disagree.
5. Trader enters rationale: market regime changed after macro event.
6. Trader clicks Create Research Task.
7. System creates insight / research task handoff.
8. Management Command Center shows incoming item.
```

Acceptance:

```text
Trader feedback is captured as structured signal_feedback.
No live trading action is possible in Agora.
Handoff item appears in Management mock data.
```

---

## 8.6 Scenario F — Skill Draft to Sandbox to Approval

```text
Goal:
Show Agora Skill Coaching creating a draft and Management approving it.

Steps:
1. AI Trainer opens /agora/skill-coaching.
2. Creates skill idea: explain signal using similar historical cases.
3. AI draft appears.
4. Trainer edits description.
5. Runs mock sandbox test.
6. Sends skill draft to Management.
7. Management /skills shows draft pending approval.
8. Capability Admin reviews risk classification.
9. Approves skill.
10. Skill becomes active and assignable to personas.
```

Acceptance:

```text
Skill cannot become active directly from Agora.
Sandbox result is visible.
Approval is required in Management.
```

---

## 9. Translation Dictionary Requirements

Lovable must include a basic translation dictionary.

### 9.1 Required locale keys

```text
nav.management.commandCenter
nav.management.strategies
nav.management.personas
nav.management.capital
nav.management.ranking
nav.management.rebalance
nav.management.evolution
nav.management.experiments
nav.management.governance
nav.management.deployment
nav.management.runtimes
nav.management.risk
nav.management.incidents
nav.management.tools
nav.management.mcp
nav.management.skills
nav.management.artifacts
nav.management.lineage
nav.management.jobs
nav.management.audit
nav.management.settings

nav.agora.daily
nav.agora.markets
nav.agora.watchlist
nav.agora.signals
nav.agora.notebook
nav.agora.ask
nav.agora.committee
nav.agora.journal
nav.agora.triage
nav.agora.insights
nav.agora.trainer
nav.agora.memory
nav.agora.skillCoaching
nav.agora.personaLab
nav.agora.evaluations
nav.agora.channels
```

### 9.2 Action keys

```text
action.create
action.edit
action.clone
action.submitReview
action.approve
action.reject
action.requestChanges
action.promotePaper
action.promoteLive
action.rollback
action.pause
action.resume
action.retire
action.openIncident
action.acknowledge
action.askPersonaAnalysis
action.createResearchTask
action.createInsight
action.createTrainingExample
action.sendToManagement
action.runSandbox
action.grantPermission
action.revokePermission
action.applyRebalance
action.rerunSimulation
```

### 9.3 Status keys

```text
status.strategy.discovered
status.strategy.scaffolded
status.strategy.replicated
status.strategy.approved
status.strategy.paper
status.strategy.live
status.strategy.retired

status.job.queued
status.job.running
status.job.completed
status.job.failed

status.alert.new
status.alert.acknowledged
status.alert.investigating
status.alert.resolved

risk.low
risk.medium
risk.high
risk.critical
```

---

## 10. QA Checklist — Global

```text
[ ] App has /management and /agora route groups.
[ ] Product switcher works.
[ ] Language switcher supports zh-TW and en-US.
[ ] Locale persists in local storage.
[ ] Sidebar labels switch language.
[ ] Button labels switch language.
[ ] Status badges switch language.
[ ] Risk badges switch language.
[ ] Empty states switch language.
[ ] Error states switch language.
[ ] High-risk confirmation modal switches language.
[ ] Mock BFF client is used for all data.
[ ] No real backend calls are made.
[ ] No real trading operation is possible.
[ ] All major entities include availableActions.
[ ] Disabled actions show disabled reason.
[ ] Job drawer exists.
[ ] Notification center exists.
[ ] Right inspector drawer exists.
```

---

## 11. QA Checklist — Management Console

```text
[ ] Command Center shows lifecycle bottlenecks.
[ ] Command Center shows pending approvals.
[ ] Command Center shows open incidents.
[ ] Command Center shows running jobs.
[ ] Command Center shows Agora incoming queue.

[ ] Strategy list shows lifecycle state, owner persona, capital pool, risk, paper/live status.
[ ] Strategy detail has overview, spec, experiments, performance, execution, risk, incidents, artifacts, governance, lineage, audit.
[ ] Strategy high-risk actions require confirmation.

[ ] Persona list shows status, rank, capital binding, active strategies, tool permissions, policy violations.
[ ] Persona detail supports route policy, tools/MCP/skills, capital binding, activity monitor, training, evaluation.

[ ] Capital pool detail shows mandate, risk budget, exposure, persona binding, strategy binding, rebalance history.
[ ] Ranking formula page supports formula weights, penalties, normalization, compare, approval state.
[ ] Quarterly rebalance supports metric freeze, ranking result, allocation simulation, manual override, review, apply, rollback.

[ ] Evolution program page shows direction, fitness formula, mutation rules, active runs, candidates.
[ ] Experiments page shows running/completed/failed experiments and jobs.
[ ] Governance queue shows all approval types.
[ ] Runtime / Risk / Incident pages support response actions.
[ ] Tools / MCP / Skills pages support registry, permissions, audit.
[ ] Jobs page shows progress, logs, cancel/retry.
[ ] Audit page shows entity timeline.
```

---

## 12. QA Checklist — Agora Workbench

```text
[ ] Daily Trading Cockpit is the default Agora entry page.
[ ] Daily page shows market summary, signals, alerts, persona brief, research questions.
[ ] Market / Watchlist page supports annotations and create insight.
[ ] Signal Review supports agree, disagree, flag suspicious, ask persona, create research task.
[ ] Research Notebook supports note creation and convert to insight / strategy idea / experiment request.
[ ] Ask Personas supports persona selection and context selection.
[ ] Committee Room supports multiple personas, evidence pack, discussion, memo generation.
[ ] Decision Journal supports linked signal/strategy, rationale, confidence, outcome follow-up.
[ ] Alert Triage supports acknowledge, dismiss, escalate, ask persona.
[ ] Insight Inbox supports promote to strategy idea, attach to strategy, create research task, create training example.
[ ] Trainer Studio supports feedback queue, behavior rules, evaluation, drift monitor.
[ ] Memory Review supports approve/reject/edit/merge/move memory.
[ ] Skill Coaching supports draft, sandbox, send to Management.
[ ] Agora never exposes direct live deploy, rollback, capital rebalance, or production MCP/Skill approval actions.
```

---

## 13. High-Risk Action QA

High-risk actions must show confirmation modal.

```text
[ ] Promote to Live shows confirmation.
[ ] Rollback shows confirmation.
[ ] Apply Rebalance shows confirmation.
[ ] Freeze Capital Pool shows confirmation.
[ ] Change Ranking Formula active version shows confirmation.
[ ] Grant MCP Tool shows approval / confirmation.
[ ] Approve Skill shows confirmation.
[ ] Suspend Persona shows confirmation.
[ ] Emergency Kill shows critical confirmation.
```

Confirmation modal must include:

```text
[ ] Operation name
[ ] Target object
[ ] Current state
[ ] New state / expected effect
[ ] Risk impact
[ ] Required approval
[ ] Audit memo field
[ ] Confirm / cancel buttons
```

---

## 14. Final Acceptance Criteria

Lovable output is acceptable when:

```text
1. The app clearly separates Management Console and Agora Workbench.
2. Management Console combines management, monitoring, response, approval, deployment, rollback, and audit.
3. Agora Workbench is friendly to analysts and traders, not an admin dashboard.
4. All major pages run with mock data.
5. All actions call mock BFF client functions.
6. All major entity cards and detail pages show state, risk, linked entities, available actions, jobs, alerts, and audit summary.
7. High-risk actions are protected by confirmation modal.
8. zh-TW / en-US language switching works across both products.
9. Agora can create insights, research tasks, training examples, and management handoff items.
10. Agora cannot directly execute live or capital-affecting actions.
11. Management receives handoff items from Agora in Command Center.
12. Demo scenarios A-F can be clicked through with mock data.
```

---

## 15. Final Lovable Instruction Summary

```text
Build Pantheon Platform as a frontend-only, bilingual, mock-BFF-driven web app.

Create two product areas:
1. Pantheon Management Console for operational management and control.
2. Pantheon Agora Workbench for analyst/trader/AI trainer daily workflows.

Use all route maps, mock data models, components, state machines, and QA criteria described in Parts 1-8.

Prioritize clarity, role-based UX, action safety, and complete workflow coverage over decorative UI.
```
