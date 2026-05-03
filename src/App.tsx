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
import {
  StrategiesList, PersonasList, CapitalPoolsList, RankingFormulasList,
  RebalancesList, DeploymentsList, EvolutionList, ResearchList, ArtifactsList,
} from "@/management/pages/Lists";
import {
  JobsPage, AlertsPage, IncidentsPage, ApprovalsPage, AuditPage,
} from "@/management/pages/Operations";
import { Placeholder } from "@/platform/components/Placeholder";
import { DailyBrief } from "@/agora/pages/DailyBrief";
import { AskPersonas } from "@/agora/pages/AskPersonas";
import { Notebook } from "@/agora/pages/Notebook";
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
              <Route index element={<ManagementOverview />} />
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
              <Route path="research" element={<ResearchList />} />
              <Route path="research/:id" element={<ResearchDetail />} />
              <Route path="artifacts" element={<ArtifactsList />} />
              <Route path="artifacts/:id" element={<ArtifactDetail />} />
              <Route path="deployments" element={<DeploymentsList />} />
              <Route path="runtimes" element={<Placeholder title="Runtimes" />} />
              <Route path="jobs" element={<JobsPage />} />
              <Route path="alerts" element={<AlertsPage />} />
              <Route path="incidents" element={<IncidentsPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="approvals" element={<ApprovalsPage />} />
              <Route path="tools" element={<Placeholder title="Tools" />} />
              <Route path="mcp" element={<Placeholder title="MCP Servers & Tools" />} />
              <Route path="skills" element={<Placeholder title="Skills" />} />
              <Route path="channels" element={<Placeholder title="Channels" />} />
            </Route>

            {/* Agora Workbench */}
            <Route path="/agora" element={<AgoraLayout />}>
              <Route index element={<DailyBrief />} />
              <Route path="market" element={<Placeholder title="Market & Watchlist" />} />
              <Route path="signals" element={<Placeholder title="Signal Review" />} />
              <Route path="triage" element={<Placeholder title="Alert Triage" />} />
              <Route path="notebook" element={<Notebook />} />
              <Route path="ask" element={<AskPersonas />} />
              <Route path="decisions" element={<Placeholder title="Decision Journal" />} />
              <Route path="insights" element={<Placeholder title="Insight Inbox" />} />
              <Route path="trainer" element={<Placeholder title="AI Trainer Studio" />} />
              <Route path="memory" element={<Placeholder title="Memory Review" />} />
              <Route path="skills" element={<Placeholder title="Skill Coaching" />} />
              <Route path="persona-lab" element={<Placeholder title="Persona Lab" />} />
              <Route path="eval" element={<Placeholder title="Evaluation Suites" />} />
              <Route path="channels" element={<Placeholder title="Channels" />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
