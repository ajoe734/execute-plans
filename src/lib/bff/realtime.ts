// Lightweight pub/sub for mock realtime events.
// Phase 16: connection status, last-event tracking, disconnect simulator.
// Pack C v4 §C029: lastEventId + heartbeat exposed for reconnect protocol.
// Pack D D26 (Batch III): emitEnvelope wraps payload in SseEventEnvelope (schemaVersion=1).
import { SSE_HEARTBEAT_INTERVAL_MS } from "@/lib/v4/sseProtocol";
import { makeSseEnvelope, type SseChannelKind, type SseEventEnvelope } from "@/lib/v4/sseEnvelope";
type Handler = (payload: unknown) => void;

export type RealtimeStatus = "live" | "stale" | "offline";

interface RecentEvent {
  topic: string;
  ts: string;
  payload: unknown;
  /** Pack C C029 — monotonically sortable event id used for replay (Last-Event-Id). */
  id: string;
}

class RealtimeBus {
  private listeners = new Map<string, Set<Handler>>();
  private statusListeners = new Set<() => void>();
  private connected = true;
  private lastEventAt: number = Date.now();
  private lastEventId: string = "";
  private recent: RecentEvent[] = [];
  private staleAfterMs = 30_000;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private eventSeq = 0;

  constructor() {
    if (typeof window !== "undefined") {
      this.staleTimer = setInterval(() => this.notifyStatus(), 5_000);
      this.heartbeatTimer = setInterval(() => {
        if (this.connected) this.lastEventAt = this.lastEventAt; // heartbeat keeps timestamp
      }, SSE_HEARTBEAT_INTERVAL_MS);
    }
  }

  on(topic: string, h: Handler) {
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic)!.add(h);
    return () => this.listeners.get(topic)?.delete(h);
  }

  emit(topic: string, payload: unknown) {
    if (!this.connected) return; // simulate dropped events while offline
    this.lastEventAt = Date.now();
    const id = `${this.lastEventAt.toString(36)}-${(++this.eventSeq).toString(36)}`.toUpperCase();
    this.lastEventId = id;
    this.recent.unshift({ topic, ts: new Date().toISOString(), payload, id });
    if (this.recent.length > 40) this.recent.pop();
    this.listeners.get(topic)?.forEach((h) => h(payload));
    this.notifyStatus();
  }

  /** Pack C C029 — Last-Event-Id for SSE reconnect. */
  getLastEventId(): string { return this.lastEventId; }

  /** Pack D D26 — emit a typed SseEventEnvelope on the named topic. */
  emitEnvelope<T>(args: {
    topic: string;
    channel: SseChannelKind;
    type: string;
    payload: T;
    correlationId?: string;
    causationId?: string;
  }): SseEventEnvelope<T> {
    const id = `${Date.now().toString(36)}-${(++this.eventSeq).toString(36)}`.toUpperCase();
    const envelope = makeSseEnvelope({
      id,
      channel: args.channel,
      type: args.type,
      payload: args.payload,
      correlationId: args.correlationId,
      causationId: args.causationId,
    });
    this.emit(args.topic, envelope);
    return envelope;
  }

  // ---- status / introspection ----
  onStatus(h: () => void): () => void {
    this.statusListeners.add(h);
    return () => this.statusListeners.delete(h);
  }
  private notifyStatus() {
    this.statusListeners.forEach((h) => h());
  }
  getStatus(): RealtimeStatus {
    if (!this.connected) return "offline";
    if (Date.now() - this.lastEventAt > this.staleAfterMs) return "stale";
    return "live";
  }
  getLastEventAt(): number {
    return this.lastEventAt;
  }
  getRecent(): readonly RecentEvent[] {
    return this.recent;
  }

  // ---- mock connection control (QA Studio) ----
  setConnected(v: boolean) {
    if (this.connected === v) return;
    this.connected = v;
    if (v) {
      // on reconnect, mark a sync event so listeners can refetch
      this.lastEventAt = Date.now();
      this.recent.unshift({
        topic: "system",
        ts: new Date().toISOString(),
        payload: { event: "reconnect" },
        id: `sys-${Date.now().toString(36)}-${(++this.eventSeq).toString(36)}`,
      });
      this.listeners.get("data")?.forEach((h) => h({ kind: "*" }));
    } else {
      this.recent.unshift({
        topic: "system",
        ts: new Date().toISOString(),
        payload: { event: "disconnect" },
        id: `sys-${Date.now().toString(36)}-${(++this.eventSeq).toString(36)}`,
      });
    }
    this.notifyStatus();
  }
  isConnected() {
    return this.connected;
  }
}

export const realtime = new RealtimeBus();

export type RealtimeJobEvent = {
  jobId: string;
  status: "queued" | "running" | "success" | "failed";
  ts: string;
};
