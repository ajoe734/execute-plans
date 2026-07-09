# Pantheon Management 前端改版完整規格書（Lovable 實作版）

> 文件目的：給 Lovable 前端實作團隊使用，將 `execute-plans` 的 Management Console 從「功能 / entity 後台」改造成「多人格 AI 交易組織的中央監控與治理介面」。  
> 範圍：只處理 **Management**。Agora 會另開規格，不在本版實作。  
> Repo 基準：`ajoe734/execute-plans@bff-luv-fe-006-dev-deploy`  
> 版本：2026-05-20 v1

---

## 0. 核心結論

目前 repo 已經具備非常完整的 Management Console 與 Agora Workbench 前端基礎：路由、BFF v1 facade、state machine、高風險確認、RBAC、Audit、Approvals、Sentinel、Loops、Control Room 等都已存在。

但 Management 的第一層資訊架構仍偏向：

```text
Strategy / Persona / Capital / Deployment / Runtime / Alert / Incident / Approval / Audit
```

這是傳統後台視角。

本次改版要改成：

```text
One Ring Oversight / Persona Fleet / Human Intervention / Trading Pulse / Evolution Journal / Evidence Explorer / Natural Language Console
```

也就是：

> Management 不是一般後台，而是中央治理與觀測平面。它要監看所有 Agora 使用者訓練出來的 AI 交易人格，了解每個人格正在做什麼、哪些需要人類介入、哪些已自動處理、哪些正在演化、哪些變好或變差、哪些正在影響交易與資金池。

---

## 1. 產品敘事與邊界

### 1.1 雙層產品敘事

本系統前端有兩個世界：

```text
Agora       = 個別交易員 / 分析師 / PM 的私人 AI 交易人格增幅介面
Management  = 中央監控、治理、審查、風控、演化與交易執行監督介面
```

### 1.2 Management 的設計隱喻

Management 是「One Ring Oversight」：

```text
它可以看到所有 AI 交易人格的狀態、行為、風險、訓練軌跡、演化、交易建議、執行結果與需要人類介入的地方。
```

注意：Management 監看的是 AI persona 與交易相關的 traces，不是未揭露地讀人類私密心思。所有資料都必須遵守平台治理、授權、audit、redaction、scope policy。

### 1.3 Agora 使用者不可感知 Management

Management 前端可以知道 Agora 的人格與訓練狀態；Agora 使用者不應該看到或感知：

```text
Management
One Ring
Governance Queue
Runtime Binding
Capital Binding Live
Operator Gate
Risk Owner Gate
BFF HA
artifact_state
DeploymentPlan
```

Agora 端所有「送審」類字眼要使用中性語言，例如：

```text
Request Review
Request Safety Check
Submit for Validation
Request Paper Test
Ask for Expert Review
```

Management 端可以看到實際治理語義。

---

## 2. 現有 repo 基準與不得破壞項

### 2.1 必須保留的現有能力

不可移除或破壞：

```text
BFF boundary only
mock / live / strict mode
VITE_BFF_REAL_WRITES gate
state-machine driven UI
PermissionAwareButton
HighRiskConfirm
AuditTimeline
LiveStatusBanner
BFF v1 typed client
canonical BFF paths
v5 Control Room / Loops / Sentinel / Interventions surface
Management and Agora route separation
```

### 2.2 不得直接 fetch API

所有新頁面都必須透過：

```text
src/lib/bff-v1/*
src/lib/bff/* only if existing legacy facade is explicitly used
```

不得在頁面元件內直接 `fetch()` 真實 API。

### 2.3 不得打開 real writes

本版改版不得修改：

```text
VITE_BFF_REAL_WRITES=false
```

也不得讓任何新頁面繞過 write gate。

### 2.4 不得刪除既有頁

本版不是刪除既有功能，而是重排 IA 與新增一線監控頁。既有 entity pages 保留，降級到 Advanced / Registry / Configuration。

---

## 3. 新 Management IA

### 3.1 目前 IA 問題

現在 Management 已有大量頁面，但一線入口仍偏功能導向。對多人格自演化交易系統，人類最常問的不是「我要操作哪個功能」，而是：

```text
現在誰需要我？
哪些人格在工作？
哪些人格變好 / 變差？
哪些 loop 卡住？
目前交易狀況如何？
系統最近自我改善了什麼？
哪些風險需要我介入？
哪個 canary/live gate 還沒過？
```

