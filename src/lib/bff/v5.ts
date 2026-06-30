// Pack E — bff.v5 facade. Q3 mount path: src/lib/bff/v5.ts attached as bff.v5.
// All write ops go through v5ActionOverlay (Q10) and emit typed v5 events (Q15) +
// legacy data refresh (Q22). Lists return V5ListResponse (Q16). Session uses
// minimal mock (Q14) — does NOT depend on /bff/me until D59 lands.

import * as seed from "@/mocks/seed";
import { usePlatform } from "@/platform/store";
import { realWritesEnabled, withLiveOrMock } from "@/lib/bff-v1/liveTransport";
import { liveWriteGated } from "@/lib/bff-v1/writeGate";
import { bffFetch } from "@/lib/bff-v1/client";
import { paths } from "@/lib/bff-v1/paths";
import { idempotencyKey as mintIdempotencyKey } from "@/lib/bff-v1/headers";
import { strictDataFrom, strictItemsFrom, strictNotFoundAsUndefined, withStrictLiveOrMock } from "@/lib/bff/liveRead";
import {
  v5List,
  type V5ListResponse,
  emitV5Event,
  v5ActionOverlay,
  applyLoopOverlay,
  advanceLoopRun,
  pauseLoopRun,
  resumeLoopRun,
  cancelLoopRun,
  deriveFindings,
  deriveLoopRuns,
  loopRunsByKind,
  adaptPersonaHealth,
  adaptStrategyHealth,
  adaptApprovalToIntervention,
  adaptFindingToIntervention,
  adaptIncidentToIntervention,
  buildRemediationAction,
  findCatalogueEntry,
  type LoopRun,
  type SentinelFinding,
  type InterventionItem,
  type PersonaExecutionHealth,
  type StrategyExecutionHealth,
  type RemediationAction,
  type ControlRoomSummary,
  type V5SessionContext,
  type ControlRoomKpi,
} from "@/lib/v5";
import type { LoopKind } from "@/lib/v5/enums";

const delay = <T>(v: T, ms = 180) => new Promise<T>((r) => setTimeout(() => r(v), ms));

type UnknownRecord = Record<string, unknown>;

const livePaths = {
  v5ControlRoom: () => "/bff/v5/control-room",
  v5StrategyHealth: () => "/bff/v5/execution/strategy-health",
  v5SentinelFinding: paths.v5SentinelFinding,
  v5SentinelStatus: paths.v5SentinelFindingStatus,
};

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};

const asString = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const asNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
};

const asManagementHref = (value: unknown): string | undefined => {
  const href = asString(value);
  if (!href) return undefined;
  if (href.startsWith("/management/")) return href;
  if (href.startsWith("management/")) return `/${href}`;
  return undefined;
};

const sentinelStatusOverlay = new Map<string, SentinelFinding["status"]>();

function applySentinelStatusOverlay(finding: SentinelFinding): SentinelFinding {
  const status = sentinelStatusOverlay.get(finding.id);
  return status ? { ...finding, status } : finding;
}

function setSentinelStatusOverlay(id: string, status: SentinelFinding["status"]) {
  sentinelStatusOverlay.set(id, status);
  emitV5Event({
    channel: "v5.sentinel.finding.status",
    type: "sentinel.finding.status_changed",
    payload: { findingId: id, status },
  });
}

const firstManagementHref = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const href = asManagementHref(value);
    if (href) return href;
  }
  return undefined;
};

const itemsFrom = (body: unknown): unknown[] => {
  return strictItemsFrom(body);
};

const isoFrom = (value: unknown, fallback = new Date().toISOString()): string =>
  asString(value, fallback);

function bffInterventionSeverity(kind: string): InterventionItem["severity"] {
  if (kind === "risk_breach" || kind === "hiq_sentinel") return "critical";
  if (kind === "strategy_drift" || kind === "loop_anomaly") return "warning";
  return "watch";
}

function bffInterventionSource(kind: string): InterventionItem["source"] {
  if (kind === "risk_breach") return "policy_exception";
  return "sentinel";
}

