// v4 / Pack C §C064–C066 — Security baseline + audit immutability.

export const SECURITY_BASELINE = {
  authToken: "httpOnly + Secure + SameSite=Lax/Strict cookie; never localStorage",
  csrf: "CSRF token required on mutations",
  csp: "default-src 'self'; script-src 'self'; connect-src 'self' https: wss:; img-src 'self' data: blob:; frame-ancestors 'none'",
  ugcEscape: "Markdown renderer must sanitize HTML; escape all UGC.",
  redaction: "Secrets, API keys, tokens, broker identifiers MUST be redacted in UI logs.",
  auditAppendOnly: "Audit log is append-only; admin cannot edit/delete audit events.",
  pii: "PII fields tagged & hidden from unauthorized roles.",
} as const;

/** Pack C C066: visual regression is future work. */
export const VISUAL_REGRESSION_REQUIRED = false as const;
