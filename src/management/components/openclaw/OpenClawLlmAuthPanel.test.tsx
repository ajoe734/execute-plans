import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
            source: "management_ai_audit",
            calls: 7,
            totalTokens: 140,
          },
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
    expect(screen.getByText("Checking assistant provider auth status.")).toBeInTheDocument();
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
    expect(screen.getByText("Updating auth probe results.")).toBeInTheDocument();

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
    expect(screen.queryByText("Updating auth probe results.")).not.toBeInTheDocument();
  });

  it("renders provider auth and quota status in summary mode with management link", async () => {
    render(
      <MemoryRouter>
        <OpenClawLlmAuthPanel mode="summary" api={api()} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("OpenClaw LLM Auth")).toBeInTheDocument();
    expect(screen.getByText("Codex CLI")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("12 requests (24%)")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("140")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open management page" })).toHaveAttribute(
      "href",
      "/management/openclaw-llm-auth",
    );
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
        reason: "OpenClaw LLM Auth management",
      });
    });
    expect(await screen.findByText("code=ABCD-EFGH")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /login/i })).toHaveAttribute("href", "https://example.test/device");
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
        reason: "OpenClaw LLM Auth management",
      });
    });
    expect(await screen.findByText("claude reauth pending")).toBeInTheDocument();
    expect(screen.getByText("code=WXYZ-1234")).toBeInTheDocument();
  });

  it("activates kernel_debug control mode before starting provider reauth", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: /enable control \+ reauth/i }));
    fireEvent.change(await screen.findByLabelText("Control passphrase"), {
      target: { value: "control phrase ok" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enable and start reauth/i }));

    await waitFor(() => {
      expect(fakeApi.activateControlMode).toHaveBeenCalledWith({
        passphrase: "control phrase ok",
        mode: "kernel_debug",
        reason: "OpenClaw LLM Auth reauth: codex",
        ttlSeconds: 900,
        idleTtlSeconds: 300,
      });
      expect(fakeApi.startReauth).toHaveBeenCalledWith({
        provider: "codex",
        reason: "OpenClaw LLM Auth management",
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

    fireEvent.click(await screen.findByRole("button", { name: /add llm/i }));
    fireEvent.change(screen.getByLabelText("Provider id"), { target: { value: "gemini-cli" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Gemini CLI" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "gemini-2.5-pro" } });
    fireEvent.change(screen.getByLabelText("Control passphrase"), { target: { value: "control phrase ok" } });
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      expect(fakeApi.activateControlMode).toHaveBeenCalledWith({
        passphrase: "control phrase ok",
        mode: "kernel_debug",
        reason: "OpenClaw LLM Auth register provider: gemini_cli",
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

    expect(await screen.findByText("Usage history")).toBeInTheDocument();
    expect(screen.getByText("1 live auth")).toBeInTheDocument();
    expect(screen.getByText("7 calls")).toBeInTheDocument();
    expect(screen.getByText("140 tokens")).toBeInTheDocument();
    expect(screen.getAllByText("provider_snapshot").length).toBeGreaterThan(0);
    expect(screen.getByText("gpt-5-codex")).toBeInTheDocument();
  });
});
