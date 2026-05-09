// Lightweight pub/sub for mock realtime events.
// Phase 16: connection status, last-event tracking, disconnect simulator.
// Pack C v4 §C029: lastEventId + heartbeat exposed for reconnect protocol.
// Pack D D26 (Batch III): emitEnvelope wraps payload in SseEventEnvelope (schemaVersion=1).
import { SSE_HEARTBEAT_INTERVAL_MS } from "@/lib/v4/sseProtocol";
import { makeSseEnvelope, type SseChannelKind, type SseEventEnvelope } from "@/lib/v4/sseEnvelope";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
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
    const id = this.payloadEventId(payload) ?? `${this.lastEventAt.toString(36)}-${(++this.eventSeq).toString(36)}`.toUpperCase();
    this.lastEventId = id;
    this.recent.unshift({ topic, ts: new Date().toISOString(), payload, id });
    if (this.recent.length > 40) this.recent.pop();
    this.listeners.get(topic)?.forEach((h) => h(payload));
    if (topic.startsWith("sse:")) this.bridgeSseEvent(payload);
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
    if (liveStatus.get().mode === "live") return;
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

  // ---- live EventSource connection control ----
  markLiveOpen() {
    if (liveStatus.get().mode !== "live") return;
    this.connected = true;
    this.lastEventAt = Date.now();
    this.notifyStatus();
  }

  markLiveError() {
    if (liveStatus.get().mode !== "live") return;
    this.connected = false;
    this.notifyStatus();
  }

  private payloadEventId(payload: unknown): string | undefined {
    const record = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as { id?: unknown }
      : {};
    const id = String(record.id ?? "").trim();
    return id || undefined;
  }

  private bridgeSseEvent(payload: unknown) {
    const record = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as { channel?: unknown; type?: unknown; id?: unknown; occurredAt?: unknown; payload?: unknown; correlationId?: unknown }
      : {};
    const channel = String(record.channel ?? "").trim();
    if (!channel) return;
    const type = String(record.type ?? `${channel}.event`);
    const dataPayload = { kind: channel, channel, type, event: payload };
    this.listeners.get("data")?.forEach((h) => h(dataPayload));
    if (["loop", "sentinel", "intervention"].includes(channel)) {
      this.listeners.get("v5")?.forEach((h) => h({
        id: String(record.id ?? this.lastEventId),
        schemaVersion: 1,
        channel: `v5.${channel}.live`,
        type,
        occurredAt: String(record.occurredAt ?? new Date().toISOString()),
        correlationId: typeof record.correlationId === "string" ? record.correlationId : undefined,
        payload: record.payload ?? payload,
      }));
    }
  }
}

export const realtime = new RealtimeBus();

export type RealtimeJobEvent = {
  jobId: string;
  status: "queued" | "running" | "success" | "failed";
  ts: string;
};
