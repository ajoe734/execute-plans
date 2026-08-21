import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StrategyPaperLiveTab } from "../StrategyPaperLiveTab";
import { PostmortemLibraryPage } from "@/management/pages/phase2/PostmortemLibrary";
import { mgmt } from "@/lib/bff-v1/management";
import { bff } from "@/lib/bff-v1";

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

  it("PostmortemLibraryPage renders typed incident postmortem records from bff.incidents.list()", async () => {
    vi.spyOn(bff.incidents, "list").mockResolvedValue([
      {
        id: "inc_99",
        severity: "critical",
        title: "Database Lockup",
        status: "resolved",
        openedAt: "2026-08-21T10:00:00Z",
        timeline: [{ ts: "2026-08-21T10:05:00Z", actor: "alice", note: "[postmortem] Connection pool exhausted." }],
      } as any,
    ]);

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
});
