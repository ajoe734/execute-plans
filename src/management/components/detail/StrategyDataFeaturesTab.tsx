import { useEffect, useState } from "react";
import { legacyBff as bff } from "@/lib/bff-v1";
import type { FeatureSet } from "@/lib/bff/types";
import { DataTable } from "@/platform/components/DataTable";
import { useT } from "@/platform/hooks";

export const StrategyDataFeaturesTab = ({ strategyId }: { strategyId: string }) => {
  const t = useT();
  const [rows, setRows] = useState<FeatureSet[]>([]);
  useEffect(() => { bff.featureSets.forStrategy(strategyId).then(setRows); }, [strategyId]);
  return (
    <DataTable
      rows={rows}
      columns={[
        { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
        { key: "ds", header: t("phase13.strategy.data.upstream"), cell: (r) => <span className="text-mono text-xs">{r.upstreamDataset}</span> },
        { key: "fresh", header: t("phase13.strategy.data.freshness"), cell: (r) => <span className="text-mono text-xs">{r.freshnessMin} min</span> },
        { key: "missing", header: t("phase13.strategy.data.missing"), cell: (r) => <span className={`text-mono text-xs ${r.missingPct > 1 ? "text-status-warning" : ""}`}>{r.missingPct.toFixed(2)}%</span> },
        { key: "owner", header: t("table.owner"), cell: (r) => <span className="text-mono text-xs">{r.owner}</span> },
      ]}
      empty={t("phase13.strategy.data.empty")}
    />
  );
};
