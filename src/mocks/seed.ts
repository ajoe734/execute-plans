import type {
  Strategy, Persona, CapitalPool, RankingFormula, Rebalance,
  Deployment, Job, Alert, Incident, ApprovalRequest, AuditEvent,
  EvolutionProgram, ResearchExperiment, Artifact, Runtime,
  Tool, McpServer, McpTool, Skill, Channel,
  RoutePolicy, PolicyVersion, PermissionMatrix, MemoryUpdate, ConsultRule,
  EvolutionRun, EvolutionCandidate, FitnessFormula, MutationRule,
  AllocationSimulation,
  PolicyViolation, EvaluationRun, ObjectVersion, FeatureSet, PerformanceSeries,
  Watcher, DecisionJournalEntry, AllocationLimit, PoolFreeze, DeploymentStage,
  McpSecret, PromotionRecord, MetricFreeze, RebalanceOverride,
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
  {
    id: "rb_q2_2026", name: "Q2 2026 Rebalance", quarter: "2026-Q2",
    targetPoolId: "cp_alpha", proposedDelta: 0.12, owner: "capital",
    updatedAt: ago(4), state: "review", risk: "high",
    expectedSharpe: 1.92, expectedDrawdown: -0.038,
    notes: "Rotates capital from FX Carry into Vol Surface Arb based on Q1 backtest.",
    lines: [
      { strategyId: "stg_001", strategyName: "Momentum Quant Alpha", currentWeight: 0.35, proposedWeight: 0.32, delta: -0.03 },
      { strategyId: "stg_003", strategyName: "Asia Tech Long-Short", currentWeight: 0.20, proposedWeight: 0.28, delta: 0.08 },
      { strategyId: "stg_004", strategyName: "FX Carry Tactical", currentWeight: 0.25, proposedWeight: 0.10, delta: -0.15 },
      { strategyId: "stg_005", strategyName: "Vol Surface Arb", currentWeight: 0.20, proposedWeight: 0.30, delta: 0.10 },
    ],
  },
  {
    id: "rb_q1_2026", name: "Q1 2026 Rebalance", quarter: "2026-Q1",
    targetPoolId: "cp_beta", proposedDelta: 0.04, owner: "capital",
    updatedAt: ago(2160), state: "deployed", risk: "medium",
    expectedSharpe: 1.4, expectedDrawdown: -0.05,
  },
];

export const evolutionPrograms: EvolutionProgram[] = [
  { id: "ev_001", name: "Momentum α Evolution", generation: 14, population: 64, bestFitness: 1.83, parentAlpha: "alpha_mq_v3", progress: 0.72, owner: "ai_trainer", updatedAt: ago(0.8), state: "deployed", risk: "medium" },
  { id: "ev_002", name: "Vol Surface Search", generation: 6, population: 32, bestFitness: 1.21, parentAlpha: "alpha_vsa_v4", progress: 0.31, owner: "ai_trainer", updatedAt: ago(3), state: "review", risk: "high" },
];

export const researchExperiments: ResearchExperiment[] = [
  { id: "rx_201", name: "Asia Tech earnings drift", hypothesis: "Post-earnings drift > 4d on Asia Tech", status: "running", metric: "IR", metricValue: 0.68, owner: "carol", updatedAt: ago(1.5), state: "review", risk: "low" },
  { id: "rx_202", name: "FX Carry regime gating", hypothesis: "VIX>22 should disable carry", status: "concluded", metric: "Sharpe Δ", metricValue: 0.31, artifactId: "art_rx202_v1", owner: "dan", updatedAt: ago(40), state: "approved", risk: "medium" },
  { id: "rx_203", name: "Cross-asset momentum blend", hypothesis: "Blending bonds + equities momentum", status: "queued", metric: "Sharpe", metricValue: 0, owner: "alice", updatedAt: ago(0.4), state: "draft", risk: "low" },
];

export const artifacts: Artifact[] = [
  { id: "art_stg001_v320", name: "stg_001 model v3.2.0", kind: "model", version: "3.2.0", sizeMb: 84.2, hash: "sha256:9f3a…b21c", owner: "ai_trainer", updatedAt: ago(2), state: "deployed", risk: "high" },
  { id: "art_rx202_v1", name: "FX Carry gating dataset", kind: "dataset", version: "1.0.0", sourceExperimentId: "rx_202", sizeMb: 312.4, hash: "sha256:1a2b…77e0", owner: "dan", updatedAt: ago(40), state: "approved", risk: "medium" },
  { id: "art_stg002_v104", name: "stg_002 container v1.0.4", kind: "container", version: "1.0.4", sizeMb: 1024, hash: "sha256:5d44…ff10", owner: "ops", updatedAt: ago(7), state: "deployed", risk: "medium" },
  { id: "art_rep_q1", name: "Q1 2026 performance report", kind: "report", version: "1.0", sizeMb: 4.1, hash: "sha256:8be1…aa20", owner: "capital", updatedAt: ago(720), state: "approved", risk: "low" },
];


export const deployments: Deployment[] = [
  { id: "dp_001", name: "stg_001 → live v3.2.0", target: "live", artifactId: "art_stg001_v320", version: "3.2.0", previousVersion: "3.1.4", strategyId: "stg_001", promotedAt: ago(1), rollbackAvailable: true, owner: "ops", updatedAt: ago(1), state: "deployed", risk: "high" },
  { id: "dp_002", name: "stg_002 → paper v1.0.4", target: "paper", artifactId: "art_stg002_v104", version: "1.0.4", previousVersion: "1.0.3", strategyId: "stg_002", promotedAt: ago(7), rollbackAvailable: true, owner: "ops", updatedAt: ago(7), state: "deployed", risk: "medium" },
  { id: "dp_003", name: "stg_003 → live v2.4.1", target: "live", artifactId: "art_stg001_v320", version: "2.4.1", previousVersion: "2.4.0", strategyId: "stg_003", promotedAt: ago(36), rollbackAvailable: true, owner: "ops", updatedAt: ago(36), state: "deployed", risk: "low" },
];

