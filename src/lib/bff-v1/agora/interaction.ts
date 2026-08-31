// BFF client for agora.interaction capability.
// Routes: /bff/agora/interactions/*

import { strictLiveRead } from "../domainReads";
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
 * The resolver receipt is idempotent for the complete canonical request
 * within one page-resolution session. Mount and pre-submit resolution replay
 * the same receipt, while a fresh visit receives a fresh authoritative cutoff.
 */
export interface ResolveContextOptions {
  resolutionSessionId?: string;
}

function resolutionSessionId(options?: ResolveContextOptions): string {
  if (options?.resolutionSessionId) {
    if (!/^[A-Za-z0-9._:-]+$/.test(options.resolutionSessionId)) {
      throw new Error("Context resolution session identity must be ASCII-safe.");
    }
    return options.resolutionSessionId;
  }
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure context resolution session identity support is unavailable in this browser.");
  }
  return globalThis.crypto.randomUUID();
}

export async function resolveContextIdempotencyKey(body: ResolveContextRequest, sessionId: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure context receipt identity support is unavailable in this browser.");
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(sessionId)) {
    throw new Error("Context resolution session identity must be ASCII-safe.");
  }
  const bytes = new TextEncoder().encode(canonicalRequestJson({
    request: body,
    resolution_session_id: sessionId,
  }));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `pint15-context-${hex}`;
}

function asEnvelope<T>(body: unknown): { data: T; meta?: Record<string, unknown> } {
  const rec = (body && typeof body === "object" && !Array.isArray(body)) ? body as Record<string, unknown> : {};
  if ("data" in rec && rec.data !== undefined) {
    return rec as { data: T; meta?: Record<string, unknown> };
  }
  return { data: body as T };
}

export const interaction = {
  resolveContext: async (body: ResolveContextRequest, options?: ResolveContextOptions): Promise<ResolveContextEnvelope> => {
    await requireInteractionWrite();
    const idempotencyKey = await resolveContextIdempotencyKey(body, resolutionSessionId(options));
    return strictLiveRead<ResolveContextEnvelope>(
      "agora.interaction.resolveContext",
      {
        method: "POST",
        path: paths.agoraInteractionsResolve(),
        body,
        idempotencyKey,
      },
      asEnvelope<ResolveContextResponse>,
    );
  },

  participants: (body: EligibilityRequest): Promise<EligibilityEnvelope> => {
    return strictLiveRead<EligibilityEnvelope>(
      "agora.interaction.participants",
      {
        method: "POST",
        path: paths.agoraInteractionsEligible(),
        body,
      },
      asEnvelope<EligibilityResponse>,
    );
  },

  submit: async (body: SubmitInteractionRequest): Promise<SubmitInteractionEnvelope> => {
    await requireInteractionWrite();
    return strictLiveRead<SubmitInteractionEnvelope>(
      "agora.interaction.submit",
      {
        method: "POST",
        path: paths.agoraInteractionsSubmit(),
        body,
        idempotencyKey: `idem-submit-int-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      },
      asEnvelope<SubmitInteractionResponse>,
    );
  },
};
