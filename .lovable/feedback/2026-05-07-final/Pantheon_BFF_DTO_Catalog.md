# Pantheon BFF DTO Catalog

**文件類型**：DTO Catalog  
**版本**：2026-05-07-final  
**對應**：Pantheon BFF Contract Final bundle、OpenAPI 3.1、AsyncAPI/SSE  
**狀態**：Backend handoff ready

---

## 0. DTO Principles

1. DTOs are frontend-facing BFF shapes, not backend internal service models.
2. v4 + Pack D domain types remain normative for state, permissions, errors, pagination, and session.
3. v5 DTOs are view-model / aggregation DTOs for Closed-Loop Supervisor OS.
4. All write DTOs use `Idempotency-Key` HTTP header. No request body may contain `idempotencyKey`.
5. `CommandResponse<T>.data` is required. Use `CommandResponse<null>` if there is no payload.
6. Errors are non-2xx `BffErrorEnvelope`.
7. Evidence must respect capability redaction.

---

## 1. Shared Types

```ts
type RiskLevel = "info" | "low" | "medium" | "high" | "critical";

type Role =
  | "platform_admin"
  | "portfolio_manager"
  | "research_lead"
  | "ops"
  | "viewer"
  | "admin"
  | "risk_officer"
  | "capital_manager"
  | "strategy_manager"
  | "system_operator"
  | "reviewer"
  | "capability_admin";

type Capability = `${string}.${string}` | `${string}.*` | "*";
```

Rules:

```text
- Capability source of truth comes from /bff/me.capabilities.
- Roles are UI grouping and default bundle hints.
- Capability names are lowercase dot.case and case-sensitive.
```

---

## 2. Response Envelopes

### 2.1 ListResponse

```ts
type ListResponse<T> = {
  items: T[];
  cursor: {
    next?: string;
    prev?: string;
  };
  pageSize: number;
  estimatedTotal?: number;
  totalCountExact: boolean;
};
```

### 2.2 CommandResponse

```ts
type CommandResponse<T> = {
  ok: true;
  data: T;
  auditEventId?: string;
  correlationId: string;
  idempotencyKey?: string;
  replayed?: boolean;
  lockVersion?: number;
  message?: string;
};
```

### 2.3 BulkActionResponse

```ts
type BulkActionResponse<T> = {
  ok: boolean;
  partial: boolean;
  summary: {
    requested: number;
    succeeded: number;
    failed: number;
  };
  results: Array<{
    id: string;
    ok: boolean;
    data?: T;
    error?: BffErrorPayload;
  }>;
};
```

---

## 3. Error DTOs

```ts
type BffErrorEnvelope = {
  error: BffErrorPayload;
};

type BffErrorPayload = {
  code: ErrorCode;
  i18nKey: string;
  message: string;
  retryable: boolean;
  userActionable: boolean;
  correlationId: string;
  cause?: string;
  details?: ErrorDetails;
};
```

### 3.1 ErrorCode

```ts
type ErrorCode =
  | "VALIDATION_FAILED"
  | "AUTH_REQUIRED"
  | "TOKEN_EXPIRED"
  | "REFRESH_FAILED"
  | "PERMISSION_DENIED"
  | "CAPABILITY_MISSING"
  | "TENANT_SCOPE_MISMATCH"
  | "FEATURE_DISABLED"
  | "STATE_CONFLICT"
  | "ILLEGAL_TRANSITION"
  | "CONFIRM_TOKEN_REQUIRED"
  | "CONFIRM_TOKEN_REVOKED"
  | "CONFIRM_TOKEN_REUSED"
  | "CONFIRM_TOKEN_EXPIRED"
  | "CONFIRM_TOKEN_BINDING_MISMATCH"
  | "TWO_MAN_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "COOLDOWN_ACTIVE"
  | "CURSOR_EXPIRED"
  | "CURSOR_INVALID"
  | "RATE_LIMITED"
  | "IDEMPOTENCY_CONFLICT"
  | "BACKEND_UNAVAILABLE"
  | "SSE_REPLAY_UNAVAILABLE"
  | "RESOURCE_NOT_FOUND"
  | "UNKNOWN_ERROR";
```

