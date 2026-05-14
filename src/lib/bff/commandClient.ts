import type { RunActionInput, MutationResult } from "./mutations";
import { bffFetch } from "@/lib/bff-v1/client";
import type {
  ActionCommandResponseData,
  ActionCommandStatus,
  CommandResponse as FrontendCommandResponse,
} from "@/lib/bff-v1/dto";
import { isActionCommandStatus } from "@/lib/bff-v1/dto";

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

export function buildRunActionCommand(
  input: RunActionInput,
  opts: CommandClientOptions,
): FinalCommandEnvelope {
  const entityType = entityTypeForKind(input.kind);
  const spec = specForEntityType(entityType);
  const actionId = input.action.trim();
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
    command: spec.command,
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
