import {
  ALPHA_FACTORY_COUNT_KEYS,
  MOCK_ALPHA_FACTORY_ENVELOPE,
  MOCK_DISCOVERED,
  MOCK_DOCUMENT_CHECKED,
  MOCK_REPLICATED,
  MOCK_SCAFFOLDED,
  normalizeAlphaFactoryEnvelope,
  type AlphaFactoryAdmissionCard,
  type AlphaFactoryCount,
  type AlphaFactoryCounts,
  type AlphaFactoryPipelineItem,
  type AlphaFactoryCard,
  type AlphaFactoryData,
  type AlphaFactoryEnvelope,
  type AlphaFactoryLaneId,
  type AlphaFactoryMeta,
} from "@/lib/bff-v1/alphaFactory";

export {
  MOCK_ALPHA_FACTORY_ENVELOPE,
  MOCK_DISCOVERED,
  MOCK_DOCUMENT_CHECKED,
  MOCK_REPLICATED,
  MOCK_SCAFFOLDED,
  type AlphaFactoryAdmissionCard,
  type AlphaFactoryCount,
  type AlphaFactoryCounts,
  type AlphaFactoryPipelineItem,
  type AlphaFactoryCard,
  type AlphaFactoryData,
  type AlphaFactoryEnvelope,
  type AlphaFactoryLaneId,
  type AlphaFactoryMeta,
};

export const ALPHA_FACTORY_COLUMNS = ["discovered", "scaffolded", "replicated"] as const;
export type AlphaFactoryColumn = (typeof ALPHA_FACTORY_COLUMNS)[number];

/** A lane's owner read: `ok`, or `unavailable` with the owner's reason (never shown as an empty lane). */
export type AlphaFactoryLaneRead = { status: "ok" } | { status: "unavailable"; reason: string };

export interface AlphaFactoryBuckets {
  /** Open research demands and hypothesis cards (who is looking for what). */
  discovered: AlphaFactoryPipelineItem[];
  /** Legacy admission cards a BFF placed in the discovered lane. */
  discoveredCards: AlphaFactoryAdmissionCard[];
  /** Template searches that ran. */
  searches: AlphaFactoryPipelineItem[];
  /** Admissions whose gate attempt has not completed (failed, queued, pending). */
  scaffolded: AlphaFactoryAdmissionCard[];
  /** Only candidates with an owner-recorded backtest gate pass. */
  replicated: AlphaFactoryAdmissionCard[];
  /** Test and document-check records: completed admissions without a recorded gate pass. */
  documentChecked: AlphaFactoryAdmissionCard[];
  counts: AlphaFactoryCounts;
  reads: {
    demands: AlphaFactoryLaneRead;
    runs: AlphaFactoryLaneRead;
  };
  discoveredReason: string | null;
}

export type AlphaFactorySourceKey = "mock" | "fallback" | "live" | "degraded" | "unverified";

export function classifyAlphaFactorySource(
  live: { mode: "mock" | "live"; effective: "mock" | "live" },
  meta: unknown,
  error?: unknown,
): AlphaFactorySourceKey {
  if (error) return "degraded";

  const record = asRecord(meta);
  const surfaces = asRecord(record?.surfaces);
  const alphaSurface = asRecord(surfaces?.alpha_factory);
  if (alphaSurface && !surfaceIsLive(alphaSurface)) {
    return "degraded";
  }

  if (live.mode === "mock") {
    if (alphaSurface && surfaceIsLive(alphaSurface) && String(alphaSurface.source ?? "") !== "mock_seed") {
      return "live";
    }
    return "mock";
  }
  if (live.effective === "mock") return "fallback";

  if (!record || !surfaces || Object.keys(surfaces).length === 0) return "unverified";
  if (record.staleness || record.degradation) return "degraded";
  if (surfaces.alpha_factory !== undefined) {
    return surfaceIsLive(surfaces.alpha_factory) ? "live" : "degraded";
  }
  for (const [key, surface] of Object.entries(surfaces)) {
    if (key === "alpha_factory_strategy_state") continue;
    if (!surfaceIsLive(surface)) return "degraded";
  }
  return "live";
}

