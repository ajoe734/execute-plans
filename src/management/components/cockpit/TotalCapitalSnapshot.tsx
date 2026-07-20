// 2026-05-22 PM12-009 — Total Capital Snapshot card for Cockpit.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import type { PortfolioSummary } from "@/lib/v5/management/portfolio";
import { canonicalCenterUrl } from "@/management/navigation/managementRouteManifest";

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export const TotalCapitalSnapshot = ({ summary }: { summary: PortfolioSummary }) => {
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
        <Stat label={t("mgmt.portfolio.leverage")} value={`${summary.leverage.toFixed(2)}×`} />
        <Stat label={t("mgmt.portfolio.unrealizedPnl")} value={fmtUsd(summary.unrealizedPnl)} tone={summary.unrealizedPnl < 0 ? "bad" : "ok"} />
        <Stat label={t("mgmt.portfolio.pnlToday")} value={fmtUsd(summary.pnlToday)} tone={summary.pnlToday < 0 ? "bad" : "ok"} />
        <Stat label={t("mgmt.cockpit.activePools")} value={String(summary.activeCapitalPools)} />
        <Stat label={t("mgmt.cockpit.highestRiskPool")} value={summary.highestRiskPoolId ?? "·"} />
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
