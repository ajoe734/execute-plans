// Pack D D31 — CapitalPool breach formula (Batch IV provisional v0-mock).
// Source: .lovable/spec/v4/pack-d/Pantheon_Pack_D_DomainRules_Contract.md
//
// PROVISIONAL: thresholds + windows match Pack D canonical defaults; risk
// team owns final tuning. UI may surface breach severity using these helpers
// pending real backend computation.

export type BreachLevel = "ok" | "warn" | "high" | "critical";

export interface BreachInputs {
  utilized: number;
  allocated: number;
  currentDrawdownPct?: number;
  riskBudgetPct?: number;
  maxPositionExposureUsd?: number;
  policyMaxConcentrationPct?: number;
}

export interface BreachAssessment {
  level: BreachLevel;
  utilizationPct: number;
  riskBudgetUsagePct?: number;
  concentrationPct?: number;
  reasons: string[];
}

const HIGH_UTIL = 0.9;
const CRIT_UTIL = 0.98;
const HIGH_RBU = 1.0;
const CRIT_RBU = 1.25;

export function assessBreach(inp: BreachInputs): BreachAssessment {
  const utilizationPct = inp.allocated > 0 ? inp.utilized / inp.allocated : 0;
  const reasons: string[] = [];
  let level: BreachLevel = "ok";

  function bump(next: BreachLevel) {
    const order: BreachLevel[] = ["ok", "warn", "high", "critical"];
    if (order.indexOf(next) > order.indexOf(level)) level = next;
  }

  if (utilizationPct > CRIT_UTIL) { bump("critical"); reasons.push("utilization>0.98"); }
  else if (utilizationPct > HIGH_UTIL) { bump("high"); reasons.push("utilization>0.90"); }
  else if (utilizationPct > 0.75) { bump("warn"); reasons.push("utilization>0.75"); }

  let riskBudgetUsagePct: number | undefined;
  if (inp.currentDrawdownPct != null && inp.riskBudgetPct && inp.riskBudgetPct > 0) {
    riskBudgetUsagePct = Math.abs(inp.currentDrawdownPct) / inp.riskBudgetPct;
    if (riskBudgetUsagePct > CRIT_RBU) { bump("critical"); reasons.push("riskBudgetUsage>1.25"); }
    else if (riskBudgetUsagePct > HIGH_RBU) { bump("high"); reasons.push("riskBudgetUsage>1.0"); }
  }

  let concentrationPct: number | undefined;
  if (inp.maxPositionExposureUsd != null && inp.allocated > 0 && inp.policyMaxConcentrationPct) {
    concentrationPct = inp.maxPositionExposureUsd / inp.allocated;
    if (concentrationPct > inp.policyMaxConcentrationPct) {
      bump("high");
      reasons.push("concentration>policy");
    }
  }

  return { level, utilizationPct, riskBudgetUsagePct, concentrationPct, reasons };
}
