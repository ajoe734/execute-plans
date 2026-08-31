// BFF Contract v1 — Live V5 API Client
// Strict live transport and fail-closed commands.

import { usePlatform } from "@/platform/store";
import { bffFetch } from "./client";
import { paths } from "./paths";
import { idempotencyKey as mintIdempotencyKey } from "./headers";
import { strictLiveRead } from "./domainReads";
import { strictDataFrom, strictItemsFrom } from "./liveTransport";
import { liveWriteGated } from "./writeGate";
import {
  v5List,
  type V5ListResponse,
  loopRunsByKind,
  findCatalogueEntry,
  buildRemediationAction,
  adaptBffInterventionsResponse,
  adaptBffIntervention,
  adaptBffLoopRun,
  adaptBffPersonaHealth,
  adaptBffStrategyHealth,
  adaptBffSentinelFinding,
  adaptBffControlRoom,
  type LoopRun,
  type SentinelFinding,
  type InterventionItem,
  type PersonaExecutionHealth,
  type StrategyExecutionHealth,
  type RemediationAction,
  type ControlRoomSummary,
  type V5SessionContext,
} from "./v5";
import type { LoopKind } from "@/lib/v5/enums";
import { mgmt } from "./management";
import {
  makeRankingRecommendationId,
  type SendRankingRecommendationInput,
  type RankingRecommendationAction,
} from "@/lib/v5/management/rankingGovernance";
import type { RankingRecommendationSubmitResult } from "./management";

const livePaths = {
  v5ControlRoom: () => "/bff/v5/control-room",
  v5StrategyHealth: () => "/bff/v5/execution/strategy-health",
  v5SentinelFinding: paths.v5SentinelFinding,
  v5SentinelStatus: paths.v5SentinelFindingStatus,
};

export function session(): V5SessionContext {
  const p = usePlatform.getState();
  return {
    tenantId: "demo",
    env: p.env,
    locale: p.locale,
    serverTime: new Date().toISOString(),
  };
}