export const runtimes: Runtime[] = [
  { id: "rt_exec_us1", name: "executor-us-east-1", kind: "executor", env: "live", status: "running", cpu: 0.62, memory: 0.71, latencyP95Ms: 142, uptimePct: 99.97, region: "us-east-1", updatedAt: ago(0.05) },
  { id: "rt_exec_eu1", name: "executor-eu-west-1", kind: "executor", env: "paper", status: "running", cpu: 0.41, memory: 0.55, latencyP95Ms: 88, uptimePct: 99.99, region: "eu-west-1", updatedAt: ago(0.05) },
  { id: "rt_mcp_a", name: "mcp-server-alpha", kind: "mcp", env: "live", status: "warning", cpu: 0.78, memory: 0.83, latencyP95Ms: 2150, uptimePct: 99.4, region: "us-east-1", updatedAt: ago(0.1) },
  { id: "rt_sched", name: "scheduler-primary", kind: "scheduler", env: "live", status: "running", cpu: 0.22, memory: 0.34, latencyP95Ms: 30, uptimePct: 99.99, region: "us-east-1", updatedAt: ago(0.05) },
  { id: "rt_ingest", name: "market-ingest", kind: "ingest", env: "live", status: "running", cpu: 0.49, memory: 0.52, latencyP95Ms: 64, uptimePct: 99.95, region: "us-east-1", updatedAt: ago(0.05) },
  { id: "rt_research", name: "research-cluster", kind: "executor", env: "research", status: "paused", cpu: 0.05, memory: 0.10, latencyP95Ms: 0, uptimePct: 100, region: "us-west-2", updatedAt: ago(6) },
];

export const jobs: Job[] = [
  { id: "job_8821", kind: "backtest", status: "running", startedAt: ago(0.2), owner: "alice" },
  { id: "job_8820", kind: "rebalance.simulate", status: "success", startedAt: ago(1), durationMs: 124_000, owner: "capital" },
  { id: "job_8819", kind: "training.eval", status: "failed", startedAt: ago(2), durationMs: 45_000, owner: "ai_trainer" },
  { id: "job_8818", kind: "ingest.market", status: "running", startedAt: ago(0.05), owner: "ops" },
];

export const alerts: Alert[] = [
  { id: "al_501", severity: "high", title: "stg_004 drawdown breach -13%", source: "risk", openedAt: ago(0.5), acknowledged: false, description: "FX Carry Tactical breached the −10% drawdown threshold defined in its risk policy.", relatedTarget: "stg_004", metric: "drawdown", threshold: "-10%", observed: "-13%", suggestedAction: "Pause strategy and trigger risk review." },
  { id: "al_500", severity: "medium", title: "MCP server tool latency p95 > 2s", source: "runtime", openedAt: ago(2), acknowledged: false, description: "mcp-server-alpha p95 latency exceeded SLA for 5 consecutive minutes.", relatedTarget: "rt_mcp_a", metric: "latency_p95", threshold: "2000ms", observed: "2150ms", suggestedAction: "Scale MCP pool or investigate slow tools." },
  { id: "al_499", severity: "low", title: "Daily ingest delayed 3m", source: "ops", openedAt: ago(6), acknowledged: true, description: "Market ingest completed 3 minutes after schedule.", relatedTarget: "rt_ingest", metric: "ingest_lag", threshold: "120s", observed: "180s" },
];

export const incidents: Incident[] = [
  { id: "in_021", severity: "critical", title: "Live order rejected by exchange", status: "mitigating", openedAt: ago(1), description: "Exchange returned RATE_LIMIT errors on Live orders for stg_001 between 14:02–14:08 UTC.", affected: ["stg_001", "rt_exec_us1"], commander: "ops", timeline: [
    { ts: ago(1), actor: "system", note: "Incident auto-opened from alert al_502" },
    { ts: ago(0.9), actor: "ops", note: "Throttled order submission to 50%" },
    { ts: ago(0.4), actor: "ops", note: "Engaging exchange support" },
  ]},
];

export const approvals: ApprovalRequest[] = [
  { id: "ap_301", kind: "deploy.live", subject: "stg_001 v3.2.1", requester: "alice", state: "pending", riskLevel: "critical", createdAt: ago(0.3), rationale: "Hotfix for slippage estimator under high-vol regimes.", diffSummary: "+1 module, +84 LoC, model hash 9f3a→7c11", requiresStages: ["risk", "capital", "ops"], stages: [
    { name: "risk", state: "approved", slaHours: 4, startedAt: ago(0.3), decidedBy: "carol", decidedAt: ago(0.2), memo: "VAR within bounds" },
    { name: "capital", state: "pending", slaHours: 4, startedAt: ago(0.2) },
    { name: "ops", state: "pending", slaHours: 6, escalateTo: "committee" },
  ] },
  { id: "ap_302", kind: "rebalance.apply", subject: "Q2 2026 Rebalance", requester: "capital", state: "pending", riskLevel: "high", createdAt: ago(2), rationale: "Quarterly rotation per capital plan.", diffSummary: "4 strategies, max Δ −15%", requiresStages: ["risk", "ops"], stages: [
    { name: "risk", state: "pending", slaHours: 1, startedAt: ago(2) },
    { name: "ops", state: "pending", slaHours: 4 },
  ] },
  { id: "ap_303", kind: "skill.publish", subject: "skill: macro_briefing v2", requester: "ai_trainer", state: "pending", riskLevel: "medium", createdAt: ago(4), rationale: "New macro briefing skill with grounded sources.", requiresStages: ["trainer-lead"], stages: [
    { name: "trainer-lead", state: "pending", slaHours: 12, startedAt: ago(4) },
  ] },
];

export const auditEvents: AuditEvent[] = [
  { id: "au_1", actor: "alice", action: "strategy.update", target: "stg_001", ts: ago(0.4) },
  { id: "au_2", actor: "ops", action: "deployment.promote", target: "dp_001", ts: ago(1.2) },
  { id: "au_3", actor: "capital", action: "rebalance.propose", target: "rb_q2_2026", ts: ago(4) },
];

