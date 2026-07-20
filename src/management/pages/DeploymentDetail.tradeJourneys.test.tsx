import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DeploymentDetail } from "./DeploymentDetail";

function Location() { return <output data-testid="location">{useLocation().pathname}{useLocation().search}</output>; }

describe("DeploymentDetail Trade Journeys cross-link", () => {
  it("navigates to the strategy-scoped Trade Journeys list with a return_to back to this deployment", async () => {
    render(
      <MemoryRouter initialEntries={["/management/deployments/dp_001"]}>
        <Routes>
          <Route path="/management/deployments/:id" element={<DeploymentDetail/>} />
          <Route path="/management/trade-journeys" element={<Location/>} />
        </Routes>
      </MemoryRouter>,
    );
    const button = await screen.findByRole("button", { name: "dp_001 trade journeys" });
    fireEvent.click(button);
    const location = await screen.findByTestId("location");
    const params = new URLSearchParams(location.textContent?.split("?")[1] ?? "");
    expect(params.get("strategy_id")).toBe("stg_001");
    expect(params.get("return_to")).toBe("/management/deployments/dp_001");
  });
});
