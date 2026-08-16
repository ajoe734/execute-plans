// Management AI runtime client.
//
// Runtime path (per 2026-06-03 directive):
//   User → Pantheon FE → Pantheon BFF → OpenClaw gateway adapter / Codex provider
//                    ← Pantheon BFF ← provider
//
// FE rules enforced by this client:
//   • NEVER generate an answer locally. No browser AI or edge-function fallback.
//   • If providerStatus.used !== true OR status ∈ {degraded, disabled, error},
//     return a typed `ProviderDegraded` result; UI MUST render degraded banner
//     (not a synthetic answer).
//   • If the BFF endpoint itself is unreachable / 404 / 5xx, return a typed
//     `TransportFailure`; UI MUST render the same degraded banner.

import { buildHeaders } from "./headers";
import { paths } from "./paths";
import { readBffEnv } from "./runtimeEnv";

function detectBaseUrl(): string {
  const env = readBffEnv();
  return env.VITE_BFF_BASE_URL ?? "";
}

export type ProviderRuntimeStatus = "completed" | "running" | "degraded" | "disabled" | "error";

export interface ProviderStatus {
  provider: string;        // e.g. "codex_cli"
  runtime: string;         // e.g. "openclaw_gateway_cli_mount"
  status: ProviderRuntimeStatus | string;
  used: boolean;
  fallback: string | null;
  reason?: string | null;
  reasonCode?: string | null;
  severity?: string | null;
  displayMessage?: string | null;
  operatorAction?: string | null;
  runId?: string | null;
}

export interface AssistantProviderUsage {
  status?: string | null;
  source?: string | null;
  remaining?: number | string | null;
  remainingPercent?: number | string | null;
  limit?: number | string | null;
  used?: number | string | null;
  unit?: string | null;
  resetAt?: string | null;
  updatedAt?: string | null;
  checkedAt?: string | null;
  reason?: string | null;
  [key: string]: unknown;
}

export interface AssistantProviderReadinessStatus {
  available?: boolean;
  provider?: string;
  providerName?: string;
  runtime?: string;
  model?: string | null;
  ready?: boolean;
  status?: string;
  reason?: string | null;
  degradedReason?: string | null;
  auth?: string;
  authStatus?: string;
  authStrategy?: string | null;
  reauthSupported?: boolean;
  version?: string;
  mountMode?: string;
  checkedAt?: string;
  source?: string;
  message?: string | null;
  usage?: AssistantProviderUsage | Record<string, unknown> | null;
  quota?: AssistantProviderUsage | Record<string, unknown> | null;
  capabilities?: { read?: boolean };
}

export interface AssistantProviderUsageSummaryModel {
  model?: string;
  calls?: number;
  successCount?: number;
  failedCount?: number;
  promptBytes?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  averageDurationMs?: number | null;
  lastUsedAt?: string | null;
  lastStatus?: string | null;
}

export interface AssistantProviderUsageObserved {
  source?: string;
  coverage?: string;
  coverageLabel?: string;
  truthPolicy?: string;
  calls?: number;
  successCount?: number;
  failedCount?: number;
  promptBytes?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  lastObservedAt?: string | null;
  ageHours?: number | null;
  stale?: boolean;
  staleAfterHours?: number;
  windowHours?: number | null;
  eventLimit?: number;
  message?: string | null;
}

export interface AssistantProviderUsageSummaryRow {
  provider?: string;
  providerName?: string;
  runtime?: string | null;
  ready?: boolean;
  authStatus?: string | null;
  status?: string | null;
  liveAuth?: boolean;
  calls?: number;
  successCount?: number;
  failedCount?: number;
  startedCount?: number;
  promptBytes?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  averageDurationMs?: number | null;
  lastUsedAt?: string | null;
  lastStatus?: string | null;
  lastError?: string | null;
  quota?: AssistantProviderUsage | Record<string, unknown> | null;
  observedUsage?: AssistantProviderUsageObserved | Record<string, unknown> | null;
  models?: AssistantProviderUsageSummaryModel[];
}

