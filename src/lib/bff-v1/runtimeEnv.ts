const DEV_RUNTIME_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "app.dev.mvl-cap.tw",
]);

const FALLBACK_RUNTIME_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
]);

const REAL_WRITE_KEYS = [
  "pantheon.integration.realWrites",
  "pantheon.e2e.realWrites",
];

const FALLBACK_KEYS = [
  "pantheon.integration.fallback",
  "pantheon.e2e.fallback",
];

const RUNTIME_CONFIG_KEYS = [
  "__PANTHEON_BFF_RUNTIME__",
  "__PANTHEON_RUNTIME_CONFIG__",
] as const;

function truthy(value: unknown): boolean {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function falsey(value: unknown): boolean {
  return ["0", "false", "no", "off"].includes(String(value ?? "").trim().toLowerCase());
}

function readRuntimeConfigValue(key: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  const runtimeWindow = window as unknown as Record<string, unknown>;
  for (const configKey of RUNTIME_CONFIG_KEYS) {
    const config = runtimeWindow[configKey];
    if (!config || typeof config !== "object" || Array.isArray(config)) continue;
    const value = (config as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return undefined;
}

function browserHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location?.hostname ?? "";
}

export function isDevRuntimeWriteGateHost(hostname = browserHostname()): boolean {
  return DEV_RUNTIME_HOSTS.has(hostname);
}

export function isRuntimeFallbackHost(hostname = browserHostname()): boolean {
  return FALLBACK_RUNTIME_HOSTS.has(hostname);
}

export function isDevLoginHost(hostname = browserHostname()): boolean {
  return DEV_RUNTIME_HOSTS.has(hostname);
}


function readStorageValue(key: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const value = storage.getItem(key);
      if (value !== null) return value;
    } catch {
      // Ignore inaccessible browser storage and continue with build-time env.
    }
  }
  return undefined;
}

function readBooleanOverride(keys: string[]): string | undefined {
  for (const key of ["VITE_BFF_REAL_WRITES", "realWrites", ...keys]) {
    const runtimeVal = readRuntimeConfigValue(key);
    if (runtimeVal !== undefined) {
      if (truthy(runtimeVal)) return "true";
      if (falsey(runtimeVal)) return "false";
    }
  }
  for (const key of keys) {
    const value = readStorageValue(key);
    if (value === undefined) continue;
    if (truthy(value)) return "true";
    if (falsey(value)) return "false";
  }
  return undefined;
}

function readFallbackOverride(): string | undefined {
  for (const key of ["VITE_BFF_FALLBACK", "fallback"]) {
    const value = readRuntimeConfigValue(key)?.trim().toLowerCase();
    if (value === "strict" || value === "auto") return value;
  }

  for (const key of FALLBACK_KEYS) {
    const value = readStorageValue(key)?.trim().toLowerCase();
    if (value === "strict" || value === "auto") return value;
  }
  return undefined;
}

function readDevRuntimeOverrides(): Record<string, string | undefined> {
  const overrides: Record<string, string | undefined> = {};
  if (isDevRuntimeWriteGateHost()) {
    const realWrites = readBooleanOverride(REAL_WRITE_KEYS);
    if (realWrites !== undefined) overrides.VITE_BFF_REAL_WRITES = realWrites;
  }
  if (isRuntimeFallbackHost()) {
    const fallback = readFallbackOverride();
    if (fallback !== undefined) overrides.VITE_BFF_FALLBACK = fallback;
  }
  return overrides;
}

export function readBffEnv(): Record<string, string | undefined> {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env ?? {};
  const viteEnv = metaEnv as Record<string, string | undefined>;
  const nodeEnv = typeof process !== "undefined" ? process.env : {};
  const isProd = metaEnv.PROD === true;
  const prodDefaults: Record<string, string | undefined> = isProd
    ? {
        VITE_BFF_MODE: "live",
        VITE_BFF_FALLBACK: "strict",
        VITE_BFF_REAL_WRITES: "false",
        VITE_BFF_ALLOW_DEV_STUB_WRITES: "false",
        VITE_BFF_EMBEDDED_BEARER_TOKEN: "false",
      }
    : {};
  return { ...prodDefaults, ...viteEnv, ...nodeEnv, ...readDevRuntimeOverrides() };
}
