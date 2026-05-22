import { AnomalyCard } from "./AnomalyCard";
import type { ManagementAnomaly } from "@/lib/v5/management/anomaly";
import { sortAnomaliesBySeverity } from "@/lib/v5/management/anomaly";

export const AnomalyList = ({
  anomalies,
  limit,
  emptyLabel = "No active anomalies.",
}: {
  anomalies: ManagementAnomaly[];
  limit?: number;
  emptyLabel?: string;
}) => {
  const sorted = sortAnomaliesBySeverity(anomalies);
  const visible = typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-3" role="list" aria-label="Anomalies">
      {visible.map((a) => (
        <div role="listitem" key={a.id}>
          <AnomalyCard anomaly={a} />
        </div>
      ))}
    </div>
  );
};
