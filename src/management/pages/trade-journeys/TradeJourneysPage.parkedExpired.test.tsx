import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { TradeJourneyDetailPage, TradeJourneysPage } from "./TradeJourneysPage";
import * as api from "@/lib/bff-v1/tradeJourneys";
import { KNOWN_ACTION_CODES, KNOWN_REASON_CODES } from "./journeyReadable";
import listParkedExpired from "./__fixtures__/recorded/list_parked_expired.json";
import pendingBuyDetail from "./__fixtures__/recorded/detail_tj_e6eb7d82-395e-5d0d-95af-6c3b11db53b2.json";
import expiredHoldDetail from "./__fixtures__/recorded/detail_tj_45cb6e82-3496-552e-af74-3ccafe0e4e3a.json";
import pendingHoldDetail from "./__fixtures__/recorded/detail_tj_9eeb8979-9010-5624-bccc-e16631ebacbe.json";

vi.mock("@/lib/auth/AuthProvider", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/auth/AuthProvider")>();
  return {
    ...actual,
    useAuth: () => ({
      session: null,
      user: null,
      bffSession: null,
      bffError: null,
      loading: false,
      retryBffSession: vi.fn(),
      signOut: vi.fn(),
      devLogin: vi.fn(),
    }),
  };
});

vi.mock("@/lib/bff-v1/tradeJourneys", async importOriginal => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    listTradeJourneys: vi.fn(),
    getTradeJourney: vi.fn(),
    getTradeJourneyTimeline: vi.fn(),
    getTradeJourneyEvidence: vi.fn(),
    resolveTradeJourney: vi.fn(),
    subscribeTradeJourneys: vi.fn(() => ({ close() {} })),
  };
});

const RAW_PARKED_EXPIRED_RE =
  /\b(pending_settlement|pending settlement|target_session_not_reconciled_by_expiry|review_market_data_refresh|expired_no_price|expired|hold\s+1)\b/i;

const asEnvelope = (body: unknown) => body as never;
const rowOf = (id: string) => screen.getByText(id).closest("tr") as HTMLElement;

const readable = () =>
  Array.from(document.querySelectorAll("section"))
    .map(s => {
      const c = s.cloneNode(true) as HTMLElement;
      c.querySelectorAll("pre,code,details").forEach(n => n.remove());
      return c.textContent;
    })
    .join("\n");

