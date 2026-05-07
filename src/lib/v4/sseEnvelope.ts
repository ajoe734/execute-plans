// Pack D D26 — SseEventEnvelope (schemaVersion=1) wrapper (Batch III).
// Source: .lovable/spec/v4/pack-d/Pantheon_Pack_D_SSE_Event_Contract.md
//
// Co-exists with Pack C `SseEnvelope` (sseProtocol.ts) as a stricter typed
// discriminated union with explicit schemaVersion. Realtime bus exposes a
// dedicated `emitEnvelope` helper; legacy `emit` calls remain valid.

export const SSE_SCHEMA_VERSION = 1 as const;

export type SseChannelKind =
  | "strategy"
  | "deployment"
  | "incident"
  | "loop"
  | "job"
  | "rebalance"
  | "capital"
  | "persona"
  | "review"
  | "runtime"
  | "risk"
  | "session"
  | "notification"
  | "system";

export interface SseEventEnvelope<TPayload = unknown> {
  schemaVersion: typeof SSE_SCHEMA_VERSION;
  /** Monotonically sortable id (ULID-like). Used for Last-Event-Id replay. */
  id: string;
  channel: SseChannelKind;
  type: string;
  occurredAt: string;
  /** Pack D D60 — correlation chain id. */
  correlationId?: string;
  causationId?: string;
  payload: TPayload;
}

export interface MakeEnvelopeArgs<T> {
  id: string;
  channel: SseChannelKind;
  type: string;
  payload: T;
  occurredAt?: string;
  correlationId?: string;
  causationId?: string;
}

export function makeSseEnvelope<T>(args: MakeEnvelopeArgs<T>): SseEventEnvelope<T> {
  return {
    schemaVersion: SSE_SCHEMA_VERSION,
    id: args.id,
    channel: args.channel,
    type: args.type,
    occurredAt: args.occurredAt ?? new Date().toISOString(),
    correlationId: args.correlationId,
    causationId: args.causationId,
    payload: args.payload,
  };
}

export function isSseEventEnvelope(value: unknown): value is SseEventEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { schemaVersion?: unknown }).schemaVersion === SSE_SCHEMA_VERSION &&
    typeof (value as { channel?: unknown }).channel === "string" &&
    typeof (value as { type?: unknown }).type === "string"
  );
}
