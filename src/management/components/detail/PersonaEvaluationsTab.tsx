import { useEffect, useState } from "react";
import { bff } from "@/lib/bff-v1";
import type { EvaluationRun } from "@/lib/bff/types";
import { DataTable } from "@/platform/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { useT } from "@/platform/hooks";

export const PersonaEvaluationsTab = ({ personaId }: { personaId: string }) => {
  const t = useT();
  const [rows, setRows] = useState<EvaluationRun[]>([]);
  useEffect(() => {
    bff.evaluationRuns.forSubject("Persona", personaId).then(setRows);
  }, [personaId]);
  return (
    <DataTable
      rows={rows}
      columns={[
        { key: "suite", header: t("phase13.persona.evaluations.suite"), cell: (r) => <div className="font-medium text-sm">{r.suite}</div> },
        { key: "score", header: t("phase13.persona.evaluations.score"), cell: (r) => <span className="text-mono text-sm">{(r.score * 100).toFixed(0)}%</span> },
        { key: "pass", header: t("table.state"), cell: (r) => <Badge variant="outline" className={`text-[10px] uppercase ${r.pass ? "border-status-success/40 text-status-success bg-status-success/10" : "border-status-failed/40 text-status-failed bg-status-failed/10"}`}>{r.pass ? "pass" : "fail"}</Badge> },
        {
          key: "trend", header: t("phase13.persona.evaluations.trend"),
          cell: (r) => (
            <div className="h-8 w-24">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={r.trend.map((v, i) => ({ i, v }))}>
                  <Line dataKey="v" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ),
        },
        { key: "ts", header: t("table.time"), cell: (r) => <span className="text-mono text-xs">{new Date(r.ranAt).toLocaleString()}</span> },
      ]}
      empty={t("phase13.persona.evaluations.empty")}
    />
  );
};
