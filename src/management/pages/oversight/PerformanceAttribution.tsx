// 2026-05-22 PM12-008 — Performance Attribution page.
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import {
  ATTRIBUTION_DIMENSIONS, buildAttributionLinks,
  type AttributionDimension, type AttributionPeriod, type PerformanceAttributionRow,
} from "@/lib/v5/management/performanceAttribution";

const fmtUsd = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
    : "—";
const fmtPct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "—");

const PERIODS: AttributionPeriod[] = ["7d", "30d", "quarter", "ytd"];

type RawLinks = {
  manageHref?: unknown;
  manage_href?: unknown;
};

type RawMetrics = {
  totalPnl?: unknown;
  total_pnl?: unknown;
  pnlContributionPct?: unknown;
  pnl_contribution_pct?: unknown;
  riskContributionPct?: unknown;
  risk_contribution_pct?: unknown;
  drawdownContributionPct?: unknown;
  drawdown_contribution_pct?: unknown;
  worstDrawdown?: unknown;
  worst_drawdown?: unknown;
};

type RawSourceRefs = {
  personaIds?: unknown;
  persona_ids?: unknown;
};

type RawAttributionRow = Partial<PerformanceAttributionRow> & {
  dimension?: unknown;
  key?: unknown;
  dimensionKey?: unknown;
  dimension_key?: unknown;
  label?: unknown;
  total_pnl?: unknown;
  pnl_contribution_pct?: unknown;
  risk_contribution_pct?: unknown;
  drawdown_contribution_pct?: unknown;
  metrics?: RawMetrics | null;
  evidence_refs?: unknown;
  links?: RawLinks | null;
  sourceRefs?: RawSourceRefs | null;
  source_refs?: RawSourceRefs | null;
};

type AttributionViewRow = PerformanceAttributionRow & {
  sourceRefs?: RawSourceRefs | null;
};

function cleanText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && trimmed !== "null" && trimmed !== "undefined") return trimmed;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function finiteNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return NaN;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter((item): item is string => Boolean(item))
    : [];
}

function isAttributionDimension(value: unknown): value is AttributionDimension {
  return typeof value === "string" && ATTRIBUTION_DIMENSIONS.includes(value as AttributionDimension);
}

function isAttributionPeriod(value: unknown): value is AttributionPeriod {
  return typeof value === "string" && PERIODS.includes(value as AttributionPeriod);
}

function selectedDimensionFromQuery(value: string | null, personaFocus: string): AttributionDimension | "all" {
  if (personaFocus) return "persona";
  return isAttributionDimension(value) ? value : "all";
}

function normalizePerformanceAttributionRow(raw: unknown): AttributionViewRow {
  const r = raw as RawAttributionRow;
  const metrics = r.metrics ?? {};
  const dimension = isAttributionDimension(r.dimension) ? r.dimension : "persona";
  const key = cleanText(r.key, r.dimensionKey, r.dimension_key, r.label) ?? "nan";
  const label = cleanText(r.label, key) ?? "nan";
  const links = r.links ?? {};
  const manageHref = cleanText(links.manageHref, links.manage_href) ?? buildAttributionLinks(dimension, key).manageHref;

  return {
    ...r,
    dimension,
    key,
    label,
    pnlContribution: finiteNumber(r.pnlContribution, r.total_pnl, metrics.totalPnl, metrics.total_pnl),
    pnlContributionPct: finiteNumber(r.pnlContributionPct, r.pnl_contribution_pct, metrics.pnlContributionPct, metrics.pnl_contribution_pct),
    riskContributionPct: finiteNumber(r.riskContributionPct, r.risk_contribution_pct, metrics.riskContributionPct, metrics.risk_contribution_pct),
    drawdownContributionPct: finiteNumber(
      r.drawdownContributionPct,
      r.drawdown_contribution_pct,
      metrics.drawdownContributionPct,
      metrics.drawdown_contribution_pct,
      metrics.worstDrawdown,
      metrics.worst_drawdown,
    ),
    evidenceRefs: stringArray(r.evidenceRefs ?? r.evidence_refs),
    links: { ...buildAttributionLinks(dimension, key), ...links, manageHref },
    sourceRefs: r.sourceRefs ?? r.source_refs,
  };
}

