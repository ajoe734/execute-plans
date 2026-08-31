// BFF Contract v1 — V5 DTO / View Models & Pure Transforms
// ACG-03-015: DTOs, view models, and pure adapters.
// Network and command execution belong to ./v5Client.ts.

import { strictItemsFrom } from "./liveTransport";
import {
  v5List,
  type V5ListResponse,
  makeV5Event,
  type V5EventChannel,
  V5_EVENT_TOPIC,
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
  type EvidenceRef,
  type InterventionItem,
  type PersonaExecutionHealth,
  type StrategyExecutionHealth,
  type RemediationAction,
  type ControlRoomSummary,
  type V5SessionContext,
  type ControlRoomKpi,
} from "@/lib/v5";
import type { LoopKind } from "@/lib/v5/enums";

export {
  v5List,
  type V5ListResponse,
  makeV5Event,
  type V5EventChannel,
  V5_EVENT_TOPIC,
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
  type EvidenceRef,
  type InterventionItem,
  type PersonaExecutionHealth,
  type StrategyExecutionHealth,
  type RemediationAction,
  type ControlRoomSummary,
  type V5SessionContext,
  type ControlRoomKpi,
  type LoopKind,
};

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};

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

const EVIDENCE_KINDS = new Set<EvidenceRef["kind"]>([
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

const asEvidenceKind = (value: unknown, fallback: EvidenceRef["kind"] = "audit"): EvidenceRef["kind"] => {
  const kind = asString(value).toLowerCase();
  return EVIDENCE_KINDS.has(kind as EvidenceRef["kind"]) ? (kind as EvidenceRef["kind"]) : fallback;
};

const asEvidenceRef = (value: unknown): EvidenceRef | undefined => {
  if (typeof value === "string") {
    const [kindMaybe, ...rest] = value.split(":");
    if (rest.length > 0 && EVIDENCE_KINDS.has(kindMaybe as EvidenceRef["kind"])) {
      const id = rest.join(":").trim();
      return id ? { kind: kindMaybe as EvidenceRef["kind"], id } : undefined;
    }
    const id = value.trim();
    return id ? { kind: "audit", id } : undefined;
  }

  const item = asRecord(value);
  const id = asString(item.id ?? item.ref ?? item.path ?? item.evidence_id ?? item.evidenceId);
  if (!id) return undefined;
  const snapshotRecord = asRecord(item.snapshot);
  const snapshot =
    Object.keys(snapshotRecord).length > 0
      ? {
          value: snapshotRecord.value as number | string | undefined,
          ts: asString(snapshotRecord.ts ?? snapshotRecord.timestamp),
          label: asString(snapshotRecord.label ?? snapshotRecord.name),
        }
      : undefined;
  return {
    kind: asEvidenceKind(item.kind ?? item.type ?? item.source),
    id,
    ...(snapshot ? { snapshot } : {}),
  };
};

export const asEvidenceRefs = (value: unknown): EvidenceRef[] => {
  if (!Array.isArray(value)) return [];
  return value.map(asEvidenceRef).filter((ref): ref is EvidenceRef => !!ref);
};

const asManagementHref = (value: unknown): string | undefined => {
  const href = asString(value);
  if (!href) return undefined;
  if (href.startsWith("/management/")) return href;
  if (href.startsWith("management/")) return `/${href}`;
  return undefined;
};

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

const isoFrom = (value: unknown, fallback = ""): string =>
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

export function adaptBffIntervention(value: unknown, index = 0, fallbackIso = ""): InterventionItem {
  const item = asRecord(value);
  const id = asString(item.intervention_id ?? item.interventionId ?? item.id, `intervention_${index}`);
  const kind = asString(item.kind, "hiq_sentinel");
  const targetType = asString(item.target_type ?? item.targetType, "target");
  const targetId = asString(item.target_id ?? item.targetId, id);
  const linkedFindingId = asString(
    item.linked_finding_id ?? item.linkedFindingId ?? item.finding_id ?? item.findingId,
    id,
  );
  const triggeredAt = asString(
    item.triggered_at ?? item.triggeredAt ?? item.created_at ?? item.createdAt,
    fallbackIso,
  );
  const updatedAt = asString(
    item.remediated_at ?? item.remediatedAt ?? item.updated_at ?? item.updatedAt,
    triggeredAt,
  );
  return {
    id,
    source: bffInterventionSource(kind),
    severity: bffInterventionSeverity(kind),
    title: `${kind.replace(/_/g, " ")} · ${targetType}:${targetId}`,
    summary: asString(item.description ?? item.summary ?? item.reason),
    createdAt: triggeredAt,
    updatedAt,
    requiredRoles: ["risk_officer", "system_operator"],
    linkedFindingId,
    recommendedDecision: "escalate",
    allowedDecisions: ["escalate", "defer"],
    evidenceRefs: [{ kind: "approval", id }],
    modifyAllowed: true,
  };
}

export function adaptBffInterventionsResponse(body: unknown, fallbackIso = ""): V5ListResponse<InterventionItem> {
  return v5List(itemsFrom(body).map((item, index) => adaptBffIntervention(item, index, fallbackIso)));
}

export function adaptLoopStatus(value: unknown): LoopRun["status"] {
  const status = asString(value).toLowerCase();
  if (["running", "active", "open", "in_progress"].includes(status)) return "running";
  if (["blocked", "paused", "mitigating", "awaiting_intervention"].includes(status)) return "blocked";
  if (["succeeded", "success", "completed", "resolved", "closed"].includes(status)) return "succeeded";
  if (["failed", "error"].includes(status)) return "failed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  return "idle";
}

export function adaptStageStatus(
  value: unknown,
  fallback: LoopRun["stages"][number]["status"] = "pending",
): LoopRun["stages"][number]["status"] {
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

export function adaptLoopNextAction(value: unknown): LoopRunNextAction | undefined {
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

export function adaptLoopEvidenceRef(value: unknown): LoopRunEvidenceRef | undefined {
  const item = asRecord(value);
  const kind = asString(item.kind ?? item.evidence_kind ?? item.evidenceKind).toLowerCase();
  const id = asString(item.id ?? item.ref_id ?? item.refId ?? item.evidence_id ?? item.evidenceId);
  if (!id || !LOOP_EVIDENCE_KINDS.has(kind as LoopRunEvidenceRef["kind"])) return undefined;
  return { kind: kind as LoopRunEvidenceRef["kind"], id };
}

export function adaptLoopEvidence(item: UnknownRecord): LoopRunEvidenceRef[] {
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

export function adaptLoopKind(value: unknown): LoopKind {
  const kind = asString(value).toLowerCase();
  if (kind.includes("research")) return "research";
  if (kind.includes("optim") || kind.includes("rebalance")) return "optimization";
  return "execution";
}

export function adaptBffLoopRun(value: unknown, index = 0): LoopRun {
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
    : [
        {
          id: `${id}_status`,
          name: asString(item.title ?? item.name ?? item.status, "BFF status"),
          status: adaptStageStatus(status, status === "idle" ? "pending" : "running"),
          startedAt,
          completedAt: status === "succeeded" || status === "failed" || status === "cancelled" ? updatedAt : undefined,
          timeoutPolicySource: "backend" as const,
        },
      ];
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

export function adaptHealthStatus(value: unknown): PersonaExecutionHealth["status"] {
  const status = asString(value).toLowerCase();
  if (["healthy", "ok", "active"].includes(status)) return "healthy";
  if (["watch", "warning"].includes(status)) return "watch";
  if (["critical", "failed"].includes(status)) return "critical";
  return "degraded";
}

export function scoreForStatus(status: PersonaExecutionHealth["status"]): number {
  if (status === "healthy") return 90;
  if (status === "watch") return 72;
  if (status === "critical") return 20;
  return 50;
}

export function adaptBffPersonaHealth(value: unknown, index = 0): PersonaExecutionHealth {
  const item = asRecord(value);
  const status = adaptHealthStatus(item.status ?? item.health);
  const score = asNumber(item.score, scoreForStatus(status));
  return {
    personaId: asString(item.personaId ?? item.persona_id ?? item.id, `persona-${index + 1}`),
    personaName: asString(item.personaName ?? item.persona_name ?? item.name, `Persona ${index + 1}`),
    mode: ["live", "paper", "shadow", "suspended"].includes(asString(item.mode)) ? (asString(item.mode) as PersonaExecutionHealth["mode"]) : "shadow",
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

export function adaptBffStrategyHealth(value: unknown, index = 0): StrategyExecutionHealth {
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

export function adaptSentinelStatus(value: unknown): SentinelFinding["status"] {
  const status = asString(value).toLowerCase();
  if (["acknowledged", "accepted"].includes(status)) return "acknowledged";
  if (["action_pending", "pending", "active"].includes(status)) return "action_pending";
  if (["mitigating", "executing"].includes(status)) return "mitigating";
  if (["resolved", "closed", "completed"].includes(status)) return "resolved";
  if (["dismissed", "rejected"].includes(status)) return "dismissed";
  return "open";
}

export function adaptSentinelSeverity(value: unknown): SentinelFinding["severity"] {
  const severity = asString(value).toLowerCase();
  if (severity === "critical") return "critical";
  if (severity === "high" || severity === "warning") return "warning";
  if (severity === "medium" || severity === "watch") return "watch";
  return "info";
}

export function adaptBffSentinelFinding(value: unknown, index = 0): SentinelFinding {
  const item = asRecord(value);
  const id = asString(item.finding_id ?? item.findingId ?? item.id, `sentinel-finding-${index + 1}`);
  const incidentId = asString(item.derived_from_incident_id ?? item.incident_id ?? item.incidentId);
  const severity = adaptSentinelSeverity(item.severity);
  const evidence = asEvidenceRefs(item.evidence ?? item.evidence_refs ?? item.evidenceRefs);
  if (incidentId && !evidence.some((ref) => ref.kind === "incident" && ref.id === incidentId)) {
    evidence.unshift({ kind: "incident", id: incidentId });
  }
  const confidence = Number.isFinite(Number(item.confidence))
    ? Math.max(0, Math.min(1, Number(item.confidence)))
    : severity === "critical"
      ? 0.88
      : severity === "warning"
        ? 0.76
        : severity === "watch"
          ? 0.62
          : 0.35;
  return {
    id,
    status: adaptSentinelStatus(item.status),
    severity,
    confidence,
    title: asString(item.title ?? item.name, id),
    summary: asString(item.summary ?? item.description ?? item.title, id),
    source: ["alert", "incident", "job", "runtime", "persona-health", "policy"].includes(asString(item.source))
      ? (asString(item.source) as SentinelFinding["source"])
      : incidentId
        ? "incident"
        : "runtime",
    detectedAt: isoFrom(item.detectedAt ?? item.detected_at ?? item.created_at ?? item.createdAt),
    updatedAt: isoFrom(item.updatedAt ?? item.updated_at ?? item.resolved_at ?? item.resolvedAt),
    blastRadius: {
      strategies: asStringArray(item.strategy_ids ?? item.strategyIds),
      personas: asStringArray(item.persona_ids ?? item.personaIds),
      pools: asStringArray(item.pool_ids ?? item.poolIds),
      deployments: asStringArray(item.deployment_ids ?? item.deploymentIds),
    },
    evidence,
    recommendedActionIds: asStringArray(item.recommendedActionIds ?? item.recommended_action_ids),
  };
}

export function liveKpi(
  loopRuns: LoopRun[],
  findings: SentinelFinding[],
  interventions: InterventionItem[],
): ControlRoomKpi {
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

export function adaptBffControlRoom(body: unknown, sessionContext?: V5SessionContext): ControlRoomSummary {
  const record = asRecord(body);
  const loops = asRecord(record.loops);
  const sentinel = asRecord(record.sentinel);
  const interventions = asRecord(record.interventions);
  const loopRuns = strictItemsFrom(loops).map(adaptBffLoopRun);
  const findings = strictItemsFrom(sentinel).map(adaptBffSentinelFinding);
  const interventionItems = strictItemsFrom(interventions).map(adaptBffIntervention);
  const rawSession = asRecord(record.session);
  const session: V5SessionContext = sessionContext ?? {
    tenantId: asString(rawSession.tenantId ?? rawSession.tenant_id, "demo"),
    env: (asString(rawSession.env, "dev") as V5SessionContext["env"]),
    locale: (asString(rawSession.locale, "en-US") as V5SessionContext["locale"]),
    serverTime: isoFrom(rawSession.serverTime ?? rawSession.server_time, "1970-01-01T00:00:00.000Z"),
  };
  return {
    generatedAt: isoFrom(asRecord(record.meta).snapshot_at ?? record.generatedAt ?? record.generated_at),
    session,
    kpi: liveKpi(loopRuns, findings, interventionItems),
    topFindings: findings.slice(0, 5),
    topInterventions: interventionItems.slice(0, 5),
    loopRuns: loopRuns.slice(0, 8),
  };
}
