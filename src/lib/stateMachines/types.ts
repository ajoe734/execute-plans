// State machine type contracts — Part 7 §17 (18 lifecycle/workflow machines).
// Generic shape so all 18 entity machines share one runtime.

import type { RiskLevel } from "@/lib/bff/types";

export type UiPattern =
  | "standard_action"
  | "create_job"
  | "review_workflow"
  | "confirmation_with_job"
  | "high_risk_modal"
  | "rollback_modal"
  | "destructive_modal"
  | "risk_workflow";

export interface Transition<S extends string = string> {
  from: S;
  to: S;
  action: string;
  requiresApproval?: boolean;
  risk?: RiskLevel;
  uiPattern?: UiPattern;
  /** Optional human-readable explanation of guards / required evidence. */
  guardKey?: string;
}

export interface StateMachine<S extends string = string> {
  /** Unique entity name (e.g. "strategy"). */
  name: string;
  /** Ordered list of canonical states (used by LifecycleStepper). */
  states: readonly S[];
  /** Branch / side states that are off the happy path (rendered as warning). */
  branchStates?: readonly S[];
  transitions: readonly Transition<S>[];
}

export function nextTransitions<S extends string>(
  m: StateMachine<S>,
  from: S,
): Transition<S>[] {
  return m.transitions.filter((t) => t.from === from || t.from === ("any" as S));
}

export function nextStates<S extends string>(m: StateMachine<S>, from: S): S[] {
  return Array.from(new Set(nextTransitions(m, from).map((t) => t.to)));
}

export function findTransition<S extends string>(
  m: StateMachine<S>,
  from: S,
  action: string,
): Transition<S> | undefined {
  return m.transitions.find(
    (t) => (t.from === from || t.from === ("any" as S)) && t.action === action,
  );
}

export function canTransition<S extends string>(
  m: StateMachine<S>,
  from: S,
  to: S,
): boolean {
  return m.transitions.some((t) => (t.from === from || t.from === ("any" as S)) && t.to === to);
}
