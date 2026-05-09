// BFF-LUV-FE-002 — Management Console live read adapter surface.
//
// This is the canonical place from which Management Console pages obtain
// list/detail data for every route family the Pantheon BFF currently
// exposes. It wraps the underlying `bff-v1` transport (`withLiveOrMock`,
// `paths`, `lists`) so:
//
//   * VITE_BFF_MODE=mock → all reads come from the in-process seed.
//   * VITE_BFF_MODE=live + VITE_BFF_FALLBACK=auto (default) → "hybrid" mode:
//       try live BFF, transparently fall back to mock on transport failure,
//       and report the fallback through `liveStatus` so the UI can surface
//       it in the live-mode banner. The fallback path is explicit, not
//       silent.
//   * VITE_BFF_MODE=live + VITE_BFF_FALLBACK=strict → "real" mode:
//       transport failure surfaces as a typed BffError; mock seeds are
//       NEVER substituted in this mode. 4xx responses always propagate.
//
// Detail (`get(id)`) calls bypass `bff-v1/lists.ts` because that layer only
// covers list endpoints. They use `withLiveOrMock` directly with the
// canonical `/bff/<resource>/{id}` paths defined in `bff-v1/paths.ts`.

import type { ListEnvelope } from "@/lib/bff-v1";
import {
  paths,
  lists as bffV1Lists,
  withLiveOrMock,
  liveStatus,
} from "@/lib/bff-v1";
import { bff as seedBff } from "@/lib/bff-v1/seed";
import type {
  Strategy,
  Persona,
  CapitalPool,
  RankingFormula,
  Rebalance,
  Deployment,
  EvolutionProgram,
  ResearchExperiment,
  Artifact,
  Tool,
  McpServer,
  McpTool,
  Skill,
  Channel,
  Job,
  Runtime,
  Alert,
  Incident,
  ApprovalRequest,
  AuditEvent,
} from "@/lib/bff/types";

// ---------- Mode helpers ----------

export type ManagementMode = "mock" | "hybrid" | "real";

const truthy = (v: unknown): boolean =>
  ["1", "true", "yes", "on"].includes(String(v ?? "").trim().toLowerCase());

function readEnv(): Record<string, string | undefined> {
  const viteEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  const nodeEnv = typeof process !== "undefined" ? process.env : {};
  return { ...viteEnv, ...nodeEnv };
}

/** Detect the management read mode from env.
 *  - `mock`  : configured mode is mock (default; also used by tests).
 *  - `real`  : configured mode is live AND VITE_BFF_FALLBACK=strict.
 *  - `hybrid`: configured mode is live with default `auto` fallback. */
export function detectManagementMode(): ManagementMode {
  const env = readEnv();
  if (env.MODE === "test" || env.NODE_ENV === "test") return "mock";
  if (env.VITE_BFF_MODE !== "live") return "mock";
  return env.VITE_BFF_FALLBACK === "strict" ? "real" : "hybrid";
}

/** True if the runtime is currently allowed to silently mock on transport failure.
 *  In `real` mode this returns false (the transport will throw instead). */
export function isHybridFallbackEnabled(): boolean {
  return detectManagementMode() === "hybrid";
}

/** True if the runtime configuration forbids silent mock fallback.
 *  Use this from UI banners to label the "live, no-fallback" mode. */
export function isStrictRealMode(): boolean {
  return detectManagementMode() === "real";
}

// ---------- Detail helper ----------

/** Build a `(id) => Promise<T | undefined>` reader that prefers live BFF and
 *  falls back to mock per the configured fallback mode. Mock returns
 *  `undefined` when the id is unknown; live BFF returns 404 → BffError
 *  (propagated to caller). */
function liveOrMockDetail<T>(
  pathFor: (id: string) => string,
  loader: (id: string) => Promise<T | undefined>,
): (id: string) => Promise<T | undefined> {
  return (id) => {
    const mockFn = async (): Promise<T | undefined> => loader(id);
    return withLiveOrMock<T | undefined>({ method: "GET", path: pathFor(id) }, mockFn);
  };
}

// ---------- Per-family adapters ----------

const strategies = {
  list:  bffV1Lists.strategies as () => Promise<ListEnvelope<Strategy>>,
  get:   liveOrMockDetail<Strategy>(paths.strategy, (id) => seedBff.strategies.get(id)),
};

const personas = {
  list:  bffV1Lists.personas as () => Promise<ListEnvelope<Persona>>,
  get:   liveOrMockDetail<Persona>(paths.persona, (id) => seedBff.personas.get(id)),
};

const capitalPools = {
  list:  bffV1Lists.capitalPools as () => Promise<ListEnvelope<CapitalPool>>,
  get:   liveOrMockDetail<CapitalPool>(paths.capitalPool, (id) => seedBff.capitalPools.get(id)),
};

const rankingFormulas = {
  list:  bffV1Lists.rankingFormulas as () => Promise<ListEnvelope<RankingFormula>>,
  get:   liveOrMockDetail<RankingFormula>(paths.rankingFormulas, (id) => seedBff.rankingFormulas.get(id)),
};

const rebalances = {
  list:  bffV1Lists.rebalances as () => Promise<ListEnvelope<Rebalance>>,
  get:   liveOrMockDetail<Rebalance>(paths.rebalance, (id) => seedBff.rebalances.get(id)),
};

const deployments = {
  list:  bffV1Lists.deployments as () => Promise<ListEnvelope<Deployment>>,
  get:   liveOrMockDetail<Deployment>(paths.deployment, (id) => seedBff.deployments.get(id)),
};

