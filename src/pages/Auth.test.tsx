import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  signIn: vi.fn(),
  sendVerification: vi.fn(),
  resetPassword: vi.fn(),
  identitySignOut: vi.fn(),
  multiFactor: vi.fn(() => ({ enrolledFactors: [] })),
  signOut: vi.fn(),
  auth: {
    session: null,
    bffSession: null,
    bffError: null,
    loading: false,
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
  signOut: mocks.identitySignOut,
  TotpMultiFactorGenerator: {
    FACTOR_ID: "totp",
    assertionForSignIn: vi.fn(),
    assertionForEnrollment: vi.fn(),
    generateSecret: vi.fn(),
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
    signOut: mocks.signOut,
  };
  mocks.signIn.mockResolvedValue({ user: { uid: "gcp-user" } });
  mocks.createUser.mockResolvedValue({ user: { uid: "gcp-user" } });
  mocks.sendVerification.mockResolvedValue(undefined);
  mocks.identitySignOut.mockResolvedValue(undefined);
});

describe("Pantheon auth recovery page", () => {
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
