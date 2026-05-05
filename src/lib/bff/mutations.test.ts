import { describe, it, expect, beforeEach } from "vitest";
import { mutations } from "@/lib/bff/mutations";
import * as seed from "@/mocks/seed";
import { realtime } from "@/lib/bff/realtime";

describe("mutations + audit", () => {
  beforeEach(() => {
    // Reset acknowledgement state for the test alert.
    const a = seed.alerts.find((x) => x.id === "al_500");
    if (a) a.acknowledged = false;
  });

  it("acknowledgeAlert flips flag and writes audit", async () => {
    const before = seed.auditEvents.length;
    const r = await mutations.acknowledgeAlert("al_500", "looking at it");
    expect(r.ok).toBe(true);
    expect(seed.alerts.find((x) => x.id === "al_500")?.acknowledged).toBe(true);
    expect(seed.auditEvents.length).toBe(before + 1);
    expect(seed.auditEvents[0].action).toBe("alert.acknowledge");
    expect(seed.auditEvents[0].target).toBe("al_500");
    expect(seed.auditEvents[0].memo).toBe("looking at it");
  });

  it("approve sets approval state and audits", async () => {
    const id = seed.approvals[0].id;
    const before = seed.auditEvents.length;
    await mutations.approve(id, "ok");
    expect(seed.approvals.find((a) => a.id === id)?.state).toBe("approved");
    expect(seed.auditEvents.length).toBe(before + 1);
    expect(seed.auditEvents[0].action).toBe("approval.approve");
  });

  it("runAction updates entity state and emits realtime", async () => {
    let emitted = false;
    const off = realtime.on("data", () => { emitted = true; });
    const before = seed.auditEvents.length;
    await mutations.runAction({
      kind: "Strategy", id: "stg_005", action: "promote_live",
      newState: "deployed", memo: "test",
    });
    expect(seed.strategies.find((s) => s.id === "stg_005")?.state).toBe("deployed");
    expect(seed.auditEvents.length).toBe(before + 1);
    expect(emitted).toBe(true);
    off();
  });

  it("setIncidentStatus appends timeline entry", async () => {
    const id = seed.incidents[0].id;
    const beforeLen = seed.incidents[0].timeline?.length ?? 0;
    await mutations.setIncidentStatus(id, "resolved", "fixed");
    const inc = seed.incidents.find((i) => i.id === id)!;
    expect(inc.status).toBe("resolved");
    expect(inc.timeline!.length).toBe(beforeLen + 1);
  });

  it("runAction rejects illegal transitions when state matches machine vocabulary", async () => {
    // Force a strategy into a vocab-known state, then attempt an action with no transition.
    const s = seed.strategies.find((x) => x.id === "stg_005")!;
    s.state = "discovered" as typeof s.state;
    const r = await mutations.runAction({
      kind: "Strategy", id: "stg_005", action: "promote_live",
    });
    expect(r.ok).toBe(false);
    expect(r.rejected).toBe("illegal_transition");
    expect(r.audit.action).toBe("strategy.illegal_transition");
  });

  it("freezeMetric upserts a MetricFreeze and audits", async () => {
    const before = seed.auditEvents.length;
    const r = await mutations.freezeMetric("rb_q2_2026", "sharpe", true, "freeze sharpe");
    expect(r.ok).toBe(true);
    const row = seed.metricFreezes.find((m) => m.rebalanceId === "rb_q2_2026" && m.metric === "sharpe");
    expect(row?.frozen).toBe(true);
    expect(seed.auditEvents.length).toBe(before + 1);
    expect(seed.auditEvents[0].action).toBe("rebalance.freeze_metric");
  });

  it("setAllocationLimit upserts and audits", async () => {
    const r = await mutations.setAllocationLimit("cp_alpha", "strategy", "stg_001", 0.42);
    expect(r.ok).toBe(true);
    const row = seed.allocationLimits.find((l) => l.poolId === "cp_alpha" && l.scopeRef === "stg_001");
    expect(row?.cap).toBe(0.42);
  });

  // ---- Phase 14 Slice E + Phase 15 audit trail ----

  it("decideApproval records before/after snapshots and outcome=ok", async () => {
    const id = seed.approvals[0].id;
    const a = seed.approvals.find((x) => x.id === id)!;
    a.state = "pending";
    const r = await mutations.decideApproval(id, "approve", "lgtm");
    expect(r.ok).toBe(true);
    expect(r.audit.outcome).toBe("ok");
    expect(r.audit.before).toContain("pending");
    expect(r.audit.after).toContain("approved");
  });

  it("updatePermissionMatrix mutates cells and writes structured audit", async () => {
    const matrix = seed.permissionMatrices[0];
    const cell = matrix.cells[0];
    const target = cell.grant === "manage" ? "use" : "manage";
    const r = await mutations.updatePermissionMatrix(matrix.instance, [
      { rowId: cell.rowId, colId: cell.colId, grant: target },
    ], "test");
    expect(r.ok).toBe(true);
    expect(matrix.cells.find((c) => c.rowId === cell.rowId && c.colId === cell.colId)?.grant).toBe(target);
    expect(r.audit.action).toBe("permission.update_cells");
  });

  it("publishRoutePolicy bumps version and stamps state=review", async () => {
    const policy = seed.routePolicies[0];
    const before = seed.policyVersions.filter((v) => v.policyId === policy.id).length;
    const r = await mutations.publishRoutePolicy(policy.id, policy.rules.slice(0, 1), "trim");
    expect(r.ok).toBe(true);
    expect(policy.state).toBe("review");
    expect(seed.policyVersions.filter((v) => v.policyId === policy.id).length).toBe(before + 1);
  });

  it("rejected runAction marks audit outcome=rejected with before snapshot", async () => {
    const s = seed.strategies.find((x) => x.id === "stg_005")!;
    s.state = "discovered" as typeof s.state;
    const r = await mutations.runAction({ kind: "Strategy", id: "stg_005", action: "promote_live" });
    expect(r.ok).toBe(false);
    expect(r.audit.outcome).toBe("rejected");
    expect(r.audit.before).toContain("discovered");
  });
});
