// Pack F F1 — entity write overlay (mock).
// In-memory only, 30-minute TTL. Refresh clears state.
// NEVER mutates seed constants. Distinct from src/lib/v5/overlay.ts (action overlay).
//
// Pack D Batch IV: every overlay write now carries a correlationId chain
// (D60) and accepts an optional idempotencyKey + confirm token binding (D45)
// pending real BFF wiring.

import { realtime } from "@/lib/bff/realtime";
import { auditEvents } from "@/mocks/seed";
import type { CreatableEntity } from "@/lib/writeIntents/types";
import { ENTITY_TO_LIVE_KIND, ENTITY_TO_SSE_CHANNEL } from "@/lib/writeIntents/createDefaults";
import { isSseChannel } from "@/lib/bff-v1/sse/channels";
import type { SseChannelKind } from "@/lib/v4/sseEnvelope";
import { newCorrelationId, newUuid } from "@/lib/v4/correlation";

export const WRITE_OVERLAY_TTL_MS = 30 * 60 * 1000;
// G12 — periodic GC so expired entries drop even when no add/list call fires.
export const WRITE_OVERLAY_GC_INTERVAL_MS = 60 * 1000;

interface OverlayItem {
  entity: CreatableEntity;
  data: Record<string, unknown>;
  expiresAt: number;
  correlationId: string;
  /** G14 — monotonic insertion stamp for stable sort ties. */
  insertedAt: number;
}

export interface OverlayAddOptions {
  /** Pack D D60 — reuse caller's chain id; auto-mint when omitted. */
  correlationId?: string;
  /** Pack D D45 — caller-supplied idempotency key (mock; not enforced server-side). */
  idempotencyKey?: string;
  /** Pack D D45 — bound confirm token id, if redeemed. */
  confirmTokenId?: string;
  actor?: string;
}

class WriteOverlay {
  private created: OverlayItem[] = [];
  private idemKeys = new Map<string, string>();
  /** G13 — last audit hash, mock-only placeholder for prevHash chain. */
  private lastAuditHash: string | null = null;

  add(entity: CreatableEntity, data: Record<string, unknown>, opts: OverlayAddOptions = {}): string {
    this.gc();
    const correlationId = opts.correlationId ?? newCorrelationId();

    // Pack D D45 — replay-on-idempotency: same key returns prior auditId.
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

    // G13 — placeholder prevHash so downstream audit chain validators see a field.
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
        // G13 placeholder — real BFF will compute Merkle-style chain.
        prevHash,
        hash,
      } as Parameters<typeof auditEvents.unshift>[0]);
    } catch {
      // seed shape variation; ignore
    }

    // G06 — publish to a verified SSE channel; fall back to "system" only when unmapped.
    const channelCandidate = ENTITY_TO_SSE_CHANNEL[entity];
    const channel = isSseChannel(channelCandidate) ? channelCandidate : "system";
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
      // G14 — newest first by default; consumers can re-sort after merge.
      .sort((a, b) => b.insertedAt - a.insertedAt)
      .map((c) => c.data as T);
  }

  clear() { this.created = []; this.idemKeys.clear(); this.lastAuditHash = null; }

  private gc() {
    const now = Date.now();
    this.created = this.created.filter((c) => c.expiresAt > now);
  }

  /** G12 — call once at module load to schedule periodic GC. Test-safe. */
  startGcTimer(intervalMs = WRITE_OVERLAY_GC_INTERVAL_MS): () => void {
    const handle = setInterval(() => this.gc(), intervalMs);
    if (typeof (handle as unknown as { unref?: () => void }).unref === "function") {
      (handle as unknown as { unref: () => void }).unref();
    }
    return () => clearInterval(handle);
  }
}

export const writeOverlay = new WriteOverlay();

// Auto-start GC outside of test environment (vitest sets MODE='test').
try {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (env?.MODE !== "test" && env?.NODE_ENV !== "test") {
    writeOverlay.startGcTimer();
  }
} catch {
  /* ignore */
}

/** Wrap a list loader so overlay-created items appear merged on top.
 *  G14 — accepts an optional comparator so the merged list re-sorts after prepend. */
export function withOverlay<T>(
  entity: CreatableEntity,
  loader: () => Promise<T[]>,
  compare?: (a: T, b: T) => number,
): () => Promise<T[]> {
  return async () => {
    const base = await loader();
    const extras = writeOverlay.list<T>(entity);
    const merged = [...extras, ...base];
    return compare ? merged.slice().sort(compare) : merged;
  };
}

