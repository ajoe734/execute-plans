# Pantheon Frontend Build Spec — 完整計畫書
## Management Console + Agora Workbench

版本：v1.0
語系：zh-TW
日期：2026-05-03

本文件合併 Part 1–8，作為交付 Lovable 建置 Pantheon Management Console 與 Pantheon Agora Workbench 的完整前端規劃。

## 文件索引
- Part 1 — Master Blueprint / 總體產品與系統框架
- Part 2 — Management Console 完整管理流程盤點
- Part 3 — Management Console 頁面與功能設計
- Part 4 — Agora Workbench 使用者流程盤點
- Part 5 — Agora Workbench 頁面與功能設計
- Part 6 — Shared Data Model + BFF API Contract
- Part 7 — Component System + State Machines
- Part 8 — Lovable Build Prompts + Mock Data + QA Checklist

---


---

# Part 1 — Master Blueprint / 總體產品與系統框架
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


---

# Part 2 — Management Console 完整管理流程盤點
**文件語系：繁體中文（zh-TW）**  
**目標讀者：Lovable、前端工程師、BFF 工程師、產品設計者、Pantheon 系統設計者**

---

## 0. 本文件目的

Part 1 已定義 Pantheon 前端平台分成兩套系統：

```text
Pantheon Management Console
Pantheon Agora Workbench
```

本文件只處理 **Pantheon Management Console**。  
重點不是頁面設計，而是先盤點管理端必須支援的完整流程。

這份文件要確保 Lovable 後續實作 UI 時，不會只做出「展示狀態的 dashboard」，而是做出真正能管理、監控、反應、審批、部署、回滾與審計的管理控制台。

---

## 1. Management Console 的核心定義

Pantheon Management Console 是同一批管理 / 風控 / 研究主管 / 系統操作角色使用的正式控制台。

它必須同時覆蓋：

```text
管理策略
管理人格
管理資金池
管理績效排序公式
管理季度調倉
管理 Alpha 演化方向
管理 research / experiment
管理 tool / MCP / skill
管理審批
管理 paper / live deployment
追蹤 runtime / job / experiment / tool call 現況
處理 alert / incident
執行 rollback / pause / retire
審計所有高風險操作
```

因此本系統不是：

```text
不是單純狀態展示頁
不是單純策略列表
不是單純 AI dashboard
不是單純 trading monitor
不是純設定後台
```

而是：

```text
Pantheon 的管理與執行控制平面
Management + Operations + Governance + Audit in one console
```

---

## 2. 管理流程盤點方法

每條流程都要被定義成以下結構：

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

Lovable 後續做頁面時，必須從這些流程推導 UI，而不是反過來先畫頁面。

---

## 3. 管理端使用者角色

### 3.1 Admin

負責整體系統設定、角色、權限、工具、MCP、Skill、BFF / integration 設定。

### 3.2 Research Lead

負責策略研究、Alpha lifecycle、experiment、strategy review、persona 指派。

### 3.3 Risk Officer

負責風控、risk budget、paper/live promotion、incident、rollback、資金池風險限制。

### 3.4 Capital Manager

負責 capital pool、績效排名、季度調倉、allocation override、資金池 mandate。

### 3.5 Strategy Manager

負責單一或多個 Alpha / Strategy 的狀態、artifact、deployment、退役、替換。

### 3.6 System Operator

負責 runtime、job、deployment、MCP server health、incident response、rollback 操作。

### 3.7 Reviewer / Committee Member

負責審查 strategy、promotion、rebalance、formula、persona policy、skill/MCP approval。

### 3.8 Capability Admin

負責 Tool、MCP、Skill、workflow template、hook / cron 的註冊、測試、授權與停用。

---

## 4. 全域管理規則

所有 Management Console 的管理物件都必須遵守以下規則。

### 4.1 每個物件都要有狀態

例如：

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

前端不能只依據資料存在與否判斷操作，而要依據狀態與 BFF 回傳的 `availableActions`。

---

### 4.2 BFF 必須回傳 availableActions

每個 detail API 都應該回傳目前使用者可執行的 actions。

範例：

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

Lovable 前端不要自行硬編完整業務規則，而是依據 BFF 回傳內容 render action。

---

### 4.3 所有高風險操作必須 confirmation

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
Freeze Capital Pool
Unfreeze Capital Pool
```

Confirmation modal 必須顯示：

```text
操作名稱
目標物件
目前狀態
目標狀態
影響的策略
影響的人格
影響的資金池
影響的 runtime
風險等級
是否需要審批
rollback option
audit memo input
confirm action
```

---

### 4.4 所有長任務必須 job 化

超過 2 秒的操作不得讓 UI blocking。

必須建立 job：

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

前端必須提供：

```text
Job Drawer
Job Progress
Job Logs
Cancel / Retry
Output artifacts
Realtime update
```

---

### 4.5 所有重要操作必須 audit

Audit event 至少要包含：

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

### 4.6 Alert / Incident 必須能反應

Alert 不是純通知。每個 alert 必須能：

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

### 4.7 Agora incoming items 必須進入 Management Console

Agora Workbench 產生的內容不能消失在聊天紀錄裡。它們要進 Management Console 的 incoming queue。

Agora 可能產生：

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

Management Console 必須能處理：

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

# 5. 流程 A：Command Center 管理閉環

## 5.1 目的

Command Center 是 Management Console 的總入口，負責讓管理者掌握：

```text
什麼事情正在發生
什麼事情需要處理
什麼風險需要反應
哪些審批卡住
哪些 job / experiment / runtime 出問題
Agora 有哪些 incoming items 需要正式處理
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

Command Center 必須顯示：

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

# 6. 流程 B：Strategy / Alpha Lifecycle 管理

## 6.1 目的

管理 Alpha 交易策略從想法到退役的完整生命週期。

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

策略想法已建立，但尚未有完整 spec。

管理操作：

```text
Edit thesis
Assign owner persona
Set priority
Attach insight / note / paper
Reject idea
Scaffold strategy
```

### scaffolded

已有初步 spec、資料與 template。

管理操作：

```text
Edit spec
Select data source
Set parameters
Select experiment engine
Run backtest
Run OOS
```

