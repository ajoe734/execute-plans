import { act, renderHook, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import type { GcpIdentitySession } from "@/integrations/gcp/identity";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authListener: null as ((user: User | null) => void) | null,
  initialUser: null as User | null,
  identitySession: vi.fn(),
  identitySignOut: vi.fn(),
  unsubscribe: vi.fn(),
  register: vi.fn(),
  clear: vi.fn(),
  verify: vi.fn(),
  refreshVerify: vi.fn(),
  bffLogout: vi.fn(),
  postDevLogin: vi.fn(),
}));

vi.mock("./devLogin", () => ({
  postDevLogin: (...args: unknown[]) => mocks.postDevLogin(...args),
}));

vi.mock("firebase/auth", () => ({
  onIdTokenChanged: (_auth: unknown, listener: (user: User | null) => void) => {
    mocks.authListener = listener;
    queueMicrotask(() => listener(mocks.initialUser));
    return mocks.unsubscribe;
  },
  signOut: mocks.identitySignOut,
}));

vi.mock("@/integrations/gcp/identity", () => ({
  gcpIdentityAuth: {},
  gcpIdentityReady: Promise.resolve(),
  gcpIdentitySession: mocks.identitySession,
}));

vi.mock("@/lib/auth/bffBrowserSession", () => ({
  registerBffBrowserSession: mocks.register,
  clearBffBrowserSession: mocks.clear,
  verifyBffBrowserSession: mocks.verify,
  refreshAndVerifyBffBrowserSession: mocks.refreshVerify,
  logoutBffBrowserSession: mocks.bffLogout,
}));

import { AuthProvider, useAuth } from "./AuthProvider";
import { isDevLoginHost } from "@/lib/bff-v1/runtimeEnv";

function setLocation(url: string) {
  Object.defineProperty(window, "location", {
    value: new URL(url),
    writable: true,
    configurable: true,
  });
}

function session(token: string): GcpIdentitySession {
  return {
    idToken: token,
    claims: {},
    user: { uid: "gcp-user" } as User,
  };
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
    authReady: true,
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
  setLocation("https://app.mvl-cap.tw/auth");
  mocks.authListener = null;
  mocks.initialUser = { uid: "gcp-user" } as User;
  mocks.identitySession.mockImplementation(async (user: User, forceRefresh = false) =>
    session(forceRefresh
      ? "forced-refresh-token"
      : user === mocks.initialUser ? "initial-token" : "refreshed-token"));
  mocks.identitySignOut.mockResolvedValue(undefined);
  mocks.verify.mockResolvedValue(verified);
  mocks.refreshVerify.mockResolvedValue(verified);
  mocks.bffLogout.mockResolvedValue(undefined);
  mocks.postDevLogin.mockResolvedValue(undefined);
});

