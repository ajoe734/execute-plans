import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import {
  OpenClawLlmAuthPanel,
  type OpenClawLlmAuthApi,
} from "./OpenClawLlmAuthPanel";
import type {
  AssistantProviderUsageSummaryResult,
  AssistantProvidersResult,
} from "@/lib/bff-v1/managementAi";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function api(overrides: Partial<OpenClawLlmAuthApi> = {}): OpenClawLlmAuthApi {
  return {
    fetchProviders: vi.fn().mockResolvedValue({
      ok: true,
      kind: "ok",
      status: "ok",
      providers: [
        {
          provider: "codex",
          providerName: "Codex CLI",
          runtime: "openclaw_gateway_cli_mount",
          ready: false,
          status: "degraded",
          authStatus: "failed",
          degradedReason: "refresh token expired",
          mountMode: "service_user",
          checkedAt: "2026-06-28T12:00:00Z",
          usage: {
            status: "captured",
            remaining: 12,
            remainingPercent: 24,
            limit: 50,
            used: 38,
            unit: "requests",
            resetAt: "2026-06-29T00:00:00Z",
          },
        },
      ],
      meta: { auth_probe: true },
    }),
    fetchMode: vi.fn().mockResolvedValue({
      ok: true,
      kind: "ok",
      status: {
        kernelEnabled: true,
        controlMode: {
          active: true,
          mode: "kernel_debug",
          state: "active",
        },
      },
    }),
    fetchOrchestratorStatus: vi.fn().mockResolvedValue({
      ok: true,
      kind: "ok",
      status: {
        providerStatus: {
          provider: "codex_cli",
          runtime: "openclaw_gateway_cli_mount",
          status: "degraded",
          used: false,
          fallback: null,
        },
      },
    }),
    fetchUsageSummary: vi.fn().mockResolvedValue({
      ok: true,
      kind: "ok",
      status: "ok",
      providers: [
        {
          provider: "codex_cli",
          providerName: "Codex CLI",
          runtime: "openclaw_gateway_cli_mount",
          ready: true,
          authStatus: "ready",
          liveAuth: true,
          calls: 7,
          successCount: 6,
          failedCount: 1,
          promptBytes: 1200,
          inputTokens: 100,
          outputTokens: 40,
          totalTokens: 140,
          quota: {
            status: "captured",
            source: "provider_snapshot",
            remaining: 12,
            remainingPercent: 24,
            limit: 50,
            used: 38,
            unit: "requests",
          },
          observedUsage: {
            source: "management_ai_bff_audit",
            coverage: "bff_observed_management_ai_only",
            coverageLabel: "BFF observed",
            stale: false,
            calls: 7,
            totalTokens: 140,
          },
          providerAuth: { status: "authorized", authenticated: true },
          liveSmoke: { status: "passed", passed: true },
          readiness: { ready: true, mount_ready_is_sufficient: false },
          personaDependencies: { status: "available", count: 3, personas: ["alpha", "beta", "gamma"] },
          reauth: { status: "completed", code_entry_required: false },
          models: [
            {
              model: "gpt-5-codex",
              calls: 7,
              totalTokens: 140,
            },
          ],
        },
      ],
      totals: {
        providers: 1,
        liveAuthCount: 1,
        calls: 7,
        successCount: 6,
        failedCount: 1,
        totalTokens: 140,
      },
      quota: {
        truthPolicy: "provider_snapshot_only",
      },
      meta: { auth_probe: false },
    } satisfies AssistantProviderUsageSummaryResult),
    activateControlMode: vi.fn().mockResolvedValue({
      ok: true,
      kind: "ok",
      controlMode: {
        active: true,
        mode: "kernel_debug",
        state: "active",
      },
    }),
    startReauth: vi.fn().mockResolvedValue({
      ok: true,
      kind: "ok",
      reauth: {
        provider: "codex",
        status: "pending",
        reauthSessionId: "codex_reauth_1",
        verificationUri: "https://example.test/device",
        verificationUriComplete: null,
        userCode: "ABCD-EFGH",
        expiresAt: "2026-06-28T12:15:00Z",
        intervalSeconds: 5,
        credentialExchange: { bffHandlesCredentials: true },
      },
    }),
    fetchReauthStatus: vi.fn().mockResolvedValue({
      ok: true,
      kind: "ok",
      reauth: {
        provider: "codex",
        status: "completed",
        reauthSessionId: "codex_reauth_1",
        verificationUri: null,
        verificationUriComplete: null,
        userCode: null,
        expiresAt: null,
        intervalSeconds: null,
        credentialExchange: { bffHandlesCredentials: true },
      },
    }),
    submitReauthCode: vi.fn().mockResolvedValue({
      ok: true,
      kind: "ok",
      reauth: {
        provider: "claude",
        status: "code_submitted",
        reauthSessionId: "claude_reauth_1",
        verificationUri: null,
        verificationUriComplete: null,
        userCode: null,
        expiresAt: null,
        intervalSeconds: 5,
        credentialExchange: {
          bffHandlesCredentials: false,
          requiresAuthorizationCode: true,
          codeSubmitToBff: true,
        },
      },
    }),
    registerProvider: vi.fn().mockResolvedValue({
      ok: true,
      kind: "ok",
      provider: {
        provider: "gemini_cli",
        providerName: "Gemini CLI",
        runtime: "external_llm",
        ready: false,
        status: "registered",
        authStatus: "not_configured",
        reauthSupported: false,
      },
      meta: null,
    }),
    ...overrides,
  };
}