### replicated

已有可重現實驗結果。

管理操作：

```text
Attach evidence
Compare experiments
Invalidate weak result
Submit review
Request more experiments
```

### approved

通過審查，可進 paper。

管理操作：

```text
Assign approved artifact
Bind capital pool for paper
Create paper promotion request
```

### paper

已進 paper runtime / 模擬資金環境。

管理操作：

```text
Monitor paper performance
Pause paper
Request live promotion
Extend paper period
Retire paper strategy
```

### live

已進實盤執行。

管理操作：

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

live 或 paper 表現惡化，需調查。

管理操作：

```text
Open incident
Ask persona analysis
Reduce allocation
Rollback
Create postmortem
Add evolution constraint
```

### retired

策略退役，不再部署，但保留歷史。

管理操作：

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

每次 state transition 必須 audit。

必要欄位：

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

# 7. 流程 C：Strategy Spec / Artifact 管理

## 7.1 目的

確保策略規格、參數、artifact、rollback target 都可版本化與審計。

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

BFF 必須提供：

```text
current active spec
spec version history
artifact version list
artifact approval state
rollback eligibility
availableActions
```

---

# 8. 流程 D：Research / Experiment 管理

## 8.1 目的

管理 backtest、OOS、stress test、parameter sweep、RL training 等研究與實驗。

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

所有 experiment run 必須建立 job。

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

# 9. 流程 E：Governance / Approval 管理

## 9.1 目的

管理所有會影響策略、人格、資金、工具、部署的高風險變更。

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

# 10. 流程 F：Deployment / Runtime / Risk / Incident / Rollback 管理

## 10.1 目的

把 paper/live deployment、runtime、risk alert、incident、rollback 放在同一條反應流程中。

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

以下必須 confirmation + audit，通常也需要 approval：

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

# 11. 流程 G：Persona Lifecycle 管理

## 11.1 目的

管理 AI Persona 的建立、啟用、限制、停用、退役、版本與評估。

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

# 12. 流程 H：Persona Route Policy / 權限管理

## 12.1 目的

管理每個 persona 可以使用哪些工具、MCP、Skill、workflow template，以及可以操作哪些 lifecycle state。

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

# 13. 流程 I：Persona Memory / Training / Evaluation 治理

## 13.1 目的

雖然 AI 訓練日常主要在 Agora Workbench，但 Management Console 必須能治理 persona memory、training update、evaluation、版本發佈。

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

# 14. 流程 J：Capital Pool / Risk Budget 管理

## 14.1 目的

管理資金池 mandate、risk budget、人格 / 策略綁定、allocation cap、freeze / unfreeze。

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

# 15. 流程 K：Performance Ranking / Formula 管理

## 15.1 目的

管理投資績效排序、排序公式、分數拆解、公式 backtest、ranking publication。

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

# 16. 流程 L：Quarterly Rebalance / 資金重分配管理

## 16.1 目的

每季依據投資績效與 ranking formula，重新排序並調整資金池分配。

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

# 17. 流程 M：Evolution Steering / 演化方向管理

## 17.1 目的

管理 Alpha 演化方向、fitness formula、mutation rules、constraints、evolution run 與 candidate promotion。

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

# 18. 流程 N：Tool / MCP / Skill / Capability 管理

## 18.1 目的

管理所有 persona 可用的工具、MCP server/tool、skills、workflow templates、hooks / cron。

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

# 19. 流程 O：Knowledge / Artifact / Lineage 管理

## 19.1 目的

管理 insight、research notes、artifacts、committee memo、postmortem 與完整 lineage。

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

Lineage graph 必須能顯示：

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

# 20. 流程 P：Jobs / Events / Audit 管理

## 20.1 目的

集中追蹤所有長任務、事件流與審計紀錄。

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

# 21. 流程與 UI 模組映射

| 管理流程 | 主要 UI 模組 |
|---|---|
| Command Center 管理閉環 | Command Center |
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

Lovable 後續 UI 規格與實作必須能支援：

```text
1. 每個核心物件都有 status。
2. 每個核心物件 detail 都能 render availableActions。
3. 高風險 action 會顯示 confirmation modal。
4. 長任務會建立 job 並可追蹤 progress/logs。
5. alert 可 acknowledge / assign / escalate / incident。
6. incident 可連到 strategy / runtime / capital pool / postmortem。
7. strategy lifecycle 完整支援 discovered → retired。
8. persona lifecycle 完整支援 draft → active → restricted / retired。
9. route policy 可管理 tool / MCP / skill / workflow template。
10. capital pool 可管理 mandate / risk budget / binding / freeze。
11. ranking formula 可建立、測試、比較、啟用、回滾。
12. quarterly rebalance 可 freeze metrics、calculate ranking、simulate allocation、approval、apply、rollback。
13. evolution program 可管理 direction、fitness formula、mutation rules、runs、candidate promotion。
14. MCP / Skill 管理必須有 sandbox / permission / approval / audit。
15. 所有重要操作都有 audit trail。
16. Agora incoming items 可被 Management Console 正式處理。
```

---

# 23. 下一份文件

下一份：

```text
Part 3 — Pantheon Management Console 頁面與功能設計
```

Part 3 會根據本文件的流程，開始定義每個 Management Console 頁面：

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

# Part 3 — Management Console 頁面與功能設計
**Locale:** zh-TW  
**Document Type:** Lovable Frontend Build Specification  
**Scope:** Pantheon Management Console only  
**Related Docs:**  
- Part 1 — Master Blueprint  
- Part 2 — Management Console Process Inventory  

---

# 0. 本文件目的

本文件把 Part 2 盤點出的 Pantheon Management Console 管理流程，轉換成 Lovable 可以開始建置的前端頁面規格。

Pantheon Management Console 不是單純的 dashboard。它是 Pantheon 的正式管理控制台，負責：

```text
策略管理
人格管理
資金池管理
績效排序公式管理
季度調倉
演化方向管理
Research / Experiment 管理
Tool / MCP / Skill 管理
審批
部署
runtime 監控
風險與 incident 反應
rollback / pause / retire
audit
```

這些功能屬於同一批管理使用者，不應拆成不同產品。  
因此本文件設計的是：

