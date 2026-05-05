# Pantheon Frontend Build Spec — SA/SD Gap Remediation 2026-05-05-B
## Medium / Low Complete Definitions

> This document is the follow-up to the `2026-05-05-A` remediation pack. It provides concrete schemas and implementation-ready definitions for Medium / Low gaps that were previously only marked as patch targets. This is a normative addendum and overrides vague descriptions in Parts 1–8.

## Scope

- Medium gaps: 41
- Low gaps: 23
- Resolved in this file: G06, G07, G08, G09, G10, G11, G12, G20, G21, G22, G23, G24, G25, G26, G27, G34, G35, G36, G37, G38, G39, G40, G41, G42, G43, G44, G45, G46, G47, G50, G51, G52, G53, G54, G55, G59, G60, G61, G62, G63, G64, G65, G69, G70, G71, G72, G73, G74, G75, G76, G77, G79, G80, G81, G82, G83, G84, G85, G87, G88, G89, G90, G91, G92.

## Hard rule

Lovable / frontend implementation must not infer or guess any item that is defined in this document. If current implementation conflicts with this document, this document wins.


---

## 1. G06 — Language switching and Persona response language rules

### Decision

UI locale and Persona response language are separate settings. Persona responses follow the UI locale by default.

### TypeScript contract

```ts
export type LocaleCode = "zh-TW" | "en-US";
export type PersonaResponseLanguageMode = "follow_ui" | "zh-TW" | "en-US" | "mixed_original";

export interface UserLocalePreferenceDTO {
  uiLocale: LocaleCode;
  personaResponseLanguage: PersonaResponseLanguageMode;
}

export interface AgoraSessionLanguageDTO {
  sessionId: string;
  responseLanguage: PersonaResponseLanguageMode;
  lockedByUser: boolean;
}
```

### fallback priority

| Priority | Source | Rule |
|---:|---|---|
| 1 | session.responseLanguage | Highest priority when the user locks a session language |
| 2 | user.personaResponseLanguage | User profile preference |
| 3 | user.uiLocale | Default behavior: follow UI locale |
| 4 | `zh-TW` | System fallback |

### UI rule

- `Ask Personas`, `Committee Room`, and `Trainer Studio` must expose a session language selector.
- Changing UI locale must not overwrite a locked session response language.
- User-generated content is not auto-translated; expose `Translate View` and `Summarize in Current Language` actions.


---

## 2. G07 — Notification types and payload schema

### NotificationType enum

```ts
export type NotificationType =
  | "approval_required"
  | "approval_decision"
  | "risk_alert"
  | "incident_update"
  | "job_completed"
  | "job_failed"
  | "deployment_event"
  | "rollback_event"
  | "rebalance_event"
  | "persona_policy_violation"
  | "handoff_incoming"
  | "mention"
  | "system_health";

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  severity: "info" | "warning" | "critical";
  titleKey: string;
  bodyKey: string;
  titleParams?: Record<string, string | number>;
  bodyParams?: Record<string, string | number>;
  createdAt: string;
  readAt: string | null;
  actor?: LinkedEntityRef;
  target: LinkedEntityRef;
  route: string;
  actionId?: string;
  requiresUserAction: boolean;
  expiresAt?: string | null;
}
```


### Notification routing table

| type | route | requiresUserAction | default severity |
|---|---|---:|---|
| approval_required | `/management/governance/:reviewId` | true | warning |
| approval_decision | target entity route | false | info |
| risk_alert | `/management/risk?alertId=:id` | true | warning |
| incident_update | `/management/incidents/:incidentId` | true | warning |
| job_completed | `/management/jobs/:jobId` | false | info |
| job_failed | `/management/jobs/:jobId` | true | warning |
| deployment_event | `/management/deployment/:deploymentId` | true | warning |
| rollback_event | `/management/deployment/:deploymentId` | true | critical |
| rebalance_event | `/management/rebalance/:rebalanceId` | true | warning |
| persona_policy_violation | `/management/personas/:personaId?tab=violations` | true | critical |
| handoff_incoming | Management queue destination | true | info |
| mention | originating session or object route | false | info |
| system_health | `/management/command-center` | true | warning |

### BFF endpoints

```http
GET /bff/notifications?status=unread|all&limit=50
POST /bff/notifications/<built-in function id>/actions/mark-read
POST /bff/notifications/actions/mark-all-read
```


---

## 3. G08 — Right Drawer Surface enum

```ts
export type RightDrawerSurface =
  | "strategy_inspector"
  | "persona_inspector"
  | "capital_pool_inspector"
  | "job_inspector"
  | "alert_inspector"
  | "incident_inspector"
  | "signal_inspector"
  | "message_inspector"
  | "artifact_inspector"
  | "tool_call_inspector"
  | "persona_quick_ask"
  | "handoff_inspector"
  | "audit_event_inspector";

export interface RightDrawerState {
  open: boolean;
  surface: RightDrawerSurface | null;
  entityRef?: LinkedEntityRef;
  payload?: Record<string, unknown>;
  sourceRoute: string;
}
```

### Surface behavior

| surface | opened from | required payload |
|---|---|---|
| strategy_inspector | any strategy link | `entityRef.type=strategy` |
| persona_inspector | persona links | `entityRef.type=persona` |
| capital_pool_inspector | pool links | `entityRef.type=capital_pool` |
| job_inspector | job row / notification | `entityRef.type=job` |
| alert_inspector | alert card | `entityRef.type=risk_alert` |
| incident_inspector | incident card | `entityRef.type=incident` |
| signal_inspector | Agora signal | `entityRef.type=signal` |
| message_inspector | Agora message | `entityRef.type=message` |
| artifact_inspector | artifact link | `entityRef.type=artifact` |
| tool_call_inspector | tool call row | `payload.callId` |
| persona_quick_ask | any context action | `payload.contextRef` |
| handoff_inspector | handoff queue | `entityRef.type=handoff` |
| audit_event_inspector | audit timeline | `entityRef.type=audit_event` |


---

## 4. G09 — Global Search scope and ranking

