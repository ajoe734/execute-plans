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
import { isStrictLiveFallback } from "./liveTransport";
import { liveWriteGated, sessionKindAllowsWrite } from "./writeGate";
import { paths } from "./paths";
import type {
  AuditEvent,
  LifecycleState,
  Incident,
  AllocationLimit,
  Job,
  PermissionGrant,
  RoutePolicyRule,
  ConsultRule,
  RiskLevel,
  ApprovalRequest,
} from "./dto";
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
  if (isStrictLiveFallback()) {
    refuseStrictLiveWrite(resolved.correlationId);
  }
  if (input.kind === "Strategy" && input.action === "promote_live" && input.id === "stg_005") {
    throw makeBffError({
      code: "PRECONDITION_FAILED",
      message: "Illegal transition: cannot promote_live from discovered state.",
      correlationId: resolved.correlationId,
    });
  }
  const actionId = `au_${resolved.idempotencyKey}`;
  return {
    ok: true,
    correlationId: resolved.correlationId,
    idempotencyKey: resolved.idempotencyKey,
    auditEventId: actionId,
    data: {
      actionId,
      status: "completed",
    },
    legacy: {
      ok: true,
      data: { actionId, status: "completed" },
      audit: {
        id: actionId,
        correlationId: resolved.correlationId,
        idempotencyKey: resolved.idempotencyKey,
        action: input.action,
        entityKind: input.kind,
        entityId: input.id,
        status: "succeeded",
        timestamp: new Date().toISOString(),
      },
    },
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
    const rawData = await bffFetch<unknown>({
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
      mode: "live",
    });
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
    refuseStrictLiveWrite(correlationId);
  };

  if (await liveWriteGated()) {
    const rawData = await bffFetch<unknown>({
      method: "POST",
      path: paths.confirmTokens(),
      body: req,
      idempotencyKey,
      headers: { "X-Correlation-Id": correlationId },
      mode: "live",
    });
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
  }
  if (isStrictLiveFallback()) {
    refuseStrictLiveWrite(correlationId);
  }
  const action = getHighRiskAction(req.actionId);
  if (!action) {
    throw makeBffError({
      code: "VALIDATION_FAILED",
      message: `Unknown action: ${req.actionId}`,
      correlationId,
    });
  }
  const ttl = action?.tokenTtlSeconds ?? 300;
  const ctResp: ConfirmTokenResponse = {
    confirmToken: `ctok_${Date.now().toString(36)}`,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    ttlSeconds: ttl,
    requiredPhrase: buildConfirmPhrase(action, { ...params, [`${req.entityType}Id`]: req.entityId }),
    requiresMemo: action?.memoRequired ?? false,
    auditEventPreview: `${req.actionId}.requested`,
  };
  return { ok: true, data: ctResp, correlationId, idempotencyKey };
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

  if (await liveWriteGated()) {
    const rawData = await bffFetch<unknown>({
      method: "GET",
      path: paths.confirmToken(tokenId),
      headers: { "X-Correlation-Id": correlationId },
      mode: "live",
    });
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
  }
  if (isStrictLiveFallback()) {
    refuseStrictLiveWrite(correlationId);
  }
  return {
    ok: true,
    data: { confirmToken: tokenId, ttlSeconds: 300, requiredPhrase: "" } as ConfirmTokenResponse,
    correlationId,
    idempotencyKey,
  };
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

  if (await liveWriteGated()) {
    await bffFetch<unknown>({
      method: "POST",
      path: paths.confirmTokenRedeem(tokenId),
      body: {},
      idempotencyKey,
      headers: { "X-Correlation-Id": correlationId },
      mode: "live",
    });
    return { ok: true, data: { tokenId, redeemed: true }, correlationId, idempotencyKey };
  }
  if (isStrictLiveFallback()) {
    refuseStrictLiveWrite(correlationId);
  }
  return { ok: true, data: { tokenId, redeemed: true }, correlationId, idempotencyKey };
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

  if (await liveWriteGated()) {
    await bffFetch<unknown>({
      method: "DELETE",
      path: paths.confirmToken(tokenId),
      idempotencyKey,
      headers: { "X-Correlation-Id": correlationId },
      mode: "live",
    });
    return { ok: true, data: { tokenId, deleted: true }, correlationId, idempotencyKey };
  }
  if (isStrictLiveFallback()) {
    refuseStrictLiveWrite(correlationId);
  }
  return { ok: true, data: { tokenId, deleted: true }, correlationId, idempotencyKey };
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

  if (await liveWriteGated()) {
    const data = await bffFetch<unknown>({
      method: "POST",
      path: paths.approvalDecide(id),
      body: { decision, memo, stageName: opts.stageName },
      idempotencyKey,
      headers: { "X-Correlation-Id": correlationId },
      mode: "live",
    });
    const d = data as { approvalId?: string; decision?: ApprovalDecision };
    return { ok: true, data: { approvalId: d.approvalId ?? id, decision: d.decision ?? decision }, correlationId, idempotencyKey };
  }
  if (isStrictLiveFallback()) {
    refuseStrictLiveWrite(correlationId);
  }
  return { ok: true, data: { approvalId: id, decision }, correlationId, idempotencyKey };
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

  if (await liveWriteGated()) {
    await bffFetch<unknown>({
      method: "POST",
      path: paths.alertAcknowledge(id),
      body: memo ? { memo } : {},
      idempotencyKey,
      headers: { "X-Correlation-Id": correlationId },
      mode: "live",
    });
    return { ok: true, data: { alertId: id }, correlationId, idempotencyKey };
  }
  if (isStrictLiveFallback()) {
    refuseStrictLiveWrite(correlationId);
  }
  return { ok: true, data: { alertId: id }, correlationId, idempotencyKey };
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

  if (await liveWriteGated()) {
    const data = await bffFetch<unknown>({
      method: "POST",
      path: paths.v5InterventionDecide(id),
      body: { decision, memo },
      idempotencyKey,
      headers: { "X-Correlation-Id": correlationId },
      mode: "live",
    });
    const d = data as { interventionId?: string; decision?: InterventionDecision };
    return { ok: true, data: { interventionId: d.interventionId ?? id, decision: d.decision ?? decision }, correlationId, idempotencyKey };
  }
  if (isStrictLiveFallback()) {
    refuseStrictLiveWrite(correlationId);
  }
  return {
    ok: true,
    data: { interventionId: id, decision },
    auditEventId: `au_mock_iv_${id}`,
    correlationId,
    idempotencyKey,
  };
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

