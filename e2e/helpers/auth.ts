import { normalizeBearerToken as normalizeStrictBearerToken } from "../../scripts/lib/bearer-token.mjs";
import type { Page, Route } from "@playwright/test";

export const DEFAULT_FE_OPERATOR_ID = "op-fe-gate";
export const DEFAULT_FE_TENANT_ID = "tenant-dev";
export const DEFAULT_FE_AUTH_ROLES = ["operator", "reviewer", "approver"] as const;
export const LOCAL_FIXTURE_AUTH_TOKEN = `${DEFAULT_FE_OPERATOR_ID}:${DEFAULT_FE_AUTH_ROLES.join(
  ",",
)}:mfa`;

export type HeaderMap = Record<string, string>;

export type E2ePage = Pick<Page, "addInitScript" | "evaluate" | "goto" | "route">;

export type DevLoginSession = {
  authorization: string;
  operatorId: string;
  roles: string[];
  tenantId: string;
  token: string;
};

export type AuthHeaderOptions = {
  accept?: string;
  contentType?: string;
  env?: Record<string, string | undefined>;
  extra?: HeaderMap;
  includeContentType?: boolean;
  tenantId?: string;
  token?: string;
};

export type DevLoginOptions = {
  env?: Record<string, string | undefined>;
  goto?: string | false;
  operatorId?: string;
  pageBaseUrl?: string;
  roles?: string[];
  /** Loopback fixtures support same-tab GCP Identity storage only. */
  storage?: "session" | "local" | "both";
  tenantId?: string;
  token?: string;
};

