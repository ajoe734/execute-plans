// v4 / Pack C §C038 — Mandate breach monitor.

export type MandateAutoAction = "none" | "freeze_new_allocations" | "require_review" | "freeze_pool";

export interface MandateMonitor {
  intervalSec: number;
  onBreach: {
    notifyRoles: Array<"risk_officer" | "capital_manager" | "system_operator">;
    createAlert: boolean;
    autoAction: MandateAutoAction;
    severityByBreachPct: Array<{ thresholdPct: number; severity: "low" | "medium" | "high" | "critical" }>;
  };
}

export const MANDATE_MONITOR_DEFAULT: MandateMonitor = {
  intervalSec: 300,
  onBreach: {
    notifyRoles: ["risk_officer", "capital_manager"],
    createAlert: true,
    autoAction: "freeze_new_allocations",
    severityByBreachPct: [
      { thresholdPct: 5, severity: "medium" },
      { thresholdPct: 15, severity: "high" },
      { thresholdPct: 25, severity: "critical" },
    ],
  },
};

export function classifyBreach(breachPct: number, monitor: MandateMonitor = MANDATE_MONITOR_DEFAULT) {
  const sorted = [...monitor.onBreach.severityByBreachPct].sort((a, b) => b.thresholdPct - a.thresholdPct);
  return sorted.find((s) => breachPct >= s.thresholdPct)?.severity ?? "low";
}
