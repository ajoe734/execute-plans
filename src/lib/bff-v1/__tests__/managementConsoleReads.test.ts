import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adaptKnowledge,
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