### 3.2 ErrorDetails

```ts
type ErrorDetails =
  | { kind: "validation"; fields: Record<string, string[]> }
  | { kind: "state_conflict"; expectedVersion?: number; actualVersion?: number }
  | { kind: "permission"; missingCapabilities: string[] }
  | { kind: "cursor"; cursorError: "CURSOR_EXPIRED" | "CURSOR_INVALID" }
  | { kind: "rate_limit"; retryAfterSec: number }
  | { kind: "transition"; from: string; action: string; allowedActions: string[] }
  | { kind: "idempotency"; idempotencyKey: string; replayed: boolean }
  | { kind: "confirm_token"; tokenId?: string; reason: string; actionId?: string; entityType?: string; entityId?: string };
```

---

## 4. Session DTO

```ts
type MeResponse = {
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl?: string;
  };
  tenant: {
    id: string;
    name: string;
    tz: string;
    locale: string;
    baseCurrency?: string;
  };
  roles: Role[];
  capabilities: Capability[];
  env: "dev" | "staging" | "prod";
  featureFlags: Record<string, boolean>;
  serverTime: string;
  sessionExpiresAt: string;
  permissionsVersion: string;
  counters?: {
    pendingInterventionsCount?: number;
    unreadAuditCount?: number;
    openFindingsCount?: number;
  };
};
```

Frontend usage:

```text
PlatformShell
TopBar
permission checks
feature flags
tenant display
server-time based cooldown
v5 Control Room session context
```

---

## 5. Base Entity DTO

```ts
type BaseObjectDTO = {
  id: string;
  name: string;
  owner: string;
  updatedAt: string;
  risk: RiskLevel;
  labelKey?: string;
  lockVersion: number;
  actionDescriptors?: ActionDescriptor[];
};
```

---

## 6. ActionDescriptor

```ts
type ActionDescriptor = {
  id: string;
  entityType: string;
  labelKey: string;
  group: "primary" | "secondary" | "destructive";
  order: number;
  enabled: boolean;
  disabledReasonCode?: DisabledReasonCode;
  disabledReasonI18nKey?: string;
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
  requiresApproval: boolean;
  requiresConfirmToken: boolean;
  requiresTwoMan: boolean;
  requiresEnv?: "research" | "paper" | "live";
  ttlSec?: number;
  cooldownSec?: number;
  cooldownEndsAt?: string;
  idempotencyKeyRequired: boolean;
};
```

Canonical order:

```text
BFF action table = backend-facing canonical
v4 ActionDescriptor = frontend runtime DTO target
v3 availableActions = legacy/back-compat only
```

---

## 7. Core Read DTOs

### 7.1 StrategyDTO

```ts
type StrategyDTO = BaseObjectDTO & {
  alpha: string;
  capitalPoolId: string;
  personaIds: string[];
  pnl30d: number;
  sharpe: number;
  drawdown: number;
  lifecycleStatus: StrategyLifecycleStatus;
  reviewStatus: StrategyReviewStatus;
  deploymentStatus: StrategyDeploymentStatus;
  state?: string; // legacy transitional only
};
```

### 7.2 PersonaDTO

```ts
type PersonaDTO = BaseObjectDTO & {
  archetype: string;
  routedStrategies: number;
  successRate: number;
  mode?: "live" | "paper" | "shadow" | "suspended";
  status?: "draft" | "sandbox" | "active" | "probation" | "restricted" | "suspended" | "retired" | "archived";
};
```

### 7.3 CapitalPoolDTO

```ts
type CapitalPoolDTO = BaseObjectDTO & {
  currency: "USD" | "USDT" | "TWD";
  allocated: number;
  utilized: number;
  riskBudget: number;
  status: "draft" | "active" | "frozen" | "rebalancing" | "restricted" | "retired";
};
```

