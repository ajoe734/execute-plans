import { assertNoPublicRuntimeCredentials } from "@/config/publicBuildAuth";
import {
  validatePublicGcpIdentityConfig,
  validatePublicGcpIdentityRuntimeConfig,
  type PublicDeploymentEnvironment,
  type PublicGcpIdentityConfig,
  type PublicGcpIdentityRuntimeConfig,
} from "@/config/publicGcpIdentity";

export const PUBLIC_RUNTIME_CONFIG_SCHEMA =
  "pantheon.fe.public-runtime-config.v1" as const;

export const PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY =
  "__PANTHEON_DEPLOYMENT_CONFIG__" as const;

export class DeploymentRuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentRuntimeConfigError";
  }
}

export interface PublicDeploymentRuntimeConfigInput {
  schemaVersion: 1 | typeof PUBLIC_RUNTIME_CONFIG_SCHEMA;
  environment: PublicDeploymentEnvironment;
  configRef: string;
  configSha256?: string;
  bffBaseUrl: string;
  gcpIdentity: {
    apiKey: string;
    projectId: string;
    authDomain: string;
    issuer?: string;
    audience?: string;
  };
}

export interface ValidatedDeploymentRuntimeConfig {
  readonly schemaVersion: typeof PUBLIC_RUNTIME_CONFIG_SCHEMA;
  readonly environment: PublicDeploymentEnvironment;
  readonly configRef: string;
  readonly configSha256: string;
  readonly bffBaseUrl: string;
  readonly gcpIdentity: Readonly<PublicGcpIdentityRuntimeConfig>;
  readonly safeDefaults: Readonly<{
    VITE_BFF_MODE: "live";
    VITE_BFF_FALLBACK: "strict";
    VITE_BFF_REAL_WRITES: "false";
    VITE_BFF_ALLOW_DEV_STUB_WRITES: "false";
    VITE_BFF_EMBEDDED_BEARER_TOKEN: "false";
  }>;
}

export interface DeploymentRuntimeAuditSnapshot {
  readonly schemaVersion: typeof PUBLIC_RUNTIME_CONFIG_SCHEMA;
  readonly environment: PublicDeploymentEnvironment;
  readonly configRef: string;
  readonly configSha256: string;
  readonly bffBaseUrl: string;
  readonly gcpIdentity: Readonly<{
    projectId: string;
    authDomain: string;
    issuer: string;
    audience: string;
  }>;
}

const PERMITTED_TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "environment",
  "configRef",
  "configSha256",
  "bffBaseUrl",
  "gcpIdentity",
]);

const PERMITTED_ENVIRONMENTS = new Set<PublicDeploymentEnvironment>([
  "local",
  "dev",
  "staging",
  "production",
]);

const SAFE_RUNTIME_DEFAULTS = Object.freeze({
  VITE_BFF_MODE: "live" as const,
  VITE_BFF_FALLBACK: "strict" as const,
  VITE_BFF_REAL_WRITES: "false" as const,
  VITE_BFF_ALLOW_DEV_STUB_WRITES: "false" as const,
  VITE_BFF_EMBEDDED_BEARER_TOKEN: "false" as const,
});

