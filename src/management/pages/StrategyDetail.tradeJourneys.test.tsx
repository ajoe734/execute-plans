import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { StrategyDetail } from "./StrategyDetail";

describe("StrategyDetail Trade Journeys cross-link", () => {
  it("scopes the link by strategy_id and carries a return_to back to this strategy", async () => {
    render(
      <MemoryRouter initialEntries={["/management/strategies/stg_001?tenant_id=tenant-a"]}>
        <Routes><Route path="/management/strategies/:id" element={<StrategyDetail/>} /></Routes>
      </MemoryRouter>,
    );
    const link = await screen.findByRole("link", { name: "stg_001 trade journeys" });
    expect(link).toHaveAttribute("href", expect.stringContaining("/management/trade-journeys?"));
    const href = link.getAttribute("href") ?? "";
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("strategy_id")).toBe("stg_001");
    expect(params.get("tenant_id")).toBe("tenant-a");
    expect(params.get("return_to")).toBe("/management/strategies/stg_001?tenant_id=tenant-a");
  });
});
