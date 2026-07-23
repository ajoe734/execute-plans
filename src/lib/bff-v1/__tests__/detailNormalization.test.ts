// MGMT-GAP-008 — detail DTO / render honesty.
// `normalizeBaseObjectFields` is the fix for `liveDetailFrom`/`liveItemsFrom`
// only unwrapping the `{data: ...}` envelope and never mapping field names,
// which let a live BFF response missing/renaming `state`/`risk`/`name`/
// `owner`/`updatedAt` reach EntityHeader/StatusBadge/RiskBadge as `undefined`
// (rendered as literal `status.undefined` / `risk.undefined` / blank fields).
import { describe, it, expect } from "vitest";
import { normalizeBaseObjectFields } from "@/lib/bff-v1/seed";

describe("normalizeBaseObjectFields", () => {
  it("recovers state/risk/owner/updatedAt/name from common snake_case aliases", () => {
    const raw = {
      id: "pool-1",
      title: "Rescue Pool",
      status: "deployed",
      risk_level: "high",
      owned_by: "ops-team",
      updated_at: "2026-06-30T00:00:00Z",
    };
    const out = normalizeBaseObjectFields(raw) as Record<string, unknown>;
    expect(out.name).toBe("Rescue Pool");
    expect(out.state).toBe("deployed");
    expect(out.risk).toBe("high");
    expect(out.owner).toBe("ops-team");
    expect(out.updatedAt).toBe("2026-06-30T00:00:00Z");
  });

  it("never overwrites a field that's already present, even if an alias also exists", () => {
    const raw = { id: "pool-1", name: "Canonical Name", title: "Should not win", state: "paused", status: "deployed" };
    const out = normalizeBaseObjectFields(raw) as Record<string, unknown>;
    expect(out.name).toBe("Canonical Name");
    expect(out.state).toBe("paused");
  });

  it("leaves genuinely missing fields undefined instead of fabricating a value", () => {
    const raw = { id: "pool-1" };
    const out = normalizeBaseObjectFields(raw) as Record<string, unknown>;
    expect(out.state).toBeUndefined();
    expect(out.risk).toBeUndefined();
    expect(out.owner).toBeUndefined();
  });

  it("passes through non-object values unchanged", () => {
    expect(normalizeBaseObjectFields(undefined)).toBeUndefined();
  });
});
