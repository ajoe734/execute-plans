import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activateAssistantControlMode,
  askManagementAi,
  streamManagementAi,
  fetchAssistantModeStatus,
  fetchAssistantProviderUsageSummary,
  fetchAssistantProviders,
  fetchAssistantProviderReauthStatus,
  fetchManagementAiConversationList,
  registerAssistantProvider,
  startAssistantProviderReauth,
  submitAssistantProviderReauthCode,
} from "@/lib/bff-v1/managementAi";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function streamResponse(frames: string[], status = 200): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  }), {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("Management AI provider status", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it("reads assistant provider auth readiness with usage quota from the BFF", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      status: "ok",
      data: [
        {
          provider: "codex",
          provider_name: "Codex CLI",
          runtime: "openclaw_gateway_cli_mount",
          ready: false,
          status: "degraded",
          auth_status: "failed",
          degraded_reason: "refresh token expired",
          mount_mode: "service_user",
          usage: {
            status: "captured",
            source: "snapshot",
            remaining: 12,
            remaining_percent: 24,
            limit: 50,
            used: 38,
            unit: "requests",
            reset_at: "2026-06-29T00:00:00Z",
          },
        },
      ],
      meta: { auth_probe: true },
    }));
    globalThis.fetch = fetchMock;

    const result = await fetchAssistantProviders({ authProbe: true });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/assistant/providers?auth_probe=true");
    expect(result.providers[0]).toMatchObject({
      provider: "codex",
      providerName: "Codex CLI",
      ready: false,
      authStatus: "failed",
      degradedReason: "refresh token expired",
    });
    expect(result.providers[0].usage).toMatchObject({
      remaining: 12,
      remainingPercent: 24,
      limit: 50,
      used: 38,
      resetAt: "2026-06-29T00:00:00Z",
    });
  });

  it("reads assistant provider usage history and quota summary from the BFF", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      status: "ok",
      data: {
        providers: [
          {
            provider: "codex_cli",
            provider_name: "Codex CLI",
            runtime: "openclaw_gateway_cli_mount",
            ready: true,
            auth_status: "ready",
            live_auth: true,
            calls: 7,
            success_count: 6,
            failed_count: 1,
            prompt_bytes: 1200,
            input_tokens: 100,
            output_tokens: 40,
            total_tokens: 140,
            quota: {
              status: "captured",
              source: "provider_snapshot",
              remaining: 12,
              used: 38,
              limit: 50,
              unit: "requests",
            },
            observed_usage: {
              source: "management_ai_bff_audit",
              coverage: "bff_observed_management_ai_only",
              coverage_label: "BFF observed",
              stale: true,
              stale_after_hours: 24,
              last_observed_at: "2026-06-28T11:07:35Z",
              calls: 7,
              total_tokens: 140,
            },
            models: [
              {
                model: "gpt-5-codex",
                calls: 7,
                total_tokens: 140,
              },
            ],
          },
        ],
        totals: {
          providers: 1,
          live_auth_count: 1,
          calls: 7,
          total_tokens: 140,
        },
        quota: {
          truth_policy: "provider_snapshot_only",
        },
        usage: {
          truth_policy: "observed_bff_events_only",
          source: "management_ai_bff_audit",
        },
      },
      meta: { auth_probe: false },
    }));
    globalThis.fetch = fetchMock;

    const result = await fetchAssistantProviderUsageSummary({ windowHours: 168, limit: 500 });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://bff.example.test/bff/assistant/providers/usage-summary?auth_probe=false&window_hours=168&limit=500",
    );
    expect(result.totals.liveAuthCount).toBe(1);
    expect(result.totals.totalTokens).toBe(140);
    expect(result.providers[0]).toMatchObject({
      provider: "codex_cli",
      providerName: "Codex CLI",
      liveAuth: true,
      calls: 7,
      totalTokens: 140,
    });
    expect(result.providers[0].quota).toMatchObject({
      source: "provider_snapshot",
      remaining: 12,
      used: 38,
    });
    expect(result.providers[0].observedUsage).toMatchObject({
      source: "management_ai_bff_audit",
      coverage: "bff_observed_management_ai_only",
      coverageLabel: "BFF observed",
      stale: true,
      staleAfterHours: 24,
    });
    expect(result.usage).toMatchObject({
      truth_policy: "observed_bff_events_only",
      source: "management_ai_bff_audit",
    });
    expect(result.providers[0].models?.[0]).toMatchObject({
      model: "gpt-5-codex",
      totalTokens: 140,
    });
  });
});

