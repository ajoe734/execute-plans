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
            value: "overview", label: t("section.overview"),
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label={t("table.type")} value={p.archetype} />
                  <Field label={t("nav.strategies")} value={p.routedStrategies} mono />
                  <Field label={t("table.winRate")} value={`${(p.successRate * 100).toFixed(0)}%`} mono />
                  <Field label={t("table.owner")} value={p.owner} mono />
                </div>
              </Section>
            ),
          },
          {
            value: "routes", label: t("section.permissions"),
            content: (
              <DataTable
                rows={routed}
                onRowClick={(r) => navigate(`/management/strategies/${r.id}`)}
                columns={[
                  { key: "name", header: t("nav.strategies"), cell: (r) => <div className="font-medium">{r.name}</div> },
                  { key: "alpha", header: "Alpha", cell: (r) => <span className="text-mono text-xs">{r.alpha}</span> },
                  { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
                  { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
                ]}
                empty={t("empty.noResults")}
              />
            ),
          },
          {
            value: "performance", label: t("section.performance"),
            content: (
              <div className="grid grid-cols-3 gap-4">
                <StatCard label={t("table.winRate")} value={`${(p.successRate * 100).toFixed(0)}%`} tone="success" />
                <StatCard label={t("nav.strategies")} value={p.routedStrategies} />
                <StatCard label={t("section.activity")} value={Math.floor(Math.random() * 12)} hint="mock" />
              </div>
            ),
          },
          {
            value: "memory", label: t("nav.memoryReview"),
            content: (
              <Section title={t("nav.memoryReview")}>
                <div className="space-y-2 text-sm">
                  {[
                    { id: "m_01", text: `${p.archetype} prefers low-leverage entries during high-vol regimes.`, src: "memory_review", ts: 6 },
                    { id: "m_02", text: `Tag risk events on ${p.routedStrategies} routed strategies for follow-up review.`, src: "audit", ts: 24 },
                    { id: "m_03", text: "Defer rebalance recommendations into the morning UTC window.", src: "operator", ts: 72 },
                  ].map((m) => (
                    <div key={m.id} className="p-3 rounded-md bg-muted/50 border border-border">
                      <div className="text-sm">{m.text}</div>
                      <div className="text-mono text-[10px] text-muted-foreground mt-1">{m.id} · from {m.src} · {m.ts}h ago</div>
                    </div>
                  ))}
                </div>
              </Section>
            ),
          },
          {
            value: "audit", label: t("nav.audit"),
            content: (
              <DataTable rows={audit} columns={[
                { key: "ts", header: t("table.time"), cell: (r) => <span className="text-mono text-xs">{new Date(r.ts).toLocaleString()}</span> },
                { key: "actor", header: t("table.actor"), cell: (r) => r.actor },
                { key: "action", header: t("table.action"), cell: (r) => <span className="text-mono text-xs">{r.action}</span> },
              ]} empty={t("empty.noResults")} />
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
        onConfirm={async (memo) => { await bff.mutations.runAction({ kind: "Persona", id: p.id, action: "suspend", memo }); toast.success(t("toast.saved")); }}
      />
    </>
  );
};
