// 2026-05-22 PM12-009 — Quarterly Ranking countdown for Cockpit.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import type { QuarterlySnapshot } from "@/lib/v5/management/quarterlyRanking";
import { canonicalCenterUrl } from "@/management/navigation/managementRouteManifest";

export const QuarterlyRankingCountdown = ({ snap }: { snap: QuarterlySnapshot }) => {
  const { t } = useTranslation();
  const urgent = snap.daysRemaining <= 14;
  return (
    <Card className="p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{t("mgmt.cockpit.quarterlyCountdown")}</h3>
        <Link to={canonicalCenterUrl("rankings", "quarterly")} className="text-xs text-primary hover:underline">{t("mgmt.actions.openDetail")} →</Link>
      </header>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label={t("mgmt.quarterly.currentQuarter")} value={snap.quarter} />
        <Stat label={t("mgmt.quarterly.cutoffDate")} value={snap.cutoffDate} />
        <Stat
          label={t("mgmt.quarterly.daysRemaining")}
          value={String(snap.daysRemaining)}
          tone={urgent ? "bad" : "ok"}
        />
        <Stat label={t("mgmt.quarterly.formulaVersion")} value={snap.formulaVersion} />
        <Stat label={t("mgmt.quarterly.eligible")} value={String(snap.eligiblePersonas)} />
        <Stat
          label={t("mgmt.quarterly.disqualified")}
          value={String(snap.disqualifiedPersonas)}
          tone={snap.disqualifiedPersonas > 0 ? "bad" : "ok"}
        />
        <Stat
          label={t("mgmt.quarterly.evidenceGaps")}
          value={String(snap.pendingEvidenceGaps)}
          tone={snap.pendingEvidenceGaps > 0 ? "warn" : "ok"}
        />
      </div>
    </Card>
  );
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const color =
    tone === "bad" ? "text-status-failed" :
    tone === "warn" ? "text-status-warning" :
    tone === "ok" ? "text-status-success" : "text-foreground";
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}