export interface AssistantProviderUsageTotals {
  providers?: number;
  liveAuthCount?: number;
  calls?: number;
  successCount?: number;
  failedCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export type AssistantProviderUsageSummaryResult =
  | {
      ok: true;
      kind: "ok";
      status: string | null;
      providers: AssistantProviderUsageSummaryRow[];
      totals: AssistantProviderUsageTotals;
      quota: Record<string, unknown> | null;
      usage?: Record<string, unknown> | null;
      meta: Record<string, unknown> | null;
    }
  | { ok: false; kind: "failure"; statusCode: number | null; message: string };

export type AssistantProvidersResult =
  | {
      ok: true;
      kind: "ok";
      status: string | null;
      providers: AssistantProviderReadinessStatus[];
      meta: Record<string, unknown> | null;
    }
  | { ok: false; kind: "failure"; statusCode: number | null; message: string };

export interface AssistantProviderRegisterInput {
  provider: string;
  providerName?: string;
  runtime?: string;
  model?: string;
  authStrategy?: string;
  binary?: string;
  binaryEnv?: string;
  note?: string;
  traceId?: string;
}

export type AssistantProviderRegisterResult =
  | { ok: true; kind: "ok"; provider: AssistantProviderReadinessStatus; meta: Record<string, unknown> | null }
  | { ok: false; kind: "failure"; statusCode: number | null; message: string };

export interface AssistantControlModeStatus {
  state?: string;
  active?: boolean;
  reason?: string | null;
  configured?: boolean;
  requiresRole?: string[];
  requiresCapabilityPrefix?: string;
  requiresMfa?: boolean;
  mode?: string;
  activationId?: string;
  expiresAt?: string;
  idleExpiresAt?: string;
  ttlSeconds?: number;
  idleTtlSeconds?: number;
  commandClasses?: string[];
}

export interface AssistantModeStatus {
  productDefaultMode?: string;
  kernelEnabled?: boolean;
  controlMode?: AssistantControlModeStatus | null;
}

export type AssistantModeStatusResult =
  | { ok: true; kind: "ok"; status: AssistantModeStatus }
  | { ok: false; kind: "failure"; statusCode: number | null; message: string };

export type AssistantControlModeMutationResult =
  | { ok: true; kind: "ok"; controlMode: AssistantControlModeStatus }
  | { ok: false; kind: "failure"; statusCode: number | null; message: string };

export interface ActivateAssistantControlModeInput {
  passphrase: string;
  mode: "kernel_debug";
  reason: string;
  ttlSeconds?: number;
  idleTtlSeconds?: number;
  managementSessionId?: string | null;
}

export interface AssistantProviderCredentialExchange {
  bffHandlesCredentials?: boolean;
  frontendHandlesCredentials?: boolean;
  method?: string;
  [key: string]: unknown;
}

export interface AssistantProviderReauthSession {
  provider: string | null;
  status: string | null;
  reauthSessionId: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  codeSubmittedAt?: string | null;
  completedAt?: string | null;
  verificationUri: string | null;
  verificationUriComplete: string | null;
  userCode: string | null;
  expiresAt: string | null;
  intervalSeconds: number | null;
  credentialExchange: AssistantProviderCredentialExchange | null;
  readiness?: Record<string, unknown> | null;
  errorCode?: string | null;
  warningCode?: string | null;
  message?: string | null;
  returncode?: number | null;
}

export interface AssistantProviderReauthInput {
  provider?: string;
  reason?: string;
  traceId?: string;
}

export interface AssistantProviderReauthCodeInput {
  provider?: string;
  sessionId: string;
  code: string;
  traceId?: string;
}

export type AssistantProviderReauthResult =
  | { ok: true; kind: "ok"; reauth: AssistantProviderReauthSession }
  | { ok: false; kind: "failure"; statusCode: number | null; message: string };

export interface ManagementAiAnswerOk {
  ok: true;
  kind: "ok";
  answer: string;
  sessionId: string | null;
  traceId: string | null;
  providerStatus: ProviderStatus;
  auditLogHref: string | null;
  conversationHref: string | null;
}

export interface ManagementAiAnswerDegraded {
  ok: false;
  kind: "provider_degraded";
  providerStatus: ProviderStatus | null;
  sessionId: string | null;
  traceId: string | null;
  message: string;
  /** Optional BFF deterministic/degraded answer. FE must label it as degraded, not AI-authored. */
  answer: string | null;
  auditLogHref: string | null;
  conversationHref: string | null;
  uiActions: ManagementAiUiAction[];
}

export interface ManagementAiTransportFailure {
  ok: false;
  kind: "transport_failure";
  status: number | null;
  message: string;
}

export interface ManagementAiAborted {
  ok: false;
  kind: "aborted";
}

export interface ManagementAiUiAction {
  id?: string;
  kind: string;
  label?: string;
  rationale?: string;
  params?: Record<string, unknown>;
  requiresConfirmation?: boolean;
}

export type ManagementAiResult =
  | (ManagementAiAnswerOk & { uiActions: ManagementAiUiAction[] })
  | ManagementAiAnswerDegraded
  | ManagementAiTransportFailure
  | ManagementAiAborted;


export interface ManagementAiRecentTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ManagementAiUiSnapshot {
  currentRoute: string;
  selectedEntity?: { kind: string; id: string } | null;
  visiblePanels?: string[];
  filters?: Record<string, string>;
  availableUiActions: Array<{ kind: string; description: string; paramsSchema: string }>;
}

export interface ManagementAiAttachment {
  kind: "image";
  mimeType: string;
  filename: string;
  sizeBytes: number;
  /** base64 WITHOUT the `data:...;base64,` prefix */
  dataBase64: string;
}

export interface ManagementAiAskInput {
  question: string;
  focus?: string;
  /** Free-form JSON-stringified frontend context (route, selection, etc). */
  context?: string;
  sessionId?: string | null;
  conversation?: {
    recentTurns: ManagementAiRecentTurn[];
    summary?: string;
  };
  ui?: ManagementAiUiSnapshot;
  attachments?: ManagementAiAttachment[];
}

interface RawAskResponse {
  data?: {
    answer?: string;
    session_id?: string;
    sessionId?: string;
    trace_id?: string;
    traceId?: string;
    provider_status?: Partial<ProviderStatus>;
    providerStatus?: Partial<ProviderStatus>;
    auditLog?: { href?: string };
    audit_log?: { href?: string };
    conversation?: { href?: string };
    uiActions?: ManagementAiUiAction[];
    ui_actions?: ManagementAiUiAction[];
    suggestedActions?: ManagementAiUiAction[];
    suggested_actions?: ManagementAiUiAction[];
    actions?: ManagementAiUiAction[];
  };
}

function adaptUiActions(raw: RawAskResponse["data"]): ManagementAiUiAction[] {
  const merged = [
    ...(raw?.uiActions ?? []),
    ...(raw?.ui_actions ?? []),
    ...(raw?.suggestedActions ?? []),
    ...(raw?.suggested_actions ?? []),
    ...(raw?.actions ?? []),
  ];
  return merged
    .filter((a) => a && typeof a.kind === "string")
    .map((a) => ({
      id: a.id ? String(a.id) : undefined,
      kind: String(a.kind),
      label: a.label ? String(a.label) : undefined,
      rationale: a.rationale ? String(a.rationale) : undefined,
      params: (a.params && typeof a.params === "object") ? a.params : {},
      requiresConfirmation: Boolean(a.requiresConfirmation),
    }));
}

function adaptProviderStatus(raw: Partial<ProviderStatus> & Record<string, unknown> | undefined): ProviderStatus | null {
  if (!raw) return null;
  const r = raw as Record<string, unknown>;
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = r[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return null;
  };
  return {
    provider: String(raw.provider ?? "unknown"),
    runtime: String(raw.runtime ?? "unknown"),
    status: String(raw.status ?? "unknown"),
    used: Boolean(raw.used),
    fallback: (raw.fallback as string | null) ?? null,
    reason: pick("reason"),
    reasonCode: pick("reasonCode", "reason_code"),
    severity: pick("severity"),
    displayMessage: pick("displayMessage", "display_message"),
    operatorAction: pick("operatorAction", "operator_action"),
    runId: pick("runId", "run_id"),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function adaptProviderUsage(raw: unknown): AssistantProviderUsage | Record<string, unknown> | null {
  const r = asRecord(raw);
  if (!r) return null;
  return {
    ...r,
    status: asString(r.status) ?? null,
    source: asString(r.source) ?? null,
    remaining: (r.remaining as number | string | null | undefined) ?? null,
    remainingPercent: ((r.remainingPercent ?? r.remaining_percent) as number | string | null | undefined) ?? null,
    limit: (r.limit as number | string | null | undefined) ?? null,
    used: (r.used as number | string | null | undefined) ?? null,
    unit: asString(r.unit) ?? null,
    resetAt: asString(r.resetAt ?? r.reset_at) ?? null,
    updatedAt: asString(r.updatedAt ?? r.updated_at) ?? null,
    checkedAt: asString(r.checkedAt ?? r.checked_at) ?? null,
    reason: asString(r.reason) ?? null,
  };
}

function adaptProviderReadinessStatus(raw: unknown): AssistantProviderReadinessStatus | null {
  const r = asRecord(raw);
  if (!r) return null;
  const capabilities = asRecord(r.capabilities);
  return {
    available: asBoolean(r.available),
    provider: asString(r.provider),
    providerName: asString(r.providerName ?? r.provider_name),
    runtime: asString(r.runtime),
    model: asString(r.model) ?? null,
    ready: asBoolean(r.ready),
    status: asString(r.status),
    reason: asString(r.reason) ?? null,
    degradedReason: asString(r.degradedReason ?? r.degraded_reason) ?? null,
    auth: asString(r.auth),
    authStatus: asString(r.authStatus ?? r.auth_status),
    authStrategy: asString(r.authStrategy ?? r.auth_strategy) ?? null,
    reauthSupported: asBoolean(r.reauthSupported ?? r.reauth_supported),
    version: asString(r.version),
    mountMode: asString(r.mountMode ?? r.mount_mode),
    checkedAt: asString(r.checkedAt ?? r.checked_at),
    source: asString(r.source),
    message: asString(r.message) ?? null,
    usage: adaptProviderUsage(r.usage),
    quota: adaptProviderUsage(r.quota),
    capabilities: capabilities ? {
      read: asBoolean(capabilities.read),
    } : undefined,
  };
}

function adaptProviderUsageSummaryModel(raw: unknown): AssistantProviderUsageSummaryModel | null {
  const r = asRecord(raw);
  if (!r) return null;
  return {
    model: asString(r.model),
    calls: asNumber(r.calls),
    successCount: asNumber(r.successCount ?? r.success_count),
    failedCount: asNumber(r.failedCount ?? r.failed_count),
    promptBytes: asNumber(r.promptBytes ?? r.prompt_bytes),
    inputTokens: asNumber(r.inputTokens ?? r.input_tokens),
    outputTokens: asNumber(r.outputTokens ?? r.output_tokens),
    totalTokens: asNumber(r.totalTokens ?? r.total_tokens),
    durationMs: asNumber(r.durationMs ?? r.duration_ms),
    averageDurationMs: asNumber(r.averageDurationMs ?? r.average_duration_ms) ?? null,
    lastUsedAt: asString(r.lastUsedAt ?? r.last_used_at) ?? null,
    lastStatus: asString(r.lastStatus ?? r.last_status) ?? null,
  };
}

function adaptProviderObservedUsage(raw: unknown): AssistantProviderUsageObserved | Record<string, unknown> | null {
  const r = asRecord(raw);
  if (!r) return null;
  return {
    ...r,
    source: asString(r.source),
    coverage: asString(r.coverage),
    coverageLabel: asString(r.coverageLabel ?? r.coverage_label),
    truthPolicy: asString(r.truthPolicy ?? r.truth_policy),
    calls: asNumber(r.calls),
    successCount: asNumber(r.successCount ?? r.success_count),
    failedCount: asNumber(r.failedCount ?? r.failed_count),
    promptBytes: asNumber(r.promptBytes ?? r.prompt_bytes),
    inputTokens: asNumber(r.inputTokens ?? r.input_tokens),
    outputTokens: asNumber(r.outputTokens ?? r.output_tokens),
    totalTokens: asNumber(r.totalTokens ?? r.total_tokens),
    lastObservedAt: asString(r.lastObservedAt ?? r.last_observed_at) ?? null,
    ageHours: asNumber(r.ageHours ?? r.age_hours) ?? null,
    stale: asBoolean(r.stale),
    staleAfterHours: asNumber(r.staleAfterHours ?? r.stale_after_hours),
    windowHours: asNumber(r.windowHours ?? r.window_hours) ?? null,
    eventLimit: asNumber(r.eventLimit ?? r.event_limit),
    message: asString(r.message) ?? null,
  };
}

function adaptProviderUsageSummaryRow(raw: unknown): AssistantProviderUsageSummaryRow | null {
  const r = asRecord(raw);
  if (!r) return null;
  return {
    provider: asString(r.provider),
    providerName: asString(r.providerName ?? r.provider_name),
    runtime: asString(r.runtime) ?? null,
    ready: asBoolean(r.ready),
    authStatus: asString(r.authStatus ?? r.auth_status) ?? null,
    status: asString(r.status) ?? null,
    liveAuth: asBoolean(r.liveAuth ?? r.live_auth),
    calls: asNumber(r.calls),
    successCount: asNumber(r.successCount ?? r.success_count),
    failedCount: asNumber(r.failedCount ?? r.failed_count),
    startedCount: asNumber(r.startedCount ?? r.started_count),
    promptBytes: asNumber(r.promptBytes ?? r.prompt_bytes),
    inputTokens: asNumber(r.inputTokens ?? r.input_tokens),
    outputTokens: asNumber(r.outputTokens ?? r.output_tokens),
    totalTokens: asNumber(r.totalTokens ?? r.total_tokens),
    durationMs: asNumber(r.durationMs ?? r.duration_ms),
    averageDurationMs: asNumber(r.averageDurationMs ?? r.average_duration_ms) ?? null,
    lastUsedAt: asString(r.lastUsedAt ?? r.last_used_at) ?? null,
    lastStatus: asString(r.lastStatus ?? r.last_status) ?? null,
    lastError: asString(r.lastError ?? r.last_error) ?? null,
    quota: adaptProviderUsage(r.quota),
    observedUsage: adaptProviderObservedUsage(r.observedUsage ?? r.observed_usage),
    models: asRecordArray(r.models)
      .map(adaptProviderUsageSummaryModel)
      .filter((item): item is AssistantProviderUsageSummaryModel => Boolean(item)),
  };
}

function adaptProviderUsageTotals(raw: unknown): AssistantProviderUsageTotals {
  const r = asRecord(raw);
  if (!r) return {};
  return {
    providers: asNumber(r.providers),
    liveAuthCount: asNumber(r.liveAuthCount ?? r.live_auth_count),
    calls: asNumber(r.calls),
    successCount: asNumber(r.successCount ?? r.success_count),
    failedCount: asNumber(r.failedCount ?? r.failed_count),
    inputTokens: asNumber(r.inputTokens ?? r.input_tokens),
    outputTokens: asNumber(r.outputTokens ?? r.output_tokens),
    totalTokens: asNumber(r.totalTokens ?? r.total_tokens),
  };
}

export async function fetchAssistantProviders(
  options?: { authProbe?: boolean; signal?: AbortSignal },
): Promise<AssistantProvidersResult> {
  const base = detectBaseUrl();
  if (!base) {
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: "BFF base URL is not configured (VITE_BFF_BASE_URL missing).",
    };
  }
  const headers = buildHeaders({ method: "GET" });
  let res: Response;
  try {
    res = await fetch(`${base}${paths.assistantProviders(options?.authProbe ?? false)}`, {
      method: "GET",
      headers,
      credentials: "include",
      signal: options?.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError" || options?.signal?.aborted) {
      return { ok: false, kind: "failure", statusCode: null, message: "aborted" };
    }
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: (err as Error)?.message ?? "Network error contacting Pantheon BFF.",
    };
  }

  const text = await res.text();
  let parsed: { status?: unknown; data?: unknown; meta?: unknown; detail?: unknown; message?: unknown } | undefined;
  try {
    parsed = text ? JSON.parse(text) as { status?: unknown; data?: unknown; meta?: unknown; detail?: unknown; message?: unknown } : undefined;
  } catch {
    parsed = undefined;
  }

  if (!res.ok) {
    return {
      ok: false,
      kind: "failure",
      statusCode: res.status,
      message: extractBffFailureMessage(parsed) ?? `BFF ${res.status} ${res.statusText || ""}`.trim(),
    };
  }

  const providers = asRecordArray(parsed?.data)
    .map(adaptProviderReadinessStatus)
    .filter((item): item is AssistantProviderReadinessStatus => Boolean(item));
  return {
    ok: true,
    kind: "ok",
    status: asString(parsed?.status) ?? null,
    providers,
    meta: asRecord(parsed?.meta) ?? null,
  };
}

export async function registerAssistantProvider(
  input: AssistantProviderRegisterInput,
  options?: { signal?: AbortSignal },
): Promise<AssistantProviderRegisterResult> {
  const base = detectBaseUrl();
  if (!base) {
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: "BFF base URL is not configured (VITE_BFF_BASE_URL missing).",
    };
  }

  const headers = buildHeaders({ method: "POST", idempotency: newIdempotencyKey() });
  const body = JSON.stringify({
    provider: input.provider,
    providerName: input.providerName,
    runtime: input.runtime,
    model: input.model,
    authStrategy: input.authStrategy,
    binary: input.binary,
    binaryEnv: input.binaryEnv,
    note: input.note,
    traceId: input.traceId,
  });

  let res: Response;
  try {
    res = await fetch(`${base}${paths.assistantProviderRegister()}`, {
      method: "POST",
      headers,
      body,
      credentials: "include",
      signal: options?.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError" || options?.signal?.aborted) {
      return { ok: false, kind: "failure", statusCode: null, message: "aborted" };
    }
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: (err as Error)?.message ?? "Network error contacting Pantheon BFF.",
    };
  }

  const text = await res.text();
  let parsed: { data?: unknown; meta?: unknown; detail?: unknown; message?: unknown } | undefined;
  try {
    parsed = text ? JSON.parse(text) as { data?: unknown; meta?: unknown; detail?: unknown; message?: unknown } : undefined;
  } catch {
    parsed = undefined;
  }

  if (!res.ok) {
    return {
      ok: false,
      kind: "failure",
      statusCode: res.status,
      message: extractBffFailureMessage(parsed) ?? `BFF ${res.status} ${res.statusText || ""}`.trim(),
    };
  }

  const provider = adaptProviderReadinessStatus(parsed?.data);
  if (!provider) {
    return {
      ok: false,
      kind: "failure",
      statusCode: res.status,
      message: "BFF returned no provider registration.",
    };
  }
  return { ok: true, kind: "ok", provider, meta: asRecord(parsed?.meta) ?? null };
}

export async function fetchAssistantProviderUsageSummary(
  options?: { authProbe?: boolean; windowHours?: number; limit?: number; signal?: AbortSignal },
): Promise<AssistantProviderUsageSummaryResult> {
  const base = detectBaseUrl();
  if (!base) {
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: "BFF base URL is not configured (VITE_BFF_BASE_URL missing).",
    };
  }
  const headers = buildHeaders({ method: "GET" });
  let res: Response;
  try {
    res = await fetch(
      `${base}${paths.assistantProviderUsageSummary(
        options?.authProbe ?? false,
        options?.windowHours ?? 168,
        options?.limit ?? 500,
      )}`,
      {
        method: "GET",
        headers,
        credentials: "include",
        signal: options?.signal,
      },
    );
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError" || options?.signal?.aborted) {
      return { ok: false, kind: "failure", statusCode: null, message: "aborted" };
    }
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: (err as Error)?.message ?? "Network error contacting Pantheon BFF.",
    };
  }

  const text = await res.text();
  let parsed: { status?: unknown; data?: unknown; meta?: unknown; detail?: unknown; message?: unknown } | undefined;
  try {
    parsed = text ? JSON.parse(text) as { status?: unknown; data?: unknown; meta?: unknown; detail?: unknown; message?: unknown } : undefined;
  } catch {
    parsed = undefined;
  }

  if (!res.ok) {
    return {
      ok: false,
      kind: "failure",
      statusCode: res.status,
      message: extractBffFailureMessage(parsed) ?? `BFF ${res.status} ${res.statusText || ""}`.trim(),
    };
  }

  const data = asRecord(parsed?.data);
  const providers = asRecordArray(data?.providers)
    .map(adaptProviderUsageSummaryRow)
    .filter((item): item is AssistantProviderUsageSummaryRow => Boolean(item));
  return {
    ok: true,
    kind: "ok",
    status: asString(parsed?.status) ?? null,
    providers,
    totals: adaptProviderUsageTotals(data?.totals),
    quota: asRecord(data?.quota) ?? null,
    usage: asRecord(data?.usage) ?? null,
    meta: asRecord(parsed?.meta) ?? null,
  };
}

