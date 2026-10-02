import { describe, it, expect } from "vitest";
import { normalizeApprovalFields } from "@/lib/bff-v1/operations";
const n = (r: object) => normalizeApprovalFields(r) as unknown as Record<string, unknown>;

const owner = {
  id: "gov_1",
  target_type: "Strategy",
  target_id: "stg_9",
  owner_user_id: "u_owner",
  risk_level: "high",
  created_at: "2026-10-01T00:00:00Z",
  decision_state: "pending",
  version: 4,
};

describe("normalizeApprovalFields (Governance owner readback)", () => {
  it("projects owner fields and preserves the real version", () => {
    const a = n(owner);
    expect(a).toMatchObject({ id: "gov_1", kind: "Strategy", subject: "stg_9", requester: "u_owner", riskLevel: "high", createdAt: owner.created_at, state: "pending", version: 4 });
  });

  it("keeps under_review pending and only maps final owner states", () => {
    expect(n({ ...owner, decision_state: "under_review" }).state).toBe("pending");
    expect(n({ ...owner, decision_state: "approved" }).state).toBe("approved");
    expect(n({ ...owner, decision_state: "rejected" }).state).toBe("rejected");
  });

  it("maps real decided owner outcomes and keeps non-final terminals non-actionable", () => {
    const d = (decision: unknown, decision_state = "decided") => n({ ...owner, decision_state, decision });
    expect(d("approved").state).toBe("approved");
    expect(d("rejected").state).toBe("rejected");
    const cond = n({ ...owner, decision_state: "decided", decision: "approved_with_conditions", conditions: ["c1"] });
    expect(cond).toMatchObject({ state: "approved", decision: "approved_with_conditions", conditions: ["c1"] });
    expect(d(undefined, "revoked").state).toBe("revoked");
    expect(d(undefined, "superseded").state).toBe("superseded");
    expect(d("mystery").state).toBe("unknown");
    expect(d(undefined, "weird").state).toBe("unknown");
  });

  it("never invents a version for legacy/unversioned records", () => {
    const { version: _v, ...legacy } = owner;
    expect(n(legacy)).not.toHaveProperty("version");
  });

  it("passes already-display-shaped records through untouched", () => {
    const display = { id: "a", kind: "k", subject: "s", state: "approved", version: 2 };
    expect(normalizeApprovalFields(display)).toBe(display);
  });
});
