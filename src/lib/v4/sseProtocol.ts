// v4 / Pack C §C029–C032 — SSE reconnect protocol + channel catalog.

export interface SseEnvelope<T = unknown> {
  /** Monotonically sortable ULID. */
  id: string;
  channel: string;
  type: string;
  occurredAt: string;
  payload: T;
}

export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;
export const SSE_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SSE_REPLAY_MAX_EVENTS = 10_000;
export const SSE_BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000] as const;
export const SSE_RESYNC_EVENT = "resync_required" as const;

export interface SseChannelDef {
  channel: string;
  events: readonly string[];
  consumers: string;
}

export const SSE_CHANNELS: readonly SseChannelDef[] = [
  { channel: "job.*", events: ["job.started", "job.progress", "job.completed", "job.failed"], consumers: "Management + Agora job drawers" },
  { channel: "strategy.*", events: ["strategy.created", "strategy.updated", "strategy.state_changed"], consumers: "Management strategy pages" },
  { channel: "persona.*", events: ["persona.updated", "persona.policy_changed", "persona.evaluation_completed"], consumers: "Management persona pages" },
  { channel: "capital.*", events: ["capital_pool.updated", "capital_pool.breach_created"], consumers: "Capital pages" },
  { channel: "ranking.*", events: ["ranking.recalculated", "ranking.published"], consumers: "Ranking pages" },
  { channel: "rebalance.*", events: ["rebalance.step_changed", "rebalance.approved", "rebalance.applied", "rebalance.rolled_back"], consumers: "Rebalance pages" },
  { channel: "evolution.*", events: ["evolution.run_progress", "evolution.candidate_created"], consumers: "Evolution pages" },
  { channel: "experiment.*", events: ["experiment.started", "experiment.completed", "experiment.failed"], consumers: "Experiment registry" },
  { channel: "review.*", events: ["review.submitted", "review.validator_completed", "review.decision_changed"], consumers: "Governance pages" },
  { channel: "deployment.*", events: ["deployment.started", "deployment.completed", "deployment.failed", "deployment.rolled_back"], consumers: "Deployment pages" },
  { channel: "runtime.*", events: ["runtime.heartbeat", "runtime.degraded", "runtime.recovered"], consumers: "Runtime monitor" },
  { channel: "risk.*", events: ["risk.alert_created", "risk.alert_updated"], consumers: "Risk center" },
  { channel: "incident.*", events: ["incident.created", "incident.updated", "incident.escalated", "incident.closed"], consumers: "Incident center" },
  { channel: "tool_call.*", events: ["tool_call.completed", "tool_call.failed"], consumers: "Tool calls" },
  { channel: "mcp_call.*", events: ["mcp_call.completed", "mcp_call.failed"], consumers: "MCP calls" },
  { channel: "skill.*", events: ["skill.sandbox_completed", "skill.approved"], consumers: "Skill pages" },
  { channel: "handoff.*", events: ["handoff.created", "handoff.claimed", "handoff.rejected", "handoff.resolved", "handoff.escalated"], consumers: "Agora + Management" },
  { channel: "session.*", events: ["session.message_created", "session.closed"], consumers: "Agora sessions" },
  { channel: "notification.*", events: ["notification.created", "notification.read"], consumers: "Notification center" },
] as const;

/** Pack C C031–C032: bulk and bidirectional channels are future work. */
export const FUTURE_WORK = {
  bulkMutation: false,
  webSocket: false,
} as const;