function adaptBffIntervention(value: unknown, index: number): InterventionItem {
  const item = asRecord(value);
  const id = asString(item.intervention_id ?? item.interventionId ?? item.id, `intervention_${index}`);
  const kind = asString(item.kind, "hiq_sentinel");
  const targetType = asString(item.target_type ?? item.targetType, "target");
  const targetId = asString(item.target_id ?? item.targetId, id);
  const triggeredAt = asString(item.triggered_at ?? item.triggeredAt ?? item.created_at ?? item.createdAt, new Date().toISOString());
  const updatedAt = asString(item.remediated_at ?? item.remediatedAt ?? item.updated_at ?? item.updatedAt, triggeredAt);
  return {
    id,
    source: bffInterventionSource(kind),
    severity: bffInterventionSeverity(kind),
    title: `${kind.replace(/_/g, " ")} · ${targetType}:${targetId}`,
    summary: asString(item.description ?? item.summary ?? item.reason),
    createdAt: triggeredAt,
    updatedAt,
    requiredRoles: ["risk_officer", "system_operator"],
    linkedFindingId: id,
    recommendedDecision: "escalate",
    allowedDecisions: ["escalate", "defer"],
    evidenceRefs: [{ kind: "approval", id }],
    modifyAllowed: true,
  };
}

function adaptBffInterventionsResponse(body: unknown): V5ListResponse<InterventionItem> {
  return v5List(itemsFrom(body).map(adaptBffIntervention));
}

function adaptLoopStatus(value: unknown): LoopRun["status"] {
  const status = asString(value).toLowerCase();
  if (["running", "active", "open", "in_progress"].includes(status)) return "running";
  if (["blocked", "paused", "mitigating", "awaiting_intervention"].includes(status)) return "blocked";
  if (["succeeded", "success", "completed", "resolved", "closed"].includes(status)) return "succeeded";
  if (["failed", "error"].includes(status)) return "failed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  return "idle";
}

function adaptStageStatus(value: unknown, fallback: LoopRun["stages"][number]["status"] = "pending"): LoopRun["stages"][number]["status"] {
  const status = asString(value).toLowerCase();
  if (["running", "active", "in_progress"].includes(status)) return "running";
  if (["blocked", "paused", "awaiting_intervention"].includes(status)) return "blocked";
  if (["succeeded", "success", "completed", "resolved", "closed"].includes(status)) return "succeeded";
  if (["failed", "error"].includes(status)) return "failed";
  if (["skipped", "cancelled", "canceled"].includes(status)) return "skipped";
  return fallback;
}

type LoopRunNextAction = NonNullable<LoopRun["nextAction"]>;
type LoopRunEvidenceRef = NonNullable<LoopRun["evidence"]>[number];

function adaptLoopNextAction(value: unknown): LoopRunNextAction | undefined {
  const item = asRecord(value);
  const rawKind = asString(item.kind ?? item.action_kind ?? item.actionKind).toLowerCase();
  if (!rawKind) return undefined;

  const kind: LoopRunNextAction["kind"] =
    ["awaiting_approval", "pending_approval", "approval"].includes(rawKind) || rawKind.includes("approval")
      ? "awaiting_approval"
      : ["awaiting_human_decision", "human_decision", "manual_decision"].includes(rawKind)
        ? "awaiting_human_decision"
        : rawKind === "automatic"
          ? "automatic"
          : "none";
  const label = asString(item.label ?? item.name ?? item.title);
  const etaMs = Number(item.etaMs ?? item.eta_ms);
  const href = firstManagementHref(
    item.href,
    item.url,
    item.to,
    item.route,
    item.action_href,
    item.actionHref,
  );

  const action: LoopRunNextAction = {
    kind,
  };
  if (label) action.label = label;
  if (href) action.href = href;
  if (Number.isFinite(etaMs)) action.etaMs = etaMs;
  return action;
}

const LOOP_EVIDENCE_KINDS = new Set<LoopRunEvidenceRef["kind"]>([
  "alert",
  "incident",
  "job",
  "audit",
  "metric",
  "strategy",
  "persona",
  "deployment",
  "runtime",
  "policy",
  "approval",
]);

function adaptLoopEvidenceRef(value: unknown): LoopRunEvidenceRef | undefined {
  const item = asRecord(value);
  const kind = asString(item.kind ?? item.evidence_kind ?? item.evidenceKind).toLowerCase();
  const id = asString(item.id ?? item.ref_id ?? item.refId ?? item.evidence_id ?? item.evidenceId);
  if (!id || !LOOP_EVIDENCE_KINDS.has(kind as LoopRunEvidenceRef["kind"])) return undefined;
  return { kind: kind as LoopRunEvidenceRef["kind"], id };
}

