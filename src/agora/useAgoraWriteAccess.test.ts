import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { liveWriteGated } from "@/lib/bff-v1/writeGate";
import { interactionAccessReason, useAgoraWriteAccess } from "./useAgoraWriteAccess";

const session = vi.hoisted(() => ({ roles: ["operator"] }));
vi.mock("@/lib/v4/session/me", () => ({
  useMe: () => ({ me: { user: { id: "test-actor" }, roles: session.roles }, loading: false }),
}));
vi.mock("@/lib/bff-v1/writeGate", () => ({ liveWriteGated: vi.fn() }));
vi.mock("@/lib/bff-v1/agora/identity", () => ({
  agoraIdentityClient: { getCapabilities: async () => ["agora.workshop.v1"] },
}));

afterEach(cleanup);

describe("Agora write hook role gating", () => {
  it.each([
    ["operator", true], ["approver", true], ["admin", true], ["reviewer", true],
    ["platform_admin", false], ["ops", false], ["research_lead", false],
    ["analyst", false], ["strategy_manager", false], ["viewer", false],
  ])("sets interactionAllowed for %s to %s", async (role, allowed) => {
    session.roles = [role];
    vi.mocked(liveWriteGated).mockResolvedValue(true);
    const { result } = renderHook(() => useAgoraWriteAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.interactionAllowed).toBe(allowed);
    expect(result.current.interactionDisabledReason).toBe(allowed
      ? null : "Interaction requires an operator, reviewer, approver, or admin role.");
  });

  it.each(["operator", "approver", "admin", "reviewer"])("denies %s when writeGate disables real writes", async (role) => {
    session.roles = [role];
    vi.mocked(liveWriteGated).mockResolvedValue(false);
    const { result } = renderHook(() => useAgoraWriteAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.writeAllowed).toBe(false);
    expect(result.current.interactionAllowed).toBe(false);
    expect(result.current.interactionDisabledReason).toMatch(/disabled by deployment policy/i);
  });
});

describe("Agora interaction authority readback", () => {
  it("denies a plain authenticated or viewer identity even with a capability", () => {
    for (const role of ["authenticated", "viewer"]) {
      expect(interactionAccessReason({
        agoraCapabilities: ["agora.workshop.v1"],
        roles: [role],
        writeAllowed: true,
      })).toMatch(/requires an operator/i);
    }
  });

  it("requires both BFF write eligibility and an Agora capability", () => {
    expect(interactionAccessReason({
      agoraCapabilities: ["agora.workshop.v1"],
      roles: ["operator"],
      writeAllowed: true,
    })).toBeNull();
    expect(interactionAccessReason({
      agoraCapabilities: [],
      roles: ["operator"],
      writeAllowed: true,
    })).toMatch(/Agora Workshop/i);
    expect(interactionAccessReason({
      agoraCapabilities: ["agora.workshop.v1"],
      roles: ["operator"],
      writeAllowed: false,
    })).toMatch(/disabled by deployment policy/i);
  });
});
