import { describe, expect, it, vi, beforeEach } from "vitest";
import { writeOverlay } from "@/lib/bff/writeOverlay";
import { createPersona } from "@/lib/bff-v1/personas";
import { createEntityFromInput } from "./createEntity";

vi.mock("@/lib/bff-v1/personas", () => ({
  createPersona: vi.fn(async (payload) => ({
    ...payload,
    id: "persona-backend-001",
    name: payload.name,
    owner: payload.owner ?? "you",
    updatedAt: "2026-05-13T00:00:00.000Z",
    state: "paper_running",
    paperLedgerId: "paper-ledger-001",
    runtimeBindingId: "binding-001-paper",
    risk: "low",
    archetype: payload.archetype ?? "generalist",
    routedStrategies: 0,
    successRate: 0,
  })),
}));

describe("createEntityFromInput", () => {
  beforeEach(() => {
    writeOverlay.clear();
    vi.clearAllMocks();
  });

  it("persists persona creation through the BFF instead of the write overlay", async () => {
    const addSpy = vi.spyOn(writeOverlay, "add");

    const result = await createEntityFromInput(
      "persona",
      {
        name: "Backend Persona",
        owner: "admin",
        archetype: "macro",
        description: "Persist me",
        initialMode: "shadow",
      },
      { idempotencyKey: "idem-persona" },
    );

    expect(result.persistence).toBe("bff");
    expect(result.data.id).toBe("persona-backend-001");
    expect(createPersona).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Backend Persona",
        owner: "admin",
        archetype: "macro",
        description: "Persist me",
        initialMode: "shadow",
      }),
      { idempotencyKey: "idem-persona" },
    );
    expect(addSpy).not.toHaveBeenCalled();
    expect(writeOverlay.list("persona")).toHaveLength(0);
  });

  it("keeps non-persona drawer creates on the existing overlay path", async () => {
    const result = await createEntityFromInput(
      "artifact",
      {
        name: "Research Artifact",
        owner: "admin",
        kind: "model",
        version: "v1",
      },
      { idempotencyKey: "idem-artifact" },
    );

    expect(result.persistence).toBe("overlay");
    expect(createPersona).not.toHaveBeenCalled();
    expect(writeOverlay.list("artifact")).toHaveLength(1);
  });

  it("does not fall back to an overlay when paper bundle creation fails", async () => {
    vi.mocked(createPersona).mockRejectedValueOnce(new Error("BFF unavailable"));

    await expect(createEntityFromInput("persona", {
      name: "No false success",
      owner: "admin",
      archetype: "macro",
    })).rejects.toThrow("BFF unavailable");

    expect(writeOverlay.list("persona")).toHaveLength(0);
  });
});
