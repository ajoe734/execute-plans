// Hooks & Cron Manager — Spec Part 3 §18.9.
// Schedule + event-trigger management for capabilities-driven workflows.
import { managementConsoleReads } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/platform/components/DataTable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/platform/hooks";
import { safeDateTime } from "@/lib/utils";

export const HookCronManagerPage = () => {
  const t = useT();
  const { data } = useV5Live(
    () => managementConsoleReads.hookRegistry(),
    [],
  );
  const crons = data?.crons ?? [];
  const hooks = data?.hooks ?? [];
  return (
    <>
      <PageHeader title={t("nav.hooks")} subtitle={t("hooks.subtitle")} actions={<Button size="sm">{t("hooks.create")}</Button>} />
      <PageBody>
        <Tabs defaultValue="cron">
          <TabsList>
            <TabsTrigger value="cron">{t("hooks.tab.cron")}</TabsTrigger>
            <TabsTrigger value="hooks">{t("hooks.tab.hooks")}</TabsTrigger>
          </TabsList>

          <TabsContent value="cron" className="mt-4">
            <Card>
              <DataTable rows={crons} columns={[
                { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
                { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
                { key: "sched", header: t("hooks.schedule"), cell: (r) => <code className="text-mono text-xs bg-muted px-1.5 py-0.5 rounded">{r.schedule}</code> },
                { key: "tgt", header: t("hooks.target"), cell: (r) => <span className="text-mono text-xs">{r.target}</span> },
                { key: "last", header: t("workflows.lastRun"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.lastRun)}</span> },
                { key: "next", header: t("hooks.nextRun"), cell: (r) => <span className="text-mono text-xs">{safeDateTime(r.nextRun)}</span> },
                { key: "en", header: t("hooks.enabled"), cell: (r) => <Switch defaultChecked={r.enabled} /> },
              ]} />
            </Card>
          </TabsContent>

          <TabsContent value="hooks" className="mt-4">
            <Card>
              <DataTable rows={hooks} columns={[
                { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
                { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
                { key: "ev", header: t("hooks.event"), cell: (r) => <Badge variant="outline" className="text-mono text-[10px]">{r.event}</Badge> },
                { key: "f", header: t("table.filters"), cell: (r) => <code className="text-mono text-xs bg-muted px-1.5 py-0.5 rounded">{r.filters}</code> },
                { key: "tgt", header: t("hooks.target"), cell: (r) => <span className="text-mono text-xs">{r.target}</span> },
                { key: "fired", header: t("hooks.firedToday"), cell: (r) => <span className="text-mono text-xs">{r.firedToday}</span> },
                { key: "en", header: t("hooks.enabled"), cell: (r) => <Switch defaultChecked={r.enabled} /> },
              ]} />
            </Card>
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
};
