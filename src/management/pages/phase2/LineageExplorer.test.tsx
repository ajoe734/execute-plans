import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LineageExplorerPage } from "./LineageExplorer";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { managementConsoleReads } from "@/lib/bff-v1/managementConsoleReads";
import { __resetV5LiveCacheForTests } from "@/management/pages/v5/useV5Live";

const FD = "fd1281847a3b1c6a9735";

/**
 * Real BFF /bff/lineage envelope produced from the hosted registry shapes
 * defined in REGISTRY-LINEAGE-OWNER-READ-20261104 (persona family fd1281847a3b1c6a9735
 * + source_dataset_refs + the feature_set entry from the 5251-row corpus).
 */
function buildRealBffLineageEnvelope(opts?: { hasMore?: boolean; rootId?: string }) {
  const baseSpec = `reg-strategy-spec-persona-baseline-${FD}`;
  const spec = `reg-strategy-spec-persona-${FD}`;
  const baseArt = `artifact-persona-paper-baseline-${FD}`;
  const art = `artifact-persona-paper-${FD}`;
  const persona = `persona-${FD}`;
  const pool = `pool-${FD}`;
  const runSpec = `persona-provisioning-forward-${FD}`;
  const runArt = `persona-provisioning-forward-artifact-${FD}`;
  const dataset = `src-dev-product-00001`;
  const featureSet = `feature-05246`;

  const nodes = [
    { id: baseSpec, label: baseSpec, type: "Strategy", state: "draft", artifact_id: baseSpec, artifact_type: "Strategy" },
    { id: spec, label: spec, type: "Strategy", state: "draft", artifact_id: spec, artifact_type: "Strategy" },
    { id: baseArt, label: baseArt, type: "Artifact", state: "draft", artifact_id: baseArt, artifact_type: "Artifact" },
    { id: art, label: art, type: "Artifact", state: "approved", artifact_id: art, artifact_type: "Artifact" },
    { id: persona, label: persona, type: "Persona", artifact_id: persona, artifact_type: "Persona" },
    { id: pool, label: pool, type: "CapitalPool", artifact_id: pool, artifact_type: "CapitalPool" },
    { id: runSpec, label: runSpec, type: "Experiment", artifact_id: runSpec, artifact_type: "Experiment" },
    { id: runArt, label: runArt, type: "Experiment", artifact_id: runArt, artifact_type: "Experiment" },
    { id: dataset, label: dataset, type: "Dataset", artifact_id: dataset, artifact_type: "Dataset" },
    { id: featureSet, label: featureSet, type: "feature_set", state: "draft", artifact_id: featureSet, artifact_type: "feature_set" },
  ];

  const rawEdges = [
    { from: baseSpec, to: spec, label: "parent" },
    { from: baseSpec, to: baseArt, label: "source_strategy_spec" },
    { from: spec, to: art, label: "source_strategy_spec" },
    { from: baseArt, to: art, label: "parent" },
    { from: art, to: persona, label: "persona" },
    { from: art, to: pool, label: "capital_pool" },
    { from: runSpec, to: spec, label: "source_run" },
    { from: runArt, to: art, label: "source_run" },
    { from: dataset, to: spec, label: "source_dataset" },
    { from: runSpec, to: featureSet, label: "source_run" },
  ].map((e) => ({
    id: `${e.from}|${e.label}|${e.to}`,
    from: e.from,
    to: e.to,
    label: e.label,
    edge_type: e.label,
    from_artifact_id: e.from,
    to_artifact_id: e.to,
  }));

  const hasMore = Boolean(opts?.hasMore);

  return {
    data: {
      id: "lineage",
      nodes,
      edges: rawEdges,
      status: "ok",
      source: "service_client",
    },
    items: rawEdges,
    page_info: {
      next_page_token: null,
      total: rawEdges.length,
      page_size: rawEdges.length,
      returned: rawEdges.length,
      has_more: hasMore,
    },
    meta: {
      snapshot_at: "2026-11-04T00:00:00Z",
      status: "ok",
      source: "service_client",
      surfaces: {
        lineage: {
          status: "ok",
          source: "service_client",
        },
      },
    },
  };
}

