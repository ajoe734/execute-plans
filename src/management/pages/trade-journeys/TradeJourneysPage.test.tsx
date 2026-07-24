import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { TradeJourneyDetailPage, TradeJourneysPage } from "./TradeJourneysPage";
import * as api from "@/lib/bff-v1/tradeJourneys";

vi.mock("@/lib/bff-v1/tradeJourneys", async importOriginal => ({ ...(await importOriginal<typeof api>()), listTradeJourneys: vi.fn(), getTradeJourney: vi.fn(), getTradeJourneyTimeline: vi.fn(), getTradeJourneyEvidence: vi.fn(), resolveTradeJourney: vi.fn() }));

const fresh = { snapshot_at: new Date().toISOString(), read_state: "formal" as const, freshness: { materializer_revision: 7, rebuild_status: "ready", source_watermarks: {} } };
const scenarios = [
  ["happy-1", "completed", "reconciliation", []],
  ["risk-1", "risk_rejected", "risk_evaluation", ["risk_reject"]],
  ["broker-1", "broker_rejected", "broker_acknowledgement", ["broker_reject"]],
  ["partial-1", "partially_filled", "fill_management", ["partial_fill"]],
  ["recon-1", "reconciliation_mismatch", "reconciliation", ["recon_mismatch"]],
] as const;
const rows = scenarios.map(([journey_id, status, current_stage, flags]) => ({ journey_id, status, current_stage, flags: Object.fromEntries(flags.map(flag => [flag, true])), environment: "paper" as const, severity: "warning", symbol: "2330", updated_at: new Date().toISOString() }));

