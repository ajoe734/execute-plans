import { describe, expect, it } from "vitest";
import { buildAlphaFactoryBuckets } from "./alphaFactoryData";
import type { Strategy } from "@/lib/bff/types";

const t = (key: string) => key;

const strategy: Strategy = {
  id: "st_live",
  name: "Live Strategy",
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
    const buckets = buildAlphaFactoryBuckets([strategy], {
      includeMockFixtures: false,
      includeReplicated: false,
      t,
    });

    expect(buckets.discovered).toHaveLength(0);
    expect(buckets.scaffolded).toHaveLength(0);
    expect(buckets.replicated).toHaveLength(0);
  });

  it("keeps fixture candidates available in configured mock mode", () => {
    const buckets = buildAlphaFactoryBuckets([strategy], {
      includeMockFixtures: true,
      includeReplicated: true,
      t,
    });

    expect(buckets.discovered.length).toBeGreaterThan(0);
    expect(buckets.scaffolded.length).toBeGreaterThan(0);
    expect(buckets.replicated).toHaveLength(1);
  });
});
