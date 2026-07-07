import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/i18n";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { lazyNamedRoute, lazyRoute } from "@/routes/lazyRoute";

const queryClient = new QueryClient();

const PlatformShellRoute = lazyNamedRoute(() => import("@/platform/PlatformShell"), "PlatformShell", "Platform shell");
const ManagementLayoutRoute = lazyNamedRoute(() => import("@/management/ManagementLayout"), "ManagementLayout", "Management shell");
const AuthRoute = lazyRoute(() => import("@/pages/Auth"), "Auth");
const NotFoundRoute = lazyRoute(() => import("@/pages/NotFound"), "Not found");
const AuditViewerRoute = lazyNamedRoute(() => import("@/platform/pages/AuditViewer"), "AuditViewer", "Audit viewer");
const QAChecklistRoute = lazyNamedRoute(() => import("@/platform/pages/QAChecklist"), "QAChecklist", "QA checklist");

const ManagementAgentRedirectRoute = lazyNamedRoute(
  () => import("@/routes/management/agent"),
  "ManagementAgentRedirectRoute",
  "Management agent redirect",
);

const CockpitRoute = lazyNamedRoute(() => import("@/routes/management/oversight"), "CockpitRoute", "Management cockpit");
const PersonaFleetRoute = lazyNamedRoute(() => import("@/routes/management/oversight"), "PersonaFleetRoute", "Persona fleet");
const HumanInboxRoute = lazyNamedRoute(() => import("@/routes/management/oversight"), "HumanInboxRoute", "Human inbox");
const HumanGateDetailRoute = lazyNamedRoute(() => import("@/routes/management/oversight"), "HumanGateDetailRoute", "Human gate detail");
const TradingPulseRoute = lazyNamedRoute(() => import("@/routes/management/oversight"), "TradingPulseRoute", "Trading pulse");
const EvolutionJournalRoute = lazyNamedRoute(() => import("@/routes/management/oversight"), "EvolutionJournalRoute", "Evolution journal");
const PersonaIntentTracesRoute = lazyNamedRoute(() => import("@/routes/management/oversight"), "PersonaIntentTracesRoute", "Persona intent");
const PersonaIntentTraceDetailRoute = lazyNamedRoute(
  () => import("@/routes/management/oversight"),
  "PersonaIntentTraceDetailRoute",
  "Persona intent detail",
);

const EvidenceExplorerRoute = lazyNamedRoute(() => import("@/routes/management/evidence"), "EvidenceExplorerRoute", "Evidence explorer");
const EvidencePacketDetailRoute = lazyNamedRoute(
  () => import("@/routes/management/evidence"),
  "EvidencePacketDetailRoute",
  "Evidence packet detail",
);

const PortfolioBookRoute = lazyNamedRoute(() => import("@/routes/management/performance"), "PortfolioBookRoute", "Portfolio book");
const PromotionAllocationRoute = lazyNamedRoute(
  () => import("@/routes/management/performance"),
  "PromotionAllocationRoute",
  "Promotion allocation",
);
const PerformanceAttributionRoute = lazyNamedRoute(
  () => import("@/routes/management/performance"),
  "PerformanceAttributionRoute",
  "Performance attribution",
);

const Ep5CanaryReadinessRoute = lazyNamedRoute(() => import("@/routes/management/readiness"), "Ep5CanaryReadinessRoute", "EP5 readiness");
const BrokerLiveReadinessRoute = lazyNamedRoute(() => import("@/routes/management/readiness"), "BrokerLiveReadinessRoute", "Broker live readiness");
const CapitalBindingLiveReadinessRoute = lazyNamedRoute(
  () => import("@/routes/management/readiness"),
  "CapitalBindingLiveReadinessRoute",
  "Capital binding readiness",
);
const BffHaReadinessRoute = lazyNamedRoute(() => import("@/routes/management/readiness"), "BffHaReadinessRoute", "BFF HA readiness");
const StrictPublishAuditRoute = lazyNamedRoute(() => import("@/routes/management/readiness"), "StrictPublishAuditRoute", "Strict publish audit");
const DataSourceManagementRoute = lazyNamedRoute(() => import("@/routes/management/readiness"), "DataSourceManagementRoute", "Data sources");
const OpenClawLlmAuthRoute = lazyNamedRoute(() => import("@/routes/management/readiness"), "OpenClawLlmAuthRoute", "LLM provider auth");

