import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { onIdTokenChanged, signOut as signOutGcpIdentity, type User } from "firebase/auth";
import {
  gcpIdentityAuth,
  gcpIdentityReady,
  gcpIdentitySession,
  type GcpIdentitySession,
} from "@/integrations/gcp/identity";
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
  session: GcpIdentitySession | null;
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
  const [session, setSession] = useState<GcpIdentitySession | null>(null);
  const [bffSession, setBffSession] = useState<VerifiedBffBrowserSession | null>(null);
  const [bffError, setBffError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<GcpIdentitySession | null>(null);
  const syncVersion = useRef(0);

  const applyUser = useCallback(async (user: User | null) => {
    const version = ++syncVersion.current;
    const prior = sessionRef.current;
    const next = user ? await gcpIdentitySession(user) : null;
    if (syncVersion.current !== version) return;
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
    const verification = prior?.user.uid === next?.user.uid && prior?.idToken !== next?.idToken
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
        // A first-factor-only Identity Platform session is never enough to cross the product route
        // boundary. Drop the header provider and retain the error for the auth UI.
        clearBffBrowserSession();
        setBffSession(null);
        setBffError(error instanceof Error ? error : new Error(String(error)));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;
    void gcpIdentityReady
      .then(() => {
        if (!active) return;
        unsubscribe = onIdTokenChanged(gcpIdentityAuth, (user) => {
          void applyUser(user).catch((error: unknown) => {
            clearBffBrowserSession();
            setBffError(error instanceof Error ? error : new Error(String(error)));
            setLoading(false);
          });
        });
      })
      .catch((error: unknown) => {
        clearBffBrowserSession();
        setBffError(error instanceof Error ? error : new Error(String(error)));
        setLoading(false);
      });
    return () => {
      active = false;
      unsubscribe();
      ++syncVersion.current;
      clearBffBrowserSession();
    };
  }, [applyUser]);

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

    let identityLogoutError: unknown;
    try {
      await signOutGcpIdentity(gcpIdentityAuth);
    } catch (error: unknown) {
      identityLogoutError = error;
    } finally {
      ++syncVersion.current;
      sessionRef.current = null;
      clearBffBrowserSession();
      setSession(null);
      setBffSession(null);
      setBffError(null);
      setLoading(false);
    }

    if (identityLogoutError) throw identityLogoutError;
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
