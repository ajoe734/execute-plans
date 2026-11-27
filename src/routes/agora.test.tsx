import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
  AgoraAskLegacyRoute,
  AgoraDailyLegacyRoute,
  AgoraJournalLegacyRoute,
  AgoraLayoutRoute,
  AgoraNotebookLegacyRoute,
  AgoraSignalsLegacyRoute,
  AgoraStrategyPerformanceRoute,
  AgoraStrategyWorkshopRoute,
  AgoraTrainerLegacyRoute,
  AgoraWatchlistLegacyRoute,
  safeWorkshopReturnPath,
} from "./agora";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { getWorkshop } from "@/lib/bff-v1/agora/workshops";
import type { StrategyWorkshop } from "@/lib/bff-v1/agora/types";

const routeMocks = vi.hoisted(() => ({
  strategyPerformancePage: vi.fn(),
  strategyWorkshopPage: vi.fn(),
}));

vi.mock("@/lib/bff-v1/agora/workshops", () => ({
  getWorkshop: vi.fn(),
}));

vi.mock("@/agora/pages/strategy-performance/StrategyPerformancePage", () => ({
  StrategyPerformancePage: () => {
    routeMocks.strategyPerformancePage();
    return <div data-testid="mock-strategy-performance-page">Strategy Performance Page</div>;
  },
}));

