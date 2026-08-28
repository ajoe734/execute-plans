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

import { bffFetch } from "./client";
import type {
  ActionCommandResponseData,
  ActionCommandStatus,
  CommandResponse,
  CommandResponse as FrontendCommandResponse,
} from "./dto";
import { isActionCommandStatus } from "./dto";
import { idempotencyKey as mintIdemKey, newCorrelationId } from "./headers";
import { makeBffError, BffError } from "./errors";
import { withLiveOrMock, isStrictLiveFallback } from "./liveTransport";
import { liveWriteGated, sessionKindAllowsWrite } from "./writeGate";
import { paths } from "./paths";
import type { AuditEvent, LifecycleState } from "@/lib/bff/types";
import type { ConfirmTokenRequest, ConfirmTokenResponse } from "@/lib/v3/highRiskActions";
import { getHighRiskAction, buildConfirmPhrase } from "@/lib/v3/highRiskActions";

export { liveWriteGated, sessionKindAllowsWrite };

export const FINAL_COMMANDS_PATH = "/bff/v1/commands" as const;

export type FinalCommandStatus = ActionCommandStatus;

export interface FinalCommandTarget {
  type: string;
  id: string;
}

export interface FinalCommandEnvelope {
  command: string;
  target: FinalCommandTarget;
  action?: string;
  params?: Record<string, unknown>;
  audit_context: {
    reason: string;
    incident_id?: string | null;
  };
  confirmToken?: string;
  approvalId?: string;
  approvalDecisionId?: string;
  twoManSignatureId?: string;
  secondOperatorId?: string;
}

export interface BackendCommandReceiptData {
  receipt_id?: string;
  command_id?: string;
  commandId?: string;
  command?: string;
  status?: string;
  receipt?: {
    receipt_id?: string;
    command_id?: string;
    commandId?: string;
    status?: string;
  };
}

export interface BackendCommandResponse<T = BackendCommandReceiptData> {
  status?: string;
  data?: T;
  meta?: {
    durable?: boolean;
    liveCapitalSideEffects?: boolean;
    idempotency?: {
      key?: string;
      idempotencyKey?: string;
      replayed?: boolean;
    };
    [key: string]: unknown;
  };
}

export interface CommandClientOptions {
  correlationId: string;
  idempotencyKey: string;
  confirmToken?: string;
  approvalId?: string;
  approvalDecisionId?: string;
  twoManSignatureId?: string;
  secondOperatorId?: string;
  headers?: Record<string, string>;
  baseUrl?: string;
}

export type RunActionInput = {
  /** Entity kind, e.g. "Strategy", "Persona", "CapitalPool", "Approval", "Incident", "Alert", "Deployment", "Rebalance", "Skill", "McpTool". */
  kind: string;
  id: string;
  action: string;
  /** New lifecycle state to write (when applicable). */
  newState?: LifecycleState | string;
  memo?: string;
  /** Pack C C010 — optimistic-lock guard. */
  expectedVersion?: number;
  /** Pack C C028 — replay guard. */
  idempotencyKey?: string;
  /** Pack D D60 / VI-2 — caller-supplied correlationId; seam auto-mints when absent. */
  correlationId?: string;
  /** v3 §6.2 / VI-2 — high-risk confirm token (mock layer audit-only). */
  confirmToken?: string;
};

export type MutationResult = {
  ok: boolean;
  audit: AuditEvent;
  message?: string;
  /** When a guard rejected the action. */
  rejected?: "illegal_transition" | "unknown_entity" | "state_conflict" | "invariant_violation";
  /** VI-2 — propagated for envelope construction at the seam. */
  correlationId?: string;
  idempotencyKey?: string;
};

export interface CommandRunActionOptions extends CommandClientOptions {
  legacy?: MutationResult;
}

export interface CommandRunActionEnvelope
  extends FrontendCommandResponse<ActionCommandResponseData> {
  legacy: MutationResult;
  commandResponse: BackendCommandResponse;
}

interface EntityCommandSpec {
  command: string;
  targetType: string;
  auditNamespace: string;
}

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

