import { describe, expect, it } from "vitest";
import { interactionAccessReason } from "./useAgoraWriteAccess";

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
