import type { TFunction } from "i18next";

/** Resolve additive BFF copy keys without ever exposing a raw key to operators. */
export function agoraCopy(t: TFunction, key: string | undefined, fallback: string): string {
  if (!key) return fallback;
  const translated = t(key, { defaultValue: fallback });
  return translated === key ? fallback : translated;
}
