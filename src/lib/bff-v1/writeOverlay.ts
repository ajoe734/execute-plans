import { realtime } from "./sse/bridge";
import { auditEvents } from "@/mocks/seed";
import type { CreatableEntity } from "@/lib/writeIntents/types";
import { ENTITY_TO_LIVE_KIND, ENTITY_TO_SSE_CHANNEL } from "@/lib/writeIntents/createDefaults";
import { isSseChannel } from "./sse/channels";
import type { SseChannelKind } from "@/lib/v4/sseEnvelope";
import { newCorrelationId, newUuid } from "@/lib/v4/correlation";

export const WRITE_OVERLAY_TTL_MS = 30 * 60 * 1000;
export const WRITE_OVERLAY_GC_INTERVAL_MS = 60 * 1000;

interface OverlayItem {
  entity: CreatableEntity;
  data: Record<string, unknown>;
  expiresAt: number;
  correlationId: string;
  insertedAt: number;
}

export interface OverlayAddOptions {
  correlationId?: string;
  idempotencyKey?: string;
  confirmTokenId?: string;
  actor?: string;
}

class WriteOverlay {
  private created: OverlayItem[] = [];
  private idemKeys = new Map<string, string>();
  private deleted = new Set<string>();
  private patches = new Map<string, Record<string, unknown>>();
  private lastAuditHash: string | null = null;

  add(entity: CreatableEntity, data: Record<string, unknown>, opts: OverlayAddOptions = {}): string {
    this.gc();
    const correlationId = opts.correlationId ?? newCorrelationId();

    if (opts.idempotencyKey) {
      const prior = this.idemKeys.get(opts.idempotencyKey);
      if (prior) return prior;
    }

    this.created.push({
      entity,
      data,
      expiresAt: Date.now() + WRITE_OVERLAY_TTL_MS,
      correlationId,
      insertedAt: Date.now(),
    });

    const auditId = `aud_${newUuid().slice(0, 8)}`;
    if (opts.idempotencyKey) this.idemKeys.set(opts.idempotencyKey, auditId);

    const prevHash = this.lastAuditHash;
    const hash = `h_${auditId}`;
    this.lastAuditHash = hash;

    try {
      auditEvents.unshift({
        id: auditId,
        actor: opts.actor ?? "you",
        action: `${entity}.create`,
        target: String(data.id ?? ""),
        ts: new Date().toISOString(),
        memo: `Pack F mock create (overlay, ${WRITE_OVERLAY_TTL_MS / 60000}m TTL) corr=${correlationId}${opts.confirmTokenId ? ` ctok=${opts.confirmTokenId}` : ""}`,
        outcome: "ok",
        ephemeral: true,
        prevHash,
        hash,
      } as Parameters<typeof auditEvents.unshift>[0]);
    } catch {
      // seed shape variation; ignore
    }

    const REALTIME_CHANNELS: ReadonlySet<string> = new Set([
      "strategy", "deployment", "incident", "loop", "job", "rebalance",
      "capital", "persona", "review", "runtime", "risk", "session",
      "notification", "system",
    ]);
    const candidate = ENTITY_TO_SSE_CHANNEL[entity];
    const channel: SseChannelKind = (
      isSseChannel(candidate) && REALTIME_CHANNELS.has(candidate)
        ? candidate
        : "system"
    ) as SseChannelKind;
    realtime.emitEnvelope({
      topic: "data",
      channel,
      type: `${entity}.create`,
      payload: { kind: ENTITY_TO_LIVE_KIND[entity], action: "create", id: data.id },
      correlationId,
    });
    return auditId;
  }

  list<T = Record<string, unknown>>(entity: CreatableEntity): T[] {
    this.gc();
    return this.created
      .filter((c) => c.entity === entity)
      .filter((c) => !this.deleted.has(`${entity}:${String(c.data.id ?? "")}`))
      .sort((a, b) => b.insertedAt - a.insertedAt)
      .map((c) => this.applyPatch(entity, c.data) as T);
  }

  get<T extends { id?: unknown } = Record<string, unknown>>(entity: CreatableEntity, id: string): T | undefined {
    return this.list<T>(entity).find((item) => String(item.id ?? "") === id);
  }

