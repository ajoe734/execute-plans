// Pack F F1 — entity write overlay (mock).
// In-memory only, 30-minute TTL. Refresh clears state.
// NEVER mutates seed constants. Distinct from src/lib/v5/overlay.ts (action overlay).

import { realtime } from "@/lib/bff/realtime";
import { auditEvents } from "@/mocks/seed";
import type { CreatableEntity } from "@/lib/writeIntents/types";
import { ENTITY_TO_LIVE_KIND } from "@/lib/writeIntents/createDefaults";

export const WRITE_OVERLAY_TTL_MS = 30 * 60 * 1000;

interface OverlayItem {
  entity: CreatableEntity;
  data: Record<string, unknown>;
  expiresAt: number;
}

class WriteOverlay {
  private created: OverlayItem[] = [];

  add(entity: CreatableEntity, data: Record<string, unknown>) {
    this.gc();
    this.created.push({ entity, data, expiresAt: Date.now() + WRITE_OVERLAY_TTL_MS });
    // audit event (in-memory append; persistence is fine — audit log is meant to grow)
    const auditId = `aud_${Math.random().toString(36).slice(2, 10)}`;
    try {
      auditEvents.unshift({
        id: auditId,
        actor: "you",
        action: `${entity}.create`,
        target: String(data.id ?? ""),
        ts: new Date().toISOString(),
        memo: `Pack F mock create (overlay, ${WRITE_OVERLAY_TTL_MS / 60000}m TTL)`,
        outcome: "ok",
      });
    } catch {
      // seed shape variation; ignore
    }
    realtime.emit("data", { kind: ENTITY_TO_LIVE_KIND[entity], action: "create", id: data.id });
    return auditId;
  }

  list<T = Record<string, unknown>>(entity: CreatableEntity): T[] {
    this.gc();
    return this.created.filter((c) => c.entity === entity).map((c) => c.data as T);
  }

  clear() { this.created = []; }

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
    // overlay items first so they're visible immediately
    return [...extras, ...base];
  };
}
