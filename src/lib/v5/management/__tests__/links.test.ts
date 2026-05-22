import { describe, it, expect } from "vitest";
import {
  resolveManagementHref, buildLinkSet,
  EVIDENCE_HREF_FALLBACK_LABEL, ACTION_HREF_FALLBACK_LABEL,
  type ManagementHrefKind,
} from "../links";

describe("resolveManagementHref — PM-2 deep link rules", () => {
  const cases: Array<[ManagementHrefKind, string | undefined, string | null, Parameters<typeof resolveManagementHref>[2]?]> = [
    ["persona", "alpha-trader", "/management/personas/alpha-trader"],
    ["strategy", "s/01", "/management/strategies/s%2F01"],
    ["capital_pool", "cap-1", "/management/capital/cap-1"],
    ["capital_pool_live", undefined, "/management/readiness/capital-binding-live?pool=cap-1", { poolId: "cap-1" }],
    ["approval", "g-77", "/management/governance/g-77"],
    ["approval", undefined, "/management/governance"],
    ["human_gate", "gate-1", "/management/human-inbox/gate-1"],
    ["human_gate", undefined, "/management/human-inbox"],
    ["deployment", "dep-9", "/management/deployments/dep-9"],
    ["runtime", "rt-1", "/management/runtimes?runtime=rt-1"],
    ["evidence", "ev:1", "/management/evidence/ev%3A1"],
    ["postmortem", "pm-2", "/management/postmortems?item=pm-2"],
    ["evolution", "ev-101", "/management/evolution-journal?item=ev-101"],
    ["loop_run", "run-1", "/management/loops/research?run=run-1", { loopKind: "research" }],
    ["sentinel", "f-1", "/management/sentinel?finding=f-1"],
    ["intervention", "i-1", "/management/interventions?item=i-1"],
    ["broker_live", undefined, "/management/readiness/broker-live"],
    ["bff_ha", undefined, "/management/readiness/bff-ha"],
    ["strict_publish", undefined, "/management/readiness/strict-publish"],
  ];
  it.each(cases)("kind=%s id=%s → %s", (kind, id, expected, opts) => {
    expect(resolveManagementHref(kind, id, opts ?? {})).toBe(expected);
  });

  it("returns null for object kinds with no id", () => {
    expect(resolveManagementHref("persona", undefined)).toBeNull();
    expect(resolveManagementHref("strategy", undefined)).toBeNull();
    expect(resolveManagementHref("evidence", undefined)).toBe("/management/evidence");
    // evidence falls back to list page; that's the intended fallback.
  });
});

describe("buildLinkSet — PM-2", () => {
  it("throws when primary cannot be resolved", () => {
    expect(() => buildLinkSet({ primary: { kind: "persona" } })).toThrow();
  });
  it("composes manage + evidence + action + audit", () => {
    const set = buildLinkSet({
      primary: { kind: "persona", id: "alpha" },
      evidence: { id: "ev:1" },
      recommendedAction: { kind: "human_gate", id: "gate-1" },
      audit: { id: "aud-1" },
    });
    expect(set.manageHref).toBe("/management/personas/alpha");
    expect(set.evidenceHref).toBe("/management/evidence/ev%3A1");
    expect(set.recommendedActionHref).toBe("/management/human-inbox/gate-1");
    expect(set.auditHref).toBe("/management/audit?item=aud-1");
  });
  it("exports fallback labels (UI MUST display these instead of inventing URLs)", () => {
    expect(EVIDENCE_HREF_FALLBACK_LABEL).toBe("Evidence missing");
    expect(ACTION_HREF_FALLBACK_LABEL).toBe("No action required");
  });
});
