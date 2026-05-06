// v4 / Pack C §C046–C049 — i18n format tokens + UGC policy.

export type FormatToken =
  | "datetime.short" | "datetime.date" | "number.decimal"
  | "percent" | "money.usd" | "money.base";

export const FORMAT_PATTERNS: Record<FormatToken, { "zh-TW": string; "en-US": string; fallback: string }> = {
  "datetime.short": { "zh-TW": "yyyy/MM/dd HH:mm", "en-US": "MMM d, yyyy HH:mm", fallback: "ISO string" },
  "datetime.date":  { "zh-TW": "yyyy/MM/dd",      "en-US": "MMM d, yyyy",       fallback: "ISO date" },
  "number.decimal": { "zh-TW": "1,234.56",        "en-US": "1,234.56",          fallback: "raw" },
  "percent":        { "zh-TW": "12.34%",          "en-US": "12.34%",            fallback: "raw" },
  "money.usd":      { "zh-TW": "US$1,234.56",     "en-US": "$1,234.56",         fallback: "USD 1234.56" },
  "money.base":     { "zh-TW": "{{currency}} {{amount}}", "en-US": "{{currency}} {{amount}}", fallback: "raw" },
};

/** Pack C C046: UGC stored as-is; no auto-detection in v4. */
export const UGC_AUTO_DETECT_LOCALE = false as const;

/** Pack C C048: zh-HK / zh-CN are future work. */
export const SUPPORTED_LOCALES = ["zh-TW", "en-US"] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];