```ts
export type SearchEntityType =
  | "strategy" | "persona" | "capital_pool" | "experiment" | "artifact"
  | "review_request" | "deployment" | "runtime" | "incident" | "tool"
  | "mcp_server" | "mcp_tool" | "skill" | "insight" | "research_note"
  | "agora_session" | "decision_journal_entry" | "job" | "audit_event";

export interface SearchResultDTO {
  id: string;
  type: SearchEntityType;
  title: string;
  subtitle?: string;
  status?: string;
  riskLevel?: RiskLevel;
  owner?: LinkedEntityRef;
  updatedAt: string;
  route: string;
  score: number;
  matchedFields: string[];
}

export const SEARCH_SCORE_WEIGHTS = {
  exactId: 100,
  exactTitle: 90,
  prefixTitle: 75,
  fuzzyTitle: 55,
  linkedEntity: 35,
  noteBody: 15,
  recencyBoostMax: 10,
  openAlertBoost: 8,
  liveRiskBoost: 8
} as const;
```

### Search request

```http
GET /bff/search?q={query}&types=strategy,persona&limit=20
```

### Sorting rule

`score = textMatchScore + recencyBoost + riskBoost + openWorkBoost`. The BFF must return sorted results. The frontend must not re-rank results except tie-breaking by `updatedAt desc`.

### Product switching

- Management search may show Agora objects; routes must point to `/agora/...`.
- Agora search may show Management high-risk objects, but those must open as readonly inspectors unless the user has a Management role.


---

## 5. G10 — Locked decisions / ADR versioning

### ADR schema

```ts
export interface ArchitectureDecisionRecordDTO {
  adrId: string;           // e.g. ADR-FE-0007
  title: string;
  decision: string;
  status: "proposed" | "accepted" | "superseded" | "rejected";
  decidedAt: string;
  decidedBy: LinkedEntityRef;
  supersedes?: string[];
  supersededBy?: string | null;
  affectedSpecParts: string[];
}
```

### Required ADRs

| ADR | Decision |
|---|---|
| ADR-FE-0001 | Management + Operations are merged into Management Console |
| ADR-FE-0002 | Agora Workbench cannot directly execute live / capital high-risk actions |
| ADR-FE-0003 | BFF returns `availableActions: ActionDescriptor[]` |
| ADR-FE-0004 | `/management/risk` is the canonical route |
| ADR-FE-0005 | Strategy lifecycle uses 8 canonical lifecycle statuses |


---

## 6. G11 G81 — Design token mapping

### Required tokens

| Semantic token | Tailwind / CSS variable | Usage |
|---|---|---|
| `--pantheon-risk-critical` | `bg-red-600 text-white` | critical risk badge / destructive action |
| `--pantheon-risk-high` | `bg-orange-500 text-white` | high risk |
| `--pantheon-risk-medium` | `bg-amber-400 text-black` | medium risk |
| `--pantheon-risk-low` | `bg-slate-300 text-slate-900` | low risk |
| `--pantheon-status-live` | `bg-emerald-600 text-white` | live deployment |
| `--pantheon-status-paper` | `bg-yellow-500 text-black` | paper deployment |
| `--pantheon-status-retired` | `bg-zinc-500 text-white` | retired / archived |
| `--pantheon-surface-console` | `bg-slate-950` | Management Console background |
| `--pantheon-surface-workbench` | `bg-neutral-50` | Agora Workbench background |

### Rule

StatusBadge and RiskBadge must use semantic tokens only. Components must not hardcode raw colors.


---

## 7. G12 G74 — i18n validation tooling and error message contract

```ts
export interface BffError {
  code: string;
  message: string;
  i18nKey: string;
  i18nParams?: Record<string, string | number>;
  severity: "info" | "warning" | "error" | "critical";
  retryable: boolean;
  details?: Record<string, unknown>;
}
```

### i18n tooling requirements

- The build must fail when a required translation key is missing.
- Provide pseudo-locale `en-XA` for QA layout overflow checks.
- BFF errors must include `i18nKey`; the frontend renders localized text.
- If the key is missing, render `message` and show a missing-key warning in development.

### Accept-Language fallback

See G71.


---

## 8. G20 G80 — Incident mitigation / training feedback / attachment schema

```ts
export type IncidentStatus = "new" | "acknowledged" | "assigned" | "investigating" | "mitigated" | "resolved" | "postmortem_required" | "closed";
export type MitigationActionType = "pause_strategy" | "reduce_allocation" | "rollback" | "disable_tool" | "restrict_persona" | "open_research_task" | "manual_note";

export interface IncidentTimelineEventDTO {
  id: string;
  incidentId: string;
  occurredAt: string;
  actor: LinkedEntityRef;
  eventType: "created" | "acknowledged" | "assigned" | "mitigation_applied" | "status_changed" | "note_added" | "attachment_added" | "closed";
  summary: string;
  attachments: IncidentAttachmentDTO[];
}

export interface IncidentAttachmentDTO {
  id: string;
  fileName: string;
  mimeType: "text/plain" | "application/json" | "text/markdown" | "image/png" | "application/pdf";
  sizeBytes: number;
  storageUrl: string;
}

export interface IncidentTrainingFeedbackDTO {
  id: string;
  incidentId: string;
  targetPersonaId?: string;
  targetStrategyId?: string;
  feedbackType: "persona_behavior" | "strategy_failure_mode" | "risk_rule" | "tool_misuse";
  summary: string;
  recommendedAction: "create_training_example" | "update_memory" | "update_route_policy" | "update_evolution_constraint";
  status: "proposed" | "accepted" | "rejected";
}
```

### Workflow

`new → acknowledged → assigned → investigating → mitigated → resolved → postmortem_required → closed`. After `mitigated`, high or critical impact incidents must create a postmortem.


---

## 9. G21 G61 — Memory and Training Update linkage rules

```ts
export type MemoryStatus = "proposed" | "active" | "quarantined" | "rejected" | "deprecated" | "deleted";
export type TrainingUpdateStatus = "draft" | "evaluation_required" | "under_review" | "approved" | "published" | "rejected" | "rolled_back";

export interface MemoryTrainingLinkDTO {
  id: string;
  memoryId: string;
  trainingExampleId?: string;
  trainerFeedbackId?: string;
  updateId?: string;
  relationship: "created_from_feedback" | "requires_training_example" | "conflicts_with_training" | "approved_by_update";
}
```

