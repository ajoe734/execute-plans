import { describe, expect, it } from "vitest";
import { normalizeCapitalPool } from "@/lib/bff-v1/capitalPools";

describe("capital pool adapter", () => {
  it("normalizes Pantheon BFF capital pool DTOs into the management model", () => {
    const pool = normalizeCapitalPool({
      pool_id: "pool-crypto-paper",
      name: "Crypto Paper",
      status: "active",
      owner_id: "pantheon-dev-browser",
      currency: "USDT",
      capital_allocation: 125000,
      utilization_pct: 42,
      max_drawdown_pct: 8,
      risk_policy_ref: "risk-policy-crypto-paper",
      bindings: [{ persona_id: "persona-1" }, { persona_id: "persona-2" }],
      updated_at: "2026-07-06T00:00:00.000Z",
    });

    expect(pool).toMatchObject({
      id: "pool-crypto-paper",
      poolId: "pool-crypto-paper",
      name: "Crypto Paper",
      owner: "pantheon-dev-browser",
      currency: "USDT",
      allocated: 125000,
      utilized: 52500,
      riskBudget: 0.08,
      risk: "critical",
      state: "deployed",
      riskPolicyRef: "risk-policy-crypto-paper",
      bindingCount: 2,
    });
  });

  it("unwraps detail envelopes and prefers pool_id over a ledger-shaped id", () => {
    const pool = normalizeCapitalPool({
      data: {
        id: "paper-ledger-persona-20260528-04688755",
        pool_id: "pool-crypto-paper",
        name: "Crypto Paper",
        budget: 50000,
      },
    });

    expect(pool?.id).toBe("pool-crypto-paper");
    expect(pool?.allocated).toBe(50000);
  });
});
