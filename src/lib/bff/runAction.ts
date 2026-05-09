// BFF-LUV-FE-004 — Canonical live-write seam for high-risk/write flows.
//
// All writes are gated by VITE_BFF_REAL_WRITES=true AND a bearer token present.
// Falls back to mock mutations when either gate is not satisfied.
//
// Canonical action path:        /bff/actions/{entityType}/{entityId}/{actionId}
// Confirm token create:         POST   /bff/confirm-tokens
// Confirm token read:           GET    /bff/confirm-tokens/{tokenId}
// Confirm token redeem:         POST   /bff/confirm-tokens/{tokenId}/redeem
// Confirm token delete:         DELETE /bff/confirm-tokens/{tokenId}
// Approval decision:            POST   /bff/approvals/{id}/decide
// Alert acknowledge:            POST   /bff/alerts/{id}/acknowledge
// Intervention decide:          POST   /bff/v5/interventions/{id}/decide

import { mutations } from "./mutations";
import type { RunActionInput, MutationResult } from "./mutations";
import type { ConfirmTokenRequest, ConfirmTokenResponse } from "@/lib/v3/highRiskActions";
import { getHighRiskAction, buildConfirmPhrase } from "@/lib/v3/highRiskActions";
import { withLiveOrMock, realWritesEnabled } from "@/lib/bff-v1/liveTransport";
import { paths } from "@/lib/bff-v1/paths";
import {
  idempotencyKey as mintIdemKey,
  newCorrelationId,
  readBrowserAuthStorage,
} from "@/lib/bff-v1/headers";
import { makeBffError, BffError } from "@/lib/bff-v1/errors";
import type {
  CommandResponse,
  ActionCommandResponseData,
} from "@/lib/bff-v1/dto";

// ---------- Auth gate ----------

function authPresent(): boolean {
  try {
    return readBrowserAuthStorage().token !== null;
  } catch {
    return false;
  }
}

/** Both VITE_BFF_REAL_WRITES=true AND a bearer token must be present. */
export function liveWriteGated(): boolean {
  return realWritesEnabled() && authPresent();
}

// ---------- Entity-type mapping ----------

/** Map mutation kind → canonical BFF entityType path segment. */
const KIND_TO_ENTITY_TYPE: Readonly<Record<string, string>> = {
  Strategy: "strategy",
  Persona: "persona",
  CapitalPool: "capital-pool",
  Rebalance: "rebalance",
  Deployment: "deployment",
  Evolution: "evolution-program",
  Research: "research-experiment",
  Artifact: "artifact",
  RankingFormula: "ranking-formula",
  Tool: "tool",
  McpServer: "mcp-server",
  McpTool: "mcp-tool",
  Skill: "skill",
  Channel: "channel",
  Runtime: "runtime",
};

function entityType(kind: string): string {
  return KIND_TO_ENTITY_TYPE[kind] ?? kind.toLowerCase();
}

// ---------- Envelope types ----------

export interface RunActionEnvelope extends CommandResponse<ActionCommandResponseData> {
  /** Pass-through to the underlying mock MutationResult for legacy consumers. */
  legacy: MutationResult;
}

export interface RunActionOptions {
  correlationId?: string;
  idempotencyKey?: string;
  /** v3 §6.2 confirm token issued by `requestConfirmToken`. */
  confirmToken?: string;
}

// ---------- runAction ----------

/**
 * Canonical live-write seam: dispatches entity actions through
 * /bff/actions/{entityType}/{entityId}/{actionId} when live writes are enabled.
 * Falls back to mock mutations when the write gate is not open.
 */
