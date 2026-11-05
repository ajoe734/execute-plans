import {
  MOCK_ALPHA_FACTORY_ENVELOPE,
  MOCK_DISCOVERED,
  MOCK_REPLICATED,
  MOCK_SCAFFOLDED,
  normalizeAlphaFactoryEnvelope,
  type AlphaFactoryCard,
  type AlphaFactoryData,
  type AlphaFactoryEnvelope,
  type AlphaFactoryLaneId,
  type AlphaFactoryMeta,
} from "@/lib/bff-v1/alphaFactory";

export {
  MOCK_ALPHA_FACTORY_ENVELOPE,
  MOCK_DISCOVERED,
  MOCK_REPLICATED,
  MOCK_SCAFFOLDED,
  type AlphaFactoryCard,
  type AlphaFactoryData,
  type AlphaFactoryEnvelope,
  type AlphaFactoryLaneId,
  type AlphaFactoryMeta,
};

export const ALPHA_FACTORY_COLUMNS = ["discovered", "scaffolded", "replicated"] as const;
export type AlphaFactoryColumn = (typeof ALPHA_FACTORY_COLUMNS)[number];

export interface AlphaFactoryBuckets extends Record<AlphaFactoryColumn, AlphaFactoryCard[]> {
  discovered: AlphaFactoryCard[];
  scaffolded: AlphaFactoryCard[];
  replicated: AlphaFactoryCard[];
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
  for (const surface of Object.values(surfaces)) {
    if (!surfaceIsLive(surface)) return "degraded";
  }
  return "live";
}

function toEnvelopeInput(
  source: AlphaFactoryEnvelope | AlphaFactoryData | readonly unknown[] | null | undefined,
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
        reason: null,
        discovered_reason: null,
      },
      items: [],
    };
  }
  if (Array.isArray(source)) {
    const normalizedFromArray = normalizeAlphaFactoryEnvelope({ items: source });
    if (
      includeMockFixtures &&
      normalizedFromArray.items.length === 0 &&
      normalizedFromArray.data.discovered_reason === null
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

export function buildAlphaFactoryBuckets(
  source?: AlphaFactoryEnvelope | AlphaFactoryData | readonly unknown[] | null,
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
      scaffolded: [],
      replicated: [],
      discoveredReason: null,
    };
  }

  const envelope = normalizeAlphaFactoryEnvelope(toEnvelopeInput(source, includeMockFixtures));

  return {
    discovered: envelope.data.discovered.filter((card) => card.lane === "discovered"),
    scaffolded: envelope.data.scaffolded.filter((card) => card.lane === "scaffolded"),
    replicated: includeReplicated
      ? envelope.data.replicated.filter((card) => card.lane === "replicated")
      : [],
    discoveredReason: envelope.data.discovered_reason,
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