export const bffV5 = {
  // ---- Session ----
  session: {
    get: (): Promise<V5SessionContext> => Promise.resolve(session()),
  },

  // ---- Control Room ----
  controlRoom: {
    get: (): Promise<ControlRoomSummary> =>
      strictLiveRead<ControlRoomSummary>(
        "v5.controlRoom",
        { method: "GET", path: livePaths.v5ControlRoom() },
        (data) => adaptBffControlRoom(data, session()),
      ),
  },

  // ---- Loops ----
  loops: {
    list: (kind?: LoopKind): Promise<V5ListResponse<LoopRun>> =>
      strictLiveRead<V5ListResponse<LoopRun>>(
        "v5.loops.list",
        { method: "GET", path: paths.v5LoopRuns(), query: kind ? { kind } : undefined },
        (data) => {
          const items = strictItemsFrom(data).map(adaptBffLoopRun);
          return v5List(kind ? loopRunsByKind(items, kind) : items);
        },
      ),
    get: (id: string): Promise<LoopRun | undefined> =>
      strictLiveRead<LoopRun | undefined>(
        "v5.loops.get",
        { method: "GET", path: paths.v5LoopRun(id) },
        (data) => {
          const record = strictDataFrom(data);
          return record ? adaptBffLoopRun(record, 0) : undefined;
        },
      ),
    advance: async (id: string): Promise<{ ok: boolean; reason?: string }> => {
      if (!(await liveWriteGated())) {
        return { ok: false, reason: "writes_disabled" };
      }
      await bffFetch<unknown>({
        method: "POST",
        path: `${paths.v5LoopRun(id)}/advance`,
        idempotencyKey: mintIdempotencyKey(),
        mode: "live",
      });
      return { ok: true };
    },
    pause: async (id: string, reason?: string): Promise<{ ok: boolean; reason?: string }> => {
      if (!(await liveWriteGated())) {
        return { ok: false, reason: "writes_disabled" };
      }
      await bffFetch<unknown>({
        method: "POST",
        path: `${paths.v5LoopRun(id)}/pause`,
        body: reason ? { reason } : undefined,
        idempotencyKey: mintIdempotencyKey(),
        mode: "live",
      });
      return { ok: true };
    },
    resume: async (id: string): Promise<{ ok: boolean; reason?: string }> => {
      if (!(await liveWriteGated())) {
        return { ok: false, reason: "writes_disabled" };
      }
      await bffFetch<unknown>({
        method: "POST",
        path: `${paths.v5LoopRun(id)}/resume`,
        idempotencyKey: mintIdempotencyKey(),
        mode: "live",
      });
      return { ok: true };
    },
    cancel: async (id: string): Promise<{ ok: boolean; reason?: string }> => {
      if (!(await liveWriteGated())) {
        return { ok: false, reason: "writes_disabled" };
      }
      await bffFetch<unknown>({
        method: "POST",
        path: `${paths.v5LoopRun(id)}/cancel`,
        idempotencyKey: mintIdempotencyKey(),
        mode: "live",
      });
      return { ok: true };
    },
  },

  // ---- Personas / Strategies (execution health) ----
  personas: {
    health: (): Promise<V5ListResponse<PersonaExecutionHealth>> =>
      strictLiveRead<V5ListResponse<PersonaExecutionHealth>>(
        "v5.personas.health",
        { method: "GET", path: paths.v5ExecutionPersonaHealth() },
        (data) => v5List(strictItemsFrom(data).map(adaptBffPersonaHealth)),
      ),
  },
  strategies: {
    health: (): Promise<V5ListResponse<StrategyExecutionHealth>> =>
      strictLiveRead<V5ListResponse<StrategyExecutionHealth>>(
        "v5.strategies.health",
        { method: "GET", path: livePaths.v5StrategyHealth() },
        (data) => v5List(strictItemsFrom(data).map(adaptBffStrategyHealth)),
      ),
  },

  // ---- Sentinel ----
  sentinel: {
    list: (): Promise<V5ListResponse<SentinelFinding>> =>
      strictLiveRead<V5ListResponse<SentinelFinding>>(
        "v5.sentinel.list",
        { method: "GET", path: paths.v5SentinelFindings() },
        (data) => v5List(strictItemsFrom(data).map(adaptBffSentinelFinding)),
      ),
    get: (id: string): Promise<SentinelFinding | undefined> =>
      strictLiveRead<SentinelFinding | undefined>(
        "v5.sentinel.get",
        { method: "GET", path: livePaths.v5SentinelFinding(id) },
        (data) => {
          const record = strictDataFrom(data);
          return record ? adaptBffSentinelFinding(record, 0) : undefined;
        },
      ),
    setStatus: async (id: string, status: SentinelFinding["status"]): Promise<{ ok: true; persisted: boolean }> => {
      if (!(await liveWriteGated())) {
        return { ok: true, persisted: false };
      }
      await bffFetch<unknown>({
        method: "POST",
        path: livePaths.v5SentinelStatus(id),
        body: { status },
        idempotencyKey: mintIdempotencyKey(),
        mode: "live",
      });
      return { ok: true, persisted: true };
    },
  },

  // ---- Interventions ----
  interventions: {
    list: (): Promise<V5ListResponse<InterventionItem>> =>
      strictLiveRead<V5ListResponse<InterventionItem>>(
        "v5.interventions.list",
        { method: "GET", path: paths.v5Interventions(), query: { status: "pending" } },
        adaptBffInterventionsResponse,
      ),
    get: (id: string): Promise<InterventionItem | undefined> =>
      strictLiveRead<InterventionItem | undefined>(
        "v5.interventions.get",
        { method: "GET", path: paths.v5Intervention(id) },
        (data) => {
          const record = strictDataFrom(data);
          return record ? adaptBffIntervention(record, 0) : undefined;
        },
      ),
    decide: async (id: string, decision: NonNullable<InterventionItem["recommendedDecision"]>): Promise<{ ok: boolean; reason?: string }> => {
      if (!(await liveWriteGated())) {
        return { ok: false, reason: "writes_disabled" };
      }
      await bffFetch<unknown>({
        method: "POST",
        path: `${paths.v5Intervention(id)}/decide`,
        body: { decision },
        idempotencyKey: mintIdempotencyKey(),
        mode: "live",
      });
      return { ok: true };
    },
  },

  // ---- Remediation ----
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
    execute: async (action: RemediationAction): Promise<{ ok: boolean; overlayUpdated: boolean; reason?: string }> => {
      if (!(await liveWriteGated())) {
        return { ok: false, overlayUpdated: false, reason: "writes_disabled" };
      }
      await bffFetch<unknown>({
        method: "POST",
        path: `${paths.v5Intervention(action.id)}/remediate`,
        body: {
          reason: action.label,
          remediation_action: action.kind,
        },
        idempotencyKey: mintIdempotencyKey(),
        mode: "live",
      });
      return { ok: true, overlayUpdated: false };
    },
  },
};

export type BffV5 = typeof bffV5;
export { bffV5 as v5 };

export function sendRankingRecommendation(
  input: SendRankingRecommendationInput & { recommendation: RankingRecommendationAction },
  opts: { idempotencyKey?: string } = {},
): Promise<RankingRecommendationSubmitResult> {
  const recommendationId = input.recommendationId ?? makeRankingRecommendationId(input);
  return mgmt.quarterlyRanking.submitRecommendation({
    recommendationId,
    actionId: input.recommendation,
    quarter: input.quarter,
    personaId: input.personaId,
    personaName: input.personaName,
    source: input.source,
    evidenceRefs: input.evidenceRefs ?? [],
    governanceDestinations: input.governanceDestinations,
    liveCapitalMutation: false,
  }, opts);
}