### Rules

| Memory transition | Required role | Side effect |
|---|---|---|
| proposed → active | AI Trainer or Research Lead | may create training example |
| proposed → quarantined | AI Trainer | creates review task |
| quarantined → active | AI Trainer + Reviewer if linked to live strategy | creates audit event |
| active → deprecated | AI Trainer | creates memory invalidation event |
| any → deleted | Admin | high-risk action if linked to live deployment |


---

## 10. G22 G39 G40 — Tool / MCP / Skill entity differences and fields

### Entity separation

| Entity | Purpose | Has server connection | Has executable code | Has schema | Has sandbox | Has persona permission |
|---|---|---:|---:|---:|---:|---:|
| Tool | Internal capability wrapper | false | false | true | optional | true |
| MCPServer | External MCP endpoint | true | false | false | health test only | server-level allowlist |
| MCPTool | Tool discovered from MCP server | true | false | true | call dry-run | true |
| Skill | Pantheon skill package / workflow | optional | true or workflow steps | true | required | true |

### List columns

| List | Required columns |
|---|---|
| Tool List | toolId, name, type, sideEffectLevel, status, allowedPersonasCount, lastUsedAt, errorRate |
| MCP Server List | serverId, name, transport, status, toolsCount, authType, lastHealthCheckAt |
| MCP Tool List | mcpToolId, serverId, name, sideEffectLevel, schemaVersion, allowedPersonasCount, lastCallAt |
| Skill List | skillId, name, version, status, riskLevel, sandboxStatus, allowedPersonasCount, lastUsedAt |


---

## 11. G23 — Insight lineage fields

```ts
export interface InsightLineageDTO {
  insightId: string;
  sourceType: "trader_note" | "signal_feedback" | "persona_response" | "committee_memo" | "alert_triage" | "market_event" | "postmortem";
  sourceRef: LinkedEntityRef;
  createdBy: LinkedEntityRef;
  linkedStrategyIds: string[];
  linkedSignalIds: string[];
  linkedPersonaIds: string[];
  convertedTo?: LinkedEntityRef[];
  parentInsightIds: string[];
  childInsightIds: string[];
}
```

### UI rule

Insight Detail must show source, linked entities, conversion history, and parent/child insight chain.


---

## 12. G24 G25 G73 — Job types input/output payloads, async threshold, progress throttling

```ts
export type JobType =
  | "backtest" | "oos" | "stress_test" | "parameter_sweep" | "artifact_build"
  | "validator_run" | "formula_recalculation" | "rebalance_simulation"
  | "evolution_run" | "mcp_discovery" | "skill_sandbox" | "persona_evaluation"
  | "deployment" | "rollback" | "postmortem_generation";

export interface JobDTO<TInput = unknown, TOutput = unknown> {
  id: string;
  type: JobType;
  status: "queued" | "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled" | "retrying";
  target: LinkedEntityRef;
  triggeredBy: LinkedEntityRef;
  persona?: LinkedEntityRef | null;
  input: TInput;
  output?: TOutput | null;
  progress: {
    percent: number;
    currentStep: string;
    totalSteps: number;
    completedSteps: number;
    messageKey?: string;
    updatedAt: string;
  };
  logsUrl?: string;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: BffError | null;
}

export interface BacktestJobInput {
  strategyId: string;
  specVersionId: string;
  engine: "qlib" | "vectorbt" | "statmodels" | "custom";
  datasetId: string;
  startDate: string;
  endDate: string;
  costModelId: string;
  parameterSetId?: string;
}
export interface BacktestJobOutput {
  experimentId: string;
  artifactIds: string[];
  metrics: StrategyMetrics;
  reproducibilityHash: string;
}

export interface OosJobInput extends BacktestJobInput {
  trainStartDate: string;
  trainEndDate: string;
  oosStartDate: string;
  oosEndDate: string;
}
export interface OosJobOutput extends BacktestJobOutput {
  oosMetrics: StrategyMetrics;
  trainOosGap: number;
}

export interface StressTestJobInput {
  strategyId: string;
  scenarioIds: string[];
  artifactId: string;
}
export interface StressTestJobOutput {
  experimentId: string;
  scenarioResults: Array<{ scenarioId: string; passed: boolean; metrics: StrategyMetrics }>;
}

export interface ParameterSweepJobInput {
  strategyId: string;
  parameterGrid: Record<string, Array<string | number | boolean>>;
  objectiveMetric: string;
  maxRuns: number;
}
export interface ParameterSweepJobOutput {
  experimentId: string;
  bestParameterSetId: string;
  leaderboard: Array<{ parameterSetId: string; score: number; metrics: StrategyMetrics }>;
}

export interface ArtifactBuildJobInput {
  strategyId: string;
  experimentId: string;
  artifactType: "model" | "signal" | "policy" | "config" | "report";
}
export interface ArtifactBuildJobOutput {
  artifactId: string;
  artifactVersion: string;
  hash: string;
}

export interface ValidatorRunJobInput {
  reviewRequestId: string;
  validatorIds: string[];
}
export interface ValidatorRunJobOutput {
  reviewRequestId: string;
  results: ValidatorResultDTO[];
}

export interface FormulaRecalculationJobInput {
  formulaId: string;
  scope: RankingScope;
  periodStart: string;
  periodEnd: string;
  entityIds: string[];
}
export interface FormulaRecalculationJobOutput {
  rankingPublicationId: string;
  rows: RankingRowDTO[];
}

export interface RebalanceSimulationJobInput {
  rebalanceId: string;
  rankingPublicationId: string;
  constraintSetId: string;
}
export interface RebalanceSimulationJobOutput {
  rebalanceId: string;
  allocationRows: AllocationSimulationRowDTO[];
  constraintViolations: ConstraintViolationDTO[];
}

export interface EvolutionRunJobInput {
  programId: string;
  generationCount: number;
  populationSize: number;
  parentStrategyIds: string[];
  mutationRuleIds: string[];
}
export interface EvolutionRunJobOutput {
  runId: string;
  candidateStrategyIds: string[];
  bestCandidateId?: string;
  bestScore?: number;
}

export interface McpDiscoveryJobInput { serverId: string; refreshSchemas: boolean; }
export interface McpDiscoveryJobOutput { discoveredToolIds: string[]; schemaVersion: string; }

export interface SkillSandboxJobInput {
  skillId: string;
  skillVersion: string;
  fixtureId: string;
  timeoutMs: number;
}
export interface SkillSandboxJobOutput {
  sandboxRunId: string;
  passed: boolean;
  logsUrl: string;
  producedArtifacts: string[];
}

export interface PersonaEvaluationJobInput {
  personaId: string;
  personaVersion: string;
  suiteId: string;
}
export interface PersonaEvaluationJobOutput {
  evaluationRunId: string;
  score: number;
  failedCaseIds: string[];
}

export interface DeploymentJobInput {
  promotionRequestId: string;
  strategyId: string;
  artifactId: string;
  runtimeId: string;
  capitalPoolId: string;
}
export interface DeploymentJobOutput {
  deploymentId: string;
  runtimeId: string;
  deployedAt: string;
}

export interface RollbackJobInput {
  deploymentId: string;
  targetArtifactId: string;
  reason: string;
  confirmToken: string;
}
export interface RollbackJobOutput {
  deploymentId: string;
  previousArtifactId: string;
  activeArtifactId: string;
  rolledBackAt: string;
}

export interface PostmortemGenerationJobInput { incidentId: string; language: LocaleCode; }
export interface PostmortemGenerationJobOutput { postmortemId: string; noteId: string; }
```

