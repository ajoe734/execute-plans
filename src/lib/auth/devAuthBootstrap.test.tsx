// @vitest-environment-options {"url":"https://app.dev.mvl-cap.tw/auth"}
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { getApps } from "firebase/app";
import { resetSessionTransportForTests } from "./sessionExpiry";

afterEach(() => {
  resetSessionTransportForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("opens the real dev account form without importing or initializing Firebase identity", async () => {
  for (const key of ["VITE_GCP_IDENTITY_API_KEY", "VITE_GCP_IDENTITY_PROJECT_ID", "VITE_GCP_IDENTITY_AUTH_DOMAIN"]) {
    vi.stubEnv(key, "");
  }
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", "strict");
  vi.stubEnv("VITE_BFF_BASE_URL", "https://api.dev.mvl-cap.tw");
  const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), {
    status: 401, headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchSpy);
  // No mocked AuthProvider, Auth page, Firebase SDK, or identity module.
  const { AuthProvider } = await import("./AuthProvider");
  const { default: AuthPage } = await import("@/pages/Auth");
  render(<MemoryRouter initialEntries={["/auth"]}><AuthProvider><AuthPage /></AuthProvider></MemoryRouter>);
  expect(await screen.findByLabelText("Account")).toBeInTheDocument();
  expect(screen.getByLabelText("Password")).toBeInTheDocument();
  expect(getApps()).toEqual([]);
  expect(fetchSpy).toHaveBeenCalled();
  for (const [url] of fetchSpy.mock.calls as unknown as [string][]) {
    expect(String(url)).not.toMatch(/googleapis|firebase/);
  }
});

it("renews expired 30m access token on cold page load via single-flight POST /bff/auth/refresh and establishes session without /auth redirect", async () => {
  resetSessionTransportForTests();
  vi.stubEnv("VITE_BFF_MODE", "live");
  vi.stubEnv("VITE_BFF_FALLBACK", "strict");
  vi.stubEnv("VITE_BFF_BASE_URL", "https://api.dev.mvl-cap.tw");

  let meAttempts = 0;
  let readinessAttempts = 0;
  let refreshCalls = 0;

  const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/bff/auth/refresh")) {
      refreshCalls += 1;
      return new Response(
        JSON.stringify({
          authenticated: true,
          expires_at: "2026-11-04T08:00:00Z",
          refresh_expires_at: "2026-12-03T07:30:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.endsWith("/bff/me")) {
      meAttempts += 1;
      if (meAttempts === 1) {
        return new Response(
          JSON.stringify({ error: { code: "TOKEN_EXPIRED", message: "Access token expired" } }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            user: { id: "admintest" },
            tenant: { id: "default" },
            roles: ["operator"],
            capabilities: ["agora.workshop.v1"],
            session: {
              authenticated: true,
              session_kind: "cookie",
              expires_at: "2026-11-04T08:00:00Z",
              refresh_expires_at: "2026-12-03T07:30:00Z",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.endsWith("/bff/auth/readiness")) {
      readinessAttempts += 1;
      if (readinessAttempts === 1) {
        return new Response(
          JSON.stringify({ error: { code: "TOKEN_EXPIRED", message: "Access token expired" } }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            ready: true,
            authReady: true,
            providerReady: true,
            sourceCommitSha: "1".repeat(40),
            auth: {
              mode: "strict",
              strict: true,
              stub: false,
              sessionKind: "cookie",
              operatorRoleReady: true,
              interactionCapabilityReady: true,
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchSpy);

  const { AuthProvider } = await import("./AuthProvider");
  const { ProtectedRoute } = await import("./ProtectedRoute");

  render(
    <MemoryRouter initialEntries={["/management/cockpit"]}>
      <AuthProvider>
        <Routes>
          <Route path="/auth" element={<div>Redirected to auth</div>} />
          <Route
            path="/management/cockpit"
            element={
              <ProtectedRoute>
                <div>Cockpit ready</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByText("Cockpit ready")).toBeInTheDocument();
  expect(screen.queryByText("Redirected to auth")).not.toBeInTheDocument();
  expect(refreshCalls).toBe(1);
  expect(meAttempts).toBe(2);
  expect(readinessAttempts).toBe(2);
});
