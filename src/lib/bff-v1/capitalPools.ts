import type { CapitalPool, LifecycleState, RiskLevel } from "@/lib/bff/types";

type UnknownRecord = Record<string, unknown>;

const RISK_LEVELS: readonly RiskLevel[] = ["info", "low", "medium", "high", "critical"];

const asRecord = (value: unknown): UnknownRecord | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : undefined;

const firstArray = <T>(...values: unknown[]): T[] => {
  for (const value of values) {
    if (Array.isArray(value)) return value as T[];
  }
  return [];
};

const asString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

const asNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
};

const asFraction = (...values: unknown[]): number | undefined => {
  const value = asNumber(...values);
  if (value === undefined) return undefined;
  return value > 1 ? value / 100 : value;
};

const normalizeState = (value: unknown): LifecycleState => {
  const status = String(value ?? "").trim().toLowerCase();
  if (["draft", "new"].includes(status)) return "draft";
  if (["review", "under_review", "rebalancing"].includes(status)) return "review";
  if (["approved"].includes(status)) return "approved";
  if (["paused", "frozen", "restricted", "suspended"].includes(status)) return "paused";
  if (["retired", "archived"].includes(status)) return "retired";
  return "deployed";
};

const normalizeRisk = (value: unknown, riskBudget: number): RiskLevel => {
  const risk = String(value ?? "").trim().toLowerCase() as RiskLevel;
  if (RISK_LEVELS.includes(risk)) return risk;
  if (riskBudget >= 0.08) return "critical";
  if (riskBudget >= 0.06) return "high";
  if (riskBudget >= 0.04) return "medium";
  return "low";
};

function unwrapDetailPayload(value: unknown): UnknownRecord | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const hasIdentity = record.id !== undefined || record.pool_id !== undefined || record.poolId !== undefined;
  const dataRecord = asRecord(record.data);
  return dataRecord && !hasIdentity ? dataRecord : record;
}

export function normalizeCapitalPool(value: unknown): CapitalPool | undefined {
  const record = unwrapDetailPayload(value);
  if (!record) return undefined;

  const params = asRecord(record.params);
  const poolId = asString(record.pool_id, record.poolId, record.capital_pool_id, record.capitalPoolId);
  const id = poolId ?? asString(record.id, record.ledger_id, record.ledgerId);
  if (!id) return undefined;

  const riskBudget = asFraction(
    record.riskBudget,
    record.risk_budget,
    record.riskBudgetPct,
    record.risk_budget_pct,
    record.maxDrawdownPct,
    record.max_drawdown_pct,
    params?.riskBudget,
    params?.risk_budget,
  ) ?? 0;

  const allocated = asNumber(
    record.allocated,
    record.capitalAllocation,
    record.capital_allocation,
    record.allocation,
    record.budget,
    record.nav,
    record.totalNav,
    record.total_nav,
    record.aum,
    params?.allocated,
    params?.budget,
  ) ?? 0;

  const utilizationRatio = asFraction(record.utilizationPct, record.utilization_pct, record.utilizationRate, record.utilization_rate);
  const utilization = asNumber(record.utilization);
  const utilized = asNumber(
    record.utilized,
    record.used,
    record.capitalUtilized,
    record.capital_utilized,
    record.usedBudget,
    record.used_budget,
    record.exposure,
    record.currentExposure,
    record.current_exposure,
    record.grossExposure,
    record.gross_exposure,
  ) ?? (utilizationRatio !== undefined
    ? allocated * utilizationRatio
    : utilization !== undefined && utilization <= 1 && allocated > 0
      ? allocated * utilization
      : utilization ?? 0);

  const bindings = firstArray<UnknownRecord>(
    record.bindings,
    record.persona_bindings,
    record.personaBindings,
    record.strategy_bindings,
    record.strategyBindings,
  );
  const bindingCount = asNumber(record.bindingCount, record.binding_count) ?? bindings.length;
  const riskPolicyRef = asString(record.riskPolicyRef, record.risk_policy_ref, record.policy_ref, record.policyRef);
  const status = asString(record.status, record.lifecycleStatus, record.lifecycle_status);

  return {
    ...record,
    id,
    poolId: poolId ?? id,
    pool_id: poolId ?? id,
    name: asString(record.name, record.display_name, record.displayName, id) ?? id,
    owner: asString(record.owner, record.owner_id, record.created_by, record.updated_by) ?? "capital",
    updatedAt: asString(record.updatedAt, record.updated_at, record.created_at, record.effective_at) ?? "",
    state: normalizeState(record.state ?? status),
    risk: normalizeRisk(record.risk, riskBudget),
    currency: asString(record.currency, params?.currency) ?? "USD",
    allocated,
    utilized,
    riskBudget,
    status,
    riskPolicyRef,
    risk_policy_ref: riskPolicyRef,
    bindings: bindings.length ? bindings : undefined,
    bindingCount,
    summary: asString(record.summary, record.description),
  } as CapitalPool;
}

export function normalizeCapitalPools(values: unknown[]): CapitalPool[] {
  return values
    .map((value) => normalizeCapitalPool(value))
    .filter((value): value is CapitalPool => Boolean(value));
}