### 3.2 新頂層 IA

Management 主要導航改為：

```text
Management
├── One Ring Cockpit
├── Persona Fleet
├── Human Inbox
├── Trading Pulse
├── Evolution Journal
├── Evidence Explorer
├── Persona Intent Traces
├── Advanced Registry
└── System / Settings
```

### 3.3 對既有頁的歸類

#### 一線頁面

```text
/management/one-ring
/management/persona-fleet
/management/human-inbox
/management/trading-pulse
/management/evolution-journal
/management/evidence
/management/persona-intent
```

#### Advanced Registry 下保留

```text
/management/strategies
/management/personas
/management/capital
/management/deployments
/management/runtimes
/management/artifacts
/management/experiments
/management/lineage
/management/tools
/management/mcp
/management/skills
/management/workflows
/management/hooks
/management/channels
/management/studios
```

#### Operations 下保留

```text
/management/jobs
/management/alerts
/management/incidents
/management/approvals
/management/audit
/management/risk
```

---

## 4. 路由變更規格

### 4.1 新增路由

請在 `src/App.tsx` 的 `/management` route group 內新增：

```tsx
<Route path="one-ring" element={<OneRingCockpitPage />} />
<Route path="persona-fleet" element={<PersonaFleetPage />} />
<Route path="human-inbox" element={<HumanInboxPage />} />
<Route path="trading-pulse" element={<TradingPulsePage />} />
<Route path="evolution-journal" element={<EvolutionJournalPage />} />
<Route path="evidence" element={<EvidenceExplorerPage />} />
<Route path="evidence/:id" element={<EvidencePacketDetailPage />} />
<Route path="persona-intent" element={<PersonaIntentTracesPage />} />
<Route path="persona-intent/:id" element={<PersonaIntentTraceDetailPage />} />
<Route path="system/strict-publish" element={<StrictPublishAuditPage />} />
<Route path="system/bff-ha" element={<BffHaReadinessPage />} />
<Route path="broker-live" element={<BrokerLiveReadinessPage />} />
<Route path="capital-live" element={<CapitalBindingLiveReadinessPage />} />
```

### 4.2 Index route

目前 `/management` index 是 ControlRoom。改成：

```tsx
<Route index element={<Navigate to="/management/one-ring" replace />} />
```

### 4.3 Alias 保留

保留：

```tsx
<Route path="control-room" element={<OneRingCockpitPage />} />
```

不要破壞既有 deep link。

---

## 5. Navigation 修改規格

### 5.1 ManagementLayout 新分組

請修改 `src/management/ManagementLayout.tsx`。新的 nav groups：

```ts
const groups: NavGroup[] = [
  {
    label: t("groups.oversight"),
    items: [
      { to: "/management/one-ring", label: t("nav.oneRingCockpit"), icon: Compass, dedupeKey: "oneRing" },
      { to: "/management/persona-fleet", label: t("nav.personaFleet"), icon: Users },
      { to: "/management/human-inbox", label: t("nav.humanInbox"), icon: Eye },
      { to: "/management/trading-pulse", label: t("nav.tradingPulse"), icon: Target },
      { to: "/management/evolution-journal", label: t("nav.evolutionJournal"), icon: GitBranch },
      { to: "/management/evidence", label: t("nav.evidenceExplorer"), icon: FileText },
      { to: "/management/persona-intent", label: t("nav.personaIntent"), icon: Brain },
    ],
  },
  {
    label: t("groups.liveReadiness"),
    items: [
      { to: "/management/broker-live", label: t("nav.brokerLiveReadiness"), icon: ShieldAlert },
      { to: "/management/capital-live", label: t("nav.capitalLiveReadiness"), icon: Wallet },
      { to: "/management/system/bff-ha", label: t("nav.bffHaReadiness"), icon: Server },
      { to: "/management/system/strict-publish", label: t("nav.strictPublishAudit"), icon: ShieldCheck },
    ],
  },
  {
    label: t("groups.advancedRegistry"),
    items: [
      existing strategy/persona/capital/etc links...
    ],
  },
  {
    label: t("groups.operations"),
    items: [
      existing deployments/runtimes/risk/incidents/jobs/alerts/approvals links...
    ],
  },
  {
    label: t("groups.capabilities"),
    items: [existing tools/mcp/skills/workflows/hooks/channels/studios links...],
  },
  {
    label: t("groups.system"),
    items: [audit/settings],
  },
];
```