### Async job threshold

Any operation must become a Job when at least one condition is true:

| Condition | Rule |
|---|---|
| expected duration | greater than 2 seconds |
| produces artifact | always async |
| affects deployment/runtime | always async |
| calls external MCP discovery | always async |
| runs sandbox/evaluation | always async |
| runs experiment/backtest/OOS | always async |

### Progress event rule

- SSE progress update minimum interval: 1000 ms.
- `progress.messageKey` must be localized by frontend.
- Log chunks must be fetched by URL, not embedded in SSE payload.
- Max SSE payload size: 16 KB.


---

## 13. G26 G48 G52 G65 — Agora handoff schema, SLA, attach-to-strategy

```ts
export type AgoraHandoffType =
  | "trader_insight_to_strategy"
  | "signal_feedback_to_research_task"
  | "committee_memo_to_review_evidence"
  | "trainer_feedback_to_persona_update"
  | "skill_draft_to_skill_approval"
  | "mcp_tool_request_to_permission_review"
  | "alert_triage_to_incident";

export type HandoffStatus = "draft" | "submitted" | "accepted" | "rejected" | "rerouted" | "expired";

export interface AgoraHandoffDTO<TPayload = unknown> {
  id: string;
  handoffType: AgoraHandoffType;
  status: HandoffStatus;
  source: {
    app: "agora";
    route: string;
    entity: LinkedEntityRef;
  };
  destination: {
    app: "management";
    route: string;
    queue: "insight" | "research" | "governance" | "persona" | "capability" | "incident";
  };
  priority: "low" | "normal" | "high" | "urgent";
  slaDueAt: string;
  rerouteCount: number;
  payload: TPayload;
  createdBy: LinkedEntityRef;
  createdAt: string;
  updatedAt: string;
}
```

### Type-specific payloads

```ts
export interface TraderInsightToStrategyPayload { insightId: string; proposedTitle: string; thesis: string; suggestedPersonaId?: string; }
export interface SignalFeedbackToResearchTaskPayload { signalId: string; strategyId: string; feedbackId: string; requestedExperimentType: "backtest" | "oos" | "stress_test" | "ablation"; }
export interface CommitteeMemoToReviewEvidencePayload { committeeSessionId: string; memoId: string; reviewRequestId?: string; }
export interface TrainerFeedbackToPersonaUpdatePayload { personaId: string; feedbackIds: string[]; proposedChangeSummary: string; }
export interface SkillDraftToSkillApprovalPayload { skillDraftId: string; sandboxRunId?: string; requestedAllowedPersonaIds: string[]; }
export interface McpToolRequestToPermissionReviewPayload { serverId: string; mcpToolId: string; requestedPersonaIds: string[]; reason: string; }
export interface AlertTriageToIncidentPayload { alertId: string; triageNoteId: string; severityRecommendation: "info" | "warning" | "critical"; }
```

### SLA by priority

| priority | SLA |
|---|---|
| low | 7 calendar days |
| normal | 2 business days |
| high | 1 business day |
| urgent | 4 hours |

### Attach to strategy endpoint

```http
POST /bff/insights/{insightId}/actions/attach-strategy
```

Request:

```json
{ "strategyId": "alpha_042", "relationship": "supporting_evidence", "note": "Linked from signal review." }
```


---

## 14. G27 G43 — Audit retention and export behavior

### Retention policy

| Audit category | Retention |
|---|---|
| live deployment / rollback / emergency kill | 7 years |
| capital allocation / rebalance / formula changes | 7 years |
| persona policy / tool permission / MCP permission | 5 years |
| skill sandbox / skill approval | 5 years |
| Agora notes / session annotations | 3 years |
| notification read state | 180 days |
| job logs | 1 year, unless linked to incident then 7 years |

### Export endpoint

```http
GET /bff/audit/export?format=csv&from=2026-01-01&to=2026-03-31&entityType=strategy&entityId=alpha_042
```

CSV columns: `eventId, occurredAt, actorId, actorRole, entityType, entityId, action, beforeHash, afterHash, memo, ipAddress, userAgent`.


---

## 15. G34 — Command Center KPI definitions

### KPI definitions

| KPI | Formula | Source |
|---|---|---|
| Lifecycle Bottleneck Count | count(strategy where daysInCurrentState > stateSlaDays) | Strategy Registry |
| Pending Approval Count | count(review where status in submitted, validator_running, in_review) | Governance |
| Live Risk Warning Count | count(alert where targetEnvironment=live and status not closed) | Risk Center |
| Running Job Count | count(job where status in queued,running,retrying) | Job System |
| Persona Violation Count | count(policyViolation where status != closed) | Persona Directorate |
| Capital Exposure Utilization | allocatedCapital / totalCapital | Capital Pool |
| Agora Incoming Count | count(handoff where status=submitted) | Handoff Queue |
| Runtime Health Score | percentage(runtime where status=healthy) | Runtime Monitor |