function adaptLoopEvidence(item: UnknownRecord): LoopRunEvidenceRef[] {
  const rawRefs = [
    ...(Array.isArray(item.evidence) ? item.evidence : []),
    ...(Array.isArray(item.evidence_refs) ? item.evidence_refs : []),
    ...(Array.isArray(item.evidenceRefs) ? item.evidenceRefs : []),
  ];
  const refs = rawRefs
    .map(adaptLoopEvidenceRef)
    .filter((ref): ref is LoopRunEvidenceRef => Boolean(ref));

  const approval = asRecord(item.approval);
  const approvalId = asString(
    item.approval_id ?? item.approvalId ?? approval.approval_id ?? approval.approvalId ?? approval.id,
  );
  if (approvalId && !refs.some((ref) => ref.kind === "approval" && ref.id === approvalId)) {
    refs.push({ kind: "approval", id: approvalId });
  }

  return refs;
}

function approvalIdFromEvidence(evidence: LoopRunEvidenceRef[]): string | undefined {
  return evidence.find((ref) => ref.kind === "approval")?.id;
}

function approvalHrefFromId(id: string | undefined): string | undefined {
  return id ? `/management/approvals?approval=${encodeURIComponent(id)}` : undefined;
}

function adaptLoopKind(value: unknown): LoopKind {
  const kind = asString(value).toLowerCase();
  if (kind.includes("research")) return "research";
  if (kind.includes("optim") || kind.includes("rebalance")) return "optimization";
  return "execution";
}

function adaptBffLoopRun(value: unknown, index: number): LoopRun {
  const item = asRecord(value);
  const activePeriod = asRecord(item.activePeriod ?? item.active_period);
  const id = asString(item.loop_run_id ?? item.loopRunId ?? item.id, `loop-run-${index + 1}`);
  const status = adaptLoopStatus(item.status ?? item.runStatus ?? item.run_status);
  const startedAt = isoFrom(item.startedAt ?? item.started_at ?? activePeriod.start ?? item.created_at ?? item.createdAt);
  const updatedAt = isoFrom(item.updatedAt ?? item.updated_at ?? item.resolved_at ?? item.resolvedAt ?? activePeriod.end ?? startedAt);
  const liveStages = Array.isArray(item.stages)
    ? item.stages
    : Array.isArray(item.timeline)
      ? item.timeline
      : [];
  const stages = liveStages.length > 0
    ? liveStages.map((stage, stageIndex) => {
      const s = asRecord(stage);
      return {
        id: asString(s.id ?? s.stage_id ?? s.stageId, `${id}_stage_${stageIndex + 1}`),
        name: asString(s.name ?? s.kind ?? s.stage ?? s.stage_name ?? s.stageName ?? s.label, `Stage ${stageIndex + 1}`),
        status: adaptStageStatus(s.status),
        startedAt: asString(s.startedAt ?? s.started_at),
        completedAt: asString(s.completedAt ?? s.completed_at),
        timeoutPolicySource: "backend" as const,
        timeoutMs: Number.isFinite(Number(s.timeoutMs ?? s.timeout_ms)) ? Number(s.timeoutMs ?? s.timeout_ms) : undefined,
        warnAfterMs: Number.isFinite(Number(s.warnAfterMs ?? s.warn_after_ms)) ? Number(s.warnAfterMs ?? s.warn_after_ms) : undefined,
      };
    })
    : [{
      id: `${id}_status`,
      name: asString(item.title ?? item.name ?? item.status, "BFF status"),
      status: adaptStageStatus(status, status === "idle" ? "pending" : "running"),
      startedAt,
      completedAt: status === "succeeded" || status === "failed" || status === "cancelled" ? updatedAt : undefined,
      timeoutPolicySource: "backend" as const,
    }];
  const approval = asRecord(item.approval);
  const links = asRecord(item.links);
  const approvalLinks = asRecord(approval.links);
  const approvalStage = liveStages
    .map(asRecord)
    .find((stage) => {
      const entityType = asString(stage.entity_type ?? stage.entityType).toLowerCase();
      const kind = asString(stage.kind ?? stage.stage ?? stage.name).toLowerCase();
      return entityType === "approval" || kind.includes("approval");
    });
  const incidentId = asString(item.derived_from_incident_id ?? item.incident_id ?? item.incidentId);
  const evidence = adaptLoopEvidence(item);
  if (incidentId && !evidence.some((ref) => ref.kind === "incident" && ref.id === incidentId)) {
    evidence.push({ kind: "incident", id: incidentId });
  }
  const stageApprovalId = asString(
    approvalStage?.entity_id ?? approvalStage?.entityId ?? approvalStage?.approval_id ?? approvalStage?.approvalId,
  );
  if (stageApprovalId && !evidence.some((ref) => ref.kind === "approval" && ref.id === stageApprovalId)) {
    evidence.push({ kind: "approval", id: stageApprovalId });
  }
  const explicitNextAction = adaptLoopNextAction(item.nextAction ?? item.next_action);
  const approvalId = approvalIdFromEvidence(evidence);
  const approvalHref = firstManagementHref(
    explicitNextAction?.href,
    item.action_href,
    item.actionHref,
    links.approval,
    links.approvals,
    approvalLinks.approval,
    approvalLinks.approvals,
    approvalStage?.action_href,
    approvalStage?.actionHref,
    approvalHrefFromId(approvalId),
  );
  const nextAction = explicitNextAction
    ? {
      ...explicitNextAction,
      href: explicitNextAction.href ?? (explicitNextAction.kind === "awaiting_approval" ? approvalHref : undefined),
    }
    : (
      approvalId
        ? { kind: "awaiting_approval" as const, label: "Review approval", href: approvalHref }
        : status === "blocked"
          ? { kind: "awaiting_human_decision" as const, label: "Resolve BFF loop blocker" }
          : status === "running"
            ? { kind: "automatic" as const, label: "BFF loop running" }
            : { kind: "none" as const }
    );
  return {
    id,
    loopKind: adaptLoopKind(item.loopKind ?? item.loop_kind ?? item.loopFamily ?? item.loop_family ?? item.kind ?? item.title),
    status,
    startedAt,
    updatedAt,
    completedAt: asString(item.completedAt ?? item.completed_at ?? activePeriod.end),
    triggeredBy: asString(item.triggeredBy ?? item.triggered_by ?? item.runtime_id ?? item.runtimeId, "bff"),
    subjectKind: asString(item.subjectKind ?? item.subject_kind) as LoopRun["subjectKind"],
    subjectId: asString(item.subjectId ?? item.subject_id ?? item.binding_id ?? item.bindingId),
    subjectName: asString(item.subjectName ?? item.subject_name ?? item.title ?? item.name, id),
    stages,
    currentStageId: asString(item.currentStageId ?? item.current_stage_id) || stages.find((stage) => stage.status === "running" || stage.status === "blocked")?.id,
    nextAction,
    evidence,
  };
}

