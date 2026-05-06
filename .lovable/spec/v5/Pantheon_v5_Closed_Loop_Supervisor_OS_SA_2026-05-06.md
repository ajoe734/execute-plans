# Pantheon v5 Closed-Loop Supervisor OS — SA 文件

**文件類型**：SA（System Analysis + Solution Architecture）  
**版本**：v5-SA-2026-05-06-A  
**範圍**：Pantheon / Pathreon 多人格交易系統之前端管理者操作系統重構  
**目標讀者**：產品負責人、SA/SD、前端工程、後端/BFF 工程、LLM Agent 工程、風控/營運管理者、Lovable 實作代理  
**基準 repo**：`ajoe734/execute-plans` / `main`  
**核心決策**：保留現有管理組件；新增閉環操作層、LLM Sentinel 監督層與 Human Intervention Queue；重構 IA 與首頁心智模型。

---

## 0. Executive Summary

目前前端已經具備大量管理頁面與細部操作能力，包含 Strategy、Persona、Capital、Ranking、Rebalance、Evolution、Deployment、Risk、Jobs、Alerts、Approvals、Audit、Tools、MCP、Skills、Studios 等。然而，現有資訊架構仍偏向傳統 **Entity Admin Console**：使用者按模組管理物件、查看列表、進入 detail tab、手動執行操作。

這與 Pantheon 的核心精神不完全一致。Pantheon 是一個 **多 Persona 自動研發、自動執行、自動優化，並由 LLM / 人類共同監督的交易生態系**。管理者不應只看到「有哪些物件與事件」，而應能在 30 秒內回答：

1. 系統整體是否健康？
2. Research / Execution / Optimization 三個閉環是否正在正常運作？
3. 哪個閉環被阻塞？阻塞原因是 approval、risk breach、infra issue、persona drift、policy conflict，還是 capital constraint？
4. 哪個 Persona 或 Strategy 出現異常？
5. LLM Supervisor / Sentinel 對異常的診斷是什麼？
6. 系統下一個自動動作是什麼？
7. 哪些修正方案可以自動執行？哪些必須人類批准？
8. 修正後是否有改善？是否已回饋到 memory、ranking、evolution、policy 或 strategy lifecycle？

本 SA 建議採用 **共融式重構（Coexistence Refactor）**：

- 不重寫現有功能頁。
- 不刪除已開發管理組件。
- 新增一層「Closed-loop Supervisor OS」作為管理者的第一入口。
- 把現有頁面降級為 drill-down、manual override、evidence、audit、resource management 頁。
- 重新設計 navigation IA，使 Research Loop、Execution Loop、Optimization Loop、Sentinel Findings、Human Intervention Queue 成為前端管理系統的主軸。

---

## 1. 背景與問題定義

### 1.1 Pantheon 系統本質

Pantheon 不是單純交易後台，也不是策略庫管理工具。它應被視為一個由多個 Persona、策略生命週期、資金配置、風控治理、執行基礎設施、LLM 監督者共同構成的自我修正交易生態。

系統核心精神如下：

```text
Research Loop:
Signals → Insights → Hypotheses → Experiments → Artifacts → Strategy Candidates

Execution Loop:
Persona Decision → Strategy Routing → Risk Gate → Execution → Live Monitor → Incident/Rollback → Feedback

Optimization Loop:
Live Performance → Ranking → Rebalance → Capital Allocation → Evolution → Candidate Promotion → Feedback

Supervisor Loop:
Observe → Diagnose → Recommend → Intervene / Escalate → Monitor Outcome → Learn
```

三個業務閉環與一個監督閉環互相交織，形成完整的 autonomous trading control system。

### 1.2 現有前端的主要偏差

現有前端不是沒有功能，而是功能表達方式不符合系統本質：

| 面向 | 現有狀態 | 問題 |
|---|---|---|
| IA | 以 Command / Core Management / ResearchGov / Operations / Capabilities / System 分類 | 偏工程模組；不表達閉環 |
| 首頁 | Command Center 顯示 KPI、pending、risk、jobs、events | 是 summary，不是 loop control room |
| Strategy | Detail tabs 很細 | 人類需自行拼出 lifecycle 故事 |
| Persona | 可管理 Persona，但缺 trading health 視角 | 看不到各人格交易狀況與健康度 |
| Execution | Jobs / Alerts / Incidents 分散 | 不呈現 Persona-driven execution loop |
| Optimization | Ranking / Rebalance / Evolution 分散 | 不呈現 live performance → ranking → allocation → evolution 的閉環 |
| LLM | Ask / Committee / Trainer 偏互動工具 | 缺 LLM Sentinel 監控整體生態 |
| Intervention | Approvals / Governance queue 存在 | 不知道每個 approval 阻塞哪個 loop、批准後會觸發什麼 downstream |

### 1.3 本次 SA 的結論

應採用 v5 Closed-loop Supervisor OS：

1. **保留現有管理組件**，避免重工。
2. **新增閉環操作層**，讓管理者先看 Research / Execution / Optimization loop。
3. **新增 LLM Sentinel 監督層**，讓系統能指出異常、提供 evidence、提出修正方案、執行或要求批准。
4. **新增 Human Intervention Queue**，整合 approvals、policy exception、incident mitigation、Sentinel recommendation、emergency review。
5. **重新整理 navigation IA**，使 Execution Loop 與 Optimization Loop 成為一級入口。

---

## 2. 目標與非目標

### 2.1 目標

1. 讓管理者可監看完整 Pantheon 運作生態，而不是只管理物件。
2. 將 Research / Execution / Optimization 三個閉環可視化。
3. 將 Persona Trading Health 作為 Execution Loop 核心視角。
4. 將 Ranking / Rebalance / Evolution / Capital Allocation 串成 Optimization Loop。
5. 建立 LLM Sentinel：異常監控、診斷、建議、處置、追蹤、學習。
6. 建立 Human Intervention Queue：統一呈現所有需要人類決策的阻塞點。
7. 最大化保留既有頁面與組件，將它們轉為 drill-down 與 manual override。
8. 建立 mock BFF domain model，讓 Lovable 可在無正式後端前先實作可操作原型。

### 2.2 非目標