function envValue(env: Record<string, string | undefined>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function credentialEnvValue(
  env: Record<string, string | undefined>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function defaultEnv(): Record<string, string | undefined> {
  return typeof process === "undefined" ? {} : process.env;
}

function explicitAuthToken(
  env: Record<string, string | undefined>,
  token?: string,
): string | undefined {
  if (token !== undefined) return token;
  for (const key of [
    "BFF_AUTH_TOKEN",
    "PANTHEON_BFF_SMOKE_BEARER_TOKEN",
    "PANTHEON_BFF_SMOKE_TOKEN",
  ]) {
    if (env[key] !== undefined) return env[key];
  }
  return undefined;
}

function isLoopbackTarget(value: string): boolean {
  try {
    const target = new URL(value);
    if (target.protocol !== "http:" && target.protocol !== "https:") return false;

    const hostname = target.hostname.toLowerCase().replace(/\.$/u, "");
    if (hostname === "localhost" || hostname === "0.0.0.0") return true;
    if (hostname === "::1" || hostname === "[::1]") return true;

    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u);
    if (!ipv4) return false;
    const octets = ipv4.slice(1).map(Number);
    return octets.every((octet) => octet >= 0 && octet <= 255) && octets[0] === 127;
  } catch {
    return false;
  }
}

function effectiveFrontendTarget(
  options: Pick<DevLoginOptions, "goto" | "pageBaseUrl">,
  env: Record<string, string | undefined>,
): string {
  let configuredTarget = options.pageBaseUrl;
  if (!configuredTarget) {
    for (const key of [
      "PANTHEON_FE_BASE_URL",
      "FRONTEND_BASE_URL",
      "PLAYWRIGHT_BASE_URL",
    ]) {
      if (env[key] !== undefined && env[key] !== "") {
        configuredTarget = env[key];
        break;
      }
    }
  }
  configuredTarget ??= "http://localhost:5173";

  if (typeof options.goto === "string") {
    try {
      return new URL(options.goto, configuredTarget).origin;
    } catch {
      return "";
    }
  }
  return configuredTarget;
}

export function localFixtureFrontendIsLoopback(
  options: Pick<DevLoginOptions, "goto" | "pageBaseUrl"> = {},
  env: Record<string, string | undefined> = defaultEnv(),
): boolean {
  return isLoopbackTarget(effectiveFrontendTarget(options, env));
}

export function targetsExternalE2eEnvironment(
  env: Record<string, string | undefined> = defaultEnv(),
): boolean {
  if (
    env.PANTHEON_HOSTED_E2E === "1"
    || env.FE_INT_GATE_LIVE_BFF === "1"
    || env.F08_CREATE_INTENT_LIVE_BFF === "1"
    || env.RUN_LIVE_BFF_CONTRACTS === "1"
  ) {
    return true;
  }

  // The upstream BFF can be external while a loopback Vite server remains the
  // browser-visible E2E boundary and proxies same-origin /bff requests. Raw
  // upstream/proxy variables therefore cannot classify the browser session.
  if (!isLoopbackTarget(effectiveFrontendTarget({}, env))) return true;

  const browserBffTarget = env.PANTHEON_BROWSER_BFF_BASE_URL?.trim();
  return Boolean(browserBffTarget && !isLoopbackTarget(browserBffTarget));
}

function missingExternalCredential(): Error {
  return new Error(
    "A short-lived BFF_AUTH_TOKEN is required for hosted or external E2E; tracked fixture credentials are local-only",
  );
}

function localFixtureExternalFrontend(): Error {
  return new Error(
    "LOCAL_FIXTURE_AUTH_TOKEN may be installed only for a proven loopback-only E2E target",
  );
}

export function normalizeBearerToken(token: string): string {
  return normalizeStrictBearerToken(token, "Explicit BFF credential");
}

export function roleTokenFromEnv(
  role: string,
  explicitKeys: string[] = [],
  env: Record<string, string | undefined> = defaultEnv(),
): string {
  const normalizedRole = role.trim().toLowerCase().replaceAll("-", "_");
  const explicit = credentialEnvValue(env, [
    ...explicitKeys,
    `PANTHEON_BFF_${normalizedRole.toUpperCase()}_TOKEN`,
  ]);
  if (explicit) return normalizeBearerToken(explicit);

  const encoded = env.PANTHEON_BFF_RBAC_TOKENS_JSON?.trim();
  if (!encoded) return "";
  let tokens: Record<string, unknown>;
  try {
    tokens = JSON.parse(encoded) as Record<string, unknown>;
  } catch {
    return "";
  }
  for (const [candidateRole, token] of Object.entries(tokens)) {
    if (candidateRole.trim().toLowerCase().replaceAll("-", "_") !== normalizedRole) continue;
    return typeof token === "string" ? normalizeBearerToken(token) : "";
  }
  return "";
}

export function makeDevAuthToken(options: {
  operatorId?: string;
  roles?: readonly string[];
  mfa?: boolean;
} = {}): string {
  const operatorId = options.operatorId ?? DEFAULT_FE_OPERATOR_ID;
  const roles = options.roles ?? DEFAULT_FE_AUTH_ROLES;
  const suffix = options.mfa === false ? "" : ":mfa";
  return `${operatorId}:${roles.join(",")}${suffix}`;
}

export function authToken(options: AuthHeaderOptions = {}): string {
  const env = options.env ?? defaultEnv();
  const explicit = explicitAuthToken(env, options.token);
  if (explicit !== undefined) {
    const normalized = normalizeBearerToken(explicit);
    if (
      normalized === LOCAL_FIXTURE_AUTH_TOKEN
      && targetsExternalE2eEnvironment(env)
    ) {
      throw missingExternalCredential();
    }
    return normalized;
  }
  if (targetsExternalE2eEnvironment(env)) throw missingExternalCredential();
  return LOCAL_FIXTURE_AUTH_TOKEN;
}

export function bearerHeader(token?: string): string {
  return `Bearer ${normalizeBearerToken(token ?? authToken())}`;
}

export function withBearer<T extends HeaderMap>(
  headers: T,
  token?: string,
): T & { Authorization: string } {
  return {
    ...headers,
    Authorization: bearerHeader(token),
  };
}

export function authHeaders(options: AuthHeaderOptions = {}): HeaderMap {
  const headers: HeaderMap = {
    Accept: options.accept ?? "application/json",
    Authorization: bearerHeader(authToken(options)),
    ...(options.extra ?? {}),
  };
  const tenantId = options.tenantId ?? envValue(options.env ?? defaultEnv(), [
    "BFF_TENANT_ID",
    "PANTHEON_TENANT_ID",
  ]);
  if (tenantId) headers["X-Tenant-Id"] = tenantId;
  if (options.includeContentType || options.contentType) {
    headers["Content-Type"] = options.contentType ?? "application/json";
  }
  return headers;
}

export function mutationAuthHeaders(options: AuthHeaderOptions = {}): HeaderMap {
  return authHeaders({ ...options, includeContentType: true });
}

export function actorFromAuthorization(value: string | undefined): string {
  if (!value) return "";
  const token = normalizeBearerToken(value);
  return token.split(":")[0] ?? "";
}

export function gcpIdentityStorageKey(apiKey: string): string {
  return `firebase:authUser:${apiKey}:[DEFAULT]`;
}

export function gcpIdentityStoredUser(input: {
  apiKey: string;
  email: string;
  emailVerified?: boolean;
  token: string;
  uid: string;
}): Record<string, unknown> {
  const claims = (() => {
    const parts = input.token.split(".");
    if (parts.length !== 3) return {};
    try {
      return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  const expirationTime = Number(claims.exp ?? 0) * 1000;
  return {
    apiKey: input.apiKey,
    appName: "[DEFAULT]",
    createdAt: String(Date.now()),
    displayName: null,
    email: input.email,
    emailVerified: input.emailVerified ?? true,
    isAnonymous: false,
    lastLoginAt: String(Date.now()),
    phoneNumber: null,
    photoURL: null,
    providerData: [],
    stsTokenManager: {
      accessToken: input.token,
      expirationTime,
      refreshToken: "",
    },
    tenantId: null,
    uid: input.uid,
  };
}

function loopbackFirebaseToken(session: DevLoginSession): string {
  if (session.token.split(".").length === 3) return session.token;
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      aud: "pantheon-loopback",
      email: `${session.operatorId}@loopback.invalid`,
      email_verified: true,
      exp: now + 3600,
      firebase: {
        sign_in_provider: "password",
        sign_in_second_factor: "totp",
      },
      iat: now,
      roles: session.roles,
      sub: session.operatorId,
      tenant_id: session.tenantId,
    }),
    "loopback-fixture-signature",
  ].join(".");
}

export function devLoginSession(options: DevLoginOptions = {}): DevLoginSession {
  const roles = options.roles ?? [...DEFAULT_FE_AUTH_ROLES];
  const env = options.env ?? defaultEnv();
  const explicit = explicitAuthToken(env, options.token);
  if (explicit === undefined && targetsExternalE2eEnvironment(env)) {
    throw missingExternalCredential();
  }
  const token = normalizeBearerToken(
    explicit ?? makeDevAuthToken({ operatorId: options.operatorId, roles }),
  );
  if (
    (explicit === undefined || token === LOCAL_FIXTURE_AUTH_TOKEN)
    && (
      !localFixtureFrontendIsLoopback(options, env)
      || targetsExternalE2eEnvironment(env)
    )
  ) {
    throw localFixtureExternalFrontend();
  }
  return {
    authorization: bearerHeader(token),
    operatorId: (options.operatorId ?? actorFromAuthorization(token)) || DEFAULT_FE_OPERATOR_ID,
    roles,
    tenantId: options.tenantId ?? DEFAULT_FE_TENANT_ID,
    token,
  };
}

export async function installOidcDevLogin(
  page: E2ePage,
  options: DevLoginOptions = {},
): Promise<DevLoginSession> {
  const env = options.env ?? defaultEnv();
  const session = devLoginSession({ ...options, env });
  if (
    !localFixtureFrontendIsLoopback(options, env)
    || targetsExternalE2eEnvironment(env)
  ) {
    throw new Error(
      "installOidcDevLogin cannot synthesize hosted auth; establish a real GCP Identity/BFF strict browser session instead",
    );
  }
  if (options.storage === "local" || options.storage === "both") {
    throw new Error("Loopback auth fixtures may use same-tab sessionStorage only");
  }

  const apiKey = envValue(env, [
    "VITE_GCP_IDENTITY_API_KEY",
    "PANTHEON_PUBLIC_GCP_IDENTITY_API_KEY",
  ]) ?? "AIza00000000000000000000000000000000000";
  const storageKey = gcpIdentityStorageKey(apiKey);
  const operatorReady = session.roles.some((role) =>
    ["admin", "platform_admin", "operator", "ops", "reviewer", "approver", "research_lead"]
      .includes(role.toLowerCase()),
  );
  const capabilities = operatorReady
    ? ["agora.workshop.v1", "agora.persona.interaction.v1"]
    : [];
  const storedUser = gcpIdentityStoredUser({
    apiKey,
    email: `${session.operatorId}@loopback.invalid`,
    token: loopbackFirebaseToken(session),
    uid: session.operatorId,
  });

  const fulfillJson = async (route: Route, body: unknown) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  };
  await page.route("**/bff/me", async (route) => {
    await fulfillJson(route, {
      data: {
        user: { id: session.operatorId, display_name: session.operatorId },
        tenant: { id: session.tenantId },
        roles: session.roles,
        capabilities,
        environment: { name: "dev", strict_auth: true },
        session: { authenticated: true, session_kind: "bearer" },
      },
      meta: { route: "GET /bff/me", contract: "PINT-016-LOOPBACK-FIXTURE" },
    });
  });
  await page.route("**/bff/auth/readiness", async (route) => {
    await fulfillJson(route, {
      data: {
        ready: operatorReady,
        authReady: operatorReady,
        providerReady: true,
        sourceCommitSha: "0".repeat(40),
        auth: {
          mode: "strict",
          strict: true,
          stub: false,
          sessionKind: "bearer",
          operatorRoleReady: operatorReady,
          interactionCapabilityReady: operatorReady,
        },
        identity: {
          operatorId: session.operatorId,
          roles: session.roles,
          tenantId: session.tenantId,
          capabilities,
        },
        provider: { provider: "loopback-fixture", ready: true, status: "ready" },
        authority: { interaction: "advisory", execution: "none", broker: "none", capital: "none" },
      },
      meta: { route: "GET /bff/auth/readiness", contract: "PINT-016-LOOPBACK-FIXTURE" },
    });
  });

  await page.addInitScript(
    ({ key, storedSession }) => {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(storedSession));
      } catch {
        // Init scripts can run before the page has a durable origin.
      }
    },
    { key: storageKey, storedSession: storedUser },
  );

  await page
    .evaluate(
      ({ key, storedSession }) => {
        window.sessionStorage.setItem(key, JSON.stringify(storedSession));
      },
      { key: storageKey, storedSession: storedUser },
    )
    .catch(() => undefined);

  if (options.goto !== false && options.goto) {
    const base = options.pageBaseUrl?.replace(/\/$/, "");
    await page.goto(base ? `${base}${options.goto}` : options.goto);
  }

  return session;
}

