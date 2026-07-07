import { lists, mgmt, type ListEnvelope } from "@/lib/bff-v1";
import type { CapitalPool } from "@/lib/bff/types";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";

export type FleetCapitalPoolBinding = {
  personaId: string;
  personaName: string;
  capitalMode?: string;
  paperLedgerId?: string;
  paperCapitalPoolId?: string;
  capitalPoolId?: string;
  runtimeId?: string;
  state?: string;
};

export type FleetCapitalPool = CapitalPool & {
  personaCount?: number;
  personaNames?: string;
  personaBindings?: FleetCapitalPoolBinding[];
  bindingSummary?: string;
  bindingDetail?: string;
  capitalScope?: string;
  fleetDerived?: boolean;
};

type RawFleetCapitalRow = ManagementPersonaFleetRow & {
  capital_pool_id?: string | null;
  capitalPoolId?: string | null;
  paper_capital_pool_id?: string | null;
  paperCapitalPoolId?: string | null;
  legacy_paper_capital_pool_id?: string | null;
  legacyPaperCapitalPoolId?: string | null;
  paper_ledger_id?: string | null;
  paperLedgerId?: string | null;
  capital_mode?: string | null;
  capital_scope?: string | null;
  updated_at?: string | null;
  name?: string | null;
  owner?: string | null;
  health?: string | null;
  status?: string | null;
  runtime_id?: string | null;
  paper_ledger?: { id?: string | null } | null;
  paperLedger?: { id?: string | null } | null;
  capital_pool?: { id?: string | null; mode?: string | null } | null;
  capitalPool?: { id?: string | null; mode?: string | null } | null;
};

function usableText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "nan" || trimmed === "—" || trimmed.toLowerCase() === "not declared") return undefined;
  return trimmed;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function lookupKey(value: unknown): string | undefined {
  const text = usableText(value);
  return text?.toLowerCase().replace(/\s+/g, " ");
}

function lookupKeys(values: Array<string | undefined>): string[] {
  return uniqueStrings(values.map(lookupKey));
}

function declaredCapitalPoolId(row: ManagementPersonaFleetRow): string | undefined {
  const raw = row as RawFleetCapitalRow;
  return usableText(row.capitalPoolId)
    ?? usableText(raw.capitalPoolId)
    ?? usableText(raw.capital_pool_id)
    ?? usableText(row.capitalPool?.id)
    ?? usableText(raw.capitalPool?.id)
    ?? usableText(raw.capital_pool?.id);
}

function explicitCapitalMode(row: ManagementPersonaFleetRow): string | undefined {
  const raw = row as RawFleetCapitalRow;
  const mode = usableText(row.capitalMode)
    ?? usableText(raw.capital_mode)
    ?? usableText(row.capitalPool?.mode)
    ?? usableText(raw.capitalPool?.mode)
    ?? usableText(raw.capital_pool?.mode)
    ?? usableText(raw.capital_scope);
  return mode?.toLowerCase();
}

function fleetPaperLedgerId(row: ManagementPersonaFleetRow): string | undefined {
  const raw = row as RawFleetCapitalRow;
  return usableText(row.paperLedgerId)
    ?? usableText(raw.paperLedgerId)
    ?? usableText(raw.paper_ledger_id)
    ?? usableText(row.paperLedger?.id)
    ?? usableText(raw.paperLedger?.id)
    ?? usableText(raw.paper_ledger?.id);
}

function isPaperFleetRow(row: ManagementPersonaFleetRow): boolean {
  const mode = explicitCapitalMode(row);
  if (mode === "paper" || mode === "paper_running" || mode === "paper_challenger") return true;
  if (mode === "live" || mode === "canary") return false;
  return Boolean(fleetPaperLedgerId(row));
}

function fleetPaperCapitalPoolId(row: ManagementPersonaFleetRow): string | undefined {
  const raw = row as RawFleetCapitalRow;
  return usableText(row.paperCapitalPoolId)
    ?? usableText(raw.paperCapitalPoolId)
    ?? usableText(raw.paper_capital_pool_id)
    ?? usableText(raw.legacyPaperCapitalPoolId)
    ?? usableText(raw.legacy_paper_capital_pool_id)
    ?? (isPaperFleetRow(row) ? declaredCapitalPoolId(row) : undefined);
}

function fleetLiveCapitalPoolId(row: ManagementPersonaFleetRow): string | undefined {
  const raw = row as RawFleetCapitalRow & {
    targetCapitalPoolId?: string | null;
    target_capital_pool_id?: string | null;
    liveCapitalPoolId?: string | null;
    live_capital_pool_id?: string | null;
  };
  if (!isPaperFleetRow(row)) return declaredCapitalPoolId(row);
  return usableText(raw.targetCapitalPoolId)
    ?? usableText(raw.target_capital_pool_id)
    ?? usableText(raw.liveCapitalPoolId)
    ?? usableText(raw.live_capital_pool_id);
}

