import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  clearBffBrowserSession,
  logoutBffBrowserSession,
  refreshAndVerifyBffBrowserSession,
  registerBffBrowserSession,
  verifyBffBrowserSession,
  type VerifiedBffBrowserSession,
} from "./bffBrowserSession";
import { hasDevLoginCredentials } from "./devLoginHelper";

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** BFF-owned identity/readiness; never inferred from browser-editable claims. */
  bffSession: VerifiedBffBrowserSession | null;
  bffError: Error | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  bffSession: null,
  bffError: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [bffSession, setBffSession] = useState<VerifiedBffBrowserSession | null>(null);
  const [bffError, setBffError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<Session | null>(null);
  const syncVersion = useRef(0);

  const applySession = useCallback((event: AuthChangeEvent | "BOOTSTRAP", next: Session | null) => {
    const version = ++syncVersion.current;
    sessionRef.current = next;
    setSession(next);
    setBffSession(null);
    setBffError(null);

    if (!next) {
      if (!hasDevLoginCredentials()) {
        clearBffBrowserSession();
        setLoading(false);
        return;
      }
      clearBffBrowserSession();
    } else {
      // Install the new bearer synchronously before any BFF request can run.
      registerBffBrowserSession(next);
    }

    setLoading(true);
    const verification = event === "TOKEN_REFRESHED" && next
      ? refreshAndVerifyBffBrowserSession()
      : verifyBffBrowserSession();

    void verification
      .then((verified) => {
        if (syncVersion.current !== version) return;
        setBffSession(verified);
        setBffError(null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (syncVersion.current !== version) return;
        // A Supabase-only session is never enough to cross the product route
        // boundary. Drop the header provider and retain the error for the auth UI.
        clearBffBrowserSession();
        setBffSession(null);
        setBffError(error instanceof Error ? error : new Error(String(error)));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    // Set up listener FIRST, then fetch session.
    let authEventSeen = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      authEventSeen = true;
      applySession(event, next);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!authEventSeen) applySession("BOOTSTRAP", data.session);
    }).catch((error: unknown) => {
      clearBffBrowserSession();
      setBffError(error instanceof Error ? error : new Error(String(error)));
      setLoading(false);
    });
    return () => {
      subscription.unsubscribe();
      ++syncVersion.current;
      clearBffBrowserSession();
    };
  }, [applySession]);

  const signOut = useCallback(async () => {
    const current = sessionRef.current;
    let bffLogoutError: unknown;

    if (current) {
      // Verification may previously have failed closed and cleared the provider;
      // restore only this current in-memory bearer long enough to invalidate it.
      registerBffBrowserSession(current);
      try {
        await logoutBffBrowserSession();
      } catch (error: unknown) {
        bffLogoutError = error;
      }
    }

    let supabaseLogoutError: unknown;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) supabaseLogoutError = error;
    } finally {
      ++syncVersion.current;
      sessionRef.current = null;
      clearBffBrowserSession();
      setSession(null);
      setBffSession(null);
      setBffError(null);
      setLoading(false);
    }

    if (supabaseLogoutError) throw supabaseLogoutError;
    if (bffLogoutError) throw bffLogoutError;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        bffSession,
        bffError,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
