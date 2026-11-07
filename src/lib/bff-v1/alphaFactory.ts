import { detectMode } from "./client";
import { asRecord, strictLiveRead, type UnknownRecord } from "./domainReads";
import type {
  AlphaFactoryCard,
  AlphaFactoryData,
  AlphaFactoryEnvelope,
  AlphaFactoryLane,
  AlphaFactoryLaneId,
  AlphaFactoryMeta,
  AlphaFactoryPageInfo,
  ManagementSurfaceState,
  RiskLevel,
} from "./dto";
import { BffError } from "./errors";
import { paths } from "./paths";

export type {
  AlphaFactoryCard,
  AlphaFactoryData,
  AlphaFactoryEnvelope,
  AlphaFactoryLane,
  AlphaFactoryLaneId,
  AlphaFactoryMeta,
  AlphaFactoryPageInfo,
} from "./dto";

export interface AlphaFactoryQuery {
  lane?: AlphaFactoryLaneId | string;
  page?: number;
  pageSize?: number;
  page_size?: number;
}

const VALID_LANES = new Set<AlphaFactoryLaneId>(["discovered", "scaffolded", "replicated"]);
const VALID_RISK_LEVELS = new Set<RiskLevel>(["info", "low", "medium", "high", "critical"]);

function cleanString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function nullableInt(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === "boolean") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nullableStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map((item) => cleanString(item))
    .filter((item): item is string => item !== null);
}

function normalizeLaneId(value: unknown, fallback: AlphaFactoryLaneId = "scaffolded"): AlphaFactoryLaneId {
  const cleaned = cleanString(value)?.toLowerCase() as AlphaFactoryLaneId | undefined;
  if (cleaned && VALID_LANES.has(cleaned)) {
    return cleaned;
  }
  return fallback;
}

function normalizeOptionalSharpe(record: UnknownRecord): { hasSharpe: boolean; sharpe: number | null } {
  if (!Object.prototype.hasOwnProperty.call(record, "sharpe")) {
    return { hasSharpe: false, sharpe: null };
  }
  const raw = record.sharpe;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { hasSharpe: true, sharpe: raw };
  }
  return { hasSharpe: true, sharpe: null };
}

function normalizeOptionalRisk(record: UnknownRecord): { hasRisk: boolean; risk: RiskLevel | null } {
  const key = Object.prototype.hasOwnProperty.call(record, "risk")
    ? "risk"
    : Object.prototype.hasOwnProperty.call(record, "risk_level")
      ? "risk_level"
      : Object.prototype.hasOwnProperty.call(record, "riskLevel")
        ? "riskLevel"
        : null;
  if (!key) {
    return { hasRisk: false, risk: null };
  }
  const cleaned = cleanString(record[key])?.toLowerCase() as RiskLevel | undefined;
  if (cleaned && VALID_RISK_LEVELS.has(cleaned)) {
    return { hasRisk: true, risk: cleaned };
  }
  return { hasRisk: true, risk: null };
}

