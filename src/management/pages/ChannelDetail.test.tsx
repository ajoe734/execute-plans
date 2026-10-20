import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { ChannelDetail } from "./ChannelDetail";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ChannelDetail load states", () => {
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

  it("renders Channel Not Found on 404 instead of staying on loading", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/channels/")) {
        return jsonResponse({ detail: "Channel not found" }, 404);
      }
      return jsonResponse({ data: [], items: [] }, 200);
    });

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/channels/ch-missing"]}>
          <Routes>
            <Route path="/management/channels/:id" element={<ChannelDetail />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Channel Not Found")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("renders Could Not Load Channel on 500", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/channels/")) {
        return jsonResponse({ detail: "Channel service error" }, 500);
      }
      return jsonResponse({ data: [], items: [] }, 200);
    });

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/channels/ch-500"]}>
          <Routes>
            <Route path="/management/channels/:id" element={<ChannelDetail />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Could Not Load Channel")).toBeInTheDocument();
    expect(screen.getByText(/Failed to load Channel detail for ID ch-500: HTTP 500/)).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
});
