// 2026-05-22 PM12-003 — Portfolio Book page.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { ManagementOperationsNav } from "@/management/components/operations/ManagementOperationsNav";
import { Input } from "@/components/ui/input";
import { mgmt } from "@/lib/bff-v1";
import type { ManagementPortfolioExposureItem } from "@/lib/bff-v1/management";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import type { HoldingRow } from "@/lib/v5/management/portfolio";

const fmtUsd = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
    : "—";
const fmtPct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "—");
const fmtNum = (n: number) =>
  Number.isFinite(n) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n) : "—";
const fmtInteger = (n: number) => (Number.isFinite(n) ? new Intl.NumberFormat("en-US").format(n) : "—");
const fmtTime = (value?: string) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

const statusTone = (s: string) =>
  ["ok", "active", "within_budget", "ready"].includes(s) ? "bg-status-success/15 text-status-success border-status-success/30" :
  ["watch", "near_limit", "unknown"].includes(s) ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
  ["breach", "over_budget", "failed"].includes(s) ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
                   "bg-muted text-muted-foreground border-border";

const poolAttributionHref = (poolId: string): string =>
  `/management/performance-attribution?dimension=capital_pool&entity=${encodeURIComponent(poolId)}&period=30d`;

const personaAttributionHref = (personaId: string): string =>
  `/management/performance-attribution?dimension=persona&persona=${encodeURIComponent(personaId)}&period=30d`;

