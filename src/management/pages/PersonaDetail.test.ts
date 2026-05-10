import { describe, it, expect, beforeEach } from "vitest";
import { writeOverlay } from "@/lib/bff/writeOverlay";
import { resolvePersonaForDetail } from "./personaDetailData";
import type { Persona } from "@/lib/bff/types";

describe("PersonaDetail", () => {
  beforeEach(() => writeOverlay.clear());

  it("resolves a newly-created persona from the write overlay", async () => {
    const persona: Persona = {
      id: "ps_detail",
      name: "Detail Persona",
      owner: "you",
      updatedAt: "2026-05-10T00:00:00.000Z",
      state: "draft",
      risk: "low",
      archetype: "macro",
      routedStrategies: 0,
      successRate: 0,
    };

    writeOverlay.add("persona", persona);

    await expect(resolvePersonaForDetail("ps_detail")).resolves.toMatchObject({
      id: "ps_detail",
      name: "Detail Persona",
    });
  });
});
