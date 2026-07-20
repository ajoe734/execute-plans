import PersonaOnboarding from "@/management/pages/PersonaOnboarding";

export {
  StrategiesList as StrategiesListRoute,
  PersonasList as PersonasListRoute,
  CapitalPoolsList as CapitalPoolsListRoute,
  RankingFormulasList as RankingFormulasListRoute,
  DeploymentsList as DeploymentsListRoute,
  EvolutionList as EvolutionListRoute,
  ResearchList as ResearchListRoute,
  ArtifactsList as ArtifactsListRoute,
} from "@/management/pages/Lists";

export { StrategyDetail as StrategyDetailRoute } from "@/management/pages/StrategyDetail";
export { PersonaDetail as PersonaDetailRoute } from "@/management/pages/PersonaDetail";
export { CapitalPoolDetail as CapitalPoolDetailRoute } from "@/management/pages/CapitalPoolDetail";
export { RankingFormulaDetail as RankingFormulaDetailRoute } from "@/management/pages/RankingFormulaDetail";
export { RebalanceDetail as RebalanceDetailRoute } from "@/management/pages/RebalanceDetail";
export { EvolutionDetail as EvolutionDetailRoute } from "@/management/pages/EvolutionDetail";
export { ResearchDetail as ResearchDetailRoute } from "@/management/pages/ResearchDetail";
export { ArtifactDetail as ArtifactDetailRoute } from "@/management/pages/ArtifactDetail";
export { DeploymentDetail as DeploymentDetailRoute } from "@/management/pages/DeploymentDetail";
export { RuntimesPage as RuntimesRoute } from "@/management/pages/Runtimes";
export {
  ToolsList as ToolsListRoute,
  McpServersList as McpServersListRoute,
  SkillsList as SkillsListRoute,
  ChannelsList as ChannelsListRoute,
} from "@/management/pages/CapabilitiesLists";
export { ToolDetail as ToolDetailRoute } from "@/management/pages/ToolDetail";
export { McpServerDetail as McpServerDetailRoute, McpToolDetail as McpToolDetailRoute } from "@/management/pages/McpDetail";
export { SkillDetail as SkillDetailRoute } from "@/management/pages/SkillDetail";
export { ChannelDetail as ChannelDetailRoute } from "@/management/pages/ChannelDetail";

export const PersonaOnboardingRoute = PersonaOnboarding;