const LoopsRoute = lazyNamedRoute(() => import("@/routes/management/v5"), "LoopsRoute", "Loops");
const ExecutionLoopRoute = lazyNamedRoute(() => import("@/routes/management/v5"), "ExecutionLoopRoute", "Execution loop");
const OptimizationLoopRoute = lazyNamedRoute(() => import("@/routes/management/v5"), "OptimizationLoopRoute", "Optimization loop");
const ResearchLoopRoute = lazyNamedRoute(() => import("@/routes/management/v5"), "ResearchLoopRoute", "Research loop");
const SentinelRoute = lazyNamedRoute(() => import("@/routes/management/v5"), "SentinelRoute", "Sentinel");
const InterventionsRoute = lazyNamedRoute(() => import("@/routes/management/v5"), "InterventionsRoute", "Interventions");

const StrategiesListRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "StrategiesListRoute", "Strategies");
const StrategyDetailRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "StrategyDetailRoute", "Strategy detail");
const PersonasListRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "PersonasListRoute", "Personas");
const PersonaDetailRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "PersonaDetailRoute", "Persona detail");
const PersonaOnboardingRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "PersonaOnboardingRoute", "Persona onboarding");
const CapitalPoolsListRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "CapitalPoolsListRoute", "Capital pools");
const CapitalPoolDetailRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "CapitalPoolDetailRoute", "Capital pool detail");
const RankingFormulasListRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "RankingFormulasListRoute", "Ranking formulas");
const RankingFormulaDetailRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "RankingFormulaDetailRoute", "Ranking formula detail");
const RebalanceDetailRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "RebalanceDetailRoute", "Rebalance detail");
const EvolutionListRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "EvolutionListRoute", "Evolution");
const EvolutionDetailRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "EvolutionDetailRoute", "Evolution detail");
const ResearchListRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "ResearchListRoute", "Research");
const ResearchDetailRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "ResearchDetailRoute", "Research detail");
const ArtifactsListRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "ArtifactsListRoute", "Artifacts");
const ArtifactDetailRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "ArtifactDetailRoute", "Artifact detail");
const DeploymentsListRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "DeploymentsListRoute", "Deployments");
const DeploymentDetailRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "DeploymentDetailRoute", "Deployment detail");
const RuntimesRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "RuntimesRoute", "Runtimes");
const ToolsListRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "ToolsListRoute", "Tools");
const ToolDetailRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "ToolDetailRoute", "Tool detail");
const McpServersListRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "McpServersListRoute", "MCP servers");
const McpServerDetailRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "McpServerDetailRoute", "MCP server detail");
const McpToolDetailRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "McpToolDetailRoute", "MCP tool detail");
const SkillsListRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "SkillsListRoute", "Skills");
const SkillDetailRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "SkillDetailRoute", "Skill detail");
const ChannelsListRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "ChannelsListRoute", "Channels");
const ChannelDetailRoute = lazyNamedRoute(() => import("@/routes/management/registry"), "ChannelDetailRoute", "Channel detail");