export const PortfolioBookPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const poolFocus = (searchParams.get("capital_pool_id") ?? searchParams.get("pool"))?.trim() ?? "";
  const { data: exposure, loading: exposureLoading } = useV5Live(() => mgmt.portfolioBook.exposureLiveOnly(), []);
  const { data: holdings } = useV5Live(() => mgmt.portfolioBook.holdingsLiveOnly(), []);
  const s = exposure?.summary;
  const poolRows: ManagementPortfolioExposureItem[] = useMemo(
    () => (exposure?.items ?? []).filter((row) => !poolFocus || row.capitalPoolId === poolFocus),
    [exposure?.items, poolFocus],
  );
  const holdingRows: HoldingRow[] = holdings ?? [];

  const [symbolFilter, setSymbolFilter] = useState("");
  const filtered = holdingRows.filter((h) => {
    if (poolFocus && h.capitalPoolId !== poolFocus) return false;
    return !symbolFilter || h.symbol.toLowerCase().includes(symbolFilter.toLowerCase());
  });

  return (
    <section className="p-6 space-y-6" aria-label={t("mgmt.portfolio.title")}>
      <ManagementOperationsNav />
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.portfolio.title")}</h1>
          {exposure ? (
            <Badge variant="outline" className={statusTone(exposure.dataConfidence === "formal" ? "ok" : "near_limit")}>
              {t(`mgmt.attribution.confidence.${exposure.dataConfidence}`)}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{t("mgmt.portfolio.subtitle")}</p>
      </header>
      {poolFocus && (
        <Card className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-foreground">
              {t("mgmt.portfolio.focusedPoolFmt", { pool: poolFocus })}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to="/management/portfolio-book">{t("mgmt.portfolio.showAllPools")}</Link>
            </Button>
          </div>
        </Card>
      )}
      {!exposure && !exposureLoading && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground">
            {t("mgmt.liveOnly.unavailableTitle", { defaultValue: "Live data unavailable" })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("mgmt.liveOnly.unavailableBody", { defaultValue: "This page does not render seed, demo, or non-production fallback data." })}
          </p>
        </Card>
      )}

      {exposure?.sourceIssues.length ? (
        <Card className="border-status-warning/30 bg-status-warning/10 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={statusTone("near_limit")}>
              {t("mgmt.portfolio.partialCoverage")}
            </Badge>
            <span className="text-muted-foreground">{exposure.sourceIssues.join(" · ")}</span>
          </div>
        </Card>
      ) : null}

      {/* Section A: Total Snapshot */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { k: "riskBudgetTotal", v: fmtUsd(s?.riskBudgetTotal ?? Number.NaN) },
          { k: "currentExposureTotal", v: fmtUsd(s?.currentExposureTotal ?? Number.NaN) },
          { k: "availableBudgetTotal", v: fmtUsd(s?.availableBudgetTotal ?? Number.NaN) },
          { k: "riskBudgetUtilization", v: fmtPct(s?.riskBudgetUtilization ?? Number.NaN) },
          { k: "overBudgetCount", v: fmtInteger(s?.overBudgetCount ?? Number.NaN) },
          { k: "nearLimitCount", v: fmtInteger(s?.nearLimitCount ?? Number.NaN) },
          { k: "telemetryRuntimeCount", v: fmtInteger(s?.telemetryRuntimeCount ?? Number.NaN) },
          { k: "latestTelemetryAt", v: fmtTime(s?.latestTelemetryAt) },
        ].map((c) => (
          <Card key={c.k} className="p-3">
            <div className="text-xs text-muted-foreground">{t(`mgmt.portfolio.${c.k}`)}</div>
            <div className="text-lg font-mono text-foreground">{c.v}</div>
          </Card>
        ))}
      </div>

      {/* Section B: Capital Pool Summary */}
      <Card>
        <header className="px-4 py-2 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">{t("mgmt.portfolio.poolsTitle")}</h2>
        </header>
        <ManagementTableScroll minScrollWidth={1120}>
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="px-3 py-2">{t("mgmt.portfolio.pool")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.riskBudget")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.currentExposure")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.availableBudget")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.utilization")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.runtimes")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.telemetry")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.totalPnl")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.status")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.analysis")}</th>
            </tr>
          </thead>
          <tbody>
            {poolRows.map((p) => (
              <tr key={p.capitalPoolId} className="border-b border-border/50">
                <td className="px-3 py-2">
                  <div className="font-medium text-foreground">{p.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{p.capitalPoolId}</div>
                </td>
                <td className="px-3 py-2 font-mono">{fmtUsd(p.riskBudget ?? Number.NaN)}</td>
                <td className="px-3 py-2 font-mono">{fmtUsd(p.currentExposure ?? Number.NaN)}</td>
                <td className="px-3 py-2 font-mono">{fmtUsd(p.availableBudget ?? Number.NaN)}</td>
                <td className="px-3 py-2 font-mono">{fmtPct(p.riskBudgetUtilization ?? Number.NaN)}</td>
                <td className="px-3 py-2 font-mono">{p.activeRuntimeCount}/{p.runtimeCount}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={statusTone(p.telemetryAvailable ? "ok" : "unknown")}>
                    {p.telemetryAvailable ? t("mgmt.portfolio.covered") : t("mgmt.portfolio.missing")}
                  </Badge>
                </td>
                <td className={`px-3 py-2 font-mono ${(p.pnl ?? 0) < 0 ? "text-status-failed" : "text-status-success"}`}>{fmtUsd(p.pnl ?? Number.NaN)}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={statusTone(p.riskState)}>{p.riskState}</Badge>
                </td>
                <td className="px-3 py-2">
                  <Button asChild size="sm" variant="ghost">
                    <Link to={poolAttributionHref(p.capitalPoolId)}>{t("nav.performanceAttribution")}</Link>
                  </Button>
                </td>
              </tr>
            ))}
            {poolRows.length === 0 && (
              <tr><td className="px-3 py-4 text-center text-muted-foreground" colSpan={10}>{t("mgmt.pulse.noRows")}</td></tr>
            )}
          </tbody>
        </table>
        </ManagementTableScroll>
      </Card>

      {/* Section C: Holdings */}
      <Card>
        <header className="px-4 py-2 border-b border-border flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">{t("mgmt.portfolio.holdingsTitle")}</h2>
          <Input
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            placeholder={t("mgmt.portfolio.filterSymbol")}
            className="h-8 w-48"
            aria-label={t("mgmt.portfolio.filterSymbol")}
          />
        </header>
        <ManagementTableScroll minScrollWidth={1440}>
        <table className="w-full min-w-[1440px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="px-3 py-2">{t("mgmt.portfolio.symbol")}</th>
              <th className="px-3 py-2">{t("mgmt.league.persona")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.pool")}</th>
              <th className="px-3 py-2">{t("mgmt.attribution.runtime")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.assetClass")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.side")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.quantity")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.marketValue")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.weight")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.unrealizedPnl")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.exposure")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.updatedAt")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.analysis")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h) => (
              <tr
                key={h.holdingId}
                className={`border-b border-border/50 ${h.exposurePct > 0.4 ? "bg-status-warning/5" : ""} ${h.unrealizedPnl < -50_000 ? "bg-status-failed/5" : ""}`}
              >
                <td className="px-3 py-2 font-mono">{h.symbol}</td>
                <td className="px-3 py-2 font-mono">
                  {h.personaId ? (
                    <Link className="text-primary hover:underline" to={`/management/persona-fleet?persona=${encodeURIComponent(h.personaId)}`}>
                      {h.personaId}
                    </Link>
                  ) : "—"}
                </td>
                <td className="px-3 py-2 font-mono">{h.capitalPoolId || "—"}</td>
                <td className="px-3 py-2 font-mono">{h.runtimeId || "—"}</td>
                <td className="px-3 py-2"><Badge variant="outline">{h.assetClass}</Badge></td>
                <td className="px-3 py-2"><Badge variant="outline">{h.side}</Badge></td>
                <td className="px-3 py-2 font-mono">{fmtNum(h.quantity)}</td>
                <td className="px-3 py-2 font-mono">{fmtUsd(h.marketValue)}</td>
                <td className="px-3 py-2 font-mono">{fmtPct(h.weightPct)}</td>
                <td className={`px-3 py-2 font-mono ${h.unrealizedPnl < 0 ? "text-status-failed" : "text-status-success"}`}>{fmtUsd(h.unrealizedPnl)}</td>
                <td className="px-3 py-2 font-mono">{fmtPct(h.exposurePct)}</td>
                <td className="px-3 py-2 font-mono text-xs">{fmtTime(h.updatedAt)}</td>
                <td className="px-3 py-2">
                  <Button asChild size="sm" variant="ghost">
                    <Link to={h.personaId ? personaAttributionHref(h.personaId) : poolAttributionHref(h.capitalPoolId)}>
                      {t("nav.performanceAttribution")}
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td className="px-3 py-4 text-center text-muted-foreground" colSpan={13}>{t("mgmt.pulse.noRows")}</td></tr>
            )}
          </tbody>
        </table>
        </ManagementTableScroll>
      </Card>
    </section>
  );
};
