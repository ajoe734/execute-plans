// BFF Contract v1 — typed path builders.
// Source: .lovable/feedback/2026-05-07-final/Pantheon_BFF_OpenAPI_3_1.yaml
// Builders only — no fetching. Use with client.ts.

const BASE = "/bff";

const enc = (s: string | number) => encodeURIComponent(String(s));

export const paths = {
  // session
  sessionMe: () => `${BASE}/session/me`,
  sessionRefresh: () => `${BASE}/session/refresh`,
  sessionLogout: () => `${BASE}/session/logout`,

  // strategies
  strategies: () => `${BASE}/strategies`,
  strategy: (id: string) => `${BASE}/strategies/${enc(id)}`,
  strategyAction: (id: string, action: string) => `${BASE}/strategies/${enc(id)}/actions/${enc(action)}`,

  // personas
  personas: () => `${BASE}/personas`,
  persona: (id: string) => `${BASE}/personas/${enc(id)}`,
  personaAction: (id: string, action: string) => `${BASE}/personas/${enc(id)}/actions/${enc(action)}`,

  // capital pools
  capitalPools: () => `${BASE}/capital-pools`,
  capitalPool: (id: string) => `${BASE}/capital-pools/${enc(id)}`,
  capitalPoolAction: (id: string, action: string) => `${BASE}/capital-pools/${enc(id)}/actions/${enc(action)}`,

  // rebalances
  rebalances: () => `${BASE}/rebalances`,
  rebalance: (id: string) => `${BASE}/rebalances/${enc(id)}`,
  rebalanceAction: (id: string, action: string) => `${BASE}/rebalances/${enc(id)}/actions/${enc(action)}`,

  // deployments
  deployments: () => `${BASE}/deployments`,
  deployment: (id: string) => `${BASE}/deployments/${enc(id)}`,
  deploymentAction: (id: string, action: string) => `${BASE}/deployments/${enc(id)}/actions/${enc(action)}`,

  // evolution
  evolutionPrograms: () => `${BASE}/evolution-programs`,
  evolutionProgram: (id: string) => `${BASE}/evolution-programs/${enc(id)}`,

  // jobs / approvals / incidents
  jobs: () => `${BASE}/jobs`,
  job: (id: string) => `${BASE}/jobs/${enc(id)}`,
  approvals: () => `${BASE}/approvals`,
  approval: (id: string) => `${BASE}/approvals/${enc(id)}`,
  approvalDecision: (id: string) => `${BASE}/approvals/${enc(id)}/decision`,
  alerts: () => `${BASE}/alerts`,
  incidents: () => `${BASE}/incidents`,
  incident: (id: string) => `${BASE}/incidents/${enc(id)}`,

  // audit / artifacts
  audit: () => `${BASE}/audit`,
  artifacts: () => `${BASE}/artifacts`,
  artifact: (id: string) => `${BASE}/artifacts/${enc(id)}`,

  // runtime / mcp / skill / channel / tool / ranking
  runtimes: () => `${BASE}/runtimes`,
  mcpServers: () => `${BASE}/mcp-servers`,
  mcpTools: () => `${BASE}/mcp-tools`,
  mcpToolImport: () => `${BASE}/mcp-tools/import`,
  skills: () => `${BASE}/skills`,
  channels: () => `${BASE}/channels`,
  tools: () => `${BASE}/tools`,
  rankingFormulas: () => `${BASE}/ranking-formulas`,

  // research
  researchExperiments: () => `${BASE}/research-experiments`,

  // SSE
  sse: () => `${BASE}/events/stream`,

  // Agora
  agoraSignals: () => `${BASE}/agora/signals`,
  agoraInbox: () => `${BASE}/agora/inbox`,
  agoraJournal: () => `${BASE}/agora/journal`,
  agoraPostmortems: () => `${BASE}/agora/postmortems`,
  agoraAskSessions: () => `${BASE}/agora/ask/sessions`,
  agoraAskSession: (id: string) => `${BASE}/agora/ask/sessions/${enc(id)}`,

  // v5 closed-loop
  v5LoopRuns: () => `${BASE}/v5/loop-runs`,
  v5LoopRun: (id: string) => `${BASE}/v5/loop-runs/${enc(id)}`,
  v5SentinelFindings: () => `${BASE}/v5/sentinel/findings`,
  v5Interventions: () => `${BASE}/v5/interventions`,
  v5Intervention: (id: string) => `${BASE}/v5/interventions/${enc(id)}`,
  v5InterventionDecision: (id: string) => `${BASE}/v5/interventions/${enc(id)}/decision`,
  v5ExecutionPersonaHealth: () => `${BASE}/v5/execution/persona-health`,
} as const;
