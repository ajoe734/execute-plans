// BFF Contract v1 — sample mock adapters demonstrating envelope shapes.
// Sufficient for tests and progressive migration. Real call sites continue
// to use src/lib/bff/* until Batch VI flips them over.

import { paths } from "../paths";
import { fail, list, ok, registerMock } from "./registry";
import type { ActionCommandResponseData } from "../dto";

let bootstrapped = false;

export function bootstrapMockAdapters(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  // GET /bff/strategies — default mock list
  registerMock("GET", paths.strategies(), () =>
    list({
      items: [
        {
          id: "stg_001",
          name: "stg_001",
          strategyId: "stg_001",
          strategy_id: "stg_001",
          capitalPoolId: "pool_001",
          status: "active",
          state: "deployed",
          risk: "low",
        } as never,
      ],
      cursor: {},
      pageSize: 50,
      estimatedTotal: 1,
      totalCountExact: true,
    }),
  );

  // POST /bff/strategies/{id}/actions/{action}
  // Final C.1 demonstration: missing confirm token → 428 APPROVAL_REQUIRED / CONFIRM_TOKEN_REQUIRED
  registerMock("POST", "/bff/strategies/{id}/actions/{action}", (req) => {
    const headers = req.headers;
    const body = (req.body ?? {}) as { confirmToken?: string };
    const action = req.path.split("/").pop() ?? "unknown";
    const id = req.path.split("/")[3];

    // High-risk actions require confirm token
    const HIGH_RISK = new Set(["promote", "suspend", "retire", "rollback"]);
    if (HIGH_RISK.has(action) && !body.confirmToken) {
      return fail({
        code: "CONFIRM_TOKEN_REQUIRED",
        message: `action '${action}' requires a confirm token`,
        details: { requires_confirm_token: true },
        correlationId: headers["X-Request-Id"],
      });
    }

    // Two-man approval
    if (action === "rollback") {
      return fail({
        code: "APPROVAL_REQUIRED",
        message: "rollback requires a second approver",
        details: { requires_approval: true, requires_two_man: true, approvalId: `appr_${id}_${action}` },
        correlationId: headers["X-Request-Id"],
      });
    }

    const data: ActionCommandResponseData = {
      actionId: `act_${id}_${action}_${Date.now().toString(36)}`,
      status: "accepted",
    };
    return ok(data, { correlationId: headers["X-Request-Id"], idempotencyKey: headers["Idempotency-Key"] });
  });

  // GET /bff/me — canonical (Final OpenAPI). Legacy alias `/bff/session/me` resolves
  // to the same path via paths.sessionMe().
  registerMock("GET", paths.me(), () =>
    ok({ sub: "mock-user", roles: ["operator"], capabilities: [] }),
  );

  // GET /bff/agora/me
  registerMock("GET", "/bff/agora/me", () =>
    ok({
      spec_version: "1.0",
      scope_id: "mock-scope",
      tenant_id: "mock-tenant",
      user_id: "mock-user",
      operator_id: "mock-operator",
      granted_capabilities: [],
      read_predicate: {
        tenant_id: "mock-tenant",
        user_id: "mock-user",
        required_fields: ["tenant_id", "user_id"],
        fail_closed: true,
      },
      servant_policy: {
        persona_class: "agora_servant",
        owner_scope: "user_private",
        visibility_scope: "private",
        memory_scope: "private_user",
        persona_registry_backed: true,
        execution_authority: "none",
        prohibited_authority: ["runtime_binding", "broker_order", "capital_binding"],
      },
      created_at: "2026-01-01T00:00:00Z",
    }),
  );

  // GET /bff/agora/capabilities
  registerMock("GET", "/bff/agora/capabilities", () =>
    ok({
      capabilities: [],
      granted_capabilities: [],
    }),
  );

  // GET /bff/management/trade-journeys
  registerMock("GET", "/bff/management/trade-journeys", () => ({
    kind: "json",
    status: 200,
    body: {
      data: {
        items: [
          {
            journey_id: "tj_001",
            symbol: "AAPL",
            side: "BUY",
            quantity: 100,
            current_stage: "fill",
            status: "completed",
            updated_at: new Date().toISOString(),
          },
        ],
      },
      page_info: { total: 1, page_size: 50 },
      meta: {
        snapshot_at: new Date().toISOString(),
        read_state: "formal",
        freshness: { materializer_revision: 1 },
      },
    },
  }));

  // GET /bff/jobs
  registerMock("GET", "/bff/jobs", () => {
    const jobList = Array.from({ length: 30 }, (_, i) => ({
      id: `job_${8800 + i}`,
      kind: i % 2 === 0 ? "backtest" : "rebalance.simulate",
      owner: "ops",
      startedAt: new Date(Date.now() - i * 60000).toISOString(),
      status: i < 13 ? (i % 3 === 0 ? "running" : i % 3 === 1 ? "queued" : "pending") : "success",
    }));
    return list({
      items: jobList,
      cursor: {},
      pageSize: 30,
      estimatedTotal: 30,
      totalCountExact: true,
    });
  });

  // POST /bff/agora/interactions/context:resolve
  registerMock("POST", paths.agoraInteractionsResolve(), (req) => {
    const body = (req.body ?? {}) as {
      workshop_id?: string;
      context_refs?: Array<{ type: string; id: string; version_id?: string }>;
      environment?: string;
      source_route?: string;
      focused_object?: { kind: string; id: string; version?: string | null };
      evidence_cutoff?: string;
      selected_persona_ids?: string[];
      initial_mode?: string;
      return_route?: string;
    };
    const wid = body.workshop_id || "wksp-mock-001";
    const resolvedAt = new Date().toISOString();
    const sourceRoute = body.source_route ?? `/agora/strategy-workshop/${encodeURIComponent(wid)}`;
    const focusedObject = body.focused_object ?? { kind: "workshop", id: wid };
    const evidenceCutoff = body.evidence_cutoff ?? resolvedAt;
    const selectedPersonaIds = body.selected_persona_ids ?? (body.context_refs ?? []).filter((ref) => ref.type === "persona").map((ref) => ref.id);
    const initialMode = body.initial_mode ?? "ask";
    const returnRoute = body.return_route ?? sourceRoute;
    const strategy = (body.context_refs ?? []).find((ref) => ref.type === "strategy" && ref.version_id);
    const contextDigest = "mock-digest-sha256";
    return ok({
      workshop_id: wid,
      context_refs: body.context_refs ?? [{ type: "persona", id: "per_quant" }],
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
        context_refs: (body.context_refs ?? []).map((ref) => ({ kind: ref.type, id: ref.id, version: ref.version_id ?? null })),
        strategy_ref: strategy?.version_id ? { strategy_id: strategy.id, version_id: strategy.version_id } : null,
        decision_ref: (body.context_refs ?? []).find((ref) => ref.type === "decision_event")?.id ?? null,
        journal_ref: (body.context_refs ?? []).find((ref) => ref.type === "journal_entry")?.id ?? null,
        position_risk_snapshot_refs: (body.context_refs ?? []).filter((ref) => ref.type === "position").map((ref) => ref.id),
        evidence_cutoff: evidenceCutoff,
        selected_persona_ids: selectedPersonaIds,
        initial_mode: initialMode,
        return_route: returnRoute,
        advice_environment: body.environment ?? "research",
        context_digest: contextDigest,
        resolved_at: resolvedAt,
      },
    });
  });

  // POST /bff/agora/interactions/participants:eligible
  registerMock("POST", paths.agoraInteractionsEligible(), (req) => {
    const body = (req.body ?? {}) as { mode?: string; environment?: string };
    const list = [
      {
        persona_id: "per_quant",
        display_name: "Quant Architect",
        eligible: true,
        reasons: [],
        recommended: body.mode === "challenge" || body.mode === "consult",
        capability_snapshot_id: "snap-quant-1",
      },
      {
        persona_id: "per_macro",
        display_name: "Macro Strategist",
        eligible: true,
        reasons: [],
        recommended: body.mode === "challenge" || body.mode === "consult",
        capability_snapshot_id: "snap-macro-1",
      },
      {
        persona_id: "per_risk",
        display_name: "Risk Officer Bot",
        eligible: true,
        reasons: [],
        recommended: body.mode === "challenge" || body.mode === "consult",
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
    return ok({
      included: list.filter((x) => x.eligible),
      excluded: list.filter((x) => !x.eligible),
    });
  });

  // POST /bff/agora/interactions
  registerMock("POST", paths.agoraInteractionsSubmit(), (req) => {
    const body = (req.body ?? {}) as {
      interaction_id?: string;
      workshop_id?: string;
      mode?: string;
      topic?: string;
      participant_persona_ids?: string[];
      context_refs?: unknown[];
    };
    const interactionId = body.interaction_id || "int_001";
    return ok({
      interaction_id: interactionId,
      workshop_id: body.workshop_id ?? "wksp-1",
      mode: body.mode ?? "consult",
      topic: body.topic ?? "Review risk",
      participants: body.participant_persona_ids ?? ["per_quant"],
      context_refs: body.context_refs ?? [],
      status: "queued",
      execution_authority: "none",
      no_capital_authority_proof: "proof_mock",
      submitted_at: new Date().toISOString(),
    });
  });
}

bootstrapMockAdapters();