```text
Pantheon Management Console
= Management + Operations + Governance + Observability
```

---

# 1. Lovable 建置總原則

## 1.1 單一管理控制台

Lovable 不要把 Core / Operations 拆成兩個 app。  
請以 `/management` route group 實作一套完整 Management Console。

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

## 1.2 每個頁面都要同時呈現管理與現況

例如 Strategy Detail 不只是 strategy spec 頁，也要顯示：

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

## 1.3 物件優先，而不是聊天優先

Management Console 不是 chat UI。  
主要 UI 應以 entity、table、tabs、drawer、timeline、state badge、approval panel 為主。

## 1.4 所有高風險操作必須有確認與審批狀態

高風險操作包括：

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

這些操作都必須顯示：

```text
risk impact
affected object
required approval
audit memo
confirmation modal
```

## 1.5 使用 Mock BFF 先建置

Lovable 初期不需要真實 Pantheon backend。  
請建立 mock BFF client，所有資料與操作先使用 mock data。

---

# 2. Management Console 共用 Layout

## 2.1 App Shell

所有 Management 頁面使用同一個 shell：

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

## 2.2 Sidebar 分組

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

## 2.3 Top Bar 必備資訊

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

# 3. 全域共用元件

Lovable 應建立以下 reusable components。

## 3.1 EntityHeader

用途：所有 detail page 的頂部資訊。

Props 建議：

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

顯示：

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

支援類型：

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

所有表格必須支援：

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

支援：

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

Drawer 內容：

```text
summary
status
linked entities
available actions
recent events
audit snippets
```

## 3.6 ActionButton / PermissionAwareButton

按鈕必須根據 BFF 的 `availableActions` 渲染。

狀態：

```text
enabled
disabled with reason
requires approval
high risk
hidden if role cannot see
```

## 3.7 ConfirmationModal

高風險操作必須使用。

欄位：

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

用於所有長任務：

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

顯示：

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

用於 strategy、artifact、experiment、deployment 的 lineage。

節點：

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

# 4. Page Spec 格式

後續每一頁都使用以下規格：

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

作為 Management Console 首頁，統一呈現：

```text
策略生命週期瓶頸
待審批項目
執行現況
風險與 incident
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

如果沒有 pending action：

```text
目前沒有待處理管理事項。
```

如果沒有 alert：

```text
目前沒有開啟中的風險警示。
```

## Error State

```text
無法載入管理總覽。請檢查 BFF 連線狀態。
```

## Acceptance Criteria

```text
使用者可以在首頁看到所有待處理管理事項。
使用者可以直接打開 approval、incident、job、strategy、persona。
Agora incoming items 必須顯示在 Management Console，而不是只留在 Agora。
所有數字卡可點擊進入對應列表。
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

管理所有 alpha / strategy，並追蹤其 lifecycle、績效、資金、paper/live、alert、incident 狀態。

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
策略列表必須能按 lifecycle state、persona、capital pool、risk level 篩選。
每列 strategy 必須顯示 available actions。
高風險 action 必須打開 confirmation modal。
Lifecycle board 必須支援按 state 分欄。
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

管理單一 strategy 的完整 lifecycle、spec、experiments、paper/live 狀態、風險、incident、artifact、governance 與 audit。

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

顯示：

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

功能：

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

顯示：

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

顯示：

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

顯示：

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

顯示與 strategy 相關 incident。

Actions:

```text
Open incident
Create postmortem
Link to evolution constraint
Link to training feedback
```

## Tab — Artifacts

顯示：

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

顯示：

```text
Linked evolution program
Candidate children
Mutation history
Fitness score changes
```

## Tab — Governance

顯示：

```text
Review requests
Approval history
Validator results
Committee memos
Promotion requests
```

## Tab — Lineage

使用 LineageGraph。

## Tab — Audit

使用 AuditTimeline。

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
Strategy Detail 必須能從同一頁管理 spec、experiments、paper/live、risk、incident、artifacts、governance。
高風險操作不可直接執行，必須 confirmation。
Running jobs 必須即時更新。
Alerts 與 incidents 必須可直接從 strategy 頁處理。
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

管理 AI personas 的 lifecycle、role、policy、tool/MCP/skill permission、capital binding、strategy ownership、activity、training/evaluation 狀態。

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
Persona list 必須能看到管理狀態與執行活動。
Policy violations 必須明顯顯示。
Persona 可從列表直接進入 detail。
```

---

# 9. Page — Persona Detail

## Route

```text
/management/personas/:personaId
```

## Goal

管理單一 persona 的身份、權限、工具、資金、績效、活動、記憶、訓練、評估與 audit。

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

顯示 permission matrix：

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

顯示三個矩陣：

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

顯示：

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

顯示：

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
Persona Detail 必須同時管理身份、權限、資金、策略、活動、記憶與訓練。
Route policy 與 Tools/MCP/Skills permission 必須清楚可見。
Policy change 必須能進 approval flow。
```

---

# 10. Page — Capital Pool List

## Route

```text
/management/capital
```

## Goal

管理資金池、risk budget、persona/strategy binding、current exposure 與調倉狀態。

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
Capital Pool Detail 必須同時顯示設定與現況。
Current Exposure 必須包含 persona exposure、strategy exposure、risk usage。
Rebalance history 必須可追蹤。
```

---

# 12. Page — Performance Ranking

## Route

```text
/management/ranking
```

## Goal

管理 persona / strategy / alpha family / capital pool 的績效排名。

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

管理績效排序公式與資金配置公式。

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
Formula Studio 必須支援權重、penalty、normalization、caps/floors。
必須能比較公式版本。
Activate formula 必須走 high-risk confirmation 或 approval。
```

---

# 14. Page — Quarterly Rebalance

## Route

```text
/management/rebalance
/management/rebalance/:rebalanceId
```

## Goal

