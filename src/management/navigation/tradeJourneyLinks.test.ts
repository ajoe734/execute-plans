import { describe, expect, it } from "vitest";
import { tradeJourneyHref } from "./tradeJourneyLinks";

describe("tradeJourneyHref", () => {
  it("builds a focus link with a return_to back to the origin page", () => {
    const href = tradeJourneyHref({ pathname: "/management/personas/persona-a", search: "" }, { personaId: "persona-a" }, "Persona persona-a");
    expect(href).toBe("/management/trade-journeys?persona_id=persona-a&return_to=%2Fmanagement%2Fpersonas%2Fpersona-a&return_label=Persona+persona-a");
  });

  it("preserves an incoming tenant_id/environment instead of dropping it", () => {
    const href = tradeJourneyHref(
      { pathname: "/management/strategies/strat-1", search: "?tenant_id=tenant-b&environment=canary" },
      { strategyId: "strat-1" },
    );
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("tenant_id")).toBe("tenant-b");
    expect(params.get("environment")).toBe("canary");
    expect(params.get("strategy_id")).toBe("strat-1");
    expect(params.get("return_to")).toBe("/management/strategies/strat-1?tenant_id=tenant-b&environment=canary");
  });

  it("omits tenant_id/environment when the origin page never had them", () => {
    const href = tradeJourneyHref({ pathname: "/management/runtimes", search: "" }, { personaId: "persona-a" });
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.has("tenant_id")).toBe(false);
    expect(params.has("environment")).toBe(false);
  });

  it("builds an exact journey detail link with explicit tenant/environment and return_to", () => {
    const href = tradeJourneyHref(
      { pathname: "/management/trading-pulse", search: "" },
      {
        journeyId: "tj_79726064-4cc2-5510-8e11-7f5e59ff89bd",
        tenantId: "tenant-dev",
        environment: "paper",
      },
      "交易脈動",
    );
    expect(href).toBe(
      "/management/trade-journeys/tj_79726064-4cc2-5510-8e11-7f5e59ff89bd?tenant_id=tenant-dev&environment=paper&return_to=%2Fmanagement%2Ftrading-pulse&return_label=%E4%BA%A4%E6%98%93%E8%84%88%E5%8B%95",
    );
  });

  it("attaches return_to and return_label to an existing journey href while preserving its query context", () => {
    const href = tradeJourneyHref(
      { pathname: "/management/trading-pulse", search: "" },
      {
        href: "/management/trade-journeys/tj_29473e86-63ff-5384-bda1-23eef61cebb2?tenant_id=tenant-dev&environment=paper",
      },
      "Trading Pulse",
    );
    const [path, query] = href.split("?");
    const params = new URLSearchParams(query);
    expect(path).toBe("/management/trade-journeys/tj_29473e86-63ff-5384-bda1-23eef61cebb2");
    expect(params.get("tenant_id")).toBe("tenant-dev");
    expect(params.get("environment")).toBe("paper");
    expect(params.get("return_to")).toBe("/management/trading-pulse");
    expect(params.get("return_label")).toBe("Trading Pulse");
  });
});
