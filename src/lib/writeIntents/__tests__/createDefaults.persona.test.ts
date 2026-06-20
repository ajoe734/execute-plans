import { describe, it, expect } from "vitest";
import { buildEntity } from "../createDefaults";

describe("buildEntity persona — trait data path → OpenClaw SOUL", () => {
  it("carries mandate, strategyFamily and a sparse traits object from the form input", () => {
    const built = buildEntity("persona", {
      name: "Gold Futures Persona",
      archetype: "trader",
      mandate: "Trade COMEX gold futures around macro liquidity",
      strategyFamily: "macro-overlay",
      instruments: "gold futures (GC)",
      riskAppetite: "moderate; max 2% per trade",
      decisionStyle: "systematic, signal-driven",
      timeHorizon: "swing (days)",
      hardRules: "no leverage > 3x; flat on signal loss",
      personaVoice: "terse, quantitative",
    }) as Record<string, unknown>;

    expect(built.mandate).toBe("Trade COMEX gold futures around macro liquidity");
    expect(built.strategyFamily).toBe("macro-overlay");
    expect(built.traits).toEqual({
      instruments: "gold futures (GC)",
      risk_appetite: "moderate; max 2% per trade",
      decision_style: "systematic, signal-driven",
      time_horizon: "swing (days)",
      hard_rules: "no leverage > 3x; flat on signal loss",
      persona_voice: "terse, quantitative",
    });
  });

  it("omits empty traits so the BFF/SOUL can honestly mark them unset (no fake depth)", () => {
    const built = buildEntity("persona", {
      name: "Bare Persona",
      archetype: "analyst",
    }) as Record<string, unknown>;

    // No fabricated values: mandate/strategyFamily/traits are absent, not "".
    expect(built.mandate).toBeUndefined();
    expect(built.strategyFamily).toBeUndefined();
    expect(built.traits).toBeUndefined();
  });

  it("only includes the trait keys that were actually provided", () => {
    const built = buildEntity("persona", {
      name: "Partial Persona",
      archetype: "quant",
      instruments: "BTC, ETH",
      hardRules: "",
    }) as Record<string, unknown>;

    expect(built.traits).toEqual({ instruments: "BTC, ETH" });
  });
});