function adaptControlModeStatus(raw: unknown): AssistantControlModeStatus | null {
  const r = asRecord(raw);
  if (!r) return null;
  return {
    state: asString(r.state),
    active: asBoolean(r.active),
    reason: asString(r.reason) ?? null,
    configured: asBoolean(r.configured),
    requiresRole: asStringArray(r.requiresRole ?? r.requires_role),
    requiresCapabilityPrefix: asString(r.requiresCapabilityPrefix ?? r.requires_capability_prefix),
    requiresMfa: asBoolean(r.requiresMfa ?? r.requires_mfa),
    mode: asString(r.mode),
    activationId: asString(r.activationId ?? r.activation_id),
    expiresAt: asString(r.expiresAt ?? r.expires_at),
    idleExpiresAt: asString(r.idleExpiresAt ?? r.idle_expires_at),
    ttlSeconds: asNumber(r.ttlSeconds ?? r.ttl_seconds),
    idleTtlSeconds: asNumber(r.idleTtlSeconds ?? r.idle_ttl_seconds),
    commandClasses: asStringArray(r.commandClasses ?? r.command_classes),
  };
}

function adaptProviderCredentialExchange(raw: unknown): AssistantProviderCredentialExchange | null {
  const r = asRecord(raw);
  if (!r) return null;
  return {
    ...r,
    bffHandlesCredentials: asBoolean(r.bffHandlesCredentials ?? r.bff_handles_credentials),
    frontendHandlesCredentials: asBoolean(r.frontendHandlesCredentials ?? r.frontend_handles_credentials),
    method: asString(r.method),
  };
}

