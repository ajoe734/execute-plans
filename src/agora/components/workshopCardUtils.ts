import type { WorkshopCardType } from "@/lib/bff-v1/agora/workshops";

export type UnknownRecord = Record<string, unknown>;

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
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function formatScalar(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  return "-";
}

export function clampPercent(value: unknown): number {
  const n = numberValue(value);
  if (n === undefined) return 0;
  return Math.max(0, Math.min(100, n));
}

export function cardTypeLabel(type: WorkshopCardType): string {
  const labels: Record<WorkshopCardType, string> = {
    user_strategy_description: "Strategy Description",
    servant_reconstruction: "Servant Reconstruction",
    completeness_update: "Completeness Update",
    missing_definition: "Missing Definition",
    next_question: "Next Question",
    research_plan_proposal: "Research Plan",
    research_progress: "Research Progress",
    research_result: "Research Result",
    consult_result: "Consult Result",
    version_patch_proposal: "Version Patch",
    version_compare: "Version Compare",
    readiness_gate: "Readiness Gate",
    persona_opinion: "Persona Opinion",
    opinion: "Persona Opinion",
    debate: "Debate",
  };
  return labels[type] ?? formatLabel(type);
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
