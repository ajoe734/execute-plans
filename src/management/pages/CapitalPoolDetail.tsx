import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { safePercent, safeRatio } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { bff, runActionSafe, mgmt } from "@/lib/bff-v1";
import { capitalPoolWithFleetFallback, getPersonaIdsForPoolId } from "./capitalPoolsFleetFallback";
import { useT } from "@/platform/hooks";
import type { ApprovalRequest, AuditEvent, CapitalPool, Rebalance, Strategy } from "@/lib/bff/types";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import { Edit, Inbox, ShieldAlert } from "lucide-react";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { StatCard } from "@/platform/components/StatCard";
import { Progress } from "@/components/ui/progress";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { LineageGraph, type LineageNode, type LineageEdge } from "@/platform/components/LineageGraph";
import { MandatePanel } from "../components/detail/MandatePanel";
import { RiskBudgetPanel } from "../components/detail/RiskBudgetPanel";
import { BindingsMatrix } from "../components/detail/BindingsMatrix";
import { AllocationLimitsManager } from "../components/detail/AllocationLimitsManager";
import { FreezeUnfreezePanel } from "../components/detail/FreezeUnfreezePanel";
import { AllocationSimulationPanel } from "../components/detail/AllocationSimulationPanel";
import { assessBreach } from "@/lib/v4/capitalBreach";
import { lifecycleOf } from "@/lib/v4/strategyTripleDerive";
import { findMetric } from "@/lib/v4/metricRegistry";
import { Badge } from "@/components/ui/badge";

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export const CapitalPoolDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [c, setC] = useState<CapitalPool | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [strats, setStrats] = useState<Strategy[]>([]);
  const [rebalances, setRebalances] = useState<Rebalance[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) {
        setLoading(false);
        setError("missing-id");
        return;
      }

      setLoading(true);
      setError(undefined);
      setC(undefined);
      setStrats([]);
      setRebalances([]);
      setApprovals([]);
      setAudit([]);

      try {
        let pool: CapitalPool | undefined;
        let detailError: string | undefined;
        try {
          pool = await bff.capitalPools.get(id);
        } catch (err) {
          detailError = err instanceof Error ? err.message : String(err);
        }
        pool ??= await capitalPoolWithFleetFallback(id);
        if (cancelled) return;
        if (!pool) {
          setError(detailError ?? "not-found");
          return;
        }

        setC(pool);
        const poolIds = new Set(
          [id, pool.id, pool.poolId, pool.pool_id].filter((value): value is string => Boolean(value)),
        );
        const mentionsPool = (value?: string) => Boolean(value && Array.from(poolIds).some((poolId) => value.includes(poolId)));

        const [allStrategies, allRebalances, allApprovals, allAudit, fleetRows] = await Promise.all([
          bff.strategies.list().catch((): Strategy[] => []),
          bff.rebalances.list().catch((): Rebalance[] => []),
          bff.approvals.list().catch((): ApprovalRequest[] => []),
          bff.audit.list().catch((): AuditEvent[] => []),
          mgmt.personaFleet.get().catch(() => [] as unknown[]),
        ]);
        if (cancelled) return;

        const boundPersonaIds = getPersonaIdsForPoolId(id || "", fleetRows as unknown as ManagementPersonaFleetRow[]);
        const rawPool = pool as Record<string, unknown>;
        const boundStrats = allStrategies.filter((s) => {
          if (poolIds.has(s.capitalPoolId)) return true;
          const isPaper =
            rawPool.capitalMode === "paper" ||
            rawPool.capital_mode === "paper" ||
            rawPool.capitalScope === "paper" ||
            rawPool.capital_scope === "paper" ||
            (id || "").startsWith("paper-ledger-") ||
            (id || "").startsWith("pool-crypto-paper");
          if (isPaper) {
            return s.personaIds.some((pId) => boundPersonaIds.has(pId));
          }
          return false;
        });

        setStrats(boundStrats);
        setRebalances(allRebalances.filter((r) => poolIds.has(r.targetPoolId)));
        setApprovals(allApprovals.filter((a) => mentionsPool(a.subject) || (a.kind ?? "").includes("capital")));
        setAudit(allAudit.filter((x) => poolIds.has(x.target) || x.action?.startsWith("capital.") || x.action?.startsWith("rebalance.")));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  if (!c) {
    const description = error && !["missing-id", "not-found"].includes(error)
      ? t("phase13.capital.detail.notFoundWithError", { id, error })
      : t("phase13.capital.detail.notFoundDescription", { id: id ?? "" });
    return (
      <>
        <PageHeader title={t("nav.capitalPools")} />
        <PageBody>
          <EmptyState
            icon={<Inbox className="h-8 w-8" />}
            title={t("phase13.capital.detail.notFoundTitle")}
            description={description}
            cta={{ label: t("phase13.capital.detail.backToList"), onClick: () => navigate("/management/governance-decisions?tab=capital") }}
          />
        </PageBody>
      </>
    );
  }
  const allocated = num(c.allocated);
  const utilized = num(c.utilized);
  const riskBudget = num(c.riskBudget);
  const utilizationPct = safeRatio(utilized, allocated) * 100;
  const bindingCount = typeof c.bindingCount === "number" ? c.bindingCount : Array.isArray(c.bindings) ? c.bindings.length : 0;
  const riskPolicyRef = c.riskPolicyRef ?? c.risk_policy_ref;
  const firstRebalance = rebalances[0];

  // Lineage: pool ↔ rebalance ↔ strategy
  const lineageNodes: LineageNode[] = [
    { id: c.id, label: c.name, type: "CapitalPool", state: c.state, risk: c.risk, highlight: true },
    ...rebalances.map((r) => ({ id: r.id, label: r.name, type: "Rebalance", state: r.state, risk: r.risk })),
    ...strats.map((s) => ({ id: s.id, label: s.name, type: "Strategy", state: lifecycleOf(s), risk: s.risk })),
  ];
  const lineageEdges: LineageEdge[] = [
    ...rebalances.map((r) => ({ from: c.id, to: r.id, label: "rebalance" })),
    ...strats.map((s) => ({ from: c.id, to: s.id, label: "binds" })),
  ];

  return (
    <>
      <ObjectDetailLayout
        object={c}
        subtitle={`${c.currency} · ${c.id}`}
        actions={
          <>
            <Button size="sm" variant="outline"><Edit className="h-4 w-4 mr-1" />{t("actions.edit")}</Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)}>
              <ShieldAlert className="h-4 w-4 mr-1" />Adjust Risk Budget
            </Button>
          </>
        }
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (() => {
              const breach = assessBreach({
                utilized,
                allocated,
                currentDrawdownPct: strats.length ? Math.min(...strats.map((s) => s.drawdown)) : undefined,
                riskBudgetPct: riskBudget,
              });
              const utilMetric = findMetric("capital_utilization_pct");
              const rbuMetric = findMetric("risk_budget_usage_pct");
              const breachToneCls: Record<string, string> = {
                ok: "bg-status-success/15 text-status-success border-status-success/30",
                warn: "bg-status-warning/15 text-status-warning border-status-warning/30",
                high: "bg-status-warning/15 text-status-warning border-status-warning/30",
                critical: "bg-status-failed/15 text-status-failed border-status-failed/30",
              };
              return (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <StatCard label={t("section.holdings")} value={`${c.currency} ${allocated.toLocaleString()}`} />
                    <StatCard
                      label={utilMetric ? `Capital utilization (%)` : t("table.utilization")}
                      value={`${(breach.utilizationPct * 100).toFixed(utilMetric?.precision ?? 2)}%`}
                      hint={`${c.currency} ${utilized.toLocaleString()}`}
                    />
                    <StatCard label={t("section.limits")} value={safePercent(riskBudget, 2)} tone="warning" />
                  </div>
                  <Section title={t("section.details")}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Field label={t("nav.capitalPools")} value={c.id} mono />
                      <Field label={t("phase13.capital.detail.riskPolicy")} value={riskPolicyRef ?? "—"} mono />
                      <Field label={t("phase13.capital.detail.bindings")} value={bindingCount.toLocaleString()} mono />
                      <Field label={t("common.owner")} value={c.owner} mono />
                    </div>
                  </Section>
                  <Section title={t("detail.section.breachAssessment")}>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant="outline" className={breachToneCls[breach.level]}>{(breach.level ?? "").toUpperCase()}</Badge>
                      {breach.riskBudgetUsagePct != null && rbuMetric && (
                        <span className="text-xs text-muted-foreground text-mono">
                          {rbuMetric.id}={(breach.riskBudgetUsagePct * 100).toFixed(rbuMetric.precision)}%
                        </span>
                      )}
                      {breach.reasons.length > 0 && (
                        <span className="text-xs text-muted-foreground">· {breach.reasons.join(", ")}</span>
                      )}
                    </div>
                    <Progress value={breach.utilizationPct * 100} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground text-mono">
                      <span>0</span>
                      <span>{allocated.toLocaleString()}</span>
                    </div>
                  </Section>
                </>
              );
            })(),
          },
          {
            value: "strategies", label: t("nav.strategies"),
            content: (
              <DataTable
                rows={strats}
                onRowClick={(r) => navigate(`/management/strategies/${r.id}`)}
                columns={[
                  { key: "name", header: t("nav.strategies"), cell: (r) => <div className="font-medium">{r.name}</div> },
                  { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
                  { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
                  { key: "pnl", header: "PnL 30d", cell: (r) => <span className={`text-mono text-xs ${r.pnl30d >= 0 ? "text-status-success" : "text-status-failed"}`}>{(r.pnl30d * 100).toFixed(2)}%</span> },
                ]}
                empty={t("empty.noResults")}
              />
            ),
          },
          { value: "mandate", label: t("phase13.capital.tabs.mandate"), content: <MandatePanel pool={c} /> },
          { value: "riskBudget", label: t("phase13.capital.tabs.riskBudget"), content: <RiskBudgetPanel pool={c} /> },
          { value: "bindings", label: t("phase13.capital.tabs.bindings"), content: <BindingsMatrix strategies={strats} poolId={c.id} /> },
          { value: "limits", label: t("phase13.capital.tabs.limits"), content: <AllocationLimitsManager poolId={c.id} /> },
          { value: "freeze", label: t("phase13.capital.tabs.freeze"), content: <FreezeUnfreezePanel poolId={c.id} /> },

          // ── v3 §13 — Performance ──
          {
            value: "performance", label: t("section.performance", { defaultValue: "Performance" }),
            content: (
              <Section title={t("section.performance", { defaultValue: "Performance" })}>
                <div className="grid grid-cols-3 gap-4">
                  <StatCard label="PnL 30d" value={`${(strats.reduce((a, s) => a + s.pnl30d, 0) * 100).toFixed(2)}%`} tone="success" />
                  <StatCard label={t("table.sharpe")} value={(strats.reduce((a, s) => a + s.sharpe, 0) / Math.max(1, strats.length)).toFixed(2)} />
                  <StatCard label={t("table.drawdown")} value={`${(Math.min(...strats.map((s) => s.drawdown), 0) * 100).toFixed(2)}%`} tone="warning" />
                </div>
              </Section>
            ),
          },

          // ── v3 §13 — Ranking Inputs ──
          {
            value: "rankingInputs", label: t("capital.rankingInputs", { defaultValue: "Ranking Inputs" }),
            content: (
              <DataTable
                rows={strats.map((s) => ({ id: s.id, name: s.name, sharpe: s.sharpe, dd: s.drawdown, pnl: s.pnl30d }))}
                columns={[
                  { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
                  { key: "sharpe", header: t("table.sharpe"), cell: (r) => <span className="text-mono text-xs">{(r.sharpe ?? 0).toFixed(2)}</span> },
                  { key: "dd", header: t("table.drawdown"), cell: (r) => <span className="text-mono text-xs">{(r.dd * 100).toFixed(2)}%</span> },
                  { key: "pnl", header: "PnL 30d", cell: (r) => <span className="text-mono text-xs">{(r.pnl * 100).toFixed(2)}%</span> },
                ]}
                empty={t("empty.noResults")}
              />
            ),
          },
          {
            value: "simulation", label: t("phase13.capital.tabs.simulation"),
            content: firstRebalance ? <AllocationSimulationPanel rebalance={firstRebalance} /> : <Section><div className="text-sm text-muted-foreground">{t("empty.none")}</div></Section>,
          },
          {
            value: "lineage", label: t("phase13.capital.tabs.lineage"),
            content: (
              <Section title={t("phase13.capital.tabs.lineage")}>
                <p className="text-xs text-muted-foreground mb-2">{t("phase13.capital.lineage.hint")}</p>
                <LineageGraph nodes={lineageNodes} edges={lineageEdges} onSelect={(n) => navigate(`/management/${n.type === "Rebalance" ? "rebalance" : n.type === "Strategy" ? "strategies" : "capital"}/${encodeURIComponent(n.id)}`)} />
              </Section>
            ),
          },
          {
            value: "risk", label: "Risk",
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="VaR" value="—" mono />
                  <Field label={t("section.limits")} value={safePercent(riskBudget, 2)} mono />
                  <Field label={t("table.capacity")} value={`${Math.max(0, 100 - utilizationPct).toFixed(1)}%`} mono />
                  <Field label={t("table.value")} value={c.currency} mono />
                </div>
              </Section>
            ),
          },
          { value: "rebalance", label: t("nav.rebalance"), content: (
            <DataTable rows={rebalances} onRowClick={(r) => navigate(`/management/promotion-allocation?tab=quarterly-capital&rebalance_id=${encodeURIComponent(r.id)}`)} columns={[
              { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
              { key: "q", header: "Quarter", cell: (r) => <span className="text-mono text-xs">{r.quarter}</span> },
              { key: "delta", header: "Δ", cell: (r) => <span className="text-mono text-xs">{(r.proposedDelta * 100).toFixed(1)}%</span> },
              { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
            ]} empty={t("empty.none")} />
          ) },
          {
            value: "governance", label: t("phase13.capital.tabs.governance"),
            content: (
              <DataTable rows={approvals} onRowClick={(row) => navigate(`/management/governance/${row.id}`)} columns={[
                { key: "kind", header: t("table.kind"), cell: (row) => <span className="text-mono text-xs">{row.kind}</span> },
                { key: "subject", header: t("table.subject"), cell: (row) => <div className="font-medium">{row.subject}</div> },
                { key: "risk", header: t("table.risk"), cell: (row) => <RiskBadge level={row.riskLevel} /> },
                { key: "state", header: t("table.state"), cell: (row) => <StatusBadge state={row.state} /> },
              ]} empty={t("empty.none")} />
            ),
          },
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
        ]}
      />

      <HighRiskConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Adjust Risk Budget — ${c.name}`}
        description={t("detail.confirm.changeRiskBudget")}
        actionId="capital_pool.set_risk_budget"
        confirmEntity={{ type: "pool", id: c.id }}
        target={{ type: "CapitalPool", id: c.id, name: c.name }}
        risk="high"
        destructive
        onConfirm={async (memo, token) => {
          await runActionSafe({ kind: "CapitalPool", id: c.id, action: "adjust_budget", memo }, {
            confirmToken: token,
            successTitle: t("toast.actionQueued"),
          });
        }}
      />
    </>
  );
};
