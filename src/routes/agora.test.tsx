import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AgoraLayoutRoute, AgoraStrategyWorkshopRoute } from "./agora";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { getWorkshop } from "@/lib/bff-v1/agora/workshops";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/types";

const routeMocks = vi.hoisted(() => ({
  strategyWorkshopPage: vi.fn(),
}));

vi.mock("@/lib/bff-v1/agora/workshops", () => ({
  getWorkshop: vi.fn(),
}));

vi.mock("@/agora/pages/strategy-workshop/StrategyWorkshopPage", () => ({
  StrategyWorkshopPage: (props: { onAddToTradingRoom?: () => void; workshopId?: string }) => {
    routeMocks.strategyWorkshopPage(props);
    return (
      <button
        data-testid="mock-add-to-trading-room"
        onClick={props.onAddToTradingRoom}
        type="button"
      >
        Add to Trading Room
      </button>
    );
  },
}));

function stubLiveEnv() {
  vi.stubEnv("MODE", "development");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", "strict");
  liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  liveStatus._reset();
  routeMocks.strategyWorkshopPage.mockClear();
  vi.restoreAllMocks();
});

function renderAgoraShell(initialPath = "/agora/trading-room") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/agora" element={<AgoraLayoutRoute />}>
          <Route path="trading-room" element={<div data-testid="trading-room-content">Trading Room content</div>} />
          <Route
            path="strategy-workshop/:workshopId"
            element={<div data-testid="strategy-workshop-content">Strategy Workshop content</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AgoraLayoutRoute", () => {
  it("renders a standalone Agora shell, not nested inside Management PlatformShell chrome", () => {
    stubLiveEnv();
    renderAgoraShell();
    expect(screen.getByTestId("agora-standalone-shell")).toBeDefined();
    // Exactly one top chrome header: Agora's own CommandBar. A second
    // <header> would mean the Management PlatformShell TopBar leaked in.
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getByTestId("trading-desk-command-bar")).toBeDefined();
    // Management-only overlay chrome (notification center, job/handoff drawers) must not leak in.
    expect(screen.queryByLabelText(/notification/i)).toBeNull();
  });

  it("preserves live-status visibility for Agora the same way PlatformShell does for Management", () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "auto");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "https://bff.example.test" });
    liveStatus.reportFallback("ECONNREFUSED");
    renderAgoraShell();
    expect(screen.getByRole("status").textContent).toContain("資料來源：seed");
  });

  it("renders the matched Agora route content inside the standalone shell", () => {
    stubLiveEnv();
    renderAgoraShell("/agora/trading-room");
    expect(screen.getByTestId("trading-room-content")).toBeDefined();
  });

  it("propagates the :workshopId route param from the leaf route into the servant drawer context", async () => {
    stubLiveEnv();
    const workshop: StrategyWorkshop = {
      spec_version: "1.0",
      workshop_id: "ws-9",
      operator_id: "operator-1",
      status: "open",
      subject: { kind: "free_form", ref: "strategy-draft-9", title: "Breakout draft" },
      created_at: "2026-06-01T00:00:00Z",
    };
    vi.mocked(getWorkshop).mockResolvedValue(workshop);

    renderAgoraShell("/agora/strategy-workshop/ws-9");
    fireEvent.click(screen.getByRole("button", { name: /servant/i }));

    await waitFor(() => {
      expect(getWorkshop).toHaveBeenCalledWith("ws-9");
    });
  });
});

describe("AgoraStrategyWorkshopRoute", () => {
  it("passes workshopId and routes Add to Trading Room into the dynamic default entry", () => {
    render(
      <MemoryRouter initialEntries={["/agora/strategy-workshop/ws-9"]}>
        <Routes>
          <Route path="/agora/strategy-workshop/:workshopId" element={<AgoraStrategyWorkshopRoute />} />
          <Route path="/agora/trading-room" element={<div data-testid="trading-room-content">Trading Room</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(routeMocks.strategyWorkshopPage).toHaveBeenCalledWith(
      expect.objectContaining({
        onAddToTradingRoom: expect.any(Function),
        workshopId: "ws-9",
      }),
    );

    fireEvent.click(screen.getByTestId("mock-add-to-trading-room"));
    expect(screen.getByTestId("trading-room-content")).toBeDefined();
  });
});
