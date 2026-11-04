import { describe, it, expect, vi, afterEach } from "vitest";
import { listApprovalDecisions, listApprovals, normalizeApprovalFields, normalizeAuditFields } from "@/lib/bff-v1/operations";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { paths } from "@/lib/bff-v1/paths";
const n = (r: object) => normalizeApprovalFields(r) as unknown as Record<string, unknown>;

const realHostedDecision = {
  version: 2,
  actor_id: "pantheon-dev-admin-test",
  decision: "approved",
  rationale: "approval",
  target_id: "hosted-all12-h12-claude-20261027-4923-execution-artifact",
  tenant_id: "tenant-dev",
  actor_role: "governance_reviewer",
  conditions: [],
  created_at: "2026-11-01T14:50:02Z",
  decided_at: "2026-11-01T14:50:02Z",
  expires_at: "2026-11-08T14:50:02Z",
  persona_id: "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a",
  revoked_at: null,
  risk_level: "low",
  decision_id: "apv-07db6c62179bfb41bcb790001c955022535fe863aa003a8458e1eea8d62c7574",
  target_type: "registry_entry",
  evidence_refs: [],
  owner_user_id: "pantheon-dev-admin-test",
  decision_state: "decided",
  target_version: "1.0.0",
  capital_pool_id: "hosted-all12-h12-claude-20261027-4923-pool",
  authority_status: "authoritative",
};

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
    expect(res.targetVersion).toBeUndefined();
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
    expect(res.targetId).toBeUndefined();
    expect(res.targetVersion).toBeUndefined();
  });

  it("rejects case-mismatched canonical target_id as conflicting opaque IDs", () => {
    const caseMismatch = {
      ...owner,
      target_id: "pool-A",
      decision_context: {
        governance_chain: {
          target_id: "pool-a",
        },
      },
    };
    const res = n(caseMismatch);
    expect(res.targetConflict).toBe(true);
    expect(res.targetId).toBeUndefined();
    expect(res.targetVersion).toBeUndefined();
  });

  it("withholds both canonical target fields visibly when target_id conflicts even if target_version matches", () => {
    const partialConflict = {
      ...owner,
      target_id: "pool-A",
      target_version: "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b",
      decision_context: {
        governance_chain: {
          target_id: "pool-OTHER",
          target_version: "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b",
        },
      },
    };
    const res = n(partialConflict);
    expect(res.targetConflict).toBe(true);
    expect(res.targetId).toBeUndefined();
    expect(res.targetVersion).toBeUndefined();
  });

  it("keeps unrecognized canonical decision_state unknown rather than falling back to display state=pending", () => {
    expect(n({ ...owner, decision_state: "corrupt_state", state: "pending" }).state).toBe("unknown");
    expect(n({ ...owner, decision_state: "unrecognized", state: "pending" }).state).toBe("unknown");
    expect(n({ ...owner, decision_state: "decided", decision: "weird", state: "pending" }).state).toBe("unknown");
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

  it("rejects malformed non-string canonical top target_id even when nested claim exists", () => {
    const malformedTop = {
      ...owner,
      target_id: 123,
      decision_context: {
        governance_chain: {
          target_id: "pool-A",
          target_version: "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b",
        },
      },
    };
    const res = n(malformedTop);
    expect(res.targetConflict).toBe(true);
    expect(res.targetId).toBeUndefined();
    expect(res.targetVersion).toBeUndefined();
    expect(res.subject).not.toBe("pool-A");
    expect(res.subject).not.toBe(123);
    expect(res.decisionContext).toBeUndefined();
  });

  it("rejects malformed non-string canonical target_version and blank strings", () => {
    const malformedVer = {
      ...owner,
      target_id: "pool-A",
      target_version: 123,
      decision_context: {
        governance_chain: {
          target_id: "pool-A",
          target_version: "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b",
        },
      },
    };
    const resVer = n(malformedVer);
    expect(resVer.targetConflict).toBe(true);
    expect(resVer.targetId).toBeUndefined();
    expect(resVer.targetVersion).toBeUndefined();

    const blankTop = {
      ...owner,
      target_id: "   ",
      decision_context: {
        governance_chain: {
          target_id: "pool-A",
        },
      },
    };
    const resBlank = n(blankTop);
    expect(resBlank.targetConflict).toBe(true);
    expect(resBlank.targetId).toBeUndefined();
  });

  it("rejects malformed nested governance_chain targets", () => {
    const malformedChain = {
      ...owner,
      target_id: "pool-A",
      decision_context: {
        governance_chain: {
          target_id: 999,
        },
      },
    };
    const res = n(malformedChain);
    expect(res.targetConflict).toBe(true);
    expect(res.targetId).toBeUndefined();
    expect(res.targetVersion).toBeUndefined();
  });

  it("rejects standalone malformed canonical top target_id without guessing or fallback", () => {
    const malformedStandalone = {
      ...owner,
      target_id: 123,
    };
    const res = n(malformedStandalone);
    expect(res.targetConflict).toBe(true);
    expect(res.targetId).toBeUndefined();
  });

  it("normalizes the real hosted decision record shape for decided approved, decided rejected, and revoked records", () => {
    const projectedBase = {
      ...realHostedDecision,
      id: realHostedDecision.decision_id,
      outcome: "approved",
      status: "decided",
      state: "decided",
      decision_type: "registry_entry",
      submitted_at: realHostedDecision.created_at,
      submitted_by: realHostedDecision.owner_user_id,
      allowedActions: [],
      decision_context: {
        governance_chain: {
          target_id: realHostedDecision.target_id,
          target_version: realHostedDecision.target_version,
        },
      },
    };

    const approved = n(projectedBase);
    expect(approved).toMatchObject({
      id: "apv-07db6c62179bfb41bcb790001c955022535fe863aa003a8458e1eea8d62c7574",
      kind: "registry_entry",
      subject: "hosted-all12-h12-claude-20261027-4923-execution-artifact",
      targetId: "hosted-all12-h12-claude-20261027-4923-execution-artifact",
      targetVersion: "1.0.0",
      requester: "pantheon-dev-admin-test",
      decider: "pantheon-dev-admin-test",
      decidedAt: "2026-11-01T14:50:02Z",
      expiresAt: "2026-11-08T14:50:02Z",
      personaId: "persona-strat-hosted-all12-h12-claude-20261027-4923-src-106b4057d07a",
      capitalPoolId: "hosted-all12-h12-claude-20261027-4923-pool",
      riskLevel: "low",
      createdAt: "2026-11-01T14:50:02Z",
      state: "approved",
      version: 2,
    });

    const rejected = n({ ...projectedBase, decision: "rejected", outcome: "rejected" });
    expect(rejected.state).toBe("rejected");

    const revoked = n({
      ...projectedBase,
      decision_state: "revoked",
      decision: "approved",
      revoked_at: "2026-11-02T00:00:00Z",
    });
    expect(revoked.state).toBe("revoked");
  });

  describe("listApprovals vs listApprovalDecisions routes", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = realFetch;
      liveStatus._reset();
    });

    it("reads pending approvals from GET /bff/approvals and all decisions from GET /api/v1/approval-decisions", async () => {
      liveStatus._reset({ mode: "live", effective: "live" });
      const fetchSpy = vi.fn((input: Parameters<typeof fetch>[0]) => {
        const url = new URL(String(input), "https://bff.test");
        if (url.pathname === "/bff/approvals") {
          return Promise.resolve(new Response(JSON.stringify({ items: [{ ...owner, decision_state: "proposed" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }));
        }
        if (url.pathname === "/api/v1/approval-decisions") {
          return Promise.resolve(new Response(JSON.stringify({ data: [realHostedDecision], meta: { total: 1 } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }));
        }
        return Promise.resolve(new Response("not found", { status: 404 }));
      });
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      expect(paths.approvals()).toBe("/bff/approvals");
      expect(paths.approvalDecisions()).toBe("/api/v1/approval-decisions");

      const pendingRows = await listApprovals();
      expect(pendingRows).toHaveLength(1);
      expect(pendingRows[0].state).toBe("pending");

      const allDecisions = await listApprovalDecisions();
      expect(allDecisions).toHaveLength(1);
      expect(allDecisions[0]).toMatchObject({
        id: realHostedDecision.decision_id,
        state: "approved",
        decider: "pantheon-dev-admin-test",
        decidedAt: "2026-11-01T14:50:02Z",
        expiresAt: "2026-11-08T14:50:02Z",
        personaId: realHostedDecision.persona_id,
        capitalPoolId: realHostedDecision.capital_pool_id,
      });
    });
  });
});

describe("normalizeAuditFields (Governance owner audit readback)", () => {
  it("projects canonical owner audit shape (entry_id, action_type, target_id, timestamp) to display fields (id, action, target, ts)", () => {
    const rawOwnerAudit = {
      entry_id: "entry_1",
      actor: "operator-1",
      action_type: "approval.proposed",
      target_type: "approval",
      target_id: "approval_1",
      timestamp: "2026-10-11T03:30:00Z",
    };
    const projected = normalizeAuditFields(rawOwnerAudit);
    expect(projected).toMatchObject({
      id: "entry_1",
      actor: "operator-1",
      action: "approval.proposed",
      target: "approval_1",
      ts: "2026-10-11T03:30:00Z",
    });
  });

  it("passes already-display-shaped audit records through untouched", () => {
    const display = {
      id: "entry_disp",
      actor: "operator-2",
      action: "approval.decided",
      target: "approval_2",
      ts: "2026-10-11T03:31:00Z",
    };
    expect(normalizeAuditFields(display)).toMatchObject(display);
  });

  it("leaves target undefined when target_id is omitted or missing without guessing", () => {
    const noTarget = {
      entry_id: "entry_3",
      actor: "operator-3",
      action_type: "audit.event",
      timestamp: "2026-10-11T03:32:00Z",
    };
    const res = normalizeAuditFields(noTarget);
    expect(res.target).toBeUndefined();
  });

  it("rejects non-string target_id without coercing to string and sets targetConflict", () => {
    const nonStringTarget = {
      entry_id: "entry_4",
      actor: "operator-4",
      action_type: "audit.event",
      target_id: 12345,
      timestamp: "2026-10-11T03:33:00Z",
    };
    const res = normalizeAuditFields(nonStringTarget);
    expect(res.target).toBeUndefined();
    expect(res.targetConflict).toBe(true);
    expect(res.target_id).toBeUndefined();
  });

  it("rejects conflicting target and target_id, clears target aliases, and sets targetConflict", () => {
    const conflicting = {
      entry_id: "entry_5",
      actor: "operator-5",
      action_type: "audit.event",
      target: "target-A",
      target_id: "target-B",
      timestamp: "2026-10-11T03:34:00Z",
    };
    const res = normalizeAuditFields(conflicting);
    expect(res.target).toBeUndefined();
    expect(res.targetConflict).toBe(true);
    expect(res.target_id).toBeUndefined();
    expect(res.targetId).toBeUndefined();
  });

  it("rejects conflicting target_id and targetId aliases", () => {
    const conflictingAliases = {
      entry_id: "entry_6",
      actor: "operator-6",
      action_type: "audit.event",
      target_id: "case-1",
      targetId: "case-2",
      timestamp: "2026-10-11T03:34:30Z",
    };
    const res = normalizeAuditFields(conflictingAliases);
    expect(res.target).toBeUndefined();
    expect(res.targetConflict).toBe(true);
    expect(res.target_id).toBeUndefined();
    expect(res.targetId).toBeUndefined();
  });

  it("rejects malformed non-string entry_id or timestamp without coercion", () => {
    const malformed = {
      entry_id: 999,
      actor: "operator-7",
      action_type: 888,
      timestamp: true,
    };
    const res = normalizeAuditFields(malformed);
    expect(res.id).toBeUndefined();
    expect(res.action).toBeUndefined();
    expect(res.ts).toBeUndefined();
  });

  it("rejects missing entry_id and id without guessing, leaves id undefined and idConflict false", () => {
    const missingId = {
      target_id: "case-missing-id",
      action_type: "approval.proposed",
      timestamp: "2026-10-11T03:30:00Z",
      actor: "operator-8",
    };
    const res = normalizeAuditFields(missingId);
    expect(res.id).toBeUndefined();
    expect(res.idConflict).toBe(false);
    expect(res.target).toBe("case-missing-id");
  });

  it("rejects numeric entry_id (123) without coercing to string, clears entry_id, and sets idConflict", () => {
    const numericEntryId = {
      entry_id: 123,
      target_id: "case-numeric-id",
      action_type: "approval.proposed",
      timestamp: "2026-10-11T03:30:00Z",
      actor: "operator-9",
    };
    const res = normalizeAuditFields(numericEntryId);
    expect(res.id).toBeUndefined();
    expect(res.entry_id).toBeUndefined();
    expect(res.idConflict).toBe(true);
  });

  it("rejects conflicting display id vs canonical entry_id, clears id and entry_id, and sets idConflict", () => {
    const conflictingId = {
      id: "display-audit-id",
      entry_id: "canonical-audit-id",
      target_id: "case-conflicting-id",
      action_type: "approval.proposed",
      timestamp: "2026-10-11T03:30:00Z",
      actor: "operator-10",
    };
    const res = normalizeAuditFields(conflictingId);
    expect(res.id).toBeUndefined();
    expect(res.entry_id).toBeUndefined();
    expect(res.idConflict).toBe(true);
  });

  it("rejects numeric display id (123) without coercing to string, clears id, and sets idConflict", () => {
    const numericId = {
      id: 123,
      target: "case-numeric-disp-id",
      action: "approval.proposed",
      ts: "2026-10-11T03:30:00Z",
      actor: "operator-11",
    };
    const res = normalizeAuditFields(numericId);
    expect(res.id).toBeUndefined();
    expect(res.idConflict).toBe(true);
  });

  it("passes valid supporteddisplay audit row and matching aliases through", () => {
    const displayOnly = {
      id: "audit-disp-only",
      target: "approval-case-1",
      action: "approval.decided",
      ts: "2026-10-11T03:31:00Z",
      actor: "operator-12",
    };
    const resDisplay = normalizeAuditFields(displayOnly);
    expect(resDisplay.id).toBe("audit-disp-only");
    expect(resDisplay.idConflict).toBe(false);

    const matchingAliases = {
      id: "audit-matching-id",
      entry_id: "audit-matching-id",
      target: "approval-case-2",
      target_id: "approval-case-2",
      action: "approval.proposed",
      action_type: "approval.proposed",
      ts: "2026-10-11T03:32:00Z",
      timestamp: "2026-10-11T03:32:00Z",
      actor: "operator-13",
    };
    const resMatching = normalizeAuditFields(matchingAliases);
    expect(resMatching.id).toBe("audit-matching-id");
    expect(resMatching.target).toBe("approval-case-2");
    expect(resMatching.idConflict).toBe(false);
    expect(resMatching.targetConflict).toBe(false);
  });

  it("preserves idempotence across repeated normalization of valid, missing, numeric, and conflicting audit rows", () => {
    const validOwner = {
      entry_id: "audit-real",
      target_id: "approval-exact",
      action_type: "approval.proposed",
      timestamp: "2026-10-11T00:00:00Z",
      actor: "owner",
    };
    const pass1 = normalizeAuditFields(validOwner);
    const pass2 = normalizeAuditFields(pass1);
    expect(pass2).toEqual(pass1);

    const missingId = {
      target_id: "approval-exact",
      action_type: "approval.proposed",
      timestamp: "2026-10-11T00:00:00Z",
      actor: "owner",
    };
    expect(normalizeAuditFields(normalizeAuditFields(missingId))).toEqual(normalizeAuditFields(missingId));

    const numericId = {
      ...validOwner,
      entry_id: 123,
    };
    expect(normalizeAuditFields(normalizeAuditFields(numericId))).toEqual(normalizeAuditFields(numericId));

    const conflictingId = {
      ...validOwner,
      id: "different-audit",
    };
    expect(normalizeAuditFields(normalizeAuditFields(conflictingId))).toEqual(normalizeAuditFields(conflictingId));
  });
});
