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
