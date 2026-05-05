// v3 §7 Environment Model / Action Gating.
// Resolves G04.

export type PlatformEnvironment = "local" | "dev" | "staging" | "production";
export type TradingEnvironment = "research" | "paper" | "live";

export interface EnvironmentGating {
  platformEnv: PlatformEnvironment;
  tradingEnv: TradingEnvironment;
  liveSideEffects: boolean;
  paperDeployment: boolean;
  researchJobs: "none" | "mock_only" | "mock_or_dev_worker" | "staging_worker" | "yes";
  /** false | "confirmed_mock_only" | "if_entity_allows" | "with_high_risk_confirmation" */
  highRiskCommands:
    | false
    | "confirmed_mock_only"
    | "if_entity_allows"
    | "with_high_risk_confirmation";
}

export const ENVIRONMENT_GATING_TABLE: readonly EnvironmentGating[] = [
  { platformEnv: "local",      tradingEnv: "research", liveSideEffects: false, paperDeployment: false, researchJobs: "mock_only",            highRiskCommands: false },
  { platformEnv: "dev",        tradingEnv: "research", liveSideEffects: false, paperDeployment: false, researchJobs: "mock_or_dev_worker",   highRiskCommands: false },
  { platformEnv: "staging",    tradingEnv: "research", liveSideEffects: false, paperDeployment: false, researchJobs: "staging_worker",       highRiskCommands: "confirmed_mock_only" },
  { platformEnv: "staging",    tradingEnv: "paper",    liveSideEffects: false, paperDeployment: true,  researchJobs: "yes",                  highRiskCommands: "confirmed_mock_only" },
  { platformEnv: "production", tradingEnv: "research", liveSideEffects: false, paperDeployment: false, researchJobs: "yes",                  highRiskCommands: "if_entity_allows" },
  { platformEnv: "production", tradingEnv: "paper",    liveSideEffects: false, paperDeployment: true,  researchJobs: "yes",                  highRiskCommands: "if_entity_allows" },
  { platformEnv: "production", tradingEnv: "live",     liveSideEffects: true,  paperDeployment: true,  researchJobs: "yes",                  highRiskCommands: "with_high_risk_confirmation" },
] as const;

export function findEnvGating(
  platformEnv: PlatformEnvironment,
  tradingEnv: TradingEnvironment,
): EnvironmentGating | undefined {
  return ENVIRONMENT_GATING_TABLE.find(
    (r) => r.platformEnv === platformEnv && r.tradingEnv === tradingEnv,
  );
}

export function isHighRiskAllowed(
  platformEnv: PlatformEnvironment,
  tradingEnv: TradingEnvironment,
): boolean {
  const g = findEnvGating(platformEnv, tradingEnv);
  return !!g && g.highRiskCommands !== false;
}

export function liveSideEffectsAllowed(
  platformEnv: PlatformEnvironment,
  tradingEnv: TradingEnvironment,
): boolean {
  return findEnvGating(platformEnv, tradingEnv)?.liveSideEffects === true;
}
