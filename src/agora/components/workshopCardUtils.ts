import i18n from "@/i18n";
import type { WorkshopCardType } from "@/lib/bff-v1/agora/workshops";

export type UnknownRecord = Record<string, unknown>;

export function workshopCopy(key: string, fallback: string, options?: Record<string, unknown>): string {
  const translated = i18n.t(key, { defaultValue: fallback, ...(options ?? {}) });
  return typeof translated === "string" && translated !== key ? translated : fallback;
}

export function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

export function maybeRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

export function recordList(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(maybeRecord).filter(Boolean) : [];
}

export function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export function optionalString(value: unknown): string | undefined {
  const s = stringValue(value).trim();
  return s.length > 0 ? s : undefined;
}

export function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => stringValue(item).trim())
      .filter((item) => item.length > 0);
  }
  const single = stringValue(value).trim();
  return single.length > 0 ? [single] : [];
}

export function formatLabel(value: unknown): string {
  const raw = stringValue(value);
  if (!raw) return "";
  const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const valueKey = `agora.workshop.values.${normalized}`;
  if (i18n.exists(valueKey)) {
    return String(i18n.t(valueKey));
  }
  const labelKey = `agora.workshop.cardLabels.${normalized}`;
  if (i18n.exists(labelKey)) {
    return String(i18n.t(labelKey));
  }
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function formatScalar(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toLocaleString();
  if (typeof value === "boolean") {
    return value
      ? workshopCopy("agora.workshop.values.yes", "是")
      : workshopCopy("agora.workshop.values.no", "否");
  }
  if (typeof value === "string") return value;
  return "-";
}

export function clampPercent(value: unknown): number {
  const n = numberValue(value);
  if (n === undefined) return 0;
  return Math.max(0, Math.min(100, n));
}

export function cardTypeLabel(type: WorkshopCardType): string {
  const key = `agora.workshop.cardLabels.${type}`;
  if (i18n.exists(key)) {
    return String(i18n.t(key));
  }
  return formatLabel(type);
}

export function rendererForChartKind(kind: unknown): "Recharts" | "ECharts" | "Builtin" | "Unsupported" {
  const k = stringValue(kind);
  if (["metric", "line", "area", "bar", "stacked_bar"].includes(k)) return "Recharts";
  if (["heatmap", "network", "sankey", "candlestick", "gauge", "scatter"].includes(k)) {
    return "ECharts";
  }
  if (["table", "timeline"].includes(k)) return "Builtin";
  return "Unsupported";
}

export function scalarEntries(record: UnknownRecord): Array<[string, unknown]> {
  return Object.entries(record).filter(([, value]) => {
    return (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    );
  });
}