管理每季依據投資績效重新排序與資金池調整。

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
Quarterly Rebalance 頁必須是流程式 UI。
必須顯示 ranking result、allocation simulation、constraint warnings、manual overrides。
Apply rebalance 必須是 high-risk action。
```

---

# 15. Page — Evolution Steering

## Route

```text
/management/evolution
/management/evolution/:programId
```

## Goal

管理 alpha 演化方向、fitness formula、mutation rules、runs、candidate promotion。

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
Evolution Program 必須能管理方向，不只是顯示結果。
Candidate 必須能轉成 scaffolded strategy proposal。
Fitness formula changes 必須可審批。
```

---

# 16. Page — Research & Experiments

## Route

```text
/management/experiments
/management/experiments/:experimentId
```

## Goal

管理 experiments 與追蹤長任務。

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

集中管理所有高風險操作審批。

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
Approval detail 必須顯示 before / after、risk、evidence、validator result。
所有 decision 必須要求 memo。
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

顯示：

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

顯示：

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
Incident 必須能連回 strategy、runtime、capital pool、training feedback、evolution constraint。
Incident close 前若 severity high，必須要求 postmortem。
```

---

# 20. Page — Tools Management

## Route

```text
/management/tools
```

## Goal

管理 generic tools 與 persona tool permissions。

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

管理 MCP servers、MCP tools、schemas、secrets、permissions、calls。

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
MCP tools 必須能以 permission matrix 指派給 persona。
Sensitive MCP permission changes 必須走 approval。
```

---

# 22. Page — Skill Management

## Route

```text
/management/skills
/management/skills/:skillId
```

## Goal

管理 skill registry、draft、sandbox、approval、version、persona permission。

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
Skill 不可從 draft 直接 active。
必須經過 sandbox / scan / approval。
Skill permissions 必須能按 persona 管理。
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

支援 entity filter：

```text
strategy
artifact
experiment
deployment
incident
persona
```

顯示 graph：

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

任何 entity detail page 都可嵌入 AuditTimeline。

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

每個 empty state 都要有合適 CTA：

```text
Create Strategy
Add MCP Server
Create Skill Draft
Open Agora Insight Inbox
```

## Loading State

使用 skeleton，不要整頁空白。

## Error State

顯示：

```text
Error title
Short explanation
Retry button
BFF status
Optional diagnostics drawer
```

---

# 28. Management Console Acceptance Criteria

Lovable 完成 Part 3 對應建置後，至少需要滿足：

```text
Management Console sidebar 結構完整。
Command Center 顯示管理 + 執行現況。
Strategy list / detail 可管理 lifecycle 與執行狀態。
Persona list / detail 可管理 role、policy、tools、MCP、skills、capital、activity。
Capital / Ranking / Rebalance 頁可管理公式、排名、調倉流程。
Evolution 頁可管理方向、fitness formula、runs、candidates。
Experiments 頁可追蹤 job 與 metrics。
Governance 頁可處理 approval。
Deployment / Runtime / Risk 頁可追蹤與反應執行現況。
Tools / MCP / Skills 頁可管理權限與審批。
Artifacts / Lineage 頁可追蹤完整鏈路。
Jobs / Audit 頁可追蹤所有操作。
所有高風險操作都有 confirmation modal。
所有頁面支援 zh-TW / en-US translation keys。
所有 action 先走 mock BFF client。


---

# Part 4 — Agora Workbench 使用者流程盤點
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


---

# Part 5 — Agora Workbench 頁面與功能設計
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


---

# Part 6 — Shared Data Model + BFF API Contract
> 文件版本：v1.0  
> 適用範圍：Pantheon Management Console、Pantheon Agora Workbench  
> 目標讀者：Lovable 前端建置者、BFF 工程師、Pantheon 後端整合者、產品/系統設計審查者

---

# 1. 本文件目的

Part 6 定義兩套前端共用的資料模型與 BFF API contract。

Pantheon 前端不直接串接 Pantheon core backend，而是透過 BFF（Backend-for-Frontend）取得前端友善資料與執行 command。BFF 必須負責聚合資料、轉換 DTO、處理權限、提供 available actions、封裝 jobs、提供 realtime events。

本文件讓 Lovable 可以先用 mock BFF client 建置完整前端，之後再由真正 BFF 對接 Pantheon backend。

---

# 2. BFF 設計原則

## 2.1 前端只呼叫 BFF

前端禁止直接呼叫 Pantheon core、broker、runtime、MCP server、skill runner。

```text
Frontend
  → BFF Query / Command / Job / Event APIs
  → Pantheon backend / services / runtime / registries
```

## 2.2 BFF 回傳 frontend-ready DTO

BFF 回傳的資料應可直接渲染，不要求前端自行推導複雜 business rules。

每個核心 entity detail DTO 應包含：

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

## 2.3 availableActions 由 BFF 計算

前端不自行判斷 lifecycle transition 是否允許。

BFF 應回傳：

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

若 action 不可用，BFF 應提供 disabledReasonKey。

## 2.4 BFF 回傳 enum code，不回傳固定語言文字

前端支援 zh-TW / en-US 語系切換，因此 BFF 應回傳穩定 code。

範例：

```json
{
  "status": "replicated",
  "riskLevel": "medium",
  "labelKey": "status.strategy.replicated"
}
```

前端依目前 locale 顯示翻譯。

## 2.5 高風險操作必須走 command + confirmation

前端不直接改狀態。所有會改變策略、資金、部署、工具權限、MCP、Skill、人格政策的操作都走 command API。

```text
POST /bff/{resource}/:id/actions/{actionId}
```

高風險 command 回傳可能是：

```text
approval_required
job_started
completed
rejected
blocked
```

---

# 3. API 共通規格

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

前端每次 command 建議送 request id，方便追蹤。

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

常見錯誤 code：

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

## 3.8 日期時間格式

全部使用 ISO 8601 UTC string。

```text
2026-05-03T08:30:00.000Z
```

前端依使用者 locale 顯示本地時間。

## 3.9 Money / Decimal 格式

避免浮點誤差，金額與重要小數建議字串化。

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

# 4. 共通型別

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

# 5. Status Enum 規格

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

# 6. Management Console 資料模型

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

# 7. Agora Workbench 資料模型

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

# 8. BFF API 路由總覽

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

Action examples：

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

Action examples：

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

Rebalance actions：

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

Review actions：

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

Skill actions：

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

前端應透過 SSE 或 WebSocket 訂閱事件。

```http
GET /bff/events/stream
```

事件格式：

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

事件類型：

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

## 10.4 翻譯規則

BFF 回傳 enum code、labelKey、messageKey。
前端使用 translation dictionary 顯示。

使用者產生內容，如 notes、messages、memos，不自動翻譯，但可提供：

```text
Translate View
Summarize in Current Language
```

---

# 11. Mock BFF Client 要求

Lovable 初期應建立 mock BFF client：

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

Mock client 必須支援：

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

Lovable / BFF 初始實作應滿足：

```text
1. 前端所有資料都透過 BFF client 取得。
2. 所有核心 entity 都有 id/type/status/riskLevel/availableActions。
3. 所有 list API 支援 pagination。
4. 所有 command API 使用 CommandResponse。
5. 所有錯誤使用 BffError 格式。
6. 所有 enum 使用 code + translation key，不硬寫中文或英文。
7. 高風險操作透過 availableActions 標記 requiresConfirmation / requiresApproval。
8. Job、alert、incident、deployment、review 都能被 realtime event 更新。
9. Agora 產出的 insight / training example / signal feedback 能回到 Management Console。
10. Mock BFF client 足以支撐 Management Console 與 Agora Workbench 的初版畫面。
```

---

# 13. 下一份文件

下一份為：

```text
Part 7 — Component System + State Machines
```

Part 7 會定義：

```text
共用元件系統
Management Console 元件
Agora Workbench 元件
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
文件版本：v1.0  
語系：zh-TW  
適用對象：Lovable 前端建置、Pantheon 前端工程、BFF 設計對齊  
關聯文件：Part 1–6

