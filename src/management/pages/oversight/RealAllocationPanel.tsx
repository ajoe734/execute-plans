// 2026-07-07 PPL-ALLOC-006 — Real Ranking allocation panel.
//
// Adds the stage-aware target-weight view the gap spec requires on top of
// Persona League: canary/live stage, current/target weight, proposed delta,
// cap reason, and approval state. Weight/delta/cap-reason come from the most
// recent rebalance proposal that mentions the persona; a "Run allocation
// preview" action can compute a fresh (non-persisted) preview via the BFF
// policy engine when no proposal line exists yet.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { mgmt } from "@/lib/bff-v1";
import { rebalanceProposalDetailHref, type ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import type { PersonaLeagueRow } from "@/lib/v5/management/personaLeague";
import {
  buildAllocationPolicyRow,
  joinRealAllocationSourceRows,
  type RealAllocationLine,
} from "@/lib/v5/management/realAllocation";
import {
  latestProposalLineFor,
  proposalApprovalState,
  type RebalanceProposal,
  type RebalanceProposalApprovalState,
} from "@/lib/v5/management/rebalanceProposals";

const fmtPct = (n: number | undefined) =>
  Number.isFinite(n) ? `${((n as number) * 100).toFixed(2)}%` : "—";

const deltaTone = (delta: number | undefined) =>
  !Number.isFinite(delta) ? "text-muted-foreground" : (delta as number) > 0 ? "text-status-success" : (delta as number) < 0 ? "text-status-failed" : "text-muted-foreground";

const approvalTone = (state: RealAllocationApprovalState) => {
  switch (state) {
    case "applied": return "border-status-success/40 text-status-success";
    case "approved": return "border-primary/40 text-primary";
    case "pending_approval": return "border-status-warning/40 text-status-warning";
    default: return "border-muted text-muted-foreground";
  }
};

type RealAllocationApprovalState = RebalanceProposalApprovalState;

interface RealRankingRow {
  personaId: string;
  personaName: string;
  stage: string;
  currentWeight: number;
  targetWeight?: number;
  delta?: number;
  capReasons: string[];
  approvalState: RealAllocationApprovalState;
  proposalId?: string;
  manageHref: string;
}

function personaManageHref(fleet: ManagementPersonaFleetRow): string {
  return `/management/personas/${encodeURIComponent(fleet.personaId)}`;
}

function buildRealRankingRows(
  fleetRows: readonly ManagementPersonaFleetRow[],
  leagueRows: readonly PersonaLeagueRow[],
  proposals: readonly RebalanceProposal[],
): RealRankingRow[] {
  const sourceRows = joinRealAllocationSourceRows(fleetRows, leagueRows);
  return sourceRows.map(({ fleet, league }) => {
    const found = latestProposalLineFor(proposals, fleet.personaId);
    const currentWeight = found?.line.currentWeight ?? fleet.currentWeight ?? 0;
    return {
      personaId: fleet.personaId,
      personaName: league?.personaName ?? fleet.personaName ?? fleet.personaId,
      stage: String(fleet.stage ?? fleet.deploymentStage ?? "").trim().toLowerCase(),
      currentWeight,
      targetWeight: found?.line.targetWeight,
      delta: found?.line.delta,
      capReasons: found?.line.capReasons ?? [],
      approvalState: found ? proposalApprovalState(found.proposal) : "not_proposed",
      proposalId: found?.proposal.id,
      manageHref: league?.links?.manageHref ?? personaManageHref(fleet),
    };
  });
}

export function RealAllocationPanel() {
  const { t } = useTranslation();
  const { data: fleetRows } = useV5Live(() => mgmt.personaFleet.get(), []);
  const { data: leagueRows } = useV5Live(() => mgmt.personaLeague.listLiveOnly(), []);
  const { data: proposals } = useV5Live(() => mgmt.rebalanceProposals.listLiveOnly(), []);

  const rows = useMemo(
    () => buildRealRankingRows(fleetRows ?? [], leagueRows ?? [], proposals ?? []),
    [fleetRows, leagueRows, proposals],
  );

  const [preview, setPreview] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "ready"; lines: RealAllocationLine[] }
    | { kind: "empty" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const runPreview = async () => {
    setPreview({ kind: "running" });
    try {
      const sourceRows = joinRealAllocationSourceRows(fleetRows ?? [], leagueRows ?? []);
      const evaluateRows = sourceRows.map(buildAllocationPolicyRow);
      const lines = await mgmt.allocationPolicy.evaluateLiveOnly(evaluateRows);
      if (!lines) {
        setPreview({ kind: "empty" });
        return;
      }
      setPreview({ kind: "ready", lines });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPreview({ kind: "error", message });
    }
  };

  return (
    <Card className="p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("mgmt.realAllocation.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("mgmt.realAllocation.subtitle")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void runPreview()} disabled={preview.kind === "running"}>
          {preview.kind === "running" ? t("mgmt.realAllocation.previewRunning") : t("mgmt.realAllocation.runPreview")}
        </Button>
      </div>

      <ManagementTableScroll minScrollWidth={960}>
        <table className="w-full min-w-[960px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="px-3 py-2">{t("mgmt.league.persona")}</th>
              <th className="px-3 py-2">{t("mgmt.realAllocation.stage")}</th>
              <th className="px-3 py-2">{t("mgmt.realAllocation.currentWeight")}</th>
              <th className="px-3 py-2">{t("mgmt.realAllocation.targetWeight")}</th>
              <th className="px-3 py-2">Δ</th>
              <th className="px-3 py-2">{t("mgmt.realAllocation.capReason")}</th>
              <th className="px-3 py-2">{t("mgmt.realAllocation.approvalState")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.personaId} className="border-b border-border/50">
                <td className="px-3 py-2">
                  <Link to={row.manageHref} className="text-primary hover:underline font-mono">{row.personaName}</Link>
                </td>
                <td className="px-3 py-2"><Badge variant="outline">{row.stage || "—"}</Badge></td>
                <td className="px-3 py-2 font-mono">{fmtPct(row.currentWeight)}</td>
                <td className="px-3 py-2 font-mono">{fmtPct(row.targetWeight)}</td>
                <td className={`px-3 py-2 font-mono ${deltaTone(row.delta)}`}>
                  {Number.isFinite(row.delta) ? `${(row.delta as number) >= 0 ? "+" : ""}${fmtPct(row.delta)}` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {row.capReasons.length > 0 ? row.capReasons.join(", ") : "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={approvalTone(row.approvalState)}>
                    {t(`mgmt.realAllocation.approvalStates.${row.approvalState}`)}
                  </Badge>
                  {row.proposalId && (
                    <Link
                      to={rebalanceProposalDetailHref(row.proposalId)}
                      className="ml-2 text-xs text-muted-foreground hover:text-primary"
                    >
                      {t("mgmt.realAllocation.viewProposal")}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={7}>{t("mgmt.pulse.noRows")}</td></tr>
            )}
          </tbody>
        </table>
      </ManagementTableScroll>

      {preview.kind === "ready" && (
        <div className="rounded-md border border-dashed border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {t("mgmt.realAllocation.previewNotSaved")}
          </p>
          {preview.lines.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("mgmt.pulse.noRows")}</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {preview.lines.map((line) => (
                <li key={line.personaId} className="flex flex-wrap items-center justify-between gap-2 font-mono">
                  <span>{line.personaId}</span>
                  <span>{fmtPct(line.currentWeight)} → {fmtPct(line.targetWeight)}</span>
                  <span className={deltaTone(line.delta)}>{line.delta >= 0 ? "+" : ""}{fmtPct(line.delta)}</span>
                  <span className="text-muted-foreground">{line.capReasons.join(", ") || "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {preview.kind === "empty" && (
        <p role="status" className="text-xs text-status-warning">{t("mgmt.realAllocation.previewUnavailable")}</p>
      )}
      {preview.kind === "error" && (
        <p role="alert" className="text-xs text-status-failed">{t("mgmt.realAllocation.previewFailedFmt", { message: preview.message })}</p>
      )}
    </Card>
  );
}

export { buildRealRankingRows };
export type { RealRankingRow };
