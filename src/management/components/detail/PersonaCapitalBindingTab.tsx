import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { bffV1 } from "@/lib/bff-v1";
import type { CapitalPool, Strategy } from "@/lib/bff-v1";
import { DataTable } from "@/platform/components/DataTable";
import { Button } from "@/components/ui/button";
import { Section } from "@/management/pages/ObjectDetailLayout";
import { useT } from "@/platform/hooks";
import { tradeJourneyHref } from "@/management/navigation/tradeJourneyLinks";

export const PersonaCapitalBindingTab = ({ personaId }: { personaId: string }) => {
  const t = useT();
  const nav = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState<Array<CapitalPool & { boundStrategies: Strategy[] }>>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    setRows([]);
    setLoadState("loading");
    Promise.all([bffV1.capitalPools.list(), bffV1.strategies.listForPersona(personaId)])
      .then(([pools, strs]) => {
        if (cancelled) return;
        const personaStrategies = strs.filter(
          (s) =>
            s.personaIds.length === 0 ||
            s.personaIds.includes(personaId) ||
            (s as { persona_id?: string; personaId?: string }).persona_id === personaId ||
            (s as { persona_id?: string; personaId?: string }).personaId === personaId,
        );
        const filtered = pools
          .map((pool) => ({
            ...pool,
            boundStrategies: personaStrategies.filter(
              (s) =>
                s.capitalPoolId === pool.id ||
                (s as { capital_pool_id?: string }).capital_pool_id === pool.id,
            ),
          }))
          .filter((p) => p.boundStrategies.length > 0);
        setRows(filtered);
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [personaId]);
  return (
    <Section title={t("phase13.persona.tabs.capitalBinding")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("phase13.persona.capital.hint")}</p>
        <Button asChild size="sm" variant="outline">
          <Link aria-label={`${personaId} trade journeys`} to={tradeJourneyHref(location, { personaId }, `Persona ${personaId}`)}>
            {t("nav.tradeJourneys", { defaultValue: "Trade Journeys" })}
          </Link>
        </Button>
      </div>
      <DataTable
        rows={rows}
        loading={loadState === "loading"}
        onRowClick={(r) => nav(`/management/governance-decisions?tab=capital&capital_id=${encodeURIComponent(r.id)}`)}
        columns={[
          {
            key: "name",
            header: t("table.name"),
            cell: (r) => (
              <div>
                <div className="font-medium">{r.name}</div>
                {r.id !== r.name && <div className="text-mono text-xs text-muted-foreground">{r.id}</div>}
              </div>
            ),
          },
          { key: "currency", header: "Currency", cell: (r) => <span className="text-mono text-xs">{r.currency || t("common.noData")}</span> },
          {
            key: "alloc",
            header: "Allocated",
            cell: (r) => (
              <span className="text-mono text-xs">
                {typeof r.allocated === "number" && Number.isFinite(r.allocated)
                  ? `$${(r.allocated / 1e6).toFixed(1)}M`
                  : t("common.noData")}
              </span>
            ),
          },
          {
            key: "bound",
            header: t("nav.strategies"),
            cell: (r) => (
              <div className="text-mono text-xs">
                <span>{r.boundStrategies.length}</span>
                {r.boundStrategies.length > 0 && (
                  <span className="ml-1.5 text-muted-foreground">
                    ({r.boundStrategies.map((s) => s.id).join(", ")})
                  </span>
                )}
              </div>
            ),
          },
        ]}
        empty={loadState === "error" ? t("status.unavailable") : t("empty.noResults")}
      />
    </Section>
  );
};
