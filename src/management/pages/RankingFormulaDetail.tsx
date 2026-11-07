import { useEffect, useState } from "react";
import { safeDateTime } from "@/lib/utils";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bffV1 } from "@/lib/bff-v1";
import { useLiveDetail } from "@/lib/bff-v1/useLiveDetail";
import { useT } from "@/platform/hooks";
import type { AuditEvent, RankingFormula } from "@/lib/bff-v1";
import { AlertTriangle, Inbox } from "lucide-react";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable } from "@/platform/components/DataTable";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { canonicalCenterUrl } from "@/management/navigation/managementRouteManifest";

export interface RankingFormulaScoreRow {
  id: string;
  rank: number;
  name: string;
  sharpe?: number;
  drawdown?: number;
  score: number;
}

function extractOwnerRankingRows(formula: RankingFormula): RankingFormulaScoreRow[] {
  const raw = formula as RankingFormula & {
    rankings?: unknown;
    ranking_rows?: unknown;
    rows?: unknown;
  };
  const candidate = Array.isArray(raw.rankings)
    ? raw.rankings
    : Array.isArray(raw.ranking_rows)
      ? raw.ranking_rows
      : Array.isArray(raw.rows)
        ? raw.rows
        : [];
  const rows: RankingFormulaScoreRow[] = [];
  candidate.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    const id = String(record.id ?? record.strategy_id ?? record.strategyId ?? record.persona_id ?? "").trim();
    const name = String(record.name ?? record.display_name ?? id).trim();
    const score = record.score;
    if (!id || typeof score !== "number" || !Number.isFinite(score)) return;
    const rank = typeof record.rank === "number" && Number.isFinite(record.rank) ? record.rank : index + 1;
    const sharpe = typeof record.sharpe === "number" && Number.isFinite(record.sharpe) ? record.sharpe : undefined;
    const drawdown = typeof record.drawdown === "number" && Number.isFinite(record.drawdown) ? record.drawdown : undefined;
    rows.push({ id, rank, name: name || id, sharpe, drawdown, score });
  });
  return rows;
}

export function formatFormulaAppliedTo(appliedTo: unknown): string {
  if (typeof appliedTo === "number" && Number.isFinite(appliedTo)) {
    return `${appliedTo} strategies`;
  }
  if (typeof appliedTo === "string") {
    const trimmed = appliedTo.trim();
    if (trimmed.length > 0 && !/undefined|null/i.test(trimmed)) {
      return trimmed;
    }
  }
  return "—";
}

export const RankingFormulaDetail = () => {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const { data: f, loading, isError, error } = useLiveDetail<RankingFormula>(
    id,
    (entityId) => bffV1.rankingFormulas.list().then((rows) => rows.find((x) => x.id === entityId)),
    { kinds: ["rankingFormulas"] },
  );
  const [audit, setAudit] = useState<AuditEvent[]>([]);

  useEffect(() => {
    if (!id) return;
    bffV1.audit.list().then((a) => setAudit(a.filter((x) => x.target === id || x.action?.startsWith("ranking.")))).catch(() => {});
  }, [id]);

  if (loading) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  if (!f) {
    return (
      <>
        <PageHeader title={t("nav.rankingFormulas", { defaultValue: "Ranking Policies" })} />
        <PageBody>
          <EmptyState
            icon={isError ? <AlertTriangle className="h-8 w-8 text-status-failed" /> : <Inbox className="h-8 w-8 text-muted-foreground" />}
            title={
              isError
                ? t("detail.loadState.errorTitle", { entity: "Ranking Policy", defaultValue: "Could Not Load Ranking Policy" })
                : t("rankingFormula.detail.notFoundTitle", { defaultValue: "Ranking Policy Not Found" })
            }
            description={
              isError
                ? t("detail.loadState.errorDescription", {
                  entity: "Ranking Policy",
                  id: id ?? "",
                  error: error ?? "unknown error",
                  defaultValue: `Failed to load Ranking Policy detail for ID ${id ?? ""}: ${error ?? "unknown error"}`,
                })
                : t("rankingFormula.detail.notFoundDescription", { id: id ?? "", defaultValue: `Ranking policy detail for ID ${id} is not available in the live contract.` })
            }
            cta={{ label: t("governanceDecisions.backToList", { defaultValue: "Back to Governance Decisions" }), onClick: () => nav("/management/governance-decisions?tab=policy") }}
          />
        </PageBody>
      </>
    );
  }

  const ranked = extractOwnerRankingRows(f);
  const rankingsCenterHref = canonicalCenterUrl("rankings", "rolling");
  const versions = [
    { v: "v3", at: f.updatedAt, by: f.owner || "—", note: "Current — activated" },
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
                  <Field label="Applied to" value={formatFormulaAppliedTo(f.appliedTo)} mono />
                  <Field label={t("table.state")} value={f.state || "—"} mono />
                  <Field label={t("table.owner")} value={f.owner || "—"} mono />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("ranking.expression")}</div>
                  <pre className="text-mono text-sm bg-muted p-3 rounded-md overflow-x-auto">{f.expression || "—"}</pre>
                </div>
              </Section>
            ),
          },
          {
            value: "preview",
            label: t("rankingDashboard.score"),
            content:
              ranked.length > 0 ? (
                <div data-testid="ranking-formula-owner-rows">
                  <DataTable
                    rows={ranked}
                    onRowClick={(r) => nav(`/management/strategies/${r.id}`)}
                    columns={[
                      { key: "rank", header: "#", cell: (r) => <span className="text-mono text-xs">{r.rank}</span> },
                      { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
                      { key: "sharpe", header: t("table.sharpe"), cell: (r) => <span className="text-mono text-xs">{typeof r.sharpe === "number" ? r.sharpe.toFixed(2) : "—"}</span> },
                      { key: "dd", header: t("table.drawdown"), cell: (r) => <span className="text-mono text-xs">{typeof r.drawdown === "number" ? `${(r.drawdown * 100).toFixed(2)}%` : "—"}</span> },
                      { key: "score", header: t("rankingDashboard.score"), cell: (r) => <span className="text-mono text-xs text-accent">{r.score.toFixed(3)}</span> },
                    ]}
                  />
                </div>
              ) : (
                <Section>
                  <div className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
                    <p>{t("governanceDecisions.recommendationsImpact.subtitle")}</p>
                    <Button size="sm" variant="outline" asChild>
                      <Link data-testid="ranking-formula-open-rankings-center" to={rankingsCenterHref}>
                        {t("nav.rankingsCenter")}
                      </Link>
                    </Button>
                  </div>
                </Section>
              ),
          },
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
