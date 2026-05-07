// Pack E — bff.v5 facade. Q3 mount path: src/lib/bff/v5.ts attached as bff.v5.
// All write ops go through v5ActionOverlay (Q10) and emit typed v5 events (Q15) +
// legacy data refresh (Q22). Lists return V5ListResponse (Q16). Session uses
// minimal mock (Q14) — does NOT depend on /bff/me until D59 lands.

import * as seed from "@/mocks/seed";
import { usePlatform } from "@/platform/store";
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
  });
}

function allLoopRuns(): LoopRun[] {
  return deriveLoopRuns({
    strategies: seed.strategies,
    rebalances: seed.rebalances,
    jobs: seed.jobs,
    approvals: seed.approvals,
    alerts: seed.alerts,
    incidents: seed.incidents,
  });
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
    get: (): Promise<ControlRoomSummary> => {
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
  },

  // ---- Loops ----
  loops: {
    list: (kind?: LoopKind): Promise<V5ListResponse<LoopRun>> => {
      const all = allLoopRuns();
      return delay(v5List(kind ? loopRunsByKind(all, kind) : all));
    },
    get: (id: string): Promise<LoopRun | undefined> => delay(allLoopRuns().find((r) => r.id === id)),
  },

  // ---- Personas / Strategies (execution health) ----
  personas: {
    health: (): Promise<V5ListResponse<PersonaExecutionHealth>> =>
      delay(v5List(seed.personas.map((p) => adaptPersonaHealth(p, { alerts: seed.alerts })))),
  },
  strategies: {
    health: (): Promise<V5ListResponse<StrategyExecutionHealth>> =>
      delay(v5List(seed.strategies.map((s) => adaptStrategyHealth(s, { alerts: seed.alerts, incidents: seed.incidents })))),
  },

  // ---- Sentinel ----
  sentinel: {
    list: (): Promise<V5ListResponse<SentinelFinding>> => delay(v5List(allFindings())),
    get: (id: string): Promise<SentinelFinding | undefined> => delay(allFindings().find((f) => f.id === id)),
    /** Q24 — mock state transition; emits typed event; does NOT touch seed. */
    setStatus: (id: string, status: SentinelFinding["status"]): Promise<{ ok: true }> => {
      emitV5Event({
        channel: "v5.sentinel.finding.status",
        type: "sentinel.finding.status_changed",
        payload: { findingId: id, status },
      });
      return delay({ ok: true });
    },
  },

  // ---- Interventions (HIQ) ----
  interventions: {
    list: (): Promise<V5ListResponse<InterventionItem>> => delay(v5List(allInterventions())),
    get: (id: string): Promise<InterventionItem | undefined> => delay(allInterventions().find((i) => i.id === id)),
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
    execute: (action: RemediationAction): Promise<{ ok: true; overlayUpdated: boolean }> => {
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
