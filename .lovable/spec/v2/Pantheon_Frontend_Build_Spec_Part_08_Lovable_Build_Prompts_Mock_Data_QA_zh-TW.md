# Pantheon Frontend Build Spec — Part 08
# Lovable Build Prompts + Mock Data + QA Checklist

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

