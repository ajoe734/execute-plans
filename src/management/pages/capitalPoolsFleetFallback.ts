import { lists, mgmt, type ListEnvelope } from "@/lib/bff-v1";
import type { CapitalPool } from "@/lib/bff/types";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";

export type FleetCapitalPool = CapitalPool & {
  personaCount?: number;
  personaNames?: string;
  fleetDerived?: boolean;
};

type RawFleetCapitalRow = ManagementPersonaFleetRow & {
  capital_pool_id?: string | null;
  capitalPoolId?: string | null;
  updated_at?: string | null;
  name?: string | null;
  owner?: string | null;
  health?: string | null;
  status?: string | null;
};

function usableText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "nan" || trimmed === "—" || trimmed.toLowerCase() === "not declared") return undefined;
  return trimmed;
}

function fleetCapitalPoolId(row: ManagementPersonaFleetRow): string | undefined {
  const raw = row as RawFleetCapitalRow;
  return usableText(row.capitalPoolId) ?? usableText(raw.capital_pool_id) ?? usableText(raw.capitalPoolId);
}

function fleetRowUpdatedAt(row: ManagementPersonaFleetRow): string {
  const raw = row as RawFleetCapitalRow;
  return usableText(row.updatedAt) ?? usableText(raw.updated_at) ?? "";
}

function latestIso(rows: ManagementPersonaFleetRow[]): string {
  return rows
    .map(fleetRowUpdatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? "";
}

function ownerSummary(rows: ManagementPersonaFleetRow[]): string {
  const owners = Array.from(new Set(rows.map((row) => usableText((row as RawFleetCapitalRow).owner)).filter(Boolean)));
  if (owners.length === 0) return "nan";
  return owners.length === 1 ? owners[0] : `${owners[0]} + ${owners.length - 1}`;
}

function poolCurrency(poolId: string): CapitalPool["currency"] {
  const lower = poolId.toLowerCase();
  if (lower.includes("tw")) return "TWD";
  if (lower.includes("crypto")) return "USDT";
  return "USD";
}

function poolRisk(rows: ManagementPersonaFleetRow[]): CapitalPool["risk"] {
  return rows.some((row) => {
    const raw = row as RawFleetCapitalRow;
    const health = usableText(row.health) ?? usableText(raw.health) ?? usableText(raw.status);
    return health && health !== "healthy";
  }) ? "medium" : "low";
}

export async function capitalPoolsWithFleetFallback(): Promise<ListEnvelope<FleetCapitalPool>> {
  const [capitalEnv, fleetRows] = await Promise.all([
    lists.capitalPools() as Promise<ListEnvelope<FleetCapitalPool>>,
    mgmt.personaFleet.get().catch(() => [] as ManagementPersonaFleetRow[]),
  ]);
  const existingIds = new Set(capitalEnv.items.map((pool) => pool.id));
  const fleetPools = new Map<string, ManagementPersonaFleetRow[]>();
  for (const row of fleetRows) {
    const poolId = fleetCapitalPoolId(row);
    if (!poolId || existingIds.has(poolId)) continue;
    const rows = fleetPools.get(poolId) ?? [];
    rows.push(row);
    fleetPools.set(poolId, rows);
  }
  const fallbackPools: FleetCapitalPool[] = Array.from(fleetPools.entries()).map(([poolId, rows]) => ({
    id: poolId,
    name: `${poolId} · ${rows.length} ${rows.length === 1 ? "persona" : "personas"}`,
    owner: ownerSummary(rows),
    updatedAt: latestIso(rows),
    state: "approved",
    risk: poolRisk(rows),
    currency: poolCurrency(poolId),
    allocated: Number.NaN,
    utilized: Number.NaN,
    riskBudget: Number.NaN,
    personaCount: rows.length,
    personaNames: rows.map((row) => usableText(row.personaName) ?? usableText((row as RawFleetCapitalRow).name) ?? row.personaId).filter(Boolean).join(", "),
    fleetDerived: true,
  }));
  return {
    ...capitalEnv,
    items: [...fallbackPools, ...capitalEnv.items],
    pageSize: capitalEnv.pageSize + fallbackPools.length,
    estimatedTotal: typeof capitalEnv.estimatedTotal === "number" ? capitalEnv.estimatedTotal + fallbackPools.length : capitalEnv.estimatedTotal,
  };
}
