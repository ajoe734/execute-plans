// Planner Response 2026-05-07 — stages 4-9 contract tests.
import { describe, it, expect } from "vitest";
import { ASYNC_TRANSITION_POLICIES, findAsyncTransitionPolicy } from "@/lib/v4/asyncTransitionPolicy";
import { ROLE_CAPABILITIES, capabilityMatches, hasCapability, capabilitiesForRoles, effectiveCapabilities } from "@/lib/v4/roleCapabilities";
import { classifyListPath, totalCountExactFor } from "@/lib/v4/listTotalCountPolicy";
import { canIssueConfirmToken, canRedeemConfirmToken } from "@/lib/v4/cooldownPriority";
import { evaluateTwoMan, ROLE_FAMILY_OF, HIGH_RISK_TWO_MAN_POLICY } from "@/lib/v4/twoManPolicy";
import { ROLLBACK_SAGA_STEPS, isTerminalSagaStatus, stepIndex } from "@/lib/v4/rollbackSaga";
import { buildSlaTimeline, accumulatedSlaSec } from "@/lib/v4/handoffSlaSegments";
import { HANDOFF_MULTI_TURN_ENABLED } from "@/lib/v4/handoffMultiTurn";
import { validateForceTransition } from "@/lib/v4/forceTransitionPolicy";
import { validateMemo } from "@/lib/v4/memoPolicy";
import { evaluateQuorum, QUORUM_POLICIES } from "@/lib/v4/reviewerQuorum";

describe("§B1 asyncTransitionPolicy", () => {
  it("contains 15 canonical actions", () => {
    expect(ASYNC_TRANSITION_POLICIES.length).toBe(15);
    expect(findAsyncTransitionPolicy("rollback.saga")?.timeoutMs).toBe(900_000);
    expect(findAsyncTransitionPolicy("handoff.respond")?.retryable).toBe(false);
  });
});

describe("§B2 roleCapabilities", () => {
  it("wildcard matches namespace", () => {
    expect(capabilityMatches("capital.*", "capital.rebalance")).toBe(true);
    expect(capabilityMatches("capital.*", "rebalance.read")).toBe(false);
    expect(capabilityMatches("*", "anything.here")).toBe(true);
  });
  it("hasCapability resolves wildcard", () => {
    expect(hasCapability(ROLE_CAPABILITIES.portfolio_manager, "capital.allocate")).toBe(true);
    expect(hasCapability(ROLE_CAPABILITIES.viewer, "deployment.execute")).toBe(false);
  });
  it("effectiveCapabilities prefers explicit caps", () => {
    expect(effectiveCapabilities(["strategy.view"], ["platform_admin"])).toEqual(["strategy.view"]);
    expect(capabilitiesForRoles(["viewer"]).length).toBeGreaterThan(0);
  });
});

describe("§B3 list totalCount", () => {
  it("classifies registry vs audit vs feed", () => {
    expect(classifyListPath("/bff/strategies")).toBe("exact");
    expect(classifyListPath("/bff/audit")).toBe("estimated");
    expect(classifyListPath("/bff/notifications")).toBe("absent");
    expect(totalCountExactFor("/bff/approvals")).toBe(true);
  });
});

describe("§C1/D36 cooldown priority", () => {
  it("blocks issue + redeem during cooldown", () => {
    const cd = { active: true, endsAt: "2026-05-08T01:00:00Z", serverTime: "2026-05-08T00:00:00Z", actionId: "x", entityType: "y", entityId: "z" };
    expect(canIssueConfirmToken(cd).ok).toBe(false);
    expect(canRedeemConfirmToken(cd).errorCode).toBe("COOLDOWN_ACTIVE");
    expect(canIssueConfirmToken(undefined).ok).toBe(true);
  });
});

