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
  adaptBffLoopRun,
  adaptBffPersonaHealth,
  adaptBffStrategyHealth,
  adaptBffControlRoom,
  type LoopRun,
  type PersonaExecutionHealth,
  type StrategyExecutionHealth,
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
    list: (kind?: LoopKind, opts?: { signal?: AbortSignal }): Promise<V5ListResponse<LoopRun>> =>
      strictLiveRead<V5ListResponse<LoopRun>>(
        "v5.loops.list",
        { method: "GET", path: paths.v5LoopRuns(), query: kind ? { kind } : undefined, signal: opts?.signal },
        (data) => {
          const items = strictItemsFrom(data).map(adaptBffLoopRun);
          return v5List(kind ? loopRunsByKind(items, kind) : items);
        },
      ),
    get: (id: string, opts?: { signal?: AbortSignal }): Promise<LoopRun | undefined> =>
      strictLiveRead<LoopRun | undefined>(
        "v5.loops.get",
        { method: "GET", path: paths.v5LoopRun(id), signal: opts?.signal },
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
    health: (opts?: { signal?: AbortSignal }): Promise<V5ListResponse<PersonaExecutionHealth>> =>
      strictLiveRead<V5ListResponse<PersonaExecutionHealth>>(
        "v5.personas.health",
        { method: "GET", path: paths.v5ExecutionPersonaHealth(), signal: opts?.signal },
        (data) => v5List(strictItemsFrom(data).map(adaptBffPersonaHealth)),
      ),
  },
  strategies: {
    health: (opts?: { signal?: AbortSignal }): Promise<V5ListResponse<StrategyExecutionHealth>> =>
      strictLiveRead<V5ListResponse<StrategyExecutionHealth>>(
        "v5.strategies.health",
        { method: "GET", path: livePaths.v5StrategyHealth(), signal: opts?.signal },
        (data) => v5List(strictItemsFrom(data).map(adaptBffStrategyHealth)),
      ),
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
