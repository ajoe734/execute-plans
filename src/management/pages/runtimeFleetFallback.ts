import { lists, mgmt, type ListEnvelope, type RuntimeListItem } from "@/lib/bff-v1";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";

export type FleetRuntimeRow = RuntimeListItem & {
  bindingId?: string;
  binding_id?: string;
  fleetDerived?: boolean;
  personaName?: string;
};

type RawFleetRuntimeRow = ManagementPersonaFleetRow & {
  runtime_id?: string | null;
  runtime_binding_id?: string | null;
  bindingId?: string | null;
  binding_id?: string | null;
  deployment_stage?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  state?: string | null;
  status?: string | null;
  runtime_binding?: {
    id?: string | null;
    runtimeId?: string | null;
    runtime_id?: string | null;
    state?: string | null;
    status?: string | null;
    deploymentStage?: string | null;
    deployment_stage?: string | null;
    health?: string | null;
  } | null;
  runtime_health?: Record<string, unknown> | null;
};

function usableText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "nan" || trimmed === "—" || trimmed.toLowerCase() === "not declared") return undefined;
  return trimmed;
}

function fleetRuntimeId(row: ManagementPersonaFleetRow): string | undefined {
  const raw = row as RawFleetRuntimeRow;
  return usableText(row.runtimeId)
    ?? usableText(raw.runtime_id)
    ?? usableText(row.runtimeBinding?.runtimeId)
    ?? usableText(raw.runtime_binding?.runtimeId)
    ?? usableText(raw.runtime_binding?.runtime_id);
}

function fleetBindingId(row: ManagementPersonaFleetRow): string | undefined {
  const raw = row as RawFleetRuntimeRow;
  return usableText(row.runtimeBindingId)
    ?? usableText(raw.runtime_binding_id)
    ?? usableText(raw.bindingId)
    ?? usableText(raw.binding_id)
    ?? usableText(row.runtimeBinding?.id)
    ?? usableText(raw.runtime_binding?.id);
}

function fleetDeploymentStage(row: ManagementPersonaFleetRow): string | undefined {
  const raw = row as RawFleetRuntimeRow;
  return usableText(row.deploymentStage)
    ?? usableText(raw.deployment_stage)
    ?? usableText(row.runtimeBinding?.deploymentStage)
    ?? usableText(raw.runtime_binding?.deploymentStage)
    ?? usableText(raw.runtime_binding?.deployment_stage);
}

function fleetRuntimeStatus(row: ManagementPersonaFleetRow): string {
  const raw = row as RawFleetRuntimeRow;
  const health = row.runtimeHealth ?? raw.runtime_health;
  return usableText(row.runtimeBinding?.state)
    ?? usableText(raw.runtime_binding?.state)
    ?? usableText(raw.runtime_binding?.status)
    ?? usableText(raw.runtime_binding?.health)
    ?? usableText(health?.status)
    ?? usableText(raw.state)
    ?? usableText(raw.status)
    ?? "declared";
}

function fleetUpdatedAt(row: ManagementPersonaFleetRow): string {
  const raw = row as RawFleetRuntimeRow;
  return usableText(raw.updatedAt) ?? usableText(raw.updated_at) ?? "";
}

function existingRuntimeKeys(rows: FleetRuntimeRow[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const value of [
      row.id,
      row.runtimeId,
      row.runtime_id,
      row.runtimeBindingId,
      row.runtime_binding_id,
      row.bindingId,
      row.binding_id,
    ] as unknown[]) {
      const text = usableText(value);
      if (text) keys.add(text);
    }
  }
  return keys;
}

function envFromStage(stage?: string): RuntimeListItem["env"] {
  if (stage === "live" || stage === "paper" || stage === "research") return stage;
  return "" as RuntimeListItem["env"];
}

function fleetRowToRuntime(row: ManagementPersonaFleetRow): FleetRuntimeRow | null {
  const runtimeId = fleetRuntimeId(row);
  const bindingId = fleetBindingId(row);
  if (!runtimeId && !bindingId) return null;
  const deploymentStage = fleetDeploymentStage(row);
  const id = runtimeId ?? bindingId ?? row.personaId;
  const kind = deploymentStage ?? "nan";
  return {
    id,
    name: runtimeId ?? bindingId ?? "nan",
    kind: kind as RuntimeListItem["kind"],
    runtimeKind: kind,
    runtime_kind: kind,
    env: envFromStage(deploymentStage),
    deploymentStage,
    deployment_stage: deploymentStage,
    status: fleetRuntimeStatus(row) as RuntimeListItem["status"],
    cpu: Number.NaN,
    memory: Number.NaN,
    latencyP95Ms: Number.NaN,
    uptimePct: Number.NaN,
    region: "",
    updatedAt: fleetUpdatedAt(row),
    runtimeId,
    runtime_id: runtimeId,
    runtimeBindingId: bindingId,
    runtime_binding_id: bindingId,
    personaId: row.personaId,
    persona_id: row.personaId,
    fleetDerived: true,
    personaName: usableText(row.personaName),
  };
}

export async function runtimesWithFleetFallback(): Promise<ListEnvelope<FleetRuntimeRow>> {
  const [runtimeEnv, fleetRows] = await Promise.all([
    lists.runtimes() as Promise<ListEnvelope<FleetRuntimeRow>>,
    mgmt.personaFleet.get().catch(() => [] as ManagementPersonaFleetRow[]),
  ]);
  const existingKeys = existingRuntimeKeys(runtimeEnv.items);
  const fallbackRows: FleetRuntimeRow[] = [];
  for (const fleetRow of fleetRows) {
    const row = fleetRowToRuntime(fleetRow);
    if (!row) continue;
    const runtimeId = usableText(row.runtimeId);
    const bindingId = usableText(row.runtimeBindingId);
    if ((runtimeId && existingKeys.has(runtimeId)) || (bindingId && existingKeys.has(bindingId))) continue;
    const key = runtimeId ?? bindingId;
    if (key) existingKeys.add(key);
    fallbackRows.push(row);
  }
  return {
    ...runtimeEnv,
    items: [...fallbackRows, ...runtimeEnv.items],
    pageSize: runtimeEnv.pageSize + fallbackRows.length,
    estimatedTotal: typeof runtimeEnv.estimatedTotal === "number" ? runtimeEnv.estimatedTotal + fallbackRows.length : runtimeEnv.estimatedTotal,
  };
}