vi.mock("@/agora/pages/strategy-workshop/StrategyWorkshopPage", () => ({
  StrategyWorkshopPage: (props: {
    governedProposalId?: string;
    onAddToTradingRoom?: (handoff: {
      assessedAt?: string;
      readinessAssessmentId: string;
      readinessGate: "trading_room";
      strategyId: string;
      strategyVersion: string;
      workshopId: string;
      workshopVersionId?: string;
    }) => void;
    entry?: Record<string, unknown>;
    workshopId?: string;
  }) => {
    routeMocks.strategyWorkshopPage(props);
    return (
      <button
        data-testid="mock-add-to-trading-room"
        onClick={() =>
          props.onAddToTradingRoom?.({
            assessedAt: "2026-07-05T00:00:00Z",
            readinessAssessmentId: "ready-001",
            readinessGate: "trading_room",
            strategyId: "strat-001",
            strategyVersion: "reg-001",
            workshopId: props.workshopId ?? "ws-9",
            workshopVersionId: "wsv-001",
          })
        }
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
  routeMocks.strategyPerformancePage.mockClear();
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

function LocationProbe(): JSX.Element {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  return (
    <div
      data-pathname={location.pathname}
      data-readiness-assessment-id={params.get("readinessAssessmentId") ?? ""}
      data-readiness-gate={params.get("readinessGate") ?? ""}
      data-strategy-version={params.get("strategyVersion") ?? ""}
      data-testid="trading-room-location"
    >
      Trading Room
    </div>
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
    const shell = screen.getByTestId("agora-standalone-shell");
    expect(shell.className).toContain("h-dvh");
    expect(shell.className).toContain("overflow-hidden");
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
    fireEvent.click(screen.getByRole("button", { name: /交易僕人抽屜/ }));

    await waitFor(() => {
      expect(getWorkshop).toHaveBeenCalledWith("ws-9");
    });
  });
});

describe("AgoraStrategyWorkshopRoute", () => {
  it("accepts only same-origin Management or Agora return paths", () => {
    expect(safeWorkshopReturnPath("/management/personas/persona-a?tab=tradeJournal")).toBe("/management/personas/persona-a?tab=tradeJournal");
    expect(safeWorkshopReturnPath("/agora/trading-room/strategy-a")).toBe("/agora/trading-room/strategy-a");
    expect(safeWorkshopReturnPath("//evil.example/path")).toBeUndefined();
    expect(safeWorkshopReturnPath("https://evil.example/path")).toBeUndefined();
    expect(safeWorkshopReturnPath("/management\\evil")).toBeUndefined();
    expect(safeWorkshopReturnPath("/settings")).toBeUndefined();
  });

  it("passes explicit workshop/proposal ids and routes Add to Trading Room into the explicit strategy entry", () => {
    render(
      <MemoryRouter initialEntries={["/agora/strategy-workshop/ws-9?governedProposalId=prop-9"]}>
        <Routes>
          <Route path="/agora/strategy-workshop/:workshopId" element={<AgoraStrategyWorkshopRoute />} />
          <Route path="/agora/trading-room/:strategyId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(routeMocks.strategyWorkshopPage).toHaveBeenCalledWith(
      expect.objectContaining({
        governedProposalId: "prop-9",
        onAddToTradingRoom: expect.any(Function),
        workshopId: "ws-9",
      }),
    );

    fireEvent.click(screen.getByTestId("mock-add-to-trading-room"));
    const location = screen.getByTestId("trading-room-location");
    expect(location.getAttribute("data-pathname")).toBe("/agora/trading-room/strat-001");
    expect(location.getAttribute("data-strategy-version")).toBe("reg-001");
    expect(location.getAttribute("data-readiness-gate")).toBe("trading_room");
    expect(location.getAttribute("data-readiness-assessment-id")).toBe("ready-001");
  });

  it("preserves canonical Persona interaction deep-link context", () => {
    render(
      <MemoryRouter initialEntries={["/agora/strategy-workshop/ws-9?mode=compare&participants=persona-a%2Cpersona-b&picker=recommended&return_to=%2Fmanagement%2Fpersonas%2Fpersona-a&return_label=Persona+A&source_kind=persona&source_id=persona-a&source_version=v4&target_strategy_id=strategy-a&target_strategy_version=spec-v3&advice_environment=research&evidence_cutoff=2026-07-17T00%3A00%3A00Z"]}>
        <Routes>
          <Route path="/agora/strategy-workshop/:workshopId" element={<AgoraStrategyWorkshopRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(routeMocks.strategyWorkshopPage).toHaveBeenCalledWith(expect.objectContaining({
      entry: {
        mode: "compare",
        participantIds: ["persona-a", "persona-b"],
        picker: "recommended",
        returnTo: "/management/personas/persona-a",
        returnLabel: "Persona A",
        source: { kind: "persona", id: "persona-a", version: "v4" },
        targetStrategy: { id: "strategy-a", version: "spec-v3" },
        environment: "research",
        evidenceCutoff: "2026-07-17T00:00:00Z",
      },
      workshopId: "ws-9",
    }));
  });
});

describe("AgoraStrategyPerformanceRoute", () => {
  it("renders the live StrategyPerformancePage instead of the old placeholder", () => {
    render(<AgoraStrategyPerformanceRoute />);

    expect(screen.getByTestId("mock-strategy-performance-page")).toBeDefined();
    expect(routeMocks.strategyPerformancePage).toHaveBeenCalledOnce();
  });
});

describe("Agora IA 05 legacy route redirects and workshop committee entry", () => {
  function LegacyRouteHarness({ initialPath }: { initialPath: string }) {
    return (
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/agora" element={<AgoraLayoutRoute />}>
            <Route path="trading-room" element={<LocationProbe />} />
            <Route path="strategy-workshop" element={<AgoraStrategyWorkshopRoute />} />
            <Route path="committee" element={<div data-testid="committee-page">Committee Page</div>} />
            <Route path="daily" element={<AgoraDailyLegacyRoute />} />
            <Route path="watchlist" element={<AgoraWatchlistLegacyRoute />} />
            <Route path="signals" element={<AgoraSignalsLegacyRoute />} />
            <Route path="notebook" element={<AgoraNotebookLegacyRoute />} />
            <Route path="ask" element={<AgoraAskLegacyRoute />} />
            <Route path="journal" element={<AgoraJournalLegacyRoute />} />
            <Route path="trainer" element={<AgoraTrainerLegacyRoute />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  }

  it("redirects /agora/daily to /agora/trading-room", () => {
    render(<LegacyRouteHarness initialPath="/agora/daily" />);
    expect(screen.getByTestId("trading-room-location").getAttribute("data-pathname")).toBe(
      "/agora/trading-room",
    );
  });

  it("redirects /agora/watchlist to /agora/trading-room?drawer=watchlist", () => {
    function SearchProbe() {
      const location = useLocation();
      return <div data-search={location.search} data-testid="search-probe">{location.pathname}</div>;
    }
    render(
      <MemoryRouter initialEntries={["/agora/watchlist"]}>
        <Routes>
          <Route path="/agora/watchlist" element={<AgoraWatchlistLegacyRoute />} />
          <Route path="/agora/trading-room" element={<SearchProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    const probe = screen.getByTestId("search-probe");
    expect(probe.textContent).toBe("/agora/trading-room");
    expect(probe.getAttribute("data-search")).toBe("?drawer=watchlist");
  });

  it("redirects /agora/signals to /agora/trading-room?view=decision-queue", () => {
    function SearchProbe() {
      const location = useLocation();
      return <div data-search={location.search} data-testid="search-probe">{location.pathname}</div>;
    }
    render(
      <MemoryRouter initialEntries={["/agora/signals"]}>
        <Routes>
          <Route path="/agora/signals" element={<AgoraSignalsLegacyRoute />} />
          <Route path="/agora/trading-room" element={<SearchProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    const probe = screen.getByTestId("search-probe");
    expect(probe.textContent).toBe("/agora/trading-room");
    expect(probe.getAttribute("data-search")).toBe("?view=decision-queue");
  });

  it("redirects /agora/notebook to /agora/strategy-workshop and reaches Committee from the workshop", () => {
    render(<LegacyRouteHarness initialPath="/agora/notebook" />);
    const committeeLink = screen.getByTestId("workshop-open-committee");
    expect(committeeLink).toBeDefined();
    fireEvent.click(committeeLink);
    expect(screen.getByTestId("committee-page")).toBeDefined();
  });

  it("redirects /agora/ask, /agora/journal, and /agora/trainer to the trading room (opening servant drawer for ask and trainer)", () => {
    const askView = render(<LegacyRouteHarness initialPath="/agora/ask" />);
    expect(screen.getByTestId("trading-room-location").getAttribute("data-pathname")).toBe(
      "/agora/trading-room",
    );
    expect(screen.getByTestId("trading-desk-servant-drawer")).toBeDefined();
    askView.unmount();

    const journalView = render(<LegacyRouteHarness initialPath="/agora/journal" />);
    expect(screen.getByTestId("trading-room-location").getAttribute("data-pathname")).toBe(
      "/agora/trading-room",
    );
    journalView.unmount();

    const trainerView = render(<LegacyRouteHarness initialPath="/agora/trainer" />);
    expect(screen.getByTestId("trading-room-location").getAttribute("data-pathname")).toBe(
      "/agora/trading-room",
    );
    expect(screen.getByTestId("trading-desk-servant-drawer")).toBeDefined();
    trainerView.unmount();
  });
});
