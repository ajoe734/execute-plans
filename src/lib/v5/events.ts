// Q15 + Q19 — v5 typed event envelope. Transport reuses src/lib/bff/realtime.ts.
// NOT the final backend SSE schema (D26 may revise).

import { realtime } from "@/lib/bff/realtime";

export const V5_EVENT_SCHEMA_VERSION = 1 as const;

export type V5EventChannel =
  | `v5.loop.${string}`
  | `v5.execution.${string}`
  | `v5.optimization.${string}`
  | `v5.sentinel.${string}`
  | `v5.intervention.${string}`;

export interface V5EventEnvelope<P = unknown> {
  id: string;
  schemaVersion: typeof V5_EVENT_SCHEMA_VERSION;
  channel: V5EventChannel;
  type: string;
  occurredAt: string;
  correlationId?: string;
  payload: P;
}

export const V5_EVENT_TOPIC = "v5";

let seq = 0;

export function emitV5Event<P>(args: {
  channel: V5EventChannel;
  type: string;
  payload: P;
  correlationId?: string;
}): V5EventEnvelope<P> {
  const env: V5EventEnvelope<P> = {
    id: `v5_${Date.now().toString(36)}_${(++seq).toString(36)}`,
    schemaVersion: V5_EVENT_SCHEMA_VERSION,
    channel: args.channel,
    type: args.type,
    occurredAt: new Date().toISOString(),
    correlationId: args.correlationId,
    payload: args.payload,
  };
  realtime.emit(V5_EVENT_TOPIC, env);
  // Q22 — also emit legacy data refresh for useLiveList listeners.
  realtime.emit("data", { kind: "v5", channel: args.channel, type: args.type });
  return env;
}

export function onV5Event(handler: (env: V5EventEnvelope) => void): () => void {
  return realtime.on(V5_EVENT_TOPIC, (p) => handler(p as V5EventEnvelope));
}