export const tools: Tool[] = [
  { id: "tl_market_data", name: "market.data.fetch", category: "data", version: "2.4.0", inputs: 4, description: "Fetch normalized OHLCV data from the canonical market warehouse.", usedBy: 23, owner: "ops", updatedAt: ago(72), state: "deployed", risk: "low" },
  { id: "tl_order_submit", name: "execution.order.submit", category: "execution", version: "1.8.2", inputs: 7, description: "Submit a parent order to the execution router. Live access requires risk-officer grant.", usedBy: 6, owner: "ops", updatedAt: ago(36), state: "deployed", risk: "critical" },
  { id: "tl_news_search", name: "research.news.search", category: "research", version: "3.1.0", inputs: 3, description: "Semantic search across the curated news + filings index.", usedBy: 18, owner: "research", updatedAt: ago(120), state: "deployed", risk: "low" },
  { id: "tl_slack_post", name: "communication.slack.post", category: "communication", version: "1.0.4", inputs: 2, description: "Post a message to a configured Slack channel.", usedBy: 9, owner: "ops", updatedAt: ago(200), state: "deployed", risk: "medium" },
  { id: "tl_factor_attr", name: "analysis.factor.attribute", category: "analysis", version: "0.9.1", inputs: 5, description: "Compute factor attribution for a portfolio against a chosen factor model.", usedBy: 12, owner: "research", updatedAt: ago(50), state: "review", risk: "medium" },
];

export const mcpServers: McpServer[] = [
  { id: "mcp_alpha", name: "mcp-server-alpha", endpoint: "https://mcp-alpha.pantheon.internal", region: "us-east-1", toolCount: 24, envAllowed: ["research", "paper", "live"], health: "warning", owner: "ops", updatedAt: ago(0.1), state: "deployed", risk: "high" },
  { id: "mcp_beta", name: "mcp-server-beta", endpoint: "https://mcp-beta.pantheon.internal", region: "eu-west-1", toolCount: 18, envAllowed: ["research", "paper"], health: "running", owner: "ops", updatedAt: ago(2), state: "deployed", risk: "medium" },
  { id: "mcp_research", name: "mcp-research-sandbox", endpoint: "https://mcp-rsb.pantheon.internal", region: "us-west-2", toolCount: 41, envAllowed: ["research"], health: "running", owner: "research", updatedAt: ago(5), state: "deployed", risk: "low" },
];

export const mcpTools: McpTool[] = [
  { id: "mt_001", name: "alpha.factor.compute", serverId: "mcp_alpha", description: "Streaming factor computation across the universe.", scope: "read", envGrants: ["research", "paper", "live"], callsLast24h: 8421, owner: "research", updatedAt: ago(2), state: "deployed", risk: "low" },
  { id: "mt_002", name: "alpha.order.preview", serverId: "mcp_alpha", description: "Preview order routing without submission.", scope: "read", envGrants: ["research", "paper", "live"], callsLast24h: 1240, owner: "ops", updatedAt: ago(2), state: "deployed", risk: "medium" },
  { id: "mt_003", name: "alpha.order.cancel_all", serverId: "mcp_alpha", description: "Emergency cancel-all for a strategy. Live grant requires dual approval.", scope: "destructive", envGrants: ["research", "paper"], callsLast24h: 12, owner: "ops", updatedAt: ago(20), state: "review", risk: "critical" },
  { id: "mt_004", name: "research.news.fetch", serverId: "mcp_research", description: "Fetch raw news payloads.", scope: "read", envGrants: ["research"], callsLast24h: 4500, owner: "research", updatedAt: ago(80), state: "deployed", risk: "low" },
];

export const skills: Skill[] = [
  { id: "sk_macro_brief", name: "macro_briefing", version: "2.0", archetype: "Macro", description: "Generates a daily macro briefing with grounded citations and regime tags.", draft: true, evalScore: 0.86, usedByPersonas: 0, owner: "ai_trainer", updatedAt: ago(4), state: "review", risk: "medium" },
  { id: "sk_signal_review", name: "signal_review", version: "1.4", archetype: "Quant", description: "Reviews a candidate signal and returns a structured critique.", draft: false, publishedAt: ago(72), evalScore: 0.91, usedByPersonas: 3, owner: "ai_trainer", updatedAt: ago(72), state: "deployed", risk: "low" },
  { id: "sk_redteam_attack", name: "redteam_attack", version: "0.3", archetype: "RedTeam", description: "Adversarial probing of strategy assumptions. Restricted to research env.", draft: true, evalScore: 0.62, usedByPersonas: 0, owner: "ai_trainer", updatedAt: ago(20), state: "draft", risk: "high" },
  { id: "sk_capital_summary", name: "capital_summary", version: "3.1", archetype: "Capital", description: "Summarizes capital pool utilization and risk budget consumption.", draft: false, publishedAt: ago(500), evalScore: 0.94, usedByPersonas: 2, owner: "ai_trainer", updatedAt: ago(500), state: "deployed", risk: "low" },
];

export const channels: Channel[] = [
  { id: "ch_slack_alerts", name: "#alerts-pantheon", kind: "slack", destination: "slack://T01/C-alerts-pantheon", subscribers: 14, filters: "severity in (high, critical)", owner: "ops", updatedAt: ago(48), state: "deployed", risk: "medium" },
  { id: "ch_email_capital", name: "Capital Daily Digest", kind: "email", destination: "capital@pantheon.internal", subscribers: 6, filters: "kind=capital.daily", owner: "capital", updatedAt: ago(120), state: "deployed", risk: "low" },
  { id: "ch_webhook_audit", name: "Audit Forwarder", kind: "webhook", destination: "https://siem.internal/ingest", subscribers: 1, filters: "all", owner: "ops", updatedAt: ago(200), state: "deployed", risk: "low" },
];

// ---------- Phase 9: governance / studio surfaces ----------

