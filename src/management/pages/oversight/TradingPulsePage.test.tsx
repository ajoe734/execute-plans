import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { adaptTradingPulseOverview } from "@/lib/bff-v1/management";
import { TradingPulsePage } from "./_core";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

function renderPage(element: ReactElement) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{element}</MemoryRouter>
    </I18nextProvider>,
  );
}

const SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD = {
  data: {
    id: "management-trading-pulse",
    summary: {
      runtime_count: 90,
      retired_runtime_count: 113,
      telemetry_coverage_count: 81,
      monitoring_coverage_count: 79,
      row_health_degraded_count: 12,
      row_health_status_counts: { ok: 78, degraded: 12 },
      total_pnl: 1450.5,
      worst_drawdown: 0.042,
      average_fill_rate: 0.964,
      worst_slippage_bps: 4.25,
      baseline_comparison_count: 76,
      baseline_breached_count: 0,
      by_status: { active: 1, running: 89 },
      by_stage: { paper: 88, live_running: 2 },
      by_baseline_status: { ok: 72, watch: 4, breached: 0 },
      coverage: {
        runtime_count: 90,
        telemetry_coverage_count: 81,
      },
    },
    cards: [
      {
        card_id: "runtime-status",
        label: "Runtime Status",
        value: 90,
        status: "ok",
        details: {
          by_status: { active: 1, running: 89 },
          by_stage: { paper: 88, live_running: 2 },
        },
      },
      {
        card_id: "row-health",
        label: "Row Health",
        value: 12,
        status: "degraded",
        details: {
          row_health_status_counts: { ok: 78, degraded: 12 },
          degraded_runtime_ids: ["rt-paper-01", "rt-paper-02"],
        },
      },
      {
        card_id: "pnl",
        label: "P&L",
        value: 1450.5,
        status: "ok",
        details: {
          telemetry_coverage_count: 81,
          metric_coverage: {
            available_count: 81,
            missing_count: 9,
            missing_runtime_ids: ["rt-paper-05"],
          },
        },
      },
      {
        card_id: "drawdown",
        label: "Worst Drawdown",
        value: 0.042,
        status: "ok",
        details: {
          metric_coverage: {
            available_count: 80,
            missing_count: 10,
            missing_runtime_ids: ["rt-paper-05", "rt-paper-06"],
          },
        },
      },
      {
        card_id: "execution-quality",
        label: "Execution Quality",
        value: 0.964,
        status: "ok",
        details: {
          worst_slippage_bps: 4.25,
          metric_coverage: {
            available_count: 77,
            missing_count: 13,
            missing_runtime_ids: ["rt-paper-05", "rt-paper-06", "rt-paper-07"],
          },
        },
      },
      {
        card_id: "baseline-comparison",
        label: "Baseline Comparison",
        value: 0,
        status: "ok",
        details: {
          baseline_comparison_count: 76,
          by_baseline_status: { ok: 72, watch: 4, breached: 0 },
          missing_baseline_runtime_ids: ["rt-paper-03", "rt-paper-04"],
        },
      },
    ],
    runtime_rows: [
      {
        runtime_id: "rt-paper-01",
        runtime_binding_id: "rb-paper-01",
        persona_id: "persona-alpha",
        deployment_stage: "paper",
        status: "running",
        telemetry_summary: {
          metrics: {
            pnl: 1450.5,
            max_drawdown: 0.042,
            fill_rate: 0.964,
            slippage_bps: 4.25,
            total_trades: 18,
          },
        },
        row_health: {
          status: "degraded",
          degraded_checks: ["paper_runtime_monitoring"],
        },
        baseline_comparison: {
          runtime_id: "rt-paper-01",
          status: "ok",
          metric_count: 4,
          breached_metric_count: 0,
        },
      },
    ],
    baseline_comparisons: [],
  },
  meta: {
    snapshot_at: "2026-11-05T12:00:00Z",
    surfaces: {
      management_trading_pulse: { status: "degraded", source: "bff_composed" },
      paper_live_drift: { status: "ok", source: "service_store" },
    },
    coverage: {
      monitoring_coverage_count: 79,
      paper_runtime_count: 88,
      baseline_comparison_count: 76,
      row_health_degraded_count: 12,
      row_health_status_counts: { ok: 78, degraded: 12 },
      missing_telemetry_runtime_ids: ["rt-paper-05"],
      missing_monitoring_runtime_ids: ["rt-paper-06"],
      missing_baseline_runtime_ids: ["rt-paper-03", "rt-paper-04"],
      degraded_runtime_ids: ["rt-paper-01", "rt-paper-02"],
      metric_coverage: {
        pnl: {
          available_count: 81,
          missing_count: 9,
          missing_runtime_ids: ["rt-paper-05"],
        },
        max_drawdown: {
          available_count: 80,
          missing_count: 10,
          missing_runtime_ids: ["rt-paper-05", "rt-paper-06"],
        },
        fill_rate: {
          available_count: 77,
          missing_count: 13,
          missing_runtime_ids: ["rt-paper-05", "rt-paper-06", "rt-paper-07"],
        },
      },
    },
  },
};

