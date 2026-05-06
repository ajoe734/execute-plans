import { describe, it, expect } from "vitest";
import { v5ActionOverlay, OVERLAY_TTL_MS } from "@/lib/v5/overlay";
import * as seed from "@/mocks/seed";

describe("v5ActionOverlay (Q10/Q27)", () => {
  it("has 30 min TTL", () => {
    expect(OVERLAY_TTL_MS).toBe(30 * 60 * 1000);
  });

  it("does not mutate seed personas", () => {
    v5ActionOverlay.clear();
    const before = JSON.stringify(seed.personas);
    v5ActionOverlay.setPersona("per_quant", { routingPaused: true, reason: "test" });
    expect(JSON.stringify(seed.personas)).toBe(before);
    v5ActionOverlay.clear();
  });

  it("merges patches and expires", () => {
    v5ActionOverlay.clear();
    v5ActionOverlay.setPersona("per_x", { routingPaused: true });
    v5ActionOverlay.setPersona("per_x", { reason: "ops" });
    expect(v5ActionOverlay.getPersona("per_x")).toMatchObject({ routingPaused: true, reason: "ops" });
    v5ActionOverlay.setPersona("per_y", { forcedMode: "shadow" }, 1);
    // wait past TTL
    return new Promise<void>((r) => setTimeout(() => {
      expect(v5ActionOverlay.getPersona("per_y")).toBeUndefined();
      v5ActionOverlay.clear();
      r();
    }, 5));
  });
});