function renderLineageExplorer(initialEntry = "/management/lineage") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/management/lineage" element={<LineageExplorerPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LineageExplorerPage — registry lineage graph (FE-LINEAGE-REGISTRY-GRAPH-20261104)", () => {
  beforeEach(() => {
    __resetV5LiveCacheForTests();
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    __resetV5LiveCacheForTests();
    liveStatus._reset();
  });

  it("renders nodes and from/to edges from the real BFF registry lineage payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(buildRealBffLineageEnvelope()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderLineageExplorer();

    expect(await screen.findByTestId(`lineage-node-artifact-persona-paper-${FD}`)).toBeInTheDocument();
    expect(screen.getByTestId(`lineage-node-reg-strategy-spec-persona-baseline-${FD}`)).toBeInTheDocument();
    expect(screen.getByTestId(`lineage-node-reg-strategy-spec-persona-${FD}`)).toBeInTheDocument();
    expect(screen.getByTestId(`lineage-node-persona-${FD}`)).toBeInTheDocument();
    expect(screen.getByTestId(`lineage-node-pool-${FD}`)).toBeInTheDocument();
    expect(screen.getByTestId(`lineage-node-persona-provisioning-forward-${FD}`)).toBeInTheDocument();
    expect(screen.getByTestId("lineage-node-src-dev-product-00001")).toBeInTheDocument();
    expect(screen.getByTestId("lineage-node-feature-05246")).toBeInTheDocument();

    expect(
      screen.getByTestId(`lineage-edge-reg-strategy-spec-persona-${FD}-artifact-persona-paper-${FD}`),
    ).toHaveAttribute("data-edge-label", "source_strategy_spec");
    expect(
      screen.getByTestId(`lineage-edge-artifact-persona-paper-${FD}-persona-${FD}`),
    ).toHaveAttribute("data-edge-label", "persona");
    expect(
      screen.getByTestId(`lineage-edge-artifact-persona-paper-${FD}-pool-${FD}`),
    ).toHaveAttribute("data-edge-label", "capital_pool");
    expect(
      screen.getByTestId(`lineage-edge-src-dev-product-00001-reg-strategy-spec-persona-${FD}`),
    ).toHaveAttribute("data-edge-label", "source_dataset");
  });

  it("filters Strategy, Persona, Artifact, CapitalPool, Experiment, and Dataset nodes and removes incident edges while keeping unknown types visible and labelled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(buildRealBffLineageEnvelope()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderLineageExplorer();

    await screen.findByTestId(`lineage-node-artifact-persona-paper-${FD}`);

    const cases: Array<{
      type: "Strategy" | "Persona" | "Artifact" | "CapitalPool" | "Experiment" | "Dataset";
      nodeId: string;
      edgeTestId: string;
    }> = [
      {
        type: "Strategy",
        nodeId: `reg-strategy-spec-persona-${FD}`,
        edgeTestId: `lineage-edge-reg-strategy-spec-persona-${FD}-artifact-persona-paper-${FD}`,
      },
      {
        type: "Persona",
        nodeId: `persona-${FD}`,
        edgeTestId: `lineage-edge-artifact-persona-paper-${FD}-persona-${FD}`,
      },
      {
        type: "Artifact",
        nodeId: `artifact-persona-paper-${FD}`,
        edgeTestId: `lineage-edge-artifact-persona-paper-${FD}-pool-${FD}`,
      },
      {
        type: "CapitalPool",
        nodeId: `pool-${FD}`,
        edgeTestId: `lineage-edge-artifact-persona-paper-${FD}-pool-${FD}`,
      },
      {
        type: "Experiment",
        nodeId: `persona-provisioning-forward-${FD}`,
        edgeTestId: `lineage-edge-persona-provisioning-forward-${FD}-reg-strategy-spec-persona-${FD}`,
      },
      {
        type: "Dataset",
        nodeId: "src-dev-product-00001",
        edgeTestId: `lineage-edge-src-dev-product-00001-reg-strategy-spec-persona-${FD}`,
      },
    ];

    for (const c of cases) {
      expect(screen.getByTestId(`lineage-node-${c.nodeId}`)).toBeInTheDocument();
      expect(screen.getByTestId(c.edgeTestId)).toBeInTheDocument();

      const toggleBtn = screen.getByRole("button", { name: c.type });
      fireEvent.click(toggleBtn);

      expect(screen.queryByTestId(`lineage-node-${c.nodeId}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(c.edgeTestId)).not.toBeInTheDocument();

      // Re-enable before testing the next type
      fireEvent.click(toggleBtn);
      expect(screen.getByTestId(`lineage-node-${c.nodeId}`)).toBeInTheDocument();
      expect(screen.getByTestId(c.edgeTestId)).toBeInTheDocument();
    }

    // Turn off all 6 known types — unknown type node (feature_set) remains visible and labelled
    for (const c of cases) {
      fireEvent.click(screen.getByRole("button", { name: c.type }));
    }

    const unknownNode = screen.getByTestId("lineage-node-feature-05246");
    expect(unknownNode).toBeInTheDocument();
    expect(unknownNode).toHaveAttribute("data-node-type", "feature_set");
    expect(unknownNode).toHaveTextContent("feature_set · draft");
    expect(unknownNode).toHaveTextContent("feature-05246");
  });

  it("separates an unavailable surface from a real empty graph, shows has_more when capped, and reloads when entering a root id", async () => {
    const lineageSpy = vi.spyOn(managementConsoleReads, "lineage");

    // 1. Unavailable surface
    lineageSpy.mockResolvedValueOnce({
      nodes: [],
      edges: [],
      meta: {
        status: "unavailable",
        source: "unavailable",
        surfaces: { lineage: { status: "unavailable", source: "unavailable" } },
      },
      page_info: { total: 0, page_size: 0, has_more: false },
      has_more: false,
    });

    const { unmount } = renderLineageExplorer();

    expect(await screen.findByTestId("lineage-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("lineage-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lineage-has-more")).not.toBeInTheDocument();
    unmount();

    // 2. Real empty graph (status ok, 0 nodes)
    __resetV5LiveCacheForTests();
    lineageSpy.mockResolvedValueOnce({
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

    const { unmount: unmountEmpty } = renderLineageExplorer();
    expect(await screen.findByTestId("lineage-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("lineage-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lineage-has-more")).not.toBeInTheDocument();
    unmountEmpty();

    // 3. Default graph capped with has_more=true, then entering root_id reloads that root
    __resetV5LiveCacheForTests();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(buildRealBffLineageEnvelope({ hasMore: true })), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            buildRealBffLineageEnvelope({
              hasMore: false,
              rootId: `strategy-persona-${FD}`,
            }),
          ),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    lineageSpy.mockRestore();
    vi.stubGlobal("fetch", fetchMock);

    renderLineageExplorer();

    const hasMoreBanner = await screen.findByTestId("lineage-has-more");
    expect(hasMoreBanner).toBeInTheDocument();
    expect(hasMoreBanner).toHaveTextContent(/has_more/i);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/bff/lineage", expect.any(Object));

    const rootInput = screen.getByPlaceholderText(/Root entity|根節點/i);
    fireEvent.change(rootInput, { target: { value: `strategy-persona-${FD}` } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/bff/lineage?root_id=strategy-persona-${FD}`,
        expect.any(Object),
      );
    });
    await waitFor(() => {
      expect(screen.queryByTestId("lineage-has-more")).not.toBeInTheDocument();
    });
  });
});
