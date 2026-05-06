// v4 / Pack C §C042 — Currency / FX policy.

export const PLATFORM_BASE_CURRENCY = "USD" as const;

export interface MoneyDual {
  /** Pre-converted to platform base currency. */
  baseAmount: number;
  baseCurrency: typeof PLATFORM_BASE_CURRENCY;
  /** Pre-converted to pool's display currency (may equal base). */
  displayAmount: number;
  displayCurrency: string;
  fxRateApplied?: number;
  fxAsOf?: string;
}

/** Pack C C042: frontend MUST NOT perform FX conversion. */
export const FRONTEND_FX_FORBIDDEN = true as const;
