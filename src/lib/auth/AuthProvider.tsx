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
import type { GcpIdentitySession } from "@/integrations/gcp/identity";
import {
  clearBffBrowserSession,
  logoutBffBrowserSession,
  refreshAndVerifyBffBrowserSession,
  registerBffBrowserSession,
  verifyBffBrowserSession,
  type VerifiedBffBrowserSession,
} from "./bffBrowserSession";
import { hasDevLoginCredentials } from "./devLoginHelper";
import { isDevLoginHost } from "@/lib/bff-v1/runtimeEnv";
import { postDevLogin } from "./devLogin";

export interface AuthContextValue {
  session: GcpIdentitySession | null;
  user: User | null;
  /** BFF-owned identity/readiness; never inferred from browser-editable claims. */
  bffSession: VerifiedBffBrowserSession | null;
  bffError: Error | null;
  loading: boolean;
  retryBffSession: () => Promise<void>;
  signOut: () => Promise<void>;
  devLogin: (account: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  bffSession: null,
  bffError: null,
  loading: true,
  retryBffSession: async () => {},
  signOut: async () => {},
  devLogin: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<GcpIdentitySession | null>(null);
  const [bffSession, setBffSession] = useState<VerifiedBffBrowserSession | null>(null);
  const [bffError, setBffError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<GcpIdentitySession | null>(null);
  const syncVersion = useRef(0);

  const applyUser = useCallback(async (user: User | null, forceRefresh = false) => {
    const version = ++syncVersion.current;
    const prior = sessionRef.current;
    const next = user ? await (await import("@/integrations/gcp/identity")).gcpIdentitySession(user, forceRefresh) : null;
    if (syncVersion.current !== version) return;
    sessionRef.current = next;
    setSession(next);
    const sameUser = prior?.user.uid === next?.user.uid;
    if (!sameUser) setBffSession(null);
    setBffError(null);

    if (!next) {
      clearBffBrowserSession();
      if (!hasDevLoginCredentials()) {
        setLoading(false);
        return;
      }
    } else {
      // Install the new bearer synchronously before any BFF request can run.
      registerBffBrowserSession(next);
    }

    setLoading(true);
    const verification = prior?.user.uid === next?.user.uid && prior?.idToken !== next?.idToken
      ? refreshAndVerifyBffBrowserSession()
      : verifyBffBrowserSession();

    try {
      const verified = await verification;
      if (syncVersion.current !== version) return;
      setBffSession(verified);
      setBffError(null);
      setLoading(false);
    } catch (error: unknown) {
      if (syncVersion.current !== version) return;
      // A provider readback failure must not erase a session that was already
      // strictly authenticated for this same GCP Identity user. ProtectedRoute
      // decides from that session's BFF-owned authReady signal, not bffError.
      setBffError(error instanceof Error ? error : new Error(String(error)));
      setLoading(false);
    }
  }, []);

  const devLogin = useCallback(async (account: string, password: string) => {
    const version = ++syncVersion.current;
    setLoading(true);
    setBffError(null);
    try {
      await postDevLogin(account, password);
      if (syncVersion.current !== version) return;
      clearBffBrowserSession();
      const verified = await verifyBffBrowserSession();
      if (syncVersion.current !== version) return;
      sessionRef.current = null;
      setSession(null);
      setBffSession(verified);
      setBffError(null);
      setLoading(false);
    } catch (error: unknown) {
      if (syncVersion.current !== version) return;
      const normalized = error instanceof Error ? error : new Error(String(error));
      setBffError(normalized);
      setLoading(false);
      throw normalized;
    }
  }, []);

  useEffect(() => {
    if (isDevLoginHost()) {
      const version = ++syncVersion.current;
      clearBffBrowserSession();
      setLoading(true);
      setBffError(null);
      void verifyBffBrowserSession()
        .then((verified) => {
          if (syncVersion.current !== version) return;
          sessionRef.current = null;
          setSession(null);
          setBffSession(verified);
          setBffError(null);
          setLoading(false);
        })
        .catch(() => {
          if (syncVersion.current !== version) return;
          sessionRef.current = null;
          setSession(null);
          setBffSession(null);
          setBffError(null);
          setLoading(false);
        });
      return () => {
        ++syncVersion.current;
        clearBffBrowserSession();
      };
    }

    let unsubscribe = () => {};
    let active = true;
    void import("@/integrations/gcp/identity")
      .then(async ({ gcpIdentityReady, gcpIdentityAuth }) => {
        await gcpIdentityReady;
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

  const retryBffSession = useCallback(async () => {
    const current = sessionRef.current;
    setBffError(null);
    setLoading(true);

    if (!current) {
      if (isDevLoginHost()) {
        const version = ++syncVersion.current;
        clearBffBrowserSession();
        try {
          const verified = await verifyBffBrowserSession();
          if (syncVersion.current !== version) return;
          sessionRef.current = null;
          setSession(null);
          setBffSession(verified);
          setBffError(null);
          setLoading(false);
          return;
        } catch (error: unknown) {
          if (syncVersion.current !== version) return;
          const normalized = error instanceof Error ? error : new Error(String(error));
          setBffError(normalized);
          setLoading(false);
          throw normalized;
        }
      }
      const error = new Error("GCP Identity session is unavailable; choose an account to continue.");
      setBffError(error);
      setLoading(false);
      throw error;
    }

    try {
      // Refresh the existing first-factor token and re-run authoritative BFF
      // readback. This never asks the user to enter the same credentials again.
      await applyUser(current.user, true);
    } catch (error: unknown) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      setBffError(normalized);
      setLoading(false);
      throw normalized;
    }
  }, [applyUser]);

  const signOut = useCallback(async () => {
    ++syncVersion.current;
    const current = sessionRef.current;
    let bffLogoutError: unknown;

    if (current) {
      // Verification may previously have failed closed and cleared the provider;
      // restore only this current in-memory bearer long enough to invalidate it.
      registerBffBrowserSession(current);
    }
    try {
      await logoutBffBrowserSession();
    } catch (error: unknown) {
      bffLogoutError = error;
    }

    if (isDevLoginHost()) {
      sessionRef.current = null;
      clearBffBrowserSession();
      setSession(null);
      setBffSession(null);
      setBffError(null);
      setLoading(false);
      if (bffLogoutError) throw bffLogoutError;
      return;
    }

    let identityLogoutError: unknown;
    try {
      const { gcpIdentityAuth } = await import("@/integrations/gcp/identity");
      await signOutGcpIdentity(gcpIdentityAuth);
    } catch (error: unknown) {
      identityLogoutError = error;
    } finally {
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
        retryBffSession,
        signOut,
        devLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
