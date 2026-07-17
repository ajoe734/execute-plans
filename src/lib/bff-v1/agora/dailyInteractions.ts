import { bffFetch } from "../client";
import { BffError, makeBffError } from "../errors";
import { paths } from "../paths";
import { liveWriteGated } from "../writeGate";

export type DailyInteractionMode = "ask" | "challenge" | "compare" | "propose_action" | "reflect";
export type DailyInteractionStatus = "queued" | "running" | "completed" | "degraded" | "failed";

export interface AuthorityBoundary {
  execution_authority: "none";
  order_submitted: false;
  broker_called: false;
  capital_changed: false;
  runtime_bound: false;
  lifecycle_promoted: false;
  policy_mutated: false;
  persona_memory_mutated: false;
}

export interface EvidenceRef {
  ref_type: string;
  ref_id: string;
  version?: string | null;
  observed_at: string;
  data_cutoff: string;
  freshness: "fresh" | "stale" | "unknown";
  summary?: string | null;
}

export interface ParticipantSnapshot {
  persona_id: string;
  persona_version: string;
  session_persona_id: string;
  display_name?: string | null;
  provider_agent_id: string;
  workspace_id: string;
  environment_ceiling: "analysis" | "research" | "shadow" | "paper";
  capability_snapshot: string[];
  captured_at: string;
}

export interface RecommendedMeasure {
  measure_id: string;
  measure_type: string;
  target: { kind: string; id: string; version: string; path?: string | null };
  current_value?: unknown;
  proposed_value: unknown;
  rationale: string;
  expected_benefit: string;
  adverse_scenarios: string[];
  confidence: number;
  evidence_refs: EvidenceRef[];
  environment_ceiling: "analysis" | "research" | "shadow" | "paper";
  validation_plan: { validator: string; required_checks: string[] };
  rollback_trigger: string;
  rollback_action: string;
  authority: AuthorityBoundary;
}

export interface TypedPersonaOpinion {
  opinion_id: string;
  interaction_id: string;
  participant: ParticipantSnapshot;
  provider_invocation_id: string;
  conclusion: "support" | "oppose" | "conditional" | "abstain" | "insufficient_evidence";
  rationale: string;
  confidence: number;
  uncertainty: string[];
  risks: string[];
  invalidation_conditions: string[];
  evidence_refs: EvidenceRef[];
  recommended_measures: RecommendedMeasure[];
  provenance: {
    content_origin: "selected_persona_provider_response";
    provider_kind: "openclaw";
    provider_invocation_id: string;
    request_correlated: true;
    response_correlated: true;
    canned_template: false;
    magic_topic_trigger: false;
    simulation: false;
  };
  created_at: string;
  authority: AuthorityBoundary;
}

export interface DailyInteraction {
  interaction_id: string;
  workshop_id: string;
  status: DailyInteractionStatus;
  human_request: {
    request_id: string;
    operator_id: string;
    mode: DailyInteractionMode;
    request_text: string;
    submitted_at: string;
    request_sha256: string;
  };
  context_snapshot: {
    tenant_id: string;
    source_route: string;
    focused_object: { kind: string; id: string; version?: string | null };
    context_refs: Array<{ kind: string; id: string; version?: string | null }>;
    strategy_ref?: { strategy_id: string; version_id: string } | null;
    decision_ref?: string | null;
    journal_ref?: string | null;
    position_risk_snapshot_refs?: string[];
    evidence_cutoff: string;
    selected_persona_ids: string[];
    initial_mode: DailyInteractionMode;
    return_route: string;
    captured_at: string;
  };
  participants: ParticipantSnapshot[];
  provider_invocations: Array<{
    invocation_id: string;
    participant: ParticipantSnapshot;
    status: "queued" | "running" | "succeeded" | "failed";
    request_correlation_id: string;
    response_correlation_id?: string | null;
    error?: { code: string; message: string; retryable: boolean } | null;
    started_at: string;
    completed_at?: string | null;
  }>;
  opinions: TypedPersonaOpinion[];
  synthesis?: {
    synthesis_id: string;
    status: "recommendation" | "options" | "no_consensus" | "more_research_required" | "degraded";
    opinion_ids: string[];
    summary: string;
    agreements: string[];
    disagreements: Array<{ opinion_ids: string[]; cause: string; detail: string }>;
    risk_notes: string[];
    conditions: string[];
    evidence_refs: EvidenceRef[];
    created_at: string;
    authority: AuthorityBoundary;
  } | null;
  missing_participant_ids: string[];
  degraded_participant_ids: string[];
  candidate_proposal_links: Array<{
    proposal_id: string;
    revision: number;
    proposal_digest: string;
    measure_id: string;
  }>;
  audit_refs: string[];
  created_at: string;
  updated_at: string;
  authority: AuthorityBoundary;
}

