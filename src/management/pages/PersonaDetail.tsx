import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import type { Persona, Strategy, AuditEvent } from "@/lib/bff/types";
import { Pause, Edit } from "lucide-react";
import { ObjectDetailLayout, Section, Field, Placeholder } from "./ObjectDetailLayout";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { StatCard } from "@/platform/components/StatCard";
import { useNavigate } from "react-router-dom";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { toast } from "sonner";

export const PersonaDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [p, setP] = useState<Persona | undefined>();
  const [routed, setRouted] = useState<Strategy[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    bff.personas.get(id).then(setP);
    bff.strategies.list().then((all) => setRouted(all.filter((s) => s.personaIds.includes(id))));
    bff.audit.list().then((a) => setAudit(a.filter((x) => x.target === id)));
  }, [id]);

  if (!p) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  return (
    <>
      <ObjectDetailLayout
        object={p}
        subtitle={`${p.archetype} · ${p.id}`}
        actions={
          <>
            <Button size="sm" variant="outline"><Edit className="h-4 w-4 mr-1" />{t("actions.edit")}</Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)}>
              <Pause className="h-4 w-4 mr-1" />{t("actions.suspend")}
            </Button>
          </>
        }
        tabs={[
          {
            value: "overview", label: "Overview",
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Archetype" value={p.archetype} />
                  <Field label="Routed Strategies" value={p.routedStrategies} mono />
                  <Field label="Success Rate" value={`${(p.successRate * 100).toFixed(0)}%`} mono />
                  <Field label="Owner" value={p.owner} mono />
                </div>
              </Section>
            ),
          },
          {
            value: "routes", label: "Route Policy",
            content: (
              <DataTable
                rows={routed}
                onRowClick={(r) => navigate(`/management/strategies/${r.id}`)}
                columns={[
                  { key: "name", header: "Strategy", cell: (r) => <div className="font-medium">{r.name}</div> },
                  { key: "alpha", header: "Alpha", cell: (r) => <span className="text-mono text-xs">{r.alpha}</span> },
                  { key: "state", header: "State", cell: (r) => <StatusBadge state={r.state} /> },
                  { key: "risk", header: "Risk", cell: (r) => <RiskBadge level={r.risk} /> },
                ]}
                empty="No strategies routed to this persona"
              />
            ),
          },
          {
            value: "performance", label: "Performance",
            content: (
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="Success Rate" value={`${(p.successRate * 100).toFixed(0)}%`} tone="success" />
                <StatCard label="Routed Strategies" value={p.routedStrategies} />
                <StatCard label="Active Sessions" value={Math.floor(Math.random() * 12)} hint="mock" />
              </div>
            ),
          },
          {
            value: "memory", label: "Memory",
            content: <Placeholder text="Persona memory snapshots & training data." />,
          },
          {
            value: "audit", label: "Audit",
            content: (
              <DataTable rows={audit} columns={[
                { key: "ts", header: "Time", cell: (r) => <span className="text-mono text-xs">{new Date(r.ts).toLocaleString()}</span> },
                { key: "actor", header: "Actor", cell: (r) => r.actor },
                { key: "action", header: "Action", cell: (r) => <span className="text-mono text-xs">{r.action}</span> },
              ]} empty="No audit events" />
            ),
          },
        ]}
      />

      <HighRiskConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Suspend persona — ${p.name}`}
        description="Suspending this persona will stop routing strategies through it."
        confirmToken="SUSPEND"
        onConfirm={() => toast.success("Persona suspended")}
      />
    </>
  );
};
