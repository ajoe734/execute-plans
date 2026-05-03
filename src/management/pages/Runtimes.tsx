import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import type { Runtime } from "@/lib/bff/types";
import { Badge } from "@/components/ui/badge";

const envTone = (e: Runtime["env"]) => {
  if (e === "live") return "bg-env-live-bg text-status-success border-status-success/30";
  if (e === "paper") return "bg-env-paper-bg text-status-warning border-status-warning/30";
  return "bg-env-research-bg text-status-running border-status-running/30";
};

export const RuntimesPage = () => {
  const t = useT();
  const [rows, setRows] = useState<Runtime[]>([]);
  useEffect(() => { bff.runtimes.list().then(setRows); }, []);

  return (
    <>
      <PageHeader title={t("nav.runtimes")} subtitle="Live operational view of executors, MCP servers, schedulers, and ingest pipelines." />
      <PageBody>
        <DataTable
          rows={rows}
          columns={[
            { key: "name", header: "Name", cell: (r) => <div className="font-medium text-mono text-xs">{r.name}</div> },
            { key: "kind", header: "Kind", cell: (r) => <span className="text-xs uppercase tracking-wider text-muted-foreground">{r.kind}</span> },
            { key: "env", header: "Env", cell: (r) => <Badge variant="outline" className={`uppercase text-[10px] ${envTone(r.env)}`}>{r.env}</Badge> },
            { key: "status", header: "Status", cell: (r) => <StatusBadge state={r.status} /> },
            { key: "cpu", header: "CPU", cell: (r) => <div className="flex items-center gap-2 w-28"><Progress value={r.cpu * 100} className="h-1.5" /><span className="text-mono text-xs w-10 text-right">{(r.cpu * 100).toFixed(0)}%</span></div> },
            { key: "mem", header: "Memory", cell: (r) => <div className="flex items-center gap-2 w-28"><Progress value={r.memory * 100} className="h-1.5" /><span className="text-mono text-xs w-10 text-right">{(r.memory * 100).toFixed(0)}%</span></div> },
            { key: "lat", header: "p95 latency", cell: (r) => <span className={`text-mono text-xs ${r.latencyP95Ms > 1000 ? "text-status-warning" : ""}`}>{r.latencyP95Ms}ms</span> },
            { key: "up", header: "Uptime", cell: (r) => <span className="text-mono text-xs">{r.uptimePct.toFixed(2)}%</span> },
            { key: "region", header: "Region", cell: (r) => <span className="text-mono text-xs">{r.region}</span> },
          ]}
        />
      </PageBody>
    </>
  );
};