1. 不在本階段重寫現有 Strategy / Persona / Ranking / Rebalance / Evolution / Risk / Governance detail pages。
2. 不在本階段接真實交易 API。
3. 不允許 LLM 無限制直接執行高風險 live trading 動作。
4. 不把 Sentinel 做成單純聊天 UI；它必須是 structured supervisor。
5. 不新增更多純 CRUD 頁面。

---

## 3. 系統角色與使用者任務

### 3.1 主要角色

| 角色 | 任務 | 需要的 v5 視角 |
|---|---|---|
| 管理者 / Operator | 監督整體系統、處理阻塞、批准高風險操作 | Control Room、Human Intervention Queue |
| 風控人員 | 監看交易風險、審核 emergency / rollback / allocation change | Execution Loop、Risk & Governance、Sentinel Findings |
| 研究負責人 | 監看 Alpha Factory、Experiment、Artifact、Strategy Candidate | Research Loop、Strategy Lifecycle |
| 資金管理者 | 監看 capital utilization、rebalance、allocation proposal | Optimization Loop、Capital Allocation |
| Persona Trainer | 監看 Persona performance、memory drift、skill quality | Multi-Persona System、Persona Trading Health |
| 系統營運 | 監看 runtimes、jobs、MCP/tool health、latency | Execution Loop、Infrastructure |
| LLM Sentinel | 監控生態、診斷異常、提出與執行修正方案 | Sentinel Findings、Remediation Actions |

### 3.2 管理者關鍵任務

管理者進入系統後，應能完成以下任務：

1. 在 30 秒內判斷系統健康度。
2. 在 30 秒內知道三個閉環的狀態：running / watch / blocked / emergency。
3. 找出最重要的 anomaly 與 LLM Sentinel 診斷。
4. 找出需要自己介入的事項與其 downstream effect。
5. 針對 Persona trading health 做 drill-down。
6. 針對 Optimization loop 的 ranking / rebalance / evolution 狀態做 drill-down。
7. 批准、拒絕或要求修改 Sentinel 的 remediation plan。
8. 檢查 emergency action 是否已被 audit、postmortem、memory feedback 捕捉。

---

## 4. 現有前端資產盤點與保留策略

### 4.1 現有資產分類

| 現有資產 | 狀態 | v5 保留策略 |
|---|---|---|
| Command Center | 已有 KPI、risk、pending、Agora incoming、jobs、events | 重構為 Pantheon Overview 的基礎 |
| Alpha Factory | 已有 discovered / scaffolded / replicated kanban | 成為 Research Loop 起點 |
| Strategy Detail | 已有 overview、spec、experiments、paper/live、risk、incidents、artifacts、evolution、governance、lineage、audit | 成為 Strategy Lifecycle drill-down |
| Risk Center | 已有 breach matrix、capital/strategy/persona/runtime/capability risk | 成為 Execution Loop / Sentinel evidence source |
| Governance Queue | 已有 stage、SLA、batch approve/reject | 成為 Human Intervention Queue 子來源 |
| Ranking Dashboard | 已有 scope tabs 與 recalculate/freeze/publish/override | 成為 Optimization Loop 的 Ranking stage |
| Evolution Studio | 已有 mutation、fitness、runs、candidates、promotion | 成為 Optimization Loop 的 Evolution stage |
| Rebalance Ops Studio | 已有 metric freeze、constraint check、override | 成為 Optimization Loop 的 Rebalance stage |
| Jobs / Alerts / Incidents | 已有 operation lists 與 detail sheets | 成為 Execution Loop event stream / evidence layer |
| Audit | 已有 actor/action/target/outcome/timeline | 成為 Sentinel 與 human intervention 的證據與追溯層 |
| Persona / Memory / Skills / Evaluations | 已有分散頁面 | 成為 Multi-Persona System 與 Persona Health drill-down |

### 4.2 保留原則

1. 現有頁面不刪除。
2. 現有 route 可保留，避免破壞 deep links。
3. v5 新頁面只做上層 orchestrator，不重複 detail tabs。
4. 每個 v5 card / stage / finding / intervention 都應能連回現有頁面。
5. 舊 menu group 可先保留在 Advanced / Assets / Infrastructure，等 v5 IA 穩定後再降級。

---

## 5. Target Information Architecture

### 5.1 v5 Navigation

```text
Control Room
- Pantheon Overview
- Loop Runs
- Sentinel Findings
- Human Intervention Queue

Execution Loop
- Persona Trading Health
- Live Strategy Monitor
- Deployment Monitor
- Runtime / Jobs
- Alerts / Incidents

Optimization Loop
- Optimization Runs
- Ranking
- Rebalance
- Evolution
- Capital Allocation
- Candidate Promotion
- Studios

Research Loop
- Alpha Factory
- Signals / Insights
- Experiments
- Artifacts
- Knowledge

Multi-Persona System
- Personas
- Committee
- Consult Rules
- Memory Governance
- Skills / Training
- Evaluations

Risk & Governance
- Risk Center
- Governance Queue
- Route Policies
- Permissions
- Audit

Infrastructure
- Tools
- MCP
- Channels
- Hooks / Workflows

Settings
```

### 5.2 IA 設計原則

1. **閉環優先**：管理者先看到 loop，再看到 entity。
2. **異常優先**：異常、阻塞、人類 gate 要高於一般列表。
3. **自動化優先**：每個 loop 顯示 next automatic action。
4. **人類介入可解釋**：每個 intervention 顯示 approve / reject 的 downstream effect。
5. **LLM 可審計**：每個 Sentinel recommendation 必須有 evidence、confidence、blast radius、audit trail。
6. **既有功能可抵達**：任何 v5 surface 都能 drill down 到既有頁。

---

## 6. Target Business Flows

## 6.1 Research Loop

### 6.1.1 目的

Research Loop 管理從市場信號、Persona insight、研究假設、實驗、artifact 到 strategy candidate 的生成過程。

### 6.1.2 流程

```text
Signal Intake
→ Persona Insight
→ Hypothesis Creation
→ Experiment Design
→ Experiment Run
→ Artifact Registration
→ Strategy Candidate
→ Review Gate
→ Paper Handoff
```

### 6.1.3 管理者要看到的資訊

