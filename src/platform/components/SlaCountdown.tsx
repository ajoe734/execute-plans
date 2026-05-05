// SlaCountdown — Phase 17.
// Shows time-remaining (or overdue) for an approval stage SLA. Re-renders every 30s.
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/platform/hooks";
import { Clock, AlertTriangle } from "lucide-react";

interface Props {
  startedAt?: string;
  slaHours: number;
  escalated?: boolean;
  className?: string;
}

function formatDelta(ms: number): string {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const SlaCountdown = ({ startedAt, slaHours, escalated, className }: Props) => {
  const t = useT();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!startedAt) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
        <Clock className="h-3 w-3" />
        {t("approval.sla.notStarted", { defaultValue: "Not started" })} · {slaHours}h
      </span>
    );
  }
  const due = Date.parse(startedAt) + slaHours * 3_600_000;
  const remaining = due - Date.now();
  const overdue = remaining < 0;
  const tone = escalated
    ? "text-status-warning"
    : overdue
      ? "text-status-error"
      : remaining < slaHours * 3_600_000 * 0.25
        ? "text-status-warning"
        : "text-muted-foreground";

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", tone, className)}>
      {overdue || escalated ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {escalated
        ? t("approval.sla.escalated", { defaultValue: "Escalated" })
        : overdue
          ? t("approval.sla.overdue", { defaultValue: "Overdue {{t}}", t: formatDelta(remaining) })
          : t("approval.sla.remaining", { defaultValue: "{{t}} left", t: formatDelta(remaining) })}
    </span>
  );
};
