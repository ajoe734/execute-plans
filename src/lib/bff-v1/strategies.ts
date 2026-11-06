import type { ManagementListMeta, Strategy } from "./dto";
import { bffFetch } from "./client";
import { makeBffError } from "./errors";
import { paths } from "./paths";
import {
  asRecord,
  liveItemsFrom,
  normalizeBaseObjectFields,
  recordString,
  strictLiveDetail,
  strictLivePaginatedList,
} from "./domainReads";

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

export function normalizeStrategyRecord(raw: unknown): Strategy {
  const base = normalizeBaseObjectFields(raw as Strategy);
  const record = asRecord(base) ?? {};
  const rawPersonaIds = Array.isArray(record.personaIds)
    ? record.personaIds
    : Array.isArray(record.persona_ids)
      ? record.persona_ids
      : [];
  const personaIds = rawPersonaIds
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter((id) => id.length > 0);
  const singlePersonaId = recordString(record, "persona_id", "personaId");
  if (singlePersonaId && !personaIds.includes(singlePersonaId)) {
    personaIds.push(singlePersonaId);
  }
  const capitalPoolId = recordString(record, "capitalPoolId", "capital_pool_id") ?? "";
  const alpha = recordString(record, "alpha") ?? "";
  return {
    ...(record as unknown as Strategy),
    personaIds,
    capitalPoolId,
    alpha,
  };
}

export function normalizeStrategyList(body: unknown): Strategy[] {
  return liveItemsFrom<unknown>(body).map(normalizeStrategyRecord);
}

export async function listNonDraftStrategies(): Promise<Strategy[]> {
  return strictLivePaginatedList<Strategy>(
    "strategies.listNonDraft",
    paths.strategies(),
    normalizeStrategyList,
    { query: { exclude_state: "draft" } },
  );
}

export async function listStrategiesForPersona(personaId: string): Promise<Strategy[]> {
  const normalizedPersonaId = String(personaId ?? "").trim();
  if (!normalizedPersonaId) return [];
  return strictLivePaginatedList<Strategy>(
    "strategies.listForPersona",
    paths.strategies(),
    normalizeStrategyList,
    { query: { persona_id: normalizedPersonaId } },
  );
}

export async function getStrategy(id: string): Promise<Strategy | undefined> {
  return strictLiveDetail<Strategy>("strategies.get", paths.strategy(id)).then((item) =>
    item ? normalizeStrategyRecord(item) : undefined,
  );
}

export const strategies = {
  listNonDraft: listNonDraftStrategies,
  listForPersona: listStrategiesForPersona,
  get: getStrategy,
  create: createStrategy,
};
