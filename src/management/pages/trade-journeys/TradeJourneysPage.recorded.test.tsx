import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { TradeJourneyDetailPage, TradeJourneysPage } from "./TradeJourneysPage";
import * as api from "@/lib/bff-v1/tradeJourneys";
import { sourceText } from "./journeyReadable";
import listBody from "./__fixtures__/recorded/list_default.trimmed.json";
import rejectedDetail from "./__fixtures__/recorded/detail_tj_79726064-4cc2-5510-8e11-7f5e59ff89bd.json";
import rejectedTimeline from "./__fixtures__/recorded/timeline_tj_79726064-4cc2-5510-8e11-7f5e59ff89bd.json";
import varianceDetail from "./__fixtures__/recorded/detail_tj_29473e86-63ff-5384-bda1-23eef61cebb2.json";
import varianceTimeline from "./__fixtures__/recorded/timeline_tj_29473e86-63ff-5384-bda1-23eef61cebb2.json";

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

const RAW = /\b(succeeded|failed|skipped|rejected|partial|degraded|not_submitted|unverified)\b/;
const asEnvelope = (body: unknown) => body as never;

function renderDetail(detail: unknown, timeline: unknown) {
  const id = (detail as { data: { journey_id: string } }).data.journey_id;
  vi.mocked(api.getTradeJourney).mockResolvedValue(asEnvelope(detail));
  vi.mocked(api.getTradeJourneyTimeline).mockResolvedValue(asEnvelope(timeline));
  vi.mocked(api.getTradeJourneyEvidence).mockResolvedValue({ data: {}, meta: (detail as { meta: never }).meta });
  return render(
    <MemoryRouter initialEntries={[`/management/trade-journeys/${id}`]}>
      <Routes>
        <Route path="/management/trade-journeys/:journeyId" element={<TradeJourneyDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
// the evidence <pre> is raw JSON by design; check the readable surface only
const readable = () =>
  Array.from(document.querySelectorAll("section"))
    .map(s => {
      const c = s.cloneNode(true) as HTMLElement;
      c.querySelectorAll("pre,code,details").forEach(n => n.remove());
      return c.textContent;
    })
    .join("\n");

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("zh-TW");
});
afterEach(cleanup);

describe("recorded hosted bodies (post-deploy 12:40Z)", () => {
  it("rejected journey: pre-broker refusal shows 風險評估 風控駁回 and 下單送出 未送單 with insufficient evidence, no raw word, no 未知來源", async () => {
    renderDetail(rejectedDetail, rejectedTimeline);
    const stages = await screen.findByLabelText("旅程階段");
    const decision = within(stages).getByLabelText(/交易決策|trade decision/i);
    expect(decision).toHaveTextContent("成功");
    expect(decision.querySelector("svg")).toHaveClass("text-emerald-600");
    const risk = within(stages).getByLabelText("風險評估: 風控駁回");
    expect(risk).toHaveTextContent("風控駁回");
    expect(risk).toHaveClass("bg-red-500/10");
    const order = within(stages).getByLabelText("下單送出: 未送單");
    expect(order).toHaveTextContent("未送單");
    expect(readable()).not.toMatch(RAW);
    expect(document.body.textContent).not.toContain("未知來源");
    expect(screen.getAllByText(/· 成功/).length).toBe(2);
    expect(screen.getByText("風險評估 · 風控駁回 · 未送單")).toBeInTheDocument();
    // long_cash is an expression choice code, not a rejection reason: never read as a cash shortfall.
    expect(document.body.textContent).toContain("此筆記錄沒有保存原因");
    expect(document.body.textContent).toContain("證據不足（缺少：駁回原因）");
    expect(document.body.textContent).not.toContain("現金不足");
    expect(readable()).not.toContain("long_cash");
  });

  it("unrecorded variance journey: seven stages read 成功 and reconciliation reads 對帳待確認 with explicit insufficient evidence", async () => {
    renderDetail(varianceDetail, varianceTimeline);
    const stages = await screen.findByLabelText("旅程階段");
    expect(within(stages).getAllByText("成功")).toHaveLength(7);
    expect(within(stages).getByLabelText("對帳: 對帳待確認")).toHaveTextContent(
      "此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因、帳務比對明細）",
    );
    expect(screen.getByText("對帳 · 對帳待確認")).toBeInTheDocument();
    expect(readable()).not.toMatch(RAW);
    expect(document.body.textContent).not.toContain("未知來源");
  });

  it("names known producers and shows nothing for an unknown or missing source", () => {
    const t = i18n.t.bind(i18n);
    expect(sourceText("execution.paper_runtime", t)).toBe("紙上交易執行");
    expect(sourceText("broker.paper_sidecar", t)).toBe("券商模擬端");
    expect(sourceText("reconciliation-drift.scheduled", t)).toBe("排程對帳（偏差檢查）");
    expect(sourceText("mystery.producer", t)).toBe("");
    expect(sourceText(undefined, t)).toBe("");
  });

  it("list: the partial row reads as a phrase and the banner counts the rows lacking stage records", async () => {
    vi.mocked(api.listTradeJourneys).mockResolvedValue(asEnvelope(listBody));
    render(
      <MemoryRouter initialEntries={["/management/trade-journeys"]}>
        <Routes>
          <Route path="/management/trade-journeys" element={<TradeJourneysPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findAllByRole("link");
    const lacking = listBody.data.items.filter(r => r.read_state !== "formal").length;
    expect(lacking).toBeGreaterThan(0);
    expect(document.body.textContent).toContain(`本頁有 ${lacking} 筆旅程缺少階段記錄`);
    expect(document.body.textContent).toContain("部分階段記錄尚未取得");
    expect(document.body.textContent).not.toMatch(/\bpartial\b|\bdegraded\b/);
  });
});