export async function runAction(
  input: RunActionInput,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? input.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? input.idempotencyKey ?? mintIdemKey();
  const confirmToken = opts.confirmToken ?? input.confirmToken;

  const mockBranch = async (): Promise<RunActionEnvelope> => {
    const legacy = await mutations.runAction({
      ...input,
      correlationId,
      idempotencyKey,
      confirmToken,
    });
    if (!legacy.ok) {
      throw makeBffError({
        code:
          legacy.rejected === "state_conflict" ? "STATE_CONFLICT"
          : legacy.rejected === "illegal_transition" ? "ILLEGAL_TRANSITION"
          : legacy.rejected === "invariant_violation" ? "STATE_CONFLICT"
          : "VALIDATION_FAILED",
        message: legacy.message ?? legacy.rejected ?? "rejected",
        correlationId,
        details: { reason: legacy.rejected },
      });
    }
    const data: ActionCommandResponseData = {
      actionId: legacy.audit.id,
      status: "completed",
    };
    return { ok: true, data, auditEventId: legacy.audit.id, correlationId, idempotencyKey, message: legacy.message, legacy };
  };

  if (liveWriteGated()) {
    const livePath = paths.action(entityType(input.kind), input.id, input.action);
    return withLiveOrMock<RunActionEnvelope>(
      {
        method: "POST",
        path: livePath,
        body: {
          memo: input.memo,
          expectedVersion: input.expectedVersion,
          newState: input.newState,
          confirmToken,
        },
        idempotencyKey,
        ifMatchVersion: input.expectedVersion,
        headers: { "X-Correlation-Id": correlationId },
      },
      mockBranch,
      (rawData) => {
        const d = rawData as {
          data?: { commandId?: string; command_id?: string; receipt_id?: string };
          meta?: { idempotency?: { idempotencyKey?: string } };
        };
        const commandId = d.data?.commandId ?? d.data?.command_id ?? d.data?.receipt_id ?? "";
        const iKey = d.meta?.idempotency?.idempotencyKey ?? idempotencyKey;
        const mockLegacy = { ok: true as const, audit: { id: commandId }, message: "dispatched" };
        return {
          ok: true,
          data: { actionId: commandId, status: "accepted" as const },
          auditEventId: commandId,
          correlationId,
          idempotencyKey: iKey,
          legacy: mockLegacy,
        };
      },
    );
  }
  return mockBranch();
}

/** Result-style wrapper. Never throws. */
export async function tryRunAction(
  input: RunActionInput,
  opts: RunActionOptions = {},
): Promise<{ ok: true; envelope: RunActionEnvelope } | { ok: false; error: BffError }> {
  try {
    return { ok: true, envelope: await runAction(input, opts) };
  } catch (e) {
    if (e instanceof BffError) return { ok: false, error: e };
    throw e;
  }
}

// ---------- requestConfirmToken ----------

export interface ConfirmTokenEnvelope extends CommandResponse<ConfirmTokenResponse> {}

export interface ConfirmTokenOptions {
  correlationId?: string;
  idempotencyKey?: string;
}

/**
 * v3 §6.2 — Create a confirm token.
 * Live path: POST /bff/confirm-tokens.
 * Falls back to mock issuance when write gate is not open.
 */
export async function requestConfirmToken(
  req: ConfirmTokenRequest,
  params: Record<string, string> = {},
  opts: ConfirmTokenOptions = {},
): Promise<ConfirmTokenEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();

  const mockBranch = async (): Promise<ConfirmTokenEnvelope> => {
    const r = await mutations.requestConfirmToken(req, params);
    if (!r.ok) {
      throw makeBffError({
        code: "VALIDATION_FAILED",
        message: `unknown high-risk action: ${req.actionId}`,
        correlationId,
        details: { reason: "unknown_high_risk_action" },
      });
    }
    return { ok: true, data: r.response, auditEventId: r.audit.id, correlationId, idempotencyKey };
  };

  if (liveWriteGated()) {
    return withLiveOrMock<ConfirmTokenEnvelope>(
      {
        method: "POST",
        path: paths.confirmTokens(),
        body: req,
        idempotencyKey,
        headers: { "X-Correlation-Id": correlationId },
      },
      mockBranch,
      (rawData) => {
        const d = rawData as {
          data?: { tokenId?: string; commandId?: string };
          meta?: { idempotency?: { idempotencyKey?: string } };
        };
        const tokenId = d.data?.tokenId ?? d.data?.commandId ?? "";
        const iKey = d.meta?.idempotency?.idempotencyKey ?? idempotencyKey;
        const action = getHighRiskAction(req.actionId);
        const ttl = action?.tokenTtlSeconds ?? 300;
        const ctResp: ConfirmTokenResponse = {
          confirmToken: tokenId,
          expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
          ttlSeconds: ttl,
          requiredPhrase: action
            ? buildConfirmPhrase(action, { ...params, [`${req.entityType}Id`]: req.entityId })
            : "",
          requiresMemo: action?.memoRequired ?? false,
          auditEventPreview: `${req.actionId}.requested`,
        };
        return { ok: true, data: ctResp, correlationId, idempotencyKey: iKey };
      },
    );
  }
  return mockBranch();
}