### 7.4 RankingFormulaDTO

```ts
type RankingFormulaDTO = BaseObjectDTO & {
  expression: string;
  appliedTo: number;
  status: "draft" | "testing" | "approved" | "active" | "deprecated" | "retired";
};
```

### 7.5 RebalanceDTO

```ts
type RebalanceDTO = BaseObjectDTO & {
  quarter: string;
  targetPoolId: string;
  proposedDelta: number;
  expectedSharpe?: number;
  expectedDrawdown?: number;
  notes?: string;
  lines?: Array<{
    strategyId: string;
    strategyName: string;
    currentWeight: number;
    proposedWeight: number;
    delta: number;
  }>;
  status: "draft" | "metrics_freezing" | "metrics_frozen" | "ranking_calculated" | "simulation_ready" | "under_review" | "approved" | "scheduled" | "applied" | "rolled_back" | "cancelled";
};
```

### 7.6 DeploymentDTO

```ts
type DeploymentDTO = BaseObjectDTO & {
  target: "research" | "paper" | "live";
  artifactId: string;
  strategyId?: string;
  version: string;
  previousVersion?: string;
  promotedAt?: string;
  rollbackAvailable?: boolean;
  status: "draft" | "submitted" | "under_review" | "approved" | "scheduled" | "deploying" | "deployed" | "failed" | "rolled_back" | "cancelled";
};
```

### 7.7 EvolutionProgramDTO

```ts
type EvolutionProgramDTO = BaseObjectDTO & {
  generation: number;
  population: number;
  bestFitness: number;
  parentAlpha: string;
  progress: number;
  status: "draft" | "active" | "paused" | "under_review" | "completed" | "retired";
};
```

### 7.8 ResearchExperimentDTO

```ts
type ResearchExperimentDTO = BaseObjectDTO & {
  hypothesis: string;
  status: "queued" | "running" | "review" | "concluded" | "failed";
  metric: string;
  metricValue: number;
  artifactId?: string;
};
```

### 7.9 ArtifactDTO

```ts
type ArtifactDTO = BaseObjectDTO & {
  kind: "model" | "dataset" | "report" | "container";
  version: string;
  sourceExperimentId?: string;
  sizeMb: number;
  hash: string;
  scanStatus?: "pending_scan" | "clean" | "rejected";
};
```

---

## 8. Runtime / Capability DTOs

### 8.1 RuntimeDTO

```ts
type RuntimeDTO = {
  id: string;
  name: string;
  kind: "executor" | "mcp" | "scheduler" | "ingest";
  env: "research" | "paper" | "live";
  status: "queued" | "running" | "success" | "warning" | "failed" | "paused";
  cpu: number;
  memory: number;
  latencyP95Ms: number;
  uptimePct: number;
  region: string;
  updatedAt: string;
  lockVersion?: number;
};
```

### 8.2 ToolDTO

```ts
type ToolDTO = BaseObjectDTO & {
  category: "data" | "execution" | "research" | "communication" | "analysis";
  version: string;
  inputs: number;
  description: string;
  usedBy: number;
  scope?: "read" | "write" | "destructive";
  status: "draft" | "testing" | "active" | "restricted" | "deprecated" | "blocked" | "retired";
};
```

### 8.3 McpServerDTO

```ts
type McpServerDTO = BaseObjectDTO & {
  endpoint: string;
  region: string;
  toolCount: number;
  envAllowed: Array<"research" | "paper" | "live">;
  health: "queued" | "running" | "success" | "warning" | "failed" | "paused";
  status: "draft" | "connected" | "healthy" | "degraded" | "disabled" | "retired";
};
```

### 8.4 McpToolDTO

```ts
type McpToolDTO = BaseObjectDTO & {
  serverId: string;
  description: string;
  scope: "read" | "write" | "destructive";
  envGrants: Array<"research" | "paper" | "live">;
  callsLast24h: number;
  status: "draft" | "testing" | "active" | "restricted" | "deprecated" | "blocked" | "retired";
};
```

