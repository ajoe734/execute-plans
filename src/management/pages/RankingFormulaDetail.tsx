import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff/client";
import { runActionSafe } from "@/lib/bff/runAction";
import { useT } from "@/platform/hooks";
import type { AuditEvent, RankingFormula, Strategy } from "@/lib/bff/types";
import { CheckCircle2, Edit } from "lucide-react";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { toast } from "sonner";
import { DataTable } from "@/platform/components/DataTable";
import { AuditTimeline } from "@/platform/components/AuditTimeline";

export const RankingFormulaDetail = () => {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const [f, setF] = useState<RankingFormula | undefined>();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    bff.rankingFormulas.list().then((rows) => setF(rows.find((x) => x.id === id)));
    bff.strategies.list().then(setStrategies);
    bff.audit.list().then((a) => setAudit(a.filter((x) => x.target === id || x.action.startsWith("ranking."))));
  }, [id]);

  if (!f) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  const ranked = [...strategies]
    .map((s) => ({ ...s, score: 0.6 * s.sharpe - 0.4 * Math.abs(s.drawdown) }))
    .sort((a, b) => b.score - a.score);
  const versions = [
    { v: "v3", at: f.updatedAt, by: f.owner, note: "Current — activated" },
    { v: "v2", at: new Date(Date.now() - 86400_000 * 14).toISOString(), by: f.owner, note: "Tightened drawdown weight" },
    { v: "v1", at: new Date(Date.now() - 86400_000 * 60).toISOString(), by: "system", note: "Initial draft" },
  ];

  return (
    <>
      <ObjectDetailLayout
        object={f}
        subtitle={f.id}
        actions={
          <>
            <Button size="sm" variant="outline"><Edit className="h-4 w-4 mr-1" />{t("actions.edit")}</Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)}>
              <CheckCircle2 className="h-4 w-4 mr-1" />Activate
            </Button>
          </>
        }
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (
              <Section>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Applied to" value={`${f.appliedTo} strategies`} mono />
                  <Field label={t("table.state")} value={f.state} mono />
                  <Field label={t("table.owner")} value={f.owner} mono />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("ranking.expression")}</div>
                  <pre className="text-mono text-sm bg-muted p-3 rounded-md overflow-x-auto">{f.expression}</pre>
                </div>
              </Section>
            ),
          },
          { value: "preview", label: t("rankingDashboard.score"), content: (
            <DataTable rows={ranked.map((r, i) => ({ ...r, id: r.id, rank: i + 1 }))} onRowClick={(r) => nav(`/management/strategies/${r.id}`)} columns={[
              { key: "rank", header: "#", cell: (r) => <span className="text-mono text-xs">{r.rank}</span> },
              { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
              { key: "sharpe", header: t("table.sharpe"), cell: (r) => <span className="text-mono text-xs">{r.sharpe.toFixed(2)}</span> },
              { key: "dd", header: t("table.drawdown"), cell: (r) => <span className="text-mono text-xs">{(r.drawdown * 100).toFixed(2)}%</span> },
              { key: "score", header: t("rankingDashboard.score"), cell: (r) => <span className="text-mono text-xs text-accent">{r.score.toFixed(3)}</span> },
            ]} />
          ) },
          { value: "history", label: t("section.history"), content: (
            <DataTable rows={versions.map((v) => ({ ...v, id: v.v }))} columns={[
              { key: "v", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">{r.v}</span> },
              { key: "at", header: t("table.updated"), cell: (r) => <span className="text-mono text-xs">{new Date(r.at).toLocaleString()}</span> },
              { key: "by", header: t("table.actor"), cell: (r) => <span className="text-mono text-xs">{r.by}</span> },
              { key: "note", header: t("table.description"), cell: (r) => <span className="text-xs text-muted-foreground">{r.note}</span> },
            ]} />
          ) },
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
        ]}
      />

      <HighRiskConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Activate Ranking Formula — ${f.name}`}
        description={t("detail.confirm.activateFormula")}
        actionId="ranking_formula.activate"
        confirmEntity={{ type: "formula", id: f.id }}
        target={{ type: "RankingFormula", id: f.id, name: f.name }}
        risk="high"
        destructive
        onConfirm={async (memo) => { await runActionSafe({ kind: "RankingFormula", id: f.id, action: "activate", memo }); toast.success("Activation requested — pending approval"); }}
      />
    </>
  );
};
