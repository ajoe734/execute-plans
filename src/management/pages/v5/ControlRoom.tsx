// Pack E E2 — Pantheon Control Room.
// Spec: .lovable/spec/v5/Pantheon_v5_Closed_Loop_Supervisor_OS_SD_2026-05-06.md §12.
// Layout: AutonomyStatusCard + 5 loop summary cards · 3 loop lanes ·
//         Sentinel critical findings + HIQ preview · health snapshots.
// Drill-down: sentinel?finding=<id>, interventions?item=<id>.
// Realtime: refreshes on any v5 event (Q22) via useV5Live.

import { Link, useNavigate } from "react-router-dom";
import { Compass, ShieldAlert, RefreshCw, Activity, ArrowRight, Siren } from "lucide-react";
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
  LoopRun, SentinelFinding, InterventionItem,
} from "@/lib/v5";
import type { LoopKind } from "@/lib/v5/enums";

// ---------------- helpers ----------------

const sevTone = (s: string) =>
  s === "critical" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
  s === "warning"  ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
  s === "watch"    ? "bg-accent/15 text-accent border-accent/30" :
                     "bg-muted text-muted-foreground border-border";

const loopStatusTone = (s: string) =>
  s === "blocked" ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
  s === "failed"  ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
  s === "running" ? "bg-status-running/15 text-status-running border-status-running/30" :
  s === "succeeded" ? "bg-status-success/15 text-status-success border-status-success/30" :
                    "bg-muted text-muted-foreground border-border";

const healthTone = (s: string) =>
  s === "critical" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
  s === "degraded" ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
  s === "watch"    ? "bg-accent/15 text-accent border-accent/30" :
                     "bg-status-success/15 text-status-success border-status-success/30";

function loopSummary(runs: LoopRun[], kind: LoopKind) {
  const sub = runs.filter((r) => r.loopKind === kind);
  return {
    total: sub.length,
    running: sub.filter((r) => r.status === "running").length,
    blocked: sub.filter((r) => r.status === "blocked").length,
    failed: sub.filter((r) => r.status === "failed").length,
  };
}

// ---------------- subcomponents ----------------

const AutonomyStatusCard = ({ kpi, emergency }: { kpi: ControlRoomSummary["kpi"]; emergency: boolean }) => {
  const t = useT();
  const verdict = emergency
    ? { label: t("v5.controlRoom.autonomy.emergency"), tone: "bg-status-failed/15 text-status-failed border-status-failed/30", Icon: Siren }
    : kpi.loopsBlocked > 0 || kpi.criticalFindings > 0
      ? { label: t("v5.controlRoom.autonomy.guarded"), tone: "bg-status-warning/15 text-status-warning border-status-warning/30", Icon: ShieldAlert }
      : { label: t("v5.controlRoom.autonomy.healthy"), tone: "bg-status-success/15 text-status-success border-status-success/30", Icon: Activity };
  const Icon = verdict.Icon;
  return (
    <Card className="p-4 lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("v5.controlRoom.autonomy.title")}</div>
          <div className="mt-1 flex items-center gap-2">
            <Icon className="h-5 w-5" />
            <span className="text-lg font-semibold">{verdict.label}</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {t("v5.controlRoom.autonomy.subtitle")}
          </div>
        </div>
        <Badge variant="outline" className={verdict.tone}>{verdict.label}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><span className="text-muted-foreground">{t("v5.kpi.loopsRunning")}: </span><span className="font-mono">{kpi.loopsRunning}</span></div>
        <div><span className="text-muted-foreground">{t("v5.kpi.loopsBlocked")}: </span><span className="font-mono">{kpi.loopsBlocked}</span></div>
        <div><span className="text-muted-foreground">{t("v5.kpi.criticalFindings")}: </span><span className="font-mono">{kpi.criticalFindings}</span></div>
      </div>
    </Card>
  );
};

