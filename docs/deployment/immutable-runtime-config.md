# Immutable Frontend Release Public Runtime Configuration Contract

## 1. Verified Counterexample & Objective

At commit `c067d6a82573249ca338a38d30ad74611f0b53f8`:

- `src/lib/bff-v1/runtimeEnv.ts` merged `import.meta.env` with only dev-host `VITE_BFF_REAL_WRITES` and localhost `VITE_BFF_FALLBACK` overrides; `detectBaseUrl()` read build-time `VITE_BFF_BASE_URL`.
- `src/integrations/gcp/identity.ts` read build-time `import.meta.env.VITE_GCP_IDENTITY_API_KEY`, `VITE_GCP_IDENTITY_PROJECT_ID`, and `VITE_GCP_IDENTITY_AUTH_DOMAIN` at module evaluation time.

As a result, promoting the sealed Dev frontend artifact to Staging or Production without rebuilding or rewriting bundle bytes caused the browser client to continue targeting the Dev BFF (`https://api.dev.mvl-cap.tw`) and Dev GCP Identity project (`pantheon-dev-20260902`).

This contract decouples environment-specific public BFF and GCP Identity configuration from the compiled bundle so that the **exact same sealed frontend release artifact (`artifactDigestSha256`)** is promoted across Dev, Staging, and Production without bundle rewriting or per-environment rebuilds.

---

## 2. Same-Origin Loading Order & Bundle Checksum Invariance

1. `index.html` loads `<script src="/runtime-config.js"></script>` synchronously **before** `<script type="module" src="/src/main.tsx"></script>`.
2. `public/runtime-config.js` ships a safe no-op stub inside the built `dist/` directory:
   ```js
   window.__PANTHEON_DEPLOYMENT_CONFIG__ =
     window.__PANTHEON_DEPLOYMENT_CONFIG__ ?? null;
   ```
3. Before BFF client requests (`readBffEnv` / `detectBaseUrl` / `bffFetch`), GCP Identity initialization (`resolveGcpIdentityConfig` / `initializeGcpIdentityRuntime`), or React root mount (`prepareDeploymentRuntime` in `src/main.tsx`), the frontend resolves and validates `window.__PANTHEON_DEPLOYMENT_CONFIG__`.
4. On Staging and Production, the host web server (Caddy) serves `/runtime-config.js` from an **external host configuration directory outside the immutable release bundle directory**. Files inside the unpacked frontend release directory are never modified after `scripts/release-candidate.mjs` prepares and digests the release, keeping `artifactDigestSha256` identical across environments.

---

## 3. Schema & Validation Contract (`pantheon.fe.public-runtime-config.v1`)

External `/runtime-config.js` assigns a plain JSON object to `window.__PANTHEON_DEPLOYMENT_CONFIG__`:

```js
window.__PANTHEON_DEPLOYMENT_CONFIG__ = {
  schemaVersion: "pantheon.fe.public-runtime-config.v1",
  environment: "staging", // "local" | "dev" | "staging" | "production"
  configRef: "stg-release-2026-10-24-r1",
  configSha256: "sha256:<optional-64-hex-canonical-digest>",
  bffBaseUrl: "https://api.stg.mvl-cap.tw",
  gcpIdentity: {
    apiKey: "AIza...", // 39-char public Firebase web API key
    projectId: "pantheon-stg-20261024",
    authDomain: "pantheon-stg-20261024.firebaseapp.com",
    issuer: "https://securetoken.google.com/pantheon-stg-20261024",
    audience: "pantheon-stg-20261024"
  }
};
```

### 3.1 Permitted Keys and Types

- **Top-level allowlist**: `schemaVersion`, `environment`, `configRef`, `configSha256`, `bffBaseUrl`, `gcpIdentity`. Any unknown key or runtime flag override (`VITE_BFF_REAL_WRITES`, `VITE_BFF_FALLBACK`, `VITE_BFF_MODE`, `VITE_BFF_DEV_BEARER_TOKEN`, etc.) is rejected with `DeploymentRuntimeConfigError`.
- **`gcpIdentity` allowlist**: `apiKey`, `projectId`, `authDomain`, `issuer`, `audience`.
- **`schemaVersion`**: `"pantheon.fe.public-runtime-config.v1"` (or `1`).
- **`environment`**: `"local" | "dev" | "staging" | "production"`. Must match the serving browser hostname category:
  - `app.dev.mvl-cap.tw` requires `"dev"`.
  - `*.stg.mvl-cap.tw` / `*.staging.mvl-cap.tw` / `stg-*` / `*.internal` requires `"staging"`.
  - Production hosts (e.g. `app.mvl-cap.tw`) require `"production"`.

### 3.2 Origin, Identity, and Credential Validation

