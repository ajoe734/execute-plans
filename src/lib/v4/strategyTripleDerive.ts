// Pack C §C008 / Pack D — Canonical helpers to derive the Strategy triple
// (lifecycleStatus × reviewStatus × deploymentStatus) from any object that may
// only carry a v3 single `state` enum. UI MUST consume these helpers instead of
// branching on `s.state` directly (closes spec-conflict-G C8).
import {
  validateStrategyTriple,
  type StrategyLifecycleStatus,
  type StrategyReviewStatus,
  type StrategyDeploymentStatus,
  type StrategyTriple,
} from "./strategyInvariants";

/** v3 single `state` → canonical lifecycle bucket. */
export const LIFECYCLE_FROM_LEGACY: Record<string, StrategyLifecycleStatus> = {
  draft: "discovered",
  review: "replicated",
  approved: "approved",
  deployed: "live",
  paused: "paper",
  retired: "retired",
  // identity passthroughs (already canonical)
  discovered: "discovered",
  scaffolded: "scaffolded",
  replicated: "replicated",
  paper: "paper",
  live: "live",
  degraded: "degraded",
};

const DEFAULT_REVIEW_FOR_LIFECYCLE: Record<StrategyLifecycleStatus, StrategyReviewStatus> = {
  discovered: "none",
  scaffolded: "none",
  replicated: "pending",
  approved: "approved",
  paper: "approved",
  live: "approved",
  degraded: "approved",
  retired: "approved",
};

const DEFAULT_DEPLOY_FOR_LIFECYCLE: Record<StrategyLifecycleStatus, StrategyDeploymentStatus> = {
  discovered: "none",
  scaffolded: "none",
  replicated: "none",
  approved: "none",
  paper: "paper_running",
  live: "live_running",
  degraded: "live_running",
  retired: "stopped",
};

export interface MaybeTripleSource {
  state?: string;
  lifecycleStatus?: string;
  reviewStatus?: string;
  deploymentStatus?: string;
}

/** Best-effort canonical triple. Prefers explicit Pack D fields; otherwise
 *  derives a whitelist-valid default from the legacy single `state`. */
export function deriveStrategyTriple(src: MaybeTripleSource | null | undefined): StrategyTriple {
  const lifecycle = (src?.lifecycleStatus as StrategyLifecycleStatus | undefined)
    ?? LIFECYCLE_FROM_LEGACY[src?.state ?? ""]
    ?? "discovered";
  const review = (src?.reviewStatus as StrategyReviewStatus | undefined)
    ?? DEFAULT_REVIEW_FOR_LIFECYCLE[lifecycle];
  const deployment = (src?.deploymentStatus as StrategyDeploymentStatus | undefined)
    ?? DEFAULT_DEPLOY_FOR_LIFECYCLE[lifecycle];
  return { lifecycleStatus: lifecycle, reviewStatus: review, deploymentStatus: deployment };
}

/** Lifecycle bucket regardless of input shape. */
export const lifecycleOf = (src: MaybeTripleSource | null | undefined): StrategyLifecycleStatus =>
  deriveStrategyTriple(src).lifecycleStatus;

/** True iff strategy is *actually* live-running per the deployment axis. */
export const isLive = (src: MaybeTripleSource | null | undefined): boolean => {
  const t = deriveStrategyTriple(src);
  return t.deploymentStatus === "live_running";
};

/** True iff strategy is in paper-trading deployment (any review state). */
export const isPaper = (src: MaybeTripleSource | null | undefined): boolean =>
  deriveStrategyTriple(src).deploymentStatus === "paper_running";

/** True iff strategy is on a high-risk surface (live or degraded with rollback). */
export const isHighRisk = (src: MaybeTripleSource | null | undefined): boolean => {
  const t = deriveStrategyTriple(src);
  return t.lifecycleStatus === "live"
    || t.lifecycleStatus === "degraded"
    || t.deploymentStatus === "rollback_required";
};

export const tripleIsValid = (src: MaybeTripleSource | null | undefined): boolean =>
  validateStrategyTriple(deriveStrategyTriple(src));
