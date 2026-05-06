// v4 / Pack C §C038 — Mandate breach monitor runtime helper.

import { classifyBreach, MANDATE_MONITOR_DEFAULT, type MandateMonitor } from "./mandateMonitor";

export interface PoolMandateState {
  poolId: string;
  utilizationPct: number;
  capPct: number;
}

export interface MandateBreachAlert {
  poolId: string;
  breachPct: number;
  severity: "low" | "medium" | "high" | "critical";
  autoAction: MandateMonitor["onBreach"]["autoAction"];
  notifyRoles: MandateMonitor["onBreach"]["notifyRoles"];
}

export function monitorPoolBreach(
  state: PoolMandateState,
  monitor: MandateMonitor = MANDATE_MONITOR_DEFAULT,
): MandateBreachAlert | null {
  const breachPct = state.utilizationPct - state.capPct;
  if (breachPct <= 0) return null;
  return {
    poolId: state.poolId,
    breachPct,
    severity: classifyBreach(breachPct, monitor),
    autoAction: monitor.onBreach.autoAction,
    notifyRoles: monitor.onBreach.notifyRoles,
  };
}
