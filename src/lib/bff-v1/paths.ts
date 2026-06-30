// BFF Contract v1 — typed path builders.
// Source: .lovable/feedback/2026-05-07-final/Pantheon_BFF_OpenAPI_3_1.yaml
// Builders only — no fetching. Use with client.ts.
//
// Live-Wiring Alignment Patch (2026-05-08): aligned to final OpenAPI canonical paths
//   - /bff/me                                (was /bff/session/me)
//   - /bff/auth/refresh                      (was /bff/session/refresh)
//   - /bff/logout                            (was /bff/session/logout)
//   - /bff/approvals/{id}/decide             (was /bff/approvals/{id}/decision)
//   - /bff/v5/interventions/{id}/decide      (was .../decision)
//   - /bff/mcp-servers/{id}/import-tools     (new — replaces /bff/mcp-tools/import)
//   - /bff/actions/{entityType}/{entityId}/{actionId} — canonical action endpoint
//
// Legacy nested per-entity action builders (strategyAction, personaAction, etc.)
// remain only for in-process mock compatibility and are NOT canonical. Live
// callers MUST use `actionCanonical(entityType, entityId, actionId)`.

const BASE = "/bff";

const enc = (s: string | number) => encodeURIComponent(String(s));

export const paths = {
  // ---- Session (canonical) ----
  me: () => `${BASE}/me`,
  meLocale: () => `${BASE}/me/locale`,
  authRefresh: () => `${BASE}/auth/refresh`,
  logout: () => `${BASE}/logout`,
  /** @deprecated Alias of `me()` retained for legacy callers. */
  sessionMe: () => `${BASE}/me`,
  /** @deprecated Alias of `authRefresh()`. */
  sessionRefresh: () => `${BASE}/auth/refresh`,
  /** @deprecated Alias of `logout()`. */
  sessionLogout: () => `${BASE}/logout`,

  // ---- Canonical action endpoint (Final §1772) ----
  action: (entityType: string, entityId: string, actionId: string) =>
    `${BASE}/actions/${enc(entityType)}/${enc(entityId)}/${enc(actionId)}`,

  // ---- Strategies / Personas / etc. (resource paths still canonical) ----
  strategies: () => `${BASE}/strategies`,
  strategy: (id: string) => `${BASE}/strategies/${enc(id)}`,
  /** @deprecated Use `paths.action("strategy", id, action)`. Kept for in-process mocks. */
  strategyAction: (id: string, action: string) => `${BASE}/strategies/${enc(id)}/actions/${enc(action)}`,

  personas: () => `${BASE}/personas`,
  persona: (id: string) => `${BASE}/personas/${enc(id)}`,
  personaRoutePolicy: (id: string) => `${BASE}/personas/${enc(id)}/route-policy`,
  personaEvaluations: (id: string) => `${BASE}/personas/${enc(id)}/evaluations`,
  personaMemory: (id: string) => `${BASE}/personas/${enc(id)}/memory`,
  /** @deprecated Use `paths.action("persona", id, action)`. */
  personaAction: (id: string, action: string) => `${BASE}/personas/${enc(id)}/actions/${enc(action)}`,

  capitalPools: () => `${BASE}/capital-pools`,
  capitalPool: (id: string) => `${BASE}/capital-pools/${enc(id)}`,
  /** @deprecated Use `paths.action("capitalPool", id, action)`. */
  capitalPoolAction: (id: string, action: string) => `${BASE}/capital-pools/${enc(id)}/actions/${enc(action)}`,

  rebalances: () => `${BASE}/rebalances`,
  rebalance: (id: string) => `${BASE}/rebalances/${enc(id)}`,
  /** @deprecated Use `paths.action("rebalance", id, action)`. */
  rebalanceAction: (id: string, action: string) => `${BASE}/rebalances/${enc(id)}/actions/${enc(action)}`,

  deployments: () => `${BASE}/deployments`,
  deployment: (id: string) => `${BASE}/deployments/${enc(id)}`,
  /** @deprecated Use `paths.action("deployment", id, action)`. */
  deploymentAction: (id: string, action: string) => `${BASE}/deployments/${enc(id)}/actions/${enc(action)}`,

  // ---- Evolution ----
  evolutionPrograms: () => `${BASE}/evolution-programs`,
  evolutionProgram: (id: string) => `${BASE}/evolution-programs/${enc(id)}`,
  evolutionProgramRuns: (id: string) => `${BASE}/evolution-programs/${enc(id)}/runs`,
  evolutionProgramCandidates: (id: string) => `${BASE}/evolution-programs/${enc(id)}/candidates`,

  // ---- Jobs / Approvals / Incidents ----
  jobs: () => `${BASE}/jobs`,
  job: (id: string) => `${BASE}/jobs/${enc(id)}`,
  approvals: () => `${BASE}/approvals`,
  approval: (id: string) => `${BASE}/approvals/${enc(id)}`,
  approvalDecide: (id: string) => `${BASE}/approvals/${enc(id)}/decide`,
  approvalsBatchDecide: () => `${BASE}/approvals/batch-decide`,
  /** @deprecated Alias of `approvalDecide(id)` — final OpenAPI uses `/decide`. */
  approvalDecision: (id: string) => `${BASE}/approvals/${enc(id)}/decide`,
  alerts: () => `${BASE}/alerts`,
  alertAcknowledge: (id: string) => `${BASE}/alerts/${enc(id)}/acknowledge`,
  incidents: () => `${BASE}/incidents`,
  incident: (id: string) => `${BASE}/incidents/${enc(id)}`,

  // ---- Audit / Artifacts ----
  audit: () => `${BASE}/audit`,
  artifacts: () => `${BASE}/artifacts`,
  artifact: (id: string) => `${BASE}/artifacts/${enc(id)}`,

  // ---- Runtime / MCP / Skill / Channel / Tool / Ranking ----
  runtimes: () => `${BASE}/runtimes`,
  mcpServers: () => `${BASE}/mcp-servers`,
  mcpServerImportTools: (id: string) => `${BASE}/mcp-servers/${enc(id)}/import-tools`,
  mcpTools: () => `${BASE}/mcp-tools`,
  /** @deprecated Use `mcpServerImportTools(serverId)` per final OpenAPI. */
  mcpToolImport: () => `${BASE}/mcp-tools/import`,
  skills: () => `${BASE}/skills`,
  channels: () => `${BASE}/channels`,
  tools: () => `${BASE}/tools`,
  rankingFormulas: () => `${BASE}/ranking-formulas`,
  search: () => `${BASE}/search`,

  // ---- Research ----
  researchExperiments: () => `${BASE}/research-experiments`,
  strategySpecs: (id: string) => `${BASE}/strategies/${enc(id)}/specs`,

  // ---- Command confirmations (v3 §6.2) — submission endpoint ----
  // /bff/command-confirmations requires confirm_token + command_id in body (submission of an already-issued token).
  commandConfirmations: () => `${BASE}/command-confirmations`,
  commandConfirmation: (token: string) => `${BASE}/command-confirmations/${enc(token)}`,

  // ---- Confirm-token lifecycle (v3 §6.2 create/read/redeem/delete) ----
  confirmTokens: () => `${BASE}/confirm-tokens`,
  confirmToken: (tokenId: string) => `${BASE}/confirm-tokens/${enc(tokenId)}`,
  confirmTokenRedeem: (tokenId: string) => `${BASE}/confirm-tokens/${enc(tokenId)}/redeem`,

  // ---- SSE ----
  sse: () => `${BASE}/events/stream`,

  // ---- Agora ----
  agoraSignals: () => `${BASE}/agora/signals`,
  agoraInbox: () => `${BASE}/agora/inbox`,
  agoraJournal: () => `${BASE}/agora/journal`,
  agoraPostmortems: () => `${BASE}/agora/postmortems`,
  agoraAskSessions: () => `${BASE}/agora/ask/sessions`,
  agoraAskSession: (id: string) => `${BASE}/agora/ask/sessions/${enc(id)}`,

  // ---- v5 closed-loop ----
  v5LoopRuns: () => `${BASE}/v5/loop-runs`,
  v5LoopRun: (id: string) => `${BASE}/v5/loop-runs/${enc(id)}`,
  v5SentinelFindings: () => `${BASE}/v5/sentinel/findings`,
  v5SentinelFinding: (id: string) => `${BASE}/v5/sentinel/findings/${enc(id)}`,
  v5SentinelFindingStatus: (id: string) => `${BASE}/v5/sentinel/findings/${enc(id)}/status`,
  v5Interventions: () => `${BASE}/v5/interventions`,
  v5Intervention: (id: string) => `${BASE}/v5/interventions/${enc(id)}`,
  v5InterventionDecide: (id: string) => `${BASE}/v5/interventions/${enc(id)}/decide`,
  /** @deprecated Alias of `v5InterventionDecide(id)`. */
  v5InterventionDecision: (id: string) => `${BASE}/v5/interventions/${enc(id)}/decide`,
  v5ExecutionPersonaHealth: () => `${BASE}/v5/execution/persona-health`,

  // ---- 2026-05-20 PM-9 — Management aggregate read paths (§12.2). ----
  // Mock providers continue returning seeds; live providers hit these.
  mgmtCockpit: () => `${BASE}/management/cockpit`,
  // Console-gap endpoints (2026-06-15): dedicated read surfaces for pages that
  // previously had no backend. See docs/04/pantheon_bff_console_gap_2026-06-15.
  knowledgeInbox: () => `${BASE}/knowledge`,
  workflowTemplates: () => `${BASE}/workflows`,
  hookRegistry: () => `${BASE}/hooks`,
  mgmtPersonaFleet: () => `${BASE}/management/persona-fleet`,
  mgmtHumanInbox: () => `${BASE}/management/human-inbox`,
  mgmtHumanInboxItem: (id: string) => `${BASE}/management/human-inbox/${enc(id)}`,
  mgmtTradingPulse: () => `${BASE}/management/trading-pulse`,
  mgmtTradingRankings: () => `${BASE}/management/trading-pulse/rankings`,
  mgmtEvolutionJournal: () => `${BASE}/management/evolution-journal`,
  mgmtEvidenceExplorer: () => `${BASE}/management/evidence`,
  knowledgeEvidenceRefs: () => `/api/v1/knowledge/evidence`,
  knowledgeEvidenceRef: (id: string) => `/api/v1/knowledge/evidence/${enc(id)}`,
  mgmtPersonaIntent: () => `${BASE}/management/persona-intent`,
  mgmtReadinessEp5: () => `${BASE}/management/readiness/ep5`,
  mgmtReadinessBrokerLive: () => `${BASE}/management/readiness/broker-live`,
  mgmtReadinessCapitalBinding: () => `${BASE}/management/readiness/capital-binding-live`,
  mgmtReadinessBffHa: () => `${BASE}/management/readiness/bff-ha`,
  mgmtReadinessStrictPublish: () => `${BASE}/management/readiness/strict-publish`,

  // ---- 2026-06-03 — Management AI runtime (OpenClaw gateway adapter / Codex). ----
  // FE submits prompts here; never to /bff/agora/ask.
  managementNlAsk: () => `${BASE}/management/nl/ask`,
  // SSE token-streaming variant (progressive rendering).
  managementNlAskStream: () => `${BASE}/management/nl/ask/stream`,
  managementAiConversation: (sessionId: string, traceId?: string) =>
    `${BASE}/management/ai/conversations/${enc(sessionId)}${traceId ? `?trace_id=${enc(traceId)}` : ""}`,
  // List the caller's server-side conversations (history index source of truth).
  managementAiConversations: (limit?: number) =>
    `${BASE}/management/ai/conversations${limit ? `?limit=${enc(String(limit))}` : ""}`,
  assistantMode: () => `${BASE}/assistant/mode`,
  assistantProviders: (authProbe = false) =>
    `${BASE}/assistant/providers${authProbe ? "?auth_probe=true" : ""}`,
  assistantProviderRegister: () => `${BASE}/assistant/providers`,
  assistantProviderUsageSummary: (authProbe = false, windowHours = 168, limit = 500) =>
    `${BASE}/assistant/providers/usage-summary?auth_probe=${authProbe ? "true" : "false"}&window_hours=${enc(String(windowHours))}&limit=${enc(String(limit))}`,
  assistantProviderReauth: () => `${BASE}/assistant/provider/reauth`,
  assistantProviderReauthStatus: (sessionId: string, provider?: string) =>
    `${BASE}/assistant/provider/reauth/${enc(sessionId)}${provider ? `?provider=${enc(provider)}` : ""}`,
  assistantControlModeActivate: () => `${BASE}/assistant/control-mode/activate`,
  assistantControlModeDeactivate: () => `${BASE}/assistant/control-mode/deactivate`,
  assistantOrchestratorStatus: () => `${BASE}/assistant/orchestrator/status`,
  assistantRepairWorktreePrepare: () => `${BASE}/assistant/repair-worktrees/prepare`,
  assistantDevDocsGenerate: () => `${BASE}/assistant/dev-docs/generate`,
  assistantDevDocsPacket: (packetId: string) => `${BASE}/assistant/dev-docs/${enc(packetId)}`,
  assistantDevBridgeTaskPacket: () => `${BASE}/assistant/dev-bridge/task-packet`,


  // ---- 2026-05-22 PM-12 — Competition-style performance management. ----
  mgmtPortfolioBook: () => `${BASE}/management/portfolio-book`,
  mgmtPortfolioHoldings: () => `${BASE}/management/portfolio-book/holdings`,
  mgmtPortfolioPools: () => `${BASE}/management/portfolio-book/pools`,
  mgmtPersonaLeague: () => `${BASE}/management/persona-league`,
  mgmtPersonaLeagueRankings: () => `${BASE}/management/persona-league/rankings`,
  mgmtPersonaLeagueTiers: () => `${BASE}/management/persona-league/tiers`,
  mgmtQuarterlyRanking: (quarter?: string) =>
    `${BASE}/management/quarterly-ranking${quarter ? `?quarter=${enc(quarter)}` : ""}`,
  mgmtQuarterlyRankingFormula: () => `${BASE}/management/quarterly-ranking/formula`,
  mgmtQuarterlyRankingRecommendations: (quarter?: string) =>
    `${BASE}/management/quarterly-ranking/recommendations${quarter ? `?quarter=${enc(quarter)}` : ""}`,
  mgmtPerformanceAttribution: (dimension?: string, period?: string) => {
    const qs: string[] = [];
    if (dimension) qs.push(`dimension=${enc(dimension)}`);
    if (period) qs.push(`period=${enc(period)}`);
    return `${BASE}/management/performance-attribution${qs.length ? `?${qs.join("&")}` : ""}`;
  },
} as const;
