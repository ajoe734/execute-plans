import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a timestamp for display, returning "—" for missing/unparseable values
 * instead of "Invalid Date". Live BFF rows often omit or snake-case the field.
 */
export function safeDateTime(value: unknown, mode: "datetime" | "date" | "time" = "datetime"): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = new Date(value as string | number | Date);
  if (Number.isNaN(d.getTime())) return "—";
  return mode === "date" ? d.toLocaleDateString() : mode === "time" ? d.toLocaleTimeString() : d.toLocaleString();
}

/** Coerce a possibly-missing live-BFF numeric field to a finite number, defaulting to 0. */
export function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Format a fraction (0..1) as a percent string, e.g. `safePercent(0.42)` -> "42.0%".
 * Returns "—" instead of "NaN%" when the value isn't a finite number.
 */
export function safePercent(value: unknown, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * Safely divide two possibly-missing numbers, returning 0 (never NaN/Infinity)
 * when either operand is missing or the denominator is zero.
 */
export function safeRatio(numerator: unknown, denominator: unknown): number {
  const n = typeof numerator === "number" ? numerator : Number(numerator);
  const d = typeof denominator === "number" ? denominator : Number(denominator);
  return Number.isFinite(n) && Number.isFinite(d) && d !== 0 ? n / d : 0;
}