// ---------- readConfirmToken ----------

export interface ConfirmTokenReadEnvelope extends CommandResponse<ConfirmTokenResponse> {}

/**
 * v3 §6.2 — Read a confirm token by id.
 * Live path: GET /bff/confirm-tokens/{tokenId}.
 * Returns mock data when write gate is not open.
 */
export async function readConfirmToken(
  tokenId: string,
  opts: ConfirmTokenOptions = {},
): Promise<ConfirmTokenReadEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();

  const mockBranch = async (): Promise<ConfirmTokenReadEnvelope> => ({
    ok: true,
    data: { confirmToken: tokenId, ttlSeconds: 0, requiredPhrase: "" } as ConfirmTokenResponse,
    correlationId,
    idempotencyKey,
  });

  if (liveWriteGated()) {
    return withLiveOrMock<ConfirmTokenReadEnvelope>(
      {
        method: "GET",
        path: paths.confirmToken(tokenId),
        headers: { "X-Correlation-Id": correlationId },
      },
      mockBranch,
      (rawData) => {
        const d = rawData as { data?: { tokenId?: string; id?: string } };
        const resolvedTokenId = d.data?.tokenId ?? d.data?.id ?? tokenId;
        const ctResp: ConfirmTokenResponse = {
          confirmToken: resolvedTokenId,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          ttlSeconds: 300,
          requiredPhrase: "",
          requiresMemo: false,
          auditEventPreview: "confirm_token.read",
        };
        return { ok: true, data: ctResp, correlationId, idempotencyKey };
      },
    );
  }
  return mockBranch();
}

// ---------- redeemConfirmToken ----------

export interface ConfirmTokenRedeemEnvelope extends CommandResponse<{ tokenId: string; redeemed: true }> {}

/**
 * v3 §6.2 — Redeem a confirm token.
 * Live path: POST /bff/confirm-tokens/{tokenId}/redeem.
 * Falls back to mock when write gate is not open.
 */
export async function redeemConfirmToken(
  tokenId: string,
  opts: ConfirmTokenOptions = {},
): Promise<ConfirmTokenRedeemEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();

  const mockBranch = async (): Promise<ConfirmTokenRedeemEnvelope> => ({
    ok: true,
    data: { tokenId, redeemed: true },
    correlationId,
    idempotencyKey,
  });

  if (liveWriteGated()) {
    return withLiveOrMock<ConfirmTokenRedeemEnvelope>(
      {
        method: "POST",
        path: paths.confirmTokenRedeem(tokenId),
        body: {},
        idempotencyKey,
        headers: { "X-Correlation-Id": correlationId },
      },
      mockBranch,
      () => ({ ok: true, data: { tokenId, redeemed: true }, correlationId, idempotencyKey }),
    );
  }
  return mockBranch();
}

// ---------- deleteConfirmToken ----------

export interface ConfirmTokenDeleteEnvelope extends CommandResponse<{ tokenId: string; deleted: true }> {}

/**
 * v3 §6.2 — Delete/revoke a confirm token.
 * Live path: DELETE /bff/confirm-tokens/{tokenId}.
 * Falls back to mock when write gate is not open.
 */
export async function deleteConfirmToken(
  tokenId: string,
  opts: ConfirmTokenOptions = {},
): Promise<ConfirmTokenDeleteEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();

  const mockBranch = async (): Promise<ConfirmTokenDeleteEnvelope> => ({
    ok: true,
    data: { tokenId, deleted: true },
    correlationId,
    idempotencyKey,
  });

  if (liveWriteGated()) {
    return withLiveOrMock<ConfirmTokenDeleteEnvelope>(
      {
        method: "DELETE",
        path: paths.confirmToken(tokenId),
        idempotencyKey,
        headers: { "X-Correlation-Id": correlationId },
      },
      mockBranch,
      () => ({ ok: true, data: { tokenId, deleted: true }, correlationId, idempotencyKey }),
    );
  }
  return mockBranch();
}

// ---------- decideApproval ----------

export type ApprovalDecision = "approve" | "reject" | "request_changes" | "escalate" | "freeze";

export interface ApprovalDecisionEnvelope extends CommandResponse<{ approvalId: string; decision: ApprovalDecision }> {}

export interface ApprovalDecisionOptions {
  correlationId?: string;
  idempotencyKey?: string;
  stageName?: string;
}

