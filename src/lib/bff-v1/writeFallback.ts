// 2026-05-28 — Global write-path fallback.
// BFF write endpoints (P0-D / P1-A / P1-C / P1-E) are not yet verified live.
// When a write returns 404 / 405 / 501 (or typed code NOT_IMPLEMENTED /
// RESOURCE_NOT_FOUND on a write path), degrade to writeOverlay + signal the
// LiveStatusBanner so the operator knows the result is local-only.
//
// See `.lovable/audits/bff-backend-write-gap-2026-05-28.md`.

import { writeOverlay } from "@/lib/bff/writeOverlay";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import type { CreatableEntity } from "@/lib/writeIntents/types";

export interface WriteFallbackOptions<TArgs> {
  /** Logical write target, used for telemetry + degraded banner copy. */
  endpoint: string;
  /** Optional entity for writeOverlay degrade (only used when payload is a creatable entity). */
  overlayEntity?: CreatableEntity;
  /** Payload to stash in writeOverlay when degraded; omit to skip overlay. */
  overlayPayload?: Record<string, unknown>;
  /** Caller args used for the operation; passed through to logs only. */
  args?: TArgs;
}

export interface WriteFallbackResult<T> {
  ok: boolean;
  data?: T;
  degraded: boolean;
  reason?: string;
  status?: number;
}

const NOT_IMPL_STATUSES = new Set([404, 405, 501]);
const NOT_IMPL_CODES = new Set(["NOT_IMPLEMENTED", "RESOURCE_NOT_FOUND", "METHOD_NOT_ALLOWED", "ROUTE_NOT_FOUND"]);

interface ThrownLike {
  status?: number;
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
}

function looksNotImplemented(err: unknown): { yes: boolean; status?: number; reason?: string } {
  if (!err || typeof err !== "object") return { yes: false };
  const e = err as ThrownLike;
  const status = e.status ?? 0;
  const code = e.code ?? e.error?.code ?? "";
  if (NOT_IMPL_STATUSES.has(status)) return { yes: true, status, reason: `HTTP ${status}` };
  if (NOT_IMPL_CODES.has(code)) return { yes: true, status, reason: code };
  return { yes: false };
}

/**
 * Wrap a write call. On NOT_IMPLEMENTED-ish failure, optionally write the
 * payload to overlay (30min TTL) and record degraded state for the banner.
 *
 * Returns `{ degraded: true }` rather than throwing so callers can render a
 * success-with-warning UI.
 */
export async function withWriteFallback<T>(
  fn: () => Promise<T>,
  opts: WriteFallbackOptions<unknown>,
): Promise<WriteFallbackResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, degraded: false };
  } catch (err) {
    const m = looksNotImplemented(err);
    if (!m.yes) {
      // Propagate typed errors unchanged.
      throw err;
    }
    if (opts.overlayEntity && opts.overlayPayload) {
      try {
        writeOverlay.add(opts.overlayEntity, opts.overlayPayload, { actor: "agent-fallback" });
      } catch {
        /* overlay never throws but be safe */
      }
    }
    liveStatus.recordWriteDegraded?.(opts.endpoint, m.reason ?? "not implemented");
    return { ok: true, degraded: true, reason: m.reason, status: m.status };
  }
}
