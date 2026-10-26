import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserSessionPersistence,
  getAuth,
  getIdTokenResult,
  setPersistence,
  type Auth,
  type User,
} from "firebase/auth";
import { resolvePublicGcpIdentityRuntimeConfig } from "@/config/deploymentRuntime";
import {
  validatePublicGcpIdentityConfig,
  type PublicGcpIdentityConfig,
} from "@/config/publicGcpIdentity";

export function resolveGcpIdentityConfig(): PublicGcpIdentityConfig {
  const resolved = resolvePublicGcpIdentityRuntimeConfig({
    VITE_GCP_IDENTITY_API_KEY: import.meta.env.VITE_GCP_IDENTITY_API_KEY,
    VITE_GCP_IDENTITY_PROJECT_ID: import.meta.env.VITE_GCP_IDENTITY_PROJECT_ID,
    VITE_GCP_IDENTITY_AUTH_DOMAIN: import.meta.env.VITE_GCP_IDENTITY_AUTH_DOMAIN,
  });
  return validatePublicGcpIdentityConfig(
    resolved.apiKey,
    resolved.projectId,
    resolved.authDomain,
  );
}

function resolveFirebaseApp(config: PublicGcpIdentityConfig): FirebaseApp {
  const existing = getApps();
  if (existing.length === 0) {
    return initializeApp(config);
  }
  const defaultApp = getApp();
  if (
    defaultApp.options.apiKey === config.apiKey
    && defaultApp.options.projectId === config.projectId
    && defaultApp.options.authDomain === config.authDomain
  ) {
    return defaultApp;
  }
  const namedAppId = `pantheon-${config.projectId}`;
  const existingNamed = existing.find((candidate) => candidate.name === namedAppId);
  return existingNamed ?? initializeApp(config, namedAppId);
}

export function initializeGcpIdentityRuntime(): {
  app: FirebaseApp;
  auth: Auth;
  config: PublicGcpIdentityConfig;
  ready: Promise<void>;
} {
  const nextConfig = resolveGcpIdentityConfig();
  const nextApp = resolveFirebaseApp(nextConfig);
  const nextAuth = getAuth(nextApp);
  const nextReady = setPersistence(nextAuth, browserSessionPersistence);
  return {
    app: nextApp,
    auth: nextAuth,
    config: nextConfig,
    ready: nextReady,
  };
}

const initialRuntime = initializeGcpIdentityRuntime();

export const gcpIdentityAuth = initialRuntime.auth;

/**
 * Identity Platform state survives only same-tab reloads. The BFF bearer is
 * still registered in memory after the SDK rehydrates and verifies the user.
 */
export const gcpIdentityReady = initialRuntime.ready;

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