describe("Management AI control mode", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it("adapts kernel and control-mode status from BFF mode endpoint", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        product_default_mode: "user",
        kernel_enabled: true,
        control_mode: {
          state: "active",
          active: true,
          mode: "kernel_debug",
          activation_id: "act_123",
          expires_at: "2026-06-08T05:00:00Z",
          idle_expires_at: "2026-06-08T04:20:00Z",
          command_classes: ["code_search", "file_slice"],
        },
      },
    }));
    globalThis.fetch = fetchMock;

    const result = await fetchAssistantModeStatus();

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/assistant/mode");
    expect(result.status.kernelEnabled).toBe(true);
    expect(result.status.controlMode?.active).toBe(true);
    expect(result.status.controlMode?.mode).toBe("kernel_debug");
    expect(result.status.controlMode?.commandClasses).toEqual(["code_search", "file_slice"]);
  });

  it("posts passphrase only to the control-mode activation endpoint", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        state: "active",
        active: true,
        mode: "kernel_debug",
        activationId: "act_456",
      },
    }, 202));
    globalThis.fetch = fetchMock;

    const result = await activateAssistantControlMode({
      passphrase: "control phrase ok",
      mode: "kernel_debug",
      reason: "debug from test",
      ttlSeconds: 900,
      idleTtlSeconds: 120,
      managementSessionId: "mgmt-nl-test",
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/assistant/control-mode/activate");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      passphrase: "control phrase ok",
      mode: "kernel_debug",
      reason: "debug from test",
      ttlSeconds: 900,
      idleTtlSeconds: 120,
      managementSessionId: "mgmt-nl-test",
    });
    expect(result.controlMode.active).toBe(true);
  });

  it("surfaces control-mode precondition failures", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({
      detail: {
        error: {
          message: "Mode policy violation: Kernel sessions are disabled.",
        },
      },
    }, 403));

    const result = await activateAssistantControlMode({
      passphrase: "control phrase ok",
      mode: "kernel_debug",
      reason: "diagnostic from test",
    });

    expect(result.kind).toBe("failure");
    if (result.kind !== "failure") throw new Error("expected failure");
    expect(result.statusCode).toBe(403);
    expect(result.message).toContain("Kernel sessions are disabled");
  });
});


