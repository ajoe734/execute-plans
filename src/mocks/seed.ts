import type {
  Strategy, Persona, CapitalPool, RankingFormula, Rebalance,
  Deployment, Job, Alert, Incident, ApprovalRequest, AuditEvent,
  EvolutionProgram, ResearchExperiment, Artifact,
} from "@/lib/bff/types";

const now = () => new Date().toISOString();
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export const strategies: Strategy[] = [
  { id: "stg_001", name: "Momentum Quant Alpha", alpha: "alpha_mq_v3", capitalPoolId: "cp_alpha", personaIds: ["per_quant", "per_risk"], owner: "alice", updatedAt: ago(2), state: "deployed", risk: "medium", pnl30d: 0.082, sharpe: 1.7, drawdown: -0.045 },
  { id: "stg_002", name: "Cross-Sector Mean Reversion", alpha: "alpha_msr_v1", capitalPoolId: "cp_beta", personaIds: ["per_macro"], owner: "bob", updatedAt: ago(5), state: "review", risk: "high", pnl30d: 0.031, sharpe: 0.9, drawdown: -0.082 },
  { id: "stg_003", name: "Asia Tech Long-Short", alpha: "alpha_atls_v2", capitalPoolId: "cp_alpha", personaIds: ["per_quant"], owner: "carol", updatedAt: ago(12), state: "deployed", risk: "low", pnl30d: 0.052, sharpe: 2.1, drawdown: -0.021 },
  { id: "stg_004", name: "FX Carry Tactical", alpha: "alpha_fxc_v1", capitalPoolId: "cp_gamma", personaIds: ["per_macro", "per_risk"], owner: "dan", updatedAt: ago(30), state: "paused", risk: "critical", pnl30d: -0.012, sharpe: -0.3, drawdown: -0.13 },
  { id: "stg_005", name: "Vol Surface Arb", alpha: "alpha_vsa_v4", capitalPoolId: "cp_alpha", personaIds: ["per_quant"], owner: "alice", updatedAt: ago(48), state: "draft", risk: "medium", pnl30d: 0, sharpe: 0, drawdown: 0 },
];

export const personas: Persona[] = [
  { id: "per_quant", name: "Quant Architect", archetype: "Quant", owner: "alice", updatedAt: ago(8), state: "deployed", risk: "low", routedStrategies: 3, successRate: 0.78 },
  { id: "per_macro", name: "Macro Strategist", archetype: "Macro", owner: "bob", updatedAt: ago(20), state: "deployed", risk: "medium", routedStrategies: 2, successRate: 0.64 },
  { id: "per_risk", name: "Risk Officer Bot", archetype: "Risk", owner: "carol", updatedAt: ago(3), state: "deployed", risk: "low", routedStrategies: 4, successRate: 0.91 },
  { id: "per_red", name: "Red Team Adversary", archetype: "RedTeam", owner: "dan", updatedAt: ago(50), state: "review", risk: "high", routedStrategies: 0, successRate: 0.5 },
];

export const capitalPools: CapitalPool[] = [
  { id: "cp_alpha", name: "Alpha Pool", currency: "USD", allocated: 25_000_000, utilized: 18_400_000, riskBudget: 0.04, owner: "capital", updatedAt: ago(1), state: "deployed", risk: "medium" },
  { id: "cp_beta", name: "Beta Pool", currency: "USD", allocated: 12_000_000, utilized: 7_200_000, riskBudget: 0.06, owner: "capital", updatedAt: ago(6), state: "deployed", risk: "high" },
  { id: "cp_gamma", name: "Tactical Pool", currency: "USDT", allocated: 5_000_000, utilized: 4_800_000, riskBudget: 0.08, owner: "capital", updatedAt: ago(10), state: "deployed", risk: "critical" },
];

