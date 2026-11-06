import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adaptKnowledge,
  adaptLineageEdge,
  adaptLineageNode,
  managementConsoleReads,
  toKnowledgeKind,
  toKnowledgeRisk,
} from "../managementConsoleReads";
import { liveStatus } from "../liveStatus";

describe("managementConsoleReads — knowledge inbox truth (FE-EVIDENCE-KNOWLEDGE-TRUTH-20261104)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    liveStatus._reset();
  });

  it("maps kind from inboxType and source from sourceDataset without fabricating research_note, low, pantheon-bff, or timestamps", () => {
    const researchNote = adaptKnowledge({
      note_id: "note-1",
      id: "note-1",
      inboxType: "research_note",
      sourceDataset: "research_notes",
      title: "Funding basis note",
      summary: "Perp basis widened after the CPI print.",
      body: "Perp basis widened after the CPI print.",
      route_href: "/agora/notebook?note_id=note-1",
      routeHref: "/agora/notebook?note_id=note-1",
      updated_at: "2026-07-04T09:00:00Z",
      created_at: "2026-07-04T08:00:00Z",
    });
    expect(researchNote).toEqual({
      id: "note-1",
      title: "Funding basis note",
      kind: "research_note",
      source: "research_notes",
      risk: undefined,
      ts: "2026-07-04T09:00:00Z",
      body: "Perp basis widened after the CPI print.",
    });

    const insightCard = adaptKnowledge({
      insight_id: "ins-1",
      id: "ins-1",
      inboxType: "insight",
      sourceDataset: "insight_cards",
      title: "Liquidity regime shift",
      summary: "Orderbook depth thinned during Asia open.",
      route_href: "/agora/insights?insight_id=ins-1",
      routeHref: "/agora/insights?insight_id=ins-1",
      updated_at: "2026-07-04T10:00:00Z",
      created_at: "2026-07-04T10:00:00Z",
    });
    expect(insightCard).toEqual({
      id: "ins-1",
      title: "Liquidity regime shift",
      kind: "insight",
      source: "insight_cards",
      risk: undefined,
      ts: "2026-07-04T10:00:00Z",
      body: "Orderbook depth thinned during Asia open.",
    });

    const memoryEntry = adaptKnowledge({
      entry_id: "mem-1",
      id: "mem-1",
      inboxType: "memory_entry",
      sourceDataset: "institutional_memory_entries",
      knowledge_type: "failure_pattern",
      title: "Avoid thin-liquidity market orders",
      summary: "Use limit orders when spread exceeds 15 bps.",
      content: {
        headline: "Avoid thin-liquidity market orders",
        lesson: "Use limit orders when spread exceeds 15 bps.",
      },
      route_href: "/management/memory-governance?entry_id=mem-1",
      routeHref: "/management/memory-governance?entry_id=mem-1",
      updated_at: null,
      created_at: null,
    });
    expect(memoryEntry).toEqual({
      id: "mem-1",
      title: "Avoid thin-liquidity market orders",
      kind: "memory_entry",
      source: "institutional_memory_entries",
      risk: undefined,
      ts: "",
      body: "Use limit orders when spread exceeds 15 bps.",
    });
  });

  it("does not default missing kind to research_note, missing risk to low, or missing source to pantheon-bff", () => {
    expect(toKnowledgeKind(undefined)).toBe("");
    expect(toKnowledgeRisk(undefined)).toBeUndefined();

    const minimal = adaptKnowledge({
      id: "kn-minimal",
      title: "Minimal knowledge record",
      summary: "No kind, risk, source, or timestamp fields supplied.",
    });
    expect(minimal.kind).toBe("");
    expect(minimal.kind).not.toBe("research_note");
    expect(minimal.risk).toBeUndefined();
    expect(minimal.source).toBe("");
    expect(minimal.source).not.toBe("pantheon-bff");
    expect(minimal.ts).toBe("");
  });

  it("preserves BFF knowledge_inbox surface status for ok, empty, and unavailable envelopes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { items: [] },
            meta: {
              status: "ok",
              total: 0,
              limit: 100,
              source_counts: {
                research_notes: 0,
                insight_cards: 0,
                institutional_memory_entries: 0,
              },
              degraded_sources: [],
              surfaces: {
                knowledge_inbox: {
                  status: "ok",
                  source: "research.knowledge_composition",
                  degraded_sources: [],
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { items: [] },
            meta: {
              status: "unavailable",
              total: 0,
              limit: 100,
              source_counts: {},
              degraded_sources: [
                {
                  dataset: "research_notes",
                  inbox_type: "research_note",
                  status: "unavailable",
                  reason: "upstream_timeout",
                },
              ],
              surfaces: {
                knowledge_inbox: {
                  status: "unavailable",
                  source: "research.knowledge_composition",
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

    const emptyEnvelope = await managementConsoleReads.knowledgeInbox();
    expect(emptyEnvelope.items).toEqual([]);
    expect(emptyEnvelope.meta.status).toBe("ok");

    const unavailableEnvelope = await managementConsoleReads.knowledgeInbox();
    expect(unavailableEnvelope.items).toEqual([]);
    expect(unavailableEnvelope.meta.status).toBe("unavailable");
  });
});

describe("managementConsoleReads — registry lineage graph truth (FE-LINEAGE-REGISTRY-GRAPH-20261104)", () => {
  const FD = "fd1281847a3b1c6a9735";

  afterEach(() => {
    vi.restoreAllMocks();
    liveStatus._reset();
  });

  it("adapts registry lineage nodes and from/to edges without inventing risk, state, or Artifact fallback for unknown types", () => {
    const specNode = adaptLineageNode({
      id: `reg-strategy-spec-persona-${FD}`,
      label: `reg-strategy-spec-persona-${FD}`,
      type: "Strategy",
      state: "draft",
      artifact_id: `reg-strategy-spec-persona-${FD}`,
      artifact_type: "Strategy",
    });
    expect(specNode).toEqual({
      id: `reg-strategy-spec-persona-${FD}`,
      label: `reg-strategy-spec-persona-${FD}`,
      type: "Strategy",
      state: "draft",
      risk: undefined,
      highlight: false,
    });

    const fallbackArtifactTypeNode = adaptLineageNode({
      id: "feature-05246",
      label: "feature-05246",
      artifact_id: "feature-05246",
      artifact_type: "feature_set",
      state: "draft",
    });
    expect(fallbackArtifactTypeNode.type).toBe("feature_set");
    expect(fallbackArtifactTypeNode.risk).toBeUndefined();

    const typelessNode = adaptLineageNode({
      id: "orphan-parent-001",
      label: "orphan-parent-001",
      artifact_id: "orphan-parent-001",
      artifact_type: "",
    });
    expect(typelessNode.type).toBe("unknown");

    const edge = adaptLineageEdge({
      id: `reg-strategy-spec-persona-${FD}|source_strategy_spec|artifact-persona-paper-${FD}`,
      from: `reg-strategy-spec-persona-${FD}`,
      to: `artifact-persona-paper-${FD}`,
      label: "source_strategy_spec",
      edge_type: "source_strategy_spec",
      from_artifact_id: `reg-strategy-spec-persona-${FD}`,
      to_artifact_id: `artifact-persona-paper-${FD}`,
    });
    expect(edge).toEqual({
      from: `reg-strategy-spec-persona-${FD}`,
      to: `artifact-persona-paper-${FD}`,
      label: "source_strategy_spec",
    });
  });

  it("reads /bff/lineage with root_id, preserves has_more and separates ok empty from unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "lineage",
              nodes: [
                {
                  id: `reg-strategy-spec-persona-${FD}`,
                  label: `reg-strategy-spec-persona-${FD}`,
                  type: "Strategy",
                  state: "draft",
                  artifact_id: `reg-strategy-spec-persona-${FD}`,
                  artifact_type: "Strategy",
                },
                {
                  id: `artifact-persona-paper-${FD}`,
                  label: `artifact-persona-paper-${FD}`,
                  type: "Artifact",
                  state: "approved",
                  artifact_id: `artifact-persona-paper-${FD}`,
                  artifact_type: "Artifact",
                },
              ],
              edges: [
                {
                  id: `reg-strategy-spec-persona-${FD}|source_strategy_spec|artifact-persona-paper-${FD}`,
                  from: `reg-strategy-spec-persona-${FD}`,
                  to: `artifact-persona-paper-${FD}`,
                  label: "source_strategy_spec",
                  edge_type: "source_strategy_spec",
                  from_artifact_id: `reg-strategy-spec-persona-${FD}`,
                  to_artifact_id: `artifact-persona-paper-${FD}`,
                },
              ],
              status: "ok",
              source: "service_client",
            },
            items: [
              {
                id: `reg-strategy-spec-persona-${FD}|source_strategy_spec|artifact-persona-paper-${FD}`,
                from: `reg-strategy-spec-persona-${FD}`,
                to: `artifact-persona-paper-${FD}`,
                label: "source_strategy_spec",
              },
            ],
            page_info: {
              next_page_token: null,
              total: 1,
              page_size: 1,
              returned: 1,
              has_more: true,
            },
            meta: {
              snapshot_at: "2026-11-04T00:00:00Z",
              status: "ok",
              source: "service_client",
              surfaces: {
                lineage: { status: "ok", source: "service_client" },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "lineage",
              nodes: [],
              edges: [],
              status: "ok",
              source: "service_client",
            },
            items: [],
            page_info: {
              next_page_token: null,
              total: 0,
              page_size: 0,
              returned: 0,
              has_more: false,
            },
            meta: {
              snapshot_at: "2026-11-04T00:00:00Z",
              status: "ok",
              source: "service_client",
              surfaces: {
                lineage: { status: "ok", source: "service_client" },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "lineage",
              nodes: [],
              edges: [],
              status: "unavailable",
              source: "unavailable",
            },
            items: [],
            page_info: {
              next_page_token: null,
              total: 0,
              page_size: 0,
              returned: 0,
              has_more: false,
            },
            meta: {
              snapshot_at: "2026-11-04T00:00:00Z",
              status: "unavailable",
              source: "unavailable",
              surfaces: {
                lineage: { status: "unavailable", source: "unavailable" },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

    const cappedGraph = await managementConsoleReads.lineage(`strategy-persona-${FD}`);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `/bff/lineage?root_id=strategy-persona-${FD}`,
      expect.any(Object),
    );
    expect(cappedGraph.nodes).toHaveLength(2);
    expect(cappedGraph.edges).toEqual([
      {
        from: `reg-strategy-spec-persona-${FD}`,
        to: `artifact-persona-paper-${FD}`,
        label: "source_strategy_spec",
      },
    ]);
    expect(cappedGraph.has_more).toBe(true);
    expect(cappedGraph.page_info?.has_more).toBe(true);
    expect(cappedGraph.meta.status).toBe("ok");

    const emptyGraph = await managementConsoleReads.lineage();
    expect(emptyGraph.nodes).toEqual([]);
    expect(emptyGraph.edges).toEqual([]);
    expect(emptyGraph.has_more).toBe(false);
    expect(emptyGraph.meta.status).toBe("ok");

    const unavailableGraph = await managementConsoleReads.lineage();
    expect(unavailableGraph.nodes).toEqual([]);
    expect(unavailableGraph.edges).toEqual([]);
    expect(unavailableGraph.has_more).toBe(false);
    expect(unavailableGraph.meta.status).toBe("unavailable");
  });
});