function toEnvelopeInput(
  source: unknown,
  includeMockFixtures: boolean,
): unknown {
  if (source === null || source === undefined) {
    if (includeMockFixtures) {
      return MOCK_ALPHA_FACTORY_ENVELOPE;
    }
    return {
      data: {
        discovered: [],
        scaffolded: [],
        replicated: [],
      },
      items: [],
    };
  }
  if (Array.isArray(source)) {
    const normalizedFromArray = normalizeAlphaFactoryEnvelope({ items: source });
    if (
      includeMockFixtures &&
      normalizedFromArray.items.length === 0 &&
      normalizedFromArray.data.pipeline.discovered.length === 0
    ) {
      return MOCK_ALPHA_FACTORY_ENVELOPE;
    }
    return { items: source };
  }
  if (typeof source === "object" && "data" in source) {
    return source;
  }
  return { data: source };
}

function laneRead(meta: unknown, key: string): AlphaFactoryLaneRead {
  const surface = asRecord(asRecord(asRecord(meta)?.surfaces)?.[key]);
  if (!surface) return { status: "ok" };
  const status = String(surface.status ?? "ok").trim().toLowerCase();
  if (["ok", "fresh", "live"].includes(status)) return { status: "ok" };
  const reason = [surface.reason, surface.message, surface.status]
    .find((value) => typeof value === "string" && value.trim().length > 0);
  return { status: "unavailable", reason: String(reason ?? "unavailable").trim() };
}

const UNAVAILABLE_COUNTS = Object.fromEntries(
  ALPHA_FACTORY_COUNT_KEYS.map((key) => [key, { status: "unavailable", value: null, reason: "not_reported" }]),
) as AlphaFactoryCounts;

export function buildAlphaFactoryBuckets(
  source?: unknown,
  opts: {
    includeMockFixtures?: boolean;
    includeReplicated?: boolean;
    t?: (key: string) => string;
  } = {},
): AlphaFactoryBuckets {
  const includeMockFixtures = opts.includeMockFixtures ?? false;
  const includeReplicated = opts.includeReplicated ?? true;

  if (!includeReplicated && !includeMockFixtures) {
    return {
      discovered: [],
      discoveredCards: [],
      searches: [],
      scaffolded: [],
      replicated: [],
      documentChecked: [],
      counts: UNAVAILABLE_COUNTS,
      reads: { demands: { status: "ok" }, runs: { status: "ok" } },
      discoveredReason: null,
    };
  }

  const envelope = normalizeAlphaFactoryEnvelope(toEnvelopeInput(source, includeMockFixtures));
  const data = envelope.data;

  return {
    discovered: data.pipeline.discovered,
    discoveredCards: data.discovered.filter((card) => card.lane === "discovered"),
    searches: data.pipeline.scaffolded,
    scaffolded: data.scaffolded.filter((card) => card.lane === "scaffolded"),
    replicated: includeReplicated
      ? data.replicated.filter((card) => card.lane === "replicated")
      : [],
    documentChecked: data.document_checked,
    counts: data.counts,
    reads: {
      demands: laneRead(envelope.meta, "alpha_factory_demands"),
      runs: laneRead(envelope.meta, "alpha_factory_runs"),
    },
    discoveredReason: data.discovered_reason,
  };
}

function surfaceIsLive(surface: unknown): boolean {
  if (typeof surface === "string") return ["ok", "fresh", "live"].includes(surface.toLowerCase());
  const record = asRecord(surface);
  if (!record) return false;
  const source = String(record.source ?? "").toLowerCase();
  if (["local_snapshot", "missing", "unverifiable", "unavailable"].includes(source)) return false;
  const status = String(record.status ?? record.state ?? "ok").toLowerCase();
  if (!["ok", "fresh", "live"].includes(status)) return false;
  return !record.staleness && !record.degradation;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
