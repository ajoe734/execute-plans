import type { Persona } from "./dto";
import { bffFetch } from "./client";
import { BffError } from "./errors";
import { paths } from "./paths";
import { strictLivePaginatedListNormalized } from "./domainReads";
import { runAction } from "./writes";

type BffEnvelope<T> = { data?: T; meta?: unknown } | T;

export interface PersonaWriteOptions {
  idempotencyKey?: string;
  correlationId?: string;
}

export type PersonaCreatePayload = Partial<Persona> & {
  description?: string;
  memo?: string;
  initialMode?: string;
  executionMode?: string;
  capitalMode?: string;
  deploymentStage?: string;
  liveCapitalEnabled?: boolean;
  orderSideEffectsAllowed?: boolean;
  capitalSideEffectsAllowed?: boolean;
};

export interface PaperPersonaBundle extends Omit<Persona, "state"> {
  /** Paper-runtime-specific lifecycle value not in the base `LifecycleState` union. */
  state: "paper_running";
  paperLedgerId: string;
  runtimeBindingId: string;
  runtimeId?: string;
  deploymentPlanId?: string;
  failedStep?: string;
}

export class PaperPersonaBundleIncompleteError extends Error {
  constructor(
    readonly personaId: string | undefined,
    readonly failedStep: string,
  ) {
    super(`Paper persona setup is incomplete at ${failedStep}`);
    this.name = "PaperPersonaBundleIncompleteError";
  }
}

function unwrapData<T>(payload: BffEnvelope<T>): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export async function createPersona(
  payload: PersonaCreatePayload,
  opts: PersonaWriteOptions = {},
): Promise<PaperPersonaBundle> {
  const raw = await bffFetch<BffEnvelope<PaperPersonaBundle>>({
    method: "POST",
    path: "/bff/management/personas/create-paper-bundle",
    body: payload,
    idempotencyKey: opts.idempotencyKey,
    correlationId: opts.correlationId,
  });
  const bundle = unwrapData<PaperPersonaBundle>(raw);
  const failedStep = String(bundle.failedStep ?? "bundle_verification");
  if (
    bundle.state !== "paper_running" ||
    !bundle.paperLedgerId ||
    !bundle.runtimeBindingId
  ) {
    throw new PaperPersonaBundleIncompleteError(bundle.id, failedStep);
  }
  return bundle;
}

export async function listPersonas(): Promise<Persona[]> {
  return strictLivePaginatedListNormalized("personas.list", paths.personas());
}

export interface PersonaManagementSurfaceStatus {
  status?: "ok" | "empty" | "unavailable" | string;
  count?: number;
  source?: string;
  authoritative?: boolean;
  reason?: string | null;
}

export interface PersonaManagementEnvelope {
  data?: {
    persona?: Record<string, unknown> & {
      id?: string;
      name?: string;
      lifecycle_state?: string;
      lifecycleState?: string;
      state?: string;
      lifecycleStatus?: string;
      status?: string;
      containment_state?: string;
      frozen?: boolean;
      metadata?: Record<string, unknown>;
    };
    bindings?: Array<Record<string, unknown>>;
    deploymentPlans?: Array<Record<string, unknown>>;
    approvals?: Array<Record<string, unknown>>;
    sessions?: Array<Record<string, unknown>>;
    teaching_sessions?: Array<Record<string, unknown>>;
    allowedActions?: string[];
    runtimeBindings?: Array<Record<string, unknown>>;
    capitalPools?: Array<Record<string, unknown>>;
    activeIncidents?: Array<Record<string, unknown>>;
    latestTelemetry?: Record<string, unknown> | null;
    health?: {
      status?: "healthy" | "degraded" | "critical" | "unknown";
      reasons?: string[];
      latest_telemetry_at?: string | null;
      latestTelemetryAt?: string | null;
      pnl?: number | null;
      drawdown?: number | null;
      activeSessions?: number;
    };
  };
  meta?: {
    snapshot_at?: string;
    surfaces?: Record<string, PersonaManagementSurfaceStatus>;
  };
}

export async function getPersona(id: string): Promise<Persona | undefined> {
  try {
    const raw = await bffFetch<BffEnvelope<Persona>>({
      method: "GET",
      path: paths.persona(id),
    });
    return unwrapData<Persona>(raw);
  } catch (err) {
    if (err instanceof BffError && err.status === 404) return undefined;
    throw err;
  }
}

export async function getPersonaManagement(
  id: string,
): Promise<PersonaManagementEnvelope | undefined> {
  try {
    return await bffFetch<PersonaManagementEnvelope>({
      method: "GET",
      path: `/api/v1/operator/persona-management/${encodeURIComponent(id)}`,
    });
  } catch (err) {
    if (err instanceof BffError && err.status === 404) return undefined;
    throw err;
  }
}

export async function runPersonaAction(
  id: string,
  action: string,
  payload: Record<string, unknown> = {},
  opts: PersonaWriteOptions = {},
): Promise<Record<string, unknown>> {
  const memo = typeof payload.memo === "string" ? payload.memo : undefined;
  const reason = typeof payload.reason === "string" ? payload.reason : undefined;
  const confirmToken = typeof payload.confirmToken === "string" ? payload.confirmToken : undefined;
  const envelope = await runAction(
    {
      kind: "Persona",
      id,
      action,
      memo,
      reason,
      confirmToken,
      payload,
    },
    {
      correlationId: opts.correlationId,
      idempotencyKey: opts.idempotencyKey,
      confirmToken,
    },
  );
  return envelope as unknown as Record<string, unknown>;
}

export async function testPersonaPrompt(
  id: string,
  prompt: string,
  opts: PersonaWriteOptions & { params?: Record<string, unknown> } = {},
): Promise<Record<string, unknown>> {
  return bffFetch<Record<string, unknown>>({
    method: "POST",
    path: `${paths.persona(id)}/test-prompt`,
    body: { prompt, params: opts.params ?? {} },
    idempotencyKey: opts.idempotencyKey,
    correlationId: opts.correlationId,
  });
}

export const personas = {
  list: listPersonas,
  get: getPersona,
  getManagement: getPersonaManagement,
  create: createPersona,
  runAction: runPersonaAction,
  testPrompt: testPersonaPrompt,
};
