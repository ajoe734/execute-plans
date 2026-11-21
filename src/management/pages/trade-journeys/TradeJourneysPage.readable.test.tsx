import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { TradeJourneyDetailPage, TradeJourneysPage } from "./TradeJourneysPage";
import * as api from "@/lib/bff-v1/tradeJourneys";
import { UPSTREAM_STAGES, KNOWN_REASON_CODES } from "./journeyReadable";
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
    items([rejectedUnrecordedRow, rejectedPartialFiguresRow, rejectedUnknownCodeRow]);
    renderList();
    expect(
      await screen.findByText("風控駁回（風險評估 · 未送單）：此筆記錄沒有保存原因 · 證據不足（缺少：駁回原因）"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "風控駁回（風險評估 · 未送單）：現金不足：需要 100,034.3461 · 證據不足（缺少：可用金額）",
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
});