// ---------- Domain Writes ----------

export async function freezePool(
  poolId: string,
  reason: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "CapitalPool", id: poolId, action: "freeze_pool", memo: reason }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function unfreezePool(
  poolId: string,
  freezeId: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "CapitalPool", id: poolId, action: "unfreeze_pool", memo: memo ?? freezeId }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function lockParams(
  strategyId: string,
  lock: boolean,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "Strategy", id: strategyId, action: lock ? "lock_params" : "unlock_params", memo }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function rollback(
  kind: string,
  id: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind, id, action: "rollback", memo }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function pause(
  kind: string,
  id: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind, id, action: "pause", memo }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function promoteCandidate(
  programId: string,
  candidateId: string,
  target: "paper" | "live",
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "Evolution", id: programId, action: `promote_${target}`, memo: memo ?? candidateId }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function freezeGeneration(
  programId: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "Evolution", id: programId, action: "freeze_generation", memo }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function submitOverride(
  rebalanceId: string,
  strategyId: string,
  delta: number,
  reason: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "Rebalance", id: rebalanceId, action: "submit_override", memo: `${strategyId} Δ${delta}: ${reason}` }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function advanceRebalanceStep(
  rebalanceId: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope & { stepId?: string; jobId?: string }> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    const env = await runAction({ kind: "Rebalance", id: rebalanceId, action: "advance_workflow_step", memo }, { ...opts, correlationId, idempotencyKey });
    return { ...env, stepId: undefined, jobId: undefined };
  }
  refuseStrictLiveWrite(correlationId);
}

export async function rerunRebalanceStep(
  rebalanceId: string,
  stepId: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope & { jobId?: string }> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    const env = await runAction({ kind: "Rebalance", id: rebalanceId, action: "rerun_workflow_step", memo: stepId }, { ...opts, correlationId, idempotencyKey });
    return { ...env, jobId: undefined };
  }
  refuseStrictLiveWrite(correlationId);
}

