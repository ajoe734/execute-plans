import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Persona } from "@/lib/bff-v1";
import { bffFetch } from "@/lib/bff-v1/client";
import { isCompletePaperBundle, reconcilePersonaProvisioning } from "./PersonaOnboarding";

vi.mock("@/lib/bff-v1/client", () => ({ bffFetch: vi.fn() }));

const persona = (overrides: Record<string, unknown> = {}) => ({
  id: "persona-1",
  name: "Paper Alpha",
  owner: "operator",
  updatedAt: "2026-07-11T00:00:00Z",
  state: "paper_running",
  risk: "low",
  archetype: "systematic",
  routedStrategies: 0,
  successRate: 0,
  ...overrides,
}) as unknown as Persona;

describe("PersonaOnboarding durable repair", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recognizes only a complete running paper bundle", () => {
    expect(isCompletePaperBundle(persona({ paperLedgerId: "ledger-1", runtimeBindingId: "binding-1" }))).toBe(true);
    expect(isCompletePaperBundle(persona({ paperLedgerId: "ledger-1" }))).toBe(false);
    expect(isCompletePaperBundle(persona({ state: "approved", paperLedgerId: "ledger-1", runtimeBindingId: "binding-1" }))).toBe(false);
  });

  it("uses only the Persona provisioning controller for repair", async () => {
    const readback = persona({ paperLedgerId: "ledger-1", runtimeBindingId: "binding-1" });
    vi.mocked(bffFetch).mockResolvedValue({
      data: readback,
      meta: { status: "ok", reconciled_by: "persona_provisioning_controller" },
    });

    await expect(reconcilePersonaProvisioning(" persona/1 ")).resolves.toEqual({
      persona: readback,
      meta: { status: "ok", reconciled_by: "persona_provisioning_controller" },
    });
    expect(bffFetch).toHaveBeenCalledTimes(1);
    expect(bffFetch).toHaveBeenCalledWith({
      method: "POST",
      path: "/bff/personas/persona%2F1/provisioning/reconcile",
    });
  });

  it("refuses a repair without a canonical Persona id", async () => {
    await expect(reconcilePersonaProvisioning("  ")).rejects.toThrow("Persona id is required");
    expect(bffFetch).not.toHaveBeenCalled();
  });
});
