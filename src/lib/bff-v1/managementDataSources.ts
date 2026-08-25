// Management Data Source Control Center BFF client (SD-SRCM-04).
// Reads use strict-live BFF endpoints; writes require liveWriteGated() and forbid inline secrets.

import { withStrictLiveOrMock } from "@/lib/bff/liveRead";
import { withLiveOrMock, isStrictLiveFallback } from "./liveTransport";
import { liveWriteGated } from "./writeGate";
import { paths } from "./paths";
import { idempotencyKey as mintIdemKey } from "./headers";
import { newCorrelationId } from "@/lib/v4/correlation";
import { makeBffError } from "./errors";
import type { ManagementListMeta } from "./managementConsoleReads";

export interface ConnectorDefinition {
  schema_version?: string;
  definition_id: string;
  adapter_token: string;
  adapter_version?: string;
  provider: string;
  source_kinds?: string[];
  source_types?: string[];
  source_classes?: string[];
  datasets?: string[];
  markets?: string[];
  auth_modes?: string[];
  fetch_modes?: string[];
  config_schema?: Record<string, unknown>;
  secret_fields?: string[];
  required_pit_fields?: string[];
  default_limits?: {
    max_records?: number;
    max_bytes?: number;
    timeout_seconds?: number;
  };
  allowed_host_patterns?: string[];
  definition_state: "supported" | "disabled_by_build" | "experimental" | string;
  disabled_reason?: string | null;
  deployment_sha?: string;
  test_manifest_ref?: string;
}

export interface DataSourceInstance {
  schema_version?: string;
  data_source_id: string;
  source_instance_id?: string;
  source_kind: string;
  definition_id: string;
  connector_id: string;
  provider: string;
  provider_account_ref?: string | null;
  source_class: string;
  datasets?: string[];
  markets?: string[];
  license_scope?: string;
  secret_scope?: string;
  entitlement_tags?: string[];
  allowed_use?: string[];
  retention_policy_ref?: string;
  deletion_policy_ref?: string;
  freshness_sla_seconds?: number;
  sensitivity?: string;
  lifecycle_state: "configured_disabled" | "validated_disabled" | "canary_passed_disabled" | "enabled" | "degraded" | "disabled" | "retired" | string;
  revision: number;
  created_by?: string;
  created_at?: string;
  updated_by?: string;
  updated_at?: string;
}

export interface SourceDesiredState {
  schema_version?: string;
  source_instance_id: string;
  revision: number;
  desired_lifecycle: string;
  definition_id?: string;
  definition_deployment_sha?: string;
  connector_config?: {
    public?: Record<string, unknown>;
    secret_ref_id?: string | null;
    secret_scope?: string;
    [key: string]: unknown;
  };
  schedule?: {
    enabled: boolean;
    cadence?: string;
    timezone?: string;
    jitter_seconds?: number;
  };
  universe_policy_ref?: string;
  limits?: {
    max_records?: number;
    max_bytes?: number;
    timeout_seconds?: number;
  };
  allowed_hosts?: string[];
  last_command_receipt_id?: string;
  updated_at?: string;
}

export interface SourceObservedState {
  schema_version?: string;
  source_instance_id: string;
  desired_revision?: number;
  observed_revision?: number;
  reconciliation_status?: "converged" | "reconciling" | "diverged" | "failed" | string;
  effective_lifecycle?: string;
  definition?: {
    definition_id?: string;
    deployment_sha?: string;
    state?: string;
  };
  credential_state?: "configured" | "not_required" | "missing" | "unavailable" | "unknown" | string;
  validation_state?: "passed" | "failed" | "pending" | "stale" | string;
  canary_state?: "passed" | "partial" | "failed" | "not_run" | string;
  health_state?: "fresh" | "stale" | "healthy" | "degraded" | "error" | string;
  freshness?: {
    last_success_at?: string;
    watermark?: string;
    age_seconds?: number;
    sla_seconds?: number;
  };
  last_run?: {
    ingest_run_id?: string;
    row_count?: number;
    rejected_count?: number;
    evidence_bundle_id?: string;
    search_snapshot_id?: string;
  };
  dlq_unresolved_count?: number;
  quota?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  dependent_refs?: string[];
  reasons?: string[];
  observed_at?: string;
}

