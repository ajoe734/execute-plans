import { withStrictLiveOrMock } from "@/lib/bff/liveRead";
import type {
  ConsultRule,
  MemoryUpdate,
  PermissionGrant,
  PermissionInstance,
  PermissionMatrix,
  RiskLevel,
} from "@/lib/bff/types";
import { paths } from "./paths";

type UnknownRecord = Record<string, unknown>;

export interface ManagementSurfaceState {
  status: string;
  source?: string;
  message?: string;
  [key: string]: unknown;
}

export interface ManagementListMeta {
  status?: string;
  source?: string;
  snapshot_at?: string;
  snapshotAt?: string;
  surfaces?: Record<string, ManagementSurfaceState>;
  [key: string]: unknown;
}

export interface ManagementPageInfo {
  total?: number;
  page_size?: number;
  totalCountExact?: boolean;
  next_page_token?: string | null;
  [key: string]: unknown;
}

export interface ManagementRecordsEnvelope<T> {
  items: T[];
  meta: ManagementListMeta;
  page_info: ManagementPageInfo;
}

export interface CanonicalDataSourceRecord {
  providerKey: string;
  provider: string;
  markets: string[];
  sourceClasses: string[];
  status: string;
  tone: "ok" | "warn" | "bad" | "muted";
  lastReadbackAt?: string;
  credentialState?: string;
  liveIngestionEnabled: boolean;
  readOnly: boolean;
  orderSideEffectsAllowed: boolean;
  capitalSideEffectsAllowed: boolean;
  consumerPersonaIds: string[];
  consumerPersonaNames: string[];
  evidenceRefs: string[];
  unavailableRefs: string[];
  orderCapableProvider: boolean;
}

export interface WorkflowTemplateRecord {
  id: string;
  name: string;
  category: "rebalance" | "evolution" | "training" | "incident";
  steps: string[];
  inputs: string[];
  lastRun: string;
  runs: number;
  owner: string;
}

export interface CronRecord {
  id: string;
  name: string;
  schedule: string;
  target: string;
  enabled: boolean;
  lastRun: string;
  nextRun: string;
}

export interface HookRecord {
  id: string;
  name: string;
  event: string;
  target: string;
  filters: string;
  enabled: boolean;
  firedToday: number;
}

export interface HookRegistryRead {
  crons: CronRecord[];
  hooks: HookRecord[];
  meta: ManagementListMeta;
}

export interface KnowledgeInsightRecord {
  id: string;
  title: string;
  source: string;
  kind: "research_note" | "signal_review" | "committee_memo" | "alert_observation";
  risk: "low" | "medium" | "high";
  ts: string;
  body: string;
}

export interface LineageNodeRecord {
  id: string;
  label: string;
  type: string;
  state?: string;
  risk?: RiskLevel;
  highlight?: boolean;
}

export interface LineageEdgeRecord {
  from: string;
  to: string;
  label?: string;
}

export interface LineageRead {
  nodes: LineageNodeRecord[];
  edges: LineageEdgeRecord[];
  meta: ManagementListMeta;
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): UnknownRecord | undefined =>
  isRecord(value) ? value : undefined;

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const asString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

const stringList = (...values: unknown[]): string[] => {
  const out: string[] = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        const next = asString(item);
        if (next) out.push(next);
      });
    } else {
      const next = asString(value);
      if (next) out.push(next);
    }
  }
  return Array.from(new Set(out));
};

const recordsFrom = (...values: unknown[]): UnknownRecord[] => {
  for (const value of values) {
    const rows = asArray(value).filter(isRecord);
    if (rows.length) return rows;
  }
  return [];
};

const envelopeRecords = (raw: unknown): UnknownRecord[] => {
  const root = asRecord(raw);
  const data = asRecord(root?.data);
  return recordsFrom(
    root?.items,
    data?.items,
    data?.records,
    data?.data,
    root?.records,
    root?.data,
  );
};

const envelopeMeta = (raw: unknown, surface: string): ManagementListMeta => {
  const root = asRecord(raw);
  const meta = asRecord(root?.meta) ?? {};
  return {
    status: asString(meta.status) ?? "unavailable",
    source: asString(meta.source) ?? "frontend_empty_read",
    surfaces: {
      [surface]: {
        status: asString(asRecord(meta.surfaces)?.[surface]) ?? asString(meta.status) ?? "unavailable",
        source: asString(meta.source) ?? "frontend_empty_read",
      },
      ...(asRecord(meta.surfaces) as Record<string, ManagementSurfaceState> | undefined),
    },
    ...meta,
  };
};

