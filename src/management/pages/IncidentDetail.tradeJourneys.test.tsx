import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bffV1 } from "@/lib/bff-v1";
import { IncidentDetail } from "./IncidentDetail";
import { RebalanceDetail } from "./RebalanceDetail";

afterEach(() => {
  vi.restoreAllMocks();
});

function Location() { return <output data-testid="location">{useLocation().pathname}{useLocation().search}</output>; }

describe("IncidentDetail Trade Journeys cross-link", () => {
  it("navigates to the affected strategy's Trade Journeys list with a return_to back to this incident and resolves strategies via listNonDraft", async () => {
    const listNonDraftSpy = vi.spyOn(bffV1.strategies, "listNonDraft");
    render(
      <MemoryRouter initialEntries={["/management/incidents/in_021"]}>
        <Routes>
          <Route path="/management/incidents/:id" element={<IncidentDetail/>} />
          <Route path="/management/trade-journeys" element={<Location/>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(listNonDraftSpy).toHaveBeenCalledTimes(1);
    });
    const affectedTab = await screen.findByRole("tab", { name: "影響範圍" });
    fireEvent.pointerDown(affectedTab);
    fireEvent.mouseDown(affectedTab);
    fireEvent.pointerUp(affectedTab);
    fireEvent.mouseUp(affectedTab);
    fireEvent.click(affectedTab);
    const button = await screen.findByRole("button", { name: "stg_001 trade journeys" });
    fireEvent.click(button);
    const location = await screen.findByTestId("location");
    const params = new URLSearchParams(location.textContent?.split("?")[1] ?? "");
    expect(params.get("strategy_id")).toBe("stg_001");
    expect(params.get("return_to")).toBe("/management/incidents/in_021");
  });

  it("RebalanceDetail resolves strategies from bffV1.strategies.listNonDraft", async () => {
    const listNonDraftSpy = vi.spyOn(bffV1.strategies, "listNonDraft");
    render(
      <MemoryRouter initialEntries={["/management/rebalance/rb_01"]}>
        <Routes>
          <Route path="/management/rebalance/:id" element={<RebalanceDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(listNonDraftSpy).toHaveBeenCalledTimes(1);
    });
  });
});
