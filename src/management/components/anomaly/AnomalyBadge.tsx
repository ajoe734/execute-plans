import { Badge } from "@/components/ui/badge";
import type { ManagementAnomalySeverity } from "@/lib/v5/management/anomaly";

const tone = (s: ManagementAnomalySeverity) =>
  s === "critical" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
  s === "high"     ? "bg-status-failed/10 text-status-failed border-status-failed/20" :
  s === "medium"   ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
  s === "low"      ? "bg-muted text-muted-foreground border-border" :
                     "bg-muted/50 text-muted-foreground border-border";

export const AnomalyBadge = ({ severity, label }: { severity: ManagementAnomalySeverity; label?: string }) => (
  <Badge
    variant="outline"
    className={tone(severity)}
    aria-label={`severity ${severity}${label ? `: ${label}` : ""}`}
  >
    {label ?? severity}
  </Badge>
);