| Stage | 管理者資訊 |
|---|---|
| Signal Intake | 今日信號量、來源、異常波動、Persona 關注度 |
| Persona Insight | 哪些 Persona 產生 insight、confidence、互相衝突情形 |
| Hypothesis | 假設是否可測、需要哪些資料、關聯 strategy family |
| Experiment | running / failed / completed、metric、reproducibility |
| Artifact | 可 promote artifacts、hash、source experiment、risk classification |
| Strategy Candidate | discovered / scaffolded / replicated / review status |
| Review Gate | 卡住的 approval、reviewer、SLA |

### 6.1.4 舊組件對應

- Alpha Factory
- Experiments
- Artifacts
- Knowledge Inbox
- Strategy Detail / Experiments tab
- Governance Queue
- Lineage Explorer

---

## 6.2 Execution Loop

### 6.2.1 目的

Execution Loop 管理 Persona-driven trading execution。它不是單純 job/deployment monitor，而是要讓管理者知道各 Persona 正在做什麼交易決策、健康度如何、風險是否正常、執行品質是否退化。

### 6.2.2 流程

```text
Persona Decision
→ Strategy Routing
→ Policy / Risk Gate
→ Deployment / Order Proposal
→ Execution
→ Live Monitoring
→ Incident / Rollback / De-risk
→ Feedback to Persona / Strategy / Risk Policy
```

### 6.2.3 Persona Trading Health

每個 Persona 應有交易健康卡：

| 欄位 | 說明 |
|---|---|
| mode | live / paper / shadow / paused |
| activeStrategies | 當前管理或參與的策略數 |
| openExposure | 直接或間接管理的 live exposure |
| pnl24h / pnl7d / pnl30d | 績效摘要 |
| drawdown | 當前回撤 |
| decisionCount | 近期決策數 |
| decisionConfidence | Persona 自評或模型信心 |
| confidenceDrift | 信心變化是否異常 |
| decisionLatencyP95 | 決策延遲 |
| slippageP95 | 執行滑價 |
| policyViolations | policy / route / consult rule 違規數 |
| riskBreaches | 風險 breach 數 |
| livePaperDivergence | live 與 paper 表現差異 |
| sentinelVerdict | LLM supervisor 判斷 |
| recommendedAction | 建議處置 |
| emergencyActions | 可用緊急處置 |

### 6.2.4 典型異常

1. Persona 信心維持高，但 live performance 急速惡化。
2. Persona 反覆建議高風險交易，但 consult rule 沒被觸發。
3. 某 Persona 的策略在特定 regime 下集體退化。
4. live/paper divergence 擴大。
5. slippage 或 order rejection 上升。
6. MCP/tool latency 影響決策或執行。
7. runtime degraded 導致 execution delay。

### 6.2.5 舊組件對應

- Personas
- Strategy Detail / Paper-Live / Risk / Incidents tabs
- Deployments
- Runtimes
- Jobs
- Alerts
- Incidents
- Risk Center
- Audit

---

## 6.3 Optimization Loop

### 6.3.1 目的

Optimization Loop 管理 live performance 如何回饋到 ranking、rebalance、capital allocation、evolution、candidate promotion。這是 Pantheon 自我優化能力的核心。

### 6.3.2 流程

```text
Live Performance Collection
→ Ranking Recalculation
→ Candidate Selection
→ Rebalance Simulation
→ Constraint Check
→ Governance Gate
→ Capital Allocation Apply
→ Evolution Run / Candidate Promotion
→ Feedback to Strategy / Persona / Formula / Policy
```

### 6.3.3 管理者要看到的資訊

| Stage | 管理者資訊 |
|---|---|
| Performance | live/paper performance、drawdown、slippage、PnL attribution |
| Ranking | formula version、last recalculation、rank changes、confidence |
| Candidate Selection | 哪些策略被升/降權、原因、LLM verdict |
| Rebalance Simulation | target pool、proposed weights、expected Sharpe / DD |
| Constraint Check | capital limit、risk budget、concentration、liquidity constraints |
| Governance Gate | approval status、SLA、blocking role |
| Apply | scheduled / applied / failed / rollback available |
| Evolution | active runs、best candidates、fitness lift、promotion readiness |
| Feedback | ranking formula update、persona memory update、strategy status update |

### 6.3.4 舊組件對應

- Ranking Dashboard
- Rebalance Detail
- Rebalance Ops Studio
- Capital Studio
- Evolution Detail
- Evolution Studio
- Fitness Formula Studio
- Governance Queue
- Strategy Detail / Evolution tab

---

## 6.4 Supervisor Loop

### 6.4.1 目的

Supervisor Loop 由 LLM Sentinel 擔任，負責監看整個生態是否異常，提出 diagnosis、evidence、recommendation，並根據權限自動執行低風險處置或建立人類 intervention。

### 6.4.2 流程

```text
Observe
→ Detect Anomaly
→ Diagnose Root Cause
→ Generate Remediation Options
→ Classify Automation Level
→ Execute / Request Approval
→ Monitor Outcome
→ Write Feedback
```

### 6.4.3 Supervisor 必須回答的問題

1. 異常是什麼？
2. 影響哪個 loop？
3. 影響哪些 Persona / Strategy / Capital Pool / Deployment？
4. evidence 是什麼？
5. confidence 多少？
6. 有哪些修正方案？
7. 哪個方案風險最低？
8. 哪些可自動執行？哪些需要 approval？
9. 如果不處置，預期後果是什麼？
10. 處置後如何驗證改善？

---

## 7. Target Control Flows

### 7.1 Normal Execution Control Flow

```text
1. Persona generates decision / route proposal.
2. Route policy evaluates allowed tools, strategies, environment.
3. Risk gate checks capital, drawdown, exposure, policy constraints.
4. If low risk, system executes or queues deployment/order.
5. Execution metrics stream back to frontend.
6. Sentinel observes health metrics.
7. If normal, loop continues.
8. If anomaly, Sentinel creates finding.
9. If high risk, finding creates intervention item or emergency action.
10. Outcome feeds back to memory / strategy status / ranking / audit.
```

### 7.2 Optimization Control Flow

