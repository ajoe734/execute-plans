// Planner Response §E12 / §E14 / §E15 (2026-05-07) — UI budgets + reproducibility lock.
// Source: §6.E12/E14/E15.

// ---------- E12 Reproducibility Lock ----------

export interface ReproducibilityLock {
  randomSeed: string;
  dataSnapshotId: string;
  codeCommitSha: string;
  artifactHash?: string;
  environmentId?: string;
  lockedAt: string;
  lockedBy: string;
}

export const REPRODUCIBILITY_REQUIRED_FOR: readonly string[] = [
  "research_experiment",
  "evolution_run",
  "ranking_backtest",
  "formula_backtest",
  "paper_live_comparison",
];

// ---------- E14 DataTable density + skeleton thresholds ----------

export const DATATABLE_ROW_HEIGHT_PX = {
  comfortable: 48,
  compact:     36,
  dense:       32,
} as const;

export const SKELETON_THRESHOLDS_MS = {
  showAfter:           200,
  minimumDisplay:      300,
  stillLoadingAfter:  2000,
  retryAffordanceAfter: 10_000,
} as const;

// ---------- E15 LineageGraph perf budgets ----------

export const LINEAGE_NODE_LIMITS = {
  clientLayoutMax: 100,
  virtualizedMax:  500,
  /** > virtualizedMax → server-side layout / clustered summary required. */
  serverLayoutThreshold: 500,
} as const;

export const LINEAGE_PERF_BUDGET_MS = {
  initialRender:        3500,
  interactionLatency:    150,
} as const;

export const UI_BUDGETS_SOURCE = "planner-response-2026-05-07" as const;