const envelopePageInfo = (raw: unknown, count: number): ManagementPageInfo => {
  const root = asRecord(raw);
  return {
    total: count,
    page_size: count,
    totalCountExact: true,
    next_page_token: null,
    ...(asRecord(root?.page_info) ?? {}),
  };
};

const readRecords = async <T>(
  path: string,
  surface: string,
  adapt: (record: UnknownRecord, index: number) => T | undefined,
): Promise<ManagementRecordsEnvelope<T>> =>
  withStrictLiveOrMock<ManagementRecordsEnvelope<T>, unknown>(
    { method: "GET", path },
    async () => ({
      items: [],
      meta: envelopeMeta(undefined, surface),
      page_info: envelopePageInfo(undefined, 0),
    }),
    (raw) => {
      const items = envelopeRecords(raw)
        .map(adapt)
        .filter((item): item is T => item !== undefined);
      return {
        items,
        meta: envelopeMeta(raw, surface),
        page_info: envelopePageInfo(raw, items.length),
      };
    },
  );

const healthTone = (status: string): CanonicalDataSourceRecord["tone"] => {
  const normalized = status.toLowerCase();
  if (["ok", "healthy", "active", "read_ok", "connected", "ready"].some((term) => normalized.includes(term))) return "ok";
  if (["fail", "error", "down", "blocked", "missing"].some((term) => normalized.includes(term))) return "bad";
  if (["warn", "degraded", "stale", "limited", "unavailable"].some((term) => normalized.includes(term))) return "warn";
  return "muted";
};

const adaptDataSource = (record: UnknownRecord, index: number): CanonicalDataSourceRecord => {
  const status = asString(record.health, record.status, record.state) ?? "unknown";
  const providerKey = asString(record.providerKey, record.provider_key, record.connector_id, record.id, record.provider) ?? `data-source-${index + 1}`;
  const provider = asString(record.provider, record.name, record.display_name, record.connector_id, providerKey) ?? providerKey;
  const consumerIds = stringList(record.consumerPersonaIds, record.consumer_persona_ids, record.persona_ids, record.personas);
  return {
    providerKey,
    provider,
    markets: stringList(record.markets, record.marketScope, record.market_scope, record.universe, record.market),
    sourceClasses: stringList(record.sourceClasses, record.source_classes, record.sourceClass, record.source_class, record.kind),
    status,
    tone: healthTone(status),
    lastReadbackAt: asString(record.lastReadbackAt, record.last_readback_at, record.lastHeartbeatAt, record.last_heartbeat_at),
    credentialState: asString(record.credentialState, record.credential_state, record.credentials, record.credential) ?? "unknown",
    liveIngestionEnabled: asBoolean(record.liveIngestionEnabled ?? record.live_ingestion_enabled, healthTone(status) === "ok"),
    readOnly: asBoolean(record.readOnly ?? record.read_only, true),
    orderSideEffectsAllowed: asBoolean(record.orderSideEffectsAllowed ?? record.order_side_effects_allowed, false),
    capitalSideEffectsAllowed: asBoolean(record.capitalSideEffectsAllowed ?? record.capital_side_effects_allowed, false),
    consumerPersonaIds: consumerIds,
    consumerPersonaNames: stringList(record.consumerPersonaNames, record.consumer_persona_names),
    evidenceRefs: stringList(record.evidenceRefs, record.evidence_refs, record.readbackRefs, record.readback_refs),
    unavailableRefs: stringList(record.unavailableRefs, record.unavailable_refs),
    orderCapableProvider: asBoolean(record.orderCapableProvider ?? record.order_capable_provider, false),
  };
};

const permissionInstances: PermissionInstance[] = ["persona-tool", "persona-mcp", "persona-skill", "persona-lifecycle"];

const toPermissionInstance = (value: unknown): PermissionInstance =>
  permissionInstances.includes(value as PermissionInstance) ? value as PermissionInstance : "persona-tool";

const toGrant = (value: unknown): PermissionGrant => {
  const normalized = asString(value)?.toLowerCase();
  return normalized === "read" || normalized === "use" || normalized === "manage" ? normalized : "none";
};