---

## 0. 文件目的

Part 7 定義 Pantheon 前端的共用元件系統與狀態機。Lovable 在建置 `Pantheon Management Console` 與 `Pantheon Agora Workbench` 時，應以本文件作為 UI 元件、狀態標籤、工作流、按鈕權限、風險確認、即時事件顯示的基礎規格。

本文件不是視覺風格指南，而是可落地的 frontend component and workflow specification。

Pantheon 前端必須做到：

```text
1. 兩套前端共用同一套 platform shell 與 design primitives。
2. Management Console 使用 object-first / state-first / action-first UI。
3. Agora Workbench 使用 analyst/trader workflow-first UI。
4. 所有高風險操作都由狀態機與 availableActions 控制。
5. 所有長任務都顯示為 Job。
6. 所有狀態、按鈕、表頭、提示、modal 都支援 zh-TW / en-US。
7. 前端不自行推理業務規則；BFF 回傳 state、riskLevel、permissions、availableActions。
```

---

## 1. 元件設計原則

### 1.1 共用原則

所有元件必須遵守：

```text
- i18n-first：使用 translation key，不硬編中文或英文。
- permission-aware：依據 availableActions / permissions 顯示、禁用或隱藏操作。
- risk-aware：高風險操作必須有風險標籤與確認流程。
- state-driven：狀態顯示由 stable enum 轉成 localized label。
- event-aware：能接收 BFF realtime events 進行局部更新。
- accessible：button、modal、drawer、table、form 必須有可讀 label。
- desktop-first：Pantheon 是管理與交易研究系統，主要支援桌面工作流。
```

### 1.2 Management Console 元件風格

Management Console 應偏向：

```text
- 高資訊密度
- 清楚狀態與風險
- 表格 + tabs + detail drawer
- workflow stepper
- approval panel
- audit timeline
- alert / incident / job 可視化
```

### 1.3 Agora Workbench 元件風格

Agora Workbench 應偏向：

```text
- 日常工作台
- 筆記與上下文卡片
- signal explanation
- AI persona 協作
- conversation canvas
- decision journal
- 低摩擦 feedback / insight capture
```

---

## 2. 元件系統總覽

Lovable 應建立以下元件層級。

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

用途：所有頁面的最外層 layout。

使用頁面：Management Console、Agora Workbench 全域。

結構：

```text
PantheonAppShell
├── GlobalTopBar
├── ProductSideNav
├── MainContentArea
└── RightDrawerHost
```

Props 建議：

```ts
type PantheonAppShellProps = {
  product: 'management' | 'agora';
  locale: 'zh-TW' | 'en-US';
  user: UserSummary;
  navigationItems: NavItem[];
  children: React.ReactNode;
};
```

需求：

```text
- 支援 /management 與 /agora route group。
- 可顯示 sidebar collapsed / expanded。
- 可開啟右側 drawer。
- GlobalTopBar 必須固定。
- 支援 locale 切換。
```

---

### 3.2 `GlobalTopBar`

用途：顯示全域狀態、切換產品、搜尋、通知。

顯示項：

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

高層驗收：

```text
- 所有頁面都顯示 GlobalTopBar。
- product switcher 可以切換 Management / Agora。
- 語言切換後文字立即更新。
- BFF offline 時顯示 degraded/offline 狀態。
```

---

### 3.3 `ProductSwitcher`

選項：

```text
Management Console
Agora Workbench
```

i18n keys：

```text
i18n.product.management
i18n.product.agora
```

互動：

```text
- 從 /management/* 切換到 /agora/daily。
- 從 /agora/* 切換到 /management/command-center。
```

---

### 3.4 `LanguageSwitcher`

支援語系：

```text
zh-TW
en-US
```

需求：

```text
- 顯示於 GlobalTopBar。
- 切換後寫入 localStorage key: pantheon.locale。
- 若 BFF user profile 有 locale，優先使用 user profile。
- 所有 navigation、button、status、modal、empty state、error state 必須更新。
```

---

### 3.5 `BFFStatusIndicator`

狀態：

```text
connected
degraded
offline
```

顯示：

```text
Connected / 已連線
Degraded / 連線異常
Offline / 離線
```

操作：

```text
- 點擊打開 BFF health drawer。
- 顯示最近 API error、event stream status、last heartbeat。
```

---

## 4. Navigation Components

### 4.1 `ProductSideNav`

用途：依 product 顯示不同 sidebar。

Management Console nav groups：

```text
Command
Core Management
Research & Governance
Operations
Capabilities
System
```

Agora Workbench nav groups：

