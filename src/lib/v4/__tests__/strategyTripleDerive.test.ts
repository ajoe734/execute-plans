import { describe, it, expect } from "vitest";
import {
  deriveStrategyTriple,
  lifecycleOf,
  isLive,
  isPaper,
  isHighRisk,
  tripleIsValid,
} from "../strategyTripleDerive";

describe("strategyTripleDerive", () => {
  it("prefers explicit Pack D fields over legacy state", () => {
    const t = deriveStrategyTriple({
      state: "deployed",
      lifecycleStatus: "degraded",
      reviewStatus: "approved",
      deploymentStatus: "rollback_required",
    });
    expect(t).toEqual({
      lifecycleStatus: "degraded",
      reviewStatus: "approved",
      deploymentStatus: "rollback_required",
    });
    expect(tripleIsValid(t)).toBe(true);
  });

  it("derives valid triple from legacy 'deployed' → live/approved/live_running", () => {
    const t = deriveStrategyTriple({ state: "deployed" });
    expect(t.lifecycleStatus).toBe("live");
    expect(t.reviewStatus).toBe("approved");
    expect(t.deploymentStatus).toBe("live_running");
    expect(tripleIsValid(t)).toBe(true);
  });

  it("derives valid triple from legacy 'paused' → paper", () => {
    const t = deriveStrategyTriple({ state: "paused" });
    expect(t.lifecycleStatus).toBe("paper");
    expect(t.deploymentStatus).toBe("paper_running");
    expect(tripleIsValid(t)).toBe(true);
  });

  it("derives valid triple for every legacy alias", () => {
    for (const legacy of ["draft", "review", "approved", "deployed", "paused", "retired"]) {
      const t = deriveStrategyTriple({ state: legacy });
      expect(tripleIsValid(t)).toBe(true);
    }
  });

  it("isLive only true on live deployment axis (not approved-but-undeployed)", () => {
    expect(isLive({ state: "deployed" })).toBe(true);
    expect(isLive({ state: "approved" })).toBe(false);
    expect(isLive({ state: "paused" })).toBe(false);
    expect(isLive({ lifecycleStatus: "live", deploymentStatus: "live_running", reviewStatus: "approved" })).toBe(true);
    expect(isLive({ lifecycleStatus: "live", deploymentStatus: "rollback_required", reviewStatus: "approved" })).toBe(false);
  });

  it("isPaper only true when paper_running", () => {
    expect(isPaper({ state: "paused" })).toBe(true);
    expect(isPaper({ state: "deployed" })).toBe(false);
  });

  it("isHighRisk covers live, degraded, and rollback_required", () => {
    expect(isHighRisk({ state: "deployed" })).toBe(true);
    expect(isHighRisk({ lifecycleStatus: "degraded", reviewStatus: "approved", deploymentStatus: "live_running" })).toBe(true);
    expect(isHighRisk({ lifecycleStatus: "paper", reviewStatus: "approved", deploymentStatus: "rollback_required" })).toBe(true);
    expect(isHighRisk({ state: "draft" })).toBe(false);
  });

  it("lifecycleOf falls back to discovered for empty input", () => {
    expect(lifecycleOf(undefined)).toBe("discovered");
    expect(lifecycleOf({})).toBe("discovered");
  });
});