describe("Management AI provider reauth", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it("starts Codex provider reauth through the assistant BFF route", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        provider: "codex",
        status: "pending",
        reauth_session_id: "reauth_123",
        verification_uri: "https://github.com/login/device",
        user_code: "ABCD-EFGH",
        expires_at: "2026-06-09T05:30:00Z",
        interval_seconds: 5,
        credential_exchange: {
          bff_handles_credentials: false,
          frontend_handles_credentials: false,
          method: "device_flow",
        },
      },
    }, 202));
    globalThis.fetch = fetchMock;

    const result = await startAssistantProviderReauth({
      provider: "codex",
      reason: "CODEX_AUTH_UNAVAILABLE",
      traceId: "mnl-trace-test",
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/assistant/provider/reauth");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toMatchObject({
      provider: "codex",
      reason: "CODEX_AUTH_UNAVAILABLE",
      traceId: "mnl-trace-test",
    });
    expect(result.reauth.reauthSessionId).toBe("reauth_123");
    expect(result.reauth.verificationUri).toBe("https://github.com/login/device");
    expect(result.reauth.userCode).toBe("ABCD-EFGH");
    expect(result.reauth.credentialExchange?.bffHandlesCredentials).toBe(false);
    expect(result.reauth.credentialExchange?.frontendHandlesCredentials).toBe(false);
  });

  it("reads provider reauth status with provider query", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        provider: "codex",
        status: "authorized",
        reauthSessionId: "reauth_123",
        verificationUriComplete: "https://github.com/login/device?user_code=ABCD-EFGH",
        userCode: "ABCD-EFGH",
      },
    }));
    globalThis.fetch = fetchMock;

    const result = await fetchAssistantProviderReauthStatus("reauth_123", "codex");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/assistant/provider/reauth/reauth_123?provider=codex");
    expect(result.reauth.status).toBe("authorized");
    expect(result.reauth.verificationUriComplete).toContain("user_code=ABCD-EFGH");
  });

  it("submits Claude provider reauth authorization code through the assistant BFF route", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        provider: "claude",
        status: "code_submitted",
        reauth_session_id: "claude_reauth_123",
        code_submitted_at: "2026-07-01T00:00:00Z",
      },
    }));
    globalThis.fetch = fetchMock;

    const result = await submitAssistantProviderReauthCode({
      provider: "claude",
      sessionId: "claude_reauth_123",
      code: "claude-oauth-code-123",
      traceId: "trace-code-1",
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://bff.example.test/bff/assistant/provider/reauth/claude_reauth_123/code?provider=claude",
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toMatchObject({
      provider: "claude",
      code: "claude-oauth-code-123",
      traceId: "trace-code-1",
    });
    expect(result.reauth.status).toBe("code_submitted");
    expect(result.reauth.reauthSessionId).toBe("claude_reauth_123");
  });

  it("surfaces provider reauth failures", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({
      detail: {
        error: {
          message: "Assistant provider reauth requires MFA",
        },
      },
    }, 403));

    const result = await startAssistantProviderReauth({ provider: "codex" });

    expect(result.kind).toBe("failure");
    if (result.kind !== "failure") throw new Error("expected failure");
    expect(result.statusCode).toBe(403);
    expect(result.message).toContain("requires MFA");
  });

  it("labels missing provider reauth routes as route unavailable", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("not found", {
      status: 404,
      statusText: "Not Found",
      headers: { "content-type": "text/plain" },
    }));

    const result = await startAssistantProviderReauth({ provider: "claude" });

    expect(result.kind).toBe("failure");
    if (result.kind !== "failure") throw new Error("expected failure");
    expect(result.statusCode).toBe(404);
    expect(result.message).toBe("BFF route unavailable: /bff/assistant/provider/reauth");
  });
});

describe("Management AI provider registry", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it("registers a new provider through the assistant BFF route", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        provider: "gemini_cli",
        provider_name: "Gemini CLI",
        runtime: "external_llm",
        status: "registered",
        ready: false,
        auth_status: "not_configured",
        reauth_supported: false,
      },
      meta: { openclawAdapterStatus: "ok" },
    }, 201));
    globalThis.fetch = fetchMock;

    const result = await registerAssistantProvider({
      provider: "gemini_cli",
      providerName: "Gemini CLI",
      model: "gemini-2.5-pro",
      authStrategy: "manual",
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/assistant/providers");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toMatchObject({
      provider: "gemini_cli",
      providerName: "Gemini CLI",
      model: "gemini-2.5-pro",
      authStrategy: "manual",
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(result.provider.provider).toBe("gemini_cli");
    expect(result.provider.reauthSupported).toBe(false);
  });
});

