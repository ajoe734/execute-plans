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
import { ENTITY_TO_LIVE_KIND } from "@/lib/writeIntents/createDefaults";
import { newCorrelationId, newUuid } from "@/lib/v4/correlation";

export const WRITE_OVERLAY_TTL_MS = 30 * 60 * 1000;

interface OverlayItem {
  entity: CreatableEntity;
  data: Record<string, unknown>;
  expiresAt: number;
  correlationId: string;
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
    });

    const auditId = `aud_${newUuid().slice(0, 8)}`;
    if (opts.idempotencyKey) this.idemKeys.set(opts.idempotencyKey, auditId);

    try {
      auditEvents.unshift({
        id: auditId,
        actor: opts.actor ?? "you",
        action: `${entity}.create`,
        target: String(data.id ?? ""),
        ts: new Date().toISOString(),
        memo: `Pack F mock create (overlay, ${WRITE_OVERLAY_TTL_MS / 60000}m TTL) corr=${correlationId}${opts.confirmTokenId ? ` ctok=${opts.confirmTokenId}` : ""}`,
        outcome: "ok",
      });
    } catch {
      // seed shape variation; ignore
    }

    realtime.emitEnvelope({
      topic: "data",
      channel: "system",
      type: `${entity}.create`,
      payload: { kind: ENTITY_TO_LIVE_KIND[entity], action: "create", id: data.id },
      correlationId,
    });
    return auditId;
  }

  list<T = Record<string, unknown>>(entity: CreatableEntity): T[] {
    this.gc();
    return this.created.filter((c) => c.entity === entity).map((c) => c.data as T);
  }

  clear() { this.created = []; this.idemKeys.clear(); }

  private gc() {
    const now = Date.now();
    this.created = this.created.filter((c) => c.expiresAt > now);
  }
}

export const writeOverlay = new WriteOverlay();

/** Wrap a list loader so overlay-created items appear merged on top. */
export function withOverlay<T>(entity: CreatableEntity, loader: () => Promise<T[]>): () => Promise<T[]> {
  return async () => {
    const base = await loader();
    const extras = writeOverlay.list<T>(entity);
    return [...extras, ...base];
  };
}