describe("OpenClawLlmAuthPanel", () => {
  it("does not report auth ready while provider auth status is still loading", async () => {
    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel
          api={api({
            fetchProviders: vi.fn().mockReturnValue(new Promise(() => {})),
          })}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("checking auth")).toBeInTheDocument();
    expect(screen.getByText("Checking LLM provider auth status.")).toBeInTheDocument();
    expect(screen.queryByText("auth ready")).not.toBeInTheDocument();
  });

  it("shows a fast provider snapshot while the auth probe refreshes in the background", async () => {
    const probe = deferred<AssistantProvidersResult>();
    const fetchProviders = vi.fn(({ authProbe }: { authProbe?: boolean }) => {
      if (authProbe) return probe.promise;
      return Promise.resolve({
        ok: true,
        kind: "ok",
        status: "ok",
        providers: [
          {
            provider: "codex",
            providerName: "Codex CLI",
            runtime: "openclaw_gateway_cli_mount",
            ready: true,
            status: "ready",
            authStatus: "not_checked",
          },
        ],
        meta: { auth_probe: false },
      } satisfies AssistantProvidersResult);
    });

    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel api={api({ fetchProviders })} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Codex CLI")).toBeInTheDocument();
    expect(screen.getByText("checking auth")).toBeInTheDocument();
    expect(screen.getByText("Updating LLM provider auth probe results.")).toBeInTheDocument();
    expect(screen.getByText("not_checked").closest("[class]")?.className).not.toContain("border-status-success/30");

    await act(async () => {
      probe.resolve({
        ok: true,
        kind: "ok",
        status: "ok",
        providers: [
          {
            provider: "codex",
            providerName: "Codex CLI",
            runtime: "openclaw_gateway_cli_mount",
            ready: false,
            status: "degraded",
            authStatus: "failed",
            degradedReason: "refresh token expired",
          },
        ],
        meta: { auth_probe: true },
      });
    });

    expect(await screen.findByText("1 attention")).toBeInTheDocument();
    expect(screen.getByText("refresh token expired")).toBeInTheDocument();
    expect(screen.queryByText("Updating LLM provider auth probe results.")).not.toBeInTheDocument();
  });

  it("renders provider auth and quota status in summary mode with management link", async () => {
    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel mode="summary" api={api()} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("LLM Provider Auth")).toBeInTheDocument();
    expect(screen.getByText("Codex CLI")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("12 requests (24%)")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("140")).toBeInTheDocument();
    expect(screen.getByText("authorized")).toBeInTheDocument();
    expect(screen.getByText("passed")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open provider auth" })).toHaveAttribute(
      "href",
      "/management/llm-provider-auth",
    );
  });

  it("renders OpenClaw readiness as adapter status instead of an auth provider", async () => {
    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel
          mode="full"
          api={api({
            fetchProviders: vi.fn().mockResolvedValue({
              ok: true,
              kind: "ok",
              status: "ok",
              providers: [
                {
                  provider: "openclaw",
                  providerName: "OpenClaw",
                  runtime: "openclaw_gateway_agent_cli",
                  ready: true,
                  status: "ready",
                  authStatus: "ready",
                  mountMode: "agent_cli",
                  source: "adapter_probe",
                  checkedAt: "2026-06-30T01:00:00Z",
                },
                {
                  provider: "claude",
                  providerName: "Claude CLI",
                  runtime: "openclaw_gateway_cli_mount",
                  ready: false,
                  status: "degraded",
                  authStatus: "failed",
                  degradedReason: "claude_auth_probe_non_zero_exit",
                  reauthSupported: false,
                },
              ],
              meta: { auth_probe: true },
            } satisfies AssistantProvidersResult),
          })}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText("OpenClaw adapter status")).toBeInTheDocument();
    expect(screen.getByText("OpenClaw adapter")).toBeInTheDocument();
    expect(screen.getByText("openclaw_gateway_agent_cli")).toBeInTheDocument();
    expect(screen.getByText("Claude CLI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /adapter reauth missing/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /OpenClaw/i })).not.toBeInTheDocument();
  });

  it("starts provider reauth from the full management page", async () => {
    const fakeApi = api();
    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel mode="full" api={fakeApi} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /start reauth/i }));

    await waitFor(() => {
      expect(fakeApi.startReauth).toHaveBeenCalledWith({
        provider: "codex",
        reason: "LLM Provider Auth management",
      });
    });
    expect(await screen.findByText("code=ABCD-EFGH")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open login/i })).toHaveAttribute("href", "https://example.test/device");
  });

  it("starts Claude provider reauth from a failed auth card", async () => {
    const fakeApi = api({
      fetchProviders: vi.fn().mockResolvedValue({
        ok: true,
        kind: "ok",
        status: "ok",
        providers: [
          {
            provider: "claude",
            providerName: "Claude CLI",
            runtime: "openclaw_gateway_cli_mount",
            ready: false,
            status: "degraded",
            authStatus: "failed",
            degradedReason: "claude_auth_probe_non_zero_exit",
            reauthSupported: true,
          },
        ],
        meta: { auth_probe: true },
      } satisfies AssistantProvidersResult),
      startReauth: vi.fn().mockResolvedValue({
        ok: true,
        kind: "ok",
        reauth: {
          provider: "claude",
          status: "pending",
          reauthSessionId: "claude_reauth_1",
          verificationUri: "https://console.anthropic.com/login",
          verificationUriComplete: null,
          userCode: "WXYZ-1234",
          expiresAt: null,
          intervalSeconds: 5,
          credentialExchange: { bffHandlesCredentials: false },
        },
      }),
    });
    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel mode="full" api={fakeApi} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /start reauth/i }));

    await waitFor(() => {
      expect(fakeApi.startReauth).toHaveBeenCalledWith({
        provider: "claude",
        reason: "LLM Provider Auth management",
      });
    });
    expect(await screen.findByText("claude reauth pending")).toBeInTheDocument();
    expect(screen.getByText("code=WXYZ-1234")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open login/i })).toHaveAttribute("href", "https://console.anthropic.com/login");
  });

  it("submits Claude authorization code back to the provider reauth session", async () => {
    const fakeApi = api({
      fetchProviders: vi.fn().mockResolvedValue({
        ok: true,
        kind: "ok",
        status: "ok",
        providers: [
          {
            provider: "claude",
            providerName: "Claude CLI",
            runtime: "openclaw_gateway_cli_mount",
            ready: false,
            status: "degraded",
            authStatus: "failed",
            degradedReason: "claude_auth_probe_non_zero_exit",
            reauthSupported: true,
          },
        ],
        meta: { auth_probe: true },
      } satisfies AssistantProvidersResult),
      startReauth: vi.fn().mockResolvedValue({
        ok: true,
        kind: "ok",
        reauth: {
          provider: "claude",
          status: "pending",
          reauthSessionId: "claude_reauth_1",
          verificationUri: null,
          verificationUriComplete: "https://console.anthropic.com/oauth/authorize?client_id=abc&code=true",
          userCode: "true",
          expiresAt: null,
          intervalSeconds: 5,
          credentialExchange: {
            bffHandlesCredentials: false,
            requiresAuthorizationCode: true,
            codeSubmitToBff: true,
          },
        },
      }),
      submitReauthCode: vi.fn().mockResolvedValue({
        ok: true,
        kind: "ok",
        reauth: {
          provider: "claude",
          status: "code_submitted",
          reauthSessionId: "claude_reauth_1",
          verificationUri: null,
          verificationUriComplete: null,
          userCode: null,
          expiresAt: null,
          intervalSeconds: 5,
          credentialExchange: {
            bffHandlesCredentials: false,
            requiresAuthorizationCode: true,
            codeSubmitToBff: true,
          },
        },
      }),
    });
    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel mode="full" api={fakeApi} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /start reauth/i }));

    expect(await screen.findByText("claude reauth pending")).toBeInTheDocument();
    expect(screen.queryByText("code=true")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Authorization code"), {
      target: { value: "claude-oauth-code-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit code/i }));

    await waitFor(() => {
      expect(fakeApi.submitReauthCode).toHaveBeenCalledWith({
        provider: "claude",
        sessionId: "claude_reauth_1",
        code: "claude-oauth-code-123",
      });
    });
    expect(await screen.findByText("claude reauth code_submitted")).toBeInTheDocument();
  });

  it("keeps the Claude authorization code field visible for a failed pre-submit session", async () => {
    const fakeApi = api({
      fetchProviders: vi.fn().mockResolvedValue({
        ok: true,
        kind: "ok",
        status: "ok",
        providers: [
          {
            provider: "claude",
            providerName: "Claude CLI",
            runtime: "openclaw_gateway_cli_mount",
            ready: false,
            status: "degraded",
            authStatus: "failed",
            degradedReason: "claude_auth_probe_non_zero_exit",
            reauthSupported: true,
          },
        ],
        meta: { auth_probe: true },
      } satisfies AssistantProvidersResult),
      startReauth: vi.fn().mockResolvedValue({
        ok: true,
        kind: "ok",
        reauth: {
          provider: "claude",
          status: "failed",
          reauthSessionId: "claude_reauth_failed_before_code",
          verificationUri: null,
          verificationUriComplete: "https://console.anthropic.com/oauth/authorize?client_id=abc&code=true",
          userCode: "true",
          expiresAt: null,
          intervalSeconds: 5,
          credentialExchange: {
            bffHandlesCredentials: false,
            requiresAuthorizationCode: true,
            codeSubmitToBff: true,
          },
          errorCode: "CLAUDE_REAUTH_LOGIN_INTERRUPTED",
          message: "Claude login needs an authorization code.",
        },
      }),
    });
    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel mode="full" api={fakeApi} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /start reauth/i }));

    expect(await screen.findByText("claude reauth failed")).toBeInTheDocument();
    expect(screen.getByLabelText("Authorization code")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open login/i })).toHaveAttribute(
      "href",
      "https://console.anthropic.com/oauth/authorize?client_id=abc&code=true",
    );
  });

  it("shows submitted Claude auth code state without another code input", async () => {
    const fakeApi = api({
      fetchProviders: vi.fn().mockResolvedValue({
        ok: true,
        kind: "ok",
        status: "ok",
        providers: [
          {
            provider: "claude",
            providerName: "Claude CLI",
            runtime: "openclaw_gateway_cli_mount",
            ready: false,
            status: "degraded",
            authStatus: "failed",
            degradedReason: "claude_auth_probe_non_zero_exit",
            reauthSupported: true,
          },
        ],
        meta: { auth_probe: true },
      } satisfies AssistantProvidersResult),
      startReauth: vi.fn().mockResolvedValue({
        ok: true,
        kind: "ok",
        reauth: {
          provider: "claude",
          status: "completed",
          reauthSessionId: "claude_reauth_completed_with_warning",
          verificationUri: null,
          verificationUriComplete: "https://claude.com/cai/oauth/authorize?code=true",
          userCode: null,
          expiresAt: null,
          intervalSeconds: 5,
          credentialExchange: {
            bffHandlesCredentials: false,
            requiresAuthorizationCode: true,
            codeSubmitToBff: true,
          },
          codeSubmittedAt: "2026-07-02T01:33:58Z",
          warningCode: "CLAUDE_REAUTH_READY_PROBE_DEGRADED",
          message: "Claude auth login accepted the authorization code; readiness probe is still degraded.",
        },
      }),
    });
    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel mode="full" api={fakeApi} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /start reauth/i }));

    expect(await screen.findByText("claude reauth completed")).toBeInTheDocument();
    expect(screen.getByText("code submitted=2026-07-02T01:33:58Z")).toBeInTheDocument();
    expect(screen.queryByLabelText("Authorization code")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open login/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reauth again/i })).toBeInTheDocument();
    expect(screen.getByText("Claude auth login accepted the authorization code; readiness probe is still degraded.")).toBeInTheDocument();
  });

  it("keeps provider reauth state inside the provider card that started it", async () => {
    const fakeApi = api({
      fetchProviders: vi.fn().mockResolvedValue({
        ok: true,
        kind: "ok",
        status: "ok",
        providers: [
          {
            provider: "codex",
            providerName: "Codex CLI",
            runtime: "openclaw_gateway_cli_mount",
            ready: true,
            status: "ready",
            authStatus: "ready",
            reauthSupported: true,
          },
          {
            provider: "claude",
            providerName: "Claude CLI",
            runtime: "openclaw_gateway_cli_mount",
            ready: false,
            status: "degraded",
            authStatus: "failed",
            degradedReason: "claude_auth_probe_non_zero_exit",
            reauthSupported: true,
          },
        ],
        meta: { auth_probe: true },
      } satisfies AssistantProvidersResult),
      startReauth: vi.fn().mockResolvedValue({
        ok: false,
        kind: "failure",
        statusCode: 404,
        message: "BFF route unavailable: /bff/assistant/provider/reauth",
      }),
    });
    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel mode="full" api={fakeApi} />
      </MemoryRouter>,
    );

    const claudeCard = (await screen.findByText("Claude CLI")).closest("article");
    const codexCard = screen.getByText("Codex CLI").closest("article");
    if (!claudeCard || !codexCard) throw new Error("provider card missing");
    fireEvent.click(within(claudeCard).getByRole("button", { name: /start reauth/i }));

    await waitFor(() => {
      expect(fakeApi.startReauth).toHaveBeenCalledWith({
        provider: "claude",
        reason: "LLM Provider Auth management",
      });
    });
    expect(await within(claudeCard).findByText("BFF route unavailable")).toBeInTheDocument();
    expect(within(claudeCard).getByText("BFF route unavailable: /bff/assistant/provider/reauth")).toBeInTheDocument();
    expect(within(codexCard).queryByText("BFF route unavailable")).not.toBeInTheDocument();
  });

  it("starts provider reauth without activating kernel control mode", async () => {
    const fakeApi = api({
      fetchMode: vi.fn().mockResolvedValue({
        ok: true,
        kind: "ok",
        status: {
          kernelEnabled: true,
          controlMode: {
            active: false,
            mode: "inactive",
            state: "inactive",
          },
        },
      }),
    });
    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel mode="full" api={fakeApi} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /start reauth/i }));

    await waitFor(() => {
      expect(fakeApi.activateControlMode).not.toHaveBeenCalled();
      expect(fakeApi.startReauth).toHaveBeenCalledWith({
        provider: "codex",
        reason: "LLM Provider Auth management",
      });
    });
    expect(await screen.findByText("code=ABCD-EFGH")).toBeInTheDocument();
  });

  it("activates control mode before registering a new LLM provider", async () => {
    const fakeApi = api({
      fetchMode: vi.fn().mockResolvedValue({
        ok: true,
        kind: "ok",
        status: {
          kernelEnabled: true,
          controlMode: {
            active: false,
            mode: "inactive",
            state: "inactive",
          },
        },
      }),
    });
    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel mode="full" api={fakeApi} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /add provider/i }));
    fireEvent.change(screen.getByLabelText("Provider id"), { target: { value: "gemini-cli" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Gemini CLI" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "gemini-2.5-pro" } });
    fireEvent.change(screen.getByLabelText("Control passphrase"), { target: { value: "control phrase ok" } });
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      expect(fakeApi.activateControlMode).toHaveBeenCalledWith({
        passphrase: "control phrase ok",
        mode: "kernel_debug",
        reason: "LLM Provider Auth register provider: gemini_cli",
        ttlSeconds: 900,
        idleTtlSeconds: 300,
      });
      expect(fakeApi.registerProvider).toHaveBeenCalledWith({
        provider: "gemini_cli",
        providerName: "Gemini CLI",
        runtime: "external_llm",
        model: "gemini-2.5-pro",
        authStrategy: "manual",
        binary: undefined,
        binaryEnv: undefined,
        note: undefined,
      });
    });
    expect(await screen.findByText("Registered Gemini CLI")).toBeInTheDocument();
  });

  it("renders provider usage history and quota source on the full management page", async () => {
    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel mode="full" api={api()} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Observed usage history")).toBeInTheDocument();
    expect(screen.getByText("1 live auth")).toBeInTheDocument();
    expect(screen.getByText("7 calls")).toBeInTheDocument();
    expect(screen.getByText("140 tokens")).toBeInTheDocument();
    expect(screen.getAllByText("BFF observed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("provider_snapshot").length).toBeGreaterThan(0);
    expect(screen.getByText("gpt-5-codex")).toBeInTheDocument();
  });

  it("excludes OpenClaw adapter rows from LLM usage history totals", async () => {
    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel
          mode="full"
          api={api({
            fetchUsageSummary: vi.fn().mockResolvedValue({
              ok: true,
              kind: "ok",
              status: "ok",
              providers: [
                {
                  provider: "openclaw",
                  providerName: "OpenClaw Runtime",
                  runtime: "openclaw_gateway_agent_cli",
                  ready: true,
                  authStatus: "ready",
                  liveAuth: true,
                  calls: 100,
                  successCount: 100,
                  failedCount: 0,
                  promptBytes: 0,
                  inputTokens: 0,
                  outputTokens: 0,
                  totalTokens: 999,
                  quota: { source: "adapter_probe" },
                  observedUsage: null,
                  models: [],
                },
                {
                  provider: "codex_cli",
                  providerName: "Codex CLI",
                  runtime: "openclaw_gateway_cli_mount",
                  ready: true,
                  authStatus: "ready",
                  liveAuth: true,
                  calls: 7,
                  successCount: 7,
                  failedCount: 0,
                  promptBytes: 1200,
                  inputTokens: 100,
                  outputTokens: 40,
                  totalTokens: 140,
                  quota: { source: "provider_snapshot" },
                  observedUsage: null,
                  models: [],
                },
              ],
              totals: {
                providers: 2,
                liveAuthCount: 2,
                calls: 107,
                successCount: 107,
                failedCount: 0,
                totalTokens: 1139,
              },
              quota: { truthPolicy: "provider_snapshot_only" },
              meta: { auth_probe: false },
            } satisfies AssistantProviderUsageSummaryResult),
          })}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Observed usage history")).toBeInTheDocument();
    expect(screen.getByText("1 live auth")).toBeInTheDocument();
    expect(screen.getByText("7 calls")).toBeInTheDocument();
    expect(screen.getByText("140 tokens")).toBeInTheDocument();
    expect(screen.queryByText("OpenClaw Runtime")).not.toBeInTheDocument();
    expect(screen.queryByText("107 calls")).not.toBeInTheDocument();
  });
});
