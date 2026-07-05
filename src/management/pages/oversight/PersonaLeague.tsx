// 2026-05-22 PM12-005 — Persona League page.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import {
  sortByPreset, tierDistribution, computeTopMovers,
  PERSONA_LEAGUE_PRESETS,
  type PersonaLeaguePreset, type PersonaLeagueRow,
} from "@/lib/v5/management/personaLeague";
import {
  currentPm12QuarterId,
  isGovernedRankingRecommendationAction,
  makeRankingRecommendationId,
  sendRankingRecommendation,
  type RankingRecommendationAction,
  type RankingRecommendationSubmitResult,
} from "@/lib/v5/management/rankingGovernance";

const fmtUsd = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
    : "—";
const fmtPct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "—");
const fmtNum = (n: number, d = 2) =>
  Number.isFinite(n) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n) : "—";

const tierTone = (tier: string) =>
  tier === "S" ? "bg-status-success/20 text-status-success border-status-success/30" :
  tier === "A" ? "bg-primary/15 text-primary border-primary/30" :
  tier === "B" ? "bg-muted text-foreground border-border" :
  tier === "C" ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
  tier === "suspended" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
                         "bg-muted text-muted-foreground border-border";

const deltaArrow = (d?: number) =>
  d === undefined ? "·" : d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${Math.abs(d)}` : "—";

const personaManageHref = (row: PersonaLeagueRow): string =>
  row.links?.manageHref ?? `/management/personas/${encodeURIComponent(row.personaId)}`;

const EMPTY_PERSONA_LEAGUE_ROWS: PersonaLeagueRow[] = [];

type RecommendationUiState =
  | { kind: "submitting" }
  | { kind: "local_only"; result: RankingRecommendationSubmitResult }
  | { kind: "submitted"; result: RankingRecommendationSubmitResult }
  | { kind: "error"; message: string };

type PersonaLeagueRecommendationRow = PersonaLeagueRow & {
  recommendationId?: string;
  recommendation_id?: string;
  evidenceRefs?: string[];
  evidence_refs?: string[];
  governanceDestinations?: string[];
  governance_destinations?: string[];
};

const evidenceRefsFromRow = (row: PersonaLeagueRecommendationRow): string[] =>
  row.evidenceRefs ?? row.evidence_refs ?? [];

const governanceDestinationsFromRow = (row: PersonaLeagueRecommendationRow): string[] | undefined =>
  row.governanceDestinations ?? row.governance_destinations;

export const PersonaLeaguePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data } = useV5Live(() => mgmt.personaLeague.listLiveOnly(), []);
  const rows = data ?? EMPTY_PERSONA_LEAGUE_ROWS;

  const [preset, setPreset] = useState<PersonaLeaguePreset>("overall");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [recommendationState, setRecommendationState] = useState<Record<string, RecommendationUiState>>({});
  const currentQuarter = useMemo(() => currentPm12QuarterId(), []);

  const sorted = useMemo(() => sortByPreset(rows, preset), [rows, preset]);
  const tiers = useMemo(() => tierDistribution(rows), [rows]);
  const movers = useMemo(() => computeTopMovers(rows), [rows]);
  const suspended = rows.filter((r) => r.status === "suspended" || r.tier === "suspended");

  const recommendationIdFor = (r: PersonaLeagueRow, action: RankingRecommendationAction): string => {
    const row = r as PersonaLeagueRecommendationRow;
    return row.recommendationId ?? row.recommendation_id ?? makeRankingRecommendationId({
      personaId: r.personaId,
      personaName: r.personaName,
      recommendation: action,
      source: "persona_league",
      quarter: currentQuarter,
      evidenceRefs: evidenceRefsFromRow(row),
    });
  };

  const submitRecommendation = async (r: PersonaLeagueRow, action: RankingRecommendationAction) => {
    const row = r as PersonaLeagueRecommendationRow;
    const recommendationId = recommendationIdFor(r, action);
    setRecommendationState((prev) => ({ ...prev, [recommendationId]: { kind: "submitting" } }));
    try {
      const result = await sendRankingRecommendation({
        personaId: r.personaId,
        personaName: r.personaName,
        recommendation: action,
        recommendationId,
        source: "persona_league",
        quarter: currentQuarter,
        evidenceRefs: evidenceRefsFromRow(row),
        governanceDestinations: governanceDestinationsFromRow(row),
      });
      if (result.persisted && result.detailHref) {
        navigate(result.detailHref);
        return;
      }
      setRecommendationState((prev) => ({
        ...prev,
        [recommendationId]: { kind: result.persisted ? "submitted" : "local_only", result },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRecommendationState((prev) => ({ ...prev, [recommendationId]: { kind: "error", message } }));
    }
  };

  return (
    <section className="p-6 space-y-6" aria-label={t("mgmt.league.title")}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.league.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.league.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">{t("mgmt.league.preset")}</label>
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            value={preset}
            onChange={(e) => setPreset(e.target.value as PersonaLeaguePreset)}
            aria-label={t("mgmt.league.preset")}
          >
            {PERSONA_LEAGUE_PRESETS.map((p) => (
              <option key={p} value={p}>{t(`mgmt.league.presets.${p}`)}</option>
            ))}
          </select>
        </div>
      </header>

      {/* KPI + Tier distribution + Top movers */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground mb-2">{t("mgmt.league.tierDistribution")}</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(tiers)
              .filter(([tier, count]) => tier && tier !== "undefined" && Number.isFinite(count as number))
              .map(([tier, count]) => (
                <Badge key={tier} variant="outline" className={tierTone(tier)}>{tier}: {count}</Badge>
              ))}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground mb-2">{t("mgmt.league.topUp")}</div>
          <ul className="text-sm space-y-1">
            {movers.topUp.map((m) => (
              <li key={m.personaId} className="flex justify-between">
                <Link to={personaManageHref(m)} className="text-primary hover:underline">{m.personaName}</Link>
                <span className="text-status-success font-mono">{deltaArrow(m.rankDelta)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground mb-2">{t("mgmt.league.topDown")}</div>
          <ul className="text-sm space-y-1">
            {movers.topDown.map((m) => (
              <li key={m.personaId} className="flex justify-between">
                <Link to={personaManageHref(m)} className="text-primary hover:underline">{m.personaName}</Link>
                <span className="text-status-failed font-mono">{deltaArrow(m.rankDelta)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Ranking table */}
      <Card>
        <ManagementTableScroll minScrollWidth={1280}>
        <table className="w-full min-w-[1280px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="px-3 py-2">{t("mgmt.league.rank")}</th>
              <th className="px-3 py-2">Δ</th>
              <th className="px-3 py-2">{t("mgmt.league.persona")}</th>
              <th className="px-3 py-2">{t("mgmt.league.tier")}</th>
              <th className="px-3 py-2">{t("mgmt.league.score")}</th>
              <th className="px-3 py-2">{t("mgmt.league.pnl30d")}</th>
              <th className="px-3 py-2">{t("mgmt.league.sharpe")}</th>
              <th className="px-3 py-2">{t("mgmt.league.maxDd")}</th>
              <th className="px-3 py-2">{t("mgmt.league.interventions")}</th>
              <th className="px-3 py-2">{t("mgmt.league.recommendation")}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <RowFragment key={r.personaId} r={r} expanded={expanded === r.personaId}
                onToggle={() => setExpanded(expanded === r.personaId ? null : r.personaId)} />
            ))}
            {sorted.length === 0 && (
              <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={11}>{t("mgmt.pulse.noRows")}</td></tr>
            )}
          </tbody>
        </table>
        </ManagementTableScroll>
      </Card>

      {/* Suspended */}
      {suspended.length > 0 && (
        <Card className="p-3">
          <h2 className="text-sm font-semibold text-foreground mb-2">{t("mgmt.league.suspended")}</h2>
          <ul className="text-sm space-y-1">
            {suspended.map((s) => (
              <li key={s.personaId}>
                <Link to={personaManageHref(s)} className="text-primary hover:underline font-mono">{s.personaName}</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );

  function RowFragment({ r, expanded, onToggle }: { r: PersonaLeagueRow; expanded: boolean; onToggle: () => void }) {
    return (
      <>
        <tr className="border-b border-border/50">
          <td className="px-3 py-2 font-mono">#{r.currentRank}</td>
          <td className={`px-3 py-2 font-mono ${(r.rankDelta ?? 0) > 0 ? "text-status-success" : (r.rankDelta ?? 0) < 0 ? "text-status-failed" : "text-muted-foreground"}`}>{deltaArrow(r.rankDelta)}</td>
          <td className="px-3 py-2">
            <Link to={personaManageHref(r)} className="text-primary hover:underline font-mono">{r.personaName}</Link>
          </td>
          <td className="px-3 py-2"><Badge variant="outline" className={tierTone(r.tier)}>{r.tier}</Badge></td>
          <td className="px-3 py-2 font-mono">{fmtNum(r.score, 1)}</td>
          <td className={`px-3 py-2 font-mono ${r.pnl30d < 0 ? "text-status-failed" : "text-status-success"}`}>{fmtUsd(r.pnl30d)}</td>
          <td className="px-3 py-2 font-mono">{fmtNum(r.sharpe)}</td>
          <td className="px-3 py-2 font-mono text-status-failed">{fmtPct(r.maxDrawdown)}</td>
          <td className="px-3 py-2 font-mono">{r.humanInterventions}</td>
          <td className="px-3 py-2">
            {isGovernedRankingRecommendationAction(r.recommendedAction) ? (
              <RecommendationButton
                action={r.recommendedAction}
                state={recommendationState[recommendationIdFor(r, r.recommendedAction)]}
                onSubmit={() => void submitRecommendation(r, r.recommendedAction)}
              />
            ) : (
              <span className="text-xs text-muted-foreground">{t("mgmt.league.recommendations.no_change")}</span>
            )}
          </td>
          <td className="px-3 py-2">
            <Button size="sm" variant="ghost" onClick={onToggle} aria-expanded={expanded}>
              {expanded ? t("mgmt.league.hide") : t("mgmt.league.breakdown")}
            </Button>
          </td>
        </tr>
        {expanded && (
          <tr className="bg-muted/30">
            <td colSpan={11} className="px-4 py-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {Object.entries(r.scoreBreakdown ?? {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t(`mgmt.league.breakdownKeys.${k}`)}</span>
                    <span className="font-mono text-foreground">{fmtNum(v as number, 1)}</span>
                  </div>
                ))}
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }
};

function RecommendationButton({
  action, state, onSubmit,
}: {
  action: RankingRecommendationAction;
  state?: RecommendationUiState;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const busy = state?.kind === "submitting";
  return (
    <div className="max-w-[240px] space-y-1">
      <Button size="sm" variant="outline" onClick={onSubmit} disabled={busy}>
        {busy ? "Submitting…" : `${t(`mgmt.league.recommendations.${action}`)} →`}
      </Button>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Human review required; liveCapitalMutation=false.
      </p>
      {state?.kind === "local_only" && (
        <p role="status" className="text-[11px] leading-snug text-status-warning">
          Local only: real writes are disabled; no BFF Human Inbox review was created.
        </p>
      )}
      {state?.kind === "submitted" && (
        <p role="status" className="text-[11px] leading-snug text-primary">
          Submitted to BFF; waiting for returned Human Inbox detail.
        </p>
      )}
      {state?.kind === "error" && (
        <p role="alert" className="text-[11px] leading-snug text-status-failed">
          Submit failed: {state.message}
        </p>
      )}
    </div>
  );
}