function adaptProviderReauthSession(raw: unknown): AssistantProviderReauthSession | null {
  const r = asRecord(raw);
  if (!r) return null;
  const reauthSessionId = asString(r.reauthSessionId ?? r.reauth_session_id ?? r.sessionId ?? r.session_id);
  if (!reauthSessionId) return null;
  return {
    provider: asString(r.provider) ?? null,
    status: asString(r.status) ?? null,
    reauthSessionId,
    startedAt: asString(r.startedAt ?? r.started_at) ?? null,
    updatedAt: asString(r.updatedAt ?? r.updated_at) ?? null,
    codeSubmittedAt: asString(r.codeSubmittedAt ?? r.code_submitted_at) ?? null,
    completedAt: asString(r.completedAt ?? r.completed_at) ?? null,
    verificationUri: asString(r.verificationUri ?? r.verification_uri) ?? null,
    verificationUriComplete: asString(r.verificationUriComplete ?? r.verification_uri_complete) ?? null,
    userCode: asString(r.userCode ?? r.user_code) ?? null,
    expiresAt: asString(r.expiresAt ?? r.expires_at) ?? null,
    intervalSeconds: asNumber(r.intervalSeconds ?? r.interval_seconds) ?? null,
    credentialExchange: adaptProviderCredentialExchange(r.credentialExchange ?? r.credential_exchange),
    readiness: asRecord(r.readiness),
    errorCode: asString(r.errorCode ?? r.error_code) ?? null,
    warningCode: asString(r.warningCode ?? r.warning_code) ?? null,
    message: asString(r.message) ?? null,
    returncode: asNumber(r.returncode) ?? null,
  };
}

