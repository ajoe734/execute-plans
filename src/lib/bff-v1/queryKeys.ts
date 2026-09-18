// BFF Contract v1 — TanStack Query keys with identity and environment scope.
// Enforces tenant, operator, baseUrl, and mode scoping; never uses tokens as keys.

import { QueryClient } from "@tanstack/react-query";
import { getAuthProvider } from "./headers";
import { detectBaseUrl, detectMode } from "./client";

export interface QueryScope {
  tenantId: string;
  userId: string;
  baseUrl: string;
  mode: string;
}

export function getActiveQueryScope(override?: Partial<QueryScope>): QueryScope {
  const provider = getAuthProvider();
  return {
    tenantId: override?.tenantId ?? provider.getTenantId() ?? "default",
    userId: override?.userId ?? provider.getUserId?.() ?? "anonymous",
    baseUrl: override?.baseUrl ?? detectBaseUrl() ?? "",
    mode: override?.mode ?? detectMode() ?? "live",
  };
}

let sharedQueryClient: QueryClient | null = null;

export function getSharedQueryClient(): QueryClient {
  if (!sharedQueryClient) {
    sharedQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000,
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  return sharedQueryClient;
}

export function resetSharedQueryClientForTests(): void {
  if (sharedQueryClient) {
    sharedQueryClient.clear();
  }
}

export async function clearScopedQueries(
  client?: QueryClient,
  _scope?: Partial<QueryScope>,
): Promise<void> {
  const qc = client ?? getSharedQueryClient();
  await qc.cancelQueries();
  qc.clear();
}

export const queryKeys = {
  all: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope)] as const,
  scope: (scope?: Partial<QueryScope>) => getActiveQueryScope(scope),
  operations: {
    all: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "operations"] as const,
    jobs: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "operations", "jobs"] as const,
    alerts: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "operations", "alerts"] as const,
    incidents: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "operations", "incidents"] as const,
    approvals: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "operations", "approvals"] as const,
    audit: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "operations", "audit"] as const,
    tools: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "operations", "tools"] as const,
    mcp: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "operations", "mcp"] as const,
    mcpTools: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "operations", "mcpTools"] as const,
    skills: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "operations", "skills"] as const,
    channels: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "operations", "channels"] as const,
  },
  v5: {
    all: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "v5"] as const,
    loops: (kind?: string, scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "v5", "loops", kind ?? "all"] as const,
    personas: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "v5", "personas"] as const,
    interventions: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "v5", "interventions"] as const,
    sentinel: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "v5", "sentinel"] as const,
    loopHealth: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "v5", "loopHealth"] as const,
  },
  oversight: {
    all: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight"] as const,
    cockpit: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "cockpit"] as const,
    portfolioBook: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "portfolioBook"] as const,
    portfolioExposure: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "portfolioExposure"] as const,
    personaLeague: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "personaLeague"] as const,
    quarterlyRanking: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "quarterlyRanking"] as const,
    quarterlyFormula: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "quarterlyFormula"] as const,
    personaFleet: (filter?: string, scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "personaFleet", filter ?? "all"] as const,
    personaIntentTraces: (id?: string, scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "personaIntentTraces", id ?? "list"] as const,
    tradingPulse: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "tradingPulse"] as const,
    tradingPulseRankings: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "tradingPulseRankings"] as const,
    evolutionJournal: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "evolutionJournal"] as const,
    evidence: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "evidence"] as const,
    humanInbox: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "humanInbox"] as const,
    humanGateDetail: (id?: string, scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "humanGateDetail", id ?? "none"] as const,
    performanceAttribution: (source?: string, scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "performanceAttribution", source ?? "default"] as const,
    promotionAllocation: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "promotionAllocation"] as const,
    liveReadiness: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "liveReadiness"] as const,
    governanceDecisionQueue: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "governanceDecisionQueue"] as const,
    emergencyActions: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "oversight", "emergencyActions"] as const,
  },
  dataSources: {
    all: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "dataSources"] as const,
    controlCenter: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "dataSources", "controlCenter"] as const,
    lineage: (rootId?: string, scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "dataSources", "lineage", rootId ?? "root"] as const,
  },
  phase2: {
    hookCron: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "phase2", "hookCron"] as const,
    knowledgeInbox: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "phase2", "knowledgeInbox"] as const,
    workflowTemplates: (scope?: Partial<QueryScope>) => ["pantheon", getActiveQueryScope(scope), "phase2", "workflowTemplates"] as const,
  },
  resource: (key: string, args: unknown[] = [], scope?: Partial<QueryScope>) =>
    ["pantheon", getActiveQueryScope(scope), key, ...args] as const,
};
