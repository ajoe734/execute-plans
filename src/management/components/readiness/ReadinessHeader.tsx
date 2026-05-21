// 2026-05-20 revamp §7 — Readiness page header.
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ReadinessHeaderModel } from "@/lib/v5/management/readiness";

const statusTone = (s: ReadinessHeaderModel["status"]) =>
  s === "ready" ? "bg-status-success/15 text-status-success border-status-success/30" :
  s === "blocked" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
  s === "pending" ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
  "bg-muted text-muted-foreground border-border";

export const ReadinessHeader = ({ model }: { model: ReadinessHeaderModel }) => (
  <Card className="p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{model.title}</h1>
        <div className="mt-1 text-xs text-muted-foreground">
          Env: <span className="font-mono">{model.environment}</span> · Last updated{" "}
          <time dateTime={model.lastUpdated}>{new Date(model.lastUpdated).toLocaleString()}</time>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={statusTone(model.status)}>{model.status}</Badge>
        <Badge variant="outline" className="border-border">
          Score {model.score}%
        </Badge>
        <Badge variant="outline" className={model.canProceed ? "bg-status-success/15 text-status-success border-status-success/30" : "bg-muted text-muted-foreground border-border"}>
          {model.canProceed ? "can_proceed: true" : "can_proceed: false"}
        </Badge>
      </div>
    </div>
    {model.primaryBlocker && (
      <p className="mt-3 text-xs text-status-failed">Primary blocker: {model.primaryBlocker}</p>
    )}
  </Card>
);
