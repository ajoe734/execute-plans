# Pantheon Frontend Build Spec
## Part 5 — Pantheon Agora Workbench 頁面與功能設計（zh-TW）

版本：v1.0  
語系：繁體中文（zh-TW）  
目標讀者：Lovable、前端工程、產品設計、BFF 設計  
關聯文件：
- Part 1 — Master Blueprint
- Part 4 — Agora Workbench 使用者流程盤點

---

## 1. 本文件目的

本文件將 Part 4 盤點出的 Agora Workbench 使用者流程，轉換為 Lovable 可開始建置的前端頁面規格。

Agora Workbench 的主要使用者不是 Pantheon 的管理者，而是：

```text
分析師
交易者
AI 訓練師
研究助理
投資組合觀察者
```

因此 Agora 不應該做成「管理後台」或「AI 訓練資料庫」。它應該像一個真正能幫助分析師與交易者工作的 AI 輔助工作台。

Agora 的核心任務是：

```text
幫助使用者理解市場
幫助使用者 review strategy signals
幫助使用者問 AI personas
幫助使用者寫研究筆記
幫助使用者記錄交易決策
幫助使用者處理 alert triage
幫助 AI 訓練師審查 feedback / memory / skill draft
在日常使用中自然產生 insight、training example、research task、strategy proposal
```

Agora 不直接執行高風險管理操作：

```text
不直接 deploy live strategy
不直接 apply capital rebalance
不直接改 ranking formula
不直接授權 MCP / Tool / Skill 到 production
不直接改 live capital allocation
不直接 rollback live strategy
```

Agora 只能產生 request、proposal、insight、memo、training feedback，送回 Management Console 進入正式審批與管理流程。

---

## 2. Agora Workbench 產品原則

### 2.1 Workflow-first，不是 admin-first

Agora 的入口要從使用者每天真實工作開始，而不是從系統物件管理開始。

主要工作流：

```text
每日市場與策略概況
市場與 watchlist 分析
策略 signal review
研究筆記
詢問 AI persona
多 persona committee
交易決策日誌
alert triage
insight inbox
AI 訓練與 memory review
```

### 2.2 AI-assisted，但不要所有東西都變成聊天

AI persona 對話很重要，但 Agora 不應該只有一個聊天框。不同場景應有不同 UI：

```text
Signal Review 用 signal panel + persona commentary
Research Notebook 用 editor + AI sidecar
Committee 用 structured rounds
Decision Journal 用 structured decision form
Alert Triage 用 alert context + action cards
Ask Personas 才是完整對話頁
```

### 2.3 自然蒐集高品質資料

Agora 的資料蒐集應來自使用者日常動作：

```text
agree / disagree signal
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

這些動作背後會產生 structured events，供 Management Console、Persona Training、Strategy Improvement、Risk Review 使用。

### 2.4 使用者友善

Agora 的 UX 應比 Management Console 更低摩擦：

```text
少用高密度表格
多用卡片、上下文面板、筆記、時間線、對話、快速標註
保留一鍵轉 insight / research task / training example
把複雜管理流程藏在 handoff drawer 裡
```

---

## 3. Agora Workbench 主導航

Route group：

```text
/agora
```

左側導覽建議分組：

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

完整 route list：

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

## 4. Agora 共用 Layout

### 4.1 頁面基本結構

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

### 4.2 Right Context Panel 類型

Agora 頁面應共用右側 contextual panel。

支援：

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

### 4.3 全域快速操作

所有 Agora 頁面應支援快速操作：

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

這些操作的顯示與可用性由 BFF 回傳的 `availableActions` 決定。

---

## 5. Page Spec Format

後續每個頁面使用以下格式：

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

讓分析師與交易者每天進入 Agora 時，立即知道今天需要關注什麼。

## Main User Value

```text
不用打開多個頁面，就能看到市場摘要、策略 signal、風險 alert、AI persona brief、待處理研究問題。
```

## Layout

```text
Header: 日期、交易日狀態、市場時區、session language
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
今日尚無重要事項。你可以查看 Watchlist、開啟 Research Notebook，或詢問 Persona。
```

## Loading State

顯示 skeleton cards。

## Error State

```text
無法載入每日摘要。請檢查 BFF 連線，或稍後重試。
```

## Permission Rules

```text
Trader: 可 review signal、寫 note、建立 insight、ask persona
Analyst: 可建立 research task、note、insight
Observer: 只能查看與建立個人 note
AI Trainer: 可從 AI 回答建立 training example
```

## Acceptance Criteria

```text
頁面必須顯示每日摘要、priority queue、open alerts、persona brief。
每個卡片都必須能開啟 detail drawer。
使用者能從任何 priority item 建立 insight 或 research task。
所有文字必須支援 zh-TW / en-US。
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