function extractBffFailureMessage(raw: unknown): string | null {
  const parsed = asRecord(raw);
  const detail = asRecord(parsed?.detail);
  const error = asRecord(detail?.error);
  return (
    asString(error?.message) ??
    asString(error?.details) ??
    asString(detail?.message) ??
    asString(parsed?.message) ??
    null
  );
}

function bffRouteFailureMessage(raw: unknown, res: Response, route: string): string {
  const message = extractBffFailureMessage(raw);
  if (message) return message;
  if (res.status === 404) return `BFF route unavailable: ${route}`;
  return `BFF ${res.status} ${res.statusText || ""}`.trim();
}

function isDegraded(s: ProviderStatus | null): boolean {
  if (!s) return true;
  if (!s.used) return true;
  return ["degraded", "disabled", "error"].includes(String(s.status).toLowerCase());
}

function newIdempotencyKey(): string {
  return `idk_mai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const MANAGEMENT_AI_STREAM_READ_TIMEOUT_MS = 45_000;

function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  return (err as { name?: string } | null)?.name === "AbortError" || Boolean(signal?.aborted);
}

/** POST /bff/management/nl/ask — never returns a locally-synthesized answer. */
export async function askManagementAi(
  input: ManagementAiAskInput,
  options?: { signal?: AbortSignal },
): Promise<ManagementAiResult> {
  const base = detectBaseUrl();
  if (!base) {
    return {
      ok: false,
      kind: "transport_failure",
      status: null,
      message: "BFF base URL is not configured (VITE_BFF_BASE_URL missing).",
    };
  }
  const headers = buildHeaders({
    method: "POST",
    idempotency: newIdempotencyKey(),
  });
  const body = JSON.stringify({
    question: input.question,
    focus: input.focus ?? "all",
    context: input.context ?? "",
    sessionId: input.sessionId ?? undefined,
    conversation: input.conversation ?? undefined,
    ui: input.ui ?? undefined,
    attachments: input.attachments && input.attachments.length > 0 ? input.attachments : undefined,
    openclaw: input.openclaw ?? undefined,
  });

  let res: Response;
  try {
    res = await fetch(`${base}${paths.managementNlAsk()}`, {
      method: "POST",
      headers,
      body,
      credentials: "include",
      signal: options?.signal,
    });
  } catch (err) {
    if (isAbortError(err, options?.signal)) {
      return { ok: false, kind: "aborted" };
    }
    return {
      ok: false,
      kind: "transport_failure",
      status: null,
      message: (err as Error)?.message ?? "Network error contacting Pantheon BFF.",
    };
  }

  const text = await res.text();
  let parsed: RawAskResponse | undefined;
  try { parsed = text ? JSON.parse(text) as RawAskResponse : undefined; } catch { parsed = undefined; }

  if (!res.ok) {
    return {
      ok: false,
      kind: "transport_failure",
      status: res.status,
      message: `BFF ${res.status} ${res.statusText || ""}`.trim(),
    };
  }

  const data = parsed?.data ?? {};
  const providerStatus = adaptProviderStatus(data.provider_status ?? data.providerStatus);
  const sessionId = data.sessionId ?? data.session_id ?? null;
  const traceId = data.traceId ?? data.trace_id ?? null;

  if (isDegraded(providerStatus)) {
    return {
      ok: false,
      kind: "provider_degraded",
      providerStatus,
      sessionId,
      traceId,
      answer: typeof data.answer === "string" && data.answer.trim() ? data.answer : null,
      auditLogHref: data.auditLog?.href ?? data.audit_log?.href ?? null,
      conversationHref: data.conversation?.href ?? null,
      uiActions: adaptUiActions(data),
      message: providerStatus
        ? `Provider ${providerStatus.provider}/${providerStatus.runtime} status=${providerStatus.status} used=${providerStatus.used}`
        : "Pantheon BFF returned no providerStatus.",
    };
  }

  return {
    ok: true,
    kind: "ok",
    answer: String(data.answer ?? ""),
    sessionId,
    traceId,
    providerStatus: providerStatus!,
    auditLogHref: data.auditLog?.href ?? data.audit_log?.href ?? null,
    conversationHref: data.conversation?.href ?? null,
    uiActions: adaptUiActions(data),
  };

}

export interface ManagementAiStreamCallbacks {
  /** Called as each token chunk arrives; `full` is the accumulated reply so far. */
  onDelta?: (chunk: string, full: string) => void;
  /** Called once when the BFF emits the meta event (session/trace ids). */
  onMeta?: (meta: { sessionId: string | null; traceId: string | null; messageId: string | null }) => void;
}

/**
 * POST /bff/management/nl/ask/stream — SSE token streaming.
 *
 * Drives progressive rendering: invokes onDelta as chunks arrive, then resolves
 * to the SAME ManagementAiResult shape as askManagementAi() so the caller's
 * reconcile/persist logic is unchanged. Never synthesizes an answer locally.
 */
export async function streamManagementAi(
  input: ManagementAiAskInput,
  callbacks: ManagementAiStreamCallbacks = {},
  options?: { signal?: AbortSignal },
): Promise<ManagementAiResult> {
  const base = detectBaseUrl();
  if (!base) {
    return { ok: false, kind: "transport_failure", status: null, message: "BFF base URL is not configured (VITE_BFF_BASE_URL missing)." };
  }
  const headers = buildHeaders({ method: "POST", idempotency: newIdempotencyKey() });
  headers["Accept"] = "text/event-stream";
  const body = JSON.stringify({
    question: input.question,
    focus: input.focus ?? "all",
    context: input.context ?? "",
    sessionId: input.sessionId ?? undefined,
    conversation: input.conversation ?? undefined,
    ui: input.ui ?? undefined,
    openclaw: input.openclaw ?? undefined,
  });

  let res: Response;
  try {
    res = await fetch(`${base}${paths.managementNlAskStream()}`, {
      method: "POST", headers, body, credentials: "include", signal: options?.signal,
    });
  } catch (err) {
    if (isAbortError(err, options?.signal)) return { ok: false, kind: "aborted" };
    return { ok: false, kind: "transport_failure", status: null, message: (err as Error)?.message ?? "Network error contacting Pantheon BFF." };
  }
  if (!res.ok || !res.body) {
    return { ok: false, kind: "transport_failure", status: res.status, message: `BFF ${res.status} ${res.statusText || ""}`.trim() };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let sessionId: string | null = input.sessionId ?? null;
  let traceId: string | null = null;
  let streamError: { code: string; message: string } | null = null;
  let finalProviderStatus: ProviderStatus | null = null;
  let auditLogHref: string | null = null;
  let conversationHref: string | null = null;
  let uiActions: ManagementAiUiAction[] = [];

  const readWithTimeout = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        reader.read(),
        new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error("Management AI stream timed out waiting for BFF data."));
          }, MANAGEMENT_AI_STREAM_READ_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const appendDelta = (chunk: string): void => {
    if (!chunk) return;
    full += chunk;
    callbacks.onDelta?.(chunk, full);
  };

  const replaceWithDoneText = (text: string): void => {
    if (!text || text === full) return;
    const chunk = text.startsWith(full) ? text.slice(full.length) : text;
    full = text;
    if (chunk) callbacks.onDelta?.(chunk, full);
  };

  const handlePayload = (payload: string): boolean => {
    if (!payload) return false;
    if (payload === "[DONE]") return true;
    let evt: Record<string, unknown>;
    try { evt = JSON.parse(payload) as Record<string, unknown>; } catch { return false; }
    const t = evt.type;
    if (t === "meta") {
      sessionId = (evt.sessionId as string) ?? (evt.session_id as string) ?? sessionId;
      traceId = (evt.traceId as string) ?? (evt.trace_id as string) ?? traceId;
      callbacks.onMeta?.({ sessionId, traceId, messageId: (evt.messageId as string) ?? null });
    } else if (t === "delta") {
      appendDelta(String(evt.text ?? ""));
    } else if (t === "done") {
      replaceWithDoneText(String(evt.text ?? ""));
      finalProviderStatus = adaptProviderStatus((evt.provider_status ?? evt.providerStatus) as (Partial<ProviderStatus> & Record<string, unknown>) | undefined) ?? finalProviderStatus;
      const auditLog = asRecord(evt.auditLog ?? evt.audit_log);
      const conversation = asRecord(evt.conversation);
      auditLogHref = asString(auditLog?.href) ?? auditLogHref;
      conversationHref = asString(conversation?.href) ?? conversationHref;
      uiActions = adaptUiActions(evt as RawAskResponse["data"]);
    } else if (t === "error") {
      streamError = { code: String(evt.error_code ?? "OPENCLAW_STREAM_ERROR"), message: String(evt.message ?? "stream error") };
    }
    return false;
  };

  try {
    let sawDone = false;
    for (;;) {
      const { done, value } = await readWithTimeout();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of frame.split("\n")) {
          const s = line.trim();
          if (s.startsWith("data:") && handlePayload(s.slice(5).trim())) sawDone = true;
        }
      }
      if (sawDone) {
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
    }
  } catch (err) {
    try { await reader.cancel(); } catch { /* ignore */ }
    if (isAbortError(err, options?.signal)) return { ok: false, kind: "aborted" };
    return { ok: false, kind: "transport_failure", status: null, message: (err as Error)?.message ?? "Stream read error." };
  }

  const providerStatus: ProviderStatus = finalProviderStatus ?? {
    provider: "openclaw", runtime: "openclaw_gateway_agent_cli",
    status: streamError ? "degraded" : "completed", used: !streamError, fallback: null,
    reasonCode: streamError?.code ?? null,
  };

  if (streamError) {
    providerStatus.status = "degraded";
    providerStatus.used = false;
    providerStatus.reasonCode = providerStatus.reasonCode ?? streamError.code;
    providerStatus.reason = providerStatus.reason ?? streamError.code;
  }

  if (streamError || isDegraded(providerStatus)) {
    return {
      ok: false, kind: "provider_degraded", providerStatus, sessionId, traceId,
      answer: full.trim() ? full : null, auditLogHref, conversationHref, uiActions,
      message: streamError?.message ?? `Provider ${providerStatus.provider}/${providerStatus.runtime} status=${providerStatus.status} used=${providerStatus.used}`,
    };
  }
  return {
    ok: true, kind: "ok", answer: full, sessionId, traceId, providerStatus,
    auditLogHref, conversationHref, uiActions,
  };
}

export async function startAssistantProviderReauth(
  input: AssistantProviderReauthInput = {},
  options?: { signal?: AbortSignal },
): Promise<AssistantProviderReauthResult> {
  const base = detectBaseUrl();
  if (!base) {
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: "BFF base URL is not configured (VITE_BFF_BASE_URL missing).",
    };
  }

  const route = paths.assistantProviderReauth();
  const headers = buildHeaders({ method: "POST", idempotency: newIdempotencyKey() });
  const body = JSON.stringify({
    provider: input.provider ?? "codex",
    reason: input.reason,
    traceId: input.traceId,
  });

  let res: Response;
  try {
    res = await fetch(`${base}${route}`, {
      method: "POST",
      headers,
      body,
      credentials: "include",
      signal: options?.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError" || options?.signal?.aborted) {
      return { ok: false, kind: "failure", statusCode: null, message: "aborted" };
    }
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: (err as Error)?.message ?? "Network error contacting Pantheon BFF.",
    };
  }

  const text = await res.text();
  let parsed: { data?: unknown; meta?: unknown; detail?: unknown; message?: unknown } | undefined;
  try {
    parsed = text ? JSON.parse(text) as { data?: unknown; meta?: unknown; detail?: unknown; message?: unknown } : undefined;
  } catch {
    parsed = undefined;
  }

  if (!res.ok) {
    return {
      ok: false,
      kind: "failure",
      statusCode: res.status,
      message: bffRouteFailureMessage(parsed, res, route),
    };
  }

  const reauth = adaptProviderReauthSession(parsed?.data);
  if (!reauth) {
    return {
      ok: false,
      kind: "failure",
      statusCode: res.status,
      message: "BFF returned no provider reauth session.",
    };
  }
  return { ok: true, kind: "ok", reauth };
}

export async function fetchAssistantProviderReauthStatus(
  sessionId: string,
  provider = "codex",
  options?: { signal?: AbortSignal },
): Promise<AssistantProviderReauthResult> {
  const base = detectBaseUrl();
  if (!base) {
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: "BFF base URL is not configured (VITE_BFF_BASE_URL missing).",
    };
  }

  const route = paths.assistantProviderReauthStatus(sessionId, provider);
  const headers = buildHeaders({ method: "GET" });
  let res: Response;
  try {
    res = await fetch(`${base}${route}`, {
      method: "GET",
      headers,
      credentials: "include",
      signal: options?.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError" || options?.signal?.aborted) {
      return { ok: false, kind: "failure", statusCode: null, message: "aborted" };
    }
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: (err as Error)?.message ?? "Network error contacting Pantheon BFF.",
    };
  }

  const text = await res.text();
  let parsed: { data?: unknown; detail?: unknown; message?: unknown } | undefined;
  try {
    parsed = text ? JSON.parse(text) as { data?: unknown; detail?: unknown; message?: unknown } : undefined;
  } catch {
    parsed = undefined;
  }

  if (!res.ok) {
    return {
      ok: false,
      kind: "failure",
      statusCode: res.status,
      message: bffRouteFailureMessage(parsed, res, route),
    };
  }

  const data = asRecord(parsed?.data) ?? {};
  const reauth = adaptProviderReauthSession({
    ...data,
    reauthSessionId: data.reauthSessionId ?? data.reauth_session_id ?? sessionId,
    provider: data.provider ?? provider,
  });
  if (!reauth) {
    return {
      ok: false,
      kind: "failure",
      statusCode: res.status,
      message: "BFF returned no provider reauth session status.",
    };
  }
  return { ok: true, kind: "ok", reauth };
}

export async function submitAssistantProviderReauthCode(
  input: AssistantProviderReauthCodeInput,
  options?: { signal?: AbortSignal },
): Promise<AssistantProviderReauthResult> {
  const base = detectBaseUrl();
  if (!base) {
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: "BFF base URL is not configured (VITE_BFF_BASE_URL missing).",
    };
  }

  const provider = input.provider ?? "claude";
  const route = paths.assistantProviderReauthCode(input.sessionId, provider);
  const headers = buildHeaders({ method: "POST", idempotency: newIdempotencyKey() });
  const body = JSON.stringify({
    provider,
    code: input.code,
    traceId: input.traceId,
  });

  let res: Response;
  try {
    res = await fetch(`${base}${route}`, {
      method: "POST",
      headers,
      body,
      credentials: "include",
      signal: options?.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError" || options?.signal?.aborted) {
      return { ok: false, kind: "failure", statusCode: null, message: "aborted" };
    }
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: (err as Error)?.message ?? "Network error contacting Pantheon BFF.",
    };
  }

  const text = await res.text();
  let parsed: { data?: unknown; detail?: unknown; message?: unknown } | undefined;
  try {
    parsed = text ? JSON.parse(text) as { data?: unknown; detail?: unknown; message?: unknown } : undefined;
  } catch {
    parsed = undefined;
  }

  if (!res.ok) {
    return {
      ok: false,
      kind: "failure",
      statusCode: res.status,
      message: bffRouteFailureMessage(parsed, res, route),
    };
  }

  const data = asRecord(parsed?.data) ?? {};
  const reauth = adaptProviderReauthSession({
    ...data,
    reauthSessionId: data.reauthSessionId ?? data.reauth_session_id ?? input.sessionId,
    provider: data.provider ?? provider,
  });
  if (!reauth) {
    return {
      ok: false,
      kind: "failure",
      statusCode: res.status,
      message: "BFF returned no provider reauth code submission status.",
    };
  }
  return { ok: true, kind: "ok", reauth };
}

export async function fetchAssistantModeStatus(
  options?: { signal?: AbortSignal },
): Promise<AssistantModeStatusResult> {
  const base = detectBaseUrl();
  if (!base) {
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: "BFF base URL is not configured (VITE_BFF_BASE_URL missing).",
    };
  }
  const headers = buildHeaders({ method: "GET" });
  let res: Response;
  try {
    res = await fetch(`${base}${paths.assistantMode()}`, {
      method: "GET",
      headers,
      credentials: "include",
      signal: options?.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError" || options?.signal?.aborted) {
      return { ok: false, kind: "failure", statusCode: null, message: "aborted" };
    }
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: (err as Error)?.message ?? "Network error contacting Pantheon BFF.",
    };
  }

  const text = await res.text();
  let parsed: { data?: Record<string, unknown> } | undefined;
  try { parsed = text ? JSON.parse(text) as { data?: Record<string, unknown> } : undefined; } catch { parsed = undefined; }
  if (!res.ok) {
    return {
      ok: false,
      kind: "failure",
      statusCode: res.status,
      message: `BFF ${res.status} ${res.statusText || ""}`.trim(),
    };
  }

  const data = parsed?.data ?? {};
  return {
    ok: true,
    kind: "ok",
    status: {
      productDefaultMode: asString(data.productDefaultMode ?? data.product_default_mode),
      kernelEnabled: asBoolean(data.kernelEnabled ?? data.kernel_enabled),
      controlMode: adaptControlModeStatus(data.controlMode ?? data.control_mode),
    },
  };
}

export async function activateAssistantControlMode(
  input: ActivateAssistantControlModeInput,
  options?: { signal?: AbortSignal },
): Promise<AssistantControlModeMutationResult> {
  const base = detectBaseUrl();
  if (!base) {
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: "BFF base URL is not configured (VITE_BFF_BASE_URL missing).",
    };
  }
  const headers = buildHeaders({ method: "POST", idempotency: newIdempotencyKey() });
  const body = JSON.stringify({
    passphrase: input.passphrase,
    mode: input.mode,
    reason: input.reason,
    ttlSeconds: input.ttlSeconds,
    idleTtlSeconds: input.idleTtlSeconds,
    managementSessionId: input.managementSessionId ?? undefined,
  });

  let res: Response;
  try {
    res = await fetch(`${base}${paths.assistantControlModeActivate()}`, {
      method: "POST",
      headers,
      body,
      credentials: "include",
      signal: options?.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError" || options?.signal?.aborted) {
      return { ok: false, kind: "failure", statusCode: null, message: "aborted" };
    }
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: (err as Error)?.message ?? "Network error contacting Pantheon BFF.",
    };
  }

  const text = await res.text();
  let parsed: { data?: unknown; detail?: unknown } | undefined;
  try { parsed = text ? JSON.parse(text) as { data?: unknown; detail?: unknown } : undefined; } catch { parsed = undefined; }
  if (!res.ok) {
    const detail = asRecord(parsed?.detail);
    const error = asRecord(detail?.error);
    const reason = asString(error?.message) ?? asString(error?.details) ?? asString(detail?.message);
    return {
      ok: false,
      kind: "failure",
      statusCode: res.status,
      message: reason ?? `BFF ${res.status} ${res.statusText || ""}`.trim(),
    };
  }

  return {
    ok: true,
    kind: "ok",
    controlMode: adaptControlModeStatus(parsed?.data) ?? { state: "unknown", active: false },
  };
}

export async function deactivateAssistantControlMode(
  reason = "operator_deactivated_from_frontend",
  options?: { signal?: AbortSignal },
): Promise<AssistantControlModeMutationResult> {
  const base = detectBaseUrl();
  if (!base) {
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: "BFF base URL is not configured (VITE_BFF_BASE_URL missing).",
    };
  }
  const headers = buildHeaders({ method: "POST", idempotency: newIdempotencyKey() });
  let res: Response;
  try {
    res = await fetch(`${base}${paths.assistantControlModeDeactivate()}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason }),
      credentials: "include",
      signal: options?.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError" || options?.signal?.aborted) {
      return { ok: false, kind: "failure", statusCode: null, message: "aborted" };
    }
    return {
      ok: false,
      kind: "failure",
      statusCode: null,
      message: (err as Error)?.message ?? "Network error contacting Pantheon BFF.",
    };
  }

  const text = await res.text();
  let parsed: { data?: unknown; detail?: unknown } | undefined;
  try { parsed = text ? JSON.parse(text) as { data?: unknown; detail?: unknown } : undefined; } catch { parsed = undefined; }
  if (!res.ok) {
    return {
      ok: false,
      kind: "failure",
      statusCode: res.status,
      message: `BFF ${res.status} ${res.statusText || ""}`.trim(),
    };
  }
  return {
    ok: true,
    kind: "ok",
    controlMode: adaptControlModeStatus(parsed?.data) ?? { state: "inactive", active: false },
  };
}