MCP Tool is not independently creatable in v1. It is discovered/imported from MCP Server schema.

### 8.5 SkillDTO

```ts
type SkillDTO = BaseObjectDTO & {
  version: string;
  archetype: string;
  description: string;
  draft: boolean;
  publishedAt?: string;
  evalScore?: number;
  usedByPersonas: number;
  status: "draft" | "sandboxed" | "validated" | "approved" | "active" | "deprecated" | "blocked" | "retired";
};
```

### 8.6 ChannelDTO

```ts
type ChannelDTO = BaseObjectDTO & {
  kind: "slack" | "email" | "webhook" | "chat";
  destination: string;
  subscribers: number;
  filters?: string;
  status: "draft" | "active" | "disabled" | "archived";
};
```

---

## 9. Operational DTOs

### 9.1 JobDTO

```ts
type JobDTO = {
  id: string;
  kind: string;
  status: "queued" | "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled" | "retrying";
  startedAt: string;
  durationMs?: number;
  owner: string;
  retryOf?: string;
  attempt?: number;
  maxAttempts?: number;
};
```

### 9.2 AlertDTO

```ts
type AlertDTO = {
  id: string;
  severity: RiskLevel;
  title: string;
  source: string;
  openedAt: string;
  acknowledged: boolean;
  description?: string;
  relatedTarget?: string;
  metric?: string;
  threshold?: string;
  observed?: string;
  suggestedAction?: string;
};
```

### 9.3 IncidentDTO

```ts
type IncidentDTO = {
  id: string;
  severity: RiskLevel;
  title: string;
  status: "open" | "mitigating" | "resolved";
  openedAt: string;
  description?: string;
  affected?: string[];
  commander?: string;
  timeline?: Array<{ ts: string; actor: string; note: string }>;
  correlationId?: string;
};
```

### 9.4 ApprovalRequestDTO

```ts
type ApprovalRequestDTO = {
  id: string;
  kind: string;
  subject: string;
  requester: string;
  state: "pending" | "approved" | "rejected";
  riskLevel: RiskLevel;
  createdAt: string;
  rationale?: string;
  diffSummary?: string;
  stages?: Array<{
    name: string;
    state: "pending" | "approved" | "rejected" | "skipped";
    slaHours: number;
    startedAt?: string;
    decidedBy?: string;
    decidedAt?: string;
    memo?: string;
    escalated?: boolean;
    escalateTo?: string;
  }>;
};
```

### 9.5 AuditEventDTO

```ts
type AuditEventDTO = {
  id: string;
  actor: string;
  action: string;
  target: string;
  ts: string;
  memo?: string;
  before?: string;
  after?: string;
  outcome?: "ok" | "rejected";
  correlationId: string;
  causationId?: string;
};
```

---

## 10. Create Input DTOs

All create endpoints require HTTP `Idempotency-Key`.

### 10.1 StrategyCreateInput

```ts
type StrategyCreateInput = {
  name: string;
  owner?: string;
  risk?: RiskLevel;
  memo?: string;
  alpha: string;
  capitalPoolId: string;
  personaIds: string[];
  hypothesis?: string;
  initialLifecycleStatus?: "discovered" | "scaffolded";
};
```

### 10.2 PersonaCreateInput

```ts
type PersonaCreateInput = {
  name: string;
  owner?: string;
  risk?: RiskLevel;
  memo?: string;
  archetype: string;
  description?: string;
  initialMode?: "shadow" | "suspended";
};
```

### 10.3 CapitalPoolCreateInput

```ts
type CapitalPoolCreateInput = {
  name: string;
  owner?: string;
  risk?: RiskLevel;
  memo?: string;
  currency: "USD" | "USDT" | "TWD";
  allocated: number;
  riskBudget: number;
};
```

### 10.4 RankingFormulaCreateInput

```ts
type RankingFormulaCreateInput = {
  name: string;
  owner?: string;
  risk?: RiskLevel;
  memo?: string;
  expression: string;
  scope?: "strategy" | "persona" | "capitalPool" | "portfolio";
};
```

