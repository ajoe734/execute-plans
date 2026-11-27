import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Persona } from "@/lib/bff-v1";
import { bffFetch } from "@/lib/bff-v1/client";
import PersonaOnboarding, {
  isCompletePaperBundle,
  reconcilePersonaProvisioning,
} from "./PersonaOnboarding";

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

const HOSTED_PAPER_OWNER_PERSONA_6507750312870D03A241 = persona({
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
  paperLedgerId: "paper-ledger-039ad01f8bcd2b4aa466",
  paper_ledger_id: "paper-ledger-039ad01f8bcd2b4aa466",
  runtimeBindingId: "rb-a2cb762c5aeb42ebbcf8f2e6894a1bc4",
  runtime_binding_id: "rb-a2cb762c5aeb42ebbcf8f2e6894a1bc4",
  runtimeId: "rt-3252fa75",
  deploymentPlanId: "plan-persona-paper-039ad01f8bcd2b4aa466",
  risk: "low",
  archetype: "quant",
  routedStrategies: 1,
  successRate: 0,
});

function LocationProbe() {
  const location = useLocation();
  return createElement("div", { "data-testid": "location-probe" }, `${location.pathname}${location.search}`);
}

function renderOnboardingRoute(initialEntry: string) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(LocationProbe),
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/management/personas/:id/onboarding",
          element: createElement(PersonaOnboarding),
        }),
        createElement(Route, {
          path: "/management/personas/:id",
          element: createElement("div", { "data-testid": "persona-detail-destination" }, "Persona detail page"),
        }),
      ),
    ),
  );
}

describe("PersonaOnboarding durable repair", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recognizes complete paper_running, paper_owner, consultable, and live_owner bundles with ledger and runtime binding", () => {
    for (const state of ["paper_running", "paper_owner", "consultable", "live_owner"]) {
      expect(
        isCompletePaperBundle(persona({ state, paperLedgerId: "ledger-1", runtimeBindingId: "binding-1" })),
      ).toBe(true);
      expect(
        isCompletePaperBundle(persona({ state, paper_ledger_id: "ledger-1", runtime_binding_id: "binding-1" })),
      ).toBe(true);
    }
    expect(isCompletePaperBundle(HOSTED_PAPER_OWNER_PERSONA_6507750312870D03A241)).toBe(true);
  });

  it("rejects genuinely incomplete bundles or failed/pending provisioning status", () => {
    expect(isCompletePaperBundle(persona({ paperLedgerId: "ledger-1" }))).toBe(false);
    expect(isCompletePaperBundle(persona({ state: "paper_owner", paperLedgerId: "ledger-1" }))).toBe(false);
    expect(isCompletePaperBundle(persona({ state: "paper_owner", runtimeBindingId: "binding-1" }))).toBe(false);
    expect(isCompletePaperBundle(persona({ state: "approved", paperLedgerId: "ledger-1", runtimeBindingId: "binding-1" }))).toBe(false);
    expect(isCompletePaperBundle(persona({ state: "research_only", paperLedgerId: "ledger-1", runtimeBindingId: "binding-1" }))).toBe(false);
    expect(
      isCompletePaperBundle(
        persona({
          state: "paper_owner",
          paperLedgerId: "ledger-1",
          runtimeBindingId: "binding-1",
          provisioningStatus: "failed",
        }),
      ),
    ).toBe(false);
    expect(
      isCompletePaperBundle(
        persona({
          state: "paper_owner",
          paperLedgerId: "ledger-1",
          runtimeBindingId: "binding-1",
          provisioningStatus: "pending",
        }),
      ),
    ).toBe(false);
    expect(
      isCompletePaperBundle(
        persona({
          state: "paper_owner",
          paperLedgerId: "ledger-1",
          runtimeBindingId: "binding-1",
          provisioningLifecycleState: "provisioning_failed",
        }),
      ),
    ).toBe(false);
    expect(
      isCompletePaperBundle(
        persona({
          state: "paper_owner",
          paperLedgerId: "ledger-1",
          runtimeBindingId: "binding-1",
          provisioning_state: "provisioning",
        }),
      ),
    ).toBe(false);
  });

  it("renders a complete ready state with back navigation for hosted paper_owner persona-6507750312870d03a241", async () => {
    vi.mocked(bffFetch).mockResolvedValue({
      data: HOSTED_PAPER_OWNER_PERSONA_6507750312870D03A241,
    });

    renderOnboardingRoute("/management/personas/persona-6507750312870d03a241/onboarding");

    expect(
      await screen.findByRole("heading", { name: "Paper Persona provisioning complete" }),
    ).toBeInTheDocument();
    expect(screen.getByText("paper-ledger-039ad01f8bcd2b4aa466")).toBeInTheDocument();
    expect(screen.getByText("rb-a2cb762c5aeb42ebbcf8f2e6894a1bc4")).toBeInTheDocument();
    expect(screen.queryByText(/Incomplete durable bundle/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reported failed step/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /View persona/i }));
    await waitFor(() => {
      expect(screen.getByTestId("persona-detail-destination")).toBeInTheDocument();
      expect(screen.getByTestId("location-probe")).toHaveTextContent(
        "/management/personas/persona-6507750312870d03a241",
      );
    });
  });

  it("does not fabricate Reported failed step: provisioning when navigating directly without failed_step query or backend failed step", async () => {
    vi.mocked(bffFetch).mockResolvedValue({
      data: persona({
        id: "persona-incomplete",
        name: "Incomplete Paper Persona",
        state: "paper_owner",
        paperLedgerId: "paper-ledger-inc",
        runtimeBindingId: undefined,
      }),
    });

    renderOnboardingRoute("/management/personas/persona-incomplete/onboarding");

    expect(
      await screen.findByRole("heading", { name: "Incomplete durable bundle" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Reported failed step/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /The durable Persona bundle is not yet complete\. The only enabled mutation is owned by the Persona provisioning controller\./i,
      ),
    ).toBeInTheDocument();
  });

  it("displays explicit failed_step query parameter when provided for an incomplete bundle", async () => {
    vi.mocked(bffFetch).mockResolvedValue({
      data: persona({
        id: "persona-incomplete",
        name: "Incomplete Paper Persona",
        state: "setup_incomplete",
        paperLedgerId: "paper-ledger-inc",
      }),
    });

    renderOnboardingRoute(
      "/management/personas/persona-incomplete/onboarding?repair=1&failed_step=runtime_binding",
    );

    expect(
      await screen.findByRole("heading", { name: "Incomplete durable bundle" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reported failed step:/i)).toBeInTheDocument();
    expect(screen.getByText("runtime_binding")).toBeInTheDocument();
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
