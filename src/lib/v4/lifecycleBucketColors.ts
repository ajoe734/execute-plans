// v4 / Pack C §C078 — Lifecycle bucket → design token mapping.

import type { StrategyLifecycleStatus } from "./strategyInvariants";

export const LIFECYCLE_BUCKET_TOKEN: Record<StrategyLifecycleStatus, string> = {
  discovered: "--status-neutral",
  scaffolded: "--status-info",
  replicated: "--status-purple",
  approved:   "--status-success",
  paper:      "--status-warning",
  live:       "--status-live",
  degraded:   "--risk-high",
  retired:    "--status-muted",
};
