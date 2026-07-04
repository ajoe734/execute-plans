// 2026-05-22 PM12-007 — Quarterly Ranking page.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import {
  type QuarterlyRankingFormula, type QuarterlyRankingRow,
} from "@/lib/v5/management/quarterlyRanking";
import { sendRankingRecommendation } from "@/lib/v5/management/rankingGovernance";

const EMPTY_FORMULA: QuarterlyRankingFormula = {
  formulaId: "nan",
  version: "—",
  activeFrom: "—",
  weights: {
    pnl: Number.NaN,
    sharpe: Number.NaN,
    drawdownControl: Number.NaN,
    executionQuality: Number.NaN,
    riskCompliance: Number.NaN,
    improvement: Number.NaN,
    humanInterventionPenalty: Number.NaN,
  },
  hardPenalties: {
    riskPolicyViolation: Number.NaN,
    unresolvedCriticalIncident: Number.NaN,
    missingEvidence: Number.NaN,
    capitalBreach: Number.NaN,
  },
  minDataRequirements: {
    minTradingDays: Number.NaN,
    minTrades: Number.NaN,
  },
};

const fmtUsd = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
    : "—";
const fmtPct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "—");
const fmtNum = (n: number, d = 2) =>
  Number.isFinite(n) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n) : "—";

