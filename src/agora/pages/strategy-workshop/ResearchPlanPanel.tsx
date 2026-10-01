import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAgoraWriteAccess } from "@/agora/useAgoraWriteAccess";
import { ResearchRunProjectionCard } from "@/agora/components/ResearchRunCard";
import {
  RESEARCH_STAGE_TYPES,
  approveResearchPlan,
  cancelResearchPlan,
  createWorkshopResearchPlan,
  dispatchResearchPlan,
  getResearchPlan,
  isStaleEtagError,
  listResearchPlanRuns,
  listWorkshopResearchPlans,
  type ResearchPlanSnapshot,
  type ResearchRunProjection,
} from "@/lib/bff-v1/agora/research";

export interface ResearchPlanPanelProps {
  workshopId: string;
  strategySpec: { strategyId: string; registryId: string } | null;
}

interface PlanEntry {
  snapshot: ResearchPlanSnapshot;
  runs: ResearchRunProjection[];
}

const ACTIVE_RUN = new Set(["queued", "dispatching", "running"]);

export function ResearchPlanPanel({ workshopId, strategySpec }: ResearchPlanPanelProps) {
  const access = useAgoraWriteAccess();
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const plans = await listWorkshopResearchPlans(workshopId);
    const next = await Promise.all(plans.map(async (listed) => {
      const snapshot = (await getResearchPlan(listed.plan_id)) ?? { plan: listed, etag: null, allowedActions: [] };
      return { snapshot, runs: await listResearchPlanRuns(listed.plan_id) };
    }));
    setEntries(next);
  }, [workshopId]);

  const load = useCallback(() => {
    reload().then(() => setError(null), (err) => setError(err instanceof Error ? err.message : "Research plans unavailable"));
  }, [reload]);

  useEffect(() => { load(); }, [load]);

  const polling = entries.some((e) => e.runs.some((r) => ACTIVE_RUN.has(r.execution_status)));
  useEffect(() => {
    if (!polling) return undefined;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [polling, load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      if (isStaleEtagError(err)) {
        setError("This plan changed since it was loaded. It has been refreshed; review it and try again.");
        await reload().catch(() => undefined);
      } else {
        setError(err instanceof Error ? err.message : "Research action failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const writeReason = access.loading
    ? "Checking write permissions…"
    : access.writeAllowed ? null : access.writeDisabledReason;
  const createReason = writeReason ?? (strategySpec ? null : "Canonical StrategySpec identity is not yet available.");
  const can = (entry: PlanEntry, action: string) =>
    entry.snapshot.allowedActions.some((name) => name.replace(/^can(?=[A-Z_-])[_-]?/, "").toLowerCase() === action);

  return (
    <section className="space-y-2 border-t border-slate-100 pt-2" data-testid="research-plan-panel">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Research Plans</span>
        <span className="text-[10px] text-slate-400">Research only · never live or canary</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          data-testid="research-plan-create"
          disabled={busy || !!createReason}
          title={createReason ?? undefined}
          type="button"
          onClick={() => strategySpec && run(() => createWorkshopResearchPlan(workshopId, {
            spec_version: "1.0",
            strategy_id: strategySpec.strategyId,
            strategy_spec_registry_id: strategySpec.registryId,
            stages: Object.values(RESEARCH_STAGE_TYPES).map((stage_type) => ({ stage_type })),
          }))}
        >
          + Research Plan
        </Button>
      </div>
      {createReason ? <p className="text-[11px] text-slate-500" data-testid="research-plan-disabled-reason">{createReason}</p> : null}
      {error ? <p className="text-xs text-red-600" role="alert" data-testid="research-plan-error">{error}</p> : null}
      {entries.map((entry) => {
        const { plan, etag } = entry.snapshot;
        const guard = (action: string) => busy || !!writeReason || !etag || !can(entry, action);
        const opts = { ifMatch: etag ?? undefined };
        return (
          <div key={plan.plan_id} className="rounded border border-slate-200 p-2 space-y-2" data-testid={`research-plan-${plan.plan_id}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-[11px] text-slate-400">{plan.plan_id}</span>
              <span className="font-semibold" data-testid="research-plan-status">{plan.status}</span>
              <span className="text-slate-500">{(plan.stages ?? []).map((s) => s.stage_type).join(" → ")}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-6 text-xs" type="button" data-testid="research-plan-approve"
                disabled={guard("approve")} title={writeReason ?? undefined}
                onClick={() => run(() => approveResearchPlan(plan.plan_id, opts))}>Approve</Button>
              <Button size="sm" variant="outline" className="h-6 text-xs" type="button" data-testid="research-plan-dispatch"
                disabled={guard("dispatch")} title={writeReason ?? undefined}
                onClick={() => run(() => dispatchResearchPlan(plan.plan_id, opts))}>Dispatch</Button>
              <Button size="sm" variant="outline" className="h-6 text-xs" type="button" data-testid="research-plan-cancel"
                disabled={guard("cancel")} title={writeReason ?? undefined}
                onClick={() => run(() => cancelResearchPlan(plan.plan_id, opts))}>Cancel</Button>
            </div>
            {entry.runs.map((r) => <ResearchRunProjectionCard key={r.run_id} run={r} />)}
          </div>
        );
      })}
    </section>
  );
}
