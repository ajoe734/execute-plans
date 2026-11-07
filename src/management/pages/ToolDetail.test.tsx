import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { bffV1, type Tool } from "@/lib/bff-v1";
import { ToolDetail } from "./ToolDetail";

describe("ToolDetail", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fabricate consumer strategies from the strategies list and renders No data when no real relation exists", async () => {
    const tool: Tool = {
      id: "tl_market_feed",
      name: "Market Feed Connector",
      owner: "platform",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: "approved",
      risk: "low",
      category: "data",
      version: "1.0.0",
      inputs: 3,
      description: "Live market quote feed connector",
      usedBy: 0,
    };

    vi.spyOn(bffV1.tools, "get").mockResolvedValue(tool);
    vi.spyOn(bffV1.audit, "list").mockResolvedValue([]);
    const listNonDraftSpy = vi.spyOn(bffV1.strategies, "listNonDraft");
    const listForPersonaSpy = vi.spyOn(bffV1.strategies, "listForPersona");

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/tools/tl_market_feed"]}>
          <Routes>
            <Route path="/management/tools/:id" element={<ToolDetail />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Market Feed Connector")).toBeInTheDocument();
    });

    expect(listNonDraftSpy).not.toHaveBeenCalled();
    expect(listForPersonaSpy).not.toHaveBeenCalled();

    const consumersTab = await screen.findByRole("tab", { name: /Strategies|策略/i });
    fireEvent.pointerDown(consumersTab);
    fireEvent.mouseDown(consumersTab);
    fireEvent.pointerUp(consumersTab);
    fireEvent.mouseUp(consumersTab);
    fireEvent.click(consumersTab);

    expect(await screen.findByTestId("tool-consumers-tab")).toHaveTextContent("No data");
  });
});
