import { describe, expect, it } from "vitest";
import type { Strategy } from "@/lib/bff-v1";
import { normalizeAlphaFactoryEnvelope } from "@/lib/bff-v1/alphaFactory";
import {
  buildAlphaFactoryBuckets,
  classifyAlphaFactorySource,
  MOCK_ALPHA_FACTORY_ENVELOPE,
  MOCK_DOCUMENT_CHECKED,
  MOCK_SCAFFOLDED,
} from "./alphaFactoryData";

const passedCard = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  admission_id: id,
  lane: "replicated",
  strategy_id: `strat-${id}`,
  status: "admitted",
  queue_status: "completed",
  gate: { passed: true, source: "owner_run_gate" },
  ...extra,
});

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

  it("keeps the sample pipeline in configured mock mode: demands, a failed search, attempts, no pass", () => {
    const buckets = buildAlphaFactoryBuckets(undefined, {
      includeMockFixtures: true,
      includeReplicated: true,
      t,
    });

    expect(buckets.discovered.map((item) => item.kind)).toEqual(["research_demand", "research_demand"]);
    expect(buckets.discovered[0]).toMatchObject({
      demand_id: "rd-mock-momentum-breadth",
      display_name: "Momentum Scout",
      short_measure: "effective_bets",
      missing_datasets: ["tw_margin_daily"],
      latest_reason_code: "mandate_universe_missing",
    });
    expect(buckets.searches).toHaveLength(1);
    expect(buckets.searches[0]).toMatchObject({
      kind: "template_search",
      attempt_count: 3,
      outcome: "failed",
      latest_reason_code: "mandate_universe_missing",
    });
    expect(buckets.scaffolded).toEqual(MOCK_SCAFFOLDED);
    expect(buckets.replicated).toHaveLength(0);
    expect(buckets.documentChecked).toEqual(MOCK_DOCUMENT_CHECKED);
    expect(buckets.documentChecked.map((c) => c.document_check_reason)).toEqual([
      "no_passing_gate_result",
      "simulation_or_raw_market_seed",
      "retired",
      "retired",
    ]);
    expect(buckets.counts.collected_text_records).toEqual({
      status: "unavailable",
      value: null,
      reason: "no_bounded_owner_read",
    });
    expect(buckets.counts.passes).toEqual({ status: "ok", value: 0, reason: null });
    expect(buckets.reads).toEqual({ demands: { status: "ok" }, runs: { status: "ok" } });
  });

  it("keeps pipeline items, document-checked records and counts when an envelope is normalized twice", () => {
    const once = normalizeAlphaFactoryEnvelope(MOCK_ALPHA_FACTORY_ENVELOPE);
    const twice = buildAlphaFactoryBuckets(once, { includeReplicated: true, t });
    expect(twice.discovered).toEqual(once.data.pipeline.discovered);
    expect(twice.searches).toEqual(once.data.pipeline.scaffolded);
    expect(twice.documentChecked).toEqual(once.data.document_checked);
    expect(twice.counts).toEqual(once.data.counts);
    expect(twice.discovered[0].latest_reason_code).toBe("mandate_universe_missing");
  });

  it("marks lanes unavailable from their owner surfaces and counts unavailable when missing, never 0", () => {
    const buckets = buildAlphaFactoryBuckets(
      {
        data: { discovered: [], scaffolded: [], replicated: [] },
        meta: {
          surfaces: {
            alpha_factory: { status: "ok", source: "research_orchestrator" },
            alpha_factory_demands: { status: "unavailable", reason: "demand_scope_mismatch" },
            alpha_factory_runs: { status: "unavailable", message: "runs read timed out" },
          },
        },
      },
      { includeReplicated: true, t },
    );
    expect(buckets.reads.demands).toEqual({ status: "unavailable", reason: "demand_scope_mismatch" });
    expect(buckets.reads.runs).toEqual({ status: "unavailable", reason: "runs read timed out" });
    for (const count of Object.values(buckets.counts)) {
      expect(count).toEqual({ status: "unavailable", value: null, reason: "not_reported" });
    }
  });

  it("never counts a failed owner read as 0 even if a value slips through", () => {
    const buckets = buildAlphaFactoryBuckets(
      {
        data: {
          counts: {
            searches: { value: 0, status: "unavailable", reason: "owner_read_failed" },
            passes: { value: null, status: "ok" },
          },
        },
      },
      { includeReplicated: true, t },
    );
    expect(buckets.counts.searches).toEqual({ status: "unavailable", value: null, reason: "owner_read_failed" });
    expect(buckets.counts.passes).toEqual({ status: "unavailable", value: null, reason: "value_not_reported" });
  });

  it("keeps document-checked records out of the passed column and only a gate pass in it", () => {
    const buckets = buildAlphaFactoryBuckets(
      {
        data: {
          replicated: [passedCard("adm-pass")],
          document_checked: [{ ...passedCard("adm-doc"), lane: "document_checked", gate: undefined, document_check_reason: "test_scope" }],
        },
      },
      { includeReplicated: true, t },
    );
    expect(buckets.replicated.map((c) => c.id)).toEqual(["adm-pass"]);
    expect(buckets.replicated[0].gate_passed).toBe(true);
    expect(buckets.documentChecked.map((c) => c.id)).toEqual(["adm-doc"]);
    expect(buckets.documentChecked[0].document_check_reason).toBe("test_scope");
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

  it("preserves null sharpe on passed records when supplied and omits sharpe when not supplied", () => {
    const withoutSharpe = buildAlphaFactoryBuckets({ data: { replicated: [passedCard("a")] } }, {
      includeMockFixtures: false,
      includeReplicated: true,
      t,
    });
    expect(withoutSharpe.replicated).toHaveLength(1);
    expect(withoutSharpe.replicated[0].sharpe).toBeUndefined();

    const withNullSharpe = buildAlphaFactoryBuckets(
      { data: { replicated: [passedCard("a", { sharpe: null })] } },
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

  it("classifies healthy alpha_factory surface as live even if alpha_factory_strategy_state is unavailable", () => {
    expect(
      classifyAlphaFactorySource(
        { mode: "live", effective: "live" },
        { surfaces: { alpha_factory: { status: "ok", source: "research_orchestrator" } } },
      ),
    ).toBe("live");
    expect(
      classifyAlphaFactorySource(
        { mode: "live", effective: "live" },
        {
          surfaces: {
            alpha_factory: { status: "ok", source: "research_orchestrator" },
            alpha_factory_strategy_state: { status: "unavailable", source: "bff_strategy_registry" },
          },
        },
      ),
    ).toBe("live");
  });
});