```text
Daily Work
Research
AI Collaboration
Training
Channels
```

Props：

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

需求：

```text
- 沒有權限的 nav item 可隱藏。
- 有待處理數量的 nav item 顯示 badge。
- 目前 route 高亮。
```

---

### 4.2 `BreadcrumbTrail`

用途：Entity detail 頁顯示上下文。

範例：

```text
Management / Strategies / alpha_042
Agora / Signals / signal_9821
```

---

## 5. Entity Components

### 5.1 `EntityHeader`

用途：所有 detail page 的標準 header。

適用 entity：

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

顯示：

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

Props：

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

需求：

```text
- Primary action 由 availableActions 中 priority 最高且 enabled 的 action 決定。
- 高風險 action 顯示 RiskBadge。
- disabled action 顯示 disabledReason。
```

---

### 5.2 `EntitySummaryCard`

用途：列表、overview、related entities 區塊。

顯示：

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

用途：顯示該物件關聯。

例如 Strategy 關聯：

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

用途：顯示 entity 狀態。

輸入：

```ts
type StatusBadgeProps = {
  domain: 'strategy' | 'persona' | 'experiment' | 'review' | 'deployment' | 'incident' | 'job' | 'skill' | 'mcp' | 'rebalance' | 'evolution' | 'memory' | 'agoraSession';
  status: string;
};
```

需求：

```text
- status enum 不直接顯示。
- 依 locale 使用 translation key。
- 使用一致顏色映射。
```

---

### 6.2 `RiskBadge`

風險等級：

```text
none
low
medium
high
critical
blocked
```

顯示：

```text
zh-TW: 無 / 低 / 中 / 高 / 重大 / 已阻擋
en-US: None / Low / Medium / High / Critical / Blocked
```

---

### 6.3 `LifecycleStepper`

用途：顯示 Strategy lifecycle。

狀態：

```text
discovered
scaffolded
replicated
approved
paper
live
retired
```

需求：

```text
- current step 高亮。
- passed steps 顯示 completed。
- blocked step 顯示 blocker icon。
- 點擊 step 可顯示該 state 的條件與歷史。
```

---

### 6.4 `HealthIndicator`

用途：runtime、BFF、MCP server、tool、job workers 等健康狀態。

狀態：

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

用途：所有列表頁通用 table。

需求：

```text
- sorting
- filtering
- pagination
- row selection
- bulk actions
- column visibility
- saved views optional
- empty state
- loading skeleton
- error state
```

Props：

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

用途：顯示關鍵指標。

範例：

```text
Sharpe
Max Drawdown
Risk Budget Usage
Open Incidents
Running Jobs
Capital Allocation
Ranking Score
```

Props：

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

用途：列表頁的標準 filter。

支援：

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

用途：detail page 標準 layout。

結構：

```text
EntityHeader
SummaryStrip
Tabs
RightDrawer optional
```

---

## 8. Action / Permission Components

### 8.1 `PermissionAwareButton`

用途：依 BFF `availableActions` 顯示可執行、不可執行、需審批、隱藏。

AvailableAction 格式：

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

行為：

```text
- hidden = true 時不顯示。
- enabled = false 時 disabled，hover/click 顯示 disabled reason。
- requiresConfirmation = true 時打開 ConfirmationModal。
- requiresApproval = true 時顯示 approval badge。
```

---

### 8.2 `ActionMenu`

用途：secondary actions。

需求：

```text
- 將 dangerous action 分隔顯示。
- 高風險 action 顯示 RiskBadge。
- disabled action 不應完全消失，除非 hidden=true。
```

---

### 8.3 `HighRiskConfirmationModal`

用途：所有高風險操作確認。

必備欄位：

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

需求：

```text
- zh-TW / en-US 完整翻譯。
- 確認前 audit memo 必填。
- critical operation 可要求輸入 confirm phrase。
```

---

## 9. Workflow Components

### 9.1 `WorkflowStepper`

用途：顯示季度調倉、審批、deployment、skill approval、MCP approval 等流程。

Props：

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

用途：detail page 顯示可用 transition。

顯示：

```text
Current state
Allowed next states
Blocked transitions
Required evidence
Required approval
```

---

### 9.3 `BlockerList`

用途：顯示為什麼不能進下一步。

例：

```text
- OOS experiment missing
- Risk check failed
- Committee memo missing
- Capital pool not assigned
```

---

## 10. Governance Components

### 10.1 `ApprovalPanel`

用途：Review / Promotion / Rebalance / Skill / MCP approval detail。

顯示：

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

Validator 狀態：

```text
passed
warning
failed
not_run
```

支援：

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

用途：所有審批決策與高風險操作 audit memo。

需求：

```text
- required for approve/reject/high-risk command。
- 支援 markdown。
- 顯示 linked evidence。
```

---

## 11. Operations Components

### 11.1 `JobDrawer`

用途：顯示長任務進度。

顯示：

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

Job 狀態：

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

顯示：

```text
Severity
Alert type
Linked object
Summary
Created time
Status
Suggested actions
```

Alert 狀態：

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

用途：Incident detail。

顯示：

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

顯示：

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

用途：即時事件流。

支援事件：

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

用途：Persona × Tool / MCP / Skill permission matrix。

欄位：

```text
Capability
Persona A
Persona B
Persona C
Approval Mode
Scope
Rate Limit
```

狀態：

```text
allowed
requires_approval
blocked
sandbox_only
```

---

### 12.2 `PolicyMatrix`

用途：Route Policy 管理。

維度：

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

用途：Tool / MCP / Skill input/output schema。

需求：

```text
- 顯示 JSON schema。
- 可切換 raw / friendly view。
- 可顯示 required fields。
```

---

### 12.4 `SkillSandboxPanel`

用途：Skill draft sandbox 測試。

顯示：

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

用途：績效排名公式與 fitness formula 編輯。

功能：

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

需求：

```text
- 支援 no-code builder。
- 支援 read-only formula expression preview。
- 修改後公式狀態為 draft。
```

---

### 13.2 `ScoreBreakdownPanel`

用途：解釋 ranking score / fitness score。

顯示：

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

用途：季度調倉模擬。

顯示：

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

