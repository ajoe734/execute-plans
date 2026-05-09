// Pack E — v5 closed-loop view-model types.
// Canonical decisions Q1–Q28 from .lovable/feedback/2026-05-06-E/Pack_E_Disposition.csv.

import type {
  LoopKind, LoopStatus, LoopStageStatus, HealthStatus, AutonomyMode,
  RemediationMode, InterventionSeverity, SentinelFindingStatus,
  SentinelSeverity, InterventionSource, InterventionDecision,
} from "./enums";

// ---------- Evidence ----------

export type EvidenceKind =
  | "alert" | "incident" | "job" | "audit" | "metric"
  | "strategy" | "persona" | "deployment" | "runtime" | "policy" | "approval";

export interface EvidenceRef {
  kind: EvidenceKind;
  id: string;
  /** Q28 — embed snapshot for synthetic metrics so v5 needs no separate evidence store. */
  snapshot?: { value?: number | string; ts?: string; label?: string };
}

// ---------- LoopStage / LoopRun ----------

export interface LoopStage {
  id: string;
  name: string;
  status: LoopStageStatus;
  startedAt?: string;
  completedAt?: string;
  /** Q12 — v0-mock UI-only timeout policy; not domain truth. */
  timeoutPolicySource?: "v0-mock" | "backend";
  timeoutMs?: number;
  warnAfterMs?: number;
}

export interface LoopRunNextAction {
  kind: "automatic" | "awaiting_approval" | "awaiting_human_decision" | "none";
  label?: string;
  etaMs?: number;
}

export interface LoopRun {
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
  nextAction?: LoopRunNextAction;
  evidence?: EvidenceRef[];
}

// ---------- Persona / Strategy execution health ----------

export interface PersonaHealthInputs {
  performance: number;        // 0..100
  risk: number;               // 0..100
  executionQuality: number;   // 0..100
  decisionQuality: number;    // 0..100
  policyCompliance: number;   // 0..100
  sentinelPenalty: number;    // 0..100 (penalty subtracted via weight)
}

export interface PersonaExecutionHealth {
  personaId: string;
  personaName: string;
  mode: AutonomyMode;                // Q4 canonical
  status: HealthStatus;
  score: number;                     // 0..100
  formulaVersion: "v0-mock";         // Q25
  inputs: PersonaHealthInputs;
  /** Optional reason if mode = suspended (Q4 — prefer reason field, not more enums). */
  suspendedReason?: string;
  routedStrategies: number;
  openFindings: number;
  updatedAt: string;
}

export interface StrategyHealthInputs {
  performance: number;
  risk: number;
  executionQuality: number;
  lifecycleConsistency: number;
  sentinelIncidentPenalty: number;
}

export interface StrategyExecutionHealth {
  strategyId: string;
  strategyName: string;
  status: HealthStatus;
  score: number;
  formulaVersion: "v0-mock";
  inputs: StrategyHealthInputs;
  pnl30d: number;
  drawdown: number;
  openFindings: number;
  updatedAt: string;
}

// ---------- Optimization ----------

export interface OptimizationRun {
  id: string;
  programId: string;
  programName: string;
  status: LoopStatus;
  generation: number;
  population: number;
  bestFitness: number;
  progress: number; // 0..1
  startedAt: string;
  updatedAt: string;
}

// ---------- Sentinel ----------

export interface SentinelFinding {
  id: string;
  status: SentinelFindingStatus;     // Q5
  severity: SentinelSeverity;
  confidence: number;                 // 0..1 (Q9 derivation)
  title: string;
  summary: string;
  source: "alert" | "incident" | "job" | "runtime" | "persona-health" | "policy";
  detectedAt: string;
  updatedAt: string;
  blastRadius: { strategies?: string[]; personas?: string[]; pools?: string[]; deployments?: string[] };
  evidence: EvidenceRef[];
  recommendedActionIds: string[];
  /** Q5 — optional supersession pointer if status moved to dismissed/resolved. */
  supersededByFindingId?: string;
}

// ---------- Remediation ----------

export interface RemediationAction {
  id: string;
  /** Catalogue id, e.g. "reduce_allocation". */
  kind: string;
  mode: RemediationMode;             // Q6
  label: string;
  description?: string;
  /** Q13 — role-based gating is canonical; capability-based gating waits on Permission Contract backport (A2) → EVIDENCE_CAPABILITY_MAP. No FE action. */
  requiredRoles: string[];
  requiredCapabilities?: string[];
  requiresHumanApproval: boolean;
  targetKind?: "strategy" | "persona" | "pool" | "deployment" | "runtime" | "policy";
  targetId?: string;
  /** Q24 — emergency_override always requires HighRiskConfirm. */
  requiresHighRiskConfirm: boolean;
}

// ---------- Human Intervention Queue ----------

export interface InterventionItem {
  id: string;
  source: InterventionSource;        // Q11 unified queue source
  severity: InterventionSeverity;
  title: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
  dueAt?: string;
  /** Q7 — SD fields. */
  requiredRoles: string[];
  requiredCapabilities?: string[];
  linkedApprovalId?: string;
  linkedFindingId?: string;
  linkedIncidentId?: string;
  /** Q7 — renamed from `recommendation`. */
  recommendedDecision?: InterventionDecision;
  allowedDecisions: InterventionDecision[];
  /** Q7 — restored optional evidenceRefs (non-Sentinel sources). */
  evidenceRefs?: EvidenceRef[];
  /** Q7 — DERIVED, never persisted: from allowedDecisions + requiredRoles + source. */
  modifyAllowed?: boolean;
}

// ---------- Control Room ----------

export interface ControlRoomKpi {
  loopsRunning: number;
  loopsBlocked: number;
  openFindings: number;
  criticalFindings: number;
  pendingInterventions: number;
  personasHealthy: number;
  personasDegraded: number;
  strategiesHealthy: number;
  strategiesDegraded: number;
}

/** Q14 — minimal mock session context; do NOT depend on /bff/me until D59 lands. */
export interface V5SessionContext {
  tenantId: string;
  env: string;
  locale: string;
  serverTime: string;
}

export interface ControlRoomSummary {
  generatedAt: string;
  session: V5SessionContext;
  kpi: ControlRoomKpi;
  topFindings: SentinelFinding[];
  topInterventions: InterventionItem[];
  loopRuns: LoopRun[];
}
