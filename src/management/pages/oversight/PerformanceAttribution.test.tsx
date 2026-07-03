import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { PerformanceAttributionPage } from "./PerformanceAttribution";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

void i18n.changeLanguage("en-US");

function renderPage(initialEntry: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/performance-attribution" element={<PerformanceAttributionPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("PerformanceAttributionPage", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
  });

  it("honors Persona Fleet persona query params and normalizes live PM12 snake_case rows", () => {
    mocks.useV5Live.mockReturnValue({
      data: [
        {
          dimension: "persona",
          dimension_key: "persona-tw-equity",
          label: "TW Equity Persona",
          metrics: {
            total_pnl: 1234,
            pnl_contribution_pct: 0.12,
            risk_contribution_pct: 0.03,
            worst_drawdown: -0.04,
          },
          source_refs: {
            persona_ids: ["persona-tw-equity"],
          },
        },
        {
          dimension: "persona",
          dimension_key: "persona-crypto",
          label: "Crypto Persona",
          metrics: {
            total_pnl: 9876,
            pnl_contribution_pct: 0.34,
            risk_contribution_pct: 0.11,
            worst_drawdown: -0.08,
          },
          source_refs: {
            persona_ids: ["persona-crypto"],
          },
        },
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderPage("/management/performance-attribution?dimension=persona&persona=persona-tw-equity");

    expect(screen.getByText("Focused persona: persona-tw-equity · 1 matching attribution row(s)")).toBeInTheDocument();
    expect(screen.getByText("TW Equity Persona")).toBeInTheDocument();
    expect(screen.queryByText("Crypto Persona")).not.toBeInTheDocument();
    expect(screen.getByText("$1,234")).toBeInTheDocument();
    expect(screen.getByText("12.00%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage →" })).toHaveAttribute(
      "href",
      "/management/personas/persona-tw-equity",
    );
  });

  it("does not fall back to unrelated attribution rows when persona focus misses", () => {
    mocks.useV5Live.mockReturnValue({
      data: [{
        dimension: "persona",
        dimension_key: "persona-crypto",
        label: "Crypto Persona",
        metrics: { total_pnl: 9876 },
        source_refs: { persona_ids: ["persona-crypto"] },
      }],
      loading: false,
      refresh: vi.fn(),
    });

    renderPage("/management/performance-attribution?dimension=persona&persona=persona-tw-equity");

    expect(screen.getByText("No performance attribution row declares persona persona-tw-equity.")).toBeInTheDocument();
    expect(screen.queryByText("Crypto Persona")).not.toBeInTheDocument();
    expect(screen.getByText("No rows.")).toBeInTheDocument();
  });
});
