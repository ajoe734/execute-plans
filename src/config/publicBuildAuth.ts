export function validatePublicBuildBearerToken(
  value: string | null | undefined,
): string {
  const token = value ?? "";
  if (token) {
    throw new Error(
      "VITE_BFF_DEV_BEARER_TOKEN must be empty; browser bearer credentials are forbidden",
    );
  }
  return "";
}

const FORBIDDEN_RUNTIME_CREDENTIAL_KEY_PATTERN =
  /(?:bearer|token|secret|password|private[_-]?key|service[_-]?role|credential|authorization)/iu;

const FORBIDDEN_RUNTIME_VALUE_PATTERNS: ReadonlyArray<{
  label: string;
  pattern: RegExp;
}> = [
  {
    label: "bearer credential",
    pattern: /\bbearer[\t ]+[a-z0-9._~+/=-]{4,}/iu,
  },
  {
    label: "private key material",
    pattern: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/u,
  },
  {
    label: "secret key prefix",
    pattern: /\b(?:sb_secret_|sk_live_|sk_test_)[A-Za-z0-9_-]+/u,
  },
];

export function assertNoPublicRuntimeCredentials(
  input: unknown,
  contextLabel = "public runtime configuration",
): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }

  function inspectObject(record: Record<string, unknown>, pathPrefix: string): void {
    for (const [rawKey, rawValue] of Object.entries(record)) {
      const fieldPath = pathPrefix ? `${pathPrefix}.${rawKey}` : rawKey;

      if (rawKey === "VITE_BFF_DEV_BEARER_TOKEN") {
        validatePublicBuildBearerToken(
          rawValue === undefined || rawValue === null ? "" : String(rawValue),
        );
        continue;
      }

      if (rawKey === "VITE_BFF_EMBEDDED_BEARER_TOKEN") {
        if (String(rawValue ?? "").trim().toLowerCase() !== "false") {
          throw new Error(
            `${contextLabel} forbids ${fieldPath}=${String(rawValue)}; embedded bearer tokens must remain 'false'`,
          );
        }
        continue;
      }

      // Public Firebase Web API key (gcpIdentity.apiKey) is public client config,
      // validated separately against the strict AIza... format.
      const isPublicGcpApiKeyField =
        fieldPath === "gcpIdentity.apiKey" || fieldPath === "VITE_GCP_IDENTITY_API_KEY";

      if (
        !isPublicGcpApiKeyField
        && FORBIDDEN_RUNTIME_CREDENTIAL_KEY_PATTERN.test(rawKey)
      ) {
        throw new Error(
          `${contextLabel} forbids credential or token field '${fieldPath}'`,
        );
      }

      if (typeof rawValue === "string") {
        for (const { label, pattern } of FORBIDDEN_RUNTIME_VALUE_PATTERNS) {
          if (pattern.test(rawValue)) {
            throw new Error(
              `${contextLabel} forbids ${label} in '${fieldPath}'`,
            );
          }
        }
      } else if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
        inspectObject(rawValue as Record<string, unknown>, fieldPath);
      }
    }
  }

  inspectObject(input as Record<string, unknown>, "");
}
