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

  // GET /bff/strategies — empty list envelope (real data comes from src/lib/bff/scenarios.ts)
  registerMock("GET", paths.strategies(), () =>
    list({
      items: [],
      cursor: {},
      pageSize: 50,
      estimatedTotal: 0,
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

  // GET /bff/session/me — minimal envelope; consumers should still use src/lib/v4/session/me
  registerMock("GET", paths.sessionMe(), () =>
    ok({ sub: "mock-user", roles: ["operator"], capabilities: [] }),
  );
}
