import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/i18n";

import { PlatformShell } from "@/platform/PlatformShell";
import { ManagementLayout } from "@/management/ManagementLayout";
import { AgoraLayout } from "@/agora/AgoraLayout";
import { ManagementOverview } from "@/management/pages/Overview";
import { StrategyDetail } from "@/management/pages/StrategyDetail";
import { PersonaDetail } from "@/management/pages/PersonaDetail";
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
import { Placeholder } from "@/platform/components/Placeholder";
import { CommitteeRoom } from "@/agora/pages/CommitteeRoom";
import { SignalDetail } from "@/agora/pages/SignalDetail";
import { CommandCenter } from "@/management/pages/CommandCenter";
import { RiskCenter } from "@/management/pages/RiskCenter";
import { IncidentDetail } from "@/management/pages/IncidentDetail";
import { GovernanceReview } from "@/management/pages/GovernanceReview";
import { DailyBrief } from "@/agora/pages/DailyBrief";
import { AskPersonas } from "@/agora/pages/AskPersonas";
import { Notebook } from "@/agora/pages/Notebook";
import { MarketWatchlist } from "@/agora/pages/MarketWatchlist";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/management" replace />} />

          <Route element={<PlatformShell />}>
            {/* Management Console */}
            <Route path="/management" element={<ManagementLayout />}>
              <Route index element={<CommandCenter />} />
              <Route path="overview" element={<ManagementOverview />} />
              <Route path="command-center" element={<CommandCenter />} />
              <Route path="risk-center" element={<RiskCenter />} />
              <Route path="risk" element={<Navigate to="/management/risk-center" replace />} />
              <Route path="strategies" element={<StrategiesList />} />
              <Route path="strategies/:id" element={<StrategyDetail />} />
              <Route path="personas" element={<PersonasList />} />
              <Route path="personas/:id" element={<PersonaDetail />} />
              <Route path="capital-pools" element={<CapitalPoolsList />} />
              <Route path="capital-pools/:id" element={<CapitalPoolDetail />} />
              <Route path="ranking-formulas" element={<RankingFormulasList />} />
              <Route path="ranking-formulas/:id" element={<RankingFormulaDetail />} />
              <Route path="rebalances" element={<RebalancesList />} />
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
              <Route path="governance" element={<Navigate to="/management/approvals" replace />} />
              <Route path="governance/:id" element={<GovernanceReview />} />
              <Route path="deployments" element={<DeploymentsList />} />
              <Route path="deployments/:id" element={<DeploymentDetail />} />
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
            </Route>

            {/* Agora Workbench */}
            <Route path="/agora" element={<AgoraLayout />}>
              <Route index element={<DailyBrief />} />
              <Route path="market" element={<MarketWatchlist />} />
              <Route path="signals" element={<SignalReview />} />
              <Route path="signals/:id" element={<SignalDetail />} />
              <Route path="triage" element={<AlertTriage />} />
              <Route path="notebook" element={<Notebook />} />
              <Route path="ask" element={<AskPersonas />} />
              <Route path="committee" element={<Placeholder title="Committee Room" hint="Phase 14 — 多 persona 圓桌討論、投票、結論" />} />
              <Route path="decisions" element={<DecisionJournal />} />
              <Route path="insights" element={<InsightInbox />} />
              <Route path="trainer" element={<TrainerStudio />} />
              <Route path="memory" element={<MemoryReview />} />
              <Route path="skills" element={<SkillCoaching />} />
              <Route path="persona-lab" element={<PersonaLab />} />
              <Route path="eval" element={<EvaluationSuites />} />
              <Route path="channels" element={<AgoraChannels />} />
            </Route>

            <Route path="/qa" element={<QAChecklist />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
