// 2026-07-07 PPL-ALLOC-006 — Quarterly Capital rebalance proposal workbench.
//
// Lists existing rebalance proposals with simulation/constraint status and
// links to `/management/rebalance/:id` (which redirects back into this tab
// with `?rebalance_id=`). Lets an operator run the allocation policy,
// preview the resulting lines, and create an auditable proposal — never an
// immediate capital mutation.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mgmt } from "@/lib/bff-v1";
import { rebalanceProposalDetailHref } from "@/lib/bff-v1/management";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { capitalPoolsWithFleetFallback } from "@/management/pages/capitalPoolsFleetFallback";
import {
  buildAllocationPolicyRow,
  joinRealAllocationSourceRows,
  type RealAllocationLine,
} from "@/lib/v5/management/realAllocation";
import {
  proposalApprovalState,
  proposalLinesFromAllocationLines,
  type RebalanceProposal,
} from "@/lib/v5/management/rebalanceProposals";

const fmtPct = (n: number | undefined) =>
  Number.isFinite(n) ? `${((n as number) * 100).toFixed(2)}%` : "—";

function approvalTone(state: ReturnType<typeof proposalApprovalState>): string {
  switch (state) {
    case "applied": return "border-status-success/40 text-status-success";
    case "approved": return "border-primary/40 text-primary";
    default: return "border-status-warning/40 text-status-warning";
  }
}