---

## 16. G35 — Strategies List sort / filter spec

### Filters

```ts
export interface StrategyListFilters {
  lifecycleStatus?: StrategyLifecycleStatus[];
  reviewStatus?: StrategyReviewStatus[];
  deploymentStatus?: StrategyDeploymentStatus[];
  ownerPersonaIds?: string[];
  capitalPoolIds?: string[];
  riskLevel?: RiskLevel[];
  hasOpenAlerts?: boolean;
  hasOpenJobs?: boolean;
  text?: string;
}
```

### Sort keys

`updatedAt`, `displayName`, `lifecycleStatus`, `riskLevel`, `rankingScore`, `openAlertsCount`, `runningJobsCount`, `capitalAllocation`.

BFF endpoint:

```http
GET /bff/strategies?filter=...&sort=rankingScore:desc&page=1&pageSize=50
```


---

## 17. G36 — Run Experiment action input schema

```ts
export interface RunExperimentRequest {
  strategyId: string;
  experimentType: "backtest" | "oos" | "stress_test" | "ablation" | "parameter_sweep";
  engine: "qlib" | "vectorbt" | "statmodels" | "finrl" | "rllib" | "custom";
  datasetId: string;
  timeRange: { startDate: string; endDate: string };
  costModelId: string;
  parameterSetId?: string;
  validationMode: "single_period" | "walk_forward" | "k_fold" | "rolling_window";
  computeTarget: "local" | "worker_pool" | "cloud";
}
```

Endpoint:

```http
POST /bff/strategies/{strategyId}/actions/run-experiment
```

Response: `CommandResponse<JobDTO>`.


---

## 18. G37 G38 — Risk / Review source of truth

### Risk source of truth

Strategy Risk tab and Risk Center must query the same `RiskAlertDTO` source.

```http
GET /bff/risk/alerts?strategyId=alpha_042
GET /bff/risk/alerts
```

Strategy tab only applies `strategyId` filter. It must not create a separate alert object.

### Review source of truth

Strategy Governance tab and Governance page must query the same `ReviewRequestDTO` source.

```http
GET /bff/reviews?strategyId=alpha_042
GET /bff/reviews/{reviewId}
```

Creating review from Strategy Detail must call:

```http
POST /bff/strategies/{strategyId}/actions/submit-review
```

The BFF creates one `ReviewRequestDTO`. Both pages reference the same `reviewId`.


---

## 19. G41 — Skill sandbox input / output schema

```ts
export interface SkillSandboxRequest {
  skillId: string;
  skillVersion: string;
  fixtureId: string;
  personaId?: string;
  timeoutMs: number;
  dryRun: true;
  inputPayload: Record<string, unknown>;
}

export interface SkillSandboxResultDTO {
  sandboxRunId: string;
  skillId: string;
  skillVersion: string;
  status: "queued" | "running" | "passed" | "failed" | "timed_out";
  startedAt: string;
  completedAt?: string;
  stdoutPreview: string;
  stderrPreview: string;
  outputPayload?: Record<string, unknown>;
  producedArtifacts: LinkedEntityRef[];
  securityFindings: Array<{ severity: RiskLevel; ruleId: string; message: string }>;
}
```

Endpoint:

```http
POST /bff/skills/{skillId}/actions/sandbox-eval
```


---

## 20. G42 — LineageGraph scale limits and interactions

### Limits

| Limit | Value |
|---|---:|
| max nodes in initial render | 200 |
| max edges in initial render | 600 |
| max expansion depth per click | 2 |
| max node label length | 48 characters |

### Required interactions

- pan
- zoom
- fit-to-screen
- filter by entity type
- expand node
- collapse node
- open inspector
- copy lineage path
- export SVG

If graph exceeds max size, BFF must return `truncated: true` and `nextExpansionHints`.


---

## 21. G44 G72 — SSE diagnostic and SSE channel catalog

```ts
export type SseEventType =
  | "job.started" | "job.progress" | "job.completed" | "job.failed"
  | "strategy.state_changed" | "strategy.alert_created"
  | "persona.policy_changed" | "persona.evaluation_completed"
  | "deployment.started" | "deployment.completed" | "deployment.failed" | "deployment.rollback_completed"
  | "risk.alert_created" | "risk.alert_updated"
  | "incident.created" | "incident.updated" | "incident.closed"
  | "tool.call_completed" | "mcp.call_failed" | "skill.sandbox_completed"
  | "rebalance.metrics_frozen" | "rebalance.ranking_calculated" | "rebalance.approved" | "rebalance.applied"
  | "handoff.created" | "handoff.accepted" | "handoff.rejected"
  | "notification.created" | "audit.event_created";

export interface SseEnvelope<T = unknown> {
  id: string;
  type: SseEventType;
  occurredAt: string;
  actor?: LinkedEntityRef;
  target?: LinkedEntityRef;
  payload: T;
}

export interface JobProgressPayload { jobId: string; percent: number; currentStep: string; messageKey?: string; }
export interface StrategyStateChangedPayload { strategyId: string; from: StrategyLifecycleStatus; to: StrategyLifecycleStatus; }
export interface AlertCreatedPayload { alertId: string; severity: "info" | "warning" | "critical"; target: LinkedEntityRef; }
export interface IncidentUpdatedPayload { incidentId: string; status: IncidentStatus; timelineEventId?: string; }
export interface HandoffCreatedPayload { handoffId: string; handoffType: AgoraHandoffType; destinationRoute: string; }
```

### SSE diagnostic endpoint

```http
GET /bff/events/diagnostics
```

Response:

```ts
export interface SseDiagnosticDTO {
  connected: boolean;
  lastEventAt?: string;
  subscribedChannels: SseEventType[];
  droppedEventsCount: number;
  reconnectCount: number;
  serverTime: string;
}
```


---

## 22. G45 G46 G47 — Empty / Loading / Error / Acceptance Criteria templates

