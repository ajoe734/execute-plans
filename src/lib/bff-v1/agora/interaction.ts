// BFF client for agora.interaction capability.
// Routes: /bff/agora/interactions/*

import { withLiveOrMock } from "../liveTransport";
import { makeBffError } from "../errors";
import { paths } from "../paths";
import { liveWriteGated } from "../writeGate";
import type { GovernedProposal } from "./governance";
import type { ParticipantSnapshot } from "./dailyInteractions";

async function requireInteractionWrite(): Promise<void> {
  if (await liveWriteGated()) return;
  throw makeBffError({
    code: "PERMISSION_DENIED",
    message: "Interaction writes are disabled by deployment policy or session-kind policy.",
    details: { reason: "live_write_gate_closed" },
  });
}

export interface ContextRef {
  type: "strategy" | "position" | "decision_event" | "journal_entry" | "persona" | "performance_window" | "workshop" | "human_inbox_item";
  id: string;
  version_id?: string;
}

export interface ResolveContextRequest {
  context_refs: ContextRef[];
  workshop_id?: string;
  environment?: "research" | "shadow" | "paper" | "canary" | "live";
  source_route?: string;
  focused_object?: { kind: string; id: string; version?: string | null };
  evidence_cutoff?: string;
  selected_persona_ids?: string[];
  initial_mode?: "ask" | "challenge" | "compare" | "propose_action" | "reflect";
  return_route?: string;
}

export interface ContextBinding {
  binding_id: string;
  workshop_id: string;
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
  initial_mode: "ask" | "challenge" | "compare" | "propose_action" | "reflect";
  return_route: string;
  advice_environment: "research" | "shadow" | "paper" | "canary" | "live";
  context_digest: string;
  resolved_at: string;
}

export interface ResolveContextResponse {
  workshop_id: string;
  context_refs: ContextRef[];
  context_digest: string;
  environment: string;
  verified: boolean;
  resolved_at: string;
  context_binding: ContextBinding;
}

export interface EligibilityRequest {
  workshop_id: string;
  mode: "ask" | "challenge" | "consult" | "propose_action" | "reflect";
  environment?: "research" | "shadow" | "paper" | "canary" | "live";
  required_capability?: string;
}

export interface PersonaEligibility {
  persona_id: string;
  display_name: string;
  eligible: boolean;
  reasons: string[];
  recommended: boolean;
  capability_snapshot_id?: string;
  /** v1.9 runtime-owned immutable snapshot. The frontend must not fabricate it. */
  participant_snapshot?: ParticipantSnapshot;
}

export interface EligibilityResponse {
  included: PersonaEligibility[];
  excluded: PersonaEligibility[];
}

export interface SubmitInteractionRequest extends EligibilityRequest {
  interaction_id?: string;
  topic: string;
  participant_persona_ids: string[];
  context_refs: ContextRef[];
}

export interface SubmitInteractionResponse {
  interaction_id: string;
  workshop_id: string;
  mode: string;
  topic: string;
  participants: string[];
  context_refs: ContextRef[];
  status: string;
  execution_authority: string;
  no_capital_authority_proof: string;
  submitted_at: string;
  proposal_id?: string;
  proposal_ref?: string;
  proposal_refs?: string[];
  proposal?: GovernedProposal;
  proposal_etag?: string;
}

export interface ResolveContextEnvelope {
  data: ResolveContextResponse;
  meta?: Record<string, unknown>;
}

export interface EligibilityEnvelope {
  data: EligibilityResponse;
  meta?: Record<string, unknown>;
}

export interface SubmitInteractionEnvelope {
  data: SubmitInteractionResponse;
  meta?: Record<string, unknown>;
}

function canonicalRequestJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Context resolve request contains an unsupported value.");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalRequestJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalRequestJson(record[key])}`)
    .join(",")}}`;
}

/**
 * The resolver receipt is idempotent for the complete canonical request.
 * Mount and pre-submit resolution must replay the same receipt rather than
 * minting a new server cutoff/digest for identical context.
 */
export async function resolveContextIdempotencyKey(body: ResolveContextRequest): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure context receipt identity support is unavailable in this browser.");
  }
  const bytes = new TextEncoder().encode(canonicalRequestJson(body));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `pint15-context-${hex}`;
}

const mockContextReceipts = new Map<string, ResolveContextEnvelope>();

export const interaction = {
  resolveContext: async (body: ResolveContextRequest): Promise<ResolveContextEnvelope> => {
    await requireInteractionWrite();
    const idempotencyKey = await resolveContextIdempotencyKey(body);
    const mockFn = async (): Promise<ResolveContextEnvelope> => {
      const replay = mockContextReceipts.get(idempotencyKey);
      if (replay) return replay;
      const wid = body.workshop_id || `wksp-mock-${idempotencyKey.slice(-9)}`;
      const resolvedAt = new Date().toISOString();
      const sourceRoute = body.source_route ?? `/agora/strategy-workshop/${encodeURIComponent(wid)}`;
      const focusedObject = body.focused_object ?? { kind: "workshop", id: wid };
      const evidenceCutoff = body.evidence_cutoff ?? resolvedAt;
      const selectedPersonaIds = body.selected_persona_ids ?? body.context_refs.filter((ref) => ref.type === "persona").map((ref) => ref.id);
      const initialMode = body.initial_mode ?? "ask";
      const returnRoute = body.return_route ?? sourceRoute;
      const strategy = body.context_refs.find((ref) => ref.type === "strategy" && ref.version_id);
      const contextDigest = "mock-digest-sha256";
      const receipt: ResolveContextEnvelope = {
        data: {
          workshop_id: wid,
          context_refs: body.context_refs,
          context_digest: contextDigest,
          environment: body.environment || "research",
          verified: true,
          resolved_at: resolvedAt,
          context_binding: {
            binding_id: `binding-${wid}`,
            workshop_id: wid,
            tenant_id: "tenant-mock",
            source_route: sourceRoute,
            focused_object: focusedObject,
            context_refs: body.context_refs.map((ref) => ({ kind: ref.type, id: ref.id, version: ref.version_id ?? null })),
            strategy_ref: strategy?.version_id ? { strategy_id: strategy.id, version_id: strategy.version_id } : null,
            decision_ref: body.context_refs.find((ref) => ref.type === "decision_event")?.id ?? null,
            journal_ref: body.context_refs.find((ref) => ref.type === "journal_entry")?.id ?? null,
            position_risk_snapshot_refs: body.context_refs.filter((ref) => ref.type === "position").map((ref) => ref.id),
            evidence_cutoff: evidenceCutoff,
            selected_persona_ids: selectedPersonaIds,
            initial_mode: initialMode,
            return_route: returnRoute,
            advice_environment: body.environment ?? "research",
            context_digest: contextDigest,
            resolved_at: resolvedAt,
          },
        },
      };
      mockContextReceipts.set(idempotencyKey, receipt);
      return receipt;
    };

    return withLiveOrMock<ResolveContextEnvelope>(
      {
        method: "POST",
        path: paths.agoraInteractionsResolve(),
        body,
        idempotencyKey,
      },
      mockFn,
    );
  },

  participants: (body: EligibilityRequest): Promise<EligibilityEnvelope> => {
    const mockFn = async (): Promise<EligibilityEnvelope> => {
      // Mock some default personas
      const list = [
        {
          persona_id: "per_quant",
          display_name: "Quant Architect",
          eligible: true,
          reasons: [],
          recommended: body.mode in { challenge: 1, consult: 1 },
          capability_snapshot_id: "snap-quant-1",
        },
        {
          persona_id: "per_macro",
          display_name: "Macro Strategist",
          eligible: true,
          reasons: [],
          recommended: body.mode in { challenge: 1, consult: 1 },
          capability_snapshot_id: "snap-macro-1",
        },
        {
          persona_id: "per_risk",
          display_name: "Risk Officer Bot",
          eligible: true,
          reasons: [],
          recommended: body.mode in { challenge: 1, consult: 1 },
          capability_snapshot_id: "snap-risk-1",
        },
        {
          persona_id: "per_red",
          display_name: "Red Team Adversary",
          eligible: body.environment !== "live",
          reasons: body.environment === "live" ? ["environment_ceiling_exceeded"] : [],
          recommended: body.mode === "challenge",
          capability_snapshot_id: "snap-red-1",
        },
      ];
      return {
        data: {
          included: list.filter((x) => x.eligible),
          excluded: list.filter((x) => !x.eligible),
        },
      };
    };

    return withLiveOrMock<EligibilityEnvelope>(
      {
        method: "POST",
        path: paths.agoraInteractionsEligible(),
        body,
      },
      mockFn,
    );
  },

  submit: async (body: SubmitInteractionRequest): Promise<SubmitInteractionEnvelope> => {
    await requireInteractionWrite();
    const mockFn = async (): Promise<SubmitInteractionEnvelope> => {
      const interactionId = body.interaction_id || `int-mock-${Math.random().toString(36).substr(2, 9)}`;
      return {
        data: {
          interaction_id: interactionId,
          workshop_id: body.workshop_id,
          mode: body.mode,
          topic: body.topic,
          participants: body.participant_persona_ids,
          context_refs: body.context_refs,
          status: "queued",
          execution_authority: "none",
          no_capital_authority_proof: "persona_interaction_event_no_capital_or_order_authority",
          submitted_at: new Date().toISOString(),
        },
      };
    };

    return withLiveOrMock<SubmitInteractionEnvelope>(
      {
        method: "POST",
        path: paths.agoraInteractionsSubmit(),
        body,
        idempotencyKey: `idem-submit-int-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      },
      mockFn,
    );
  },
};
