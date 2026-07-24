import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserSessionPersistence,
  getAuth,
  getIdTokenResult,
  setPersistence,
  type User,
} from "firebase/auth";
import { validatePublicGcpIdentityConfig } from "@/config/publicGcpIdentity";

const config = validatePublicGcpIdentityConfig(
  import.meta.env.VITE_GCP_IDENTITY_API_KEY,
  import.meta.env.VITE_GCP_IDENTITY_PROJECT_ID,
  import.meta.env.VITE_GCP_IDENTITY_AUTH_DOMAIN,
);

const app = getApps().length > 0
  ? getApp()
  : initializeApp(config);

export const gcpIdentityAuth = getAuth(app);

/**
 * Identity Platform state survives only same-tab reloads. The BFF bearer is
 * still registered in memory after the SDK rehydrates and verifies the user.
 */
export const gcpIdentityReady = setPersistence(
  gcpIdentityAuth,
  browserSessionPersistence,
);

export interface GcpIdentitySession {
  claims: Readonly<Record<string, unknown>>;
  idToken: string;
  user: User;
}

export async function gcpIdentitySession(
  user: User,
  forceRefresh = false,
): Promise<GcpIdentitySession> {
  const result = await getIdTokenResult(user, forceRefresh);
  return {
    claims: result.claims,
    idToken: result.token,
    user,
  };
}
