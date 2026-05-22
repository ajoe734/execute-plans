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
    get: <T>(seedFn: () => T[]): Promise<T[]> =>
      withLiveOrMock<T[]>(
        { method: "GET", path: paths.mgmtPersonaFleet() },
        async () => seedFn(),
        safeAdapt(adaptArrayPassthrough<T>, seedFn),
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
};

export type Mgmt = typeof mgmt;