### 5.2 既有 Closed-Loop OS group

原本 `Closed-Loop OS` group 不刪除內容，但重新分散：

```text
Control Room -> One Ring Cockpit
Loops -> Advanced Registry / Loops
Sentinel -> Human Inbox / Operations
Interventions -> Human Inbox
Persona Trading Health -> Persona Fleet
Live Strategy Monitor -> Trading Pulse
Deployment Monitor -> Trading Pulse / Deployments
```

---

## 6. 新頁面規格

---

# 6.1 One Ring Cockpit

## Route

```text
/management/one-ring
```

## Purpose

中央首頁。回答：整個多人格 AI 交易組織目前是否健康？哪些人格 / loop / gate 需要介入？交易與演化狀態如何？

## Existing source to reuse

可從現有 `ControlRoom.tsx` 改造，保留：

```text
AutonomyStatusCard
LoopLane
SentinelPreview
HIQPreview
useV5Live
v5.controlRoom.get()
v5.personas.health()
v5.strategies.health()
```

## Layout

```text
[Top System Strip]
  Autonomy Mode | Live Write Status | Paper/Canary/Live status | Human Pending | Critical Findings | BFF mode

[Main Grid]
  Left: Persona Fleet Snapshot
  Center: Active OODA Loops
  Right: Human Inbox Preview

[Second Row]
  Trading Pulse Summary
  Evolution Summary
  Evidence / Readiness Summary
```

## Modules

### A. System Autonomy Strip

Fields:

```ts
systemMode: "paper" | "canary_ready" | "canary" | "live_disabled" | "live_enabled";
autonomyState: "healthy" | "guarded" | "degraded" | "emergency";
realWritesEnabled: boolean;
bffTransportMode: "mock" | "hybrid" | "real" | "real-error" | "mock-fallback";
humanPendingCount: number;
criticalFindingCount: number;
```

### B. Persona Fleet Snapshot

Show top 6 personas by priority:

```text
waiting_human
critical
degraded
recently_mutated
live_advisor
paper_owner
```

Each card:

```text
Persona name
Ring bearer
Autonomy mode
OODA stage
Health score
Human needed?
Recent improvement/degradation
```

### C. Active OODA Loops

Use existing v5 loop runs but render by stage:

```text
Observe
Orient
Decide
Act
Learn
Waiting Human
Blocked
```

### D. Human Inbox Preview

Show merged top 5:

```text
human gate
approval
sentinel finding
committee decision
evolution proposal
canary/live blocker
```

### E. Trading Pulse Summary

Fields:

```text
paper strategies running
canary readiness status
live enabled false/true
best/worst strategy delta
runtime health
broker sandbox/live status
```

### F. Evolution Summary

Fields:

```text
mutations last 24h
improved count
degraded count
inconclusive count
rollback count
postmortem proposals pending
```

## Empty states

```text
No active persona issues.
No human intervention needed.
No active OODA loop.
No recent evolution changes.
```

## Error states

Strict BFF transport error must show typed error; do not silently show seed.

## Acceptance

- `/management` redirects to `/management/one-ring`.
- `/management/control-room` still works and renders same page.
- Page renders in mock, live-auto, and strict mode.
- In strict mode, transport failure does not show seed as real.
- All cards link to detail pages.
- No direct fetch calls in page.

---

# 6.2 Persona Fleet Monitor

## Route

```text
/management/persona-fleet
```

## Purpose

Management 監看所有 Agora 使用者訓練出來的 AI 交易人格。

## Page questions

```text
哪些 persona 正在運行？
哪些 persona 等人類？
哪些 persona 最近變好？
哪些 persona 變差？
哪些 persona 服務哪些 ring bearer / strategy / capital pool？
哪些 persona 有危險 drift？
```

## Data model