用途：顯示 Strategy / Artifact / Experiment / Review / Deployment lineage。

節點類型：

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

需求：

```text
- 節點可點擊打開 Inspector。
- 支援 filter by persona / strategy / time / status。
```

---

### 14.2 `AuditTimeline`

用途：所有 entity detail 的 audit。

顯示：

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

用途：Ask Personas、Committee Room、Session detail。

功能：

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

每則訊息可操作：

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

這些動作會自然捕捉有用資料。

---

### 15.3 `SignalReviewPanel`

用途：Strategy Signal Review。

顯示：

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

功能：

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

欄位：

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

功能：

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

需求：

```text
- 支援 localized labels。
- 支援 validation messages。
- 支援 dirty state。
- 支援 submit / cancel。
```

### 16.2 `MarkdownEditor`

用於：

```text
Research notes
Decision memo
Postmortem
Committee memo
Strategy thesis
```

### 16.3 `JsonSchemaForm`

用於：

```text
Tool schema
MCP schema
Experiment config
Skill test payload
```

---

# 17. State Machines

以下狀態機是 Lovable 建置 UI 的基礎。前端不應自行判斷 transition 是否允許；BFF 應回傳 `availableActions`，但 UI 必須能依狀態顯示正確 stepper、badge、workflow。

---

## 17.1 Strategy Lifecycle State Machine

狀態：

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

主要 transition：

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

UI 顯示：

```text
- LifecycleStepper 顯示 discovered → scaffolded → replicated → approved → paper → live → retired。
- degraded / replaced 是 live 旁支狀態，應以 warning banner 顯示。
```

---

## 17.2 Persona Lifecycle State Machine

狀態：

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

transition：

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

UI 注意：

```text
- restricted 狀態要在 Tools/MCP/Skills tabs 顯示限制 banner。
- probation 狀態要在 Capital Binding tab 顯示 capital cap warning。
```

---

## 17.3 Capital Pool Lifecycle

狀態：

```text
draft
active
frozen
rebalancing
restricted
retired
```

transition：

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

狀態：

```text
draft
testing
approved
active
deprecated
retired
```

transition：

| From | To | Action |
|---|---|---|
| draft | testing | test_formula |
| testing | approved | submit_formula_review / approve |
| approved | active | activate_formula |
| active | deprecated | deprecate_formula |
| deprecated | retired | retire_formula |

UI 注意：

```text
- active formula 不可直接編輯，只能 clone new draft。
- FormulaBuilder 在 active 狀態為 read-only。
```

---

## 17.5 Quarterly Rebalance Workflow

狀態：

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

流程：

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

可逆 / 例外：

```text
applied → rolled_back
any pre-applied state → cancelled
metrics_frozen → metrics_freezing if unfreeze requested
```

UI 元件：

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

狀態：

```text
draft
active
paused
under_review
completed
retired
```

transition：

| From | To | Action |
|---|---|---|
| draft | under_review | submit_evolution_review |
| under_review | active | approve_program |
| active | paused | pause_program |
| paused | active | resume_program |
| active | completed | complete_program |
| completed | retired | retire_program |

Evolution Run 狀態：

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

狀態：

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

transition：

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

狀態：

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

transition：

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

UI 元件：

```text
ApprovalPanel
ValidatorResultList
DecisionMemoEditor
EvidencePackViewer
```

---

## 17.9 Deployment Workflow

狀態：

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

transition：

```text
draft → submitted → under_review → approved → scheduled → deploying → deployed
failed → rolled_back
 deployed → rolled_back
pre-deploy states → cancelled
```

UI 注意：

```text
- promote_live、rollback、emergency_kill 都必須 high-risk modal。
- deployed 狀態 detail 應顯示 runtime、artifact、capital pool、rollback target。
```

---

## 17.10 Risk Alert Workflow

狀態：

```text
new
acknowledged
assigned
investigating
mitigated
resolved
closed
```

transition：

```text
new → acknowledged
acknowledged → assigned
assigned → investigating
investigating → mitigated
mitigated → resolved
resolved → closed
```

可從任意未關閉狀態：

```text
→ create_incident
```

---

## 17.11 Incident Workflow

狀態：

```text
open
assigned
investigating
mitigation_in_progress
mitigated
postmortem_required
closed
```

transition：

```text
open → assigned → investigating → mitigation_in_progress → mitigated → postmortem_required → closed
```

UI 必備：

```text
IncidentTimeline
LinkedObjectsPanel
MitigationActions
PostmortemEditor
AuditTimeline
```

---

## 17.12 Tool Lifecycle

狀態：

```text
draft
testing
active
restricted
deprecated
blocked
retired
```

transition：

```text
draft → testing → active
active → restricted
active → deprecated → retired
active → blocked
restricted → active
```

---

## 17.13 MCP Server Lifecycle

狀態：

```text
draft
connected
healthy
degraded
disabled
retired
```

transition：

```text
draft → connected → healthy
healthy → degraded
healthy / degraded → disabled
disabled → healthy
any → retired
```

MCP Tool permission 狀態：

```text
not_granted
granted
requires_approval
sandbox_only
blocked
```

---

## 17.14 Skill Lifecycle

狀態：

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

transition：

```text
draft → sandboxed → validated → approved → active
active → deprecated → retired
active → blocked
blocked → sandboxed if reopened
```

UI 元件：

```text
SkillSandboxPanel
SchemaViewer
PermissionMatrix
ApprovalPanel
```

---

## 17.15 Memory Review Workflow

狀態：

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

transition：

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

狀態：

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

transition：

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

狀態：

```text
open
active
waiting_for_user
summary_generated
submitted_to_management
closed
archived
```

transition：

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

狀態：

```text
queued
running
waiting_for_approval
completed
failed
cancelled
retrying
```

transition：

```text
queued → running
running → completed
running → failed
running → waiting_for_approval
waiting_for_approval → running
failed → retrying → running
queued / running → cancelled
```

UI：

```text
JobDrawer
JobProgressBar
JobLogViewer
```

---

# 18. Localization Requirements for Components

所有元件必須：

