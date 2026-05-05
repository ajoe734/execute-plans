# Pantheon Frontend Build Spec
## Part 4 — Pantheon Agora Workbench 使用者流程盤點

**版本**: v1.0  
**語系**: zh-TW  
**適用對象**: Lovable 前端建置、產品設計、BFF 設計、Pantheon 團隊審查  
**範圍**: Pantheon Agora Workbench 的使用者角色、日常工作流程、資料捕捉、與 Management Console 的交接流程。

---

# 1. 本文件目的

Part 1 已定義 Pantheon Platform 的總體切分：

```text
Pantheon Management Console
= 管理、監控、審批、部署、反應、回滾、審計。

Pantheon Agora Workbench
= 分析師、交易者、AI 訓練師日常使用的 AI 工作台。
```

Part 2 與 Part 3 已聚焦 Management Console。  
本文件 Part 4 專門盤點 **Pantheon Agora Workbench** 的完整使用者流程。

本文件暫時不設計每個頁面的詳細 layout，而是先回答：

```text
誰會使用 Agora？
他們每天為什麼會進來？
每個工作流程如何幫助分析師 / 交易者 / AI 訓練師？
哪些互動會自然產生可用資料？
哪些產物會送回 Management Console？
哪些操作在 Agora 裡禁止執行？
```

Part 5 才會把這些流程轉成 Lovable 可建置的頁面規格。

---

# 2. Agora 的產品定位

Pantheon Agora Workbench 不是「AI 訓練後台」，也不是「聊天工具」。

它應該是：

> 給分析師、交易者、AI 訓練師每天使用的 AI 協作工作台。

Agora 的核心價值是：

```text
1. 幫分析師更快理解市場、策略與 signal。
2. 幫交易者 review signal、alert、風險與決策。
3. 讓使用者能自然詢問 AI persona 與 multi-persona committee。
4. 讓研究筆記、交易判斷、AI 回答、human correction 自然轉成 structured insight。
5. 把真正有用的資訊送回 Pantheon Management Console，進一步變成策略、研究任務、訓練資料、review evidence 或風控回饋。
```

換句話說：

```text
Agora 表面上是分析師 / 交易者的輔助工作台。
Agora 背後是 Pantheon 的高品質人類判斷與 AI 訓練資料收集層。
```

資料收集不應該靠強迫填表，而是透過使用者自然工作流程產生。

---

# 3. Agora 與 Management Console 的邊界

## 3.1 Agora 可以做的事情

```text
查看市場摘要
查看 watchlist
查看 paper / live 策略摘要
review strategy signal
詢問 AI persona
召開 committee room
寫研究筆記
建立交易決策日誌
triage alert
產生 trader insight
產生 research task request
產生 strategy idea proposal
產生 training example
產生 memory review item
產生 skill draft
產生 MCP / tool request
產生 committee memo
```

## 3.2 Agora 不可以直接做的事情

Agora 不應直接執行高風險管理操作：

```text
不可直接 promote strategy to paper
不可直接 promote strategy to live
不可直接 apply capital rebalance
不可直接改 ranking formula
不可直接改 capital allocation
不可直接 deploy live artifact
不可直接 rollback live strategy
不可直接 grant production MCP tool
不可直接 approve production skill
不可直接修改 persona route policy 的 active version
```

如果使用者在 Agora 裡產生這類需求，只能建立 request / proposal，送到 Management Console 的正式治理流程。

範例：

```text
Trader 在 Agora Signal Review 中認為某 live strategy 應該降權
→ Agora 建立 risk_feedback + allocation_review_request
→ Management Console 的 Capital / Risk / Governance queue 顯示待處理項目
→ Risk Officer / Capital Manager 在 Management Console 裡審查與批准
```

---

# 4. Agora 主要使用者角色

## 4.1 Analyst

分析師主要使用 Agora 來：

```text
看 market summary
整理 research notebook
詢問 AI persona 對策略或市場的看法
把市場觀察轉成 insight
把研究假設轉成 strategy idea 或 experiment request
比較不同 persona 的觀點
```

分析師最需要的是：

```text
快速理解資料
方便寫筆記
能把筆記轉成可執行研究任務
能追蹤自己提出的 idea 後來變成什麼
```

## 4.2 Trader

交易者主要使用 Agora 來：