function adaptHealthStatus(value: unknown): PersonaExecutionHealth["status"] {
  const status = asString(value).toLowerCase();
  if (["healthy", "ok", "active"].includes(status)) return "healthy";
  if (["watch", "warning"].includes(status)) return "watch";
  if (["critical", "failed"].includes(status)) return "critical";
  return "degraded";
}

function scoreForStatus(status: PersonaExecutionHealth["status"]): number {
  if (status === "healthy") return 90;
  if (status === "watch") return 72;
  if (status === "critical") return 20;
  return 50;
}

function adaptBffPersonaHealth(value: unknown, index: number): PersonaExecutionHealth {
  const item = asRecord(value);
  const status = adaptHealthStatus(item.status ?? item.health);
  const score = asNumber(item.score, scoreForStatus(status));
  return {
    personaId: asString(item.personaId ?? item.persona_id ?? item.id, `persona-${index + 1}`),
    personaName: asString(item.personaName ?? item.persona_name ?? item.name, `Persona ${index + 1}`),
    mode: ["live", "paper", "shadow", "suspended"].includes(asString(item.mode)) ? asString(item.mode) as PersonaExecutionHealth["mode"] : "shadow",
    status,
    score,
    formulaVersion: "v0-mock",
    inputs: {
      performance: score,
      risk: score,
      executionQuality: score,
      decisionQuality: score,
      policyCompliance: score,
      sentinelPenalty: Math.max(0, 100 - score),
    },
    suspendedReason: asString(item.suspendedReason ?? item.suspended_reason),
    routedStrategies: asNumber(item.routedStrategies ?? item.routed_strategies, 0),
    openFindings: asNumber(item.openFindings ?? item.open_findings, 0),
    updatedAt: isoFrom(item.updatedAt ?? item.updated_at),
  };
}