### Page state templates

| State | Required UI |
|---|---|
| Empty table | title, explanation, primary setup action, secondary documentation link |
| Empty detail | entity not found message, back button, search action |
| Loading table | skeleton rows matching column count |
| Loading graph | centered spinner + node count placeholder |
| Loading long job | JobDrawer with progress state |
| Error query | localized error, retry button, copy request id |
| Error command | localized error, audit memo preserved, retry if retryable |

### Acceptance criteria template per page

Every page spec must include:

1. Route renders with mock BFF data.
2. Required primary table/cards are visible.
3. All availableActions render through PermissionAwareButton.
4. Empty/loading/error states are implemented.
5. i18n keys exist for zh-TW and en-US.
6. Realtime event refresh rule is defined.
7. At least one QA scenario covers the page.


---

## 23. G50 — Persona Ask Modes prompt scope

```ts
export type PersonaAskMode = "explain" | "critique" | "propose" | "red_team" | "summarize" | "compare";

export interface PersonaAskRequest {
  personaId: string;
  mode: PersonaAskMode;
  contextRefs: LinkedEntityRef[];
  userQuestion: string;
  responseLanguage: PersonaResponseLanguageMode;
  saveAsInsight: boolean;
}
```

### Prompt scope table

| mode | system scope | allowed output actions |
|---|---|---|
| explain | explain selected context, no new strategy proposal unless asked | save_note, create_insight |
| critique | identify risks, missing evidence, contradictions | create_research_task, create_insight |
| propose | propose next research step or strategy idea | create_strategy_proposal, create_research_task |
| red_team | adversarial review, focus on failure modes | create_review_question, create_risk_feedback |
| summarize | concise summary of selected context | save_note |
| compare | compare selected strategies/signals/notes | save_note, create_research_task |


---

## 24. G51 G58 — Committee template evidence pack schema

```ts
export interface EvidencePackDTO {
  id: string;
  title: string;
  target: LinkedEntityRef;
  evidenceItems: EvidenceItemDTO[];
  uploadedFiles: EvidenceFileDTO[];
  createdBy: LinkedEntityRef;
  createdAt: string;
}

export type EvidenceItemType =
  | "strategy_spec" | "experiment_result" | "artifact" | "signal" | "market_note"
  | "incident" | "postmortem" | "research_note" | "external_link";

export interface EvidenceItemDTO {
  id: string;
  type: EvidenceItemType;
  ref?: LinkedEntityRef;
  title: string;
  summary: string;
  url?: string;
}

export interface EvidenceFileDTO {
  id: string;
  fileName: string;
  mimeType: "application/pdf" | "text/markdown" | "text/plain" | "image/png" | "image/jpeg" | "application/json";
  sizeBytes: number;
  storageUrl: string;
  uploadedAt: string;
}

export const EVIDENCE_UPLOAD_LIMITS = {
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxFilesPerPack: 20,
  allowedMimeTypes: ["application/pdf", "text/markdown", "text/plain", "image/png", "image/jpeg", "application/json"]
} as const;
```

### Committee templates

| template | required evidence |
|---|---|
| strategy_review | strategy_spec, experiment_result, artifact |
| live_promotion | paper_deployment_metrics, risk_summary, rollback_target |
| incident_review | incident, runtime_logs, market_note, postmortem draft |
| signal_dispute | signal, similar_cases, trader_note, persona_response |


---

## 25. G53 G62 G63 — Trainer evaluation suite schema and publish gate

```ts
export type EvaluationSuiteType = "persona_behavior" | "risk_scenario" | "tool_use" | "memory_consistency" | "skill_execution";

export interface EvaluationSuiteDTO {
  id: string;
  type: EvaluationSuiteType;
  name: string;
  targetType: "persona" | "skill";
  cases: EvaluationCaseDTO[];
  passingScore: number; // 0-100
  requiredForPublish: boolean;
}

export interface EvaluationCaseDTO {
  id: string;
  input: string;
  expectedBehavior: string;
  prohibitedBehavior: string[];
  scoringRubric: Array<{ criterion: string; maxPoints: number }>;
}
```

### Ownership rule

- Trainer Studio uses suites where `targetType=persona`.
- Skill Coaching uses suites where `targetType=skill`.
- They share `EvaluationSuiteDTO` but are filtered by `targetType`.

### Publish gate

Persona or Skill publish is blocked unless all `requiredForPublish=true` suites have latest run score `>= passingScore`.


---

## 26. G54 G55 — Agora prohibited actions and role default route

### Agora prohibited actions

| Action | Behavior in Agora |
|---|---|
| promote_to_live | not shown; can create promotion request handoff only |
| apply_rebalance | not shown |
| rollback_live | not shown; can escalate alert to incident |
| emergency_kill | not shown |
| change_capital_allocation | not shown |
| grant_mcp_permission | request-only handoff |
| approve_skill | request-only handoff |
| change_route_policy | request-only handoff |

### Default route by role

| Role | Default route |
|---|---|
| Analyst | `/agora/daily` |
| Trader | `/agora/daily` |
| AI Trainer | `/agora/trainer` |
| Research Assistant | `/agora/notebook` |
| Observer | `/agora/markets` |


---

## 27. G56 — Daily Brief KPI formulas

### Daily Trading Cockpit KPI formulas

| KPI | Formula |
|---|---|
| Market Event Count | count(marketEvents where occurredAt within last 24h and severity >= medium) |
| Important Signal Count | count(signals where createdAt within last 24h and importanceScore >= 70) |
| Strategy Attention Count | count(strategies where openAlerts > 0 or signalDisagreementCount > 0 or paperLiveGap > threshold) |
| Watchlist Movement Count | count(watchlistItems where abs(dayReturn) >= user.watchlistMoveThreshold) |
| Persona Brief Count | count(personaBriefs where createdAt within current trading day) |
| Human Judgment Required Count | count(items where requiresHumanJudgment=true and status=open) |

`importanceScore` must be BFF-calculated using signal confidence, strategy risk, capital exposure, and recent volatility.


---

## 28. G57 G49 — Signal feedback endpoint, confidence scale, write behavior