export async function setAllocationLimit(
  poolId: string,
  scope: AllocationLimit["scope"] | string,
  scopeRef: string,
  cap: number,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "CapitalPool", id: poolId, action: "set_limit", memo: `${scope}:${scopeRef} cap ${(cap * 100).toFixed(0)}%` }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function freezeMetric(
  rebalanceId: string,
  metric: string,
  frozen: boolean,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "Rebalance", id: rebalanceId, action: frozen ? "freeze_metric" : "unfreeze_metric", memo: memo ?? metric }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function setIncidentStatus(
  id: string,
  status: Incident["status"],
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "Incident", id, action: status, memo }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function appendIncidentMitigation(
  incidentId: string,
  content: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "Incident", id: incidentId, action: "append_mitigation", memo: content }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function appendPostmortem(
  incidentId: string,
  note: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "Incident", id: incidentId, action: "append_postmortem", memo: note }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function createTrainingFeedback(
  incidentId: string,
  content: string,
  target?: { kind: string; id: string },
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope & { feedbackId: string }> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    const env = await runAction({ kind: "Incident", id: incidentId, action: "create_training_feedback", memo: target ? `${target.kind}:${target.id}: ${content}` : content }, { ...opts, correlationId, idempotencyKey });
    return { ...env, feedbackId: env.auditEventId };
  }
  refuseStrictLiveWrite(correlationId);
}

export async function createEvolutionConstraint(
  incidentId: string,
  content: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope & { constraintId: string }> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    const env = await runAction({ kind: "Incident", id: incidentId, action: "create_evolution_constraint", memo: content }, { ...opts, correlationId, idempotencyKey });
    return { ...env, constraintId: env.auditEventId };
  }
  refuseStrictLiveWrite(correlationId);
}

export async function promoteLive(
  strategyId: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "Strategy", id: strategyId, action: "promote_live", memo }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function emergencyKill(
  target: { kind: string; id: string },
  memo: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: target.kind, id: target.id, action: "emergency_kill", memo }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function rotateMcpSecret(
  secretId: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "McpSecret", id: secretId, action: "rotate_secret", memo }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function promoteStage(
  deploymentId: string,
  stageId: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "Deployment", id: deploymentId, action: "promote_stage", memo: memo ?? stageId }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function reduceAllocation(
  deploymentId: string,
  newPct: number,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "Deployment", id: deploymentId, action: "reduce_allocation", memo: memo ?? `→ ${newPct}%` }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function runParameterSweep(
  strategyId: string,
  sweepOpts: { params?: string[]; memo?: string } = {},
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope & { job?: Job }> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    const env = await runAction({ kind: "Strategy", id: strategyId, action: "run_sweep", memo: sweepOpts.memo ?? (sweepOpts.params?.join(",") ?? "all") }, { ...opts, correlationId, idempotencyKey });
    return { ...env, job: undefined };
  }
  refuseStrictLiveWrite(correlationId);
}

export async function runtimeAction(
  runtimeId: string,
  action: "restart" | "drain" | "move" | "scale" | "quarantine" | "inspect_logs",
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope & { job?: Job }> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    const env = await runAction({ kind: "Runtime", id: runtimeId, action, memo }, { ...opts, correlationId, idempotencyKey });
    return { ...env, job: undefined };
  }
  refuseStrictLiveWrite(correlationId);
}

export async function rankingAction(
  scope: "persona" | "strategy" | "alphaFamily" | "capitalPool" | "paper" | "live",
  action: "recalculate" | "freeze" | "publish" | "override" | "compare",
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope & { job?: Job }> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    const env = await runAction({ kind: "Ranking", id: `ranking:${scope}`, action, memo }, { ...opts, correlationId, idempotencyKey });
    return { ...env, job: undefined };
  }
  refuseStrictLiveWrite(correlationId);
}

export async function setActiveRankingFormula(
  formulaId: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "RankingFormula", id: formulaId, action: "set_active", memo }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function scheduleDeployment(
  deploymentId: string,
  when: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "Deployment", id: deploymentId, action: "schedule", memo: memo ?? when }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function personaOps(
  personaId: string,
  op: "test" | "run_eval" | "restrict_tools",
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope & { job?: Job }> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    const env = await runAction({ kind: "Persona", id: personaId, action: op, memo }, { ...opts, correlationId, idempotencyKey });
    return { ...env, job: undefined };
  }
  refuseStrictLiveWrite(correlationId);
}

