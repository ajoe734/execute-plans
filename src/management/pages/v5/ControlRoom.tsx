// Pack E E2 — high-fidelity Control Room.
// Sources: bff.v5.controlRoom + personas.health + strategies.health.
// Realtime: refreshes on any v5 event (Q22).

import { Link } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { StatCard } from "@/platform/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import { useV5Live } from "./useV5Live";
import type {
  ControlRoomSummary, PersonaExecutionHealth, StrategyExecutionHealth,
} from "@/lib/v5";

const statusTone = (s: string): "default" | "warning" | "danger" | "success" => {
  switch (s) {
    case "critical": case "failed": return "danger";
    case "degraded": case "blocked": case "warning": return "warning";
    case "healthy": case "succeeded": case "running": return "success";
    default: return "default";
  }
};

const sevBadge = (s: string) => {
  const cls =
    s === "critical" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
    s === "warning"  ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
    s === "watch"    ? "bg-accent/15 text-accent border-accent/30" :
                       "bg-muted text-muted-foreground border-border";
  return <Badge variant="outline" className={cls}>{s}</Badge>;
};

export const ControlRoomPage = () => {
  const t = useT();
  const summary = useV5Live<ControlRoomSummary>(() => bff.v5.controlRoom.get());
  const personas = useV5Live(() => bff.v5.personas.health());
  const strategies = useV5Live(() => bff.v5.strategies.health());

  return (
    <>
      <PageHeader
        title={t("nav.controlRoom")}
        subtitle={t("v5.controlRoom.subtitle")}
        actions={
          <Button variant="outline" size="sm" onClick={() => { summary.refresh(); personas.refresh(); strategies.refresh(); }}>
            {t("v5.controlRoom.refresh")}
          </Button>
        }
      />
      <PageBody>
        {!summary.data ? (
          <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label={t("v5.kpi.loopsRunning")} value={summary.data.kpi.loopsRunning} tone="success" />
              <StatCard label={t("v5.kpi.loopsBlocked")} value={summary.data.kpi.loopsBlocked} tone={summary.data.kpi.loopsBlocked > 0 ? "warning" : "default"} />
              <StatCard label={t("v5.kpi.openFindings")} value={summary.data.kpi.openFindings} tone={summary.data.kpi.openFindings > 0 ? "warning" : "default"} />
              <StatCard label={t("v5.kpi.criticalFindings")} value={summary.data.kpi.criticalFindings} tone={summary.data.kpi.criticalFindings > 0 ? "danger" : "default"} />
              <StatCard label={t("v5.kpi.pendingInterventions")} value={summary.data.kpi.pendingInterventions} tone={summary.data.kpi.pendingInterventions > 0 ? "warning" : "default"} />
              <StatCard label={t("v5.kpi.personasHealthy")} value={summary.data.kpi.personasHealthy} tone="success" hint={`${t("v5.kpi.degraded")}: ${summary.data.kpi.personasDegraded}`} />
              <StatCard label={t("v5.kpi.strategiesHealthy")} value={summary.data.kpi.strategiesHealthy} tone="success" hint={`${t("v5.kpi.degraded")}: ${summary.data.kpi.strategiesDegraded}`} />
              <StatCard label={t("v5.kpi.session")} value={summary.data.session.tenantId} hint={`${summary.data.session.env} · ${summary.data.session.locale}`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {/* Top loops */}
              <Card className="p-4 lg:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">{t("v5.controlRoom.topLoops")}</h2>
                  <Link to="/management/loops" className="text-xs text-primary hover:underline">{t("v5.controlRoom.viewAll")}</Link>
                </div>
                <ul className="space-y-2">
                  {summary.data.loopRuns.slice(0, 6).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-sm border-b border-border last:border-0 pb-2 last:pb-0">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.subjectName ?? r.id}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t("v5.col.next")}: {r.nextAction?.label ?? r.nextAction?.kind ?? "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline">{r.loopKind}</Badge>
                        <Badge variant="outline" className={
                          r.status === "blocked" ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
                          r.status === "failed" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
                          r.status === "running" ? "bg-status-running/15 text-status-running border-status-running/30" :
                          "bg-muted text-muted-foreground border-border"
                        }>{r.status}</Badge>
                      </div>
                    </li>
                  ))}
                  {summary.data.loopRuns.length === 0 && (
                    <li className="text-sm text-muted-foreground">{t("v5.empty")}</li>
                  )}
                </ul>
              </Card>

              {/* Top findings */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">{t("v5.controlRoom.topFindings")}</h2>
                  <Link to="/management/sentinel" className="text-xs text-primary hover:underline">{t("v5.controlRoom.viewAll")}</Link>
                </div>
                <ul className="space-y-2">
                  {summary.data.topFindings.slice(0, 5).map((f) => (
                    <li key={f.id} className="border-b border-border last:border-0 pb-2 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium truncate">{f.title}</div>
                        {sevBadge(f.severity)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t("v5.sentinel.confidence")}: {(f.confidence * 100).toFixed(0)}%
                      </div>
                    </li>
                  ))}
                  {summary.data.topFindings.length === 0 && (
                    <li className="text-sm text-muted-foreground">{t("v5.empty")}</li>
                  )}
                </ul>
              </Card>
            </div>

            {/* Health summary */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <h2 className="text-sm font-semibold mb-3">{t("v5.controlRoom.personaHealth")}</h2>
                {personas.data ? (
                  <ul className="space-y-1.5">
                    {personas.data.items.slice(0, 6).map((p: PersonaExecutionHealth) => (
                      <li key={p.personaId} className="flex items-center justify-between text-sm">
                        <Link to="/management/loops/execution" className="truncate hover:underline">{p.personaName}</Link>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline">{p.mode}</Badge>
                          <Badge variant="outline" className={
                            statusTone(p.status) === "danger" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
                            statusTone(p.status) === "warning" ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
                            "bg-status-success/15 text-status-success border-status-success/30"
                          }>{p.status} · {p.score.toFixed(0)}</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-sm text-muted-foreground">{t("common.loading")}</div>}
              </Card>
              <Card className="p-4">
                <h2 className="text-sm font-semibold mb-3">{t("v5.controlRoom.strategyHealth")}</h2>
                {strategies.data ? (
                  <ul className="space-y-1.5">
                    {strategies.data.items.slice(0, 6).map((s: StrategyExecutionHealth) => (
                      <li key={s.strategyId} className="flex items-center justify-between text-sm">
                        <Link to={`/management/strategies/${s.strategyId}`} className="truncate hover:underline">{s.strategyName}</Link>
                        <Badge variant="outline" className={
                          statusTone(s.status) === "danger" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
                          statusTone(s.status) === "warning" ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
                          "bg-status-success/15 text-status-success border-status-success/30"
                        }>{s.status} · {s.score.toFixed(0)}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-sm text-muted-foreground">{t("common.loading")}</div>}
              </Card>
            </div>

            <div className="text-xs text-muted-foreground">
              {t("v5.transitional.controlRoom")} · {t("v5.controlRoom.generatedAt")}: {new Date(summary.data.generatedAt).toLocaleTimeString()}
            </div>
          </>
        )}
      </PageBody>
    </>
  );
};
