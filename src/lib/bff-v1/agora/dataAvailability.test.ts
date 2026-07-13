import { describe, expect, it } from "vitest";

import { normalizeDataAvailabilityStatus } from "./dataAvailability";

describe("normalizeDataAvailabilityStatus", () => {
  it.each([
    ["full", "complete"],
    ["partial", "partial"],
    ["missing", "unavailable"],
    ["complete", "complete"],
    ["unavailable", "unavailable"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeDataAvailabilityStatus(input)).toBe(expected);
  });

  it("fails closed for an unknown wire value", () => {
    expect(normalizeDataAvailabilityStatus("delayed")).toBe("unavailable");
  });
});
