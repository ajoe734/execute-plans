import type {
  ManagementListMeta,
  Strategy,
  StrategyAdjustableControl,
  StrategyOperationalStatus,
  StrategyPersonaState,
  StrategyRule,
  StrategyRuleLogic,
} from "./dto";
import { bffFetch } from "./client";
import { makeBffError } from "./errors";
import { paths } from "./paths";
import {
  strictLiveDetail,
  strictLivePaginatedList,
} from "./domainReads";

export type {
  StrategyAdjustableControl,
  StrategyOperationalStatus,
  StrategyPersonaState,
  StrategyRule,
  StrategyRuleLogic,
};

export interface StrategyCreatePayload {
  name: string;
  alpha: string;
  capitalPoolId: string;
  personaIds: string[];
  owner?: string;
  risk?: Strategy["risk"];
}

export interface StrategyWriteOptions {
  idempotencyKey?: string;
  correlationId?: string;
}

export interface StrategyCreateEnvelope {
  data: Strategy;
  meta?: ManagementListMeta;
}

export async function createStrategy(
  payload: StrategyCreatePayload,
  opts: StrategyWriteOptions = {},
): Promise<Strategy> {
  const name = String(payload.name ?? "").trim();
  const alpha = String(payload.alpha ?? "").trim();
  const capitalPoolId = String(payload.capitalPoolId ?? "").trim();
  const personaIds = Array.isArray(payload.personaIds)
    ? payload.personaIds.map((id) => String(id).trim()).filter((id) => id.length > 0)
    : [];
  const trimmedOwner = typeof payload.owner === "string" ? payload.owner.trim() : "";

  const body: Record<string, unknown> = {
    name,
    alpha,
    capitalPoolId,
    personaIds,
    state: "draft",
  };
  if (trimmedOwner && trimmedOwner !== "you") {
    body.owner = trimmedOwner;
  }
  if (payload.risk) {
    body.risk = payload.risk;
  }

  const envelope = await bffFetch<StrategyCreateEnvelope>({
    method: "POST",
    path: paths.strategies(),
    body,
    idempotencyKey: opts.idempotencyKey,
    correlationId: opts.correlationId,
  });

  const data =
    envelope &&
    typeof envelope === "object" &&
    !Array.isArray(envelope) &&
    envelope.data &&
    typeof envelope.data === "object" &&
    !Array.isArray(envelope.data)
      ? envelope.data
      : undefined;
  const id = typeof data?.id === "string" ? data.id.trim() : "";
  if (!data || !id || id === "undefined" || id === "null") {
    throw makeBffError({
      code: "BACKEND_UNAVAILABLE",
      message: "Strategy creation response is missing canonical server id.",
      correlationId: opts.correlationId,
    });
  }

  if (data.state !== "draft") {
    throw makeBffError({
      code: "STATE_CONFLICT",
      message: `Strategy creation must produce a draft record, received state '${String((data as { state?: unknown }).state ?? "")}'.`,
      correlationId: opts.correlationId,
    });
  }

  return data;
}

export interface NonDraftStrategiesOptions {
  hideRetiredPersonas?: boolean;
  /** Include strategies of test/probe personas and synthetic/stub rows (default: hidden). */
  includeTestPersonas?: boolean;
}

export async function listNonDraftStrategies(options?: NonDraftStrategiesOptions): Promise<Strategy[]> {
  return strictLivePaginatedList<Strategy>(
    "strategies.listNonDraft",
    paths.strategies(),
    undefined,
    {
      query: {
        exclude_state: "draft",
        ...(typeof options?.hideRetiredPersonas === "boolean"
          ? { hide_retired_personas: options.hideRetiredPersonas ? "true" : "false" }
          : {}),
        ...(typeof options?.includeTestPersonas === "boolean"
          ? { include_test_personas: options.includeTestPersonas ? "true" : "false" }
          : {}),
      },
    },
  );
}

function metaCount(meta: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  }
  return undefined;
}

function sumDefined(...values: Array<number | undefined>): number | undefined {
  const defined = values.filter((v): v is number => typeof v === "number");
  return defined.length ? defined.reduce((a, b) => a + b, 0) : undefined;
}

/** Hidden-row counts the BFF reports in `meta` for the default (non-draft) strategy slice. */
export interface NonDraftStrategiesHiddenCounts {
  retiredPersona?: number;
  testOrSynthetic?: number;
}

export async function getNonDraftStrategiesHiddenCounts(
  options?: NonDraftStrategiesOptions,
): Promise<NonDraftStrategiesHiddenCounts> {
  const body = await bffFetch<unknown>({
    method: "GET",
    path: paths.strategies(),
    query: {
      exclude_state: "draft",
      page_size: 1,
      hide_retired_personas: options?.hideRetiredPersonas === false ? "false" : "true",
      include_test_personas: options?.includeTestPersonas ? "true" : "false",
    },
  });
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const rawMeta = record.meta;
  const meta = rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta) ? (rawMeta as Record<string, unknown>) : {};
  return {
    retiredPersona: metaCount(meta, "hidden_retired_persona_count"),
    testOrSynthetic: sumDefined(
      metaCount(
        meta,
        "hidden_persona_strategy_count",
        "hidden_test_persona_strategy_count",
        "hidden_test_strategy_count",
        "hidden_synthetic_or_stub_count",
        "hidden_synthetic_count",
      ),
      metaCount(meta, "hidden_unbound_stub_strategy_count"),
    ),
  };
}

export async function listStrategiesForPersona(personaId: string): Promise<Strategy[]> {
  const normalizedPersonaId = String(personaId ?? "").trim();
  if (!normalizedPersonaId) return [];
  return strictLivePaginatedList<Strategy>(
    "strategies.listForPersona",
    paths.strategies(),
    undefined,
    { query: { persona_id: normalizedPersonaId } },
  );
}

export async function getStrategy(id: string): Promise<Strategy | undefined> {
  return strictLiveDetail<Strategy>("strategies.get", paths.strategy(id));
}

export const strategies = {
  listNonDraft: listNonDraftStrategies,
  nonDraftHiddenCounts: getNonDraftStrategiesHiddenCounts,
  listForPersona: listStrategiesForPersona,
  get: getStrategy,
  create: createStrategy,
};
