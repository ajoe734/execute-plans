// v3 §13 Management Page Tab Corrections. Resolves G28 / G29 / G30.

export const STRATEGY_DETAIL_TABS = [
  "Overview", "Spec & Parameters", "Data & Features", "Costs & Slippage",
  "Experiments", "Performance", "Paper / Live Execution", "Risk & Alerts",
  "Incidents", "Artifacts", "Evolution", "Governance", "Lineage & Audit",
] as const;
export type StrategyDetailTab = typeof STRATEGY_DETAIL_TABS[number];

export const PERSONA_DETAIL_TABS = [
  "Overview", "Identity & Role", "Private Workspace", "Route Policy",
  "Tools / MCP / Skills", "Capital Binding", "Strategy Ownership",
  "Performance & Ranking", "Activity Monitor", "Training & Memory",
  "Evaluations", "Version History & Audit",
] as const;
export type PersonaDetailTab = typeof PERSONA_DETAIL_TABS[number];

export const CAPITAL_POOL_DETAIL_TABS = [
  "Overview", "Mandate", "Persona Binding", "Strategy Binding",
  "Risk Budget", "Current Exposure", "Performance", "Ranking Inputs",
  "Rebalance History", "Overrides & Audit",
] as const;
export type CapitalPoolDetailTab = typeof CAPITAL_POOL_DETAIL_TABS[number];