export interface DailyInteractionSubmitRequest {
  workshop_id: string;
  interaction_id?: string | null;
  human_request: DailyInteraction["human_request"];
  context_snapshot: DailyInteraction["context_snapshot"];
  participants: ParticipantSnapshot[];
}

export type CandidateDecisionAction = "modify" | "accept_for_review" | "reject" | "defer" | "cancel";
export interface CandidateDecisionRecord {
  decision_id: string;
  proposal_id: string;
  interaction_id: string;
  measure_id: string;
  action: "modified" | "accepted_for_review" | "rejected" | "deferred" | "cancelled";
  actor_id: string;
  reason: string;
  revision: number;
  proposal_digest: string;
  review_request_id?: string | null;
  decided_at: string;
  formal_approval: false;
  execution_authority: "none";
  audit_ref: string;
}

export interface ValidationReceipt {
  validation_receipt_id: string;
  authority: "canonical_validation_service";
  tenant_id: string;
  proposal_id: string;
  revision: number;
  proposal_digest: string;
  outcome: "passed" | "failed" | "inconclusive";
  evidence_refs: string[];
  validated_at: string;
  expires_at: string;
  receipt_sha256: string;
}

export class DailyInteractionUnsupportedError extends Error {
  constructor(message = "The daily Persona interaction runtime is not available on this BFF version.") {
    super(message);
    this.name = "DailyInteractionUnsupportedError";
  }
}

function unsupported(error: unknown): never {
  if (error instanceof BffError && [404, 405, 501].includes(error.status)) {
    throw new DailyInteractionUnsupportedError();
  }
  throw error;
}

function dataOf<T>(value: unknown): T {
  if (!value || typeof value !== "object" || !("data" in value)) {
    throw makeBffError({ code: "BACKEND_UNAVAILABLE", message: "Daily interaction response omitted data." });
  }
  return (value as { data: T }).data;
}

function assertAuthorityBoundary(a: AuthorityBoundary | null | undefined): void {
  if (!a || a.execution_authority !== "none" || a.order_submitted || a.broker_called || a.capital_changed
    || a.runtime_bound || a.lifecycle_promoted || a.policy_mutated || a.persona_memory_mutated) {
    throw makeBffError({ code: "VALIDATION_FAILED", message: "Daily interaction violated the advisory-only authority boundary." });
  }
}

function assertInteraction(resource: DailyInteraction): void {
  assertAuthorityBoundary(resource.authority);
  if (!Array.isArray(resource.opinions) || !Array.isArray(resource.provider_invocations)
    || !Array.isArray(resource.participants) || !Array.isArray(resource.candidate_proposal_links)) {
    throw makeBffError({ code: "BACKEND_UNAVAILABLE", message: "Daily interaction readback omitted required lifecycle arrays." });
  }
  const invocationIds = new Set(resource.provider_invocations.map((item) => item.invocation_id));
  const opinionIds = new Set<string>();
  const opinionPersonas = new Set<string>();
  for (const opinion of resource.opinions) {
    assertAuthorityBoundary(opinion.authority);
    const provenance = opinion.provenance;
    if (!provenance || provenance.content_origin !== "selected_persona_provider_response"
      || provenance.provider_kind !== "openclaw" || !provenance.request_correlated || !provenance.response_correlated
      || provenance.canned_template || provenance.magic_topic_trigger || provenance.simulation
      || provenance.provider_invocation_id !== opinion.provider_invocation_id
      || !invocationIds.has(opinion.provider_invocation_id)) {
      throw makeBffError({ code: "VALIDATION_FAILED", message: "Persona opinion omitted valid selected-provider provenance." });
    }
    if (opinionIds.has(opinion.opinion_id) || opinionPersonas.has(opinion.participant.persona_id)) {
      throw makeBffError({ code: "VALIDATION_FAILED", message: "Persona opinions were not independently attributed." });
    }
    opinionIds.add(opinion.opinion_id);
    opinionPersonas.add(opinion.participant.persona_id);
    opinion.recommended_measures.forEach((measure) => assertAuthorityBoundary(measure.authority));
  }
  if (resource.synthesis) {
    assertAuthorityBoundary(resource.synthesis.authority);
    if (!resource.synthesis.opinion_ids.every((id) => opinionIds.has(id))) {
      throw makeBffError({ code: "VALIDATION_FAILED", message: "Synthesis referenced an opinion outside authoritative readback." });
    }
  }
}