- **`bffBaseUrl`**:
  - Must be an origin-only URL (no path segments, query string, hash fragment, or `username:password` credentials).
  - Non-local environments require `https:` and an approved Pantheon host (`*.mvl-cap.tw`, plus `*.internal` for ephemeral staging). Loopback, link-local (`169.254.0.0/16`), and cloud metadata (`metadata.google.internal`) addresses are rejected.
  - Cross-environment isolation: `"staging"` rejects Dev BFF origins (`api.dev.mvl-cap.tw`); `"production"` rejects both Dev and Staging BFF origins.
- **`gcpIdentity`**:
  - `apiKey` is validated as a public Firebase web API key (`/^AIza[A-Za-z0-9_-]{35}$/`). It is public browser configuration for Firebase Auth and is explicitly distinguished from bearer tokens.
  - `projectId` must match `/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/` and obey environment isolation (`"staging"` forbids `-dev-`/`-prod-` projects; `"production"` forbids `-dev-`/`-stg-`/`-staging-` projects).
  - `authDomain` must match `<projectId>.firebaseapp.com`, `<projectId>.web.app`, or an approved Pantheon domain.
  - `issuer` defaults to and must equal `https://securetoken.google.com/${projectId}`.
  - `audience` defaults to and must equal `${projectId}`.
- **Secret and Token Rejection**:
  - `assertNoPublicRuntimeCredentials` inspects both keys and string values across `window.__PANTHEON_DEPLOYMENT_CONFIG__` and legacy `window.__PANTHEON_BFF_RUNTIME__` / `window.__PANTHEON_RUNTIME_CONFIG__`.
  - Any key matching `token`, `secret`, `password`, `private_key`, `service_role`, `credential`, `authorization`, or `cookie`, or any value shaped like a `Bearer ...` header, JWT, PEM private key, or secret key prefix (`sk-...`, `ghp_...`, `ya29....`) is rejected immediately.

### 3.3 Auditable Config Reference and Canonical SHA-256 Digest

`computeDeploymentConfigSha256` computes `sha256:<64-hex>` over the canonical JSON payload:

```json
{"bffBaseUrl":"...","configRef":"...","environment":"...","gcpIdentity":{"apiKey":"...","audience":"...","authDomain":"...","issuer":"...","projectId":"..."},"schemaVersion":"pantheon.fe.public-runtime-config.v1"}
```

- When `configSha256` is supplied in `/runtime-config.js`, `validateDeploymentRuntimeConfig` verifies that it matches the computed canonical digest and fails closed on mismatch.
- Validated runtime metadata (`schemaVersion`, `environment`, `configRef`, `configSha256`, `bffBaseUrl`, and non-key `gcpIdentity` fields) is recorded in memory and retrievable via `getActiveDeploymentRuntimeAudit()`, and exposed in `readBffEnv()` as `VITE_PANTHEON_DEPLOYMENT_ENV`, `VITE_PANTHEON_CONFIG_REF`, and `VITE_PANTHEON_CONFIG_SHA256`.

### 3.4 Safe Runtime Defaults and Fail-Closed Posture

- Outside localhost tests and the existing explicitly authorized Dev behavior (`app.dev.mvl-cap.tw` / `localhost`), runtime configuration enforces:
  - `VITE_BFF_MODE = "live"`
  - `VITE_BFF_FALLBACK = "strict"`
  - `VITE_BFF_REAL_WRITES = "false"`
  - `VITE_BFF_ALLOW_DEV_STUB_WRITES = "false"`
  - `VITE_BFF_EMBEDDED_BEARER_TOKEN = "false"`
- Browser storage (`sessionStorage` / `localStorage`) and query-string overrides are ignored when `environment` is `"staging"` or `"production"`, and `isDevRuntimeWriteGateHost()`, `isRuntimeFallbackHost()`, and `isDevLoginHost()` all return `false`.
- On any non-Dev, non-loopback host (including `app.stg.mvl-cap.tw` and `app.mvl-cap.tw`), missing or invalid `/runtime-config.js` throws `DeploymentRuntimeConfigError` before BFF or GCP Identity initialization, refusing to fall back to build-time Dev configuration.

---

## 4. Host Adapter Integration (`ENV-STG-EPHEMERAL-IMPL-001` & `ENV-PROD-CONTROL-IMPL-001`)

Backend/infrastructure tasks `ENV-STG-EPHEMERAL-IMPL-001` (Staging) and `ENV-PROD-CONTROL-IMPL-001` (Production) consume this contract by mounting `/runtime-config.js` in Caddy from an external host path without modifying the unpacked FE release directory:

```caddyfile
handle /runtime-config.js {
    root * /etc/pantheon/fe-runtime-config
    header Cache-Control "no-store, no-cache, must-revalidate"
    header Content-Type "application/javascript; charset=utf-8"
    file_server
}
```