export const routePolicies: RoutePolicy[] = [
  {
    id: "rp_quant_v2", name: "Quant Architect Routing v2", personaId: "per_quant",
    version: "v2", owner: "ai_trainer", updatedAt: ago(6), state: "deployed", risk: "medium",
    publishedAt: ago(6),
    rules: [
      { id: "r1", intent: "compute_factor", targetKind: "mcp", targetId: "mt_001", envScope: ["research", "paper", "live"], priority: 10 },
      { id: "r2", intent: "preview_order", targetKind: "mcp", targetId: "mt_002", envScope: ["paper", "live"], priority: 20, guard: "qty <= dailyCap" },
      { id: "r3", intent: "review_signal", targetKind: "skill", targetId: "sk_signal_review", envScope: ["research", "paper", "live"], priority: 30 },
      { id: "r4", intent: "fetch_market", targetKind: "tool", targetId: "tl_market_data", envScope: ["research", "paper", "live"], priority: 40 },
    ],
  },
  {
    id: "rp_macro_v1", name: "Macro Strategist Routing v1", personaId: "per_macro",
    version: "v1", owner: "ai_trainer", updatedAt: ago(48), state: "deployed", risk: "low",
    publishedAt: ago(48),
    rules: [
      { id: "r1", intent: "macro_brief", targetKind: "skill", targetId: "sk_macro_brief", envScope: ["research", "paper", "live"], priority: 10 },
      { id: "r2", intent: "news_search", targetKind: "tool", targetId: "tl_news_search", envScope: ["research", "paper", "live"], priority: 20 },
    ],
  },
  {
    id: "rp_risk_v1", name: "Risk Officer Routing v1", personaId: "per_risk",
    version: "v1", owner: "ai_trainer", updatedAt: ago(120), state: "deployed", risk: "low",
    publishedAt: ago(120),
    rules: [
      { id: "r1", intent: "factor_attribute", targetKind: "tool", targetId: "tl_factor_attr", envScope: ["research", "paper", "live"], priority: 10 },
      { id: "r2", intent: "cancel_all", targetKind: "mcp", targetId: "mt_003", envScope: ["research"], priority: 20, guard: "requires dual-approval in live" },
    ],
  },
];

export const policyVersions: PolicyVersion[] = [
  {
    id: "pv_quant_v1", policyId: "rp_quant_v2", version: "v1",
    author: "ai_trainer", createdAt: ago(240), note: "Initial routing.",
    rules: [
      { id: "r1", intent: "compute_factor", targetKind: "mcp", targetId: "mt_001", envScope: ["research", "paper"], priority: 10 },
      { id: "r2", intent: "review_signal", targetKind: "skill", targetId: "sk_signal_review", envScope: ["research", "paper", "live"], priority: 20 },
    ],
  },
  {
    id: "pv_quant_v2", policyId: "rp_quant_v2", version: "v2",
    author: "ai_trainer", createdAt: ago(6), note: "Promoted live for compute_factor; added preview_order guard.",
    rules: routePolicies[0].rules,
  },
];

const buildPermissionMatrix = (): PermissionMatrix[] => {
  const personasRows = personas.map((p) => ({ id: p.id, label: p.name }));
  return [
    {
      instance: "persona-tool",
      rows: personasRows,
      cols: tools.map((t) => ({ id: t.id, label: t.name, risk: t.risk })),
      cells: [
        { rowId: "per_quant", colId: "tl_market_data", grant: "use", envScope: ["research", "paper", "live"] },
        { rowId: "per_quant", colId: "tl_order_submit", grant: "manage", envScope: ["paper", "live"], updatedBy: "ops", updatedAt: ago(36) },
        { rowId: "per_quant", colId: "tl_factor_attr", grant: "use", envScope: ["research", "paper", "live"] },
        { rowId: "per_macro", colId: "tl_news_search", grant: "use", envScope: ["research", "paper", "live"] },
        { rowId: "per_macro", colId: "tl_slack_post", grant: "use", envScope: ["paper", "live"] },
        { rowId: "per_risk", colId: "tl_factor_attr", grant: "manage", envScope: ["research", "paper", "live"] },
        { rowId: "per_risk", colId: "tl_order_submit", grant: "read", envScope: ["live"] },
        { rowId: "per_red", colId: "tl_market_data", grant: "read", envScope: ["research"] },
      ],
    },
    {
      instance: "persona-mcp",
      rows: personasRows,
      cols: mcpTools.map((t) => ({ id: t.id, label: t.name, risk: t.risk })),
      cells: [
        { rowId: "per_quant", colId: "mt_001", grant: "use", envScope: ["research", "paper", "live"] },
        { rowId: "per_quant", colId: "mt_002", grant: "use", envScope: ["paper", "live"] },
        { rowId: "per_quant", colId: "mt_003", grant: "read", envScope: ["research"] },
        { rowId: "per_risk", colId: "mt_003", grant: "manage", envScope: ["research", "paper"] },
        { rowId: "per_macro", colId: "mt_004", grant: "use", envScope: ["research"] },
      ],
    },
    {
      instance: "persona-skill",
      rows: personasRows,
      cols: skills.map((s) => ({ id: s.id, label: s.name, risk: s.risk })),
      cells: [
        { rowId: "per_quant", colId: "sk_signal_review", grant: "use" },
        { rowId: "per_macro", colId: "sk_macro_brief", grant: "use" },
        { rowId: "per_risk", colId: "sk_capital_summary", grant: "use" },
        { rowId: "per_red", colId: "sk_redteam_attack", grant: "manage" },
      ],
    },
    {
      instance: "persona-lifecycle",
      rows: personasRows,
      cols: [
        { id: "act_pause", label: "pause" }, { id: "act_resume", label: "resume" },
        { id: "act_retire", label: "retire" }, { id: "act_promote", label: "promote_live", risk: "critical" },
        { id: "act_rollback", label: "rollback" },
      ],
      cells: [
        { rowId: "per_quant", colId: "act_pause", grant: "manage" },
        { rowId: "per_quant", colId: "act_promote", grant: "use" },
        { rowId: "per_risk", colId: "act_pause", grant: "manage" },
        { rowId: "per_risk", colId: "act_rollback", grant: "manage" },
      ],
    },
  ];
};

export const permissionMatrices = buildPermissionMatrix();

export const memoryUpdates: MemoryUpdate[] = [
  { id: "mu_001", personaId: "per_quant", kind: "fact", source: "signal_feedback", proposedBy: "alice", proposedAt: ago(0.4), state: "queued", after: "Asia tech earnings drift ~4d post-earnings (n=128)." },
  { id: "mu_002", personaId: "per_quant", kind: "preference", source: "operator", proposedBy: "alice", proposedAt: ago(2), state: "queued", before: "Prefer 1d horizon", after: "Prefer 4d horizon for momentum signals." },
  { id: "mu_003", personaId: "per_macro", kind: "fact", source: "decision_log", proposedBy: "bob", proposedAt: ago(8), state: "conflict", after: "Disable carry when VIX>22.", conflictWith: "mu_004" },
  { id: "mu_004", personaId: "per_macro", kind: "fact", source: "evaluation", proposedBy: "ai_trainer", proposedAt: ago(7), state: "conflict", after: "Disable carry when VIX>26.", conflictWith: "mu_003" },
  { id: "mu_005", personaId: "per_risk", kind: "redaction", source: "operator", proposedBy: "carol", proposedAt: ago(20), state: "approved", before: "Internal counter-party note", after: "[redacted]" },
];

