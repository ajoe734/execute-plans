import { describe, it, expect } from "vitest";
import { bff } from "@/lib/bff/client";
import { v5ActionOverlay } from "@/lib/v5/overlay";

describe("bff.v5 facade (Q3/Q14/Q16/Q24)", () => {
  it("exposes session without depending on MeDto", async () => {
    const s = await bff.v5.session.get();
    expect(s.tenantId).toBe("demo");
    expect(s.env).toBeTruthy();
    expect(s.locale).toBeTruthy();
  });

  it("controlRoom.get returns summary with kpi + topFindings", async () => {
    const s = await bff.v5.controlRoom.get();
    expect(s.kpi).toBeDefined();
    expect(Array.isArray(s.topFindings)).toBe(true);
    expect(Array.isArray(s.loopRuns)).toBe(true);
  });

  it("loops.list returns V5ListResponse with totalCountExact=true", async () => {
    const r = await bff.v5.loops.list();
    expect(r.totalCountExact).toBe(true);
    expect(r.items.length).toBe(r.totalCount);
  });

  it("personas.health returns adapted PersonaExecutionHealth with formulaVersion", async () => {
    const r = await bff.v5.personas.health();
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items[0].formulaVersion).toBe("v0-mock");
    expect(["live","paper","shadow","suspended"]).toContain(r.items[0].mode);
  });

  it("remediation.build emergency requires HighRiskConfirm", () => {
    const a = bff.v5.remediation.build("pause_persona_routing", { targetKind: "persona", targetId: "per_quant" });
    expect(a?.mode).toBe("emergency_override");
    expect(a?.requiresHighRiskConfirm).toBe(true);
  });

  it("remediation.execute updates overlay only (no seed mutation)", async () => {
    v5ActionOverlay.clear();
    const a = bff.v5.remediation.build("switch_persona_to_shadow", { targetKind: "persona", targetId: "per_quant" })!;
    const r = await bff.v5.remediation.execute(a);
    expect(r.overlayUpdated).toBe(true);
    expect(v5ActionOverlay.getPersona("per_quant")?.forcedMode).toBe("shadow");
    v5ActionOverlay.clear();
  });
});