```ts
export type RingPersonaFleetItem = {
  ringPersonaId: string;
  personaId: string;
  personaName: string;
  ringBearerId: string;
  ringBearerDisplayName: string;
  agoraScopeId: string;

  role: "researcher" | "advisor" | "paper_owner" | "canary_candidate" | "live_advisor" | "committee" | "risk_guardian";
  autonomyMode: "private_assistant" | "research_copilot" | "paper_advisor" | "canary_candidate" | "live_advisor" | "suspended" | "frozen";
  oodaStage: "observe" | "orient" | "decide" | "act" | "learn" | "waiting_human";
  loopStatus: "running" | "blocked" | "waiting_human" | "degraded" | "learning" | "idle";

  humanNeeded: boolean;
  humanRoleNeeded?: "researcher" | "reviewer" | "risk_owner" | "operator";
  humanReason?: string;

  strategies: Array<{ id: string; name: string; mode: "research" | "paper" | "canary" | "live" }>;
  capitalPools: Array<{ id: string; name: string; exposureMode: "none" | "paper" | "canary" | "live" }>;

  health: {
    behaviorScore: number;
    decisionQuality: number;
    riskCompliance: number;
    trainingStability: number;
    performanceDelta7d: number;
    performanceDelta30d: number;
  };

  evolution: {
    lastMutationAt?: string;
    lastMutationReason?: string;
    result: "improved" | "degraded" | "inconclusive" | "none";
  };

  restrictions: string[];
  updatedAt: string;
};
```

## UI

Top filters:

```text
All / Needs Human / Degraded / Improved / Canary Candidate / Live Advisor / Frozen
```

Columns:

```text
Persona
Ring Bearer
Autonomy Mode
OODA Stage
Loop Status
Human Needed
Health Score
Δ 7d
Δ 30d
Strategies
Capital Pools
Last Evolution
Restrictions
```

Cards mode optional for Control Room.

## Actions

Read-first. Actions should be high-risk gated:

```text
View Intent Traces
View Evolution
Restrict Tools
Suspend Persona
Freeze Routing
Request Review
```

All actions must go through canonical action endpoint.

## Acceptance

- Shows all personas, not only current user's persona.
- Has filter for `humanNeeded=true`.
- Shows improvement/degradation clearly.
- Every persona links to PersonaDetail.
- No Agora user-private UI terms exposed to non-authorized roles.

---

# 6.3 Human Intervention Inbox

## Route

```text
/management/human-inbox
```

## Purpose

Single place for all human-required decisions.

## Data model

```ts
export type HumanInboxItem = {
  id: string;
  itemType:
    | "approval"
    | "human_gate"
    | "sentinel_finding"
    | "committee_decision"
    | "evolution_proposal"
    | "canary_blocker"
    | "broker_live_gate"
    | "capital_binding_gate"
    | "incident_escalation";

  title: string;
  summary: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "pending" | "acknowledged" | "approved" | "rejected" | "deferred" | "expired" | "revoked" | "resolved";

  requiredRole: "researcher" | "reviewer" | "risk_owner" | "operator" | "admin";
  requestedBy: string;
  requestedAt: string;
  dueAt?: string;

  affected: {
    personas: string[];
    strategies: string[];
    capitalPools: string[];
    runtimes: string[];
    deployments: string[];
  };

  recommendedDecision?: "approve" | "reject" | "defer" | "request_more_evidence";
  aiConfidence?: number;
  consequenceIfApproved?: string;
  consequenceIfRejected?: string;
  consequenceIfIgnored?: string;

  evidenceRefs: string[];
  targetRoute: string;
};
```

## UI

Sections:

```text
Needs my role
Critical live/canary gates
Expiring soon
AI recommends approve
AI recommends reject
More evidence needed
```

Each card:

```text
Badge: type + severity
Title
Required role
Deadline
Affected persona/strategy/pool/runtime
AI recommendation
Evidence refs
Action buttons
```

## Actions

```text
Approve
Reject
Defer
Request more evidence
Open evidence
Open target
```

For human-gate items, show dual role split:

```text
risk-owner: pending/approved/rejected/revoked/expired
operator: pending/approved/rejected/revoked/expired
can_proceed: true/false
```

## Acceptance

- Approvals, Interventions, Sentinel critical findings, human gate tasks all appear in one view.
- Existing Approvals and GovernanceQueue remain accessible.
- Human-gate items are not batch-approved by default.
- High-risk decisions use HighRiskConfirm.
- Evidence refs are visible before decision.

---

# 6.4 Trading Pulse

## Route

```text
/management/trading-pulse
```

## Purpose

