// Lightweight pub/sub for mock realtime events.
// Phase 16: connection status, last-event tracking, disconnect simulator.
type Handler = (payload: unknown) => void;

export type RealtimeStatus = "live" | "stale" | "offline";

interface RecentEvent {
  topic: string;
  ts: string;
  payload: unknown;
}

class RealtimeBus {
  private listeners = new Map<string, Set<Handler>>();
  private statusListeners = new Set<() => void>();
  private connected = true;
  private lastEventAt: number = Date.now();
  private recent: RecentEvent[] = [];
  private staleAfterMs = 30_000;
  private staleTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.staleTimer = setInterval(() => this.notifyStatus(), 5_000);
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
    this.recent.unshift({ topic, ts: new Date().toISOString(), payload });
    if (this.recent.length > 40) this.recent.pop();
    this.listeners.get(topic)?.forEach((h) => h(payload));
    this.notifyStatus();
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
      });
      this.listeners.get("data")?.forEach((h) => h({ kind: "*" }));
    } else {
      this.recent.unshift({
        topic: "system",
        ts: new Date().toISOString(),
        payload: { event: "disconnect" },
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
