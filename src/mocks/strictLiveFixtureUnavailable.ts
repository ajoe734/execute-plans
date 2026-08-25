// Strict-live production builds must never package the mock fixture graph.
//
// This module resolves `@/mocks/seed` only while VITE_BFF_MODE=live and
// VITE_BFF_FALLBACK=strict. The values deliberately fail when read: a future
// strict-live caller that bypasses its canonical BFF path must render a typed
// unavailable state rather than silently receiving an empty or successful mock
// response. Mock, test, and auto-fallback builds continue resolving seed.ts.

const fixtureUnavailable = (name: string): never => {
  throw new Error(`Mock fixture '${name}' is unavailable in a strict-live build.`);
};

const unavailableList = (name: string): never[] => new Proxy([], {
  get: () => fixtureUnavailable(name),
  ownKeys: () => fixtureUnavailable(name),
}) as never[];

export const strategies = unavailableList("strategies");
export const personas = unavailableList("personas");
export const capitalPools = unavailableList("capitalPools");
export const rankingFormulas = unavailableList("rankingFormulas");
export const rebalances = unavailableList("rebalances");
export const evolutionPrograms = unavailableList("evolutionPrograms");
export const researchExperiments = unavailableList("researchExperiments");
export const artifacts = unavailableList("artifacts");
export const deployments = unavailableList("deployments");
export const runtimes = unavailableList("runtimes");
export const jobs = unavailableList("jobs");
export const alerts = unavailableList("alerts");
export const incidents = unavailableList("incidents");
export const approvals = unavailableList("approvals");
export const auditEvents = unavailableList("auditEvents");
export const tools = unavailableList("tools");
export const mcpServers = unavailableList("mcpServers");
export const mcpTools = unavailableList("mcpTools");
export const skills = unavailableList("skills");
export const channels = unavailableList("channels");
export const routePolicies = unavailableList("routePolicies");
export const policyVersions = unavailableList("policyVersions");
export const permissionMatrices = unavailableList("permissionMatrices");
export const memoryUpdates = unavailableList("memoryUpdates");
export const consultRules = unavailableList("consultRules");
export const evolutionRuns = unavailableList("evolutionRuns");
export const evolutionCandidates = unavailableList("evolutionCandidates");
export const fitnessFormulas = unavailableList("fitnessFormulas");
export const mutationRules = unavailableList("mutationRules");
export const allocationSimulations = unavailableList("allocationSimulations");
export const policyViolations = unavailableList("policyViolations");
export const evaluationRuns = unavailableList("evaluationRuns");
export const objectVersions = unavailableList("objectVersions");
export const featureSets = unavailableList("featureSets");
export const performanceSeries = unavailableList("performanceSeries");
export const watchers = unavailableList("watchers");
export const decisionJournal = unavailableList("decisionJournal");
export const allocationLimits = unavailableList("allocationLimits");
export const poolFreezes = unavailableList("poolFreezes");
export const deploymentStages = unavailableList("deploymentStages");
export const mcpSecrets = unavailableList("mcpSecrets");
export const promotions = unavailableList("promotions");
export const metricFreezes = unavailableList("metricFreezes");
export const rebalanceOverrides = unavailableList("rebalanceOverrides");

export const rebalanceWorkflowSteps = (): never[] => fixtureUnavailable("rebalanceWorkflowSteps");
export const searchableObjects = (): never[] => fixtureUnavailable("searchableObjects");
export const tradeEpisodes = unavailableList("tradeEpisodes");
export const tradeReflections = unavailableList("tradeReflections");
export const tradePatterns = unavailableList("tradePatterns");
