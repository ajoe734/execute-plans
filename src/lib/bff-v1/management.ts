// 2026-05-22 PM-Live — Management Oversight (PM-1..PM-11) live wiring.
//
// Wraps the 14 `mgmt*` paths defined in paths.ts with `withLiveOrMock`,
// matching the pattern used by lists.ts. Each helper accepts a `seedFn`
// returning the same view-model the pages already render, so Phase 1 mock
// behaviour is preserved byte-for-byte when `VITE_BFF_MODE=mock` or when
// live transport fails under `VITE_BFF_FALLBACK=auto`.
//
// Adapters are defensive: any shape mismatch falls back to the seed.

import { withLiveOrMock } from "./liveTransport";
import { paths } from "./paths";

import {
  composeCockpit, defaultCockpitSeed, type CockpitModel,
} from "@/lib/v5/management/cockpit";
import {
  defaultPulseRankings, type TradingPulseRankBlock,
} from "@/lib/v5/management/tradingRankings";
import type { HumanInboxItem, HumanInboxDetail } from "@/lib/v5/management/humanInbox";
import type { PersonaIntentTrace } from "@/lib/v5/management/personaIntent";
import type { ReadinessPageModel } from "@/lib/v5/management/readiness";
// PM-12 imports
import type {
  PortfolioSummary, CapitalPoolSummaryRow, HoldingRow,
} from "@/lib/v5/management/portfolio";
import type { PersonaLeagueRow } from "@/lib/v5/management/personaLeague";
import type {
  QuarterlyRankingRow, QuarterlyRankingFormula,
} from "@/lib/v5/management/quarterlyRanking";
import type {
  PerformanceAttributionRow, AttributionDimension, AttributionPeriod,
} from "@/lib/v5/management/performanceAttribution";

// ---------- shape guards (extremely defensive) ----------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const unwrap = (raw: unknown): unknown =>
  isObject(raw) && "data" in raw ? (raw as { data: unknown }).data : raw;

const asArray = <T>(raw: unknown): T[] | null =>
  Array.isArray(raw) ? (raw as T[]) : null;

export type ManagementOodaStage = "Observe" | "Orient" | "Decide" | "Act";
export type ManagementAutonomyMode = "manual" | "supervised" | "autonomous";

export interface ManagementPersonaFleetRow {
  personaId: string;
  personaName?: string;
  owner: string;
  ooda: ManagementOodaStage;
  autonomy: ManagementAutonomyMode;
  perfDelta: number;
  humanNeeded: boolean;
  lastMutation: string;
  state?: "draft" | "active" | "paused" | "deprecated" | "retired" | "archived" | string;
  tags?: string[];
  marketScope?: string[];
  currentWork?: string;
}

/** Wraps `body` so adapter errors degrade to seedFn output. */
function safeAdapt<T>(adapt: (raw: unknown) => T | null, seedFn: () => T) {
  return (raw: unknown): T => {
    try {
      const out = adapt(raw);
      return out ?? seedFn();
    } catch {
      return seedFn();
    }
  };
}

const asString = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const asFiniteNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const asBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(text)) return true;
  if (["0", "false", "no", "n"].includes(text)) return false;
  return fallback;
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => asString(item)).filter(Boolean)
    : [];

const normalizeOoda = (value: unknown): ManagementOodaStage => {
  const stage = asString(value).toLowerCase();
  if (stage.startsWith("orient")) return "Orient";
  if (stage.startsWith("decid")) return "Decide";
  if (stage.startsWith("act")) return "Act";
  return "Observe";
};

const normalizeAutonomy = (value: unknown): ManagementAutonomyMode => {
  const mode = asString(value).toLowerCase();
  if (mode === "autonomous") return "autonomous";
  if (mode === "manual") return "manual";
  return "supervised";
};

