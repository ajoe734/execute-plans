// 2026-05-22 PM12-003 — Portfolio Book page.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import {
  defaultPortfolioBook, defaultPortfolioPools, defaultPortfolioHoldings,
  type HoldingRow, type CapitalPoolSummaryRow, type PortfolioStatus,
} from "@/lib/v5/management/portfolio";

const fmtUsd = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
    : "—";
const fmtPct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "—");
const fmtNum = (n: number) =>
  Number.isFinite(n) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n) : "—";

const statusTone = (s: PortfolioStatus) =>
  s === "ok" ? "bg-status-success/15 text-status-success border-status-success/30" :
  s === "watch" ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
  s === "breach" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
                   "bg-muted text-muted-foreground border-border";

export const PortfolioBookPage = () => {
  const { t } = useTranslation();
  const seed = useMemo(() => defaultPortfolioBook(), []);
  const { data: summary } = useV5Live(() => mgmt.portfolioBook.summary(() => seed.summary), []);
  const { data: pools } = useV5Live(
    () => mgmt.portfolioBook.pools(() => defaultPortfolioPools()), []);
  const { data: holdings } = useV5Live(
    () => mgmt.portfolioBook.holdings(() => defaultPortfolioHoldings()), []);
  const s = summary ?? seed.summary;
  const poolRows: CapitalPoolSummaryRow[] = pools ?? seed.pools;
  const holdingRows: HoldingRow[] = holdings ?? seed.holdings;

  const [symbolFilter, setSymbolFilter] = useState("");
  const filtered = holdingRows.filter((h) =>
    !symbolFilter || h.symbol.toLowerCase().includes(symbolFilter.toLowerCase()),
  );

  return (
    <section className="p-6 space-y-6" aria-label={t("mgmt.portfolio.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.portfolio.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("mgmt.portfolio.subtitle")}</p>
      </header>

      {/* Section A: Total Snapshot */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { k: "totalNav", v: fmtUsd(s.totalNav) },
          { k: "totalCash", v: fmtUsd(s.totalCash) },
          { k: "grossExposure", v: fmtUsd(s.grossExposure) },
          { k: "netExposure", v: fmtUsd(s.netExposure) },
          { k: "leverage", v: `${fmtNum(s.leverage)}×` },
          { k: "unrealizedPnl", v: fmtUsd(s.unrealizedPnl) },
          { k: "pnlToday", v: fmtUsd(s.pnlToday) },
          { k: "pnl30d", v: fmtUsd(s.pnl30d) },
        ].map((c) => (
          <Card key={c.k} className="p-3">
            <div className="text-xs text-muted-foreground">{t(`mgmt.portfolio.${c.k}`)}</div>
            <div className="text-lg font-mono text-foreground">{c.v}</div>
          </Card>
        ))}
      </div>

      {/* Section B: Capital Pool Summary */}
      <Card className="overflow-x-auto">
        <header className="px-4 py-2 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">{t("mgmt.portfolio.poolsTitle")}</h2>
        </header>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="px-3 py-2">{t("mgmt.portfolio.pool")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.nav")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.leverage")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.utilization")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.pnlToday")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.drawdown")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.status")}</th>
              <th className="px-3 py-2">{t("mgmt.actions.manage")}</th>
            </tr>
          </thead>
          <tbody>
            {poolRows.map((p) => (
              <tr key={p.capitalPoolId} className="border-b border-border/50">
                <td className="px-3 py-2 font-mono">{p.capitalPoolName}</td>
                <td className="px-3 py-2 font-mono">{fmtUsd(p.nav)}</td>
                <td className="px-3 py-2 font-mono">{fmtNum(p.leverage)}×</td>
                <td className="px-3 py-2 font-mono">{fmtPct(p.utilizationPct)}</td>
                <td className={`px-3 py-2 font-mono ${p.pnlToday < 0 ? "text-status-failed" : "text-status-success"}`}>{fmtUsd(p.pnlToday)}</td>
                <td className="px-3 py-2 font-mono text-status-failed">{fmtPct(p.drawdown)}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={statusTone(p.status)}>{p.status}</Badge>
                </td>
                <td className="px-3 py-2">
                  <Button asChild size="sm" variant="ghost"><Link to={p.links?.manageHref ?? "#"}>{t("mgmt.actions.manage")}</Link></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Section C: Holdings */}
      <Card className="overflow-x-auto">
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
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="px-3 py-2">{t("mgmt.portfolio.symbol")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.assetClass")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.side")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.quantity")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.marketValue")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.weight")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.unrealizedPnl")}</th>
              <th className="px-3 py-2">{t("mgmt.portfolio.exposure")}</th>
              <th className="px-3 py-2">{t("mgmt.actions.manage")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h) => (
              <tr
                key={h.holdingId}
                className={`border-b border-border/50 ${h.exposurePct > 0.4 ? "bg-status-warning/5" : ""} ${h.unrealizedPnl < -50_000 ? "bg-status-failed/5" : ""}`}
              >
                <td className="px-3 py-2 font-mono">{h.symbol}</td>
                <td className="px-3 py-2"><Badge variant="outline">{h.assetClass}</Badge></td>
                <td className="px-3 py-2"><Badge variant="outline">{h.side}</Badge></td>
                <td className="px-3 py-2 font-mono">{fmtNum(h.quantity)}</td>
                <td className="px-3 py-2 font-mono">{fmtUsd(h.marketValue)}</td>
                <td className="px-3 py-2 font-mono">{fmtPct(h.weightPct)}</td>
                <td className={`px-3 py-2 font-mono ${h.unrealizedPnl < 0 ? "text-status-failed" : "text-status-success"}`}>{fmtUsd(h.unrealizedPnl)}</td>
                <td className="px-3 py-2 font-mono">{fmtPct(h.exposurePct)}</td>
                <td className="px-3 py-2">
                  <Button asChild size="sm" variant="ghost"><Link to={h.links?.manageHref ?? "#"}>{t("mgmt.actions.manage")}</Link></Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td className="px-3 py-4 text-center text-muted-foreground" colSpan={9}>{t("mgmt.pulse.noRows")}</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </section>
  );
};
