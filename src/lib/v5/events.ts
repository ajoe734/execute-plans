// Q15 + Q19 — v5 typed event envelope. Pure DTO only; ACG-03-014 moved the
// transport (emit/subscribe) side effect to src/lib/bff-v1/v5.ts, the live
// V5 API owner. This module must not import bff/bff-v1 runtime code.
// NOT the final backend SSE schema (D26 may revise).

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

/** Pure envelope builder — no transport side effect. Emission is owned by
 *  src/lib/bff-v1/v5.ts (ACG-03-015), the live V5 API owner. */
export function makeV5Event<P>(args: {
  channel: V5EventChannel;
  type: string;
  payload: P;
  correlationId?: string;
}): V5EventEnvelope<P> {
  return {
    id: `v5_${Date.now().toString(36)}_${(++seq).toString(36)}`,
    schemaVersion: V5_EVENT_SCHEMA_VERSION,
    channel: args.channel,
    type: args.type,
    occurredAt: new Date().toISOString(),
    correlationId: args.correlationId,
    payload: args.payload,
  };
}
