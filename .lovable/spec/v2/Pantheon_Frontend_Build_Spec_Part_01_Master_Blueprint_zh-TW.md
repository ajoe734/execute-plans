# Pantheon Frontend Build Spec — Part 1
# Master Blueprint / 總體產品與系統框架

版本：v1.0  
語系：zh-TW  
目標讀者：Lovable、前端工程、BFF 工程、Pantheon 產品設計與審查者  
交付目的：定義 Pantheon 前端系統的總體產品框架，讓 Lovable 能開始建立雙前端系統：Pantheon Management Console 與 Pantheon Agora Workbench。

---

## 0. 本文件的定位

本文件是 Pantheon 前端規劃的總綱，不是單頁 dashboard 規格，也不是 MVP 提案。後續文件會依此展開完整流程、頁面、資料模型、BFF API、元件、mock data、state machine 與 Lovable build prompt。

Pantheon 前端要建成兩個面向不同使用者的系統：

```text
Pantheon Management Console
= 管理者、研究主管、風控、資金配置者、系統操作員使用。
= 管理 + 監控 + 反應 + 審批 + 部署 + 回滾 + 審計。

Pantheon Agora Workbench
= 分析師、交易者、AI 訓練師日常使用。
= 市場分析 + signal review + 研究筆記 + AI persona 協作 + 決策日誌 + 洞察收集。
```

兩者使用同一個 Pantheon Platform Shell、同一套登入、同一個 BFF、同一套資料模型與事件流，但導航、頁面密度、操作風險與使用者體驗必須分開設計。

---

## 1. 專案目標

### 1.1 產品目標

Pantheon 前端要支援完整的 AI-driven multi-persona strategy operating system，包括：

```text
策略 / Alpha 管理
Persona 管理
資金池管理
績效排序公式管理
季度調倉管理
演化方向管理
Research / Experiment 管理
Tool / MCP / Skill 管理
審批 / Governance 管理
Paper / Live deployment 管理
Runtime / Job / Alert / Incident 追蹤與反應
交易員與 AI Persona 日常協作
AI 訓練、記憶審查、Skill 草稿與洞察收集
```

此系統不是只顯示狀態，而是要提供完整管理控制能力。任何重要物件都應該能被建立、編輯、版本化、審批、部署、暫停、回滾、退休與審計。

### 1.2 前端建置目標

Lovable 第一階段要建出可操作的前端骨架，並使用 mock BFF client 開發：

```text
1. 建立共用 Platform Shell。
2. 建立 /management 與 /agora 兩個 route group。
3. 建立 Management Console 的主導航與核心頁面骨架。
4. 建立 Agora Workbench 的主導航與核心頁面骨架。
5. 建立中英文語系切換。
6. 建立 mock data 與 mock BFF action。
7. 建立高風險操作 confirmation modal。
8. 建立 jobs / alerts / events 的 mock realtime pattern。
```

---

## 2. 產品切分

## 2.1 Pantheon Management Console

### 使用者

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

### 管理範圍

Management Console 是正式控制台，包含 Core + Operations，不應拆成兩個產品。因為管理策略、人格、資金池、績效公式、季度調倉、演化方向、工具、MCP、Skill、審批、部署，以及追蹤 runtime、paper/live、job、experiment、tool call、alert、incident、rollback，實際上是同一批管理與操作角色在使用。

Management Console 應支援：

```text
Strategy & Alpha lifecycle 管理
Persona lifecycle 與 route policy 管理
Capital pool 與 risk budget 管理
Performance ranking formula 管理
Quarterly rebalance 管理
Evolution steering 管理
Research / experiment 管理
Governance / approval 管理
Deployment / runtime / risk 管理
Tools / MCP / Skills 管理
Knowledge / artifact / lineage 管理
Jobs / events / audit 管理
```

### UI 性質

Management Console 應是：

```text
高資訊密度
Object-first
State-first
Action-aware
Risk-aware
Permission-aware
Audit-aware
Realtime-aware
```

