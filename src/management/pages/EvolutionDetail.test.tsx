import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { EvolutionDetail } from "./EvolutionDetail";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("EvolutionDetail load states", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
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

  it("renders Evolution Program Not Found on 404 instead of staying on loading", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/evolution-programs/")) {
        return jsonResponse({ detail: "Evolution program not found" }, 404);
      }
      return jsonResponse({ data: [], items: [] }, 200);
    });

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/evolution/evo-missing"]}>
          <Routes>
            <Route path="/management/evolution/:id" element={<EvolutionDetail />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Evolution Program Not Found")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("renders Could Not Load Evolution Program on 500", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/evolution-programs/")) {
        return jsonResponse({ detail: "Evolution service unavailable" }, 500);
      }
      return jsonResponse({ data: [], items: [] }, 200);
    });

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/evolution/evo-500"]}>
          <Routes>
            <Route path="/management/evolution/:id" element={<EvolutionDetail />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Could Not Load Evolution Program")).toBeInTheDocument();
    expect(screen.getByText(/Failed to load Evolution Program detail for ID evo-500: HTTP 500/)).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
});
