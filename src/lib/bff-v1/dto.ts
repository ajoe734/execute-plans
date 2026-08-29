import type { ErrorCode as V4ErrorCode } from "../v4/errorCodes";
import type { ActionDescriptor } from "@/lib/v3/availableActions";
import type { ActionDescriptor as ActionDescriptorV4 } from "@/lib/v4/actionDescriptor";
import type {
  StrategyLifecycleStatus,
  StrategyReviewStatus,
  StrategyDeploymentStatus,
  PersonaStatus as LegacyPersonaStatus,
} from "@/lib/v3/status";

// ---------- Section 2: Envelopes ----------

export interface ListEnvelope<T> {
  items: T[];
  cursor: { next?: string; prev?: string };
  pageSize: number;
  estimatedTotal?: number;
  totalCountExact: boolean;
  meta?: unknown;
}

/** Shared Management envelope state used by console and data-source reads. */
export interface ManagementSurfaceState {
  status: string;
  source?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * Canonical metadata shape for Management list/detail envelopes.
 *
 * This lives in the lower-level DTO module so domain clients can share the
 * contract without importing one another and recreating a type-only cycle.
 */
export interface ManagementListMeta {
  status?: string;
  source?: string;
  snapshot_at?: string;
  snapshotAt?: string;
  surfaces?: Record<string, ManagementSurfaceState>;
  [key: string]: unknown;
}

/** C.2 / Section 2.2 — `data` is REQUIRED. Use CommandResponse<null> when no payload. */
export interface CommandResponse<T> {
  ok: true;
  data: T;
  auditEventId?: string;
  correlationId: string;
  idempotencyKey?: string;
  replayed?: boolean;
  lockVersion?: number;
  message?: string;
}

export interface BulkActionResponse<T> {
  ok: boolean;
  partial: boolean;
  summary: { requested: number; succeeded: number; failed: number };
  results: Array<{ id: string; ok: boolean; data?: T; error?: BffErrorPayload }>;
}

// ---------- Section 3: Errors (re-exported from errors.ts for convenience) ----------

/** v1 ErrorCode union — now identical to v4 ERROR_CODES superset (H2 closed). */
export type ErrorCode = V4ErrorCode;

export interface ErrorDetails {
  field?: string;
  reason?: string;
  requires_confirm_token?: boolean;
  requires_approval?: boolean;
  requires_two_man?: boolean;
  approvalId?: string;
  jobId?: string;
  retryAfterMs?: number;
  [k: string]: unknown;
}

export interface BffErrorPayload {
  code: ErrorCode;
  i18nKey: string;
  message: string;
  retryable: boolean;
  userActionable: boolean;
  correlationId: string;
  cause?: string;
  details?: ErrorDetails;
}

export interface BffErrorEnvelope {
  error: BffErrorPayload;
}

// ---------- Section: Action command (A1 — named ActionCommandStatus) ----------

/** Planner Response §A1 (2026-05-07) — canonical named enum.
 * OpenAPI: components.schemas.ActionCommandStatus. */
export const ACTION_COMMAND_STATUSES = ["accepted", "queued", "completed"] as const;
export type ActionCommandStatus = (typeof ACTION_COMMAND_STATUSES)[number];

export function isActionCommandStatus(v: unknown): v is ActionCommandStatus {
  return typeof v === "string" && (ACTION_COMMAND_STATUSES as readonly string[]).includes(v);
}

export interface ActionCommandResponseData {
  actionId: string;
  status: ActionCommandStatus;
  /** Present iff status='accepted' AND requires human approval gate. */
  approvalId?: string;
  /** Present iff status='queued'. */
  jobId?: string;
}

// ---------- Section 9: Capability / Redaction ----------
// Planner Stage 2 Audit (2026-05-08) §1 — three-layer EvidenceKind:
//   - CanonicalEvidenceKind (19): backend BFF v1 SHOULD emit only these.
//   - LegacyEvidenceKindAlias (3): snapshot / rebalance / experiment — FE accepts
//     for legacy seed / v0-mock / old audit entries; backend should NOT emit.
//   - EvidenceKind = union of the two (22 accepted at FE).

export type CanonicalEvidenceKind =
  // Pack D-B planner canonical 15
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
  | "postmortem"
  // v5 closed-loop additions (4) — accepted into canonical per planner §1.2
  | "loop_run"
  | "sentinel_finding"
  | "intervention"
  | "ask_session";

export type LegacyEvidenceKindAlias = "snapshot" | "rebalance" | "experiment";

export type EvidenceKind = CanonicalEvidenceKind | LegacyEvidenceKindAlias;

export const CANONICAL_EVIDENCE_KINDS: readonly CanonicalEvidenceKind[] = [
  "alert", "incident", "job", "audit", "metric", "strategy", "persona",
  "deployment", "runtime", "policy", "approval", "artifact", "signal",
  "journal", "postmortem",
  "loop_run", "sentinel_finding", "intervention", "ask_session",
] as const;

export const LEGACY_EVIDENCE_KIND_ALIASES: readonly LegacyEvidenceKindAlias[] = [
  "snapshot", "rebalance", "experiment",
] as const;

export function isLegacyEvidenceKind(kind: EvidenceKind): kind is LegacyEvidenceKindAlias {
  return (LEGACY_EVIDENCE_KIND_ALIASES as readonly string[]).includes(kind);
}

export function isCanonicalEvidenceKind(kind: EvidenceKind): kind is CanonicalEvidenceKind {
  return (CANONICAL_EVIDENCE_KINDS as readonly string[]).includes(kind);
}

/** Planner §1.5 — capability gate per evidence kind (canonical 19 + 3 legacy aliases). */
export const EVIDENCE_CAPABILITY_MAP: Readonly<Record<EvidenceKind, string>> = {
  // canonical 19
  alert: "risk.alert.read",
  incident: "risk.incident.read",
  job: "job.read",
  audit: "audit.read",
  metric: "metric.read",
  strategy: "strategy.view",
  persona: "persona.view",
  deployment: "deployment.read",
  runtime: "runtime.read",
  policy: "policy.read",
  approval: "approval.read",
  artifact: "artifact.read",
  signal: "agora.signal.read",
  journal: "agora.journal.read",
  postmortem: "postmortem.read",
  loop_run: "loop.read",
  sentinel_finding: "sentinel.read",
  intervention: "intervention.read",
  ask_session: "agora.ask",
  // legacy aliases (FE-only acceptance)
  snapshot: "artifact.read",       // legacy alias — backend should emit `artifact`
  rebalance: "rebalance.read",     // legacy alias
  experiment: "research.read",     // legacy alias
};

/** Planner Stage 2 Audit §2.3 — backend canonical reason codes. */
export type RedactionReasonCode =
  | "INSUFFICIENT_CAPABILITY"
  | "TENANT_SCOPE_MISMATCH"
  | "POLICY_REDACTED";

/** Planner Stage 2 Audit §2.3 — backend-facing canonical RedactedEvidenceRef. */
export interface CanonicalRedactedEvidenceRef {
  id: string;
  kind: EvidenceKind;
  redacted: true;
  redactionReasonCode: RedactionReasonCode;
  requiredCapability?: string;
}

/** FE-facing RedactedEvidenceRef.
 *  `redactionReasonCode` + `requiredCapability` are backend canonical (planner §2.3).
 *  `reason` + `capabilityRequired` are FE legacy aliases for richer UI text and
 *  backward compatibility; normalize via `normalizeRedactedEvidenceRef()`.
 */
export interface RedactedEvidenceRef {
  kind: EvidenceKind;
  id: string;
  redacted: true;
  /** FE legacy alias — see normalizer mapping in §2.4. */
  reason?: "PERMISSION_DENIED" | "CAPABILITY_MISSING" | "TENANT_SCOPE_MISMATCH";
  /** Backend canonical reason code. */
  redactionReasonCode?: RedactionReasonCode;
  /** FE legacy alias for `requiredCapability`. */
  capabilityRequired?: string;
  /** Backend canonical capability requirement. */
  requiredCapability?: string;
}

/** Planner Stage 2 Audit §2.5 — normalize FE alias fields to backend canonical. */
export function normalizeRedactedEvidenceRef(input: RedactedEvidenceRef): CanonicalRedactedEvidenceRef {
  const code: RedactionReasonCode =
    input.redactionReasonCode ??
    (input.reason === "TENANT_SCOPE_MISMATCH"
      ? "TENANT_SCOPE_MISMATCH"
      : "INSUFFICIENT_CAPABILITY");
  return {
    id: input.id,
    kind: input.kind,
    redacted: true,
    redactionReasonCode: code,
    requiredCapability: input.requiredCapability ?? input.capabilityRequired,
  };
}

// ---------- Section 5: Status enums (canonical) ----------

export type StrategyStatus =
  | "draft" | "sandbox" | "active" | "probation" | "restricted" | "suspended" | "retired" | "archived";

export type CapitalPoolStatus =
  | "draft" | "active" | "frozen" | "rebalancing" | "restricted" | "retired";

export type PersonaStatus =
  | "draft" | "testing" | "approved" | "active" | "deprecated" | "retired";

export type RebalanceStatus =
  | "draft" | "metrics_freezing" | "metrics_frozen" | "ranking_calculated"
  | "simulation_ready" | "under_review" | "approved" | "scheduled"
  | "applied" | "rolled_back" | "cancelled";

export type DeploymentStatus =
  | "draft" | "submitted" | "under_review" | "approved" | "scheduled"
  | "deploying" | "deployed" | "failed" | "rolled_back" | "cancelled";

export type EvolutionProgramStatus =
  | "draft" | "active" | "paused" | "under_review" | "completed" | "retired";

export type JobStatus = "queued" | "running" | "review" | "concluded" | "failed";

export type IncidentStatus = "open" | "mitigating" | "resolved";

export type ApprovalStatus =
  | "queued" | "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled" | "retrying";

// ---------- Section 7: v5 Closed-Loop ----------

export type LoopStageStatus =
  | "pending" | "running" | "succeeded" | "failed" | "skipped" | "blocked";

export type LoopStatus =
  | "queued" | "running" | "succeeded" | "failed" | "cancelled" | "awaiting_intervention";

export type SentinelHealth = "healthy" | "watch" | "degraded" | "critical";

export type InterventionStatus =
  | "open" | "acknowledged" | "action_pending" | "mitigating" | "resolved" | "dismissed";

export type InterventionSource =
  | "approval" | "sentinel" | "incident" | "policy_exception" | "emergency_review";

// ---------- Section 10: Domain Contracts ----------

export type RiskLevel = "info" | "low" | "medium" | "high" | "critical";
export const RISK_LEVELS: readonly RiskLevel[] = ["info", "low", "medium", "high", "critical"] as const;
export type LifecycleState = "draft" | "review" | "approved" | "deployed" | "paused" | "retired";
export type RunState = "pending" | "running" | "success" | "warning" | "failed" | "paused" | "active";

export interface BaseObject {
  id: string;
  name: string;
  owner: string;
  updatedAt: string;
  state: LifecycleState;
  risk: RiskLevel;
  labelKey?: string;
  availableActions?: string[];
  actionDescriptors?: ActionDescriptor[];
  actionDescriptorsV4?: ActionDescriptorV4[];
  lockVersion?: number;
  lifecycleStatus?: StrategyLifecycleStatus | LegacyPersonaStatus | string;
  reviewStatus?: StrategyReviewStatus | string;
  deploymentStatus?: StrategyDeploymentStatus | string;
}

export interface Strategy extends BaseObject {
  alpha: string;
  capitalPoolId: string;
  personaIds: string[];
  pnl30d: number;
  sharpe: number;
  drawdown: number;
}

export interface Persona extends BaseObject {
  archetype: string;
  routedStrategies: number;
  successRate: number;
  mandate?: string;
  strategyFamily?: string;
  traits?: {
    instruments?: string;
    risk_appetite?: string;
    decision_style?: string;
    time_horizon?: string;
    hard_rules?: string;
    persona_voice?: string;
  };
}

export interface CapitalPool extends BaseObject {
  currency: "USD" | "USDT" | "TWD" | string;
  allocated: number;
  utilized: number;
  riskBudget: number;
  poolId?: string;
  pool_id?: string;
  status?: string;
  riskPolicyRef?: string;
  risk_policy_ref?: string;
  bindings?: Array<Record<string, unknown>>;
  bindingCount?: number;
  summary?: string;
}

export interface RankingFormula extends BaseObject {
  expression: string;
  appliedTo: number;
}

export interface RebalanceLine {
  strategyId: string;
  strategyName: string;
  currentWeight: number;
  proposedWeight: number;
  delta: number;
}

export interface Rebalance extends BaseObject {
  quarter: string;
  targetPoolId: string;
  proposedDelta: number;
  lines?: RebalanceLine[];
  expectedSharpe?: number;
  expectedDrawdown?: number;
  notes?: string;
}

export interface Deployment extends BaseObject {
  target: "research" | "paper" | "live";
  artifactId: string;
  version: string;
  previousVersion?: string;
  strategyId?: string;
  promotedAt?: string;
  rollbackAvailable?: boolean;
}

export interface Runtime {
  id: string;
  name: string;
  kind: "executor" | "mcp" | "scheduler" | "ingest";
  env: "research" | "paper" | "live";
  status: RunState;
  cpu: number;
  memory: number;
  latencyP95Ms: number;
  uptimePct: number;
  region: string;
  updatedAt: string;
  runtimeId?: string;
  runtime_id?: string;
  runtimeBindingId?: string;
  runtime_binding_id?: string;
  personaId?: string;
  persona_id?: string;
  artifactId?: string;
  artifact_id?: string;
  planId?: string;
  plan_id?: string;
}

export interface EvolutionProgram extends BaseObject {
  generation: number;
  population: number;
  bestFitness: number;
  parentAlpha: string;
  progress: number;
}

export interface ResearchExperiment extends BaseObject {
  hypothesis: string;
  status: "queued" | "running" | "review" | "concluded";
  metric: string;
  metricValue: number;
  artifactId?: string;
}

export interface Artifact extends BaseObject {
  kind: "model" | "dataset" | "report" | "container";
  version: string;
  sourceExperimentId?: string;
  sizeMb: number;
  hash: string;
}

export interface Job {
  id: string;
  kind: string;
  status: RunState;
  startedAt: string;
  durationMs?: number;
  owner: string;
}

export interface Alert {
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
}

export interface Incident {
  id: string;
  severity: RiskLevel;
  title: string;
  status: "open" | "mitigating" | "resolved";
  openedAt: string;
  description?: string;
  affected?: string[];
  commander?: string;
  timeline?: { ts: string; actor: string; note: string }[];
}

export interface ApprovalStage {
  name: string;
  state: "pending" | "approved" | "rejected" | "skipped";
  slaHours: number;
  startedAt?: string;
  decidedBy?: string;
  decidedAt?: string;
  memo?: string;
  escalated?: boolean;
  escalateTo?: string;
}

export interface ApprovalRequest {
  id: string;
  kind: string;
  subject: string;
  requester: string;
  state: "pending" | "approved" | "rejected";
  riskLevel: RiskLevel;
  createdAt: string;
  rationale?: string;
  diffSummary?: string;
  requiresStages?: string[];
  stages?: ApprovalStage[];
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  ts: string;
  memo?: string;
  before?: string;
  after?: string;
  outcome?: "ok" | "rejected";
  correlationId?: string;
  idempotencyKey?: string;
}

export interface SearchResult {
  id: string;
  type: string;
  name: string;
  state: string;
  owner: string;
  risk: RiskLevel;
  updatedAt: string;
}

export interface Tool extends BaseObject {
  category: "data" | "execution" | "research" | "communication" | "analysis";
  version: string;
  inputs: number;
  description: string;
  usedBy: number;
}

export interface McpServer extends BaseObject {
  endpoint: string;
  region: string;
  toolCount: number;
  envAllowed: ("research" | "paper" | "live")[];
  health: RunState;
}

export interface McpTool extends BaseObject {
  serverId: string;
  description: string;
  scope: "read" | "write" | "destructive";
  envGrants: ("research" | "paper" | "live")[];
  callsLast24h: number;
}

export interface Skill extends BaseObject {
  version: string;
  archetype: string;
  description: string;
  draft: boolean;
  publishedAt?: string;
  evalScore?: number;
  usedByPersonas: number;
}

export interface Channel extends BaseObject {
  kind: "slack" | "email" | "webhook" | "chat";
  destination: string;
  subscribers: number;
  filters?: string;
}

export type RouteTargetKind = "tool" | "mcp" | "skill";

export interface RoutePolicyRule {
  id: string;
  intent: string;
  targetKind: RouteTargetKind;
  targetId: string;
  envScope: ("research" | "paper" | "live")[];
  priority: number;
  guard?: string;
}

export interface RoutePolicy extends BaseObject {
  personaId: string;
  version: string;
  rules: RoutePolicyRule[];
  publishedAt?: string;
}

export interface PolicyVersion {
  id: string;
  policyId: string;
  version: string;
  rules: RoutePolicyRule[];
  author: string;
  createdAt: string;
  note?: string;
}

export type PermissionInstance = "persona-tool" | "persona-mcp" | "persona-skill" | "persona-lifecycle";
export type PermissionGrant = "none" | "read" | "use" | "manage";

export interface PermissionCell {
  rowId: string;
  colId: string;
  grant: PermissionGrant;
  envScope?: ("research" | "paper" | "live")[];
  updatedBy?: string;
  updatedAt?: string;
}

export interface PermissionMatrix {
  instance: PermissionInstance;
  rows: { id: string; label: string }[];
  cols: { id: string; label: string; risk?: RiskLevel }[];
  cells: PermissionCell[];
}

export interface ConsultRule {
  id: string;
  name: string;
  fromPersonaId: string;
  toPersonaId: string;
  trigger: string;
  mode: "advisory" | "blocking" | "ack";
  envScope: ("research" | "paper" | "live")[];
  enabled: boolean;
  owner: string;
  updatedAt: string;
}

export interface MemoryUpdate {
  id: string;
  personaId: string;
  kind: "fact" | "preference" | "skill_pref" | "redaction";
  source: "operator" | "signal_feedback" | "decision_log" | "evaluation";
  proposedBy: string;
  proposedAt: string;
  state: "queued" | "approved" | "rejected" | "merged" | "conflict";
  before?: string;
  after: string;
  conflictWith?: string;
}

export interface EvolutionRun {
  id: string;
  programId: string;
  generation: number;
  startedAt: string;
  finishedAt?: string;
  status: RunState;
  bestFitness: number;
  candidates: number;
}

export interface EvolutionCandidate {
  id: string;
  runId: string;
  fitness: number;
  parents: string[];
  mutationsApplied: string[];
  state: "scored" | "promoted" | "discarded";
}

export interface FitnessFormula extends BaseObject {
  expression: string;
  metrics: string[];
  appliedTo: number;
}

export interface MutationRule extends BaseObject {
  scope: "param" | "structure" | "feature";
  expression: string;
  rateBps: number;
  enabled: boolean;
}

export interface AllocationSimulation {
  id: string;
  rebalanceId: string;
  weights: { strategyId: string; weight: number }[];
  expectedSharpe: number;
  expectedDrawdown: number;
  capacityUsed: number;
  createdAt: string;
}

export interface PolicyViolation {
  id: string;
  subjectKind: "Persona" | "Strategy";
  subjectId: string;
  policyId: string;
  policyName: string;
  severity: RiskLevel;
  ts: string;
  state: "open" | "acknowledged" | "resolved";
  description: string;
  resolvedBy?: string;
}

export interface EvaluationRun {
  id: string;
  subjectKind: "Persona" | "Skill" | "Strategy";
  subjectId: string;
  suite: string;
  score: number;
  pass: boolean;
  ranAt: string;
  trend: number[];
}

export interface ObjectVersion {
  id: string;
  subjectKind: "Persona" | "Strategy" | "Skill" | "RoutePolicy" | "Artifact";
  subjectId: string;
  version: string;
  author: string;
  createdAt: string;
  note?: string;
  spec: Record<string, unknown>;
}

export interface FeatureSet {
  id: string;
  strategyId: string;
  name: string;
  upstreamDataset: string;
  freshnessMin: number;
  missingPct: number;
  owner: string;
}

export interface PerformancePoint {
  ts: string;
  pnl: number;
  benchmark: number;
}

export interface PerformanceSeries {
  strategyId: string;
  granularity: "day" | "week" | "month";
  points: PerformancePoint[];
}

export interface Watcher {
  id: string;
  subjectKind: "Strategy" | "Persona" | "CapitalPool";
  subjectId: string;
  user: string;
  since: string;
}

export interface DecisionJournalEntry {
  id: string;
  subjectKind: string;
  subjectId: string;
  title: string;
  decidedAt: string;
  decidedBy: string;
  outcome?: "pending" | "good" | "neutral" | "bad";
}

export interface AllocationLimit {
  id: string;
  poolId: string;
  scope: "strategy" | "sector";
  scopeRef: string;
  cap: number;
  updatedBy: string;
  updatedAt: string;
}

export interface PoolFreeze {
  id: string;
  poolId: string;
  reason: string;
  frozenBy: string;
  frozenAt: string;
  active: boolean;
}

export interface WorkflowStep {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "complete" | "blocked" | "skipped";
  actor?: string;
  ts?: string;
  note?: string;
}

export interface DeploymentStage {
  id: string;
  deploymentId: string;
  env: "research" | "paper" | "canary" | "live";
  status: "pending" | "in_progress" | "complete" | "blocked";
  promotedAt?: string;
  health?: "ok" | "warn" | "down";
}

export interface McpSecret {
  id: string;
  serverId: string;
  name: string;
  lastRotatedAt: string;
  rotatedBy: string;
}

export interface PromotionRecord {
  id: string;
  programId: string;
  candidateId: string;
  target: "paper" | "live";
  promotedAt: string;
  promotedBy: string;
  deltaSharpe: number;
  deltaDrawdown: number;
}

export interface MetricFreeze {
  id: string;
  rebalanceId: string;
  metric: string;
  frozen: boolean;
  frozenAt?: string;
  frozenBy?: string;
}

export interface RebalanceOverride {
  id: string;
  rebalanceId: string;
  strategyId: string;
  delta: number;
  reason: string;
  state: "draft" | "review" | "approved";
  proposedBy: string;
  proposedAt: string;
}
