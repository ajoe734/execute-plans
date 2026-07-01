import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";

const map: Record<RiskLevel, string> = {
  info: "bg-muted text-muted-foreground border-border",
  low: "bg-risk-low/15 text-risk-low border-risk-low/30",
  medium: "bg-risk-medium/15 text-risk-medium border-risk-medium/30",
  high: "bg-risk-high/15 text-risk-high border-risk-high/30",
  critical: "bg-risk-critical/15 text-risk-critical border-risk-critical/40",
};

export const RiskBadge = ({ level }: { level?: RiskLevel | string | null }) => {
  const t = useT();
  const safeLevel = level && (level as string).trim() ? (level as string) : "unknown";
  return (
    <Badge variant="outline" className={cn("font-medium", map[safeLevel as RiskLevel] ?? "bg-muted text-muted-foreground")}>
      {t(`risk.${safeLevel}`, { defaultValue: safeLevel })}
    </Badge>
  );
};
