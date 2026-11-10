import { describe, expect, it } from "vitest";

import { adaptPerformanceAttributionResult } from "@/lib/bff-v1/management";
import {
  adaptAttributionPeriodState,
  adaptAttributionSummary,
  confirmedAppliedPeriod,
} from "@/lib/v5/management/performanceAttribution";

const ROW = { dimension: "persona", key: "persona-a", label: "Persona A", period: "latest" };

describe("performance attribution period adapter", () => {
  it("reads meta.period as an object (BFF #6785 shape)", () => {
    const raw = {
      data: {
        period: "latest",
        summary: { period: "latest", requested_period: "30d", period_windowed: false },
        items: [ROW],
      },
      meta: {
        period: {
          requested: "30d",
          applied: "latest",
          windowed: false,
          basis: "latest_runtime_telemetry_snapshot",
          reason: "dated_attribution_source_unavailable",
          message: "No dated per-runtime P&L source.",
        },
      },
    };

    const out = adaptPerformanceAttributionResult(raw);

    expect(out.rows).toHaveLength(1);
    expect(out.period).toEqual({
      requested: "30d",
      applied: "latest",
      windowed: false,
      basis: "latest_runtime_telemetry_snapshot",
      reason: "dated_attribution_source_unavailable",
      message: "No dated per-runtime P&L source.",
      source: "meta",
    });
    expect(confirmedAppliedPeriod(out.period)).toBe("latest");
  });

  it("treats windowed only as true when the BFF says exactly true", () => {
    const state = adaptAttributionPeriodState({
      meta: { period: { requested: "30d", applied: "30d", windowed: "true" } },
    });
    expect(state.windowed).toBe(false);
    expect(confirmedAppliedPeriod(state)).toBeUndefined();

    const confirmed = adaptAttributionPeriodState({
      meta: { period: { requested: "30d", applied: "30d", windowed: true } },
    });
    expect(confirmedAppliedPeriod(confirmed)).toBe("30d");
  });

  it("keeps a legacy string meta.period renderable without claiming the window", () => {
    const out = adaptPerformanceAttributionResult({ data: [ROW], meta: { period: "30d" } });

    expect(out.rows).toHaveLength(1);
    expect(out.period).toEqual({ applied: "30d", windowed: false, source: "legacy_string" });
    expect(confirmedAppliedPeriod(out.period)).toBeUndefined();
  });

  it("falls back to data.summary when meta.period is absent", () => {
    const state = adaptAttributionPeriodState({
      data: { period: "latest", summary: { period: "latest", requested_period: "7d", period_windowed: false }, rows: [ROW] },
    });

    expect(state).toEqual({ requested: "7d", applied: "latest", windowed: false, source: "summary" });
    expect(adaptPerformanceAttributionResult({ data: { rows: [ROW] } }).rows).toHaveLength(1);
  });

  it("reports missing period info as unconfirmed", () => {
    expect(adaptAttributionPeriodState({ data: [ROW] })).toEqual({ windowed: false, source: "missing" });
  });

  it("omits summary when instrument_learning and instrument_breakdown are absent", () => {
    const out = adaptPerformanceAttributionResult({
      data: {
        period: "latest",
        summary: { period: "latest", requested_period: "30d", period_windowed: false },
        items: [ROW],
      },
      meta: { period: { requested: "30d", applied: "latest", windowed: false } },
    });

    expect(out.summary).toBeUndefined();
    expect(Object.keys(out)).toEqual(["rows", "period"]);
  });

  it("preserves snake_case BFF keys for the real 2026-11-10 all-null instrument_learning and instrument_breakdown payload", () => {
    const raw = {
      data: {
        period: "latest",
        summary: {
          period: "latest",
          requested_period: "latest",
          period_windowed: false,
          instrument_learning: {
            direction_hit_rate: null,
            direction_hit_count: 0,
            direction_graded_count: 0,
            instrument_regret: null,
            instrument_regret_graded_count: 0,
            margin_use: null,
            decision_count: 0,
            decisions: [],
          },
          instrument_breakdown: [
            {
              instrument_key: "ssf:SRF:202611",
              instrument_id: "ssf:SRF:202611",
              symbol: "0050.TWSE",
              instrument_kind: "stock_future",
              contract_month: "202611",
              multiplier: 1000.0,
              margin_reserved: 17400.0,
              holding_count: 1,
              market_value: null,
              total_notional: null,
              total_pnl: 0.0,
              unrealized_pnl: null,
              realized_pnl: 0.0,
            },
            {
              instrument_key: "unassigned",
              instrument_id: null,
              symbol: "2330.TWSE",
              instrument_kind: "cash_share",
              contract_month: null,
              multiplier: 1.0,
              margin_reserved: null,
              holding_count: 1,
              market_value: -11200.0,
              total_notional: 11200.0,
              total_pnl: 295.0,
              unrealized_pnl: 295.0,
              realized_pnl: 0.0,
            },
          ],
        },
        items: [ROW],
      },
      meta: {
        period: {
          requested: "latest",
          applied: "latest",
          windowed: false,
          basis: "latest_runtime_telemetry_snapshot",
        },
      },
    };

    const out = adaptPerformanceAttributionResult(raw);

    expect(out.summary).toEqual({
      instrument_learning: {
        direction_hit_rate: null,
        direction_hit_count: 0,
        direction_graded_count: 0,
        instrument_regret: null,
        instrument_regret_graded_count: 0,
        margin_use: null,
        decision_count: 0,
        decisions: [],
      },
      instrument_breakdown: [
        {
          instrument_key: "ssf:SRF:202611",
          instrument_id: "ssf:SRF:202611",
          symbol: "0050.TWSE",
          instrument_kind: "stock_future",
          contract_month: "202611",
          multiplier: 1000,
          margin_reserved: 17400,
          holding_count: 1,
          market_value: null,
          total_notional: null,
          total_pnl: 0,
          unrealized_pnl: null,
          realized_pnl: 0,
        },
        {
          instrument_key: "unassigned",
          instrument_id: null,
          symbol: "2330.TWSE",
          instrument_kind: "cash_share",
          contract_month: null,
          multiplier: 1,
          margin_reserved: null,
          holding_count: 1,
          market_value: -11200,
          total_notional: 11200,
          total_pnl: 295,
          unrealized_pnl: 295,
          realized_pnl: 0,
        },
      ],
    });
  });

  it("preserves graded instrument_learning decisions and metrics without recomputation", () => {
    const summary = adaptAttributionSummary({
      data: {
        summary: {
          instrument_learning: {
            direction_hit_rate: 0.5,
            direction_hit_count: 1,
            direction_graded_count: 2,
            instrument_regret: 120.5,
            instrument_regret_graded_count: 2,
            margin_use: 0.174,
            decision_count: 3,
            decisions: [
              {
                decision_id: "rt-1:dec-101",
                chosen_instrument_id: "ssf:SRF:202611",
                best_instrument_id: "ssf:SRF:202611",
                direction_hit: true,
                instrument_regret: 0,
                margin_use: 0.174,
                chosen_pnl: 850,
              },
              {
                decision_id: "rt-1:dec-102",
                chosen_instrument_id: "eq:0050.TWSE",
                best_instrument_id: "ssf:SRF:202611",
                direction_hit: false,
                instrument_regret: 241,
                margin_use: null,
                chosen_pnl: -110,
              },
              {
                decision_id: "rt-1:dec-103",
                chosen_instrument_id: "ssf:SRF:202611",
                best_instrument_id: null,
                direction_hit: null,
                instrument_regret: null,
                margin_use: 0.174,
                chosen_pnl: null,
              },
            ],
          },
        },
      },
    });

    expect(summary).toEqual({
      instrument_learning: {
        direction_hit_rate: 0.5,
        direction_hit_count: 1,
        direction_graded_count: 2,
        instrument_regret: 120.5,
        instrument_regret_graded_count: 2,
        margin_use: 0.174,
        decision_count: 3,
        decisions: [
          {
            decision_id: "rt-1:dec-101",
            chosen_instrument_id: "ssf:SRF:202611",
            best_instrument_id: "ssf:SRF:202611",
            direction_hit: true,
            instrument_regret: 0,
            margin_use: 0.174,
            chosen_pnl: 850,
          },
          {
            decision_id: "rt-1:dec-102",
            chosen_instrument_id: "eq:0050.TWSE",
            best_instrument_id: "ssf:SRF:202611",
            direction_hit: false,
            instrument_regret: 241,
            margin_use: null,
            chosen_pnl: -110,
          },
          {
            decision_id: "rt-1:dec-103",
            chosen_instrument_id: "ssf:SRF:202611",
            best_instrument_id: null,
            direction_hit: null,
            instrument_regret: null,
            margin_use: 0.174,
            chosen_pnl: null,
          },
        ],
      },
    });
  });
});
