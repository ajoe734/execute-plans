// Generic object list page generator for the Management Console
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { DataTable, type Column } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useT } from "@/platform/hooks";
import type { BaseObject } from "@/lib/bff/types";

interface Props<T extends BaseObject> {
  title: string;
  loader: () => Promise<T[]>;
  basePath: string;
  extraColumns?: Column<T>[];
}

export function ObjectListPage<T extends BaseObject>({ title, loader, basePath, extraColumns = [] }: Props<T>) {
  const t = useT();
  const navigate = useNavigate();
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => { loader().then(setRows); }, [loader]);

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
        <DataTable rows={rows} columns={columns} onRowClick={(r) => navigate(`${basePath}/${r.id}`)} />
      </PageBody>
    </>
  );
}
