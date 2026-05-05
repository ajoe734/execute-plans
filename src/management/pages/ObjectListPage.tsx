// Generic object list page generator for the Management Console
import { useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { DataTable, type Column } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw } from "lucide-react";
import { useT } from "@/platform/hooks";
import type { BaseObject } from "@/lib/bff/types";
import { useLiveList } from "@/lib/useLiveList";

interface Props<T extends BaseObject> {
  title: string;
  loader: () => Promise<T[]>;
  basePath: string;
  extraColumns?: Column<T>[];
  /** Realtime data:{kind} events that should refresh this list. */
  liveKinds?: string[];
}

export function ObjectListPage<T extends BaseObject>({ title, loader, basePath, extraColumns = [], liveKinds = [] }: Props<T>) {
  const t = useT();
  const navigate = useNavigate();
  const { rows, pending, refresh } = useLiveList<T>(loader, liveKinds, { auto: false });

  const columns: Column<T>[] = [
    { key: "name", header: "Name", cell: (r) => <div className="font-medium">{r.name}</div> },
    { key: "state", header: t("common.state"), cell: (r) => <StatusBadge state={r.state} /> },
    { key: "risk", header: "Risk", cell: (r) => <RiskBadge level={r.risk} /> },
    ...extraColumns,
    { key: "owner", header: t("common.owner"), cell: (r) => <span className="text-mono text-xs">{r.owner}</span> },
    { key: "updated", header: t("common.updated"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.updatedAt).toLocaleString()}</span> },
  ];

  return (
    <>
      <PageHeader
        title={title}
        actions={<Button size="sm"><Plus className="h-4 w-4 mr-1" />{t("actions.create")}</Button>}
      />
      <PageBody>
        {pending > 0 && (
          <button
            onClick={refresh}
            className="mb-3 w-full flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/15 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("realtime.newUpdates", { count: pending, defaultValue: `${pending} new update(s) — click to refresh` })}
          </button>
        )}
        <DataTable rows={rows} columns={columns} onRowClick={(r) => navigate(`${basePath}/${r.id}`)} />
      </PageBody>
    </>
  );
}
