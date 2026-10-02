/**
 * BFF client for Agora research plan and run endpoints.
 * Source: services/control-plane/openapi/agora_v1_3.openapi.yaml §Research Plans / §Research Runs
 * Uses the shared BFF client (base URL, auth, tenant, idempotency headers).
 */

import { BffError } from "../errors";
import { bffFetch } from "../client";

export type ResearchPlanStatus = "draft" | "approved" | "running" | "completed" | "cancelled";
export type ResearchRunExecutionStatus =
  | "queued"
  | "dispatching"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out";
export type ResearchRunOutcome = "pending" | "pass" | "fail" | "inconclusive";
export type ResearchBackendMode = "real" | "fixture" | "stub";

export interface ResearchPlanExecution {
  spec_version: "1.0";
  plan_id: string;
  workshop_id: string;
  strategy_id: string;
  strategy_spec_registry_id: string;
  status: ResearchPlanStatus;
  approval?: {
    state: "pending" | "approved" | "rejected" | "not_required";
    decided_by?: string;
    decided_at?: string;
    reason?: string;
  };
  stages: Array<{
    stage_id: string;
    stage_type: string;
    status: string;
    dependencies: string[];
    required_capability: string;
    routing: {
      preferred_backend: string;
      effective_backend?: string;
      backend_mode?: ResearchBackendMode;
      fallback_policy: "fail_closed" | "explicit_fixture_only";
      routing_reason?: string;
    };
    input_refs?: string[];
    output_refs?: string[];
    parameters?: Record<string, unknown>;
    blocking_reasons?: string[];
  }>;
  budget?: {
    compute_tier?: "light" | "standard" | "heavy";
    max_runtime_seconds?: number;
    max_parallel_stages?: number;
    external_data_spend_allowed?: boolean;
  };
  run_ids?: string[];
  no_order_route_proof: "research_plan_no_order_route";
  created_at: string;
  updated_at?: string;
}

export interface ResearchRunProjection {
  spec_version: "1.0";
  run_id: string;
  plan_id: string;
  workshop_id: string;
  strategy_id: string;
  strategy_spec_registry_id: string;
  stage_id: string;
  stage_type: string;
  execution_status: ResearchRunExecutionStatus;
  outcome: ResearchRunOutcome;
  progress: {
    phase: string;
    percent: number;
    completed_units?: number;
    total_units?: number;
    message?: string;
    updated_at: string;
  };
  backend: {
    requested: string;
    effective: string;
    mode: ResearchBackendMode;
    version?: string;
    activation_state?: string;
  };
  metrics?: Array<{
    category: "performance" | "risk" | "cost" | "capacity" | "robustness" | "calibration" | "data_quality";
    name: string;
    value: number;
    unit?: string;
    direction?: "higher_better" | "lower_better" | "target_range";
    threshold?: number;
    gate_result: "pass" | "fail" | "not_applicable" | "not_evaluated";
    baseline?: number;
    delta?: number;
    ci_lower?: number;
    ci_upper?: number;
    source_ref?: string;
  }>;
  findings?: Array<{
    finding_id: string;
    severity: "info" | "watch" | "warning" | "high" | "critical";
    summary: string;
    detail?: string;
    evidence_refs?: Array<{ ref_type: string; ref_id: string; summary?: string; data_cutoff?: string }>;
  }>;
  warnings?: string[];
  blocking_reasons?: string[];
  artifact_refs?: string[];
  evidence_refs?: Array<{ ref_type: string; ref_id: string; summary?: string; data_cutoff?: string }>;
  lineage_refs?: string[];
  failure?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    failed_at?: string;
  };
  data_cutoff?: string;
  no_order_route_proof: "research_only_not_direct_action";
  created_at: string;
  started_at?: string;
  completed_at?: string;
  updated_at?: string;
}

/** Workshop-visible research stage labels mapped to the BFF stage_type enum. */
export const RESEARCH_STAGE_TYPES = {
  "Prototype backtest": "prototype_backtest",
  "Rolling out-of-sample": "rolling_oos",
  "Econometric validation": "econometric_validation",
  "Portfolio synthesis": "portfolio_synthesis",
} as const;
export type ResearchStageType = (typeof RESEARCH_STAGE_TYPES)[keyof typeof RESEARCH_STAGE_TYPES];

/** The create endpoint is extra=forbid: only these fields may be sent. */
export interface ResearchPlanCreateRequest {
  spec_version: "1.0";
  strategy_id: string;
  strategy_spec_registry_id: string;
  stages: Array<{ stage_type: ResearchStageType }>;
}

export interface ResearchPlanSnapshot {
  plan: ResearchPlanExecution;
  /** meta.etag, sent back verbatim as If-Match. */
  etag: string | null;
  /** Action names the BFF currently allows (e.g. "approve", "dispatch", "cancel"). */
  allowedActions: string[];
}

export interface CommandResponse {
  status: "accepted" | "queued" | "completed";
  data: unknown;
  meta: Record<string, unknown>;
}

