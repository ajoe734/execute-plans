import { describe, it, expect } from "vitest";
import { deriveFindings } from "@/lib/v5/sentinel";
import * as seed from "@/mocks/seed";

describe("v5 sentinel deriver (Q9)", () => {
  it("produces a finding per alert and incident", () => {
    const out = deriveFindings({
      alerts: seed.alerts,
      incidents: seed.incidents,
      runtimes: seed.runtimes,
      jobs: seed.jobs,
    });
    expect(out.length).toBeGreaterThanOrEqual(seed.alerts.length + seed.incidents.length);
    for (const f of out) {
      expect(f.confidence).toBeGreaterThan(0);
      expect(f.confidence).toBeLessThanOrEqual(0.95);
      expect(f.recommendedActionIds.length).toBeGreaterThan(0);
    }
  });

  it("critical alerts map to critical severity", () => {
    const out = deriveFindings({
      alerts: [{ id: "a1", severity: "critical", title: "x", source: "test", openedAt: new Date().toISOString(), acknowledged: false }],
      incidents: [],
    });
    expect(out[0].severity).toBe("critical");
    expect(out[0].confidence).toBeGreaterThanOrEqual(0.88);
  });
});