### 10.5 RebalanceCreateInput

```ts
type RebalanceCreateInput = {
  name: string;
  owner?: string;
  risk?: RiskLevel;
  memo?: string;
  quarter: string;
  targetPoolId: string;
  proposedDelta?: number;
  notes?: string;
};
```

### 10.6 DeploymentCreateInput

```ts
type DeploymentCreateInput = {
  name: string;
  owner?: string;
  risk?: RiskLevel;
  memo?: string;
  strategyId: string;
  artifactId: string;
  target: "research" | "paper" | "live";
  version: string;
  previousVersion?: string;
};
```

### 10.7 EvolutionProgramCreateInput

```ts
type EvolutionProgramCreateInput = {
  name: string;
  owner?: string;
  risk?: RiskLevel;
  memo?: string;
  parentAlpha: string;
  population: number;
  fitnessFormulaId?: string;
};
```

### 10.8 ResearchExperimentCreateInput

```ts
type ResearchExperimentCreateInput = {
  name: string;
  owner?: string;
  risk?: RiskLevel;
  memo?: string;
  hypothesis: string;
  metric: string;
  strategyId?: string;
};
```

### 10.9 ArtifactCreateInput

```ts
type ArtifactCreateInput = {
  name: string;
  owner?: string;
  risk?: RiskLevel;
  memo?: string;
  kind: "model" | "dataset" | "report" | "container";
  version: string;
  sourceExperimentId?: string;
  sizeMb?: number;
  hash?: string;
};
```

---

## 11. Future Capability Create DTOs

These are valid future extensions, not Pack F P0.

```ts
type ToolCreateInput = {
  name: string;
  category: "data" | "execution" | "research" | "communication" | "analysis";
  version: string;
  description: string;
  scope?: "read" | "write" | "destructive";
  memo?: string;
};

type McpServerCreateInput = {
  name: string;
  endpoint: string;
  region: string;
  envAllowed: Array<"research" | "paper" | "live">;
  memo?: string;
};

type SkillCreateInput = {
  name: string;
  archetype: string;
  version: string;
  description: string;
  memo?: string;
};

type ChannelCreateInput = {
  name: string;
  kind: "slack" | "email" | "webhook" | "chat";
  destination: string;
  filters?: string;
  memo?: string;
};
```

MCP Tool future-only standalone create:

```ts
type McpToolCreateInput = {
  serverId: string;
  name: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  scope: "read" | "write" | "destructive";
  envGrants: Array<"research" | "paper" | "live">;
  memo?: string;
};
```

---

## 12. MCP Tool Import DTO

Canonical v1 flow:

```ts
type McpToolImportRequest = {
  schemaUrl?: string;
  schemaJson?: unknown;
  memo?: string;
};

type McpToolImportResponse = CommandResponse<{
  serverId: string;
  imported: McpToolDTO[];
  skipped: Array<{ name: string; reason: string }>;
}>;
```

---

## 13. Action Command DTOs

```ts
type ActionCommandRequest = {
  expectedVersion?: number;
  memo?: string;
  confirmTokenId?: string;
  parameters?: Record<string, unknown>;
};
```

Idempotency is HTTP header:

```http
Idempotency-Key: idem_...
```

```ts
type ActionCommandStatus = "accepted" | "queued" | "completed";

type ActionCommandResponseData = {
  entityType: string;
  entityId: string;
  actionId: string;
  status: ActionCommandStatus;
  jobId?: string;
  approvalId?: string;
};
```

Missing confirm token / approval / two-man returns non-2xx `BffErrorEnvelope`.

---

## 14. Confirm Token DTOs

```ts
type ConfirmTokenRequest = {
  entityType: string;
  entityId: string;
  actionId: string;
  expectedVersion: number;
  memo: string;
};
```

