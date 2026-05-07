import { ObjectListPage } from "./ObjectListPage";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";

export const StrategiesList = () => {
  const t = useT();
  return (
    <ObjectListPage
      title={t("nav.strategies")}
      loader={() => bff.strategies.list()}
      basePath="/management/strategies" liveKinds={["Strategy"]}
      createBehavior={{ kind: "drawer", entity: "strategy" }}
      extraColumns={[
        { key: "alpha", header: "Alpha", cell: (r) => <span className="text-mono text-xs">{r.alpha}</span> },
        { key: "pnl", header: "PnL 30d", cell: (r) => <span className={`text-mono text-xs ${r.pnl30d >= 0 ? "text-status-success" : "text-status-failed"}`}>{(r.pnl30d * 100).toFixed(2)}%</span> },
        { key: "sharpe", header: t("table.sharpe"), cell: (r) => <span className="text-mono text-xs">{r.sharpe.toFixed(2)}</span> },
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
      basePath="/management/personas" liveKinds={["Persona"]}
      createBehavior={{ kind: "drawer", entity: "persona" }}
      extraColumns={[
        { key: "arch", header: t("table.type"), cell: (r) => r.archetype },
        { key: "rs", header: t("nav.strategies"), cell: (r) => <span className="text-mono text-xs">{r.routedStrategies}</span> },
        { key: "sr", header: t("table.winRate"), cell: (r) => <span className="text-mono text-xs">{(r.successRate * 100).toFixed(0)}%</span> },
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
      basePath="/management/capital-pools" liveKinds={["CapitalPool","AllocationLimit","PoolFreeze"]}
      createBehavior={{ kind: "drawer", entity: "capitalPool" }}
      extraColumns={[
        { key: "ccy", header: t("table.value"), cell: (r) => <span className="text-mono text-xs">{r.currency}</span> },
        { key: "alloc", header: t("section.holdings"), cell: (r) => <span className="text-mono text-xs">{r.allocated.toLocaleString()}</span> },
        { key: "util", header: t("table.utilization"), cell: (r) => <span className="text-mono text-xs">{r.utilized.toLocaleString()}</span> },
        { key: "rb", header: t("section.limits"), cell: (r) => <span className="text-mono text-xs">{(r.riskBudget * 100).toFixed(1)}%</span> },
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
      basePath="/management/ranking-formulas" liveKinds={["RankingFormula"]}
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
    <ObjectListPage
      title={t("nav.rebalances")}
      loader={() => bff.rebalances.list()}
      basePath="/management/rebalances" liveKinds={["Rebalance","RebalanceOverride","MetricFreeze"]}
      createBehavior={{ kind: "redirect", to: "/management/loops/optimization", intent: "create" }}
      extraColumns={[
        { key: "q", header: t("table.priority"), cell: (r) => <span className="text-mono text-xs">{r.quarter}</span> },
        { key: "delta", header: t("section.changeSummary"), cell: (r) => <span className="text-mono text-xs">{(r.proposedDelta * 100).toFixed(1)}%</span> },
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
    <ObjectListPage
      title={t("nav.evolution")}
      loader={() => bff.evolution.list()}
      basePath="/management/evolution" liveKinds={["Evolution","Promotion"]}
      createBehavior={{ kind: "drawer", entity: "evolutionProgram" }}
      extraColumns={[
        { key: "gen", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">G{r.generation}</span> },
        { key: "pop", header: t("section.members"), cell: (r) => <span className="text-mono text-xs">{r.population}</span> },
        { key: "fit", header: t("section.performance"), cell: (r) => <span className="text-mono text-xs">{r.bestFitness.toFixed(2)}</span> },
        { key: "prog", header: t("table.progress"), cell: (r) => <span className="text-mono text-xs">{(r.progress * 100).toFixed(0)}%</span> },
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
      basePath="/management/research" liveKinds={["Research"]}
      createBehavior={{ kind: "drawer", entity: "researchExperiment" }}
      extraColumns={[
        { key: "status", header: t("table.status"), cell: (r) => <span className="text-mono text-xs uppercase">{r.status}</span> },
        { key: "metric", header: t("table.metric"), cell: (r) => <span className="text-mono text-xs">{r.metric}</span> },
        { key: "val", header: t("table.value"), cell: (r) => <span className="text-mono text-xs">{r.metricValue.toFixed(2)}</span> },
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
      basePath="/management/artifacts" liveKinds={["Artifact"]}
      createBehavior={{ kind: "drawer", entity: "artifact" }}
      extraColumns={[
        { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-mono text-xs uppercase">{r.kind}</span> },
        { key: "ver", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">{r.version}</span> },
        { key: "size", header: "Size (MB)", cell: (r) => <span className="text-mono text-xs">{r.sizeMb.toLocaleString()}</span> },
        { key: "hash", header: "Hash", cell: (r) => <span className="text-mono text-xs text-muted-foreground">{r.hash}</span> },
      ]}
    />
  );
};
