// Shared type contracts (subset of Part 6 BFF API)

export type RiskLevel = "low" | "medium" | "high" | "critical";
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
   *  RBAC further filters this to what the current role may actually invoke. */
  availableActions?: string[];
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
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  ts: string;
  memo?: string;
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