const JobsRoute = lazyNamedRoute(() => import("@/routes/management/operations"), "JobsRoute", "Jobs");
const AlertsRoute = lazyNamedRoute(() => import("@/routes/management/operations"), "AlertsRoute", "Alerts");
const IncidentsRoute = lazyNamedRoute(() => import("@/routes/management/operations"), "IncidentsRoute", "Incidents");
const IncidentDetailRoute = lazyNamedRoute(() => import("@/routes/management/operations"), "IncidentDetailRoute", "Incident detail");
const ApprovalsRoute = lazyNamedRoute(() => import("@/routes/management/operations"), "ApprovalsRoute", "Approvals");
const AuditRoute = lazyNamedRoute(() => import("@/routes/management/operations"), "AuditRoute", "Audit");
const RiskRoute = lazyNamedRoute(() => import("@/routes/management/operations"), "RiskRoute", "Risk");
const GovernanceQueueRoute = lazyNamedRoute(() => import("@/routes/management/operations"), "GovernanceQueueRoute", "Governance queue");
const GovernanceReviewRoute = lazyNamedRoute(() => import("@/routes/management/operations"), "GovernanceReviewRoute", "Governance review");
const RoutePoliciesRoute = lazyNamedRoute(() => import("@/routes/management/operations"), "RoutePoliciesRoute", "Route policies");
const RoutePolicyDetailRoute = lazyNamedRoute(() => import("@/routes/management/operations"), "RoutePolicyDetailRoute", "Route policy detail");
const PermissionMatrixRoute = lazyNamedRoute(() => import("@/routes/management/operations"), "PermissionMatrixRoute", "Permission matrix");
const MemoryGovernanceRoute = lazyNamedRoute(() => import("@/routes/management/operations"), "MemoryGovernanceRoute", "Memory governance");
const ConsultRulesRoute = lazyNamedRoute(() => import("@/routes/management/operations"), "ConsultRulesRoute", "Consult rules");

const RankingDashboardRoute = lazyNamedRoute(() => import("@/routes/management/phase2"), "RankingDashboardRoute", "Ranking dashboard");
const KnowledgeInboxRoute = lazyNamedRoute(() => import("@/routes/management/phase2"), "KnowledgeInboxRoute", "Knowledge inbox");
const PostmortemLibraryRoute = lazyNamedRoute(() => import("@/routes/management/phase2"), "PostmortemLibraryRoute", "Postmortems");
const LineageExplorerRoute = lazyNamedRoute(() => import("@/routes/management/phase2"), "LineageExplorerRoute", "Lineage");
const SettingsRoute = lazyNamedRoute(() => import("@/routes/management/phase2"), "SettingsRoute", "Settings");
const AlphaFactoryRoute = lazyNamedRoute(() => import("@/routes/management/phase2"), "AlphaFactoryRoute", "Alpha factory");
const WorkflowTemplatesRoute = lazyNamedRoute(() => import("@/routes/management/phase2"), "WorkflowTemplatesRoute", "Workflow templates");
const HookCronManagerRoute = lazyNamedRoute(() => import("@/routes/management/phase2"), "HookCronManagerRoute", "Hooks");

const FormulaStudioRoute = lazyNamedRoute(() => import("@/routes/management/studios"), "FormulaStudioRoute", "Formula studio");
const SkillSandboxRoute = lazyNamedRoute(() => import("@/routes/management/studios"), "SkillSandboxRoute", "Skill sandbox");

const AgoraLayoutRoute = lazyNamedRoute(() => import("@/routes/agora"), "AgoraLayoutRoute", "Agora shell");
const AgoraTradingRoomRoute = lazyNamedRoute(() => import("@/routes/agora"), "AgoraTradingRoomRoute", "Agora trading room");
const AgoraStrategyWorkshopRoute = lazyNamedRoute(() => import("@/routes/agora"), "AgoraStrategyWorkshopRoute", "Agora strategy workshop");
const AgoraStrategyPerformanceRoute = lazyNamedRoute(() => import("@/routes/agora"), "AgoraStrategyPerformanceRoute", "Agora strategy performance");

