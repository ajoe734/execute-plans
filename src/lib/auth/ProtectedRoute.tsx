import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, bffSession, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!session || !bffSession) {
    const from = `${loc.pathname}${loc.search}${loc.hash}`;
    return <Navigate to={`/auth?from=${encodeURIComponent(from)}`} replace />;
  }
  return <>{children}</>;
}