Human sees current trading/execution state and whether system is getting better or worse.

## Must answer

```text
現在 paper / canary / live 各跑什麼？
交易執行健康嗎？
和之前相比變好還是變差？
哪個 persona / strategy / artifact 造成改善或退化？
runtime / broker / telemetry 是否健康？
是否有 rollback target？
是否有 kill switch proof？
```

## Data model

```ts
export type TradingPulseSnapshot = {
  generatedAt: string;
  environments: {
    paper: TradingEnvironmentStatus;
    canary: TradingEnvironmentStatus;
    live: TradingEnvironmentStatus;
  };
  comparisons: TradingComparison[];
  runtimeHealth: RuntimeHealthSummary[];
  brokerHealth: BrokerHealthSummary[];
  capitalExposure: CapitalExposureSummary[];
  blockers: HumanInboxItem[];
};

export type TradingComparison = {
  id: string;
  subjectType: "strategy" | "persona" | "artifact" | "capital_pool";
  subjectId: string;
  subjectName: string;
  baselineLabel: string;
  currentLabel: string;
  metrics: Array<{
    name: string;
    before: number | string;
    after: number | string;
    delta: number | string;
    direction: "better" | "worse" | "neutral";
  }>;
  explanation: string;
  evidenceRefs: string[];
};
```

## UI Modules

```text
Environment Status Strip: Paper / Canary / Live
Performance Comparison Table
Runtime Health Table
Broker Connectivity Panel
Capital Exposure Panel
Rollback / Kill Switch Readiness Panel
Open Orders / Rejected Orders Summary
Human Blockers Panel
```

## Acceptance

- Must show paper/canary/live separately.
- Must show comparison vs previous artifact or previous 7d baseline.
- Must show whether change is better/worse.
- Must link to Deployment, Runtime, Capital Pool, Strategy, Persona.
- Must not imply live is enabled if live flags are false.

---

# 6.5 Evolution Journal

## Route

```text
/management/evolution-journal
```

## Purpose

Explain how the AI trading system improved itself.

## Data model

```ts
export type EvolutionJournalEntry = {
  id: string;
  timestamp: string;
  entryType:
    | "persona_mutation"
    | "route_policy_change"
    | "strategy_parameter_change"
    | "behavior_policy_update"
    | "risk_policy_adjustment"
    | "postmortem_followup"
    | "rollback"
    | "freeze"
    | "retrain";

  source: "trainer" | "postmortem" | "telemetry" | "committee" | "human_review" | "research_result";
  title: string;
  summary: string;

  affectedPersonas: string[];
  affectedStrategies: string[];
  affectedCapitalPools: string[];

  beforeMetrics: Record<string, number | string>;
  afterMetrics: Record<string, number | string>;
  result: "improved" | "degraded" | "inconclusive";

  autoApplied: boolean;
  requiredHumanApproval: boolean;
  approvalRef?: string;
  rollbackTarget?: string;
  evidenceRefs: string[];
};
```

## UI

Filters:

```text
Improved / Degraded / Inconclusive / Auto-applied / Human-approved / Rollback / Persona / Strategy / Capital Pool
```

Each entry:

```text
What changed
Why changed
Before vs after
Result
Evidence
Approval / rollback link
```

## Acceptance

- Must answer “最近系統如何自我改善？”
- Must show whether change improved or degraded metrics.
- Must show source: trainer, postmortem, telemetry, committee.
- Must link to evidence and affected persona/strategy.

---

# 6.6 Evidence Explorer

## Route

```text
/management/evidence
/management/evidence/:id
```

## Purpose

A single place to inspect proof packets and readiness evidence.

## Data model

```ts
export type EvidencePacket = {
  id: string;
  packetType:
    | "ooda_packet"
    | "ep5_readiness"
    | "m7_canary_readiness"
    | "strict_publish_audit"
    | "broker_sandbox_smoke"
    | "broker_live_activation"
    | "capital_binding_live"
    | "bff_ha_poc"
    | "rollback_drill"
    | "postmortem_bridge"
    | "compatibility_guard"
    | "human_gate_decision";

  title: string;
  status: "passed" | "failed" | "pending" | "superseded";
  createdAt: string;
  createdBy: string;
  sourceTask?: string;
  hash?: string;

  assertions: Array<{
    id: string;
    label: string;
    status: "pass" | "fail" | "pending";
    detail?: string;
  }>;

  linkedObjects: {
    personas: string[];
    strategies: string[];
    deployments: string[];
    runtimes: string[];
    capitalPools: string[];
    approvals: string[];
  };

  refs: Array<{ label: string; uri: string; kind: string }>;
};
```

