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
  type: "strategy" | "position" | "decision_event" | "journal_entry" | "persona" | "performance_window";
  id: string;
  version_id?: string;
}

export interface ResolveContextRequest {
  context_refs: ContextRef[];
  workshop_id?: string;
  environment?: "research" | "shadow" | "paper" | "canary" | "live";
}

export interface ResolveContextResponse {
  workshop_id: string;
  context_refs: ContextRef[];
  context_digest: string;
  environment: string;
  verified: boolean;
  resolved_at: string;
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

export const interaction = {
  resolveContext: async (body: ResolveContextRequest): Promise<ResolveContextEnvelope> => {
    await requireInteractionWrite();
    const mockFn = async (): Promise<ResolveContextEnvelope> => {
      const wid = body.workshop_id || `wksp-mock-${Math.random().toString(36).substr(2, 9)}`;
      return {
        data: {
          workshop_id: wid,
          context_refs: body.context_refs,
          context_digest: "mock-digest-sha256",
          environment: body.environment || "research",
          verified: true,
          resolved_at: new Date().toISOString(),
        },
      };
    };

    return withLiveOrMock<ResolveContextEnvelope>(
      {
        method: "POST",
        path: paths.agoraInteractionsResolve(),
        body,
        idempotencyKey: `idem-resolve-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
