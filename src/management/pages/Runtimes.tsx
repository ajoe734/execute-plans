import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { bff } from "@/lib/bff/client";
import { mutations } from "@/lib/bff/mutations";
import { useT } from "@/platform/hooks";
import type { Runtime } from "@/lib/bff/types";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MoreHorizontal, RotateCcw, PowerOff, Move, Maximize2, ShieldAlert, ScrollText, Ban, Skull } from "lucide-react";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";

const envTone = (e: Runtime["env"]) => {
  if (e === "live") return "bg-env-live-bg text-status-success border-status-success/30";
  if (e === "paper") return "bg-env-paper-bg text-status-warning border-status-warning/30";
  return "bg-env-research-bg text-status-running border-status-running/30";
};

type RuntimeAction = "restart" | "drain" | "move" | "scale" | "quarantine" | "inspect_logs" | "disable_new";

export const RuntimesPage = () => {
  const t = useT();
  const [rows, setRows] = useState<Runtime[]>([]);
  const [killTarget, setKillTarget] = useState<Runtime | null>(null);
  useEffect(() => { bff.runtimes.list().then(setRows); }, []);

  const run = async (r: Runtime, action: RuntimeAction) => {
    const mappedAction = action === "disable_new" ? "quarantine" : action;
    const res = await mutations.runtimeAction(r.id, mappedAction, action === "disable_new" ? "disable_new_deployments" : `from runtimes table`);
    toast.success(t(`runtime.actions.${action}.toast`, { name: r.name }), { description: res.job?.id });
    bff.runtimes.list().then(setRows);
  };

  return (
    <>
      <PageHeader title={t("nav.runtimes")} subtitle={t("runtime.subtitle")} />
      <PageBody>
        <DataTable
          rows={rows}
          columns={[
            { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium text-mono text-xs">{r.name}</div> },
            { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-xs uppercase tracking-wider text-muted-foreground">{r.kind}</span> },
            { key: "env", header: t("table.env"), cell: (r) => <Badge variant="outline" className={`uppercase text-[10px] ${envTone(r.env)}`}>{r.env}</Badge> },
            { key: "status", header: t("table.status"), cell: (r) => <StatusBadge state={r.status} /> },
            { key: "cpu", header: "CPU", cell: (r) => <div className="flex items-center gap-2 w-28"><Progress value={r.cpu * 100} className="h-1.5" /><span className="text-mono text-xs w-10 text-right">{(r.cpu * 100).toFixed(0)}%</span></div> },
            { key: "mem", header: "Memory", cell: (r) => <div className="flex items-center gap-2 w-28"><Progress value={r.memory * 100} className="h-1.5" /><span className="text-mono text-xs w-10 text-right">{(r.memory * 100).toFixed(0)}%</span></div> },
            { key: "lat", header: "p95 latency", cell: (r) => <span className={`text-mono text-xs ${r.latencyP95Ms > 1000 ? "text-status-warning" : ""}`}>{r.latencyP95Ms}ms</span> },
            { key: "up", header: "Uptime", cell: (r) => <span className="text-mono text-xs">{r.uptimePct.toFixed(2)}%</span> },
            { key: "region", header: t("table.region"), cell: (r) => <span className="text-mono text-xs">{r.region}</span> },
            { key: "act", header: "", cell: (r) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => run(r, "restart")}><RotateCcw className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.restart.label")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => run(r, "drain")}><PowerOff className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.drain.label")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => run(r, "move")}><Move className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.move.label")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => run(r, "scale")}><Maximize2 className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.scale.label")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => run(r, "disable_new")}><Ban className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.disable_new.label")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => run(r, "quarantine")} className="text-status-warning"><ShieldAlert className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.quarantine.label")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => run(r, "inspect_logs")}><ScrollText className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.inspect_logs.label")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setKillTarget(r)} className="text-destructive"><Skull className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.emergency_kill.label")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) },
          ]}
        />
      </PageBody>
      {killTarget && (
        <HighRiskConfirm
          open={!!killTarget}
          onOpenChange={(o) => !o && setKillTarget(null)}
          operation="runtime.emergency_kill"
          target={{ type: "Runtime", id: killTarget.id, name: killTarget.name }}
          risk="critical"
          destructive
          riskImpact={t("runtime.actions.emergency_kill.impact")}
          confirmToken="KILL"
          onConfirm={async (memo) => {
            await mutations.emergencyKill({ kind: "Runtime", id: killTarget.id }, memo);
            toast.success(t("runtime.actions.emergency_kill.toast", { name: killTarget.name }));
            bff.runtimes.list().then(setRows);
          }}
        />
      )}
    </>
  );
};
