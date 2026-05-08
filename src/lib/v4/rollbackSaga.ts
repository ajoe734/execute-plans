// Planner Response §D04 (2026-05-07) — Incident ↔ Deployment Rollback Saga.
// BFF-orchestrated; FE only renders status + provides cancel affordance.
// Source: §5.D04.

import type { FailureReasonCode, AsyncTransitionDescriptor } from "./asyncTransitionPolicy";

export type RollbackSagaStatus =
  | "requested"
  | "accepted"
  | "approval_required"
  | "confirm_token_required"
  | "queued"
  | "rolling_back"
  | "compensating"
  | "succeeded"
  | "failed"
  | "cancelled";

export type RollbackSagaStep =
  | "validate"
  | "approval"
  | "confirm_token"
  | "queue_execution"
  | "rolling_back"
  | "verify"
  | "link_incident"
  | "postmortem"
  | "done";

export const ROLLBACK_SAGA_STEPS: readonly RollbackSagaStep[] = [
  "validate", "approval", "confirm_token", "queue_execution",
  "rolling_back", "verify", "link_incident", "postmortem", "done",
] as const;

export interface RollbackSagaDTO {
  id: string;
  incidentId: string;
  deploymentId: string;
  targetVersion?: string;
  status: RollbackSagaStatus;
  currentStep: RollbackSagaStep;
  reasonCode: string;
  requestedBy: string;
  requestedAt: string;
  updatedAt: string;
  timeout: AsyncTransitionDescriptor;
  correlationId: string;
  auditEventIds: string[];
  jobId?: string;
  approvalId?: string;
  failureReasonCode?: FailureReasonCode;
}

export function isTerminalSagaStatus(s: RollbackSagaStatus): boolean {
  return s === "succeeded" || s === "failed" || s === "cancelled";
}

/** UI step index for stepper progress (0-based). */
export function stepIndex(step: RollbackSagaStep): number {
  return ROLLBACK_SAGA_STEPS.indexOf(step);
}

export const ROLLBACK_SAGA_SOURCE = "planner-response-2026-05-07" as const;
