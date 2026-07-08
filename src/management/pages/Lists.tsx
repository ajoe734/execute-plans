import { ObjectListPage } from "./ObjectListPage";
import { lists } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import type { Strategy, Persona, CapitalPool, RankingFormula, Rebalance, Deployment, EvolutionProgram, ResearchExperiment, Artifact } from "@/lib/bff/types";
import { capitalPoolsWithFleetFallback, capitalPoolMatchesFocus, type FleetCapitalPool } from "./capitalPoolsFleetFallback";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/platform/components/StatCard";

// Defensive numeric formatters — live BFF rows can omit numeric fields; never crash a cell.
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const fix = (v: unknown, d = 2): string => num(v).toFixed(d);
const pct = (v: unknown, d = 0): string => `${(num(v) * 100).toFixed(d)}%`;
const loc = (v: unknown): string => num(v).toLocaleString();
const hasNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const locOrMissing = (v: unknown): string => hasNumber(v) ? v.toLocaleString() : "unconfigured";
const pctOrMissing = (v: unknown, d = 0): string => hasNumber(v) ? `${(v * 100).toFixed(d)}%` : "unconfigured";

function capitalScopeLabel(value: unknown): string {
  const scope = String(value ?? "").trim().toLowerCase();
  if (scope === "paper" || scope === "paper_ledger") return "paper";
  if (scope === "canary") return "canary";
  if (scope === "live") return "live";
  return "capital";
}

function capitalScopeClass(scope: string): string {
  if (scope === "live") return "border-status-failed/40 text-status-failed";
  if (scope === "canary") return "border-status-warning/40 text-status-warning";
  if (scope === "paper") return "border-status-success/40 text-status-success";
  return "border-muted text-muted-foreground";
}

function personaCountLabel(count?: number): string {
  if (!count) return "Unbound";
  return `${count} persona${count === 1 ? "" : "s"}`;
}

function CapitalPoolNameCell(row: FleetCapitalPool) {
  const scope = capitalScopeLabel(row.capitalScope);
  const summary = row.bindingSummary ?? (row.personaCount ? row.personaNames : "Unbound");
  return (
    <div className="min-w-0">
      <div className="font-medium text-foreground">{row.name}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={capitalScopeClass(scope)}>{scope}</Badge>
        <span className="text-xs font-medium text-foreground">{personaCountLabel(row.personaCount)}</span>
        {summary && (
          <span className="max-w-[360px] truncate text-xs text-muted-foreground" title={row.personaNames || summary}>
            {summary}
          </span>
        )}
      </div>
      {row.bindingDetail && (
        <div className="mt-1 max-w-[520px] truncate font-mono text-xs text-muted-foreground" title={row.bindingDetail}>
          {row.bindingDetail}
        </div>
      )}
    </div>
  );
}

const currencyBreakdown = (rows: CapitalPool[], pick: (row: CapitalPool) => number, mixedLabel: string) => {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency || "USD";
    totals.set(currency, (totals.get(currency) ?? 0) + pick(row));
  }
  const parts = Array.from(totals.entries()).map(([currency, value]) => `${currency} ${loc(value)}`);
  return {
    headline: parts.length === 1 ? parts[0] : mixedLabel,
    hint: parts.length > 1 ? parts.join(" · ") : undefined,
  };
};

export const StrategiesList = () => {
  const t = useT();
  return (
    <ObjectListPage<Strategy>
      title={t("nav.strategies")}
      loader={lists.strategies}
      basePath="/management/strategies" liveKinds={["Strategy"]}
      createBehavior={{ kind: "drawer", entity: "strategy" }}
      extraColumns={[
        { key: "alpha", header: "Alpha", cell: (r) => <span className="text-mono text-xs">{r.alpha}</span> },
        { key: "pnl", header: "PnL 30d", cell: (r) => <span className={`text-mono text-xs ${num(r.pnl30d) >= 0 ? "text-status-success" : "text-status-failed"}`}>{pct(r.pnl30d, 2)}</span> },
        { key: "sharpe", header: t("table.sharpe"), cell: (r) => <span className="text-mono text-xs">{fix(r.sharpe)}</span> },
      ]}
    />
  );
};

export const PersonasList = () => {
  const t = useT();
  return (
    <ObjectListPage<Persona>
      title={t("nav.personas")}
      loader={lists.personas}
      basePath="/management/personas" liveKinds={["Persona"]}
      createBehavior={{ kind: "drawer", entity: "persona" }}
      extraColumns={[
        { key: "arch", header: t("table.type"), cell: (r) => r.archetype },
        { key: "rs", header: t("nav.strategies"), cell: (r) => <span className="text-mono text-xs">{r.routedStrategies}</span> },
        { key: "sr", header: t("table.winRate"), cell: (r) => <span className="text-mono text-xs">{pct(r.successRate)}</span> },
      ]}
    />
  );
};