它不是聊天介面，也不是單純 dashboard。每個管理物件都應該同時呈現：

```text
目前狀態
績效狀態
風險狀態
執行現況
關聯 persona
關聯 capital pool
關聯 strategy / artifact / runtime
running jobs
open alerts
open incidents
available actions
approval status
audit trail
```

### 禁忌

Management Console 不應：

```text
以 AI chat 作為主入口。
把高風險操作藏在小按鈕裡。
只顯示狀態，不提供反應操作。
把管理和監控切成兩套割裂流程。
把所有頁面做成相同資料表。
讓前端自己推理審批與操作規則。
```

---

## 2.2 Pantheon Agora Workbench

### 使用者

```text
Analyst
Trader
AI Trainer
Research Assistant
Portfolio Observer
```

### 工作範圍

Agora Workbench 是分析師、交易者與 AI 訓練師的日常工作台。它不是正式管理控制台，也不直接做 live deployment、capital rebalance、ranking formula activation、MCP production permission 或 skill approval。

Agora Workbench 應支援：

```text
每日交易與研究摘要
市場與 watchlist 分析
Strategy signal review
研究筆記
詢問 AI personas
Multi-persona committee / red-team
交易決策日誌
Alert triage
Insight inbox
AI Trainer Studio
Memory Review
Skill Coaching
Persona Lab
Evaluation Suites
Channel 管理
```

### 核心價值

Agora 對使用者的價值是：

```text
幫分析師更快理解市場。
幫交易者理解策略 signal。
讓使用者可以問不同 AI persona。
讓研究筆記能轉成 strategy idea / research task。
讓交易決策能被記錄與追蹤。
讓 alert triage 更快完成。
讓 AI 訓練資料在日常使用中自然產生。
```

### 自然資料收集

Agora 不應要求使用者填很多管理表單，而是從日常互動中產生 structured data：

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

### 禁忌

Agora 不應：

```text
看起來像後台管理系統。
讓交易者一進來就看到 AI 訓練設定。
直接提供 Promote to Live / Apply Rebalance / Rollback 這類高風險操作。
要求使用者為了訓練 AI 而額外填大量表單。
讓所有互動都變成無結構聊天紀錄。
```

---

## 3. 平台架構

建議 Lovable 建置為同一個 Pantheon Platform Shell 下的兩個 route group：

```text
Pantheon Platform
├── /management
│   └── Pantheon Management Console
│
└── /agora
    └── Pantheon Agora Workbench
```

共用能力：

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

## 4. 共用 Platform Shell

## 4.1 Global Top Bar

所有頁面固定顯示。

應包含：

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

顯示目前操作環境：

```text
Research
Paper
Live
```

建議視覺：

```text
Research: neutral / blue
Paper: amber
Live: green with high-risk accent
```

當 environment 為 Live 時，高風險操作的 confirmation modal 要更明顯。

---

## 4.2 Product Switcher

位置：Top Bar 左側。

選項：

```text
Management Console
Agora Workbench
```

切換後保留登入、使用者角色與 locale。

---

## 4.3 Global Search

搜尋範圍：

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

Search result 顯示：

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

通知類型：

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

每個通知必須可以點進對應物件。

---

## 4.5 Right Drawer / Inspector

共用右側抽屜，避免使用者一直跳頁。

Inspector 類型：

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

每個 Inspector 應顯示：

```text
核心資訊
目前狀態
風險狀態
關聯物件
可執行操作
最近事件
audit snippets
```

---

## 5. Management Console 總導航

Management Console 的 sidebar 建議分組如下。

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

## 6. Agora Workbench 總導航

Agora 的 sidebar 建議分組如下。

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

Agora 的主要入口是 `Daily Trading Cockpit`。不要讓使用者一進來就看到 trainer admin 或 memory admin。

---

## 7. Management Console 模組概述

## 7.1 Command Center

用途：統一管理與執行總覽。

必須顯示：

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

用途：管理 alpha 策略完整 lifecycle，並追蹤 paper/live 執行現況。

