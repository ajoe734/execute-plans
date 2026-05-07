// BFF Contract v1 — SSE bridge over the in-memory realtime bus (mock mode).
// In `live` mode this would be replaced by an EventSource/WS adapter.

import { realtime } from "../../bff/realtime";
import { type SseChannel, type SseEvent, isSseEvent, makeSseEvent } from "./channels";

let seq = 0;
function nextId(): string {
  return `evt_${Date.now().toString(36)}_${(++seq).toString(36)}`;
}

export type SseHandler<P = unknown> = (event: SseEvent<SseChannel, P>) => void;

/**
 * Subscribe to a v1 SSE channel. Internally listens on the realtime bus topic
 * `sse:<channel>` and on the legacy topic `<channel>:*`. Payloads not already
 * wrapped in an SseEvent envelope are wrapped on the fly.
 */
export function subscribe<P = unknown>(channel: SseChannel, handler: SseHandler<P>): () => void {
  const topic = `sse:${channel}`;
  const off = realtime.on(topic, (raw: unknown) => {
    if (isSseEvent(raw)) {
      handler(raw as SseEvent<SseChannel, P>);
    } else {
      handler(
        makeSseEvent<SseChannel, P>({
          id: nextId(),
          channel,
          type: `${channel}.event`,
          payload: raw as P,
        }),
      );
    }
  });
  return off;
}

/** Publish a typed event onto the bridge (mock mode helper). */
export function publish<P>(args: {
  channel: SseChannel;
  type: string;
  payload: P;
  correlationId?: string;
}): SseEvent<SseChannel, P> {
  const event = makeSseEvent({
    id: nextId(),
    channel: args.channel,
    type: args.type,
    payload: args.payload,
    correlationId: args.correlationId,
  });
  realtime.emit(`sse:${args.channel}`, event);
  return event;
}
