// v4 / Pack C §C064 — Audit immutability guard.
// Mutations only ever prepend to the audit array; never edit/delete.
// This wrapper turns each event into a frozen object at write time.

import type { AuditEvent } from "@/lib/bff/types";

export function freezeAudit(ev: AuditEvent): Readonly<AuditEvent> {
  return Object.freeze({ ...ev });
}

export function assertAppendOnly(prev: readonly AuditEvent[], next: readonly AuditEvent[]): void {
  if (next.length < prev.length) throw new Error("audit log shrank — immutability violated");
  // last `prev.length` items of next must equal prev (since we unshift new entries).
  const tail = next.slice(next.length - prev.length);
  for (let i = 0; i < prev.length; i++) {
    if (tail[i].id !== prev[i].id) throw new Error(`audit immutability violated at index ${i}`);
  }
}
