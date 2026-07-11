// 2026-07-07 PPL-ALLOC-006 — Emergency Actions tab.
//
// Surfaces containment-only recommendations (freeze / suspend / reduce
// capital access / retire) drawn from Real Ranking and Paper Candidates.
// Reuses the existing governed recommendation submit seam — this tab never
// exposes promote/increase actions, matching the gap spec's forbidden list.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import type { LeagueRecommendedAction, PersonaLeagueRow } from "@/lib/v5/management/personaLeague";
import type { QuarterlyRankingRow } from "@/lib/v5/management/quarterlyRanking";
import {
  currentPm12QuarterId,
  makeRankingRecommendationId,
  sendRankingRecommendation,
  type RankingRecommendationAction,
  type RankingRecommendationSubmitResult,
} from "@/lib/v5/management/rankingGovernance";

type ContainmentAction = Extract<
  RankingRecommendationAction,
  "freeze_persona" | "suspend_persona" | "reduce_capital_access" | "retire_persona"
>;

const CONTAINMENT_ACTIONS: readonly ContainmentAction[] = [
  "freeze_persona", "suspend_persona", "reduce_capital_access", "retire_persona",
];

function isContainmentAction(action: LeagueRecommendedAction | undefined): action is ContainmentAction {
  return Boolean(action && (CONTAINMENT_ACTIONS as readonly string[]).includes(action));
}

interface EmergencyRow {
  personaId: string;
  personaName: string;
  action: ContainmentAction;
  source: "persona_league" | "quarterly_ranking";
  quarter: string;
  evidenceRefs: string[];
  manageHref: string;
}

type SubmitState =
  | { kind: "submitting" }
  | { kind: "local_only"; result: RankingRecommendationSubmitResult }
  | { kind: "submitted"; result: RankingRecommendationSubmitResult }
  | { kind: "error"; message: string };

function buildEmergencyRows(
  leagueRows: readonly PersonaLeagueRow[],
  quarterlyRows: readonly QuarterlyRankingRow[],
  currentQuarter: string,
): EmergencyRow[] {
  const rows: EmergencyRow[] = [];
  const seen = new Set<string>();
  for (const row of leagueRows) {
    if (!isContainmentAction(row.recommendedAction)) continue;
    const key = `${row.personaId}:${row.recommendedAction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      personaId: row.personaId,
      personaName: row.personaName,
      action: row.recommendedAction,
      source: "persona_league",
      quarter: currentQuarter,
      evidenceRefs: [],
      manageHref: row.links?.manageHref ?? `/management/personas/${encodeURIComponent(row.personaId)}`,
    });
  }
  for (const row of quarterlyRows) {
    if (!isContainmentAction(row.recommendation)) continue;
    const key = `${row.personaId}:${row.recommendation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      personaId: row.personaId,
      personaName: row.personaName,
      action: row.recommendation,
      source: "quarterly_ranking",
      quarter: row.quarter || currentQuarter,
      evidenceRefs: row.evidenceRefs ?? [],
      manageHref: row.links?.manageHref ?? `/management/personas/${encodeURIComponent(row.personaId)}`,
    });
  }
  return rows;
}

export function EmergencyActionsPanel() {
  const { t } = useTranslation();
  const currentQuarter = useMemo(() => currentPm12QuarterId(), []);
  const { data: leagueRows } = useV5Live(() => mgmt.personaLeague.listLiveOnly(), []);
  const { data: quarterlyRows } = useV5Live(() => mgmt.quarterlyRanking.listLiveOnly(currentQuarter), [currentQuarter]);
  const [state, setState] = useState<Record<string, SubmitState>>({});

  const rows = useMemo(
    () => buildEmergencyRows(leagueRows ?? [], quarterlyRows ?? [], currentQuarter),
    [leagueRows, quarterlyRows, currentQuarter],
  );

  const submit = async (row: EmergencyRow) => {
    const recommendationId = makeRankingRecommendationId({
      personaId: row.personaId,
      personaName: row.personaName,
      recommendation: row.action,
      source: row.source,
      quarter: row.quarter,
      evidenceRefs: row.evidenceRefs,
    });
    setState((prev) => ({ ...prev, [recommendationId]: { kind: "submitting" } }));
    try {
      const result = await sendRankingRecommendation({
        personaId: row.personaId,
        personaName: row.personaName,
        recommendation: row.action,
        recommendationId,
        source: row.source,
        quarter: row.quarter,
        evidenceRefs: row.evidenceRefs,
      });
      setState((prev) => ({
        ...prev,
        [recommendationId]: { kind: result.persisted ? "submitted" : "local_only", result },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, [recommendationId]: { kind: "error", message } }));
    }
  };

  return (
    <section className="space-y-4" aria-label={t("mgmt.emergency.title")}>
      <header>
        <h2 className="text-lg font-semibold text-foreground">{t("mgmt.emergency.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("mgmt.emergency.subtitle")}</p>
      </header>

      {rows.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">{t("mgmt.emergency.noBreaches")}</Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => {
          const recommendationId = makeRankingRecommendationId({
            personaId: row.personaId,
            personaName: row.personaName,
            recommendation: row.action,
            source: row.source,
            quarter: row.quarter,
            evidenceRefs: row.evidenceRefs,
          });
          const rowState = state[recommendationId];
          const busy = rowState?.kind === "submitting";
          return (
            <Card key={recommendationId} className="p-3 space-y-2 border-status-failed/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link to={row.manageHref} className="font-mono text-sm text-primary hover:underline">
                  {row.personaName}
                </Link>
                <Badge variant="outline" className="border-status-failed/40 text-status-failed">
                  {t(`mgmt.league.recommendations.${row.action}`)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("mgmt.emergency.forbiddenNote")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void submit(row)} disabled={busy}>
                  {busy ? t("mgmt.governance.submitting") : t("mgmt.emergency.submitContainment")}
                </Button>
                <Link to={`/management/human-inbox?persona=${encodeURIComponent(row.personaId)}`} className="text-xs text-muted-foreground hover:text-primary self-center">
                  {t("mgmt.emergency.viewHumanInbox")}
                </Link>
              </div>
              {rowState?.kind === "local_only" && (
                <p role="status" className="text-[11px] leading-snug text-status-warning">{t("mgmt.governance.localOnly")}</p>
              )}
              {rowState?.kind === "submitted" && (
                <p role="status" className="text-[11px] leading-snug text-primary">
                  {t("mgmt.governance.submitted")}
                  {rowState.result.detailHref && (
                    <Link to={rowState.result.detailHref} className="ml-1 underline">{t("mgmt.emergency.viewHumanInbox")}</Link>
                  )}
                </p>
              )}
              {rowState?.kind === "error" && (
                <p role="alert" className="text-[11px] leading-snug text-status-failed">{t("mgmt.governance.submitFailed", { message: rowState.message })}</p>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export { buildEmergencyRows, isContainmentAction };
