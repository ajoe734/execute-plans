import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useT } from "@/platform/hooks";

const map: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  review: "bg-status-warning/15 text-status-warning border-status-warning/30",
  approved: "bg-accent/15 text-accent border-accent/30",
  deployed: "bg-status-success/15 text-status-success border-status-success/30",
  paused: "bg-status-paused/15 text-status-paused border-status-paused/30",
  retired: "bg-muted text-muted-foreground border-border",
  pending: "bg-status-pending/15 text-status-pending border-status-pending/30",
  running: "bg-status-running/15 text-status-running border-status-running/30",
  success: "bg-status-success/15 text-status-success border-status-success/30",
  warning: "bg-status-warning/15 text-status-warning border-status-warning/30",
  failed: "bg-status-failed/15 text-status-failed border-status-failed/30",
};

export const StatusBadge = ({ state }: { state: string }) => {
  const t = useT();
  const key = `status.${state}`;
  return (
    <Badge variant="outline" className={cn("font-medium capitalize", map[state] ?? "bg-muted text-muted-foreground")}>
      {t(key, { defaultValue: state })}
    </Badge>
  );
};