function sourceRefPersonaIds(row: AttributionViewRow): string[] {
  const refs = row.sourceRefs;
  if (!refs) return [];
  return stringArray(refs.personaIds ?? refs.persona_ids);
}

function filterPerformanceRowsForPersona(
  rows: AttributionViewRow[],
  personaFocus: string,
): { rows: AttributionViewRow[]; matched: boolean } {
  const focus = personaFocus.trim();
  if (!focus) return { rows, matched: true };
  const filtered = rows.filter((row) => {
    if (row.dimension !== "persona") return false;
    return [row.key, ...sourceRefPersonaIds(row)].some((value) => value === focus);
  });
  return { rows: filtered, matched: filtered.length > 0 };
}

export const PerformanceAttributionPage = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const personaFocus = searchParams.get("persona")?.trim() ?? "";
  const dimension = selectedDimensionFromQuery(searchParams.get("dimension"), personaFocus);
  const periodParam = searchParams.get("period");
  const period: AttributionPeriod = isAttributionPeriod(periodParam) ? periodParam : "30d";

  const { data } = useV5Live(
    () => mgmt.performanceAttribution.list(
      dimension === "all" ? undefined : dimension,
      period,
    ),
    [dimension, period],
  );
  const allRows = useMemo(() => (data ?? []).map(normalizePerformanceAttributionRow), [data]);
  const dimensionRows = useMemo(() => {
    const filtered = dimension === "all" ? allRows : allRows.filter((r) => r.dimension === dimension);
    return [...filtered].sort((a, b) => (b.pnlContribution || 0) - (a.pnlContribution || 0));
  }, [allRows, dimension]);
  const focus = useMemo(
    () => filterPerformanceRowsForPersona(dimensionRows, personaFocus),
    [dimensionRows, personaFocus],
  );
  const rows = focus.rows;
  const showAllPersonaHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("dimension", "persona");
    params.set("period", period);
    return `/management/performance-attribution?${params.toString()}`;
  }, [period]);

  const updateDimension = (nextDimension: AttributionDimension | "all") => {
    const next = new URLSearchParams(searchParams);
    if (nextDimension === "all") next.delete("dimension");
    else next.set("dimension", nextDimension);
    if (nextDimension !== "persona") next.delete("persona");
    setSearchParams(next, { replace: true });
  };

  const updatePeriod = (nextPeriod: AttributionPeriod) => {
    const next = new URLSearchParams(searchParams);
    next.set("period", nextPeriod);
    setSearchParams(next, { replace: true });
  };

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
            onChange={(e) => updateDimension(e.target.value as AttributionDimension | "all")}
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
            onChange={(e) => updatePeriod(e.target.value as AttributionPeriod)}
            aria-label={t("mgmt.attribution.period")}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>{t(`mgmt.attribution.periods.${p}`, { defaultValue: p })}</option>
            ))}
          </select>
        </div>
      </header>

      {personaFocus && (
        <Card className={"p-3 text-sm " + (focus.matched
          ? "border-primary/30 bg-primary/5"
          : "border-status-warning/30 bg-status-warning/10")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-foreground">
              {focus.matched
                ? t("mgmt.attribution.focusedPersonaFmt", { persona: personaFocus, count: rows.length })
                : t("mgmt.attribution.focusMissingPersonaFmt", { persona: personaFocus })}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to={showAllPersonaHref}>{t("mgmt.attribution.showAllPersona")}</Link>
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <ManagementTableScroll minScrollWidth={1040}>
        <table className="w-full min-w-[1040px] text-sm">
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
        </ManagementTableScroll>
      </Card>
    </section>
  );
};
