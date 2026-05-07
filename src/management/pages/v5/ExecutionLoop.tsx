// Pack E E3 — /management/loops/execution
// Combines: execution-kind LoopRuns + Persona Health Matrix.
// Timeout policy uses v0-mock (Q12) until D05 lands.

import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { StatCard } from "@/platform/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import { useV5Live } from "./useV5Live";
import { PersonaHealthMatrix } from "./PersonaHealthMatrix";
import { DEFAULT_TIMEOUT_POLICY, V5_TIMEOUT_POLICY_VERSION } from "@/lib/v5";

const statusBadgeCls: Record<string, string> = {
  running: "bg-status-running/15 text-status-running border-status-running/30",
  blocked: "bg-status-warning/15 text-status-warning border-status-warning/30",
  failed: "bg-status-failed/15 text-status-failed border-status-failed/30",
  succeeded: "bg-status-success/15 text-status-success border-status-success/30",
  idle: "bg-muted text-muted-foreground border-border",
};

const stageDotCls: Record<string, string> = {
  succeeded: "bg-status-success",
  running: "bg-status-running motion-safe:animate-pulse",
  blocked: "bg-status-warning",
  failed: "bg-status-failed",
  pending: "bg-muted-foreground/40",
  skipped: "bg-muted-foreground/30",
};

export const ExecutionLoopPage = () => {
  const t = useT();
  const [params] = useSearchParams();
  const focus = params.get("focus"); // "personas" | "strategies" | "deployments" | "capital"
  const personasRef = useRef<HTMLDivElement | null>(null);
  const runsRef = useRef<HTMLDivElement | null>(null);
  const runs = useV5Live(() => bff.v5.loops.list("execution"));
  const personas = useV5Live(() => bff.v5.personas.health());

  useEffect(() => {
    if (focus === "personas") personasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (focus === "strategies" || focus === "deployments" || focus === "capital") {
      runsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focus]);

  const items = runs.data?.items ?? [];
  const running = items.filter((r) => r.status === "running").length;
  const blocked = items.filter((r) => r.status === "blocked").length;
  const failed = items.filter((r) => r.status === "failed").length;

  return (
    <>
      <PageHeader title={t("v5.loops.execution.title")} subtitle={t("v5.loops.execution.subtitle")} />
      <PageBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("v5.kpi.loopsRunning")} value={running} tone="success" />
          <StatCard label={t("v5.kpi.loopsBlocked")} value={blocked} tone={blocked > 0 ? "warning" : "default"} />
          <StatCard label={t("v5.kpi.loopsFailed")} value={failed} tone={failed > 0 ? "danger" : "default"} />
          <StatCard
            label={t("v5.kpi.timeoutPolicy")}
            value={V5_TIMEOUT_POLICY_VERSION}
            hint={`${t("v5.kpi.warnAfter")}: ${DEFAULT_TIMEOUT_POLICY.runningWarnMs / 60000}m · ${t("v5.kpi.escalateAfter")}: ${DEFAULT_TIMEOUT_POLICY.blockedEscalateMs / 60000}m`}
          />
        </div>

        {/* Loop runs */}
        <div ref={runsRef} />
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold">{t("v5.loops.execution.runs")}</h2>
            <p className="text-xs text-muted-foreground">{t("v5.loops.execution.runsHint")}</p>
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
              {items.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.subjectName ?? r.id}</div>
                    <div className="text-xs text-muted-foreground">{r.triggeredBy}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={statusBadgeCls[r.status] ?? ""}>{r.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {r.stages.map((s) => (
                        <span key={s.id} title={`${s.name} · ${s.status}`} className={`h-2 w-6 rounded-full ${stageDotCls[s.status] ?? "bg-muted"}`} />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.nextAction?.label ?? r.nextAction?.kind ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">{new Date(r.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">{t("v5.empty")}</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        {/* Persona health matrix */}
        <div ref={personasRef}>
          <div className="mb-2">
            <h2 className="text-sm font-semibold">{t("v5.matrix.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("v5.matrix.subtitle")}</p>
          </div>
          {personas.data
            ? <PersonaHealthMatrix items={personas.data.items} />
            : <div className="text-sm text-muted-foreground">{t("common.loading")}</div>}
        </div>
      </PageBody>
    </>
  );
};
