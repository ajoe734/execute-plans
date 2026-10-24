export type PublicGcpIdentityConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
};

export type PublicDeploymentEnvironment =
  | "local"
  | "dev"
  | "staging"
  | "production";

export type PublicGcpIdentityRuntimeConfig = PublicGcpIdentityConfig & {
  issuer: string;
  audience: string;
};

const PERMITTED_GCP_IDENTITY_RUNTIME_KEYS = new Set([
  "apiKey",
  "projectId",
  "authDomain",
  "issuer",
  "audience",
]);

function required(name: string): Error {
  return new Error(
    `${name} is required public browser configuration for GCP Identity Platform`,
  );
}

export function validatePublicGcpIdentityConfig(
  apiKey: string | undefined,
  projectId: string | undefined,
  authDomain: string | undefined,
): PublicGcpIdentityConfig {
  if (!apiKey || apiKey.trim() !== apiKey || !/^AIza[A-Za-z0-9_-]{35}$/u.test(apiKey)) {
    throw required("VITE_GCP_IDENTITY_API_KEY");
  }
  if (
    !projectId
    || projectId.trim() !== projectId
    || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(projectId)
  ) {
    throw required("VITE_GCP_IDENTITY_PROJECT_ID");
  }
  if (
    !authDomain
    || authDomain.trim() !== authDomain
    || authDomain.includes("/")
    || authDomain.includes("@")
    || !/^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/u.test(
      authDomain,
    )
  ) {
    throw required("VITE_GCP_IDENTITY_AUTH_DOMAIN");
  }

  return { apiKey, authDomain, projectId };
}

function assertAuthDomainMatchesProject(
  projectId: string,
  authDomain: string,
  environment?: PublicDeploymentEnvironment,
): void {
  const normalizedDomain = authDomain.toLowerCase();
  if (normalizedDomain.endsWith(".firebaseapp.com")) {
    if (normalizedDomain !== `${projectId}.firebaseapp.com`) {
      throw new Error(
        `GCP Identity authDomain '${authDomain}' must match projectId '${projectId}.firebaseapp.com'`,
      );
    }
    return;
  }
  if (normalizedDomain.endsWith(".web.app")) {
    if (normalizedDomain !== `${projectId}.web.app`) {
      throw new Error(
        `GCP Identity authDomain '${authDomain}' must match projectId '${projectId}.web.app'`,
      );
    }
    return;
  }

  const isPantheonDomain =
    normalizedDomain === "mvl-cap.tw" || normalizedDomain.endsWith(".mvl-cap.tw");
  const isStagingInternal =
    environment === "staging" && normalizedDomain.endsWith(".internal");
  if (!isPantheonDomain && !isStagingInternal) {
    throw new Error(
      `GCP Identity authDomain '${authDomain}' is not an approved Firebase or Pantheon auth domain`,
    );
  }
}

function assertEnvironmentProjectIsolation(
  projectId: string,
  environment: PublicDeploymentEnvironment | undefined,
): void {
  if (!environment || environment === "local") return;

  const isDevProject = /(?:^|-)dev(?:-|$)/u.test(projectId);
  const isStagingProject = /(?:^|-)(?:stg|staging)(?:-|$)/u.test(projectId);
  const isProdProject = /(?:^|-)prod(?:uction)?(?:-|$)/u.test(projectId);

  if (environment === "staging" && (isDevProject || isProdProject)) {
    throw new Error(
      `Staging runtime config forbids non-staging GCP Identity projectId '${projectId}'`,
    );
  }
  if (environment === "production" && (isDevProject || isStagingProject)) {
    throw new Error(
      `Production runtime config forbids non-production GCP Identity projectId '${projectId}'`,
    );
  }
  if (environment === "dev" && (isStagingProject || isProdProject)) {
    throw new Error(
      `Dev runtime config forbids non-dev GCP Identity projectId '${projectId}'`,
    );
  }
}

export function validatePublicGcpIdentityRuntimeConfig(
  input: unknown,
  options?: { environment?: PublicDeploymentEnvironment },
): PublicGcpIdentityRuntimeConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("gcpIdentity runtime configuration must be a JSON object");
  }

  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!PERMITTED_GCP_IDENTITY_RUNTIME_KEYS.has(key)) {
      throw new Error(
        `gcpIdentity runtime configuration contains unsupported key '${key}'`,
      );
    }
  }

  const base = validatePublicGcpIdentityConfig(
    typeof record.apiKey === "string" ? record.apiKey : undefined,
    typeof record.projectId === "string" ? record.projectId : undefined,
    typeof record.authDomain === "string" ? record.authDomain : undefined,
  );

  assertEnvironmentProjectIsolation(base.projectId, options?.environment);
  assertAuthDomainMatchesProject(
    base.projectId,
    base.authDomain,
    options?.environment,
  );

  const expectedIssuer = `https://securetoken.google.com/${base.projectId}`;
  const rawIssuer = record.issuer;
  let issuer = expectedIssuer;
  if (rawIssuer !== undefined) {
    if (typeof rawIssuer !== "string" || rawIssuer.trim() !== rawIssuer) {
      throw new Error("gcpIdentity.issuer must be a non-empty trimmed HTTPS URL");
    }
    let parsedIssuer: URL;
    try {
      parsedIssuer = new URL(rawIssuer);
    } catch {
      throw new Error("gcpIdentity.issuer must be a valid HTTPS URL");
    }
    if (
      parsedIssuer.protocol !== "https:"
      || parsedIssuer.username
      || parsedIssuer.password
      || parsedIssuer.search
      || parsedIssuer.hash
    ) {
      throw new Error(
        "gcpIdentity.issuer must use HTTPS without credentials, query, or fragment",
      );
    }
    if (rawIssuer !== expectedIssuer) {
      throw new Error(
        `gcpIdentity.issuer '${rawIssuer}' does not match expected issuer '${expectedIssuer}' for projectId '${base.projectId}'`,
      );
    }
    issuer = rawIssuer;
  }

  const rawAudience = record.audience;
  let audience = base.projectId;
  if (rawAudience !== undefined) {
    if (typeof rawAudience !== "string" || rawAudience.trim() !== rawAudience) {
      throw new Error("gcpIdentity.audience must be a non-empty trimmed string");
    }
    if (rawAudience !== base.projectId) {
      throw new Error(
        `gcpIdentity.audience '${rawAudience}' does not match projectId '${base.projectId}'`,
      );
    }
    audience = rawAudience;
  }

  return {
    ...base,
    issuer,
    audience,
  };
}