提供市場觀察與 watchlist 分析入口，讓使用者把市場直覺轉成可用 insight。

## Layout

```text
Top: Market filter / asset universe / time range
Left: Watchlist table or card list
Center: Selected market / asset context
Right: Persona commentary and note sidecar
Bottom: Related strategies / signals / alerts
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
尚未建立 Watchlist。新增你關注的市場或標的，讓 Agora 幫你追蹤相關策略、signal 與事件。
```

## Acceptance Criteria

```text
使用者能新增 watchlist item。
使用者能對市場或標的新增 note。
使用者能一鍵將 note 轉成 insight。
右側 Persona Commentary 必須可切換 persona。
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

讓交易者與分析師 review 策略 signal，判斷 signal 是否合理，並自然收集人類 judgment。

## Signal List Layout

```text
Header: filters by strategy, asset, severity, review status
Main: Signal review queue
Right: Selected signal quick inspector
```

## Signal Detail Layout

```text
Header: Signal ID, strategy, asset, direction, confidence, timestamp
Top Summary: Signal explanation, risk tags, review status
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
目前沒有需要 review 的 signal。
```

## Error State

```text
無法載入 signal detail。請稍後重試。
```

## Permission Rules

```text
Trader: 可 agree / disagree / flag / attach rationale
Analyst: 可 create research task / insight
AI Trainer: 可把錯誤 AI 解釋轉成 training example
Observer: read-only
```

## Acceptance Criteria

```text
Signal detail 必須顯示 explanation、market context、persona opinions。
Agree / Disagree 必須要求可選 reason。
Flag Suspicious 必須產生 structured feedback event。
可從 signal 建立 research task。
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

讓使用者寫研究筆記、交易觀察、市場假設，並能一鍵轉成 insight、strategy idea、experiment request 或 training example。

## Layout

```text
Notebook List:
- filter by tag, strategy, asset, author, note type
- note cards / table toggle

Notebook Detail:
Left: Note editor
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
尚無研究筆記。建立第一則市場觀察、策略假設或風險疑慮。
```

## Acceptance Criteria

```text
支援 Markdown editor。
使用者能標記 note type。
使用者能 link strategy / signal / asset。
使用者能一鍵轉 insight / strategy idea / experiment request。
AI sidecar 不能自動改正文，必須由使用者確認採納。
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

提供帶上下文的 AI persona 問答，不是無上下文聊天。

## Layout

```text
Left: Session list / saved contexts
Center: Conversation canvas
Right: Context panel + persona panel + conversion actions
Top: Persona selector, context selector, response mode, language selector
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
選擇一個 persona 與上下文，開始詢問。
```

## Permission Rules

```text
AI Trainer: 可建立 training example
Trader / Analyst: 可建立 note / insight / research task
Observer: read-only sessions
```

## Acceptance Criteria

```text
Ask Personas 必須要求使用者選擇 persona 或使用 default persona。
可選 context。
每則 AI 回覆都必須有 Useful / Not Useful / Flag Incorrect。
可以從回覆建立 note、insight、training example。
語言必須可跟隨目前 locale 或 session language。
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

