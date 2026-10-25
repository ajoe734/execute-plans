import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalDeploymentConfigPayload,
  computeDeploymentConfigSha256,
  DeploymentRuntimeConfigError,
  getActiveDeploymentRuntimeAudit,
  PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY,
  PUBLIC_RUNTIME_CONFIG_SCHEMA,
  resetDeploymentRuntimeAuditForTests,
  resolveDeploymentRuntimeConfig,
  resolvePublicGcpIdentityRuntimeConfig,
  validateDeploymentRuntimeConfig,
  type PublicDeploymentRuntimeConfigInput,
} from "@/config/deploymentRuntime";
import { validatePublicBuildBearerToken } from "@/config/publicBuildAuth";
import { digestReleaseDist } from "../../scripts/release-candidate.mjs";

const STAGING_CONFIG: PublicDeploymentRuntimeConfigInput = {
  schemaVersion: PUBLIC_RUNTIME_CONFIG_SCHEMA,
  environment: "staging",
  configRef: "stg-release-2026-10-24-r1",
  bffBaseUrl: "https://api.stg.mvl-cap.tw",
  gcpIdentity: {
    apiKey: "AIzaSyStgPublicFirebaseKey0000000000001",
    projectId: "pantheon-stg-20261024",
    authDomain: "pantheon-stg-20261024.firebaseapp.com",
    issuer: "https://securetoken.google.com/pantheon-stg-20261024",
    audience: "pantheon-stg-20261024",
  },
};

const PRODUCTION_CONFIG: PublicDeploymentRuntimeConfigInput = {
  schemaVersion: PUBLIC_RUNTIME_CONFIG_SCHEMA,
  environment: "production",
  configRef: "prod-release-2026-10-24-r1",
  bffBaseUrl: "https://api.mvl-cap.tw",
  gcpIdentity: {
    apiKey: "AIzaSyProdPublicFirebaseKey000000000002",
    projectId: "pantheon-prod-20261024",
    authDomain: "pantheon-prod-20261024.firebaseapp.com",
    issuer: "https://securetoken.google.com/pantheon-prod-20261024",
    audience: "pantheon-prod-20261024",
  },
};

function clearRuntimeGlobals(): void {
  const runtimeWindow = window as unknown as Record<string, unknown>;
  delete runtimeWindow[PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY];
  delete runtimeWindow.__PANTHEON_RUNTIME_CONFIG__;
  delete runtimeWindow.__PANTHEON_BFF_RUNTIME__;
  window.sessionStorage.clear();
  window.localStorage.clear();
  resetDeploymentRuntimeAuditForTests();
}

