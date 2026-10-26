// 2026-05-22 PM12-009 — Total Capital Snapshot card for Cockpit.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import type { CockpitCapitalSummary } from "@/lib/v5/management/portfolio";
import { canonicalCenterUrl } from "@/management/navigation/managementRouteManifest";

const UNKNOWN = "—";
const fmtUsd = (n: number | null) =>
  n === null ? UNKNOWN : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtCount = (n: number | null) => (n === null ? UNKNOWN : String(n));
// total_pnl carries no currency from the owner: show the bare number, never a symbol.
const fmtUnitless = (n: number | null) =>
  n === null ? UNKNOWN : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
const toneOf = (n: number | null): "ok" | "bad" | undefined => (n === null ? undefined : n < 0 ? "bad" : "ok");

export const TotalCapitalSnapshot = ({ summary }: { summary: CockpitCapitalSummary }) => {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{t("mgmt.cockpit.totalCapital")}</h3>
        <Link to={canonicalCenterUrl("performance", "overview")} className="text-xs text-primary hover:underline">{t("mgmt.actions.openDetail")} →</Link>
      </header>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label={t("mgmt.portfolio.totalNav")} value={fmtUsd(summary.totalNav)} />
        <Stat label={t("mgmt.portfolio.totalCash")} value={fmtUsd(summary.totalCash)} />
        <Stat label={t("mgmt.portfolio.grossExposure")} value={fmtUsd(summary.grossExposure)} />
        <Stat label={t("mgmt.portfolio.leverage")} value={summary.leverage === null ? UNKNOWN : `${summary.leverage.toFixed(2)}×`} />
        <Stat label={t("mgmt.portfolio.unrealizedPnl")} value={fmtUsd(summary.unrealizedPnl)} tone={toneOf(summary.unrealizedPnl)} />
        <Stat label={t("mgmt.portfolio.pnlToday")} value={fmtUsd(summary.pnlToday)} tone={toneOf(summary.pnlToday)} />
        <Stat label={t("mgmt.cockpit.activePools")} value={fmtCount(summary.activeCapitalPools)} />
        <Stat label={t("mgmt.cockpit.highestRiskPool")} value={summary.highestRiskPoolId ?? "·"} />
        <Stat label="Active runtimes" value={fmtCount(summary.activeRuntimeCount)} />
        <Stat label="Paper / live runtimes" value={`${fmtCount(summary.paperRuntimeCount)} / ${fmtCount(summary.liveRuntimeCount)}`} />
        <Stat label="Total trades" value={fmtCount(summary.totalTrades)} />
        <Stat label="Total PnL (currency not supplied)" value={fmtUnitless(summary.totalPnl)} tone={toneOf(summary.totalPnl)} />
      </div>
    </Card>
  );
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color = tone === "bad" ? "text-status-failed" : tone === "ok" ? "text-status-success" : "text-foreground";
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}
