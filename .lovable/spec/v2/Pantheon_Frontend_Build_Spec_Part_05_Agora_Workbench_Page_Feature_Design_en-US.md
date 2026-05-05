# Pantheon Frontend Build Spec
## Part 5 — Pantheon Agora Workbench Page & Feature Design (en-US)

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