```text
review strategy signal
review alert
理解 live / paper strategy 的異常
記錄 decision rationale
詢問 AI persona
召開 quick committee
標註 signal 是否合理
標註 alert 是否 noise
```

交易者最需要的是：

```text
快速知道發生什麼事
快速知道策略為什麼發出 signal
快速知道 AI personas 是否同意
能輕鬆記錄自己為什麼採納 / 拒絕某個 signal
```

## 4.3 AI Trainer

AI 訓練師主要使用 Agora 來：

```text
審查 AI 回答
接受 / 拒絕 training feedback
管理 training examples
審查 memory
觀察 persona drift
建立或修正 persona behavior rules
把錯誤回答轉成 evaluation case
把 skill idea 轉成 draft skill
```

AI Trainer 最需要的是：

```text
清楚知道 AI 哪裡錯
能把人類修正轉成訓練資料
能審查 memory 是否應該保存
能把 skill draft 送到 Management Console 正式審批
```

## 4.4 Research Assistant

Research Assistant 可以做：

```text
整理資料
標註 insight
準備 committee evidence pack
整理 notebook
建立 research task draft
```

## 4.5 Portfolio Observer

Portfolio Observer 可以看：

```text
daily summary
signal review
alerts
persona commentary
decision journal
```

但不能進行高風險 action。

---

# 5. Agora 的核心資料產物

Agora 每個工作流程都應該產生 structured artifacts，而不是只留下 chat log。

核心產物：

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

這些產物會送回 Management Console 進一步管理。

---

# 6. Agora 工作流程總覽

Agora 必須支援以下主要使用者流程：

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

以下逐一盤點。

---

# 7. W1 — Daily Trading Cockpit Workflow

## 7.1 使用者

```text
Trader
Analyst
Portfolio Observer
Research Lead
```

## 7.2 目的

Daily Trading Cockpit 是 Agora 的首頁。  
它要讓使用者每天一進來就知道：

```text
今天市場發生什麼？
有哪些重要 signal？
哪些 strategy 需要注意？
有哪些 alerts 需要人工判斷？
AI personas 今天有什麼摘要或分歧？
我昨天留下的 research questions 有什麼進展？
```

## 7.3 主要流程

```text
1. 使用者打開 Daily Trading Cockpit。
2. 系統顯示市場摘要、watchlist 變化、strategy highlights、alerts、persona daily brief。
3. 使用者可以點開任一 item 查看 context。
4. 使用者可以標記重要 / 不重要。
5. 使用者可以詢問 persona。
6. 使用者可以把 item 轉成 insight、research note、strategy idea 或 alert triage record。
7. 系統把這些行為轉成 structured event。
```

## 7.4 主要資料區塊

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

## 7.5 使用者操作

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

## 7.6 自然捕捉的資料

```text
使用者每天關心哪些市場
哪些 signal 被打開
哪些 alerts 被認為重要
哪些 AI persona brief 被使用者採納
哪些市場摘要被轉成 research note
哪些 item 被 dismiss 為 noise
```

## 7.7 送回 Management Console 的產物

```text
Insight
ResearchTaskRequest
StrategyIdeaProposal
AlertTriageRecord
PersonaResponseFeedback
```

## 7.8 禁止操作

Daily Cockpit 不可直接：

```text
deploy strategy
rollback strategy
change capital allocation
approve promotion
apply rebalance
```

---

# 8. W2 — Market & Watchlist Workflow

## 8.1 使用者

```text
Analyst
Trader
Research Assistant
```

## 8.2 目的

幫助使用者追蹤市場與 watchlist，並把市場觀察轉成可用 research insight。

## 8.3 主要流程

```text
1. 使用者查看 watchlist。
2. 系統顯示價格變化、事件摘要、相關策略 exposure、相關 signals、AI commentary。
3. 使用者對某個標的或市場事件做 annotation。
4. 使用者可詢問 persona：「為什麼這個標的今天異動？」
5. 使用者可把 annotation 轉成 insight 或 strategy idea。
```

## 8.4 主要資料區塊

```text
Watchlist
Market Events
Price / Volume / Volatility Summary
Related Strategies
Related Signals
Persona Commentary
Trader Annotations
```

## 8.5 使用者操作

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

## 8.6 自然捕捉的資料

