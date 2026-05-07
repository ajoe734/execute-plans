import type { ActionDescriptor } from "@/lib/v3/availableActions";
import type { ActionDescriptor as ActionDescriptorV4 } from "@/lib/v4/actionDescriptor";
import type {
  StrategyLifecycleStatus, StrategyReviewStatus, StrategyDeploymentStatus,
  PersonaStatus,
} from "@/lib/v3/status";

// Pack D D40 — 5-tier risk severity (spec-conflict-G C1: `info` added).
export type RiskLevel = "info" | "low" | "medium" | "high" | "critical";
export const RISK_LEVELS: readonly RiskLevel[] = ["info", "low", "medium", "high", "critical"] as const;
export type LifecycleState = "draft" | "review" | "approved" | "deployed" | "paused" | "retired";
export type RunState = "pending" | "running" | "success" | "warning" | "failed" | "paused";

export interface BaseObject {
  id: string;
  name: string;
  owner: string;
  updatedAt: string;
  state: LifecycleState;
  risk: RiskLevel;
  /** i18n key for the object's display label (Part 6 contract). */
  labelKey?: string;
  /** Action ids the BFF declares are valid for the current state (Part 6 contract).
   *  RBAC further filters this to what the current role may actually invoke.
   *  Legacy string[] for back-compat; new code should consume `actionDescriptors`. */
  availableActions?: string[];
  /** v3 §8 — full action descriptors (typed, with blockers/roles/risk/endpoints). */
  actionDescriptors?: ActionDescriptor[];
  /** Pack C v4 §C014–C015 — normative ActionDescriptor (group/order/cooldown/idem). */
  actionDescriptorsV4?: ActionDescriptorV4[];
  /** Pack C v4 §C010 — optimistic-lock version (monotonic). Distinct from
   *  domain `version` strings (e.g. artifact semver) used by some subtypes. */
  lockVersion?: number;
  /** v3 §4 canonical Strategy status triple (only set on Strategy mocks). */
  lifecycleStatus?: StrategyLifecycleStatus | PersonaStatus | string;
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
}

export interface CapitalPool extends BaseObject {
  currency: "USD" | "USDT" | "TWD";
  allocated: number;
  utilized: number;
  riskBudget: number;
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
  cpu: number; // 0..1
  memory: number; // 0..1
  latencyP95Ms: number;
  uptimePct: number;
  region: string;
  updatedAt: string;
}

export interface EvolutionProgram extends BaseObject {
  generation: number;
  population: number;
  bestFitness: number;
  parentAlpha: string;
  progress: number; // 0..1
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

/** Phase 17 — multi-stage approval workflow.
 *  A stage represents one reviewer role (proposer → reviewer → committee → executor).
 *  Each stage owns its own SLA + decision; the parent request advances to the next
 *  pending stage automatically and finalises when the last stage is approved. */
export interface ApprovalStage {
  /** Stage role id, e.g. "proposer", "risk", "capital", "ops", "committee", "executor". */
  name: string;
  state: "pending" | "approved" | "rejected" | "skipped";
  /** SLA budget for this stage in hours. */
  slaHours: number;
  /** When this stage opened for review (set when previous stage cleared). */
  startedAt?: string;
  decidedBy?: string;
  decidedAt?: string;
  memo?: string;
  /** Set true once the stage has been auto-escalated past its SLA. */
  escalated?: boolean;
  /** Optional: which role to escalate to. Falls back to "committee". */
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
  /** Legacy flat-string stage list (kept for back-compat display). */
  requiresStages?: string[];
  /** Phase 17 — structured stage records with SLA + per-stage decisions. */
  stages?: ApprovalStage[];
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  ts: string;
  memo?: string;
  /** Phase 15 — full trail. Snapshot of the entity prior to the action (JSON). */
  before?: string;
  /** Phase 15 — full trail. Snapshot of the entity after the action (JSON). */
  after?: string;
  /** Phase 15 — outcome of the mutation; "rejected" written when guard blocked it. */
  outcome?: "ok" | "rejected";
  /** Pack D D60 / VI-2 — correlationId chain id stamped by the v1 mutations seam. */
  correlationId?: string;
  /** VI-2 — idempotency key (when caller supplied one or the seam minted one). */
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

// ----- Phase 9: governance / studio surfaces -----

export type RouteTargetKind = "tool" | "mcp" | "skill";

export interface RoutePolicyRule {
  id: string;
  intent: string;            // "research", "execute_order", "summarize", ...
  targetKind: RouteTargetKind;
  targetId: string;          // tl_*/mcp_*/sk_*
  envScope: ("research" | "paper" | "live")[];
  priority: number;          // lower = first
  guard?: string;            // optional natural-language constraint
}

export interface RoutePolicy extends BaseObject {
  personaId: string;
  version: string;           // v1, v2
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
  rowId: string;             // persona id
  colId: string;             // tool/mcp/skill/action id
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
  fromPersonaId: string;        // requester
  toPersonaId: string;          // consultee
  trigger: string;              // e.g. "risk>high" or "intent=hedge_decision"
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
  conflictWith?: string;     // memoryUpdate id
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
  expression: string;        // e.g. 0.6*sharpe - 0.3*|dd| + 0.1*capacity
  metrics: string[];         // referenced metric ids
  appliedTo: number;
}

export interface MutationRule extends BaseObject {
  scope: "param" | "structure" | "feature";
  expression: string;
  rateBps: number;           // mutation rate in basis points
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

// ----- Phase 13: Detail tab depth -----

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
  score: number;            // 0..1
  pass: boolean;
  ranAt: string;
  trend: number[];          // last n scores
}

export interface ObjectVersion {
  id: string;
  subjectKind: "Persona" | "Strategy" | "Skill" | "RoutePolicy" | "Artifact";
  subjectId: string;
  version: string;
  author: string;
  createdAt: string;
  note?: string;
  spec: Record<string, unknown>;   // free-form snapshot
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
  cap: number;            // 0..1
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