const ENTITY_COMMAND_SPECS: Readonly<Record<string, EntityCommandSpec>> = {
  strategy: { command: "StrategyAction", targetType: "Strategy", auditNamespace: "strategy" },
  persona: { command: "PersonaAction", targetType: "Persona", auditNamespace: "persona" },
  "capital-pool": {
    command: "CapitalPoolAction",
    targetType: "CapitalPool",
    auditNamespace: "capitalpool",
  },
  rebalance: { command: "RebalanceAction", targetType: "Rebalance", auditNamespace: "rebalance" },
  "ranking-formula": {
    command: "RankingFormulaAction",
    targetType: "RankingFormula",
    auditNamespace: "rankingformula",
  },
  ranking: { command: "RankingAction", targetType: "Ranking", auditNamespace: "ranking" },
  deployment: { command: "DeploymentAction", targetType: "Deployment", auditNamespace: "deployment" },
  runtime: { command: "RuntimeAction", targetType: "Runtime", auditNamespace: "runtime" },
  review: { command: "ReviewAction", targetType: "Review", auditNamespace: "review" },
  approval: { command: "ReviewAction", targetType: "ApprovalDecision", auditNamespace: "approval" },
  alert: { command: "RiskAlertAction", targetType: "RiskAlert", auditNamespace: "alert" },
  incident: { command: "IncidentAction", targetType: "Incident", auditNamespace: "incident" },
  "evolution-program": {
    command: "EvolutionProgramAction",
    targetType: "EvolutionProgram",
    auditNamespace: "evolution",
  },
  "research-experiment": {
    command: "ExperimentAction",
    targetType: "Experiment",
    auditNamespace: "research",
  },
  experiment: { command: "ExperimentAction", targetType: "Experiment", auditNamespace: "research" },
  job: { command: "JobAction", targetType: "Job", auditNamespace: "job" },
  tool: { command: "ToolAction", targetType: "Tool", auditNamespace: "tool" },
  "mcp-server": { command: "McpServerAction", targetType: "McpServer", auditNamespace: "mcpserver" },
  "mcp-tool": { command: "ToolAction", targetType: "Tool", auditNamespace: "mcptool" },
  skill: { command: "SkillAction", targetType: "Skill", auditNamespace: "skill" },
  artifact: { command: "ReviewAction", targetType: "Review", auditNamespace: "artifact" },
  channel: { command: "ReviewAction", targetType: "Review", auditNamespace: "channel" },
};

