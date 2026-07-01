// 2026-05-22 PM12-008 — Performance Attribution page.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { DataGridCard } from "@/platform/components/DataGridFrame";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import {
  defaultPerformanceAttribution, ATTRIBUTION_DIMENSIONS,
  type AttributionDimension, type AttributionPeriod, type PerformanceAttributionRow,
} from "@/lib/v5/management/performanceAttribution";

const fmtUsd = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
    : "—";
const fmtPct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "—");

const PERIODS: AttributionPeriod[] = ["7d", "30d", "quarter", "ytd"];

export const PerformanceAttributionPage = () => {
  const { t } = useTranslation();
  const [dimension, setDimension] = useState<AttributionDimension | "all">("all");
  const [period, setPeriod] = useState<AttributionPeriod>("30d");

  const seed = useMemo(() => defaultPerformanceAttribution(), []);
  const { data } = useV5Live(
    () => mgmt.performanceAttribution.list(
      dimension === "all" ? undefined : dimension,
      period,
      () => seed,
    ),
    [dimension, period],
  );
  // Live rows nest the numbers under `metrics`; map them onto the flat
  // view-model so the table shows real values instead of NaN.
  const allRows: PerformanceAttributionRow[] = (data ?? seed).map((raw) => {
    const r = raw as PerformanceAttributionRow & {
      key?: string; dimensionKey?: string;
      metrics?: { totalPnl?: number | null; pnlContributionPct?: number | null;
        riskContributionPct?: number | null; worstDrawdown?: number | null };
    };
    if (typeof r.pnlContribution === "number" && typeof r.key === "string") return r;
    const m = r.metrics ?? {};
    return {
      ...r,
      key: r.key ?? r.dimensionKey ?? r.label,
      pnlContribution: r.pnlContribution ?? m.totalPnl ?? NaN,
      pnlContributionPct: r.pnlContributionPct ?? m.pnlContributionPct ?? NaN,
      riskContributionPct: r.riskContributionPct ?? m.riskContributionPct ?? NaN,
      drawdownContributionPct: r.drawdownContributionPct ?? m.worstDrawdown ?? NaN,
    } as PerformanceAttributionRow;
  });
  const rows = useMemo(() => {
    const filtered = dimension === "all" ? allRows : allRows.filter((r) => r.dimension === dimension);
    return [...filtered].sort((a, b) => (b.pnlContribution || 0) - (a.pnlContribution || 0));
  }, [allRows, dimension]);

  return (
    <section className="p-6 space-y-6" aria-label={t("mgmt.attribution.title")}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.attribution.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.attribution.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            value={dimension}
            onChange={(e) => setDimension(e.target.value as AttributionDimension | "all")}
            aria-label={t("mgmt.attribution.dimension")}
          >
            <option value="all">{t("mgmt.attribution.allDimensions")}</option>
            {ATTRIBUTION_DIMENSIONS.map((d) => (
              <option key={d} value={d}>{t(`mgmt.attribution.dimensions.${d}`, { defaultValue: d })}</option>
            ))}
          </select>
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value as AttributionPeriod)}
            aria-label={t("mgmt.attribution.period")}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>{t(`mgmt.attribution.periods.${p}`, { defaultValue: p })}</option>
            ))}
          </select>
        </div>
      </header>

      <DataGridCard minWidth={1080} stickyLastColumn ariaLabel={t("mgmt.attribution.title")}>
        <table className="text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="px-3 py-2">{t("mgmt.attribution.dimension")}</th>
              <th className="px-3 py-2">{t("mgmt.attribution.entity")}</th>
              <th className="px-3 py-2">{t("mgmt.attribution.pnlContribution")}</th>
              <th className="px-3 py-2">{t("mgmt.attribution.pnlPct")}</th>
              <th className="px-3 py-2">{t("mgmt.attribution.riskPct")}</th>
              <th className="px-3 py-2">{t("mgmt.attribution.drawdownPct")}</th>
              <th className="px-3 py-2">{t("mgmt.actions.manage")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.dimension}-${r.key}`} className="border-b border-border/50">
                <td className="px-3 py-2"><Badge variant="outline">{t(`mgmt.attribution.dimensions.${r.dimension}`, { defaultValue: r.dimension })}</Badge></td>
                <td className="px-3 py-2 font-mono">{r.label}</td>
                <td className={`px-3 py-2 font-mono ${r.pnlContribution < 0 ? "text-status-failed" : "text-status-success"}`}>{fmtUsd(r.pnlContribution)}</td>
                <td className={`px-3 py-2 font-mono ${r.pnlContributionPct < 0 ? "text-status-failed" : "text-status-success"}`}>{fmtPct(r.pnlContributionPct)}</td>
                <td className="px-3 py-2 font-mono">{fmtPct(r.riskContributionPct)}</td>
                <td className="px-3 py-2 font-mono text-status-failed">{fmtPct(r.drawdownContributionPct)}</td>
                <td className="px-3 py-2">
                  <Link to={r.links.manageHref} className="text-primary hover:underline text-xs">{t("mgmt.actions.manage")} →</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-3 py-4 text-center text-muted-foreground" colSpan={7}>{t("mgmt.pulse.noRows")}</td></tr>
            )}
          </tbody>
        </table>
      </DataGridCard>
    </section>
  );
};
