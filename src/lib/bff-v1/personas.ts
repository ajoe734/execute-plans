import type { PaperRiskTier, Persona, PersonaRiskPolicyChange, PersonaRiskPolicyChangeStatus } from "./dto";
import { bffFetch } from "./client";
import { BffError, makeBffError } from "./errors";
import { liveWriteGated } from "./writeGate";
import { paths } from "./paths";
import { strictLivePaginatedListNormalized } from "./domainReads";
import { runAction } from "./writes";

export type { PaperRiskTier, PersonaRiskPolicyChange, PersonaRiskPolicyChangeStatus };

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
  /** Pool version of the cycle observation behind pool_health / member_virtual_books. */
  observed_pool_version?: number | null;
  source?: string;
  authoritative?: boolean;
  reason?: string | null;
}

/** Owner-shaped strategy pool read (BFF-PERSONA-POOL-VIEWS-20261112). Every section is null when unavailable. */
export interface PoolMemberRecord {
  artifact_ref: string;
  checksum: string;
  stage: "trial" | "active" | "removed" | string;
  risk_weight: number | null;
  baseline_ref: string | null;
  joined_at?: string | null;
  removed_at?: string | null;
  removal_reason?: string | null;
}
export interface PoolVersionRecord {
  tenant_id: string;
  persona_id: string;
  pool_version: number;
  digest: string;
  members: PoolMemberRecord[];
  change_reason?: string | null;
  created_at?: string | null;
}
export interface PoolNetMetrics {
  total_return?: number | null;
  sharpe_ratio?: number | null;
  max_drawdown?: number | null;
  observation_count?: number | null;
  basis?: string | null;
}
export interface PoolBaselineComparison {
  status: string;
  reason?: string | null;
  sharpe_delta?: number;
  drawdown_delta?: number;
  below_baseline_sharpe?: boolean;
  exceeds_baseline_drawdown?: boolean;
}
export interface PoolMemberBookRow {
  artifact_ref: string;
  checksum: string;
  stage: string;
  risk_weight: number | null;
  baseline_ref: string | null;
  status: "ok" | "unavailable" | string;
  reason: string | null;
  book: {
    net_of_costs?: PoolNetMetrics;
    baseline_comparison?: PoolBaselineComparison;
    [key: string]: unknown;
  } | null;
}
export interface PoolHealthMeasure {
  status: "known" | "unknown" | string;
  value?: number | null;
  reason?: string | null;
}
export interface PoolHealthRecord {
  pool_version?: number;
  window_trading_days?: number;
  window_start?: string | null;
  window_end?: string | null;
  gross_utilisation?: PoolHealthMeasure;
  drawdown_utilisation?: PoolHealthMeasure;
  effective_bets?: PoolHealthMeasure;
  idle_day_share?: PoolHealthMeasure;
  demand_reasons?: string[];
}
export interface PoolCycleRecord {
  packet_id: string;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  phase?: string | null;
  failure_reason?: string | null;
  decisions?: Array<Record<string, unknown>> | null;
  pool_autonomy?: Record<string, unknown> | null;
}
export interface PoolDemandRecord {
  demand_id: string;
  persona_id?: string;
  mandate?: string;
  short_measure?: string;
  pool_version?: number;
  status?: string;
  created_at?: string;
  expires_at?: string;
  [key: string]: unknown;
}
/** One row per distinct artifact_ref (BFF-PERSONA-STRATEGY-VISIBILITY-20261119). */
export interface PoolMemberRuleRow {
  artifact_ref: string;
  checksum?: string;
  status: "ok" | "unavailable" | string;
  reason?: string | null;
  strategy_id?: string | null;
  version?: string | null;
  strategy_logic?: Record<string, unknown> | null;
  parameters?: Record<string, unknown> | null;
  adjustable_controls?: Array<Record<string, unknown>> | null;
  immutable_parameters?: string[] | null;
  expression_policy?: Record<string, unknown> | null;
}
export interface PersonaStrategyPoolView {
  memberRules?: PoolMemberRuleRow[] | null;
  current: PoolVersionRecord | null;
  versions: PoolVersionRecord[] | null;
  memberVirtualBooks: PoolMemberBookRow[] | null;
  health: PoolHealthRecord | null;
  cycles: PoolCycleRecord[] | null;
  openDemands: PoolDemandRecord[] | null;
}