const deltaArrow = (d?: number) =>
  d === undefined ? "·" : d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${Math.abs(d)}` : "—";

function currentQuarterId(today = new Date()): string {
  const year = today.getFullYear();
  const quarter = Math.floor(today.getMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

function quarterCutoffDate(quarterId: string): string {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarterId);
  if (!match) return "—";
  const cutoff = new Date(Date.UTC(Number(match[1]), Number(match[2]) * 3, 0));
  return cutoff.toISOString().slice(0, 10);
}

function daysUntil(dateText: string): string {
  const cutoff = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(cutoff.getTime())) return "—";
  return String(Math.max(0, Math.ceil((cutoff.getTime() - Date.now()) / 86_400_000)));
}

const personaManageHref = (row: QuarterlyRankingRow): string =>
  row.links?.manageHref ?? `/management/personas/${encodeURIComponent(row.personaId)}`;

export const QuarterlyRankingPage = () => {
  const { t } = useTranslation();
  const currentQuarter = useMemo(() => currentQuarterId(), []);

  const { data: rows } = useV5Live(
    () => mgmt.quarterlyRanking.listLiveOnly(currentQuarter), [currentQuarter],
  );
  const { data: formula } = useV5Live(
    () => mgmt.quarterlyRanking.formulaLiveOnly(), [],
  );
  // Normalize live rows: the BFF shape carries overallScore/tierLabel/metrics
  // and no `eligibility` field, so map them onto the FE view-model (otherwise
  // every persona is treated as disqualified and score/pnl render NaN).
  const ranking: QuarterlyRankingRow[] = (rows ?? []).map((raw, i) => {
    const r = raw as QuarterlyRankingRow & {
      overallScore?: number; tierLabel?: string; name?: string; rank?: number;
      metrics?: { pnl?: number | null; sharpe?: number | null };
    };
    if (typeof r.eligibility === "string" && typeof r.score === "number") return r;
    return {
      ...r,
      eligibility: r.eligibility ?? "eligible",
      currentRank: r.currentRank ?? r.rank ?? i + 1,
      personaName: r.personaName ?? r.name ?? r.personaId ?? r.id,
      score: r.score ?? r.overallScore ?? NaN,
      tier: r.tier ?? r.tierLabel ?? "—",
      pnlQuarter: r.pnlQuarter ?? r.metrics?.pnl ?? NaN,
      sharpeQuarter: r.sharpeQuarter ?? r.metrics?.sharpe ?? NaN,
      evidenceRefs: r.evidenceRefs ?? [],
    } as QuarterlyRankingRow;
  });
  const f = formula ?? EMPTY_FORMULA;

  const disqualified = ranking.filter((r) => r.eligibility !== "eligible");
  const eligible = ranking.filter((r) => r.eligibility === "eligible");
  const evidence = ranking.flatMap((r) => r.evidenceRefs ?? []);
  const quarter = ranking.find((row) => row.quarter)?.quarter ?? currentQuarter;
  const cutoffDate = quarterCutoffDate(quarter);

  return (
    <section className="p-6 space-y-6" aria-label={t("mgmt.quarterly.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.quarterly.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("mgmt.quarterly.subtitle")}</p>
      </header>

      {/* Snapshot */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { k: "currentQuarter", v: quarter },
          { k: "cutoffDate", v: cutoffDate },
          { k: "daysRemaining", v: daysUntil(cutoffDate) },
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
              <span className="text-muted-foreground">{t(`mgmt.quarterly.weightKeys.${k}`, { defaultValue: k })}</span>
              <span className="font-mono">{fmtNum(v as number)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          {t("mgmt.quarterly.minTradingDays")}: <span className="font-mono text-foreground">{fmtNum(f.minDataRequirements?.minTradingDays ?? Number.NaN, 0)}</span>
          {"  ·  "}{t("mgmt.quarterly.minTrades")}: <span className="font-mono text-foreground">{fmtNum(f.minDataRequirements?.minTrades ?? Number.NaN, 0)}</span>
        </div>
      </Card>

      {/* Ranking table */}
      <Card>
        <ManagementTableScroll minScrollWidth={1120}>
        <table className="w-full min-w-[1120px] text-sm">
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
                  <Link to={personaManageHref(r)} className="text-primary hover:underline font-mono">{r.personaName}</Link>
                </td>
                <td className="px-3 py-2"><Badge variant="outline">{r.tier}</Badge></td>
                <td className="px-3 py-2 font-mono">{fmtNum(r.score, 1)}</td>
                <td className={`px-3 py-2 font-mono ${r.pnlQuarter < 0 ? "text-status-failed" : "text-status-success"}`}>{fmtUsd(r.pnlQuarter)}</td>
                <td className="px-3 py-2 font-mono">{fmtNum(r.sharpeQuarter)}</td>
                <td className="px-3 py-2 text-xs">{t(`mgmt.quarterly.eligibilityValues.${r.eligibility}`, { defaultValue: String(r.eligibility ?? "—") })}</td>
                <td className="px-3 py-2">
                  {r.recommendation && r.recommendation !== "no_change" ? (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => {
                        const id = sendRankingRecommendation({
                          personaId: r.personaId, personaName: r.personaName,
                          recommendation: r.recommendation!, source: "quarterly_ranking",
                          quarter: r.quarter ?? quarter, evidenceRefs: r.evidenceRefs ?? [],
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
            {eligible.length === 0 && (
              <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={10}>{t("mgmt.pulse.noRows")}</td></tr>
            )}
          </tbody>
        </table>
        </ManagementTableScroll>
      </Card>

      {/* Disqualified */}
      {disqualified.length > 0 && (
        <Card className="p-3">
          <h2 className="text-sm font-semibold text-foreground mb-2">{t("mgmt.quarterly.disqualified")}</h2>
          <ul className="text-sm space-y-1">
            {disqualified.map((d) => (
              <li key={d.personaId}>
                <Link to={personaManageHref(d)} className="text-primary hover:underline font-mono">{d.personaName}</Link>
                <span className="text-muted-foreground"> — {d.disqualificationReason ?? t(`mgmt.quarterly.eligibilityValues.${d.eligibility}`, { defaultValue: String(d.eligibility ?? "—") })}</span>
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
          {evidence.length === 0 && (
            <span className="text-xs text-muted-foreground">{t("mgmt.pulse.noRows")}</span>
          )}
        </div>
      </Card>
    </section>
  );
};
