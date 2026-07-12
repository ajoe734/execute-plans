import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("announces degraded, incomplete, stale, and missing-stage truth", async () => {
    const meta = { ...fresh, read_state: "degraded" as const, warnings: ["ledger unavailable"] };
    vi.mocked(api.getTradeJourney).mockResolvedValue({ data: { ...rows[4], read_state: "partial", completeness: { missing_stages: ["ledger_booking"] }, stages: { reconciliation: { status: "mismatch" } }, revision: 3 }, meta });
    vi.mocked(api.getTradeJourneyTimeline).mockResolvedValue({ data: { items: [] }, page_info: { total: 0, page_size: 100 }, meta });
    vi.mocked(api.getTradeJourneyEvidence).mockResolvedValue({ data: {}, meta });
    render(<MemoryRouter initialEntries={["/management/trade-journeys/recon-1"]}><Routes><Route path="/management/trade-journeys/:journeyId" element={<TradeJourneyDetailPage/>}/></Routes></MemoryRouter>);
    expect(await screen.findByRole("status")).toHaveTextContent("degraded data");
    expect(screen.getByRole("status")).toHaveTextContent("ledger unavailable");
    expect(screen.getByText(/Missing ledger_booking/)).toBeInTheDocument();
    expect(screen.getByLabelText("Journey stages")).toBeInTheDocument();
  });
});