```ts
type ConfirmTokenDTO = {
  tokenId: string;
  expiresAt: string;
  boundTo: {
    entityType: string;
    entityId: string;
    actionId: string;
    expectedVersion: number;
    idempotencyKey: string;
    userId: string;
    role: string;
  };
  used: boolean;
};
```

---

## 15. v5 DTOs

### 15.1 EvidenceRef

```ts
type EvidenceKind =
  | "alert"
  | "incident"
  | "job"
  | "audit"
  | "metric"
  | "strategy"
  | "persona"
  | "deployment"
  | "runtime"
  | "policy"
  | "approval"
  | "artifact"
  | "signal"
  | "journal"
  | "postmortem";

type EvidenceRef = {
  id: string;
  kind: EvidenceKind;
  label?: string;
  uri?: string;
  hash?: string;
  snapshot?: {
    value?: string | number | boolean;
    previousValue?: string | number | boolean;
    ts?: string;
    label?: string;
    unit?: string;
  };
};
```

### 15.2 RedactedEvidenceRef

```ts
type RedactedEvidenceRef = {
  id: string;
  kind: EvidenceKind;
  redacted: true;
  redactionReasonCode: "INSUFFICIENT_CAPABILITY";
  requiredCapability: Capability;
};
```

### 15.3 LoopRun / LoopStage

```ts
type LoopKind = "research" | "execution" | "optimization";
type LoopStatus = "idle" | "running" | "blocked" | "succeeded" | "failed" | "cancelled";
type LoopStageStatus = "pending" | "running" | "blocked" | "succeeded" | "failed" | "skipped";

type LoopStage = {
  id: string;
  name: string;
  status: LoopStageStatus;
  startedAt?: string;
  completedAt?: string;
  timeoutPolicySource?: "v0-mock" | "backend";
  timeoutMs?: number;
  warnAfterMs?: number;
};

type LoopRun = {
  id: string;
  loopKind: LoopKind;
  status: LoopStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  triggeredBy: string;
  subjectKind?: "strategy" | "persona" | "rebalance" | "evolution" | "research" | "deployment";
  subjectId?: string;
  subjectName?: string;
  stages: LoopStage[];
  currentStageId?: string;
  nextAction?: {
    kind: "automatic" | "awaiting_approval" | "awaiting_human_decision" | "none";
    label?: string;
    etaMs?: number;
  };
  evidence?: Array<EvidenceRef | RedactedEvidenceRef>;
};
```

### 15.4 PersonaExecutionHealth

```ts
type PersonaExecutionHealth = {
  personaId: string;
  personaName: string;
  mode: "live" | "paper" | "shadow" | "suspended";
  status: "healthy" | "watch" | "degraded" | "critical";
  score: number;
  formulaVersion: string;
  inputs: {
    performance: number;
    risk: number;
    executionQuality: number;
    decisionQuality: number;
    policyCompliance: number;
    sentinelPenalty: number;
  };
  suspendedReason?: string;
  routedStrategies: number;
  openFindings: number;
  updatedAt: string;
};
```

### 15.5 StrategyExecutionHealth

```ts
type StrategyExecutionHealth = {
  strategyId: string;
  strategyName: string;
  status: "healthy" | "watch" | "degraded" | "critical";
  score: number;
  formulaVersion: string;
  inputs: {
    performance: number;
    risk: number;
    executionQuality: number;
    lifecycleConsistency: number;
    sentinelIncidentPenalty: number;
  };
  pnl30d: number;
  drawdown: number;
  openFindings: number;
  updatedAt: string;
};
```

### 15.6 SentinelFinding

```ts
type SentinelFinding = {
  id: string;
  status: "open" | "acknowledged" | "action_pending" | "mitigating" | "resolved" | "dismissed";
  severity: "info" | "watch" | "warning" | "critical";
  confidence: number;
  title: string;
  summary: string;
  source: "alert" | "incident" | "job" | "runtime" | "persona-health" | "policy";
  detectedAt: string;
  updatedAt: string;
  blastRadius: {
    strategies?: string[];
    personas?: string[];
    pools?: string[];
    deployments?: string[];
  };
  evidence: Array<EvidenceRef | RedactedEvidenceRef>;
  recommendedActionIds: string[];
  supersededByFindingId?: string;
};
```

