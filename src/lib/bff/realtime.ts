// Lightweight pub/sub for mock realtime events
type Handler = (payload: unknown) => void;

class RealtimeBus {
  private listeners = new Map<string, Set<Handler>>();
  on(topic: string, h: Handler) {
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic)!.add(h);
    return () => this.listeners.get(topic)?.delete(h);
  }
  emit(topic: string, payload: unknown) {
    this.listeners.get(topic)?.forEach((h) => h(payload));
  }
}

export const realtime = new RealtimeBus();

export type RealtimeJobEvent = {
  jobId: string;
  status: "queued" | "running" | "success" | "failed";
  ts: string;
};