export async function publishRebalanceReport(
  rebalanceId: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "Rebalance", id: rebalanceId, action: "publish_report", memo }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function updatePermissionMatrix(
  instance: string,
  updates: { rowId: string; colId: string; grant: PermissionGrant }[],
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "PermissionMatrix", id: instance, action: "update_cells", memo: memo ?? `${updates.length} cell(s)` }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function publishRoutePolicy(
  policyId: string,
  rules: RoutePolicyRule[],
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "RoutePolicy", id: policyId, action: "submit_review", memo: memo ?? `${rules.length} rule(s)` }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function updateConsultRules(
  rules: ConsultRule[],
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return runAction({ kind: "ConsultRule", id: "consult-rules", action: "update_rules", memo: memo ?? `${rules.length} rule(s)` }, { ...opts, correlationId, idempotencyKey });
  }
  refuseStrictLiveWrite(correlationId);
}

export async function createApproval(
  input: {
    kind: string;
    subject: string;
    rationale?: string;
    diffSummary?: string;
    riskLevel?: RiskLevel;
    stages?: { name: string; slaHours: number; escalateTo?: string }[];
    handoffId?: string;
  },
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope & { approval?: ApprovalRequest }> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    const env = await runAction({ kind: "Approval", id: "new", action: "create", memo: input.subject }, { ...opts, correlationId, idempotencyKey });
    return { ...env, approval: undefined };
  }
  refuseStrictLiveWrite(correlationId);
}

export async function approve(
  id: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return decideApproval(id, "approve", memo ?? "approved", { ...opts, correlationId, idempotencyKey }) as unknown as RunActionEnvelope;
  }
  refuseStrictLiveWrite(correlationId);
}

export async function reject(
  id: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    return decideApproval(id, "reject", memo ?? "rejected", { ...opts, correlationId, idempotencyKey }) as unknown as RunActionEnvelope;
  }
  refuseStrictLiveWrite(correlationId);
}

export async function batchDecideApproval(
  ids: string[],
  decision: "approve" | "reject",
  memo: string,
  opts: RunActionOptions = {},
): Promise<{ ok: boolean; results: RunActionEnvelope[] }> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    const results: RunActionEnvelope[] = [];
    for (const id of ids) {
      const res = await decideApproval(id, decision, memo, { ...opts, correlationId, idempotencyKey });
      results.push(res as unknown as RunActionEnvelope);
    }
    return { ok: true, results };
  }
  refuseStrictLiveWrite(correlationId);
}

export async function tickApprovalSla(
  _nowIso: string = new Date().toISOString(),
  _opts: RunActionOptions = {},
): Promise<{ ok: true; escalated: AuditEvent[] }> {
  return { ok: true, escalated: [] };
}

export async function escalateAlertToIncident(
  alertId: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope & { incidentId?: string }> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    const env = await runAction({ kind: "Alert", id: alertId, action: "escalate_incident", memo }, { ...opts, correlationId, idempotencyKey });
    return { ...env, incidentId: env.auditEventId };
  }
  refuseStrictLiveWrite(correlationId);
}

export async function createResearchTaskFromNote(
  noteId: string,
  memo?: string,
  opts: RunActionOptions = {},
): Promise<RunActionEnvelope & { job?: Job }> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const idempotencyKey = opts.idempotencyKey ?? mintIdemKey();
  if (await liveWriteGated()) {
    const env = await runAction({ kind: "Research", id: noteId, action: "convert_research_task", memo }, { ...opts, correlationId, idempotencyKey });
    return { ...env, job: undefined };
  }
  refuseStrictLiveWrite(correlationId);
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
  freezePool,
  unfreezePool,
  lockParams,
  rollback,
  pause,
  promoteCandidate,
  freezeGeneration,
  submitOverride,
  advanceRebalanceStep,
  rerunRebalanceStep,
  setAllocationLimit,
  freezeMetric,
  setIncidentStatus,
  appendIncidentMitigation,
  appendPostmortem,
  createTrainingFeedback,
  createEvolutionConstraint,
  promoteLive,
  emergencyKill,
  rotateMcpSecret,
  promoteStage,
  reduceAllocation,
  runParameterSweep,
  runtimeAction,
  rankingAction,
  setActiveRankingFormula,
  scheduleDeployment,
  personaOps,
  publishRebalanceReport,
  updatePermissionMatrix,
  publishRoutePolicy,
  updateConsultRules,
  createApproval,
  approve,
  reject,
  batchDecideApproval,
  tickApprovalSla,
  escalateAlertToIncident,
  createResearchTaskFromNote,
};

export const writes = bffWrites;