const adaptPermissionMatrix = (record: UnknownRecord): PermissionMatrix | undefined => {
  if (Array.isArray(record.rows) && Array.isArray(record.cols) && Array.isArray(record.cells)) {
    return {
      instance: toPermissionInstance(record.instance),
      rows: recordsFrom(record.rows).map((row, index) => ({
        id: asString(row.id, row.row_id, row.persona_id) ?? `row-${index + 1}`,
        label: asString(row.label, row.name, row.id) ?? `Row ${index + 1}`,
      })),
      cols: recordsFrom(record.cols).map((col, index) => ({
        id: asString(col.id, col.col_id, col.target_id, col.capability) ?? `col-${index + 1}`,
        label: asString(col.label, col.name, col.id, col.capability) ?? `Col ${index + 1}`,
        risk: asString(col.risk) as RiskLevel | undefined,
      })),
      cells: recordsFrom(record.cells).map((cell) => ({
        rowId: asString(cell.rowId, cell.row_id, cell.persona_id) ?? "",
        colId: asString(cell.colId, cell.col_id, cell.target_id, cell.capability) ?? "",
        grant: toGrant(cell.grant ?? cell.permission),
        envScope: stringList(cell.envScope, cell.env_scope) as ("research" | "paper" | "live")[],
        updatedBy: asString(cell.updatedBy, cell.updated_by),
        updatedAt: asString(cell.updatedAt, cell.updated_at),
      })),
    };
  }
  const rowId = asString(record.rowId, record.row_id, record.persona_id, record.subject_id);
  const colId = asString(record.colId, record.col_id, record.target_id, record.capability, record.permission);
  if (!rowId || !colId) return undefined;
  return {
    instance: toPermissionInstance(record.instance ?? record.surface),
    rows: [{ id: rowId, label: asString(record.rowLabel, record.row_label, record.persona_name, rowId) ?? rowId }],
    cols: [{ id: colId, label: asString(record.colLabel, record.col_label, record.target_name, colId) ?? colId }],
    cells: [{
      rowId,
      colId,
      grant: toGrant(record.grant ?? record.permission),
      envScope: stringList(record.envScope, record.env_scope) as ("research" | "paper" | "live")[],
      updatedBy: asString(record.updatedBy, record.updated_by),
      updatedAt: asString(record.updatedAt, record.updated_at),
    }],
  };
};

const mergePermissionMatrices = (records: PermissionMatrix[]): PermissionMatrix[] => {
  const byInstance = new Map<PermissionInstance, PermissionMatrix>();
  for (const matrix of records) {
    const current = byInstance.get(matrix.instance);
    if (!current) {
      byInstance.set(matrix.instance, { ...matrix, rows: [...matrix.rows], cols: [...matrix.cols], cells: [...matrix.cells] });
      continue;
    }
    const rows = new Map(current.rows.map((row) => [row.id, row]));
    const cols = new Map(current.cols.map((col) => [col.id, col]));
    matrix.rows.forEach((row) => rows.set(row.id, row));
    matrix.cols.forEach((col) => cols.set(col.id, col));
    current.rows = [...rows.values()];
    current.cols = [...cols.values()];
    current.cells.push(...matrix.cells);
  }
  return permissionInstances.map((instance) => byInstance.get(instance)).filter((item): item is PermissionMatrix => Boolean(item));
};

const toMemoryKind = (value: unknown): MemoryUpdate["kind"] => {
  const normalized = asString(value)?.toLowerCase();
  return normalized === "preference" || normalized === "skill_pref" || normalized === "redaction" ? normalized : "fact";
};

const toMemorySource = (value: unknown): MemoryUpdate["source"] => {
  const normalized = asString(value)?.toLowerCase();
  if (normalized === "signal_feedback" || normalized === "decision_log" || normalized === "evaluation") return normalized;
  return "operator";
};

const toMemoryState = (value: unknown): MemoryUpdate["state"] => {
  const normalized = asString(value)?.toLowerCase();
  if (normalized === "approved" || normalized === "rejected" || normalized === "merged" || normalized === "conflict") return normalized;
  return "queued";
};

const adaptMemoryUpdate = (record: UnknownRecord, index: number): MemoryUpdate => ({
  id: asString(record.id, record.update_id, record.rule_id) ?? `memory-governance-${index + 1}`,
  personaId: asString(record.personaId, record.persona_id, record.subject_id, record.scope) ?? "global",
  kind: toMemoryKind(record.kind ?? record.rule_type),
  source: toMemorySource(record.source),
  proposedBy: asString(record.proposedBy, record.proposed_by, record.owner, record.created_by) ?? "pantheon-bff",
  proposedAt: asString(record.proposedAt, record.proposed_at, record.created_at, record.updated_at) ?? "",
  state: toMemoryState(record.state ?? record.status),
  before: asString(record.before, record.previous_value),
  after: asString(record.after, record.value, record.summary, record.description, record.trigger) ?? JSON.stringify(record),
  conflictWith: asString(record.conflictWith, record.conflict_with),
});