export async function listDailyInteractions(workshopId?: string): Promise<DailyInteraction[]> {
  try {
    const raw = await bffFetch<unknown>({ method: "GET", path: paths.agoraDailyInteractions(), query: { page_size: 100 } });
    const data = dataOf<{ items: DailyInteraction[] }>(raw);
    if (!Array.isArray(data.items)) throw makeBffError({ code: "BACKEND_UNAVAILABLE", message: "Daily interaction list omitted items." });
    data.items.forEach(assertInteraction);
    return workshopId ? data.items.filter((item) => item.workshop_id === workshopId) : data.items;
  } catch (error) {
    return unsupported(error);
  }
}

export async function getDailyInteraction(interactionId: string): Promise<DailyInteraction> {
  try {
    const value = dataOf<DailyInteraction>(await bffFetch<unknown>({ method: "GET", path: paths.agoraDailyInteraction(interactionId) }));
    assertInteraction(value);
    return value;
  } catch (error) {
    return unsupported(error);
  }
}

async function requireWrite(): Promise<void> {
  if (await liveWriteGated()) return;
  throw makeBffError({ code: "PERMISSION_DENIED", message: "Daily Persona writes are disabled by deployment or session policy." });
}

export async function submitDailyInteraction(body: DailyInteractionSubmitRequest): Promise<DailyInteraction> {
  await requireWrite();
  try {
    const value = dataOf<DailyInteraction>(await bffFetch<unknown>({
      method: "POST", path: paths.agoraDailyInteractions(), body,
      idempotencyKey: `pint15-submit-${body.human_request.request_id}`,
    }));
    assertInteraction(value);
    return value;
  } catch (error) {
    return unsupported(error);
  }
}

export async function createCandidateFromMeasure(input: {
  interactionId: string; opinionId: string; measureId: string; measureSha256: string;
}): Promise<unknown> {
  await requireWrite();
  try {
    return await bffFetch({
      method: "POST",
      path: paths.agoraInteractionMeasureCandidates(input.interactionId, input.measureId),
      idempotencyKey: `pint15-candidate-${input.interactionId}-${input.measureId}`,
      body: {
        interaction_id: input.interactionId,
        opinion_id: input.opinionId,
        measure_id: input.measureId,
        expected_measure_sha256: input.measureSha256,
      },
    });
  } catch (error) {
    return unsupported(error);
  }
}

export async function decideCandidate(input: {
  proposalId: string; action: CandidateDecisionAction; reason: string; revision: number; proposalDigest: string;
  proposedValue?: unknown;
}): Promise<CandidateDecisionRecord> {
  await requireWrite();
  try {
    const decision = dataOf<CandidateDecisionRecord>(await bffFetch({
      method: "POST", path: paths.agoraCandidateDecisions(input.proposalId),
      ifMatchVersion: input.proposalDigest,
      body: {
        action: input.action,
        reason: input.reason,
        expected_revision: input.revision,
        expected_proposal_digest: input.proposalDigest,
        ...(input.action === "modify" ? { proposed_value: input.proposedValue } : {}),
      },
    }));
    if (decision.formal_approval !== false || decision.execution_authority !== "none") {
      throw makeBffError({ code: "VALIDATION_FAILED", message: "Candidate decision was incorrectly represented as approval or execution." });
    }
    return decision;
  } catch (error) {
    return unsupported(error);
  }
}

export async function listCandidateDecisions(proposalId: string): Promise<CandidateDecisionRecord[]> {
  try {
    const items = dataOf<{ items: CandidateDecisionRecord[] }>(await bffFetch({
      method: "GET", path: paths.agoraCandidateDecisions(proposalId),
    })).items;
    if (!items.every((item) => item.formal_approval === false && item.execution_authority === "none")) {
      throw makeBffError({ code: "VALIDATION_FAILED", message: "Candidate decision readback crossed the non-execution boundary." });
    }
    return items;
  } catch (error) {
    return unsupported(error);
  }
}

export async function requestAuthoritativeValidation(input: {
  proposalId: string; revision: number; proposalDigest: string; validationPlanRef: string;
}): Promise<ValidationReceipt> {
  await requireWrite();
  try {
    const receipt = dataOf<ValidationReceipt>(await bffFetch({
      method: "POST", path: paths.agoraCandidateValidations(input.proposalId),
      ifMatchVersion: input.proposalDigest,
      body: {
        proposal_id: input.proposalId,
        revision: input.revision,
        proposal_digest: input.proposalDigest,
        validation_plan_ref: input.validationPlanRef,
      },
    }));
    if (receipt.authority !== "canonical_validation_service") {
      throw makeBffError({ code: "VALIDATION_FAILED", message: "Validation receipt did not come from the canonical authority." });
    }
    return receipt;
  } catch (error) {
    return unsupported(error);
  }
}