```text
使用者關心的標的
市場事件與策略的人工連結
交易者對 regime change 的判斷
哪些標的常被拿來問 AI
哪些市場觀察被轉成策略假設
```

## 8.7 送回 Management Console 的產物

```text
MarketInsight
StrategyIdeaProposal
ResearchTaskRequest
StrategyAnnotation
```

---

# 9. W3 — Strategy Signal Review Workflow

## 9.1 使用者

```text
Trader
Analyst
Risk Officer observer
```

## 9.2 目的

讓交易者 review 策略 signal 是否合理，並自然捕捉人類對 signal 的判斷。

這是 Agora 最重要的資料捕捉流程之一。

## 9.3 主要流程

```text
1. 系統列出最新或重要 strategy signals。
2. 使用者點開 signal。
3. 系統顯示 signal explanation、strategy context、market context、similar historical cases、persona opinions。
4. 使用者標記 Agree / Disagree / Unsure / Flag Suspicious。
5. 使用者可以輸入 rationale。
6. 使用者可以詢問 persona 或召開 committee。
7. 使用者可以把 signal feedback 轉成 research task、risk feedback 或 strategy improvement request。
```

## 9.4 Signal Review 必須顯示

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

## 9.5 使用者操作

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

## 9.6 自然捕捉的資料

```text
交易者同意哪些 signal
交易者不同意哪些 signal
不同意的理由
哪些 market regime 被人類認為不同
哪些 features 被人類懷疑
哪些 persona 解釋有幫助
哪些 signal 後續真的失效
```

## 9.7 送回 Management Console 的產物

```text
SignalFeedback
RiskFeedback
StrategyImprovementRequest
ResearchTaskRequest
PersonaResponseFeedback
DecisionJournalLink
```

## 9.8 禁止操作

Signal Review 不可直接：

```text
cancel live order
change live allocation
rollback live strategy
approve / reject live promotion
```

可以建立 request：

```text
Request Risk Review
Request Strategy Pause
Request Allocation Review
```

---

# 10. W4 — Research Notebook Workflow

## 10.1 使用者

```text
Analyst
Research Assistant
Trader
AI Trainer
```

## 10.2 目的

Research Notebook 是分析師整理想法與轉換研究任務的地方。  
它要像真正好用的研究筆記，而不是資料庫表單。

## 10.3 主要流程

```text
1. 使用者建立 note。
2. 使用者可以插入 market event、strategy、signal、chart、persona response、experiment result。
3. 使用者用 markdown / structured fields 記錄想法。
4. 使用者可以請 persona expand / critique / summarize。
5. 使用者可以把 note 轉成 insight、strategy idea、experiment request、committee question。
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

## 10.5 使用者操作

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

## 10.6 自然捕捉的資料

```text
分析師真正的研究假設
交易者的市場 regime 判斷
策略失效直覺
常被提到的 feature / market / risk
哪些筆記被轉成正式策略或實驗
```

## 10.7 送回 Management Console 的產物

```text
ResearchNote
Insight
StrategyIdeaProposal
ExperimentRequest
CommitteeQuestion
```

---

# 11. W5 — Ask Personas Workflow

## 11.1 使用者

```text
Analyst
Trader
AI Trainer
Research Assistant
```

## 11.2 目的

讓使用者在有上下文的情況下詢問 AI persona，不是空白聊天。

## 11.3 主要流程

```text
1. 使用者選擇 context：market / signal / strategy / alert / note / incident。
2. 使用者選擇 persona。
3. 使用者選擇 mode：explain / critique / propose / red-team / summarize / compare。
4. Persona 回答。
5. 使用者可以標記 useful / not useful / incorrect。
6. 使用者可以把回答保存為 note、insight、training example 或 committee input。
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

## 11.5 使用者操作

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

## 11.6 自然捕捉的資料

```text
哪些 persona 對哪些問題有幫助
哪些回答被使用者採納
哪些回答被修正
哪類問題最常被問
哪個 persona 在哪類任務上表現不好
```

## 11.7 送回 Management Console 的產物

```text
PersonaResponseFeedback
TrainingExample
ResearchNote
Insight
CommitteeSeed
```

---

# 12. W6 — Committee Room Workflow

## 12.1 使用者

```text
Analyst
Trader
Research Lead
Reviewer
AI Trainer
```

## 12.2 目的

讓多個 AI persona 對同一個 strategy / signal / alert / incident / note 進行 structured debate。

