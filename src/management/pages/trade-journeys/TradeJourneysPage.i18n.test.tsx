// TJ-I18N-SSE-001 — regression guard: this page shipped fully hardcoded in
// English while the console default locale is zh-TW. Renders the list page
// under zh-TW and fails on any reappearing hardcoded English shell copy.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import * as api from "@/lib/bff-v1/tradeJourneys";
import { TradeJourneyDetailPage, TradeJourneysPage } from "./TradeJourneysPage";

vi.mock("@/lib/bff-v1/tradeJourneys", async importOriginal => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    listTradeJourneys: vi.fn(),
    getTradeJourney: vi.fn(),
    getTradeJourneyTimeline: vi.fn(),
    getTradeJourneyEvidence: vi.fn(),
    subscribeTradeJourneys: vi.fn(() => ({ close() {} })),
  };
});

const fresh = {
  snapshot_at: new Date().toISOString(),
  read_state: "formal" as const,
  freshness: { materializer_revision: 7, rebuild_status: "ready", source_watermarks: {} },
};

const STATUS_CASES = [
  { status: "open", zh: "進行中", en: "Open", toneClass: "bg-muted" },
  { status: "completed", zh: "已完成", en: "Completed", toneClass: "bg-emerald-500/10" },
  { status: "completed_with_variance", zh: "完成但對帳有差異", en: "Completed with variance", toneClass: "bg-amber-500/10" },
  { status: "no_order", zh: "未下單", en: "No order", toneClass: "bg-muted" },
  { status: "unreconciled", zh: "未對帳", en: "Unreconciled", toneClass: "bg-amber-500/10" },
  { status: "failed", zh: "失敗", en: "Failed", toneClass: "bg-red-500/10" },
  { status: "raw_unknown_state", zh: "raw_unknown_state", en: "raw_unknown_state", toneClass: "bg-muted" },
] as const;

const ENGLISH_SENTINELS = [
  /Trade Journeys/,
  /Execution observability/,
  /No journeys match/,
  /Search symbol, persona or order ID/,
  /Resolve decision, client order/,
  /Previous page/,
  /Next page/,
  /All journeys/,
  /Live updates stale/,
];

describe("TradeJourneysPage i18n coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listTradeJourneys).mockResolvedValue({
      data: { items: [] },
      page_info: { total: 0, page_size: 25 },
      meta: fresh,
    });
  });

  it("renders fully localized zh-TW copy with no hardcoded English shell", async () => {
    await i18n.changeLanguage("zh-TW");
    render(
      <MemoryRouter initialEntries={["/management/trade-journeys"]}>
        <Routes><Route path="/management/trade-journeys" element={<TradeJourneysPage/>} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "交易旅程" })).toBeInTheDocument();
    expect(screen.getByText("執行可觀測性")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜尋代號、Persona 或訂單 ID")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一頁" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一頁" })).toBeInTheDocument();
    const body = document.body.textContent ?? "";
    for (const sentinel of ENGLISH_SENTINELS) {
      expect(body, `hardcoded English leaked: ${sentinel}`).not.toMatch(sentinel);
    }
  });

  it("renders the en-US copy when the locale switches", async () => {
    await i18n.changeLanguage("en-US");
    render(
      <MemoryRouter initialEntries={["/management/trade-journeys"]}>
        <Routes><Route path="/management/trade-journeys" element={<TradeJourneysPage/>} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Trade Journeys" })).toBeInTheDocument();
    await i18n.changeLanguage("zh-TW");
  });

  it.each([
    ["zh-TW", "zh"] as const,
    ["en-US", "en"] as const,
  ])("renders localized status labels and tones in %s on both list and detail", async (locale, labelKey) => {
    await i18n.changeLanguage(locale);
    const items = STATUS_CASES.map((entry, idx) => ({
      journey_id: `tj-status-${idx}`,
      status: entry.status,
      current_stage: "reconciliation",
      flags: {},
      environment: "paper" as const,
      severity: "info",
      symbol: "2330",
      updated_at: new Date().toISOString(),
    }));
    vi.mocked(api.listTradeJourneys).mockResolvedValue({
      data: { items },
      page_info: { total: items.length, page_size: 25 },
      meta: fresh,
    });

    const listView = render(
      <MemoryRouter initialEntries={["/management/trade-journeys"]}>
        <Routes><Route path="/management/trade-journeys" element={<TradeJourneysPage/>} /></Routes>
      </MemoryRouter>,
    );

    for (const entry of STATUS_CASES) {
      const badge = await screen.findByText(entry[labelKey]);
      expect(badge).toHaveClass(entry.toneClass);
      if (entry.status !== "completed") {
        expect(badge).not.toHaveClass("bg-emerald-500/10");
      }
    }
    listView.unmount();

    for (const [idx, entry] of STATUS_CASES.entries()) {
      const row = items[idx];
      vi.mocked(api.getTradeJourney).mockResolvedValue({ data: row, meta: fresh });
      vi.mocked(api.getTradeJourneyTimeline).mockResolvedValue({ data: { items: [] }, page_info: { total: 0, page_size: 100 }, meta: fresh });
      vi.mocked(api.getTradeJourneyEvidence).mockResolvedValue({ data: {}, meta: fresh });
      const detailView = render(
        <MemoryRouter initialEntries={[`/management/trade-journeys/${row.journey_id}`]}>
          <Routes><Route path="/management/trade-journeys/:journeyId" element={<TradeJourneyDetailPage/>} /></Routes>
        </MemoryRouter>,
      );
      await screen.findByRole("heading", { name: row.journey_id });
      const detailBadge = screen.getByText(entry[labelKey]);
      expect(detailBadge).toHaveClass(entry.toneClass);
      if (entry.status !== "completed") {
        expect(detailBadge).not.toHaveClass("bg-emerald-500/10");
      }
      detailView.unmount();
    }

    await i18n.changeLanguage("zh-TW");
  });
});
