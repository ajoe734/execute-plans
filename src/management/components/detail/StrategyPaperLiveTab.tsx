import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/platform/hooks";
import { mgmt, type ManagementTradingPulseModel, type ManagementTradingPulseBaselineComparison } from "@/lib/bff-v1/management";

function metricRows(comparison: ManagementTradingPulseBaselineComparison) {
  const evaluated = comparison.driftGroups?.flatMap((group) => group.metrics) ?? [];
  const baseline = comparison.paperBaseline?.metrics ?? {};
  const observed = comparison.observedState?.metrics ?? {};
  const ids = new Set([...Object.keys(baseline), ...Object.keys(observed), ...evaluated.map((m) => m.metric_id)]);
  return Array.from(ids).map((id) => {
    const metric = evaluated.find((m) => m.metric_id === id);
    return {
      id, label: metric?.label || id,
      unit: metric?.unit || (id === "return_percent" ? "%" : id.endsWith("_bps") ? "bps" : ""),
      paper: metric ? metric.baseline_value : baseline[id],
      observed: metric ? metric.observed_value : observed[id],
      delta: metric?.delta,
      status: metric?.status,
    };
  });
}

/** A comparison is per runtime, not a synthetic time-series point. */
export const StrategyPaperLiveTab = ({ strategyId }: { strategyId: string }) => {
  const t = useT();
  const [pulse, setPulse] = useState<ManagementTradingPulseModel>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setPulse(undefined); // never display the previous strategy while reloading
    mgmt.tradingPulse.getLiveOnly().then((result) => {
      if (mounted) setPulse(result);
    }).catch(() => {
      if (mounted) setPulse(undefined);
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [strategyId]);

  const comparisons = (pulse?.baselineComparisons ?? []).filter((comparison) => {
    if (comparison.strategyId) return comparison.strategyId === strategyId;
    // An older comparison may omit strategy identity, but only an explicit
    // strategy→runtime relation may supply it. Never compare unlike IDs.
    return pulse?.runtimeRows.some((row) =>
      row.strategyId === strategyId && row.runtimeId === comparison.runtimeId &&
      (!comparison.runtimeBindingId || row.runtimeBindingId === comparison.runtimeBindingId));
  });
  const number = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? String(value) : "—";

  return (
    <Card className="p-4 space-y-4">
      <h3 className="font-semibold text-sm">{t("phase21.paperLive.title")}</h3>
      <p className="text-xs text-muted-foreground">{t("phase21.paperLive.hint")}</p>
      {!loading && <Badge variant="outline">{t("phase21.ownerFacts.readStatus")}: {pulse?.meta.surfaces.management_trading_pulse?.status || pulse?.meta.surfaces.trading_pulse?.status || "unavailable"}</Badge>}
      {loading ? <p>{t("common.loading")}</p> : comparisons.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("phase21.ownerFacts.noComparisons")}</p>
      ) : comparisons.map((comparison) => {
        const evaluation = comparison.thresholdEvaluation;
        const status = typeof evaluation?.overall_status === "string" ? evaluation.overall_status : t("phase21.ownerFacts.unverified");
        const metrics = metricRows(comparison);
        return (
          <section key={`${comparison.runtimeId}:${comparison.runtimeBindingId ?? ""}`} className="space-y-2 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-mono">{comparison.runtimeId} · {comparison.runtimeBindingId}</span>
              <Badge variant="outline">{comparison.deploymentStage || "—"}</Badge>
              <Badge variant="outline">{status}</Badge>
            </div>
            {typeof evaluation?.summary === "string" && <p className="text-sm">{evaluation.summary}</p>}
            <p className="text-xs text-muted-foreground">
              {t("phase21.paperLive.paper")}: {comparison.paperBaseline?.captured_at || "—"}
              {" · "}{t("phase21.paperLive.live")}: {comparison.observedState?.observed_at || "—"}
            </p>
            {metrics.length === 0 ? <p>{t("phase21.ownerFacts.noMetrics")}</p> : (
              <table className="w-full text-sm">
                <thead><tr>
                  <th className="text-left">{t("phase21.ownerFacts.metric")}</th>
                  <th>{t("phase21.paperLive.paper")}</th><th>{t("phase21.paperLive.live")}</th>
                  <th>Δ</th><th>{t("phase21.ownerFacts.assessment")}</th>
                </tr></thead>
                <tbody>{metrics.map((metric) => (
                  <tr key={metric.id}>
                    <td>{metric.label} ({metric.unit || t("phase21.ownerFacts.unitUnspecified")})</td>
                    <td className="text-center text-mono">{number(metric.paper)}</td>
                    <td className="text-center text-mono">{number(metric.observed)}</td>
                    <td className="text-center text-mono">{number(metric.delta)}</td>
                    <td className="text-center">{metric.status || t("phase21.ownerFacts.unverified")}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </section>
        );
      })}
    </Card>
  );
};