## Acceptance

- Evidence list filter by packet type and status.
- Detail page shows assertions and linked objects.
- HumanGateDecision evidence must show role signatures.
- Strict publish evidence must show bundle hashes.
- OODA packet evidence must show Observe/Orient/Decide/Act/Learn transitions.

---

# 6.7 Persona Intent Traces

## Route

```text
/management/persona-intent
/management/persona-intent/:id
```

## Purpose

Management監看 AI persona 的交易相關思考脈絡、工具路徑、決策意圖與風險偏差。

## Data model

```ts
export type PersonaIntentTrace = {
  id: string;
  ringPersonaId: string;
  personaId: string;
  ringBearerId: string;
  timestamp: string;

  userIntentSummary: string;
  personaInterpretation: string;
  toolPath: string[];
  consultedPersonas: string[];
  generatedThesis?: string;
  proposedAction?: string;

  riskFlags: string[];
  policyViolations: string[];
  confidence?: number;
  evidenceRefs: string[];

  visibility: "management_summary" | "redacted" | "restricted";
};
```

## Privacy / governance rule

Do not display raw private text by default. Display summarized, redacted, trade-relevant intent.

## Acceptance

- Can filter by persona, ring bearer, risk flag, policy violation.
- Redacted traces show redaction reason.
- Restricted traces require role check.
- Links to related consult / journal / strategy / evidence.

---

# 7. Natural Language Console 規格

## 7.1 Management global console

Add a persistent natural language console, accessible from TopBar or right drawer.

Route optional:

```text
/management/ask
```

But primary UI should be a global dock.

## 7.2 Use cases

Management user can ask:

```text
哪些 persona 現在需要我介入？
目前 EP5 還缺哪些 gate？
哪個人格最近變差？
哪個策略改善最多？
今天是否有任何 canary blocker？
哪個 capital pool 風險最高？
這個 EvolutionDecision 的 evidence 是什麼？
如果我 approve 這個 human gate，下一步會發生什麼？
```

## 7.3 Response model

```ts
export type ManagementNlAnswer = {
  answer: string;
  confidence: number;
  recommendedActions: Array<{
    label: string;
    actionId?: string;
    route?: string;
    risk: "low" | "medium" | "high" | "critical";
    requiresHumanGate: boolean;
  }>;
  evidenceRefs: string[];
  affectedObjects: Array<{ type: string; id: string; name?: string }>;
  warnings: string[];
};
```

## 7.4 Critical rule

Natural language console cannot execute high-risk action directly. It can:

```text
explain
summarize
navigate
prepare action draft
request review
open HumanGateDecision
```

It cannot:

```text
enable live
bind capital live
rollback live
deploy live
bypass HighRiskConfirm
bypass human gate
```

---

# 8. Data source and BFF facade plan

## 8.1 Phase 1: composed frontend read models

If backend does not have new aggregate endpoints yet, Lovable may compose from existing facades:

```text
v5.controlRoom.get()
v5.loops.list()
v5.personas.health()
v5.strategies.health()
lists.personas()
lists.strategies()
lists.capitalPools()
lists.deployments()
lists.runtimes()
lists.alerts()
lists.incidents()
lists.approvals()
lists.audit()
```

But in strict mode, missing live BFF must surface error, not silent seed.

## 8.2 Phase 2: new BFF aggregate endpoints

Design target endpoints:

```text
GET /bff/management/one-ring/summary
GET /bff/management/persona-fleet
GET /bff/management/human-inbox
GET /bff/management/trading-pulse
GET /bff/management/evolution-journal
GET /bff/management/evidence-packets
GET /bff/management/evidence-packets/{id}
GET /bff/management/persona-intent-traces
GET /bff/management/persona-intent-traces/{id}
POST /bff/management/nl/ask
```

Lovable should implement frontend facades with mock/live adapters now, even if backend endpoints are not ready.

---

# 9. Write Path Hardening

## 9.1 Required migration

Any live write must go through canonical command/action path.

Current canonical path:

