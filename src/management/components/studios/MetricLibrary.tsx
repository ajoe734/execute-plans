// Phase 12 — shared metric library used by Formula / Fitness studios.
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/platform/hooks";

export interface MetricDef {
  id: string;
  label: string;
  kind: "perf" | "risk" | "capacity" | "cost";
}

export const METRIC_LIBRARY: MetricDef[] = [
  { id: "sharpe", label: "Sharpe", kind: "perf" },
  { id: "sortino", label: "Sortino", kind: "perf" },
  { id: "alpha", label: "Alpha", kind: "perf" },
  { id: "ir", label: "Information ratio", kind: "perf" },
  { id: "dd", label: "Drawdown", kind: "risk" },
  { id: "var", label: "VaR 95%", kind: "risk" },
  { id: "vol", label: "Volatility", kind: "risk" },
  { id: "capacity", label: "Capacity", kind: "capacity" },
  { id: "turnover", label: "Turnover", kind: "cost" },
  { id: "slippage", label: "Slippage", kind: "cost" },
];

const tone: Record<MetricDef["kind"], string> = {
  perf: "border-status-success/40 text-status-success",
  risk: "border-status-failed/40 text-status-failed",
  capacity: "border-accent/40 text-accent",
  cost: "border-status-warning/40 text-status-warning",
};

export const MetricLibrary = ({ onPick }: { onPick: (id: string) => void }) => {
  const t = useT();
  return (
    <Card className="p-4 space-y-2">
      <div className="text-sm font-semibold">{t("studios.library")}</div>
      <div className="flex flex-wrap gap-2">
        {METRIC_LIBRARY.map((m) => (
          <button
            key={m.id}
            onClick={() => onPick(m.id)}
            className="text-left"
            type="button"
          >
            <Badge variant="outline" className={`text-mono text-xs ${tone[m.kind]} cursor-pointer hover:bg-muted`}>
              {m.id}
            </Badge>
          </button>
        ))}
      </div>
    </Card>
  );
};
