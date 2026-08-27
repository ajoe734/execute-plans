import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  signIn: vi.fn(),
  signInWithPopup: vi.fn(),
  sendVerification: vi.fn(),
  resetPassword: vi.fn(),
  identitySignOut: vi.fn(),
  getIdToken: vi.fn(),
  generateSecret: vi.fn(),
  assertionForEnrollment: vi.fn(),
  multiFactorState: {
    enrolledFactors: [] as unknown[],
    getSession: vi.fn(),
    enroll: vi.fn(),
  },
  multiFactor: vi.fn(() => mocks.multiFactorState),
  retryBffSession: vi.fn(),
  signOut: vi.fn(),
  auth: {
    session: null,
    bffSession: null,
    bffError: null,
    loading: false,
    retryBffSession: vi.fn(),
    signOut: vi.fn(),
  } as Record<string, unknown>,
}));

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: mocks.createUser,
  getMultiFactorResolver: vi.fn(),
  multiFactor: mocks.multiFactor,
  sendEmailVerification: mocks.sendVerification,
  sendPasswordResetEmail: mocks.resetPassword,
  signInWithEmailAndPassword: mocks.signIn,
  signInWithPopup: mocks.signInWithPopup,
  GoogleAuthProvider: class GoogleAuthProvider {
    providerId = "google.com";
  },
  signOut: mocks.identitySignOut,
  TotpMultiFactorGenerator: {
    FACTOR_ID: "totp",
    assertionForSignIn: vi.fn(),
    assertionForEnrollment: mocks.assertionForEnrollment,
    generateSecret: mocks.generateSecret,
  },
}));

vi.mock("@/integrations/gcp/identity", () => ({ gcpIdentityAuth: {} }));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => mocks.auth,
}));

import AuthPage from "./Auth";

function renderAuth(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/agora/auth" element={<AuthPage />} />
        <Route path="/agora/*" element={<div>Agora restored</div>} />
        <Route path="/management/*" element={<div>Management restored</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = {
    session: null,
    bffSession: null,
    bffError: null,
    loading: false,
    retryBffSession: mocks.retryBffSession,
    signOut: mocks.signOut,
  };
  mocks.multiFactorState.enrolledFactors = [];
  mocks.multiFactorState.getSession.mockResolvedValue({});
  mocks.multiFactorState.enroll.mockResolvedValue(undefined);
  mocks.getIdToken.mockResolvedValue("refreshed-token");
  mocks.generateSecret.mockResolvedValue({
    generateQrCodeUrl: () => "otpauth://totp/Pantheon:test",
    secretKey: "TEST-SECRET",
  });
  mocks.assertionForEnrollment.mockReturnValue({ factor: "totp" });
  mocks.retryBffSession.mockResolvedValue(undefined);
  mocks.signIn.mockResolvedValue({ user: { uid: "gcp-user" } });
  mocks.signInWithPopup.mockResolvedValue({ user: { uid: "gcp-user" } });
  mocks.createUser.mockResolvedValue({ user: { uid: "gcp-user" } });
  mocks.sendVerification.mockResolvedValue(undefined);
  mocks.identitySignOut.mockResolvedValue(undefined);
});