export const CapitalPoolsList = () => {
  const t = useT();
  return (
    <ObjectListPage<FleetCapitalPool>
      title={t("nav.capitalPools")}
      loader={capitalPoolsWithFleetFallback}
      basePath="/management/capital" liveKinds={["CapitalPool","AllocationLimit","PoolFreeze"]}
      listHref="/management/promotion-allocation?tab=quarterly-capital"
      rowHref={(row) => `/management/promotion-allocation?tab=quarterly-capital&capital_id=${encodeURIComponent(row.id)}`}
      nameCell={CapitalPoolNameCell}
      focusParam="pool"
      focusLabel={t("nav.capitalPools")}
      focusMatch={capitalPoolMatchesFocus}
      createBehavior={{ kind: "drawer", entity: "capitalPool" }}
      summary={(rows) => {
        const mixedCurrencyLabel = t("phase13.capital.summary.currencies", { count: new Set(rows.map((row) => row.currency || "USD")).size });
        const allocated = currencyBreakdown(rows, (row) => num(row.allocated), mixedCurrencyLabel);
        const utilized = currencyBreakdown(rows, (row) => num(row.utilized), mixedCurrencyLabel);
        const totalAllocated = rows.reduce((sum, row) => sum + num(row.allocated), 0);
        const totalUtilized = rows.reduce((sum, row) => sum + num(row.utilized), 0);
        const utilization = totalAllocated > 0 ? totalUtilized / totalAllocated : 0;
        const weightedRiskBudget = totalAllocated > 0
          ? rows.reduce((sum, row) => sum + num(row.allocated) * num(row.riskBudget), 0) / totalAllocated
          : 0;
        const activePools = rows.filter((row) => row.state === "deployed" || row.state === "approved").length;
        const bindingCount = rows.reduce((sum, row) => sum + num(row.bindingCount ?? row.personaCount), 0);
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t("phase13.capital.summary.pools")}
              value={rows.length}
              hint={t("phase13.capital.summary.active", { count: activePools })}
            />
            <StatCard
              label={t("phase13.capital.summary.allocated")}
              value={allocated.headline}
              hint={allocated.hint}
            />
            <StatCard
              label={t("phase13.capital.summary.utilized")}
              value={utilized.headline}
              hint={t("phase13.capital.summary.utilization", { pct: (utilization * 100).toFixed(1) })}
              tone={utilization >= 0.9 ? "danger" : utilization >= 0.75 ? "warning" : "default"}
            />
            <StatCard
              label={t("phase13.capital.summary.riskBudget")}
              value={`${(weightedRiskBudget * 100).toFixed(2)}%`}
              hint={t("phase13.capital.summary.bindings", { count: bindingCount })}
              tone={weightedRiskBudget >= 0.08 ? "danger" : weightedRiskBudget >= 0.06 ? "warning" : "default"}
            />
          </div>
        );
      }}
      extraColumns={[
        {
          key: "summary",
          header: t("table.summary", { defaultValue: "Summary" }),
          cell: (r) => {
            const utilization = hasNumber(r.allocated) && r.allocated > 0 && hasNumber(r.utilized)
              ? r.utilized / r.allocated
              : undefined;
            return (
              <div className="max-w-[26rem] text-xs text-muted-foreground">
                <span className="text-foreground">{r.currency ?? "unconfigured"} {locOrMissing(r.allocated)}</span>
                {hasNumber(utilization) && (
                  <span> · {t("phase13.capital.summary.utilization", { pct: (utilization * 100).toFixed(1) })}</span>
                )}
                {r.riskPolicyRef && <span> · {r.riskPolicyRef}</span>}
                {r.bindingSummary && <span> · {r.bindingSummary}</span>}
              </div>
            );
          },
        },
        { key: "ccy", header: t("table.value"), cell: (r) => <span className="text-mono text-xs">{r.currency ?? "unconfigured"}</span> },
        { key: "alloc", header: t("section.holdings"), cell: (r) => <span className="text-mono text-xs">{locOrMissing(r.allocated)}</span> },
        { key: "util", header: t("table.utilization"), cell: (r) => <span className="text-mono text-xs">{locOrMissing(r.utilized)}</span> },
        { key: "rb", header: t("section.limits"), cell: (r) => <span className="text-mono text-xs">{pctOrMissing(r.riskBudget, 1)}</span> },
        { key: "personas", header: t("nav.personas"), cell: (r) => (
          <span className="text-mono text-xs" title={r.personaNames}>
            {personaCountLabel(r.personaCount)}
          </span>
        ) },
      ]}
    />
  );
};