function ProposalCard({ proposal, highlighted }: { proposal: RebalanceProposal; highlighted: boolean }) {
  const { t } = useTranslation();
  const state = proposalApprovalState(proposal);
  return (
    <Card className={`p-3 space-y-2 ${highlighted ? "ring-1 ring-primary" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to={rebalanceProposalDetailHref(proposal.id)} className="font-mono text-sm text-primary hover:underline">
            {proposal.id}
          </Link>
          <p className="text-xs text-muted-foreground">
            {proposal.capitalPoolId ?? "—"} · {proposal.proposalType ?? "quarterly_rebalance"}
          </p>
        </div>
        <Badge variant="outline" className={approvalTone(state)}>
          {t(`mgmt.realAllocation.approvalStates.${state}`)}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <div className="text-muted-foreground">{t("mgmt.rebalanceWorkbench.lines")}</div>
          <div className="font-mono text-foreground">{proposal.lines.length}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t("mgmt.rebalanceWorkbench.simulation")}</div>
          <div className="font-mono text-foreground">
            {proposal.simulation && Object.keys(proposal.simulation).length > 0
              ? t("mgmt.rebalanceWorkbench.simulationRecorded")
              : t("mgmt.rebalanceWorkbench.simulationMissing")}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">{t("mgmt.rebalanceWorkbench.constraints")}</div>
          <div className="font-mono text-foreground">
            {proposal.constraints && Object.keys(proposal.constraints).length > 0
              ? t("mgmt.rebalanceWorkbench.constraintsRecorded")
              : t("mgmt.rebalanceWorkbench.constraintsMissing")}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">{t("mgmt.rebalanceWorkbench.approvalRef")}</div>
          <div className="font-mono text-foreground">{proposal.approvalRef ?? "—"}</div>
        </div>
      </div>

      {proposal.lines.length > 0 && (
        <ul className="space-y-1 text-xs">
          {proposal.lines.map((line) => (
            <li key={line.personaId} className="flex flex-wrap items-center justify-between gap-2 font-mono">
              <span>{line.personaId}</span>
              <span>{fmtPct(line.currentWeight)} → {fmtPct(line.targetWeight)}</span>
              <span className={line.delta >= 0 ? "text-status-success" : "text-status-failed"}>
                {line.delta >= 0 ? "+" : ""}{fmtPct(line.delta)}
              </span>
              <span className="text-muted-foreground">{line.capReasons.join(", ") || "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type CreateFlowState =
  | { kind: "idle" }
  | { kind: "previewing" }
  | { kind: "ready"; lines: RealAllocationLine[]; poolId: string }
  | { kind: "submitting" }
  | { kind: "submitted"; detailHref?: string }
  | { kind: "local_only" }
  | { kind: "error"; message: string };

export function RebalanceProposalWorkbench() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const focusedRebalanceId = searchParams.get("rebalance_id")?.trim() ?? "";

  const { data: proposals, refresh } = useV5Live(() => mgmt.rebalanceProposals.listLiveOnly(), []);
  const { data: fleetRows } = useV5Live(() => mgmt.personaFleet.get(), []);
  const { data: leagueRows } = useV5Live(() => mgmt.personaLeague.listLiveOnly(), []);
  const { data: poolEnvelope } = useV5Live(() => capitalPoolsWithFleetFallback(), []);
  const pools = poolEnvelope?.items ?? [];

  const sortedProposals = useMemo(
    () => [...(proposals ?? [])].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    [proposals],
  );
  const focused = focusedRebalanceId ? sortedProposals.find((p) => p.id === focusedRebalanceId) : undefined;
  const rest = focused ? sortedProposals.filter((p) => p.id !== focused.id) : sortedProposals;

  const [flow, setFlow] = useState<CreateFlowState>({ kind: "idle" });

  const runPreview = async () => {
    setFlow({ kind: "previewing" });
    try {
      const sourceRows = joinRealAllocationSourceRows(fleetRows ?? [], leagueRows ?? []);
      const evaluateRows = sourceRows.map(buildAllocationPolicyRow);
      const lines = await mgmt.allocationPolicy.evaluateLiveOnly(evaluateRows);
      const defaultPoolId = pools[0]?.id ?? "";
      setFlow({ kind: "ready", lines: lines ?? [], poolId: defaultPoolId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFlow({ kind: "error", message });
    }
  };

  const createProposal = async () => {
    if (flow.kind !== "ready") return;
    if (!flow.poolId) {
      setFlow({ kind: "error", message: t("mgmt.rebalanceWorkbench.poolRequired") });
      return;
    }
    setFlow({ kind: "submitting" });
    try {
      const result = await mgmt.rebalanceProposals.create({
        capitalPoolId: flow.poolId,
        lines: proposalLinesFromAllocationLines(flow.lines),
        simulation: {
          generated_at: new Date().toISOString(),
          lines_evaluated: flow.lines.length,
        },
        constraints: {
          live_increase_requires_approval: flow.lines.some((line) => line.requiresHumanApproval),
        },
        rollbackTarget: { as_of: "previous_committed_weights" },
      });
      if (!result.persisted) {
        setFlow({ kind: "local_only" });
        return;
      }
      setFlow({ kind: "submitted", detailHref: result.detailHref });
      refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFlow({ kind: "error", message });
    }
  };

  return (
    <div className="space-y-3">
      <Card className="p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("mgmt.rebalanceWorkbench.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("mgmt.rebalanceWorkbench.subtitle")}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void runPreview()} disabled={flow.kind === "previewing"}>
            {flow.kind === "previewing" ? t("mgmt.realAllocation.previewRunning") : t("mgmt.rebalanceWorkbench.startReview")}
          </Button>
        </div>

        {flow.kind === "ready" && (
          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("mgmt.realAllocation.previewNotSaved")}
            </p>
            {flow.lines.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("mgmt.pulse.noRows")}</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {flow.lines.map((line) => (
                  <li key={line.personaId} className="flex flex-wrap items-center justify-between gap-2 font-mono">
                    <span>{line.personaId}</span>
                    <span>{fmtPct(line.currentWeight)} → {fmtPct(line.targetWeight)}</span>
                    <span className={line.delta >= 0 ? "text-status-success" : "text-status-failed"}>
                      {line.delta >= 0 ? "+" : ""}{fmtPct(line.delta)}
                    </span>
                    <span className="text-muted-foreground">{line.capReasons.join(", ") || "—"}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted-foreground" htmlFor="rebalance-pool">
                {t("mgmt.rebalanceWorkbench.targetPool")}
              </label>
              <select
                id="rebalance-pool"
                className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                value={flow.poolId}
                onChange={(e) => setFlow({ ...flow, poolId: e.target.value })}
              >
                <option value="">{t("mgmt.rebalanceWorkbench.selectPool")}</option>
                {pools.map((pool) => (
                  <option key={pool.id} value={pool.id}>{pool.name ?? pool.id}</option>
                ))}
              </select>
              <Button size="sm" onClick={() => void createProposal()} disabled={flow.lines.length === 0}>
                {t("mgmt.rebalanceWorkbench.createProposal")}
              </Button>
            </div>
          </div>
        )}
        {flow.kind === "submitting" && (
          <p className="text-xs text-muted-foreground">{t("mgmt.governance.submitting")}</p>
        )}
        {flow.kind === "local_only" && (
          <p role="status" className="text-xs text-status-warning">{t("mgmt.governance.localOnly")}</p>
        )}
        {flow.kind === "submitted" && (
          <p role="status" className="text-xs text-primary">
            {t("mgmt.governance.submitted")}
            {flow.detailHref && (
              <Link to={flow.detailHref} className="ml-2 underline">{t("mgmt.realAllocation.viewProposal")}</Link>
            )}
          </p>
        )}
        {flow.kind === "error" && (
          <p role="alert" className="text-xs text-status-failed">{t("mgmt.governance.submitFailed", { message: flow.message })}</p>
        )}
      </Card>

      {focused && <ProposalCard proposal={focused} highlighted />}
      {rest.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} highlighted={false} />)}
      {sortedProposals.length === 0 && (
        <Card className="p-3 text-xs text-muted-foreground">{t("mgmt.pulse.noRows")}</Card>
      )}
    </div>
  );
}