function fleetPrimaryPoolId(row: ManagementPersonaFleetRow): string | undefined {
  if (isPaperFleetRow(row)) {
    return fleetPaperCapitalPoolId(row) ?? fleetPaperLedgerId(row);
  }
  return fleetLiveCapitalPoolId(row);
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
  if (owners.length === 0) return "unassigned";
  return owners.length === 1 ? owners[0] : `${owners[0]} + ${owners.length - 1}`;
}

function personaName(row: ManagementPersonaFleetRow): string {
  const raw = row as RawFleetCapitalRow;
  return usableText(row.personaName) ?? usableText(raw.name) ?? row.personaId;
}

function fleetCapitalMode(row: ManagementPersonaFleetRow): string {
  return explicitCapitalMode(row) ?? (isPaperFleetRow(row) ? "paper" : "capital");
}

function fleetBinding(row: ManagementPersonaFleetRow): FleetCapitalPoolBinding {
  const raw = row as RawFleetCapitalRow;
  return {
    personaId: row.personaId,
    personaName: personaName(row),
    capitalMode: fleetCapitalMode(row),
    paperLedgerId: fleetPaperLedgerId(row),
    paperCapitalPoolId: fleetPaperCapitalPoolId(row),
    capitalPoolId: fleetLiveCapitalPoolId(row),
    runtimeId: usableText(row.runtimeId) ?? usableText(raw.runtime_id),
    state: usableText(row.state) ?? usableText(raw.status),
  };
}

function bindingNames(bindings: FleetCapitalPoolBinding[]): string {
  return bindings.map((binding) => binding.personaName).join(", ");
}

function fleetNameLookupIds(row: ManagementPersonaFleetRow): string[] {
  const name = personaName(row);
  if (!name) return [];
  if (isPaperFleetRow(row)) {
    return [
      `${name} paper pool`,
      `${name} paper capital pool`,
    ];
  }
  return [
    `${name} capital pool`,
    `${name} live capital pool`,
  ];
}

export function capitalPoolBindingSummary(pool: FleetCapitalPool): string {
  const bindings = pool.personaBindings ?? [];
  if (bindings.length === 0) return "Unbound";
  const first = bindings[0]?.personaName ?? "Persona";
  return bindings.length === 1 ? first : `${first} + ${bindings.length - 1} more`;
}

export function capitalPoolBindingDetail(pool: FleetCapitalPool): string {
  const bindings = pool.personaBindings ?? [];
  if (bindings.length === 0) return "No persona binding declared";
  return bindings.map((binding) => {
    const mode = binding.capitalMode ?? "capital";
    const refs = uniqueStrings([
      binding.paperLedgerId ? `ledger ${binding.paperLedgerId}` : undefined,
      binding.paperCapitalPoolId ? `paper pool ${binding.paperCapitalPoolId}` : undefined,
      binding.capitalPoolId ? `pool ${binding.capitalPoolId}` : undefined,
      binding.runtimeId ? `runtime ${binding.runtimeId}` : undefined,
    ]);
    return `${binding.personaName} (${mode}${refs.length ? `; ${refs.join("; ")}` : ""})`;
  }).join(" | ");
}

function poolLookupIds(pool: FleetCapitalPool): string[] {
  const raw = pool as FleetCapitalPool & {
    pool_id?: string | null;
    capital_pool_id?: string | null;
    capitalPoolId?: string | null;
    paper_ledger_id?: string | null;
    paperLedgerId?: string | null;
  };
  return uniqueStrings([
    usableText(pool.id),
    usableText(pool.name),
    usableText(raw.pool_id),
    usableText(raw.capital_pool_id),
    usableText(raw.capitalPoolId),
    usableText(raw.paperLedgerId),
    usableText(raw.paper_ledger_id),
  ]);
}

function poolLookupKeys(pool: FleetCapitalPool): string[] {
  return lookupKeys(poolLookupIds(pool));
}

/**
 * Focus matcher for the capital pool list. A pool is deep-linked from the persona fleet by any
 * of its ids OR by a bound persona's ledger / pool / persona id (see personaFleetCapitalHref,
 * which falls back to the persona's `paper_ledger_id` when no capital pool id is declared).
 * Matching only on `pool.id` would miss those links and show the "no matching row" banner, so we
 * also resolve the focus id against every enriched binding's alias ids.
 */
export function capitalPoolMatchesFocus(pool: FleetCapitalPool, focusId: string): boolean {
  const target = lookupKey(focusId);
  if (!target) return false;
  const keys = new Set<string>(poolLookupKeys(pool));
  for (const binding of pool.personaBindings ?? []) {
    for (const key of lookupKeys([
      binding.paperLedgerId,
      binding.paperCapitalPoolId,
      binding.capitalPoolId,
      binding.personaId,
    ])) {
      keys.add(key);
    }
  }
  return keys.has(target);
}