const CONFIG_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA256_DIGEST_PATTERN = /^(?:sha256:)?([0-9a-f]{64})$/iu;

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLenHi = Math.floor((bytes.length * 8) / 0x100000000);
  const bitLenLo = (bytes.length * 8) >>> 0;
  const paddedLength = (((bytes.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLenHi, false);
  view.setUint32(paddedLength - 4, bitLenLo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}

let activeAuditSnapshot: DeploymentRuntimeAuditSnapshot | null = null;

export function getActiveDeploymentRuntimeAudit(): DeploymentRuntimeAuditSnapshot | null {
  return activeAuditSnapshot;
}

export function resetDeploymentRuntimeAuditForTests(): void {
  activeAuditSnapshot = null;
}

function currentBrowserHostname(explicitHostname?: string): string {
  if (explicitHostname !== undefined) return explicitHostname.trim().toLowerCase();
  if (typeof window === "undefined") return "";
  return (window.location?.hostname ?? "").trim().toLowerCase();
}

export function isLoopbackHostname(hostname = currentBrowserHostname()): boolean {
  return (
    hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "[::1]"
    || /^127\.\d+\.\d+\.\d+$/u.test(hostname)
  );
}

export function isDevDeploymentHostname(hostname = currentBrowserHostname()): boolean {
  return hostname === "app.dev.mvl-cap.tw";
}

export function isStagingDeploymentHostname(hostname = currentBrowserHostname()): boolean {
  return (
    hostname.endsWith(".stg.mvl-cap.tw")
    || hostname.endsWith(".staging.mvl-cap.tw")
    || hostname.startsWith("stg-")
    || hostname.startsWith("staging-")
    || hostname.endsWith(".internal")
  );
}

export function isNonDevDeploymentHost(hostname = currentBrowserHostname()): boolean {
  if (!hostname) return false;
  return !isLoopbackHostname(hostname) && !isDevDeploymentHostname(hostname);
}

function validateBffBaseUrl(
  rawUrl: unknown,
  environment: PublicDeploymentEnvironment,
): string {
  if (typeof rawUrl !== "string" || rawUrl.trim() !== rawUrl || !rawUrl) {
    throw new DeploymentRuntimeConfigError(
      "bffBaseUrl must be a non-empty trimmed URL string",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new DeploymentRuntimeConfigError(
      `bffBaseUrl '${rawUrl}' is not a valid URL`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new DeploymentRuntimeConfigError(
      "bffBaseUrl must not contain embedded credentials",
    );
  }

  if (parsed.search || parsed.hash) {
    throw new DeploymentRuntimeConfigError(
      "bffBaseUrl must not contain a query string or hash fragment",
    );
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/u, "");
  if (normalizedPath !== "") {
    throw new DeploymentRuntimeConfigError(
      `bffBaseUrl '${rawUrl}' must be an origin without path segments`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "169.254.169.254"
    || hostname.includes("169.254.")
    || hostname === "metadata.google.internal"
    || hostname.endsWith(".metadata.google.internal")
  ) {
    throw new DeploymentRuntimeConfigError(
      `bffBaseUrl '${rawUrl}' targets a forbidden metadata or link-local address`,
    );
  }

  if (environment === "local") {
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new DeploymentRuntimeConfigError(
        `Local bffBaseUrl '${rawUrl}' must use http: or https:`,
      );
    }
    if (!isLoopbackHostname(hostname)) {
      throw new DeploymentRuntimeConfigError(
        `Local bffBaseUrl '${rawUrl}' must target a loopback host`,
      );
    }
    return parsed.origin;
  }

  if (parsed.protocol !== "https:") {
    throw new DeploymentRuntimeConfigError(
      `Non-local bffBaseUrl '${rawUrl}' must use https:`,
    );
  }

  if (isLoopbackHostname(hostname)) {
    throw new DeploymentRuntimeConfigError(
      `Non-local (${environment}) bffBaseUrl '${rawUrl}' must not target loopback`,
    );
  }

  const isPantheonDomain =
    hostname === "mvl-cap.tw" || hostname.endsWith(".mvl-cap.tw");
  const isStagingInternal =
    environment === "staging" && hostname.endsWith(".internal");

  if (!isPantheonDomain && !isStagingInternal) {
    throw new DeploymentRuntimeConfigError(
      `bffBaseUrl '${rawUrl}' is not an approved Pantheon BFF origin`,
    );
  }

  const isDevBffHost =
    hostname === "api.dev.mvl-cap.tw"
    || hostname.endsWith(".dev.mvl-cap.tw")
    || hostname.startsWith("dev-");
  const isStagingBffHost = isStagingDeploymentHostname(hostname);

  if (environment === "dev" && hostname !== "api.dev.mvl-cap.tw") {
    throw new DeploymentRuntimeConfigError(
      `Dev runtime config requires bffBaseUrl 'https://api.dev.mvl-cap.tw', got '${parsed.origin}'`,
    );
  }

  if (environment === "staging") {
    if (isDevBffHost) {
      throw new DeploymentRuntimeConfigError(
        `Staging runtime config forbids Dev BFF origin '${parsed.origin}'`,
      );
    }
    if (!isStagingBffHost) {
      throw new DeploymentRuntimeConfigError(
        `Staging runtime config requires a staging BFF origin, got '${parsed.origin}'`,
      );
    }
  }

  if (environment === "production") {
    if (isDevBffHost || isStagingBffHost) {
      throw new DeploymentRuntimeConfigError(
        `Production runtime config forbids non-production BFF origin '${parsed.origin}'`,
      );
    }
  }

  return parsed.origin;
}

function assertBrowserHostMatchesEnvironment(
  hostname: string,
  environment: PublicDeploymentEnvironment,
): void {
  if (!hostname || isLoopbackHostname(hostname)) {
    return;
  }
  if (isDevDeploymentHostname(hostname) && environment !== "dev") {
    throw new DeploymentRuntimeConfigError(
      `Dev host '${hostname}' forbids runtime config for environment '${environment}'`,
    );
  }
  if (isStagingDeploymentHostname(hostname) && environment !== "staging") {
    throw new DeploymentRuntimeConfigError(
      `Staging host '${hostname}' requires environment='staging', got '${environment}'`,
    );
  }
  if (
    !isDevDeploymentHostname(hostname)
    && !isStagingDeploymentHostname(hostname)
    && environment !== "production"
  ) {
    throw new DeploymentRuntimeConfigError(
      `Production host '${hostname}' requires environment='production', got '${environment}'`,
    );
  }
}

export function canonicalDeploymentConfigPayload(config: {
  environment: PublicDeploymentEnvironment;
  configRef: string;
  bffBaseUrl: string;
  gcpIdentity: PublicGcpIdentityRuntimeConfig;
}): string {
  return JSON.stringify({
    bffBaseUrl: config.bffBaseUrl,
    configRef: config.configRef,
    environment: config.environment,
    gcpIdentity: {
      apiKey: config.gcpIdentity.apiKey,
      audience: config.gcpIdentity.audience,
      authDomain: config.gcpIdentity.authDomain,
      issuer: config.gcpIdentity.issuer,
      projectId: config.gcpIdentity.projectId,
    },
    schemaVersion: PUBLIC_RUNTIME_CONFIG_SCHEMA,
  });
}

export function computeDeploymentConfigSha256(config: {
  environment: PublicDeploymentEnvironment;
  configRef: string;
  bffBaseUrl: string;
  gcpIdentity: PublicGcpIdentityRuntimeConfig;
}): string {
  return `sha256:${sha256Hex(canonicalDeploymentConfigPayload(config))}`;
}

export function validateDeploymentRuntimeConfig(
  rawInput: unknown,
  options?: { hostname?: string },
): ValidatedDeploymentRuntimeConfig {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw new DeploymentRuntimeConfigError(
      "Public deployment runtime config must be a non-null JSON object",
    );
  }

  try {
    assertNoPublicRuntimeCredentials(
      rawInput,
      "Public deployment runtime config",
    );
  } catch (error) {
    throw new DeploymentRuntimeConfigError(
      error instanceof Error ? error.message : String(error),
    );
  }

  const record = rawInput as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!PERMITTED_TOP_LEVEL_KEYS.has(key)) {
      throw new DeploymentRuntimeConfigError(
        `Public deployment runtime config contains unsupported or forbidden override key '${key}'`,
      );
    }
  }

  const rawSchemaVersion = record.schemaVersion;
  if (
    rawSchemaVersion !== 1
    && rawSchemaVersion !== PUBLIC_RUNTIME_CONFIG_SCHEMA
  ) {
    throw new DeploymentRuntimeConfigError(
      `Unsupported public deployment runtime config schemaVersion: ${String(rawSchemaVersion)}`,
    );
  }

  const rawEnv = record.environment;
  if (
    typeof rawEnv !== "string"
    || !PERMITTED_ENVIRONMENTS.has(rawEnv as PublicDeploymentEnvironment)
  ) {
    throw new DeploymentRuntimeConfigError(
      `Invalid public deployment runtime environment: ${String(rawEnv)}`,
    );
  }
  const environment = rawEnv as PublicDeploymentEnvironment;

  const rawConfigRef = record.configRef;
  if (
    typeof rawConfigRef !== "string"
    || rawConfigRef.trim() !== rawConfigRef
    || !CONFIG_REF_PATTERN.test(rawConfigRef)
  ) {
    throw new DeploymentRuntimeConfigError(
      "Public deployment runtime configRef must be a non-empty identifier (1-128 safe characters)",
    );
  }

  const bffBaseUrl = validateBffBaseUrl(record.bffBaseUrl, environment);

  let gcpIdentity: PublicGcpIdentityRuntimeConfig;
  try {
    gcpIdentity = validatePublicGcpIdentityRuntimeConfig(record.gcpIdentity, {
      environment,
    });
  } catch (error) {
    throw new DeploymentRuntimeConfigError(
      error instanceof Error ? error.message : String(error),
    );
  }

  const hostname = currentBrowserHostname(options?.hostname);
  assertBrowserHostMatchesEnvironment(hostname, environment);

  const computedSha256 = computeDeploymentConfigSha256({
    environment,
    configRef: rawConfigRef,
    bffBaseUrl,
    gcpIdentity,
  });

  let configSha256 = computedSha256;
  if (record.configSha256 !== undefined) {
    if (typeof record.configSha256 !== "string") {
      throw new DeploymentRuntimeConfigError(
        "configSha256 must be a string digest when provided",
      );
    }
    const match = SHA256_DIGEST_PATTERN.exec(record.configSha256.trim());
    if (!match) {
      throw new DeploymentRuntimeConfigError(
        "configSha256 must be a 64-character hex SHA-256 digest",
      );
    }
    const normalizedProvided = `sha256:${match[1].toLowerCase()}`;
    if (normalizedProvided !== computedSha256) {
      throw new DeploymentRuntimeConfigError(
        `Public deployment runtime configSha256 mismatch: expected ${computedSha256}, got ${normalizedProvided}`,
      );
    }
    configSha256 = normalizedProvided;
  }

  return Object.freeze({
    schemaVersion: PUBLIC_RUNTIME_CONFIG_SCHEMA,
    environment,
    configRef: rawConfigRef,
    configSha256,
    bffBaseUrl,
    gcpIdentity: Object.freeze({ ...gcpIdentity }),
    safeDefaults: SAFE_RUNTIME_DEFAULTS,
  });
}

function readWindowDeploymentConfigCandidate(): unknown {
  if (typeof window === "undefined") return undefined;
  const runtimeWindow = window as unknown as Record<string, unknown>;

  for (const legacyKey of ["__PANTHEON_BFF_RUNTIME__", "__PANTHEON_RUNTIME_CONFIG__"]) {
    const legacyCandidate = runtimeWindow[legacyKey];
    if (legacyCandidate && typeof legacyCandidate === "object" && !Array.isArray(legacyCandidate)) {
      try {
        assertNoPublicRuntimeCredentials(
          legacyCandidate,
          `window.${legacyKey}`,
        );
      } catch (error) {
        throw new DeploymentRuntimeConfigError(
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  const primary = runtimeWindow[PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY];
  if (primary !== undefined && primary !== null) {
    return primary;
  }

  const fallbackCandidate = runtimeWindow.__PANTHEON_RUNTIME_CONFIG__;
  if (
    fallbackCandidate
    && typeof fallbackCandidate === "object"
    && !Array.isArray(fallbackCandidate)
  ) {
    const record = fallbackCandidate as Record<string, unknown>;
    if (
      "schemaVersion" in record
      || "environment" in record
      || "configRef" in record
      || "bffBaseUrl" in record
      || "gcpIdentity" in record
      || "VITE_BFF_BASE_URL" in record
    ) {
      return fallbackCandidate;
    }
  }

  return undefined;
}

export function resolveDeploymentRuntimeConfig(options?: {
  rawConfig?: unknown;
  hostname?: string;
  required?: boolean;
}): ValidatedDeploymentRuntimeConfig | null {
  const hostname = currentBrowserHostname(options?.hostname);
  const candidate =
    options && "rawConfig" in options
      ? options.rawConfig
      : readWindowDeploymentConfigCandidate();

  if (candidate !== undefined && candidate !== null) {
    const validated = validateDeploymentRuntimeConfig(candidate, { hostname });
    activeAuditSnapshot = Object.freeze({
      schemaVersion: validated.schemaVersion,
      environment: validated.environment,
      configRef: validated.configRef,
      configSha256: validated.configSha256,
      bffBaseUrl: validated.bffBaseUrl,
      gcpIdentity: Object.freeze({
        projectId: validated.gcpIdentity.projectId,
        authDomain: validated.gcpIdentity.authDomain,
        issuer: validated.gcpIdentity.issuer,
        audience: validated.gcpIdentity.audience,
      }),
    });
    return validated;
  }

  activeAuditSnapshot = null;

  if (options?.required === true || isNonDevDeploymentHost(hostname)) {
    throw new DeploymentRuntimeConfigError(
      `Public deployment runtime configuration (/runtime-config.js) is required on host '${hostname || "unknown"}'; refusing to fall back to build-time Dev configuration`,
    );
  }

  return null;
}

export function resolvePublicGcpIdentityRuntimeConfig(
  fallbackEnv?: Record<string, string | undefined>,
  options?: { hostname?: string; rawConfig?: unknown },
): PublicGcpIdentityConfig {
  const runtime = resolveDeploymentRuntimeConfig(options);
  if (runtime) {
    return {
      apiKey: runtime.gcpIdentity.apiKey,
      projectId: runtime.gcpIdentity.projectId,
      authDomain: runtime.gcpIdentity.authDomain,
    };
  }

  const metaEnv =
    fallbackEnv
    ?? ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});

  return validatePublicGcpIdentityConfig(
    metaEnv.VITE_GCP_IDENTITY_API_KEY,
    metaEnv.VITE_GCP_IDENTITY_PROJECT_ID,
    metaEnv.VITE_GCP_IDENTITY_AUTH_DOMAIN,
  );
}