describe("deploymentRuntime public configuration contract", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    clearRuntimeGlobals();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("http://localhost:8080/"),
    });
  });

  afterEach(() => {
    clearRuntimeGlobals();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it("loads /runtime-config.js before /src/main.tsx in index.html and keeps public/runtime-config.js externalizable", () => {
    const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const runtimeScriptIndex = indexHtml.indexOf('<script src="/runtime-config.js"></script>');
    const mainScriptIndex = indexHtml.indexOf('<script type="module" src="/src/main.tsx"></script>');

    expect(runtimeScriptIndex).toBeGreaterThan(-1);
    expect(mainScriptIndex).toBeGreaterThan(runtimeScriptIndex);

    const publicRuntimeStub = readFileSync(
      resolve(process.cwd(), "public/runtime-config.js"),
      "utf8",
    );
    expect(publicRuntimeStub).toContain("__PANTHEON_DEPLOYMENT_CONFIG__");
    expect(publicRuntimeStub).not.toMatch(/Bearer\s+|service_role|private_key/iu);
  });

  it("validates staging and production configs, computes deterministic configSha256, and records audit metadata", () => {
    const expectedStagingSha = computeDeploymentConfigSha256({
      environment: "staging",
      configRef: STAGING_CONFIG.configRef,
      bffBaseUrl: STAGING_CONFIG.bffBaseUrl,
      gcpIdentity: {
        apiKey: STAGING_CONFIG.gcpIdentity.apiKey,
        projectId: STAGING_CONFIG.gcpIdentity.projectId,
        authDomain: STAGING_CONFIG.gcpIdentity.authDomain,
        issuer: STAGING_CONFIG.gcpIdentity.issuer!,
        audience: STAGING_CONFIG.gcpIdentity.audience!,
      },
    });

    const stagingValidated = resolveDeploymentRuntimeConfig({
      rawConfig: {
        ...STAGING_CONFIG,
        configSha256: expectedStagingSha,
      },
      hostname: "app.stg.mvl-cap.tw",
    });

    expect(stagingValidated).not.toBeNull();
    expect(stagingValidated?.environment).toBe("staging");
    expect(stagingValidated?.bffBaseUrl).toBe("https://api.stg.mvl-cap.tw");
    expect(stagingValidated?.configRef).toBe("stg-release-2026-10-24-r1");
    expect(stagingValidated?.configSha256).toBe(expectedStagingSha);
    expect(stagingValidated?.safeDefaults).toEqual({
      VITE_BFF_MODE: "live",
      VITE_BFF_FALLBACK: "strict",
      VITE_BFF_REAL_WRITES: "false",
      VITE_BFF_ALLOW_DEV_STUB_WRITES: "false",
      VITE_BFF_EMBEDDED_BEARER_TOKEN: "false",
    });

    const stagingAudit = getActiveDeploymentRuntimeAudit();
    expect(stagingAudit).toEqual({
      schemaVersion: PUBLIC_RUNTIME_CONFIG_SCHEMA,
      environment: "staging",
      configRef: "stg-release-2026-10-24-r1",
      configSha256: expectedStagingSha,
      bffBaseUrl: "https://api.stg.mvl-cap.tw",
      gcpIdentity: {
        projectId: "pantheon-stg-20261024",
        authDomain: "pantheon-stg-20261024.firebaseapp.com",
        issuer: "https://securetoken.google.com/pantheon-stg-20261024",
        audience: "pantheon-stg-20261024",
      },
    });

    const prodValidated = resolveDeploymentRuntimeConfig({
      rawConfig: PRODUCTION_CONFIG,
      hostname: "app.mvl-cap.tw",
    });

    expect(prodValidated?.environment).toBe("production");
    expect(prodValidated?.bffBaseUrl).toBe("https://api.mvl-cap.tw");
    expect(prodValidated?.configSha256).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(prodValidated?.configSha256).not.toBe(expectedStagingSha);
    expect(canonicalDeploymentConfigPayload(prodValidated!)).toContain(
      '"bffBaseUrl":"https://api.mvl-cap.tw"',
    );
  });

  it("rejects tampered configSha256 digests", () => {
    expect(() =>
      validateDeploymentRuntimeConfig(
        {
          ...PRODUCTION_CONFIG,
          configSha256:
            "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        },
        { hostname: "app.mvl-cap.tw" },
      ),
    ).toThrow(DeploymentRuntimeConfigError);
  });

  it("validates public Firebase web API key as public config and distinguishes it from bearer credentials", () => {
    expect(() =>
      validatePublicBuildBearerToken(STAGING_CONFIG.gcpIdentity.apiKey),
    ).toThrow(/VITE_BFF_DEV_BEARER_TOKEN/iu);

    const validated = validateDeploymentRuntimeConfig(STAGING_CONFIG, {
      hostname: "app.stg.mvl-cap.tw",
    });
    expect(validated.gcpIdentity.apiKey).toBe(STAGING_CONFIG.gcpIdentity.apiKey);

    expect(() =>
      validateDeploymentRuntimeConfig(
        {
          ...STAGING_CONFIG,
          gcpIdentity: {
            ...STAGING_CONFIG.gcpIdentity,
            apiKey: "not-a-valid-firebase-web-api-key",
          },
        },
        { hostname: "app.stg.mvl-cap.tw" },
      ),
    ).toThrow(/VITE_GCP_IDENTITY_API_KEY/iu);
  });

  it("rejects token, secret, password, private key, and write/fallback override keys or values", () => {
    const forbiddenConfigs: Array<Record<string, unknown>> = [
      {
        ...STAGING_CONFIG,
        VITE_BFF_DEV_BEARER_TOKEN: "pantheon-dev-browser:viewer",
      },
      {
        ...STAGING_CONFIG,
        bearerToken: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig",
      },
      {
        ...STAGING_CONFIG,
        clientSecret: "super-secret",
      },
      {
        ...STAGING_CONFIG,
        VITE_BFF_REAL_WRITES: "true",
      },
      {
        ...STAGING_CONFIG,
        VITE_BFF_FALLBACK: "auto",
      },
      {
        ...STAGING_CONFIG,
        gcpIdentity: {
          ...STAGING_CONFIG.gcpIdentity,
          privateKey: "-----BEGIN PRIVATE KEY-----",
        },
      },
      {
        ...STAGING_CONFIG,
        configRef: "Bearer secret-token",
      },
    ];

    for (const candidate of forbiddenConfigs) {
      expect(() =>
        validateDeploymentRuntimeConfig(candidate, {
          hostname: "app.stg.mvl-cap.tw",
        }),
      ).toThrow(DeploymentRuntimeConfigError);
    }

    const runtimeWindow = window as unknown as Record<string, unknown>;
    runtimeWindow.__PANTHEON_BFF_RUNTIME__ = {
      VITE_BFF_DEV_BEARER_TOKEN: "pantheon-dev-browser:viewer",
    };
    expect(() => resolveDeploymentRuntimeConfig()).toThrow(
      DeploymentRuntimeConfigError,
    );
  });

  it("rejects unsafe protocols, embedded URL credentials, paths/queries, arbitrary external origins, and cross-environment BFF/IdP leakage", () => {
    const invalidBffUrls = [
      "http://api.stg.mvl-cap.tw",
      "https://operator:secret@api.stg.mvl-cap.tw",
      "https://api.stg.mvl-cap.tw/bff",
      "https://api.stg.mvl-cap.tw?token=1",
      "https://evil.example.com",
      "https://169.254.169.254",
      "https://api.dev.mvl-cap.tw",
    ];

    for (const bffBaseUrl of invalidBffUrls) {
      expect(() =>
        validateDeploymentRuntimeConfig(
          {
            ...STAGING_CONFIG,
            bffBaseUrl,
          },
          { hostname: "app.stg.mvl-cap.tw" },
        ),
      ).toThrow(DeploymentRuntimeConfigError);
    }

    // Production config must reject staging BFF origin and Dev/staging GCP project IDs
    expect(() =>
      validateDeploymentRuntimeConfig(
        {
          ...PRODUCTION_CONFIG,
          bffBaseUrl: "https://api.stg.mvl-cap.tw",
        },
        { hostname: "app.mvl-cap.tw" },
      ),
    ).toThrow(/forbids non-production BFF origin/iu);

    expect(() =>
      validateDeploymentRuntimeConfig(
        {
          ...PRODUCTION_CONFIG,
          gcpIdentity: {
            ...PRODUCTION_CONFIG.gcpIdentity,
            projectId: "pantheon-dev-20260902",
            authDomain: "pantheon-dev-20260902.firebaseapp.com",
            issuer: "https://securetoken.google.com/pantheon-dev-20260902",
            audience: "pantheon-dev-20260902",
          },
        },
        { hostname: "app.mvl-cap.tw" },
      ),
    ).toThrow(/forbids non-production GCP Identity projectId/iu);

    // Mismatched issuer / audience / authDomain must be rejected
    expect(() =>
      validateDeploymentRuntimeConfig(
        {
          ...PRODUCTION_CONFIG,
          gcpIdentity: {
            ...PRODUCTION_CONFIG.gcpIdentity,
            issuer: "https://securetoken.google.com/other-project",
          },
        },
        { hostname: "app.mvl-cap.tw" },
      ),
    ).toThrow(/issuer/iu);

    expect(() =>
      validateDeploymentRuntimeConfig(
        {
          ...PRODUCTION_CONFIG,
          gcpIdentity: {
            ...PRODUCTION_CONFIG.gcpIdentity,
            audience: "other-project",
          },
        },
        { hostname: "app.mvl-cap.tw" },
      ),
    ).toThrow(/audience/iu);

    expect(() =>
      validateDeploymentRuntimeConfig(
        {
          ...PRODUCTION_CONFIG,
          gcpIdentity: {
            ...PRODUCTION_CONFIG.gcpIdentity,
            authDomain: "pantheon-dev-20260902.firebaseapp.com",
          },
        },
        { hostname: "app.mvl-cap.tw" },
      ),
    ).toThrow(/authDomain/iu);
  });

  it("fails closed on staging and production hosts when runtime config is missing or mismatched", () => {
    expect(() =>
      resolveDeploymentRuntimeConfig({
        hostname: "app.stg.mvl-cap.tw",
      }),
    ).toThrow(/refusing to fall back to build-time Dev configuration/iu);

    expect(() =>
      resolveDeploymentRuntimeConfig({
        hostname: "app.mvl-cap.tw",
      }),
    ).toThrow(/refusing to fall back to build-time Dev configuration/iu);

    expect(() =>
      resolvePublicGcpIdentityRuntimeConfig(
        {
          VITE_GCP_IDENTITY_API_KEY: "AIzaSyDevBuildTimeKey000000000000000001",
          VITE_GCP_IDENTITY_PROJECT_ID: "pantheon-dev-20260902",
          VITE_GCP_IDENTITY_AUTH_DOMAIN: "pantheon-dev-20260902.firebaseapp.com",
        },
        { hostname: "app.mvl-cap.tw" },
      ),
    ).toThrow(DeploymentRuntimeConfigError);

    // Staging config served on production host must fail closed
    expect(() =>
      resolveDeploymentRuntimeConfig({
        rawConfig: STAGING_CONFIG,
        hostname: "app.mvl-cap.tw",
      }),
    ).toThrow(/Production host 'app\.mvl-cap\.tw' requires environment='production'/iu);
  });

  it("keeps sealed release bundle checksum invariant across staging and production external runtime-config.js mounts", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "pantheon-immutable-fe-"));
    try {
      const sealedReleaseDir = join(tempRoot, "release-bundle");
      const externalConfigDir = join(tempRoot, "external-runtime-config");
      mkdirSync(join(sealedReleaseDir, "assets"), { recursive: true });
      mkdirSync(externalConfigDir, { recursive: true });

      const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
      const defaultRuntimeConfig = readFileSync(
        resolve(process.cwd(), "public/runtime-config.js"),
        "utf8",
      );
      writeFileSync(join(sealedReleaseDir, "index.html"), indexHtml, "utf8");
      writeFileSync(
        join(sealedReleaseDir, "runtime-config.js"),
        defaultRuntimeConfig,
        "utf8",
      );
      writeFileSync(
        join(sealedReleaseDir, "assets", "app.js"),
        'console.log("sealed-pantheon-fe-bundle");\n',
        "utf8",
      );

      const initialDigest = digestReleaseDist({ distDir: sealedReleaseDir });

      // Write external Staging /runtime-config.js without touching sealedReleaseDir
      const stgExternalScript = `window.${PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY} = ${JSON.stringify(STAGING_CONFIG)};\n`;
      writeFileSync(
        join(externalConfigDir, "runtime-config.js"),
        stgExternalScript,
        "utf8",
      );
      const afterStagingMountDigest = digestReleaseDist({
        distDir: sealedReleaseDir,
        expectedArtifactDigest: initialDigest.artifactDigestSha256,
      });
      expect(afterStagingMountDigest.artifactDigestSha256).toBe(
        initialDigest.artifactDigestSha256,
      );

      // Evaluate external Staging runtime-config.js payload
      const runtimeWindow = window as unknown as Record<string, unknown>;
      runtimeWindow[PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY] = JSON.parse(
        JSON.stringify(STAGING_CONFIG),
      );
      const stgResolved = resolveDeploymentRuntimeConfig({
        hostname: "app.stg.mvl-cap.tw",
      });
      expect(stgResolved?.bffBaseUrl).toBe("https://api.stg.mvl-cap.tw");
      expect(stgResolved?.gcpIdentity.projectId).toBe("pantheon-stg-20261024");

      // Swap external /runtime-config.js to Production without touching sealedReleaseDir
      const prodExternalScript = `window.${PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY} = ${JSON.stringify(PRODUCTION_CONFIG)};\n`;
      writeFileSync(
        join(externalConfigDir, "runtime-config.js"),
        prodExternalScript,
        "utf8",
      );
      const afterProdMountDigest = digestReleaseDist({
        distDir: sealedReleaseDir,
        expectedArtifactDigest: initialDigest.artifactDigestSha256,
      });
      expect(afterProdMountDigest.artifactDigestSha256).toBe(
        initialDigest.artifactDigestSha256,
      );

      runtimeWindow[PUBLIC_RUNTIME_CONFIG_GLOBAL_KEY] = JSON.parse(
        JSON.stringify(PRODUCTION_CONFIG),
      );
      const prodResolved = resolveDeploymentRuntimeConfig({
        hostname: "app.mvl-cap.tw",
      });
      expect(prodResolved?.bffBaseUrl).toBe("https://api.mvl-cap.tw");
      expect(prodResolved?.gcpIdentity.projectId).toBe("pantheon-prod-20261024");
      expect(prodResolved?.configSha256).not.toBe(stgResolved?.configSha256);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