const toConsultMode = (value: unknown): ConsultRule["mode"] => {
  const normalized = asString(value)?.toLowerCase();
  return normalized === "blocking" || normalized === "ack" ? normalized : "advisory";
};

const envScope = (value: unknown): ConsultRule["envScope"] => {
  const raw = stringList(value).filter((item) => item === "research" || item === "paper" || item === "live");
  return raw.length ? raw as ConsultRule["envScope"] : ["research"];
};

const adaptConsultRule = (record: UnknownRecord, index: number): ConsultRule => ({
  id: asString(record.id, record.rule_id) ?? `consult-rule-${index + 1}`,
  name: asString(record.name, record.label, record.trigger, record.rule_id) ?? `Consult rule ${index + 1}`,
  fromPersonaId: asString(record.fromPersonaId, record.from_persona_id, record.requester_persona_id, record.persona_id) ?? "global",
  toPersonaId: asString(record.toPersonaId, record.to_persona_id, record.required_persona_id, record.consultee_persona_id) ?? "reviewer",
  trigger: asString(record.trigger, record.condition, record.event) ?? "manual_review",
  mode: toConsultMode(record.mode ?? record.required),
  envScope: envScope(record.envScope ?? record.env_scope),
  enabled: asBoolean(record.enabled, true),
  owner: asString(record.owner, record.updated_by) ?? "pantheon-bff",
  updatedAt: asString(record.updatedAt, record.updated_at, record.created_at) ?? "",
});

const toWorkflowCategory = (value: unknown): WorkflowTemplateRecord["category"] => {
  const normalized = asString(value)?.toLowerCase();
  if (normalized === "evolution" || normalized === "training" || normalized === "incident") return normalized;
  return "rebalance";
};

const adaptWorkflow = (record: UnknownRecord, index: number): WorkflowTemplateRecord => ({
  id: asString(record.id, record.workflow_id, record.template_id) ?? `workflow-${index + 1}`,
  name: asString(record.name, record.title, record.workflow_name) ?? `Workflow ${index + 1}`,
  category: toWorkflowCategory(record.category ?? record.kind),
  steps: stringList(record.steps, record.step_ids),
  inputs: stringList(record.inputs, record.input_schema, record.input_keys),
  lastRun: asString(record.lastRun, record.last_run, record.last_run_at) ?? "",
  runs: asNumber(record.runs ?? record.run_count, 0),
  owner: asString(record.owner, record.created_by) ?? "pantheon-bff",
});

const adaptCron = (record: UnknownRecord, index: number): CronRecord => ({
  id: asString(record.id, record.cron_id, record.schedule_id) ?? `cron-${index + 1}`,
  name: asString(record.name, record.title) ?? `Cron ${index + 1}`,
  schedule: asString(record.schedule, record.cron, record.cron_expr) ?? "",
  target: asString(record.target, record.workflow_id, record.target_ref) ?? "",
  enabled: asBoolean(record.enabled, false),
  lastRun: asString(record.lastRun, record.last_run, record.last_run_at) ?? "",
  nextRun: asString(record.nextRun, record.next_run, record.next_run_at) ?? "",
});

const adaptHook = (record: UnknownRecord, index: number): HookRecord => ({
  id: asString(record.id, record.hook_id) ?? `hook-${index + 1}`,
  name: asString(record.name, record.title) ?? `Hook ${index + 1}`,
  event: asString(record.event, record.event_type) ?? "",
  target: asString(record.target, record.workflow_id, record.target_ref) ?? "",
  filters: asString(record.filters, record.filter, record.condition) ?? "",
  enabled: asBoolean(record.enabled, false),
  firedToday: asNumber(record.firedToday ?? record.fired_today, 0),
});

const toKnowledgeKind = (value: unknown): KnowledgeInsightRecord["kind"] => {
  const normalized = asString(value)?.toLowerCase();
  if (normalized === "signal_review" || normalized === "committee_memo" || normalized === "alert_observation") return normalized;
  return "research_note";
};