const LoopLane = ({ kind, runs, route }: { kind: LoopKind; runs: LoopRun[]; route: string }) => {
  const t = useT();
  const sub = runs.filter((r) => r.loopKind === kind);
  const summary = loopSummary(runs, kind);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{t(`v5.controlRoom.lane.${kind}`)}</h3>
          <Badge variant="outline" className="text-[10px]">{summary.total}</Badge>
        </div>
        <Link to={route} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          {t("v5.controlRoom.openLoop")} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex items-center gap-2 text-[11px] mb-3">
        <Badge variant="outline" className={loopStatusTone("running")}>{summary.running} {t("v5.kpi.loopsRunning").toLowerCase()}</Badge>
        {summary.blocked > 0 && <Badge variant="outline" className={loopStatusTone("blocked")}>{summary.blocked} {t("v5.controlRoom.blocked")}</Badge>}
        {summary.failed > 0 && <Badge variant="outline" className={loopStatusTone("failed")}>{summary.failed} {t("v5.controlRoom.failed")}</Badge>}
      </div>
      <ul className="space-y-1.5">
        {sub.slice(0, 4).map((r) => (
          <li key={r.id} className="text-xs border-b border-border last:border-0 pb-1.5 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium truncate">{r.subjectName ?? r.id}</span>
              <Badge variant="outline" className={loopStatusTone(r.status)}>{r.status}</Badge>
            </div>
            <div className="text-muted-foreground truncate mt-0.5">
              {t("v5.col.next")}: {r.nextAction?.label ?? r.nextAction?.kind ?? "—"}
            </div>
          </li>
        ))}
        {sub.length === 0 && (
          <li className="text-xs text-muted-foreground py-2">{t("v5.controlRoom.lane.empty")}</li>
        )}
      </ul>
    </Card>
  );
};

