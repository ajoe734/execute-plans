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
import { bff } from "@/lib/bff-v1";
import { commandReceiptDescription } from "@/lib/bff-v1/commandReceipt";
import { mutations } from "@/lib/bff/mutations";
import type { Incident, Alert, Strategy, Runtime } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { usePermissions } from "@/lib/usePermissions";
import { Field } from "./ObjectDetailLayout";
import { toast } from "sonner";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";
import { useOverlay } from "@/platform/overlayStore";
import type { RollbackSagaDTO } from "@/lib/v4/rollbackSaga";
import { findAsyncTransitionPolicy } from "@/lib/v4/asyncTransitionPolicy";
import { safeDateTime } from "@/lib/utils";

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
  const [postmortem, setPostmortem] = useState("");
  const [mitigation, setMitigation] = useState("");
  const [constraint, setConstraint] = useState("");
  const openRollbackSaga = useOverlay((s) => s.openRollbackSaga);

  const showRollbackSaga = () => {
    if (!incident) return;
    const policy = findAsyncTransitionPolicy("rollback.saga");
    const deploymentId = (incident.affected ?? [])[0];
    if (!deploymentId) return;
    const now = new Date().toISOString();
    const saga: RollbackSagaDTO = {
      id: `saga-${incident.id}`,
      incidentId: incident.id,
      deploymentId,
      status: "rolling_back",
      currentStep: "rolling_back",
      reasonCode: "INCIDENT_TRIGGERED",
      requestedBy: perms.role,
      requestedAt: now,
      updatedAt: now,
      timeout: {
        id: `transition-${incident.id}`,
        entityType: "rollbackSaga",
        entityId: `saga-${incident.id}`,
        actionId: "rollback.saga",
        from: "rolling_back",
        to: "succeeded",
        trigger: "incident",
        startedAt: now,
        timeoutMs: policy?.timeoutMs ?? 900_000,
        warnAfterMs: policy?.warnAfterMs ?? 300_000,
        failureState: policy?.failureState ?? "failed",
        retryable: policy?.retryable ?? true,
        maxRetries: policy?.maxRetries ?? 1,
        correlationId: `cid-${incident.id}`,
        status: "running",
      },
      correlationId: `cid-${incident.id}`,
      auditEventIds: [],
    };
    openRollbackSaga(saga);
  };

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
  const affectedCapitalIds = Array.from(new Set(affectedStrategies.map((s) => s.capitalPoolId).filter(Boolean)));
  const timeline = incident.timeline ?? [];
  const mitigationEntries = timeline.filter((e) => e.note?.startsWith("[mitigation]"));
  const trainingEntries = timeline.filter((e) => e.note?.startsWith("[training-feedback"));
  const constraintEntries = timeline.filter((e) => e.note?.startsWith("[constraint"));
  const isHighSev = incident.severity === "high" || incident.severity === "critical";
  const requirePostmortem = isHighSev && postmortem.trim().length < 20;

  const close = async () => {
    const receipt = await mutations.setIncidentStatus(incident.id, "resolved", postmortem);
    setIncident({ ...incident, status: "resolved", timeline: [...(incident.timeline ?? []), { ts: new Date().toISOString(), actor: perms.role, note: `Incident closed. Postmortem: ${postmortem.slice(0, 80)}…` }] });
    toast.success(t("incident.closed"), {
      description: commandReceiptDescription(receipt, { fallback: `Incident ${incident.id} · resolved` }),
    });
  };
  const advance = async (status: Incident["status"]) => {
    const receipt = await mutations.setIncidentStatus(incident.id, status);
    setIncident({ ...incident, status, timeline: [...(incident.timeline ?? []), { ts: new Date().toISOString(), actor: perms.role, note: `Status → ${status}` }] });
    toast.success(t("toast.incidentAdvanced", { id: incident.id, status }), {
      description: commandReceiptDescription(receipt, { fallback: `Incident ${incident.id} · ${status}` }),
    });
  };

  return (
    <>
      <PageHeader
        title={incident.title}
        subtitle={`${incident.id} · ${incident.severity} · ${incident.status}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/management/incidents")}>{t("common.back")}</Button>
            <Button variant="outline" size="sm" onClick={showRollbackSaga} disabled={(incident.affected ?? []).length === 0}>
              {t("incident.viewRollbackSaga", { defaultValue: "View rollback saga" })}
            </Button>
            {incident.status === "open" && (
              <PermissionAwareButton requiredAction="approve" size="sm" onClick={() => advance("mitigating")}>
                {t("incident.startMitigation")}
              </PermissionAwareButton>
            )}
            <NonProductionActionButton size="sm" variant="outline">
              {t("incident.pauseStrategy")}
            </NonProductionActionButton>
            {incident.status !== "resolved" && (
              <PermissionAwareButton requiredAction="approve" size="sm" variant="destructive" onClick={() => setCloseOpen(true)}>
                {t("incident.close")}
              </PermissionAwareButton>
            )}
          </div>
        }
      />
      <PageBody>
        <Card className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label={t("incident.commander")} value={incident.commander ?? "—"} mono />
          <Field label={t("incident.opened")} value={safeDateTime(incident.openedAt)} mono />
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
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="timeline">{t("incident.tab.timeline")}</TabsTrigger>
            <TabsTrigger value="affected">{t("incident.tab.affected")}</TabsTrigger>
            <TabsTrigger value="root">{t("incident.tab.root")}</TabsTrigger>
            <TabsTrigger value="mitigation">{t("incident.tab.mitigation")}</TabsTrigger>
            <TabsTrigger value="postmortem">{t("incident.tab.postmortem")}</TabsTrigger>
            <TabsTrigger value="training">{t("incident.tab.training")}</TabsTrigger>
            <TabsTrigger value="constraint">{t("incident.tab.constraint")}</TabsTrigger>
            <TabsTrigger value="audit">{t("incident.tab.audit")}</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4">
            <Card className="p-4">
              <ol className="space-y-3">
                {(incident.timeline ?? []).map((e, i) => (
                  <li key={i} className="text-sm flex gap-3">
                    <span className="text-mono text-xs text-muted-foreground whitespace-nowrap w-32">{safeDateTime(e.ts)}</span>
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
                      <span className="text-mono text-xs text-muted-foreground">{safeDateTime(a.openedAt)}</span>
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
                  <div key={s.id} className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/management/strategies/${s.id}`)}>
                      {s.name} <RiskBadge level={s.risk} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${s.id} trade journeys`}
                      onClick={() => navigate(`/management/trade-journeys?strategy_id=${encodeURIComponent(s.id)}`)}
                    >
                      {t("nav.tradeJourneys", { defaultValue: "Trade Journeys" })}
                    </Button>
                  </div>
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
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("incident.affectedCapital")}</div>
              <div className="flex flex-wrap gap-2">
                {affectedCapitalIds.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : affectedCapitalIds.map((cid) => (
                  <Button key={cid} size="sm" variant="outline" onClick={() => navigate(`/management/promotion-allocation?tab=quarterly-capital&capital_id=${encodeURIComponent(cid)}`)}>{cid}</Button>
                ))}
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

          <TabsContent value="mitigation" className="mt-4">
            <Card className="p-4 space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("incident.mitigation.title")}</div>
              <ol className="text-sm space-y-1.5">
                {mitigationEntries.length === 0 ? <li className="text-xs text-muted-foreground">{t("incident.mitigation.empty")}</li> :
                  mitigationEntries.map((e, i) => (
                    <li key={i} className="flex gap-3"><span className="text-mono text-xs text-muted-foreground w-32">{safeDateTime(e.ts)}</span><span className="flex-1">{e.note}</span></li>
                  ))}
              </ol>
              <Textarea value={mitigation} onChange={(e) => setMitigation(e.target.value)} placeholder={t("incident.mitigation.placeholder")} rows={3} />
              <div>
                <Button size="sm" disabled={mitigation.trim().length < 8} onClick={async () => {
                  const receipt = await mutations.appendIncidentMitigation(incident.id, mitigation);
                  toast.success(t("incident.mitigation.logged"), {
                    description: commandReceiptDescription(receipt, { fallback: `Incident ${incident.id} · mitigation` }),
                  });
                  setIncident({ ...incident, timeline: [...(incident.timeline ?? []), { ts: new Date().toISOString(), actor: perms.role, note: `[mitigation] ${mitigation.slice(0, 120)}` }] });
                  setMitigation("");
                }}>{t("incident.mitigation.add")}</Button>
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
              <div>
                <Button size="sm" disabled={postmortem.trim().length < 10} onClick={async () => {
                  const receipt = await mutations.appendPostmortem(incident.id, postmortem);
                  toast.success(t("incident.postmortem.appended"), {
                    description: commandReceiptDescription(receipt, { fallback: `Incident ${incident.id} · postmortem` }),
                  });
                  setIncident({ ...incident, timeline: [...(incident.timeline ?? []), { ts: new Date().toISOString(), actor: perms.role, note: `[postmortem] ${postmortem.slice(0, 80)}` }] });
                }}>{t("incident.postmortem.add")}</Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="training" className="mt-4">
            <Card className="p-4 space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("incident.training.title")}</div>
              <ul className="text-sm space-y-1.5">
                {trainingEntries.length === 0 ? <li className="text-xs text-muted-foreground">{t("incident.training.empty")}</li> :
                  trainingEntries.map((e, i) => <li key={i} className="text-mono text-xs">{e.note}</li>)}
              </ul>
              <div>
                <Button size="sm" variant="outline" disabled={postmortem.trim().length < 10} onClick={async () => {
                  const res = await mutations.createTrainingFeedback(incident.id, postmortem, affectedStrategies[0] ? { kind: "Strategy", id: affectedStrategies[0].id } : undefined);
                  toast.success(t("incident.feedbackQueued"), {
                    description: commandReceiptDescription(res, {
                      fallback: `Incident ${incident.id} · training_feedback`,
                      extra: `feedback ${res.feedbackId}`,
                    }),
                  });
                  setIncident({ ...incident, timeline: [...(incident.timeline ?? []), { ts: new Date().toISOString(), actor: perms.role, note: `[training-feedback ${res.feedbackId}] ${postmortem.slice(0, 80)}` }] });
                }}>{t("incident.createTrainingFeedback")}</Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="constraint" className="mt-4">
            <Card className="p-4 space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("incident.constraint.title")}</div>
              <ul className="text-sm space-y-1.5">
                {constraintEntries.length === 0 ? <li className="text-xs text-muted-foreground">{t("incident.constraint.empty")}</li> :
                  constraintEntries.map((e, i) => <li key={i} className="text-mono text-xs">{e.note}</li>)}
              </ul>
              <Textarea value={constraint} onChange={(e) => setConstraint(e.target.value)} placeholder={t("incident.constraint.placeholder")} rows={3} />
              <div>
                <Button size="sm" variant="outline" disabled={constraint.trim().length < 8} onClick={async () => {
                  const res = await mutations.createEvolutionConstraint(incident.id, constraint);
                  toast.success(t("incident.constraint.created"), {
                    description: commandReceiptDescription(res, {
                      fallback: `Incident ${incident.id} · evolution_constraint`,
                      extra: `constraint ${res.constraintId}`,
                    }),
                  });
                  setIncident({ ...incident, timeline: [...(incident.timeline ?? []), { ts: new Date().toISOString(), actor: perms.role, note: `[constraint ${res.constraintId}] ${constraint.slice(0, 80)}` }] });
                  setConstraint("");
                }}>{t("incident.constraint.add")}</Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <AuditTimeline
              entries={[
                { ts: incident.openedAt, actor: "system", action: "incident.opened", target: incident.id },
                ...(incident.timeline ?? []).map((e, i) => ({
                  id: `t${i}`, ts: e.ts, actor: e.actor, action: "incident.update", target: incident.id, memo: e.note,
                })),
              ]}
            />
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

      </PageBody>
    </>
  );
};