function DeploymentAliasRedirect() {
  const { id } = useParams<{ id?: string }>();
  const { search, hash } = useLocation();
  const target = id
    ? `/management/deployments/${encodeURIComponent(id)}`
    : "/management/deployments";
  return <Navigate to={`${target}${search}${hash}`} replace />;
}

// MGMT-GAP-008 — old detail aliases (capital-pools, ranking-formulas,
// rebalances, research) used to mount the canonical detail component a
// second time under the alias path instead of redirecting, per
// `DeploymentAliasRedirect` above (the one alias that already did this
// right). `makeDetailAliasRedirect` generalizes that pattern so bookmarked
// alias links land on the single canonical render instead of duplicating it.
function makeDetailAliasRedirect(canonicalListPath: string) {
  return function DetailAliasRedirect() {
    const { id } = useParams<{ id?: string }>();
    const { search, hash } = useLocation();
    const target = id
      ? `${canonicalListPath}/${encodeURIComponent(id)}`
      : canonicalListPath;
    return <Navigate to={`${target}${search}${hash}`} replace />;
  };
}

const CapitalPoolAliasRedirect = makeDetailAliasRedirect("/management/capital");
const RankingFormulaAliasRedirect = makeDetailAliasRedirect("/management/ranking/formulas");
const RebalanceAliasRedirect = makeDetailAliasRedirect("/management/rebalance");
const ResearchAliasRedirect = makeDetailAliasRedirect("/management/experiments");

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary scope="App">
            <Routes>
            <Route path="/" element={<Navigate to="/management" replace />} />
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/management/agent" element={<ManagementAgentRedirectRoute />} />
            <Route path="/management/agent/:threadId" element={<ManagementAgentRedirectRoute />} />

            <Route element={<PlatformShellRoute />}>
              <Route path="/management" element={<ManagementLayoutRoute />}>
                <Route index element={<Navigate to="/management/cockpit" replace />} />
                <Route path="cockpit" element={<CockpitRoute />} />
                <Route path="control-room" element={<Navigate to="/management/cockpit" replace />} />
                <Route path="one-ring" element={<Navigate to="/management/cockpit" replace />} />

                <Route path="persona-fleet" element={<PersonaFleetRoute />} />
                <Route path="human-inbox" element={<HumanInboxRoute />} />
                <Route path="human-inbox/:id" element={<HumanGateDetailRoute />} />
                <Route path="trading-pulse" element={<TradingPulseRoute />} />
                <Route path="evolution-journal" element={<EvolutionJournalRoute />} />
                <Route path="evidence" element={<EvidenceExplorerRoute />} />
                <Route path="evidence/:id" element={<EvidencePacketDetailRoute />} />
                <Route path="persona-intent" element={<PersonaIntentTracesRoute />} />
                <Route path="persona-intent/:id" element={<PersonaIntentTraceDetailRoute />} />

                <Route path="broker-live" element={<Navigate to="/management/readiness/broker-live" replace />} />
                <Route path="capital-live" element={<Navigate to="/management/readiness/capital-binding-live" replace />} />
                <Route path="readiness/ep5" element={<Ep5CanaryReadinessRoute />} />
                <Route path="readiness/broker-live" element={<BrokerLiveReadinessRoute />} />
                <Route path="readiness/capital-binding-live" element={<CapitalBindingLiveReadinessRoute />} />
                <Route path="readiness/bff-ha" element={<BffHaReadinessRoute />} />
                <Route path="readiness/strict-publish" element={<StrictPublishAuditRoute />} />
                <Route path="data-sources" element={<DataSourceManagementRoute />} />
                <Route path="llm-provider-auth" element={<OpenClawLlmAuthRoute />} />
                <Route path="openclaw-llm-auth" element={<Navigate to="/management/llm-provider-auth" replace />} />
                <Route path="system/bff-ha" element={<Navigate to="/management/readiness/bff-ha" replace />} />
                <Route path="system/strict-publish" element={<Navigate to="/management/readiness/strict-publish" replace />} />
                <Route path="ask" element={<Navigate to="/management/cockpit" replace />} />

                <Route path="portfolio-book" element={<PortfolioBookRoute />} />
                <Route path="promotion-allocation" element={<PromotionAllocationRoute />} />
                <Route path="persona-league" element={<Navigate to="/management/promotion-allocation?tab=real-ranking" replace />} />
                <Route path="quarterly-ranking" element={<Navigate to="/management/promotion-allocation?tab=paper-candidates" replace />} />
                <Route path="performance-attribution" element={<PerformanceAttributionRoute />} />

                <Route path="control-room-legacy" element={<Navigate to="/management/cockpit" replace />} />
                <Route path="loops" element={<LoopsRoute />} />
                <Route path="loops/execution" element={<ExecutionLoopRoute />} />
                <Route path="loops/optimization" element={<OptimizationLoopRoute />} />
                <Route path="loops/research" element={<ResearchLoopRoute />} />
                <Route path="loops/:kind" element={<LoopsRoute />} />
                <Route path="sentinel" element={<SentinelRoute />} />
                <Route path="interventions" element={<InterventionsRoute />} />
                <Route path="overview" element={<Navigate to="/management/cockpit" replace />} />
                <Route path="overview-legacy" element={<Navigate to="/management/cockpit" replace />} />
                <Route path="command-center" element={<Navigate to="/management/cockpit" replace />} />
                <Route path="risk-center" element={<Navigate to="/management/risk" replace />} />
                <Route path="risk" element={<RiskRoute />} />

                <Route path="strategies" element={<StrategiesListRoute />} />
                <Route path="strategies/:id" element={<StrategyDetailRoute />} />
                <Route path="personas" element={<PersonasListRoute />} />
                <Route path="personas/:id" element={<PersonaDetailRoute />} />
                <Route path="personas/:id/onboarding" element={<PersonaOnboardingRoute />} />
                <Route path="capital" element={<CapitalPoolsListRoute />} />
                <Route path="capital/:id" element={<CapitalPoolDetailRoute />} />
                <Route path="capital-pools" element={<Navigate to="/management/capital" replace />} />
                <Route path="capital-pools/:id" element={<CapitalPoolAliasRedirect />} />
                <Route path="ranking" element={<RankingDashboardRoute />} />
                <Route path="ranking/formulas" element={<RankingFormulasListRoute />} />
                <Route path="ranking/formulas/:id" element={<RankingFormulaDetailRoute />} />
                <Route path="ranking-formulas" element={<Navigate to="/management/ranking/formulas" replace />} />
                <Route path="ranking-formulas/:id" element={<RankingFormulaAliasRedirect />} />
                <Route path="rebalance" element={<Navigate to="/management/promotion-allocation?tab=quarterly-capital" replace />} />
                <Route path="rebalance/:id" element={<RebalanceDetailRoute />} />
                <Route path="rebalances" element={<Navigate to="/management/promotion-allocation?tab=quarterly-capital" replace />} />
                <Route path="rebalances/:id" element={<RebalanceAliasRedirect />} />
                <Route path="evolution" element={<EvolutionListRoute />} />
                <Route path="evolution/:id" element={<EvolutionDetailRoute />} />
                <Route path="experiments" element={<ResearchListRoute />} />
                <Route path="experiments/:id" element={<ResearchDetailRoute />} />
                <Route path="research" element={<Navigate to="/management/experiments" replace />} />
                <Route path="research/:id" element={<ResearchAliasRedirect />} />
                <Route path="artifacts" element={<ArtifactsListRoute />} />
                <Route path="artifacts/:id" element={<ArtifactDetailRoute />} />

                <Route path="incidents/:id" element={<IncidentDetailRoute />} />
                <Route path="governance" element={<GovernanceQueueRoute />} />
                <Route path="governance/policies" element={<RoutePoliciesRoute />} />
                <Route path="governance/policies/:id" element={<RoutePolicyDetailRoute />} />
                <Route path="governance/permissions" element={<PermissionMatrixRoute />} />
                <Route path="governance/memory" element={<MemoryGovernanceRoute />} />
                <Route path="governance/consult" element={<ConsultRulesRoute />} />
                <Route path="governance/:id" element={<GovernanceReviewRoute />} />
                <Route path="knowledge" element={<KnowledgeInboxRoute />} />
                <Route path="postmortems" element={<PostmortemLibraryRoute />} />
                <Route path="lineage" element={<LineageExplorerRoute />} />
                <Route path="settings" element={<SettingsRoute />} />
                <Route path="alpha-factory" element={<AlphaFactoryRoute />} />
                <Route path="workflows" element={<WorkflowTemplatesRoute />} />
                <Route path="hooks" element={<HookCronManagerRoute />} />

                <Route path="deployments" element={<DeploymentsListRoute />} />
                <Route path="deployments/:id" element={<DeploymentDetailRoute />} />
                <Route path="deployment" element={<DeploymentAliasRedirect />} />
                <Route path="deployment/:id" element={<DeploymentAliasRedirect />} />
                <Route path="runtimes" element={<RuntimesRoute />} />
                <Route path="jobs" element={<JobsRoute />} />
                <Route path="alerts" element={<AlertsRoute />} />
                <Route path="incidents" element={<IncidentsRoute />} />
                <Route path="audit" element={<AuditRoute />} />
                <Route path="approvals" element={<ApprovalsRoute />} />
                <Route path="tools" element={<ToolsListRoute />} />
                <Route path="tools/:id" element={<ToolDetailRoute />} />
                <Route path="mcp" element={<McpServersListRoute />} />
                <Route path="mcp/:id" element={<McpServerDetailRoute />} />
                <Route path="mcp-tools/:id" element={<McpToolDetailRoute />} />
                <Route path="skills" element={<SkillsListRoute />} />
                <Route path="skills/:id" element={<SkillDetailRoute />} />
                <Route path="channels" element={<ChannelsListRoute />} />
                <Route path="channels/:id" element={<ChannelDetailRoute />} />
                <Route path="studios/formula" element={<FormulaStudioRoute />} />
                <Route path="studios/skill-sandbox" element={<SkillSandboxRoute />} />
              </Route>

              {import.meta.env.DEV && <Route path="/qa" element={<QAChecklistRoute />} />}
              <Route path="/audits" element={<AuditViewerRoute />} />
            </Route>

            {/*
              Agora is an intentional standalone workbench shell, not a
              Management PlatformShell tab. It stays inside AuthProvider /
              TooltipProvider / ErrorBoundary (wrapped above) but owns its own
              top chrome via TradingDeskLayout instead of PlatformShell's
              Management TopBar/NotificationCenter/JobProgressDrawer/
              HandoffDrawer/RollbackSagaDrawer, none of which are Agora
              concerns. AgoraLayoutRoute preserves live/auth status through
              the shared LiveStatusBanner + useLiveSseConnection substrate.
            */}
            <Route path="/agora" element={<AgoraLayoutRoute />}>
              <Route index element={<Navigate to="/agora/trading-room" replace />} />
              <Route path="trading-room" element={<AgoraTradingRoomRoute />} />
              <Route path="trading-room/:strategyId" element={<AgoraTradingRoomRoute />} />
              <Route path="strategy-workshop" element={<AgoraStrategyWorkshopRoute />} />
              <Route path="strategy-workshop/:workshopId" element={<AgoraStrategyWorkshopRoute />} />
              <Route path="strategy-performance" element={<AgoraStrategyPerformanceRoute />} />
              <Route path="*" element={<Navigate to="/agora/trading-room" replace />} />
            </Route>

            <Route path="*" element={<NotFoundRoute />} />
            </Routes>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