describe("Management AI stream", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it("adapts done provider status and stops on DONE", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([
      'data: {"type":"meta","sessionId":"mgmt-chat-1","traceId":"trace-1","messageId":"mnl-1"}\n\n',
      'data: {"type":"delta","text":"Control mode is inactive"}\n\n',
      'data: {"type":"done","text":"Control mode is inactive","providerStatus":{"provider":"pantheon_bff","runtime":"management_nl_control_command_interceptor","status":"completed","used":true,"fallback":null},"auditLog":{"href":"/audit/1"},"conversation":{"href":"/conversation/1"}}\n\n',
      'data: [DONE]\n\n',
    ]));
    globalThis.fetch = fetchMock;

    const previews: string[] = [];
    const result = await streamManagementAi(
      { question: "/control status" },
      { onDelta: (_chunk, full) => previews.push(full) },
    );

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/management/nl/ask/stream");
    expect(result.answer).toBe("Control mode is inactive");
    expect(result.providerStatus.provider).toBe("pantheon_bff");
    expect(result.providerStatus.runtime).toBe("management_nl_control_command_interceptor");
    expect(result.auditLogHref).toBe("/audit/1");
    expect(result.conversationHref).toBe("/conversation/1");
    expect(previews.at(-1)).toBe("Control mode is inactive");
  });

  it("surfaces stream errors as provider degradation", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    globalThis.fetch = vi.fn().mockResolvedValue(streamResponse([
      'data: {"type":"meta","sessionId":"mgmt-chat-err","traceId":"trace-err"}\n\n',
      'data: {"type":"error","error_code":"OPENCLAW_RESPONSES_FAILED","message":"provider failed"}\n\n',
      'data: [DONE]\n\n',
    ]));

    const result = await streamManagementAi({ question: "?" });

    expect(result.kind).toBe("provider_degraded");
    if (result.kind !== "provider_degraded") throw new Error("expected provider_degraded");
    expect(result.sessionId).toBe("mgmt-chat-err");
    expect(result.providerStatus?.status).toBe("degraded");
    expect(result.providerStatus?.reasonCode).toBe("OPENCLAW_RESPONSES_FAILED");
    expect(result.message).toBe("provider failed");
  });
});

describe("Management AI conversation list (history index hydration)", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it("lists server-side conversations and normalizes snake/camel fields", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [
        { session_id: "mgmt-nl-aaa", title: "first chat", updated_at: "2026-06-20T10:00:00Z", created_at: "2026-06-20T09:00:00Z", turn_count: 4 },
        { sessionId: "mgmt-nl-bbb", title: "", updatedAt: "2026-06-21T11:00:00Z", turnCount: 2 },
        { title: "no id — dropped" },
      ],
      meta: { count: 2 },
    }));
    globalThis.fetch = fetchMock;

    const res = await fetchManagementAiConversationList(50);

    expect(res.ok).toBe(true);
    if (res.kind !== "ok") throw new Error("expected ok");
    expect(res.conversations).toHaveLength(2);
    expect(res.conversations[0]).toEqual({
      sessionId: "mgmt-nl-aaa",
      title: "first chat",
      updatedAt: "2026-06-20T10:00:00Z",
      createdAt: "2026-06-20T09:00:00Z",
      turnCount: 4,
    });
    expect(res.conversations[1].sessionId).toBe("mgmt-nl-bbb");
    expect(res.conversations[1].turnCount).toBe(2);

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/management/ai/conversations");
    expect(calledUrl).toContain("limit=50");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET" });
  });

  it("lists server-side conversations when wrapped in nested data.items object structure", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        id: "management_ai_conversations",
        items: [
          { session_id: "mgmt-nl-aaa", title: "nested chat", updated_at: "2026-06-20T10:00:00Z", created_at: "2026-06-20T09:00:00Z", turn_count: 4 },
        ]
      },
      meta: { count: 1 },
    }));
    globalThis.fetch = fetchMock;

    const res = await fetchManagementAiConversationList(10);

    expect(res.ok).toBe(true);
    if (res.kind !== "ok") throw new Error("expected ok");
    expect(res.conversations).toHaveLength(1);
    expect(res.conversations[0].sessionId).toBe("mgmt-nl-aaa");
    expect(res.conversations[0].title).toBe("nested chat");
  });

  it("returns a visible failure when the BFF list endpoint errors", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ detail: "boom" }, 500));

    const res = await fetchManagementAiConversationList();

    expect(res.ok).toBe(false);
    if (res.kind !== "failure") throw new Error("expected failure");
    expect(res.status).toBe(500);
  });
});
