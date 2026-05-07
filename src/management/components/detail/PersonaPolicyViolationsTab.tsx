import { useEffect, useState } from "react";
import { bff } from "@/lib/bff-v1";
import type { PolicyViolation } from "@/lib/bff/types";
import { DataTable } from "@/platform/components/DataTable";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/platform/hooks";

const stateTone: Record<PolicyViolation["state"], string> = {
  open: "border-status-failed/40 text-status-failed bg-status-failed/10",
  acknowledged: "border-status-warning/40 text-status-warning bg-status-warning/10",
  resolved: "border-status-success/40 text-status-success bg-status-success/10",
};

export const PersonaPolicyViolationsTab = ({ personaId }: { personaId: string }) => {
  const t = useT();
  const [rows, setRows] = useState<PolicyViolation[]>([]);
  useEffect(() => {
    bff.policyViolations.forSubject("Persona", personaId).then(setRows);
  }, [personaId]);
  return (
    <DataTable
      rows={rows}
      columns={[
        { key: "ts", header: t("table.time"), cell: (r) => <span className="text-mono text-xs">{new Date(r.ts).toLocaleString()}</span> },
        { key: "policy", header: t("phase13.persona.violations.policy"), cell: (r) => <div><div className="text-sm">{r.policyName}</div><div className="text-mono text-[10px] text-muted-foreground">{r.policyId}</div></div> },
        { key: "severity", header: t("table.risk"), cell: (r) => <RiskBadge level={r.severity} /> },
        { key: "state", header: t("phase13.persona.violations.state"), cell: (r) => <Badge variant="outline" className={`text-[10px] uppercase ${stateTone[r.state]}`}>{r.state}</Badge> },
        { key: "desc", header: t("table.description"), cell: (r) => <span className="text-xs text-muted-foreground">{r.description}</span> },
      ]}
      empty={t("phase13.persona.violations.empty")}
    />
  );
};