// ---- Conversation resync ----

export interface ManagementAiTurn {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string | null;
  providerStatus?: ProviderStatus | null;
}

export interface ConversationResyncOk {
  ok: true;
  kind: "ok";
  sessionId: string;
  turns: ManagementAiTurn[];
}

export interface ConversationResyncFailure {
  ok: false;
  kind: "failure";
  status: number | null;
  message: string;
}

export type ConversationResyncResult = ConversationResyncOk | ConversationResyncFailure;


interface RawConversationResponse {
  data?: {
    session_id?: string;
    sessionId?: string;
    turns?: Array<{
      id?: string;
      turn_id?: string;
      role?: string;
      text?: string;
      content?: string;
      created_at?: string;
      createdAt?: string;
      provider_status?: Partial<ProviderStatus>;
      providerStatus?: Partial<ProviderStatus>;
    }>;
  };
}

/**
 * Read the full conversation history for a session.
 *
 * Per 2026-06-03 directive: do NOT pass trace_id when loading the full
 * conversation — trace_id is for single-turn audit linking only. The
 * second parameter is accepted but ignored to preserve call sites.
 */
export async function fetchManagementAiConversation(
  sessionId: string,
  _traceIdIgnored?: string | null,
): Promise<ConversationResyncResult> {
  const base = detectBaseUrl();
  if (!base) return { ok: false, kind: "failure", status: null, message: "BFF base URL is not configured." };
  const headers = buildHeaders({ method: "GET" });
  const url = `${base}${paths.managementAiConversation(sessionId)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers, credentials: "include" });
  } catch (err) {
    return { ok: false, kind: "failure", status: null, message: (err as Error)?.message ?? "Network error." };
  }
  const text = await res.text();
  if (!res.ok) return { ok: false, kind: "failure", status: res.status, message: `BFF ${res.status}` };
  let parsed: RawConversationResponse | undefined;
  try { parsed = text ? JSON.parse(text) as RawConversationResponse : undefined; } catch { parsed = undefined; }
  const data = parsed?.data ?? {};
  const turns: ManagementAiTurn[] = (data.turns ?? []).map((t, i) => ({
    id: String(t.id ?? t.turn_id ?? `turn_${i}`),
    role: (["user", "assistant", "system"].includes(String(t.role)) ? t.role : "assistant") as ManagementAiTurn["role"],
    text: String(t.text ?? t.content ?? ""),
    createdAt: t.createdAt ?? t.created_at ?? null,
    providerStatus: adaptProviderStatus(t.provider_status ?? t.providerStatus),
  }));
  return { ok: true, kind: "ok", sessionId: String(data.sessionId ?? data.session_id ?? sessionId), turns };
}


// ---- Conversation list (server-side history index) ----

export interface ManagementAiConversationSummary {
  sessionId: string;
  title: string;
  updatedAt: string | null;
  createdAt: string | null;
  turnCount: number;
}

export interface ConversationListOk {
  ok: true;
  kind: "ok";
  conversations: ManagementAiConversationSummary[];
}

export interface ConversationListFailure {
  ok: false;
  kind: "failure";
  status: number | null;
  message: string;
}

export type ConversationListResult = ConversationListOk | ConversationListFailure;

/**
 * List the caller's server-side Management AI conversations.
 *
 * The left-rail history index is a localStorage cache, NOT the source of
 * truth. When localStorage is cleared (fresh browser, cache wipe, FE redeploy
 * that bumps the storage key) the rail goes empty even though the server still
 * has every session. This pulls the authoritative list so the FE can rebuild
 * the index. Independent of OpenClaw / provider health — history readback must
 * not be gated on the tool-policy degraded banner.
 */
export async function fetchManagementAiConversationList(
  limit = 50,
): Promise<ConversationListResult> {
  const base = detectBaseUrl();
  if (!base) return { ok: false, kind: "failure", status: null, message: "BFF base URL is not configured." };
  const headers = buildHeaders({ method: "GET" });
  const url = `${base}${paths.managementAiConversations(limit)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers, credentials: "include" });
  } catch (err) {
    return { ok: false, kind: "failure", status: null, message: (err as Error)?.message ?? "Network error." };
  }
  const body = await res.text();
  if (!res.ok) return { ok: false, kind: "failure", status: res.status, message: `BFF ${res.status}` };
  let parsed: { data?: unknown; items?: unknown } | undefined;
  try { parsed = body ? JSON.parse(body) as { data?: unknown; items?: unknown } : undefined; } catch { parsed = undefined; }
  let rawItems: unknown[] = [];
  if (Array.isArray(parsed?.data)) {
    rawItems = parsed.data;
  } else if (parsed?.data && typeof parsed.data === "object" && Array.isArray((parsed.data as Record<string, unknown>).items)) {
    rawItems = (parsed.data as Record<string, unknown>).items as unknown[];
  } else if (Array.isArray(parsed?.items)) {
    rawItems = parsed.items;
  }
  const conversations: ManagementAiConversationSummary[] = [];
  for (const item of rawItems as Array<Record<string, unknown>>) {
    const sessionId = asString(item.sessionId ?? item.session_id ?? item.id);
    if (!sessionId) continue;
    const turnCountRaw = item.turnCount ?? item.turn_count;
    conversations.push({
      sessionId,
      title: asString(item.title) ?? "",
      updatedAt: asString(item.updatedAt ?? item.updated_at) ?? null,
      createdAt: asString(item.createdAt ?? item.created_at) ?? null,
      turnCount: typeof turnCountRaw === "number" ? turnCountRaw : 0,
    });
  }
  return { ok: true, kind: "ok", conversations };
}
