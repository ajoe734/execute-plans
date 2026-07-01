import { useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { lists, runActionSafe, useLiveListV1 } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import type { Runtime } from "@/lib/bff/types";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, RotateCcw, PowerOff, Move, Maximize2, ShieldAlert, ScrollText, Ban, Skull } from "lucide-react";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";

const rtNum = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const envTone = (e: Runtime["env"]) => {
  if (e === "live") return "bg-env-live-bg text-status-success border-status-success/30";
  if (e === "paper") return "bg-env-paper-bg text-status-warning border-status-warning/30";
  return "bg-env-research-bg text-status-running border-status-running/30";
};

type RuntimeAction = "restart" | "drain" | "move" | "scale" | "quarantine" | "inspect_logs" | "disable_new";

export const RuntimesPage = () => {
  const t = useT();
  const { items: rows, refresh } = useLiveListV1<Runtime>(lists.runtimes, ["Runtime"]);
  const [killTarget, setKillTarget] = useState<Runtime | null>(null);

  const run = async (r: Runtime, action: RuntimeAction) => {
    const mappedAction = action === "disable_new" ? "quarantine" : action;
    const receipt = await runActionSafe({
      kind: "Runtime",
      id: r.id,
      action: mappedAction,
      memo: action === "disable_new" ? "disable_new_deployments" : "from runtimes table",
    }, {
      successTitle: t(`runtime.actions.${action}.toast`, { name: r.name }),
    });
    if (!receipt.ok) return;
    refresh();
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
            { key: "cpu", header: "CPU", cell: (r) => <div className="flex items-center gap-2 w-28"><Progress value={rtNum(r.cpu) * 100} className="h-1.5" /><span className="text-mono text-xs w-10 text-right">{(rtNum(r.cpu) * 100).toFixed(0)}%</span></div> },
            { key: "mem", header: "Memory", cell: (r) => <div className="flex items-center gap-2 w-28"><Progress value={rtNum(r.memory) * 100} className="h-1.5" /><span className="text-mono text-xs w-10 text-right">{(rtNum(r.memory) * 100).toFixed(0)}%</span></div> },
            { key: "lat", header: "p95 latency", cell: (r) => <span className={`text-mono text-xs ${rtNum(r.latencyP95Ms) > 1000 ? "text-status-warning" : ""}`}>{rtNum(r.latencyP95Ms)}ms</span> },
            { key: "up", header: "Uptime", cell: (r) => <span className="text-mono text-xs">{rtNum(r.uptimePct).toFixed(2)}%</span> },
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
            const receipt = await runActionSafe({
              kind: "Runtime",
              id: killTarget.id,
              action: "emergency_kill",
              memo,
            }, {
              successTitle: t("runtime.actions.emergency_kill.toast", { name: killTarget.name }),
            });
            if (!receipt.ok) return;
            refresh();
          }}
        />
      )}
    </>
  );
};
