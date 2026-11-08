import { useEffect, useState, type ReactNode } from "react";
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

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const hasText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Readable label for a known code; unknown codes fall back to the raw code. */
export function formulaCodeLabel(t: Translate, group: string, code: string): string {
  return t(`rankingFormula.${group}.${code}`, { defaultValue: code });
}

export function formulaVersion(f: RankingFormula): string | undefined {
  return [f.version, f.formula_version].find(hasText);
}

export interface FormulaComponentRow { key: string; label: string; weight?: number }

/** Components from the payload; falls back to the weights map. Empty when neither is present. */
export function formulaComponents(f: RankingFormula): FormulaComponentRow[] {
  const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (Array.isArray(f.components) && f.components.length > 0) {
    return f.components
      .filter((c) => c && hasText(c.key))
      .map((c) => ({
        key: c.key,
        label: hasText(c.label) ? c.label : c.key,
        weight: isNum(c.weight) ? c.weight : isNum(f.weights?.[c.key]) ? f.weights?.[c.key] : undefined,
      }));
  }
  if (f.weights && typeof f.weights === "object") {
    return Object.entries(f.weights)
      .filter(([, w]) => isNum(w))
      .map(([key, weight]) => ({ key, label: key, weight }));
  }
  return [];
}

export const formatWeightPercent = (w: number): string => `${Number((w * 100).toFixed(2))}%`;

/** One-line weight summary, e.g. "PnL 35% · Risk 25%"; undefined when the payload has no weights. */
export function formulaWeightSummary(f: RankingFormula): string | undefined {
  const rows = formulaComponents(f).filter((r) => typeof r.weight === "number");
  if (rows.length === 0) return undefined;
  return rows.map((r) => `${r.label} ${formatWeightPercent(r.weight as number)}`).join(" · ");
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
  const noData = t("rankingFormula.noData");
  const versions = (Array.isArray(f.version_history) ? f.version_history : []).map((h, index) => ({
    id: h.id || `${h.version ?? h.formula_version ?? "version"}-${index}`,
    v: h.version || h.formula_version || "",
    at: h.effective_at,
    changeType: h.change_type,
    note: h.description,
    refs: h.governance_evidence_refs ?? [],
  }));
  const version = formulaVersion(f);
  const components = formulaComponents(f);
  const cc = f.change_control;
  const evidenceRefs = Array.from(new Set([...(f.governance_evidence_refs ?? []), ...(cc?.governance_evidence_refs ?? [])]));
  const cell = (v: ReactNode) => v ?? <span className="text-muted-foreground">{noData}</span>;

  return (
    <>
      <ObjectDetailLayout
        object={f}
        subtitle={f.id}
        headerOmit={{ state: !hasText(f.state), risk: !hasText(f.risk), owner: !hasText(f.owner), updated: !hasText(f.updatedAt) }}
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
                  <Field label={t("rankingFormula.version")} value={cell(version)} mono />
                  <Field label={t("rankingFormula.scoreField")} value={cell(hasText(f.score_field) ? f.score_field : undefined)} mono />
                  <Field label={t("rankingFormula.basis")} value={cell(hasText(f.basis) ? formulaCodeLabel(t, "basisLabels", f.basis) : undefined)} />
                  <Field label={t("rankingFormula.policy")} value={cell(hasText(f.policy) ? formulaCodeLabel(t, "policyLabels", f.policy) : undefined)} />
                  {formatFormulaAppliedTo(f.appliedTo) !== "—" && <Field label="Applied to" value={formatFormulaAppliedTo(f.appliedTo)} mono />}
                  {hasText(f.state) && <Field label={t("table.state")} value={f.state} mono />}
                  {hasText(f.owner) && <Field label={t("table.owner")} value={f.owner} mono />}
                </div>
                <div data-testid="ranking-formula-components">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("rankingFormula.components")}</div>
                  {components.length > 0 ? (
                    <ul className="text-sm space-y-1">
                      {components.map((comp) => (
                        <li key={comp.key} className="flex gap-3" data-testid={`ranking-formula-component-${comp.key}`}>
                          <span className="min-w-[8rem]">{comp.label}</span>
                          <span className="text-mono">{typeof comp.weight === "number" ? formatWeightPercent(comp.weight) : noData}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{noData}</p>
                  )}
                </div>
                {cc && (
                  <div data-testid="ranking-formula-change-control" className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <Field label={t("rankingFormula.versionPolicy")} value={cell(hasText(cc.version_policy) ? formulaCodeLabel(t, "versionPolicyLabels", cc.version_policy) : undefined)} />
                    <Field label={t("rankingFormula.requiresEvidence")} value={typeof cc.requires_governance_evidence === "boolean" ? t(cc.requires_governance_evidence ? "rankingFormula.yes" : "rankingFormula.no") : cell(undefined)} />
                    <Field label={t("rankingFormula.authority")} value={cell(hasText(cc.authority) ? formulaCodeLabel(t, "policyLabels", cc.authority) : undefined)} />
                  </div>
                )}
                {evidenceRefs.length > 0 && (
                  <div data-testid="ranking-formula-evidence-refs">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("rankingFormula.evidenceRefs")}</div>
                    <ul className="text-sm text-mono space-y-0.5">
                      {evidenceRefs.map((ref) => <li key={ref}>{ref}</li>)}
                    </ul>
                  </div>
                )}
                {hasText(f.expression) && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("ranking.expression")}</div>
                    <pre className="text-mono text-sm bg-muted p-3 rounded-md overflow-x-auto">{f.expression}</pre>
                  </div>
                )}
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
          { value: "history", label: t("section.history"), content: versions.length === 0 ? (
            <Section><p className="text-sm text-muted-foreground">{noData}</p></Section>
          ) : (
            <DataTable rows={versions} columns={[
              { key: "v", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">{r.v || noData}</span> },
              { key: "at", header: t("rankingFormula.effectiveAt"), cell: (r) => <span className="text-mono text-xs">{r.at ? safeDateTime(r.at) : noData}</span> },
              { key: "type", header: t("rankingFormula.changeType"), cell: (r) => <span className="text-xs">{r.changeType ? formulaCodeLabel(t, "changeTypeLabels", r.changeType) : noData}</span> },
              { key: "note", header: t("table.description"), cell: (r) => <span className="text-xs text-muted-foreground">{r.note || noData}</span> },
              { key: "refs", header: t("rankingFormula.evidenceRefs"), cell: (r) => <span className="text-mono text-xs">{r.refs.length > 0 ? r.refs.join(", ") : noData}</span> },
            ]} />
          ) },
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
        ]}
      />
    </>
  );
};
