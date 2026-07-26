import { describe, expect, it } from "vitest";

import { bindPplAlloc009SessionRotation } from "../../e2e/helpers/pplAlloc009Session";


const CURRENT_SESSION = {
  active: true,
  ended_at: null,
  heartbeat_status: "active",
  last_heartbeat_at: "2026-07-24T21:54:00Z",
  runtime_binding_id: "rb-009",
  runtime_id: "rt-009",
  session_id: "prmon-rb-009-current",
  status: "running",
};

function bind(overrides: Record<string, unknown> = {}) {
  return bindPplAlloc009SessionRotation({
    currentMonitoringSession: {
      ...CURRENT_SESSION,
      ...(
        typeof overrides.currentMonitoringSession === "object"
        && overrides.currentMonitoringSession !== null
          ? overrides.currentMonitoringSession
          : {}
      ),
    },
    currentPaperSessionId: String(
      overrides.currentPaperSessionId ?? CURRENT_SESSION.session_id,
    ),
    provisioningPaperSessionId: String(
      overrides.provisioningPaperSessionId ?? "prmon-rb-009-provisioning",
    ),
    rankingSessionId: String(
      overrides.rankingSessionId ?? CURRENT_SESSION.session_id,
    ),
    runtimeBindingId: String(overrides.runtimeBindingId ?? "rb-009"),
    runtimeId: String(overrides.runtimeId ?? "rt-009"),
  });
}

describe("PPL-ALLOC-009 paper monitoring session binding", () => {
  it("records a valid worker-session rotation without treating the immutable provisioning proof as current", () => {
    expect(bind()).toEqual({
      currentHeartbeatAt: "2026-07-24T21:54:00Z",
      currentPaperSessionId: "prmon-rb-009-current",
      detected: true,
      provisioningPaperSessionId: "prmon-rb-009-provisioning",
      runtimeBindingId: "rb-009",
      runtimeId: "rt-009",
    });
  });

  it("also accepts a non-rotated session when every current authority agrees", () => {
    expect(bind({
      provisioningPaperSessionId: CURRENT_SESSION.session_id,
    }).detected).toBe(false);
  });

  it("rejects a ranking session that differs from the current eligibility authority", () => {
    expect(() => bind({ rankingSessionId: "prmon-rb-009-other" })).toThrow(
      "Ranking session",
    );
  });

  it("rejects a current session joined to the wrong RuntimeBinding", () => {
    expect(() => bind({
      currentMonitoringSession: { runtime_binding_id: "rb-other" },
    })).toThrow("RuntimeBinding");
  });

  it.each([
    [{ status: "ended", active: false }, "not running"],
    [{ active: false }, "not active"],
    [{ ended_at: "2026-07-24T21:55:00Z" }, "already ended"],
    [{ heartbeat_status: "stale" }, "heartbeat is not active"],
  ])("rejects non-current owner evidence %#", (session, message) => {
    expect(() => bind({ currentMonitoringSession: session })).toThrow(message);
  });
});