export function normalizeAlphaFactoryCard(
  raw: unknown,
  defaultLane: AlphaFactoryLaneId = "scaffolded",
): AlphaFactoryCard | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;

  const admissionId = cleanString(record.admission_id ?? record.admissionId);
  const strategySpecId = cleanString(record.strategy_spec_id ?? record.strategySpecId);
  const strategyId = cleanString(record.strategy_id ?? record.strategyId);
  const id = cleanString(record.id) ?? admissionId ?? strategySpecId ?? strategyId;
  if (!id) return undefined;

  const lane = normalizeLaneId(record.lane, defaultLane);
  const admissionStatus = cleanString(record.admission_status ?? record.admissionStatus ?? record.status);
  const status = cleanString(record.status ?? record.admission_status ?? record.admissionStatus);
  const queueStatus = cleanString(record.queue_status ?? record.queueStatus);

  const { hasSharpe, sharpe } = normalizeOptionalSharpe(record);
  const { hasRisk, risk } = normalizeOptionalRisk(record);

  const card: AlphaFactoryCard = {
    id,
    admission_id: admissionId,
    tenant_id: cleanString(record.tenant_id ?? record.tenantId),
    lane,
    strategy_id: strategyId,
    strategy_spec_id: strategySpecId,
    spec_version: cleanString(record.spec_version ?? record.specVersion),
    checksum: cleanString(record.checksum),
    approval_decision_id: cleanString(record.approval_decision_id ?? record.approvalDecisionId),
    approver: cleanString(record.approver),
    approved_at: cleanString(record.approved_at ?? record.approvedAt),
    requested_by: cleanString(record.requested_by ?? record.requestedBy),
    review_ref: cleanString(record.review_ref ?? record.reviewRef),
    mode: cleanString(record.mode),
    created_at: cleanString(record.created_at ?? record.createdAt),
    status,
    admission_status: admissionStatus,
    queue_status: queueStatus,
    enqueued_at: cleanString(record.enqueued_at ?? record.enqueuedAt),
    enqueued_by: cleanString(record.enqueued_by ?? record.enqueuedBy),
    attempt_count: nullableInt(record.attempt_count ?? record.attemptCount),
    max_attempts: nullableInt(record.max_attempts ?? record.maxAttempts),
    experiment_task_id: cleanString(record.experiment_task_id ?? record.experimentTaskId),
    experiment_run_ids: nullableStringArray(record.experiment_run_ids ?? record.experimentRunIds),
    authority_task_id: cleanString(record.authority_task_id ?? record.authorityTaskId),
    authority_run_ids: nullableStringArray(record.authority_run_ids ?? record.authorityRunIds),
    last_revalidation_at: cleanString(record.last_revalidation_at ?? record.lastRevalidationAt),
    last_error: cleanString(record.last_error ?? record.lastError),
  };

  if (hasSharpe) {
    card.sharpe = sharpe;
  }
  if (hasRisk) {
    card.risk = risk;
  }

  return card;
}

export const MOCK_REPLICATED: readonly AlphaFactoryCard[] = [
  {
    id: "adm-replicated-2330",
    admission_id: "adm-replicated-2330",
    tenant_id: "default",
    lane: "replicated",
    strategy_id: "strat-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-60f9c8a78715",
    strategy_spec_id: "reg-strategy-spec-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-da7cb8297afb",
    spec_version: "1.0.0",
    checksum: "sha256:2330",
    approval_decision_id: "apr-2330",
    approver: "pantheon-dev-approver",
    approved_at: "2026-08-14T01:00:00Z",
    requested_by: "pantheon-dev-operator",
    review_ref: "mrev-2330",
    mode: "paper",
    created_at: "2026-08-14T01:05:00Z",
    status: "admitted",
    admission_status: "admitted",
    queue_status: "completed",
    enqueued_at: "2026-08-14T01:06:00Z",
    enqueued_by: "pantheon-dev-operator",
    attempt_count: 1,
    max_attempts: 2,
    experiment_task_id: "rtask-20260814-001",
    experiment_run_ids: ["rrun-20260814-001", "rrun-20260901-004"],
    authority_task_id: "rtask-20261015-002",
    authority_run_ids: ["rrun-20261015-002"],
    last_revalidation_at: "2026-10-15T08:30:00Z",
    last_error: null,
  },
];

