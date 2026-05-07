import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { StatCard } from "@/platform/components/StatCard";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { legacyBff as bff } from "@/lib/bff-v1";
import type { Alert, ApprovalRequest, Job } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { useNavigate } from "react-router-dom";

export const ManagementOverview = () => {
  const t = useT();
  const navigate = useNavigate();
  const [data, setData] = useState<{ jobs: Job[]; alerts: Alert[]; approvals: ApprovalRequest[]; counts: { strategies: number; personas: number; pools: number; deployments: number } }>({ jobs: [], alerts: [], approvals: [], counts: { strategies: 0, personas: 0, pools: 0, deployments: 0 } });

  useEffect(() => {
    Promise.all([
      bff.jobs.list(), bff.alerts.list(), bff.approvals.list(),
      bff.strategies.list(), bff.personas.list(), bff.capitalPools.list(), bff.deployments.list(),
    ]).then(([jobs, alerts, approvals, s, p, c, d]) =>
      setData({ jobs, alerts, approvals, counts: { strategies: s.length, personas: p.length, pools: c.length, deployments: d.length } }),
    );
  }, []);

  return (
    <>
      <PageHeader title={t("nav.overview")} subtitle={t("app.management")} />
      <PageBody>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t("nav.strategies")} value={data.counts.strategies} />
          <StatCard label={t("nav.personas")} value={data.counts.personas} />
          <StatCard label={t("nav.capitalPools")} value={data.counts.pools} />
          <StatCard label={t("nav.deployments")} value={data.counts.deployments} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">{t("topbar.openAlerts")}</h2>
            <DataTable
              rows={data.alerts}
              onRowClick={() => navigate("/management/alerts")}
              columns={[
                { key: "sev", header: t("table.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
                { key: "title", header: t("table.title"), cell: (r) => r.title },
                { key: "src", header: t("table.source"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{r.source}</span> },
              ]}
            />
          </div>
          <div>
            <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">{t("topbar.pendingApprovals")}</h2>
            <DataTable
              rows={data.approvals}
              onRowClick={() => navigate("/management/approvals")}
              columns={[
                { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-mono text-xs">{r.kind}</span> },
                { key: "subject", header: t("table.subject"), cell: (r) => r.subject },
                { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.riskLevel} /> },
                { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
              ]}
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">{t("topbar.runningJobs")}</h2>
          <DataTable
            rows={data.jobs}
            onRowClick={() => navigate("/management/jobs")}
            columns={[
              { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
              { key: "kind", header: t("table.kind"), cell: (r) => r.kind },
              { key: "status", header: t("table.status"), cell: (r) => <StatusBadge state={r.status} /> },
              { key: "owner", header: t("table.owner"), cell: (r) => r.owner },
            ]}
          />
        </div>
      </PageBody>
    </>
  );
};
