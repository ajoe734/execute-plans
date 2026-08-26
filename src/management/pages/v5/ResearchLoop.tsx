// E3 follow-up — /management/loops/research
// Research loop runs derived from ResearchExperiment via deriveLoopRuns().
// Reuses LoopRunDrawer for stage timeline + advance/pause/resume/cancel actions.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { StatCard } from "@/platform/components/StatCard";
import { Card } from "@/components/ui/card";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mgmt, v5 } from "@/lib/bff-v1";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
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

type RawResearchFleetRow = ManagementPersonaFleetRow & {
  id?: string;
  persona_id?: string;
  name?: string;
  current_work?: string;
  last_mutation?: string;
  research_status?: { stage?: string; summary?: string } | null;
};

function researchFleetPersonaId(row: ManagementPersonaFleetRow): string | undefined {
  const raw = row as RawResearchFleetRow;
  const id = row.personaId ?? raw.persona_id ?? raw.id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

function dateFromFleetMutation(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) return `${value.slice(0, 10)}T00:00:00Z`;
  return "1970-01-01T00:00:00Z";
}

function fallbackResearchRunFromFleet(
  fleetRows: ManagementPersonaFleetRow[] | undefined,
  personaFocus: string,
): LoopRun | null {
  const focus = personaFocus.trim();
  if (!focus) return null;
  const row = (fleetRows ?? []).find((item) => researchFleetPersonaId(item) === focus);
  if (!row) return null;
  const raw = row as RawResearchFleetRow;
  const stage = row.researchStatus?.stage ?? raw.research_status?.stage ?? row.ooda ?? "research";
  const currentWork = row.currentWork ?? raw.current_work ?? row.researchStatus?.summary ?? raw.research_status?.summary;
  const when = dateFromFleetMutation(row.lastMutation ?? raw.last_mutation);
  const blocked = Boolean(row.humanNeeded);
  return {
    id: `persona-fleet-research-summary:${focus}`,
    loopKind: "research",
    status: blocked ? "blocked" : "running",
    startedAt: when,
    updatedAt: when,
    triggeredBy: focus,
    subjectKind: "research",
    subjectName: currentWork ?? row.personaName ?? raw.name ?? focus,
    currentStageId: "fleet-summary",
    stages: [{
      id: "fleet-summary",
      name: stage,
      status: blocked ? "blocked" : "running",
      startedAt: when,
    }],
    nextAction: {
      kind: blocked ? "awaiting_human_decision" : "none",
      label: row.state ?? stage,
    },
    evidence: [],
  };
}

export const ResearchLoopPage = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const runParam = params.get("run");
  const personaFocus = params.get("persona")?.trim() ?? "";
  const projectFocus = params.get("project")?.trim() ?? "";
  const runs = useV5Live(() => v5.loops.list("research"));
  const fleetRows = useV5Live(() => mgmt.personaFleet.get());
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
  const fleetFallback = useMemo(
    () => focus.matched || projectFocus ? null : fallbackResearchRunFromFleet(fleetRows.data, personaFocus),
    [fleetRows.data, focus.matched, personaFocus, projectFocus],
  );
  const visibleItems = fleetFallback ? [fleetFallback] : focus.items;
  const focusMatched = focus.matched || Boolean(fleetFallback);
  const hasFocus = Boolean(personaFocus || projectFocus);
  const activeRun: LoopRun | null = useMemo(() => {
    if (activeRunId && fleetFallback && activeRunId === fleetFallback.id) {
      return fleetFallback;
    }
    return items.find((r) => r.id === activeRunId) ?? null;
  }, [items, activeRunId, fleetFallback]);
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
          <Card className={`p-3 text-sm ${focusMatched ? "border-primary/30 bg-primary/5" : "border-status-warning/30 bg-status-warning/10"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-foreground">
                {focusMatched
                  ? projectFocus
                    ? t("v5.loops.research.focusedFmt", { persona: personaFocus || "nan", project: projectFocus, count: visibleItems.length })
                    : t("v5.loops.research.focusedPersonaFmt", { persona: personaFocus || "nan", count: visibleItems.length })
                  : projectFocus
                    ? t("v5.loops.research.focusMissingFmt", { persona: personaFocus || "nan", project: projectFocus })
                    : t("v5.loops.research.focusMissingPersonaFmt", { persona: personaFocus || "nan" })}
              </span>
              <Button asChild size="sm" variant="outline">
                <Link to="/management/loops/research">{t("v5.loops.research.showAll", { defaultValue: "Show all research runs" })}</Link>
              </Button>
            </div>
          </Card>
        )}

        <Card className="p-4 bg-muted/20 border border-border/40 space-y-2 mb-4 text-xs">
          <h3 className="font-semibold text-foreground flex items-center gap-1.5">
            <FlaskConical className="h-4 w-4 text-primary" />
            什麼是研究迴圈 (Research Loop)？
          </h3>
          <p className="text-muted-foreground leading-relaxed">
            每個智慧體 (Persona) 所進行的研究項目在底層皆被建模為一個<strong>研究迴圈 (Research Loop)</strong>。任務會自主經歷以下四個生命週期：
          </p>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4 pt-1">
            <div className="p-2 rounded bg-background/50 border border-border/20">
              <span className="font-semibold text-foreground block mb-0.5">1. 設計 (Design)</span>
              <span className="text-[10px] text-muted-foreground">制定研究方向與策略目標</span>
            </div>
            <div className="p-2 rounded bg-background/50 border border-border/20">
              <span className="font-semibold text-foreground block mb-0.5">2. 收集 (Collect)</span>
              <span className="text-[10px] text-muted-foreground">運行回測並獲取市場指標</span>
            </div>
            <div className="p-2 rounded bg-background/50 border border-border/20">
              <span className="font-semibold text-foreground block mb-0.5">3. 分析 (Analyze)</span>
              <span className="text-[10px] text-muted-foreground">產出具體的信號分析與評估</span>
            </div>
            <div className="p-2 rounded bg-background/50 border border-border/20">
              <span className="font-semibold text-foreground block mb-0.5">4. 審核 (Review)</span>
              <span className="text-[10px] text-muted-foreground">提出報告待人類審查決策</span>
            </div>
          </div>
          <p className="text-muted-foreground leading-relaxed pt-1">
            當任務狀態顯示為 <span className="text-status-warning font-medium">blocked (卡住)</span> 時，代表智慧體需要您的介入。請<strong>點擊該行任務</strong>，從右側滑出「任務抽屜」，即可點擊 <span className="text-primary font-medium">Advance (前進)</span> 批准該策略推進到下一步（例如沙盒運行或升級）。
          </p>
        </Card>

        <Card className="p-0">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold">{t("v5.loops.research.runs", { defaultValue: "Research runs" })}</h2>
            <p className="text-xs text-muted-foreground">{t("v5.loops.research.runsHint", { defaultValue: "One run per active experiment. Click to inspect stages and act on the loop." })}</p>
          </div>
          <ManagementTableScroll minScrollWidth={1040}>
          <table className="w-full min-w-[1040px] text-sm">
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
          </ManagementTableScroll>
        </Card>
      </PageBody>
      <LoopRunDrawer run={activeRun} onClose={closeRun} />
    </>
  );
};