```text
POST /bff/actions/{entityType}/{entityId}/{actionId}
```

Nested paths like:

```text
/bff/personas/{id}/actions/{action}
```

are marked deprecated for live callers.

## 9.2 Required changes

### Persona actions

Update `src/lib/bff-v1/personas.ts`:

```ts
path: paths.personaAction(id, action)
```

change to:

```ts
path: paths.action("persona", id, action)
```

### Deployment actions

In `DeploymentDetail.tsx`, replace legacy mutation calls where possible:

```text
mutations.rollback
mutations.reduceAllocation
mutations.scheduleDeployment
```

with canonical command wrapper or `runActionSafe`.

### Approval decisions

Approval approve/reject/batch decide should be reviewed to ensure final live path uses:

```text
/bff/approvals/{id}/decide
/bff/approvals/batch-decide
```

or canonical action endpoint, depending backend contract.

## 9.3 Acceptance

- No new Management page uses legacy mutation for live write.
- All high-risk actions pass through HighRiskConfirm.
- All write calls include correlationId and idempotencyKey.
- All write calls can be blocked by `VITE_BFF_REAL_WRITES=false`.

---

# 10. i18n keys

Add keys in both zh-TW and en-US.

```text
groups.oversight
groups.liveReadiness
groups.advancedRegistry
nav.oneRingCockpit
nav.personaFleet
nav.humanInbox
nav.tradingPulse
nav.evolutionJournal
nav.evidenceExplorer
nav.personaIntent
nav.brokerLiveReadiness
nav.capitalLiveReadiness
nav.bffHaReadiness
nav.strictPublishAudit

oneRing.title
oneRing.subtitle
oneRing.autonomyState
oneRing.humanPending
oneRing.criticalFindings
oneRing.personaFleet
oneRing.tradingPulse
oneRing.evolutionSummary

personaFleet.title
personaFleet.subtitle
personaFleet.humanNeeded
personaFleet.oodaStage
personaFleet.autonomyMode
personaFleet.performanceDelta
personaFleet.lastMutation

humanInbox.title
humanInbox.subtitle
humanInbox.requiredRole
humanInbox.consequenceIfApproved
humanInbox.consequenceIfRejected
humanInbox.consequenceIfIgnored
humanInbox.requestMoreEvidence

tradingPulse.title
tradingPulse.subtitle
tradingPulse.paper
tradingPulse.canary
tradingPulse.live
tradingPulse.better
tradingPulse.worse
tradingPulse.rollbackReady
tradingPulse.killSwitchReady

evolutionJournal.title
evolutionJournal.subtitle
evolutionJournal.before
evolutionJournal.after
evolutionJournal.improved
evolutionJournal.degraded
evolutionJournal.inconclusive

evidence.title
evidence.subtitle
evidence.packetType
evidence.assertions
evidence.linkedObjects
evidence.hash

personaIntent.title
personaIntent.subtitle
personaIntent.redacted
personaIntent.restricted
personaIntent.policyViolation
personaIntent.riskFlag
```

Run i18n check after changes.

---

# 11. Test plan

## 11.1 Unit tests

Add tests for:

```text
Persona Fleet filtering
Human Inbox grouping
Trading Pulse comparison direction
Evidence packet status rendering
Persona Intent redaction rendering
Management nav route existence
canonical action endpoint migration
```

## 11.2 Integration tests

Add Playwright smoke:

```text
/management/one-ring renders
/management/persona-fleet renders
/management/human-inbox renders
/management/trading-pulse renders
/management/evolution-journal renders
/management/evidence renders
/management/persona-intent renders
```

## 11.3 Strict mode test

With:

```text
VITE_BFF_MODE=live
VITE_BFF_FALLBACK=strict
```

Expected:

```text
no seed fallback silently displayed as real
typed BFF error shown on transport failure
LiveStatusBanner shows real-error if backend unavailable
```

## 11.4 A11y

Every new page must pass existing axe smoke or include in a11y smoke suite.

---

# 12. Lovable implementation tasks

## Pack M1: IA and Navigation

```yaml
LUV-MGMT-IA-001:
  title: Add One Ring Oversight IA routes
  files:
    - src/App.tsx
    - src/management/ManagementLayout.tsx
    - src/i18n/locales/en-US.ts
    - src/i18n/locales/zh-TW.ts

LUV-MGMT-IA-002:
  title: Move entity-first routes under Advanced Registry navigation
```

