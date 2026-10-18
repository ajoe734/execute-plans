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
      status: "active",
      state: undefined,
      reportedFields: {
        currency: true,
        allocated: true,
        utilized: true,
        riskBudget: true,
        risk: false,
      },
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

  it("preserves sanitized real owner facts with null budget and active status without defaulting to deployed", () => {
    const pool = normalizeCapitalPool({
      id: "c9f8b55d-e65b-4a76-be1a-77a9efaa60ef",
      name: "Default TWD Capital Pool",
      status: "active",
      currency: "TWD",
      budget: null,
      risk_policy_ref: null,
      bindings: [
        {
          role: "paper_owner",
          budget: null,
          status: "active",
          allowed_deployment_scope: "paper",
        },
      ],
    });

    expect(pool).toMatchObject({
      id: "c9f8b55d-e65b-4a76-be1a-77a9efaa60ef",
      name: "Default TWD Capital Pool",
      status: "active",
      state: undefined,
      currency: "TWD",
      riskPolicyRef: undefined,
      bindingCount: 1,
      bindings: [
        {
          role: "paper_owner",
          budget: null,
          status: "active",
          allowed_deployment_scope: "paper",
        },
      ],
      reportedFields: {
        currency: true,
        allocated: false,
        utilized: false,
        riskBudget: false,
        risk: false,
      },
    });
  });

  it("distinguishes explicit numeric zero from missing or unknown status and risk", () => {
    const pool = normalizeCapitalPool({
      pool_id: "pool-zero",
      status: "unknown_status",
      currency: "TWD",
      budget: 0,
      utilized: 0,
      risk_budget: 0,
    });

    expect(pool).toMatchObject({
      id: "pool-zero",
      status: "unknown_status",
      state: undefined,
      currency: "TWD",
      allocated: 0,
      utilized: 0,
      riskBudget: 0,
      reportedFields: {
        currency: true,
        allocated: true,
        utilized: true,
        riskBudget: true,
        risk: false,
      },
    });
  });
});
