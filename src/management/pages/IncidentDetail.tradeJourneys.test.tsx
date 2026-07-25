import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { IncidentDetail } from "./IncidentDetail";

function Location() { return <output data-testid="location">{useLocation().pathname}{useLocation().search}</output>; }

describe("IncidentDetail Trade Journeys cross-link", () => {
  it("navigates to the affected strategy's Trade Journeys list with a return_to back to this incident", async () => {
    render(
      <MemoryRouter initialEntries={["/management/incidents/in_021"]}>
        <Routes>
          <Route path="/management/incidents/:id" element={<IncidentDetail/>} />
          <Route path="/management/trade-journeys" element={<Location/>} />
        </Routes>
      </MemoryRouter>,
    );
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
});
