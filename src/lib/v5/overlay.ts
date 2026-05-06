// Q10 + Q27 — v5 in-memory action overlay. 30 min TTL. NEVER writes back to seed.
// Refresh resets state. No localStorage / DB persistence.

export const OVERLAY_TTL_MS = 30 * 60 * 1000;

export interface OverlayPersonaPatch {
  routingPaused?: boolean;
  forcedMode?: "live" | "paper" | "shadow" | "suspended";
  reason?: string;
}

export interface OverlayStrategyPatch {
  allocationReduced?: number; // 0..1 reduction factor
  rebalanceFrozen?: boolean;
  reason?: string;
}

interface OverlayEntry<T> {
  value: T;
  expiresAt: number;
}

class V5ActionOverlay {
  private personas = new Map<string, OverlayEntry<OverlayPersonaPatch>>();
  private strategies = new Map<string, OverlayEntry<OverlayStrategyPatch>>();

  setPersona(id: string, patch: OverlayPersonaPatch, ttlMs = OVERLAY_TTL_MS) {
    const cur = this.getPersona(id) ?? {};
    this.personas.set(id, { value: { ...cur, ...patch }, expiresAt: Date.now() + ttlMs });
  }
  getPersona(id: string): OverlayPersonaPatch | undefined {
    const e = this.personas.get(id);
    if (!e) return undefined;
    if (e.expiresAt < Date.now()) { this.personas.delete(id); return undefined; }
    return e.value;
  }

  setStrategy(id: string, patch: OverlayStrategyPatch, ttlMs = OVERLAY_TTL_MS) {
    const cur = this.getStrategy(id) ?? {};
    this.strategies.set(id, { value: { ...cur, ...patch }, expiresAt: Date.now() + ttlMs });
  }
  getStrategy(id: string): OverlayStrategyPatch | undefined {
    const e = this.strategies.get(id);
    if (!e) return undefined;
    if (e.expiresAt < Date.now()) { this.strategies.delete(id); return undefined; }
    return e.value;
  }

  clear() { this.personas.clear(); this.strategies.clear(); }

  /** Test helper. */
  _force(now: number) {
    for (const [k, v] of this.personas) if (v.expiresAt < now) this.personas.delete(k);
    for (const [k, v] of this.strategies) if (v.expiresAt < now) this.strategies.delete(k);
  }
}

export const v5ActionOverlay = new V5ActionOverlay();
