import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { mgmt } from "@/lib/bff-v1";
import {
  BFF_ACCEPTED_ATTRIBUTION_DIMENSIONS,
  normalizePerformanceAttributionRow,
  SUPPORTED_ATTRIBUTION_DIMENSIONS,
  UNSUPPORTED_ATTRIBUTION_DIMENSIONS,
  type PerformanceAttributionResult,
} from "@/lib/v5/management/performanceAttribution";
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
    expect(screen.getByRole("link", { name: "portfolio-book.holdings" })).toHaveAttribute(
      "href",
      "/management/performance?tab=overview",
    );
    expect(screen.getByText("2330.TW")).toBeInTheDocument();
    expect(screen.getByText("2026-06-01T00:00:00Z to 2026-06-07T00:00:00Z")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "pool-tw-paper" })) {
      expect(link).toHaveAttribute("href", "/management/governance-decisions?tab=capital&capital_id=pool-tw-paper");
    }
    expect(screen.getByRole("link", { name: "Show all persona attribution" })).toHaveAttribute(
      "href",
      "/management/performance?tab=attribution&dimension=persona&period=latest",
    );
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
      expect(link).toHaveAttribute("href", "/management/governance-decisions?tab=capital&capital_id=pool-paper-alpha");
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

  it("renders Capital pool, Symbol, and Market regime labels for real BFF pool, asset, and regime rows instead of Persona", async () => {
    const hostedPoolRow = {
      id: "attribution:pool:pool-hosted-all12:latest",
      dimension: "pool",
      dimension_key: "pool-hosted-all12",
      label: "persona-strat-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8 paper pool",
      period: "latest",
      data_confidence: "formal",
      source_status: "available",
      rank: 1,
      metrics: {
        total_pnl: 15420,
        realized_pnl: 8200,
        unrealized_pnl: 7220,
        pnl_contribution_pct: 0.24,
        notional_weight: 0.35,
        worst_drawdown: 0.04,
        sharpe: 1.42,
        win_rate: 0.61,
        violation_count: 0,
        fill_count: 14,
      },
      total_pnl: 15420,
      pnl_contribution_pct: 0.24,
      notional_weight: 0.35,
      runtime_count: 1,
      holding_count: 2,
      source_refs: {
        runtime_ids: ["runtime-hosted-all12"],
        capital_pool_ids: ["pool-hosted-all12"],
        persona_ids: ["persona-strat-hosted-all12"],
        strategy_ids: ["strat-hosted-all12"],
      },
      links: {
        runtime: "/bff/runtimes/runtime-hosted-all12",
        capital_pool: "/bff/capital-pools/pool-hosted-all12",
        persona: "/bff/personas/persona-strat-hosted-all12",
        strategy: "/bff/strategies/strat-hosted-all12",
      },
    };
    const hostedAssetRow = {
      id: "attribution:asset:2330.TW:latest",
      dimension: "asset",
      dimension_key: "2330.TW",
      label: "2330.TW",
      period: "latest",
      data_confidence: "formal",
      source_status: "available",
      rank: 1,
      metrics: {
        total_pnl: 8910,
        realized_pnl: 3100,
        unrealized_pnl: 5810,
        pnl_contribution_pct: 0.14,
        notional_weight: 0.22,
        worst_drawdown: 0.02,
        sharpe: 1.18,
        win_rate: 0.58,
        violation_count: 0,
        fill_count: 6,
      },
      total_pnl: 8910,
      pnl_contribution_pct: 0.14,
      notional_weight: 0.22,
      runtime_count: 1,
      holding_count: 1,
      source_refs: {
        runtime_ids: ["runtime-hosted-all12"],
        capital_pool_ids: ["pool-hosted-all12"],
        persona_ids: ["persona-strat-hosted-all12"],
        strategy_ids: ["strat-hosted-all12"],
      },
      links: {
        runtime: "/bff/runtimes/runtime-hosted-all12",
        capital_pool: "/bff/capital-pools/pool-hosted-all12",
        persona: "/bff/personas/persona-strat-hosted-all12",
        strategy: "/bff/strategies/strat-hosted-all12",
      },
    };
    const hostedRegimeRow = {
      id: "attribution:regime:unknown:latest",
      dimension: "regime",
      dimension_key: "unknown",
      label: "unknown",
      period: "latest",
      data_confidence: "formal",
      source_status: "available",
      rank: 1,
      metrics: {
        total_pnl: 64200,
        realized_pnl: 24000,
        unrealized_pnl: 40200,
        pnl_contribution_pct: 1.0,
        notional_weight: 1.0,
        worst_drawdown: 0.06,
        sharpe: 1.35,
        win_rate: 0.6,
        violation_count: 0,
        fill_count: 42,
      },
      total_pnl: 64200,
      pnl_contribution_pct: 1.0,
      notional_weight: 1.0,
      runtime_count: 11,
      holding_count: 4,
      source_refs: {
        runtime_ids: ["runtime-hosted-all12"],
        capital_pool_ids: ["pool-hosted-all12"],
        persona_ids: ["persona-strat-hosted-all12"],
        strategy_ids: ["strat-hosted-all12"],
      },
      links: {
        runtime: "/bff/runtimes/runtime-hosted-all12",
        capital_pool: "/bff/capital-pools/pool-hosted-all12",
        persona: "/bff/personas/persona-strat-hosted-all12",
        strategy: "/bff/strategies/strat-hosted-all12",
      },
    };

    mockAttributionOnly(attributionResult([hostedPoolRow, hostedAssetRow, hostedRegimeRow]));

    const { unmount } = renderPage("/management/performance-attribution?period=latest");

    const table = screen.getByRole("table");
    const poolCell = within(table).getByText(
      "persona-strat-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8 paper pool",
    );
    const poolTr = poolCell.closest("tr")!;
    expect(within(poolTr).getByText("Capital pool")).toBeInTheDocument();
    expect(within(poolTr).queryByText("Persona")).not.toBeInTheDocument();

    const assetCell = within(table).getByText("2330.TW");
    const assetTr = assetCell.closest("tr")!;
    expect(within(assetTr).getByText("Symbol")).toBeInTheDocument();
    expect(within(assetTr).queryByText("Persona")).not.toBeInTheDocument();

    const regimeCell = within(table).getByText("unknown");
    const regimeTr = regimeCell.closest("tr")!;
    expect(within(regimeTr).getByText("Market regime")).toBeInTheDocument();
    expect(within(regimeTr).queryByText("Persona")).not.toBeInTheDocument();

    unmount();

    await i18n.changeLanguage("zh-TW");
    try {
      renderPage("/management/performance-attribution?period=latest");
      const zhTable = screen.getByRole("table");
      expect(within(zhTable).getByText("資金池")).toBeInTheDocument();
      expect(within(zhTable).getByText("代號")).toBeInTheDocument();
      expect(within(zhTable).getByText("市場 regime")).toBeInTheDocument();
      expect(within(zhTable).queryByText("Persona")).not.toBeInTheDocument();
    } finally {
      await i18n.changeLanguage("en-US");
    }
  });

  it("preserves exact dimension counts across the 50-row hosted payload (persona 11, strategy 11, pool 11, asset 4, broker 1, runtime 11, regime 1)", () => {
    const makeHostedRow = (dimension: string, index: number, keyOverride?: string, labelOverride?: string) => ({
      id: `attribution:${dimension}:${keyOverride ?? `${dimension}-${index}`}:latest`,
      dimension,
      dimension_key: keyOverride ?? `${dimension}-${index}`,
      label: labelOverride ?? `${dimension}-label-${index}`,
      period: "latest",
      data_confidence: "formal",
      source_status: "available",
      rank: index + 1,
      metrics: {
        total_pnl: 1000 - index * 10,
        pnl_contribution_pct: 0.02,
        notional_weight: 0.02,
        worst_drawdown: 0.01,
      },
      total_pnl: 1000 - index * 10,
      pnl_contribution_pct: 0.02,
      notional_weight: 0.02,
      runtime_count: 1,
      holding_count: 1,
      source_refs: {
        runtime_ids: [`runtime-${index}`],
        capital_pool_ids: [`pool-${index}`],
        persona_ids: [`persona-${index}`],
        strategy_ids: [`strategy-${index}`],
      },
      links: {
        runtime: `/bff/runtimes/runtime-${index}`,
        capital_pool: `/bff/capital-pools/pool-${index}`,
        persona: `/bff/personas/persona-${index}`,
        strategy: `/bff/strategies/strategy-${index}`,
      },
    });

    const rows = [
      ...Array.from({ length: 11 }, (_, i) => makeHostedRow("persona", i)),
      ...Array.from({ length: 11 }, (_, i) => makeHostedRow("strategy", i)),
      ...Array.from({ length: 11 }, (_, i) =>
        makeHostedRow(
          "pool",
          i,
          `pool-${i}`,
          i === 0 ? "persona-strat-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8 paper pool" : `pool-label-${i}`,
        ),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeHostedRow("asset", i, i === 0 ? "2330.TW" : `asset-${i}`, i === 0 ? "2330.TW" : `asset-${i}`),
      ),
      makeHostedRow("broker", 0, "paper", "paper"),
      ...Array.from({ length: 11 }, (_, i) => makeHostedRow("runtime", i)),
      makeHostedRow("regime", 0, "unknown", "unknown"),
    ];
    expect(rows).toHaveLength(50);

    mockAttributionOnly(attributionResult(rows));
    renderPage("/management/performance-attribution?period=latest");

    const table = screen.getByRole("table");
    expect(within(table).getAllByText("Persona")).toHaveLength(11);
    expect(within(table).getAllByText("Strategy")).toHaveLength(11);
    expect(within(table).getAllByText("Capital pool")).toHaveLength(11);
    expect(within(table).getAllByText("Symbol")).toHaveLength(4);
    expect(within(table).getAllByText("Broker")).toHaveLength(1);
    expect(within(table).getAllByText("Runtime")).toHaveLength(11);
    expect(within(table).getAllByText("Market regime")).toHaveLength(1);
  });

  it("keeps unknown BFF dimensions as their raw dimension label with no persona link", () => {
    const unknownRow = {
      id: "attribution:custom_desk_bucket:desk-tw-1:latest",
      dimension: "custom_desk_bucket",
      dimension_key: "desk-tw-1",
      label: "Desk TW Bucket 1",
      period: "latest",
      data_confidence: "formal",
      source_status: "available",
      rank: 1,
      metrics: {
        total_pnl: 4200,
        pnl_contribution_pct: 0.08,
        notional_weight: 0.1,
        worst_drawdown: 0.01,
      },
      total_pnl: 4200,
      pnl_contribution_pct: 0.08,
      notional_weight: 0.1,
      runtime_count: 1,
      holding_count: 1,
      source_refs: {
        runtime_ids: ["runtime-1"],
        capital_pool_ids: ["pool-1"],
        persona_ids: ["persona-1"],
        strategy_ids: ["strategy-1"],
      },
      links: {
        runtime: "/bff/runtimes/runtime-1",
        capital_pool: "/bff/capital-pools/pool-1",
        persona: "/bff/personas/persona-1",
        strategy: "/bff/strategies/strategy-1",
      },
    };

    mockAttributionOnly(attributionResult([unknownRow]));
    renderPage("/management/performance-attribution?period=latest");

    const table = screen.getByRole("table");
    const rowEl = within(table).getByText("Desk TW Bucket 1").closest("tr")!;
    expect(within(rowEl).getByText("custom_desk_bucket")).toBeInTheDocument();
    expect(within(rowEl).queryByText("Persona")).not.toBeInTheDocument();

    const manageLink = within(rowEl).getByRole("link", { name: "Manage →" });
    expect(manageLink).toHaveAttribute("href", "/management/evidence");
    expect(manageLink.getAttribute("href")).not.toContain("/management/personas/");
  });

  it("routes Manage links by normalized dimension and honors explicit BFF links when present", () => {
    const rows = [
      {
        id: "attribution:pool:pool-hosted-all12:latest",
        dimension: "pool",
        dimension_key: "pool-hosted-all12",
        label: "persona-strat-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8 paper pool",
        period: "latest",
        data_confidence: "formal",
        source_status: "available",
        rank: 1,
        metrics: { total_pnl: 15420, pnl_contribution_pct: 0.24, worst_drawdown: 0.04 },
        total_pnl: 15420,
        pnl_contribution_pct: 0.24,
        notional_weight: 0.35,
        runtime_count: 1,
        holding_count: 2,
        source_refs: {
          runtime_ids: ["runtime-hosted-all12"],
          capital_pool_ids: ["pool-hosted-all12"],
          persona_ids: ["persona-strat-hosted-all12"],
          strategy_ids: ["strat-hosted-all12"],
        },
        links: {
          runtime: "/bff/runtimes/runtime-hosted-all12",
          capital_pool: "/bff/capital-pools/pool-hosted-all12",
          persona: "/bff/personas/persona-strat-hosted-all12",
          strategy: "/bff/strategies/strat-hosted-all12",
        },
      },
      {
        id: "attribution:asset:2330.TW:latest",
        dimension: "asset",
        dimension_key: "2330.TW",
        label: "2330.TW",
        period: "latest",
        data_confidence: "formal",
        source_status: "available",
        rank: 1,
        metrics: { total_pnl: 8910, pnl_contribution_pct: 0.14, worst_drawdown: 0.02 },
        total_pnl: 8910,
        pnl_contribution_pct: 0.14,
        notional_weight: 0.22,
        runtime_count: 1,
        holding_count: 1,
        source_refs: {
          runtime_ids: ["runtime-hosted-all12"],
          capital_pool_ids: ["pool-hosted-all12"],
          persona_ids: ["persona-strat-hosted-all12"],
          strategy_ids: ["strat-hosted-all12"],
        },
        links: {
          runtime: "/bff/runtimes/runtime-hosted-all12",
          capital_pool: "/bff/capital-pools/pool-hosted-all12",
          persona: "/bff/personas/persona-strat-hosted-all12",
          strategy: "/bff/strategies/strat-hosted-all12",
        },
      },
      {
        id: "attribution:pool:pool-custom-link:latest",
        dimension: "pool",
        dimension_key: "pool-custom-link",
        label: "Custom Linked Pool",
        period: "latest",
        data_confidence: "formal",
        source_status: "available",
        rank: 2,
        metrics: { total_pnl: 5100, pnl_contribution_pct: 0.09, worst_drawdown: 0.01 },
        total_pnl: 5100,
        pnl_contribution_pct: 0.09,
        notional_weight: 0.15,
        runtime_count: 1,
        holding_count: 1,
        source_refs: {
          runtime_ids: ["runtime-hosted-all12"],
          capital_pool_ids: ["pool-custom-link"],
          persona_ids: ["persona-strat-hosted-all12"],
          strategy_ids: ["strat-hosted-all12"],
        },
        links: {
          manage_href: "/management/capital/pool-custom-link",
        },
      },
    ];

    mockAttributionOnly(attributionResult(rows));
    renderPage("/management/performance-attribution?period=latest");

    const table = screen.getByRole("table");
    const poolRow = within(table)
      .getByText("persona-strat-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8 paper pool")
      .closest("tr")!;
    expect(within(poolRow).getByRole("link", { name: "Manage →" })).toHaveAttribute(
      "href",
      "/management/governance-decisions?tab=capital&capital_id=pool-hosted-all12",
    );

    const assetRow = within(table).getByText("2330.TW").closest("tr")!;
    const assetLink = within(assetRow).getByRole("link", { name: "Manage →" });
    expect(assetLink).toHaveAttribute("href", "/management/evidence");
    expect(assetLink.getAttribute("href")).not.toContain("/management/personas/");

    const customPoolRow = within(table).getByText("Custom Linked Pool").closest("tr")!;
    expect(within(customPoolRow).getByRole("link", { name: "Manage →" })).toHaveAttribute(
      "href",
      "/management/capital/pool-custom-link",
    );
  });

  it("counts only true persona rows in the persona-focused view and totals even when pool, asset, and regime rows share source_refs.persona_ids", () => {
    const sharedSourceRefs = {
      runtime_ids: ["runtime-hosted-all12"],
      capital_pool_ids: ["pool-hosted-all12"],
      persona_ids: ["persona-strat-hosted-all12"],
      strategy_ids: ["strat-hosted-all12"],
    };
    const rows = [
      {
        id: "attribution:persona:persona-strat-hosted-all12:latest",
        dimension: "persona",
        dimension_key: "persona-strat-hosted-all12",
        label: "Hosted Persona All12",
        period: "latest",
        data_confidence: "formal",
        source_status: "available",
        rank: 1,
        metrics: { total_pnl: 15420, pnl_contribution_pct: 0.24, worst_drawdown: 0.04 },
        total_pnl: 15420,
        pnl_contribution_pct: 0.24,
        notional_weight: 0.35,
        runtime_count: 1,
        holding_count: 2,
        source_refs: sharedSourceRefs,
        links: {},
      },
      {
        id: "attribution:pool:pool-hosted-all12:latest",
        dimension: "pool",
        dimension_key: "pool-hosted-all12",
        label: "persona-strat-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8 paper pool",
        period: "latest",
        data_confidence: "formal",
        source_status: "available",
        rank: 1,
        metrics: { total_pnl: 15420, pnl_contribution_pct: 0.24, worst_drawdown: 0.04 },
        total_pnl: 15420,
        pnl_contribution_pct: 0.24,
        notional_weight: 0.35,
        runtime_count: 1,
        holding_count: 2,
        source_refs: sharedSourceRefs,
        links: {},
      },
      {
        id: "attribution:asset:2330.TW:latest",
        dimension: "asset",
        dimension_key: "2330.TW",
        label: "2330.TW",
        period: "latest",
        data_confidence: "formal",
        source_status: "available",
        rank: 1,
        metrics: { total_pnl: 8910, pnl_contribution_pct: 0.14, worst_drawdown: 0.02 },
        total_pnl: 8910,
        pnl_contribution_pct: 0.14,
        notional_weight: 0.22,
        runtime_count: 1,
        holding_count: 1,
        source_refs: sharedSourceRefs,
        links: {},
      },
      {
        id: "attribution:regime:unknown:latest",
        dimension: "regime",
        dimension_key: "unknown",
        label: "unknown",
        period: "latest",
        data_confidence: "formal",
        source_status: "available",
        rank: 1,
        metrics: { total_pnl: 64200, pnl_contribution_pct: 1.0, worst_drawdown: 0.06 },
        total_pnl: 64200,
        pnl_contribution_pct: 1.0,
        notional_weight: 1.0,
        runtime_count: 11,
        holding_count: 4,
        source_refs: sharedSourceRefs,
        links: {},
      },
      {
        id: "attribution:custom_unknown:custom-1:latest",
        dimension: "custom_unknown",
        dimension_key: "custom-1",
        label: "Custom Unknown Row",
        period: "latest",
        data_confidence: "formal",
        source_status: "available",
        rank: 1,
        metrics: { total_pnl: 1000, pnl_contribution_pct: 0.01, worst_drawdown: 0.01 },
        total_pnl: 1000,
        pnl_contribution_pct: 0.01,
        notional_weight: 0.01,
        runtime_count: 1,
        holding_count: 1,
        source_refs: sharedSourceRefs,
        links: {},
      },
    ];

    mockAttributionOnly(attributionResult(rows));
    renderPage("/management/performance-attribution?persona=persona-strat-hosted-all12");

    expect(
      screen.getByText("Focused persona: persona-strat-hosted-all12 · 1 matching attribution row(s)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Hosted Persona All12")).toBeInTheDocument();
    expect(
      screen.queryByText("persona-strat-hosted-all12-h12-01a11-20261023-9aeb-src-e018ff6d0eb8 paper pool"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("2330.TW")).not.toBeInTheDocument();
    expect(screen.queryByText("Custom Unknown Row")).not.toBeInTheDocument();
  });

  it("offers only BFF-accepted dimensions in the filter and shows an unsupported notice instead of a transport error for unsupported dimensions", () => {
    const bffAcceptedFromTask = new Set([
      "persona",
      "personas",
      "strategy",
      "strategies",
      "capital_pool",
      "capital_pools",
      "capitalpool",
      "capitalpools",
      "pool",
      "pools",
      "asset",
      "assets",
      "instrument",
      "instruments",
      "symbol",
      "symbols",
      "broker",
      "brokers",
      "runtime",
      "runtimes",
      "regime",
      "regimes",
      "market_regime",
    ]);

    expect(new Set(BFF_ACCEPTED_ATTRIBUTION_DIMENSIONS)).toEqual(bffAcceptedFromTask);
    for (const offered of SUPPORTED_ATTRIBUTION_DIMENSIONS) {
      expect(bffAcceptedFromTask.has(offered)).toBe(true);
    }
    for (const unsupported of UNSUPPORTED_ATTRIBUTION_DIMENSIONS) {
      expect(bffAcceptedFromTask.has(unsupported)).toBe(false);
    }

    mockAttributionOnly(attributionResult([]));
    const { unmount } = renderPage("/management/performance-attribution");

    const dimensionSelect = screen.getByRole("combobox", { name: "Dimension" });
    const optionValues = within(dimensionSelect)
      .getAllByRole("option")
      .map((opt) => (opt as HTMLOptionElement).value);

    expect(optionValues).toEqual(["all", ...SUPPORTED_ATTRIBUTION_DIMENSIONS]);
    for (const offered of optionValues.filter((v) => v !== "all")) {
      expect(bffAcceptedFromTask.has(offered)).toBe(true);
    }
    for (const removed of ["asset_class", "sector", "region", "research_backend", "quarter"]) {
      expect(optionValues).not.toContain(removed);
    }

    unmount();

    renderPage("/management/performance-attribution?dimension=asset_class");
    expect(screen.getByTestId("attribution-unsupported-dimension")).toHaveTextContent(
      'Dimension "asset_class" is not supported by the BFF; choose persona, strategy, capital pool, symbol, broker, runtime, or market regime.',
    );
    expect(mocks.useV5Live).toHaveBeenCalledWith(
      expect.any(Function),
      expect.anything(),
      { cacheKey: "oversight.performanceAttribution.unsupported.asset_class.latest" },
    );
  });

  describe("loading, error, and filter-transition states with real BFF row", () => {
    const REAL_HOSTED_PERSONA_ROW = {
      id: "pm12-performance-attribution-persona-persona-be19a1fac471247f2b2a",
      dimension: "persona",
      dimension_key: "persona-be19a1fac471247f2b2a",
      label: "青禾｜2330 台股 Paper 學習 R2",
      period: "latest",
      data_confidence: "formal",
      source_status: "ok",
      rank: 1,
    };

    async function enableRealUseV5Live() {
      const actual = await vi.importActual<typeof import("@/management/pages/v5/useV5Live")>(
        "@/management/pages/v5/useV5Live",
      );
      actual.__resetV5LiveCacheForTests();
      mocks.useV5Live.mockImplementation(actual.useV5Live);
      vi.spyOn(mgmt.personaFleet, "get").mockResolvedValue([]);
      vi.spyOn(mgmt.portfolioBook, "holdingsLiveOnly").mockResolvedValue([]);
      vi.spyOn(mgmt.operationsReadModel, "getLiveOnly").mockResolvedValue(undefined);
      return actual;
    }

    it("while the first attribution read is in flight the table shows the existing loading text and never the no rows text", async () => {
      const actual = await enableRealUseV5Live();
      let resolvePending!: (value: PerformanceAttributionResult) => void;
      const getLiveOnlySpy = vi
        .spyOn(mgmt.performanceAttribution, "getLiveOnly")
        .mockImplementation(
          () =>
            new Promise<PerformanceAttributionResult>((resolve) => {
              resolvePending = resolve;
            }),
        );

      try {
        const { unmount } = renderPage("/management/performance-attribution?period=latest");

        expect(getLiveOnlySpy).toHaveBeenCalledWith(undefined, "latest", expect.any(Object));
        const table = screen.getByRole("table");
        expect(within(table).getByText("Loading…")).toBeInTheDocument();
        expect(within(table).queryByText("No rows.")).not.toBeInTheDocument();
        expect(within(table).queryByText("Backend temporarily unavailable")).not.toBeInTheDocument();

        unmount();
        actual.__resetV5LiveCacheForTests();

        await act(async () => {
          await i18n.changeLanguage("zh-TW");
        });
        renderPage("/management/performance-attribution?period=latest");
        const zhTable = screen.getByRole("table");
        expect(within(zhTable).getByText("載入中…")).toBeInTheDocument();
        expect(within(zhTable).queryByText("無資料。")).not.toBeInTheDocument();
        expect(within(zhTable).queryByText("後端暫時無法使用")).not.toBeInTheDocument();

        await act(async () => {
          resolvePending({
            rows: [normalizePerformanceAttributionRow(REAL_HOSTED_PERSONA_ROW)],
            period: LATEST_PERIOD,
          });
        });

        await waitFor(() => {
          expect(within(zhTable).getByText("青禾｜2330 台股 Paper 學習 R2")).toBeInTheDocument();
        });
        expect(within(zhTable).queryByText("載入中…")).not.toBeInTheDocument();
        expect(within(zhTable).queryByText("無資料。")).not.toBeInTheDocument();
      } finally {
        await act(async () => {
          await i18n.changeLanguage("en-US");
        });
        actual.__resetV5LiveCacheForTests();
        vi.restoreAllMocks();
      }
    });

    it("a failed attribution read shows an unavailable message and not the no rows text", async () => {
      const actual = await enableRealUseV5Live();
      const getLiveOnlySpy = vi
        .spyOn(mgmt.performanceAttribution, "getLiveOnly")
        .mockRejectedValue(new Error("BACKEND_UNAVAILABLE"));

      try {
        const { unmount } = renderPage("/management/performance-attribution?period=latest");

        expect(getLiveOnlySpy).toHaveBeenCalledWith(undefined, "latest", expect.any(Object));
        const table = screen.getByRole("table");
        await waitFor(() => {
          expect(within(table).getByText("Backend temporarily unavailable")).toBeInTheDocument();
        });
        expect(within(table).queryByText("No rows.")).not.toBeInTheDocument();
        expect(within(table).queryByText("Loading…")).not.toBeInTheDocument();

        unmount();
        actual.__resetV5LiveCacheForTests();

        await act(async () => {
          await i18n.changeLanguage("zh-TW");
        });
        renderPage("/management/performance-attribution?period=latest");
        const zhTable = screen.getByRole("table");
        await waitFor(() => {
          expect(within(zhTable).getByText("後端暫時無法使用")).toBeInTheDocument();
        });
        expect(within(zhTable).queryByText("無資料。")).not.toBeInTheDocument();
        expect(within(zhTable).queryByText("載入中…")).not.toBeInTheDocument();
      } finally {
        await act(async () => {
          await i18n.changeLanguage("en-US");
        });
        actual.__resetV5LiveCacheForTests();
        vi.restoreAllMocks();
      }
    });

    it("only a successful read with zero rows shows the no rows text while a read with rows renders them unchanged", async () => {
      const actual = await enableRealUseV5Live();
      const getLiveOnlySpy = vi
        .spyOn(mgmt.performanceAttribution, "getLiveOnly")
        .mockResolvedValueOnce({ rows: [], period: LATEST_PERIOD })
        .mockResolvedValueOnce({
          rows: [normalizePerformanceAttributionRow(REAL_HOSTED_PERSONA_ROW)],
          period: LATEST_PERIOD,
        });

      try {
        const { unmount } = renderPage("/management/performance-attribution?period=latest");
        const emptyTable = screen.getByRole("table");
        await waitFor(() => {
          expect(within(emptyTable).getByText("No rows.")).toBeInTheDocument();
        });
        expect(within(emptyTable).queryByText("Loading…")).not.toBeInTheDocument();
        expect(within(emptyTable).queryByText("Backend temporarily unavailable")).not.toBeInTheDocument();

        unmount();
        actual.__resetV5LiveCacheForTests();

        renderPage("/management/performance-attribution?period=latest");
        const populatedTable = screen.getByRole("table");
        await waitFor(() => {
          expect(within(populatedTable).getByText("青禾｜2330 台股 Paper 學習 R2")).toBeInTheDocument();
        });
        expect(getLiveOnlySpy).toHaveBeenCalledTimes(2);
        const rowEl = within(populatedTable).getByText("青禾｜2330 台股 Paper 學習 R2").closest("tr")!;
        expect(within(rowEl).getByText("Persona")).toBeInTheDocument();
        expect(within(rowEl).getByRole("link", { name: "Manage →" })).toHaveAttribute(
          "href",
          "/management/personas/persona-be19a1fac471247f2b2a",
        );
        expect(within(populatedTable).queryByText("No rows.")).not.toBeInTheDocument();
        expect(within(populatedTable).queryByText("Loading…")).not.toBeInTheDocument();
        expect(within(populatedTable).queryByText("Backend temporarily unavailable")).not.toBeInTheDocument();
      } finally {
        actual.__resetV5LiveCacheForTests();
        vi.restoreAllMocks();
      }
    });

    it("changing the dimension or the period while a read is in flight never shows the no rows text before that read finishes", async () => {
      const actual = await enableRealUseV5Live();
      const resolvers: Array<(value: PerformanceAttributionResult) => void> = [];
      const getLiveOnlySpy = vi
        .spyOn(mgmt.performanceAttribution, "getLiveOnly")
        .mockImplementation(
          () =>
            new Promise<PerformanceAttributionResult>((resolve) => {
              resolvers.push(resolve);
            }),
        );

      try {
        renderPage("/management/performance-attribution?period=latest");

        const table = screen.getByRole("table");
        expect(getLiveOnlySpy).toHaveBeenLastCalledWith(undefined, "latest", expect.any(Object));
        expect(within(table).getByText("Loading…")).toBeInTheDocument();
        expect(within(table).queryByText("No rows.")).not.toBeInTheDocument();

        // Change dimension while the initial read is still in flight
        fireEvent.change(screen.getByRole("combobox", { name: "Dimension" }), {
          target: { value: "persona" },
        });
        expect(getLiveOnlySpy).toHaveBeenLastCalledWith("persona", "latest", expect.any(Object));
        expect(within(table).getByText("Loading…")).toBeInTheDocument();
        expect(within(table).queryByText("No rows.")).not.toBeInTheDocument();

        // Change period while the persona read is still in flight
        fireEvent.change(screen.getByRole("combobox", { name: "Period" }), {
          target: { value: "30d" },
        });
        expect(getLiveOnlySpy).toHaveBeenLastCalledWith("persona", "30d", expect.any(Object));
        expect(within(table).getByText("Loading…")).toBeInTheDocument();
        expect(within(table).queryByText("No rows.")).not.toBeInTheDocument();

        // Finish the in-flight read for persona + 30d with the real BFF row
        await act(async () => {
          resolvers[resolvers.length - 1]({
            rows: [normalizePerformanceAttributionRow(REAL_HOSTED_PERSONA_ROW)],
            period: LATEST_ONLY_PERIOD,
          });
        });

        await waitFor(() => {
          expect(within(table).getByText("青禾｜2330 台股 Paper 學習 R2")).toBeInTheDocument();
        });
        expect(within(table).queryByText("Loading…")).not.toBeInTheDocument();
        expect(within(table).queryByText("No rows.")).not.toBeInTheDocument();

        // Switch dimension again to strategy (new read in flight) — must show Loading… and never No rows. before it finishes
        fireEvent.change(screen.getByRole("combobox", { name: "Dimension" }), {
          target: { value: "strategy" },
        });
        expect(getLiveOnlySpy).toHaveBeenLastCalledWith("strategy", "30d", expect.any(Object));
        expect(within(table).getByText("Loading…")).toBeInTheDocument();
        expect(within(table).queryByText("No rows.")).not.toBeInTheDocument();

        // Resolve the strategy read with zero rows — only now may No rows. appear
        await act(async () => {
          resolvers[resolvers.length - 1]({
            rows: [],
            period: LATEST_ONLY_PERIOD,
          });
        });

        await waitFor(() => {
          expect(within(table).getByText("No rows.")).toBeInTheDocument();
        });
        expect(within(table).queryByText("Loading…")).not.toBeInTheDocument();
      } finally {
        actual.__resetV5LiveCacheForTests();
        vi.restoreAllMocks();
      }
    });

    it("preserves the focused persona fallback from both the fleet row and the operations read model", () => {
      // 1. Direct Persona Fleet row fallback when formal attribution misses and operationsReadModel is unavailable
      mocks.useV5Live
        .mockReturnValueOnce({
          data: attributionResult([]),
          loading: false,
          refresh: vi.fn(),
        })
        .mockReturnValueOnce({
          data: [
            {
              personaId: REAL_HOSTED_PERSONA_ROW.dimension_key,
              personaName: REAL_HOSTED_PERSONA_ROW.label,
              owner: "pantheon-dev-browser",
              ooda: "Act",
              autonomy: "supervised",
              perfDelta: 0.084,
              humanNeeded: false,
              lastMutation: "2026-11-05",
              runtimeId: "runtime-2330-r2",
              capitalPoolId: "pool-2330-r2",
              performanceSummary: {
                pnl: 18500,
                maxDrawdown: 0.031,
              },
            },
          ],
          loading: false,
          refresh: vi.fn(),
        })
        .mockReturnValueOnce({ data: [], loading: false, refresh: vi.fn() })
        .mockReturnValueOnce({ data: undefined, loading: false, refresh: vi.fn() });

      const { unmount } = renderPage(
        `/management/performance-attribution?dimension=persona&persona=${REAL_HOSTED_PERSONA_ROW.dimension_key}`,
      );

      expect(screen.getByText("Fallback summary")).toBeInTheDocument();
      expect(
        screen.getByText(`${REAL_HOSTED_PERSONA_ROW.label} · Persona Fleet summary`),
      ).toBeInTheDocument();
      expect(
        screen.getByText("No formal attribution matched. Showing the Persona Fleet summary; missing fields are rendered as —."),
      ).toBeInTheDocument();
      expect(screen.queryByText("No rows.")).not.toBeInTheDocument();

      unmount();

      // 2. Operations read model fallback when formal attribution misses and operationsReadModel is available
      mocks.useV5Live
        .mockReturnValueOnce({
          data: attributionResult([]),
          loading: false,
          refresh: vi.fn(),
        })
        .mockReturnValueOnce({ data: [], loading: false, refresh: vi.fn() })
        .mockReturnValueOnce({ data: [], loading: false, refresh: vi.fn() })
        .mockReturnValueOnce({
          data: {
            identity: {
              personaId: REAL_HOSTED_PERSONA_ROW.dimension_key,
              personaLabel: REAL_HOSTED_PERSONA_ROW.label,
              runtimeIds: ["runtime-2330-r2"],
              paperLedgerIds: [],
              capitalPoolIds: ["pool-2330-r2"],
              sleeveIds: [],
              strategyIds: ["strategy-2330-r2"],
              artifactIds: [],
              brokerIds: [],
              period: "latest",
              asOf: "2026-11-05T00:00:00Z",
            },
            dataConfidence: "fallback",
            performance: { pnl: 18500, pnlPct: 0.084, drawdownPct: 0.031 },
            sources: [{ sourceName: "persona_fleet", sourceStatus: "ok", sourceRowCount: 1 }],
            diagnostics: [],
          },
          loading: false,
          refresh: vi.fn(),
        });

      renderPage(
        `/management/performance-attribution?dimension=persona&persona=${REAL_HOSTED_PERSONA_ROW.dimension_key}`,
      );

      expect(
        screen.getByText(`${REAL_HOSTED_PERSONA_ROW.label} · operations summary`),
      ).toBeInTheDocument();
      expect(screen.queryByText("No rows.")).not.toBeInTheDocument();
    });
  });
});
