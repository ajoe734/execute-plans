import { act, renderHook, waitFor } from "@testing-library/react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authListener: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
  getSession: vi.fn(),
  supabaseSignOut: vi.fn(),
  unsubscribe: vi.fn(),
  register: vi.fn(),
  clear: vi.fn(),
  verify: vi.fn(),
  refreshVerify: vi.fn(),
  bffLogout: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (listener: (event: AuthChangeEvent, session: Session | null) => void) => {
        mocks.authListener = listener;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      },
      getSession: mocks.getSession,
      signOut: mocks.supabaseSignOut,
    },
  },
}));

vi.mock("@/lib/auth/bffBrowserSession", () => ({
  registerBffBrowserSession: mocks.register,
  clearBffBrowserSession: mocks.clear,
  verifyBffBrowserSession: mocks.verify,
  refreshAndVerifyBffBrowserSession: mocks.refreshVerify,
  logoutBffBrowserSession: mocks.bffLogout,
}));

import { AuthProvider, useAuth } from "./AuthProvider";

function session(token: string): Session {
  return {
    access_token: token,
    refresh_token: "refresh-never-persisted",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: "supabase-user", app_metadata: {}, user_metadata: {} },
  } as Session;
}

const verified = {
  identity: {
    authenticated: true as const,
    sessionKind: "bearer" as const,
    userId: "bff-user",
    tenantId: "tenant-dev",
    roles: ["viewer"],
    capabilities: [],
  },
  readiness: {
    ready: false,
    authReady: false,
    providerReady: true,
    sourceCommitSha: "1".repeat(40),
    authMode: "strict",
    authStub: false,
    operatorRoleReady: false,
    interactionCapabilityReady: false,
  },
};

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authListener = null;
  mocks.getSession.mockResolvedValue({ data: { session: session("initial-token") } });
  mocks.supabaseSignOut.mockResolvedValue({ error: null });
  mocks.verify.mockResolvedValue(verified);
  mocks.refreshVerify.mockResolvedValue(verified);
  mocks.bffLogout.mockResolvedValue(undefined);
});

describe("AuthProvider strict BFF bridge", () => {
  it("rehydrates on reload and registers the bearer before admitting a BFF-verified session", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ access_token: "initial-token" }));
    expect(mocks.register.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.verify.mock.invocationCallOrder[0],
    );
    expect(result.current.bffSession).toEqual(verified);
    expect(result.current.bffError).toBeNull();
  });

  it("updates the provider before BFF refresh and authoritative readback", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.register.mockClear();
    mocks.refreshVerify.mockClear();
    const refreshed = session("refreshed-token");

    act(() => {
      mocks.authListener?.("TOKEN_REFRESHED", refreshed);
    });

    await waitFor(() => expect(mocks.refreshVerify).toHaveBeenCalledOnce());
    expect(mocks.register).toHaveBeenCalledWith(refreshed);
    expect(mocks.register.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refreshVerify.mock.invocationCallOrder[0],
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("calls BFF logout with the current bearer before clearing Supabase and provider state", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.register.mockClear();
    mocks.bffLogout.mockClear();
    mocks.supabaseSignOut.mockClear();
    mocks.clear.mockClear();

    await act(async () => {
      await result.current.signOut();
    });

    expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ access_token: "initial-token" }));
    expect(mocks.bffLogout).toHaveBeenCalledOnce();
    expect(mocks.supabaseSignOut).toHaveBeenCalledOnce();
    expect(mocks.bffLogout.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.supabaseSignOut.mock.invocationCallOrder[0],
    );
    expect(mocks.supabaseSignOut.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clear.mock.invocationCallOrder.at(-1) ?? 0,
    );
    expect(result.current.session).toBeNull();
    expect(result.current.bffSession).toBeNull();
  });

  it("fails closed when Supabase authenticates but BFF verification rejects", async () => {
    mocks.verify.mockRejectedValue(new Error("BFF returned 401"));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session?.access_token).toBe("initial-token");
    expect(result.current.bffSession).toBeNull();
    expect(result.current.bffError?.message).toContain("401");
    expect(mocks.clear).toHaveBeenCalled();
  });

  it("clears local privilege even when BFF logout is unavailable", async () => {
    mocks.bffLogout.mockRejectedValue(new Error("BFF offline"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let logoutError: unknown;
    await act(async () => {
      try {
        await result.current.signOut();
      } catch (error: unknown) {
        logoutError = error;
      }
    });
    expect(logoutError).toBeInstanceOf(Error);
    expect((logoutError as Error).message).toBe("BFF offline");
    expect(mocks.supabaseSignOut).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.session).toBeNull());
    expect(result.current.bffSession).toBeNull();
  });
});
