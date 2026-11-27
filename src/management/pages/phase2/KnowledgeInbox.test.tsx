import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { __resetV5LiveCacheForTests } from "@/management/pages/v5/useV5Live";
import { KnowledgeInboxPage } from "./KnowledgeInbox";

void i18n.changeLanguage("en-US");

function renderKnowledgeInbox() {
  return render(
    <MemoryRouter initialEntries={["/management/knowledge"]}>
      <Routes>
        <Route path="/management/knowledge" element={<KnowledgeInboxPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("KnowledgeInboxPage (FE-EVIDENCE-KNOWLEDGE-TRUTH-20261104)", () => {
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

  it("renders kind from inboxType, source from sourceDataset, the existing unavailable risk badge when risk is missing, and no fabricated time when time is missing", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            items: [
              {
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
              },
              {
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
              },
            ],
          },
          meta: {
            status: "ok",
            total: 2,
            limit: 100,
            source_counts: {
              research_notes: 0,
              insight_cards: 1,
              institutional_memory_entries: 1,
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
    );
    vi.stubGlobal("fetch", fetchMock);

    renderKnowledgeInbox();

    expect(await screen.findAllByText("Avoid thin-liquidity market orders")).not.toHaveLength(0);
    expect(screen.getAllByText("memory_entry").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("institutional_memory_entries").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("insight")).toBeInTheDocument();
    expect(screen.getByText("insight_cards")).toBeInTheDocument();

    // Missing risk renders the existing Unavailable badge, never fabricated "Low"
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Low")).not.toBeInTheDocument();

    // Never fabricates pantheon-bff or research_note for non-note rows
    expect(screen.queryByText("pantheon-bff")).not.toBeInTheDocument();
    expect(screen.queryByText("research_note")).not.toBeInTheDocument();

    // Active item (mem-1) has missing time: detail metadata shows only sourceDataset without fabricated "—" or timestamp
    expect(screen.queryByText(/institutional_memory_entries ·/)).not.toBeInTheDocument();

    // Selecting the second item shows its body and formatted timestamp
    fireEvent.click(screen.getByText("Liquidity regime shift"));
    expect(await screen.findByText("Orderbook depth thinned during Asia open.")).toBeInTheDocument();
    expect(screen.getByText(/insight_cards ·/)).toBeInTheDocument();
  });

  it("shows the existing empty message when the BFF returns no items", async () => {
    const fetchMock = vi.fn(async () =>
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
    );
    vi.stubGlobal("fetch", fetchMock);

    renderKnowledgeInbox();

    expect(await screen.findByTestId("knowledge-inbox-empty")).toHaveTextContent("Inbox zero.");
    expect(screen.queryByTestId("knowledge-inbox-unavailable")).not.toBeInTheDocument();
  });

  it("shows read failure as unavailable rather than empty when BFF surface is unavailable or transport fails", async () => {
    const fetchMock = vi
      .fn()
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
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Bad Gateway" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const firstRender = renderKnowledgeInbox();
    expect(await screen.findByTestId("knowledge-inbox-unavailable")).toHaveTextContent(
      "Knowledge inbox unavailable.",
    );
    expect(screen.queryByText("Inbox zero.")).not.toBeInTheDocument();
    firstRender.unmount();

    __resetV5LiveCacheForTests();
    renderKnowledgeInbox();
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-inbox-unavailable")).toHaveTextContent(
        "Knowledge inbox unavailable.",
      );
    });
    expect(screen.queryByText("Inbox zero.")).not.toBeInTheDocument();
  });

  it("FE-KNOWLEDGE-POSTMORTEM-TRUTH-20261125 AC1: lists each unconnected or failed source from meta.surfaces, says empty only when every source was read, removes promote buttons, and translates in en-US and zh-TW", async () => {
    await i18n.changeLanguage("en-US");

    // 1. Hosted BFF adc027da9 shape: meta.status is ok while knowledge_inbox_insights and knowledge_inbox_memory are unavailable (source: missing)
    const hostedMissingSourcesResponse = {
      data: [],
      items: [],
      page_info: { next_page_token: null, total: 0, page_size: 20, returned: 0, has_more: false },
      meta: {
        snapshot_at: "2026-11-25T06:40:00Z",
        status: "ok",
        source: "bff_composed",
        surfaces: {
          knowledge_inbox: { status: "ok", source: "bff_composed" },
          knowledge_inbox_notes: { status: "ok", source: "service_client" },
          knowledge_inbox_insights: {
            status: "unavailable",
            source: "missing",
            message: "insight_cards has no readable source records.",
          },
          knowledge_inbox_memory: {
            status: "unavailable",
            source: "missing",
            message: "institutional_memory_entries has no readable source records.",
          },
        },
        composition: {
          datasets: ["research_notes", "insight_cards", "institutional_memory_entries"],
          itemCounts: { research_note: 0, insight: 0, memory_entry: 0 },
        },
      },
    };

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(hostedMissingSourcesResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const firstRender = renderKnowledgeInbox();

    const issuesCard = await screen.findByTestId("knowledge-source-issues");
    expect(issuesCard).toBeInTheDocument();
    expect(screen.getByTestId("knowledge-source-knowledge_inbox_insights")).toHaveAttribute(
      "data-source-state",
      "not_connected",
    );
    expect(screen.getByTestId("knowledge-source-knowledge_inbox_insights")).toHaveTextContent(
      "Insight cards",
    );
    expect(screen.getByTestId("knowledge-source-knowledge_inbox_insights")).toHaveTextContent(
      "Source not connected",
    );
    expect(screen.getByTestId("knowledge-source-knowledge_inbox_memory")).toHaveAttribute(
      "data-source-state",
      "not_connected",
    );
    expect(screen.getByTestId("knowledge-source-knowledge_inbox_memory")).toHaveTextContent(
      "Institutional memory",
    );
    expect(screen.queryByTestId("knowledge-source-knowledge_inbox_notes")).not.toBeInTheDocument();
    // Must NOT claim empty when sources are missing
    expect(screen.queryByTestId("knowledge-inbox-empty")).not.toBeInTheDocument();

    // Switch to zh-TW and verify localized source names and statuses
    await i18n.changeLanguage("zh-TW");
    firstRender.unmount();
    __resetV5LiveCacheForTests();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...hostedMissingSourcesResponse,
          meta: {
            ...hostedMissingSourcesResponse.meta,
            status: "degraded",
            surfaces: {
              ...hostedMissingSourcesResponse.meta.surfaces,
              knowledge_inbox_notes: {
                status: "unavailable",
                source: "unavailable",
                message: "owner 503",
              },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const secondRender = renderKnowledgeInbox();
    await screen.findByTestId("knowledge-source-issues");
    expect(screen.getByTestId("knowledge-source-knowledge_inbox_notes")).toHaveAttribute(
      "data-source-state",
      "failed",
    );
    expect(screen.getByTestId("knowledge-source-knowledge_inbox_notes")).toHaveTextContent("研究筆記");
    expect(screen.getByTestId("knowledge-source-knowledge_inbox_notes")).toHaveTextContent("來源讀取失敗");
    expect(screen.getByTestId("knowledge-source-knowledge_inbox_insights")).toHaveTextContent("洞察卡");
    expect(screen.getByTestId("knowledge-source-knowledge_inbox_insights")).toHaveTextContent("來源未連接");
    expect(screen.getByTestId("knowledge-source-knowledge_inbox_memory")).toHaveTextContent("機構記憶");
    expect(screen.queryByTestId("knowledge-inbox-empty")).not.toBeInTheDocument();
    secondRender.unmount();

    // 2. Every source read (all 3 ok) and 0 items -> says empty
    __resetV5LiveCacheForTests();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [],
          items: [],
          meta: {
            status: "ok",
            source: "bff_composed",
            surfaces: {
              knowledge_inbox: { status: "ok", source: "bff_composed" },
              knowledge_inbox_notes: { status: "ok", source: "service_client" },
              knowledge_inbox_insights: { status: "ok", source: "service_client" },
              knowledge_inbox_memory: { status: "ok", source: "service_client" },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const thirdRender = renderKnowledgeInbox();
    expect(await screen.findByTestId("knowledge-inbox-empty")).toHaveTextContent("收件匣已清空。");
    expect(screen.queryByTestId("knowledge-source-issues")).not.toBeInTheDocument();
    thirdRender.unmount();

    // 3. When an item is selected, the four promote/dismiss buttons without an executing owner are gone
    await i18n.changeLanguage("en-US");
    __resetV5LiveCacheForTests();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              note_id: "note-1",
              id: "note-1",
              inboxType: "research_note",
              sourceDataset: "research_notes",
              title: "Execution spread observation",
              summary: "Observed 8 bps improvement on TW open.",
              updated_at: "2026-11-25T06:00:00Z",
            },
          ],
          meta: {
            status: "ok",
            surfaces: {
              knowledge_inbox: { status: "ok", source: "bff_composed" },
              knowledge_inbox_notes: { status: "ok", source: "service_client" },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    renderKnowledgeInbox();
    expect(await screen.findAllByText("Execution spread observation")).not.toHaveLength(0);
    expect(screen.queryByText(/Promote →/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Dismiss/i })).not.toBeInTheDocument();
  });
});
