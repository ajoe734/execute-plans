import {
  submitCommand,
  type BackendCommandReceiptData,
  type BackendCommandResponse,
  type FinalCommandEnvelope,
} from "@/lib/bff/commandClient";
import { idempotencyKey as mintIdempotencyKey } from "@/lib/bff-v1/headers";
import { newCorrelationId } from "@/lib/v4/correlation";

export type EvidenceOperationAction =
  | "mark_stale"
  | "request_more_evidence"
  | "create_disposition_task"
  | "assign_reviewer"
  | "resolve";

export interface SubmitEvidenceOperationInput {
  refId: string;
  action: EvidenceOperationAction;
  reason: string;
  owner?: string;
  reviewer?: string;
  taskRef?: string;
  correlationId?: string;
  idempotencyKey?: string;
  baseUrl?: string;
}

export interface SubmitEvidenceOperationResult {
  response: BackendCommandResponse<BackendCommandReceiptData>;
  correlationId: string;
  idempotencyKey: string;
}

function definedParams(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== ""));
}

export async function submitEvidenceOperation(
  input: SubmitEvidenceOperationInput,
): Promise<SubmitEvidenceOperationResult> {
  const correlationId = input.correlationId ?? newCorrelationId();
  const idempotencyKey = input.idempotencyKey ?? mintIdempotencyKey();
  const actionId = input.action.trim() as EvidenceOperationAction;
  const payload: FinalCommandEnvelope = {
    command: "EvidenceRefAction",
    target: {
      type: "EvidenceRef",
      id: input.refId,
    },
    action: actionId,
    params: definedParams({
      ref_id: input.refId,
      action_id: actionId,
      owner: input.owner,
      reviewer: input.reviewer,
      task_ref: input.taskRef,
      frontend_source_route: "/management/evidence",
    }),
    audit_context: {
      reason: input.reason || `evidence.${actionId}`,
    },
  };
  const response = await submitCommand(payload, {
    correlationId,
    idempotencyKey,
    baseUrl: input.baseUrl,
  });
  return { response, correlationId, idempotencyKey };
}