function adaptBffStrategyHealth(value: unknown, index: number): StrategyExecutionHealth {
  const item = asRecord(value);
  const status = adaptHealthStatus(item.status ?? item.health);
  const score = asNumber(item.score, scoreForStatus(status));
  return {
    strategyId: asString(item.strategyId ?? item.strategy_id ?? item.id, `strategy-${index + 1}`),
    strategyName: asString(item.strategyName ?? item.strategy_name ?? item.name, `Strategy ${index + 1}`),
    status,
    score,
    formulaVersion: "v0-mock",
    inputs: {
      performance: score,
      risk: score,
      executionQuality: score,
      lifecycleConsistency: score,
      sentinelIncidentPenalty: Math.max(0, 100 - score),
    },
    pnl30d: asNumber(item.pnl30d ?? item.pnl_30d, 0),
    drawdown: asNumber(item.drawdown, 0),
    openFindings: asNumber(item.openFindings ?? item.open_findings, 0),
    updatedAt: isoFrom(item.updatedAt ?? item.updated_at),
  };
}

function adaptSentinelStatus(value: unknown): SentinelFinding["status"] {
  const status = asString(value).toLowerCase();
  if (["acknowledged", "accepted"].includes(status)) return "acknowledged";
  if (["action_pending", "pending", "active"].includes(status)) return "action_pending";
  if (["mitigating", "executing"].includes(status)) return "mitigating";
  if (["resolved", "closed", "completed"].includes(status)) return "resolved";
  if (["dismissed", "rejected"].includes(status)) return "dismissed";
  return "open";
}

function adaptSentinelSeverity(value: unknown): SentinelFinding["severity"] {
  const severity = asString(value).toLowerCase();
  if (severity === "critical") return "critical";
  if (severity === "high" || severity === "warning") return "warning";
  if (severity === "medium" || severity === "watch") return "watch";
  return "info";
}

function adaptBffSentinelFinding(value: unknown, index: number): SentinelFinding {
  const item = asRecord(value);
  const id = asString(item.finding_id ?? item.findingId ?? item.id, `sentinel-finding-${index + 1}`);
  const incidentId = asString(item.derived_from_incident_id ?? item.incident_id ?? item.incidentId);
  const severity = adaptSentinelSeverity(item.severity);
  const confidence = Number.isFinite(Number(item.confidence))
    ? Math.max(0, Math.min(1, Number(item.confidence)))
    : severity === "critical" ? 0.88 : severity === "warning" ? 0.76 : severity === "watch" ? 0.62 : 0.35;
  return {
    id,
    status: adaptSentinelStatus(item.status),
    severity,
    confidence,
    title: asString(item.title ?? item.name, id),
    summary: asString(item.summary ?? item.description ?? item.title, id),
    source: ["alert", "incident", "job", "runtime", "persona-health", "policy"].includes(asString(item.source))
      ? asString(item.source) as SentinelFinding["source"]
      : incidentId ? "incident" : "runtime",
    detectedAt: isoFrom(item.detectedAt ?? item.detected_at ?? item.created_at ?? item.createdAt),
    updatedAt: isoFrom(item.updatedAt ?? item.updated_at ?? item.resolved_at ?? item.resolvedAt),
    blastRadius: {
      strategies: asStringArray(item.strategy_ids ?? item.strategyIds),
      personas: asStringArray(item.persona_ids ?? item.personaIds),
      pools: asStringArray(item.pool_ids ?? item.poolIds),
      deployments: asStringArray(item.deployment_ids ?? item.deploymentIds),
    },
    evidence: incidentId ? [{ kind: "incident", id: incidentId }] : [],
    recommendedActionIds: asStringArray(item.recommendedActionIds ?? item.recommended_action_ids),
  };
}

function liveKpi(loopRuns: LoopRun[], findings: SentinelFinding[], interventions: InterventionItem[]): ControlRoomKpi {
  return {
    loopsRunning: loopRuns.filter((r) => r.status === "running").length,
    loopsBlocked: loopRuns.filter((r) => r.status === "blocked").length,
    openFindings: findings.filter((f) => f.status === "open").length,
    criticalFindings: findings.filter((f) => f.severity === "critical").length,
    pendingInterventions: interventions.length,
    personasHealthy: 0,
    personasDegraded: 0,
    strategiesHealthy: 0,
    strategiesDegraded: 0,
  };
}