export interface SourceAllowedActions {
  canValidate: boolean;
  canCanary: boolean;
  canEnable: boolean;
  canDisable: boolean;
  canDegrade: boolean;
  canResume: boolean;
  canChangeSchedule: boolean;
  canReplace: boolean;
  canRetire: boolean;
  blockedReasons: string[];
}

export interface ManagementDataSourceV2DTO {
  schema_version: "management_data_source.v2";
  source_instance_id: string;
  connector_id: string;
  provider: string;
  source_class: string;
  definition: ConnectorDefinition;
  instance: DataSourceInstance;
  desired: SourceDesiredState;
  observed: SourceObservedState;
  allowed_actions: SourceAllowedActions;
  allowedActions: SourceAllowedActions;
  lineage_summary?: {
    datasets?: string[];
    markets?: string[];
    universe_policy_ref?: string;
  };
}

export interface SourceCommandReceipt {
  schema_version?: string;
  receipt_id: string;
  command_id: string;
  idempotency_key_hash?: string;
  source_instance_id: string;
  command_type: string;
  status: "accepted" | "running" | "succeeded" | "failed" | "rejected";
  before_revision?: number;
  after_revision?: number;
  effect_refs?: string[];
  readback?: {
    desired_revision?: number;
    observed_revision?: number;
    reconciliation_status?: string;
  };
  failure?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  } | null;
  actor_id?: string;
  trace_id?: string;
  service_deployment_sha?: string;
  created_at?: string;
  completed_at?: string;
}

export interface SourceCanaryResult {
  canary_id: string;
  source_instance_id: string;
  definition_id?: string;
  definition_deployment_sha?: string;
  limits?: Record<string, unknown>;
  allowed_hosts?: string[];
  status: "passed" | "partial" | "failed" | string;
  stages?: Array<{ stage: string; status: string; timestamp?: string; detail?: string }>;
  ingest_run_id?: string;
  watermark?: string;
  row_count?: number;
  rejected_count?: number;
  evidence_bundle_id?: string;
  search_snapshot_id?: string;
  query_readback_ref?: string;
  license_scope?: string;
  entitlement_tags?: string[];
  started_at?: string;
  completed_at?: string;
}

export interface SourceObservation {
  source_instance_id: string;
  observed_revision: number;
  reconciliation_status: string;
  effective_lifecycle: string;
  health_state: string;
  observed_at: string;
  watermark?: string;
  row_count?: number;
  rejected_count?: number;
  freshness_age_seconds?: number;
  reasons?: string[];
}

export interface SourceDevelopmentNeed {
  schema_version: "source_development_need.v1";
  reason: string;
  definition_id?: string;
  provider?: string;
  source_class?: string;
  required_capabilities?: Record<string, unknown>;
  suggested_adapter_token?: string;
  timestamp?: string;
}

export interface CreateSourceInput {
  source_instance_id: string;
  definition_id: string;
  connector_id?: string;
  provider: string;
  source_class: string;
  datasets?: string[];
  markets?: string[];
  license_scope?: string;
  secret_scope?: string;
  entitlement_tags?: string[];
  allowed_use?: string[];
  retention_policy_ref?: string;
  deletion_policy_ref?: string;
  freshness_sla_seconds?: number;
  sensitivity?: string;
  connector_config?: {
    public?: Record<string, unknown>;
    secret_ref_id?: string | null;
    secret_scope?: string;
  };
  schedule?: {
    enabled: boolean;
    cadence?: string;
    timezone?: string;
    jitter_seconds?: number;
  };
  universe_policy_ref?: string;
  limits?: {
    max_records?: number;
    max_bytes?: number;
    timeout_seconds?: number;
  };
  allowed_hosts?: string[];
  reason?: string;
  idempotencyKey?: string;
  trace_id?: string;
}

