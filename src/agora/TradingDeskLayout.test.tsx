import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TradingDeskLayout } from "./TradingDeskLayout";
import { getWorkshop } from "@/lib/bff-v1/agora/workshops";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/types";

vi.mock("@/lib/bff-v1/agora/workshops", () => ({
  getWorkshop: vi.fn(),
}));

const DESKTOP_WIDTH = 1280;
const MOBILE_WIDTH = 375;

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

afterEach(() => {
  cleanup();
  setViewportWidth(DESKTOP_WIDTH);
  vi.restoreAllMocks();
});

function renderTradingDesk(initialPath = "/agora/trading-room", workshopId?: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/agora" element={<TradingDeskLayout workshopId={workshopId} />}>
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

  it("designates the main content region as the only page-level scroll owner", () => {
    renderTradingDesk();
    const shell = screen.getByTestId("trading-desk-shell");
    const main = screen.getByTestId("trading-desk-main");

    expect(shell.className).toContain("overflow-hidden");
    expect(main.className).toContain("overflow-y-auto");
    expect(main.className).toContain("overflow-x-hidden");
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

  it("marks the shell as desktop viewport by default", () => {
    setViewportWidth(DESKTOP_WIDTH);
    renderTradingDesk();
    expect(screen.getByTestId("trading-desk-shell").dataset.viewport).toBe("desktop");
  });

  it("marks the shell as mobile viewport below the breakpoint", () => {
    setViewportWidth(MOBILE_WIDTH);
    renderTradingDesk();
    expect(screen.getByTestId("trading-desk-shell").dataset.viewport).toBe("mobile");
  });

  it("renders the servant drawer as a fixed full-width overlay on mobile", () => {
    setViewportWidth(MOBILE_WIDTH);
    renderTradingDesk();
    fireEvent.click(screen.getByRole("button", { name: /servant/i }));
    const drawer = screen.getByTestId("trading-desk-servant-drawer");
    expect(drawer.className).toContain("fixed");
    expect(drawer.className).toContain("w-full");
  });

  it("renders the servant drawer as a fixed-width side column on desktop", () => {
    setViewportWidth(DESKTOP_WIDTH);
    renderTradingDesk();
    fireEvent.click(screen.getByRole("button", { name: /servant/i }));
    const drawer = screen.getByTestId("trading-desk-servant-drawer");
    expect(drawer.className).not.toContain("fixed");
    expect(drawer.className).toContain("w-80");
  });

  it("keeps the tab bar horizontally scrollable so tabs never clip on narrow viewports", () => {
    renderTradingDesk();
    expect(screen.getByTestId("trading-desk-tab-bar").className).toContain("overflow-x-auto");
  });

  it("shows a neutral placeholder in the servant drawer without a workshop id", () => {
    renderTradingDesk("/agora/strategy-workshop");
    fireEvent.click(screen.getByRole("button", { name: /servant/i }));
    expect(screen.getByTestId("servant-drawer-context").textContent).toContain(
      "open a strategy workshop session",
    );
  });

  it("loads and renders real workshop context in the servant drawer", async () => {
    const workshop: StrategyWorkshop = {
      spec_version: "1.0",
      workshop_id: "ws-1",
      operator_id: "operator-1",
      status: "open",
      subject: { kind: "free_form", ref: "strategy-draft-1", title: "Momentum draft" },
      message_count: 4,
      created_at: "2026-06-01T00:00:00Z",
    };
    vi.mocked(getWorkshop).mockResolvedValue(workshop);

    renderTradingDesk("/agora/strategy-workshop", "ws-1");
    fireEvent.click(screen.getByRole("button", { name: /servant/i }));

    await waitFor(() => {
      expect(screen.getByTestId("servant-drawer-context").textContent).toContain("Momentum draft");
    });
    expect(screen.getByTestId("servant-drawer-context").textContent).toContain("Status: open");
    expect(screen.getByTestId("servant-drawer-context").textContent).toContain("Messages: 4");
    expect(getWorkshop).toHaveBeenCalledWith("ws-1");
  });

  it("shows a degraded state instead of a placeholder when workshop context fails to load", async () => {
    vi.mocked(getWorkshop).mockRejectedValue(new Error("boom"));

    renderTradingDesk("/agora/strategy-workshop", "ws-2");
    fireEvent.click(screen.getByRole("button", { name: /servant/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Workshop context unavailable");
    });
  });

  it("only propagates the servant workshop id while on the strategy-workshop tab", async () => {
    renderTradingDesk("/agora/trading-room", "ws-1");
    fireEvent.click(screen.getByRole("button", { name: /servant/i }));
    expect(getWorkshop).not.toHaveBeenCalled();
    expect(screen.getByTestId("servant-drawer-context").textContent).toContain(
      "open a strategy workshop session",
    );
  });
});
