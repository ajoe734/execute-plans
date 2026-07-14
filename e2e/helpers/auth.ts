import { normalizeBearerToken as normalizeStrictBearerToken } from "../../scripts/lib/bearer-token.mjs";

export const DEFAULT_FE_OPERATOR_ID = "op-fe-gate";
export const DEFAULT_FE_TENANT_ID = "tenant-dev";
export const DEFAULT_FE_AUTH_ROLES = ["operator", "reviewer", "approver"] as const;
export const LOCAL_FIXTURE_AUTH_TOKEN = `${DEFAULT_FE_OPERATOR_ID}:${DEFAULT_FE_AUTH_ROLES.join(
  ",",
)}:mfa`;

export const BFF_AUTH_STORAGE_KEYS = {
  bearerToken: "pantheon.bff.bearerToken",
  legacyBearerToken: "pantheon_operator_token",
  tenantId: "pantheon.bff.tenantId",
  legacyTenantId: "pantheon_tenant_id",
  devOidcSession: "pantheon.e2e.devOidcSession",
} as const;

export type HeaderMap = Record<string, string>;

export type E2ePage = {
  addInitScript<Arg>(
    script: (arg: Arg) => unknown | Promise<unknown>,
    arg: Arg,
  ): Promise<void>;
  evaluate<Result>(script: () => Result | Promise<Result>): Promise<Result>;
  evaluate<Result, Arg>(
    script: (arg: Arg) => Result | Promise<Result>,
    arg: Arg,
  ): Promise<Result>;
  goto(url: string): Promise<unknown>;
};

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
  const session = devLoginSession(options);
  const storage = options.storage ?? "both";

  await page.addInitScript(
    ({ keys, session: nextSession, storageMode }) => {
      const write = (target: Storage | undefined) => {
        if (!target) return;
        target.setItem(keys.bearerToken, nextSession.token);
        target.setItem(keys.legacyBearerToken, nextSession.token);
        target.setItem(keys.tenantId, nextSession.tenantId);
        target.setItem(keys.legacyTenantId, nextSession.tenantId);
        target.setItem(
          keys.devOidcSession,
          JSON.stringify({
            aud: "pantheon-bff",
            auth_time: Math.floor(Date.now() / 1000),
            iss: "pantheon-e2e-dev-login",
            roles: nextSession.roles,
            sub: nextSession.operatorId,
            tenant_id: nextSession.tenantId,
          }),
        );
      };
      try {
        if (storageMode === "session" || storageMode === "both") write(window.sessionStorage);
        if (storageMode === "local" || storageMode === "both") write(window.localStorage);
      } catch {
        // Init scripts can run before the page has a durable origin.
      }
    },
    { keys: BFF_AUTH_STORAGE_KEYS, session, storageMode: storage },
  );

  await page
    .evaluate(
      ({ keys, session: nextSession, storageMode }) => {
        const write = (target: Storage | undefined) => {
          if (!target) return;
          target.setItem(keys.bearerToken, nextSession.token);
          target.setItem(keys.legacyBearerToken, nextSession.token);
          target.setItem(keys.tenantId, nextSession.tenantId);
          target.setItem(keys.legacyTenantId, nextSession.tenantId);
          target.setItem(
            keys.devOidcSession,
            JSON.stringify({
              aud: "pantheon-bff",
              auth_time: Math.floor(Date.now() / 1000),
              iss: "pantheon-e2e-dev-login",
              roles: nextSession.roles,
              sub: nextSession.operatorId,
              tenant_id: nextSession.tenantId,
            }),
          );
        };
        if (storageMode === "session" || storageMode === "both") write(window.sessionStorage);
        if (storageMode === "local" || storageMode === "both") write(window.localStorage);
      },
      { keys: BFF_AUTH_STORAGE_KEYS, session, storageMode: storage },
    )
    .catch(() => undefined);

  if (options.goto !== false && options.goto) {
    const base = options.pageBaseUrl?.replace(/\/$/, "");
    await page.goto(base ? `${base}${options.goto}` : options.goto);
  }

  return session;
}

export const installDevOidcLogin = installOidcDevLogin;
export const devLogin = installOidcDevLogin;
