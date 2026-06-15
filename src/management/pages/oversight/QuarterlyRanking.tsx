// 2026-05-22 PM12-007 — Quarterly Ranking page.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import {
  defaultQuarterlyRanking, defaultQuarterlyFormula, defaultQuarterlySnapshot,
  type QuarterlyRankingRow,
} from "@/lib/v5/management/quarterlyRanking";
import { sendRankingRecommendation } from "@/lib/v5/management/rankingGovernance";

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;
const fmtNum = (n: number, d = 2) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n);

const deltaArrow = (d?: number) =>
  d === undefined ? "·" : d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${Math.abs(d)}` : "—";

export const QuarterlyRankingPage = () => {
  const { t } = useTranslation();
  const seedRows = useMemo(() => defaultQuarterlyRanking(), []);
  const seedFormula = useMemo(() => defaultQuarterlyFormula(), []);
  const snap = useMemo(() => defaultQuarterlySnapshot(), []);

  const { data: rows } = useV5Live(
    () => mgmt.quarterlyRanking.list(snap.quarter, () => seedRows), [snap.quarter],
  );
  const { data: formula } = useV5Live(
    () => mgmt.quarterlyRanking.formula(() => seedFormula), [],
  );
  const ranking: QuarterlyRankingRow[] = rows ?? seedRows;
  const f = formula ?? seedFormula;

  const disqualified = ranking.filter((r) => r.eligibility !== "eligible");
  const eligible = ranking.filter((r) => r.eligibility === "eligible");
  const evidence = ranking.flatMap((r) => r.evidenceRefs);

  return (
    <section className="p-6 space-y-6" aria-label={t("mgmt.quarterly.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.quarterly.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("mgmt.quarterly.subtitle")}</p>
      </header>

      {/* Snapshot */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { k: "currentQuarter", v: snap.quarter },
          { k: "cutoffDate", v: snap.cutoffDate },
          { k: "daysRemaining", v: String(snap.daysRemaining) },
          { k: "formulaVersion", v: f.version },
        ].map((c) => (
          <Card key={c.k} className="p-3">
            <div className="text-xs text-muted-foreground">{t(`mgmt.quarterly.${c.k}`)}</div>
            <div className="text-lg font-mono text-foreground">{c.v}</div>
          </Card>
        ))}
      </div>

      {/* Formula */}
      <Card className="p-3">
        <h2 className="text-sm font-semibold text-foreground mb-2">{t("mgmt.quarterly.formulaWeights")}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {Object.entries(f.weights ?? {}).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-muted-foreground">{t(`mgmt.quarterly.weightKeys.${k}`)}</span>
              <span className="font-mono">{fmtNum(v as number)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          {t("mgmt.quarterly.minTradingDays")}: <span className="font-mono text-foreground">{f.minDataRequirements?.minTradingDays ?? "—"}</span>
          {"  ·  "}{t("mgmt.quarterly.minTrades")}: <span className="font-mono text-foreground">{f.minDataRequirements?.minTrades ?? "—"}</span>
        </div>
      </Card>

      {/* Ranking table */}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="px-3 py-2">{t("mgmt.league.rank")}</th>
              <th className="px-3 py-2">{t("mgmt.quarterly.prevRank")}</th>
              <th className="px-3 py-2">Δ</th>
              <th className="px-3 py-2">{t("mgmt.league.persona")}</th>
              <th className="px-3 py-2">{t("mgmt.league.tier")}</th>
              <th className="px-3 py-2">{t("mgmt.league.score")}</th>
              <th className="px-3 py-2">{t("mgmt.quarterly.pnlQ")}</th>
              <th className="px-3 py-2">{t("mgmt.league.sharpe")}</th>
              <th className="px-3 py-2">{t("mgmt.quarterly.eligibility")}</th>
              <th className="px-3 py-2">{t("mgmt.league.recommendation")}</th>
            </tr>
          </thead>
          <tbody>
            {eligible.map((r) => (
              <tr key={r.personaId} className="border-b border-border/50">
                <td className="px-3 py-2 font-mono">#{r.currentRank}</td>
                <td className="px-3 py-2 font-mono">{r.previousQuarterRank ?? "·"}</td>
                <td className={`px-3 py-2 font-mono ${(r.rankDelta ?? 0) > 0 ? "text-status-success" : (r.rankDelta ?? 0) < 0 ? "text-status-failed" : "text-muted-foreground"}`}>{deltaArrow(r.rankDelta)}</td>
                <td className="px-3 py-2">
                  <Link to={r.links.manageHref} className="text-primary hover:underline font-mono">{r.personaName}</Link>
                </td>
                <td className="px-3 py-2"><Badge variant="outline">{r.tier}</Badge></td>
                <td className="px-3 py-2 font-mono">{fmtNum(r.score, 1)}</td>
                <td className={`px-3 py-2 font-mono ${r.pnlQuarter < 0 ? "text-status-failed" : "text-status-success"}`}>{fmtUsd(r.pnlQuarter)}</td>
                <td className="px-3 py-2 font-mono">{fmtNum(r.sharpeQuarter)}</td>
                <td className="px-3 py-2 text-xs">{t(`mgmt.quarterly.eligibilityValues.${r.eligibility}`)}</td>
                <td className="px-3 py-2">
                  {r.recommendation && r.recommendation !== "no_change" ? (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => {
                        const id = sendRankingRecommendation({
                          personaId: r.personaId, personaName: r.personaName,
                          recommendation: r.recommendation!, source: "quarterly_ranking",
                          quarter: r.quarter, evidenceRefs: r.evidenceRefs,
                        });
                        window.location.assign(`/management/human-inbox/${id}`);
                      }}
                    >
                      {t(`mgmt.league.recommendations.${r.recommendation}`)} →
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("mgmt.league.recommendations.no_change")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Disqualified */}
      {disqualified.length > 0 && (
        <Card className="p-3">
          <h2 className="text-sm font-semibold text-foreground mb-2">{t("mgmt.quarterly.disqualified")}</h2>
          <ul className="text-sm space-y-1">
            {disqualified.map((d) => (
              <li key={d.personaId}>
                <Link to={d.links.manageHref} className="text-primary hover:underline font-mono">{d.personaName}</Link>
                <span className="text-muted-foreground"> — {d.disqualificationReason ?? t(`mgmt.quarterly.eligibilityValues.${d.eligibility}`)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Evidence */}
      <Card className="p-3">
        <h2 className="text-sm font-semibold text-foreground mb-2">{t("mgmt.quarterly.evidencePackets")}</h2>
        <div className="flex flex-wrap gap-2">
          {evidence.map((e) => (
            <Link key={e} to={`/management/evidence/${e}`} className="text-xs font-mono text-primary hover:underline">
              {e}
            </Link>
          ))}
        </div>
      </Card>
    </section>
  );
};
