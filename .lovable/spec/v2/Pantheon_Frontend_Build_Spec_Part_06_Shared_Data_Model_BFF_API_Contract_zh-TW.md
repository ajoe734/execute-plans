# Pantheon Frontend Build Spec
## Part 6 — Shared Data Model + BFF API Contract（zh-TW）

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