```text
1. Performance window closes or anomaly triggers optimization run.
2. Ranking recalculates scope scores.
3. Rebalance simulation proposes allocation changes.
4. Constraint checker validates capital/risk/liquidity limits.
5. Sentinel reviews proposal and adds diagnosis.
6. Human gate is created if live capital or high-risk adjustment is involved.
7. Approved proposal is applied.
8. Execution monitors outcome.
9. Evolution run is created if strategy degradation or alpha decay is detected.
10. Feedback updates ranking formula, persona memory, strategy lifecycle, audit.
```

### 7.3 Emergency Control Flow

```text
1. Sentinel detects critical anomaly.
2. System checks emergency eligibility rules.
3. If eligible for emergency guarded action:
   - pause persona live routing, or
   - reduce allocation, or
   - rollback deployment, or
   - disable high-risk tool, or
   - open incident.
4. Emergency action is executed with strict audit.
5. Human emergency review item is created.
6. Postmortem is required.
7. Learning feedback is queued.
```

### 7.4 Human Intervention Control Flow

```text
1. Approval / Sentinel / Incident / Policy Exception creates InterventionItem.
2. Item is displayed in Human Intervention Queue.
3. UI shows blocked loop, evidence, LLM recommendation, approve effect, reject effect.
4. Human approves, rejects, modifies, or asks committee.
5. Decision triggers downstream action or rollback to prior stage.
6. Audit and feedback are written.
```

---

## 8. 新增 Domain Model

## 8.1 LoopRun

```ts
type LoopType = "research" | "execution" | "optimization";
type LoopStatus = "running" | "watch" | "blocked" | "paused" | "emergency" | "completed";

type LoopRun = {
  id: string;
  loopType: LoopType;
  status: LoopStatus;
  currentStage: string;
  stageIndex: number;
  totalStages: number;
  startedAt: string;
  updatedAt: string;
  trigger: "schedule" | "signal" | "risk_breach" | "human" | "sentinel";
  subjects: {
    strategies?: string[];
    personas?: string[];
    capitalPools?: string[];
    deployments?: string[];
    artifacts?: string[];
  };
  nextAutomaticAction?: string;
  blockedBy?: string[];
  humanGateRequired: boolean;
  sentinelFindingIds: string[];
  interventionItemIds: string[];
};
```

## 8.2 LoopStage

```ts
type LoopStage = {
  id: string;
  loopRunId: string;
  name: string;
  status: "pending" | "running" | "completed" | "blocked" | "failed" | "skipped";
  ownerType: "system" | "persona" | "human" | "sentinel";
  ownerId?: string;
  startedAt?: string;
  completedAt?: string;
  evidenceRefs: string[];
  nextAction?: string;
  blockedReason?: string;
};
```

## 8.3 PersonaExecutionHealth

```ts
type PersonaExecutionHealth = {
  personaId: string;
  displayName: string;
  mode: "live" | "paper" | "shadow" | "paused";
  activeStrategyIds: string[];
  openExposureUsd: number;
  pnl24h: number;
  pnl7d: number;
  pnl30d: number;
  drawdown: number;
  decisionCount24h: number;
  decisionConfidenceAvg: number;
  confidenceDrift: "stable" | "rising" | "falling" | "overconfident" | "unknown";
  decisionLatencyP95Ms: number;
  slippageP95Bps: number;
  policyViolations24h: number;
  riskBreaches24h: number;
  livePaperDivergence: number;
  healthScore: number;
  healthStatus: "healthy" | "watch" | "degraded" | "critical";
  sentinelVerdict: string;
  recommendedActionIds: string[];
  lastEvaluatedAt: string;
};
```

## 8.4 OptimizationRun

```ts
type OptimizationRun = {
  id: string;
  status: "running" | "blocked" | "completed" | "failed";
  scope: "strategy" | "persona" | "capitalPool" | "portfolio";
  trigger: "schedule" | "performance_window" | "risk_breach" | "sentinel" | "human";
  rankingFormulaId: string;
  rebalanceId?: string;
  evolutionProgramIds: string[];
  affectedStrategyIds: string[];
  affectedCapitalPoolIds: string[];
  proposedChanges: OptimizationChange[];
  expectedImpact: {
    sharpeDelta?: number;
    drawdownDelta?: number;
    exposureDeltaUsd?: number;
  };
  currentStage: "collect_performance" | "rank" | "simulate" | "check_constraints" | "governance" | "apply" | "monitor" | "feedback";
  blockedBy?: string[];
};
```

## 8.5 SentinelFinding

```ts
type SentinelFinding = {
  id: string;
  severity: "info" | "watch" | "warning" | "critical";
  loopType: "research" | "execution" | "optimization";
  subjectType: "persona" | "strategy" | "capitalPool" | "runtime" | "policy" | "portfolio" | "deployment";
  subjectId: string;
  title: string;
  diagnosis: string;
  evidence: EvidenceRef[];
  confidence: number;
  blastRadius: {
    strategies: string[];
    personas: string[];
    capitalPools: string[];
    deployments: string[];
    runtimes: string[];
  };
  recommendedActions: RemediationAction[];
  emergencyEligible: boolean;
  requiresHumanApproval: boolean;
  status: "open" | "accepted" | "dismissed" | "executing" | "resolved" | "superseded";
  createdAt: string;
  resolvedAt?: string;
};
```

## 8.6 RemediationAction

```ts
type RemediationAction = {
  id: string;
  findingId: string;
  type:
    | "observe"
    | "open_incident"
    | "reduce_allocation"
    | "pause_persona_routing"
    | "switch_persona_to_shadow"
    | "rollback_deployment"
    | "freeze_rebalance"
    | "rerun_ranking"
    | "start_evolution_run"
    | "request_human_approval"
    | "disable_tool_or_mcp";
  automationLevel: "advisory" | "guarded" | "emergency";
  title: string;
  rationale: string;
  expectedImpact: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresApproval: boolean;
  target: { type: string; id: string };
  status: "proposed" | "approved" | "rejected" | "executed" | "failed";
};
```

## 8.7 InterventionItem