核心能力：

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

用途：管理 AI persona、權限、資金綁定、工具授權、績效排名、活動狀態。

核心能力：

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

用途：管理資金池、績效排序公式、季度調倉。

核心能力：

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

用途：管理 alpha 演化方向與演化 run。

核心能力：

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

用途：管理回測、OOS、stress test、parameter sweep、RL training 等實驗。

核心能力：

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

用途：管理所有高風險操作審批。

審批類型：

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

用途：追蹤 paper/live、runtime、risk、alert、incident 並執行反應。

核心能力：

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

用途：管理 persona 可使用的工具、MCP server/tool、skill。

核心能力：

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

用途：管理 insight、research notes、artifacts、postmortems、lineage。

核心能力：

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

用途：追蹤所有長任務、事件、審計紀錄。

核心能力：

```text
Job queue
Job logs
Realtime event stream
Audit explorer
Entity audit timeline
Approval history
```

---

## 8. Agora Workbench 模組概述

## 8.1 Daily Trading Cockpit

用途：分析師 / 交易者每天進來看的首頁。

顯示：

```text
Market summary
Watchlist changes
Important signals
Paper/live strategy highlights
Open alerts requiring human judgement
Persona daily brief
Research questions
```

產出：

```text
Trader note
Insight
Research task
Signal feedback
```

---

## 8.2 Market & Watchlist

用途：協助分析市場與追蹤標的。

功能：

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

用途：讓交易者 review 策略 signal 是否合理。

功能：

```text
Signal explanation
Similar historical cases
Persona opinions
Agree / Disagree / Flag
Create research task
Attach trader rationale
```

產出：

```text
signal_feedback
risk_feedback
strategy_improvement_signal
training_example
```

---

## 8.4 Research Notebook

用途：分析師寫研究筆記，並把想法轉成可操作物件。

功能：

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

用途：讓使用者帶上下文詢問 AI persona。

功能：

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

用途：多 persona structured debate。

功能：

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

用途：記錄交易者決策與 rationale。

功能：

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

用途：讓交易者輔助判斷 alert 是否重要。

功能：

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

用途：集中處理從 Agora 自然產生的 insight。

功能：

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

用途：AI 訓練師管理 persona 行為與 feedback。

功能：

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

用途：審查 AI memory。

功能：

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

用途：從日常需求產生 skill draft，但不直接上線。

流程：

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

範例：

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

範例：

```text
Trader disagrees with a strategy signal
→ Agora creates signal_feedback event
→ BFF saves insight candidate
→ Management Command Center shows Incoming Signal Disagreement
→ Manager converts it into research task or strategy review question
```

---

## 10. BFF Integration Principle

前端只透過 BFF，不直接呼叫 Pantheon backend。

## 10.1 BFF Responsibility

BFF 負責：

```text
聚合 Pantheon backend 資料
轉換為前端友善 DTO
處理角色權限
提供 availableActions
提供 riskLevel
提供 linkedEntities
提供 realtime events
建立 jobs
處理 command actions
```

## 10.2 Frontend Responsibility

Frontend 負責：

```text
render UI
呼叫 BFF query API
呼叫 BFF command API
訂閱 realtime events
顯示 jobs / alerts / incidents
依 permissions 顯示 action
顯示 confirmation modal
```

## 10.3 Entity DTO 必須包含 availableActions

所有 entity detail API 建議回傳：

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

前端不應自己推理所有操作規則，而應依 BFF 回傳的 `availableActions` 顯示。

---

## 11. Shared Entity Types

兩套前端共用以下 entity。

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

每個 entity 應有：

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