## Pack M2: Core pages

```yaml
LUV-MGMT-ONE-001:
  title: Implement OneRingCockpitPage from ControlRoomPage foundation

LUV-MGMT-FLEET-001:
  title: Implement PersonaFleetPage

LUV-MGMT-HUMAN-001:
  title: Implement HumanInboxPage

LUV-MGMT-PULSE-001:
  title: Implement TradingPulsePage

LUV-MGMT-EVO-001:
  title: Implement EvolutionJournalPage

LUV-MGMT-EVIDENCE-001:
  title: Implement EvidenceExplorerPage and EvidencePacketDetailPage

LUV-MGMT-INTENT-001:
  title: Implement PersonaIntentTracesPage and PersonaIntentTraceDetailPage
```

## Pack M3: Live readiness pages

```yaml
LUV-MGMT-EP5-001:
  title: Add EP5 readiness panel to DeploymentDetail

LUV-MGMT-BROKER-001:
  title: Implement BrokerLiveReadinessPage

LUV-MGMT-CAPITAL-001:
  title: Implement CapitalBindingLiveReadinessPage

LUV-MGMT-HA-001:
  title: Implement BffHaReadinessPage

LUV-MGMT-PUBLISH-001:
  title: Implement StrictPublishAuditPage
```

## Pack M4: Natural language console

```yaml
LUV-MGMT-NL-001:
  title: Add global Management Natural Language Console dock

LUV-MGMT-NL-002:
  title: Implement Management NL answer cards with evidence refs and recommended actions
```

## Pack M5: Write path hardening

```yaml
LUV-MGMT-WRITE-001:
  title: Migrate persona action writes to canonical action endpoint

LUV-MGMT-WRITE-002:
  title: Migrate deployment high-risk writes to canonical action endpoint

LUV-MGMT-WRITE-003:
  title: Add tests for no new legacy live write path
```

## Pack M6: Tests and audit

```yaml
LUV-MGMT-TEST-001:
  title: Add route smoke tests for new Management pages

LUV-MGMT-TEST-002:
  title: Add strict mode no silent fallback tests

LUV-MGMT-TEST-003:
  title: Add i18n parity check for new keys
```

---

# 13. Do Not Do

Lovable must not:

```text
Delete existing entity pages
Expose Management wording in Agora
Enable real writes
Bypass HighRiskConfirm
Bypass BFF v1 facade
Direct fetch real APIs from page components
Treat seed/mock as real in strict mode
Use raw private Agora text in Management intent traces without redaction
Move backend decisions into frontend only
```

---

# 14. Acceptance checklist

A change is acceptable only if all true:

```text
[ ] /management redirects to /management/one-ring
[ ] Management nav has Oversight group first
[ ] One Ring page shows system / persona / loop / human / trading / evolution summary
[ ] Persona Fleet shows all personas with human-needed and improvement/degradation
[ ] Human Inbox consolidates approvals, interventions, gates, blockers
[ ] Trading Pulse shows paper/canary/live and better/worse comparisons
[ ] Evolution Journal explains self-improvement with before/after metrics
[ ] Evidence Explorer shows proof packets and assertions
[ ] Persona Intent Traces support redacted / restricted states
[ ] Broker Live, Capital Live, BFF HA, Strict Publish pages exist
[ ] Natural Language Console exists and cannot execute high-risk actions directly
[ ] No new direct fetch calls
[ ] No new live write path bypasses canonical command endpoint
[ ] Strict mode does not silently show seed as real
[ ] i18n parity passes
[ ] tests pass
```

---

## 最終設計方向

本次 Management 前端改版不是增加更多普通功能頁，而是把既有完整功能重新組成適合 AI 多人格自演化交易系統的第一層操作體驗。

新的 Management 應該回答：

```text
哪些 AI 人格在工作？
哪些 AI 人格需要我？
哪些 AI 人格變好或變差？
哪些交易正在 paper/canary/live？
哪些風險需要人類介入？
系統如何自我修正？
修正後是否改善？
哪些 evidence 支撐 go/no-go？
```

不是只回答：

```text
我有哪些 strategy / persona / deployment 可以點？
```

這就是 Pantheon Management 和一般管理後台的差別。
