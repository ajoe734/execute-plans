import type { Alert, Incident } from "@/lib/bff/types";

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : undefined;

const timestampFrom = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === "number" && Number.isFinite(value)) {
      const millis = value < 1_000_000_000_000 ? value * 1000 : value;
      const d = new Date(millis);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && !Number.isNaN(Date.parse(trimmed))) return trimmed;
    }
  }
  return undefined;
};

const stringFrom = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

const booleanFrom = (...values: unknown[]): boolean | undefined => {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "1"].includes(normalized)) return true;
      if (["false", "no", "0"].includes(normalized)) return false;
    }
  }
  return undefined;
};

const alertOpenedAt = (record: UnknownRecord): string | undefined =>
  timestampFrom(
    record.openedAt,
    record.opened_at,
    record.createdAt,
    record.created_at,
    record.detectedAt,
    record.detected_at,
    record.observedAt,
    record.observed_at,
    record.triggeredAt,
    record.triggered_at,
    record.occurredAt,
    record.occurred_at,
    record.eventTime,
    record.event_time,
    record.timestamp,
    record.ts,
    record.updatedAt,
    record.updated_at,
  );

const incidentOpenedAt = (record: UnknownRecord, timelineTs?: unknown): string | undefined =>
  timestampFrom(
    record.openedAt,
    record.opened_at,
    record.createdAt,
    record.created_at,
    record.detectedAt,
    record.detected_at,
    record.reportedAt,
    record.reported_at,
    record.occurredAt,
    record.occurred_at,
    record.startedAt,
    record.started_at,
    record.eventTime,
    record.event_time,
    record.timestamp,
    record.ts,
    timelineTs,
    record.updatedAt,
    record.updated_at,
  );

const normalizeIncidentTimeline = (value: unknown): Incident["timeline"] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry, index) => {
    const record = asRecord(entry);
    if (!record) return { ts: "", actor: "system", note: String(entry) };
    return {
      ts: timestampFrom(record.ts, record.timestamp, record.time, record.createdAt, record.created_at, record.occurredAt, record.occurred_at, record.updatedAt, record.updated_at) ?? "",
      actor: stringFrom(record.actor, record.user, record.author, record.source) ?? "system",
      note: stringFrom(record.note, record.message, record.summary, record.description) ?? `event ${index + 1}`,
    };
  });
};

export function normalizeAlertTimestampFields<T>(raw: T | undefined): T | undefined {
  const record = asRecord(raw);
  if (!record) return raw;

  const patched: UnknownRecord = { ...record };
  patched.id = stringFrom(record.id, record.alertId, record.alert_id, record.findingId, record.finding_id) ?? patched.id;
  patched.title = stringFrom(record.title, record.summary, record.message, record.name) ?? patched.title;
  patched.source = stringFrom(record.source, record.sourceKind, record.source_kind, record.origin, record.kind) ?? patched.source;
  patched.openedAt = alertOpenedAt(record) ?? patched.openedAt;

  const acknowledged = booleanFrom(record.acknowledged, record.acknowledged_at ? true : undefined);
  if (acknowledged !== undefined) patched.acknowledged = acknowledged;

  return patched as T;
}

export function normalizeIncidentTimestampFields<T>(raw: T | undefined): T | undefined {
  const record = asRecord(raw);
  if (!record) return raw;

  const timeline = normalizeIncidentTimeline(record.timeline ?? record.events ?? record.history);
  const firstTimelineTs = timeline?.find((entry) => entry.ts)?.ts;
  const patched: UnknownRecord = { ...record };
  patched.id = stringFrom(record.id, record.incidentId, record.incident_id) ?? patched.id;
  patched.title = stringFrom(record.title, record.summary, record.message, record.name) ?? patched.title;
  patched.openedAt = incidentOpenedAt(record, firstTimelineTs) ?? patched.openedAt;
  if (timeline) patched.timeline = timeline;

  return patched as T;
}

export const normalizeAlertTimestampList = <T>(rows: T[]): T[] =>
  rows.map((row) => normalizeAlertTimestampFields(row) as T);

export const normalizeIncidentTimestampList = <T>(rows: T[]): T[] =>
  rows.map((row) => normalizeIncidentTimestampFields(row) as T);
