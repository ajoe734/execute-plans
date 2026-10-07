import { useEffect, useState } from "react";
import { safeDateTime } from "@/lib/utils";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bffV1 } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import type { AuditEvent, RankingFormula, Strategy } from "@/lib/bff-v1";
import { Inbox } from "lucide-react";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable } from "@/platform/components/DataTable";
import { AuditTimeline } from "@/platform/components/AuditTimeline";

export const RankingFormulaDetail = () => {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const [f, setF] = useState<RankingFormula | undefined>();
  const [loading, setLoading] = useState(true);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      bffV1.rankingFormulas.list().then((rows) => setF(rows.find((x) => x.id === id))),
      bffV1.strategies.list().then(setStrategies),
      bffV1.audit.list().then((a) => setAudit(a.filter((x) => x.target === id || x.action?.startsWith("ranking.")))),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  if (!f) {
    return (
      <>
        <PageHeader title={t("nav.rankingFormulas", { defaultValue: "Ranking Policies" })} />
        <PageBody>
          <EmptyState
            icon={<Inbox className="h-8 w-8 text-muted-foreground" />}
            title={t("rankingFormula.detail.notFoundTitle", { defaultValue: "Ranking Policy Not Found" })}
            description={t("rankingFormula.detail.notFoundDescription", { id: id ?? "", defaultValue: `Ranking policy detail for ID ${id} is not available in the live contract.` })}
            cta={{ label: t("governanceDecisions.backToList", { defaultValue: "Back to Governance Decisions" }), onClick: () => nav("/management/governance-decisions?tab=policy") }}
          />
        </PageBody>
      </>
    );
  }
  const ranked = [...strategies]
    .map((s) => ({ ...s, score: 0.6 * s.sharpe - 0.4 * Math.abs(s.drawdown) }))
    .sort((a, b) => b.score - a.score);
  const versions = [
    { v: "v3", at: f.updatedAt, by: f.owner, note: "Current — activated" },
  ];

  return (
    <>
      <ObjectDetailLayout
        object={f}
        subtitle={f.id}
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link to="/management/governance-decisions?tab=policy">
              {t("nav.rankingFormulas", { defaultValue: "Ranking Policies" })}
            </Link>
          </Button>
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
              { key: "sharpe", header: t("table.sharpe"), cell: (r) => <span className="text-mono text-xs">{(r.sharpe ?? 0).toFixed(2)}</span> },
              { key: "dd", header: t("table.drawdown"), cell: (r) => <span className="text-mono text-xs">{(r.drawdown * 100).toFixed(2)}%</span> },
              { key: "score", header: t("rankingDashboard.score"), cell: (r) => <span className="text-mono text-xs text-accent">{(r.score ?? 0).toFixed(3)}</span> },
            ]} />
          ) },
          { value: "history", label: t("section.history"), content: (
            <DataTable rows={versions.map((v) => ({ ...v, id: v.v }))} columns={[
              { key: "v", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">{r.v}</span> },
              { key: "at", header: t("table.updated"), cell: (r) => <span className="text-mono text-xs">{safeDateTime(r.at)}</span> },
              { key: "by", header: t("table.actor"), cell: (r) => <span className="text-mono text-xs">{r.by}</span> },
              { key: "note", header: t("table.description"), cell: (r) => <span className="text-xs text-muted-foreground">{r.note}</span> },
            ]} />
          ) },
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
        ]}
      />
    </>
  );
};