/** Owner-shaped cycle/memory/memo/harness read (BFF-PERSONA-CYCLE-VIEWS-20261112). Every section is null when unavailable. */
export interface PersonaCycleHealth {
  status: "running" | "completed" | "failed" | "unobserved" | "unavailable" | string;
  last_packet_id: string | null;
  stage: string | null;
  failure_reason: string | null;
  updated_at?: string | null;
  harness_version?: number | null;
  risk_status?: string | null;
}
export interface PersonaCyclePacket {
  packet_id: string;
  stage?: string | null;
  updated_at?: string | null;
  phase?: string | null;
  failure_reason?: string | null;
  harness_version?: number | null;
}
export interface PersonaMemoryEntry {
  memory_id: string;
  memory_type?: string | null;
  written_at?: string | null;
  source_event_id?: string | null;
  summary?: string | null;
}
export interface PersonaConsultationMemo {
  memo_id: string;
  request_id?: string | null;
  status?: string | null;
  summary?: string | null;
  recommendation?: string | null;
  created_at?: string | null;
  evidence_refs?: string[] | null;
}
export interface PersonaHarnessVersionRow {
  schema_version?: number | string | null;
  persona_id?: string;
  version: number;
  parent_version?: number | null;
  patch_id?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  content_digest?: string | null;
}
export interface PersonaHarnessExperience {
  memory_id: string;
  source_event_id?: string | null;
  written_at?: string | null;
  summary?: string | null;
  experience?: {
    cue?: unknown;
    lesson?: unknown;
    outcome?: unknown;
    confidence?: number | null;
    evidence_refs?: string[] | null;
    harness_version?: number | null;
    proposal_ids?: string[] | null;
  };
}
export interface PersonaCycleView {
  cycle: { health: PersonaCycleHealth; packets: PersonaCyclePacket[] } | null;
  memorySummary: { returned: number; limit: number; entries: PersonaMemoryEntry[] } | null;
  consultationMemos: PersonaConsultationMemo[] | null;
  harness: { active_version: number; versions: PersonaHarnessVersionRow[] } | null;
  harnessExperiences: PersonaHarnessExperience[] | null;
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
    strategyPool?: PersonaStrategyPoolView | null;
    personaCycle?: PersonaCycleView | null;
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

export interface PersonaRiskPatchPayload {
  risk: PaperRiskTier;
}

export function normalizePaperRiskTier(value: unknown): PaperRiskTier | null {
  const clean = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (clean === "low" || clean === "medium" || clean === "high") {
    return clean;
  }
  return null;
}

export function normalizePersonaRiskPolicyChange(raw: unknown): PersonaRiskPolicyChange | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const requestedRisk = normalizePaperRiskTier(record.requestedRisk);
  const effectiveRisk = normalizePaperRiskTier(record.effectiveRisk);
  const rawStatus = typeof record.status === "string" ? record.status.trim() : "";
  const lowerStatus = rawStatus.toLowerCase();
  const status: PersonaRiskPolicyChangeStatus =
    lowerStatus === "effective"
      ? "effective"
      : lowerStatus === "pending_approval" || lowerStatus === "pending"
        ? "pending_approval"
        : lowerStatus === "unavailable"
          ? "unavailable"
          : lowerStatus === "failed" || lowerStatus === "error"
            ? "failed"
            : rawStatus || "unavailable";
  const rawPolicyVersion = record.policyVersion;
  const policyVersion =
    typeof rawPolicyVersion === "string" && rawPolicyVersion.trim()
      ? rawPolicyVersion.trim()
      : typeof rawPolicyVersion === "number" && Number.isFinite(rawPolicyVersion)
        ? String(rawPolicyVersion)
        : null;
  const rawApprovalId = record.approvalId;
  const approvalId =
    typeof rawApprovalId === "string" && rawApprovalId.trim() ? rawApprovalId.trim() : null;
  const rawReason = record.reason;
  const reason = typeof rawReason === "string" && rawReason.trim() ? rawReason.trim() : null;

  return {
    requestedRisk,
    effectiveRisk,
    status,
    policyVersion,
    approvalId,
    ...(reason ? { reason } : {}),
  };
}

function normalizePersonaDetail(persona: Persona | undefined): Persona | undefined {
  if (!persona || typeof persona !== "object") return persona;
  const rawChange = persona.riskPolicyChange;
  if (rawChange === undefined) {
    return persona;
  }
  return {
    ...persona,
    riskPolicyChange: normalizePersonaRiskPolicyChange(rawChange),
  };
}

export async function getPersona(id: string): Promise<Persona | undefined> {
  try {
    const raw = await bffFetch<BffEnvelope<Persona>>({
      method: "GET",
      path: paths.persona(id),
    });
    return normalizePersonaDetail(unwrapData<Persona>(raw));
  } catch (err) {
    if (err instanceof BffError && err.status === 404) return undefined;
    throw err;
  }
}

export async function patchPersonaRisk(
  id: string,
  payload: PersonaRiskPatchPayload,
  opts: PersonaWriteOptions = {},
): Promise<Persona> {
  const personaId = id.trim();
  if (!personaId) {
    throw new Error("Persona id is required.");
  }
  const tier = normalizePaperRiskTier(payload?.risk);
  if (!tier) {
    throw new Error(`Invalid paper risk tier: ${String(payload?.risk ?? "")}`);
  }
  if (!(await liveWriteGated())) {
    throw makeBffError({
      code: "FEATURE_DISABLED",
      message: "Persona risk writes are disabled by deployment policy or session authority.",
      correlationId: opts.correlationId,
      details: { reason: "write_unavailable" },
    });
  }
  const raw = await bffFetch<BffEnvelope<Persona>>({
    method: "PATCH",
    path: paths.persona(personaId),
    body: { risk: tier },
    idempotencyKey: opts.idempotencyKey,
    correlationId: opts.correlationId,
  });
  const persona = normalizePersonaDetail(unwrapData<Persona>(raw));
  if (!persona || typeof persona !== "object") {
    throw new Error("Persona risk update returned no Persona payload.");
  }
  return persona;
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
  patchRisk: patchPersonaRisk,
  runAction: runPersonaAction,
  testPrompt: testPersonaPrompt,
};
