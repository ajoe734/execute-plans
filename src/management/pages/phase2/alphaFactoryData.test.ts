import { describe, expect, it } from "vitest";
import type { Strategy } from "@/lib/bff-v1";
import {
  buildAlphaFactoryBuckets,
  classifyAlphaFactorySource,
  MOCK_ALPHA_FACTORY_ENVELOPE,
  MOCK_REPLICATED,
  MOCK_SCAFFOLDED,
} from "./alphaFactoryData";

const t = (key: string) => key;

const nonReplicatedStrategy: Strategy = {
  id: "strategy-persona-fd1281847a3b1c6a9735",
  name: "background advance verification R4",
  owner: "ops",
  updatedAt: "2026-05-11T00:00:00.000Z",
  state: "deployed",
  risk: "medium",
  alpha: "live.alpha",
  capitalPoolId: "cp_main",
  personaIds: [],
  pnl30d: 0,
  sharpe: 1.1,
  drawdown: 0,
};

describe("buildAlphaFactoryBuckets", () => {
  it("does not show fixture or replicated mock data during live fallback", () => {
    const buckets = buildAlphaFactoryBuckets(MOCK_ALPHA_FACTORY_ENVELOPE, {
      includeMockFixtures: false,
      includeReplicated: false,
      t,
    });

    expect(buckets.discovered).toHaveLength(0);
    expect(buckets.scaffolded).toHaveLength(0);
    expect(buckets.replicated).toHaveLength(0);
  });

  it("keeps fixture candidates available in configured mock mode with the unified AlphaFactoryCard shape", () => {
    const buckets = buildAlphaFactoryBuckets(undefined, {
      includeMockFixtures: true,
      includeReplicated: true,
      t,
    });

    expect(buckets.discovered).toHaveLength(0);
    expect(buckets.discoveredReason).toBe("no_candidate_source");
    expect(buckets.scaffolded).toEqual(MOCK_SCAFFOLDED);
    expect(buckets.replicated).toEqual(MOCK_REPLICATED);
    expect(buckets.replicated[0]).toMatchObject({
      strategy_id: "strat-tw-official:tw_price_daily:TWSE:2330:e4b598d99f084c19-60f9c8a78715",
      authority_task_id: "rtask-20261015-002",
      queue_status: "completed",
    });
  });

  it("never places a strategy list row without a replication record onto the board", () => {
    const buckets = buildAlphaFactoryBuckets([nonReplicatedStrategy], {
      includeMockFixtures: false,
      includeReplicated: true,
      t,
    });

    expect(buckets.discovered).toHaveLength(0);
    expect(buckets.scaffolded).toHaveLength(0);
    expect(buckets.replicated).toHaveLength(0);
  });

  it("preserves null sharpe on replicated records when supplied and omits sharpe when not supplied", () => {
    const withoutSharpe = buildAlphaFactoryBuckets(MOCK_ALPHA_FACTORY_ENVELOPE, {
      includeMockFixtures: false,
      includeReplicated: true,
      t,
    });
    expect(withoutSharpe.replicated).toHaveLength(1);
    expect(withoutSharpe.replicated[0].sharpe).toBeUndefined();

    const withNullSharpe = buildAlphaFactoryBuckets(
      {
        ...MOCK_ALPHA_FACTORY_ENVELOPE,
        data: {
          ...MOCK_ALPHA_FACTORY_ENVELOPE.data,
          replicated: [{ ...MOCK_REPLICATED[0], sharpe: null }],
        },
      },
      {
        includeMockFixtures: false,
        includeReplicated: true,
        t,
      },
    );
    expect(withNullSharpe.replicated).toHaveLength(1);
    expect(withNullSharpe.replicated[0].sharpe).toBeNull();
  });
});

describe("classifyAlphaFactorySource", () => {
  it("classifies local snapshots and unavailable alpha_factory surface as degraded instead of live", () => {
    const snapshotSource = classifyAlphaFactorySource(
      { mode: "live", effective: "live" },
      { surfaces: { strategies: { status: "degraded", source: "local_snapshot" } } },
    );
    expect(snapshotSource).toBe("degraded");

    const unavailableAlphaSurface = classifyAlphaFactorySource(
      { mode: "live", effective: "live" },
      { surfaces: { alpha_factory: { status: "unavailable", source: "research_orchestrator" } } },
    );
    expect(unavailableAlphaSurface).toBe("degraded");

    const errorSource = classifyAlphaFactorySource(
      { mode: "live", effective: "live" },
      { surfaces: { alpha_factory: { status: "ok", source: "research_orchestrator" } } },
      "BFF 502 Bad Gateway",
    );
    expect(errorSource).toBe("degraded");
  });

  it("classifies live fallback as fallback", () => {
    expect(classifyAlphaFactorySource({ mode: "live", effective: "mock" }, undefined)).toBe("fallback");
  });

  it("classifies healthy alpha_factory surface as live", () => {
    expect(
      classifyAlphaFactorySource(
        { mode: "live", effective: "live" },
        { surfaces: { alpha_factory: { status: "ok", source: "research_orchestrator" } } },
      ),
    ).toBe("live");
  });
});
