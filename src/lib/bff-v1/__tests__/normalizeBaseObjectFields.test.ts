import { describe, expect, it } from "vitest";
import { normalizeBaseObjectFields } from "@/lib/bff-v1/seed";

describe("normalizeBaseObjectFields (2026-07-01 re-audit — detail DTO honesty)", () => {
  it("maps the real live capital-pool detail shape onto the BaseObject surface", () => {
    // Shape returned by services/control-plane/bff `_project_canonical_capital_pool`.
    const raw = {
      id: "pool-pack-a-ops",
      pool_id: "pool-pack-a-ops",
      name: "Pack A Paper Operations Pool",
      status: "ready",
      owner_id: "fixture-ops-team",
      owner_type: "control-plane",
      risk_policy_ref: "risk-policy-pack-a-paper",
      capital_allocation: 1000000,
      currency: "USD",
    };

    const normalized = normalizeBaseObjectFields(raw);

    expect(normalized.state).toBe("ready");
    expect(normalized.owner).toBe("fixture-ops-team");
    // No risk/updatedAt-equivalent field exists on this raw shape — stays
    // undefined so StatusBadge/RiskBadge/EntityHeader render an explicit
    // "unknown"/"unassigned" placeholder instead of a fabricated value.
    expect(normalized.risk).toBeUndefined();
    expect(normalized.updatedAt).toBeUndefined();
  });

  it("maps the real live research-experiment detail shape onto the BaseObject surface", () => {
    const raw = {
      experiment_id: "exp-mgmt-qlib-006",
      experiment_name: "Qlib momentum sweep",
      status: "running",
      queued_at: "2026-06-30T01:00:00Z",
      started_at: "2026-06-30T01:05:00Z",
    };

    const normalized = normalizeBaseObjectFields(raw);

    expect(normalized.id).toBe("exp-mgmt-qlib-006");
    expect(normalized.name).toBe("Qlib momentum sweep");
    expect(normalized.state).toBe("running");
    expect(normalized.updatedAt).toBe("2026-06-30T01:05:00Z");
  });

  it("keeps an already-correct BaseObject shape untouched", () => {
    const raw = {
      id: "strat_1", name: "Momentum", state: "deployed", risk: "medium",
      owner: "alice", updatedAt: "2026-05-01T00:00:00Z",
    };

    expect(normalizeBaseObjectFields(raw)).toMatchObject(raw);
  });
});
