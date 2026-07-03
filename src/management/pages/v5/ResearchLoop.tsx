// E3 follow-up — /management/loops/research
// Research loop runs derived from ResearchExperiment via deriveLoopRuns().
// Reuses LoopRunDrawer for stage timeline + advance/pause/resume/cancel actions.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { StatCard } from "@/platform/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { v5 } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import { useV5Live } from "./useV5Live";
import { LoopRunDrawer } from "./LoopRunDrawer";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonThreshold } from "@/components/ui/skeleton-threshold";
import { Skeleton } from "@/components/ui/skeleton";
import { FlaskConical } from "lucide-react";
import type { LoopRun } from "@/lib/v5";
import { safeDateTime } from "@/lib/utils";
import { filterResearchLoopRunsForFocus } from "./ResearchLoopFocus";

const statusBadgeCls: Record<string, string> = {
  running: "bg-status-running/15 text-status-running border-status-running/30",
  blocked: "bg-status-warning/15 text-status-warning border-status-warning/30",
  failed: "bg-status-failed/15 text-status-failed border-status-failed/30",
  succeeded: "bg-status-success/15 text-status-success border-status-success/30",
  idle: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const stageDotCls: Record<string, string> = {
  succeeded: "bg-status-success",
  running: "bg-status-running motion-safe:animate-pulse",
  blocked: "bg-status-warning",
  failed: "bg-status-failed",
  pending: "bg-muted-foreground/40",
  skipped: "bg-muted-foreground/30",
};

export const ResearchLoopPage = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const runParam = params.get("run");
  const personaFocus = params.get("persona")?.trim() ?? "";
  const projectFocus = params.get("project")?.trim() ?? "";
  const runs = useV5Live(() => v5.loops.list("research"));
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const activeRunTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (runParam && runParam !== activeRunId) setActiveRunId(runParam);
    else if (!runParam && activeRunId) setActiveRunId(null);
  }, [runParam, activeRunId]);

  const items = useMemo(() => runs.data?.items ?? [], [runs.data]);
  const focus = useMemo(
    () => filterResearchLoopRunsForFocus(items, { personaFocus, projectFocus }),
    [items, personaFocus, projectFocus],
  );
  const visibleItems = focus.items;
  const hasFocus = Boolean(personaFocus || projectFocus);
  const activeRun: LoopRun | null = useMemo(
    () => items.find((r) => r.id === activeRunId) ?? null,
    [items, activeRunId],
  );
  const restoreRunTriggerFocus = () => {
    const trigger = activeRunTriggerRef.current;
    if (!trigger) return;
    window.requestAnimationFrame(() => {
      if (trigger.isConnected) trigger.focus();
    });
  };

  const openRun = (id: string, trigger?: HTMLElement) => {
    activeRunTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setActiveRunId(id);
    const next = new URLSearchParams(params);
    next.set("run", id);
    setParams(next, { replace: true });
  };
  const closeRun = () => {
    setActiveRunId(null);
    const next = new URLSearchParams(params);
    next.delete("run");
    setParams(next, { replace: true });
    restoreRunTriggerFocus();
  };

  const running = visibleItems.filter((r) => r.status === "running").length;
  const blocked = visibleItems.filter((r) => r.status === "blocked").length;
  const reviewPending = visibleItems.filter((r) => r.nextAction?.kind === "awaiting_human_decision").length;
  const succeeded = visibleItems.filter((r) => r.status === "succeeded").length;

  return (
    <>
      <PageHeader
        title={t("v5.loops.research.title")}
        subtitle={t("v5.loops.research.subtitle", { defaultValue: "Research experiments expressed as a closed-loop pipeline (Design → Collect → Analyze → Review)." })}
      />
      <PageBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("v5.kpi.loopsRunning")} value={running} tone="success" />
          <StatCard label={t("v5.kpi.loopsBlocked")} value={blocked} tone={blocked > 0 ? "warning" : "default"} />
          <StatCard label={t("v5.loops.research.reviewPending", { defaultValue: "Review pending" })} value={reviewPending} tone={reviewPending > 0 ? "warning" : "default"} />
          <StatCard label={t("v5.optimization.succeeded")} value={succeeded} tone="success" />
        </div>

        {hasFocus && (
          <Card className={`p-3 text-sm ${focus.matched ? "border-primary/30 bg-primary/5" : "border-status-warning/30 bg-status-warning/10"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-foreground">
                {focus.matched
                  ? t("v5.loops.research.focusedFmt", { persona: personaFocus || "nan", project: projectFocus || "nan", count: visibleItems.length })
                  : t("v5.loops.research.focusMissingFmt", { persona: personaFocus || "nan", project: projectFocus || "nan" })}
              </span>
              <Button asChild size="sm" variant="outline">
                <Link to="/management/loops/research">{t("v5.loops.research.showAll", { defaultValue: "Show all research runs" })}</Link>
              </Button>
            </div>
          </Card>
        )}

        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold">{t("v5.loops.research.runs", { defaultValue: "Research runs" })}</h2>
            <p className="text-xs text-muted-foreground">{t("v5.loops.research.runsHint", { defaultValue: "One run per active experiment. Click to inspect stages and act on the loop." })}</p>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2">{t("v5.col.subject")}</th>
                <th className="text-left px-3 py-2">{t("v5.col.status")}</th>
                <th className="text-left px-3 py-2">{t("v5.col.stages")}</th>
                <th className="text-left px-3 py-2">{t("v5.col.next")}</th>
                <th className="text-right px-3 py-2">{t("v5.col.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((r) => (
                <tr
                  key={r.id}
                  className={`border-t border-border cursor-pointer hover:bg-muted/40 ${activeRunId === r.id ? "bg-primary/5" : ""}`}
                  onClick={(e) => openRun(r.id, e.currentTarget)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRun(r.id, e.currentTarget); } }}
                  aria-label={t("v5.loops.execution.openRun")}
                >
                  <td className="px-3 py-2">
                    {r.subjectId
                      ? <Link to={`/management/research/${r.subjectId}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{r.subjectName ?? r.id}</Link>
                      : <span className="font-medium">{r.subjectName ?? r.id}</span>}
                    <div className="text-xs text-muted-foreground">{r.triggeredBy}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={statusBadgeCls[r.status] ?? ""}>{r.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {r.stages.map((s) => (
                        <span key={s.id} title={`${s.name} · ${s.status}`} className={`h-2 w-8 rounded-full ${stageDotCls[s.status] ?? "bg-muted"}`} />
                      ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">{r.stages.map((s) => s.name).join(" → ")}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.nextAction?.label ?? r.nextAction?.kind ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">{safeDateTime(r.updatedAt)}</td>
                </tr>
              ))}
              {!runs.data && (
                <tr><td colSpan={5} className="px-3 py-4">
                  <SkeletonThreshold loading fallback={<Skeleton className="h-12 w-full" />}>{null}</SkeletonThreshold>
                </td></tr>
              )}
              {runs.data && visibleItems.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6">
                  <EmptyState
                    icon={<FlaskConical className="h-8 w-8" />}
                    title={t("v5.loops.research.emptyTitle", { defaultValue: "No research runs" })}
                    description={t("v5.loops.research.emptyDesc", { defaultValue: "No active experiments. Start a new research item to see it here." })}
                  />
                </td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </PageBody>
      <LoopRunDrawer run={activeRun} onClose={closeRun} />
    </>
  );
};