Management Console 裡的高風險操作必須有 confirmation modal。

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
```

Confirmation modal 必須顯示：

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

Agora 不能直接執行高風險操作，只能產生 request / proposal。

---

## 13. Localization & Language Switching Requirements

Pantheon 前端必須支援中英文語系切換。這是硬性需求，不是之後再補。

## 13.1 Supported Locales

```text
zh-TW — 繁體中文，預設語系
en-US — English
```

預設：

```text
defaultLocale = "zh-TW"
```

---

## 13.2 Language Switcher UI

Management Console 和 Agora Workbench 共用語系切換。

位置：

```text
Global Top Bar → User Menu 或 Language Switcher
```

顯示方式：

```text
繁體中文
English
```

或簡潔版：

```text
ZH
EN
```

建議：

```text
[🌐 繁體中文 ▼]
```

切換後立即更新：

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

語系選擇要保存。

優先順序：

```text
1. User profile locale from BFF
2. Local storage
3. Browser language
4. default zh-TW
```

建議 local storage key：

```text
pantheon.locale
```

BFF user profile 可回傳：

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

第一版建議不要強制使用 locale route prefix，以免增加 Lovable 初期實作複雜度。

採用：

```text
/management/command-center
/agora/daily
```

語系由 app state 控制。

之後如果需要可分享的多語 URL，可擴充：

```text
/zh-TW/management/command-center
/en-US/management/command-center
```

---

## 13.5 Translation Dictionary

前端應使用 translation keys，不要在元件中硬寫死文字。

範例：

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

BFF 應回傳穩定 enum code 或 translation key，不回傳固定中文或英文。

例如 BFF 回傳：

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

前端依目前 locale 顯示：

```text
zh-TW: 送出審查
en-US: Submit Review
```

---

## 13.7 User Generated Content Rules

以下內容應保留原文，不強制翻譯：

```text
研究筆記
交易員筆記
decision journal
AI session transcript
committee memo
strategy thesis
postmortem
```

但可提供輔助操作：

```text
Translate View
Summarize in Current Language
```

---

## 13.8 AI Persona Response Language

Agora Workbench 裡 AI persona 的回答應預設跟隨目前 UI 語系。

規則：

```text
locale = zh-TW → AI persona 預設用繁體中文回答。
locale = en-US → AI persona 預設用英文回答。
```

Session 可覆蓋：

```text
Follow UI Language
zh-TW
en-US
Mixed / Original
```

---

## 13.9 i18n QA Checklist

Lovable 交付時需檢查：

```text
Management Console 可以切換 zh-TW / en-US
Agora Workbench 可以切換 zh-TW / en-US
Sidebar 全部有翻譯
Top bar 全部有翻譯
Button 全部有翻譯
Status badge 全部有翻譯
Risk label 全部有翻譯
Table header 全部有翻譯
Empty state 全部有翻譯
Error message 全部有翻譯
Confirmation modal 全部有翻譯
Language setting reload 後仍保留
Agora AI session 預設跟隨目前語系
BFF 回傳 enum code 或 labelKey，前端顯示 localized label
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

視覺感：

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

視覺感：

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

Lovable 應假設：

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

建議第一輪建置順序：

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

Lovable 的第一階段產出至少要滿足：

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

以下決策先鎖定，後續文件依此展開：

```text
1. Core + Operations 合併為 Pantheon Management Console。
2. Agora Workbench 獨立，服務分析師、交易者、AI 訓練師。
3. 兩套系統共用 platform shell、BFF、資料模型、event bus。
4. Management Console 是 object-first / state-first / action-first。
5. Agora 是 daily workflow-first / AI collaboration-first。
6. Agora 只能產生 proposal / insight / feedback，不直接做 live / capital 高風險操作。
7. 所有高風險操作在 Management Console 內走 confirmation + approval + audit。
8. Lovable 先用 mock BFF client 建置。
9. 前端必須支援 zh-TW / en-US 語系切換。
10. BFF 回傳 enum code / labelKey，前端負責 localization。
```

---

## 19. 下一份文件

下一份是：

```text
Part 2 — Pantheon Management Console 完整管理流程盤點
```

Part 2 會先不寫頁面，專門把 Management Console 需要支援的完整流程逐條盤點清楚：

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

這份會確保後面做 UI 時不會缺管理功能。
