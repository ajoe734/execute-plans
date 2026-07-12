import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/i18n";

import { PlatformShell } from "@/platform/PlatformShell";
import { ManagementLayout } from "@/management/ManagementLayout";
import { AgoraLayout } from "@/agora/AgoraLayout";
import { TradingDeskLayout } from "@/agora/TradingDeskLayout";
import { StrategyWorkshopPage } from "@/agora/pages/strategy-workshop/StrategyWorkshopPage";
import { TradingRoomPage } from "@/agora/pages/trading-room/TradingRoomPage";
import { StrategyDetail } from "@/management/pages/StrategyDetail";
import { PersonaDetail } from "@/management/pages/PersonaDetail";
import PersonaOnboarding from "@/management/pages/PersonaOnboarding";
import { CapitalPoolDetail } from "@/management/pages/CapitalPoolDetail";
import { RankingFormulaDetail } from "@/management/pages/RankingFormulaDetail";
import { RebalanceDetail } from "@/management/pages/RebalanceDetail";
import { EvolutionDetail } from "@/management/pages/EvolutionDetail";
import { ResearchDetail } from "@/management/pages/ResearchDetail";
import { ArtifactDetail } from "@/management/pages/ArtifactDetail";
import { DeploymentDetail } from "@/management/pages/DeploymentDetail";
import { RuntimesPage } from "@/management/pages/Runtimes";
import { ToolsList, McpServersList, SkillsList, ChannelsList } from "@/management/pages/CapabilitiesLists";
import { ToolDetail } from "@/management/pages/ToolDetail";
import { McpServerDetail, McpToolDetail } from "@/management/pages/McpDetail";
import { SkillDetail } from "@/management/pages/SkillDetail";
import { ChannelDetail } from "@/management/pages/ChannelDetail";
import {
  StrategiesList, PersonasList, CapitalPoolsList, RankingFormulasList,
  RebalancesList, DeploymentsList, EvolutionList, ResearchList, ArtifactsList,
} from "@/management/pages/Lists";
import {
  JobsPage, AlertsPage, IncidentsPage, ApprovalsPage, AuditPage,
} from "@/management/pages/Operations";

import { CommitteeRoom } from "@/agora/pages/CommitteeRoom";
import { SignalDetail } from "@/agora/pages/SignalDetail";
// CommandCenter import removed — Pack E E7 redirects /management/command-center to /management/control-room.
import { RiskCenter } from "@/management/pages/RiskCenter";
import { IncidentDetail } from "@/management/pages/IncidentDetail";
import { GovernanceReview } from "@/management/pages/GovernanceReview";
import { RoutePoliciesList } from "@/management/pages/governance/RoutePoliciesList";
import { RoutePolicyDetail } from "@/management/pages/governance/RoutePolicyDetail";
import { PermissionMatrixPage } from "@/management/pages/governance/PermissionMatrixPage";
import { MemoryGovernancePage } from "@/management/pages/governance/MemoryGovernancePage";
import { ConsultRulesPage } from "@/management/pages/governance/ConsultRulesPage";
import { DailyBrief } from "@/agora/pages/DailyBrief";
import { AskPersonas } from "@/agora/pages/AskPersonas";
import { Notebook } from "@/agora/pages/Notebook";
import { Markets } from "@/agora/pages/Markets";
import { Watchlist } from "@/agora/pages/Watchlist";
import { SignalReview } from "@/agora/pages/SignalReview";
import { AlertTriage } from "@/agora/pages/AlertTriage";
import { DecisionJournal } from "@/agora/pages/DecisionJournal";
import { InsightInbox } from "@/agora/pages/InsightInbox";
import { TrainerStudio } from "@/agora/pages/TrainerStudio";
import { MemoryReview } from "@/agora/pages/MemoryReview";
import { SkillCoaching } from "@/agora/pages/SkillCoaching";
import { PersonaLab } from "@/agora/pages/PersonaLab";
import { EvaluationSuites } from "@/agora/pages/EvaluationSuites";
import { AgoraChannels } from "@/agora/pages/AgoraChannels";
import { QAChecklist } from "@/platform/pages/QAChecklist";
import { AuditViewer } from "@/platform/pages/AuditViewer";
import { SettingsPage } from "@/management/pages/phase2/Settings";
import { LineageExplorerPage } from "@/management/pages/phase2/LineageExplorer";
import { KnowledgeInboxPage } from "@/management/pages/phase2/KnowledgeInbox";
import { PostmortemLibraryPage } from "@/management/pages/phase2/PostmortemLibrary";
import { GovernanceQueuePage } from "@/management/pages/phase2/GovernanceQueue";
import { RankingDashboardPage } from "@/management/pages/phase2/RankingDashboard";
import { WorkflowTemplatesPage } from "@/management/pages/phase2/WorkflowTemplates";
import { HookCronManagerPage } from "@/management/pages/phase2/HookCronManager";
import { AlphaFactoryBoardPage } from "@/management/pages/phase2/AlphaFactoryBoard";
import { LoopsPage } from "@/management/pages/v5/V5Pages";
// Studios: only the two cross-entity/sandbox tools that have no equivalent on the
// per-entity detail pages are kept (FormulaStudio A/B-compare+backtest, SkillSandbox
// test harness). The per-entity studios were removed — operate on the detail page.
import { FormulaStudio } from "@/management/pages/studios/FormulaStudio";
import { SkillSandboxStudio } from "@/management/pages/studios/SkillSandboxStudio";
import { ExecutionLoopPage } from "@/management/pages/v5/ExecutionLoop";
import { OptimizationLoopPage } from "@/management/pages/v5/OptimizationLoop";
import { ResearchLoopPage } from "@/management/pages/v5/ResearchLoop";
import { SentinelPage } from "@/management/pages/v5/Sentinel";
import { InterventionsPage } from "@/management/pages/v5/Interventions";
// 2026-05-20 Management revamp — One Ring Oversight IA (stubs from M1; replaced in M2+).
import {
  OneRingCockpitPage,
  PersonaFleetPage,
  HumanInboxPage,
  TradingPulsePage,
  EvolutionJournalPage,
  EvidenceExplorerPage,
  EvidencePacketDetailPage,
  PersonaIntentTracesPage,
  PersonaIntentTraceDetailPage,
  BrokerLiveReadinessPage,
  CapitalBindingLiveReadinessPage,
  BffHaReadinessPage,
  StrictPublishAuditPage,
  DataSourceManagementPage,
  Ep5CanaryReadinessPage,
  HumanGateDetailPage,
} from "@/management/pages/oversight/_stubs";
// 2026-05-22 PM-12 — Performance & League pages.
import { PortfolioBookPage } from "@/management/pages/oversight/PortfolioBook";
import { PersonaLeaguePage } from "@/management/pages/oversight/PersonaLeague";
import { QuarterlyRankingPage } from "@/management/pages/oversight/QuarterlyRanking";
import { PerformanceAttributionPage } from "@/management/pages/oversight/PerformanceAttribution";
import { ManagementAgentRedirect } from "@/management/pages/agent/ManagementAgentRedirect";
import AuthPage from "@/pages/Auth";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { ProtectedRoute } from "@/lib/auth/ProtectedRoute";
import NotFound from "./pages/NotFound";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient();

