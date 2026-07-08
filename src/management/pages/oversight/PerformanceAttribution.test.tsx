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
    mocks.useV5Live
      .mockReturnValueOnce({
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
      })
      .mockReturnValueOnce({
        data: [{
          personaId: "persona-tw-equity",
          personaName: "TW Equity Persona",
          owner: "pantheon-dev-browser",
          ooda: "Act",
          autonomy: "supervised",
          perfDelta: 0.12,
          humanNeeded: false,
          lastMutation: "2026-06-03",
          runtimeId: "runtime-tw-paper",
          capitalPoolId: "pool-tw-paper",
        }],
        loading: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [{
          holdingId: "holding-2330",
          personaId: "persona-tw-equity",
          runtimeId: "runtime-tw-paper",
          capitalPoolId: "pool-tw-paper",
          strategyId: "strategy-tw-alpha",
          symbol: "2330.TW",
          side: "long",
          unrealizedPnl: 1200,
          realizedPnl: 34,
          pnlPct: 0.056,
          opened_at: "2026-06-01T00:00:00Z",
          last_mark_at: "2026-06-07T00:00:00Z",
        }],
        loading: false,
        refresh: vi.fn(),
      });

    renderPage("/management/performance-attribution?dimension=persona&persona=persona-tw-equity");

    expect(screen.getByText("Focused persona: persona-tw-equity · 1 matching attribution row(s)")).toBeInTheDocument();
    expect(screen.getByText("TW Equity Persona")).toBeInTheDocument();
    expect(screen.queryByText("Crypto Persona")).not.toBeInTheDocument();
    expect(screen.getAllByText("$1,234").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12.00%").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Manage →" })).toHaveAttribute(
      "href",
      "/management/personas/persona-tw-equity",
    );
    expect(screen.getByText("Performance source detail")).toBeInTheDocument();
    expect(screen.getByText("performance-attribution")).toBeInTheDocument();
    expect(screen.getByText("portfolio-book.holdings")).toBeInTheDocument();
    expect(screen.getByText("2330.TW")).toBeInTheDocument();
    expect(screen.getByText("2026-06-01T00:00:00Z to 2026-06-07T00:00:00Z")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "pool-tw-paper" })) {
      expect(link).toHaveAttribute("href", "/management/promotion-allocation?tab=quarterly-capital&capital_id=pool-tw-paper");
    }
  });

  it("does not fall back to unrelated attribution rows when persona focus misses", () => {
    mocks.useV5Live
      .mockReturnValueOnce({
        data: [{
          dimension: "persona",
          dimension_key: "persona-crypto",
          label: "Crypto Persona",
          metrics: { total_pnl: 9876 },
          source_refs: { persona_ids: ["persona-crypto"] },
        }],
        loading: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({ data: [], loading: false, refresh: vi.fn() })
      .mockReturnValueOnce({ data: [], loading: false, refresh: vi.fn() });

    renderPage("/management/performance-attribution?dimension=persona&persona=persona-tw-equity");

    expect(screen.getByText("No performance attribution row declares persona persona-tw-equity.")).toBeInTheDocument();
    expect(screen.queryByText("Crypto Persona")).not.toBeInTheDocument();
    expect(screen.getByText("No rows.")).toBeInTheDocument();
  });

  it("shows a Persona Fleet summary row when attribution rows miss but fleet has the persona", () => {
    mocks.useV5Live
      .mockReturnValueOnce({
        data: [{
          dimension: "persona",
          dimension_key: "persona-crypto",
          label: "Crypto Persona",
          metrics: { total_pnl: 9876 },
          source_refs: { persona_ids: ["persona-crypto"] },
        }],
        loading: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [{
          personaId: "persona-live-paper-alpha",
          personaName: "Paper Alpha",
          owner: "pantheon-dev-browser",
          ooda: "Act",
          autonomy: "supervised",
          perfDelta: 0.182,
          humanNeeded: true,
          lastMutation: "2026-06-03",
          runtimeId: "runtime-paper-alpha",
          capitalPoolId: "pool-paper-alpha",
          researchStatus: {
            stage: "act",
            frameworks: [],
            strategyId: "strategy-paper-alpha",
            pendingTaskIds: [],
            canDeploy: true,
          },
          performanceSummary: {
            pnl: 48000,
            maxDrawdown: 0.064,
          },
        }],
        loading: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({ data: [], loading: false, refresh: vi.fn() });

    renderPage("/management/performance-attribution?dimension=persona&persona=persona-live-paper-alpha");

    expect(screen.getByText("Focused persona: persona-live-paper-alpha · 1 matching attribution row(s)")).toBeInTheDocument();
    expect(screen.getByText("Paper Alpha · Persona Fleet summary")).toBeInTheDocument();
    expect(screen.getAllByText("$48,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("18.20%").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Manage →" })).toHaveAttribute(
      "href",
      "/management/persona-fleet?persona=persona-live-paper-alpha",
    );
    expect(screen.getByText("Performance source detail")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "persona-fleet.performanceSummary" })).toHaveAttribute(
      "href",
      "/management/persona-fleet?persona=persona-live-paper-alpha",
    );
    expect(screen.getAllByText("runtime-paper-alpha").length).toBeGreaterThan(0);
    expect(screen.getAllByText("strategy-paper-alpha").length).toBeGreaterThan(0);
    for (const link of screen.getAllByRole("link", { name: "pool-paper-alpha" })) {
      expect(link).toHaveAttribute("href", "/management/promotion-allocation?tab=quarterly-capital&capital_id=pool-paper-alpha");
    }
    expect(screen.getByText("pnl=performanceSummary.pnl; pnlPct=perfDelta; drawdown=performanceSummary.maxDrawdown")).toBeInTheDocument();
    expect(screen.getByText("no matching holding row declares this persona/runtime/capital pool")).toBeInTheDocument();
    expect(screen.getAllByText("nan").length).toBeGreaterThan(0);
  });
});
