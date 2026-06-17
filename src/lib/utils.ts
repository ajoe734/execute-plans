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