describe("Pantheon auth recovery page", () => {
  it("renders an Agora-branded single sign-on entry for Agora return paths", () => {
    renderAuth("/agora/auth?reason=auth-required&from=%2Fagora%2Ftrading-room");

    expect(screen.getByRole("heading", { name: "Agora" })).toBeInTheDocument();
    expect(screen.getByText("Sign in once to access the trading workbench.")).toBeInTheDocument();
    expect(screen.getByText(/there is no separate Agora password/iu)).toBeInTheDocument();
    expect(screen.queryByText("Pantheon Management")).not.toBeInTheDocument();
  });

  it("explains an expired session without rendering fallback data", () => {
    renderAuth("/auth?reason=auth-required&from=%2Fmanagement%2Fcockpit");

    expect(screen.getByRole("status")).toHaveTextContent(
      "Your Pantheon session is missing or expired.",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Pantheon did not substitute fallback data.",
    );
  });

  it("submits user credentials through GCP Identity Platform", async () => {
    renderAuth("/auth?reason=auth-required&from=%2Fmanagement%2Fcockpit");

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "operator@example.test" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "correct-password" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    });

    expect(mocks.signIn).toHaveBeenCalledWith(
      {},
      "operator@example.test",
      "correct-password",
    );
  });

  it("supports Google OAuth through the same Firebase Identity session", async () => {
    renderAuth("/auth?reason=auth-required&from=%2Fmanagement%2Fcockpit");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    });

    expect(mocks.signInWithPopup).toHaveBeenCalledWith(
      {},
      expect.any(Object),
    );
    expect(mocks.signInWithPopup.mock.calls[0][1]).toMatchObject({
      providerId: "google.com",
    });
  });

  it("offers required TOTP enrollment before showing a BFF first-factor rejection", () => {
    mocks.auth = {
      ...mocks.auth,
      session: {
        user: {
          email: "operator@example.test",
          emailVerified: true,
          uid: "gcp-user",
        },
      },
      bffError: new Error("MFA proof required"),
    };

    renderAuth("/auth");

    expect(screen.getByText("Set up authenticator MFA")).toBeInTheDocument();
    expect(
      screen.queryByText("Pantheon session verification failed."),
    ).not.toBeInTheDocument();
  });

  it("keeps the existing identity visible while BFF verification is in progress", () => {
    mocks.auth = {
      ...mocks.auth,
      session: {
        user: {
          email: "operator@example.test",
          emailVerified: true,
          uid: "gcp-user",
        },
      },
      loading: true,
    };

    renderAuth("/agora/auth?from=%2Fagora%2Ftrading-room");

    expect(screen.getByRole("status")).toHaveTextContent("Verifying Agora access");
    expect(screen.getByRole("status")).toHaveTextContent("do not need to enter it again");
    expect(screen.queryByPlaceholderText("Password")).not.toBeInTheDocument();
  });

  it("retries BFF verification without rendering or resubmitting credentials", async () => {
    mocks.multiFactorState.enrolledFactors = [{ factorId: "totp" }];
    mocks.auth = {
      ...mocks.auth,
      session: {
        user: {
          email: "operator@example.test",
          emailVerified: true,
          uid: "gcp-user",
        },
      },
      bffError: new Error("BFF returned 401"),
    };

    renderAuth("/agora/auth?from=%2Fagora%2Fstrategy-workshop");

    expect(screen.queryByPlaceholderText("Password")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry access verification" }));
    });
    expect(mocks.retryBffSession).toHaveBeenCalledOnce();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("continues the existing sign-in after TOTP enrollment instead of signing out", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const user = {
      email: "operator@example.test",
      emailVerified: true,
      getIdToken: mocks.getIdToken,
      reload,
      uid: "gcp-user",
    };
    mocks.auth = {
      ...mocks.auth,
      session: { user },
    };

    renderAuth("/agora/auth?from=%2Fagora%2Ftrading-room");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start MFA setup" }));
    });
    fireEvent.change(await screen.findByPlaceholderText("123456"), {
      target: { value: "123456" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm authenticator" }));
    });

    expect(mocks.multiFactorState.enroll).toHaveBeenCalledWith(
      { factor: "totp" },
      "Pantheon Authenticator",
    );
    expect(mocks.getIdToken).toHaveBeenCalledWith(true);
    expect(mocks.identitySignOut).not.toHaveBeenCalled();
  });

  it("rejects a protocol-relative return target", () => {
    mocks.auth = {
      ...mocks.auth,
      session: { idToken: "signed-token" },
      bffSession: { identity: { authenticated: true } },
    };

    renderAuth("/auth?from=%2F%2Fevil.example");

    expect(screen.getByText("Management restored")).toBeInTheDocument();
  });
});
