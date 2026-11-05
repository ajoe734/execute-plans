import { describe, expect, it, vi, beforeEach } from "vitest";
import { writeOverlay } from "@/lib/bff-v1/writeOverlay";
import { createPersona } from "@/lib/bff-v1/personas";
import { createEvolutionProgram } from "@/lib/bff-v1/evolution";
import * as createDefaults from "@/lib/writeIntents/createDefaults";
import { DURABLE_CREATE_OWNERS, durableCreateOwner, hasDurableCreateOwner } from "@/lib/writeIntents/types";
import {
  createEntityFromInput,
  deleteEntity,
  UnsupportedEntityMutationError,
  updateEntityFromInput,
} from "./createEntity";

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

vi.mock("@/lib/bff-v1/evolution", () => ({
  createEvolutionProgram: vi.fn(async (payload: { name: string }) => ({
    id: "evo-program-001",
    programId: "evo-program-001",
    name: payload.name,
    owner: "—",
    state: "draft",
    status: "draft",
    risk: "medium",
    updatedAt: "2026-11-04T00:00:00Z",
    parentAlpha: "",
    generation: 0,
    population: 0,
    bestFitness: 0,
    progress: 0,
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
        initialMode: "paper",
        executionMode: "paper",
        capitalMode: "paper",
        deploymentStage: "paper",
        liveCapitalEnabled: false,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
      }),
      { idempotencyKey: "idem-persona" },
    );
    expect(addSpy).not.toHaveBeenCalled();
    expect(writeOverlay.list("persona")).toHaveLength(0);
  });

  it("registers evolutionProgram in DURABLE_CREATE_OWNERS and sends only name without buildEntity defaults", async () => {
    expect(DURABLE_CREATE_OWNERS.evolutionProgram).toBe("POST /bff/evolution-programs");
    expect(hasDurableCreateOwner("evolutionProgram")).toBe(true);
    expect(durableCreateOwner("evolutionProgram")).toBe("POST /bff/evolution-programs");
    expect(hasDurableCreateOwner("researchExperiment")).toBe(false);

    const addSpy = vi.spyOn(writeOverlay, "add");
    const buildSpy = vi.spyOn(createDefaults, "buildEntity");

    const result = await createEntityFromInput(
      "evolutionProgram",
      {
        name: "  Cross-Sectional Alpha Direction  ",
        owner: "should-not-be-sent",
        memo: "should-not-be-sent",
      },
      { idempotencyKey: "idem-evo-001" },
    );

    expect(result.persistence).toBe("bff");
    expect(result.entity).toBe("evolutionProgram");
    expect(result.data).toMatchObject({
      id: "evo-program-001",
      name: "Cross-Sectional Alpha Direction",
      state: "draft",
      status: "draft",
    });
    expect(createEvolutionProgram).toHaveBeenCalledTimes(1);
    expect(createEvolutionProgram).toHaveBeenCalledWith(
      { name: "Cross-Sectional Alpha Direction" },
      { idempotencyKey: "idem-evo-001" },
    );
    expect(buildSpy).not.toHaveBeenCalled();
    expect(addSpy).not.toHaveBeenCalled();
    expect(writeOverlay.list("evolutionProgram")).toHaveLength(0);
  });

  it("fail-closes a non-persona create instead of writing an overlay", async () => {
    const addSpy = vi.spyOn(writeOverlay, "add");

    await expect(createEntityFromInput(
      "artifact",
      {
        name: "Research Artifact",
        owner: "admin",
        kind: "model",
        version: "v1",
      },
      { idempotencyKey: "idem-artifact" },
    )).rejects.toEqual(expect.objectContaining({
      name: "UnsupportedEntityMutationError",
      code: "DURABLE_WRITE_OWNER_REQUIRED",
      entity: "artifact",
      operation: "create",
    }));

    expect(createPersona).not.toHaveBeenCalled();
    expect(addSpy).not.toHaveBeenCalled();
    expect(writeOverlay.list("artifact")).toHaveLength(0);
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

  it("fail-closes generic update and delete without touching the overlay", async () => {
    const updateSpy = vi.spyOn(writeOverlay, "update");
    const deleteSpy = vi.spyOn(writeOverlay, "softDelete");
    const input = {
      name: "Research Artifact",
      owner: "admin",
      kind: "model" as const,
      version: "v1",
    };

    await expect(updateEntityFromInput("artifact", "artifact-1", input))
      .rejects.toBeInstanceOf(UnsupportedEntityMutationError);
    await expect(deleteEntity("artifact", "artifact-1"))
      .rejects.toBeInstanceOf(UnsupportedEntityMutationError);

    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
