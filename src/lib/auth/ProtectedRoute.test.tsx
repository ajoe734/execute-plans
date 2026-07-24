import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  value: {
    session: null,
    bffSession: null,
    bffError: null,
    loading: false,
    user: null,
    signOut: vi.fn(),
  } as Record<string, unknown>,
}));

vi.mock("./AuthProvider", () => ({
  useAuth: () => state.value,
}));

import { ProtectedRoute } from "./ProtectedRoute";

function AuthenticationPage() {
  const location = useLocation();
  return (
    <>
      <div>Authentication page</div>
      <div data-testid="auth-location">{`${location.pathname}${location.search}`}</div>
    </>
  );
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/agora/strategy-workshop/ws-1?mode=challenge"]}>
      <Routes>
        <Route path="/auth" element={<AuthenticationPage />} />
        <Route
          path="/agora/strategy-workshop/:id"
          element={<ProtectedRoute><div>Persona interaction</div></ProtectedRoute>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.value = {
    session: null,
    bffSession: null,
    bffError: null,
    loading: false,
    user: null,
    signOut: vi.fn(),
  };
});

describe("Persona and Agora auth route boundary", () => {
  it("redirects an unauthenticated browser to /auth", () => {
    renderRoute();
    expect(screen.getByText("Authentication page")).toBeInTheDocument();
    expect(screen.getByTestId("auth-location")).toHaveTextContent(
      "/auth?reason=auth-required&from=%2Fagora%2Fstrategy-workshop%2Fws-1%3Fmode%3Dchallenge",
    );
    expect(screen.queryByText("Persona interaction")).not.toBeInTheDocument();
  });

  it("does not admit a GCP first-factor session before BFF verification", () => {
    state.value.session = { idToken: "gcp-first-factor-only" };
    renderRoute();
    expect(screen.getByText("Authentication page")).toBeInTheDocument();
    expect(screen.queryByText("Persona interaction")).not.toBeInTheDocument();
  });

  it("admits a BFF-authenticated viewer to read while write gates remain separate", () => {
    state.value.session = { idToken: "viewer-token" };
    state.value.bffSession = {
      identity: { roles: ["viewer"], capabilities: [] },
      readiness: { authReady: false, operatorRoleReady: false },
    };
    renderRoute();
    expect(screen.getByText("Persona interaction")).toBeInTheDocument();
  });
});
