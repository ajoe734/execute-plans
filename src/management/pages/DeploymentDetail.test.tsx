import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { DeploymentDetail } from "./DeploymentDetail";
import { DeploymentsList } from "./Lists";
import deploymentsFixture from "@/lib/bff-v1/__tests__/fixtures/hosted-20261020/deployments.json";

void i18n.changeLanguage("en-US");

function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname}{loc.search}</output>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Deployments list & detail BFF contract alignment", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    liveStatus._reset();
  });

  it("navigates to /management/deployments/:plan_id instead of artifact_id when clicking a deployment list row", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse(deploymentsFixture));

    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <MemoryRouter initialEntries={["/management/deployments"]}>
            <Routes>
              <Route path="/management/deployments" element={<DeploymentsList />} />
              <Route path="/management/deployments/:id" element={<LocationProbe />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </I18nextProvider>,
    );

    const rowOwner = (await screen.findAllByText("control-plane-bff"))[0];
    fireEvent.click(rowOwner);

    expect(await screen.findByTestId("location")).toHaveTextContent(
      "/management/deployments/plan-persona-paper-3623d82dbfb3d31f75d8",
    );
  });

  it("renders a not-found EmptyState when GET /bff/deployments/:id returns 404 instead of staying on loading", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/deployments/")) {
        return jsonResponse({ detail: "Deployment not found" }, 404);
      }
      return jsonResponse({ data: [], items: [] }, 200);
    });

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/deployments/artifact-persona-paper-3623d82dbfb3d31f75d8"]}>
          <Routes>
            <Route path="/management/deployments/:id" element={<DeploymentDetail />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Deployment Not Found")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("renders Could Not Load Deployment when GET /bff/deployments/:id returns 500 instead of not-found or loading", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/deployments/")) {
        return jsonResponse({ detail: "Deployment service unavailable" }, 500);
      }
      return jsonResponse({ data: [], items: [] }, 200);
    });

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/deployments/dep-500"]}>
          <Routes>
            <Route path="/management/deployments/:id" element={<DeploymentDetail />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Could Not Load Deployment")).toBeInTheDocument();
    expect(screen.getByText(/Failed to load Deployment detail for ID dep-500: HTTP 500/)).toBeInTheDocument();
    expect(screen.queryByText("Deployment Not Found")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
});
