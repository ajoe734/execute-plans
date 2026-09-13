// @vitest-environment-options {"url":"https://app.dev.mvl-cap.tw/auth"}
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { getApps } from "firebase/app";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

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
