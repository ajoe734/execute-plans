// BFF Contract v1 — write/mutation seam (VI-2).
// Wraps legacy `bff.mutations.runAction` + `bff.commands.requestConfirmToken`
// so every call site automatically obtains:
//   - correlationId (auto-minted root chain when absent)
//   - idempotencyKey (auto-minted; survives replay)
//   - CommandResponse<T> envelope shape (Final §2.2)
//   - BffError-style failure mapping (illegal_transition / state_conflict / invariant)
//
// Existing detail pages keep calling `runActionSafe(...)` and `bff.commands.*`;
// they auto-inherit these guarantees because both delegate here.

import { bff } from "./seed";
import type { RunActionInput, MutationResult } from "@/lib/bff/mutations";
import type { CommandResponse, ActionCommandResponseData } from "./dto";
import { idempotencyKey as mintIdemKey } from "./headers";
import { newCorrelationId } from "@/lib/v4/correlation";
import { makeBffError, BffError } from "./errors";
import { withLiveOrMock } from "./liveTransport";
import { paths } from "./paths";

/** Map RunActionInput.kind → live action endpoint builder. */
function actionPath(kind: RunActionInput["kind"], id: string, action: string): string | undefined {
  switch (kind) {
    case "Strategy":      return paths.strategyAction(id, action);
    case "Persona":       return paths.personaAction(id, action);
    case "CapitalPool":   return paths.capitalPoolAction(id, action);
    case "Rebalance":     return paths.rebalanceAction(id, action);
    case "Deployment":    return paths.deploymentAction(id, action);
    default:              return undefined;
  }
}

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
    const legacy = await bff.mutations.runAction({
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

  const livePath = actionPath(input.kind, input.id, input.action);
  if (livePath) {
    return withLiveOrMock<RunActionEnvelope>(
      {
        method: "POST",
        path: livePath,
        body: { memo: input.memo, expectedVersion: input.expectedVersion, newState: input.newState, confirmToken },
        idempotencyKey,
        ifMatchVersion: input.expectedVersion,
        headers: { "X-Correlation-Id": correlationId },
      },
      mockBranch,
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

export interface ConfirmTokenEnvelope extends CommandResponse<ConfirmTokenResponse> {}

/** v3 §6.2 — request a confirm token via the v1 seam (envelope + correlationId). */
export async function requestConfirmToken(
  req: ConfirmTokenRequest,
  params: Record<string, string> = {},
  opts: { correlationId?: string; idempotencyKey?: string } = {},
): Promise<ConfirmTokenEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  const r = await bff.commands.requestConfirmToken(req, params);
  if (!r.ok) {
    throw makeBffError({
      code: "VALIDATION_FAILED",
      message: `unknown high-risk action: ${req.actionId}`,
      correlationId,
      details: { reason: "unknown_high_risk_action" },
    });
  }
  return {
    ok: true,
    data: r.response,
    auditEventId: r.audit.id,
    correlationId,
    idempotencyKey,
  };
}

export const writes = {
  runAction,
  tryRunAction,
  requestConfirmToken,
};