  update(entity: CreatableEntity, id: string, patch: Record<string, unknown>, opts: OverlayAddOptions = {}): string {
    const key = `${entity}:${id}`;
    const prev = this.patches.get(key) ?? {};
    this.patches.set(key, { ...prev, ...patch });
    return this.emitAudit(entity, id, "update", opts);
  }

  softDelete(entity: CreatableEntity, id: string, opts: OverlayAddOptions = {}): string {
    this.deleted.add(`${entity}:${id}`);
    return this.emitAudit(entity, id, "delete", opts);
  }

  isDeleted(entity: CreatableEntity, id: string): boolean {
    return this.deleted.has(`${entity}:${id}`);
  }

  applyPatch<T>(entity: CreatableEntity, data: T): T {
    const id = (data as { id?: unknown })?.id;
    if (id == null) return data;
    const key = `${entity}:${String(id)}`;
    const patch = this.patches.get(key);
    if (!patch) return data;
    return { ...(data as Record<string, unknown>), ...patch } as T;
  }

  clear() {
    this.created = [];
    this.idemKeys.clear();
    this.deleted.clear();
    this.patches.clear();
    this.lastAuditHash = null;
  }

  private emitAudit(entity: CreatableEntity, id: string, op: "update" | "delete", opts: OverlayAddOptions): string {
    const correlationId = opts.correlationId ?? newCorrelationId();
    const auditId = `aud_${newUuid().slice(0, 8)}`;
    const prevHash = this.lastAuditHash;
    const hash = `h_${auditId}`;
    this.lastAuditHash = hash;
    try {
      auditEvents.unshift({
        id: auditId,
        actor: opts.actor ?? "you",
        action: `${entity}.${op}`,
        target: id,
        ts: new Date().toISOString(),
        memo: `Pack F mock ${op} (overlay) corr=${correlationId}${opts.confirmTokenId ? ` ctok=${opts.confirmTokenId}` : ""}`,
        outcome: "ok",
        ephemeral: true,
        prevHash,
        hash,
      } as Parameters<typeof auditEvents.unshift>[0]);
    } catch { /* seed shape variation */ }
    const candidate = ENTITY_TO_SSE_CHANNEL[entity];
    const REALTIME_CHANNELS: ReadonlySet<string> = new Set([
      "strategy", "deployment", "incident", "loop", "job", "rebalance",
      "capital", "persona", "review", "runtime", "risk", "session",
      "notification", "system",
    ]);
    const channel: SseChannelKind = (
      isSseChannel(candidate) && REALTIME_CHANNELS.has(candidate) ? candidate : "system"
    ) as SseChannelKind;
    realtime.emitEnvelope({
      topic: "data",
      channel,
      type: `${entity}.${op}`,
      payload: { kind: ENTITY_TO_LIVE_KIND[entity], action: op, id },
      correlationId,
    });
    return auditId;
  }

  private gc() {
    const now = Date.now();
    this.created = this.created.filter((c) => c.expiresAt > now);
  }

  startGcTimer(intervalMs = WRITE_OVERLAY_GC_INTERVAL_MS): () => void {
    const handle = setInterval(() => this.gc(), intervalMs);
    if (typeof (handle as unknown as { unref?: () => void }).unref === "function") {
      (handle as unknown as { unref: () => void }).unref();
    }
    return () => clearInterval(handle);
  }
}

export const writeOverlay = new WriteOverlay();

try {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (env?.MODE !== "test" && env?.NODE_ENV !== "test") {
    writeOverlay.startGcTimer();
  }
} catch {
  /* ignore */
}

export function withOverlay<T>(
  entity: CreatableEntity,
  loader: () => Promise<T[]>,
  compare?: (a: T, b: T) => number,
): () => Promise<T[]> {
  return async () => {
    const base = await loader();
    const filteredBase = base
      .filter((item) => {
        const id = (item as { id?: unknown })?.id;
        return id == null || !writeOverlay.isDeleted(entity, String(id));
      })
      .map((item) => writeOverlay.applyPatch(entity, item));
    const extras = writeOverlay.list<T>(entity);
    const merged = [...extras, ...filteredBase];
    return compare ? merged.slice().sort(compare) : merged;
  };
}
