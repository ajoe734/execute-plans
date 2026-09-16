import { afterEach, describe, it, expect, vi } from "vitest";
import { liveWriteGated, runAction, sessionKindAllowsWrite, tryRunAction, requestConfirmToken } from "@/lib/bff-v1";
import {
  writes,
  buildRunActionCommand,
  cancelJob,
  retryJob,
  cancelResearchExperiment,
  retryResearchExperiment,
  archiveResearchExperiment,
  invalidateResearchExperiment,
  promoteResearchExperiment,
} from "@/lib/bff-v1/writes";
import { BffError } from "@/lib/bff-v1";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { runActionSafe } from "@/lib/bff-v1/runActionSafe";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function setWriteEnv(realWrites: boolean, token: string | null = null) {
  process.env.VITE_BFF_REAL_WRITES = realWrites ? "true" : "false";
  window.sessionStorage.clear();
  window.localStorage.clear();
  if (token) window.sessionStorage.setItem("pantheon.bff.bearerToken", token);
}

afterEach(() => {
  setWriteEnv(false, null);
  delete process.env.VITE_BFF_FALLBACK;
  delete process.env.VITE_BFF_STRICT_WRITES;
  delete process.env.VITE_BFF_ALLOW_DEV_STUB_WRITES;
  liveStatus._reset();
  vi.restoreAllMocks();
});

describe("VI-2 writes seam", () => {
  it("runAction returns CommandResponse envelope with correlationId + idempotencyKey", async () => {
    const env = await runAction({ kind: "Strategy", id: "stg_001", action: "noop" });
    expect(env.ok).toBe(true);
    expect(env.data.status).toBe("completed");
    expect(env.data.actionId).toMatch(/^au_/);
    expect(env.correlationId).toMatch(/^(corr_|cid_)/);
    expect(env.idempotencyKey).toMatch(/^idk_/);
    expect(env.auditEventId).toBe(env.data.actionId);
  });

  it("preserves caller-supplied correlationId + idempotencyKey", async () => {
    const env = await runAction(
      { kind: "Strategy", id: "stg_001", action: "noop" },
      { correlationId: "corr_test_xyz", idempotencyKey: "idk_test_xyz" },
    );
    expect(env.correlationId).toBe("corr_test_xyz");
    expect(env.idempotencyKey).toBe("idk_test_xyz");
  });

  it("audit event carries correlationId + idempotencyKey", async () => {
    const env = await runAction(
      { kind: "Strategy", id: "stg_001", action: "noop" },
      { correlationId: "corr_audit_chk", idempotencyKey: "idk_audit_chk" },
    );
    expect(env.legacy.audit.correlationId).toBe("corr_audit_chk");
    expect(env.legacy.audit.idempotencyKey).toBe("idk_audit_chk");
  });

  it("idempotent replay returns same audit id", async () => {
    const key = `idk_replay_${Date.now()}`;
    const a = await runAction({ kind: "Strategy", id: "stg_001", action: "noop" }, { idempotencyKey: key });
    const b = await runAction({ kind: "Strategy", id: "stg_001", action: "noop" }, { idempotencyKey: key });
    expect(b.legacy.audit.id).toBe(a.legacy.audit.id);
  });

  it("tryRunAction returns Result without throwing", async () => {
    const r = await tryRunAction({ kind: "Strategy", id: "stg_001", action: "noop" });
    expect(r.ok).toBe(true);
  });

  it("requestConfirmToken issues an envelope with TTL data", async () => {
    const env = await requestConfirmToken({
      actionId: "strategy.deploy_live",
      entityType: "strategy",
      entityId: "stg_001",
      payloadHash: "mock",
      tradingEnvironment: "live",
      platformEnvironment: "production",
    });
    expect(env.ok).toBe(true);
    expect(env.data.confirmToken).toBeTruthy();
    expect(env.data.requiredPhrase).toBeTruthy();
    expect(env.correlationId).toMatch(/^(corr_|cid_)/);
  });

  it("requestConfirmToken throws BffError for unknown action", async () => {
    await expect(
      requestConfirmToken({
        actionId: "unknown.bogus_action",
        entityType: "strategy",
        entityId: "x",
        payloadHash: "mock",
        tradingEnvironment: "live",
        platformEnvironment: "production",
      }),
    ).rejects.toBeInstanceOf(BffError);
  });
});

