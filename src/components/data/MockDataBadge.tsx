import { Ban, Database, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useLiveStatusSnapshot } from "@/lib/bff/liveTransport";
import { getMockDataBadgeModel } from "@/components/data/mockDataBadgeModel";

export function MockDataBadge({
  helperName,
  className,
}: {
  helperName: string;
  className?: string;
}) {
  const snapshot = useLiveStatusSnapshot();
  const model = getMockDataBadgeModel(helperName, snapshot);
  if (!model) return null;

  const Icon = model.tone === "blocked" ? Ban : model.tone === "warning" ? ShieldAlert : Database;
  return (
    <Badge
      variant="outline"
      title={`${model.title}: ${model.description}`}
      className={cn(
        "gap-1 border-status-warning/40 bg-status-warning/10 text-status-warning",
        model.tone === "blocked" && "border-status-failed/40 bg-status-failed/10 text-status-failed",
        model.tone === "muted" && "border-border bg-muted/60 text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="font-mono text-[10px] uppercase">{model.label}</span>
    </Badge>
  );
}

export function MockDataEmptyState({
  helperName,
  className,
}: {
  helperName: string;
  className?: string;
}) {
  const snapshot = useLiveStatusSnapshot();
  const model = getMockDataBadgeModel(helperName, snapshot);
  if (!model) return null;

  const Icon = model.tone === "blocked" ? Ban : ShieldAlert;
  return (
    <EmptyState
      className={cn("bg-muted/20", className)}
      icon={<Icon className="h-8 w-8" />}
      title={model.title}
      description={`${model.description} (${helperName})`}
    />
  );
}
