// v4 / Pack C §C003 — Tab migration table.

export interface TabMigration {
  surface: string;
  oldTab: string;
  newTab: string;
  rule: "unchanged" | "new" | "merged-into" | "merged" | "dropped";
  source?: string;
}

export const TAB_MIGRATION: readonly TabMigration[] = [
  { surface: "StrategyDetail", oldTab: "Performance", newTab: "Performance", rule: "unchanged" },
  { surface: "StrategyDetail", oldTab: "Costs", newTab: "Costs", rule: "new", source: "costBreakdown DTO" },
  { surface: "StrategyDetail", oldTab: "Calendar", newTab: "Calendar", rule: "new", source: "exchangeCalendar DTO" },
  { surface: "StrategyDetail", oldTab: "Governance", newTab: "Governance", rule: "merged", source: "review history + approvals" },
  { surface: "PersonaDetail", oldTab: "Memory Snapshot", newTab: "Training & Memory", rule: "merged-into" },
  { surface: "PersonaDetail", oldTab: "Persona Lab", newTab: "Persona Lab", rule: "new" },
  { surface: "CapitalPoolDetail", oldTab: "Ranking Inputs", newTab: "Ranking Inputs", rule: "new" },
  { surface: "CapitalPoolDetail", oldTab: "Performance", newTab: "Performance", rule: "new" },
] as const;
