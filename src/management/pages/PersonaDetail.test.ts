import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolvePersonaForDetail } from "./personaDetailData";
import { personaHumanInboxUrl, personaWorkshopEntryUrl } from "./PersonaDetail";
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

  it("builds a focus-preserving canonical Workshop interaction entry", () => {
    const url = personaWorkshopEntryUrl({
      workshopId: "ws/persona 1",
      mode: "consult",
      participantIds: ["persona-a", "persona-b"],
      picker: "cross-style",
      returnTo: "/management/personas/persona-a?tab=tradeJournal",
      returnLabel: "Persona A",
    });
    const parsed = new URL(url, "https://example.test");
    expect(parsed.pathname).toBe("/agora/strategy-workshop/ws%2Fpersona%201");
    expect(parsed.searchParams.get("mode")).toBe("consult");
    expect(parsed.searchParams.get("participants")).toBe("persona-a,persona-b");
    expect(parsed.searchParams.get("return_to")).toBe("/management/personas/persona-a?tab=tradeJournal");
  });
});