export const consultRules: ConsultRule[] = [
  { id: "cr_001", name: "Risk consult on high-risk orders", fromPersonaId: "per_quant", toPersonaId: "per_risk", trigger: "order.risk>=high", mode: "blocking", envScope: ["paper", "live"], enabled: true, owner: "ops", updatedAt: ago(48) },
  { id: "cr_002", name: "Macro briefing before regime change", fromPersonaId: "per_quant", toPersonaId: "per_macro", trigger: "regime.change=true", mode: "advisory", envScope: ["research", "paper", "live"], enabled: true, owner: "ai_trainer", updatedAt: ago(120) },
  { id: "cr_003", name: "Red-team review on new alpha", fromPersonaId: "per_quant", toPersonaId: "per_red", trigger: "lifecycle=submit_review&kind=Strategy", mode: "ack", envScope: ["research"], enabled: false, owner: "ai_trainer", updatedAt: ago(240) },
  { id: "cr_004", name: "Risk officer pause confirm", fromPersonaId: "per_macro", toPersonaId: "per_risk", trigger: "action=pause", mode: "blocking", envScope: ["live"], enabled: true, owner: "ops", updatedAt: ago(8) },
];

export const evolutionRuns: EvolutionRun[] = [
  { id: "er_001", programId: "ev_001", generation: 14, startedAt: ago(0.6), status: "running", bestFitness: 1.83, candidates: 64 },
  { id: "er_002", programId: "ev_001", generation: 13, startedAt: ago(8), finishedAt: ago(7.2), status: "success", bestFitness: 1.79, candidates: 64 },
  { id: "er_003", programId: "ev_002", generation: 6, startedAt: ago(3), status: "warning", bestFitness: 1.21, candidates: 32 },
];

export const evolutionCandidates: EvolutionCandidate[] = [
  { id: "ec_001", runId: "er_001", fitness: 1.83, parents: ["alpha_mq_v3"], mutationsApplied: ["param.lookback+5", "feature.add_vol_surface"], state: "promoted" },
  { id: "ec_002", runId: "er_001", fitness: 1.81, parents: ["alpha_mq_v3"], mutationsApplied: ["param.lookback-3"], state: "scored" },
  { id: "ec_003", runId: "er_001", fitness: 1.62, parents: ["alpha_mq_v3"], mutationsApplied: ["structure.swap_ranker"], state: "scored" },
  { id: "ec_004", runId: "er_001", fitness: 1.41, parents: ["alpha_mq_v3"], mutationsApplied: ["feature.drop_news"], state: "discarded" },
  { id: "ec_005", runId: "er_003", fitness: 1.21, parents: ["alpha_vsa_v4"], mutationsApplied: ["param.skew_window+2"], state: "scored" },
];

export const fitnessFormulas: FitnessFormula[] = [
  { id: "ff_default", name: "Default Fitness", expression: "0.6*sharpe - 0.3*|dd| + 0.1*capacity", metrics: ["sharpe", "dd", "capacity"], appliedTo: 2, owner: "ai_trainer", updatedAt: ago(120), state: "deployed", risk: "low" },
  { id: "ff_capacity", name: "Capacity-Weighted", expression: "alpha*sqrt(capacity) - 0.2*turnover", metrics: ["alpha", "capacity", "turnover"], appliedTo: 1, owner: "research", updatedAt: ago(40), state: "review", risk: "medium" },
];

export const mutationRules: MutationRule[] = [
  { id: "mr_param_lookback", name: "lookback param mutation", scope: "param", expression: "lookback ± uniform(1,5)", rateBps: 150, enabled: true, owner: "ai_trainer", updatedAt: ago(48), state: "deployed", risk: "low" },
  { id: "mr_feat_swap", name: "feature swap", scope: "feature", expression: "drop(random_feature) | add(random_feature)", rateBps: 80, enabled: true, owner: "ai_trainer", updatedAt: ago(48), state: "deployed", risk: "medium" },
  { id: "mr_struct_ranker", name: "swap ranker", scope: "structure", expression: "ranker := random_choice(rankers)", rateBps: 30, enabled: false, owner: "ai_trainer", updatedAt: ago(120), state: "review", risk: "high" },
];

export const allocationSimulations: AllocationSimulation[] = [
  { id: "as_001", rebalanceId: "rb_q2_2026", weights: [
    { strategyId: "stg_001", weight: 0.32 }, { strategyId: "stg_003", weight: 0.28 },
    { strategyId: "stg_004", weight: 0.10 }, { strategyId: "stg_005", weight: 0.30 },
  ], expectedSharpe: 1.92, expectedDrawdown: -0.038, capacityUsed: 0.74, createdAt: ago(4) },
  { id: "as_002", rebalanceId: "rb_q2_2026", weights: [
    { strategyId: "stg_001", weight: 0.40 }, { strategyId: "stg_003", weight: 0.25 },
    { strategyId: "stg_004", weight: 0.05 }, { strategyId: "stg_005", weight: 0.30 },
  ], expectedSharpe: 1.84, expectedDrawdown: -0.041, capacityUsed: 0.72, createdAt: ago(2) },
];

