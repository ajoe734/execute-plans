// BFF Contract v1 — Request header helpers.
// Final C.1: Idempotency-Key is HEADER (not body). C.4 ETag/If-Match for optimistic lock.

const HTTP_MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutation(method: string): boolean {
  return HTTP_MUTATION_METHODS.has(method.toUpperCase());
}

/** ULID-like sortable key. */
export function idempotencyKey(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 12);
  return `idk_${ts}_${rnd}`;
}

export function xRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function ifMatch(lockVersion: number | string): string {
  return `"${lockVersion}"`;
}

export function acceptLanguage(locale?: string): string {
  if (locale) return locale;
  if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
  return "en-US";
}

/** H1 closed — aligned with OpenAPI `components.parameters.BffApiVersion.default`. */
export const BFF_API_VERSION = "2026-05-07";
export function xBffApiVersion(): string {
  return BFF_API_VERSION;
}

export interface BuildHeadersInput {
  method: string;
  locale?: string;
  idempotency?: string;
  ifMatchVersion?: number | string;
  extra?: Record<string, string>;
}

export function buildHeaders(input: BuildHeadersInput): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Accept-Language": acceptLanguage(input.locale),
    "X-Request-Id": xRequestId(),
    "X-BFF-Api-Version": xBffApiVersion(),
  };
  if (isMutation(input.method)) {
    headers["Content-Type"] = "application/json";
    headers["Idempotency-Key"] = input.idempotency ?? idempotencyKey();
    if (input.ifMatchVersion !== undefined) {
      headers["If-Match"] = ifMatch(input.ifMatchVersion);
    }
  }
  if (input.extra) Object.assign(headers, input.extra);
  return headers;
}