```ts
export type SignalFeedbackType = "agree" | "disagree" | "flag_suspicious" | "needs_research" | "dismiss";

export interface SignalFeedbackRequest {
  signalId: string;
  strategyId: string;
  feedbackType: SignalFeedbackType;
  confidence: 1 | 2 | 3 | 4 | 5;
  rationale?: string;
  createResearchTask?: boolean;
}
```

Endpoint:

```http
POST /bff/agora/signals/{signalId}/feedback
```

### Write rule

- Each click writes immediately.
- If the same user submits feedback again within 30 minutes, BFF creates a revision, not a duplicate.
- `confidence` is fixed to 1–5.
- BFF must emit `handoff.created` if `createResearchTask=true`.


---

## 29. G59 — Notebook markdown extension spec

### Supported markdown extensions

| Extension | Enabled | Notes |
|---|---:|---|
| GitHub-flavored markdown | yes | tables, task lists, strikethrough |
| Math / KaTeX | yes | inline and block math |
| Mermaid | yes | rendered readonly; export as SVG |
| Embedded charts | yes | via linked chartRef, not raw JS |
| Inline citations | yes | `[[ref:entityType/entityId]]` |
| Raw HTML | no | sanitized and blocked |

### Note schema extension

```ts
export interface ResearchNoteBlockRef { blockId: string; refs: LinkedEntityRef[]; }
```


---

## 30. G60 — Persona Lab sandbox commit workflow

### Persona draft commit workflow

```text
sandbox_draft → evaluation_required → handoff_submitted → management_review → approved → published
```

```ts
export interface PersonaSandboxCommitRequest {
  personaDraftId: string;
  basePersonaId?: string;
  evaluationRunIds: string[];
  changeSummary: string;
  requestedRoutePolicyId?: string;
}
```

Endpoint:

```http
POST /bff/agora/persona-lab/{draftId}/actions/submit-commit
```

Response creates `AgoraHandoffDTO<TrainerFeedbackToPersonaUpdatePayload>`.


---

## 31. G64 — Channel detail fields

```ts
export type ChannelType = "web" | "telegram" | "discord" | "webhook";
export type ChannelStatus = "disabled" | "enabled" | "degraded";

export interface ChannelDTO {
  id: string;
  type: ChannelType;
  name: string;
  status: ChannelStatus;
  boundPersonaIds: string[];
  allowedUserRoles: string[];
  allowedActions: string[];
  retentionDays: number;
  auditEnabled: boolean;
  rateLimitPerMinute: number;
  lastMessageAt?: string;
  error?: string | null;
}
```


---

## 32. G69 — Agora Session / Message attachment and inline citation schema

```ts
export interface AgoraMessageDTO {
  id: string;
  sessionId: string;
  sender: LinkedEntityRef;
  role: "user" | "persona" | "system" | "trainer";
  content: string;
  language: LocaleCode;
  attachments: MessageAttachmentDTO[];
  citations: InlineCitationDTO[];
  annotations: MessageAnnotationDTO[];
  createdAt: string;
}

export interface MessageAttachmentDTO {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
  previewUrl?: string;
}

export interface InlineCitationDTO {
  id: string;
  label: string;
  ref: LinkedEntityRef;
  quote?: string;
  range?: { start: number; end: number };
}
```


---

## 33. G70 — Missing BFF endpoint definitions

### Required endpoints

```http
POST /bff/strategies/{strategyId}/dry-run
POST /bff/personas/{personaId}/test-prompt
POST /bff/skills/{skillId}/sandbox-eval
POST /bff/memory/{memoryId}/actions/quarantine
GET  /bff/audit/export?format=csv
```

### Request / response

```ts
export interface StrategyDryRunRequest { strategyId: string; specVersionId: string; fixtureId: string; }
export interface StrategyDryRunResponse { jobId: string; expectedDurationMs: number; }

export interface PersonaTestPromptRequest { personaId: string; prompt: string; contextRefs: LinkedEntityRef[]; responseLanguage: PersonaResponseLanguageMode; }
export interface PersonaTestPromptResponse { responseText: string; citations: InlineCitationDTO[]; safetyFlags: string[]; }

export interface QuarantineMemoryRequest { reason: string; linkedFeedbackId?: string; }
export interface QuarantineMemoryResponse { memoryId: string; status: "quarantined"; reviewTaskId: string; }
```


---

## 34. G71 — Accept-Language fallback chain

### Request priority

| Priority | Source |
|---:|---|
| 1 | explicit `?locale=` query parameter on preview / diagnostic endpoints |
| 2 | `X-Pantheon-Locale` header |
| 3 | user profile locale from auth session |
| 4 | `Accept-Language` header first supported locale |
| 5 | `zh-TW` |

### Supported locales

`zh-TW`, `en-US`. Unsupported locales must fallback to `zh-TW` and BFF must include `resolvedLocale` in the response envelope.


---

## 35. G75 G76 — Date/time and money display strategy

### Date / time

- BFF returns ISO 8601 UTC string.
- Frontend displays in user profile timezone.
- Default timezone: `Asia/Taipei`.
- Table compact format: `YYYY-MM-DD HH:mm`.
- Audit exact format: `YYYY-MM-DD HH:mm:ss z`.

### Money

```ts
export interface MoneyDTO { amount: string; currency: "USD" | "TWD" | "JPY" | "EUR"; }
```

Display precision:

| Currency | Precision |
|---|---:|
| USD | 2 |
| TWD | 0 |
| JPY | 0 |
| EUR | 2 |

Percent display: 2 decimal places by default, 4 decimal places in formula/debug views.


---

## 36. G77 — Review cc / observer fields

```ts
export interface ReviewParticipantDTO {
  userId: string;
  role: "requester" | "reviewer" | "approver" | "cc" | "observer";
  required: boolean;
  decision?: "approved" | "rejected" | "changes_requested" | null;
}

export interface ReviewRequestDTO {
  id: string;
  target: LinkedEntityRef;
  status: ReviewStatus;
  participants: ReviewParticipantDTO[];
  evidenceRefs: LinkedEntityRef[];
  decisionMemo?: string;
}
```

Observers can view and comment. CC participants receive notifications but cannot decide.


---

## 37. G79 — HighRiskConfirmationModal memo length limits