export const MOCK_SCAFFOLDED: readonly AlphaFactoryCard[] = [
  {
    id: "adm-scaffolded-2317",
    admission_id: "adm-scaffolded-2317",
    tenant_id: "default",
    lane: "scaffolded",
    strategy_id: "strat-tw-official:tw_price_daily:TWSE:2317:9a8b7c6d5e4f3a2b-112233445566",
    strategy_spec_id: "reg-strategy-spec-tw-official:tw_price_daily:TWSE:2317:9a8b7c6d5e4f3a2b-665544332211",
    spec_version: "1.0.0",
    checksum: "sha256:2317",
    approval_decision_id: "apr-2317",
    approver: "pantheon-dev-approver",
    approved_at: "2026-08-15T02:00:00Z",
    requested_by: "pantheon-dev-operator",
    review_ref: "mrev-2317",
    mode: "paper",
    created_at: "2026-08-15T02:05:00Z",
    status: "admitted",
    admission_status: "admitted",
    queue_status: "failed",
    enqueued_at: "2026-08-15T02:06:00Z",
    enqueued_by: "pantheon-dev-operator",
    attempt_count: 2,
    max_attempts: 2,
    experiment_task_id: "rtask-20260815-003",
    experiment_run_ids: ["rrun-20260815-003"],
    authority_task_id: null,
    authority_run_ids: [],
    last_revalidation_at: null,
    last_error: "backtest window incomplete",
  },
  {
    id: "adm-pending-2454",
    admission_id: "adm-pending-2454",
    tenant_id: "default",
    lane: "scaffolded",
    strategy_id: "strat-tw-official:tw_price_daily:TWSE:2454:1122334455667788-aabbccddeeff",
    strategy_spec_id: "reg-strategy-spec-tw-official:tw_price_daily:TWSE:2454:1122334455667788-ffeeddccbbaa",
    spec_version: "1.0.0",
    checksum: "sha256:2454",
    approval_decision_id: "apr-2454",
    approver: "pantheon-dev-approver",
    approved_at: "2026-08-16T03:00:00Z",
    requested_by: "pantheon-dev-operator",
    review_ref: "mrev-2454",
    mode: "paper",
    created_at: "2026-08-16T03:05:00Z",
    status: "admitted",
    admission_status: "admitted",
    queue_status: null,
    enqueued_at: null,
    enqueued_by: null,
    attempt_count: null,
    max_attempts: null,
    experiment_task_id: null,
    experiment_run_ids: null,
    authority_task_id: null,
    authority_run_ids: null,
    last_revalidation_at: null,
    last_error: null,
  },
];

export const MOCK_DISCOVERED: readonly AlphaFactoryCard[] = [];

export const MOCK_ALPHA_FACTORY_ENVELOPE: AlphaFactoryEnvelope = {
  data: {
    id: "alpha-factory",
    snapshotAt: "2026-11-04T00:00:00Z",
    snapshot_at: "2026-11-04T00:00:00Z",
    reason: "no_candidate_source",
    discovered_reason: "no_candidate_source",
    lanes: [
      {
        id: "discovered",
        label: "Discovered",
        reason: "no_candidate_source",
        items: [...MOCK_DISCOVERED],
      },
      {
        id: "scaffolded",
        label: "Scaffolded",
        items: [...MOCK_SCAFFOLDED],
      },
      {
        id: "replicated",
        label: "Replicated",
        items: [...MOCK_REPLICATED],
      },
    ],
    discovered: [...MOCK_DISCOVERED],
    scaffolded: [...MOCK_SCAFFOLDED],
    replicated: [...MOCK_REPLICATED],
    items: [...MOCK_REPLICATED, ...MOCK_SCAFFOLDED],
  },
  items: [...MOCK_REPLICATED, ...MOCK_SCAFFOLDED],
  page_info: {
    page: 1,
    page_size: 20,
    total: MOCK_REPLICATED.length + MOCK_SCAFFOLDED.length,
    next_page_token: null,
  },
  meta: {
    snapshot_at: "2026-11-04T00:00:00Z",
    surfaces: {
      alpha_factory: {
        status: "ok",
        source: "mock_seed",
      },
    },
    filters: {
      lane: null,
    },
    discovered: {
      reason: "no_candidate_source",
    },
  },
};

function isGenericRegistryMockFallback(raw: unknown): boolean {
  if (detectMode() !== "mock") return false;
  const root = asRecord(raw);
  if (!root) return false;
  const data = asRecord(root.data);
  const meta = asRecord(root.meta);
  if (data?.lanes || data?.replicated || data?.scaffolded || data?.discovered || meta?.surfaces) {
    return false;
  }
  const items = Array.isArray(root.items) ? root.items : [];
  if (items.length === 1) {
    const first = asRecord(items[0]);
    if (first?.id === "stg_001" && first?.lane === undefined && first?.admission_id === undefined) {
      return true;
    }
  }
  return false;
}

function normalizeCardsForLane(
  rawList: unknown[] | undefined,
  lane: AlphaFactoryLaneId,
): AlphaFactoryCard[] {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .map((item) => normalizeAlphaFactoryCard(item, lane))
    .filter((card): card is AlphaFactoryCard => Boolean(card) && card.lane === lane);
}