// ---------- Action catalog (Part 6 §availableActions) ----------
// Drives BFF-declared availableActions per state; RBAC further filters at the UI layer.
type ActionMap = Partial<Record<import("@/lib/bff/types").LifecycleState, string[]>>;
const ACTIONS_BY_TYPE: Record<string, ActionMap> = {
  Strategy: {
    draft: ["edit", "submit_review", "delete"],
    review: ["approve", "reject", "edit"],
    approved: ["deploy_paper", "promote_live", "edit"],
    deployed: ["pause", "rollback", "view_lineage"],
    paused: ["resume", "retire"],
    retired: [],
  },
  Persona: {
    draft: ["edit", "submit_review"],
    review: ["approve", "reject"],
    approved: ["deploy", "edit"],
    deployed: ["pause", "retire", "edit"],
    paused: ["resume", "retire"],
    retired: [],
  },
  CapitalPool: {
    deployed: ["adjust_budget", "rebalance", "freeze"],
    paused: ["unfreeze", "retire"],
  },
  Rebalance: {
    draft: ["edit", "simulate", "submit_review"],
    review: ["approve", "reject", "simulate"],
    approved: ["apply", "rollback"],
    deployed: ["rollback"],
  },
  Deployment: {
    deployed: ["rollback", "pause", "view_logs"],
    paused: ["resume", "retire"],
  },
  Evolution: { deployed: ["pause", "fork", "promote_best"], paused: ["resume", "retire"], review: ["approve", "reject"] },
  Research: { draft: ["run", "edit"], review: ["approve", "reject"], approved: ["promote_artifact"] },
  Artifact: { approved: ["deploy", "archive"], deployed: ["rollback"] },
  RankingFormula: { draft: ["edit", "submit_review"], review: ["approve", "reject"], deployed: ["edit", "retire"] },
  Tool: { deployed: ["edit", "deprecate"], review: ["approve", "reject"] },
  McpServer: { deployed: ["restart", "drain", "edit"], paused: ["resume", "retire"] },
  McpTool: { deployed: ["grant_env", "revoke", "edit"], review: ["approve", "reject"] },
  Skill: { draft: ["edit", "evaluate", "submit_review"], review: ["approve", "reject"], approved: ["publish"], deployed: ["unpublish", "edit"] },
  Channel: { deployed: ["edit", "test_send", "disable"], paused: ["enable", "retire"] },
};

const LABEL_KEY_BY_TYPE: Record<string, string> = {
  Strategy: "object.strategy", Persona: "object.persona", CapitalPool: "object.capitalPool",
  Rebalance: "object.rebalance", Deployment: "object.deployment", Evolution: "object.evolution",
  Research: "object.research", Artifact: "object.artifact", RankingFormula: "object.rankingFormula",
  Tool: "object.tool", McpServer: "object.mcpServer", McpTool: "object.mcpTool",
  Skill: "object.skill", Channel: "object.channel",
};

function enrich<T extends { state?: string; availableActions?: string[]; labelKey?: string }>(arr: T[], type: string): T[] {
  for (const o of arr) {
    o.labelKey = o.labelKey ?? LABEL_KEY_BY_TYPE[type];
    if (o.availableActions) continue;
    const map = ACTIONS_BY_TYPE[type];
    o.availableActions = (map && o.state ? map[o.state as keyof ActionMap] : undefined) ?? [];
  }
  return arr;
}

enrich(strategies, "Strategy");
enrich(personas, "Persona");
enrich(capitalPools, "CapitalPool");
enrich(rebalances, "Rebalance");
enrich(deployments, "Deployment");
enrich(evolutionPrograms, "Evolution");
enrich(researchExperiments, "Research");
enrich(artifacts, "Artifact");
enrich(rankingFormulas, "RankingFormula");
enrich(tools, "Tool");
enrich(mcpServers, "McpServer");
enrich(mcpTools, "McpTool");
enrich(skills, "Skill");
enrich(channels, "Channel");


// ---------- Phase 13: Detail tab depth ----------

export const policyViolations: PolicyViolation[] = [
  { id: "pv_v01", subjectKind: "Persona", subjectId: "per_quant", policyId: "rp_quant_v2", policyName: "Quant Routing v2", severity: "medium", ts: ago(6), state: "open", description: "Invoked tl_order_submit without dual-approval token in paper env." },
  { id: "pv_v02", subjectKind: "Persona", subjectId: "per_quant", policyId: "rp_quant_v2", policyName: "Quant Routing v2", severity: "low", ts: ago(40), state: "resolved", description: "Compute factor exceeded daily quota by 3%.", resolvedBy: "ops" },
  { id: "pv_v03", subjectKind: "Persona", subjectId: "per_macro", policyId: "rp_macro_v1", policyName: "Macro Routing v1", severity: "high", ts: ago(2), state: "acknowledged", description: "Macro briefing posted to live channel without ack." },
  { id: "pv_v04", subjectKind: "Persona", subjectId: "per_red", policyId: "rp_quant_v2", policyName: "Quant Routing v2", severity: "critical", ts: ago(0.4), state: "open", description: "RedTeam attempted destructive tool in paper env." },
];

export const evaluationRuns: EvaluationRun[] = [
  { id: "ev_run_01", subjectKind: "Persona", subjectId: "per_quant", suite: "Quant baseline v3", score: 0.86, pass: true, ranAt: ago(8), trend: [0.79, 0.81, 0.83, 0.86] },
  { id: "ev_run_02", subjectKind: "Persona", subjectId: "per_quant", suite: "Risk consult adherence", score: 0.92, pass: true, ranAt: ago(20), trend: [0.88, 0.89, 0.91, 0.92] },
  { id: "ev_run_03", subjectKind: "Persona", subjectId: "per_macro", suite: "Macro briefing quality", score: 0.71, pass: false, ranAt: ago(12), trend: [0.74, 0.73, 0.70, 0.71] },
  { id: "ev_run_04", subjectKind: "Skill", subjectId: "sk_signal_review", suite: "Signal review adversarial", score: 0.84, pass: true, ranAt: ago(40), trend: [0.80, 0.82, 0.83, 0.84] },
];

export const objectVersions: ObjectVersion[] = [
  { id: "ver_per_quant_v1", subjectKind: "Persona", subjectId: "per_quant", version: "v1", author: "ai_trainer", createdAt: ago(720), note: "Initial baseline.", spec: { archetype: "Quant", tone: "concise", riskAppetite: "medium" } },
  { id: "ver_per_quant_v2", subjectKind: "Persona", subjectId: "per_quant", version: "v2", author: "alice", createdAt: ago(240), note: "Tighten risk appetite.", spec: { archetype: "Quant", tone: "concise", riskAppetite: "low" } },
  { id: "ver_per_quant_v3", subjectKind: "Persona", subjectId: "per_quant", version: "v3", author: "alice", createdAt: ago(8), note: "Add macro consult preference.", spec: { archetype: "Quant", tone: "concise", riskAppetite: "low", consult: ["per_macro"] } },
  { id: "ver_per_macro_v1", subjectKind: "Persona", subjectId: "per_macro", version: "v1", author: "ai_trainer", createdAt: ago(500), note: "Initial.", spec: { archetype: "Macro", tone: "narrative" } },
  { id: "ver_per_macro_v2", subjectKind: "Persona", subjectId: "per_macro", version: "v2", author: "bob", createdAt: ago(20), note: "Tighten regime triggers.", spec: { archetype: "Macro", tone: "narrative", regimeGate: "VIX>22" } },
  { id: "ver_stg001_v1", subjectKind: "Strategy", subjectId: "stg_001", version: "v1", author: "alice", createdAt: ago(1000), note: "First production cut.", spec: { lookback_days: 90, max_position_pct: 0.1, leverage_cap: 2 } },
  { id: "ver_stg001_v2", subjectKind: "Strategy", subjectId: "stg_001", version: "v2", author: "alice", createdAt: ago(200), note: "Lengthen lookback.", spec: { lookback_days: 120, max_position_pct: 0.08, leverage_cap: 3 } },
];

