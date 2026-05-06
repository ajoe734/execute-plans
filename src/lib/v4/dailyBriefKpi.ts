// v4 / Pack C §C077 — DailyBrief KPI timezone & null handling.

export const KPI_STORAGE_TZ = "UTC" as const;
export const KPI_LABEL_TZ_SOURCE = "exchange_local" as const;

export type KpiDisplay =
  | { kind: "value"; value: number }
  | { kind: "missing"; symbol: "—"; tooltipKey: "kpi.dataUnavailable" }
  | { kind: "na"; symbol: "N/A"; reason: "denominator_zero" };

export function renderKpi(value: number | null, denominator?: number | null): KpiDisplay {
  if (denominator === 0) return { kind: "na", symbol: "N/A", reason: "denominator_zero" };
  if (value === null || value === undefined) return { kind: "missing", symbol: "—", tooltipKey: "kpi.dataUnavailable" };
  return { kind: "value", value };
}
