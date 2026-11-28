import { beforeEach, describe, expect, it, vi } from "vitest";
import { bffFetch } from "./client";
import {
  COMPLETE_PAPER_BUNDLE_STATES,
  createPersona,
  getPersona,
  isCompletePaperPersonaBundle,
  listPersonas,
  normalizePersonaRiskPolicyChange,
  PaperPersonaBundleIncompleteError,
} from "./personas";

vi.mock("./client", () => ({ bffFetch: vi.fn() }));

const HOSTED_PAPER_OWNER_PERSONA_6507750312870D03A241 = {
  id: "persona-6507750312870d03a241",
  name: "澄川｜2317 台股 Paper 學習 R2",
  owner: "pantheon-dev-operator-a",
  tenantId: "tenant-dev",
  updatedAt: "2026-11-23T01:00:00Z",
  state: "paper_owner",
  lifecycleStatus: "paper_owner",
  ownerLifecycleState: "paper_owner",
  provisioningLifecycleState: "paper_running",
  capitalMode: "paper",
  deploymentStage: "paper",
  paper_ledger_id: "paper-ledger-039ad01f8bcd2b4aa466",
  runtime_binding_id: "rb-a2cb762c5aeb42ebbcf8f2e6894a1bc4",
  runtimeId: "rt-3252fa75",
  deploymentPlanId: "plan-persona-paper-039ad01f8bcd2b4aa466",
  risk: "low",
  archetype: "quant",
  routedStrategies: 1,
  successRate: 0,
};

describe("listPersonas scope contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves owner listScope values and missing scope through normalization", async () => {
    const rows = ["current", "test", "retired", "research", "unknown", null].map((listScope, i) => ({
      id: `p-${i}`, name: `Persona ${i}`, listScope,
    }));
    const missing = { id: "p-missing", name: "Legacy persona" };
    vi.mocked(bffFetch).mockResolvedValue({ data: { items: [...rows, missing] } });
    const result = await listPersonas();
    expect(result.map((row) => row.listScope)).toEqual([...rows.map((row) => row.listScope), undefined]);
    expect(result[result.length - 1]).not.toHaveProperty("listScope");
    expect(bffFetch).toHaveBeenCalledTimes(1);
    expect(bffFetch).toHaveBeenCalledWith(expect.objectContaining({ path: "/bff/personas" }));
  });
});

describe("createPersona paper bundle contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(COMPLETE_PAPER_BUNDLE_STATES)(
    "uses the create-paper-bundle command and accepts complete %s bundles",
    async (state) => {
      vi.mocked(bffFetch).mockResolvedValue({
        data: {
          id: "persona-1",
          name: "Paper one",
          state,
          paperLedgerId: "paper-ledger-1",
          runtimeBindingId: "binding-1-paper",
        },
      });

      await expect(createPersona({ name: "Paper one" }, { idempotencyKey: "idem-1" }))
        .resolves.toMatchObject({
          id: "persona-1",
          state,
          paperLedgerId: "paper-ledger-1",
          runtimeBindingId: "binding-1-paper",
        });
      expect(bffFetch).toHaveBeenCalledWith(expect.objectContaining({
        method: "POST",
        path: "/bff/management/personas/create-paper-bundle",
        idempotencyKey: "idem-1",
      }));
    },
  );

  it("accepts the hosted paper_owner shape of persona-6507750312870d03a241 with snake_case ledger and runtime binding IDs", async () => {
    vi.mocked(bffFetch).mockResolvedValue({
      data: HOSTED_PAPER_OWNER_PERSONA_6507750312870D03A241,
      meta: {
        provisioning_state: "succeeded",
        paper_ledger_id: "paper-ledger-039ad01f8bcd2b4aa466",
        runtime_binding_id: "rb-a2cb762c5aeb42ebbcf8f2e6894a1bc4",
      },
    });

    const created = await createPersona({ name: "澄川｜2317 台股 Paper 學習 R2" });
    expect(created).toMatchObject({
      id: "persona-6507750312870d03a241",
      state: "paper_owner",
      paperLedgerId: "paper-ledger-039ad01f8bcd2b4aa466",
      runtimeBindingId: "rb-a2cb762c5aeb42ebbcf8f2e6894a1bc4",
    });
    expect(isCompletePaperPersonaBundle(HOSTED_PAPER_OWNER_PERSONA_6507750312870D03A241)).toBe(true);
  });

  it.each([
    { label: "missing runtime_binding_id", overrides: { runtime_binding_id: "", runtimeBindingId: undefined } },
    { label: "missing paper_ledger_id", overrides: { paper_ledger_id: "", paperLedgerId: undefined } },
    { label: "provisioningStatus=failed", overrides: { provisioningStatus: "failed" } },
    { label: "provisioningStatus=pending", overrides: { provisioningStatus: "pending" } },
    { label: "provisioning_state=provisioning", overrides: { provisioning_state: "provisioning" } },
    { label: "provisioningLifecycleState=provisioning_failed", overrides: { provisioningLifecycleState: "provisioning_failed" } },
    { label: "non-bundle lifecycle research_only", overrides: { state: "research_only", lifecycleStatus: "research_only", ownerLifecycleState: "research_only" } },
  ])("rejects incomplete or failed/pending paper_owner bundle ($label)", async ({ overrides }) => {
    const candidate = {
      ...HOSTED_PAPER_OWNER_PERSONA_6507750312870D03A241,
      ...overrides,
    };
    expect(isCompletePaperPersonaBundle(candidate)).toBe(false);

    vi.mocked(bffFetch).mockResolvedValue({ data: candidate });
    await expect(createPersona({ name: "Incomplete" })).rejects.toBeInstanceOf(
      PaperPersonaBundleIncompleteError,
    );
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
