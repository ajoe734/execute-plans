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
}

export interface Incident {
  id: string;
  severity: RiskLevel;
  title: string;
  status: "open" | "mitigating" | "resolved";
  openedAt: string;
}

export interface ApprovalRequest {
  id: string;
  kind: string;
  subject: string;
  requester: string;
  state: "pending" | "approved" | "rejected";
  riskLevel: RiskLevel;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  ts: string;
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
