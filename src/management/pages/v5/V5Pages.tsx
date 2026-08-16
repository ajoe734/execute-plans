// Pack E E1 — lightweight v5 closed-loop surfaces.
// The full Sentinel / HIQ implementations live in their dedicated modules. Control
// Room remains here as a legacy release-gate read surface for /bff/v5/control-room.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { StatCard } from "@/platform/components/StatCard";
import { Card } from "@/components/ui/card";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { Badge } from "@/components/ui/badge";
import { v5, bffFetch, paths } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import type { ControlRoomSummary, LoopRun } from "@/lib/v5";
import type { LoopKind } from "@/lib/v5/enums";
import { useV5Live } from "./useV5Live";
import { LoopTruthView } from "@/components/management/LoopTruthView";
import type { LoopHealthListEnvelope, LoopHealthEntryDTO } from "@/lib/bff-v1/loopTruthTypes";

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

// ---------- Loops ----------

export const LoopsPage = () => {
  const t = useT();
  const params = useParams<{ kind?: LoopKind }>();
  const kind = params.kind;
  const [activeTab, setActiveTab] = useState<"truth" | "runs">("truth");
  const data = useAsync(() => v5.loops.list(kind), [kind]);

  const loopHealthData = useV5Live<LoopHealthEntryDTO[]>(async () => {
    const res = await bffFetch<LoopHealthListEnvelope>({
      method: "GET",
      path: paths.loopHealthList(),
    });
    const items = res?.data || res?.items;
    if (!res || !items) {
      throw new Error("BFF returned invalid or missing loop health data");
    }
    return items;
  });

  return (
    <>
      <PageHeader
        title={kind ? t(`v5.loops.${kind}.title`) : t("nav.loops")}
        subtitle="Authoritative Twelve Loop Truth & Closed-Loop OS Run Control"
      />
      <PageBody>
        <div className="flex items-center gap-2 mb-4 border-b border-border pb-2">
          <button
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === "truth"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            onClick={() => setActiveTab("truth")}
          >
            Twelve Loop Ground Truth ({loopHealthData.data?.length || 0})
          </button>
          <button
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === "runs"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            onClick={() => setActiveTab("runs")}
          >
            Closed-Loop OS Runs ({data?.items?.length || 0})
          </button>
        </div>

        {activeTab === "truth" && (
          <LoopTruthView
            loops={loopHealthData.data || []}
            loading={loopHealthData.loading}
            error={loopHealthData.error}
            onRefresh={loopHealthData.refresh}
          />
        )}

        {activeTab === "runs" && (
          !data ? (
            <div className="text-sm text-muted-foreground">…</div>
          ) : (
            <Card className="p-0">
              <ManagementTableScroll minScrollWidth={960}>
                <table className="w-full min-w-[960px] text-sm">
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
              </ManagementTableScroll>
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {t("v5.col.total")}: {data.totalCount} · exact={String(data.totalCountExact)}
              </div>
            </Card>
          )
        )}
      </PageBody>
    </>
  );
};

