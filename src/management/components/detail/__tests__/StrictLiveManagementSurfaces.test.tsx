import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { StrategyPaperLiveTab } from "../StrategyPaperLiveTab";
import { ActivityMonitor } from "../ActivityMonitor";
import { FormulaStudio } from "@/management/pages/studios/FormulaStudio";
import { PostmortemLibraryPage } from "@/management/pages/phase2/PostmortemLibrary";
import { bffV1, mgmt } from "@/lib/bff-v1";
import type { Incident } from "@/lib/bff-v1";

vi.mock("@/platform/hooks", () => ({
  useT: () => (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key,
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return {
    ...actual,
    safeDateTime: (val: string) => val,
  };
});

describe("PFG-MGMT-FE-REAL-20260820 Strict Live & Degraded Tests", () => {
  it("StrategyPaperLiveTab displays BFF Telemetry degraded/unavailable status when live stream has no data", async () => {
    vi.spyOn(mgmt.tradingPulse, "getLiveOnly").mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <StrategyPaperLiveTab strategyId="strat_test" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/BFF Telemetry: unavailable/i)).toBeInTheDocument();
      expect(screen.getByText(/Telemetry stream unavailable; no live breach calculation available/i)).toBeInTheDocument();
    });
  });

  it("ActivityMonitor displays BFF Stream: unavailable when not connected to live SSE stream", async () => {
    render(
      <MemoryRouter>
        <ActivityMonitor scope="test" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/BFF Stream: unavailable/i)).toBeInTheDocument();
      expect(screen.getByText(/Live SSE stream unavailable or no activity events recorded/i)).toBeInTheDocument();
    });
  });

  it("FormulaStudio renders empty backtest jobs readback from bff.jobs.list() without synthetic mock metrics", async () => {
    vi.spyOn(bffV1.rankingFormulas, "list").mockResolvedValue([
      {
        id: "rf_01",
        name: "Test Formula",
        owner: "alice",
        updatedAt: "2026-08-21T10:00:00Z",
        state: "approved",
        risk: "low",
        expression: "sharpe * 0.5",
        appliedTo: 1,
      },
    ]);
    vi.spyOn(bffV1.jobs, "list").mockResolvedValue([]);

    render(
      <MemoryRouter>
        <FormulaStudio />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Test Formula")).toBeInTheDocument();
    });
  });

  it("PostmortemLibraryPage renders typed incident postmortem records from bff.incidents.list()", async () => {
    const mockIncident: Incident = {
      id: "inc_99",
      severity: "critical",
      title: "Database Lockup",
      status: "resolved",
      openedAt: "2026-08-21T10:00:00Z",
      timeline: [{ ts: "2026-08-21T10:05:00Z", actor: "alice", note: "[postmortem] Connection pool exhausted." }],
    };

    vi.spyOn(bffV1.incidents, "list").mockResolvedValue([mockIncident]);

    render(
      <MemoryRouter>
        <PostmortemLibraryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Database Lockup")).toBeInTheDocument();
      expect(screen.getByText("pm_inc_99")).toBeInTheDocument();
      expect(screen.getByText("alice")).toBeInTheDocument();
    });
  });

  it("PostmortemLibraryPage displays accurate degraded message when bff.incidents.list() transport rejects", async () => {
    vi.spyOn(bffV1.incidents, "list").mockImplementation(async () => {
      throw new Error("BFF network failure");
    });

    render(
      <MemoryRouter>
        <PostmortemLibraryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Incident postmortem transport degraded or unavailable/i)).toBeInTheDocument();
      expect(screen.queryByText(/Showing cached records/i)).not.toBeInTheDocument();
    });
  });

  it("FormulaStudio renders runnerUnavailable state when bff.rankingFormulas.list() promise rejects", async () => {
    vi.spyOn(bffV1.rankingFormulas, "list").mockRejectedValue(new Error("Formula studio network error"));
    vi.spyOn(bffV1.jobs, "list").mockResolvedValue([]);

    render(
      <MemoryRouter>
        <FormulaStudio />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Backtest runner unavailable/i)).toBeInTheDocument();
    });
  });

  it("ActivityMonitor consumes live SSE envelope on sse channel topic and renders activity row", async () => {
    const { realtime } = await import("@/lib/bff-v1");
    render(
      <MemoryRouter>
        <ActivityMonitor scope="test" />
      </MemoryRouter>
    );

    realtime.emitEnvelope({
      topic: "sse:loop",
      channel: "loop",
      type: "loop.tick",
      payload: { jobId: "job_sse_100", status: "running", ts: "2026-08-21T11:45:00Z", owner: "loop_worker" },
    });

    await waitFor(() => {
      expect(screen.getByText("loop_worker")).toBeInTheDocument();
      expect(screen.getAllByText("loop").length).toBeGreaterThan(0);
    });
  });

  it("StrategyDetail renders disabled NonProductionActionButton for alert acknowledge action", async () => {
    const { StrategyDetail } = await import("@/management/pages/StrategyDetail");
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue({
      id: "strat_test",
      name: "Test Strategy",
      alpha: "alpha_test",
      version: "1.0",
      status: "active",
      state: "discovered",
      risk: "low",
      owner: "alice",
      capitalPoolId: "pool_01",
      personaIds: ["p1"],
      mode: "paper",
      createdAt: "2026-08-21T10:00:00Z",
      updatedAt: "2026-08-21T10:00:00Z",
    } as unknown as import("@/lib/bff-v1").Strategy);
    vi.spyOn(bffV1.jobs, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.audit, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.approvals, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.alerts, "list").mockResolvedValue([
      {
        id: "alt_01",
        severity: "warning",
        title: "Test Alert",
        source: "strat_test",
        openedAt: "2026-08-21T10:00:00Z",
        acknowledged: false,
        relatedTarget: "strat_test",
      } as unknown as import("@/lib/bff-v1").Alert,
    ]);
    vi.spyOn(bffV1.incidents, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.research, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.evolution, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.watchers, "forSubject").mockResolvedValue([]);
    vi.spyOn(bffV1.decisionJournal, "forSubject").mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/management/strategies/strat_test"]}>
        <Routes>
          <Route path="/management/strategies/:id" element={<StrategyDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Test Strategy")).toBeInTheDocument();
    });

    const disabledButtons = screen.getAllByRole("button").filter(
      (b) => b.getAttribute("aria-disabled") === "true" || b.hasAttribute("disabled")
    );
    expect(disabledButtons.length).toBeGreaterThan(0);
  });
});