### Memo limits

| Action category | min chars | max chars | required |
|---|---:|---:|---:|
| live deployment / rollback / emergency kill | 20 | 2000 | yes |
| capital rebalance / allocation override | 20 | 2000 | yes |
| formula activation / rollback | 10 | 1500 | yes |
| persona policy / MCP / skill permission | 10 | 1500 | yes |
| non-high-risk confirmation | 0 | 1000 | no |

Frontend must preserve memo on command failure.


---

## 38. G82 — FormulaBuilder keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + S` | Save draft |
| `Ctrl/Cmd + Enter` | Run formula preview |
| `Ctrl/Cmd + Shift + C` | Compare with active formula |
| `Esc` | Close editor drawer if no unsaved changes |
| `Alt + ↑/↓` | Move selected metric row |

All shortcuts must be disabled while focus is inside code editor text selection mode unless explicitly supported by the editor.


---

## 39. G83 — Component namespacing

### Namespacing rule

Shared components live under `components/shared/*`. Product-specific components must be prefixed:

| Product | Prefix | Example |
|---|---|---|
| Management | `Management` | `ManagementMessageAuditPanel` |
| Agora | `Agora` | `AgoraMessageAnnotationBar` |
| Shared | no product prefix | `StatusBadge` |

`MessageAnnotationBar` is reserved for Agora only and must be named `AgoraMessageAnnotationBar`.


---

## 40. G84 — EventStreamPanel retain count

### Retention in UI

| Stream | Max retained events in memory | Older behavior |
|---|---:|---|
| global topbar stream | 100 | drop oldest |
| command center stream | 300 | drop oldest |
| entity detail stream | 200 | drop oldest |
| audit page | server paginated | no client cap besides current page |

EventStreamPanel must show `Showing latest N events` when capped.


---

## 41. G85 — Form / editor validation strategy

### Validation rules

- All forms must use schema validation before submit.
- BFF validation errors must map by field path.
- Client validation must not replace server validation.
- Dirty form navigation must show confirmation.
- Autosave is allowed only for notes and drafts, not high-risk configuration.

```ts
export interface FieldValidationErrorDTO { path: string; i18nKey: string; message: string; }
```


---

## 42. G87 G92 — Mock data schema alignment and naming convention

### Mock naming convention

| Entity | ID format |
|---|---|
| Strategy | `alpha_001` |
| Persona | `persona_001` |
| CapitalPool | `pool_001` |
| RankingFormula | `formula_001` |
| Rebalance | `rebalance_2026Q2_pool_001` |
| Experiment | `exp_001` |
| Job | `job_001` |
| Signal | `signal_001` |
| AgoraSession | `session_001` |

### Mock rule

Mock objects must satisfy Part 6 interfaces and include `availableActions: ActionDescriptor[]` for every Management entity that supports actions.


---

## 43. G88 G89 — Demo scenario × page acceptance mapping and phase × page table

### Demo scenario coverage

| Scenario | Required routes |
|---|---|
| A Strategy replicated → review → paper | `/management/strategies/:id`, `/management/governance/:id`, `/management/deployment` |
| B Live drawdown alert → incident → rollback | `/management/risk`, `/management/incidents/:id`, `/management/deployment` |
| C Quarterly ranking → rebalance | `/management/ranking`, `/management/rebalance/:id`, `/management/capital/:id` |
| D New persona → route policy → MCP/Skill permission | `/management/personas/:id`, `/management/mcp`, `/management/skills` |
| E Agora signal review → research task | `/agora/signals/:id`, `/agora/insights`, `/management/experiments` |
| F Skill draft → sandbox → approval | `/agora/skill-coaching`, `/management/skills`, `/management/governance/:id` |

### Build phases

| Phase | Pages |
|---|---|
| 1 | Shared shell, Management Command Center, Jobs, Audit |
| 2 | Strategies, Strategy Detail, Experiments |
| 3 | Personas, Capital, Ranking, Rebalance |
| 4 | Evolution, Governance, Deployment/Risk/Incidents |
| 5 | Tools, MCP, Skills, Artifacts/Lineage |
| 6 | Agora Daily, Signals, Notebook, Ask Personas, Committee |
| 7 | Agora Journal, Triage, Insights, Trainer, Memory, Skill Coaching |


---

## 44. G90 — Lovable prompt token budget

### Prompt budget

| Prompt type | Max tokens | Rule |
|---|---:|---|
| global shell prompt | 4,000 | app shell and routing only |
| page group prompt | 6,000 | one module at a time |
| component prompt | 3,000 | one component family at a time |
| remediation prompt | 5,000 | targeted patch only |

Do not paste the full spec into one Lovable message. Use the English build prompt plus the relevant Part file.


---

## 45. G91 — Dynamic route parameter schema

### Route param patterns

| Param | Pattern | Example |
|---|---|---|
| `strategyId` | `alpha_[0-9]{3,}` | `alpha_042` |
| `personaId` | `persona_[0-9]{3,}` | `persona_001` |
| `poolId` | `pool_[0-9]{3,}` | `pool_001` |
| `rebalanceId` | `rebalance_[0-9]{4}Q[1-4]_pool_[0-9]{3,}` | `rebalance_2026Q2_pool_001` |
| `experimentId` | `exp_[0-9]{3,}` | `exp_001` |
| `incidentId` | `incident_[0-9]{3,}` | `incident_001` |
| `sessionId` | `session_[0-9]{3,}` | `session_001` |

Invalid params must render entity not found state, not crash.


---

# Acceptance Criteria

1. G06–G12, G20–G27, G34–G47, G50–G55, G59–G65, G69–G77, G79–G85, G87–G92 must no longer be marked as future patch targets.
2. Lovable must update mock data, BFF stubs, SSE mock, permission-aware UI, job drawer, notification center, Agora handoff, skill sandbox, and committee evidence pack based on this document.
3. `Pantheon_Frontend_Build_Spec_v2_INDEX.md` gap counts must be corrected to H=28 / M=41 / L=23.
4. All new enums, DTOs, endpoints, and route param patterns must be integrated into the next consolidated Part 6 / Part 7 / Part 8 revision.
