// BFF Contract v1 — SSE channel catalog.
// Source: .lovable/feedback/2026-05-07-final/Pantheon_BFF_AsyncAPI_SSE.md §4
//       + Planner Response §B4 (2026-05-07) — adds confirm_token / cooldown /
//         transition / rollback / handoff channels (32 total).

export const SSE_CHANNELS = [
  "strategy",
  "persona",
  "capital",
  "deployment",
  "job",
  "risk",
  "approval",
  "audit",
  "artifact",
  "runtime",
  "mcp",
  "skill",
  "channel",
  "tool",
  "ranking",
  "rebalance",
  "evolution",
  "research",
  "signal",
  "inbox",
  "journal",
  "postmortem",
  "ask",
  "loop",
  "sentinel",
  "intervention",
  "system",
  // Planner Response §B4 additions
  "confirm_token",
  "cooldown",
  "transition",
  "rollback",
  "handoff",
] as const;

export type SseChannel = (typeof SSE_CHANNELS)[number];

export function isSseChannel(value: unknown): value is SseChannel {
  return typeof value === "string" && (SSE_CHANNELS as readonly string[]).includes(value);
}

/** Capability scope per channel (Final §4 catalog). */
export const SSE_CHANNEL_SCOPES: Readonly<Record<SseChannel, string>> = {
  strategy: "strategy.view",
  persona: "persona.view",
  capital: "capital.view",
  deployment: "deployment.read",
  job: "job.read",
  risk: "risk.alert.read",
  approval: "approval.read",
  audit: "audit.read",
  artifact: "artifact.read",
  runtime: "runtime.read",
  mcp: "mcp.read",
  skill: "skill.read",
  channel: "channel.read",
  tool: "tool.read",
  ranking: "ranking.read",
  rebalance: "rebalance.read",
  evolution: "evolution.read",
  research: "research.read",
  signal: "agora.signal.read",
  inbox: "agora.inbox.read",
  journal: "agora.journal.read",
  postmortem: "postmortem.read",
  ask: "agora.ask",
  loop: "loop.read",
  sentinel: "sentinel.read",
  intervention: "intervention.read",
  system: "*",
  // Planner Response §B4
  confirm_token: "*",
  cooldown: "*",
  transition: "*",
  rollback: "deployment.rollback",
  handoff: "approval.read",
};

/** Final §2 envelope — schemaVersion=1. */
export const SSE_SCHEMA_VERSION = 1 as const;

export interface SseEvent<C extends SseChannel = SseChannel, P = unknown> {
  schemaVersion: typeof SSE_SCHEMA_VERSION;
  id: string;
  channel: C;
  type: string;
  occurredAt: string;
  correlationId?: string;
  causationId?: string;
  payload: P;
}

export function makeSseEvent<C extends SseChannel, P>(args: {
  id: string;
  channel: C;
  type: string;
  payload: P;
  occurredAt?: string;
  correlationId?: string;
  causationId?: string;
}): SseEvent<C, P> {
  return {
    schemaVersion: SSE_SCHEMA_VERSION,
    id: args.id,
    channel: args.channel,
    type: args.type,
    occurredAt: args.occurredAt ?? new Date().toISOString(),
    correlationId: args.correlationId,
    causationId: args.causationId,
    payload: args.payload,
  };
}

export function isSseEvent(value: unknown): value is SseEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === SSE_SCHEMA_VERSION &&
    isSseChannel(v.channel) &&
    typeof v.type === "string" &&
    typeof v.id === "string"
  );
}