function fleetLookupKeys(row: ManagementPersonaFleetRow): string[] {
  return lookupKeys([
    fleetPrimaryPoolId(row),
    fleetPaperCapitalPoolId(row),
    fleetPaperLedgerId(row),
    fleetLiveCapitalPoolId(row),
    ...fleetNameLookupIds(row),
  ]);
}

function poolCapitalScope(pool: FleetCapitalPool, rows: ManagementPersonaFleetRow[]): string | undefined {
  const raw = pool as FleetCapitalPool & {
    capital_scope?: string | null;
    capitalScope?: string | null;
    scope?: string | null;
    live_capital_enabled?: boolean | null;
    liveCapitalEnabled?: boolean | null;
  };
  return usableText(raw.capitalScope)
    ?? usableText(raw.capital_scope)
    ?? usableText(raw.scope)
    ?? (raw.liveCapitalEnabled || raw.live_capital_enabled ? "live" : undefined)
    ?? (/paper/i.test(`${pool.id} ${pool.name}`) ? "paper" : undefined)
    ?? (/canary/i.test(`${pool.id} ${pool.name}`) ? "canary" : undefined)
    ?? (/live/i.test(`${pool.id} ${pool.name}`) ? "live" : undefined)
    ?? (rows.some(isPaperFleetRow) ? "paper" : undefined);
}

function enrichPool(pool: FleetCapitalPool, rows: ManagementPersonaFleetRow[]): FleetCapitalPool {
  const bindings = rows.map(fleetBinding).sort((a, b) => a.personaName.localeCompare(b.personaName));
  const enriched: FleetCapitalPool = {
    ...pool,
    personaCount: bindings.length,
    personaNames: bindingNames(bindings),
    personaBindings: bindings,
    capitalScope: poolCapitalScope(pool, rows),
  };
  return {
    ...enriched,
    bindingSummary: capitalPoolBindingSummary(enriched),
    bindingDetail: capitalPoolBindingDetail(enriched),
  };
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
  const fleetPoolsByPrimaryId = new Map<string, ManagementPersonaFleetRow[]>();
  const fleetRowsByLookupKey = new Map<string, ManagementPersonaFleetRow[]>();
  for (const row of fleetRows) {
    const poolId = fleetPrimaryPoolId(row);
    if (!poolId) continue;
    const rows = fleetPoolsByPrimaryId.get(poolId) ?? [];
    rows.push(row);
    fleetPoolsByPrimaryId.set(poolId, rows);
    for (const key of fleetLookupKeys(row)) {
      const keyedRows = fleetRowsByLookupKey.get(key) ?? [];
      keyedRows.push(row);
      fleetRowsByLookupKey.set(key, keyedRows);
    }
  }
  const matchedPersonaIds = new Set<string>();
  const enrichedCapitalItems: FleetCapitalPool[] = capitalEnv.items.map((pool) => {
    const rows = poolLookupKeys(pool).flatMap((key) => fleetRowsByLookupKey.get(key) ?? []);
    const uniqueRows = Array.from(new Map(rows.map((row) => [row.personaId, row])).values());
    uniqueRows.forEach((row) => matchedPersonaIds.add(row.personaId));
    return enrichPool(pool, uniqueRows);
  });
  const fallbackPools: FleetCapitalPool[] = Array.from(fleetPoolsByPrimaryId.entries())
    .map(([poolId, rows]) => [poolId, rows.filter((row) => !matchedPersonaIds.has(row.personaId))] as const)
    .filter(([, rows]) => rows.length > 0)
    .map(([poolId, rows]) => {
      const first = rows[0];
      const scope = rows.every(isPaperFleetRow) ? "paper" : "capital";
      const ledgerOnly = Boolean(first && poolId === fleetPaperLedgerId(first) && !fleetPaperCapitalPoolId(first));
      return enrichPool({
        id: poolId,
        name: first && rows.length === 1 && !ledgerOnly
          ? `${personaName(first)} ${scope === "paper" ? "paper capital" : "capital"} pool`
          : `${poolId} · ${rows.length} ${rows.length === 1 ? "persona" : "personas"}`,
        owner: ownerSummary(rows),
        updatedAt: latestIso(rows),
        state: "approved",
        risk: poolRisk(rows),
        currency: poolCurrency(poolId),
        allocated: Number.NaN,
        utilized: Number.NaN,
        riskBudget: Number.NaN,
        capitalScope: scope,
        fleetDerived: true,
      }, rows);
    });
  const items = [...fallbackPools, ...enrichedCapitalItems];
  return {
    ...capitalEnv,
    items,
    pageSize: items.length,
    estimatedTotal: typeof capitalEnv.estimatedTotal === "number" ? capitalEnv.estimatedTotal + fallbackPools.length : capitalEnv.estimatedTotal,
  };
}
