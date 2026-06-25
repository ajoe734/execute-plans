// Phase 11.2 — Route Policies list (governance surface).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { Badge } from "@/components/ui/badge";
import { bff } from "@/lib/bff-v1";
import type { Persona, RoutePolicy } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { safeDateTime } from "@/lib/utils";

export const RoutePoliciesList = () => {
  const t = useT();
  const nav = useNavigate();
  const [rows, setRows] = useState<RoutePolicy[]>([]);
  const [personas, setPersonas] = useState<Record<string, Persona>>({});

  useEffect(() => {
    bff.routePolicies.list().then(setRows);
    bff.personas.list().then((ps) => setPersonas(Object.fromEntries(ps.map((p) => [p.id, p]))));
  }, []);

  return (
    <>
      <PageHeader title={t("governance.policies.title")} subtitle={t("governance.policies.subtitle")} />
      <PageBody>
        <DataTable
          rows={rows}
          onRowClick={(r) => nav(`/management/governance/policies/${r.id}`)}
          empty={t("empty.noResults")}
          columns={[
            { key: "name", header: t("table.name"), cell: (r) => (
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-mono text-[10px] text-muted-foreground">{r.id}</div>
              </div>
            ) },
            { key: "persona", header: t("nav.personas"), cell: (r) => (
              <span className="text-sm">{personas[r.personaId]?.name ?? r.personaId}</span>
            ) },
            { key: "version", header: t("table.version"), cell: (r) => (
              <Badge variant="outline" className="text-mono text-[10px]">{r.version}</Badge>
            ) },
            { key: "rules", header: t("governance.policy.rules"), cell: (r) => (
              <span className="text-mono text-xs">{r.rules.length}</span>
            ) },
            { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
            { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
            { key: "updated", header: t("table.updated"), cell: (r) => (
              <span className="text-xs text-muted-foreground">{safeDateTime(r.updatedAt, "date")}</span>
            ) },
          ]}
        />
      </PageBody>
    </>
  );
};