提供 structured multi-persona debate，用於 strategy review、signal doubt、alert triage、incident analysis、research decision。

## Layout

```text
Committee List:
- open sessions
- recent memos
- templates

Committee Detail:
Header: target object, objective, participants, status
Left: Agenda / Evidence Pack
Center: Round-based discussion
Right: Decision / Memo / Follow-up actions
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
尚無 committee session。你可以從 signal、strategy、alert 或 research note 建立一個 committee。
```

## Acceptance Criteria

```text
Committee session 必須支援 target object。
必須能選擇多個 persona。
必須能產生 memo。
Memo 可送到 Management Console 的 Governance / Review Evidence。
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

捕捉交易者與分析師的真實判斷、信心、理由、結果，形成高價值訓練與策略改善資料。

## Layout

```text
List View:
- entries by date, strategy, asset, outcome, confidence

Detail View:
- structured decision form
- linked signal / strategy / market
- AI persona consulted
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
使用者能建立 structured decision entry。
必須支援 confidence 與 actual outcome。
可以連結 signal / strategy。
可以轉 insight 或 training example。
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

讓分析師 / 交易者協助判斷 alert 的市場與策略意義，產生可用風險回饋。

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
Agora users may triage or escalate, but cannot pause / rollback directly.
Pause / rollback must be performed in Management Console.
```

## Acceptance Criteria

```text
Alert detail 必須顯示 market context、strategy context、similar past incidents。
Dismiss 必須可選 reason。
Escalate 必須建立 incident request 或 handoff 到 Management Console。
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

集中處理由 Agora 日常使用自然產生的 insight candidate。

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
Insight Inbox 必須可依來源過濾。
每條 insight 必須能被轉成 strategy idea / research task / training example。
送出 Management Console 後狀態必須更新為 submitted_to_management。
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

管理 AI persona 的行為規則、feedback queue、training examples、evaluation results 與 drift。

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
Trader can create feedback but cannot edit persona rules.
```

## Acceptance Criteria

```text
Trainer Studio 必須能看到 feedback queue。
可從 feedback 建立 training example。
Persona rule changes must remain draft until submitted to Management Console.
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

審查、合併、刪除、移動、標記 AI persona memory。

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
Memory item 必須顯示 source session / message。
Approve / Reject 必須留下 reviewer 與 timestamp。
Sensitive memory 必須有明顯標示。
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

把使用者需求或 AI 對話轉成 skill draft，但不直接上線。Skill draft 必須送 Management Console 的 Skill Approval。

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
Skill Coaching 不得提供直接 activate skill 的操作。
Submit to Management 後必須建立 Management Skill Approval request。
Sandbox result 必須顯示 pass / fail / logs。
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
n建立、測試、比較 persona draft，送 Management Console 正式審批。

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

管理 persona evaluation suite 與 evaluation run。

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
Failure case can be converted into training example.
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

管理 Agora 的外部入口，例如 Web、Telegram、Discord、Webhook。此頁只管理 Agora channels，不管理 Core live operations。

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

Agora 所有高風險或正式管理動作都必須走 handoff。

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
所有 handoff 都必須建立 traceable record。
handoff 成功後 Agora 顯示 submitted 狀態。
Management Console Command Center 可看到 incoming queue。
```

---

# 22. Localization Requirements

Agora 必須支援：

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
User-generated content remains original language by default.
AI persona response defaults to current UI locale unless session language overrides.
```

## Session Language Options

```text
Follow UI Language
zh-TW
en-US
Mixed / Original
```

## Translation-related BFF Rule

BFF should return enum codes and label keys, not hardcoded Chinese or English labels.

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

## 下一份文件

```text
Part 6 — Shared Data Model + BFF API Contract
```

Part 6 將定義 Lovable mock data 與 BFF DTO 結構，包括 Strategy、Persona、CapitalPool、Signal、AgoraSession、Message、Insight、Job、Alert、MCP、Skill 等核心資料模型與 API route。