```ts
type InterventionItem = {
  id: string;
  source: "approval" | "sentinel" | "incident" | "policy_exception" | "emergency_review";
  loopType: "research" | "execution" | "optimization";
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  blocksLoopRunId?: string;
  subject: { type: string; id: string; name?: string };
  recommendation?: string;
  evidenceRefs: string[];
  approveEffect: string;
  rejectEffect: string;
  modifyAllowed: boolean;
  dueAt?: string;
  status: "pending" | "approved" | "rejected" | "modified" | "expired";
};
```

---

## 9. Target Frontend Architecture

### 9.1 Layered Architecture

```text
┌─────────────────────────────────────────────┐
│ v5 Closed-loop Supervisor OS                │
│ Control Room / Loop Pages / Sentinel / HIQ  │
├─────────────────────────────────────────────┤
│ Existing Management Components              │
│ Strategy Detail / Risk Center / Ranking ... │
├─────────────────────────────────────────────┤
│ Domain Hooks & View Models                  │
│ useLoopRuns / useSentinel / usePersonaHealth│
├─────────────────────────────────────────────┤
│ BFF Client / Mock BFF                       │
│ loopRuns / health / findings / interventions│
├─────────────────────────────────────────────┤
│ Event Bus / SSE                             │
│ loop.updated / finding.created / health...  │
├─────────────────────────────────────────────┤
│ Backend Services                            │
│ Trading / Risk / Governance / LLM Sentinel  │
└─────────────────────────────────────────────┘
```

### 9.2 新增前端目錄建議

```text
src/management/pages/v5/
  ControlRoom.tsx
  LoopRuns.tsx
  ExecutionLoop.tsx
  OptimizationLoop.tsx
  SentinelFindings.tsx
  HumanInterventionQueue.tsx

src/management/components/v5/
  LoopLane.tsx
  LoopStageNode.tsx
  LoopRunCard.tsx
  PersonaHealthCard.tsx
  PersonaHealthMatrix.tsx
  OptimizationPipeline.tsx
  SentinelFindingCard.tsx
  RemediationPlanPanel.tsx
  InterventionItemCard.tsx
  AutonomyStatusBadge.tsx
  BlastRadiusPanel.tsx
  EvidenceList.tsx

src/lib/v5/
  types.ts
  loopModels.ts
  sentinelModels.ts
  interventionModels.ts
  mockLoopSeed.ts
  selectors.ts

src/lib/bff/v5Client.ts
```

### 9.3 新增 BFF endpoints / mock functions

```ts
bff.loopRuns.list()
bff.loopRuns.get(id)
bff.loopRuns.getStages(id)

bff.execution.personaHealth.list()
bff.execution.personaHealth.get(personaId)

bff.optimization.runs.list()
bff.optimization.runs.get(id)

bff.sentinel.findings.list()
bff.sentinel.findings.get(id)
bff.sentinel.actions.execute(actionId)
bff.sentinel.actions.requestApproval(actionId)
bff.sentinel.findings.dismiss(id, memo)

bff.interventions.list()
bff.interventions.get(id)
bff.interventions.decide(id, decision, memo)
```

---

## 10. Event Model

### 10.1 事件分類

| Event | 用途 |
|---|---|
| `loop.run.created` | 新閉環 run 建立 |
| `loop.run.updated` | run 狀態、stage、blocker 改變 |
| `loop.stage.changed` | 某 stage 狀態改變 |
| `persona.health.changed` | Persona trading health 更新 |
| `execution.anomaly.detected` | Execution Loop 異常 |
| `optimization.run.updated` | Optimization run 更新 |
| `sentinel.finding.created` | Sentinel 發現新異常 |
| `sentinel.finding.resolved` | Sentinel finding 解決 |
| `sentinel.action.proposed` | 修正方案被提出 |
| `sentinel.action.executed` | 修正方案被執行 |
| `intervention.created` | 需要人類介入 |
| `intervention.decided` | 人類做出決策 |
| `emergency.action.triggered` | 緊急處置發生 |

### 10.2 Event envelope

```ts
type V5EventEnvelope<T> = {
  id: string;
  schemaVersion: 1;
  type: string;
  occurredAt: string;
  correlationId: string;
  loopRunId?: string;
  payload: T;
};
```

### 10.3 UI event handling

1. Control Room 訂閱 loop / sentinel / intervention events。
2. Execution Loop 訂閱 persona health、execution anomaly、incident events。
3. Optimization Loop 訂閱 optimization run、ranking、rebalance、evolution events。
4. Sentinel Findings 訂閱 finding / action events。
5. Human Intervention Queue 訂閱 intervention events。

---

## 11. 新頁面需求

## 11.1 Pantheon Control Room

### 11.1.1 目的

管理者首頁。取代目前以 KPI summary 為主的 Command Center，呈現整體 autonomous loop 狀態。

### 11.1.2 第一屏資訊

```text
Pantheon Autonomy Status

Research Loop       running      next: replicate 3 candidates
Execution Loop      watch        anomaly: slippage rising
Optimization Loop   blocked      waiting: risk approval ap_302
Sentinel            3 findings   1 critical
Human Gates         5 pending    2 blocking loops
Emergency Mode      off
```

### 11.1.3 主要區塊

1. Autonomy Status Strip
2. Research Loop Lane
3. Execution Loop Lane
4. Optimization Loop Lane
5. Sentinel Critical Findings
6. Human Intervention Queue Preview
7. Next Automatic Actions
8. Recent System Decisions

### 11.1.4 Acceptance Criteria

1. 管理者 30 秒內能判斷系統是否健康。
2. 每個 loop 顯示 status、current stage、next action、blocker。
3. Sentinel critical finding 顯示在首頁，不藏在 Alerts。
4. Human gate 顯示阻塞哪個 loop。
5. 每個 stage 可點入對應既有頁面。

---

## 11.2 Execution Loop Page

### 11.2.1 目的

集中監看各 Persona 的交易狀況、執行品質、策略 routing、風險與健康度。

### 11.2.2 主要區塊

1. Execution Loop Pipeline
2. Persona Trading Health Matrix
3. Live Strategy Monitor
4. Risk / Incident Stream
5. Runtime / Job Health
6. Sentinel Execution Findings
7. Emergency Actions

### 11.2.3 Persona Health Card

每張卡至少顯示：

