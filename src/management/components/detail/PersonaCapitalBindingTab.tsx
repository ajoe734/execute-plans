import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { bff } from "@/lib/bff/client";
import type { CapitalPool, Strategy } from "@/lib/bff/types";
import { DataTable } from "@/platform/components/DataTable";
import { Section } from "@/management/pages/ObjectDetailLayout";
import { useT } from "@/platform/hooks";

export const PersonaCapitalBindingTab = ({ personaId }: { personaId: string }) => {
  const t = useT();
  const nav = useNavigate();
  const [rows, setRows] = useState<Array<CapitalPool & { boundStrategies: Strategy[] }>>([]);
  useEffect(() => {
    Promise.all([bff.capitalPools.list(), bff.strategies.list()]).then(([pools, strs]) => {
      const filtered = pools
        .map((pool) => ({
          ...pool,
          boundStrategies: strs.filter((s) => s.capitalPoolId === pool.id && s.personaIds.includes(personaId)),
        }))
        .filter((p) => p.boundStrategies.length > 0);
      setRows(filtered);
    });
  }, [personaId]);
  return (
    <Section title={t("phase13.persona.tabs.capitalBinding")}>
      <p className="text-xs text-muted-foreground">{t("phase13.persona.capital.hint")}</p>
      <DataTable
        rows={rows}
        onRowClick={(r) => nav(`/management/capital-pools/${r.id}`)}
        columns={[
          { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
          { key: "currency", header: "Currency", cell: (r) => <span className="text-mono text-xs">{r.currency}</span> },
          { key: "alloc", header: "Allocated", cell: (r) => <span className="text-mono text-xs">${(r.allocated / 1e6).toFixed(1)}M</span> },
          { key: "bound", header: t("nav.strategies"), cell: (r) => <span className="text-mono text-xs">{r.boundStrategies.length}</span> },
        ]}
        empty={t("empty.noResults")}
      />
    </Section>
  );
};
