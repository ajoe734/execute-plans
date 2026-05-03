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
});