function adaptBffControlRoom(body: unknown): ControlRoomSummary {
  const record = asRecord(body);
  const loops = asRecord(record.loops);
  const sentinel = asRecord(record.sentinel);
  const interventions = asRecord(record.interventions);
  const loopRuns = strictItemsFrom(loops).map(adaptBffLoopRun);
  const findings = strictItemsFrom(sentinel).map(adaptBffSentinelFinding);
  const interventionItems = strictItemsFrom(interventions).map(adaptBffIntervention);
  return {
    generatedAt: isoFrom(asRecord(record.meta).snapshot_at ?? record.generatedAt ?? record.generated_at),
    session: session(),
    kpi: liveKpi(loopRuns, findings, interventionItems),
    topFindings: findings.slice(0, 5),
    topInterventions: interventionItems.slice(0, 5),
    loopRuns: loopRuns.slice(0, 8),
  };
}

function session(): V5SessionContext {
  const p = usePlatform.getState();
  return {
    tenantId: "demo",            // Q14 — mock until D59/D51
    env: p.env,
    locale: p.locale,
    serverTime: new Date().toISOString(),
  };
}

function allFindings(): SentinelFinding[] {
  return deriveFindings({
    alerts: seed.alerts,
    incidents: seed.incidents,
    runtimes: seed.runtimes,
    jobs: seed.jobs,
  }).map(applySentinelStatusOverlay);
}

function allLoopRuns(): LoopRun[] {
  return applyLoopOverlay(deriveLoopRuns({
    strategies: seed.strategies,
    rebalances: seed.rebalances,
    jobs: seed.jobs,
    approvals: seed.approvals,
    alerts: seed.alerts,
    incidents: seed.incidents,
    research: seed.researchExperiments,
  }));
}

function allInterventions(): InterventionItem[] {
  const fromApprovals = seed.approvals
    .filter((a) => a.state === "pending")
    .map(adaptApprovalToIntervention);
  const fromFindings = allFindings()
    .filter((f) => f.status === "open" || f.status === "action_pending")
    .map(adaptFindingToIntervention);
  const fromIncidents = seed.incidents
    .filter((i) => i.status !== "resolved")
    .map(adaptIncidentToIntervention);
  return [...fromApprovals, ...fromFindings, ...fromIncidents];
}

function kpi(loopRuns: LoopRun[], findings: SentinelFinding[], interventions: InterventionItem[]): ControlRoomKpi {
  const personas = seed.personas.map((p) => adaptPersonaHealth(p, { alerts: seed.alerts }));
  const strategies = seed.strategies.map((s) => adaptStrategyHealth(s, { alerts: seed.alerts, incidents: seed.incidents }));
  return {
    loopsRunning: loopRuns.filter((r) => r.status === "running").length,
    loopsBlocked: loopRuns.filter((r) => r.status === "blocked").length,
    openFindings: findings.filter((f) => f.status === "open").length,
    criticalFindings: findings.filter((f) => f.severity === "critical").length,
    pendingInterventions: interventions.length,
    personasHealthy: personas.filter((p) => p.status === "healthy").length,
    personasDegraded: personas.filter((p) => p.status === "degraded" || p.status === "critical").length,
    strategiesHealthy: strategies.filter((s) => s.status === "healthy").length,
    strategiesDegraded: strategies.filter((s) => s.status === "degraded" || s.status === "critical").length,
  };
}

