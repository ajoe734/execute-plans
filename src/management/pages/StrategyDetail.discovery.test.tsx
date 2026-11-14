import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StrategyDetail } from "./StrategyDetail";
import { bffV1, type Strategy } from "@/lib/bff-v1";

function strategy(extra: Record<string, unknown> = {}): Strategy {
  return {
    id: "strat-1", name: "S1", alpha: "a", state: "draft", risk: "medium", owner: "op",
    capitalPoolId: "pool-1", personaIds: [], personaStates: [], operationalStatus: "running",
    symbols: [], pnl30d: 0, sharpe: 0, drawdown: 0, updatedAt: "2026-11-04T00:00:00Z", ...extra,
  } as Strategy;
}

function mockRest() {
  vi.spyOn(bffV1.jobs, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.audit, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.approvals, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.alerts, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.incidents, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.research, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.evolution, "list").mockResolvedValue([]);
  vi.spyOn(bffV1.watchers, "forSubject").mockResolvedValue([]);
  vi.spyOn(bffV1.decisionJournal, "forSubject").mockResolvedValue([]);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/management/strategies/strat-1"]}>
      <Routes>
        <Route path="/management/strategies/:id" element={<StrategyDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StrategyDetail discovery block (FE-DISCOVERY-VIEWS-20261110)", () => {
  beforeEach(mockRest);
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the BFF discovery block", async () => {
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue(
      strategy({
        discovery: {
          hypothesis_card: { claim: "Claim X", cited_spans: [] },
          metrics: { in_sample: { sharpe_ratio: 2 }, out_of_sample: { sharpe_ratio: 1 } },
          lineage: { evidence_bundle_id: "b-1", source_records: [] },
          attribution: { provider: "data.gov.tw", text: "gov attribution" },
        },
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId("strategy-discovery")).toBeInTheDocument());
    expect(screen.getByTestId("strategy-discovery-hypothesis-claim")).toHaveTextContent("Claim X");
    expect(screen.getByTestId("strategy-discovery-metrics-out-sharpe_ratio")).toHaveTextContent("1.00");
    expect(screen.getByTestId("strategy-discovery-lineage-evidence-bundle")).toHaveTextContent("b-1");
    expect(screen.getByTestId("strategy-discovery-attribution")).toHaveTextContent("gov attribution");
  });

  it("renders dashes when the discovery block is absent", async () => {
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue(strategy());
    renderPage();
    await waitFor(() => expect(screen.getByTestId("strategy-discovery")).toBeInTheDocument());
    expect(screen.getByTestId("strategy-discovery-hypothesis-claim")).toHaveTextContent(/^—$/);
    expect(screen.getByTestId("strategy-discovery-metrics-in-sharpe_ratio")).toHaveTextContent(/^—$/);
  });
});
