import { describe, expect, it } from "vitest";

import { adaptPerformanceAttributionResult } from "@/lib/bff-v1/management";
import {
  adaptAttributionPeriodState,
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
});