export interface SourceActionCommandInput {
  sourceInstanceId: string;
  expectedRevision: number;
  reason: string;
  confirmation?: boolean;
  parameters?: Record<string, unknown>;
  idempotencyKey?: string;
  traceId?: string;
}

export interface ChangeScheduleInput {
  sourceInstanceId: string;
  expectedRevision: number;
  reason: string;
  schedule: {
    enabled: boolean;
    cadence?: string;
    timezone?: string;
    jitter_seconds?: number;
  };
  idempotencyKey?: string;
  traceId?: string;
}

export interface ReplaceSourceInput {
  sourceInstanceId: string;
  expectedRevision: number;
  reason: string;
  confirmation: boolean;
  replacementSourceId: string;
  idempotencyKey?: string;
  traceId?: string;
}

export interface RetireSourceInput {
  sourceInstanceId: string;
  expectedRevision: number;
  reason: string;
  confirmation: boolean;
  idempotencyKey?: string;
  traceId?: string;
}

const SECRET_KEYWORDS = new Set([
  "api_key",
  "apikey",
  "secret",
  "password",
  "token",
  "auth_token",
  "private_key",
  "secret_key",
  "secret_value",
]);

export function isValidSecretRefId(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string") return false;
  return value.startsWith("vault://") || value.startsWith("env://") || value.startsWith("ref://");
}

export function assertNoRawSecrets(obj: unknown, path = ""): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => assertNoRawSecrets(item, `${path}[${index}]`));
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const currPath = path ? `${path}.${k}` : k;
    const lowerKey = k.toLowerCase();

    if (
      (lowerKey === "secret_ref_id" ||
        lowerKey === "secretrefid" ||
        lowerKey === "secret_ref" ||
        lowerKey.endsWith("_secret_ref_id")) &&
      typeof v === "string" &&
      v !== ""
    ) {
      if (!isValidSecretRefId(v)) {
        throw new Error(
          `Invalid secret_ref_id at ${currPath}: secret_ref_id must start with explicit 'vault://', 'env://', or 'ref://' URI scheme. Raw value '${v}' is forbidden.`,
        );
      }
    }

    if (SECRET_KEYWORDS.has(lowerKey) && typeof v === "string") {
      if (!v.startsWith("env://") && !v.startsWith("vault://") && !v.startsWith("ref://") && v !== "") {
        throw new Error(
          `Raw secret material detected at ${currPath}: inline secrets are strictly forbidden; use secret_ref_id reference.`,
        );
      }
    }
    if (typeof v === "object" && v !== null) {
      assertNoRawSecrets(v, currPath);
    }
  }
}

function refuseStrictLiveWrite(correlationId: string): never {
  throw makeBffError({
    code: "FEATURE_DISABLED",
    message: "Live writes are unavailable: real writes are disabled or the session lacks write authority.",
    correlationId,
    details: { reason: "write_unavailable" },
  });
}

export function isV2DataSource(item: unknown): item is ManagementDataSourceV2DTO {
  return (
    typeof item === "object" &&
    item !== null &&
    (item as ManagementDataSourceV2DTO).schema_version === "management_data_source.v2"
  );
}

// ---------------------------------------------------------------------------
// READ OPERATIONS
// ---------------------------------------------------------------------------

export interface DataSourceCatalogRead {
  definitions: ConnectorDefinition[];
  count: number;
  status: string;
  source: string;
  policy_registry?: unknown;
  financial_data_source_catalog?: unknown;
  meta: ManagementListMeta;
}

export interface DataSourceDetailRead {
  data: ManagementDataSourceV2DTO;
  meta: ManagementListMeta;
}

export interface DataSourceRunsRead {
  observations: SourceObservation[];
  canaries: SourceCanaryResult[];
  meta: ManagementListMeta;
}

export interface DataSourceReceiptsRead {
  receipts: SourceCommandReceipt[];
  count: number;
  meta: ManagementListMeta;
}

export interface SourceCommandReceiptRead {
  receipt: SourceCommandReceipt;
  meta: ManagementListMeta;
}

