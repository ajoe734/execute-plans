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
});
