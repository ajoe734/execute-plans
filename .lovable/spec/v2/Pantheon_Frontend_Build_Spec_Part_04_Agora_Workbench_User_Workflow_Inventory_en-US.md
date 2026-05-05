# Pantheon Frontend Build Spec
## Part 4 — Pantheon Agora Workbench User Workflow Inventory

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
