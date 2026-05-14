// BFF Contract v1 — write/mutation seam (VI-2).
// Wraps legacy mock mutations plus the final live command route
// so every call site automatically obtains:
//   - correlationId (auto-minted root chain when absent)
//   - idempotencyKey (auto-minted; survives replay)
//   - CommandResponse<T> envelope shape (Final §2.2)
//   - BffError-style failure mapping (illegal_transition / state_conflict / invariant)
//
// Existing detail pages keep calling `runActionSafe(...)`; they inherit these
// guarantees because the wrapper delegates here.

import { mutations, type RunActionInput, type MutationResult } from "@/lib/bff/mutations";
import type { CommandResponse, ActionCommandResponseData } from "./dto";
import { idempotencyKey as mintIdemKey } from "./headers";
import { newCorrelationId } from "@/lib/v4/correlation";
import { makeBffError, BffError } from "./errors";
import { withLiveOrMock } from "./liveTransport";
import { liveWriteGated, sessionKindAllowsWrite } from "./writeGate";
import { paths } from "./paths";
import {
  FINAL_COMMANDS_PATH,
  adaptRunActionCommandResponse,
  buildRunActionCommand,
  type BackendCommandResponse,
} from "@/lib/bff/commandClient";

export { liveWriteGated, sessionKindAllowsWrite };

export interface RunActionEnvelope extends CommandResponse<ActionCommandResponseData> {
  /** Pass-through to the underlying mock MutationResult for legacy consumers. */
  legacy: MutationResult;
}

export interface RunActionV1Options {
  /** Reuse a parent chain's correlationId (default: mint root). */
  correlationId?: string;
  /** Reuse a caller's idempotency-key (default: mint ULID-like). */
  idempotencyKey?: string;
  /** v3 §6.2 confirm token issued by `requestConfirmToken`. */
  confirmToken?: string;
}

/** Run a state-machine action through the v1 seam. Throws BffError on guard rejection. */
export async function runAction(
  input: RunActionInput,
  opts: RunActionV1Options = {},
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
        code: legacy.rejected === "state_conflict" ? "STATE_CONFLICT"
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
    return {
      ok: true,
      data,
      auditEventId: legacy.audit.id,
      correlationId,
      idempotencyKey,
      message: legacy.message,
      legacy,
    };
  };

  if (await liveWriteGated()) {
    const commandOpts = { correlationId, idempotencyKey, confirmToken };
    return withLiveOrMock<RunActionEnvelope, BackendCommandResponse>(
      {
        method: "POST",
        path: FINAL_COMMANDS_PATH,
        body: buildRunActionCommand(input, commandOpts),
        idempotencyKey,
        correlationId,
        headers: confirmToken ? { "X-Confirm-Token": confirmToken } : undefined,
      },
      mockBranch,
      (rawData) => adaptRunActionCommandResponse(rawData, commandOpts),
    );
  }
  return mockBranch();
}

/** Result-style wrapper. Never throws. */
export async function tryRunAction(
  input: RunActionInput,
  opts: RunActionV1Options = {},
): Promise<{ ok: true; envelope: RunActionEnvelope } | { ok: false; error: BffError }> {
  try {
    return { ok: true, envelope: await runAction(input, opts) };
  } catch (e) {
    if (e instanceof BffError) return { ok: false, error: e };
    throw e;
  }
}

// ---------- Confirm token seam ----------

import type { ConfirmTokenRequest, ConfirmTokenResponse } from "@/lib/v3/highRiskActions";
import { getHighRiskAction, buildConfirmPhrase } from "@/lib/v3/highRiskActions";

export type ConfirmTokenEnvelope = CommandResponse<ConfirmTokenResponse>;

/** v3 §6.2 — create a confirm token via the v1 seam (envelope + correlationId).
 *  Live path: POST /bff/confirm-tokens when liveWriteGated() is true. */
export async function requestConfirmToken(
  req: ConfirmTokenRequest,
  params: Record<string, string> = {},
  opts: { correlationId?: string; idempotencyKey?: string } = {},
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

  if (await liveWriteGated()) {
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

export const writes = {
  runAction,
  tryRunAction,
  requestConfirmToken,
};