function firstArrayValue(...values: unknown[]): unknown[] | null {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

function adaptPersonaFleetRow(value: unknown): ManagementPersonaFleetRow | null {
  if (!isObject(value)) return null;
  const metrics = isObject(value.metrics) ? value.metrics : {};
  const personaId = asString(value.personaId ?? value.persona_id ?? value.id);
  if (!personaId) return null;

  const explicitDelta = value.perfDelta ?? value.perf_delta;
  const trainingImprovement = metrics.training_improvement_pct ?? metrics.trainingImprovementPct;
  const perfDelta = Number.isFinite(Number(explicitDelta))
    ? asFiniteNumber(explicitDelta)
    : asFiniteNumber(trainingImprovement) / 100;

  const recommendation = asString(value.recommendation).toLowerCase();
  const governanceRequired = asBoolean(value.governanceRequired ?? value.governance_required, false);
  const humanNeeded = asBoolean(
    value.humanNeeded ?? value.human_needed,
    governanceRequired && !["", "none", "no_change"].includes(recommendation),
  );

  const updated = asString(value.lastMutation ?? value.last_mutation ?? value.updatedAt ?? value.updated_at, "unknown");

  return {
    personaId,
    personaName: asString(value.personaName ?? value.persona_name ?? value.name, personaId),
    owner: asString(value.owner ?? value.owner_id ?? value.capitalPoolId ?? value.capital_pool_id, "pathreon-management"),
    ooda: normalizeOoda(value.ooda ?? value.oodaStage ?? value.ooda_stage),
    autonomy: normalizeAutonomy(value.autonomy),
    perfDelta: Number.isFinite(perfDelta) ? perfDelta : 0,
    humanNeeded,
    lastMutation: updated.length >= 10 ? updated.slice(0, 10) : updated,
    state: asString(value.state ?? value.lifecycleState ?? value.lifecycle_state ?? value.status),
    tags: asStringArray(value.tags),
    marketScope: asStringArray(value.marketScope ?? value.market_scope),
    currentWork: asString(value.currentWork ?? value.current_work),
  };
}

export function adaptManagementPersonaFleet(raw: unknown): ManagementPersonaFleetRow[] | null {
  const data = unwrap(raw);
  const nested = isObject(data) ? unwrap(data) : data;
  const arr = firstArrayValue(
    nested,
    isObject(nested) ? nested.items : undefined,
    isObject(nested) ? nested.persona_fleet : undefined,
    isObject(nested) ? nested.personaFleet : undefined,
    isObject(data) ? data.items : undefined,
    isObject(data) ? data.persona_fleet : undefined,
    isObject(data) ? data.personaFleet : undefined,
  );
  if (!arr) return null;
  const rows = arr.map(adaptPersonaFleetRow).filter((row): row is ManagementPersonaFleetRow => row !== null);
  return rows.length > 0 ? rows : null;
}

// ---------- PM-3 Cockpit ----------

export type CockpitSeedFn = () => CockpitModel;
const defaultCockpit = (): CockpitModel => composeCockpit(defaultCockpitSeed());

function adaptCockpit(raw: unknown): CockpitModel | null {
  const data = unwrap(raw);
  if (!isObject(data)) return null;
  if (!isObject(data.strip) || !isObject(data.loopFlow) || !isObject(data.matrix)) {
    return null;
  }
  // Live BFF is expected to already match CockpitModel shape; trust + cast.
  return data as unknown as CockpitModel;
}

// ---------- PM-6 Human Inbox ----------

export type InboxListSeedFn = () => HumanInboxItem[];
export type InboxItemSeedFn = () => HumanInboxDetail;

function adaptInboxList(raw: unknown): HumanInboxItem[] | null {
  const data = unwrap(raw);
  const arr = asArray<HumanInboxItem>(data) ??
              (isObject(data) ? asArray<HumanInboxItem>(data.items) : null);
  return arr;
}
function adaptInboxItem(raw: unknown): HumanInboxDetail | null {
  const data = unwrap(raw);
  return isObject(data) ? (data as unknown as HumanInboxDetail) : null;
}

// ---------- PM-4 Trading Pulse ----------

function adaptRankings(raw: unknown): TradingPulseRankBlock[] | null {
  const data = unwrap(raw);
  return asArray<TradingPulseRankBlock>(data) ??
         (isObject(data) ? asArray<TradingPulseRankBlock>(data.blocks ?? data.items) : null);
}

// ---------- PM-7 Persona Fleet / PM-11 Evolution / PM-1 Evidence ----------
// All three are array-of-row view-models. Adapters share shape.

function adaptArrayPassthrough<T>(raw: unknown): T[] | null {
  const data = unwrap(raw);
  return asArray<T>(data) ??
         (isObject(data) ? asArray<T>(data.items) : null);
}

// ---------- Persona Intent ----------

function adaptIntent(raw: unknown): PersonaIntentTrace[] | null {
  return adaptArrayPassthrough<PersonaIntentTrace>(raw);
}

// ---------- Readiness ----------

function adaptReadiness(raw: unknown): ReadinessPageModel | null {
  const data = unwrap(raw);
  if (!isObject(data)) return null;
  if (!isObject(data.header) || !Array.isArray(data.checklist)) return null;
  return data as unknown as ReadinessPageModel;
}

// ---------- public mgmt façade ----------

export const mgmt = {
  cockpit: {
    get: (seedFn: CockpitSeedFn = defaultCockpit): Promise<CockpitModel> =>
      withLiveOrMock<CockpitModel>(
        { method: "GET", path: paths.mgmtCockpit() },
        async () => seedFn(),
        safeAdapt(adaptCockpit, seedFn),
      ),
  },

  humanInbox: {
    list: (seedFn: InboxListSeedFn): Promise<HumanInboxItem[]> =>
      withLiveOrMock<HumanInboxItem[]>(
        { method: "GET", path: paths.mgmtHumanInbox() },
        async () => seedFn(),
        safeAdapt(adaptInboxList, seedFn),
      ),
    get: (id: string, seedFn: InboxItemSeedFn): Promise<HumanInboxDetail> =>
      withLiveOrMock<HumanInboxDetail>(
        { method: "GET", path: paths.mgmtHumanInboxItem(id) },
        async () => seedFn(),
        safeAdapt(adaptInboxItem, seedFn),
      ),
  },

  tradingPulse: {
    rankings: (seedFn: () => TradingPulseRankBlock[] = defaultPulseRankings):
      Promise<TradingPulseRankBlock[]> =>
      withLiveOrMock<TradingPulseRankBlock[]>(
        { method: "GET", path: paths.mgmtTradingRankings() },
        async () => seedFn(),
        safeAdapt(adaptRankings, seedFn),
      ),
    /** PM-4 main pulse rows — passthrough array. */
    get: <T>(seedFn: () => T[]): Promise<T[]> =>
      withLiveOrMock<T[]>(
        { method: "GET", path: paths.mgmtTradingPulse() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<T>, seedFn),
      ),
  },

  personaFleet: {
    get: (
      seedFn: () => ManagementPersonaFleetRow[],
    ): Promise<ManagementPersonaFleetRow[]> =>
      withLiveOrMock<ManagementPersonaFleetRow[], unknown>(
        { method: "GET", path: paths.mgmtPersonaFleet() },
        async () => seedFn(),
        safeAdapt(adaptManagementPersonaFleet, seedFn),
      ),
  },

  evolutionJournal: {
    list: <T>(seedFn: () => T[]): Promise<T[]> =>
      withLiveOrMock<T[]>(
        { method: "GET", path: paths.mgmtEvolutionJournal() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<T>, seedFn),
      ),
  },

  evidence: {
    list: <T>(seedFn: () => T[]): Promise<T[]> =>
      withLiveOrMock<T[]>(
        { method: "GET", path: paths.mgmtEvidenceExplorer() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<T>, seedFn),
      ),
  },

  personaIntent: {
    list: (seedFn: () => PersonaIntentTrace[]): Promise<PersonaIntentTrace[]> =>
      withLiveOrMock<PersonaIntentTrace[]>(
        { method: "GET", path: paths.mgmtPersonaIntent() },
        async () => seedFn(),
        safeAdapt(adaptIntent, seedFn),
      ),
  },

  readiness: {
    ep5: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessEp5() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
    brokerLive: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessBrokerLive() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
    capitalBinding: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessCapitalBinding() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
    bffHa: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessBffHa() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
    strictPublish: (seedFn: () => ReadinessPageModel): Promise<ReadinessPageModel> =>
      withLiveOrMock<ReadinessPageModel>(
        { method: "GET", path: paths.mgmtReadinessStrictPublish() },
        async () => seedFn(),
        safeAdapt(adaptReadiness, seedFn),
      ),
  },

  // ---------- PM-12 ----------

  portfolioBook: {
    summary: (seedFn: () => PortfolioSummary): Promise<PortfolioSummary> =>
      withLiveOrMock<PortfolioSummary>(
        { method: "GET", path: paths.mgmtPortfolioBook() },
        async () => seedFn(),
        safeAdapt((raw) => {
          const data = unwrap(raw);
          return isObject(data) && "totalNav" in data ? (data as unknown as PortfolioSummary) : null;
        }, seedFn),
      ),
    pools: (seedFn: () => CapitalPoolSummaryRow[]): Promise<CapitalPoolSummaryRow[]> =>
      withLiveOrMock<CapitalPoolSummaryRow[]>(
        { method: "GET", path: paths.mgmtPortfolioPools() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<CapitalPoolSummaryRow>, seedFn),
      ),
    holdings: (seedFn: () => HoldingRow[]): Promise<HoldingRow[]> =>
      withLiveOrMock<HoldingRow[]>(
        { method: "GET", path: paths.mgmtPortfolioHoldings() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<HoldingRow>, seedFn),
      ),
  },

  personaLeague: {
    list: (seedFn: () => PersonaLeagueRow[]): Promise<PersonaLeagueRow[]> =>
      withLiveOrMock<PersonaLeagueRow[]>(
        { method: "GET", path: paths.mgmtPersonaLeague() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<PersonaLeagueRow>, seedFn),
      ),
    rankings: (seedFn: () => PersonaLeagueRow[]): Promise<PersonaLeagueRow[]> =>
      withLiveOrMock<PersonaLeagueRow[]>(
        { method: "GET", path: paths.mgmtPersonaLeagueRankings() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<PersonaLeagueRow>, seedFn),
      ),
    tiers: <T>(seedFn: () => T): Promise<T> =>
      withLiveOrMock<T>(
        { method: "GET", path: paths.mgmtPersonaLeagueTiers() },
        async () => seedFn(),
        safeAdapt((raw) => {
          const data = unwrap(raw);
          return isObject(data) ? (data as unknown as T) : null;
        }, seedFn),
      ),
  },

  quarterlyRanking: {
    list: (quarter: string | undefined, seedFn: () => QuarterlyRankingRow[]): Promise<QuarterlyRankingRow[]> =>
      withLiveOrMock<QuarterlyRankingRow[]>(
        { method: "GET", path: paths.mgmtQuarterlyRanking(quarter) },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<QuarterlyRankingRow>, seedFn),
      ),
    formula: (seedFn: () => QuarterlyRankingFormula): Promise<QuarterlyRankingFormula> =>
      withLiveOrMock<QuarterlyRankingFormula>(
        { method: "GET", path: paths.mgmtQuarterlyRankingFormula() },
        async () => seedFn(),
        safeAdapt((raw) => {
          const data = unwrap(raw);
          return isObject(data) && "weights" in data
            ? (data as unknown as QuarterlyRankingFormula) : null;
        }, seedFn),
      ),
    recommendations: (
      quarter: string | undefined,
      seedFn: () => QuarterlyRankingRow[],
    ): Promise<QuarterlyRankingRow[]> =>
      withLiveOrMock<QuarterlyRankingRow[]>(
        { method: "GET", path: paths.mgmtQuarterlyRankingRecommendations(quarter) },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<QuarterlyRankingRow>, seedFn),
      ),
  },

  performanceAttribution: {
    list: (
      dimension: AttributionDimension | undefined,
      period: AttributionPeriod | undefined,
      seedFn: () => PerformanceAttributionRow[],
    ): Promise<PerformanceAttributionRow[]> =>
      withLiveOrMock<PerformanceAttributionRow[]>(
        { method: "GET", path: paths.mgmtPerformanceAttribution(dimension, period) },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<PerformanceAttributionRow>, seedFn),
      ),
  },
};

export type Mgmt = typeof mgmt;
