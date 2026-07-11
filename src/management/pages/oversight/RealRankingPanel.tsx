// 2026-07-11 PPL-ALLOC-006 — Real ranking target-weight panel.
//
// Joins persona-league scores with persona-fleet capital bindings (both are
// read-only, independently-loaded surfaces — see the PPL-ALLOC-006 BFF
// handoff packets in support/sidecars/PPL-ALLOC-006/) and calls the
// PPL-ALLOC-004 allocation-policy contract to render current/target weight
// and cap reasons. This panel never marks a row "applied": target weights
// here are a fresh evaluation, not a persisted rebalance decision, so a
// capital increase can only ever show as "requires approval" until an
// actual rebalance proposal (Quarterly capital tab) is approved and applied.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import type { PersonaLeagueRow } from "@/lib/v5/management/personaLeague";
import type { AllocationPolicyInputRow, AllocationPolicyLine, ManagementPersonaFleetRow } from "@/lib/bff-v1/management";

const REAL_ALLOCATION_STAGES = new Set(["canary_running", "live_running", "canary", "live"]);

function isRealAllocationEligibleStage(row: ManagementPersonaFleetRow): boolean {
  const stage = (row.deploymentStage ?? "").trim().toLowerCase();
  if (REAL_ALLOCATION_STAGES.has(stage)) return true;
  const mode = (row.capitalMode ?? "").trim().toLowerCase();
  return mode === "canary" || mode === "live";
}

function normalizedStage(row: ManagementPersonaFleetRow): string {
  const stage = (row.deploymentStage ?? "").trim().toLowerCase();
  if (stage === "canary_running" || stage === "canary") return "canary_running";
  if (stage === "live_running" || stage === "live") return "live_running";
  return stage || "unknown";
}

function tierFromScore(score: number): string {
  if (score >= 85) return "s";
  if (score >= 70) return "a";
  return "b";
}

function buildInputRow(fleetRow: ManagementPersonaFleetRow, leagueRow: PersonaLeagueRow | undefined): AllocationPolicyInputRow {
  const breakdown = leagueRow?.scoreBreakdown;
  return {
    personaId: fleetRow.personaId,
    stage: normalizedStage(fleetRow),
    tier: leagueRow ? tierFromScore(leagueRow.score) : undefined,
    capitalScope: fleetRow.capitalScope,
    capitalPoolId: fleetRow.capitalPoolId ?? fleetRow.capitalScopeId,
    capitalSleeveId: fleetRow.capitalSleeveId,
    currentWeight: fleetRow.currentWeight ?? 0,
    pnlScore: breakdown?.pnlScore,
    sharpeScore: breakdown?.sharpeScore,
    drawdownControlScore: breakdown?.drawdownControlScore,
    executionQualityScore: breakdown?.executionQualityScore,
    riskComplianceScore: breakdown?.riskComplianceScore,
    improvementScore: breakdown?.improvementScore,
    humanInterventionPenalty: breakdown?.interventionPenalty,
    hardPenalty: breakdown?.hardPenalty,
    humanReviewBlocked: fleetRow.reviewStatus === "blocked" || fleetRow.reviewStatus === "rejected" || fleetRow.reviewStatus === "expired",
    bindingMismatch: Boolean(fleetRow.capitalScope) && fleetRow.bindingState === "missing",
  };
}

const fmtPct = (n: number | undefined) => (Number.isFinite(n) ? `${((n as number) * 100).toFixed(2)}%` : "unavailable");

function approvalBadge(line: AllocationPolicyLine, t: (key: string) => string) {
  if (line.exclusions.length > 0) {
    return <Badge variant="outline" className="border-status-warning/40 text-status-warning">{t("promotionAllocation.realRanking.excluded")}</Badge>;
  }
  if (line.delta > 0) {
    return <Badge variant="outline" className="border-status-failed/40 text-status-failed">{t("promotionAllocation.realRanking.requiresApproval")}</Badge>;
  }
  if (line.delta < 0) {
    return <Badge variant="outline" className="border-status-warning/40 text-status-warning">{t("promotionAllocation.realRanking.reductionAvailable")}</Badge>;
  }
  return <Badge variant="outline" className="border-muted text-muted-foreground">{t("promotionAllocation.realRanking.noChange")}</Badge>;
}

