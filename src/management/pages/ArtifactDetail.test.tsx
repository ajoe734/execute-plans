import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { ArtifactDetail } from "./ArtifactDetail";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderArtifactDetail(path: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/management/artifacts/:id" element={<ArtifactDetail />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("ArtifactDetail load states", () => {
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

  it("renders the not-found state instead of hanging on Loading when GET /bff/artifacts/undefined returns 404", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/artifacts/")) {
        return jsonResponse({ detail: "Research artifact not found" }, 404);
      }
      return jsonResponse({ data: [], items: [] }, 200);
    });

    renderArtifactDetail("/management/artifacts/undefined");

    expect(await screen.findByText("Artifact Not Found")).toBeInTheDocument();
    expect(
      screen.getByText("Artifact detail for ID undefined is not available in the live contract."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(screen.queryByText("載入中…")).not.toBeInTheDocument();
  });

  it("renders the error state instead of not-found or Loading when GET /bff/artifacts/:id returns 500", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/artifacts/")) {
        return jsonResponse({ detail: "Artifact registry unavailable" }, 500);
      }
      return jsonResponse({ data: [], items: [] }, 200);
    });

    renderArtifactDetail("/management/artifacts/art-500");

    expect(await screen.findByText("Could Not Load Artifact")).toBeInTheDocument();
    expect(
      screen.getByText(/Failed to load Artifact detail for ID art-500: HTTP 500/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Artifact Not Found")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
});
