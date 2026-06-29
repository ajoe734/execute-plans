import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TradingDeskLayout } from "./TradingDeskLayout";

afterEach(cleanup);

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-probe">{location.pathname}</span>;
}

function renderLayout({
  initialPath = "/agora/trading-room",
  child = <div data-testid="route-child">Route content</div>,
  workshopId,
}: {
  initialPath?: string;
  child?: React.ReactNode;
  workshopId?: string;
} = {}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationProbe />
      <Routes>
        <Route path="/agora" element={<TradingDeskLayout workshopId={workshopId} />}>
          <Route path="trading-room" element={child} />
          <Route path="strategy-workshop" element={child} />
          <Route path="strategy-performance" element={child} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("TradingDeskLayout", () => {
  it("renders the command bar and tab bar", () => {
    renderLayout();
    expect(screen.getByTestId("trading-desk-command-bar")).toBeDefined();
    expect(screen.getByTestId("trading-desk-tab-bar")).toBeDefined();
  });

  it("renders exactly three tab buttons", () => {
    renderLayout();
    const tabBar = screen.getByTestId("trading-desk-tab-bar");
    const buttons = tabBar.querySelectorAll("button");
    expect(buttons.length).toBe(3);
  });

  it("navigates to strategy-workshop when that tab is clicked", () => {
    renderLayout();
    const workshopTab = screen.getByRole("button", { name: /Strategy Workshop/ });
    fireEvent.click(workshopTab);
    expect(screen.getByTestId("location-probe").textContent).toBe("/agora/strategy-workshop");
  });

  it("navigates to strategy-performance when that tab is clicked", () => {
    renderLayout();
    const perfTab = screen.getByRole("button", { name: /Performance/ });
    fireEvent.click(perfTab);
    expect(screen.getByTestId("location-probe").textContent).toBe("/agora/strategy-performance");
  });

  it("renders children in the main content area", () => {
    renderLayout({ child: <div data-testid="test-child">Test content</div> });
    expect(screen.getByTestId("test-child")).toBeDefined();
    expect(screen.getByTestId("trading-desk-main")).toBeDefined();
  });

  it("toggles the servant drawer open and closed", () => {
    renderLayout();
    expect(screen.queryByTestId("trading-desk-servant-drawer")).toBeNull();
    const toggleBtn = screen.getByRole("button", { name: /servant/i });
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId("trading-desk-servant-drawer")).toBeDefined();
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId("trading-desk-servant-drawer")).toBeNull();
  });

  it("renders the bottom strip with Jobs, Shadow, Journal sections", () => {
    renderLayout();
    const strip = screen.getByTestId("trading-desk-bottom-strip");
    expect(strip.textContent).toContain("Jobs");
    expect(strip.textContent).toContain("Shadow");
    expect(strip.textContent).toContain("Journal");
  });

  it("marks active tab with aria-current=page (strategy-workshop)", () => {
    renderLayout({ initialPath: "/agora/strategy-workshop" });
    const tabBar = screen.getByTestId("trading-desk-tab-bar");
    const activeEl = tabBar.querySelector('[aria-current="page"]');
    expect(activeEl).not.toBeNull();
    expect(activeEl?.textContent).toContain("Strategy Workshop");
  });

  it("marks active tab with aria-current=page (trading-room)", () => {
    renderLayout();
    const tabBar = screen.getByTestId("trading-desk-tab-bar");
    const activeEl = tabBar.querySelector('[aria-current="page"]');
    expect(activeEl).not.toBeNull();
    expect(activeEl?.textContent).toContain("Trading Room");
  });

  it("renders the full shell container", () => {
    renderLayout();
    expect(screen.getByTestId("trading-desk-shell")).toBeDefined();
  });
});
