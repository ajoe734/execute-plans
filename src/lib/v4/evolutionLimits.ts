// v4 / Pack C §C043 — Evolution constraints validation + dry-run.

export interface RangeSpec { min: number; max: number; step: number }

export interface EvolutionRunLimits {
  populationSize: RangeSpec;
  maxGenerations: RangeSpec;
  maxComputeUsd: RangeSpec;
  maxWallClockHours: RangeSpec;
  maxConcurrentRuns: RangeSpec;
}

export const EVOLUTION_LIMITS_DEFAULT: EvolutionRunLimits = {
  populationSize: { min: 4, max: 500, step: 1 },
  maxGenerations: { min: 1, max: 200, step: 1 },
  maxComputeUsd: { min: 10, max: 50_000, step: 10 },
  maxWallClockHours: { min: 1, max: 168, step: 1 },
  maxConcurrentRuns: { min: 1, max: 20, step: 1 },
};

export interface EvolutionDryRunResponse {
  valid: boolean;
  warnings: string[];
  projectedCost: number;
  projectedRuntime: number; // hours
}

export function validateRange(value: number, spec: RangeSpec): string | null {
  if (value < spec.min || value > spec.max) return `out of range [${spec.min}, ${spec.max}]`;
  if ((value - spec.min) % spec.step !== 0) return `must be step of ${spec.step}`;
  return null;
}
