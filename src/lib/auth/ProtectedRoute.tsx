import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { bffSession, bffError, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    const scope = loc.pathname === "/agora" || loc.pathname.startsWith("/agora/")
      ? "Agora access"
      : "Pantheon session";
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-muted-foreground">
        Verifying {scope}…
      </div>
    );
  }

  if (bffError || !bffSession) {
    const from = `${loc.pathname}${loc.search}${loc.hash}`;
    const authPath = loc.pathname === "/agora" || loc.pathname.startsWith("/agora/")
      ? "/agora/auth"
      : "/auth";
    return (
      <Navigate
        to={`${authPath}?reason=auth-required&from=${encodeURIComponent(from)}`}
        replace
      />
    );
  }

  return <>{children}</>;
}