function Location() { return <output data-testid="location">{useLocation().search}</output>; }
function renderList(entry = "/management/trade-journeys?tenant_id=t1") { return render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/management/trade-journeys" element={<><TradeJourneysPage/><Location/></>}/></Routes></MemoryRouter>); }

describe("Trade Journeys workbench", () => {
  // Assertions below use the en-US copy; the page itself is fully i18n-keyed
  // (see TradeJourneysPage.i18n.test.tsx for the zh-TW coverage guard).
  beforeAll(async () => { await i18n.changeLanguage("en-US"); });
  afterAll(async () => { await i18n.changeLanguage("zh-TW"); });
  beforeEach(() => vi.clearAllMocks());

  it("renders happy, risk reject, broker reject, partial fill, and recon mismatch rows", async () => {
    vi.mocked(api.listTradeJourneys).mockResolvedValue({ data: { items: rows }, page_info: { total: 5, page_size: 25 }, meta: fresh });
    renderList();
    for (const [id, status] of scenarios) {
      expect(await screen.findByText(id)).toBeInTheDocument();
      expect(screen.getByText(status)).toBeInTheDocument();
    }
    expect(screen.getByText("Fresh · revision 7")).toBeInTheDocument();
  });

  it("keeps reversible server cursor history in the URL and resets it with filters", async () => {
    vi.mocked(api.listTradeJourneys)
      .mockResolvedValueOnce({ data: { items: rows.slice(0, 1) }, page_info: { total: 2, page_size: 1, next_page_token: "cursor/2" }, meta: fresh })
      .mockResolvedValue({ data: { items: rows.slice(1, 2) }, page_info: { total: 2, page_size: 1 }, meta: fresh });
    renderList();
    fireEvent.click(await screen.findByRole("button", { name: "Next page" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("page_token=cursor%2F2"));
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).not.toContain("page_token"));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.change(screen.getByLabelText("Saved attention view"), { target: { value: "risk_reject" } });
    await waitFor(() => expect(screen.getByTestId("location").textContent).not.toContain("cursor_history"));
  });

  it("forwards persona_id focus from a cross-entry deep link to the BFF query and renders a clearable banner", async () => {
    vi.mocked(api.listTradeJourneys).mockResolvedValue({ data: { items: rows.slice(0, 1) }, page_info: { total: 1, page_size: 25 }, meta: fresh });
    renderList("/management/trade-journeys?tenant_id=t1&persona_id=persona-a");
    await screen.findByText("happy-1");
    expect(api.listTradeJourneys).toHaveBeenCalledWith(
      expect.objectContaining({ persona_id: "persona-a", tenant_id: "t1" }),
      expect.anything(),
    );
    expect(screen.getByText(/Focused: persona persona-a/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Show all journeys" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).not.toContain("persona_id"));
  });

  it("renders a real back-to-origin link and forwards return context into the journey detail row link", async () => {
    vi.mocked(api.listTradeJourneys).mockResolvedValue({ data: { items: rows.slice(0, 1) }, page_info: { total: 1, page_size: 25 }, meta: fresh });
    renderList("/management/trade-journeys?tenant_id=t1&environment=paper&persona_id=persona-a&return_to=%2Fmanagement%2Fpersonas%2Fpersona-a&return_label=Persona%20persona-a");
    const backLink = await screen.findByRole("link", { name: /Back to Persona persona-a/ });
    expect(backLink).toHaveAttribute("href", "/management/personas/persona-a");
    const rowLink = screen.getByRole("link", { name: "happy-1" });
    expect(rowLink).toHaveAttribute(
      "href",
      "/management/trade-journeys/happy-1?tenant_id=t1&environment=paper&return_to=%2Fmanagement%2Fpersonas%2Fpersona-a&return_label=Persona+persona-a",
    );
  });

  it("announces degraded, incomplete, stale, and missing-stage truth", async () => {
    const meta = { ...fresh, read_state: "degraded" as const, warnings: ["ledger unavailable"] };
    vi.mocked(api.getTradeJourney).mockResolvedValue({ data: { ...rows[4], read_state: "partial", completeness: { missing_stages: ["ledger_booking"] }, stages: { reconciliation: { status: "mismatch" } }, revision: 3 }, meta });
    vi.mocked(api.getTradeJourneyTimeline).mockResolvedValue({ data: { items: [] }, page_info: { total: 0, page_size: 100 }, meta });
    vi.mocked(api.getTradeJourneyEvidence).mockResolvedValue({ data: {}, meta });
    render(<MemoryRouter initialEntries={["/management/trade-journeys/recon-1"]}><Routes><Route path="/management/trade-journeys/:journeyId" element={<TradeJourneyDetailPage/>}/></Routes></MemoryRouter>);
    expect(await screen.findByRole("status")).toHaveTextContent("degraded data");
    expect(screen.getByRole("status")).toHaveTextContent("ledger unavailable");
    expect(screen.getByText(/Missing Ledger booking/)).toBeInTheDocument();
    expect(screen.getByLabelText("Journey stages")).toBeInTheDocument();
    expect(screen.getByLabelText("Evidence")).toHaveAttribute("tabindex", "0");
  });

  it("offers a real back-to-origin link on the journey detail page when it arrived via a cross-entry return_to", async () => {
    vi.mocked(api.getTradeJourney).mockResolvedValue({ data: rows[0], meta: fresh });
    vi.mocked(api.getTradeJourneyTimeline).mockResolvedValue({ data: { items: [] }, page_info: { total: 0, page_size: 100 }, meta: fresh });
    vi.mocked(api.getTradeJourneyEvidence).mockResolvedValue({ data: {}, meta: fresh });
    render(
      <MemoryRouter initialEntries={["/management/trade-journeys/happy-1?tenant_id=t1&environment=paper&return_to=%2Fmanagement%2Fstrategies%2Fstrat-1&return_label=Strategy%20strat-1"]}>
        <Routes><Route path="/management/trade-journeys/:journeyId" element={<TradeJourneyDetailPage/>}/></Routes>
      </MemoryRouter>,
    );
    await screen.findByText("happy-1");
    const backLink = screen.getByRole("link", { name: /Back to Strategy strat-1/ });
    expect(backLink).toHaveAttribute("href", "/management/strategies/strat-1");
    expect(screen.getByRole("link", { name: "All journeys" })).toHaveAttribute("href", "/management/trade-journeys?tenant_id=t1&environment=paper&return_to=%2Fmanagement%2Fstrategies%2Fstrat-1&return_label=Strategy+strat-1");
  });
});
