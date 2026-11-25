import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18n from "@/i18n";
import { lineageNodeTypeLabel } from "@/lib/enumLabels";
import { LineageExplorerPage } from "./LineageExplorer";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { managementConsoleReads } from "@/lib/bff-v1/managementConsoleReads";
import { __resetV5LiveCacheForTests } from "@/management/pages/v5/useV5Live";

const FD = "fd1281847a3b1c6a9735";
const LIVE_TOKEN = "a81b4fd15944698341aa";
const LIVE_PERSONA_ID = "persona-ee7112a829d38b9135ac";
const LIVE_STRATEGY_ID = `strategy-persona-${LIVE_TOKEN}`;
const LIVE_ARTIFACT_ID = `artifact-persona-pool-${LIVE_TOKEN}-v2`;
const LIVE_POOL_ID = `pool-persona-paper-${LIVE_TOKEN}`;
const LIVE_STRATEGY_TITLE = "衡岳｜0050 台股 Paper 學習 R2";

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
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/bff/lineage")) {
        return new Response(JSON.stringify(buildRealBffLineageEnvelope()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: [], items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLineageExplorer(`/management/lineage?root=strategy-persona-${FD}`);

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
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/bff/lineage")) {
        return new Response(JSON.stringify(buildRealBffLineageEnvelope()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: [], items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLineageExplorer(`/management/lineage?root=strategy-persona-${FD}`);

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

      const toggleBtn = screen.getByRole("button", { name: lineageNodeTypeLabel(c.type, i18n.t) });
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
      fireEvent.click(screen.getByRole("button", { name: lineageNodeTypeLabel(c.type, i18n.t) }));
    }

    const unknownNode = screen.getByTestId("lineage-node-feature-05246");
    expect(unknownNode).toBeInTheDocument();
    expect(unknownNode).toHaveAttribute("data-node-type", "feature_set");
    expect(unknownNode).toHaveTextContent(/(特徵集|Feature Set) · (草稿|Draft)/i);
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

    const { unmount } = renderLineageExplorer(`/management/lineage?root=artifact-persona-paper-${FD}`);

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

    const { unmount: unmountEmpty } = renderLineageExplorer(`/management/lineage?root=artifact-persona-paper-${FD}`);
    expect(await screen.findByTestId("lineage-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("lineage-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lineage-has-more")).not.toBeInTheDocument();
    unmountEmpty();

    // 3. Capped graph with has_more=true, then submitting a new root_id reloads that root
    __resetV5LiveCacheForTests();
    let lineageCallCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/bff/lineage")) {
        lineageCallCount += 1;
        if (lineageCallCount === 1) {
          return new Response(JSON.stringify(buildRealBffLineageEnvelope({ hasMore: true })), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
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
        );
      }
      return new Response(JSON.stringify({ data: [], items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    lineageSpy.mockRestore();
    vi.stubGlobal("fetch", fetchMock);

    renderLineageExplorer(`/management/lineage?root=artifact-persona-paper-${FD}`);

    const hasMoreBanner = await screen.findByTestId("lineage-has-more");
    expect(hasMoreBanner).toBeInTheDocument();
    expect(hasMoreBanner).toHaveTextContent(/has_more/i);
    expect(fetchMock).toHaveBeenCalledWith(
      `/bff/lineage?root_id=artifact-persona-paper-${FD}`,
      expect.any(Object),
    );

    const rootInput = screen.getByTestId("lineage-root-input");
    fireEvent.change(rootInput, { target: { value: `strategy-persona-${FD}` } });
    fireEvent.keyDown(rootInput, { key: "Enter", code: "Enter" });

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

  it("sends no graph request on unrooted /management/lineage, offers current strategies and personas by name, filters by Chinese name without firing lineage requests while typing, and fetches only on selection or Enter", async () => {
    const lineageRequests: string[] = [];
    const liveNodes = [
      {
        id: `reg-strategy-spec-persona-baseline-${LIVE_TOKEN}`,
        label: `reg-strategy-spec-persona-baseline-${LIVE_TOKEN}`,
        type: "Strategy",
        state: "draft",
        strategy_id: LIVE_STRATEGY_ID,
        version: "1.0.0",
        display_name: LIVE_STRATEGY_TITLE,
        name_missing: false,
      },
      {
        id: `reg-strategy-spec-persona-${LIVE_TOKEN}`,
        label: `reg-strategy-spec-persona-${LIVE_TOKEN}`,
        type: "Strategy",
        state: "approved",
        strategy_id: LIVE_STRATEGY_ID,
        version: "1.0.1",
        display_name: LIVE_STRATEGY_TITLE,
        name_missing: false,
      },
      {
        id: LIVE_ARTIFACT_ID,
        label: LIVE_ARTIFACT_ID,
        type: "Artifact",
        state: "approved",
        strategy_id: LIVE_STRATEGY_ID,
        version: "1.2.0",
        display_name: LIVE_STRATEGY_TITLE,
        name_missing: false,
      },
      {
        id: LIVE_PERSONA_ID,
        label: LIVE_PERSONA_ID,
        type: "Persona",
        display_name: "衡岳",
        name_missing: false,
      },
      {
        id: LIVE_POOL_ID,
        label: LIVE_POOL_ID,
        type: "CapitalPool",
        display_name: null,
        name_missing: true,
      },
    ];
    const liveEdges = [
      { from: `reg-strategy-spec-persona-baseline-${LIVE_TOKEN}`, to: `reg-strategy-spec-persona-${LIVE_TOKEN}`, label: "parent" },
      { from: `reg-strategy-spec-persona-${LIVE_TOKEN}`, to: LIVE_ARTIFACT_ID, label: "source_strategy_spec" },
      { from: LIVE_ARTIFACT_ID, to: LIVE_PERSONA_ID, label: "persona" },
      { from: LIVE_ARTIFACT_ID, to: LIVE_POOL_ID, label: "capital_pool" },
    ].map((e) => ({
      id: `${e.from}|${e.label}|${e.to}`,
      from: e.from,
      to: e.to,
      label: e.label,
      edge_type: e.label,
      from_artifact_id: e.from,
      to_artifact_id: e.to,
    }));

    const strategyRequests: string[] = [];
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/bff/strategies")) {
        strategyRequests.push(url);
        return new Response(
          JSON.stringify({
            data: [
              {
                id: LIVE_STRATEGY_ID,
                strategy_id: LIVE_STRATEGY_ID,
                name: LIVE_STRATEGY_TITLE,
                title: LIVE_STRATEGY_TITLE,
                state: "approved",
                operationalStatus: "running",
                personaIds: [LIVE_PERSONA_ID],
                persona_display_names: { [LIVE_PERSONA_ID]: "衡岳" },
              },
              {
                id: `strategy-persona-${FD}`,
                strategy_id: `strategy-persona-${FD}`,
                name: "Baseline Persona Strategy",
                title: "Baseline Persona Strategy",
                state: "approved",
                operationalStatus: "running",
              },
              {
                id: "strategy-retired-001",
                strategy_id: "strategy-retired-001",
                name: "退役策略 A",
                title: "退役策略 A",
                state: "retired",
                operationalStatus: "retired",
              },
              {
                id: "strategy-retired-persona-002",
                strategy_id: "strategy-retired-persona-002",
                name: "退役 Persona 策略 B",
                title: "退役 Persona 策略 B",
                state: "approved",
                operationalStatus: "retired",
                persona_display_names: { "persona-retired-scope": "退役舊角" },
              },
            ],
            page_info: { next_page_token: null, total: 4, page_size: 4 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/bff/personas")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: LIVE_PERSONA_ID,
                persona_id: LIVE_PERSONA_ID,
                name: "衡岳",
                display_name: "衡岳",
                state: "paper_running",
                listScope: "current",
              },
              {
                id: "persona-6507750312870d03a241",
                persona_id: "persona-6507750312870d03a241",
                name: "湛盧",
                display_name: "湛盧",
                state: "paper_running",
              },
              {
                id: "persona-retired-scope",
                persona_id: "persona-retired-scope",
                name: "退役舊角",
                display_name: "退役舊角",
                state: "retired",
                listScope: "retired",
              },
              {
                id: "persona-test-probe",
                persona_id: "persona-test-probe",
                name: "測試探針",
                display_name: "測試探針",
                state: "paper_running",
                listScope: "test",
              },
              {
                id: "persona-retired-legacy",
                persona_id: "persona-retired-legacy",
                name: "舊版退役角",
                display_name: "舊版退役角",
                state: "retired",
              },
            ],
            page_info: { next_page_token: null, total: 5, page_size: 5 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/bff/lineage")) {
        lineageRequests.push(url);
        return new Response(
          JSON.stringify({
            data: {
              id: "lineage",
              nodes: liveNodes,
              edges: liveEdges,
              status: "ok",
              source: "service_client",
            },
            items: liveEdges,
            page_info: { next_page_token: null, total: liveEdges.length, page_size: liveEdges.length, has_more: false },
            meta: {
              snapshot_at: "2026-11-25T06:35:00Z",
              status: "ok",
              source: "service_client",
              surfaces: { lineage: { status: "ok", source: "service_client" } },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: [], items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLineageExplorer("/management/lineage");

    // 1. Opening /management/lineage sends no graph request and shows the lookup prompt
    expect(screen.getByTestId("lineage-lookup-prompt")).toBeInTheDocument();
    expect(lineageRequests).toEqual([]);

    // 2. Current strategies and personas are offered by name; retired/test strategies and personas are excluded
    expect(await screen.findByTestId(`lineage-lookup-option-${LIVE_STRATEGY_ID}`)).toHaveTextContent(LIVE_STRATEGY_TITLE);
    expect(strategyRequests[0]).toContain("exclude_state=draft");
    expect(strategyRequests[0]).toContain("hide_retired_personas=true");
    expect(screen.getByTestId(`lineage-lookup-option-${LIVE_PERSONA_ID}`)).toHaveTextContent("衡岳");
    expect(screen.getByTestId("lineage-lookup-option-persona-6507750312870d03a241")).toHaveTextContent("湛盧");
    expect(screen.queryByTestId("lineage-lookup-option-strategy-retired-001")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lineage-lookup-option-strategy-retired-persona-002")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lineage-lookup-option-persona-retired-scope")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lineage-lookup-option-persona-test-probe")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lineage-lookup-option-persona-retired-legacy")).not.toBeInTheDocument();
    expect(lineageRequests).toEqual([]);

    // 3. Typing persona-ee71 character-by-character sends zero lineage requests
    const rootInput = screen.getByTestId("lineage-root-input");
    for (let i = 1; i <= "persona-ee71".length; i++) {
      fireEvent.change(rootInput, { target: { value: "persona-ee71".slice(0, i) } });
    }
    expect(lineageRequests).toEqual([]);

    // 4. Typing a Chinese name ("衡岳") filters the options without sending a graph request
    fireEvent.change(rootInput, { target: { value: "衡岳" } });
    expect(lineageRequests).toEqual([]);
    expect(screen.getByTestId(`lineage-lookup-option-${LIVE_PERSONA_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId(`lineage-lookup-option-${LIVE_STRATEGY_ID}`)).toBeInTheDocument();
    expect(screen.queryByTestId("lineage-lookup-option-persona-6507750312870d03a241")).not.toBeInTheDocument();
    expect(screen.queryByTestId(`lineage-lookup-option-strategy-persona-${FD}`)).not.toBeInTheDocument();

    // 5. Clicking the persona option sends one request for persona-ee7112a829d38b9135ac and collapses the candidate listbox
    fireEvent.click(screen.getByTestId(`lineage-lookup-option-${LIVE_PERSONA_ID}`));
    await waitFor(() => {
      expect(lineageRequests).toEqual([`/bff/lineage?root_id=${LIVE_PERSONA_ID}`]);
    });
    expect(screen.queryByTestId("lineage-lookup-options")).not.toBeInTheDocument();
    expect(screen.getByTestId("lineage-lookup-selected")).toBeInTheDocument();
    expect(screen.getByTestId("lineage-selected-name")).toHaveTextContent("衡岳");
    expect(screen.getByTestId("lineage-selected-id")).toHaveTextContent(LIVE_PERSONA_ID);

    // Clicking the change button re-opens the candidate listbox
    fireEvent.click(screen.getByTestId("lineage-lookup-change"));
    expect(screen.getByTestId("lineage-lookup-options")).toBeInTheDocument();
    expect(screen.getByTestId(`lineage-lookup-option-${LIVE_STRATEGY_ID}`)).toBeInTheDocument();

    const personaNode = await screen.findByTestId(`lineage-node-${LIVE_PERSONA_ID}`);
    expect(personaNode).toHaveAttribute("data-node-highlight", "true");
    expect(personaNode.querySelector("[data-node-label]")?.textContent).toBe("衡岳");
    expect(personaNode.querySelector("[data-node-secondary-id]")?.getAttribute("data-full-id")).toBe(LIVE_PERSONA_ID);

    // Fallback when name_missing=true: plain kind + short id
    const poolNode = screen.getByTestId(`lineage-node-${LIVE_POOL_ID}`);
    expect(poolNode.querySelector("[data-node-label]")?.textContent).toMatch(/^(資金池|Capital Pool) a81b4fd1$/);

    // 6. Pressing Enter after typing a Chinese name ("衡岳｜0050 台股 Paper 學習 R2") resolves to strategy ID and sends one request
    fireEvent.change(rootInput, { target: { value: LIVE_STRATEGY_TITLE } });
    expect(lineageRequests).toHaveLength(1);
    fireEvent.keyDown(rootInput, { key: "Enter", code: "Enter" });
    await waitFor(() => {
      expect(lineageRequests).toEqual([
        `/bff/lineage?root_id=${LIVE_PERSONA_ID}`,
        `/bff/lineage?root_id=${LIVE_STRATEGY_ID}`,
      ]);
    });
    const specNode = await screen.findByTestId(`lineage-node-reg-strategy-spec-persona-${LIVE_TOKEN}`);
    expect(specNode).toHaveAttribute("data-node-highlight", "true");
  });

  it("resolves Chinese name input and plain id input on submit via the Unicode ASCII property check", async () => {
    const lineageRequests: string[] = [];
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/bff/strategies")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: LIVE_STRATEGY_ID,
                strategy_id: LIVE_STRATEGY_ID,
                name: LIVE_STRATEGY_TITLE,
                title: LIVE_STRATEGY_TITLE,
                state: "approved",
                operationalStatus: "running",
                personaIds: [LIVE_PERSONA_ID],
                persona_display_names: { [LIVE_PERSONA_ID]: "衡岳" },
              },
              {
                id: `strategy-persona-${FD}`,
                strategy_id: `strategy-persona-${FD}`,
                name: "Baseline Persona Strategy",
                title: "Baseline Persona Strategy",
                state: "approved",
                operationalStatus: "running",
              },
            ],
            page_info: { next_page_token: null, total: 2, page_size: 2 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/bff/personas")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: LIVE_PERSONA_ID,
                persona_id: LIVE_PERSONA_ID,
                name: "衡岳",
                display_name: "衡岳",
                state: "paper_running",
                listScope: "current",
              },
            ],
            page_info: { next_page_token: null, total: 1, page_size: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/bff/lineage")) {
        lineageRequests.push(url);
        return new Response(JSON.stringify(buildRealBffLineageEnvelope()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: [], items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLineageExplorer("/management/lineage");
    expect(await screen.findByTestId(`lineage-lookup-option-${LIVE_STRATEGY_ID}`)).toHaveTextContent(LIVE_STRATEGY_TITLE);

    const rootInput = screen.getByTestId("lineage-root-input");

    // Non-ASCII Chinese name query ("衡岳" and partial Chinese name "0050 台股") resolves to the matching candidate id
    fireEvent.change(rootInput, { target: { value: "衡岳" } });
    fireEvent.keyDown(rootInput, { key: "Enter", code: "Enter" });
    await waitFor(() => {
      expect(lineageRequests).toEqual([`/bff/lineage?root_id=${LIVE_PERSONA_ID}`]);
    });

    fireEvent.change(rootInput, { target: { value: "0050 台股" } });
    fireEvent.keyDown(rootInput, { key: "Enter", code: "Enter" });
    await waitFor(() => {
      expect(lineageRequests).toEqual([
        `/bff/lineage?root_id=${LIVE_PERSONA_ID}`,
        `/bff/lineage?root_id=${LIVE_STRATEGY_ID}`,
      ]);
    });

    // Plain ASCII id queries (candidate id and direct artifact id) resolve to the exact plain ids
    fireEvent.change(rootInput, { target: { value: `strategy-persona-${FD}` } });
    fireEvent.keyDown(rootInput, { key: "Enter", code: "Enter" });
    await waitFor(() => {
      expect(lineageRequests).toEqual([
        `/bff/lineage?root_id=${LIVE_PERSONA_ID}`,
        `/bff/lineage?root_id=${LIVE_STRATEGY_ID}`,
        `/bff/lineage?root_id=strategy-persona-${FD}`,
      ]);
    });

    fireEvent.change(rootInput, { target: { value: LIVE_ARTIFACT_ID } });
    fireEvent.keyDown(rootInput, { key: "Enter", code: "Enter" });
    await waitFor(() => {
      expect(lineageRequests).toEqual([
        `/bff/lineage?root_id=${LIVE_PERSONA_ID}`,
        `/bff/lineage?root_id=${LIVE_STRATEGY_ID}`,
        `/bff/lineage?root_id=strategy-persona-${FD}`,
        `/bff/lineage?root_id=${LIVE_ARTIFACT_ID}`,
      ]);
    });
  });
});
