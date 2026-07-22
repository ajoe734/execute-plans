import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolvePersonaForDetail } from "./personaDetailData";
import { personaHumanInboxUrl } from "./PersonaDetail";
import type { Persona } from "@/lib/bff/types";
import { getPersona } from "@/lib/bff-v1/personas";

vi.mock("@/lib/bff-v1/personas", () => ({
  getPersona: vi.fn(),
}));

describe("PersonaDetail", () => {
  beforeEach(() => {
    vi.mocked(getPersona).mockReset();
  });

  it("resolves persona detail from the BFF persona endpoint", async () => {
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

    vi.mocked(getPersona).mockResolvedValue(persona);

    await expect(resolvePersonaForDetail("ps_detail")).resolves.toMatchObject({
      id: "ps_detail",
      name: "Detail Persona",
    });
    expect(getPersona).toHaveBeenCalledWith("ps_detail");
  });

  it("builds a persona-scoped Human Inbox entry URL", () => {
    expect(personaHumanInboxUrl("persona/tw equity")).toBe(
      "/management/human-inbox?persona=persona%2Ftw%20equity",
    );
  });
});
