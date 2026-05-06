// v4 / Pack C §C073 — Capital Ranking Inputs snapshot.

export interface RankingInputSnapshot {
  snapshotId: string;
  scope: "persona" | "strategy" | "capital_pool";
  metricAsOf: string;
  frequency: "daily" | "weekly" | "monthly" | "quarterly";
  stalenessToleranceHours: number;
  metricRows: Array<{
    entityId: string;
    metricId: string;
    value: number | null;
    quality: "ok" | "stale" | "missing";
  }>;
}
