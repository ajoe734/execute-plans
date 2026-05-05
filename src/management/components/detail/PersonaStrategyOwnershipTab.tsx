import { useNavigate } from "react-router-dom";
import type { Strategy } from "@/lib/bff/types";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/platform/hooks";

export const PersonaStrategyOwnershipTab = ({ personaId, strategies }: { personaId: string; strategies: Strategy[] }) => {
  const t = useT();
  const nav = useNavigate();
  const rows = strategies.map((s) => ({ ...s, ownership: s.personaIds[0] === personaId ? "primary" : "co" }));
  return (
    <DataTable
      rows={rows}
      onRowClick={(r) => nav(`/management/strategies/${r.id}`)}
      columns={[
        { key: "name", header: t("nav.strategies"), cell: (r) => <div className="font-medium">{r.name}</div> },
        { key: "ownership", header: t("phase13.persona.ownership.type"), cell: (r) => <Badge variant="outline" className="text-[10px] uppercase">{r.ownership === "primary" ? t("phase13.persona.ownership.primary") : t("phase13.persona.ownership.co")}</Badge> },
        { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
        { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
      ]}
      empty={t("empty.noResults")}
    />
  );
};
