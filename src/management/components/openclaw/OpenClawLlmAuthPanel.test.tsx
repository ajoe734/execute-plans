import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import {
  OpenClawLlmAuthPanel,
  type OpenClawLlmAuthApi,
} from "./OpenClawLlmAuthPanel";

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
    ...overrides,
  };
}

describe("OpenClawLlmAuthPanel", () => {
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
});