type Envelope = { data?: unknown; meta?: unknown; status?: unknown };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function listOf<T>(body: unknown, ...keys: string[]): T[] {
  const data = (body as Envelope | undefined)?.data ?? body;
  if (Array.isArray(data)) return data as T[];
  const obj = record(data);
  for (const key of ["items", ...keys]) if (Array.isArray(obj[key])) return obj[key] as T[];
  return [];
}

function allowedActionsFrom(root: Record<string, unknown>, meta: Record<string, unknown>): string[] {
  const raw = root.allowedActions ?? root.allowed_actions ?? meta.allowedActions ?? meta.allowed_actions;
  if (Array.isArray(raw)) return raw.map(String);
  return Object.entries(record(raw))
    .filter(([, on]) => on === true)
    .map(([name]) => name);
}

function snapshotFrom(body: unknown): ResearchPlanSnapshot {
  const root = body as Envelope | undefined;
  const meta = record(root?.meta);
  return {
    plan: record(root?.data ?? root) as unknown as ResearchPlanExecution,
    etag: typeof meta.etag === "string" ? meta.etag : null,
    allowedActions: allowedActionsFrom(record(root), meta),
  };
}

function commandFrom(body: unknown): CommandResponse {
  const root = record(body);
  return {
    status: (root.status as CommandResponse["status"]) ?? "accepted",
    data: root.data ?? null,
    meta: record(root.meta),
  };
}

const planPath = (planId: string) => `/bff/agora/research-plans/${encodeURIComponent(planId)}`;
const runPath = (runId: string) => `/bff/agora/research-runs/${encodeURIComponent(runId)}`;

export interface ResearchCommandOptions {
  idempotencyKey?: string;
  /** ETag from the latest snapshot; sent verbatim as If-Match. */
  ifMatch?: string;
}

function command(path: string, options?: ResearchCommandOptions, body?: unknown) {
  return bffFetch<unknown>({
    method: "POST",
    path,
    body,
    idempotencyKey: options?.idempotencyKey,
    headers: options?.ifMatch ? { "If-Match": options.ifMatch } : undefined,
  }).then(commandFrom);
}

export async function listWorkshopResearchPlans(workshopId: string): Promise<ResearchPlanExecution[]> {
  const body = await bffFetch<unknown>({
    method: "GET",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/research-plans`,
  });
  return listOf<ResearchPlanExecution>(body, "plans", "results");
}

export async function createWorkshopResearchPlan(
  workshopId: string,
  request: ResearchPlanCreateRequest,
  options?: Pick<ResearchCommandOptions, "idempotencyKey">,
): Promise<ResearchPlanSnapshot> {
  const body = await bffFetch<unknown>({
    method: "POST",
    path: `/bff/agora/workshops/${encodeURIComponent(workshopId)}/research-plans`,
    body: request,
    idempotencyKey: options?.idempotencyKey,
  });
  return snapshotFrom(body);
}

/** Returns null when the plan does not exist. */
export async function getResearchPlan(planId: string): Promise<ResearchPlanSnapshot | null> {
  try {
    return snapshotFrom(await bffFetch<unknown>({ method: "GET", path: planPath(planId) }));
  } catch (err) {
    if (err instanceof BffError && err.status === 404) return null;
    throw err;
  }
}

export const approveResearchPlan = (planId: string, options?: ResearchCommandOptions) =>
  command(`${planPath(planId)}/approve`, options);

export const cancelResearchPlan = (planId: string, options?: ResearchCommandOptions) =>
  command(`${planPath(planId)}/cancel`, options);

export const dispatchResearchPlan = (planId: string, options?: ResearchCommandOptions) =>
  command(`${planPath(planId)}/runs`, options);

export async function listResearchPlanRuns(planId: string): Promise<ResearchRunProjection[]> {
  const body = await bffFetch<unknown>({ method: "GET", path: `${planPath(planId)}/runs` });
  return listOf<ResearchRunProjection>(body, "runs", "results");
}

export async function getResearchRun(runId: string): Promise<ResearchRunProjection | null> {
  try {
    const body = await bffFetch<Envelope>({ method: "GET", path: runPath(runId) });
    return record(body?.data ?? body) as unknown as ResearchRunProjection;
  } catch (err) {
    if (err instanceof BffError && err.status === 404) return null;
    throw err;
  }
}

export const cancelResearchRun = (runId: string, options?: Pick<ResearchCommandOptions, "idempotencyKey">) =>
  command(`${runPath(runId)}/cancel`, options);

export async function listResearchRunArtifacts(runId: string): Promise<string[]> {
  const body = await bffFetch<unknown>({ method: "GET", path: `${runPath(runId)}/artifacts` });
  return listOf<string>(body, "artifact_refs", "results");
}

/** True for stale-ETag conflicts (HTTP 409/412). */
export function isStaleEtagError(err: unknown): boolean {
  return err instanceof BffError && (err.status === 409 || err.status === 412);
}