export const managementDataSourceReads = {
  catalog: (): Promise<DataSourceCatalogRead> =>
    withStrictLiveOrMock<DataSourceCatalogRead, unknown>(
      { method: "GET", path: paths.mgmtDataSourcesCatalog() },
      async () => ({
        definitions: [],
        count: 0,
        status: "ok",
        source: "mock",
        meta: { status: "ok", source: "mock" },
      }),
      (raw) => {
        const root = (raw ?? {}) as Record<string, unknown>;
        const data = (root.data ?? {}) as Record<string, unknown>;
        const definitions = (Array.isArray(data.definitions) ? data.definitions : []) as ConnectorDefinition[];
        return {
          definitions,
          count: definitions.length,
          status: String(data.status ?? "ok"),
          source: String(data.source ?? "service_client"),
          policy_registry: data.policy_registry,
          financial_data_source_catalog: data.financial_data_source_catalog,
          meta: (root.meta ?? { status: "ok", source: "service_client" }) as ManagementListMeta,
        };
      },
    ),

  detail: (sourceInstanceId: string): Promise<DataSourceDetailRead> =>
    withStrictLiveOrMock<DataSourceDetailRead, unknown>(
      { method: "GET", path: paths.mgmtDataSourceDetail(sourceInstanceId) },
      async () => ({
        data: {
          schema_version: "management_data_source.v2",
          source_instance_id: sourceInstanceId,
          connector_id: sourceInstanceId,
          provider: "mock",
          source_class: "market",
          definition: {
            definition_id: "mock-definition",
            adapter_token: "MockAdapter",
            provider: "mock",
            definition_state: "supported",
          },
          instance: {
            data_source_id: sourceInstanceId,
            source_kind: "data_source",
            definition_id: "mock-definition",
            connector_id: sourceInstanceId,
            provider: "mock",
            source_class: "market",
            lifecycle_state: "configured_disabled",
            revision: 1,
          },
          desired: {
            source_instance_id: sourceInstanceId,
            revision: 1,
            desired_lifecycle: "configured_disabled",
          },
          observed: {
            source_instance_id: sourceInstanceId,
            effective_lifecycle: "configured_disabled",
            validation_state: "pending",
            canary_state: "not_run",
            health_state: "healthy",
          },
          allowed_actions: {
            canValidate: true,
            canCanary: false,
            canEnable: false,
            canDisable: false,
            canDegrade: false,
            canResume: false,
            canChangeSchedule: true,
            canReplace: false,
            canRetire: true,
            blockedReasons: ["canary_required"],
          },
          allowedActions: {
            canValidate: true,
            canCanary: false,
            canEnable: false,
            canDisable: false,
            canDegrade: false,
            canResume: false,
            canChangeSchedule: true,
            canReplace: false,
            canRetire: true,
            blockedReasons: ["canary_required"],
          },
        },
        meta: { status: "ok", source: "mock" },
      }),
      (raw) => {
        const root = (raw ?? {}) as Record<string, unknown>;
        const data = (root.data ?? {}) as ManagementDataSourceV2DTO;
        return {
          data,
          meta: (root.meta ?? { status: "ok", source: "service_client" }) as ManagementListMeta,
        };
      },
    ),

  runs: (sourceInstanceId: string, limit = 50): Promise<DataSourceRunsRead> =>
    withStrictLiveOrMock<DataSourceRunsRead, unknown>(
      { method: "GET", path: paths.mgmtDataSourceRuns(sourceInstanceId, limit) },
      async () => ({
        observations: [],
        canaries: [],
        meta: { status: "ok", source: "mock" },
      }),
      (raw) => {
        const root = (raw ?? {}) as Record<string, unknown>;
        const data = (root.data ?? {}) as Record<string, unknown>;
        return {
          observations: (Array.isArray(data.observations) ? data.observations : []) as SourceObservation[],
          canaries: (Array.isArray(data.canaries) ? data.canaries : []) as SourceCanaryResult[],
          meta: (root.meta ?? { status: "ok", source: "service_client" }) as ManagementListMeta,
        };
      },
    ),

  receipts: (sourceInstanceId: string, limit = 50): Promise<DataSourceReceiptsRead> =>
    withStrictLiveOrMock<DataSourceReceiptsRead, unknown>(
      { method: "GET", path: paths.mgmtDataSourceReceipts(sourceInstanceId, limit) },
      async () => ({
        receipts: [],
        count: 0,
        meta: { status: "ok", source: "mock" },
      }),
      (raw) => {
        const root = (raw ?? {}) as Record<string, unknown>;
        const data = (root.data ?? {}) as Record<string, unknown>;
        const receipts = (Array.isArray(data.receipts) ? data.receipts : []) as SourceCommandReceipt[];
        return {
          receipts,
          count: receipts.length,
          meta: (root.meta ?? { status: "ok", source: "service_client" }) as ManagementListMeta,
        };
      },
    ),

  commandReceipt: (receiptId: string): Promise<SourceCommandReceiptRead> =>
    withStrictLiveOrMock<SourceCommandReceiptRead, unknown>(
      { method: "GET", path: paths.mgmtSourceCommandReceipt(receiptId) },
      async () => ({
        receipt: {
          receipt_id: receiptId,
          command_id: `cmd-${receiptId}`,
          source_instance_id: "unknown",
          command_type: "unknown",
          status: "succeeded",
        },
        meta: { status: "ok", source: "mock" },
      }),
      (raw) => {
        const root = (raw ?? {}) as Record<string, unknown>;
        const data = (root.data ?? {}) as Record<string, unknown>;
        const receipt = (data.receipt ?? data) as SourceCommandReceipt;
        return {
          receipt,
          meta: (root.meta ?? { status: "ok", source: "service_client" }) as ManagementListMeta,
        };
      },
    ),
};

