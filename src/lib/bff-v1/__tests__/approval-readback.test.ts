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
    expect(n({ ...owner, decision_state: "proposed", state: "pending" }).state).toBe("pending");
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

  it("projects canonical target_id and target_version from top-level and governance_chain with exact equality", () => {
    const valid = {
      ...owner,
      target_id: "pool_1",
      target_version: "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b",
      decision_context: {
        governance_chain: {
          target_id: "pool_1",
          target_version: "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b",
        },
      },
    };
    const res = n(valid);
    expect(res.targetId).toBe("pool_1");
    expect(res.targetVersion).toBe("e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b");
    expect(res.targetConflict).toBe(false);
  });

  it("projects canonical targets from governance_chain when top-level fields are omitted", () => {
    const chainOnly = {
      id: "gov_2",
      decision_state: "pending",
      decision_context: {
        governance_chain: {
          target_id: "pool_2",
          target_version: "hash_ver_2",
        },
      },
    };
    const res = n(chainOnly);
    expect(res.targetId).toBe("pool_2");
    expect(res.targetVersion).toBe("hash_ver_2");
    expect(res.targetConflict).toBe(false);
  });

  it("rejects conflicting canonical target_id between top-level and governance_chain", () => {
    const conflictId = {
      ...owner,
      target_id: "pool_alpha",
      decision_context: {
        governance_chain: {
          target_id: "pool_beta",
        },
      },
    };
    const res = n(conflictId);
    expect(res.targetConflict).toBe(true);
    expect(res.targetId).toBeUndefined();
  });

  it("rejects conflicting canonical target_version between top-level and governance_chain", () => {
    const conflictVer = {
      ...owner,
      target_version: "aaaa",
      decision_context: {
        governance_chain: {
          target_version: "bbbb",
        },
      },
    };
    const res = n(conflictVer);
    expect(res.targetConflict).toBe(true);
    expect(res.targetVersion).toBeUndefined();
  });

  it("leaves target fields undefined when omitted, without guessing or fabricating", () => {
    const noTargets = {
      id: "gov_3",
      decision_state: "pending",
    };
    const res = n(noTargets);
    expect(res.targetId).toBeUndefined();
    expect(res.targetVersion).toBeUndefined();
    expect(res.targetConflict).toBe(false);
  });
});