describe("§C2/D35 two-man distinct", () => {
  it("rejects requester signing + duplicate user + same family on high-risk", () => {
    const sigs = [
      { approverId: "u1", approverRoles: ["risk_officer"] as const, signedAt: "t" },
      { approverId: "u2", approverRoles: ["risk_officer"] as const, signedAt: "t" },
    ];
    expect(evaluateTwoMan({ requesterId: "u3", signatures: sigs, policy: HIGH_RISK_TWO_MAN_POLICY }).ok).toBe(false);
    expect(evaluateTwoMan({ requesterId: "u1", signatures: sigs }).ok).toBe(false);
    expect(evaluateTwoMan({ requesterId: "u3", signatures: sigs }).ok).toBe(true);
    expect(ROLE_FAMILY_OF.risk_officer).toBe("risk");
  });
});

describe("§D04 rollback saga", () => {
  it("has 9 steps + terminal detection", () => {
    expect(ROLLBACK_SAGA_STEPS.length).toBe(9);
    expect(isTerminalSagaStatus("succeeded")).toBe(true);
    expect(isTerminalSagaStatus("rolling_back")).toBe(false);
    expect(stepIndex("verify")).toBe(5);
  });
});

describe("§D30 handoff SLA segments", () => {
  it("accumulates seconds across closed segments", () => {
    const segs = [
      { id: "s1", openedAt: "2026-05-08T00:00:00Z", closedAt: "2026-05-08T00:00:30Z", reasonCode: "initial", actor: "u", resetSla: false, dueAt: "2026-05-09T00:00:00Z" },
      { id: "s2", openedAt: "2026-05-08T00:00:40Z", reasonCode: "reopen_missing_info", actor: "u", resetSla: false, dueAt: "2026-05-09T00:00:00Z" },
    ] as const;
    const total = accumulatedSlaSec(segs, new Date("2026-05-08T00:01:00Z"));
    expect(total).toBe(30 + 20);
    expect(buildSlaTimeline("h1", "reopened", segs).effectiveDueAt).toBe("2026-05-09T00:00:00Z");
  });
});

describe("§E2 force transition validation", () => {
  it("rejects short justification + missing roles", () => {
    const req = { entityType: "deployment", entityId: "d1", fromState: "live", toState: "stopped", justification: "short", approverIds: ["a"], expectedVersion: 1 };
    expect(validateForceTransition(req, { a: ["platform_admin", "risk_officer"] }, true).ok).toBe(false);
    const long = { ...req, justification: "x".repeat(80), approverIds: ["a", "b"] };
    expect(validateForceTransition(long, { a: ["platform_admin"], b: ["risk_officer"] }, true).ok).toBe(true);
    expect(validateForceTransition(long, { a: ["platform_admin"], b: ["ops"] }, true).ok).toBe(false);
  });
});

describe("§E4 memo policy", () => {
  it("enforces min length per risk class", () => {
    expect(validateMemo("", "low").ok).toBe(true);
    expect(validateMemo("", "high").ok).toBe(false);
    expect(validateMemo("x".repeat(40), "high").ok).toBe(true);
    expect(validateMemo("x".repeat(80), "critical").ok).toBe(true);
    expect(validateMemo("x".repeat(40), "critical").ok).toBe(false);
  });
});

describe("§E9 handoff multi-turn", () => {
  it("is enabled (supersedes Pack C C037)", () => {
    expect(HANDOFF_MULTI_TURN_ENABLED).toBe(true);
  });
});

describe("§E11 quorum", () => {
  it("requires distinct family for live capital impact", () => {
    const policy = QUORUM_POLICIES.live_capital_impact;
    const okSigners = [
      { userId: "u1", roles: ["risk_officer"] as const },
      { userId: "u2", roles: ["capital_manager"] as const },
    ];
    expect(evaluateQuorum(okSigners, policy).ok).toBe(true);
    const missing = [
      { userId: "u1", roles: ["risk_officer"] as const },
      { userId: "u2", roles: ["risk_officer"] as const },
    ];
    expect(evaluateQuorum(missing, policy).ok).toBe(false);
  });
});
