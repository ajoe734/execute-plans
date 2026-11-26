import { beforeEach, describe, expect, it, vi } from "vitest";
import { bffFetch } from "./client";
import { createPersona, getPersona, normalizePersonaRiskPolicyChange, PaperPersonaBundleIncompleteError } from "./personas";

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

describe("Persona detail authoritative risk contract", () => {
  beforeEach(() => vi.clearAllMocks());

  const shadowChange = {
    requestedRisk: "high", effectiveRisk: "high", status: "effective",
    policyVersion: "shadow-v9", approvalId: "shadow-approval",
  };

  it.each([undefined, null])("does not create capability from risk_policy_change when canonical field is %s", async (riskPolicyChange) => {
    vi.mocked(bffFetch).mockResolvedValue({ data: {
      id: "paper-1", riskPolicyChange, risk_policy_change: shadowChange,
    } });
    const persona = await getPersona("paper-1");
    expect(persona?.riskPolicyChange).toBe(riskPolicyChange);
  });

  it.each([undefined, null])("keeps unverified canonical values null despite conflicting shadow fields (%s)", async (effectiveRisk) => {
    const canonical = {
      requestedRisk: "medium", effectiveRisk, status: "pending_approval",
      policyVersion: null, approvalId: null,
      requested_risk: "high", effective_risk: "high", effective_profile: "high",
      policy_version: "shadow-v9", approval_id: "shadow-approval",
    };
    vi.mocked(bffFetch).mockResolvedValue({ data: {
      id: "paper-1", riskPolicyChange: canonical, risk_policy_change: shadowChange,
    } });
    expect((await getPersona("paper-1"))?.riskPolicyChange).toEqual({
      requestedRisk: "medium", effectiveRisk: null, status: "pending_approval",
      policyVersion: null, approvalId: null,
    });
  });

  it("does not promote a snake_case policy record into verified tiers or provenance", () => {
    expect(normalizePersonaRiskPolicyChange({
      requested_risk: "high", effective_risk: "high", status: "effective",
      policy_version: "shadow-v9", approval_id: "shadow-approval",
    })).toEqual({
      requestedRisk: null, effectiveRisk: null, status: "effective",
      policyVersion: null, approvalId: null,
    });
  });
});
