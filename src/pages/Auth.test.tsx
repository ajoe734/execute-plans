import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  auth: {
    session: null,
    bffSession: null,
    bffError: null,
    loading: false,
    signOut: vi.fn(),
  } as Record<string, unknown>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
    },
  },
}));

vi.mock("@/integrations/lovable", () => ({
  lovable: {
    auth: {
      signInWithOAuth: mocks.signInWithOAuth,
    },
  },
}));

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
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signUp.mockResolvedValue({ error: null });
  mocks.signInWithOAuth.mockResolvedValue({ error: null });
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

  it("submits user credentials through Supabase", async () => {
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

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "operator@example.test",
      password: "correct-password",
    });
  });

  it("rejects a protocol-relative return target", () => {
    mocks.auth = {
      ...mocks.auth,
      session: { access_token: "signed-token" },
      bffSession: { identity: { authenticated: true } },
    };

    renderAuth("/auth?from=%2F%2Fevil.example");

    expect(screen.getByText("Management restored")).toBeInTheDocument();
  });
});
