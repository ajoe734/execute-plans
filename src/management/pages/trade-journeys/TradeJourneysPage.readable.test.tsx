import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { TradeJourneyDetailPage, TradeJourneysPage } from "./TradeJourneysPage";
import * as api from "@/lib/bff-v1/tradeJourneys";
import { UPSTREAM_STAGES, KNOWN_REASON_CODES, reconciliationAnalysisView } from "./journeyReadable";
import {
  completedRow,
  deferredRow,
  fixtureMeta,
  makeTj57418ba7Timeline,
  noTradeRow,
  openRow,
  outcomeRows,
  rejectedBeforeRepairRow,
  rejectedBeforeRepairTimeline,
  rejectedDetailStages,
  rejectedPartialFiguresRow,
  rejectedRow,
  rejectedTimeline,
  rejectedUnknownCodeRow,
  rejectedUnrecordedRow,
  tj57418ba7BrokerUnavailableRow,
  tj57418ba7DeferredOmittedCauseRow,
  tj57418ba7DeferredUnrecordedCauseRow,
  tj57418ba7GenuineMismatchRow,
  tj57418ba7RepairedRuntimeRow,
  tj57418ba7UnverifiedRow,
  tj57418ba7UpstreamOmissionRow,
  varianceRow,
  varianceTimeline,
} from "./__fixtures__/readableJourneys";

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

const items = (rows: api.JourneyRow[]) =>
  vi.mocked(api.listTradeJourneys).mockResolvedValue({
    data: { items: rows },
    page_info: { total: rows.length, page_size: 25 },
    meta: fixtureMeta,
  });
const renderList = (entry = "/management/trade-journeys") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/management/trade-journeys" element={<TradeJourneysPage />} />
      </Routes>
    </MemoryRouter>,
  );
function renderDetail(row: api.JourneyRow, timeline: api.JourneyTimelineEvent[] = [], extra: Partial<api.JourneyDetail> = {}) {
  vi.mocked(api.getTradeJourney).mockResolvedValue({ data: { ...row, ...extra }, meta: fixtureMeta });
  vi.mocked(api.getTradeJourneyTimeline).mockResolvedValue({
    data: { items: timeline },
    page_info: { total: timeline.length, page_size: 100 },
    meta: fixtureMeta,
  });
  vi.mocked(api.getTradeJourneyEvidence).mockResolvedValue({ data: { raw: "evidence-blob" }, meta: fixtureMeta });
  return render(
    <MemoryRouter initialEntries={[`/management/trade-journeys/${row.journey_id}`]}>
      <Routes>
        <Route path="/management/trade-journeys/:journeyId" element={<TradeJourneyDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
const rowOf = (id: string) => screen.getByText(id).closest("tr") as HTMLElement;

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("zh-TW");
});
afterEach(cleanup);

describe("readable trade journey list (zh-TW)", () => {
  it("titles each row with persona, side, symbol and quantity and shows a small copyable id", async () => {
    items([rejectedRow, varianceRow, noTradeRow]);
    renderList();
    await screen.findByText(rejectedRow.journey_id);
    const row = rowOf(rejectedRow.journey_id);
    expect(within(row).getByRole("link", { name: "澄川 買 2317 452 股" })).toBeInTheDocument();
    expect(within(rowOf(varianceRow.journey_id)).getByRole("link", { name: "青禾 賣 2330 1 股" })).toBeInTheDocument();
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    fireEvent.click(within(row).getByRole("button", { name: "複製旅程編號" }));
    expect(writeText).toHaveBeenCalledWith(rejectedRow.journey_id);
  });

  it("falls back to the persona id when persona_name is missing", async () => {
    items([{ ...rejectedRow, persona_name: null }]);
    renderList();
    expect(await screen.findByRole("link", { name: "persona-6507750312870d03a241 買 2317 452 股" })).toBeInTheDocument();
  });

  it("explains each of the six outcome kinds with true cause, stage and available figures", async () => {
    items(outcomeRows);
    renderList();
    await screen.findByText(completedRow.journey_id);
    const noTrade = within(rowOf(noTradeRow.journey_id));
    expect(noTrade.getByText("本日觀望")).toHaveClass("bg-muted");
    expect(noTrade.getByText("策略訊號為持有，本日不下單")).toBeInTheDocument();
    expect(
      within(rowOf(rejectedRow.journey_id)).getByText(
        "風控駁回（風險評估 · 未送單）：現金不足：需要 100,034.3461、可用 100,000、限額 100,000、委託 452 股",
      ),
    ).toBeInTheDocument();
    expect(within(rowOf(deferredRow.journey_id)).getByText("對帳待確認")).toBeInTheDocument();
    expect(
      within(rowOf(deferredRow.journey_id)).getByText(
        "對帳時執行環境不健康，等待下次排程重新對帳（檢查項目：執行環境健康度）",
      ),
    ).toBeInTheDocument();
    expect(
      within(rowOf(varianceRow.journey_id)).getByText(
        "對帳差異：部位變動（預期 -1、實際 0、差額 1）、現金變動（預期 2,165、實際 0、差額 -2,165）",
      ),
    ).toBeInTheDocument();
    expect(within(rowOf(openRow.journey_id)).getByText("部分成交，仍在等待剩餘數量")).toBeInTheDocument();
    expect(within(rowOf(completedRow.journey_id)).getByText("已完成")).toBeInTheDocument();
  });

  it("states insufficient evidence when a reason or figure is missing and names an unknown reason code", async () => {
    const rejectedNullDetailRow: api.JourneyRow = {
      ...rejectedRow,
      journey_id: "tj_79726064-null-detail",
      outcome: { ...rejectedRow.outcome!, reason_detail: null, missing_evidence: undefined },
    };
    const rejectedEmptyDetailRow: api.JourneyRow = {
      ...rejectedRow,
      journey_id: "tj_79726064-empty-detail",
      outcome: { ...rejectedRow.outcome!, reason_detail: {}, missing_evidence: undefined },
    };
    const rejectedMissingRequiredRow: api.JourneyRow = {
      ...rejectedRow,
      journey_id: "tj_79726064-missing-required",
      outcome: { ...rejectedRow.outcome!, reason_detail: { available: 100000 }, missing_evidence: undefined },
    };
    const positionNullDetailRow: api.JourneyRow = {
      ...rejectedRow,
      journey_id: "tj_79726064-position-null",
      side: "sell",
      outcome: {
        ...rejectedRow.outcome!,
        reason_code: "insufficient_position",
        reason_detail: null,
        missing_evidence: undefined,
      },
    };
    const positionMissingRequestedRow: api.JourneyRow = {
      ...rejectedRow,
      journey_id: "tj_79726064-position-partial",
      side: "sell",
      outcome: {
        ...rejectedRow.outcome!,
        reason_code: "sell_without_holdings",
        reason_detail: { holding_quantity: 0 },
        missing_evidence: undefined,
      },
    };
    items([
      rejectedUnrecordedRow,
      rejectedPartialFiguresRow,
      rejectedNullDetailRow,
      rejectedEmptyDetailRow,
      rejectedMissingRequiredRow,
      positionNullDetailRow,
      positionMissingRequestedRow,
      rejectedUnknownCodeRow,
    ]);
    renderList();
    expect(
      await screen.findByText("風控駁回（風險評估 · 未送單）：此筆記錄沒有保存原因 · 證據不足（缺少：駁回原因）"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "風控駁回（風險評估 · 未送單）：現金不足：需要 100,034.3461 · 證據不足（缺少：可用金額）",
      ),
    ).toBeInTheDocument();
    expect(
      within(rowOf(rejectedNullDetailRow.journey_id)).getByText(
        "風控駁回（風險評估 · 未送單）：現金不足 · 證據不足（缺少：所需金額、可用金額）",
      ),
    ).toBeInTheDocument();
    expect(
      within(rowOf(rejectedEmptyDetailRow.journey_id)).getByText(
        "風控駁回（風險評估 · 未送單）：現金不足 · 證據不足（缺少：所需金額、可用金額）",
      ),
    ).toBeInTheDocument();
    expect(
      within(rowOf(rejectedMissingRequiredRow.journey_id)).getByText(
        "風控駁回（風險評估 · 未送單）：現金不足：可用 100,000 · 證據不足（缺少：所需金額）",
      ),
    ).toBeInTheDocument();
    expect(
      within(rowOf(positionNullDetailRow.journey_id)).getByText(
        "風控駁回（風險評估 · 未送單）：持股不足 · 證據不足（缺少：持有股數、委託股數）",
      ),
    ).toBeInTheDocument();
    expect(
      within(rowOf(positionMissingRequestedRow.journey_id)).getByText(
        "風控駁回（風險評估 · 未送單）：無持股不可賣出：持有 0 · 證據不足（缺少：委託股數）",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("券商駁回（券商確認）：原因代碼 venue_halted_9")).toBeInTheDocument();
  });

  it("has zh-TW and en-US text for every known reason code", () => {
    for (const code of KNOWN_REASON_CODES) {
      for (const lng of ["zh-TW", "en-US"]) expect(i18n.exists(`tradeJourneys.reasons.${code}`, { lng }), `${lng} ${code}`).toBe(true);
    }
    expect(UPSTREAM_STAGES).toHaveLength(6);
  });

  it("sends the recon_mismatch attention value and the include_probe toggle only when switched on", async () => {
    items([]);
    renderList();
    await waitFor(() => expect(api.listTradeJourneys).toHaveBeenCalled());
    expect(vi.mocked(api.listTradeJourneys).mock.calls[0][0]).toEqual(
      expect.objectContaining({ include_probe: undefined, attention: undefined }),
    );
    const toggle = screen.getByRole("checkbox", { name: "顯示測試 persona" });
    expect(toggle).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("關注視圖"), { target: { value: "recon_mismatch" } });
    await waitFor(() =>
      expect(vi.mocked(api.listTradeJourneys).mock.calls.at(-1)![0]).toEqual(
        expect.objectContaining({ attention: "recon_mismatch" }),
      ),
    );
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(vi.mocked(api.listTradeJourneys).mock.calls.at(-1)![0]).toEqual(
        expect.objectContaining({ attention: "recon_mismatch", include_probe: "true" }),
      ),
    );
  });

  it("offers only attention values the BFF accepts", () => {
    items([]);
    renderList();
    const values = Array.from((screen.getByLabelText("關注視圖") as HTMLSelectElement).options).map(o => o.value);
    expect(values).toEqual(["", "attention", "risk_reject", "broker_reject", "partial_fill", "recon_mismatch"]);
  });
});