export function normalizeAlphaFactoryEnvelope(raw: unknown): AlphaFactoryEnvelope {
  if (isGenericRegistryMockFallback(raw)) {
    return normalizeAlphaFactoryEnvelope(MOCK_ALPHA_FACTORY_ENVELOPE);
  }

  const root = asRecord(raw) ?? {};
  const data = asRecord(root.data) ?? {};
  const meta = asRecord(root.meta) ?? {};
  const pageInfo = asRecord(root.page_info) ?? asRecord(data.page_info) ?? {};

  const rawLanes = Array.isArray(data.lanes)
    ? data.lanes
    : Array.isArray(root.lanes)
      ? root.lanes
      : [];

  const findLaneRecord = (laneId: AlphaFactoryLaneId): UnknownRecord | undefined => {
    for (const entry of rawLanes) {
      const rec = asRecord(entry);
      if (cleanString(rec?.id)?.toLowerCase() === laneId) {
        return rec;
      }
    }
    return undefined;
  };

  const discoveredLaneRec = findLaneRecord("discovered");
  const scaffoldedLaneRec = findLaneRecord("scaffolded");
  const replicatedLaneRec = findLaneRecord("replicated");

  const flatRawItems = Array.isArray(root.items)
    ? root.items
    : Array.isArray(data.items)
      ? data.items
      : Array.isArray(raw)
        ? raw
        : [];

  const flatNormalized = flatRawItems
    .map((item) => {
      const rec = asRecord(item);
      if (!rec || !cleanString(rec.lane)) return undefined;
      return normalizeAlphaFactoryCard(rec);
    })
    .filter((card): card is AlphaFactoryCard => Boolean(card));

  const discovered = Array.isArray(data.discovered)
    ? normalizeCardsForLane(data.discovered, "discovered")
    : Array.isArray(discoveredLaneRec?.items)
      ? normalizeCardsForLane(discoveredLaneRec.items, "discovered")
      : flatNormalized.filter((card) => card.lane === "discovered");

  const scaffolded = Array.isArray(data.scaffolded)
    ? normalizeCardsForLane(data.scaffolded, "scaffolded")
    : Array.isArray(scaffoldedLaneRec?.items)
      ? normalizeCardsForLane(scaffoldedLaneRec.items, "scaffolded")
      : flatNormalized.filter((card) => card.lane === "scaffolded");

  const replicated = Array.isArray(data.replicated)
    ? normalizeCardsForLane(data.replicated, "replicated")
    : Array.isArray(replicatedLaneRec?.items)
      ? normalizeCardsForLane(replicatedLaneRec.items, "replicated")
      : flatNormalized.filter((card) => card.lane === "replicated");

  const discoveredMeta = asRecord(meta.discovered);
  const discoveredReason =
    cleanString(data.discovered_reason ?? data.discoveredReason) ??
    cleanString(data.reason) ??
    cleanString(discoveredLaneRec?.reason) ??
    cleanString(discoveredMeta?.reason) ??
    null;

  const snapshotAt =
    cleanString(data.snapshot_at ?? data.snapshotAt) ??
    cleanString(meta.snapshot_at ?? meta.snapshotAt) ??
    null;

  const combinedItems =
    flatNormalized.length > 0
      ? flatNormalized
      : [...replicated, ...scaffolded, ...discovered];

  const rawSurfaces = asRecord(meta.surfaces) ?? {};
  const normalizedSurfaces: Record<string, ManagementSurfaceState> = {};
  for (const [key, value] of Object.entries(rawSurfaces)) {
    const surfaceRec = asRecord(value);
    if (!surfaceRec) continue;
    normalizedSurfaces[key] = {
      ...surfaceRec,
      status: cleanString(surfaceRec.status) ?? "unknown",
      source: cleanString(surfaceRec.source) ?? undefined,
      message: cleanString(surfaceRec.message) ?? undefined,
      reason: cleanString(surfaceRec.reason) ?? undefined,
    };
  }

  if (!normalizedSurfaces.alpha_factory) {
    const fallbackStatus = cleanString(meta.status ?? data.status) ?? "ok";
    const fallbackSource = cleanString(meta.source ?? data.source) ?? "research_orchestrator";
    normalizedSurfaces.alpha_factory = {
      status: fallbackStatus,
      source: fallbackSource,
      ...(cleanString(meta.message ?? data.message)
        ? { message: cleanString(meta.message ?? data.message) ?? undefined }
        : {}),
      ...(cleanString(meta.reason) ? { reason: cleanString(meta.reason) ?? undefined } : {}),
    };
  }

  const rawFilters = asRecord(meta.filters);
  const filterLane = cleanString(rawFilters?.lane)?.toLowerCase() as AlphaFactoryLaneId | undefined;

  const page = nullableInt(pageInfo.page) ?? 1;
  const pageSize = nullableInt(pageInfo.page_size ?? pageInfo.pageSize) ?? 20;
  const total = nullableInt(pageInfo.total) ?? combinedItems.length;
  const nextPageToken = cleanString(pageInfo.next_page_token ?? pageInfo.nextPageToken);

  return {
    data: {
      id: cleanString(data.id) ?? "alpha-factory",
      snapshotAt,
      snapshot_at: snapshotAt,
      reason: cleanString(data.reason) ?? discoveredReason,
      discovered_reason: discoveredReason,
      lanes: [
        {
          id: "discovered",
          label: cleanString(discoveredLaneRec?.label) ?? "Discovered",
          reason: discoveredReason,
          items: discovered,
        },
        {
          id: "scaffolded",
          label: cleanString(scaffoldedLaneRec?.label) ?? "Scaffolded",
          items: scaffolded,
        },
        {
          id: "replicated",
          label: cleanString(replicatedLaneRec?.label) ?? "Replicated",
          items: replicated,
        },
      ],
      discovered,
      scaffolded,
      replicated,
      items: combinedItems,
    },
    items: combinedItems,
    page_info: {
      page,
      page_size: pageSize,
      total,
      next_page_token: nextPageToken,
    },
    meta: {
      ...meta,
      snapshot_at: snapshotAt ?? undefined,
      surfaces: normalizedSurfaces,
      filters: {
        lane: filterLane && VALID_LANES.has(filterLane) ? filterLane : null,
      },
      discovered: {
        reason: discoveredReason,
      },
    },
  };
}