### 15.7 RemediationAction

```ts
type RemediationAction = {
  id: string;
  kind: string;
  mode: "advisory" | "guarded_automation" | "emergency_override";
  label: string;
  description?: string;
  requiredRoles: string[];
  requiredCapabilities?: Capability[];
  requiresHumanApproval: boolean;
  targetKind?: "strategy" | "persona" | "pool" | "deployment" | "runtime" | "policy";
  targetId?: string;
  requiresHighRiskConfirm: boolean;
};
```

### 15.8 InterventionItem

```ts
type InterventionItem = {
  id: string;
  source: "approval" | "sentinel" | "incident" | "policy_exception" | "emergency_review";
  severity: "info" | "watch" | "warning" | "critical";
  priority: number;
  title: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
  dueAt?: string;
  slaDeadline?: string;
  claimedBy?: string;
  claimedAt?: string;
  requiredRoles: string[];
  requiredCapabilities?: Capability[];
  linkedApprovalId?: string;
  linkedFindingId?: string;
  linkedIncidentId?: string;
  recommendedDecision?: "approve" | "reject" | "request_changes" | "escalate" | "defer";
  allowedDecisions: Array<"approve" | "reject" | "request_changes" | "escalate" | "defer">;
  evidenceRefs?: Array<EvidenceRef | RedactedEvidenceRef>;
  modifyAllowed?: boolean;
};
```

### 15.9 ControlRoomSummary

```ts
type ControlRoomSummary = {
  generatedAt: string;
  session: {
    tenantId: string;
    env: string;
    locale: string;
    serverTime: string;
  };
  kpi: {
    loopsRunning: number;
    loopsBlocked: number;
    openFindings: number;
    criticalFindings: number;
    pendingInterventions: number;
    personasHealthy: number;
    personasDegraded: number;
    strategiesHealthy: number;
    strategiesDegraded: number;
  };
  topFindings: SentinelFinding[];
  topInterventions: InterventionItem[];
  loopRuns: LoopRun[];
};
```

---

## 16. Agora DTOs

### 16.1 SignalDTO

```ts
type SignalDTO = {
  id: string;
  title: string;
  source: string;
  severity: "info" | "watch" | "warning" | "critical";
  confidence: number;
  symbols?: string[];
  drivers?: string[];
  createdAt: string;
  updatedAt: string;
  linkedStrategyIds?: string[];
  linkedInsightIds?: string[];
};
```

### 16.2 SignalFeedbackRequest

```ts
type SignalFeedbackRequest = {
  rating: "useful" | "not_useful" | "needs_review";
  memo?: string;
  tags?: string[];
};
```

### 16.3 AskPersonasRequest

```ts
type AskPersonasRequest = {
  prompt: string;
  personaIds?: string[];
  contextRefs?: EvidenceRef[];
  mode: "single" | "committee" | "debate";
};
```

### 16.4 JournalEntryMergePatch

```ts
type JournalEntryMergePatch = Partial<{
  title: string;
  body: string;
  tags: string[];
  linkedStrategyIds: string[];
  linkedPersonaIds: string[];
  visibility: "private" | "team" | "tenant";
}>;
```

Used with:

```http
Content-Type: application/merge-patch+json
```

---

## 17. Evidence Capability Map

| EvidenceKind | Required capability |
|---|---|
| alert | `risk.alert.read` |
| incident | `risk.incident.read` |
| job | `job.read` |
| audit | `audit.read` |
| metric | `metric.read` |
| strategy | `strategy.view` |
| persona | `persona.view` |
| deployment | `deployment.read` |
| runtime | `runtime.read` |
| policy | `policy.read` |
| approval | `approval.read` |
| artifact | `artifact.read` |
| signal | `agora.signal.read` |
| journal | `agora.journal.read` |
| postmortem | `postmortem.read` |