export const RealRankingPanel = () => {
  const { t } = useTranslation();
  const { data: fleetRows, loading: fleetLoading } = useV5Live(() => mgmt.personaFleet.get(), []);
  const { data: leagueRows, loading: leagueLoading } = useV5Live(() => mgmt.personaLeague.rankingsLiveOnly(), []);

  const eligibleFleetRows = useMemo(
    () => (fleetRows ?? []).filter(isRealAllocationEligibleStage),
    [fleetRows],
  );
  const leagueByPersonaId = useMemo(() => {
    const map = new Map<string, PersonaLeagueRow>();
    (leagueRows ?? []).forEach((row) => map.set(row.personaId, row));
    return map;
  }, [leagueRows]);

  const inputRows = useMemo(
    () => eligibleFleetRows.map((row) => buildInputRow(row, leagueByPersonaId.get(row.personaId))),
    [eligibleFleetRows, leagueByPersonaId],
  );

  // Key on a full serialization of inputRows, not just personaId/currentWeight/stage:
  // tier and the score-breakdown fields resolve asynchronously from persona-league and
  // must trigger re-evaluation once they arrive after persona-fleet.
  const { data: lines, loading: evaluating } = useV5Live(
    () => (inputRows.length > 0 ? mgmt.allocationPolicy.evaluate(inputRows) : Promise.resolve([])),
    [JSON.stringify(inputRows)],
  );

  const loading = fleetLoading || leagueLoading || evaluating;
  const linesByPersonaId = useMemo(() => {
    const map = new Map<string, AllocationPolicyLine>();
    (lines ?? []).forEach((line) => map.set(line.personaId, line));
    return map;
  }, [lines]);

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">{t("promotionAllocation.realRanking.title")}</h2>
        <span className="text-xs text-muted-foreground">{t("promotionAllocation.realRanking.subtitle")}</span>
      </div>
      <ManagementTableScroll minScrollWidth={960}>
        <table className="w-full min-w-[960px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="px-3 py-2">{t("mgmt.league.persona")}</th>
              <th className="px-3 py-2">{t("promotionAllocation.realRanking.stage")}</th>
              <th className="px-3 py-2">{t("promotionAllocation.realRanking.capitalScope")}</th>
              <th className="px-3 py-2">{t("promotionAllocation.realRanking.currentWeight")}</th>
              <th className="px-3 py-2">{t("promotionAllocation.realRanking.targetWeight")}</th>
              <th className="px-3 py-2">{t("promotionAllocation.realRanking.delta")}</th>
              <th className="px-3 py-2">{t("promotionAllocation.realRanking.capReasons")}</th>
              <th className="px-3 py-2">{t("promotionAllocation.realRanking.approvalState")}</th>
            </tr>
          </thead>
          <tbody>
            {eligibleFleetRows.map((fleetRow) => {
              const line = linesByPersonaId.get(fleetRow.personaId);
              return (
                <tr key={fleetRow.personaId} className="border-b border-border/50">
                  <td className="px-3 py-2">
                    <Link
                      to={`/management/persona-fleet?persona=${encodeURIComponent(fleetRow.personaId)}`}
                      className="text-primary hover:underline font-mono"
                    >
                      {fleetRow.personaName ?? fleetRow.personaId}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{normalizedStage(fleetRow)}</td>
                  <td className="px-3 py-2 text-xs">
                    {fleetRow.capitalScope ?? "unknown"}
                    {fleetRow.capitalSleeveId ? <span className="ml-1 font-mono text-muted-foreground">{fleetRow.capitalSleeveId}</span> : null}
                  </td>
                  <td className="px-3 py-2 font-mono">{fmtPct(fleetRow.currentWeight)}</td>
                  <td className="px-3 py-2 font-mono">
                    {line ? fmtPct(line.targetWeight) : loading ? "…" : "unavailable"}
                  </td>
                  <td className={`px-3 py-2 font-mono ${(line?.delta ?? 0) > 0 ? "text-status-success" : (line?.delta ?? 0) < 0 ? "text-status-failed" : ""}`}>
                    {line ? `${line.delta >= 0 ? "+" : ""}${fmtPct(line.delta)}` : "—"}
                  </td>
                  <td className="px-3 py-2 max-w-[280px]">
                    <div className="flex flex-wrap gap-1">
                      {(line?.capReasons ?? []).length === 0 && (line?.exclusions ?? []).length === 0
                        ? <span className="text-xs text-muted-foreground">—</span>
                        : [...(line?.exclusions ?? []), ...(line?.capReasons ?? [])].map((reason) => (
                          <Badge key={reason} variant="outline" className="text-[10px]">{reason}</Badge>
                        ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {line ? approvalBadge(line, t) : <span className="text-xs text-muted-foreground">{loading ? "…" : "unavailable"}</span>}
                  </td>
                </tr>
              );
            })}
            {eligibleFleetRows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={8}>
                  {loading ? t("promotionAllocation.realRanking.loading") : t("promotionAllocation.realRanking.noEligibleRows")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ManagementTableScroll>
    </Card>
  );
};