export const featureSets: FeatureSet[] = [
  { id: "fs_001", strategyId: "stg_001", name: "momentum_factor_set", upstreamDataset: "ds.equity.daily_v3", freshnessMin: 12, missingPct: 0.4, owner: "research" },
  { id: "fs_002", strategyId: "stg_001", name: "vol_surface_features", upstreamDataset: "ds.options.surface_v1", freshnessMin: 30, missingPct: 1.2, owner: "research" },
  { id: "fs_003", strategyId: "stg_002", name: "mean_reversion_features", upstreamDataset: "ds.equity.intraday_v2", freshnessMin: 5, missingPct: 0.1, owner: "research" },
  { id: "fs_004", strategyId: "stg_003", name: "asia_tech_basket", upstreamDataset: "ds.equity.asia_v2", freshnessMin: 60, missingPct: 0.0, owner: "research" },
];

const buildSeries = (strategyId: string, granularity: "day" | "week" | "month", n: number, base: number, vol: number): PerformanceSeries => {
  const points = Array.from({ length: n }, (_, i) => {
    const drift = (i / n) * base;
    const noise = (Math.sin(i * 1.3) + Math.cos(i * 0.7)) * vol;
    return { ts: new Date(Date.now() - (n - i) * (granularity === "day" ? 86400_000 : granularity === "week" ? 7 * 86400_000 : 30 * 86400_000)).toISOString(), pnl: drift + noise, benchmark: drift * 0.6 + noise * 0.4 };
  });
  return { strategyId, granularity, points };
};

export const performanceSeries: PerformanceSeries[] = [
  buildSeries("stg_001", "day", 30, 0.08, 0.012),
  buildSeries("stg_001", "week", 12, 0.08, 0.018),
  buildSeries("stg_001", "month", 6, 0.08, 0.022),
  buildSeries("stg_002", "day", 30, 0.03, 0.02),
  buildSeries("stg_003", "day", 30, 0.05, 0.01),
];

export const watchers: Watcher[] = [
  { id: "w_01", subjectKind: "Strategy", subjectId: "stg_001", user: "alice", since: ago(720) },
  { id: "w_02", subjectKind: "Strategy", subjectId: "stg_001", user: "carol", since: ago(120) },
  { id: "w_03", subjectKind: "Strategy", subjectId: "stg_001", user: "ops", since: ago(40) },
  { id: "w_04", subjectKind: "Strategy", subjectId: "stg_002", user: "bob", since: ago(200) },
  { id: "w_05", subjectKind: "Persona", subjectId: "per_quant", user: "alice", since: ago(800) },
  { id: "w_06", subjectKind: "CapitalPool", subjectId: "cp_alpha", user: "capital", since: ago(900) },
];

export const decisionJournal: DecisionJournalEntry[] = [
  { id: "dj_001", subjectKind: "Strategy", subjectId: "stg_001", title: "Promote v3.2.0 to live", decidedAt: ago(2), decidedBy: "ops", outcome: "good" },
  { id: "dj_002", subjectKind: "Strategy", subjectId: "stg_001", title: "Throttle order submission to 50%", decidedAt: ago(1), decidedBy: "ops", outcome: "neutral" },
  { id: "dj_003", subjectKind: "Strategy", subjectId: "stg_001", title: "Defer rebalance to post-FOMC", decidedAt: ago(40), decidedBy: "capital", outcome: "good" },
  { id: "dj_004", subjectKind: "Persona", subjectId: "per_quant", title: "Tighten risk appetite to low", decidedAt: ago(240), decidedBy: "alice", outcome: "good" },
  { id: "dj_005", subjectKind: "Persona", subjectId: "per_macro", title: "Add VIX>22 regime gate", decidedAt: ago(20), decidedBy: "bob", outcome: "pending" },
  { id: "dj_006", subjectKind: "CapitalPool", subjectId: "cp_alpha", title: "Adjust risk budget to 4%", decidedAt: ago(72), decidedBy: "capital", outcome: "good" },
];

export const allocationLimits: AllocationLimit[] = [
  { id: "lim_01", poolId: "cp_alpha", scope: "strategy", scopeRef: "stg_001", cap: 0.35, updatedBy: "capital", updatedAt: ago(120) },
  { id: "lim_02", poolId: "cp_alpha", scope: "strategy", scopeRef: "stg_003", cap: 0.30, updatedBy: "capital", updatedAt: ago(120) },
  { id: "lim_03", poolId: "cp_alpha", scope: "sector", scopeRef: "tech", cap: 0.45, updatedBy: "capital", updatedAt: ago(200) },
  { id: "lim_04", poolId: "cp_beta", scope: "strategy", scopeRef: "stg_002", cap: 0.40, updatedBy: "capital", updatedAt: ago(48) },
  { id: "lim_05", poolId: "cp_gamma", scope: "sector", scopeRef: "fx", cap: 0.60, updatedBy: "capital", updatedAt: ago(48) },
];

export const poolFreezes: PoolFreeze[] = [
  { id: "pf_01", poolId: "cp_gamma", reason: "FX volatility spike post-FOMC", frozenBy: "capital", frozenAt: ago(8), active: true },
  { id: "pf_02", poolId: "cp_alpha", reason: "Quarterly rebalance freeze", frozenBy: "capital", frozenAt: ago(720), active: false },
  { id: "pf_03", poolId: "cp_beta", reason: "Risk review", frozenBy: "ops", frozenAt: ago(48), active: false },
];