```text
Persona name
Mode: live / paper / shadow / paused
Health: healthy / watch / degraded / critical
Active strategies
PnL 24h / 7d
Drawdown
Decision confidence
Confidence drift
Latency p95
Slippage p95
Policy violations
Risk breaches
Sentinel verdict
Recommended action
Emergency action
```

### 11.2.4 Emergency Actions

1. Pause Persona Live Routing
2. Switch Persona to Shadow Mode
3. Reduce Strategy Allocation
4. Rollback Deployment
5. Open Incident
6. Disable Tool / MCP

所有 high-risk emergency actions 必須有 audit、post-action review、postmortem requirement。

---

## 11.3 Optimization Loop Page

### 11.3.1 目的

把 Ranking、Rebalance、Capital Allocation、Evolution、Candidate Promotion 串成一條可監督的閉環。

### 11.3.2 Pipeline

```text
Performance
→ Ranking
→ Rebalance Simulation
→ Constraint Check
→ Governance Gate
→ Apply Capital
→ Evolution
→ Promotion
→ Feedback
```

### 11.3.3 主要區塊

1. Current Optimization Run
2. Stage Pipeline
3. Ranking Change Summary
4. Rebalance Proposal
5. Constraint / Risk Check
6. Governance Blockers
7. Evolution Candidates
8. Expected Impact
9. Sentinel Optimization Findings
10. Next Automatic Action

### 11.3.4 Acceptance Criteria

1. 管理者可知道 optimization run 卡在哪個 stage。
2. 可以看到 ranking 改變與 rebalance proposal 的關聯。
3. 可以看到 evolution candidates 與 promotion readiness。
4. 可以看到批准 / 拒絕 capital change 的 downstream effect。

---

## 11.4 Sentinel Findings Page

### 11.4.1 目的

讓 LLM Supervisor 的異常診斷與修正方案成為一級操作界面。

### 11.4.2 Finding Card

每個 finding 顯示：

```text
Severity
Affected Loop
Subject
Diagnosis
Evidence
Confidence
Blast Radius
Recommended Actions
Automation Level
Approval Requirement
Status
```

### 11.4.3 Remediation Plan Panel

每個 finding 可展開 remediation plan：

| 欄位 | 說明 |
|---|---|
| action | 建議動作 |
| automationLevel | advisory / guarded / emergency |
| expectedImpact | 預期影響 |
| riskLevel | 風險等級 |
| requiresApproval | 是否需人類批准 |
| execute | 執行或建立 approval |
| audit | 查看 audit trail |

### 11.4.4 Supervisor Finding 狀態

```text
open → accepted → executing → resolved
open → dismissed
open → superseded
```

---

## 11.5 Human Intervention Queue

### 11.5.1 目的

整合所有需要人類決策的事項，讓管理者看到它們阻塞哪個 loop 與 downstream effect。

### 11.5.2 來源

1. Approval requests
2. Sentinel recommended actions
3. Incident mitigation decisions
4. Policy exceptions
5. Emergency reviews
6. Capital overrides
7. Evolution promotion gates
8. High-risk confirmations

### 11.5.3 每列資訊

```text
Title
Source
Affected Loop
Severity
Blocked LoopRun
Subject
LLM Recommendation
Approve Effect
Reject Effect
Due / SLA
Actions: approve / reject / modify / ask committee / inspect evidence
```

### 11.5.4 Acceptance Criteria

1. 管理者可按 loopType、severity、source、dueAt 篩選。
2. 每個 item 都顯示「為什麼需要我」。
3. 每個 item 都顯示 approve / reject 後會發生什麼。
4. 可以連回 evidence：Strategy、Persona、Incident、Audit、Ranking、Rebalance、Evolution。

---

## 12. LLM Sentinel 規格

### 12.1 Sentinel 責任

1. 監控 Research / Execution / Optimization Loop。
2. 監控 Persona trading health。
3. 監控 Strategy lifecycle、paper/live divergence、drawdown、slippage、alpha decay。
4. 監控 capital pool utilization、concentration、risk budget。
5. 監控 runtimes、jobs、MCP/tool health。
6. 監控 governance SLA、policy conflicts、repeated overrides。
7. 產生 structured finding。
8. 提出 remediation options。
9. 根據 automation level 執行、建立 approval、或要求 human intervention。
10. 追蹤處置結果並產生 learning feedback。

### 12.2 異常分類

| 類型 | 範例 |
|---|---|
| Execution anomaly | slippage 上升、latency 上升、order rejection、live/paper divergence |
| Persona anomaly | overconfidence、style drift、memory conflict、consult rule violation |
| Strategy anomaly | drawdown breach、alpha decay、regime mismatch |
| Capital anomaly | concentration risk、utilization breach、rebalance conflict |
| Infra anomaly | runtime degraded、MCP latency、failed jobs、data freshness issue |
| Governance anomaly | approval SLA breach、policy conflict、high-risk action bypass attempt |
| Optimization anomaly | ranking formula bias、rebalance quorum failure、evolution fitness degradation |

### 12.3 Automation Levels

| Level | 名稱 | 說明 | 範例 |
|---|---|---|---|
| L1 | Advisory | 只提出建議，不執行 | 建議調低 aggressiveness |
| L2 | Guarded Automation | 可做低風險處置或建立 approval | open incident、rerun ranking、switch to shadow |
| L3 | Emergency Override | 符合規則時可立即防守處置 | pause persona routing、reduce allocation、rollback deployment |

### 12.4 安全規則

1. LLM 不可自由下單。
2. LLM 不可無審批增加 live risk exposure。
3. LLM 可在 emergency policy 允許下執行 de-risking action。
4. 所有 L2 / L3 action 必須 audit。
5. L3 action 必須建立 emergency review。
6. L3 action 必須要求 postmortem。
7. LLM 的 diagnosis 必須有 evidence references。
8. LLM 的 recommendation 必須有 confidence 與 blast radius。

---

## 13. 權限與治理

### 13.1 Decision Classes

| 類別 | 說明 | 是否需 approval |
|---|---|---|
| Observe | 延長觀察、加強監控 | 否 |
| Inform | 建立 notification / finding | 否 |
| Investigate | 建立 incident、rerun diagnostics | 低風險不需，高風險需 |
| Simulate | 跑 ranking / rebalance / evolution simulation | 通常不需 |
| De-risk | 降低 live 風險 | 視規則，emergency 可先執行後審查 |
| Increase Risk | 增加 live exposure / promote live | 必須 approval |
| Override Policy | 覆蓋既有 policy / permission | 必須 approval |
| Rollback / Kill Switch | 緊急回滾或停用 | 可 emergency，但需 post-review |