const evolution = {
  list:  bffV1Lists.evolution as () => Promise<ListEnvelope<EvolutionProgram>>,
  get:   liveOrMockDetail<EvolutionProgram>(paths.evolutionProgram, (id) => seedBff.evolution.get(id)),
};

const research = {
  list:  bffV1Lists.research as () => Promise<ListEnvelope<ResearchExperiment>>,
  get:   liveOrMockDetail<ResearchExperiment>(
    (id) => `${paths.researchExperiments()}/${encodeURIComponent(id)}`,
    (id) => seedBff.research.get(id),
  ),
};

const artifacts = {
  list:  bffV1Lists.artifacts as () => Promise<ListEnvelope<Artifact>>,
  get:   liveOrMockDetail<Artifact>(paths.artifact, (id) => seedBff.artifacts.get(id)),
};

const tools = {
  list:  bffV1Lists.tools as () => Promise<ListEnvelope<Tool>>,
  get:   liveOrMockDetail<Tool>(
    (id) => `${paths.tools()}/${encodeURIComponent(id)}`,
    (id) => seedBff.tools.get(id),
  ),
};

const mcpServers = {
  list:  bffV1Lists.mcpServers as () => Promise<ListEnvelope<McpServer>>,
  get:   liveOrMockDetail<McpServer>(
    (id) => `${paths.mcpServers()}/${encodeURIComponent(id)}`,
    (id) => seedBff.mcpServers.get(id),
  ),
};

const mcpTools = {
  list:  bffV1Lists.mcpTools as () => Promise<ListEnvelope<McpTool>>,
  get:   liveOrMockDetail<McpTool>(
    (id) => `${paths.mcpTools()}/${encodeURIComponent(id)}`,
    (id) => seedBff.mcpTools.get(id),
  ),
};

const skills = {
  list:  bffV1Lists.skills as () => Promise<ListEnvelope<Skill>>,
  get:   liveOrMockDetail<Skill>(
    (id) => `${paths.skills()}/${encodeURIComponent(id)}`,
    (id) => seedBff.skills.get(id),
  ),
};

const channels = {
  list:  bffV1Lists.channels as () => Promise<ListEnvelope<Channel>>,
  get:   liveOrMockDetail<Channel>(
    (id) => `${paths.channels()}/${encodeURIComponent(id)}`,
    (id) => seedBff.channels.get(id),
  ),
};

const jobs = {
  list:  bffV1Lists.jobs as () => Promise<ListEnvelope<Job>>,
  get:   liveOrMockDetail<Job>(paths.job, async () => undefined),
};

const runtimes = {
  list:  bffV1Lists.runtimes as () => Promise<ListEnvelope<Runtime>>,
  get:   liveOrMockDetail<Runtime>(
    (id) => `${paths.runtimes()}/${encodeURIComponent(id)}`,
    (id) => seedBff.runtimes.get(id),
  ),
};

const alerts = {
  list:  bffV1Lists.alerts as () => Promise<ListEnvelope<Alert>>,
  get:   liveOrMockDetail<Alert>(
    (id) => `${paths.alerts()}/${encodeURIComponent(id)}`,
    (id) => seedBff.alerts.get(id),
  ),
};

const incidents = {
  list:  bffV1Lists.incidents as () => Promise<ListEnvelope<Incident>>,
  get:   liveOrMockDetail<Incident>(paths.incident, (id) => seedBff.incidents.get(id)),
};

const approvals = {
  list:  bffV1Lists.approvals as () => Promise<ListEnvelope<ApprovalRequest>>,
  get:   liveOrMockDetail<ApprovalRequest>(paths.approval, (id) => seedBff.approvals.get(id)),
};

const audit = {
  list:  bffV1Lists.audit as () => Promise<ListEnvelope<AuditEvent>>,
};

// ---------- Public surface ----------

/** Canonical Management Console read surface — list + detail per family,
 *  with hybrid/real/mock mode behaviour governed by environment. */
export const managementClient = {
  strategies,
  personas,
  capitalPools,
  rankingFormulas,
  rebalances,
  deployments,
  evolution,
  research,
  artifacts,
  tools,
  mcpServers,
  mcpTools,
  skills,
  channels,
  jobs,
  runtimes,
  alerts,
  incidents,
  approvals,
  audit,
} as const;

export type ManagementFamily = keyof typeof managementClient;

/** All Management Console families that expose a `list()` reader. */
export const MANAGEMENT_FAMILIES: readonly ManagementFamily[] = [
  "strategies", "personas", "capitalPools", "rankingFormulas",
  "rebalances", "deployments", "evolution", "research", "artifacts",
  "tools", "mcpServers", "mcpTools", "skills", "channels",
  "jobs", "runtimes", "alerts", "incidents", "approvals", "audit",
] as const;

/** Snapshot of the current live-status, useful for UI banners that show
 *  "live failed → using mock" or "live OK". Re-exported here so callers
 *  do not need to depend on `bff-v1` directly. */
export function getLiveStatusSnapshot(): {
  managementMode: ManagementMode;
  effective: "mock" | "live";
  lastError?: string;
  fellBackAt?: number;
} {
  const s = liveStatus.get();
  return {
    managementMode: detectManagementMode(),
    effective: s.effective,
    lastError: s.lastError,
    fellBackAt: s.fellBackAt,
  };
}

export type { ListEnvelope } from "@/lib/bff-v1";