export const RankingFormulasList = () => {
  const t = useT();
  return (
    <ObjectListPage<RankingFormula>
      title={t("nav.rankingFormulas")}
      loader={lists.rankingFormulas}
      basePath="/management/ranking/formulas" liveKinds={["RankingFormula"]}
      listHref="/management/promotion-allocation?tab=formula-policy"
      rowHref={(row) => `/management/promotion-allocation?tab=formula-policy&formula_id=${encodeURIComponent(row.id)}`}
      createBehavior={{ kind: "redirect", to: "/management/studios/formula", intent: "create" }}
      extraColumns={[
        { key: "expr", header: t("section.parameters"), cell: (r) => <code className="text-mono text-xs bg-muted px-1.5 py-0.5 rounded">{r.expression}</code> },
        { key: "applied", header: t("section.relatedObjects"), cell: (r) => <span className="text-mono text-xs">{r.appliedTo}</span> },
      ]}
    />
  );
};

export const RebalancesList = () => {
  const t = useT();
  return (
    <ObjectListPage<Rebalance>
      title={t("nav.rebalances")}
      loader={lists.rebalances}
      basePath="/management/rebalance" liveKinds={["Rebalance","RebalanceOverride","MetricFreeze"]}
      listHref="/management/promotion-allocation?tab=quarterly-capital"
      rowHref={(row) => `/management/promotion-allocation?tab=quarterly-capital&rebalance_id=${encodeURIComponent(row.id)}`}
      createBehavior={{ kind: "redirect", to: "/management/loops/optimization", intent: "create" }}
      extraColumns={[
        { key: "q", header: t("table.priority"), cell: (r) => <span className="text-mono text-xs">{r.quarter}</span> },
        { key: "delta", header: t("section.changeSummary"), cell: (r) => <span className="text-mono text-xs">{pct(r.proposedDelta, 1)}</span> },
      ]}
    />
  );
};

export const DeploymentsList = () => {
  const t = useT();
  return (
    <ObjectListPage<Deployment>
      title={t("nav.deployments")}
      loader={lists.deployments}
      basePath="/management/deployments" liveKinds={["Deployment","DeploymentStage"]}
      createBehavior={{ kind: "drawer", entity: "deployment" }}
      extraColumns={[
        { key: "tgt", header: t("table.target"), cell: (r) => <span className="text-mono text-xs uppercase">{r.target}</span> },
        { key: "ver", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">{r.version}</span> },
      ]}
    />
  );
};

export const EvolutionList = () => {
  const t = useT();
  return (
    <ObjectListPage<EvolutionProgram>
      title={t("nav.evolution")}
      loader={lists.evolution}
      basePath="/management/evolution" liveKinds={["Evolution","Promotion"]}
      createBehavior={{ kind: "drawer", entity: "evolutionProgram" }}
      extraColumns={[
        { key: "gen", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">G{r.generation}</span> },
        { key: "pop", header: t("section.members"), cell: (r) => <span className="text-mono text-xs">{r.population}</span> },
        { key: "fit", header: t("section.performance"), cell: (r) => <span className="text-mono text-xs">{fix(r.bestFitness)}</span> },
        { key: "prog", header: t("table.progress"), cell: (r) => <span className="text-mono text-xs">{pct(r.progress)}</span> },
      ]}
    />
  );
};

export const ResearchList = () => {
  const t = useT();
  return (
    <ObjectListPage<ResearchExperiment>
      title={t("nav.research")}
      loader={lists.research}
      basePath="/management/experiments" liveKinds={["Research"]}
      createBehavior={{ kind: "drawer", entity: "researchExperiment" }}
      extraColumns={[
        { key: "status", header: t("table.status"), cell: (r) => <span className="text-mono text-xs uppercase">{r.status}</span> },
        { key: "metric", header: t("table.metric"), cell: (r) => <span className="text-mono text-xs">{r.metric}</span> },
        { key: "val", header: t("table.value"), cell: (r) => <span className="text-mono text-xs">{fix(r.metricValue)}</span> },
      ]}
    />
  );
};

export const ArtifactsList = () => {
  const t = useT();
  return (
    <ObjectListPage<Artifact>
      title={t("nav.artifacts")}
      loader={lists.artifacts}
      basePath="/management/artifacts" liveKinds={["Artifact"]}
      createBehavior={{ kind: "drawer", entity: "artifact" }}
      extraColumns={[
        { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-mono text-xs uppercase">{r.kind}</span> },
        { key: "ver", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">{r.version}</span> },
        { key: "size", header: "Size (MB)", cell: (r) => <span className="text-mono text-xs">{loc(r.sizeMb)}</span> },
        { key: "hash", header: "Hash", cell: (r) => <span className="text-mono text-xs text-muted-foreground">{r.hash}</span> },
      ]}
    />
  );
};
