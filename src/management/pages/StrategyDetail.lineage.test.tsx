import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StrategyDetail } from "./StrategyDetail";
import { bffV1, managementConsoleReads, type Strategy } from "@/lib/bff-v1";

const FD = "fd1281847a3b1c6a9735";
const STRATEGY_ID = `strategy-persona-${FD}`;

function openLineageTab(tab: HTMLElement) {
  fireEvent.pointerDown(tab);
  fireEvent.mouseDown(tab);
  fireEvent.pointerUp(tab);
  fireEvent.mouseUp(tab);
  fireEvent.click(tab);
}

describe("StrategyDetail Lineage tab — registry truth (FE-LINEAGE-REGISTRY-GRAPH-20261104)", () => {
  beforeEach(() => {
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue({
      id: STRATEGY_ID,
      name: `Paper Persona Strategy ${FD}`,
      alpha: `alpha-persona-${FD}`,
      state: "draft",
      risk: "medium",
      owner: "operator",
      capitalPoolId: `pool-${FD}`,
      personaIds: [`persona-${FD}`],
      personaStates: [{ personaId: `persona-${FD}`, state: "paper_running" }],
      operationalStatus: "running",
      symbols: ["2330.TW"],
      pnl30d: 0,
      sharpe: 0,
      drawdown: 0,
      updatedAt: "2026-11-04T00:00:00Z",
    } as Strategy);
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
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("reads managementConsoleReads.lineage with the strategy id as root and does not fabricate deployed/low/live nodes", async () => {
    const baseSpec = `reg-strategy-spec-persona-baseline-${FD}`;
    const spec = `reg-strategy-spec-persona-${FD}`;
    const baseArt = `artifact-persona-paper-baseline-${FD}`;
    const art = `artifact-persona-paper-${FD}`;
    const persona = `persona-${FD}`;
    const pool = `pool-${FD}`;

    const lineageSpy = vi.spyOn(managementConsoleReads, "lineage").mockResolvedValue({
      nodes: [
        { id: baseSpec, label: baseSpec, type: "Strategy", state: "draft" },
        { id: spec, label: spec, type: "Strategy", state: "draft" },
        { id: baseArt, label: baseArt, type: "Artifact", state: "draft" },
        { id: art, label: art, type: "Artifact", state: "approved" },
        { id: persona, label: persona, type: "Persona" },
        { id: pool, label: pool, type: "CapitalPool" },
      ],
      edges: [
        { from: baseSpec, to: spec, label: "parent" },
        { from: baseSpec, to: baseArt, label: "source_strategy_spec" },
        { from: spec, to: art, label: "source_strategy_spec" },
        { from: baseArt, to: art, label: "parent" },
        { from: art, to: persona, label: "persona" },
        { from: art, to: pool, label: "capital_pool" },
      ],
      meta: {
        status: "ok",
        source: "service_client",
        surfaces: { lineage: { status: "ok", source: "service_client" } },
      },
      page_info: { total: 6, page_size: 6, has_more: false },
      has_more: false,
    });

    render(
      <MemoryRouter initialEntries={[`/management/strategies/${STRATEGY_ID}`]}>
        <Routes>
          <Route path="/management/strategies/:id" element={<StrategyDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const lineageTab = await screen.findByRole("tab", { name: /^(Lineage|血緣)$/i });
    openLineageTab(lineageTab);

    expect(lineageSpy).toHaveBeenCalledWith(STRATEGY_ID);

    // Real registry lineage nodes are rendered with their true states and no invented risk/deployed state
    const specNode = await screen.findByTestId(`lineage-node-${spec}`);
    expect(specNode).toHaveAttribute("data-node-state", "draft");
    expect(specNode).toHaveAttribute("data-node-risk", "");

    const artNode = screen.getByTestId(`lineage-node-${art}`);
    expect(artNode).toHaveAttribute("data-node-state", "approved");
    expect(artNode).toHaveAttribute("data-node-risk", "");

    const personaNode = screen.getByTestId(`lineage-node-${persona}`);
    expect(personaNode).toHaveAttribute("data-node-state", "");
    expect(personaNode).toHaveAttribute("data-node-risk", "");

    const poolNode = screen.getByTestId(`lineage-node-${pool}`);
    expect(poolNode).toHaveAttribute("data-node-state", "");
    expect(poolNode).toHaveAttribute("data-node-risk", "");

    // Fabricated nodes (alpha_src, dp_<id>, "<id> → live") are not present
    expect(screen.queryByTestId("lineage-node-alpha_src")).not.toBeInTheDocument();
    expect(screen.queryByTestId(`lineage-node-dp_${STRATEGY_ID}`)).not.toBeInTheDocument();
    expect(screen.queryByText(`${STRATEGY_ID} → live`)).not.toBeInTheDocument();
  });

  it("shows the empty lineage state when a strategy has no lineage", async () => {
    const lineageSpy = vi.spyOn(managementConsoleReads, "lineage").mockResolvedValue({
      nodes: [],
      edges: [],
      meta: {
        status: "ok",
        source: "service_client",
        surfaces: { lineage: { status: "ok", source: "service_client" } },
      },
      page_info: { total: 0, page_size: 0, has_more: false },
      has_more: false,
    });

    render(
      <MemoryRouter initialEntries={[`/management/strategies/${STRATEGY_ID}`]}>
        <Routes>
          <Route path="/management/strategies/:id" element={<StrategyDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const lineageTab = await screen.findByRole("tab", { name: /^(Lineage|血緣)$/i });
    openLineageTab(lineageTab);

    expect(lineageSpy).toHaveBeenCalledWith(STRATEGY_ID);
    expect(await screen.findByTestId("lineage-empty")).toHaveTextContent("No lineage available.");
    expect(screen.queryByTestId("lineage-node-alpha_src")).not.toBeInTheDocument();
    expect(screen.queryByTestId(`lineage-node-dp_${STRATEGY_ID}`)).not.toBeInTheDocument();
  });
});