```text
- 接收 labelKey，而不是固定文字。
- enum 狀態轉譯由 i18n dictionary 控制。
- 高風險 modal、empty state、error state 必須有 zh-TW / en-US。
- 使用者產生內容不強制翻譯，但可以提供 Translate / Summarize action。
```

範例 keys：

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

Lovable 應依本文件建立：

```text
1. Shared component library。
2. Management / Agora 共用 AppShell。
3. StatusBadge / RiskBadge / LifecycleStepper。
4. PermissionAwareButton / ActionMenu / HighRiskConfirmationModal。
5. PantheonDataTable / MetricCard / FilterBar。
6. JobDrawer / AlertCard / IncidentTimeline / EventStreamPanel。
7. FormulaBuilder / AllocationSimulationPanel。
8. PermissionMatrix / PolicyMatrix / SchemaViewer / SkillSandboxPanel。
9. LineageGraph / AuditTimeline。
10. ConversationCanvas / SignalReviewPanel / Notebook / DecisionJournal / CommitteeRoom。
11. State machine constants and localized labels。
```

前端可先以 mock state machines 與 mock BFF availableActions 運作。

---

# 20. Acceptance Criteria

Part 7 完成後，Lovable 的前端應滿足：

```text
1. 兩套前端共用同一套 AppShell。
2. 所有 navigation、button、status、risk label 都可切換 zh-TW / en-US。
3. Management entity detail page 可使用 EntityHeader、StatusBadge、RiskBadge、ActionMenu。
4. Strategy lifecycle 可用 LifecycleStepper 顯示。
5. High-risk actions 必須打開 confirmation modal。
6. Disabled actions 顯示 disabled reason。
7. JobDrawer 可顯示 mock job progress。
8. Alert / Incident 元件可顯示狀態與反應操作。
9. FormulaBuilder 可呈現 formula draft UI。
10. PermissionMatrix 可呈現 persona × tool/MCP/skill 權限。
11. ConversationCanvas 可支援 message annotation。
12. State machine enum 與 UI badge 對應一致。
13. 前端不硬編任何業務 transition；實際可用操作以 BFF availableActions 為準。
```

---

# 21. 下一份文件

下一份文件是：

```text
Part 8 — Lovable Build Prompts + Mock Data + QA Checklist
```

Part 8 將直接提供：

```text
- 可貼給 Lovable 的 build prompts
- Management Console mock data
- Agora Workbench mock data
- demo scenarios
- QA checklist
- acceptance test cases
```


---

# Part 8 — Lovable Build Prompts + Mock Data + QA Checklist
文件版本：v1.0  
語系：zh-TW  
適用對象：Lovable、前端工程師、BFF 工程師、產品設計師、Pantheon 系統負責人

---

## 0. 本文件目的

本文件是 Pantheon 前端規劃文件的第 8 部分，目標是讓 Lovable 可以開始實作前端。

本文件包含：

```text
1. Lovable 建置策略
2. Lovable 可直接使用的建置 Prompt
3. 前端路由與建置順序
4. Mock BFF client 規格
5. Mock data 規格
6. Demo scenarios
7. QA checklist
8. Acceptance criteria
9. 不可違反的產品邊界
```

本文件承接前 7 份規格：

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

## 1. Lovable 建置總策略

Pantheon 前端必須建成同一個 platform shell 下的兩套前端系統：

```text
Pantheon Management Console
Pantheon Agora Workbench
```

兩套系統使用者不同，因此 UI 風格與互動邏輯必須不同。

---

## 1.1 Management Console 的建置目標

Management Console 是管理者、研究主管、風控、資金配置者、系統操作員使用的控制台。

它必須支援：

```text
策略與 Alpha 管理
AI 人格管理
資金池管理
績效排序公式管理
季度調倉管理
演化方向管理
研究與實驗管理
審批與治理
部署、runtime、風險與 incident 管理
工具、MCP、Skill 管理
知識、artifact、lineage 管理
jobs、events、audit 管理
```

Management Console 不是展示頁，而是管理與反應系統。每個頁面都要顯示：

```text
目前狀態
風險狀態
可執行操作
審批要求
running jobs
open alerts
open incidents
audit timeline
```

---

## 1.2 Agora Workbench 的建置目標

Agora Workbench 是分析師、交易者、AI 訓練師每天使用的工作台。

它必須支援：

```text
每日交易工作台
市場與 watchlist
策略 signal review
研究筆記
詢問 AI personas
Multi-persona committee
決策日誌
Alert triage
Insight inbox
Trainer Studio
Memory Review
Skill Coaching
Persona Lab
Evaluations
Channels
```

Agora 的重點不是管理，而是讓分析師與交易者覺得有用，並在日常使用中自然產生有價值資料：

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

## 1.3 共用建置原則

Lovable 必須遵守：

```text
Frontend only
BFF APIs 先用 mock client
不直接串 Pantheon backend
不實作真實交易操作
不保存真實 secret
所有高風險操作用 mock command + confirmation modal
所有 UI text 使用 i18n translation keys
支援 zh-TW 與 en-US 語系切換
```

---

## 2. Lovable 建置順序

建議 Lovable 分階段建置。

```text
Phase 1 — Shared Platform Shell
Phase 2 — Management Console Core Pages
Phase 3 — Management Console Deep Management Pages
Phase 4 — Agora Workbench Daily Workflow Pages
Phase 5 — Agora AI Collaboration / Trainer Pages
Phase 6 — Realtime events, jobs, audit, final polish
```

---

## 2.1 Phase 1 — Shared Platform Shell

先建共用外框：

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

驗收：

```text
可以在 /management 與 /agora 之間切換。
可以切換 zh-TW / en-US。
Top bar 顯示 environment、BFF status、alerts、jobs、approvals。
Sidebar 依 product 顯示不同 navigation。
所有文字不能硬寫死，必須使用 translation key。
```

---

## 2.2 Phase 2 — Management Console Core Pages

先建 Management 的核心頁：

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

這些頁面要先能跑完整 demo scenario。

---

## 2.3 Phase 3 — Management Console Deep Management Pages

再建深層管理功能：

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

先建交易者與分析師每天會用的頁：

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

再建 AI 協作與訓練頁：

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

最後補強：

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

以下可直接給 Lovable 使用。

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
