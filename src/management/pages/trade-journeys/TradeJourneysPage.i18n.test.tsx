// TJ-I18N-SSE-001 — regression guard: this page shipped fully hardcoded in
// English while the console default locale is zh-TW. Renders the list page
// under zh-TW and fails on any reappearing hardcoded English shell copy.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { TradeJourneysPage } from "./TradeJourneysPage";

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
});
