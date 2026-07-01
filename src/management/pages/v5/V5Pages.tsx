// Pack E E1 — lightweight v5 closed-loop surfaces.
// The full Sentinel / HIQ implementations live in their dedicated modules. Control
// Room remains here as a legacy release-gate read surface for /bff/v5/control-room.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { StatCard } from "@/platform/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataGridScrollArea } from "@/platform/components/DataGridFrame";
import { v5 } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import type { ControlRoomSummary, LoopRun } from "@/lib/v5";
import type { LoopKind } from "@/lib/v5/enums";

function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [v, setV] = useState<T>();
  useEffect(() => {
    let alive = true;
    load().then((r) => alive && setV(r));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return v;
}

// ---------- Control Room ----------

export const ControlRoomPage = () => {
  const t = useT();
  const summary = useAsync<ControlRoomSummary>(() => v5.controlRoom.get());
  return (
    <>
      <PageHeader title={t("nav.controlRoom")} subtitle={t("v5.controlRoom.subtitle")} />
      <PageBody>
        {!summary ? (
          <div className="text-sm text-muted-foreground">{t("ui.loading") ?? "…"}</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label={t("v5.kpi.loopsRunning")} value={summary.kpi.loopsRunning} />
              <StatCard label={t("v5.kpi.loopsBlocked")} value={summary.kpi.loopsBlocked} />
              <StatCard label={t("v5.kpi.openFindings")} value={summary.kpi.openFindings} />
              <StatCard label={t("v5.kpi.pendingInterventions")} value={summary.kpi.pendingInterventions} />
            </div>
            <Card className="p-4 mt-4">
              <div className="text-sm font-semibold mb-2">{t("v5.controlRoom.topLoops")}</div>
              <ul className="text-sm space-y-1">
                {summary.loopRuns.slice(0, 6).map((run) => (
                  <li key={run.id} className="flex items-center justify-between gap-3">
                    <Link to="/management/loops" className="hover:underline">
                      {run.subjectName ?? run.id}
                    </Link>
                    <Badge variant="outline">{run.loopKind} · {run.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
            <div className="text-xs text-muted-foreground mt-3">
              {t("v5.transitional.controlRoom")} · tenant=<code>{summary.session.tenantId}</code>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
};

// ---------- Loops ----------

export const LoopsPage = () => {
  const t = useT();
  const params = useParams<{ kind?: LoopKind }>();
  const kind = params.kind;
  const data = useAsync(() => v5.loops.list(kind), [kind]);
  return (
    <>
      <PageHeader
        title={kind ? t(`v5.loops.${kind}.title`) : t("nav.loops")}
        subtitle={t("v5.loops.subtitle")}
      />
      <PageBody>
        {!data ? (
          <div className="text-sm text-muted-foreground">…</div>
        ) : (
          <Card className="p-0 overflow-hidden">
            <DataGridScrollArea minWidth={900} ariaLabel={kind ? t(`v5.loops.${kind}.title`) : t("nav.loops")}>
            <table className="text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2">{t("v5.col.subject")}</th>
                  <th className="text-left px-3 py-2">{t("v5.col.kind")}</th>
                  <th className="text-left px-3 py-2">{t("v5.col.status")}</th>
                  <th className="text-left px-3 py-2">{t("v5.col.next")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r: LoopRun) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.subjectName ?? r.id}</td>
                    <td className="px-3 py-2"><Badge variant="outline">{r.loopKind}</Badge></td>
                    <td className="px-3 py-2"><Badge>{r.status}</Badge></td>
                    <td className="px-3 py-2 text-muted-foreground">{r.nextAction?.label ?? r.nextAction?.kind ?? "—"}</td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">{t("v5.empty")}</td></tr>
                )}
              </tbody>
            </table>
            </DataGridScrollArea>
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t("v5.col.total")}: {data.totalCount} · exact={String(data.totalCountExact)}
            </div>
          </Card>
        )}
      </PageBody>
    </>
  );
};
