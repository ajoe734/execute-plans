import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { CommandPalette } from "./CommandPalette";
import searchFixture from "@/lib/bff-v1/__tests__/fixtures/hosted-20261020/search.json";

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

describe("CommandPalette BFF search contract & section matching", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    void i18n.changeLanguage("en-US");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    liveStatus._reset();
    void i18n.changeLanguage("en-US");
  });

  it("renders strategy, persona, and capital_pool results from captured GET /bff/search response and navigates to entity routes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse(searchFixture));

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/cockpit"]}>
          <CommandPalette open onOpenChange={vi.fn()} />
          <Routes>
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "38055178182" } });

    expect(await screen.findByText("strategy-persona-ed49ca07814374a816fb")).toBeInTheDocument();
    expect(screen.getByText("persona-02fc6ca929d84dc0e71a")).toBeInTheDocument();
    expect(screen.getByText("pool-persona-paper-ed49ca07814374a816fb")).toBeInTheDocument();
    expect(screen.getAllByText("Pantheon Dev Paper Release 38055178182 Attempt 1").length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByText("persona-02fc6ca929d84dc0e71a"));
    expect(screen.getByTestId("location")).toHaveTextContent("/management/personas/persona-02fc6ca929d84dc0e71a");
  });

  it("matches section entries by id and en-US label even when active locale is zh-TW", async () => {
    await i18n.changeLanguage("zh-TW");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({ data: [], items: [] }));

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/cockpit"]}>
          <CommandPalette open onOpenChange={vi.fn()} />
        </MemoryRouter>
      </I18nextProvider>,
    );

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "risk" } });

    expect(await screen.findByText("風險中心")).toBeInTheDocument();
  });
});