### 13.2 Human Gate 類型

1. Risk approval
2. Capital approval
3. Ops approval
4. Research review
5. Policy exception
6. Emergency review
7. Two-man approval
8. Committee decision

---

## 14. Data Mapping：v5 與既有資料

### 14.1 LoopRun 可由既有資料組合

| LoopRun 欄位 | 可來源 |
|---|---|
| loopType | v5 mock seed / trigger |
| status | jobs、approvals、alerts、incidents、sentinel findings |
| currentStage | strategy state、rebalance workflow、evolution run、deployment status |
| subjects | strategies、personas、capital pools、deployments |
| blockedBy | approvals、incidents、policy exceptions |
| nextAutomaticAction | state machine / mock rules |
| sentinelFindingIds | Sentinel mock seed |
| interventionItemIds | approvals + findings + incidents |

### 14.2 PersonaExecutionHealth 可由既有資料組合

| 欄位 | 來源 |
|---|---|
| activeStrategyIds | strategy.personaIds |
| pnl / drawdown | strategy metrics 聚合 |
| policyViolations | policyViolations / route policy |
| riskBreaches | alerts / incidents |
| latency / slippage | runtime / mock execution metrics |
| healthStatus | score function |
| sentinelVerdict | Sentinel finding summary |

### 14.3 OptimizationRun 可由既有資料組合

| 欄位 | 來源 |
|---|---|
| rankingFormulaId | ranking formulas |
| rebalanceId | rebalances |
| evolutionProgramIds | evolution programs |
| affectedStrategyIds | rebalance lines / strategy ranking |
| proposedChanges | rebalance lines / allocation simulations |
| blockedBy | approvals / governance queue |
| expectedImpact | expectedSharpe / expectedDrawdown |

---

## 15. Migration Plan

### Phase E0 — SA / IA Freeze

- 確認 v5 IA。
- 確認保留現有頁面。
- 確認新增 domain models。
- 確認 Sentinel automation levels。

### Phase E1 — v5 Mock Models

新增：

```text
src/lib/v5/types.ts
src/lib/v5/mockLoopSeed.ts
src/lib/bff/v5Client.ts
```

內容：LoopRun、PersonaExecutionHealth、OptimizationRun、SentinelFinding、InterventionItem。

### Phase E2 — Control Room

新增 `/management/control-room`。

功能：

- Autonomy status strip
- 三條 loop lane
- Sentinel critical preview
- Human intervention preview
- Next automatic actions
- Drill-down links

### Phase E3 — Execution Loop

新增 `/management/loops/execution`。

功能：

- Persona Health Matrix
- Live Strategy Monitor
- Execution anomalies
- Emergency actions
- Drill-down to Persona / Strategy / Risk / Incident / Jobs / Runtime

### Phase E4 — Optimization Loop

新增 `/management/loops/optimization`。

功能：

- Optimization run pipeline
- Ranking / Rebalance / Constraint / Governance / Apply / Evolution stages
- Expected impact
- Sentinel recommendations
- Drill-down to existing ranking/rebalance/evolution/studios

### Phase E5 — Sentinel Findings

新增 `/management/sentinel`。

功能：

- Finding inbox
- Evidence panel
- Blast radius
- Remediation actions
- Advisory / guarded / emergency classification

### Phase E6 — Human Intervention Queue

新增 `/management/interventions`。

功能：

- Unified intervention list
- Source filters
- Loop blockers
- Approve / reject effects
- Links to approvals / incidents / Sentinel / audit

### Phase E7 — Navigation Migration

- 新 v5 menu 放最上面。
- 舊頁面重新掛到新 IA。
- 原 Core Management / Operations / Capabilities 先保留為 Advanced。
- 使用者驗證後再移除舊分類入口。

### Phase E8 — Contract Hardening

- 將 v5 mock BFF contract 對齊後端。
- 將 Sentinel findings 接入真實 LLM supervisor。
- 將 events 換成 typed SSE。
- 將 emergency action 接入正式 high-risk confirm / approval / audit。

---

## 16. Acceptance Criteria

### 16.1 Manager 30 秒測試

管理者進入 Control Room 後 30 秒內應能回答：

1. Research Loop 是否正常？
2. Execution Loop 是否正常？
3. Optimization Loop 是否正常？
4. 哪個 loop blocked？
5. 哪個 Persona / Strategy 異常？
6. Sentinel 最重要 finding 是什麼？
7. 下一個自動動作是什麼？
8. 哪些 human intervention 正在阻塞系統？

### 16.2 Execution Loop 測試

1. 可看到所有 Persona 的 trading health。
2. 可看到 live / paper / shadow mode。
3. 可看到 Persona 對應 active strategies。
4. 可看到風險、績效、執行品質與 Sentinel verdict。
5. 可從 Persona 卡片 drill down 到 Persona / Strategy / Incident / Risk。
6. 可看到 emergency actions，但 high-risk action 必須經過確認與 audit。

### 16.3 Optimization Loop 測試

1. 可看到 optimization run current stage。
2. 可看到 ranking → rebalance → capital → evolution 的 stage 關係。
3. 可看到 blocker 與 human gate。
4. 可看到 expected impact。
5. 可 drill down 到 Ranking Dashboard、Rebalance Ops Studio、Evolution Studio。

### 16.4 Sentinel 測試

1. 每個 finding 都有 diagnosis、evidence、confidence、blast radius。
2. 每個 recommended action 都有 automation level。
3. Advisory action 不直接執行。
4. Guarded action 可建立 approval 或執行低風險動作。
5. Emergency action 必須 audit、建立 review、要求 postmortem。

### 16.5 Human Intervention 測試

1. Approvals、Sentinel recommendations、incident decisions 都能出現在同一 queue。
2. 每個 item 顯示 blocked loop。
3. 每個 item 顯示 approveEffect / rejectEffect。
4. 決策後能更新 loop status。

---

