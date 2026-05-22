import { Card } from "@/components/ui/card";
import { AnomalyList } from "@/management/components/anomaly/AnomalyList";
import type { ManagementAnomaly } from "@/lib/v5/management/anomaly";

export const CriticalAnomalyPanel = ({ anomalies }: { anomalies: ManagementAnomaly[] }) => (
  <Card className="p-4">
    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
      Critical Anomalies
    </h2>
    <div className="mt-3">
      <AnomalyList anomalies={anomalies} limit={8} emptyLabel="No critical anomalies." />
    </div>
  </Card>
);