Committee Room 不是普通群聊。它要輸出可用的 committee memo 或 review evidence。

## 12.3 主要流程

```text
1. 使用者選擇 target object：strategy / signal / alert / incident / note。
2. 選擇 committee template。
3. 選擇 personas。
4. 系統載入 evidence pack。
5. Personas 依照 round 發言。
6. 使用者可以追問。
7. 系統整理 disagreement、risk objections、recommendations。
8. 產生 committee memo。
9. 使用者可以送到 Management Console 的 Governance / Review。
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

## 12.5 使用者操作

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

## 12.6 自然捕捉的資料

```text
persona 之間的分歧
使用者採納哪個論點
哪些 risk objection 有價值
committee memo 是否促成 review approval
哪些 persona 常提供有用反駁
```

## 12.7 送回 Management Console 的產物

```text
CommitteeMemo
ReviewEvidence
ResearchTaskRequest
RiskFeedback
TrainingExample
```

---

# 13. W7 — Decision Journal Workflow

## 13.1 使用者

```text
Trader
Analyst
Portfolio Observer
```

## 13.2 目的

記錄交易者與分析師的真實判斷與 rationale。  
這是高價值資料來源。

## 13.3 主要流程

```text
1. 使用者建立 decision entry。
2. 連結 strategy / signal / alert / market event。
3. 記錄 decision、rationale、confidence、expected outcome。
4. 可詢問 persona。
5. 設定 follow-up date。
6. 後續標記 actual outcome。
7. 系統把 decision 和 outcome 轉成 training / ranking / strategy improvement signals。
```

## 13.4 Journal Entry 欄位

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

## 13.5 使用者操作

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

## 13.6 自然捕捉的資料

```text
交易者的真實決策邏輯
交易者信心與結果的關係
AI 建議是否被採納
AI 建議是否改善結果
哪些策略常需要人工 override
```

## 13.7 送回 Management Console 的產物

```text
DecisionJournalEntry
TraderJudgementSignal
PersonaTrustSignal
StrategyImprovementRequest
TrainingExample
```

---

# 14. W8 — Alert Triage Workflow

## 14.1 使用者

```text
Trader
Analyst
Risk Officer observer
```

## 14.2 目的

讓分析師 / 交易者協助判斷 alerts 是否重要，並補充市場脈絡。

Management Console 管正式 incident。  
Agora Alert Triage 管使用者判斷與解釋。

## 14.3 主要流程

```text
1. 使用者看到 alert。
2. 系統顯示 alert summary、strategy context、market context、persona explanation、similar incidents。
3. 使用者標記：noise / important / needs investigation / escalate。
4. 使用者可添加 trader interpretation。
5. 使用者可詢問 persona 或開 committee。
6. 若升級，送到 Management Console Incident Center。
```

## 14.4 使用者操作

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

## 14.5 自然捕捉的資料

```text
哪些 alerts 是 noise
哪些 alerts 真正重要
交易者如何判斷嚴重性
哪些 alert pattern 需要新規則
哪些 persona 解釋有幫助
```

## 14.6 送回 Management Console 的產物

```text
AlertTriageRecord
RiskFeedback
IncidentEscalationRequest
ResearchTaskRequest
PostmortemInput
```

---

# 15. W9 — Insight Inbox Workflow

## 15.1 使用者

```text
Analyst
Trader
Research Assistant
AI Trainer
```

## 15.2 目的

集中處理從 Agora 自然產生的 insight candidates。

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

## 15.4 主要流程

```text
1. 系統收集 insight candidates。
2. 使用者 review candidate。
3. 使用者分類與標籤。
4. 使用者決定轉成 strategy idea、research task、training example、risk feedback 或 archive。
5. 重要項目送到 Management Console。
```

## 15.5 使用者操作

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

## 15.6 送回 Management Console 的產物

```text
Insight
StrategyIdeaProposal
ResearchTaskRequest
TrainingExample
RiskFeedback
```

---

# 16. W10 — AI Trainer Feedback Workflow

## 16.1 使用者

```text
AI Trainer
Research Lead
Analyst
```

## 16.2 目的

讓 AI Trainer 管理人類回饋，並把它轉成訓練資料、persona rule update 或 evaluation case。

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

## 16.4 主要流程

```text
1. 系統收集 feedback item。
2. AI Trainer review。
3. AI Trainer 選擇處理方式：ignore / create training example / update behavior rule / create eval case / request persona policy change。
4. 若涉及 persona active version，送到 Management Console 審批。
```

## 16.5 使用者操作

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

## 16.6 送回 Management Console 的產物

```text
TrainingExample
PersonaUpdateRequest
EvaluationCase
PolicyReviewRequest
```

---

# 17. W11 — Memory Review Workflow

## 17.1 使用者

```text
AI Trainer
Analyst
Research Lead
```

## 17.2 目的

管理 AI persona 的 memory 是否應保存、修改、合併、移動或刪除。

## 17.3 Memory Types

```text
Persona Private Memory
Shared Knowledge Memory
Trader Feedback Memory
Research Memory
Do-Not-Remember Item
Sensitive Memory
```

## 17.4 Memory 狀態

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

## 17.5 使用者操作

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

## 17.6 送回 Management Console 的產物

```text
MemoryApprovalEvent
MemoryPolicyEvent
PersonaMemoryUpdate
SharedKnowledgeUpdate
```

---

# 18. W12 — Skill Coaching Workflow

## 18.1 使用者

```text
AI Trainer
Analyst
Capability Admin observer
```

## 18.2 目的

把使用者日常需求轉成 skill draft，但不直接上線。  
正式 approval 必須在 Management Console 的 Skill Management 裡完成。

## 18.3 主要流程

```text
1. 使用者從 conversation / note / repeated task 產生 skill idea。
2. AI 產生 skill draft。
3. AI Trainer 編輯 skill description、expected input/output、risk notes。
4. 在 Agora 裡做 sandbox preview。
5. Submit to Management Skill Approval。
```

## 18.4 使用者操作

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

## 18.5 送回 Management Console 的產物

```text
SkillDraft
SkillApprovalRequest
CapabilityRequest
ToolRequirementRequest
```

## 18.6 禁止操作

Agora Skill Coaching 不可直接：

```text
approve skill
assign production skill to persona
grant MCP permission
deploy skill into live runtime
```

---

# 19. W13 — Persona Lab Workflow

## 19.1 使用者

```text
AI Trainer
Research Lead
Admin observer
```

## 19.2 目的

建立或測試新 persona draft，並送到 Management Console 進行正式 activation / policy approval。

## 19.3 主要流程

```text
1. 建立 persona draft 或 clone existing persona。
2. 設定 role、style、risk appetite、research preference。
3. 使用 scenario tests 測試 persona。
4. 和既有人格版本比較。
5. 產生 persona activation proposal。
6. 送到 Management Console 審批。
```

## 19.4 使用者操作

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

## 19.5 送回 Management Console 的產物

```text
PersonaDraft
PersonaActivationRequest
PersonaVersionProposal
RoutePolicyDraft
```

---

# 20. W14 — Evaluation Workflow

## 20.1 使用者

```text
AI Trainer
Research Lead
Reviewer
```

## 20.2 目的

評估 persona 在不同任務上的品質。

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

## 20.4 主要流程

```text
1. 選擇 persona version。
2. 選擇 evaluation suite。
3. Run evaluation。
4. 查看 failures。
5. 將 failure 轉成 training example 或 behavior rule update。
6. 若新版本通過，送 Management Console 審批。
```

## 20.5 送回 Management Console 的產物

```text
EvaluationRun
EvaluationFailure
PersonaVersionProposal
TrainingExample
```

---

# 21. W15 — Channel / External Conversation Workflow

## 21.1 使用者

```text
Trader
Analyst
AI Trainer
Admin
```

## 21.2 目的

支援 Web、Telegram、Discord 或其他 channel 的對話入口，但所有高風險操作仍不可在 external channel 直接執行。

## 21.3 Channel 類型

```text
Web Agora
Telegram
Discord
Webhook
Optional Slack / Email
```

## 21.4 管理 / 使用流程

```text
1. 使用者在外部 channel 與 persona 互動。
2. 系統將對話同步到 Agora session。
3. 可從對話中建立 insight / training example / note。
4. 若外部 channel 嘗試高風險操作，只建立 request，不直接執行。
```

## 21.5 送回 Management Console 的產物

```text
ChannelSession
ExternalInsight
TrainingExample
ActionRequest
```

---

# 22. W16 — Agora → Management Handoff Workflow

## 22.1 目的

把 Agora 產生的使用者工作產物送到 Management Console 正式流程。

## 22.2 Handoff 類型

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

## 22.3 Handoff 狀態

```text
draft
submitted
accepted
rejected
converted
archived
```

## 22.4 使用者操作

```text
Submit to Management
Set Priority
Assign Target Object
Add Rationale
Attach Evidence
Withdraw Submission
View Management Status
```

## 22.5 必要 UX

Agora 使用者必須能看到：

```text
我提交的 insight 後來去哪裡了？
我的 strategy idea 是否被接受？
我的 training feedback 是否被採用？
我的 signal disagreement 是否變成 research task？
```

因此 Agora 需要 `My Submissions` 或在 Insight Inbox 中顯示 handoff status。

---

# 23. Agora 的自然資料捕捉設計

Agora 不應要求使用者填複雜表單。  
應該把日常操作轉成 structured events。

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

## 23.2 範例：Signal Feedback

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

## 23.3 範例：Persona Response Feedback

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

# 24. Agora 權限原則

## 24.1 Agora 可以建立 request

Agora 使用者可以建立：

```text
ResearchTaskRequest
StrategyIdeaProposal
SkillApprovalRequest
MCPToolRequest
RiskReviewRequest
PersonaUpdateRequest
```

## 24.2 Agora 不直接執行高風險 action

不允許：

```text
direct live deployment
direct rollback
direct capital rebalance
direct route policy activation
direct MCP production grant
direct skill production approval
```

## 24.3 不同角色顯示不同功能

```text
Trader: Signal Review, Alert Triage, Decision Journal, Ask Personas
Analyst: Notebook, Market Watchlist, Insight Inbox, Committee
AI Trainer: Trainer Studio, Memory Review, Skill Coaching, Persona Lab, Evaluations
Observer: read-only view
```

---

# 25. Agora i18n / 語系要求

Agora 必須支援：

```text
zh-TW
en-US
```

UI 文字必須使用 translation keys。  
使用者產生內容不強制翻譯，但可提供：

```text
Translate View
Summarize in Current Language
```

AI persona 預設跟隨 session language：

```text
Follow UI Language
zh-TW
en-US
Mixed / Original
```

---

# 26. Lovable 實作重點提示

Part 5 會細化頁面，但 Lovable 在理解 Part 4 時需注意：

```text
1. Agora 是分析師 / 交易者工作台，不是 AI 管理後台。
2. Daily Trading Cockpit 是 Agora 首頁。
3. Chat 不是唯一互動形式，必須有 signal review、notebook、journal、triage。
4. 每個 workflow 都要能產生 structured artifact。
5. Agora 不能直接做 Management Console 的高風險操作。
6. Agora 必須能顯示提交到 Management Console 的 status。
7. AI Trainer 功能要存在，但不要讓它壓過交易者 / 分析師日常入口。
```

---

# 27. Part 4 Acceptance Criteria

Part 4 規格完成後，Lovable 後續建 Part 5 時必須確保：

```text
Agora 有清楚的 trader / analyst / AI trainer 使用流程。
Daily Trading Cockpit 是主要入口。
Signal Review 能捕捉 agree / disagree / rationale。
Research Notebook 能轉 insight / strategy idea / experiment request。
Ask Personas 支援 context-aware 問答。
Committee Room 產生 committee memo。
Decision Journal 捕捉 decision rationale 與 outcome。
Alert Triage 能把 alert 判斷送回 Management Console。
Insight Inbox 能處理從日常工作產生的 insight candidates。
Trainer Studio / Memory Review / Skill Coaching / Persona Lab 存在，但不是 Agora 的唯一重點。
Agora 所有高風險操作都只能建立 request，不能直接執行。
Agora 所有關鍵互動都能產生 structured events。
Agora 支援 zh-TW / en-US 語系切換。
```

---

# 28. 下一份文件

下一份是：

```text
Part 5 — Pantheon Agora Workbench 頁面與功能設計
```

Part 5 會把本文件的工作流程轉成 Lovable 可建置的頁面規格，包括：

```text
route
layout
components
tables
cards
drawers
chat/session canvas
signal review panel
notebook editor
decision journal editor
committee room UI
BFF API
realtime events
empty/loading/error states
role-based UX
acceptance criteria
```
