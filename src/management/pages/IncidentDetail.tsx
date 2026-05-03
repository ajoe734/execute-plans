// Incident Detail — Spec Part 3 §19.
// Sections: summary, timeline, linked alerts, affected scope, root cause hypothesis,
// actions taken, mitigation, postmortem, training feedback, evolution constraint, audit.
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { bff } from "@/lib/bff/client";
import type { Incident, Alert, Strategy, Runtime } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { usePermissions } from "@/lib/usePermissions";
import { Field } from "./ObjectDetailLayout";
import { toast } from "sonner";

export const IncidentDetail = () => {
  const t = useT();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const perms = usePermissions();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [closeOpen, setCloseOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [postmortem, setPostmortem] = useState("");

  useEffect(() => {
    Promise.all([
      bff.incidents.get(id), bff.alerts.list(),
      bff.strategies.list(), bff.runtimes.list(),
    ]).then(([i, a, s, r]) => {
      setIncident(i ?? null);
      setAlerts(a);
      setStrategies(s);
      setRuntimes(r);
    });
  }, [id]);

  if (!incident) {
    return (
      <>
        <PageHeader title={t("incident.notFound")} />
        <PageBody>
          <Card className="p-6 text-sm text-muted-foreground">{t("incident.notFoundHint")}</Card>
        </PageBody>
      </>
    );
  }

  const linkedAlerts = alerts.filter((a) => incident.affected?.includes(a.relatedTarget ?? ""));
  const affectedStrategies = strategies.filter((s) => incident.affected?.includes(s.id));
  const affectedRuntimes = runtimes.filter((r) => incident.affected?.includes(r.id));
  const isHighSev = incident.severity === "high" || incident.severity === "critical";
  const requirePostmortem = isHighSev && postmortem.trim().length < 20;

  const close = () => {
    setIncident({ ...incident, status: "resolved", timeline: [...(incident.timeline ?? []), { ts: new Date().toISOString(), actor: perms.role, note: `Incident closed. Postmortem: ${postmortem.slice(0, 80)}…` }] });
    toast.success(t("incident.closed"));
  };
  const advance = (status: Incident["status"]) => {
    setIncident({ ...incident, status, timeline: [...(incident.timeline ?? []), { ts: new Date().toISOString(), actor: perms.role, note: `Status → ${status}` }] });
  };

  return (
    <>
      <PageHeader
        title={incident.title}
        subtitle={
          <span className="flex items-center gap-2 text-mono text-xs">
            <RiskBadge level={incident.severity} />
            <StatusBadge state={incident.status === "resolved" ? "success" : incident.status === "mitigating" ? "running" : "warning"} />
            <span className="text-muted-foreground">{incident.id}</span>
          </span> as unknown as string
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/management/incidents")}>{t("common.back")}</Button>
            {incident.status === "open" && perms.can("approve") && (
              <Button size="sm" onClick={() => advance("mitigating")}>{t("incident.startMitigation")}</Button>
            )}
            {perms.can("pause") && (
              <Button size="sm" variant="outline" onClick={() => setPauseOpen(true)}>{t("incident.pauseStrategy")}</Button>
            )}
            {incident.status !== "resolved" && perms.can("approve") && (
              <Button size="sm" variant="destructive" onClick={() => setCloseOpen(true)}>{t("incident.close")}</Button>
            )}
          </div>
        }
      />
      <PageBody>
        <Card className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label={t("incident.commander")} value={incident.commander ?? "—"} mono />
          <Field label={t("incident.opened")} value={new Date(incident.openedAt).toLocaleString()} mono />
          <Field label={t("incident.severity")} value={incident.severity} mono />
          <Field label={t("incident.status")} value={incident.status} mono />
        </Card>

        {incident.description && (
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("incident.summary")}</div>
            <p className="text-sm leading-relaxed">{incident.description}</p>
          </Card>
        )}

        <Tabs defaultValue="timeline">
          <TabsList>
            <TabsTrigger value="timeline">{t("incident.tab.timeline")}</TabsTrigger>
            <TabsTrigger value="affected">{t("incident.tab.affected")}</TabsTrigger>
            <TabsTrigger value="root">{t("incident.tab.root")}</TabsTrigger>
            <TabsTrigger value="postmortem">{t("incident.tab.postmortem")}</TabsTrigger>
            <TabsTrigger value="audit">{t("incident.tab.audit")}</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4">
            <Card className="p-4">
              <ol className="space-y-3">
                {(incident.timeline ?? []).map((e, i) => (
                  <li key={i} className="text-sm flex gap-3">
                    <span className="text-mono text-xs text-muted-foreground whitespace-nowrap w-32">{new Date(e.ts).toLocaleString()}</span>
                    <span className="text-mono text-xs text-accent w-20">{e.actor}</span>
                    <span className="flex-1">{e.note}</span>
                  </li>
                ))}
                {(incident.timeline ?? []).length === 0 && <li className="text-xs text-muted-foreground">{t("common.noResults")}</li>}
              </ol>
            </Card>
          </TabsContent>

          <TabsContent value="affected" className="mt-4 space-y-4">
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("incident.linkedAlerts")}</div>
              {linkedAlerts.length === 0 ? <div className="text-xs text-muted-foreground">—</div> : (
                <ul className="divide-y divide-border">
                  {linkedAlerts.map((a) => (
                    <li key={a.id} className="py-2 flex items-center gap-3 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded" onClick={() => navigate("/management/alerts")}>
                      <RiskBadge level={a.severity} />
                      <span className="text-sm flex-1">{a.title}</span>
                      <span className="text-mono text-xs text-muted-foreground">{a.source}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("incident.affectedStrategies")}</div>
              <div className="flex flex-wrap gap-2">
                {affectedStrategies.map((s) => (
                  <Button key={s.id} size="sm" variant="outline" onClick={() => navigate(`/management/strategies/${s.id}`)}>
                    {s.name} <RiskBadge level={s.risk} />
                  </Button>
                ))}
                {affectedStrategies.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("incident.affectedRuntimes")}</div>
              <div className="flex flex-wrap gap-2">
                {affectedRuntimes.map((r) => (
                  <Button key={r.id} size="sm" variant="outline" onClick={() => navigate("/management/runtimes")}>
                    {r.name} <StatusBadge state={r.status} />
                  </Button>
                ))}
                {affectedRuntimes.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="root" className="mt-4">
            <Card className="p-4 space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("incident.rootCause")}</div>
                <p className="text-sm">{incident.severity === "critical" ? t("incident.rootCauseExample") : t("incident.rootCausePending")}</p>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("incident.actionsTaken")}</div>
                <ul className="text-sm list-disc list-inside space-y-1">
                  {(incident.timeline ?? []).map((e, i) => <li key={i}>{e.note}</li>)}
                </ul>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="postmortem" className="mt-4">
            <Card className="p-4 space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("incident.postmortemDraft")}</div>
              <Textarea
                value={postmortem}
                onChange={(e) => setPostmortem(e.target.value)}
                placeholder={t("incident.postmortemPlaceholder")}
                rows={10}
              />
              {isHighSev && (
                <p className="text-xs text-status-warning">{t("incident.postmortemRequired")}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => toast.success(t("incident.feedbackQueued"))}>{t("incident.createTrainingFeedback")}</Button>
                <Button size="sm" variant="outline" onClick={() => toast.success(t("incident.constraintQueued"))}>{t("incident.createEvolutionConstraint")}</Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <Card className="p-4">
              <ol className="space-y-2 text-sm">
                <li className="flex gap-3"><span className="text-mono text-xs text-muted-foreground">{new Date(incident.openedAt).toLocaleString()}</span><span className="text-mono text-xs text-accent">system</span><span>incident.opened</span></li>
                {(incident.timeline ?? []).map((e, i) => (
                  <li key={i} className="flex gap-3"><span className="text-mono text-xs text-muted-foreground">{new Date(e.ts).toLocaleString()}</span><span className="text-mono text-xs text-accent">{e.actor}</span><span>{e.note}</span></li>
                ))}
              </ol>
            </Card>
          </TabsContent>
        </Tabs>

        <HighRiskConfirm
          open={closeOpen}
          onOpenChange={setCloseOpen}
          operation="incident.close"
          target={{ type: "Incident", id: incident.id, name: incident.title }}
          currentState={incident.status}
          newState="resolved"
          risk={incident.severity}
          riskImpact={isHighSev ? t("incident.closeRiskImpact") : undefined}
          requiredApproval={isHighSev ? ["postmortem"] : undefined}
          onConfirm={() => {
            if (requirePostmortem) { toast.error(t("incident.postmortemRequired")); return; }
            close(); return;
          }}
        />

        <HighRiskConfirm
          open={pauseOpen}
          onOpenChange={setPauseOpen}
          operation="strategy.pause"
          target={{ type: "Incident", id: incident.id, name: `Pause affected strategies of ${incident.title}` }}
          currentState="deployed"
          newState="paused"
          affected={{ strategies: affectedStrategies.map((s) => s.id), runtimes: affectedRuntimes.map((r) => r.id) }}
          risk={incident.severity}
          rollbackTarget="resume after mitigation"
          requiredApproval={["risk", "ops"]}
          onConfirm={() => { toast.success(t("incident.pauseQueued")); }}
        />
      </PageBody>
    </>
  );
};
