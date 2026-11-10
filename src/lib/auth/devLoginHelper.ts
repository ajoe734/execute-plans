import { readBffEnv } from "@/lib/bff-v1/runtimeEnv";
import { setAuthProvider } from "@/lib/bff-v1/headers";
import { bffSessionFetch } from "./sessionExpiry";

let cachedToken: string | null = null;
let cachedTenantId: string | null = null;

export function getDevLoginCredentials(): { clientId: string | null; clientSecret: string | null } {
  const env = readBffEnv();

  const idKeys = [
    "VITE_BFF_DEV_LOGIN_CLIENT_ID",
    "PANTHEON_DEV_BFF_OIDC_CLIENT_ID",
    "DEV_BFF_OIDC_CLIENT_ID",
  ];

  const secretKeys = [
    "VITE_BFF_DEV_LOGIN_CLIENT_SECRET",
    "PANTHEON_DEV_BFF_OIDC_CLIENT_SECRET",
    "DEV_BFF_OIDC_CLIENT_SECRET",
  ];

  let clientId: string | null = null;
  let clientSecret: string | null = null;

  for (const key of idKeys) {
    const val = env[key];
    if (val) {
      clientId = val;
      break;
    }
  }

  for (const key of secretKeys) {
    const val = env[key];
    if (val) {
      clientSecret = val;
      break;
    }
  }

  return { clientId, clientSecret };
}

export function hasDevLoginCredentials(): boolean {
  const { clientId, clientSecret } = getDevLoginCredentials();
  return Boolean(clientId && clientSecret);
}

export async function tryDevLogin(): Promise<string | null> {
  const { clientId, clientSecret } = getDevLoginCredentials();
  if (!clientId || !clientSecret) {
    return null;
  }

  if (cachedToken) {
    setAuthProvider({
      getToken: () => cachedToken,
      getTenantId: () => cachedTenantId,
    });
    return cachedToken;
  }

  const env = readBffEnv();
  const baseUrl = env.VITE_BFF_BASE_URL ?? "";

  const response = await bffSessionFetch(
    `${baseUrl}/bff/auth/dev-login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": `fe-dev-login-${Date.now()}`,
      },
      credentials: "include",
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    },
    { baseUrl },
  );

  if (!response.ok) {
    throw new Error(`dev-login HTTP ${response.status}`);
  }

  const data = await response.json();
  const token = data.access_token;
  if (token) {
    const tenantId = data.tenant_id ?? data.meta?.tenant_id ?? "";
    cachedToken = token;
    cachedTenantId = tenantId || null;
    setAuthProvider({
      getToken: () => token,
      getTenantId: () => tenantId || null,
    });
    return token;
  }

  return null;
}

export function clearDevLoginCache(): void {
  cachedToken = null;
  cachedTenantId = null;
}
