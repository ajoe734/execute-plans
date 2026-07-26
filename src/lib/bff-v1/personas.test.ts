import { beforeEach, describe, expect, it, vi } from "vitest";
import { bffFetch } from "./client";
import { createPersona, PaperPersonaBundleIncompleteError } from "./personas";

vi.mock("./client", () => ({ bffFetch: vi.fn() }));

describe("createPersona paper bundle contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the create-paper-bundle command and accepts only a running bundle", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: {
      id: "persona-1",
      name: "Paper one",
      state: "paper_running",
      paperLedgerId: "paper-ledger-1",
      runtimeBindingId: "binding-1-paper",
    } });

    await expect(createPersona({ name: "Paper one" }, { idempotencyKey: "idem-1" }))
      .resolves.toMatchObject({ id: "persona-1", state: "paper_running" });
    expect(bffFetch).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      path: "/bff/management/personas/create-paper-bundle",
      idempotencyKey: "idem-1",
    }));
  });

  it("classifies a partial response as repairable instead of success", async () => {
    vi.mocked(bffFetch).mockResolvedValue({ data: {
      id: "persona-partial",
      name: "Partial",
      state: "setup_incomplete",
      failedStep: "runtime_binding",
    } });

    await expect(createPersona({ name: "Partial" })).rejects.toEqual(
      expect.objectContaining<Partial<PaperPersonaBundleIncompleteError>>({
        personaId: "persona-partial",
        failedStep: "runtime_binding",
      }),
    );
  });

  it("propagates BFF errors", async () => {
    vi.mocked(bffFetch).mockRejectedValue(new Error("write disabled"));
    await expect(createPersona({ name: "Blocked" })).rejects.toThrow("write disabled");
  });
});
