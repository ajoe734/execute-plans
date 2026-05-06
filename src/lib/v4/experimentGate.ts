// v4 / Pack C §C044 — Experiment promote gating thresholds.

export interface ExperimentPromoteGate {
  minSampleSize: number;
  minOosDurationDays: number;
  maxPValue: number;
  minSharpe: number;
  maxDrawdownPct: number;
  requiresDataLeakagePass: true;
  requiresReproducibilityHash: true;
}

export const EXPERIMENT_PROMOTE_GATE_DEFAULT: ExperimentPromoteGate = {
  minSampleSize: 252,
  minOosDurationDays: 90,
  maxPValue: 0.10,
  minSharpe: 0.8,
  maxDrawdownPct: 0.30,
  requiresDataLeakagePass: true,
  requiresReproducibilityHash: true,
};
