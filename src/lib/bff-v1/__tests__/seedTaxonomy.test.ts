import { afterEach, describe, expect, it, vi } from "vitest";

import { bff, getSeedHelperUnavailableReason } from "@/lib/bff-v1/seed";
import {
  getSeedHelperCategory,
  getSeedHelperLiveBehavior,
  seedHelperMustReturnEmptyInLive,
} from "@/lib/bff-v1/seedTaxonomy";

function stubLiveEnv() {
  vi.stubEnv("MODE", "development");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", "auto");
}

describe("seed taxonomy live gating", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it("classifies helpers from the BFF-CONSOL-007 taxonomy JSON", () => {
    expect(getSeedHelperCategory("bff.watchers.forSubject")).toBe("mock_only_dev");
    expect(getSeedHelperCategory("bff.fitnessFormulas.list")).toBe("deferred");
    expect(getSeedHelperCategory("bff.strategies.list")).toBe("live_required");
    expect(getSeedHelperLiveBehavior("bff.fitnessFormulas.list")).toBe("empty_state");
  });

  it("does not expose deprecated write helpers from the seed accessor", () => {
    expect(Object.prototype.hasOwnProperty.call(bff, "mutations")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(bff, "commands")).toBe(false);
  });

  it("does not disable seed helpers in mock mode", async () => {
    const watchers = await bff.watchers.forSubject("Strategy", "stg_001");

    expect(seedHelperMustReturnEmptyInLive("bff.watchers.forSubject")).toBe(false);
    expect(watchers.length).toBeGreaterThan(0);
    expect(bff.getAcceptLanguage()).toMatch(/en-US|zh-TW/);
  });

  it("disables mock_only_dev helpers in live mode instead of returning seed rows", async () => {
    stubLiveEnv();

    await expect(bff.allocationSimulations.forRebalance("rb_q2_2026")).resolves.toEqual([]);
    await expect(bff.watchers.forSubject("Strategy", "stg_001")).resolves.toEqual([]);
    await expect(bff.mcpSecrets.forServer("mcp_alpha")).resolves.toEqual([]);
    expect(bff.getAcceptLanguage()).toBeNull();
    expect(getSeedHelperUnavailableReason("bff.watchers.forSubject")).toMatch(/Development-only/);
  });

  it("returns explicit empty values for deferred helpers in live mode", async () => {
    stubLiveEnv();

    await expect(bff.fitnessFormulas.list()).resolves.toEqual([]);
    await expect(bff.mutationRules.list()).resolves.toEqual([]);
    await expect(bff.performanceSeries.forStrategy("stg_001", "day")).resolves.toBeUndefined();
    expect(getSeedHelperUnavailableReason("bff.fitnessFormulas.list")).toMatch(/Live route deferred/);
  });

  it("routes live_required helpers to the live BFF route instead of seed data", async () => {
    stubLiveEnv();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: "live_strategy", name: "Live Strategy" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy;

    expect(seedHelperMustReturnEmptyInLive("bff.strategies.list")).toBe(false);
    await expect(bff.strategies.list()).resolves.toEqual([{ id: "live_strategy", name: "Live Strategy" }]);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/bff/strategies");
  });
});
