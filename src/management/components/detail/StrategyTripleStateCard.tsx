// Pack C §C008 / Pack D — Strategy three-axis (lifecycle × review × deployment)
// SUPERSEDES single `state` enum on Strategy display surfaces. Renders explicit
// triple + validateStrategyTriple() invariant verdict inline (C8 收斂).
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  validateStrategyTriple,
  explainTripleViolation,
  type StrategyLifecycleStatus,
  type StrategyReviewStatus,
  type StrategyDeploymentStatus,
} from "@/lib/v4/strategyInvariants";

const lifecycleCls: Record<string, string> = {
  discovered: "bg-muted text-muted-foreground border-border",
  scaffolded: "bg-muted text-muted-foreground border-border",
  replicated: "bg-accent/15 text-accent border-accent/30",
  approved: "bg-status-success/15 text-status-success border-status-success/30",
  paper: "bg-status-running/15 text-status-running border-status-running/30",
  live: "bg-status-success/15 text-status-success border-status-success/30",
  degraded: "bg-status-warning/15 text-status-warning border-status-warning/30",
  retired: "bg-muted text-muted-foreground border-border",
};
const reviewCls: Record<string, string> = {
  none: "bg-muted text-muted-foreground border-border",
  pending: "bg-status-warning/15 text-status-warning border-status-warning/30",
  changes_requested: "bg-status-warning/15 text-status-warning border-status-warning/30",
  approved: "bg-status-success/15 text-status-success border-status-success/30",
};
const deployCls: Record<string, string> = {
  none: "bg-muted text-muted-foreground border-border",
  paper_running: "bg-status-running/15 text-status-running border-status-running/30",
  live_running: "bg-status-success/15 text-status-success border-status-success/30",
  stopped: "bg-muted text-muted-foreground border-border",
  rollback_required: "bg-status-failed/15 text-status-failed border-status-failed/30",
};

const LIFECYCLE_FROM_LEGACY: Record<string, StrategyLifecycleStatus> = {
  draft: "discovered", review: "replicated", approved: "approved",
  deployed: "live", paused: "paper", retired: "retired",
  discovered: "discovered", scaffolded: "scaffolded", replicated: "replicated",
  paper: "paper", live: "live", degraded: "degraded",
};

export interface StrategyTripleStateCardProps {
  /** Pack D canonical fields when present */
  lifecycleStatus?: string;
  reviewStatus?: string;
  deploymentStatus?: string;
  /** v3 single state — only used as best-effort fallback for lifecycle */
  legacyState?: string;
}

export const StrategyTripleStateCard = ({
  lifecycleStatus, reviewStatus, deploymentStatus, legacyState,
}: StrategyTripleStateCardProps) => {
  const lifecycle = (lifecycleStatus as StrategyLifecycleStatus | undefined)
    ?? LIFECYCLE_FROM_LEGACY[legacyState ?? ""]
    ?? "discovered";
  const review = (reviewStatus as StrategyReviewStatus | undefined) ?? "none";
  const deployment = (deploymentStatus as StrategyDeploymentStatus | undefined) ?? "none";

  const valid = validateStrategyTriple({
    lifecycleStatus: lifecycle, reviewStatus: review, deploymentStatus: deployment,
  });
  const violation = valid ? null : explainTripleViolation({
    lifecycleStatus: lifecycle, reviewStatus: review, deploymentStatus: deployment,
  });

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Strategy state · lifecycle × review × deployment
        </div>
        {valid ? (
          <span className="flex items-center gap-1 text-xs text-status-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> invariant ok
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-status-failed">
            <AlertTriangle className="h-3.5 w-3.5" /> invariant violated
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="space-y-0.5">
          <div className="text-[10px] uppercase text-muted-foreground">lifecycle</div>
          <Badge variant="outline" className={lifecycleCls[lifecycle] ?? ""}>{lifecycle}</Badge>
        </div>
        <div className="space-y-0.5">
          <div className="text-[10px] uppercase text-muted-foreground">review</div>
          <Badge variant="outline" className={reviewCls[review] ?? ""}>{review}</Badge>
        </div>
        <div className="space-y-0.5">
          <div className="text-[10px] uppercase text-muted-foreground">deployment</div>
          <Badge variant="outline" className={deployCls[deployment] ?? ""}>{deployment}</Badge>
        </div>
      </div>
      {violation && (
        <p className="text-xs text-status-failed">{violation}</p>
      )}
      {!lifecycleStatus && legacyState && (
        <p className="text-[11px] text-muted-foreground">
          ⚠ Derived from legacy single <code>state</code>=<code>{legacyState}</code>; backend should emit canonical triple.
        </p>
      )}
    </Card>
  );
};
