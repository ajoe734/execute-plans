// 2026-07-07 PPL-ALLOC-006 — Real allocation policy view-model.
//
// A "real allocation line" is the stage-aware target-weight output of the
// BFF policy engine (`POST /bff/management/allocation-policy/evaluate`).
// It never mutates a capital binding by itself; it is either shown as a
// non-persisted preview or folded into a rebalance proposal.

import type { PersonaLeagueRow } from "./personaLeague";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";

export type RealAllocationStage = "paper" | "canary" | "live" | string;

export interface RealAllocationLine {
  personaId: string;
  stage: RealAllocationStage;
  capitalScope?: string;
  capitalPoolId?: string;
  capitalSleeveId?: string;
  currentWeight: number;
  targetWeight: number;
  delta: number;
  rankScore?: number;
  capacityAdjustedScore?: number;
  recommendation?: string;
  capReasons: string[];
  exclusions: string[];
  evidenceRefs: string[];
  requiresHumanApproval: boolean;
}

/** Payload row shape the BFF `calculate_target_allocations` policy expects. */
export interface AllocationPolicyInputRow {
  persona_id: string;
  stage: string;
  tier?: string;
  capital_scope?: string;
  capital_pool_id?: string;
  capital_sleeve_id?: string;
  current_weight: number;
  pnl_score: number;
  sharpe_score: number;
  drawdown_control_score: number;
  execution_quality_score: number;
  risk_compliance_score: number;
  improvement_score: number;
  human_intervention_penalty: number;
  hard_penalty: number;
  evidence_refs: string[];
  hard_risk_breach?: boolean;
}

const REAL_ALLOCATION_STAGES = new Set(["canary", "live"]);

/** Only canary/live fleet rows compete for real capital; paper stays in Paper candidates. */
export function isRealAllocationStage(stage: string | undefined): boolean {
  return REAL_ALLOCATION_STAGES.has(String(stage ?? "").trim().toLowerCase());
}

export interface RealAllocationSourceRow {
  fleet: ManagementPersonaFleetRow;
  league?: PersonaLeagueRow;
}

/** Join Persona Fleet capital-binding rows with Persona League score rows by personaId. */
export function joinRealAllocationSourceRows(
  fleetRows: readonly ManagementPersonaFleetRow[],
  leagueRows: readonly PersonaLeagueRow[],
): RealAllocationSourceRow[] {
  const leagueById = new Map(leagueRows.map((row) => [row.personaId, row]));
  return fleetRows
    .filter((row) => isRealAllocationStage((row as { stage?: string }).stage ?? row.deploymentStage))
    .map((fleet) => ({ fleet, league: leagueById.get(fleet.personaId) }));
}

/** Build the BFF evaluate payload row from a joined fleet+league source row. */
export function buildAllocationPolicyRow(source: RealAllocationSourceRow): AllocationPolicyInputRow {
  const fleet = source.fleet as ManagementPersonaFleetRow & {
    stage?: string;
    capitalScope?: string;
    capitalScopeId?: string;
    currentWeight?: number;
  };
  const breakdown = source.league?.scoreBreakdown;
  return {
    persona_id: fleet.personaId,
    stage: String(fleet.stage ?? fleet.deploymentStage ?? "").trim().toLowerCase(),
    tier: source.league?.tier,
    capital_scope: fleet.capitalScope,
    // capitalScopeId is a generic id paired with capitalScope (paper ledger /
    // sleeve / pool / unbound) — only fold it into capital_pool_id when the
    // scope really is a pool; sleeve/ledger scopes already carry their own id
    // field and must not be duplicated under the wrong key.
    capital_pool_id: fleet.capitalPoolId ?? (fleet.capitalScope === "capital_pool" ? fleet.capitalScopeId : undefined),
    capital_sleeve_id: fleet.capitalSleeveId,
    current_weight: Number.isFinite(fleet.currentWeight) ? (fleet.currentWeight as number) : 0,
    pnl_score: breakdown?.pnlScore ?? 0,
    sharpe_score: breakdown?.sharpeScore ?? 0,
    drawdown_control_score: breakdown?.drawdownControlScore ?? 0,
    execution_quality_score: breakdown?.executionQualityScore ?? 0,
    risk_compliance_score: breakdown?.riskComplianceScore ?? 0,
    improvement_score: breakdown?.improvementScore ?? 0,
    human_intervention_penalty: breakdown?.interventionPenalty ?? 0,
    hard_penalty: breakdown?.hardPenalty ?? 0,
    evidence_refs: [],
    hard_risk_breach: (breakdown?.hardPenalty ?? 0) > 0,
  };
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

/** Normalize one raw `/bff/management/allocation-policy/evaluate` line into the FE view-model. */
export function adaptRealAllocationLine(raw: unknown): RealAllocationLine | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const personaId = asString(value.persona_id ?? value.personaId);
  if (!personaId) return null;
  return {
    personaId,
    stage: asString(value.stage) ?? "",
    capitalScope: asString(value.capital_scope ?? value.capitalScope),
    capitalPoolId: asString(value.capital_pool_id ?? value.capitalPoolId),
    capitalSleeveId: asString(value.capital_sleeve_id ?? value.capitalSleeveId),
    currentWeight: asNumber(value.current_weight ?? value.currentWeight),
    targetWeight: asNumber(value.target_weight ?? value.targetWeight),
    delta: asNumber(value.delta),
    rankScore: typeof value.rank_score === "number" ? value.rank_score : undefined,
    capacityAdjustedScore: typeof value.capacity_adjusted_score === "number" ? value.capacity_adjusted_score : undefined,
    recommendation: asString(value.recommendation),
    capReasons: asStringArray(value.cap_reasons ?? value.capReasons),
    exclusions: asStringArray(value.exclusions),
    evidenceRefs: asStringArray(value.evidence_refs ?? value.evidenceRefs),
    requiresHumanApproval: Boolean(value.requires_human_approval ?? value.requiresHumanApproval),
  };
}

export function adaptRealAllocationLines(raw: unknown): RealAllocationLine[] | null {
  const envelope = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
  const body = envelope && "data" in envelope && envelope.data && typeof envelope.data === "object"
    ? (envelope.data as Record<string, unknown>)
    : envelope;
  const lines = body?.lines;
  if (!Array.isArray(lines)) return null;
  return lines.map(adaptRealAllocationLine).filter((line): line is RealAllocationLine => line !== null);
}
