// 2026-05-22 PM12-009 — Persona League snapshot for Cockpit.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { computeTopMovers, type PersonaLeagueRow } from "@/lib/v5/management/personaLeague";

export const PersonaLeagueSnapshot = ({ rows }: { rows: PersonaLeagueRow[] }) => {
  const { t } = useTranslation();
  const sorted = [...rows].sort((a, b) => a.currentRank - b.currentRank);
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3).reverse();
  const movers = computeTopMovers(rows, 1);
  return (
    <Card className="p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{t("mgmt.cockpit.personaLeague")}</h3>
        <Link to="/management/persona-league" className="text-xs text-primary hover:underline">{t("mgmt.actions.openDetail")} →</Link>
      </header>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <Block title={t("mgmt.league.top3")} rows={top3} />
        <Block title={t("mgmt.league.bottom3")} rows={bottom3} />
      </div>
      <div className="mt-3 pt-3 border-t border-border text-xs space-y-1">
        {movers.topUp[0] && (
          <div>
            <span className="text-muted-foreground">{t("mgmt.league.biggestUp")}: </span>
            <Link to={movers.topUp[0].links.manageHref} className="text-status-success font-mono hover:underline">
              {movers.topUp[0].personaName} (+{movers.topUp[0].rankDelta})
            </Link>
          </div>
        )}
        {movers.topDown[0] && (
          <div>
            <span className="text-muted-foreground">{t("mgmt.league.biggestDown")}: </span>
            <Link to={movers.topDown[0].links.manageHref} className="text-status-failed font-mono hover:underline">
              {movers.topDown[0].personaName} ({movers.topDown[0].rankDelta})
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
};

function Block({ title, rows }: { title: string; rows: PersonaLeagueRow[] }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1">{title}</div>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.personaId} className="flex justify-between">
            <Link to={r.links.manageHref} className="font-mono text-primary hover:underline">#{r.currentRank} {r.personaName}</Link>
            <span className="font-mono text-muted-foreground">{r.tier}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