function mockTradingPulseModel(rawPayload: unknown) {
  const adapted = adaptTradingPulseOverview(rawPayload);
  mocks.useV5Live.mockImplementation((_loader, _deps, opts?: { cacheKey?: string }) => {
    if (opts?.cacheKey === "oversight.tradingPulse.rankings") {
      return { data: [], loading: false, refresh: vi.fn() };
    }
    return { data: adapted, loading: false, refresh: vi.fn() };
  });
  return adapted;
}

describe("TradingPulsePage snake_case BFF contract and coverage rendering", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    mocks.useV5Live.mockReset();
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage("en-US");
  });

  it("renders every card detail line and coverage tile from the snake_case BFF payload", () => {
    mockTradingPulseModel(SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD);
    renderPage(<TradingPulsePage />);

    // Card 1: runtime-status (by_status, by_stage)
    expect(screen.getByText("Status: active: 1 · running: 89")).toBeInTheDocument();
    expect(screen.getByText("Stage: paper: 88 · live_running: 2")).toBeInTheDocument();

    // Card 2: row-health (row_health_status_counts, degraded_runtime_ids)
    expect(screen.getByText("Row health: ok: 78 · degraded: 12")).toBeInTheDocument();
    expect(screen.getByText("Degraded rows: rt-paper-01, rt-paper-02")).toBeInTheDocument();

    // Card 3: pnl (telemetry_coverage_count, metric_coverage)
    expect(screen.getByText("Telemetry coverage: 81")).toBeInTheDocument();
    expect(screen.getByText("Metric coverage: 81/90")).toBeInTheDocument();

    // Card 4: drawdown (metric_coverage)
    expect(screen.getByText("Metric coverage: 80/90")).toBeInTheDocument();

    // Card 5: execution-quality (worst_slippage_bps, metric_coverage)
    expect(screen.getByText("Worst slippage bps: 4.25")).toBeInTheDocument();
    expect(screen.getByText("Metric coverage: 77/90")).toBeInTheDocument();

    // Card 6: baseline-comparison (baseline_comparison_count, by_baseline_status, missing_baseline_runtime_ids)
    expect(screen.getByText("Baseline coverage: 76")).toBeInTheDocument();
    expect(screen.getByText("Baseline status: ok: 72 · watch: 4 · breached: 0")).toBeInTheDocument();
    expect(screen.getAllByText("Missing: rt-paper-03, rt-paper-04").length).toBeGreaterThanOrEqual(2);

    // Data coverage tiles for telemetry, monitoring, and baseline
    const telemetryTile = screen.getByText("Telemetry coverage").closest("div.rounded-md") as HTMLElement;
    expect(within(telemetryTile).getByText("81/90")).toBeInTheDocument();
    expect(within(telemetryTile).getByText("Missing: rt-paper-05")).toBeInTheDocument();

    const monitoringTile = screen.getByText("Monitoring coverage").closest("div.rounded-md") as HTMLElement;
    expect(within(monitoringTile).getByText("79/88")).toBeInTheDocument();
    expect(within(monitoringTile).getByText("Missing: rt-paper-06")).toBeInTheDocument();

    const baselineTile = screen.getByText("Baseline coverage").closest("div.rounded-md") as HTMLElement;
    expect(within(baselineTile).getByText("76/90")).toBeInTheDocument();
    expect(within(baselineTile).getByText("Missing: rt-paper-03, rt-paper-04")).toBeInTheDocument();
  });

  it("renders a dash on coverage tiles when telemetry, monitoring, or baseline counts are genuinely absent", () => {
    mockTradingPulseModel({
      data: {
        id: "management-trading-pulse",
        summary: {
          runtime_count: 90,
          by_status: { running: 90 },
          coverage: {
            runtime_count: 90,
          },
        },
        cards: [],
        runtime_rows: [],
      },
      meta: {
        snapshot_at: "2026-11-05T12:00:00Z",
        surfaces: {
          management_trading_pulse: { status: "degraded", source: "bff_composed" },
        },
        coverage: {},
      },
    });

    renderPage(<TradingPulsePage />);

    const telemetryTile = screen.getByText("Telemetry coverage").closest("div.rounded-md") as HTMLElement;
    expect(within(telemetryTile).getByText("—")).toBeInTheDocument();

    const monitoringTile = screen.getByText("Monitoring coverage").closest("div.rounded-md") as HTMLElement;
    expect(within(monitoringTile).getByText("—")).toBeInTheDocument();

    const baselineTile = screen.getByText("Baseline coverage").closest("div.rounded-md") as HTMLElement;
    expect(within(baselineTile).getByText("—")).toBeInTheDocument();
  });

  it("shows excluded retired runtime count in en-US and zh-TW when summary.retired_runtime_count is present, and nothing extra when absent", async () => {
    mockTradingPulseModel(SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD);
    const enView = renderPage(<TradingPulsePage />);

    const enRuntimeTile = screen
      .getAllByText("Runtime rows")
      .map((el) => el.closest("div.rounded-md"))
      .find(Boolean) as HTMLElement;
    expect(within(enRuntimeTile).getByText("90")).toBeInTheDocument();
    expect(
      within(enRuntimeTile).getByText("active: 1 · running: 89 · Excluded retired: 113"),
    ).toBeInTheDocument();
    enView.unmount();

    await i18n.changeLanguage("zh-TW");
    const zhView = renderPage(<TradingPulsePage />);
    const zhRuntimeTile = screen
      .getAllByText("Runtime 明細")
      .map((el) => el.closest("div.rounded-md"))
      .find(Boolean) as HTMLElement;
    expect(within(zhRuntimeTile).getByText("90")).toBeInTheDocument();
    expect(
      within(zhRuntimeTile).getByText("active: 1 · running: 89 · 已排除已退役：113"),
    ).toBeInTheDocument();
    zhView.unmount();

    await i18n.changeLanguage("en-US");
    const withoutRetiredPayload = {
      ...SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD,
      data: {
        ...SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD.data,
        summary: {
          ...SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD.data.summary,
          retired_runtime_count: undefined,
        },
      },
    };
    mockTradingPulseModel(withoutRetiredPayload);
    renderPage(<TradingPulsePage />);

    const noRetiredTile = screen
      .getAllByText("Runtime rows")
      .map((el) => el.closest("div.rounded-md"))
      .find(Boolean) as HTMLElement;
    expect(within(noRetiredTile).getByText("active: 1 · running: 89")).toBeInTheDocument();
    expect(screen.queryByText(/Excluded retired/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/已排除已退役/)).not.toBeInTheDocument();
  });

  it("keeps live-only loading and unavailable states unchanged", () => {
    mocks.useV5Live.mockReturnValue({ data: undefined, loading: true, refresh: vi.fn() });
    const loadingView = renderPage(<TradingPulsePage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.getByText("Waiting for live BFF data.")).toBeInTheDocument();
    loadingView.unmount();

    mocks.useV5Live.mockReturnValue({ data: undefined, loading: false, refresh: vi.fn() });
    renderPage(<TradingPulsePage />);
    expect(screen.getByText("Live data unavailable")).toBeInTheDocument();
    expect(
      screen.getByText("This page does not render seed, demo, or non-production fallback data."),
    ).toBeInTheDocument();
  });

  it("covers all four Baseline coverage tile states and row baseline status badges in en-US and zh-TW", async () => {
    // State 1: baseline_required_count > 0 and covered (denominator uses baseline_required_count instead of runtime_count)
    // Also includes rows with ok, not_required, and unavailable statuses to verify row badge rendering
    const coveredMixedPayload = {
      ...SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD,
      data: {
        ...SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD.data,
        summary: {
          ...SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD.data.summary,
          runtime_count: 4,
          baseline_comparison_count: 1,
          baseline_required_count: 1,
          by_baseline_status: { ok: 1, not_required: 3 },
          missing_baseline_runtime_ids: [],
          coverage: {
            runtime_count: 4,
            telemetry_coverage_count: 4,
            baseline_comparison_count: 1,
            baseline_required_count: 1,
            missing_baseline_runtime_ids: [],
          },
        },
        runtime_rows: [
          {
            runtime_id: "rt-live-01",
            runtime_binding_id: "rb-live-01",
            persona_id: "persona-live",
            deployment_stage: "live",
            status: "active",
            telemetry_summary: { metrics: { pnl: 500, fill_rate: 0.99, total_trades: 10 } },
            row_health: { status: "ok", degraded_checks: [] },
            baseline_comparison: { runtime_id: "rt-live-01", status: "ok", metric_count: 4, breached_metric_count: 0 },
          },
          {
            runtime_id: "rt-paper-01",
            runtime_binding_id: "rb-paper-01",
            persona_id: "persona-paper-1",
            deployment_stage: "paper",
            status: "active",
            telemetry_summary: { metrics: { pnl: 120, fill_rate: 0.95, total_trades: 6 } },
            row_health: { status: "ok", degraded_checks: [] },
            baseline_comparison: { runtime_id: "rt-paper-01", status: "not_required", metric_count: 0, breached_metric_count: 0 },
          },
          {
            runtime_id: "rt-live-02",
            runtime_binding_id: "rb-live-02",
            persona_id: "persona-live-2",
            deployment_stage: "live",
            status: "active",
            telemetry_summary: { metrics: { pnl: -20, fill_rate: 0.91, total_trades: 3 } },
            row_health: { status: "degraded", degraded_checks: ["paper_live_drift"] },
            baseline_comparison: { runtime_id: "rt-live-02", status: "unavailable", metric_count: 0, breached_metric_count: 0 },
          },
        ],
      },
      meta: {
        ...SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD.meta,
        coverage: {
          ...SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD.meta.coverage,
          runtime_count: 4,
          baseline_comparison_count: 1,
          baseline_required_count: 1,
          missing_baseline_runtime_ids: [],
        },
      },
    };

    mockTradingPulseModel(coveredMixedPayload);
    const state1View = renderPage(<TradingPulsePage />);
    const state1Tile = screen.getByText("Baseline coverage").closest("div.rounded-md") as HTMLElement;
    expect(within(state1Tile).getByText("1/1")).toBeInTheDocument();
    expect(within(state1Tile).getByText("ok")).toBeInTheDocument();
    expect(within(state1Tile).queryByText("degraded")).not.toBeInTheDocument();
    expect(within(state1Tile).getByText("Missing: —")).toBeInTheDocument();

    // Row badge assertions in en-US: not_required shows neutral localized badge; unavailable keeps warning tone
    const paperRowEn = screen.getByText("rt-paper-01").closest("tr") as HTMLElement;
    const notRequiredBadgeEn = within(paperRowEn).getByText("Not required");
    expect(notRequiredBadgeEn).toHaveClass("bg-muted", "text-muted-foreground", "border-border");
    expect(within(paperRowEn).queryByText("not_required")).not.toBeInTheDocument();

    const unavailableRowEn = screen.getByText("rt-live-02").closest("tr") as HTMLElement;
    const unavailableBadgeEn = within(unavailableRowEn).getByText("unavailable");
    expect(unavailableBadgeEn).toHaveClass("bg-status-warning/15", "text-status-warning", "border-status-warning/30");
    state1View.unmount();

    // State 2: baseline_required_count is absent (older BFF fallback to runtime_count)
    mockTradingPulseModel(SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD);
    const state2View = renderPage(<TradingPulsePage />);
    const state2Tile = screen.getByText("Baseline coverage").closest("div.rounded-md") as HTMLElement;
    expect(within(state2Tile).getByText("76/90")).toBeInTheDocument();
    expect(within(state2Tile).getByText("degraded")).toBeInTheDocument();
    expect(within(state2Tile).getByText("Missing: rt-paper-03, rt-paper-04")).toBeInTheDocument();
    state2View.unmount();

    // State 3: baseline_required_count is 0 (all-paper fleet without reports -> localized not-required text, no degraded badge)
    const allPaperPayload = {
      ...SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD,
      data: {
        ...SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD.data,
        summary: {
          ...SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD.data.summary,
          runtime_count: 4,
          baseline_comparison_count: 0,
          baseline_required_count: 0,
          by_baseline_status: { not_required: 4 },
          missing_baseline_runtime_ids: [],
          coverage: {
            runtime_count: 4,
            baseline_comparison_count: 0,
            baseline_required_count: 0,
            missing_baseline_runtime_ids: [],
          },
        },
        runtime_rows: [
          {
            runtime_id: "rt-paper-01",
            runtime_binding_id: "rb-paper-01",
            persona_id: "persona-alpha",
            deployment_stage: "paper",
            status: "active",
            telemetry_summary: { metrics: { pnl: 1450.5, fill_rate: 0.964, total_trades: 18 } },
            row_health: { status: "ok", degraded_checks: [] },
            baseline_comparison: { runtime_id: "rt-paper-01", status: "not_required", metric_count: 0, breached_metric_count: 0 },
          },
        ],
      },
      meta: {
        ...SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD.meta,
        coverage: {
          ...SNAKE_CASE_BFF_TRADING_PULSE_PAYLOAD.meta.coverage,
          runtime_count: 4,
          baseline_comparison_count: 0,
          baseline_required_count: 0,
          missing_baseline_runtime_ids: [],
        },
      },
    };

    mockTradingPulseModel(allPaperPayload);
    const state3EnView = renderPage(<TradingPulsePage />);
    const state3EnTile = screen.getByText("Baseline coverage").closest("div.rounded-md") as HTMLElement;
    expect(within(state3EnTile).getByText("Not required")).toBeInTheDocument();
    expect(within(state3EnTile).queryByText("0/4")).not.toBeInTheDocument();
    expect(within(state3EnTile).queryByText("0/0")).not.toBeInTheDocument();
    expect(within(state3EnTile).queryByText("degraded")).not.toBeInTheDocument();
    expect(within(state3EnTile).getByText("ok")).toBeInTheDocument();
    state3EnView.unmount();

    await i18n.changeLanguage("zh-TW");
    const state3ZhView = renderPage(<TradingPulsePage />);
    const state3ZhTile = screen.getByText("Baseline 覆蓋").closest("div.rounded-md") as HTMLElement;
    expect(within(state3ZhTile).getByText("不需比較")).toBeInTheDocument();
    expect(within(state3ZhTile).queryByText("0/4")).not.toBeInTheDocument();
    expect(within(state3ZhTile).queryByText("degraded")).not.toBeInTheDocument();
    const paperRowZh = screen.getByText("rt-paper-01").closest("tr") as HTMLElement;
    const notRequiredBadgeZh = within(paperRowZh).getByText("不需比較");
    expect(notRequiredBadgeZh).toHaveClass("bg-muted", "text-muted-foreground", "border-border");
    state3ZhView.unmount();

    // State 4: baseline_required_count > 0 with non-empty missing_baseline_runtime_ids stays degraded and lists missing ids
    await i18n.changeLanguage("en-US");
    const missingRequiredPayload = {
      ...coveredMixedPayload,
      data: {
        ...coveredMixedPayload.data,
        summary: {
          ...coveredMixedPayload.data.summary,
          baseline_comparison_count: 1,
          baseline_required_count: 2,
          missing_baseline_runtime_ids: ["rt-live-02"],
          coverage: {
            runtime_count: 4,
            baseline_comparison_count: 1,
            baseline_required_count: 2,
            missing_baseline_runtime_ids: ["rt-live-02"],
          },
        },
      },
      meta: {
        ...coveredMixedPayload.meta,
        coverage: {
          ...coveredMixedPayload.meta.coverage,
          runtime_count: 4,
          baseline_comparison_count: 1,
          baseline_required_count: 2,
          missing_baseline_runtime_ids: ["rt-live-02"],
        },
      },
    };
    mockTradingPulseModel(missingRequiredPayload);
    renderPage(<TradingPulsePage />);
    const state4Tile = screen.getByText("Baseline coverage").closest("div.rounded-md") as HTMLElement;
    expect(within(state4Tile).getByText("1/2")).toBeInTheDocument();
    expect(within(state4Tile).getByText("degraded")).toBeInTheDocument();
    expect(within(state4Tile).getByText("Missing: rt-live-02")).toBeInTheDocument();
  });
});