export const bffV5 = {
  // ---- Session (Q14) ----
  session: {
    get: (): Promise<V5SessionContext> => delay(session()),
  },

  // ---- Control Room ----
  controlRoom: {
    get: (): Promise<ControlRoomSummary> => withStrictLiveOrMock<ControlRoomSummary>(
      { method: "GET", path: livePaths.v5ControlRoom() },
      async () => {
        const loopRuns = allLoopRuns();
        const findings = allFindings();
        const interventions = allInterventions();
        const summary: ControlRoomSummary = {
          generatedAt: new Date().toISOString(),
          session: session(),
          kpi: kpi(loopRuns, findings, interventions),
          topFindings: [...findings].sort((a, b) => b.confidence - a.confidence).slice(0, 5),
          topInterventions: interventions.slice(0, 5),
          loopRuns: loopRuns.slice(0, 8),
        };
        return delay(summary);
      },
      adaptBffControlRoom,
    ),
  },

  // ---- Loops ----
  loops: {
    list: (kind?: LoopKind): Promise<V5ListResponse<LoopRun>> => withStrictLiveOrMock<V5ListResponse<LoopRun>>(
      { method: "GET", path: paths.v5LoopRuns(), query: kind ? { kind } : undefined },
      async () => {
        const all = allLoopRuns();
        return delay(v5List(kind ? loopRunsByKind(all, kind) : all));
      },
      (data) => {
        const items = strictItemsFrom(data).map(adaptBffLoopRun);
        return v5List(kind ? loopRunsByKind(items, kind) : items);
      },
    ),
    get: (id: string): Promise<LoopRun | undefined> => withStrictLiveOrMock<LoopRun | undefined>(
      { method: "GET", path: paths.v5LoopRun(id) },
      async () => delay(allLoopRuns().find((r) => r.id === id)),
      (data) => {
        const record = strictDataFrom(data);
        return record ? adaptBffLoopRun(record, 0) : undefined;
      },
      strictNotFoundAsUndefined,
    ),
    /** E3 — advance currently running stage. */
    advance: (id: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const run = allLoopRuns().find((r) => r.id === id);
      if (!run) return delay({ ok: false, reason: "not_found" } as const);
      const patch = advanceLoopRun(run);
      emitV5Event({
        channel: `v5.loop.${run.loopKind}` as const,
        type: "loop.run.advanced",
        payload: { runId: id, runStatus: patch.runStatus, stageStatuses: patch.stageStatuses },
      });
      return delay({ ok: true } as const);
    },
    pause: (id: string, reason?: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const run = allLoopRuns().find((r) => r.id === id);
      if (!run) return delay({ ok: false, reason: "not_found" } as const);
      const patch = pauseLoopRun(run, reason);
      emitV5Event({
        channel: `v5.loop.${run.loopKind}` as const,
        type: "loop.run.paused",
        payload: { runId: id, reason, runStatus: patch.runStatus },
      });
      return delay({ ok: true } as const);
    },
    resume: (id: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const run = allLoopRuns().find((r) => r.id === id);
      if (!run) return delay({ ok: false, reason: "not_found" } as const);
      const patch = resumeLoopRun(run);
      emitV5Event({
        channel: `v5.loop.${run.loopKind}` as const,
        type: "loop.run.resumed",
        payload: { runId: id, runStatus: patch.runStatus },
      });
      return delay({ ok: true } as const);
    },
    cancel: (id: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const run = allLoopRuns().find((r) => r.id === id);
      if (!run) return delay({ ok: false, reason: "not_found" } as const);
      const patch = cancelLoopRun(run);
      emitV5Event({
        channel: `v5.loop.${run.loopKind}` as const,
        type: "loop.run.cancelled",
        payload: { runId: id, runStatus: patch.runStatus },
      });
      return delay({ ok: true } as const);
    },
  },

  // ---- Personas / Strategies (execution health) ----
  personas: {
    health: (): Promise<V5ListResponse<PersonaExecutionHealth>> =>
      withStrictLiveOrMock<V5ListResponse<PersonaExecutionHealth>>(
        { method: "GET", path: paths.v5ExecutionPersonaHealth() },
        async () => delay(v5List(seed.personas.map((p) => adaptPersonaHealth(p, { alerts: seed.alerts })))),
        (data) => v5List(strictItemsFrom(data).map(adaptBffPersonaHealth)),
      ),
  },
  strategies: {
    health: (): Promise<V5ListResponse<StrategyExecutionHealth>> =>
      withStrictLiveOrMock<V5ListResponse<StrategyExecutionHealth>>(
        { method: "GET", path: livePaths.v5StrategyHealth() },
        async () => delay(v5List(seed.strategies.map((s) => adaptStrategyHealth(s, { alerts: seed.alerts, incidents: seed.incidents })))),
        (data) => v5List(strictItemsFrom(data).map(adaptBffStrategyHealth)),
      ),
  },

  // ---- Sentinel ----
  sentinel: {
    list: (): Promise<V5ListResponse<SentinelFinding>> =>
      withStrictLiveOrMock<V5ListResponse<SentinelFinding>>(
        { method: "GET", path: paths.v5SentinelFindings() },
        async () => delay(v5List(allFindings())),
        (data) => v5List(strictItemsFrom(data).map(adaptBffSentinelFinding).map(applySentinelStatusOverlay)),
      ),
    get: (id: string): Promise<SentinelFinding | undefined> =>
      withStrictLiveOrMock<SentinelFinding | undefined>(
        { method: "GET", path: livePaths.v5SentinelFinding(id) },
        async () => delay(allFindings().find((f) => f.id === id)),
        (data) => {
          const record = strictDataFrom(data);
          return record ? applySentinelStatusOverlay(adaptBffSentinelFinding(record, 0)) : undefined;
        },
        strictNotFoundAsUndefined,
      ),
    setStatus: async (id: string, status: SentinelFinding["status"]): Promise<{ ok: true; persisted: boolean }> => {
      const persisted = await liveWriteGated();
      if (persisted) {
        await bffFetch<unknown>({
          method: "POST",
          path: livePaths.v5SentinelStatus(id),
          body: { status },
          idempotencyKey: mintIdempotencyKey(),
          mode: "live",
        });
      } else {
        await delay(undefined);
      }
      setSentinelStatusOverlay(id, status);
      return { ok: true, persisted };
    },
  },

  // ---- Interventions (HIQ) ----
  interventions: {
    list: (): Promise<V5ListResponse<InterventionItem>> =>
      withStrictLiveOrMock<V5ListResponse<InterventionItem>, unknown>(
        { method: "GET", path: paths.v5Interventions(), query: { status: "pending" } },
        async () => delay(v5List(allInterventions())),
        adaptBffInterventionsResponse,
      ),
    get: (id: string): Promise<InterventionItem | undefined> =>
      withStrictLiveOrMock<InterventionItem | undefined>(
        { method: "GET", path: paths.v5Intervention(id) },
        async () => delay(allInterventions().find((i) => i.id === id)),
        (data) => {
          const record = strictDataFrom(data);
          return record ? adaptBffIntervention(record, 0) : undefined;
        },
        strictNotFoundAsUndefined,
      ),
    decide: (id: string, decision: NonNullable<InterventionItem["recommendedDecision"]>): Promise<{ ok: true }> => {
      emitV5Event({
        channel: "v5.intervention.decision",
        type: "intervention.decided",
        payload: { interventionId: id, decision },
      });
      return delay({ ok: true });
    },
  },

  // ---- Remediation (Q24 advisory/guarded/emergency flow) ----
  remediation: {
    build: (kind: string, args: { id?: string; targetKind?: RemediationAction["targetKind"]; targetId?: string }): RemediationAction | undefined => {
      const entry = findCatalogueEntry(kind);
      if (!entry) return undefined;
      return buildRemediationAction(entry, {
        id: args.id ?? `ra_${kind}_${Date.now().toString(36)}`,
        targetKind: args.targetKind,
        targetId: args.targetId,
      });
    },
    /** Q10 — only mutates v5ActionOverlay. Existing seed remains untouched. */
    execute: async (action: RemediationAction): Promise<{ ok: true; overlayUpdated: boolean }> => {
      if (realWritesEnabled()) {
        await bffFetch<unknown>({
          method: "POST",
          path: `${paths.v5Intervention(action.id)}/remediate`,
          body: {
            reason: action.label,
            remediation_action: action.kind,
          },
          idempotencyKey: `execute-plans-${action.id}-${Date.now()}`,
          mode: "live",
        });
      }
      let overlayUpdated = false;
      if (action.targetKind === "persona" && action.targetId) {
        if (action.kind === "switch_persona_to_shadow") {
          v5ActionOverlay.setPersona(action.targetId, { forcedMode: "shadow", reason: action.label });
          overlayUpdated = true;
        } else if (action.kind === "pause_persona_routing") {
          v5ActionOverlay.setPersona(action.targetId, { routingPaused: true, reason: action.label });
          overlayUpdated = true;
        }
      }
      if (action.targetKind === "strategy" && action.targetId) {
        if (action.kind === "reduce_allocation") {
          v5ActionOverlay.setStrategy(action.targetId, { allocationReduced: 0.5, reason: action.label });
          overlayUpdated = true;
        } else if (action.kind === "freeze_rebalance") {
          v5ActionOverlay.setStrategy(action.targetId, { rebalanceFrozen: true, reason: action.label });
          overlayUpdated = true;
        }
      }
      emitV5Event({
        channel: "v5.sentinel.action",
        type: action.mode === "emergency_override" ? "sentinel.action.emergency_executed" : "sentinel.action.executed",
        payload: { actionId: action.id, kind: action.kind, mode: action.mode, target: { kind: action.targetKind, id: action.targetId }, overlayUpdated },
      });
      return delay({ ok: true, overlayUpdated });
    },
  },
};

export type BffV5 = typeof bffV5;