/**
 * Installs the synthetic same-tab session used by fully intercepted loopback
 * browser fixtures. The deny route is registered first so later fixture routes
 * can handle declared BFF calls while every undeclared BFF request is blocked
 * from reaching an external runtime with the synthetic credential.
 */
export async function installContainedLoopbackAuth(
  page: E2ePage,
  options: DevLoginOptions = {},
): Promise<DevLoginSession> {
  const env = options.env ?? defaultEnv();
  if (!localFixtureFrontendIsLoopback(options, env)) {
    throw localFixtureExternalFrontend();
  }

  await page.route("**/bff/**", async (route) => {
    await route.abort("blockedbyclient");
  });

  return installContainedLoopbackAuthAuthority(page, options);
}

/**
 * Re-registers the strict identity/readiness fixtures after a test's broader
 * BFF catch-all routes, giving the auth authority endpoints exact priority
 * without moving the deny-by-default route ahead of declared fixture routes.
 */
export async function installContainedLoopbackAuthAuthority(
  page: E2ePage,
  options: DevLoginOptions = {},
): Promise<DevLoginSession> {
  const env = options.env ?? defaultEnv();
  if (!localFixtureFrontendIsLoopback(options, env)) {
    throw localFixtureExternalFrontend();
  }

  return installOidcDevLogin(page, {
    ...options,
    env: {
      ...env,
      F08_CREATE_INTENT_LIVE_BFF: "",
      FE_INT_GATE_LIVE_BFF: "",
      PANTHEON_BROWSER_BFF_BASE_URL: "",
      PANTHEON_HOSTED_E2E: "",
      RUN_LIVE_BFF_CONTRACTS: "",
    },
    goto: options.goto ?? false,
  });
}

export const installDevOidcLogin = installOidcDevLogin;
export const devLogin = installOidcDevLogin;
