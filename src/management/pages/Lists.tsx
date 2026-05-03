import { ObjectListPage } from "./ObjectListPage";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";

export const StrategiesList = () => {
  const t = useT();
  return (
    <ObjectListPage
      title={t("nav.strategies")}
      loader={() => bff.strategies.list()}
      basePath="/management/strategies"
      extraColumns={[
        { key: "alpha", header: "Alpha", cell: (r) => <span className="text-mono text-xs">{r.alpha}</span> },
        { key: "pnl", header: "PnL 30d", cell: (r) => <span className={`text-mono text-xs ${r.pnl30d >= 0 ? "text-status-success" : "text-status-failed"}`}>{(r.pnl30d * 100).toFixed(2)}%</span> },
        { key: "sharpe", header: "Sharpe", cell: (r) => <span className="text-mono text-xs">{r.sharpe.toFixed(2)}</span> },
      ]}
    />
  );
};

export const PersonasList = () => {
  const t = useT();
  return (
    <ObjectListPage
      title={t("nav.personas")}
      loader={() => bff.personas.list()}
      basePath="/management/personas"
      extraColumns={[
        { key: "arch", header: "Archetype", cell: (r) => r.archetype },
        { key: "rs", header: "Routed", cell: (r) => <span className="text-mono text-xs">{r.routedStrategies}</span> },
        { key: "sr", header: "Success", cell: (r) => <span className="text-mono text-xs">{(r.successRate * 100).toFixed(0)}%</span> },
      ]}
    />
  );
};

export const CapitalPoolsList = () => {
  const t = useT();
  return (
    <ObjectListPage
      title={t("nav.capitalPools")}
      loader={() => bff.capitalPools.list()}
      basePath="/management/capital-pools"
      extraColumns={[
        { key: "ccy", header: "CCY", cell: (r) => <span className="text-mono text-xs">{r.currency}</span> },
        { key: "alloc", header: "Allocated", cell: (r) => <span className="text-mono text-xs">{r.allocated.toLocaleString()}</span> },
        { key: "util", header: "Utilized", cell: (r) => <span className="text-mono text-xs">{r.utilized.toLocaleString()}</span> },
        { key: "rb", header: "Risk Budget", cell: (r) => <span className="text-mono text-xs">{(r.riskBudget * 100).toFixed(1)}%</span> },
      ]}
    />
  );
};

export const RankingFormulasList = () => {
  const t = useT();
  return (
    <ObjectListPage
      title={t("nav.rankingFormulas")}
      loader={() => bff.rankingFormulas.list()}
      basePath="/management/ranking-formulas"
      extraColumns={[
        { key: "expr", header: "Expression", cell: (r) => <code className="text-mono text-xs bg-muted px-1.5 py-0.5 rounded">{r.expression}</code> },
        { key: "applied", header: "Applied to", cell: (r) => <span className="text-mono text-xs">{r.appliedTo}</span> },
      ]}
    />
  );
};

export const RebalancesList = () => {
  const t = useT();
  return (
    <ObjectListPage
      title={t("nav.rebalances")}
      loader={() => bff.rebalances.list()}
      basePath="/management/rebalances"
      extraColumns={[
        { key: "q", header: "Quarter", cell: (r) => <span className="text-mono text-xs">{r.quarter}</span> },
        { key: "delta", header: "Delta", cell: (r) => <span className="text-mono text-xs">{(r.proposedDelta * 100).toFixed(1)}%</span> },
      ]}
    />
  );
};

export const DeploymentsList = () => {
  const t = useT();
  return (
    <ObjectListPage
      title={t("nav.deployments")}
      loader={() => bff.deployments.list()}
      basePath="/management/deployments"
      extraColumns={[
        { key: "tgt", header: "Target", cell: (r) => <span className="text-mono text-xs uppercase">{r.target}</span> },
        { key: "ver", header: "Version", cell: (r) => <span className="text-mono text-xs">{r.version}</span> },
      ]}
    />
  );
};

export const EvolutionList = () => {
  const t = useT();
  return (
    <ObjectListPage
      title={t("nav.evolution")}
      loader={() => bff.evolution.list()}
      basePath="/management/evolution"
      extraColumns={[
        { key: "gen", header: "Generation", cell: (r) => <span className="text-mono text-xs">G{r.generation}</span> },
        { key: "pop", header: "Population", cell: (r) => <span className="text-mono text-xs">{r.population}</span> },
        { key: "fit", header: "Best Fitness", cell: (r) => <span className="text-mono text-xs">{r.bestFitness.toFixed(2)}</span> },
        { key: "prog", header: "Progress", cell: (r) => <span className="text-mono text-xs">{(r.progress * 100).toFixed(0)}%</span> },
      ]}
    />
  );
};

export const ResearchList = () => {
  const t = useT();
  return (
    <ObjectListPage
      title={t("nav.research")}
      loader={() => bff.research.list()}
      basePath="/management/research"
      extraColumns={[
        { key: "status", header: "Status", cell: (r) => <span className="text-mono text-xs uppercase">{r.status}</span> },
        { key: "metric", header: "Metric", cell: (r) => <span className="text-mono text-xs">{r.metric}</span> },
        { key: "val", header: "Value", cell: (r) => <span className="text-mono text-xs">{r.metricValue.toFixed(2)}</span> },
      ]}
    />
  );
};

export const ArtifactsList = () => {
  const t = useT();
  return (
    <ObjectListPage
      title={t("nav.artifacts")}
      loader={() => bff.artifacts.list()}
      basePath="/management/artifacts"
      extraColumns={[
        { key: "kind", header: "Kind", cell: (r) => <span className="text-mono text-xs uppercase">{r.kind}</span> },
        { key: "ver", header: "Version", cell: (r) => <span className="text-mono text-xs">{r.version}</span> },
        { key: "size", header: "Size (MB)", cell: (r) => <span className="text-mono text-xs">{r.sizeMb.toLocaleString()}</span> },
        { key: "hash", header: "Hash", cell: (r) => <span className="text-mono text-xs text-muted-foreground">{r.hash}</span> },
      ]}
    />
  );
};