function meSession(sessionKind: "cookie" | "bearer" | "stub", opts: { env?: string; strict?: boolean } = {}) {
  return {
    data: {
      session: { authenticated: true, session_kind: sessionKind },
      environment: { name: opts.env ?? "dev", strict_auth: opts.strict ?? false },
    },
  };
}

function makeJsonResponse(body: unknown, status = 202): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeSessionFetch(sessionKind: "cookie" | "bearer" | "stub"): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(makeJsonResponse(meSession(sessionKind), 200));
}

function makeLiveFetch(body: unknown, status = 202, sessionKind: "cookie" | "bearer" | "stub" = "bearer"): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/bff/me")) return makeJsonResponse(meSession(sessionKind), 200);
    return makeJsonResponse(body, status);
  });
}

describe("VI-2 live-mode adaptLive normalization", () => {
  it("runAction adaptLive maps commandId→actionId and provides legacy for runActionSafe", async () => {
    setWriteEnv(true, "tok_live_test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const commandId = "cmd_abc123";
    let commandUrl = "";
    let commandBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/bff/me")) return makeJsonResponse(meSession("bearer"), 200);
      commandUrl = url;
      commandBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return makeJsonResponse({
        status: "accepted",
        data: { commandId, status: "accepted" },
        meta: { idempotency: { idempotencyKey: "idk_from_server" } },
      }, 202);
    });

    const env = await runAction(
      { kind: "Strategy", id: "stg_001", action: "activate" },
      { correlationId: "corr_live_01", idempotencyKey: "idk_caller_01" },
    );

    expect(env.ok).toBe(true);
    expect(env.data.actionId).toBe(commandId);
    expect(env.auditEventId).toBe(commandId);
    expect(env.correlationId).toBe("corr_live_01");
    expect(env.idempotencyKey).toBe("idk_from_server");
    // legacy must be present so runActionSafe can return r.envelope.legacy
    expect(env.legacy).toBeDefined();
    expect(env.legacy.ok).toBe(true);
    expect(env.legacy.audit.id).toBe(commandId);
    expect(commandUrl.endsWith("/bff/v1/commands")).toBe(true);
    expect(commandBody.command).toBe("StrategyAction");
    expect(commandBody.target).toEqual({ type: "Strategy", id: "stg_001" });
    expect(commandBody.action).toBe("activate");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toMatch(/\/bff\/me$/);
  });

  it("requestConfirmToken adaptLive maps tokenId→confirmToken with HighRiskConfirm fields", async () => {
    setWriteEnv(true, "tok_live_test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const tokenId = "ct_xyz789";
    const serverExpiresAt = "2026-09-15T19:00:00.000Z";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      makeLiveFetch({
        status: "accepted",
        data: { tokenId, commandId: "cmd_ct_01", expiresAt: serverExpiresAt },
        meta: { idempotency: { idempotencyKey: "idk_srv_ct" } },
      }, 201),
    );

    const env = await requestConfirmToken(
      {
        actionId: "strategy.deploy_live",
        entityType: "strategy",
        entityId: "stg_001",
        payloadHash: "h",
        tradingEnvironment: "live",
        platformEnvironment: "production",
      },
      {},
      { correlationId: "corr_ct_01" },
    );

    expect(env.ok).toBe(true);
    // HighRiskConfirm reads r.data.confirmToken
    expect(env.data.confirmToken).toBe(tokenId);
    // HighRiskConfirm reads r.data.requiredPhrase
    expect(env.data.requiredPhrase).toBeTruthy();
    // HighRiskConfirm reads r.data.expiresAt (preserves server value)
    expect(env.data.expiresAt).toBe(serverExpiresAt);
    expect(env.correlationId).toBe("corr_ct_01");
    expect(env.idempotencyKey).toBe("idk_srv_ct");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("VI-2 confirmToken propagation to live POST body", () => {
  it("runAction live POST body includes confirmToken from opts", async () => {
    setWriteEnv(true, "tok_live_test");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    let capturedBody: unknown;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_, init) => {
      if (!init?.body) return makeJsonResponse(meSession("bearer"), 200);
      capturedBody = JSON.parse((init as RequestInit).body as string);
      return makeJsonResponse({ status: "accepted", data: { commandId: "cmd_ct_prop" }, meta: {} }, 202);
    });

    await runAction(
      { kind: "Strategy", id: "stg_001", action: "deploy_live", memo: "approve deploy" },
      { confirmToken: "ctok_v3_abc123" },
    );

    expect((capturedBody as Record<string, unknown>).command).toBe("StrategyAction");
    expect((capturedBody as Record<string, unknown>).target).toEqual({ type: "Strategy", id: "stg_001" });
    expect((capturedBody as Record<string, unknown>).confirmToken).toBe("ctok_v3_abc123");
    expect(((capturedBody as Record<string, unknown>).params as Record<string, unknown>).confirmToken).toBe("ctok_v3_abc123");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("VI-2 session-kind write gate", () => {
  it("liveWriteGated fetches /bff/me with credentials and admits cookie-only sessions", async () => {
    setWriteEnv(true, null);
    const fetcher = makeSessionFetch("cookie");
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);
    await expect(liveWriteGated()).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toMatch(/\/bff\/me$/);
    expect((init as RequestInit).credentials).toBe("include");
  });

  it("honors the dev-host browser runtime real-write gate", async () => {
    setWriteEnv(false, null);
    window.sessionStorage.setItem("pantheon.integration.realWrites", "true");
    const fetcher = makeSessionFetch("cookie");
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);

    await expect(liveWriteGated()).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("honors the dev-host browser runtime strict fallback gate", async () => {
    setWriteEnv(false, null);
    window.sessionStorage.setItem("pantheon.integration.realWrites", "true");
    window.sessionStorage.setItem("pantheon.integration.fallback", "strict");
    vi.spyOn(globalThis, "fetch").mockImplementation(makeSessionFetch("stub"));

    await expect(liveWriteGated()).resolves.toBe(false);
  });

  it("sessionKindAllowsWrite blocks stub in production or strict mode", () => {
    expect(sessionKindAllowsWrite("cookie", { production: true, strict: true })).toBe(true);
    expect(sessionKindAllowsWrite("bearer", { production: true, strict: true })).toBe(true);
    expect(sessionKindAllowsWrite("stub", { production: false, strict: false })).toBe(true);
    expect(sessionKindAllowsWrite("stub", { production: true, strict: false })).toBe(false);
    expect(sessionKindAllowsWrite("stub", { production: false, strict: true })).toBe(false);
  });

  it("admits a strict stub session only for an explicitly enabled dev environment", async () => {
    setWriteEnv(true, "pantheon-dev-browser:operator,approver:mfa");
    process.env.VITE_BFF_FALLBACK = "strict";
    process.env.VITE_BFF_ALLOW_DEV_STUB_WRITES = "true";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeJsonResponse(meSession("stub", { env: "dev" }), 200),
    );

    await expect(liveWriteGated()).resolves.toBe(true);
  });

  it("never admits a production stub session through the dev override", async () => {
    setWriteEnv(true, "pantheon-dev-browser:operator,approver:mfa");
    process.env.VITE_BFF_FALLBACK = "strict";
    process.env.VITE_BFF_ALLOW_DEV_STUB_WRITES = "true";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeJsonResponse(meSession("stub", { env: "production" }), 200),
    );

    await expect(liveWriteGated()).resolves.toBe(false);
  });

  it("fails closed when any BFF environment marker says production", async () => {
    setWriteEnv(true, "pantheon-dev-browser:operator,approver:mfa");
    process.env.VITE_BFF_FALLBACK = "strict";
    process.env.VITE_BFF_ALLOW_DEV_STUB_WRITES = "true";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeJsonResponse({
        data: {
          env: "dev",
          session: { authenticated: true, session_kind: "stub" },
          environment: { name: "production", strict_auth: false },
        },
      }, 200),
    );

    await expect(liveWriteGated()).resolves.toBe(false);
  });

  it("runAction stays in mock when /bff/me rejects the session", async () => {
    setWriteEnv(true, null);
    const fetcher = vi.fn().mockResolvedValue(
      makeJsonResponse({ error: { code: "INVALID_TOKEN", message: "missing" } }, 401),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);
    const env = await runAction({ kind: "Strategy", id: "stg_001", action: "noop" });
    expect(env.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("requestConfirmToken uses live transport for a cookie-only session", async () => {
    setWriteEnv(true, null);
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const tokenId = "ct_cookie_only";
    const fetcher = makeLiveFetch({
      status: "accepted",
      data: { tokenId, commandId: "cmd_cookie_ct" },
      meta: { idempotency: { idempotencyKey: "idk_cookie" } },
    }, 201, "cookie");
    vi.spyOn(globalThis, "fetch").mockImplementation(fetcher);
    const env = await requestConfirmToken({
      actionId: "strategy.deploy_live",
      entityType: "strategy",
      entityId: "stg_001",
      payloadHash: "h",
      tradingEnvironment: "live",
      platformEnvironment: "production",
    });
    expect(env.ok).toBe(true);
    expect(env.data.confirmToken).toBe(tokenId);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

// PFG-FE-HONEST-LIVE-20260820 — strict-live (VITE_BFF_MODE=live +
// VITE_BFF_FALLBACK=strict, the hosted/production profile) must never
// synthesize a completed mutation receipt when real writes are off or the
// session lacks write authority. Only the explicit demo/test mock profile
// and the dev-default `auto` fallback may still route through the mock
// mutation fixtures.
describe("VI-2 strict-live write gate never fakes a completed receipt", () => {
  afterEach(() => {
    setWriteEnv(false, null);
    delete process.env.VITE_BFF_FALLBACK;
    liveStatus._reset();
    vi.restoreAllMocks();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("runAction rejects with a typed error instead of a mock-completed receipt when writes are disabled", async () => {
    process.env.VITE_BFF_FALLBACK = "strict";
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

    await expect(
      runAction({ kind: "Strategy", id: "stg_001", action: "noop" }),
    ).rejects.toMatchObject({ name: "BffError", code: "FEATURE_DISABLED" });
  });

  it("runAction rejects when writes are enabled but the session is not admitted", async () => {
    setWriteEnv(true, null);
    process.env.VITE_BFF_FALLBACK = "strict";
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "INVALID_TOKEN", message: "missing" } }), { status: 401 }),
    );

    await expect(
      runAction({ kind: "Strategy", id: "stg_001", action: "noop" }),
    ).rejects.toMatchObject({ name: "BffError", code: "FEATURE_DISABLED" });
  });

  it("runActionSafe surfaces the strict-live disabled write as a failure toast, never a success toast", async () => {
    process.env.VITE_BFF_FALLBACK = "strict";
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

    const result = await runActionSafe({ kind: "Strategy", id: "stg_001", action: "noop" });

    expect(result.ok).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("still returns a mock-completed receipt in the dev-default auto fallback (unchanged)", async () => {
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

    const env = await runAction({ kind: "Strategy", id: "stg_001", action: "noop" });
    expect(env.ok).toBe(true);
    expect(env.data.status).toBe("completed");
  });

  it("still returns a mock-completed receipt in the explicit demo/test mock profile (unchanged)", async () => {
    process.env.VITE_BFF_FALLBACK = "strict";
    // mode defaults to "mock" under NODE_ENV=test unless explicitly reset to live.
    liveStatus._reset();

    const env = await runAction({ kind: "Strategy", id: "stg_001", action: "noop" });
    expect(env.ok).toBe(true);
    expect(env.data.status).toBe("completed");
  });

  it("requestConfirmToken rejects in strict-live when writes are disabled", async () => {
    process.env.VITE_BFF_FALLBACK = "strict";
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

    await expect(
      requestConfirmToken({
        actionId: "strategy.deploy_live",
        entityType: "strategy",
        entityId: "stg_001",
        payloadHash: "mock",
        tradingEnvironment: "live",
        platformEnvironment: "production",
      }),
    ).rejects.toMatchObject({ name: "BffError", code: "FEATURE_DISABLED" });
  });

  it("decideApproval rejects in strict-live when writes are disabled", async () => {
    process.env.VITE_BFF_FALLBACK = "strict";
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

    await expect(
      writes.decideApproval("appr_001", "approve", "approved"),
    ).rejects.toMatchObject({ name: "BffError", code: "FEATURE_DISABLED" });
  });

  it("acknowledgeAlert rejects in strict-live when writes are disabled", async () => {
    process.env.VITE_BFF_FALLBACK = "strict";
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

    await expect(
      writes.acknowledgeAlert("alt_001", "ack memo"),
    ).rejects.toMatchObject({ name: "BffError", code: "FEATURE_DISABLED" });
  });

  it("decideIntervention rejects in strict-live when writes are disabled", async () => {
    process.env.VITE_BFF_FALLBACK = "strict";
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

    await expect(
      writes.decideIntervention("iv_001", "approve", "intervention memo"),
    ).rejects.toMatchObject({ name: "BffError", code: "FEATURE_DISABLED" });
  });
});

describe("FE-RESEARCH-JOBS-ACTIONS-CLOSURE-001 writes and closure contracts", () => {
  describe("buildRunActionCommand entity mapping", () => {
    it("maps Job target and params with job_id and action_id", () => {
      const cmd = buildRunActionCommand({ kind: "Job", id: "job_001", action: "cancel", reason: "manual cancel" });
      expect(cmd.target.type).toBe("Job");
      expect(cmd.target.id).toBe("job_001");
      expect(cmd.action).toBe("cancel");
      expect(cmd.params.job_id).toBe("job_001");
      expect(cmd.params.action_id).toBe("cancel");
      expect(cmd.params.reason).toBe("manual cancel");
    });

    it("maps Research experiment target and params with experiment_id and action_id", () => {
      const cmd = buildRunActionCommand({ kind: "Research", id: "exp_001", action: "retry" });
      expect(cmd.target.type).toBe("Experiment");
      expect(cmd.target.id).toBe("exp_001");
      expect(cmd.action).toBe("retry");
      expect(cmd.params.experiment_id).toBe("exp_001");
      expect(cmd.params.action_id).toBe("retry");
    });
  });

  describe("Job action execution contracts", () => {
    it("cancelJob places cancellation fence and returns cancelled receipt", async () => {
      const env = await cancelJob("job_001", { reason: "Operator stop" });
      expect(env.ok).toBe(true);
      expect(env.data.status).toBe("canceled");
      expect(env.data.receipt?.cancellationFencePlaced).toBe(true);
      expect(env.data.receipt?.fencePlaced).toBe(true);
      expect(env.data.receipt?.reason).toBe("Operator stop");
    });

    it("retryJob links new attempt and lineage", async () => {
      const env = await retryJob("job_001");
      expect(env.ok).toBe(true);
      expect(env.data.status).toBe("queued");
      expect(env.data.receipt?.parent_id).toBe("job_001");
      expect(env.data.receipt?.attempt_number).toBe(2);
      expect(env.data.receipt?.job_id).toContain("retry");
    });

    it("cancelJob fails closed with 503 citing GW-STOP-FENCE-001 for worker jobs", async () => {
      await expect(cancelJob("worker-sweep-1")).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining("GW-STOP-FENCE-001"),
      });
    });

    it("cancelJob fails closed with 503 citing TS-CANCEL-001 for trainer jobs", async () => {
      await expect(cancelJob("trainer-train-1")).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining("TS-CANCEL-001"),
      });
    });

    it("cancelJob fails closed with 503 citing SI-CANCEL-001 for ingest jobs", async () => {
      await expect(cancelJob("ingest-fetch-1")).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining("SI-CANCEL-001"),
      });
    });

    it("cancelJob fails closed with 503 citing PL-CANCEL-001 for policy jobs", async () => {
      await expect(cancelJob("policy-audit-1")).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining("PL-CANCEL-001"),
      });
    });

    it("cancelJob fails closed with 400 for openclaw jobs", async () => {
      await expect(cancelJob("openclaw-diag-1")).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining("OpenClaw workflow jobs are permanently read-only"),
      });
    });

    it("refuses job actions in strict-live when writes are disabled", async () => {
      process.env.VITE_BFF_FALLBACK = "strict";
      liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

      await expect(cancelJob("job_001")).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
      await expect(retryJob("job_001")).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
    });
  });

  describe("Experiment action execution contracts", () => {
    it("cancelResearchExperiment places cancellation fence and returns cancelled status", async () => {
      const env = await cancelResearchExperiment("exp_001", { reason: "Budget cut" });
      expect(env.ok).toBe(true);
      expect(env.data.status).toBe("canceled");
      expect(env.data.receipt?.cancellationFencePlaced).toBe(true);
      expect(env.data.receipt?.fencePlaced).toBe(true);
    });

    it("retryResearchExperiment creates linked attempt lineage", async () => {
      const env = await retryResearchExperiment("exp_001");
      expect(env.ok).toBe(true);
      expect(env.data.status).toBe("queued");
      expect(env.data.receipt?.parent_attempt_id).toBe("exp_001");
      expect(env.data.receipt?.attempt_number).toBe(2);
      expect(env.data.receipt?.experiment_id).toContain("retry");
    });

    it("archiveResearchExperiment marks visibility and retention without delete", async () => {
      const env = await archiveResearchExperiment("exp_001");
      expect(env.ok).toBe(true);
      expect(env.data.receipt?.archived).toBe(true);
    });

    it("invalidateResearchExperiment sets invalidation reason", async () => {
      const env = await invalidateResearchExperiment("exp_001", "data contaminated");
      expect(env.ok).toBe(true);
      expect(env.data.receipt?.invalidated).toBe(true);
      expect(env.data.receipt?.invalidationReason).toBe("data contaminated");
    });

    it("promoteResearchExperiment fails closed with 409 citing GOV-PROMOTE-001", async () => {
      await expect(promoteResearchExperiment("exp_001")).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining("GOV-PROMOTE-001"),
      });
    });

    it("refuses experiment actions in strict-live when writes are disabled", async () => {
      process.env.VITE_BFF_FALLBACK = "strict";
      liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });

      await expect(cancelResearchExperiment("exp_001")).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
      await expect(retryResearchExperiment("exp_001")).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
      await expect(archiveResearchExperiment("exp_001")).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
      await expect(invalidateResearchExperiment("exp_001", "test")).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
      await expect(promoteResearchExperiment("exp_001")).rejects.toMatchObject({
        name: "BffError",
        code: "FEATURE_DISABLED",
      });
    });
  });
});


