// Lifecycle state machine — Part 8 §state machine
import type { LifecycleState } from "./bff/types";

export const TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  draft: ["review", "retired"],
  review: ["approved", "draft", "retired"],
  approved: ["deployed", "review", "retired"],
  deployed: ["paused", "retired"],
  paused: ["deployed", "retired"],
  retired: [],
};

export const TRANSITION_RISK: Record<string, "low" | "medium" | "high" | "critical"> = {
  "draft->review": "low",
  "review->approved": "medium",
  "review->draft": "low",
  "approved->deployed": "high",
  "deployed->paused": "high",
  "paused->deployed": "high",
  "approved->review": "low",
  "deployed->retired": "critical",
  "paused->retired": "high",
  "review->retired": "low",
  "draft->retired": "low",
  "approved->retired": "high",
};

export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStates(from: LifecycleState): LifecycleState[] {
  return TRANSITIONS[from] ?? [];
}

export function transitionRisk(from: LifecycleState, to: LifecycleState) {
  return TRANSITION_RISK[`${from}->${to}`] ?? "medium";
}