describe("AuthProvider strict BFF bridge", () => {
  it("rehydrates on reload and registers the bearer before admitting a BFF-verified session", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ idToken: "initial-token" }));
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
    const refreshedUser = { uid: "gcp-user" } as User;

    act(() => {
      mocks.authListener?.(refreshedUser);
    });

    await waitFor(() => expect(mocks.refreshVerify).toHaveBeenCalledOnce());
    expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ idToken: "refreshed-token" }));
    expect(mocks.register.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refreshVerify.mock.invocationCallOrder[0],
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("calls BFF logout with the current bearer before clearing GCP Identity and provider state", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.register.mockClear();
    mocks.bffLogout.mockClear();
    mocks.identitySignOut.mockClear();
    mocks.clear.mockClear();

    await act(async () => {
      await result.current.signOut();
    });

    expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ idToken: "initial-token" }));
    expect(mocks.bffLogout).toHaveBeenCalledOnce();
    expect(mocks.identitySignOut).toHaveBeenCalledOnce();
    expect(mocks.bffLogout.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.identitySignOut.mock.invocationCallOrder[0],
    );
    expect(mocks.identitySignOut.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clear.mock.invocationCallOrder.at(-1) ?? 0,
    );
    expect(result.current.session).toBeNull();
    expect(result.current.bffSession).toBeNull();
  });

  it("reports BFF verification failure without erasing the GCP session", async () => {
    mocks.verify.mockRejectedValue(new Error("BFF returned 401"));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session?.idToken).toBe("initial-token");
    expect(result.current.bffSession).toBeNull();
    expect(result.current.bffError?.message).toContain("401");
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("retains a verified session when a later provider verification fails", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.bffSession).toEqual(verified));
    mocks.refreshVerify.mockRejectedValue(new Error("provider offline"));
    mocks.clear.mockClear();

    act(() => {
      mocks.authListener?.({ uid: "gcp-user" } as User);
    });

    await waitFor(() => expect(result.current.bffError?.message).toContain("provider offline"));
    expect(result.current.bffSession).toEqual(verified);
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("retries BFF verification with a refreshed existing identity instead of signing in again", async () => {
    mocks.verify.mockRejectedValueOnce(new Error("BFF returned 401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.bffError?.message).toContain("401"));
    mocks.register.mockClear();
    mocks.refreshVerify.mockClear();

    await act(async () => {
      await result.current.retryBffSession();
    });

    expect(mocks.identitySession).toHaveBeenLastCalledWith(
      mocks.initialUser,
      true,
    );
    expect(mocks.register).toHaveBeenCalledWith(
      expect.objectContaining({ idToken: "forced-refresh-token" }),
    );
    expect(mocks.refreshVerify).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.bffSession).toEqual(verified));
    expect(result.current.bffError).toBeNull();
    expect(mocks.identitySignOut).not.toHaveBeenCalled();
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
    expect(mocks.identitySignOut).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.session).toBeNull());
    expect(result.current.bffSession).toBeNull();
  });

  it("restores cookie session on load on dev host without depending on GCP sign-in or Firebase callbacks", async () => {
    setLocation("https://app.dev.mvl-cap.tw/auth");
    mocks.initialUser = { uid: "cached-gcp-user" } as User;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.verify).toHaveBeenCalled();
    expect(mocks.authListener).toBeNull();
    expect(mocks.identitySession).not.toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.bffSession).toEqual(verified);
    expect(result.current.bffError).toBeNull();
  });

  it("maintains production behavior on load when Firebase user is null", async () => {
    setLocation("https://app.mvl-cap.tw/auth");
    mocks.initialUser = null;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(result.current.bffSession).toBeNull();
  });

  it("retries verification on dev host even with Firebase session null", async () => {
    setLocation("https://app.dev.mvl-cap.tw/auth");
    mocks.initialUser = null;
    mocks.verify.mockRejectedValueOnce(new Error("Transient BFF error"));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bffSession).toBeNull();
    mocks.verify.mockResolvedValueOnce(verified);

    await act(async () => {
      await result.current.retryBffSession();
    });

    expect(result.current.bffSession).toEqual(verified);
    expect(result.current.bffError).toBeNull();
    expect(mocks.identitySession).not.toHaveBeenCalled();
  });

  it("throws unavailable GCP Identity session on production host when session is null", async () => {
    setLocation("https://app.mvl-cap.tw/auth");
    mocks.initialUser = null;
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let retryError: unknown;
    await act(async () => {
      try {
        await result.current.retryBffSession();
      } catch (error: unknown) {
        retryError = error;
      }
    });

    expect(retryError).toBeInstanceOf(Error);
    expect((retryError as Error).message).toMatch(
      /GCP Identity session is unavailable/,
    );
  });

  it("dev logout invalidates BFF session without calling Firebase signOut", async () => {
    setLocation("https://app.dev.mvl-cap.tw/auth");
    mocks.initialUser = null;
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bffSession).toEqual(verified);

    mocks.bffLogout.mockClear();
    mocks.identitySignOut.mockClear();
    mocks.clear.mockClear();

    await act(async () => {
      await result.current.signOut();
    });

    expect(mocks.bffLogout).toHaveBeenCalledOnce();
    expect(mocks.identitySignOut).not.toHaveBeenCalled();
    expect(mocks.clear).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(result.current.bffSession).toBeNull();
  });

  it("discards late verification results after logout, preventing session resurrection", async () => {
    setLocation("https://app.dev.mvl-cap.tw/auth");
    let resolveVerify!: (val: typeof verified) => void;
    mocks.verify.mockImplementation(
      () =>
        new Promise<typeof verified>((resolve) => {
          resolveVerify = resolve;
        }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.bffSession).toBeNull();

    await act(async () => {
      resolveVerify(verified);
    });

    expect(result.current.bffSession).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("devLogin posts client credentials, clears in-memory bearer, verifies, and sets bffSession", async () => {
    setLocation("https://app.dev.mvl-cap.tw/auth");
    mocks.initialUser = null;
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    mocks.clear.mockClear();
    mocks.verify.mockClear();
    await act(async () => {
      await result.current.devLogin("operator", "secret");
    });

    expect(mocks.postDevLogin).toHaveBeenCalledWith("operator", "secret");
    expect(mocks.clear).toHaveBeenCalled();
    expect(mocks.clear.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.verify.mock.invocationCallOrder[0],
    );
    expect(result.current.bffSession).toEqual(verified);
    expect(result.current.bffError).toBeNull();
  });

  it("ignores runtime config hostname override on production host", () => {
    setLocation("https://app.mvl-cap.tw/auth");
    (window as unknown as { __PANTHEON_RUNTIME_CONFIG__?: unknown }).__PANTHEON_RUNTIME_CONFIG__ = {
      hostname: "app.dev.mvl-cap.tw",
    };

    expect(isDevLoginHost()).toBe(false);
  });

  it("does not write credentials or tokens to browser storage during dev login", async () => {
    setLocation("https://app.dev.mvl-cap.tw/auth");
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    mocks.initialUser = null;
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.devLogin("operator", "secret");
    });

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});
