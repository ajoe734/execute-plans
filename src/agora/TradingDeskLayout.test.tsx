import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TradingDeskLayout } from "./TradingDeskLayout";

afterEach(cleanup);

function renderTradingDesk(initialPath = "/agora/trading-room") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/agora" element={<TradingDeskLayout />}>
          <Route path="trading-room" element={<div data-testid="trading-room-content">Trading Room content</div>} />
          <Route path="strategy-workshop" element={<div data-testid="strategy-workshop-content">Strategy Workshop content</div>} />
          <Route path="strategy-performance" element={<div data-testid="strategy-performance-content">Performance content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("TradingDeskLayout", () => {
  it("renders the command bar and tab bar", () => {
    renderTradingDesk();
    expect(screen.getByTestId("trading-desk-command-bar")).toBeDefined();
    expect(screen.getByTestId("trading-desk-tab-bar")).toBeDefined();
  });

  it("renders exactly three tab buttons", () => {
    renderTradingDesk();
    const tabBar = screen.getByTestId("trading-desk-tab-bar");
    const buttons = tabBar.querySelectorAll("button");
    expect(buttons.length).toBe(3);
  });

  it("navigates to strategy-workshop when that tab is clicked", () => {
    renderTradingDesk();
    const tabBar = screen.getByTestId("trading-desk-tab-bar");
    const tabs = Array.from(tabBar.querySelectorAll("button"));
    const workshopTab = tabs.find((t) => t.textContent?.includes("Strategy Workshop"));
    if (!workshopTab) throw new Error("Strategy Workshop tab not found");
    fireEvent.click(workshopTab);
    expect(screen.getByTestId("strategy-workshop-content")).toBeDefined();
  });

  it("navigates to strategy-performance when that tab is clicked", () => {
    renderTradingDesk();
    const tabBar = screen.getByTestId("trading-desk-tab-bar");
    const tabs = Array.from(tabBar.querySelectorAll("button"));
    const perfTab = tabs.find((t) => t.textContent?.includes("Performance"));
    if (!perfTab) throw new Error("Performance tab not found");
    fireEvent.click(perfTab);
    expect(screen.getByTestId("strategy-performance-content")).toBeDefined();
  });

  it("renders the matched route in the main content area", () => {
    renderTradingDesk();
    expect(screen.getByTestId("trading-room-content")).toBeDefined();
    expect(screen.getByTestId("trading-desk-main")).toBeDefined();
  });

  it("toggles the servant drawer open and closed", () => {
    renderTradingDesk();
    expect(screen.queryByTestId("trading-desk-servant-drawer")).toBeNull();
    const toggleBtn = screen.getByRole("button", { name: /servant/i });
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId("trading-desk-servant-drawer")).toBeDefined();
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId("trading-desk-servant-drawer")).toBeNull();
  });

  it("renders the bottom strip with Jobs, Shadow, Journal sections", () => {
    renderTradingDesk();
    const strip = screen.getByTestId("trading-desk-bottom-strip");
    expect(strip.textContent).toContain("Jobs");
    expect(strip.textContent).toContain("Shadow");
    expect(strip.textContent).toContain("Journal");
  });

  it("marks active tab with aria-current=page (strategy-workshop)", () => {
    renderTradingDesk("/agora/strategy-workshop");
    const tabBar = screen.getByTestId("trading-desk-tab-bar");
    const activeEl = tabBar.querySelector('[aria-current="page"]');
    expect(activeEl).not.toBeNull();
    expect(activeEl?.textContent).toContain("Strategy Workshop");
  });

  it("marks active tab with aria-current=page (trading-room)", () => {
    renderTradingDesk();
    const tabBar = screen.getByTestId("trading-desk-tab-bar");
    const activeEl = tabBar.querySelector('[aria-current="page"]');
    expect(activeEl).not.toBeNull();
    expect(activeEl?.textContent).toContain("Trading Room");
  });

  it("renders the full shell container", () => {
    renderTradingDesk();
    expect(screen.getByTestId("trading-desk-shell")).toBeDefined();
  });
});
