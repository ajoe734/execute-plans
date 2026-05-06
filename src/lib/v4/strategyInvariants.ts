// v4 / Pack C §C008 — Strategy three-axis (lifecycle × review × deployment) whitelist.
// SUPERSEDES src/lib/v3/status.ts StrategyReviewStatus / StrategyDeploymentStatus.

export type StrategyLifecycleStatus =
  | "discovered" | "scaffolded" | "replicated" | "approved"
  | "paper" | "live" | "degraded" | "retired";

/** Pack C C008 collapses v3 9-value enum to 4. */
export type StrategyReviewStatus = "none" | "pending" | "changes_requested" | "approved";

/** Pack C C008 collapses v3 8-value enum to 5. */
export type StrategyDeploymentStatus =
  | "none" | "paper_running" | "live_running" | "stopped" | "rollback_required";

export interface StrategyTriple {
  lifecycleStatus: StrategyLifecycleStatus;
  reviewStatus: StrategyReviewStatus;
  deploymentStatus: StrategyDeploymentStatus;
}

interface TripleRow {
  lifecycleStatus: StrategyLifecycleStatus;
  reviewStatus: readonly StrategyReviewStatus[];
  deploymentStatus: readonly StrategyDeploymentStatus[];
  invariant: string;
}

export const STRATEGY_TRIPLE_WHITELIST: readonly TripleRow[] = [
  { lifecycleStatus: "discovered", reviewStatus: ["none"], deploymentStatus: ["none"],
    invariant: "No review or deployment exists." },
  { lifecycleStatus: "scaffolded", reviewStatus: ["none", "changes_requested"], deploymentStatus: ["none"],
    invariant: "Spec may be revised after changes request." },
  { lifecycleStatus: "replicated", reviewStatus: ["none", "pending", "changes_requested"], deploymentStatus: ["none"],
    invariant: "Review may be pending after evidence exists." },
  { lifecycleStatus: "approved", reviewStatus: ["approved"], deploymentStatus: ["none"],
    invariant: "Approved but not yet deployed." },
  { lifecycleStatus: "paper", reviewStatus: ["approved"],
    deploymentStatus: ["paper_running", "stopped", "rollback_required"],
    invariant: "Paper deployment only." },
  { lifecycleStatus: "live", reviewStatus: ["approved"],
    deploymentStatus: ["live_running", "rollback_required"],
    invariant: "Live requires approved review." },
  { lifecycleStatus: "degraded", reviewStatus: ["approved"],
    deploymentStatus: ["live_running", "rollback_required", "stopped"],
    invariant: "Only live/paper entities can degrade." },
  { lifecycleStatus: "retired", reviewStatus: ["none", "approved"],
    deploymentStatus: ["none", "stopped"],
    invariant: "No running deployment allowed." },
] as const;

export function validateStrategyTriple(s: StrategyTriple): boolean {
  return STRATEGY_TRIPLE_WHITELIST.some((row) =>
    row.lifecycleStatus === s.lifecycleStatus &&
    row.reviewStatus.includes(s.reviewStatus) &&
    row.deploymentStatus.includes(s.deploymentStatus),
  );
}

export function explainTripleViolation(s: StrategyTriple): string | null {
  if (validateStrategyTriple(s)) return null;
  const row = STRATEGY_TRIPLE_WHITELIST.find((r) => r.lifecycleStatus === s.lifecycleStatus);
  if (!row) return `Unknown lifecycleStatus: ${s.lifecycleStatus}`;
  return `Invariant violated: ${row.invariant} (allowed review=${row.reviewStatus.join("|")}, deployment=${row.deploymentStatus.join("|")})`;
}