const SentinelPreview = ({ findings }: { findings: SentinelFinding[] }) => {
  const t = useT();
  const navigate = useNavigate();
  const critical = findings.filter((f) => f.severity === "critical" || f.severity === "warning").slice(0, 5);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <ShieldAlert className="h-4 w-4" /> {t("v5.controlRoom.criticalFindings")}
        </h2>
        <Link to="/management/sentinel" className="text-xs text-primary hover:underline">{t("v5.controlRoom.viewAll")}</Link>
      </div>
      {critical.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3">{t("v5.controlRoom.healthyState")}</div>
      ) : (
        <ul className="space-y-2">
          {critical.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => navigate(`/management/sentinel?finding=${encodeURIComponent(f.id)}`)}
                className="w-full text-left rounded-md border border-border bg-card hover:bg-muted/40 px-3 py-2 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium truncate">{f.title}</div>
                  <Badge variant="outline" className={sevTone(f.severity)}>{f.severity}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {f.summary} · {t("v5.sentinel.confidence")}: {(f.confidence * 100).toFixed(0)}%
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const HIQPreview = ({ items }: { items: InterventionItem[] }) => {
  const t = useT();
  const navigate = useNavigate();
  const blocking = items.slice(0, 5);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">{t("v5.controlRoom.humanGates")}</h2>
        <Link to="/management/interventions" className="text-xs text-primary hover:underline">{t("v5.controlRoom.viewAll")}</Link>
      </div>
      {blocking.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3">{t("v5.controlRoom.noGates")}</div>
      ) : (
        <ul className="space-y-2">
          {blocking.map((i) => (
            <li key={i.id}>
              <button
                onClick={() => navigate(`/management/interventions?item=${encodeURIComponent(i.id)}`)}
                className="w-full text-left rounded-md border border-border bg-card hover:bg-muted/40 px-3 py-2 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium truncate">{i.title}</div>
                  <Badge variant="outline" className={sevTone(i.severity)}>{i.severity}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {t("v5.col.subject")}: {i.source}
                  {i.recommendedDecision ? ` · ${t("v5.interventions.recommended")}: ${i.recommendedDecision}` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

// ---------------- main page ----------------

export const ControlRoomPage = () => {
  const t = useT();
  const summary = useV5Live<ControlRoomSummary>(() => bff.v5.controlRoom.get());
  const personas = useV5Live(() => bff.v5.personas.health());
  const strategies = useV5Live(() => bff.v5.strategies.health());

  const data = summary.data;
  const emergency = !!data && (
    data.kpi.criticalFindings >= 2 ||
    data.topInterventions.some((i) => i.source === "emergency_review")
  );

  return (
    <>
      <PageHeader
        title={t("nav.controlRoom")}
        subtitle={t("v5.controlRoom.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            {emergency && (
              <Badge variant="outline" className="bg-status-failed/15 text-status-failed border-status-failed/30 gap-1">
                <Siren className="h-3 w-3" /> {t("v5.controlRoom.emergencyMode")}
              </Badge>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to="/management/sentinel">
                <ShieldAlert className="h-4 w-4 mr-1" /> {t("v5.controlRoom.openSentinel")}
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => { summary.refresh(); personas.refresh(); strategies.refresh(); }}>
              <RefreshCw className="h-4 w-4 mr-1" /> {t("v5.controlRoom.refresh")}
            </Button>
          </div>
        }
      />
      <PageBody>
        {!data ? (
          <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : (
          <>
            {/* Top strip — autonomy + 5 summary cards */}
            <div className="grid gap-3 lg:grid-cols-6">
              <AutonomyStatusCard kpi={data.kpi} emergency={emergency} />
              <StatCard
                label={t("v5.controlRoom.lane.research")}
                value={loopSummary(data.loopRuns, "research").total}
                tone={loopSummary(data.loopRuns, "research").blocked > 0 ? "warning" : "default"}
                hint={`${loopSummary(data.loopRuns, "research").running} ${t("v5.kpi.loopsRunning").toLowerCase()}`}
              />
              <StatCard
                label={t("v5.controlRoom.lane.execution")}
                value={loopSummary(data.loopRuns, "execution").total}
                tone={loopSummary(data.loopRuns, "execution").blocked > 0 ? "warning" : "default"}
                hint={`${loopSummary(data.loopRuns, "execution").running} ${t("v5.kpi.loopsRunning").toLowerCase()}`}
              />
              <StatCard
                label={t("v5.controlRoom.lane.optimization")}
                value={loopSummary(data.loopRuns, "optimization").total}
                tone={loopSummary(data.loopRuns, "optimization").blocked > 0 ? "warning" : "default"}
                hint={`${loopSummary(data.loopRuns, "optimization").running} ${t("v5.kpi.loopsRunning").toLowerCase()}`}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label={t("v5.kpi.openFindings")} value={data.kpi.openFindings} tone={data.kpi.openFindings > 0 ? "warning" : "default"} />
              <StatCard label={t("v5.kpi.criticalFindings")} value={data.kpi.criticalFindings} tone={data.kpi.criticalFindings > 0 ? "danger" : "default"} />
              <StatCard label={t("v5.kpi.pendingInterventions")} value={data.kpi.pendingInterventions} tone={data.kpi.pendingInterventions > 0 ? "warning" : "default"} />
              <StatCard label={t("v5.kpi.session")} value={data.session.tenantId} hint={`${data.session.env} · ${data.session.locale}`} />
            </div>

            {/* Loop lanes — 3 columns */}
            <div className="grid gap-3 lg:grid-cols-3">
              <LoopLane kind="research" runs={data.loopRuns} route="/management/loops/research" />
              <LoopLane kind="execution" runs={data.loopRuns} route="/management/loops/execution" />
              <LoopLane kind="optimization" runs={data.loopRuns} route="/management/loops/optimization" />
            </div>

            {/* Sentinel + HIQ preview */}
            <div className="grid gap-3 lg:grid-cols-2">
              <SentinelPreview findings={data.topFindings} />
              <HIQPreview items={data.topInterventions} />
            </div>

            {/* Health snapshots */}
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="p-4">
                <h2 className="text-sm font-semibold mb-3">{t("v5.controlRoom.personaHealth")}</h2>
                {personas.data ? (
                  <ul className="space-y-1.5">
                    {personas.data.items.slice(0, 6).map((p: PersonaExecutionHealth) => (
                      <li key={p.personaId} className="flex items-center justify-between text-sm">
                        <Link to="/management/loops/execution" className="truncate hover:underline">{p.personaName}</Link>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline">{p.mode}</Badge>
                          <Badge variant="outline" className={healthTone(p.status)}>{p.status} · {p.score.toFixed(0)}</Badge>
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
                        <Badge variant="outline" className={healthTone(s.status)}>{s.status} · {s.score.toFixed(0)}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-sm text-muted-foreground">{t("common.loading")}</div>}
              </Card>
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Compass className="h-3 w-3" />
              {t("v5.transitional.controlRoom")} · {t("v5.controlRoom.generatedAt")}: {new Date(data.generatedAt).toLocaleTimeString()}
            </div>
          </>
        )}
      </PageBody>
    </>
  );
};