// ---------------------------------------------------------------------------
// WRITE OPERATIONS (GOVERNED COMMANDS)
// ---------------------------------------------------------------------------

async function executeCommand<T>(
  method: "POST" | "PUT",
  path: string,
  body: unknown,
  idempotencyKey: string,
  correlationId: string,
): Promise<T> {
  const gated = await liveWriteGated();
  if (!gated) {
    refuseStrictLiveWrite(correlationId);
  }

  return withLiveOrMock<T, { data?: { receipt?: SourceCommandReceipt; [key: string]: unknown } }>(
    {
      method,
      path,
      body,
      idempotencyKey,
      correlationId,
      headers: {
        "X-Idempotency-Key": idempotencyKey,
        "X-Correlation-Id": correlationId,
      },
    },
    async () => {
      refuseStrictLiveWrite(correlationId);
    },
    (rawData) => {
      const d = (rawData?.data ?? rawData) as T;
      return d;
    },
  );
}

export const managementDataSourceWrites = {
  createDataSource: async (input: CreateSourceInput): Promise<SourceCommandReceipt> => {
    assertNoRawSecrets(input);
    const correlationId = newCorrelationId();
    const idempotencyKey = input.idempotencyKey || mintIdemKey();

    const body = {
      source_instance_id: input.source_instance_id,
      definition_id: input.definition_id,
      connector_id: input.connector_id || input.source_instance_id,
      provider: input.provider,
      source_class: input.source_class,
      datasets: input.datasets ?? [],
      markets: input.markets ?? [],
      license_scope: input.license_scope,
      entitlement_tags: input.entitlement_tags,
      allowed_use: input.allowed_use,
      retention_policy_ref: input.retention_policy_ref,
      deletion_policy_ref: input.deletion_policy_ref,
      freshness_sla_seconds: input.freshness_sla_seconds,
      sensitivity: input.sensitivity,
      connector_config: input.connector_config,
      schedule: input.schedule ?? { enabled: false },
      universe_policy_ref: input.universe_policy_ref,
      limits: input.limits,
      allowed_hosts: input.allowed_hosts,
      reason: input.reason || "Operator created configured_disabled source",
      trace_id: input.trace_id || correlationId,
    };

    const res = await executeCommand<{ receipt?: SourceCommandReceipt } | SourceCommandReceipt>(
      "POST",
      paths.mgmtDataSources(),
      body,
      idempotencyKey,
      correlationId,
    );
    return ((res as { receipt?: SourceCommandReceipt }).receipt ?? res) as SourceCommandReceipt;
  },

  validateDataSource: async (input: SourceActionCommandInput): Promise<SourceCommandReceipt> => {
    assertNoRawSecrets(input.parameters);
    const correlationId = input.traceId || newCorrelationId();
    const idempotencyKey = input.idempotencyKey || mintIdemKey();

    const body = {
      expected_revision: input.expectedRevision,
      reason: input.reason,
      parameters: input.parameters ?? {},
      trace_id: correlationId,
    };

    const res = await executeCommand<{ receipt?: SourceCommandReceipt } | SourceCommandReceipt>(
      "POST",
      paths.mgmtDataSourceActionValidate(input.sourceInstanceId),
      body,
      idempotencyKey,
      correlationId,
    );
    return ((res as { receipt?: SourceCommandReceipt }).receipt ?? res) as SourceCommandReceipt;
  },

  canaryDataSource: async (input: SourceActionCommandInput): Promise<SourceCommandReceipt> => {
    assertNoRawSecrets(input.parameters);
    const correlationId = input.traceId || newCorrelationId();
    const idempotencyKey = input.idempotencyKey || mintIdemKey();

    const body = {
      expected_revision: input.expectedRevision,
      reason: input.reason,
      parameters: input.parameters ?? {},
      trace_id: correlationId,
    };

    const res = await executeCommand<{ receipt?: SourceCommandReceipt } | SourceCommandReceipt>(
      "POST",
      paths.mgmtDataSourceActionCanary(input.sourceInstanceId),
      body,
      idempotencyKey,
      correlationId,
    );
    return ((res as { receipt?: SourceCommandReceipt }).receipt ?? res) as SourceCommandReceipt;
  },

  enableDataSource: async (input: SourceActionCommandInput): Promise<SourceCommandReceipt> => {
    assertNoRawSecrets(input.parameters);
    const correlationId = input.traceId || newCorrelationId();
    const idempotencyKey = input.idempotencyKey || mintIdemKey();

    const body = {
      expected_revision: input.expectedRevision,
      reason: input.reason,
      confirmation: input.confirmation ?? true,
      parameters: input.parameters ?? {},
      trace_id: correlationId,
    };

    const res = await executeCommand<{ receipt?: SourceCommandReceipt } | SourceCommandReceipt>(
      "POST",
      paths.mgmtDataSourceActionEnable(input.sourceInstanceId),
      body,
      idempotencyKey,
      correlationId,
    );
    return ((res as { receipt?: SourceCommandReceipt }).receipt ?? res) as SourceCommandReceipt;
  },

  disableDataSource: async (input: SourceActionCommandInput): Promise<SourceCommandReceipt> => {
    assertNoRawSecrets(input.parameters);
    const correlationId = input.traceId || newCorrelationId();
    const idempotencyKey = input.idempotencyKey || mintIdemKey();

    const body = {
      expected_revision: input.expectedRevision,
      reason: input.reason,
      parameters: input.parameters ?? {},
      trace_id: correlationId,
    };

    const res = await executeCommand<{ receipt?: SourceCommandReceipt } | SourceCommandReceipt>(
      "POST",
      paths.mgmtDataSourceActionDisable(input.sourceInstanceId),
      body,
      idempotencyKey,
      correlationId,
    );
    return ((res as { receipt?: SourceCommandReceipt }).receipt ?? res) as SourceCommandReceipt;
  },

  degradeDataSource: async (input: SourceActionCommandInput): Promise<SourceCommandReceipt> => {
    assertNoRawSecrets(input.parameters);
    const correlationId = input.traceId || newCorrelationId();
    const idempotencyKey = input.idempotencyKey || mintIdemKey();

    const body = {
      expected_revision: input.expectedRevision,
      reason: input.reason,
      parameters: input.parameters ?? {},
      trace_id: correlationId,
    };

    const res = await executeCommand<{ receipt?: SourceCommandReceipt } | SourceCommandReceipt>(
      "POST",
      paths.mgmtDataSourceActionDegrade(input.sourceInstanceId),
      body,
      idempotencyKey,
      correlationId,
    );
    return ((res as { receipt?: SourceCommandReceipt }).receipt ?? res) as SourceCommandReceipt;
  },

  resumeDataSource: async (input: SourceActionCommandInput): Promise<SourceCommandReceipt> => {
    assertNoRawSecrets(input.parameters);
    const correlationId = input.traceId || newCorrelationId();
    const idempotencyKey = input.idempotencyKey || mintIdemKey();

    const body = {
      expected_revision: input.expectedRevision,
      reason: input.reason,
      parameters: input.parameters ?? {},
      trace_id: correlationId,
    };

    const res = await executeCommand<{ receipt?: SourceCommandReceipt } | SourceCommandReceipt>(
      "POST",
      paths.mgmtDataSourceActionResume(input.sourceInstanceId),
      body,
      idempotencyKey,
      correlationId,
    );
    return ((res as { receipt?: SourceCommandReceipt }).receipt ?? res) as SourceCommandReceipt;
  },

  changeSchedule: async (input: ChangeScheduleInput): Promise<SourceCommandReceipt> => {
    const correlationId = input.traceId || newCorrelationId();
    const idempotencyKey = input.idempotencyKey || mintIdemKey();

    const body = {
      expected_revision: input.expectedRevision,
      reason: input.reason,
      schedule: input.schedule,
      trace_id: correlationId,
    };

    const res = await executeCommand<{ receipt?: SourceCommandReceipt } | SourceCommandReceipt>(
      "PUT",
      paths.mgmtDataSourceSchedule(input.sourceInstanceId),
      body,
      idempotencyKey,
      correlationId,
    );
    return ((res as { receipt?: SourceCommandReceipt }).receipt ?? res) as SourceCommandReceipt;
  },

  replaceDataSource: async (input: ReplaceSourceInput): Promise<SourceCommandReceipt> => {
    const correlationId = input.traceId || newCorrelationId();
    const idempotencyKey = input.idempotencyKey || mintIdemKey();

    const body = {
      expected_revision: input.expectedRevision,
      reason: input.reason,
      confirmation: input.confirmation,
      replacement_source_id: input.replacementSourceId,
      trace_id: correlationId,
    };

    const res = await executeCommand<{ receipt?: SourceCommandReceipt } | SourceCommandReceipt>(
      "POST",
      paths.mgmtDataSourceActionReplace(input.sourceInstanceId),
      body,
      idempotencyKey,
      correlationId,
    );
    return ((res as { receipt?: SourceCommandReceipt }).receipt ?? res) as SourceCommandReceipt;
  },

  retireDataSource: async (input: RetireSourceInput): Promise<SourceCommandReceipt> => {
    const correlationId = input.traceId || newCorrelationId();
    const idempotencyKey = input.idempotencyKey || mintIdemKey();

    const body = {
      expected_revision: input.expectedRevision,
      reason: input.reason,
      confirmation: input.confirmation,
      trace_id: correlationId,
    };

    const res = await executeCommand<{ receipt?: SourceCommandReceipt } | SourceCommandReceipt>(
      "POST",
      paths.mgmtDataSourceActionRetire(input.sourceInstanceId),
      body,
      idempotencyKey,
      correlationId,
    );
    return ((res as { receipt?: SourceCommandReceipt }).receipt ?? res) as SourceCommandReceipt;
  },

  pollReceiptUntilTerminal: async (
    receiptId: string,
    maxAttempts = 15,
    intervalMs = 1000,
  ): Promise<SourceCommandReceipt> => {
    let attempts = 0;
    while (attempts < maxAttempts) {
      attempts++;
      const read = await managementDataSourceReads.commandReceipt(receiptId);
      const receipt = read.receipt;
      if (receipt.status === "succeeded" || receipt.status === "failed" || receipt.status === "rejected") {
        return receipt;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    const finalRead = await managementDataSourceReads.commandReceipt(receiptId);
    return finalRead.receipt;
  },
};
