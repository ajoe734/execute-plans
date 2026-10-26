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

const LATEST_PERIOD = {
  requested: "latest",
  applied: "latest",
  windowed: false,
  basis: "latest_runtime_telemetry_snapshot",
  source: "meta" as const,
};

const LATEST_ONLY_PERIOD = {
  requested: "30d",
  applied: "latest",
  windowed: false,
  basis: "latest_runtime_telemetry_snapshot",
  reason: "dated_attribution_source_unavailable",
  message: "No dated per-runtime P&L source; showing the latest telemetry snapshot.",
  source: "meta" as const,
};

function attributionResult(rows: unknown[], period: Record<string, unknown> = LATEST_PERIOD) {
  return { rows, period };
}

function mockAttributionOnly(result: ReturnType<typeof attributionResult>) {
  mocks.useV5Live.mockImplementation((_fn: unknown, _deps: unknown, opts?: { cacheKey?: string }) => {
    if (opts?.cacheKey?.startsWith("oversight.performanceAttribution.")) {
      return { data: result, loading: false, refresh: vi.fn() };
    }
    return { data: undefined, loading: false, refresh: vi.fn() };
  });
}

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
        data: attributionResult([
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
        ]),
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
      })
      .mockReturnValueOnce({
        data: {
          identity: {
            personaId: "persona-tw-equity",
            personaLabel: "TW Equity Persona",
            runtimeIds: ["runtime-tw-paper"],
            paperLedgerIds: [],
            capitalPoolIds: ["pool-tw-paper"],
            sleeveIds: [],
            strategyIds: ["strategy-tw-alpha"],
            artifactIds: [],
            brokerIds: [],
            period: "30d",
            asOf: "2026-06-07T00:00:00Z",
          },
          dataConfidence: "formal",
          performance: { pnl: 1234, pnlPct: 0.12 },
          sources: [{ sourceName: "performance_attribution", sourceStatus: "ok", sourceRowCount: 1 }],
          diagnostics: [],
        },
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
        data: attributionResult([{
          dimension: "persona",
          dimension_key: "persona-crypto",
          label: "Crypto Persona",
          metrics: { total_pnl: 9876 },
          source_refs: { persona_ids: ["persona-crypto"] },
        }]),
        loading: false,
        refresh: vi.fn(),
      })
      .mockReturnValueOnce({ data: [], loading: false, refresh: vi.fn() })
      .mockReturnValueOnce({ data: [], loading: false, refresh: vi.fn() })
      .mockReturnValueOnce({ data: undefined, loading: false, refresh: vi.fn() });

    renderPage("/management/performance-attribution?dimension=persona&persona=persona-tw-equity");

    expect(screen.getByText("No performance attribution row declares persona persona-tw-equity.")).toBeInTheDocument();
    expect(screen.queryByText("Crypto Persona")).not.toBeInTheDocument();
    expect(screen.getByText("No rows.")).toBeInTheDocument();
  });

  it("shows a Persona Fleet summary row when attribution rows miss but fleet has the persona", () => {
    mocks.useV5Live
      .mockReturnValueOnce({
        data: attributionResult([{
          dimension: "persona",
          dimension_key: "persona-crypto",
          label: "Crypto Persona",
          metrics: { total_pnl: 9876 },
          source_refs: { persona_ids: ["persona-crypto"] },
        }]),
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
      .mockReturnValueOnce({ data: [], loading: false, refresh: vi.fn() })
      .mockReturnValueOnce({
        data: {
          identity: {
            personaId: "persona-live-paper-alpha",
            personaLabel: "Paper Alpha",
            runtimeIds: ["runtime-paper-alpha"],
            paperLedgerIds: ["ledger-paper-alpha"],
            capitalPoolIds: ["pool-paper-alpha"],
            sleeveIds: [],
            strategyIds: ["strategy-paper-alpha"],
            artifactIds: [],
            brokerIds: [],
            period: "30d",
            asOf: "2026-06-07T00:00:00Z",
          },
          dataConfidence: "fallback",
          performance: { pnl: 48000, pnlPct: 0.182, drawdownPct: 0.064 },
          sources: [
            { sourceName: "performance_attribution", sourceStatus: "unavailable", sourceRowCount: 0 },
            { sourceName: "portfolio_book_holdings", sourceStatus: "unavailable", sourceRowCount: 0 },
            { sourceName: "persona_fleet", sourceStatus: "ok", sourceRowCount: 1 },
          ],
          diagnostics: [
            { sourceName: "performance_attribution", code: "MISSING_ATTRIBUTION_MATCH", message: "No formal attribution matched." },
            { sourceName: "portfolio_book_holdings", code: "MISSING_HOLDINGS_MATCH", message: "No holdings matched." },
          ],
        },
        loading: false,
        refresh: vi.fn(),
      });

    renderPage("/management/performance-attribution?dimension=persona&persona=persona-live-paper-alpha");

    expect(screen.getByText("Fallback summary")).toBeInTheDocument();
    expect(screen.getByText("persona-live-paper-alpha has an operations summary, but no formal performance attribution.")).toBeInTheDocument();
    expect(screen.getByText("Paper Alpha · operations summary")).toBeInTheDocument();
    expect(screen.getAllByText("$48,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("18.20%").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Manage →" })).toHaveAttribute(
      "href",
      "/management/persona-fleet?persona=persona-live-paper-alpha",
    );
    expect(screen.getByText("Performance source detail")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "operations-read-model" })).toHaveAttribute(
      "href",
      "/management/persona-fleet?persona=persona-live-paper-alpha",
    );
    expect(screen.getAllByText("runtime-paper-alpha").length).toBeGreaterThan(0);
    expect(screen.getAllByText("strategy-paper-alpha").length).toBeGreaterThan(0);
    for (const link of screen.getAllByRole("link", { name: "pool-paper-alpha" })) {
      expect(link).toHaveAttribute("href", "/management/promotion-allocation?tab=quarterly-capital&capital_id=pool-paper-alpha");
    }
    expect(screen.getByText("operations read model summary")).toBeInTheDocument();
    expect(screen.getByText(/MISSING_ATTRIBUTION_MATCH/)).toBeInTheDocument();
    expect(screen.getByText(/MISSING_HOLDINGS_MATCH/)).toBeInTheDocument();
    expect(screen.queryByText("nan")).not.toBeInTheDocument();
  });

  it("defaults to latest and shows no period notice when the URL has no period", () => {
    mockAttributionOnly(attributionResult([]));

    renderPage("/management/performance-attribution");

    expect(screen.getByRole("combobox", { name: "Period" })).toHaveValue("latest");
    expect(mocks.useV5Live).toHaveBeenCalledWith(
      expect.any(Function),
      expect.anything(),
      { cacheKey: "oversight.performanceAttribution.all.latest" },
    );
    expect(screen.queryByTestId("attribution-period-notice")).not.toBeInTheDocument();
    expect(screen.getByTestId("attribution-applied-period")).toHaveTextContent("Applied period: Latest snapshot");
  });

  it("shows the latest-snapshot notice when a non-latest period was not windowed", () => {
    mockAttributionOnly(attributionResult([], LATEST_ONLY_PERIOD));

    renderPage("/management/performance-attribution?period=30d");

    expect(screen.getByTestId("attribution-period-notice")).toHaveTextContent(
      "Showing the latest snapshot: the BFF has no dated data for this period.",
    );
    expect(screen.getByTestId("attribution-applied-period")).toHaveTextContent("Applied period: Latest snapshot");
    expect(screen.queryByText("Applied period: 30 days")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "30 days (latest snapshot only)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Latest snapshot" })).toBeInTheDocument();
  });

  it("shows no period notice when latest is selected", () => {
    mockAttributionOnly(attributionResult([], {
      requested: "latest",
      applied: "latest",
      windowed: false,
      basis: "latest_runtime_telemetry_snapshot",
      source: "meta",
    }));

    renderPage("/management/performance-attribution?period=latest");

    expect(screen.queryByTestId("attribution-period-notice")).not.toBeInTheDocument();
    expect(screen.getByTestId("attribution-applied-period")).toHaveTextContent("Applied period: Latest snapshot");
    expect(screen.getByRole("option", { name: "30 days" })).toBeInTheDocument();
  });

  it("labels a window as applied only when the BFF confirms windowed", () => {
    mockAttributionOnly(attributionResult([], {
      requested: "30d",
      applied: "30d",
      windowed: true,
      source: "meta",
    }));

    renderPage("/management/performance-attribution?period=30d");

    expect(screen.queryByTestId("attribution-period-notice")).not.toBeInTheDocument();
    expect(screen.getByTestId("attribution-applied-period")).toHaveTextContent("Applied period: 30 days");
  });

  it("does not claim a legacy string period as applied", () => {
    mockAttributionOnly(attributionResult([], { applied: "30d", windowed: false, source: "legacy_string" }));

    renderPage("/management/performance-attribution?period=30d");

    expect(screen.getByTestId("attribution-period-notice")).toHaveTextContent(
      "The BFF did not confirm that the 30 days window was applied",
    );
    expect(screen.getByTestId("attribution-applied-period")).toHaveTextContent("Applied period: not confirmed by BFF");
  });
});