## 17. 風險與緩解

| 風險 | 影響 | 緩解 |
|---|---|---|
| 新 IA 與舊 menu 混亂 | 使用者找不到既有功能 | 先共存，v5 頁面提供 drill-down，舊 menu 放 Advanced |
| Sentinel 被誤解為聊天功能 | 失去 supervisor 價值 | 使用 structured finding / remediation，不以 chat 為中心 |
| LLM action 過度自動 | 交易安全風險 | automation levels + approval gates + audit |
| v5 mock 與後端不同步 | 後續重工 | 早期定義 BFF contract 與 event envelope |
| Control Room 資訊過多 | 管理者負擔 | 首屏只放 loop status / critical finding / human gate / next action |
| 既有 detail 頁重複呈現 | UI 臃腫 | v5 只 summary，不重做 detail |

---

## 18. Lovable 實作提示草案

```md
Pack E — Pantheon Closed-Loop Supervisor OS

Do not rewrite existing entity pages.
Do not remove existing management components.
Do not add more generic CRUD/detail pages.

Goal:
Introduce a closed-loop operating layer above the existing management console.
Pantheon must feel like an autonomous multi-persona trading ecosystem supervised by LLM Sentinel, not a traditional admin console.

Implement:

1. New IA
   - Control Room
   - Execution Loop
   - Optimization Loop
   - Research Loop
   - Multi-Persona System
   - Risk & Governance
   - Infrastructure

2. New routes
   - /management/control-room
   - /management/loops
   - /management/loops/execution
   - /management/loops/optimization
   - /management/sentinel
   - /management/interventions

3. New mock models
   - LoopRun
   - LoopStage
   - PersonaExecutionHealth
   - OptimizationRun
   - SentinelFinding
   - RemediationAction
   - InterventionItem

4. Pantheon Control Room
   - Research / Execution / Optimization loop status lanes
   - autonomy status strip
   - Sentinel summary
   - Human gate summary
   - next automatic actions
   - drill-down links to existing pages

5. Execution Loop page
   - persona trading health matrix
   - active strategies, PnL, drawdown, decision confidence, confidence drift, latency, slippage, policy violations, risk breaches
   - Sentinel verdict and recommended actions
   - emergency action buttons with guarded UX

6. Optimization Loop page
   - ranking → rebalance → constraint check → governance → apply capital → evolution → promotion pipeline
   - current optimization run
   - blocker and next automatic action
   - expected impact

7. Sentinel Findings page
   - finding cards with severity, loop, subject, diagnosis, evidence, confidence, blast radius
   - remediation actions with advisory / guarded / emergency classification

8. Human Intervention Queue
   - merge approvals, Sentinel recommendations, incidents, policy exceptions, emergency reviews
   - show blocked loop and approve/reject downstream effects

9. Keep existing pages as drill-down destinations.

Acceptance:
A manager should answer within 30 seconds:
- Is the ecosystem healthy?
- Which loop is blocked?
- Which persona or strategy is abnormal?
- What does Sentinel recommend?
- What will the system do next automatically?
- Where must a human intervene?
```

---

## 19. Open Questions

1. 系統正式命名是 Pantheon 還是 Pathreon？UI 文案需統一。
2. Sentinel 是否為單一 supervisor，還是多個 domain Sentinel（Execution Sentinel、Risk Sentinel、Optimization Sentinel）？
3. 哪些 emergency actions 可由系統先執行後審查？
4. Persona trading health score 的正式公式如何定義？
5. Optimization run 是否固定每日觸發，還是事件驅動？
6. Human Intervention Queue 是否取代 Approvals 作為一級入口？
7. LoopRun 是否需要持久化到後端，還是只作為前端聚合 view model？
8. Sentinel evidence 是否需要可追溯到原始 market/execution data？
9. 是否要將 LLM reasoning 摘要與原始 prompt/output 分層儲存？
10. v5 是否應同步要求 AsyncAPI / event schema？

---

## 20. Appendix A — 既有設計圖對應

### A.1 Strategy Lifecycle

既有策略生命週期圖應作為 Strategy Lifecycle 與 Research/Execution Loop 的基準。v5 中不應只在 Strategy Detail 顯示 lifecycle，而應在 Control Room / Research Loop / Execution Loop 中顯示策略群體於 lifecycle 中的分佈、卡點與下一步自動動作。

### A.2 Multi-Persona Implementation Architecture

既有多人格架構圖應作為 Multi-Persona System 與 Execution Loop 的基準。v5 中 Persona 不應只是可管理資源，而應是 trading execution agents；每個 Persona 的 live/paper/shadow mode、健康度、決策品質、風險漂移、consult rule 行為都要被管理者可視化。

---

## 21. Appendix B — 新舊頁面映射

| v5 入口 | 使用現有頁面 |
|---|---|
| Control Room | Command Center、Risk Center、Approvals、Audit |
| Research Loop | Alpha Factory、Experiments、Artifacts、Knowledge、Strategy Detail |
| Execution Loop | Personas、Strategies、Deployments、Runtimes、Jobs、Alerts、Incidents、Risk Center |
| Optimization Loop | Ranking、Rebalance、Evolution、Capital、Studios |
| Sentinel Findings | Alerts、Incidents、Risk Center、Audit、Strategy Detail、Persona Detail |
| Human Intervention Queue | Governance Queue、Approvals、HighRiskConfirm、Incidents、Policy Exceptions |
| Multi-Persona System | Personas、Committee、Consult Rules、Memory Governance、Skills、Evaluations |
| Infrastructure | Tools、MCP、Channels、Hooks、Workflows |

---

## 22. Final Recommendation

採用 **v5 Closed-loop Supervisor OS**。

這不是砍掉重練，而是：

```text
Mental model 重做
Information Architecture 重做
首頁重做
Loop control surfaces 新增
LLM Sentinel 新增
Human Intervention Queue 新增
Existing management components 保留並轉為 drill-down / manual override / evidence pages
```

Pantheon 的管理者界面應從：

```text
Entity Admin Console
```

升級為：

```text
Autonomous Multi-Persona Trading Control OS
```

也就是讓管理者監督一個由 Research、Execution、Optimization、Sentinel、Human Governance 組成的自我修正交易生態。
