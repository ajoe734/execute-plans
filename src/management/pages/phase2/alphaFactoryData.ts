import type { Strategy } from "@/lib/bff/types";

export interface AlphaFactoryCard {
  id: string;
  name: string;
  risk: Strategy["risk"];
  alpha?: string;
  sharpe?: number;
  note: string;
}

export const ALPHA_FACTORY_COLUMNS = ["discovered", "scaffolded", "replicated"] as const;
export type AlphaFactoryColumn = typeof ALPHA_FACTORY_COLUMNS[number];
export type AlphaFactoryBuckets = Record<AlphaFactoryColumn, AlphaFactoryCard[]>;
export type AlphaFactorySourceKey = "mock" | "fallback" | "live" | "degraded" | "unverified";

export function classifyAlphaFactorySource(
  live: { mode: "mock" | "live"; effective: "mock" | "live" },
  meta: unknown,
): AlphaFactorySourceKey {
  if (live.mode === "mock") return "mock";
  if (live.effective === "mock") return "fallback";

  const record = asRecord(meta);
  const surfaces = asRecord(record?.surfaces);
  if (!record || !surfaces || Object.keys(surfaces).length === 0) return "unverified";
  if (record.staleness || record.degradation) return "degraded";
  for (const surface of Object.values(surfaces)) {
    if (!surfaceIsLive(surface)) return "degraded";
  }
  return "live";
}

export function buildAlphaFactoryBuckets(
  strategies: Strategy[],
  opts: {
    includeMockFixtures: boolean;
    includeReplicated: boolean;
    t: (key: string) => string;
  },
): AlphaFactoryBuckets {
  const replicated: AlphaFactoryCard[] = opts.includeReplicated ? strategies.slice(0, 4).map((s) => ({
    id: s.id, name: s.name, risk: s.risk, alpha: s.alpha, sharpe: s.sharpe, note: opts.t("alphaFactory.replicated.note"),
  })) : [];
  const scaffolded: AlphaFactoryCard[] = opts.includeMockFixtures ? [
    { id: "cand_011", name: "Short-vol carry (BTC)", risk: "medium", alpha: "vol.carry", sharpe: 1.42, note: opts.t("alphaFactory.scaffolded.note") },
    { id: "cand_012", name: "Cross-venue funding arb", risk: "low", alpha: "fund.arb", sharpe: 1.18, note: opts.t("alphaFactory.scaffolded.note") },
    { id: "cand_013", name: "Sector rotation (US tech)", risk: "high", alpha: "rot.us", sharpe: 0.88, note: opts.t("alphaFactory.scaffolded.note") },
  ] : [];
  const discovered: AlphaFactoryCard[] = opts.includeMockFixtures ? [
    { id: "disc_021", name: "Liquidity-shock divergence", risk: "low", note: opts.t("alphaFactory.discovered.note") },
    { id: "disc_022", name: "Macro surprise momentum", risk: "medium", note: opts.t("alphaFactory.discovered.note") },
    { id: "disc_023", name: "Stablecoin flow imbalance", risk: "medium", note: opts.t("alphaFactory.discovered.note") },
    { id: "disc_024", name: "Options skew reversion", risk: "low", note: opts.t("alphaFactory.discovered.note") },
    { id: "disc_025", name: "On-chain whale accumulation", risk: "high", note: opts.t("alphaFactory.discovered.note") },
  ] : [];

  return { discovered, scaffolded, replicated };
}

function surfaceIsLive(surface: unknown): boolean {
  if (typeof surface === "string") return ["ok", "fresh", "live"].includes(surface.toLowerCase());
  const record = asRecord(surface);
  if (!record) return false;
  const source = String(record.source ?? "").toLowerCase();
  if (["local_snapshot", "missing", "unverifiable"].includes(source)) return false;
  const status = String(record.status ?? record.state ?? "ok").toLowerCase();
  if (!["ok", "fresh", "live"].includes(status)) return false;
  return !record.staleness && !record.degradation;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
