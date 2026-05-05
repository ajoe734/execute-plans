// v3 §9 Capital Pool Mandate Schema. Resolves G16.

export interface CapitalPoolMandate {
  mandateId: string;
  poolId: string;
  displayName: string;
  description: string;
  baseCurrency: "USD" | "TWD" | "EUR" | "JPY";
  allowedMarkets: Array<"US_EQUITY" | "TW_EQUITY" | "FX" | "CRYPTO" | "FUTURES" | "ETF">;
  allowedStrategyTypes: Array<
    "mean_reversion" | "trend_following" | "stat_arb" | "factor"
    | "macro" | "execution" | "risk_overlay"
  >;
  allowedPersonaIds: string[];
  maxGrossExposurePct: number;          // 0–300
  maxNetExposurePct: number;            // 0–200
  maxSingleStrategyAllocationPct: number; // 0–100
  maxSinglePersonaAllocationPct: number;  // 0–100
  minCashReservePct: number;            // 0–100
  maxDrawdownPct: number;               // 0–100, > warningDrawdownPct
  warningDrawdownPct: number;           // 0–100, < maxDrawdownPct
  maxLeverage: number;                  // 0–10
  maxTurnoverDailyPct: number;
  maxConcentrationByAssetPct: number;
  maxCorrelationToExistingLive: number; // 0–1
  deployModesAllowed: Array<"research" | "paper" | "live">;
  emergencyRules: {
    autoFreezeOnDrawdownPct: number;
    autoIncidentOnRiskBreach: boolean;
    requireRiskOfficerForUnfreeze: boolean;
  };
  effectiveFrom: string;
  effectiveTo?: string;
  version: number;
  status: "draft" | "active" | "deprecated";
}

export interface MandateValidationError {
  field: keyof CapitalPoolMandate | string;
  messageKey: string;
}

export function validateMandate(m: CapitalPoolMandate): MandateValidationError[] {
  const errs: MandateValidationError[] = [];
  const between = (v: number, lo: number, hi: number) => v >= lo && v <= hi;
  if (!between(m.maxGrossExposurePct, 0, 300)) errs.push({ field: "maxGrossExposurePct", messageKey: "mandate.error.range_0_300" });
  if (!between(m.maxNetExposurePct, 0, 200)) errs.push({ field: "maxNetExposurePct", messageKey: "mandate.error.range_0_200" });
  if (!between(m.maxSingleStrategyAllocationPct, 0, 100)) errs.push({ field: "maxSingleStrategyAllocationPct", messageKey: "mandate.error.range_0_100" });
  if (!between(m.maxSinglePersonaAllocationPct, 0, 100)) errs.push({ field: "maxSinglePersonaAllocationPct", messageKey: "mandate.error.range_0_100" });
  if (!between(m.minCashReservePct, 0, 100)) errs.push({ field: "minCashReservePct", messageKey: "mandate.error.range_0_100" });
  if (!between(m.maxDrawdownPct, 0, 100)) errs.push({ field: "maxDrawdownPct", messageKey: "mandate.error.range_0_100" });
  if (!between(m.warningDrawdownPct, 0, 100)) errs.push({ field: "warningDrawdownPct", messageKey: "mandate.error.range_0_100" });
  if (m.warningDrawdownPct >= m.maxDrawdownPct) errs.push({ field: "warningDrawdownPct", messageKey: "mandate.error.warning_lt_max" });
  if (!between(m.maxLeverage, 0, 10)) errs.push({ field: "maxLeverage", messageKey: "mandate.error.range_0_10" });
  if (!between(m.maxCorrelationToExistingLive, 0, 1)) errs.push({ field: "maxCorrelationToExistingLive", messageKey: "mandate.error.range_0_1" });
  return errs;
}
