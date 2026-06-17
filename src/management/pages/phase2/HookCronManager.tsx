// Hooks & Cron Manager — Spec Part 3 §18.9.
// Schedule + event-trigger management for capabilities-driven workflows.
import { paths, withLiveOrMock } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/platform/components/DataTable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/platform/hooks";

interface Cron { id: string; name: string; schedule: string; target: string; enabled: boolean; lastRun: string; nextRun: string; }
interface Hook { id: string; name: string; event: string; target: string; filters: string; enabled: boolean; firedToday: number; }

const CRONS: Cron[] = [
  { id: "cron_daily_brief", name: "Daily brief generator", schedule: "0 7 * * *", target: "wf_persona_retrain", enabled: true, lastRun: "2026-05-03T07:00:00Z", nextRun: "2026-05-04T07:00:00Z" },
  { id: "cron_eod_snapshot", name: "EOD risk snapshot", schedule: "5 0 * * *", target: "skill.risk_snapshot", enabled: true, lastRun: "2026-05-03T00:05:00Z", nextRun: "2026-05-04T00:05:00Z" },
  { id: "cron_quart_freeze", name: "Quarterly metric freeze", schedule: "0 0 1 1,4,7,10 *", target: "wf_quart_rebal", enabled: true, lastRun: "2026-04-01T00:00:00Z", nextRun: "2026-07-01T00:00:00Z" },
];

const HOOKS: Hook[] = [
  { id: "hk_alert_high", name: "High-sev alert auto-incident", event: "alert.opened", target: "wf_incident_drill", filters: "severity in [high,critical]", enabled: true, firedToday: 2 },
  { id: "hk_strat_degraded", name: "Strategy degraded → trainer", event: "strategy.state_changed", target: "wf_persona_retrain", filters: "to=degraded", enabled: true, firedToday: 1 },
  { id: "hk_committee_memo", name: "Committee memo → governance", event: "committee.memo_ready", target: "approval.create", filters: "*", enabled: false, firedToday: 0 },
];

export const HookCronManagerPage = () => {
  const t = useT();
  // Live-wire GET /bff/hooks; fall back to seeds until the registry has data.
  const { data } = useV5Live(
    () => withLiveOrMock<{ crons: Cron[]; hooks: Hook[] }>(
      { method: "GET", path: paths.hookRegistry() },
      async () => ({ crons: CRONS, hooks: HOOKS }),
      (resp: { data?: { crons?: Cron[]; hooks?: Hook[] }; crons?: Cron[]; hooks?: Hook[] }) => ({
        crons: resp?.data?.crons?.length ? resp.data.crons : resp?.crons?.length ? resp.crons : CRONS,
        hooks: resp?.data?.hooks?.length ? resp.data.hooks : resp?.hooks?.length ? resp.hooks : HOOKS,
      }),
    ),
    [],
  );
  const crons = data?.crons ?? CRONS;
  const hooks = data?.hooks ?? HOOKS;
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
