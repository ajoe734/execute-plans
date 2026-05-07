// Pack D D60 — correlationId / causationId chain (Batch IV provisional v0-mock).
// Source: .lovable/spec/v4/pack-d/Pantheon_Pack_D_DomainRules_Contract.md
//
// PROVISIONAL: client-side uuid generation. Real chain ownership belongs to
// BFF / risk-control. Field shape is canonical; ID format may change.

export interface CorrelationFields {
  correlationId: string;
  causationId?: string;
  parentCorrelationId?: string;
  traceId?: string;
}

function rand(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 36).toString(36);
  return s;
}

/** v4 uuid-like (RFC4122 v4 shape, mock; not crypto-grade). */
export function newUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try { return (crypto as { randomUUID: () => string }).randomUUID(); } catch { /* fall through */ }
  }
  const a = rand(8), b = rand(4), c = "4" + rand(3), d = ((Math.floor(Math.random() * 4) + 8).toString(16)) + rand(3), e = rand(12);
  return `${a}-${b}-${c}-${d}-${e}`;
}

export function newCorrelationId(): string {
  return `corr_${newUuid()}`;
}

export function newCausationFromEvent(eventId: string): string {
  return eventId;
}

/** Build a chain that derives a child correlation set from a parent. */
export function deriveChild(parent: CorrelationFields, triggeringEventId?: string): CorrelationFields {
  return {
    correlationId: parent.correlationId,
    parentCorrelationId: parent.parentCorrelationId ?? parent.correlationId,
    causationId: triggeringEventId,
    traceId: parent.traceId,
  };
}

/** Mint a fresh root chain for user-initiated actions. */
export function rootCorrelation(traceId?: string): CorrelationFields {
  return { correlationId: newCorrelationId(), traceId };
}
