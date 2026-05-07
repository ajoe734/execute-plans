import { describe, expect, it } from "vitest";
import {
  BffError,
  bffFetch,
  bffRequest,
  isBffErrorEnvelope,
  makeBffError,
  paths,
  type CommandResponse,
} from "../index";

describe("bff-v1 envelope shape (Final C.2)", () => {
  it("CommandResponse.data is required and surfaced by mock client", async () => {
    const body = await bffFetch<CommandResponse<{ actionId: string; status: string }>>({
      method: "POST",
      path: "/bff/strategies/strat_1/actions/start",
      body: {},
    });
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.actionId).toMatch(/^act_/);
    expect(body.data.status).toBe("accepted");
    expect(body.correlationId).toBeTypeOf("string");
  });
});

describe("bff-v1 error envelope (Final C.1 / C.3)", () => {
  it("CONFIRM_TOKEN_REQUIRED → 428 BffError with requires_confirm_token", async () => {
    const result = await bffRequest({
      method: "POST",
      path: "/bff/strategies/strat_1/actions/promote",
      body: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(BffError);
    expect(result.error.status).toBe(428);
    expect(result.error.code).toBe("CONFIRM_TOKEN_REQUIRED");
    expect(result.error.requiresConfirmToken()).toBe(true);
    expect(result.error.isPreconditionRequired()).toBe(true);
    expect(result.error.details?.requires_confirm_token).toBe(true);
  });

  it("APPROVAL_REQUIRED for two-man action carries approvalId", async () => {
    const result = await bffRequest({
      method: "POST",
      path: "/bff/strategies/strat_9/actions/rollback",
      body: { confirmToken: "tkn_x" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("APPROVAL_REQUIRED");
    expect(result.error.requiresApproval()).toBe(true);
    expect(result.error.details?.approvalId).toBeTypeOf("string");
  });

  it("isBffErrorEnvelope type guard", () => {
    const e = makeBffError({ code: "STATE_CONFLICT", message: "x" });
    expect(isBffErrorEnvelope(e.envelope)).toBe(true);
    expect(isBffErrorEnvelope({ error: { code: 1 } })).toBe(false);
    expect(isBffErrorEnvelope(null)).toBe(false);
  });

  it("unknown path → RESOURCE_NOT_FOUND", async () => {
    const result = await bffRequest({ method: "GET", path: "/bff/no-such-route" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("RESOURCE_NOT_FOUND");
  });
});

describe("bff-v1 path builders", () => {
  it("encodes ids and exposes 94-endpoint surface", () => {
    expect(paths.strategies()).toBe("/bff/strategies");
    expect(paths.strategy("a/b")).toBe("/bff/strategies/a%2Fb");
    expect(paths.strategyAction("s1", "promote")).toBe("/bff/strategies/s1/actions/promote");
    expect(paths.v5InterventionDecision("iv_1")).toBe("/bff/v5/interventions/iv_1/decision");
    expect(paths.agoraAskSession("ask_1")).toBe("/bff/agora/ask/sessions/ask_1");
    expect(paths.sse()).toBe("/bff/events/stream");
  });
});