/**
 * Live path: POST /bff/approvals/{id}/decide.
 * Falls back to mock decideApproval.
 */
export async function decideApproval(
  id: string,
  decision: ApprovalDecision,
  memo: string,
  opts: ApprovalDecisionOptions = {},
): Promise<ApprovalDecisionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();

  const mockBranch = async (): Promise<ApprovalDecisionEnvelope> => {
    const r = await mutations.decideApproval(id, decision, memo, { stageName: opts.stageName });
    if (!r.ok) {
      throw makeBffError({ code: "VALIDATION_FAILED", message: r.message ?? "decision rejected", correlationId });
    }
    return { ok: true, data: { approvalId: id, decision }, auditEventId: r.audit.id, correlationId, idempotencyKey };
  };

  if (liveWriteGated()) {
    return withLiveOrMock<ApprovalDecisionEnvelope>(
      {
        method: "POST",
        path: paths.approvalDecide(id),
        body: { decision, memo, stageName: opts.stageName },
        idempotencyKey,
        headers: { "X-Correlation-Id": correlationId },
      },
      mockBranch,
      (data) => {
        const d = data as { approvalId?: string; decision?: ApprovalDecision };
        return { ok: true, data: { approvalId: d.approvalId ?? id, decision: d.decision ?? decision }, correlationId, idempotencyKey };
      },
    );
  }
  return mockBranch();
}

// ---------- acknowledgeAlert ----------

export interface AlertAckEnvelope extends CommandResponse<{ alertId: string }> {}

export interface AlertAckOptions {
  correlationId?: string;
  idempotencyKey?: string;
}

/**
 * Live path: POST /bff/alerts/{id}/acknowledge.
 * Falls back to mock acknowledgeAlert.
 */
export async function acknowledgeAlert(
  id: string,
  memo?: string,
  opts: AlertAckOptions = {},
): Promise<AlertAckEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();

  const mockBranch = async (): Promise<AlertAckEnvelope> => {
    const r = await mutations.acknowledgeAlert(id, memo);
    return { ok: true, data: { alertId: id }, auditEventId: r.audit.id, correlationId, idempotencyKey };
  };

  if (liveWriteGated()) {
    return withLiveOrMock<AlertAckEnvelope>(
      {
        method: "POST",
        path: paths.alertAcknowledge(id),
        body: memo ? { memo } : {},
        idempotencyKey,
        headers: { "X-Correlation-Id": correlationId },
      },
      mockBranch,
      () => ({ ok: true, data: { alertId: id }, correlationId, idempotencyKey }),
    );
  }
  return mockBranch();
}

// ---------- decideIntervention (v5) ----------

export type InterventionDecision = "acknowledge" | "approve" | "reject" | "dismiss" | "escalate";

export interface InterventionDecisionEnvelope extends CommandResponse<{ interventionId: string; decision: InterventionDecision }> {}

export interface InterventionDecisionOptions {
  correlationId?: string;
  idempotencyKey?: string;
}

/**
 * v5 closed-loop — POST /bff/v5/interventions/{id}/decide.
 * No live-capital side effects in smoke mode; blocked when write gate is not open.
 */
export async function decideIntervention(
  id: string,
  decision: InterventionDecision,
  memo: string,
  opts: InterventionDecisionOptions = {},
): Promise<InterventionDecisionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();

  const mockBranch = async (): Promise<InterventionDecisionEnvelope> => {
    return {
      ok: true,
      data: { interventionId: id, decision },
      auditEventId: `au_mock_iv_${id}`,
      correlationId,
      idempotencyKey,
    };
  };

  if (liveWriteGated()) {
    return withLiveOrMock<InterventionDecisionEnvelope>(
      {
        method: "POST",
        path: paths.v5InterventionDecide(id),
        body: { decision, memo },
        idempotencyKey,
        headers: { "X-Correlation-Id": correlationId },
      },
      mockBranch,
      (data) => {
        const d = data as { interventionId?: string; decision?: InterventionDecision };
        return { ok: true, data: { interventionId: d.interventionId ?? id, decision: d.decision ?? decision }, correlationId, idempotencyKey };
      },
    );
  }
  return mockBranch();
}

export const bffWrites = {
  runAction,
  tryRunAction,
  requestConfirmToken,
  readConfirmToken,
  redeemConfirmToken,
  deleteConfirmToken,
  decideApproval,
  acknowledgeAlert,
  decideIntervention,
  liveWriteGated,
};
