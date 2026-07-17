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
  /** Server-authored digest of the persisted provider measure; never computed in the browser. */
  measure_sha256: string;
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
    interaction_id: string;
    opinion_id: string;
    opinion_sha256: string;
    revision: number;
    proposal_digest: string;
    measure_id: string;
    measure_sha256: string;
    state: CandidateState;
    created_at: string;
    execution_authority: "none";
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

interface DailyInteractionListEnvelope {
  data: DailyInteraction[];
  meta?: { next_page_token?: string | null } & Record<string, unknown>;
}

export type CandidateDecisionAction = "modify" | "accept_for_review" | "reject" | "defer" | "cancel";
export interface CandidateDecisionRecord {
  decision_id: string;
  proposal_id: string;
  interaction_id: string;
  opinion_id: string;
  opinion_sha256: string;
  measure_id: string;
  measure_sha256: string;
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

export type CandidateState = "draft" | "review_requested" | "deferred" | "rejected" | "cancelled" | "approved";

export interface CandidateRecord {
  proposal_id: string;
  revision: number;
  state: CandidateState;
  proposer_id: string;
  interaction_id: string;
  opinion_id: string;
  opinion_sha256: string;
  measure_id: string;
  measure_sha256: string;
  proposal_digest: string;
  proposal_type: string;
  target_kind: string;
  target_id: string;
  target_version: string;
  target_path?: string | null;
  current_value?: unknown;
  proposed_value: unknown;
  rationale: string;
  evidence_refs: EvidenceRef[];
  environment_ceiling: "analysis" | "research" | "shadow" | "paper";
  validation_plan: { validator: string; required_checks: string[] };
  created_at: string;
  updated_at: string;
  expires_at: string;
  execution_authority: "none";
  authority: AuthorityBoundary;
  audit: Array<Record<string, unknown>>;
}

export interface CandidateReadiness {
  candidate: {
    ready: boolean;
    reason?: string | null;
    allowed_actions: CandidateDecisionAction[];
  };
  validation: {
    adapter_ready: boolean;
    reason?: string | null;
    adapter_id: string;
    can_run: boolean;
    current_passed: boolean;
    current_receipt_id?: string | null;
  };
  reviewer: {
    store_ready: boolean;
    reason?: string | null;
    can_request_decision: boolean;
    can_link_formal_approval: boolean;
    current_formal_approval_id?: string | null;
  };
  execution_authority: "none";
}

export interface CandidateReadback {
  candidate: CandidateRecord;
  revisions: CandidateRecord[];
  decisions: CandidateDecisionRecord[];
  validation_receipts: ValidationReceipt[];
  formal_approval_receipts: FormalApprovalReceipt[];
  /** Exact full-record ETag supplied by the authoritative candidate store. */
  etag: string;
  readiness: CandidateReadiness;
  execution_authority: "none";
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

/** Formal approval readback is intentionally distinct from accept-for-review. */
export interface FormalApprovalReceipt {
  approval_decision_id: string;
  authority: "canonical_approval_decision_store";
  tenant_id: string;
  proposal_id: string;
  revision: number;
  proposal_digest: string;
  validation_receipt_id: string;
  validation_receipt_sha256: string;
  proposer_id: string;
  reviewer_id: string;
  outcome: "approved" | "rejected" | "revision_requested";
  self_approval: false;
  decided_at: string;
  expires_at: string;
  receipt_sha256: string;
  execution_authority: "none";
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
    opinion.recommended_measures.forEach((measure) => {
      assertAuthorityBoundary(measure.authority);
      if (!/^[a-f0-9]{64}$/.test(measure.measure_sha256)) {
        throw makeBffError({ code: "VALIDATION_FAILED", message: "Persona measure omitted its server-authored digest." });
      }
    });
  }
  if (resource.synthesis) {
    assertAuthorityBoundary(resource.synthesis.authority);
    if (!resource.synthesis.opinion_ids.every((id) => opinionIds.has(id))) {
      throw makeBffError({ code: "VALIDATION_FAILED", message: "Synthesis referenced an opinion outside authoritative readback." });
    }
  }
  for (const link of resource.candidate_proposal_links) {
    if (link.interaction_id !== resource.interaction_id || !opinionIds.has(link.opinion_id)
      || !/^[a-f0-9]{64}$/.test(link.opinion_sha256)
      || !/^[a-f0-9]{64}$/.test(link.measure_sha256)
      || !/^[a-f0-9]{64}$/.test(link.proposal_digest)
      || link.execution_authority !== "none") {
      throw makeBffError({ code: "VALIDATION_FAILED", message: "Candidate link omitted its exact persisted interaction binding." });
    }
    const opinion = resource.opinions.find((item) => item.opinion_id === link.opinion_id);
    const measure = opinion?.recommended_measures.find((item) => item.measure_id === link.measure_id);
    if (!measure || measure.measure_sha256 !== link.measure_sha256) {
      throw makeBffError({ code: "VALIDATION_FAILED", message: "Candidate link crossed its persisted Persona measure binding." });
    }
  }
}

function assertCandidateReadiness(readiness: CandidateReadiness | null | undefined): void {
  const booleans = [
    readiness?.candidate?.ready,
    readiness?.validation?.adapter_ready,
    readiness?.validation?.can_run,
    readiness?.validation?.current_passed,
    readiness?.reviewer?.store_ready,
    readiness?.reviewer?.can_request_decision,
    readiness?.reviewer?.can_link_formal_approval,
  ];
  if (readiness?.execution_authority !== "none"
    || !Array.isArray(readiness?.candidate?.allowed_actions)
    || booleans.some((value) => typeof value !== "boolean")) {
    throw makeBffError({ code: "BACKEND_UNAVAILABLE", message: "Candidate readiness was malformed and has been denied." });
  }
}

function assertCandidateReadback(resource: CandidateReadback): void {
  const candidate = resource?.candidate;
  if (!candidate || candidate.execution_authority !== "none" || resource.execution_authority !== "none") {
    throw makeBffError({ code: "VALIDATION_FAILED", message: "Candidate readback crossed the non-execution boundary." });
  }
  assertAuthorityBoundary(candidate.authority);
  if (!/^[a-f0-9]{64}$/.test(candidate.opinion_sha256)
    || !/^[a-f0-9]{64}$/.test(candidate.measure_sha256)
    || !/^[a-f0-9]{64}$/.test(candidate.proposal_digest)
    || !/^"[a-f0-9]{64}"$/.test(resource.etag)) {
    throw makeBffError({ code: "BACKEND_UNAVAILABLE", message: "Candidate readback omitted its server digest or current ETag." });
  }
  if (!Array.isArray(resource.revisions) || !Array.isArray(resource.decisions)
    || !Array.isArray(resource.validation_receipts) || !Array.isArray(resource.formal_approval_receipts)) {
    throw makeBffError({ code: "BACKEND_UNAVAILABLE", message: "Candidate readback omitted durable history or readiness." });
  }
  assertCandidateReadiness(resource.readiness);
  const sourceMatches = (item: {
    proposal_id: string; interaction_id: string; opinion_id: string; opinion_sha256: string;
    measure_id: string; measure_sha256: string;
  }) => item.proposal_id === candidate.proposal_id
    && item.interaction_id === candidate.interaction_id
    && item.opinion_id === candidate.opinion_id
    && item.opinion_sha256 === candidate.opinion_sha256
    && item.measure_id === candidate.measure_id
    && item.measure_sha256 === candidate.measure_sha256;
  const revisionsValid = resource.revisions.length > 0 && resource.revisions.every((item) => {
    assertAuthorityBoundary(item.authority);
    return sourceMatches(item) && item.execution_authority === "none"
      && Number.isInteger(item.revision) && item.revision >= 1
      && /^[a-f0-9]{64}$/.test(item.proposal_digest);
  });
  const revisionMatches = (revision: number, digest: string) => resource.revisions.some(
    (item) => item.revision === revision && item.proposal_digest === digest,
  );
  const decisionsValid = resource.decisions.every((item) => sourceMatches(item)
    && item.formal_approval === false && item.execution_authority === "none"
    && revisionMatches(item.revision, item.proposal_digest));
  const validationsValid = resource.validation_receipts.every((item) => item.authority === "canonical_validation_service"
    && item.proposal_id === candidate.proposal_id && /^[a-f0-9]{64}$/.test(item.receipt_sha256)
    && revisionMatches(item.revision, item.proposal_digest));
  const approvalsValid = resource.formal_approval_receipts.every((item) => item.authority === "canonical_approval_decision_store"
    && item.proposal_id === candidate.proposal_id && item.self_approval === false
    && item.proposer_id !== item.reviewer_id && item.execution_authority === "none"
    && /^[a-f0-9]{64}$/.test(item.receipt_sha256)
    && /^[a-f0-9]{64}$/.test(item.validation_receipt_sha256)
    && revisionMatches(item.revision, item.proposal_digest)
    && resource.validation_receipts.some((receipt) => receipt.validation_receipt_id === item.validation_receipt_id
      && receipt.receipt_sha256 === item.validation_receipt_sha256));
  if (!revisionsValid || !revisionMatches(candidate.revision, candidate.proposal_digest)
    || !decisionsValid || !validationsValid || !approvalsValid) {
    throw makeBffError({ code: "VALIDATION_FAILED", message: "Candidate lifecycle readback crossed its durable source, revision, receipt, or authority binding." });
  }
}

export async function listDailyInteractions(workshopId?: string): Promise<DailyInteraction[]> {
  try {
    const items: DailyInteraction[] = [];
    const seenTokens = new Set<string>();
    let pageToken: string | undefined;
    do {
      const raw = await bffFetch<DailyInteractionListEnvelope>({
        method: "GET",
        path: paths.agoraDailyInteractions(),
        query: { page_size: 100, page_token: pageToken, workshop_id: workshopId },
      });
      if (!raw || !Array.isArray(raw.data)) {
        throw makeBffError({ code: "BACKEND_UNAVAILABLE", message: "Daily interaction list data was not an array." });
      }
      raw.data.forEach(assertInteraction);
      items.push(...raw.data);
      const next = raw.meta?.next_page_token?.trim() || undefined;
      if (next && seenTokens.has(next)) {
        throw makeBffError({ code: "BACKEND_UNAVAILABLE", message: "Daily interaction pagination repeated a page token." });
      }
      if (next) seenTokens.add(next);
      pageToken = next;
    } while (pageToken);
    return workshopId ? items.filter((item) => item.workshop_id === workshopId) : items;
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

export async function retryDailyInteraction(input: {
  interactionId: string;
  reason: string;
  idempotencyKey: string;
}): Promise<DailyInteraction> {
  await requireWrite();
  const reason = input.reason.trim();
  if (!reason) {
    throw makeBffError({ code: "VALIDATION_FAILED", message: "A retry reason is required." });
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(input.idempotencyKey)) {
    throw makeBffError({ code: "VALIDATION_FAILED", message: "Retry idempotency identity must be ASCII-safe." });
  }
  try {
    const value = dataOf<DailyInteraction>(await bffFetch<unknown>({
      method: "POST",
      path: paths.agoraDailyInteractionRetry(input.interactionId),
      body: { reason },
      idempotencyKey: input.idempotencyKey,
    }));
    assertInteraction(value);
    return value;
  } catch (error) {
    return unsupported(error);
  }
}

export async function createCandidateFromMeasure(input: {
  interactionId: string; opinionId: string; measureId: string; measureSha256: string; idempotencyKey: string;
}): Promise<CandidateReadback> {
  await requireWrite();
  if (!/^[A-Za-z0-9._:-]+$/.test(input.idempotencyKey)) {
    throw makeBffError({ code: "VALIDATION_FAILED", message: "Candidate idempotency identity must be ASCII-safe." });
  }
  if (!/^[a-f0-9]{64}$/.test(input.measureSha256)) {
    throw makeBffError({ code: "VALIDATION_FAILED", message: "Candidate source measure digest must be server-authored." });
  }
  try {
    const readback = dataOf<CandidateReadback>(await bffFetch({
      method: "POST",
      path: paths.agoraInteractionMeasureCandidates(input.interactionId, input.measureId),
      idempotencyKey: input.idempotencyKey,
      body: {
        interaction_id: input.interactionId,
        opinion_id: input.opinionId,
        measure_id: input.measureId,
      },
    }));
    assertCandidateReadback(readback);
    if (readback.candidate.interaction_id !== input.interactionId
      || readback.candidate.opinion_id !== input.opinionId
      || readback.candidate.measure_id !== input.measureId
      || readback.candidate.measure_sha256 !== input.measureSha256) {
      throw makeBffError({ code: "VALIDATION_FAILED", message: "Created candidate did not match the persisted Persona measure binding." });
    }
    return readback;
  } catch (error) {
    return unsupported(error);
  }
}

export async function getCandidate(proposalId: string): Promise<CandidateReadback> {
  try {
    const readback = dataOf<CandidateReadback>(await bffFetch({
      method: "GET",
      path: paths.agoraCandidate(proposalId),
    }));
    assertCandidateReadback(readback);
    if (readback.candidate.proposal_id !== proposalId) {
      throw makeBffError({ code: "VALIDATION_FAILED", message: "Candidate detail crossed the requested proposal binding." });
    }
    return readback;
  } catch (error) {
    return unsupported(error);
  }
}

export async function decideCandidate(input: {
  proposalId: string; action: CandidateDecisionAction; reason: string; revision: number; proposalDigest: string;
  proposalEtag: string; idempotencyKey: string; proposedValue?: unknown; evidenceRefs?: string[];
}): Promise<CandidateReadback> {
  await requireWrite();
  if (!/^[A-Za-z0-9._:-]+$/.test(input.idempotencyKey)) {
    throw makeBffError({ code: "VALIDATION_FAILED", message: "Candidate decision idempotency identity must be ASCII-safe." });
  }
  try {
    const readback = dataOf<CandidateReadback>(await bffFetch({
      method: "POST", path: paths.agoraCandidateDecisions(input.proposalId),
      headers: { "If-Match": input.proposalEtag },
      idempotencyKey: input.idempotencyKey,
      body: {
        action: input.action,
        reason: input.reason,
        expected_revision: input.revision,
        expected_proposal_digest: input.proposalDigest,
        ...(input.action === "modify" ? { proposed_value: input.proposedValue } : {}),
        ...(input.evidenceRefs?.length ? { evidence_refs: input.evidenceRefs } : {}),
      },
    }));
    assertCandidateReadback(readback);
    if (readback.candidate.proposal_id !== input.proposalId) {
      throw makeBffError({ code: "VALIDATION_FAILED", message: "Candidate decision readback crossed the requested proposal binding." });
    }
    return readback;
  } catch (error) {
    return unsupported(error);
  }
}

export async function listCandidateDecisions(proposalId: string): Promise<CandidateDecisionRecord[]> {
  return (await getCandidate(proposalId)).decisions;
}

export async function requestAuthoritativeValidation(input: {
  proposalId: string; revision: number; proposalDigest: string; proposalEtag: string; idempotencyKey: string;
}): Promise<CandidateReadback> {
  await requireWrite();
  if (!/^[A-Za-z0-9._:-]+$/.test(input.idempotencyKey)) {
    throw makeBffError({ code: "VALIDATION_FAILED", message: "Candidate validation idempotency identity must be ASCII-safe." });
  }
  try {
    const readback = dataOf<CandidateReadback>(await bffFetch({
      method: "POST", path: paths.agoraCandidateValidations(input.proposalId),
      headers: { "If-Match": input.proposalEtag },
      idempotencyKey: input.idempotencyKey,
      body: {
        expected_revision: input.revision,
        expected_proposal_digest: input.proposalDigest,
      },
    }));
    assertCandidateReadback(readback);
    return readback;
  } catch (error) {
    return unsupported(error);
  }
}

export async function getAuthoritativeValidation(input: {
  proposalId: string; validationReceiptId: string;
}): Promise<ValidationReceipt> {
  try {
    const receipt = dataOf<ValidationReceipt>(await bffFetch({
      method: "GET",
      path: paths.agoraCandidateValidation(input.proposalId, input.validationReceiptId),
    }));
    if (receipt.authority !== "canonical_validation_service" || receipt.proposal_id !== input.proposalId) {
      throw makeBffError({ code: "VALIDATION_FAILED", message: "Validation readback did not match the canonical proposal authority." });
    }
    return receipt;
  } catch (error) {
    return unsupported(error);
  }
}

export async function getCandidateReviewReadiness(proposalId: string): Promise<{
  proposal_id: string;
  readiness: CandidateReadiness;
  etag: string;
  execution_authority: "none";
}> {
  try {
    const value = dataOf<{
      proposal_id: string;
      readiness: CandidateReadiness;
      etag: string;
      execution_authority: "none";
    }>(await bffFetch({ method: "GET", path: paths.agoraCandidateReviewReadiness(proposalId) }));
    assertCandidateReadiness(value.readiness);
    if (value.proposal_id !== proposalId || value.execution_authority !== "none"
      || !/^"[a-f0-9]{64}"$/.test(value.etag)) {
      throw makeBffError({ code: "VALIDATION_FAILED", message: "Candidate review readiness crossed its authoritative binding." });
    }
    return value;
  } catch (error) {
    return unsupported(error);
  }
}