function buildMockEnvelopeForQuery(query?: AlphaFactoryQuery): AlphaFactoryEnvelope {
  const base = normalizeAlphaFactoryEnvelope(MOCK_ALPHA_FACTORY_ENVELOPE);
  const laneFilter = cleanString(query?.lane)?.toLowerCase() as AlphaFactoryLaneId | undefined;
  if (!laneFilter || !VALID_LANES.has(laneFilter)) {
    return base;
  }
  const filteredItems = base.items.filter((item) => item.lane === laneFilter);
  return {
    ...base,
    data: {
      ...base.data,
      items: filteredItems,
    },
    items: filteredItems,
    page_info: {
      ...base.page_info,
      total: filteredItems.length,
    },
    meta: {
      ...base.meta,
      filters: {
        lane: laneFilter,
      },
    },
  };
}

export async function getAlphaFactory(
  query?: AlphaFactoryQuery,
  opts?: { signal?: AbortSignal },
): Promise<AlphaFactoryEnvelope> {
  try {
    return await strictLiveRead<AlphaFactoryEnvelope>(
      "alphaFactory.get",
      {
        method: "GET",
        path: paths.alphaFactory(query),
        signal: opts?.signal,
      },
      normalizeAlphaFactoryEnvelope,
    );
  } catch (err) {
    if (
      detectMode() === "mock" &&
      err instanceof BffError &&
      err.code === "RESOURCE_NOT_FOUND" &&
      err.message.startsWith("No mock for GET /bff/alpha-factory")
    ) {
      return buildMockEnvelopeForQuery(query);
    }
    throw err;
  }
}

export const alphaFactory = {
  get: getAlphaFactory,
  read: getAlphaFactory,
  list: getAlphaFactory,
};