function normalizeEntityType(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

export function entityTypeForKind(kind: string): string {
  return normalizeEntityType(KIND_TO_ENTITY_TYPE[kind] ?? kind.toLowerCase());
}

function specForEntityType(entityType: string): EntityCommandSpec {
  const normalized = normalizeEntityType(entityType);
  return ENTITY_COMMAND_SPECS[normalized] ?? {
    command: "ReviewAction",
    targetType: "Review",
    auditNamespace: normalized || "action",
  };
}

function definedParams(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function actionStatus(raw: BackendCommandResponse): ActionCommandStatus {
  const status = raw.data?.status ?? raw.status;
  return isActionCommandStatus(status) ? status : "accepted";
}

function commandReceiptId(raw: BackendCommandResponse): string {
  const data = raw.data ?? {};
  return (
    data.commandId ??
    data.command_id ??
    data.receipt_id ??
    data.receipt?.commandId ??
    data.receipt?.command_id ??
    data.receipt?.receipt_id ??
    ""
  );
}

function idempotencyFrom(raw: BackendCommandResponse, fallback: string): string {
  return raw.meta?.idempotency?.idempotencyKey ?? raw.meta?.idempotency?.key ?? fallback;
}

const OPERATIONS_COMMAND_TYPES = new Set([
  "Observe",
  "RequestReview",
  "PausePaperRuntime",
  "ResumePaperRuntime",
  "Demote",
  "PromoteCandidate",
  "RebalanceProposal",
  "ApprovedApply",
  "EmergencyContainment",
]);

export function buildRunActionCommand(
  input: RunActionInput,
  opts: CommandClientOptions,
): FinalCommandEnvelope {
  const entityType = entityTypeForKind(input.kind);
  const spec = specForEntityType(entityType);
  const actionId = input.action.trim();
  const isOperationsCommand = OPERATIONS_COMMAND_TYPES.has(actionId);
  const commandName = isOperationsCommand ? actionId : spec.command;
  const auditEvent = `${spec.auditNamespace}.${actionId}`;
  const confirmToken = opts.confirmToken ?? input.confirmToken;
  const params = definedParams({
    memo: input.memo,
    expectedVersion: input.expectedVersion,
    newState: input.newState,
    confirmToken,
    approvalId: opts.approvalId,
    approvalDecisionId: opts.approvalDecisionId,
    twoManSignatureId: opts.twoManSignatureId,
    secondOperatorId: opts.secondOperatorId,
    action_id: actionId,
    entity_type: entityType,
    entity_id: input.id,
    audit_event: auditEvent,
    frontend_source_route: FINAL_COMMANDS_PATH,
  });

  return definedParams({
    command: commandName,
    target: {
      type: spec.targetType,
      id: input.id,
    },
    action: actionId,
    params,
    audit_context: {
      reason: String(input.memo || auditEvent),
    },
    confirmToken,
    approvalId: opts.approvalId,
    approvalDecisionId: opts.approvalDecisionId,
    twoManSignatureId: opts.twoManSignatureId,
    secondOperatorId: opts.secondOperatorId,
  }) as unknown as FinalCommandEnvelope;
}

export async function submitCommand<T = BackendCommandReceiptData>(
  payload: FinalCommandEnvelope,
  opts: CommandClientOptions,
): Promise<BackendCommandResponse<T>> {
  const headers = {
    ...(opts.confirmToken ? { "X-Confirm-Token": opts.confirmToken } : {}),
    ...(opts.headers ?? {}),
  };
  return bffFetch<BackendCommandResponse<T>>({
    method: "POST",
    path: FINAL_COMMANDS_PATH,
    body: payload,
    idempotencyKey: opts.idempotencyKey,
    correlationId: opts.correlationId,
    headers,
    baseUrl: opts.baseUrl,
    mode: "live",
  });
}

export function adaptRunActionCommandResponse(
  raw: BackendCommandResponse,
  opts: CommandRunActionOptions,
): CommandRunActionEnvelope {
  const commandId = commandReceiptId(raw);
  const idempotencyKey = idempotencyFrom(raw, opts.idempotencyKey);
  const legacy = opts.legacy ?? {
    ok: true as const,
    audit: {
      id: commandId,
      actor: "bff-command-client",
      action: "command.submit",
      target: commandId,
      ts: new Date().toISOString(),
      correlationId: opts.correlationId,
      idempotencyKey,
    },
    message: "dispatched",
    correlationId: opts.correlationId,
    idempotencyKey,
  };
  return {
    ok: true,
    data: {
      actionId: commandId,
      status: actionStatus(raw),
    },
    auditEventId: commandId,
    correlationId: opts.correlationId,
    idempotencyKey,
    replayed: raw.meta?.idempotency?.replayed,
    legacy,
    commandResponse: raw,
  };
}

export async function runActionCommand(
  input: RunActionInput,
  opts: CommandRunActionOptions,
): Promise<CommandRunActionEnvelope> {
  const payload = buildRunActionCommand(input, opts);
  const raw = await submitCommand(payload, opts);
  return adaptRunActionCommandResponse(raw, opts);
}

export const commandClient = {
  path: FINAL_COMMANDS_PATH,
  buildRunActionCommand,
  submitCommand,
  runAction: runActionCommand,
};

/**
 * Strict-live posture (VITE_BFF_MODE=live + VITE_BFF_FALLBACK=strict, the
 * hosted/production profile) must never synthesize a completed mutation
 * receipt when real writes are off or the session lacks write authority.
 * Only the explicit demo/test mock profile and the dev-default `auto`
 * fallback may still route through the mock mutation fixtures
 * (PFG-FE-HONEST-LIVE-20260820).
 */
export function refuseStrictLiveWrite(correlationId: string): never {
  throw makeBffError({
    code: "FEATURE_DISABLED",
    message: "Live writes are unavailable: real writes are disabled or the session lacks write authority.",
    correlationId,
    details: { reason: "write_unavailable" },
  });
}

export interface RunActionEnvelope extends CommandResponse<ActionCommandResponseData> {
  /** Pass-through to the underlying mock MutationResult for legacy consumers. */
  legacy: MutationResult;
}

export interface RunActionOptions {
  /** Reuse a parent chain's correlationId (default: mint root). */
  correlationId?: string;
  /** Reuse a caller's idempotency-key (default: mint ULID-like). */
  idempotencyKey?: string;
  /** v3 §6.2 confirm token issued by `requestConfirmToken`. */
  confirmToken?: string;
  /** Attach governance approval evidence for command-path callers. */
  approvalId?: string;
  approvalDecisionId?: string;
  /** Attach two-person authorization evidence for command-path callers. */
  twoManSignatureId?: string;
  secondOperatorId?: string;
  headers?: Record<string, string>;
  baseUrl?: string;
  /** Use only for explicit legacy-adapter compatibility checks. */
  route?: "legacy-actions" | "commands";
}

export type RunActionV1Options = RunActionOptions;

async function mockRunActionEnvelope(
  input: RunActionInput,
  resolved: { correlationId: string; idempotencyKey: string; confirmToken?: string },
): Promise<RunActionEnvelope> {
  const { mutations } = await import("@/lib/bff/mutations");
  const legacy = await mutations.runAction({
    ...input,
    correlationId: resolved.correlationId,
    idempotencyKey: resolved.idempotencyKey,
    confirmToken: resolved.confirmToken,
  });
  if (!legacy.ok) {
    throw makeBffError({
      code:
        legacy.rejected === "state_conflict" ? "STATE_CONFLICT"
        : legacy.rejected === "illegal_transition" ? "ILLEGAL_TRANSITION"
        : legacy.rejected === "invariant_violation" ? "STATE_CONFLICT"
        : "VALIDATION_FAILED",
      message: legacy.message ?? legacy.rejected ?? "rejected",
      correlationId: resolved.correlationId,
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
    correlationId: resolved.correlationId,
    idempotencyKey: resolved.idempotencyKey,
    message: legacy.message,
    legacy,
  };
}

/**
 * Command caller for live writes. When the live write gate is open it
 * posts directly to /bff/v1/commands; otherwise it falls back to mock
 * or fails closed in strict mode.
 */
export async function runCommandAction(
  input: RunActionInput,
  opts: RunActionOptions = {},
): Promise<CommandRunActionEnvelope | RunActionEnvelope> {
  const correlationId = opts.correlationId ?? input.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? input.idempotencyKey ?? mintIdemKey();
  const confirmToken = opts.confirmToken ?? input.confirmToken;

  if (await liveWriteGated()) {
    return commandClient.runAction(input, {
      correlationId,
      idempotencyKey,
      confirmToken,
      approvalId: opts.approvalId,
      approvalDecisionId: opts.approvalDecisionId,
      twoManSignatureId: opts.twoManSignatureId,
      secondOperatorId: opts.secondOperatorId,
      headers: opts.headers,
      baseUrl: opts.baseUrl,
    });
  }
  if (isStrictLiveFallback()) refuseStrictLiveWrite(correlationId);
  return mockRunActionEnvelope(input, { correlationId, idempotencyKey, confirmToken });
}

/**
 * Canonical live-write seam: dispatches entity actions through /bff/v1/commands
 * when live writes are enabled.
 */
export async function runAction(
  input: RunActionInput,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  if (opts.route !== "legacy-actions") {
    return runCommandAction(input, opts) as Promise<RunActionEnvelope>;
  }

  const correlationId = opts.correlationId ?? input.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? input.idempotencyKey ?? mintIdemKey();
  const confirmToken = opts.confirmToken ?? input.confirmToken;

  const mockBranch = () => mockRunActionEnvelope(input, { correlationId, idempotencyKey, confirmToken });

  if (await liveWriteGated()) {
    const livePath = paths.action(entityTypeForKind(input.kind), input.id, input.action);
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
        const mockLegacy = { ok: true as const, audit: { id: commandId }, message: "dispatched" } as unknown as MutationResult;
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
  if (isStrictLiveFallback()) refuseStrictLiveWrite(correlationId);
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

// ---------- Confirm token seam ----------

export type ConfirmTokenEnvelope = CommandResponse<ConfirmTokenResponse>;

export interface ConfirmTokenOptions {
  correlationId?: string;
  idempotencyKey?: string;
}

/**
 * v3 §6.2 — Create a confirm token.
 * Live path: POST /bff/confirm-tokens when liveWriteGated() is true.
 */
export async function requestConfirmToken(
  req: ConfirmTokenRequest,
  params: Record<string, string> = {},
  opts: ConfirmTokenOptions = {},
): Promise<ConfirmTokenEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();

  const mockBranch = async (): Promise<ConfirmTokenEnvelope> => {
    const { mutations } = await import("@/lib/bff/mutations");
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
  if (isStrictLiveFallback()) refuseStrictLiveWrite(correlationId);
  return mockBranch();
}

export type ConfirmTokenReadEnvelope = CommandResponse<ConfirmTokenResponse>;

/**
 * v3 §6.2 — Read a confirm token by id.
 * Live path: GET /bff/confirm-tokens/{tokenId}.
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

  if (await liveWriteGated()) {
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
  if (isStrictLiveFallback()) refuseStrictLiveWrite(correlationId);
  return mockBranch();
}

export type ConfirmTokenRedeemEnvelope = CommandResponse<{ tokenId: string; redeemed: true }>;

/**
 * v3 §6.2 — Redeem a confirm token.
 * Live path: POST /bff/confirm-tokens/{tokenId}/redeem.
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

  if (await liveWriteGated()) {
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
  if (isStrictLiveFallback()) refuseStrictLiveWrite(correlationId);
  return mockBranch();
}

export type ConfirmTokenDeleteEnvelope = CommandResponse<{ tokenId: string; deleted: true }>;

/**
 * v3 §6.2 — Delete/revoke a confirm token.
 * Live path: DELETE /bff/confirm-tokens/{tokenId}.
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

  if (await liveWriteGated()) {
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
  if (isStrictLiveFallback()) refuseStrictLiveWrite(correlationId);
  return mockBranch();
}

// ---------- decideApproval ----------

export type ApprovalDecision = "approve" | "reject" | "request_changes" | "escalate" | "freeze";

export type ApprovalDecisionEnvelope = CommandResponse<{ approvalId: string; decision: ApprovalDecision }>;

export interface ApprovalDecisionOptions {
  correlationId?: string;
  idempotencyKey?: string;
  stageName?: string;
}

/**
 * Live path: POST /bff/approvals/{id}/decide.
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
    const { mutations } = await import("@/lib/bff/mutations");
    const r = await mutations.decideApproval(id, decision, memo, { stageName: opts.stageName });
    if (!r.ok) {
      throw makeBffError({ code: "VALIDATION_FAILED", message: r.message ?? "decision rejected", correlationId });
    }
    return { ok: true, data: { approvalId: id, decision }, auditEventId: r.audit.id, correlationId, idempotencyKey };
  };

  if (await liveWriteGated()) {
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
  if (isStrictLiveFallback()) refuseStrictLiveWrite(correlationId);
  return mockBranch();
}

// ---------- acknowledgeAlert ----------

export type AlertAckEnvelope = CommandResponse<{ alertId: string }>;

export interface AlertAckOptions {
  correlationId?: string;
  idempotencyKey?: string;
}

/**
 * Live path: POST /bff/alerts/{id}/acknowledge.
 */
export async function acknowledgeAlert(
  id: string,
  memo?: string,
  opts: AlertAckOptions = {},
): Promise<AlertAckEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();

  const mockBranch = async (): Promise<AlertAckEnvelope> => {
    const { mutations } = await import("@/lib/bff/mutations");
    const r = await mutations.acknowledgeAlert(id, memo);
    return { ok: true, data: { alertId: id }, auditEventId: r.audit.id, correlationId, idempotencyKey };
  };

  if (await liveWriteGated()) {
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
  if (isStrictLiveFallback()) refuseStrictLiveWrite(correlationId);
  return mockBranch();
}

// ---------- decideIntervention (v5) ----------

export type InterventionDecision = "acknowledge" | "approve" | "reject" | "dismiss" | "escalate";

export type InterventionDecisionEnvelope = CommandResponse<{ interventionId: string; decision: InterventionDecision }>;

export interface InterventionDecisionOptions {
  correlationId?: string;
  idempotencyKey?: string;
}

/**
 * v5 closed-loop — POST /bff/v5/interventions/{id}/decide.
 */
export async function decideIntervention(
  id: string,
  decision: InterventionDecision,
  memo: string,
  opts: InterventionDecisionOptions = {},
): Promise<InterventionDecisionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();

  const mockBranch = async (): Promise<InterventionDecisionEnvelope> => ({
    ok: true,
    data: { interventionId: id, decision },
    auditEventId: `au_mock_iv_${id}`,
    correlationId,
    idempotencyKey,
  });

  if (await liveWriteGated()) {
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
  if (isStrictLiveFallback()) refuseStrictLiveWrite(correlationId);
  return mockBranch();
}

// ---------- decideEvolutionReview ----------

export type EvolutionReviewDecision = "approve" | "reject";

export type EvolutionReviewDecisionOptions = {
  memo?: string;
  approvalDecisionId?: string | null;
  correlationId?: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  baseUrl?: string;
};

export function evolutionReviewDecisionPayload(
  decisionId: string,
  decision: EvolutionReviewDecision,
  opts: EvolutionReviewDecisionOptions = {},
): FinalCommandEnvelope {
  const cleanDecisionId = decisionId.trim();
  const cleanApprovalDecisionId = String(opts.approvalDecisionId ?? "").trim() || undefined;
  const memo = String(opts.memo ?? "").trim() || `Evolution decision ${decision}`;
  const params = {
    evolution_decision_id: cleanDecisionId,
    approval_action: decision,
    ...(cleanApprovalDecisionId ? {
      approval_decision_id: cleanApprovalDecisionId,
      approvalDecisionId: cleanApprovalDecisionId,
    } : {}),
    note: memo,
    approval_rationale: memo,
    frontend_source_route: paths.evolutionMutationReview(cleanDecisionId),
  };

  return {
    command: "ApproveEvolutionDecision",
    target: {
      type: "EvolutionDecision",
      id: cleanDecisionId,
    },
    action: decision,
    params,
    audit_context: {
      reason: memo,
      incident_id: null,
    },
    ...(cleanApprovalDecisionId ? { approvalDecisionId: cleanApprovalDecisionId } : {}),
  };
}

export async function decideEvolutionReview(
  decisionId: string,
  decision: EvolutionReviewDecision,
  opts: EvolutionReviewDecisionOptions = {},
): Promise<BackendCommandResponse> {
  const cleanDecisionId = decisionId.trim();
  if (!cleanDecisionId) {
    throw new Error("Evolution review decision requires a decision id.");
  }
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  return submitCommand(
    evolutionReviewDecisionPayload(cleanDecisionId, decision, opts),
    {
      correlationId,
      idempotencyKey,
      approvalDecisionId: opts.approvalDecisionId ?? undefined,
      headers: opts.headers,
      baseUrl: opts.baseUrl,
    },
  );
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
  decideEvolutionReview,
  liveWriteGated,
};

export const writes = {
  runAction,
  tryRunAction,
  requestConfirmToken,
  readConfirmToken,
  redeemConfirmToken,
  deleteConfirmToken,
  decideApproval,
  acknowledgeAlert,
  decideIntervention,
  decideEvolutionReview,
  liveWriteGated,
};

