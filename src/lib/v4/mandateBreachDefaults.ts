// Planner Response §E10 (2026-05-07) — Mandate breach detection cadence + auto actions.
// Source: §6.E10.

export interface BreachCadence {
  metric: "capital_utilization" | "drawdown_risk_budget" | "latency_slippage" | "policy_breach";
  evaluateEverySec: number;
  eventDriven: boolean;
}

export const MANDATE_BREACH_CADENCES: readonly BreachCadence[] = [
  { metric: "capital_utilization",   evaluateEverySec:  300, eventDriven: false },
  { metric: "drawdown_risk_budget",  evaluateEverySec:  900, eventDriven: false },
  { metric: "latency_slippage",      evaluateEverySec:  300, eventDriven: false },
  { metric: "policy_breach",         evaluateEverySec:  900, eventDriven: true  },
];

export type BreachSeverity = "high" | "critical" | "live_impacting" | "capital_critical";

export interface BreachAutoAction {
  severity: BreachSeverity;
  actions: readonly string[];
  notify: readonly string[];
}

export const MANDATE_BREACH_AUTO_ACTIONS: readonly BreachAutoAction[] = [
  { severity: "high",             actions: ["create_alert", "create_sentinel_finding"],         notify: ["risk_officer"] },
  { severity: "critical",         actions: ["create_incident", "create_hiq_intervention"],       notify: ["risk_officer", "platform_admin"] },
  { severity: "live_impacting",   actions: ["notify_risk_officer"],                              notify: ["risk_officer"] },
  { severity: "capital_critical", actions: ["freeze_rebalance_until_approval"],                  notify: ["risk_officer", "capital_manager"] },
];

export const MANDATE_BREACH_SOURCE = "planner-response-2026-05-07" as const;