export const deploymentStages: DeploymentStage[] = [
  { id: "dps_001_r", deploymentId: "dp_001", env: "research", status: "complete", promotedAt: ago(20), health: "ok" },
  { id: "dps_001_p", deploymentId: "dp_001", env: "paper", status: "complete", promotedAt: ago(10), health: "ok" },
  { id: "dps_001_c", deploymentId: "dp_001", env: "canary", status: "complete", promotedAt: ago(4), health: "ok" },
  { id: "dps_001_l", deploymentId: "dp_001", env: "live", status: "complete", promotedAt: ago(1), health: "warn" },
  { id: "dps_002_r", deploymentId: "dp_002", env: "research", status: "complete", promotedAt: ago(40), health: "ok" },
  { id: "dps_002_p", deploymentId: "dp_002", env: "paper", status: "complete", promotedAt: ago(7), health: "ok" },
  { id: "dps_002_c", deploymentId: "dp_002", env: "canary", status: "in_progress", health: "ok" },
  { id: "dps_002_l", deploymentId: "dp_002", env: "live", status: "pending" },
];

export const mcpSecrets: McpSecret[] = [
  { id: "sec_alpha_api", serverId: "mcp_alpha", name: "ALPHA_VENUE_API_KEY", lastRotatedAt: ago(720), rotatedBy: "ops" },
  { id: "sec_alpha_signing", serverId: "mcp_alpha", name: "ALPHA_REQUEST_SIGNING_KEY", lastRotatedAt: ago(120), rotatedBy: "ops" },
  { id: "sec_beta_api", serverId: "mcp_beta", name: "BETA_VENUE_API_KEY", lastRotatedAt: ago(800), rotatedBy: "ops" },
  { id: "sec_research_token", serverId: "mcp_research", name: "RESEARCH_DATAHUB_TOKEN", lastRotatedAt: ago(50), rotatedBy: "research" },
];

export const promotions: PromotionRecord[] = [
  { id: "pr_001", programId: "ev_001", candidateId: "ec_001", target: "paper", promotedAt: ago(0.5), promotedBy: "ai_trainer", deltaSharpe: 0.13, deltaDrawdown: 0.004 },
  { id: "pr_002", programId: "ev_001", candidateId: "ec_002", target: "paper", promotedAt: ago(40), promotedBy: "ai_trainer", deltaSharpe: 0.07, deltaDrawdown: -0.002 },
];

export const metricFreezes: MetricFreeze[] = [
  { id: "mf_001", rebalanceId: "rb_q2_2026", metric: "sharpe", frozen: true, frozenAt: ago(4), frozenBy: "capital" },
  { id: "mf_002", rebalanceId: "rb_q2_2026", metric: "drawdown", frozen: true, frozenAt: ago(4), frozenBy: "capital" },
  { id: "mf_003", rebalanceId: "rb_q2_2026", metric: "turnover", frozen: false },
  { id: "mf_004", rebalanceId: "rb_q2_2026", metric: "capacity", frozen: false },
];

export const rebalanceOverrides: RebalanceOverride[] = [
  { id: "ro_001", rebalanceId: "rb_q2_2026", strategyId: "stg_004", delta: -0.05, reason: "Reduce FX carry exposure ahead of regime change.", state: "review", proposedBy: "capital", proposedAt: ago(2) },
  { id: "ro_002", rebalanceId: "rb_q2_2026", strategyId: "stg_005", delta: 0.03, reason: "Increase Vol Surface Arb on backtest evidence.", state: "approved", proposedBy: "alice", proposedAt: ago(8) },
];

// Phase 21 — mutable per-rebalance workflow steps (per spec §16.4 — 11 stages).
export interface RebalanceStep {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "complete" | "blocked" | "skipped";
  actor?: string;
  ts?: string;
  note?: string;
  jobKind?: string; // mock job triggered when this step is advanced
}
const REBALANCE_STEP_TEMPLATE: RebalanceStep[] = [
  { id: "ws_draft",       label: "Draft proposal",        status: "complete", actor: "capital",  ts: ago(72) },
  { id: "ws_simulate",    label: "Run simulation",        status: "complete", actor: "capital",  ts: ago(48), jobKind: "rebalance.simulate" },
  { id: "ws_constraints", label: "Constraint check",      status: "complete", actor: "ops",      ts: ago(40), jobKind: "rebalance.validate_constraints" },
  { id: "ws_risk",        label: "Risk review",           status: "in_progress", actor: "per_risk", ts: ago(8) },
  { id: "ws_committee",   label: "Committee deliberation",status: "pending" },
  { id: "ws_ops",         label: "Ops review",            status: "pending" },
  { id: "ws_schedule",    label: "Schedule apply window", status: "pending" },
  { id: "ws_freeze",      label: "Freeze metrics",        status: "pending", jobKind: "start_metrics_freeze" },
  { id: "ws_apply",       label: "Apply allocation",      status: "pending", jobKind: "rebalance.apply" },
  { id: "ws_monitor",     label: "Monitor first 24h",     status: "pending", jobKind: "rebalance.monitor" },
  { id: "ws_close",       label: "Close-out & retrospective", status: "pending" },
];
const _rebalanceStepStore = new Map<string, RebalanceStep[]>();
export const rebalanceWorkflowSteps = (rebalanceId: string): RebalanceStep[] => {
  if (!_rebalanceStepStore.has(rebalanceId)) {
    _rebalanceStepStore.set(rebalanceId, REBALANCE_STEP_TEMPLATE.map((s) => ({ ...s })));
  }
  return _rebalanceStepStore.get(rebalanceId)!;
};


export const searchableObjects = () => [
  ...strategies.map((s) => ({ id: s.id, type: "Strategy", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
  ...personas.map((s) => ({ id: s.id, type: "Persona", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
  ...capitalPools.map((s) => ({ id: s.id, type: "CapitalPool", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
  ...rankingFormulas.map((s) => ({ id: s.id, type: "RankingFormula", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
  ...rebalances.map((s) => ({ id: s.id, type: "Rebalance", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
  ...deployments.map((s) => ({ id: s.id, type: "Deployment", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
  ...evolutionPrograms.map((s) => ({ id: s.id, type: "Evolution", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
  ...researchExperiments.map((s) => ({ id: s.id, type: "Research", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
  ...artifacts.map((s) => ({ id: s.id, type: "Artifact", name: s.name, state: s.state, owner: s.owner, risk: s.risk, updatedAt: s.updatedAt })),
];