const toKnowledgeRisk = (value: unknown): KnowledgeInsightRecord["risk"] => {
  const normalized = asString(value)?.toLowerCase();
  return normalized === "high" || normalized === "medium" ? normalized : "low";
};

const adaptKnowledge = (record: UnknownRecord, index: number): KnowledgeInsightRecord => ({
  id: asString(record.id, record.insight_id, record.item_id) ?? `knowledge-${index + 1}`,
  title: asString(record.title, record.name, record.headline) ?? `Knowledge item ${index + 1}`,
  source: asString(record.source, record.source_ref, record.origin) ?? "pantheon-bff",
  kind: toKnowledgeKind(record.kind ?? record.knowledge_type),
  risk: toKnowledgeRisk(record.risk ?? record.risk_level),
  ts: asString(record.ts, record.created_at, record.updated_at, record.timestamp) ?? "",
  body: asString(record.body, record.summary, record.description, record.excerpt) ?? "",
});

const adaptLineageNode = (record: UnknownRecord, index: number): LineageNodeRecord => ({
  id: asString(record.id, record.node_id, record.artifact_id, record.ref) ?? `node-${index + 1}`,
  label: asString(record.label, record.name, record.title, record.id) ?? `Node ${index + 1}`,
  type: asString(record.type, record.kind, record.artifact_type, record.entity_type) ?? "Artifact",
  state: asString(record.state, record.status),
  risk: asString(record.risk, record.risk_level) as RiskLevel | undefined,
  highlight: asBoolean(record.highlight, false),
});

const adaptLineageEdge = (record: UnknownRecord): LineageEdgeRecord | undefined => {
  const from = asString(record.from, record.source, record.source_id, record.from_id, record.upstream);
  const to = asString(record.to, record.target, record.target_id, record.to_id, record.downstream);
  if (!from || !to) return undefined;
  return { from, to, label: asString(record.label, record.relation, record.kind, record.type) };
};

export const managementConsoleReads = {
  dataSources: () =>
    readRecords(paths.mgmtDataSources(), "data_sources", adaptDataSource),

  permissions: async () => {
    const envelope = await readRecords(paths.mgmtPermissions(), "permissions", adaptPermissionMatrix);
    return { ...envelope, items: mergePermissionMatrices(envelope.items) };
  },

  memoryGovernance: () =>
    readRecords(paths.mgmtMemoryGovernance(), "memory_governance", adaptMemoryUpdate),

  consultRules: () =>
    readRecords(paths.mgmtConsultRules(), "consult_rules", adaptConsultRule),

  lineage: (rootId?: string): Promise<LineageRead> =>
    withStrictLiveOrMock<LineageRead, unknown>(
      { method: "GET", path: paths.lineage(rootId) },
      async () => ({ nodes: [], edges: [], meta: envelopeMeta(undefined, "lineage") }),
      (raw) => {
        const root = asRecord(raw);
        const data = asRecord(root?.data);
        const nodes = recordsFrom(data?.nodes, root?.nodes, root?.items)
          .map(adaptLineageNode);
        const edges = recordsFrom(data?.edges, root?.edges)
          .map(adaptLineageEdge)
          .filter((edge): edge is LineageEdgeRecord => Boolean(edge));
        return { nodes, edges, meta: envelopeMeta(raw, "lineage") };
      },
    ),

  workflowTemplates: () =>
    readRecords(paths.workflowTemplates(), "workflows", adaptWorkflow),

  hookRegistry: (): Promise<HookRegistryRead> =>
    withStrictLiveOrMock<HookRegistryRead, unknown>(
      { method: "GET", path: paths.hookRegistry() },
      async () => ({ crons: [], hooks: [], meta: envelopeMeta(undefined, "hooks") }),
      (raw) => {
        const root = asRecord(raw);
        const data = asRecord(root?.data);
        const crons = recordsFrom(data?.crons, root?.crons)
          .map(adaptCron);
        const hooks = recordsFrom(data?.hooks, root?.hooks)
          .map(adaptHook);
        const mixed = envelopeRecords(raw);
        return {
          crons: crons.length ? crons : mixed.filter((item) => asString(item.kind, item.type) === "cron").map(adaptCron),
          hooks: hooks.length ? hooks : mixed.filter((item) => asString(item.kind, item.type) === "hook").map(adaptHook),
          meta: envelopeMeta(raw, "hooks"),
        };
      },
    ),

  knowledgeInbox: () =>
    readRecords(paths.knowledgeInbox(), "knowledge", adaptKnowledge),
};
