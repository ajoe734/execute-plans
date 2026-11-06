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
});
