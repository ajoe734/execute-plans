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

  // POST /bff/agora/interactions/resolve
  registerMock("POST", "/bff/agora/interactions/resolve", () =>
    ok({
      workshop_id: "wksp-mock-001",
      context_refs: [{ type: "persona", id: "per_quant" }],
      context_digest: "mock-digest",
      environment: "paper",
      verified: true,
      resolved_at: new Date().toISOString(),
      context_binding: {
        binding_id: "cb_001",
        workshop_id: "wksp-mock-001",
        tenant_id: "mock-tenant",
        source_route: "/management/personas",
        focused_object: { kind: "persona", id: "per_quant" },
        context_refs: [],
        evidence_cutoff: new Date().toISOString(),
        selected_persona_ids: ["per_quant"],
        initial_mode: "reflect",
        return_route: "/management",
        advice_environment: "paper",
        context_digest: "mock-digest",
        resolved_at: new Date().toISOString(),
      },
    }),
  );

  // POST /bff/agora/interactions/eligible
  registerMock("POST", "/bff/agora/interactions/eligible", () =>
    ok({
      included: [
        {
          persona_id: "per_quant",
          display_name: "Quant Persona",
          eligible: true,
          reasons: [],
          recommended: true,
        },
      ],
      excluded: [],
    }),
  );

  // POST /bff/agora/interactions/submit
  registerMock("POST", "/bff/agora/interactions/submit", () =>
    ok({
      interaction_id: "int_001",
      workshop_id: "wksp-1",
      mode: "consult",
      topic: "Review risk",
      participants: ["per_quant"],
      context_refs: [],
      status: "queued",
      execution_authority: "none",
      no_capital_authority_proof: "proof_mock",
      submitted_at: new Date().toISOString(),
    }),
  );
}

bootstrapMockAdapters();