describe("readable trade journey detail (zh-TW)", () => {
  const lineage = {
    diagnostics: [{ code: "upstream_lineage_unlinked", attention: false, stages: UPSTREAM_STAGES }],
    completeness: { missing_stages: UPSTREAM_STAGES },
  };

  it("opens a pre-broker rejected journey with 風控駁回, 未送單, actual cause, stage, available figures, and grounded link", async () => {
    renderDetail(rejectedRow, rejectedTimeline, { ...lineage, stages: rejectedDetailStages });
    const panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(panel).getByText(
        "風控駁回（風險評估 · 未送單）：現金不足：需要 100,034.3461、可用 100,000、限額 100,000、委託 452 股",
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText("目前沒有事件單，也沒有人被指派。")).toBeInTheDocument();
    expect(within(panel).getByText(/檢查該 persona 的現金與風控額度/)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /開啟/ })).toHaveAttribute(
      "href",
      "/management/personas/persona-6507750312870d03a241",
    );
    expect(within(panel).queryByRole("button")).toBeNull();

    const stages = screen.getByLabelText("旅程階段");
    expect(within(stages).getByLabelText("風險評估: 風控駁回")).toHaveTextContent(
      "現金不足：需要 100,034.3461、可用 100,000、限額 100,000、委託 452 股",
    );
    expect(within(stages).getByLabelText("下單送出: 未送單")).toBeInTheDocument();
    expect(screen.getByText("風險評估 · 風控駁回 · 未送單")).toBeInTheDocument();
    expect(
      screen.getAllByText("現金不足：需要 100,034.3461、可用 100,000、限額 100,000、委託 452 股").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("links a proven variance journey to its incident and shows the compared values across banner, stages and timeline", async () => {
    renderDetail(varianceRow, varianceTimeline, {
      stages: {
        reconciliation: {
          status: "failed",
          classification: "accounting_variance",
          accounting_variance: true,
          comparison_completed: true,
          reason_code: "reconciliation_check_failed",
          discrepancies: varianceRow.outcome!.discrepancies,
        },
      },
    });
    const panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(within(panel).getByText("已有事件單追蹤。")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /開啟/ })).toHaveAttribute(
      "href",
      "/management/incidents/inc-drift-3025dd61c462",
    );
    expect(within(panel).getByText(/查看已開立的事件單/)).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "對帳差異：部位變動（預期 -1、實際 0、差額 1）、現金變動（預期 2,165、實際 0、差額 -2,165）",
      ).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("distinguishes runtime health, broker read failure, proven cash variance and missing evidence on tj_57418ba7", async () => {
    // 1. Runtime health -> 對帳待確認 with runtime health check
    renderDetail(tj57418ba7RepairedRuntimeRow, makeTj57418ba7Timeline(tj57418ba7RepairedRuntimeRow), {
      stages: { reconciliation: { status: "failed", ...tj57418ba7RepairedRuntimeRow.outcome } },
    });
    let panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(panel).getByText(
        /對帳待確認：對帳時執行環境不健康，等待下次排程重新對帳（檢查項目：執行環境健康度） · 證據不足（缺少：帳務比對明細）/,
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText("等待下次排程對帳，無需動作。")).toBeInTheDocument();
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("對帳: 對帳待確認")).toBeInTheDocument();
    expect(screen.getByText("對帳 · 對帳待確認")).toBeInTheDocument();
    expect(screen.getByText(/賣 1 · @ 218\.5 · 成交 1 股/)).toBeInTheDocument();
    cleanup();

    // 2. Broker read failure -> 對帳待確認 with broker record HTTP 503
    renderDetail(tj57418ba7BrokerUnavailableRow, makeTj57418ba7Timeline(tj57418ba7BrokerUnavailableRow), {
      stages: { reconciliation: { status: "failed", ...tj57418ba7BrokerUnavailableRow.outcome } },
    });
    panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(panel).getByText(
        /對帳待確認：對帳時無法連到券商，等待下次排程重新對帳（檢查項目：券商訂單紀錄（HTTP 503））/,
      ),
    ).toBeInTheDocument();
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("對帳: 對帳待確認")).toBeInTheDocument();
    expect(screen.getByText("對帳 · 對帳待確認")).toBeInTheDocument();
    cleanup();

    // 3. Proven accounting variance -> compared values (expected 217.5331, actual 172.5331, delta -45)
    renderDetail(tj57418ba7GenuineMismatchRow, makeTj57418ba7Timeline(tj57418ba7GenuineMismatchRow), {
      stages: { reconciliation: { status: "failed", ...tj57418ba7GenuineMismatchRow.outcome } },
    });
    panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(panel).getByText(
        "對帳差異（現金餘額與成交後應有的金額不符）：現金變動（預期 217.5331、實際 172.5331、差額 -45）",
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/核對對帳差異（部位與現金）/)).toBeInTheDocument();
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("對帳: 失敗")).toHaveTextContent(
      "對帳差異（現金餘額與成交後應有的金額不符）：現金變動（預期 217.5331、實際 172.5331、差額 -45）",
    );
    expect(screen.getByText("對帳 · 失敗")).toBeInTheDocument();
    cleanup();

    // 4. Upstream omission (missing cash_change:actual) -> explicit insufficient evidence + available expected figure + grounded action
    renderDetail(tj57418ba7UpstreamOmissionRow, makeTj57418ba7Timeline(tj57418ba7UpstreamOmissionRow), {
      stages: { reconciliation: { status: "failed", ...tj57418ba7UpstreamOmissionRow.outcome } },
    });
    panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(panel).getByText(
        "對帳待確認：對帳比對證據不完整 · 待查證原因：現金餘額與成交後應有的金額不符 · 現金變動（預期 217.5331、實際 缺少） · 證據不足（缺少：現金變動（實際值））",
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/補齊缺少的對帳證據並確認帳務紀錄/)).toBeInTheDocument();
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("對帳: 對帳待確認")).toHaveTextContent(
      "證據不足（缺少：現金變動（實際值））",
    );
    expect(screen.getByText("對帳 · 對帳待確認")).toBeInTheDocument();
  });

  it("refreshes list, detail banner, stages and timeline from pre-repair to post-repair for both reported journeys", async () => {
    // 1. List refresh: pre-repair -> post-repair for tj_79726064 and tj_57418ba7
    vi.mocked(api.listTradeJourneys)
      .mockResolvedValueOnce({
        data: { items: [rejectedBeforeRepairRow, tj57418ba7UnverifiedRow] },
        page_info: { total: 2, page_size: 25 },
        meta: fixtureMeta,
      })
      .mockResolvedValueOnce({
        data: { items: [rejectedRow, tj57418ba7RepairedRuntimeRow] },
        page_info: { total: 2, page_size: 25 },
        meta: fixtureMeta,
      });

    renderList();
    expect(
      await screen.findByText("風控駁回（風險評估 · 未送單）：此筆記錄沒有保存原因 · 證據不足（缺少：駁回原因）"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因、帳務比對明細）"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    expect(
      await screen.findByText(
        "風控駁回（風險評估 · 未送單）：現金不足：需要 100,034.3461、可用 100,000、限額 100,000、委託 452 股",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "對帳時執行環境不健康，等待下次排程重新對帳（檢查項目：執行環境健康度） · 證據不足（缺少：帳務比對明細）",
      ),
    ).toBeInTheDocument();
    cleanup();

    // 2. Detail + timeline refresh on tj_79726064: pre-repair -> post-repair
    vi.mocked(api.getTradeJourney)
      .mockResolvedValueOnce({
        data: {
          ...rejectedBeforeRepairRow,
          stages: {
            signal_generation: { status: "succeeded" },
            trade_decision: { status: "succeeded" },
            risk_evaluation: {
              status: "rejected",
              reason_code: "reason_not_recorded",
              missing_evidence: ["reject_reason"],
            },
            order_submission: { status: "not_submitted", order_status: "not_submitted", submitted_to_broker: false },
          },
        },
        meta: fixtureMeta,
      })
      .mockResolvedValueOnce({
        data: { ...rejectedRow, stages: rejectedDetailStages },
        meta: fixtureMeta,
      });
    vi.mocked(api.getTradeJourneyTimeline)
      .mockResolvedValueOnce({
        data: { items: rejectedBeforeRepairTimeline },
        page_info: { total: 3, page_size: 100 },
        meta: fixtureMeta,
      })
      .mockResolvedValueOnce({
        data: { items: rejectedTimeline },
        page_info: { total: 3, page_size: 100 },
        meta: fixtureMeta,
      });
    vi.mocked(api.getTradeJourneyEvidence).mockResolvedValue({ data: {}, meta: fixtureMeta });

    render(
      <MemoryRouter initialEntries={[`/management/trade-journeys/${rejectedRow.journey_id}`]}>
        <Routes>
          <Route path="/management/trade-journeys/:journeyId" element={<TradeJourneyDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    let panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(within(panel).getByText(/證據不足（缺少：駁回原因）/)).toBeInTheDocument();
    expect(within(panel).getByText(/檢查該 persona 的風控紀錄與缺少的駁回證據/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "這筆旅程的情況" })).getByText(
          "風控駁回（風險評估 · 未送單）：現金不足：需要 100,034.3461、可用 100,000、限額 100,000、委託 452 股",
        ),
      ).toBeInTheDocument(),
    );
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("風險評估: 風控駁回")).toHaveTextContent(
      "現金不足：需要 100,034.3461、可用 100,000、限額 100,000、委託 452 股",
    );
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("下單送出: 未送單")).toBeInTheDocument();
    expect(screen.getByText("風險評估 · 風控駁回 · 未送單")).toBeInTheDocument();
    cleanup();

    // 3. Detail + timeline refresh on tj_57418ba7: pre-repair -> post-repair
    vi.mocked(api.getTradeJourney)
      .mockResolvedValueOnce({
        data: {
          ...tj57418ba7UnverifiedRow,
          stages: { reconciliation: { status: "failed", ...tj57418ba7UnverifiedRow.outcome } },
        },
        meta: fixtureMeta,
      })
      .mockResolvedValueOnce({
        data: {
          ...tj57418ba7RepairedRuntimeRow,
          stages: { reconciliation: { status: "failed", ...tj57418ba7RepairedRuntimeRow.outcome } },
        },
        meta: fixtureMeta,
      });
    vi.mocked(api.getTradeJourneyTimeline)
      .mockResolvedValueOnce({
        data: { items: makeTj57418ba7Timeline(tj57418ba7UnverifiedRow) },
        page_info: { total: 2, page_size: 100 },
        meta: fixtureMeta,
      })
      .mockResolvedValueOnce({
        data: { items: makeTj57418ba7Timeline(tj57418ba7RepairedRuntimeRow) },
        page_info: { total: 2, page_size: 100 },
        meta: fixtureMeta,
      });

    render(
      <MemoryRouter initialEntries={[`/management/trade-journeys/${tj57418ba7UnverifiedRow.journey_id}`]}>
        <Routes>
          <Route path="/management/trade-journeys/:journeyId" element={<TradeJourneyDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(within(panel).getByText(/證據不足（缺少：對帳原因、帳務比對明細）/)).toBeInTheDocument();
    expect(within(panel).getByText(/補齊缺少的對帳證據並確認帳務紀錄/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "這筆旅程的情況" })).getByText(
          /對帳待確認：對帳時執行環境不健康，等待下次排程重新對帳（檢查項目：執行環境健康度）/,
        ),
      ).toBeInTheDocument(),
    );
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("對帳: 對帳待確認")).toHaveTextContent(
      "執行環境健康度",
    );
    expect(screen.getByText("對帳 · 對帳待確認")).toBeInTheDocument();
  });

  it("never lets a raw action_needed code reach the DOM, and names an unknown code", async () => {
    renderDetail(rejectedRow, rejectedTimeline);
    await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(document.body.textContent).not.toMatch(/review_(cash_and_risk_limits|open_incident|reconciliation_variance)/);
    cleanup();
    renderDetail({ ...rejectedRow, next_step: { action_needed: "page_the_oncall_9", href: "/personas/p1" } }, rejectedTimeline);
    expect(await screen.findByText(/待辦代碼 page_the_oncall_9/)).toBeInTheDocument();
  });

  it("says nothing is needed for a held day and waits for a deferred reconciliation", async () => {
    renderDetail(noTradeRow);
    expect(await screen.findByText("不需要做任何事。")).toBeInTheDocument();
    cleanup();
    renderDetail(deferredRow);
    expect(await screen.findByText("等待下次排程對帳，無需動作。")).toBeInTheDocument();
  });

  it("keeps upstream lineage gaps to one muted line outside 需要處理, and collapses the raw JSON", async () => {
    renderDetail(completedRow, [], { ...lineage, flags: { mismatch: true } });
    const muted = await screen.findByText(/上游研究到部署階段未連結到此旅程/);
    expect(muted).toHaveClass("text-muted-foreground");
    const attention = screen.getByRole("heading", { name: "需要處理" }).closest("aside") as HTMLElement;
    expect(attention).toHaveTextContent("對帳不符");
    expect(attention).not.toHaveTextContent("缺少");
    const summary = screen.getByText("原始資料");
    expect(summary.closest("details")).not.toHaveAttribute("open");
  });

  it("does not raise 需要處理 for lineage alone", async () => {
    renderDetail(completedRow, [], lineage);
    await screen.findByText(/上游研究到部署階段未連結到此旅程/);
    expect(screen.queryByRole("heading", { name: "需要處理" })).toBeNull();
  });

  it("preserves event-local reconciliation cause/comparison across historical timeline items and only hydrates matching source_event_id across multi-event refresh", async () => {
    // 1. Exact P1 reproduction: makeTj57418ba7Timeline(tj57418ba7GenuineMismatchRow) against current tj57418ba7RepairedRuntimeRow
    renderDetail(tj57418ba7RepairedRuntimeRow, makeTj57418ba7Timeline(tj57418ba7GenuineMismatchRow), {
      stages: { reconciliation: { status: "failed", ...tj57418ba7RepairedRuntimeRow.outcome } },
    });
    let panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(panel).getByText(
        /對帳待確認：對帳時執行環境不健康，等待下次排程重新對帳（檢查項目：執行環境健康度） · 證據不足（缺少：帳務比對明細）/,
      ),
    ).toBeInTheDocument();
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("對帳: 對帳待確認")).toHaveTextContent(
      "執行環境健康度",
    );
    // Timeline item preserves its event-local accounting_variance cause and compared values (217.5331 / 172.5331 / -45)
    expect(screen.getByText("對帳 · 失敗")).toBeInTheDocument();
    expect(
      screen.getByText(
        "對帳差異（現金餘額與成交後應有的金額不符）：現金變動（預期 217.5331、實際 172.5331、差額 -45）",
      ),
    ).toBeInTheDocument();
    cleanup();

    // 2. Converse P1 reproduction: old failed event without reason/evidence and unverified event against current tj57418ba7GenuineMismatchRow
    const bareOldFailedEvent: api.JourneyTimelineEvent = {
      event_id: "recon-old-bare-failed",
      stage: "reconciliation",
      event_type: "reconciliation_failed",
      stage_status: "failed",
      status: "failed",
      occurred_at: "2026-11-16T06:54:00.000000Z",
      source: "reconciliation-drift.scheduled",
    };
    const matchingSparseCurrentEvent: api.JourneyTimelineEvent = {
      event_id: "48c946c8-39d1-52bd-b1a1-ce72dc7f6e14",
      source_event_id: "48c946c8-39d1-52bd-b1a1-ce72dc7f6e14",
      stage: "reconciliation",
      event_type: "reconciliation_failed",
      stage_status: "failed",
      status: "failed",
      occurred_at: "2026-11-16T06:58:29.000000Z",
      source: "reconciliation-drift.scheduled",
    };
    renderDetail(
      tj57418ba7GenuineMismatchRow,
      [bareOldFailedEvent, ...makeTj57418ba7Timeline(tj57418ba7UnverifiedRow)],
      { stages: { reconciliation: { status: "failed", ...tj57418ba7GenuineMismatchRow.outcome } } },
    );
    panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(panel).getByText(
        "對帳差異（現金餘額與成交後應有的金額不符）：現金變動（預期 217.5331、實際 172.5331、差額 -45）",
      ),
    ).toBeInTheDocument();
    // Neither the bare old failed event nor the unverified event inherits the row's 217.5331 / 172.5331 / -45 variance
    expect(screen.getAllByText("對帳 · 對帳待確認")).toHaveLength(2);
    expect(
      screen.getAllByText("此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因、帳務比對明細）"),
    ).toHaveLength(2);
    expect(screen.queryByText("對帳 · 失敗")).toBeNull();
    cleanup();

    // 3. Multi-event refresh regression control: pre-repair -> post-repair with historical unrecorded + historical variance + latest matching hydrated runtime event
    const historicalVarianceEvent: api.JourneyTimelineEvent = {
      ...makeTj57418ba7Timeline(tj57418ba7GenuineMismatchRow)[1],
      event_id: "recon-historical-variance",
      source_event_id: "recon-historical-variance",
      occurred_at: "2026-11-16T06:55:00.000000Z",
    };
    vi.mocked(api.getTradeJourney)
      .mockResolvedValueOnce({
        data: {
          ...tj57418ba7UnverifiedRow,
          stages: { reconciliation: { status: "failed", ...tj57418ba7UnverifiedRow.outcome } },
        },
        meta: fixtureMeta,
      })
      .mockResolvedValueOnce({
        data: {
          ...tj57418ba7RepairedRuntimeRow,
          stages: { reconciliation: { status: "failed", ...tj57418ba7RepairedRuntimeRow.outcome } },
        },
        meta: fixtureMeta,
      });
    vi.mocked(api.getTradeJourneyTimeline)
      .mockResolvedValueOnce({
        data: {
          items: [
            makeTj57418ba7Timeline(tj57418ba7UnverifiedRow)[0],
            bareOldFailedEvent,
            historicalVarianceEvent,
          ],
        },
        page_info: { total: 3, page_size: 100 },
        meta: fixtureMeta,
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            makeTj57418ba7Timeline(tj57418ba7RepairedRuntimeRow)[0],
            bareOldFailedEvent,
            historicalVarianceEvent,
            matchingSparseCurrentEvent,
          ],
        },
        page_info: { total: 4, page_size: 100 },
        meta: fixtureMeta,
      });
    vi.mocked(api.getTradeJourneyEvidence).mockResolvedValue({ data: {}, meta: fixtureMeta });

    render(
      <MemoryRouter initialEntries={[`/management/trade-journeys/${tj57418ba7UnverifiedRow.journey_id}`]}>
        <Routes>
          <Route path="/management/trade-journeys/:journeyId" element={<TradeJourneyDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(
      screen.getByText(
        "對帳差異（現金餘額與成交後應有的金額不符）：現金變動（預期 217.5331、實際 172.5331、差額 -45）",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "這筆旅程的情況" })).getByText(
          /對帳待確認：對帳時執行環境不健康，等待下次排程重新對帳（檢查項目：執行環境健康度） · 證據不足（缺少：帳務比對明細）/,
        ),
      ).toBeInTheDocument(),
    );
    // After refresh:
    // - bareOldFailedEvent still displays missing evidence (did not inherit runtime health or variance)
    // - historicalVarianceEvent still displays proven variance 217.5331 / 172.5331 / -45 with 對帳 · 失敗
    // - matchingSparseCurrentEvent hydrated from matching source_event_id 48c946c8-... and displays runtime health
    expect(
      screen.getByText("此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因、帳務比對明細）"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "對帳差異（現金餘額與成交後應有的金額不符）：現金變動（預期 217.5331、實際 172.5331、差額 -45）",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("對帳 · 失敗")).toBeInTheDocument();
    expect(screen.getAllByText("對帳 · 對帳待確認")).toHaveLength(2);
    expect(
      screen.getAllByText(
        "對帳時執行環境不健康，等待下次排程重新對帳（檢查項目：執行環境健康度） · 證據不足（缺少：帳務比對明細）",
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("infers missing required/available and position figures independently across banner, stage and timeline when detail is null, empty or partial", async () => {
    // 1. Cash rejection with reason_detail: null
    const cashNullRow: api.JourneyRow = {
      ...rejectedRow,
      outcome: {
        ...rejectedRow.outcome!,
        reason_code: "insufficient_cash",
        reason_detail: null,
        missing_evidence: undefined,
      },
    };
    const cashNullTimeline: api.JourneyTimelineEvent[] = [
      rejectedTimeline[0],
      rejectedTimeline[1],
      {
        ...rejectedTimeline[2],
        reason_code: "insufficient_cash",
        reason_detail: null,
        missing_evidence: undefined,
      },
    ];
    renderDetail(cashNullRow, cashNullTimeline, {
      stages: {
        ...rejectedDetailStages,
        risk_evaluation: {
          ...rejectedDetailStages!.risk_evaluation,
          reason_code: "insufficient_cash",
          reason_detail: null,
          missing_evidence: undefined,
        },
      },
    });
    let panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(panel).getByText(
        "風控駁回（風險評估 · 未送單）：現金不足 · 證據不足（缺少：所需金額、可用金額）",
      ),
    ).toBeInTheDocument();
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("風險評估: 風控駁回")).toHaveTextContent(
      "現金不足 · 證據不足（缺少：所需金額、可用金額）",
    );
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("下單送出: 未送單")).toBeInTheDocument();
    expect(
      screen.getAllByText("現金不足 · 證據不足（缺少：所需金額、可用金額）").length,
    ).toBeGreaterThanOrEqual(2);
    cleanup();

    // 2. Cash rejection with only available figure (required absent)
    const cashOnlyAvailableRow: api.JourneyRow = {
      ...rejectedRow,
      outcome: {
        ...rejectedRow.outcome!,
        reason_code: "insufficient_cash",
        reason_detail: { available: 100000 },
        missing_evidence: undefined,
      },
    };
    const cashOnlyAvailableTimeline: api.JourneyTimelineEvent[] = [
      rejectedTimeline[0],
      rejectedTimeline[1],
      {
        ...rejectedTimeline[2],
        reason_code: "insufficient_cash",
        reason_detail: { available: 100000 },
        missing_evidence: undefined,
      },
    ];
    renderDetail(cashOnlyAvailableRow, cashOnlyAvailableTimeline, {
      stages: {
        ...rejectedDetailStages,
        risk_evaluation: {
          ...rejectedDetailStages!.risk_evaluation,
          reason_code: "insufficient_cash",
          reason_detail: { available: 100000 },
          missing_evidence: undefined,
        },
      },
    });
    panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(panel).getByText(
        "風控駁回（風險評估 · 未送單）：現金不足：可用 100,000 · 證據不足（缺少：所需金額）",
      ),
    ).toBeInTheDocument();
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("風險評估: 風控駁回")).toHaveTextContent(
      "現金不足：可用 100,000 · 證據不足（缺少：所需金額）",
    );
    expect(
      screen.getAllByText("現金不足：可用 100,000 · 證據不足（缺少：所需金額）").length,
    ).toBeGreaterThanOrEqual(2);
    cleanup();

    // 3. Position rejection with reason_detail: {} (empty object, both holding_quantity and requested_quantity absent)
    const posEmptyRow: api.JourneyRow = {
      ...rejectedRow,
      side: "sell",
      outcome: {
        ...rejectedRow.outcome!,
        reason_code: "insufficient_position",
        reason_detail: {},
        missing_evidence: undefined,
      },
    };
    const posEmptyTimeline: api.JourneyTimelineEvent[] = [
      rejectedTimeline[0],
      rejectedTimeline[1],
      {
        ...rejectedTimeline[2],
        reason_code: "insufficient_position",
        reason_detail: {},
        missing_evidence: undefined,
      },
    ];
    renderDetail(posEmptyRow, posEmptyTimeline, {
      stages: {
        ...rejectedDetailStages,
        risk_evaluation: {
          ...rejectedDetailStages!.risk_evaluation,
          reason_code: "insufficient_position",
          reason_detail: {},
          missing_evidence: undefined,
        },
      },
    });
    panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(panel).getByText(
        "風控駁回（風險評估 · 未送單）：持股不足 · 證據不足（缺少：持有股數、委託股數）",
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/檢查該 persona 的持股部位與委託設定/)).toBeInTheDocument();
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("風險評估: 風控駁回")).toHaveTextContent(
      "持股不足 · 證據不足（缺少：持有股數、委託股數）",
    );
    expect(
      screen.getAllByText("持股不足 · 證據不足（缺少：持有股數、委託股數）").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("preserves successful reconciliation_completed status and renders passed check evidence without inventing a missing cause, including mixed historical success/failure refresh", async () => {
    const passedChecksDetail = [
      { check: "broker_fill_qty", status: "passed", expected: 1, actual: 1, difference: 0 },
      { check: "cash_change", status: "passed", expected: 2206, actual: 2206, difference: 0 },
    ];
    const completedReconTimeline: api.JourneyTimelineEvent[] = [
      {
        event_id: "fill-ok-1",
        stage: "fill_management",
        event_type: "paper_fill_simulated",
        stage_status: "succeeded",
        status: "succeeded",
        occurred_at: "2026-11-19T23:49:00.000000Z",
        source: "execution.paper_runtime",
      },
      {
        event_id: "recon-pass-1",
        source_event_id: "recon-pass-1",
        stage: "reconciliation",
        event_type: "reconciliation_completed",
        stage_status: "succeeded",
        status: "succeeded",
        occurred_at: "2026-11-19T23:50:03.000000Z",
        source: "reconciliation-drift.scheduled",
        reason_detail: passedChecksDetail,
      },
    ];

    // 1. Completed row with reconciliation stage succeeded and successful timeline event carrying passed checks
    renderDetail(completedRow, completedReconTimeline, {
      stages: {
        signal_generation: { status: "succeeded" },
        trade_decision: { status: "succeeded" },
        risk_evaluation: { status: "succeeded" },
        order_submission: { status: "succeeded" },
        broker_acknowledgement: { status: "succeeded" },
        fill_management: { status: "succeeded" },
        ledger_booking: { status: "succeeded" },
        reconciliation: { status: "succeeded" },
      },
    });
    let panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(within(panel).getByText("已正常完成，沒有異常。")).toBeInTheDocument();
    const reconStageCard = within(screen.getByLabelText("旅程階段")).getByLabelText("對帳: 成功");
    expect(reconStageCard).toHaveTextContent(
      "券商成交數量（預期 1、實際 1、差額 0）、現金變動（預期 2,206、實際 2,206、差額 0）",
    );
    expect(screen.getByText("對帳 · 成功")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "券商成交數量（預期 1、實際 1、差額 0）、現金變動（預期 2,206、實際 2,206、差額 0）",
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent).not.toContain("對帳待確認");
    expect(document.body.textContent).not.toContain("此筆記錄沒有保存原因");
    expect(document.body.textContent).not.toContain("證據不足");
    cleanup();

    // 2. Mixed historical success + current failure (and refresh into completed-with-passed-checks)
    const historicalSuccessEvent: api.JourneyTimelineEvent = {
      event_id: "recon-hist-pass",
      source_event_id: "recon-hist-pass",
      stage: "reconciliation",
      event_type: "reconciliation_completed",
      stage_status: "succeeded",
      status: "succeeded",
      occurred_at: "2026-11-16T06:55:00.000000Z",
      source: "reconciliation-drift.scheduled",
      reason_detail: passedChecksDetail,
    };
    const historicalFailureEvent: api.JourneyTimelineEvent = {
      ...makeTj57418ba7Timeline(tj57418ba7GenuineMismatchRow)[1],
      event_id: "recon-hist-variance",
      source_event_id: "recon-hist-variance",
      occurred_at: "2026-11-16T06:58:29.000000Z",
    };
    const resolvedSuccessEvent: api.JourneyTimelineEvent = {
      event_id: "recon-resolved-pass",
      source_event_id: "recon-resolved-pass",
      stage: "reconciliation",
      event_type: "reconciliation_completed",
      stage_status: "succeeded",
      status: "succeeded",
      occurred_at: "2026-11-16T07:05:00.000000Z",
      source: "reconciliation-drift.scheduled",
      reason_detail: [
        { check: "broker_record", status: "not_configured" },
        { check: "position_change", status: "passed", expected: -1, actual: -1, difference: 0 },
        { check: "cash_change", status: "passed", expected: 217.5331375, actual: 217.5331375, difference: 0 },
      ],
    };
    const resolvedCompletedRow: api.JourneyRow = {
      ...tj57418ba7GenuineMismatchRow,
      status: "completed",
      severity: "info",
      flags: {
        waiting_human: false,
        blocked: false,
        rejected: false,
        mismatch: false,
        orphan: false,
        stalled: false,
      },
      outcome: { kind: "normal", reason_code: null, reason_detail: null },
      next_step: null,
    };

    vi.mocked(api.getTradeJourney)
      .mockResolvedValueOnce({
        data: {
          ...tj57418ba7GenuineMismatchRow,
          stages: { reconciliation: { status: "failed", ...tj57418ba7GenuineMismatchRow.outcome } },
        },
        meta: fixtureMeta,
      })
      .mockResolvedValueOnce({
        data: {
          ...resolvedCompletedRow,
          stages: {
            reconciliation: {
              status: "succeeded",
              source_event_id: "recon-resolved-pass",
              reason_detail: resolvedSuccessEvent.reason_detail,
            },
          },
        },
        meta: fixtureMeta,
      });
    vi.mocked(api.getTradeJourneyTimeline)
      .mockResolvedValueOnce({
        data: {
          items: [
            makeTj57418ba7Timeline(tj57418ba7GenuineMismatchRow)[0],
            historicalSuccessEvent,
            historicalFailureEvent,
          ],
        },
        page_info: { total: 3, page_size: 100 },
        meta: fixtureMeta,
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            makeTj57418ba7Timeline(tj57418ba7GenuineMismatchRow)[0],
            historicalSuccessEvent,
            historicalFailureEvent,
            resolvedSuccessEvent,
          ],
        },
        page_info: { total: 4, page_size: 100 },
        meta: fixtureMeta,
      });
    vi.mocked(api.getTradeJourneyEvidence).mockResolvedValue({ data: {}, meta: fixtureMeta });

    render(
      <MemoryRouter initialEntries={[`/management/trade-journeys/${tj57418ba7GenuineMismatchRow.journey_id}`]}>
        <Routes>
          <Route path="/management/trade-journeys/:journeyId" element={<TradeJourneyDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Before refresh: row is in variance state, but historicalSuccessEvent in timeline still renders 對帳 · 成功 with passed checks
    panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(panel).getByText(
        "對帳差異（現金餘額與成交後應有的金額不符）：現金變動（預期 217.5331、實際 172.5331、差額 -45）",
      ),
    ).toBeInTheDocument();
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("對帳: 失敗")).toBeInTheDocument();
    expect(screen.getByText("對帳 · 成功")).toBeInTheDocument();
    expect(
      screen.getByText(
        "券商成交數量（預期 1、實際 1、差額 0）、現金變動（預期 2,206、實際 2,206、差額 0）",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("對帳 · 失敗")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("對帳待確認");

    // Click refresh: journey transitions to completed with resolvedSuccessEvent while retaining historicalSuccessEvent and historicalFailureEvent
    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "這筆旅程的情況" })).getByText("已正常完成，沒有異常。"),
      ).toBeInTheDocument(),
    );
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("對帳: 成功")).toHaveTextContent(
      "券商訂單紀錄、部位變動（預期 -1、實際 -1、差額 0）、現金變動（預期 217.5331、實際 217.5331、差額 0）",
    );
    expect(screen.getAllByText("對帳 · 成功")).toHaveLength(2);
    expect(
      screen.getByText(
        "券商成交數量（預期 1、實際 1、差額 0）、現金變動（預期 2,206、實際 2,206、差額 0）",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "券商訂單紀錄、部位變動（預期 -1、實際 -1、差額 0）、現金變動（預期 217.5331、實際 217.5331、差額 0）",
      ).length,
    ).toBeGreaterThanOrEqual(2);
    // Historical failure event in timeline still keeps its own variance cause
    expect(screen.getByText("對帳 · 失敗")).toBeInTheDocument();
    expect(
      screen.getByText(
        "對帳差異（現金餘額與成交後應有的金額不符）：現金變動（預期 217.5331、實際 172.5331、差額 -45）",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("對帳待確認");
    expect(document.body.textContent).not.toContain("此筆記錄沒有保存原因");
  });

  it("requires positive runtime classification/code/check evidence before naming runtime health, and keeps omitted and reason_not_recorded deferred causes on 對帳待確認 with missing evidence and grounded actions across list/banner/stage/timeline refresh", async () => {
    const t = i18n.t.bind(i18n);

    // 1. Direct unit checks on reconciliationAnalysisView with real zh-TW i18next
    const omittedDeferredView = reconciliationAnalysisView(
      { kind: "reconciliation_deferred", reason_code: null, reason_detail: null },
      t,
    );
    expect(omittedDeferredView.isUnverified).toBe(true);
    expect(omittedDeferredView.isDeferred).toBe(false);
    expect(omittedDeferredView.badge).toBe("對帳待確認");
    expect(omittedDeferredView.stageStatusLabel).toBe("對帳待確認");
    expect(omittedDeferredView.sentence).toBe("此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因、帳務比對明細）");
    expect(omittedDeferredView.sentence).not.toContain("對帳時執行環境不健康");

    const unrecordedDeferredView = reconciliationAnalysisView(
      {
        kind: "reconciliation_deferred",
        reason_code: "reason_not_recorded",
        reason_detail: null,
        missing_evidence: ["reconciliation_reason"],
      },
      t,
    );
    expect(unrecordedDeferredView.isUnverified).toBe(true);
    expect(unrecordedDeferredView.isDeferred).toBe(false);
    expect(unrecordedDeferredView.badge).toBe("對帳待確認");
    expect(unrecordedDeferredView.stageStatusLabel).toBe("對帳待確認");
    expect(unrecordedDeferredView.sentence).toBe("此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因）");
    expect(unrecordedDeferredView.sentence).not.toContain("對帳時執行環境不健康");

    const positiveRuntimeByClass = reconciliationAnalysisView(
      { kind: "reconciliation_deferred", classification: "runtime_health", reason_code: null, reason_detail: null },
      t,
    );
    expect(positiveRuntimeByClass.isDeferred).toBe(true);
    expect(positiveRuntimeByClass.isUnverified).toBe(false);
    expect(positiveRuntimeByClass.sentence).toBe("對帳時執行環境不健康，等待下次排程重新對帳");

    const positiveRuntimeByCode = reconciliationAnalysisView(
      { kind: "reconciliation_deferred", reason_code: "runtime_unhealthy_at_reconciliation", reason_detail: null },
      t,
    );
    expect(positiveRuntimeByCode.isDeferred).toBe(true);
    expect(positiveRuntimeByCode.isUnverified).toBe(false);
    expect(positiveRuntimeByCode.sentence).toBe("對帳時執行環境不健康，等待下次排程重新對帳");

    const positiveRuntimeByCheck = reconciliationAnalysisView(
      {
        kind: "reconciliation_deferred",
        reason_code: null,
        reason_detail: [{ check: "runtime_health_summary", status: "warning" }],
      },
      t,
    );
    expect(positiveRuntimeByCheck.isDeferred).toBe(true);
    expect(positiveRuntimeByCheck.isUnverified).toBe(false);
    expect(positiveRuntimeByCheck.sentence).toBe("對帳時執行環境不健康，等待下次排程重新對帳（檢查項目：執行環境健康度）");

    // 2. List refresh regression: omitted and reason_not_recorded deferred causes -> known runtime/broker and completed rows
    const omittedListRow: api.JourneyRow = {
      ...tj57418ba7DeferredOmittedCauseRow,
      journey_id: "tj_57418ba7-deferred-omitted",
    };
    const unrecordedListRow: api.JourneyRow = {
      ...tj57418ba7DeferredUnrecordedCauseRow,
      journey_id: "tj_57418ba7-deferred-unrecorded",
    };
    const runtimeListRow: api.JourneyRow = {
      ...tj57418ba7RepairedRuntimeRow,
      journey_id: "tj_57418ba7-deferred-omitted",
    };
    const brokerListRow: api.JourneyRow = {
      ...tj57418ba7BrokerUnavailableRow,
      journey_id: "tj_57418ba7-deferred-unrecorded",
    };

    vi.mocked(api.listTradeJourneys)
      .mockResolvedValueOnce({
        data: { items: [omittedListRow, unrecordedListRow, completedRow] },
        page_info: { total: 3, page_size: 25 },
        meta: fixtureMeta,
      })
      .mockResolvedValueOnce({
        data: { items: [runtimeListRow, brokerListRow, completedRow] },
        page_info: { total: 3, page_size: 25 },
        meta: fixtureMeta,
      });

    renderList();
    await screen.findByText(omittedListRow.journey_id);
    expect(within(rowOf(omittedListRow.journey_id)).getByText("對帳待確認")).toBeInTheDocument();
    expect(
      within(rowOf(omittedListRow.journey_id)).getByText(
        "此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因、帳務比對明細）",
      ),
    ).toBeInTheDocument();
    expect(within(rowOf(unrecordedListRow.journey_id)).getByText("對帳待確認")).toBeInTheDocument();
    expect(
      within(rowOf(unrecordedListRow.journey_id)).getByText("此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因）"),
    ).toBeInTheDocument();
    expect(within(rowOf(completedRow.journey_id)).getByText("已完成")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("對帳時執行環境不健康");

    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    await waitFor(() =>
      expect(
        within(rowOf(runtimeListRow.journey_id)).getByText(
          "對帳時執行環境不健康，等待下次排程重新對帳（檢查項目：執行環境健康度） · 證據不足（缺少：帳務比對明細）",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      within(rowOf(brokerListRow.journey_id)).getByText(
        "對帳時無法連到券商，等待下次排程重新對帳（檢查項目：券商訂單紀錄（HTTP 503））",
      ),
    ).toBeInTheDocument();
    expect(within(rowOf(completedRow.journey_id)).getByText("已完成")).toBeInTheDocument();
    cleanup();

    // 3. Detail banner + stage + timeline refresh regression: omitted deferred -> reason_not_recorded deferred -> repaired runtime health (retaining historical omitted, unrecorded, and passed-check timeline events)
    const historicalOmittedEvent: api.JourneyTimelineEvent = {
      ...makeTj57418ba7Timeline(tj57418ba7DeferredOmittedCauseRow)[1],
      event_id: "recon-deferred-omitted-hist",
      source_event_id: "recon-deferred-omitted-hist",
      occurred_at: "2026-11-16T06:53:00.000000Z",
    };
    const historicalUnrecordedEvent: api.JourneyTimelineEvent = {
      ...makeTj57418ba7Timeline(tj57418ba7DeferredUnrecordedCauseRow)[1],
      event_id: "recon-deferred-unrecorded-hist",
      source_event_id: "recon-deferred-unrecorded-hist",
      occurred_at: "2026-11-16T06:55:00.000000Z",
    };
    const historicalPassedCheckEvent: api.JourneyTimelineEvent = {
      event_id: "recon-passed-check-hist",
      source_event_id: "recon-passed-check-hist",
      stage: "reconciliation",
      event_type: "reconciliation_completed",
      stage_status: "succeeded",
      status: "succeeded",
      occurred_at: "2026-11-16T06:54:00.000000Z",
      source: "reconciliation-drift.scheduled",
      reason_detail: [
        { check: "broker_fill_qty", status: "passed", expected: 1, actual: 1, difference: 0 },
        { check: "cash_change", status: "passed", expected: 2206, actual: 2206, difference: 0 },
      ],
    };

    vi.mocked(api.getTradeJourney)
      .mockResolvedValueOnce({
        data: {
          ...tj57418ba7DeferredOmittedCauseRow,
          stages: { reconciliation: { status: "failed", ...tj57418ba7DeferredOmittedCauseRow.outcome } },
        },
        meta: fixtureMeta,
      })
      .mockResolvedValueOnce({
        data: {
          ...tj57418ba7DeferredUnrecordedCauseRow,
          stages: { reconciliation: { status: "failed", ...tj57418ba7DeferredUnrecordedCauseRow.outcome } },
        },
        meta: fixtureMeta,
      })
      .mockResolvedValueOnce({
        data: {
          ...tj57418ba7RepairedRuntimeRow,
          stages: { reconciliation: { status: "failed", ...tj57418ba7RepairedRuntimeRow.outcome } },
        },
        meta: fixtureMeta,
      });
    vi.mocked(api.getTradeJourneyTimeline)
      .mockResolvedValueOnce({
        data: { items: makeTj57418ba7Timeline(tj57418ba7DeferredOmittedCauseRow) },
        page_info: { total: 2, page_size: 100 },
        meta: fixtureMeta,
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            makeTj57418ba7Timeline(tj57418ba7DeferredUnrecordedCauseRow)[0],
            historicalOmittedEvent,
            makeTj57418ba7Timeline(tj57418ba7DeferredUnrecordedCauseRow)[1],
          ],
        },
        page_info: { total: 3, page_size: 100 },
        meta: fixtureMeta,
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            makeTj57418ba7Timeline(tj57418ba7RepairedRuntimeRow)[0],
            historicalOmittedEvent,
            historicalPassedCheckEvent,
            historicalUnrecordedEvent,
            makeTj57418ba7Timeline(tj57418ba7RepairedRuntimeRow)[1],
          ],
        },
        page_info: { total: 5, page_size: 100 },
        meta: fixtureMeta,
      });
    vi.mocked(api.getTradeJourneyEvidence).mockResolvedValue({ data: {}, meta: fixtureMeta });

    render(
      <MemoryRouter initialEntries={[`/management/trade-journeys/${tj57418ba7DeferredOmittedCauseRow.journey_id}`]}>
        <Routes>
          <Route path="/management/trade-journeys/:journeyId" element={<TradeJourneyDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // State 1: Omitted deferred cause ({kind: "reconciliation_deferred", reason_code: null, reason_detail: null})
    let panel = await screen.findByRole("region", { name: "這筆旅程的情況" });
    expect(
      within(panel).getByText("對帳待確認：此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因、帳務比對明細）"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("目前沒有事件單，也沒有人被指派。")).toBeInTheDocument();
    expect(within(panel).getByText(/補齊缺少的對帳證據並確認帳務紀錄/)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /開啟/ })).toHaveAttribute(
      "href",
      "/management/personas/persona-6507750312870d03a241",
    );
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("對帳: 對帳待確認")).toHaveTextContent(
      "此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因、帳務比對明細）",
    );
    expect(screen.getByText("對帳 · 對帳待確認")).toBeInTheDocument();
    expect(
      screen.getAllByText("此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因、帳務比對明細）").length,
    ).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent).not.toContain("對帳時執行環境不健康");
    expect(document.body.textContent).not.toContain("等待下次排程對帳，無需動作。");

    // State 2: Click refresh -> reason_not_recorded deferred cause with missing_evidence: ["reconciliation_reason"]
    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "這筆旅程的情況" })).getByText(
          "對帳待確認：此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因）",
        ),
      ).toBeInTheDocument(),
    );
    panel = screen.getByRole("region", { name: "這筆旅程的情況" });
    expect(within(panel).getByText("目前沒有事件單，也沒有人被指派。")).toBeInTheDocument();
    expect(within(panel).getByText(/補齊缺少的對帳證據並確認帳務紀錄/)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /開啟/ })).toHaveAttribute(
      "href",
      "/management/personas/persona-6507750312870d03a241",
    );
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("對帳: 對帳待確認")).toHaveTextContent(
      "此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因）",
    );
    expect(screen.getAllByText("對帳 · 對帳待確認")).toHaveLength(2);
    expect(
      screen.getByText("此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因、帳務比對明細）"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因）").length,
    ).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent).not.toContain("對帳時執行環境不健康");

    // State 3: Click refresh -> repaired known runtime health while retaining historical omitted, passed-check, and unrecorded timeline items
    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "這筆旅程的情況" })).getByText(
          "對帳待確認：對帳時執行環境不健康，等待下次排程重新對帳（檢查項目：執行環境健康度） · 證據不足（缺少：帳務比對明細）",
        ),
      ).toBeInTheDocument(),
    );
    panel = screen.getByRole("region", { name: "這筆旅程的情況" });
    expect(within(panel).getByText("系統會在下次排程自動重新對帳。")).toBeInTheDocument();
    expect(within(panel).getByText("等待下次排程對帳，無需動作。")).toBeInTheDocument();
    expect(within(screen.getByLabelText("旅程階段")).getByLabelText("對帳: 對帳待確認")).toHaveTextContent(
      "對帳時執行環境不健康，等待下次排程重新對帳（檢查項目：執行環境健康度） · 證據不足（缺少：帳務比對明細）",
    );
    expect(screen.getAllByText("對帳 · 對帳待確認")).toHaveLength(3);
    expect(screen.getByText("對帳 · 成功")).toBeInTheDocument();
    expect(
      screen.getByText("券商成交數量（預期 1、實際 1、差額 0）、現金變動（預期 2,206、實際 2,206、差額 0）"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因、帳務比對明細）"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因）"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "對帳時執行環境不健康，等待下次排程重新對帳（檢查項目：執行環境健康度） · 證據不足（缺少：帳務比對明細）",
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });
});