function TradingRoomRoute() {
  const navigate = useNavigate();
  const { strategyId } = useParams<{ strategyId?: string }>();
  const [searchParams] = useSearchParams();
  const strategyVersion = searchParams.get("strategyVersion") ?? undefined;
  const suffix = strategyVersion ? `?strategyVersion=${encodeURIComponent(strategyVersion)}` : "";

  return (
    <TradingRoomPage
      onBackToWorkshop={() => navigate("/agora/strategy-workshop")}
      onStrategySelect={(nextStrategyId) =>
        navigate(nextStrategyId ? `/agora/trading-room/${encodeURIComponent(nextStrategyId)}${suffix}` : "/agora/trading-room")
      }
      strategyId={strategyId}
      strategyVersion={strategyVersion}
    />
  );
}

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
          <Route path="/auth" element={<AuthPage />} />
          {/* TEST MODE: legacy /management/agent paths now redirect and open the floating panel. */}
          <Route path="/management/agent" element={<ManagementAgentRedirect />} />
          <Route path="/management/agent/:threadId" element={<ManagementAgentRedirect />} />

          <Route element={<PlatformShell />}>
            {/* Management Console */}
            <Route path="/management" element={<ManagementLayout />}>
              {/* 2026-05-20 PM-1 — Pathreon Management Cockpit is the canonical landing. */}
              <Route index element={<Navigate to="/management/cockpit" replace />} />
              <Route path="cockpit" element={<OneRingCockpitPage />} />
              {/* Console consolidation (2026-06-15): Cockpit is the single canonical
                  management console. Control Room / Command Center / Overview / One Ring
                  all redirect here. Loop-level detail lives under /loops, /sentinel,
                  /interventions. */}
              <Route path="control-room" element={<Navigate to="/management/cockpit" replace />} />
              <Route path="one-ring" element={<Navigate to="/management/cockpit" replace />} />

              <Route path="persona-fleet" element={<PersonaFleetPage />} />
              <Route path="human-inbox" element={<HumanInboxPage />} />
              <Route path="human-inbox/:id" element={<HumanGateDetailPage />} />
              <Route path="trading-pulse" element={<TradingPulsePage />} />
              <Route path="evolution-journal" element={<EvolutionJournalPage />} />
              <Route path="evidence" element={<EvidenceExplorerPage />} />
              <Route path="evidence/:id" element={<EvidencePacketDetailPage />} />
              <Route path="persona-intent" element={<PersonaIntentTracesPage />} />
              <Route path="persona-intent/:id" element={<PersonaIntentTraceDetailPage />} />
              <Route path="broker-live" element={<Navigate to="/management/readiness/broker-live" replace />} />
              <Route path="capital-live" element={<Navigate to="/management/readiness/capital-binding-live" replace />} />
              <Route path="readiness/ep5" element={<Ep5CanaryReadinessPage />} />
              <Route path="readiness/broker-live" element={<BrokerLiveReadinessPage />} />
              <Route path="readiness/capital-binding-live" element={<CapitalBindingLiveReadinessPage />} />
              <Route path="readiness/bff-ha" element={<BffHaReadinessPage />} />
              <Route path="readiness/strict-publish" element={<StrictPublishAuditPage />} />
              <Route path="data-sources" element={<DataSourceManagementPage />} />
              <Route path="system/bff-ha" element={<Navigate to="/management/readiness/bff-ha" replace />} />
              <Route path="system/strict-publish" element={<Navigate to="/management/readiness/strict-publish" replace />} />
              {/* ask page retired — redundant with the floating agent panel */}
              <Route path="ask" element={<Navigate to="/management/cockpit" replace />} />
              {/* PM-12 — Performance & League */}
              <Route path="portfolio-book" element={<PortfolioBookPage />} />
              <Route path="persona-league" element={<PersonaLeaguePage />} />
              <Route path="quarterly-ranking" element={<QuarterlyRankingPage />} />
              <Route path="performance-attribution" element={<PerformanceAttributionPage />} />
              {/* Legacy alias kept for ops review bookmarks → Cockpit. */}
              <Route path="control-room-legacy" element={<Navigate to="/management/cockpit" replace />} />
              <Route path="loops" element={<LoopsPage />} />
              <Route path="loops/execution" element={<ExecutionLoopPage />} />
              <Route path="loops/optimization" element={<OptimizationLoopPage />} />
              <Route path="loops/research" element={<ResearchLoopPage />} />
              <Route path="loops/:kind" element={<LoopsPage />} />
              <Route path="sentinel" element={<SentinelPage />} />
              <Route path="interventions" element={<InterventionsPage />} />
              <Route path="overview" element={<Navigate to="/management/cockpit" replace />} />
              <Route path="overview-legacy" element={<Navigate to="/management/cockpit" replace />} />
              {/* command-center folded into the single Cockpit console. */}
              <Route path="command-center" element={<Navigate to="/management/cockpit" replace />} />
              <Route path="risk-center" element={<Navigate to="/management/risk" replace />} />
              <Route path="risk" element={<RiskCenter />} />
              <Route path="strategies" element={<StrategiesList />} />
              <Route path="strategies/:id" element={<StrategyDetail />} />
              <Route path="personas" element={<PersonasList />} />
              <Route path="personas/:id" element={<PersonaDetail />} />
              <Route path="personas/:id/onboarding" element={<PersonaOnboarding />} />
              <Route path="capital" element={<CapitalPoolsList />} />
              <Route path="capital/:id" element={<CapitalPoolDetail />} />
              <Route path="capital-pools" element={<Navigate to="/management/capital" replace />} />
              <Route path="capital-pools/:id" element={<CapitalPoolDetail />} />
              <Route path="ranking" element={<RankingDashboardPage />} />
              <Route path="ranking/formulas" element={<RankingFormulasList />} />
              <Route path="ranking/formulas/:id" element={<RankingFormulaDetail />} />
              <Route path="ranking-formulas" element={<Navigate to="/management/ranking/formulas" replace />} />
              <Route path="ranking-formulas/:id" element={<RankingFormulaDetail />} />
              <Route path="rebalance" element={<RebalancesList />} />
              <Route path="rebalance/:id" element={<RebalanceDetail />} />
              <Route path="rebalances" element={<Navigate to="/management/rebalance" replace />} />
              <Route path="rebalances/:id" element={<RebalanceDetail />} />
              <Route path="evolution" element={<EvolutionList />} />
              <Route path="evolution/:id" element={<EvolutionDetail />} />
              <Route path="experiments" element={<ResearchList />} />
              <Route path="experiments/:id" element={<ResearchDetail />} />
              <Route path="research" element={<Navigate to="/management/experiments" replace />} />
              <Route path="research/:id" element={<ResearchDetail />} />
              <Route path="artifacts" element={<ArtifactsList />} />
              <Route path="artifacts/:id" element={<ArtifactDetail />} />
              <Route path="incidents/:id" element={<IncidentDetail />} />
              <Route path="governance" element={<GovernanceQueuePage />} />
              <Route path="governance/policies" element={<RoutePoliciesList />} />
              <Route path="governance/policies/:id" element={<RoutePolicyDetail />} />
              <Route path="governance/permissions" element={<PermissionMatrixPage />} />
              <Route path="governance/memory" element={<MemoryGovernancePage />} />
              <Route path="governance/consult" element={<ConsultRulesPage />} />
              <Route path="governance/:id" element={<GovernanceReview />} />
              <Route path="knowledge" element={<KnowledgeInboxPage />} />
              <Route path="postmortems" element={<PostmortemLibraryPage />} />
              <Route path="lineage" element={<LineageExplorerPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="alpha-factory" element={<AlphaFactoryBoardPage />} />
              <Route path="workflows" element={<WorkflowTemplatesPage />} />
              <Route path="hooks" element={<HookCronManagerPage />} />
              <Route path="deployments" element={<DeploymentsList />} />
              <Route path="deployments/:id" element={<DeploymentDetail />} />
              <Route path="deployment" element={<DeploymentsList />} />
              <Route path="deployment/:id" element={<DeploymentDetail />} />
              <Route path="runtimes" element={<RuntimesPage />} />
              <Route path="jobs" element={<JobsPage />} />
              <Route path="alerts" element={<AlertsPage />} />
              <Route path="incidents" element={<IncidentsPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="approvals" element={<ApprovalsPage />} />
              <Route path="tools" element={<ToolsList />} />
              <Route path="tools/:id" element={<ToolDetail />} />
              <Route path="mcp" element={<McpServersList />} />
              <Route path="mcp/:id" element={<McpServerDetail />} />
              <Route path="mcp-tools/:id" element={<McpToolDetail />} />
              <Route path="skills" element={<SkillsList />} />
              <Route path="skills/:id" element={<SkillDetail />} />
              <Route path="channels" element={<ChannelsList />} />
              <Route path="channels/:id" element={<ChannelDetail />} />
              {/* 2026-06-15 cleanup — per-entity Studios removed (operate on the
                  detail page). Kept: the two tools with no detail-page equivalent. */}
              <Route path="studios/formula" element={<FormulaStudio />} />
              <Route path="studios/skill-sandbox" element={<SkillSandboxStudio />} />
            </Route>

            {/* TradingDesk — three-tab shell (trading-room, strategy-workshop, strategy-performance).
                Separate from AgoraLayout so it renders its own CommandBar/TabBar/ServantDrawer/BottomStrip. */}
            <Route path="/agora" element={<TradingDeskLayout />}>
              <Route path="trading-room" element={<TradingRoomRoute />} />
              <Route path="trading-room/:strategyId" element={<TradingRoomRoute />} />
              <Route path="strategy-workshop" element={<StrategyWorkshopPage />} />
              <Route path="strategy-workshop/:workshopId" element={<StrategyWorkshopPage />} />
              <Route path="strategy-performance" element={<div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">策略執行與績效 — 即將推出</div>} />
            </Route>

            {/* Agora Workbench */}
            <Route path="/agora" element={<AgoraLayout />}>
              <Route index element={<DailyBrief />} />
              <Route path="daily" element={<DailyBrief />} />
              <Route path="markets" element={<Markets />} />
              <Route path="watchlist" element={<Watchlist />} />
              <Route path="market" element={<Navigate to="/agora/markets" replace />} />
              <Route path="signals" element={<SignalReview />} />
              <Route path="signals/:id" element={<SignalDetail />} />
              <Route path="triage" element={<AlertTriage />} />
              <Route path="notebook" element={<Notebook />} />
              <Route path="ask" element={<AskPersonas />} />
              <Route path="committee" element={<CommitteeRoom />} />
              <Route path="committee/:sessionId" element={<CommitteeRoom />} />
              <Route path="journal" element={<DecisionJournal />} />
              <Route path="decisions" element={<Navigate to="/agora/journal" replace />} />
              <Route path="insights" element={<InsightInbox />} />
              <Route path="trainer" element={<TrainerStudio />} />
              <Route path="trainer/:personaId" element={<TrainerStudio />} />
              <Route path="memory" element={<MemoryReview />} />
              <Route path="skill-coaching" element={<SkillCoaching />} />
              <Route path="skills" element={<Navigate to="/agora/skill-coaching" replace />} />
              <Route path="persona-lab" element={<PersonaLab />} />
              <Route path="evaluations" element={<EvaluationSuites />} />
              <Route path="eval" element={<Navigate to="/agora/evaluations" replace />} />
              <Route path="channels" element={<AgoraChannels />} />
            </Route>

            {/* Dev-only QA harness — not mounted in production builds. */}
            {import.meta.env.DEV && <Route path="/qa" element={<QAChecklist />} />}
            <Route path="/audits" element={<AuditViewer />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
        </ErrorBoundary>
        </AuthProvider>

      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