function renderList(payload: unknown = listParkedExpired) {
  vi.mocked(api.listTradeJourneys).mockResolvedValue(asEnvelope(payload));
  return render(
    <MemoryRouter initialEntries={["/management/trade-journeys"]}>
      <Routes>
        <Route path="/management/trade-journeys" element={<TradeJourneysPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderDetail(detailEnvelope: unknown, timelineEvents?: unknown[]) {
  const detail = detailEnvelope as {
    data: { journey_id: string; stage_events?: Record<string, unknown> };
    meta: unknown;
  };
  const id = detail.data.journey_id;
  const items =
    timelineEvents ??
    (detail.data.stage_events?.trade_decision ? [detail.data.stage_events.trade_decision] : []);
  vi.mocked(api.getTradeJourney).mockResolvedValue(asEnvelope(detail));
  vi.mocked(api.getTradeJourneyTimeline).mockResolvedValue(
    asEnvelope({
      data: { items },
      page_info: { total: items.length, page_size: 100 },
      meta: detail.meta,
    }),
  );
  vi.mocked(api.getTradeJourneyEvidence).mockResolvedValue(
    asEnvelope({ data: { raw: "evidence" }, meta: detail.meta }),
  );
  return render(
    <MemoryRouter initialEntries={[`/management/trade-journeys/${id}`]}>
      <Routes>
        <Route path="/management/trade-journeys/:journeyId" element={<TradeJourneyDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("zh-TW");
});
afterEach(cleanup);

describe("FE-TRADE-JOURNEY-PARKED-EXPIRED-LABELS-20261127 recorded parked and expired journeys", () => {
  it("renders all 12 recorded parked and expired list rows with target_day, Taipei timestamps, hold formatting, and no raw codes", async () => {
    renderList();
    await screen.findByText("tj_e6eb7d82-395e-5d0d-95af-6c3b11db53b2");

    // 1. Pending buy 46: tj_e6eb7d82-395e-5d0d-95af-6c3b11db53b2
    const pendingBuyRow = rowOf("tj_e6eb7d82-395e-5d0d-95af-6c3b11db53b2");
    expect(within(pendingBuyRow).getByRole("link", { name: "澄川 買 2317 46 股" })).toBeInTheDocument();
    expect(pendingBuyRow).toHaveTextContent("買 46");
    expect(pendingBuyRow).toHaveTextContent("進行中");
    expect(pendingBuyRow).toHaveTextContent(
      "等待隔日開盤價成交：決策等待 2026-11-27 開盤價，若於台北時間 2026-11-30 08:55:00 前開盤價未進來則失效",
    );

    // 2. Expired HOLD: tj_45cb6e82-3496-552e-af74-3ccafe0e4e3a
    const expiredHoldRow = rowOf("tj_45cb6e82-3496-552e-af74-3ccafe0e4e3a");
    expect(within(expiredHoldRow).getByRole("link", { name: "衡岳 0050" })).toBeInTheDocument();
    expect(expiredHoldRow).not.toHaveTextContent(/買|賣|1 股|hold/i);
    expect(expiredHoldRow).toHaveTextContent("已過期");
    expect(expiredHoldRow).toHaveTextContent("觀望決策已過期（沒有錯過交易）");
    expect(expiredHoldRow).toHaveTextContent(
      "隔日開盤價在期限前沒有進來（決策日 2026-11-25、目標開盤日 2026-11-26、過期時間 台北時間 2026-11-27 08:55:21）",
    );

    // 3. Pending HOLD: tj_9eeb8979-9010-5624-bccc-e16631ebacbe
    const pendingHoldRow = rowOf("tj_9eeb8979-9010-5624-bccc-e16631ebacbe");
    expect(within(pendingHoldRow).getByRole("link", { name: "衡岳 0050" })).toBeInTheDocument();
    expect(pendingHoldRow).not.toHaveTextContent(/買|賣|1 股|hold/i);
    expect(pendingHoldRow).toHaveTextContent("進行中");
    expect(pendingHoldRow).toHaveTextContent(
      "等待隔日開盤價成交：決策等待 2026-11-30 開盤價，若於台北時間 2026-12-01 08:55:00 前開盤價未進來則失效",
    );

    // None of the raw codes appear anywhere on the list page
    expect(readable()).not.toMatch(RAW_PARKED_EXPIRED_RE);
  });

  it("renders pending buy 46 detail (tj_e6eb7d82) with 等待隔日開盤價成交, target_day, Taipei expires_at, and summary explanation", async () => {
    renderDetail(pendingBuyDetail);
    expect(await screen.findByRole("heading", { name: "澄川 買 2317 46 股" })).toBeInTheDocument();
    expect(screen.getByText(/2317\.TWSE · 買 46/)).toBeInTheDocument();

    const summary = screen.getByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(summary).getByText(
        "等待隔日開盤價成交：決策等待 2026-11-27 開盤價，若於台北時間 2026-11-30 08:55:00 前開盤價未進來則失效",
      ),
    ).toBeInTheDocument();
    expect(within(summary).getByText("不需要人處理。")).toBeInTheDocument();
    expect(within(summary).getByText("不需要做任何事。")).toBeInTheDocument();

    const stages = screen.getByLabelText("旅程階段");
    const decisionStage = within(stages).getByLabelText("交易決策: 等待隔日開盤價成交");
    expect(decisionStage).toHaveTextContent("等待隔日開盤價成交");
    expect(decisionStage).toHaveTextContent("2026-11-27");
    expect(decisionStage).toHaveTextContent("2026-11-30 08:55:00");

    expect(screen.getByText("交易決策 · 等待隔日開盤價成交")).toBeInTheDocument();
    expect(readable()).not.toMatch(RAW_PARKED_EXPIRED_RE);
  });

  it("renders expired HOLD detail (tj_45cb6e82) in both recorded shape and post-BFF-task shape (side null, next_step null)", async () => {
    // Recorded shape includes historical pending_settlement timeline event followed by expired event
    const initialPendingEvent = {
      event_id: "86048c57-6e1f-54e3-b73e-229faddd890d",
      source_event_id: "86048c57-6e1f-54e3-b73e-229faddd890d",
      stage: "trade_decision",
      stage_status: "pending_settlement",
      status: "pending_settlement",
      occurred_at: "2026-11-25T07:00:55.000000Z",
      recorded_at: "2026-11-27T23:30:45.000000Z",
      source: "execution.paper_runtime",
      reason_detail: {
        decision_day: "2026-11-25",
        target_day: "2026-11-26",
        expires_at: "2026-11-27T08:55:00+08:00",
      },
    };
    renderDetail(expiredHoldDetail, [
      initialPendingEvent,
      expiredHoldDetail.data.stage_events.trade_decision,
    ]);

    const heading = await screen.findByRole("heading", { name: "衡岳 0050" });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).not.toMatch(/買|賣|股/);
    expect(screen.getByText("0050.TWSE · 觀望")).toBeInTheDocument();

    const summary = screen.getByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(summary).getByText(
        "觀望決策已過期（沒有錯過交易） · 隔日開盤價在期限前沒有進來（決策日 2026-11-25、目標開盤日 2026-11-26、過期時間 台北時間 2026-11-27 08:55:21）",
      ),
    ).toBeInTheDocument();
    expect(within(summary).getByText(/檢查行情資料更新/)).toBeInTheDocument();
    expect(within(summary).getByRole("link", { name: /開啟/ })).toHaveAttribute(
      "href",
      "/management/data-sources",
    );

    const stages = screen.getByLabelText("旅程階段");
    const decisionStage = within(stages).getByLabelText("交易決策: 已過期");
    expect(decisionStage).toHaveTextContent(
      "隔日開盤價在期限前沒有進來（決策日 2026-11-25、目標開盤日 2026-11-26、過期時間 台北時間 2026-11-27 08:55:21）",
    );

    expect(screen.getByText("交易決策 · 等待隔日開盤價成交")).toBeInTheDocument();
    expect(screen.getByText("交易決策 · 已過期")).toBeInTheDocument();
    expect(readable()).not.toMatch(RAW_PARKED_EXPIRED_RE);
    cleanup();

    // Post-BFF-task shape: side is null, next_step is null, read_state is formal, reason_detail has decision_action: "hold"
    const postBffExpiredHold = {
      ...expiredHoldDetail,
      data: {
        ...expiredHoldDetail.data,
        side: null,
        next_step: null,
        read_state: "formal",
        completeness: { complete: true, missing_stages: [] },
        outcome: {
          ...expiredHoldDetail.data.outcome,
          reason_detail: {
            ...expiredHoldDetail.data.outcome.reason_detail,
            decision_action: "hold",
          },
        },
      },
      meta: { ...expiredHoldDetail.meta, read_state: "formal" },
    };
    renderDetail(postBffExpiredHold);

    expect(await screen.findByRole("heading", { name: "衡岳 0050" })).toBeInTheDocument();
    expect(screen.getByText("0050.TWSE · 觀望")).toBeInTheDocument();
    const postSummary = screen.getByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(postSummary).getByText(
        "觀望決策已過期（沒有錯過交易） · 隔日開盤價在期限前沒有進來（決策日 2026-11-25、目標開盤日 2026-11-26、過期時間 台北時間 2026-11-27 08:55:21）",
      ),
    ).toBeInTheDocument();
    expect(within(postSummary).getByText("不需要人處理。")).toBeInTheDocument();
    expect(within(postSummary).getByText("不需要做任何事。")).toBeInTheDocument();
    expect(readable()).not.toMatch(RAW_PARKED_EXPIRED_RE);
    cleanup();

    // Expired BUY journey: shows 已過期, 隔日開盤價在期限前沒有進來 with decision_day/target_day/expired_at, and 檢查行情資料更新 link without 觀望決策已過期
    const expiredBuyDetail = {
      ...expiredHoldDetail,
      data: {
        ...expiredHoldDetail.data,
        persona_name: "澄川｜2317 台股 Paper 學習 R2",
        symbol: "2317.TWSE",
        side: "buy",
        quantity: 46,
      },
    };
    renderDetail(expiredBuyDetail);
    expect(await screen.findByRole("heading", { name: "澄川 買 2317 46 股" })).toBeInTheDocument();
    const expiredBuySummary = screen.getByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(expiredBuySummary).getByText(
        "隔日開盤價在期限前沒有進來（決策日 2026-11-25、目標開盤日 2026-11-26、過期時間 台北時間 2026-11-27 08:55:21）",
      ),
    ).toBeInTheDocument();
    expect(expiredBuySummary).not.toHaveTextContent("觀望決策已過期");
    expect(within(expiredBuySummary).getByText(/檢查行情資料更新/)).toBeInTheDocument();
    expect(within(expiredBuySummary).getByRole("link", { name: /開啟/ })).toHaveAttribute(
      "href",
      "/management/data-sources",
    );
    expect(readable()).not.toMatch(RAW_PARKED_EXPIRED_RE);
  });

  it("renders pending HOLD detail (tj_9eeb8979) in both recorded shape (side hold) and post-BFF-task shape (side null)", async () => {
    renderDetail(pendingHoldDetail);
    expect(await screen.findByRole("heading", { name: "衡岳 0050" })).toBeInTheDocument();
    expect(screen.getByText("0050.TWSE · 觀望")).toBeInTheDocument();

    const summary = screen.getByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(summary).getByText(
        "等待隔日開盤價成交：決策等待 2026-11-30 開盤價，若於台北時間 2026-12-01 08:55:00 前開盤價未進來則失效",
      ),
    ).toBeInTheDocument();

    const stages = screen.getByLabelText("旅程階段");
    expect(within(stages).getByLabelText("交易決策: 等待隔日開盤價成交")).toHaveTextContent(
      "2026-11-30",
    );
    expect(screen.getByText("交易決策 · 等待隔日開盤價成交")).toBeInTheDocument();
    expect(readable()).not.toMatch(RAW_PARKED_EXPIRED_RE);
    cleanup();

    const postBffPendingHold = {
      ...pendingHoldDetail,
      data: {
        ...pendingHoldDetail.data,
        side: null,
        flags: { ...pendingHoldDetail.data.flags, stalled: false },
        read_state: "formal",
        completeness: { complete: true, missing_stages: [] },
      },
      meta: { ...pendingHoldDetail.meta, read_state: "formal" },
    };
    renderDetail(postBffPendingHold);
    expect(await screen.findByRole("heading", { name: "衡岳 0050" })).toBeInTheDocument();
    expect(screen.getByText("0050.TWSE · 觀望")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "需要處理" })).toBeNull();
    expect(readable()).not.toMatch(RAW_PARKED_EXPIRED_RE);
  });

  it("renders matching en-US strings for every new parked and expired label key", async () => {
    for (const code of KNOWN_REASON_CODES) {
      for (const lng of ["zh-TW", "en-US"] as const) {
        expect(i18n.exists(`tradeJourneys.reasons.${code}`, { lng }), `${lng} reason ${code}`).toBe(true);
      }
    }
    for (const code of KNOWN_ACTION_CODES) {
      for (const lng of ["zh-TW", "en-US"] as const) {
        expect(i18n.exists(`tradeJourneys.actions.${code}`, { lng }), `${lng} action ${code}`).toBe(true);
      }
    }

    await i18n.changeLanguage("en-US");
    renderDetail(pendingBuyDetail);
    expect(await screen.findByRole("heading", { name: "澄川 Buy 2317 46 shares" })).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Waiting for the next-session open price to settle: decision waits for the 2026-11-27 open and is voided if that open has not arrived by 2026-11-30 08:55:00 Taipei time",
      ).length,
    ).toBeGreaterThanOrEqual(2);
    cleanup();

    renderDetail(expiredHoldDetail);
    expect(await screen.findByRole("heading", { name: "衡岳 0050" })).toBeInTheDocument();
    expect(screen.getByText("0050.TWSE · Hold")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Hold decision expired (no trade was missed) · The next-session open price did not arrive before expiry (decision day 2026-11-25, target session 2026-11-26, expired at 2026-11-27 08:55:21 Taipei time)",
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Check market data refresh/)).toBeInTheDocument();
  });
});
