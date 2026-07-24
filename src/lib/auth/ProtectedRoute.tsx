import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, bffSession, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-muted-foreground">
        Verifying Pantheon session…
      </div>
    );
  }
  if (!session || !bffSession) {
    const from = `${loc.pathname}${loc.search}${loc.hash}`;
    return (
      <Navigate
        to={`/auth?reason=auth-required&from=${encodeURIComponent(from)}`}
        replace
      />
    );
  }
  return <>{children}</>;
}
