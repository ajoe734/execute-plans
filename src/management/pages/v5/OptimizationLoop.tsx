// Pack E E4 — /management/loops/optimization
// Optimization loop runs derived from v5 LoopRun (kind=optimization). Each run is
// linked to a rebalance/approval; we surface stage progress and approval target.
// Pack F 短板 1+2 — handle ?intent=create + ?focus=rebalance|approval

import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { StatCard } from "@/platform/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { v5 } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import { useV5Live } from "./useV5Live";
import { toast } from "sonner";

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

export const OptimizationLoopPage = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const intent = params.get("intent");
  const focus = params.get("focus"); // "rebalance" | "approval"
  const runs = useV5Live(() => v5.loops.list("optimization"));
  const items = runs.data?.items ?? [];
  const runsRef = useRef<HTMLDivElement | null>(null);
  const approvalRef = useRef<HTMLTableSectionElement | null>(null);

  useEffect(() => {
    if (intent === "create") {
      toast.info(t("v5.optimization.createIntent", {
        defaultValue: "Start a new rebalance from /management/rebalance, then return here to monitor the optimization loop.",
      }));
      const next = new URLSearchParams(params);
      next.delete("intent");
      setParams(next, { replace: true });
    }
  }, [intent]);

  useEffect(() => {
    if (focus === "approval") approvalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (focus === "rebalance") runsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  const running = items.filter((r) => r.status === "running").length;
  const blocked = items.filter((r) => r.status === "blocked").length;
  const awaitingApproval = items.filter((r) => r.nextAction?.kind === "awaiting_approval").length;
  const succeeded = items.filter((r) => r.status === "succeeded").length;

  return (
    <>
      <PageHeader title={t("v5.loops.optimization.title")} subtitle={t("v5.loops.optimization.subtitle")} />
      <PageBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("v5.kpi.loopsRunning")} value={running} tone="success" />
          <StatCard label={t("v5.kpi.loopsBlocked")} value={blocked} tone={blocked > 0 ? "warning" : "default"} />
          <StatCard label={t("v5.optimization.awaitingApproval")} value={awaitingApproval} tone={awaitingApproval > 0 ? "warning" : "default"} />
          <StatCard label={t("v5.optimization.succeeded")} value={succeeded} tone="success" />
        </div>

        <Card className="p-0 overflow-hidden">
          <div ref={runsRef} className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold">{t("v5.optimization.runs")}</h2>
            <p className="text-xs text-muted-foreground">{t("v5.optimization.runsHint")}</p>
          </div>
          <table className="w-full text-sm">
            <thead ref={approvalRef} className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2">{t("v5.col.subject")}</th>
                <th className="text-left px-3 py-2">{t("v5.col.status")}</th>
                <th className="text-left px-3 py-2">{t("v5.col.stages")}</th>
                <th className="text-left px-3 py-2">{t("v5.col.next")}</th>
                <th className="text-left px-3 py-2">{t("v5.optimization.evidence")}</th>
                <th className="text-right px-3 py-2">{t("v5.col.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const approvalEv = r.evidence?.find((e) => e.kind === "approval");
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      {r.subjectId
                        ? <Link to={`/management/rebalance/${r.subjectId}`} className="font-medium hover:underline">{r.subjectName ?? r.id}</Link>
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
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {r.stages.map((s) => s.name).join(" → ")}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.nextAction?.label ?? r.nextAction?.kind ?? "—"}</td>
                    <td className="px-3 py-2">
                      {approvalEv
                        ? <Link to="/management/approvals" className="text-mono text-xs hover:underline">{approvalEv.id}</Link>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">{new Date(r.updatedAt).toLocaleString()}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">{t("v5.empty")}</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </PageBody>
    </>
  );
};