export const rankingFormulas: RankingFormula[] = [
  { id: "rf_001", name: "Sharpe-Adjusted Drawdown v3", expression: "0.6*sharpe - 0.4*|dd|", appliedTo: 12, owner: "alice", updatedAt: ago(72), state: "deployed", risk: "low" },
  { id: "rf_002", name: "Capacity-Weighted Alpha", expression: "alpha * sqrt(capacity)", appliedTo: 5, owner: "bob", updatedAt: ago(120), state: "review", risk: "medium" },
];

export const rebalances: Rebalance[] = [
  { id: "rb_q2_2026", name: "Q2 2026 Rebalance", quarter: "2026-Q2", targetPoolId: "cp_alpha", proposedDelta: 0.12, owner: "capital", updatedAt: ago(4), state: "review", risk: "high" },
];

export const deployments: Deployment[] = [
  { id: "dp_001", name: "stg_001 → live v3.2.0", target: "live", artifactId: "art_stg001_v320", version: "3.2.0", owner: "ops", updatedAt: ago(1), state: "deployed", risk: "high" },
  { id: "dp_002", name: "stg_002 → paper v1.0.4", target: "paper", artifactId: "art_stg002_v104", version: "1.0.4", owner: "ops", updatedAt: ago(7), state: "deployed", risk: "medium" },
];

export const jobs: Job[] = [
  { id: "job_8821", kind: "backtest", status: "running", startedAt: ago(0.2), owner: "alice" },
  { id: "job_8820", kind: "rebalance.simulate", status: "success", startedAt: ago(1), durationMs: 124_000, owner: "capital" },
  { id: "job_8819", kind: "training.eval", status: "failed", startedAt: ago(2), durationMs: 45_000, owner: "ai_trainer" },
  { id: "job_8818", kind: "ingest.market", status: "running", startedAt: ago(0.05), owner: "ops" },
];

export const alerts: Alert[] = [
  { id: "al_501", severity: "high", title: "stg_004 drawdown breach -13%", source: "risk", openedAt: ago(0.5), acknowledged: false },
  { id: "al_500", severity: "medium", title: "MCP server tool latency p95 > 2s", source: "runtime", openedAt: ago(2), acknowledged: false },
  { id: "al_499", severity: "low", title: "Daily ingest delayed 3m", source: "ops", openedAt: ago(6), acknowledged: true },
];

export const incidents: Incident[] = [
  { id: "in_021", severity: "critical", title: "Live order rejected by exchange", status: "mitigating", openedAt: ago(1) },
];

export const approvals: ApprovalRequest[] = [
  { id: "ap_301", kind: "deploy.live", subject: "stg_001 v3.2.1", requester: "alice", state: "pending", riskLevel: "critical", createdAt: ago(0.3) },
  { id: "ap_302", kind: "rebalance.apply", subject: "Q2 2026 Rebalance", requester: "capital", state: "pending", riskLevel: "high", createdAt: ago(2) },
  { id: "ap_303", kind: "skill.publish", subject: "skill: macro_briefing v2", requester: "ai_trainer", state: "pending", riskLevel: "medium", createdAt: ago(4) },
];

export const auditEvents: AuditEvent[] = [
  { id: "au_1", actor: "alice", action: "strategy.update", target: "stg_001", ts: ago(0.4) },
  { id: "au_2", actor: "ops", action: "deployment.promote", target: "dp_001", ts: ago(1.2) },
  { id: "au_3", actor: "capital", action: "rebalance.propose", target: "rb_q2_2026", ts: ago(4) },
];

export const searchableObjects = () => [
  ...strategies.map((s) => ({ id: s.id, type: "Strategy", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
  ...personas.map((s) => ({ id: s.id, type: "Persona", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
  ...capitalPools.map((s) => ({ id: s.id, type: "CapitalPool", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
  ...rankingFormulas.map((s) => ({ id: s.id, type: "RankingFormula", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
  ...rebalances.map((s) => ({ id: s.id, type: "Rebalance", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
  ...deployments.map((s) => ({ id: s.id, type: "Deployment", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
];
