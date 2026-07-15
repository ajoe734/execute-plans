#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FE_BASE = trimTrailingSlash(
  process.env.PANTHEON_FE_BASE_URL ||
    "https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io",
);
const UPSTREAM_BFF_BASE = trimTrailingSlash(
  process.env.PANTHEON_BFF_BASE_URL ||
    "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io",
);
const BFF_BASE = trimTrailingSlash(
  process.env.PANTHEON_BROWSER_BFF_BASE_URL || UPSTREAM_BFF_BASE,
);
const OLD_BFF_URL = normalizeOldBffUrl(
  process.env.PANTHEON_OLD_BFF_URL ||
    "https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io",
);
const FE_PATH = normalizePath(
  process.env.PANTHEON_HOSTED_PROBE_PATH || "/management/persona-fleet",
);
const OUT_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || ".lovable/audits";
const RELEASE_STRICT = process.env.PANTHEON_PROBE_RELEASE_STRICT === "1";
const EXPECTED_FE_SHA = String(
  process.env.PANTHEON_EXPECTED_FE_SHA || "",
).trim();
const EXPECTED_ARTIFACT_DIGEST = String(
  process.env.PANTHEON_EXPECTED_ARTIFACT_DIGEST || "",
).trim();
const PROBE_JSON_OUT = String(process.env.PANTHEON_PROBE_JSON_OUT || "").trim();
const CANDIDATE_DIR = String(process.env.PANTHEON_CANDIDATE_DIR || "").trim();
const OVERALL_TIMEOUT_MS = 120_000;
const OPTIONAL_CORE_TIMEOUT_MS = 5_000;
const REQUIRED_CORE_TIMEOUT_MS = 20_000;
const NAVIGATION_WAIT_UNTIL = "domcontentloaded";
export const HOSTED_UX_PROFILES = Object.freeze([
  Object.freeze({
    id: "desktop-1440",
    width: 1440,
    height: 900,
    mobile: false,
  }),
  Object.freeze({ id: "mobile-390", width: 390, height: 844, mobile: true }),
]);
export const HOSTED_UX_PERFORMANCE_BUDGETS = Object.freeze({
  responseEndMs: 3_000,
  domContentLoadedMs: 4_000,
  loadEventMs: 8_000,
  firstContentfulPaintMs: 4_000,
  totalTransferBytes: 8 * 1024 * 1024,
});
const AXE_BLOCKING_IMPACTS = new Set(["critical", "serious"]);
const REDUCED_MOTION_MAX_TRANSITION_MS = 150;
const KEYBOARD_FOCUS_ATTEMPTS = 12;
const REQUIRED_CORE_BFF_PATHS = parsePathList(
  process.env.PANTHEON_HOSTED_REQUIRED_BFF_PATHS,
  ["/bff/me"],
);
const OPTIONAL_CORE_BFF_PATHS = ["/bff/management/persona-fleet"].filter(
  (pathname) => !REQUIRED_CORE_BFF_PATHS.includes(pathname),
);
const CORE_BFF_PATHS = [...OPTIONAL_CORE_BFF_PATHS, ...REQUIRED_CORE_BFF_PATHS];
const PUBLIC_HEALTH_PATHS = ["/health", "/readyz"];
const FRONTEND_RESOURCE_TYPES = new Set([
  "document",
  "script",
  "style",
  "stylesheet",
]);
const MAX_SCANNED_ASSETS = 2_000;
const MAX_SCANNED_BYTES = 128 * 1024 * 1024;
const probeStartedAt = Date.now();

function currentSha() {
  const fromEnv =
    process.env.PANTHEON_PROBE_NOCACHE_SHA ||
    process.env.GITHUB_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 40);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return Date.now().toString(36);
  }
}

const NOCACHE_SHA = currentSha();

function withNoCache(url) {
  const parsed = new URL(url);
  parsed.searchParams.set("nocache", NOCACHE_SHA);
  return parsed.toString();
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/u, "");
}

function normalizeOldBffUrl(value) {
  const clean = trimTrailingSlash(String(value || "").trim());
  return clean && clean !== BFF_BASE ? clean : "";
}

function normalizePath(value) {
  const clean = String(value || "").trim();
  if (!clean) return "/";
  return clean.startsWith("/") ? clean : "/" + clean;
}

function parsePathList(value, fallback) {
  if (!value) return fallback;
  const parsed = value.split(",").map(normalizePath).filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function matchesUrlNeedle(url, needle) {
  if (!needle) return false;
  const cleanNeedle = trimTrailingSlash(needle.trim());
  if (!cleanNeedle) return false;
  return cleanNeedle.startsWith("http")
    ? httpPathWithinBase(url, cleanNeedle) !== null
    : url.includes(cleanNeedle);
}

export function httpPathWithinBase(value, baseValue) {
  try {
    const target = new URL(String(value || ""));
    const base = new URL(String(baseValue || ""));
    if (target.origin !== base.origin) return null;
    const basePath = base.pathname.replace(/\/+$/u, "") || "/";
    if (basePath === "/") return target.pathname;
    if (target.pathname === basePath) return "/";
    if (!target.pathname.startsWith(basePath + "/")) return null;
    return target.pathname.slice(basePath.length);
  } catch {
    return null;
  }
}

function pathnameOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

export function isBffRequestUrl(url, baseUrl = BFF_BASE) {
  const pathname = httpPathWithinBase(url, baseUrl);
  if (pathname === null) return false;
  return (
    pathname.startsWith("/bff/") ||
    ["/health", "/healthz", "/readyz", "/openapi.json"].includes(pathname)
  );
}

function isBffUrl(url) {
  return httpPathWithinBase(url, BFF_BASE) !== null;
}

function isCoreBffResponse(res, expectedPath) {
  const url = res.url();
  return (
    isBffUrl(url) &&
    httpPathWithinBase(url, BFF_BASE) === expectedPath &&
    res.request().method() === "GET"
  );
}

function isAcceptableCoreStatus(response) {
  return (
    response.status === 401 &&
    /AUTH_REQUIRED|authentication required/iu.test(response.body || "")
  );
}

function isRequiredCorePath(pathname) {
  return REQUIRED_CORE_BFF_PATHS.includes(pathname);
}

function remainingTimeoutMs() {
  return Math.max(1, OVERALL_TIMEOUT_MS - (Date.now() - probeStartedAt));
}

function finitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function summarizeAxeViolations(violations) {
  return (Array.isArray(violations) ? violations : [])
    .filter((violation) =>
      AXE_BLOCKING_IMPACTS.has(String(violation?.impact || "")),
    )
    .map((violation) => ({
      id: /^[a-z0-9-]{1,120}$/u.test(String(violation?.id || ""))
        ? String(violation.id)
        : "unknown",
      impact: String(violation?.impact || "unknown").slice(0, 20),
      nodeCount: Array.isArray(violation?.nodes) ? violation.nodes.length : 0,
    }))
    .sort(
      (left, right) =>
        left.id.localeCompare(right.id) ||
        left.impact.localeCompare(right.impact),
    );
}

export function assessHostedUxProfile(result) {
  const profile = HOSTED_UX_PROFILES.find(
    (entry) => entry.id === String(result?.profile || ""),
  );
  const metrics = result?.performance || {};
  const performanceMetricsComplete = [
    "responseEndMs",
    "domContentLoadedMs",
    "loadEventMs",
    "firstContentfulPaintMs",
    "totalTransferBytes",
  ].every((key) => finitePositive(metrics[key]));
  const performanceMilestonesOrdered =
    performanceMetricsComplete &&
    metrics.responseEndMs <= metrics.domContentLoadedMs &&
    metrics.domContentLoadedMs <= metrics.loadEventMs;
  const performanceWithinBudget =
    performanceMetricsComplete &&
    performanceMilestonesOrdered &&
    Object.entries(HOSTED_UX_PERFORMANCE_BUDGETS).every(
      ([key, maximum]) => metrics[key] <= maximum,
    );

  const checks = {
    knownProfile: Boolean(profile),
    executionCompleted: result?.executionCompleted === true,
    exactViewport:
      Boolean(profile) &&
      result?.viewport?.width === profile.width &&
      result?.viewport?.height === profile.height,
    shellLoaded:
      Number.isInteger(result?.shellStatus) &&
      result.shellStatus >= 200 &&
      result.shellStatus < 400,
    requiredCoreResponsesObserved:
      result?.requiredCoreResponsesObserved === true,
    routeContentReady: result?.routeContentReady === true,
    axeCompleted: result?.axe?.completed === true,
    axeBlockingViolationsAbsent:
      Array.isArray(result?.axe?.blockingViolations) &&
      result.axe.blockingViolations.length === 0,
    pageErrorsAbsent: result?.diagnostics?.pageErrorCount === 0,
    unexpectedConsoleErrorsAbsent:
      result?.diagnostics?.unexpectedConsoleErrorCount === 0,
    frontendResourceFailuresAbsent:
      result?.diagnostics?.frontendResourceFailureCount === 0,
    frontendResourceHttpErrorsAbsent:
      result?.diagnostics?.frontendResourceHttpErrorCount === 0,
    authorizationHeadersAbsent:
      result?.diagnostics?.authorizationRequestCount === 0,
    browserWriteMethodsAbsent:
      result?.diagnostics?.browserWriteMethodCount === 0,
    keyboardFocusReached: result?.keyboardFocus?.reachedCount > 0,
    keyboardFocusVisible:
      result?.keyboardFocus?.reachedCount > 0 &&
      result?.keyboardFocus?.missingVisibleCueCount === 0,
    reducedMotionPreferenceActive:
      result?.reducedMotion?.preferenceActive === true,
    reducedMotionScanComplete: result?.reducedMotion?.scanComplete === true,
    reducedMotionAnimationsAbsent:
      result?.reducedMotion?.activeAnimationCount === 0,
    reducedMotionLongTransitionsAbsent:
      result?.reducedMotion?.longTransitionCount === 0,
    performanceMetricsComplete,
    performanceMilestonesOrdered,
    performanceWithinBudget,
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([check]) => check);
  return { pass: failures.length === 0, checks, failures };
}

async function waitForCoreBffResponse(
  page,
  expectedPath,
  timeoutMs = Math.min(REQUIRED_CORE_TIMEOUT_MS, remainingTimeoutMs()),
) {
  try {
    const res = await page.waitForResponse(
      (response) => isCoreBffResponse(response, expectedPath),
      { timeout: Math.min(timeoutMs, remainingTimeoutMs()) },
    );
    return {
      path: expectedPath,
      status: res.status(),
      method: res.request().method(),
      url: redactUrl(res.url()),
      body: redactDiagnosticText(
        (await res.text()).replace(/\s+/gu, " ").slice(0, 500),
      ),
      error: "",
    };
  } catch (error) {
    return {
      path: expectedPath,
      status: 0,
      method: "GET",
      url: "",
      body: "",
      error: redactDiagnosticText(error, 240),
    };
  }
}

function textHits(label, text, needle) {
  if (!needle) return [];
  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count ? [{ source: label, url: redactUrl(needle), count }] : [];
}

export function canonicalizeSha256(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256:/u, "");
  return /^[a-f0-9]{64}$/u.test(normalized) ? normalized : "";
}

export function canonicalizeCommitSha(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return /^[a-f0-9]{40}$/u.test(normalized) ? normalized : "";
}

function booleanString(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase();
}

function positiveRunId(value) {
  const normalized = String(value == null ? "" : value).trim();
  return /^[1-9][0-9]*$/u.test(normalized) ? normalized : "";
}

export function inspectDeploymentMetadata(
  metadata,
  { expectedSha = "", expectedArtifactDigest = "" } = {},
) {
  const payload =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : {};
  const expectedCommit = canonicalizeCommitSha(expectedSha);
  const observedCommit = canonicalizeCommitSha(payload.commit);
  const expectedDigest = canonicalizeSha256(expectedArtifactDigest);
  const primaryDigest = canonicalizeSha256(payload.artifactDigest);
  const sha256Digest = canonicalizeSha256(payload.artifactDigestSha256);
  const observedDigest = primaryDigest || sha256Digest;
  const gateRunId = positiveRunId(payload.integrationGateRunId);
  const buildMode =
    payload.buildMode &&
    typeof payload.buildMode === "object" &&
    !Array.isArray(payload.buildMode)
      ? payload.buildMode
      : {};

  const checks = {
    appIdentity: payload.app === "execute-plans",
    environmentIdentity: payload.environment === "pantheon-dev-fe",
    expectedShaConfigured: Boolean(expectedCommit),
    commitIsExactSha: Boolean(observedCommit),
    commitMatchesExpected:
      Boolean(expectedCommit) && observedCommit === expectedCommit,
    artifactDigestPresent: Boolean(observedDigest),
    artifactDigestFieldValid:
      payload.artifactDigest == null ||
      payload.artifactDigest === "" ||
      Boolean(primaryDigest),
    artifactDigestSha256FieldValid:
      payload.artifactDigestSha256 == null ||
      payload.artifactDigestSha256 === "" ||
      Boolean(sha256Digest),
    artifactDigestFieldsAgree:
      !primaryDigest || !sha256Digest || primaryDigest === sha256Digest,
    artifactDigestMatchesExpected:
      !String(expectedArtifactDigest || "").trim() ||
      (Boolean(expectedDigest) && observedDigest === expectedDigest),
    integrationGateRunIdValid: Boolean(gateRunId),
    bffCommitEvidence: payload.bffCommitEvidence === true,
    bffCommitIsExactSha: Boolean(canonicalizeCommitSha(payload.bffCommit)),
    liveBffMode: String(buildMode.VITE_BFF_MODE || "") === "live",
    strictBffFallback: String(buildMode.VITE_BFF_FALLBACK || "") === "strict",
    realWritesDisabled:
      booleanString(buildMode.VITE_BFF_REAL_WRITES) === "false",
    stubWritesDisabled:
      booleanString(buildMode.VITE_BFF_ALLOW_DEV_STUB_WRITES) === "false",
    embeddedBearerDisabled:
      booleanString(buildMode.VITE_BFF_EMBEDDED_BEARER_TOKEN) === "false",
  };

  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([check]) => check);

  return {
    pass: failures.length === 0,
    checks,
    failures,
    deployment: {
      app: String(payload.app || ""),
      environment: String(payload.environment || ""),
      commit: observedCommit,
      artifactDigest: observedDigest,
      integrationGateRunId: gateRunId,
      bffCommit: canonicalizeCommitSha(payload.bffCommit),
      bffCommitEvidence: payload.bffCommitEvidence === true,
      buildMode: {
        VITE_BFF_MODE: String(buildMode.VITE_BFF_MODE || ""),
        VITE_BFF_FALLBACK: String(buildMode.VITE_BFF_FALLBACK || ""),
        VITE_BFF_REAL_WRITES: booleanString(buildMode.VITE_BFF_REAL_WRITES),
        VITE_BFF_ALLOW_DEV_STUB_WRITES: booleanString(
          buildMode.VITE_BFF_ALLOW_DEV_STUB_WRITES,
        ),
        VITE_BFF_EMBEDDED_BEARER_TOKEN: booleanString(
          buildMode.VITE_BFF_EMBEDDED_BEARER_TOKEN,
        ),
      },
    },
  };
}

const SENSITIVE_VALUE_PATTERNS = [
  {
    category: "private_key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/giu,
  },
  {
    category: "bearer_credential",
    pattern: /\bBearer\s+[A-Za-z0-9._~+\/=-]{8,}/giu,
  },
  {
    category: "pantheon_browser_identity",
    pattern: /\bpantheon-dev-browser\s*:[A-Za-z0-9,._:-]+/giu,
  },
  {
    category: "client_secret_literal",
    pattern: /\bclient[_-]?secret\b\s*[:=]\s*["'][^"'\r\n]{8,}["']/giu,
  },
  {
    category: "service_role_literal",
    pattern:
      /\bservice[_-]?role(?:[_-]?(?:key|secret|token))?\b\s*[:=]\s*["'][^"'\r\n]{8,}["']/giu,
  },
  {
    category: "private_key_literal",
    pattern: /\bprivate[_-]?key\b\s*[:=]\s*["'][^"'\r\n]{8,}["']/giu,
  },
  {
    category: "access_token_literal",
    pattern:
      /\b(?:access|refresh|id)[_-]?token\b\s*[:=]\s*["'][^"'\r\n]{16,}["']/giu,
  },
  {
    category: "provider_secret",
    pattern:
      /\b(?:sk_(?:live|test)_[A-Za-z0-9]{12,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[A-Z0-9]{16}|sb_secret_[A-Za-z0-9_-]{12,})\b/gu,
  },
  {
    category: "credentialed_url",
    pattern: /https?:\/\/[^/\s:@]+:[^/\s@]{4,}@/giu,
  },
];

function serviceRoleJwtCount(text) {
  const candidates = String(text || "").match(
    /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu,
  );
  if (!candidates) return 0;
  let count = 0;
  for (const candidate of candidates) {
    try {
      const payload = JSON.parse(
        Buffer.from(candidate.split(".")[1], "base64url").toString("utf8"),
      );
      const roles = [
        payload.role,
        ...(Array.isArray(payload.roles) ? payload.roles : []),
      ]
        .map((role) => String(role || "").toLowerCase())
        .filter(Boolean);
      if (roles.some((role) => role === "service_role")) count += 1;
    } catch {
      // Non-JWT dotted strings are ignored.
    }
  }
  return count;
}

export function scanTextForSensitiveValues(source, text) {
  const input = String(text || "");
  const findings = [];
  for (const { category, pattern } of SENSITIVE_VALUE_PATTERNS) {
    const matches = input.match(new RegExp(pattern.source, pattern.flags));
    if (matches && matches.length > 0) {
      findings.push({
        source: String(source || "unknown"),
        category,
        count: matches.length,
      });
    }
  }
  const jwtCount = serviceRoleJwtCount(input);
  if (jwtCount > 0) {
    findings.push({
      source: String(source || "unknown"),
      category: "service_role_jwt",
      count: jwtCount,
    });
  }
  return findings;
}

export function redactDiagnosticText(value, maxLength = 500) {
  let text = String(value == null ? "" : value);
  text = text
    .replace(
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/giu,
      "<redacted-private-key>",
    )
    .replace(/\bBearer\s+[^\s,;"']+/giu, "Bearer <redacted>")
    .replace(
      /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu,
      "<redacted-jwt>",
    )
    .replace(
      /\b(?:sk_(?:live|test)_[A-Za-z0-9]+|ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]+|AKIA[A-Z0-9]{16}|sb_secret_[A-Za-z0-9_-]+)\b/gu,
      "<redacted-secret>",
    )
    .replace(
      /(\b(?:client[_-]?secret|service[_-]?role(?:[_-]?(?:key|secret|token))?|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*)["'][^"'\r\n]+["']/giu,
      "$1<redacted>",
    )
    .replace(
      /(["']?(?:authorization|bearer|client[_-]?secret|private[_-]?key|service[_-]?role(?:[_-]?(?:key|secret|token))?|access[_-]?token|refresh[_-]?token|id[_-]?token|token)["']?\s*[:=]\s*)["']?[^"',}\s;]+["']?/giu,
      "$1<redacted>",
    );
  return text.replace(/\s+/gu, " ").slice(0, maxLength);
}

export function redactUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return redactDiagnosticText(value);
  }
}

export function inspectBrowserBffMethods(requests) {
  const observed = (Array.isArray(requests) ? requests : []).map((request) => ({
    method: canonicalBrowserMethod(request?.method),
    url: redactUrl(request?.url || ""),
  }));
  const writeRequests = observed
    .filter((request) => !["GET", "HEAD"].includes(request.method))
    .sort(
      (left, right) =>
        left.method.localeCompare(right.method) ||
        left.url.localeCompare(right.url),
    );
  return {
    pass: writeRequests.length === 0,
    observedRequestCount: observed.length,
    writeRequestCount: writeRequests.length,
    writeRequests,
  };
}

function canonicalBrowserMethod(value) {
  const method = String(value || "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{1,20}$/u.test(method) ? method : "INVALID";
}

export function isAllowlistedConsoleError(entry) {
  const text = String(entry?.text || "");
  if (scanTextForSensitiveValues("console", text).length > 0) return false;
  if (
    /AUTH_REQUIRED|authentication required|missing (?:or invalid )?(?:Bearer token|Authorization header)/iu.test(
      text,
    )
  ) {
    return true;
  }
  return /Failed to load resource:.*(?:status of )?401/iu.test(text);
}

function isWithinRoot(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function assertCandidateRoot(candidateDir) {
  const resolved = path.resolve(candidateDir);
  const stat = fs.lstatSync(resolved, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("candidate directory must be a real directory");
  }
  const real = fs.realpathSync(resolved);
  if (real !== resolved) {
    throw new Error("candidate directory must not traverse a symlink");
  }
  return resolved;
}

function assertNoSymlinkSegments(root, target) {
  if (!isWithinRoot(root, target)) {
    throw new Error("candidate request escapes candidate directory");
  }
  const relative = path.relative(root, target);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isSymbolicLink()) {
      throw new Error("candidate request encountered a symbolic link");
    }
  }
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".ico": "image/x-icon",
      ".jpeg": "image/jpeg",
      ".jpg": "image/jpeg",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".map": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".txt": "text/plain; charset=utf-8",
      ".webp": "image/webp",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
    }[extension] || "application/octet-stream"
  );
}

function rawPathFromUrl(requestUrl) {
  const raw = String(requestUrl || "");
  const schemeIndex = raw.indexOf("://");
  const pathStart = schemeIndex === -1 ? 0 : raw.indexOf("/", schemeIndex + 3);
  return (pathStart === -1 ? "/" : raw.slice(pathStart)).split(/[?#]/u, 1)[0];
}

export function createCandidateResolver(candidateDir) {
  const root = assertCandidateRoot(candidateDir);
  const rootPrefix = root + path.sep;

  function resolveFile(requestUrl, { spaFallback = true } = {}) {
    const rawPath = rawPathFromUrl(requestUrl);
    if (/%(?:00|2e|2f|5c)/iu.test(rawPath)) {
      throw new Error("candidate request contains encoded traversal syntax");
    }

    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(requestUrl, "https://candidate.invalid").pathname,
      );
    } catch {
      throw new Error("candidate request path is not valid UTF-8");
    }
    if (pathname.includes("\\") || pathname.includes("\0")) {
      throw new Error("candidate request contains unsafe path syntax");
    }
    const segments = pathname.split("/").filter(Boolean);
    if (segments.some((segment) => segment === "." || segment === "..")) {
      throw new Error("candidate request contains path traversal");
    }

    const requested = path.resolve(root, "." + normalizePath(pathname));
    if (requested !== root && !requested.startsWith(rootPrefix)) {
      throw new Error("candidate request escapes candidate directory");
    }
    assertNoSymlinkSegments(root, requested);

    let selected = requested;
    let stat = fs.lstatSync(selected, { throwIfNoEntry: false });
    if (stat?.isDirectory()) {
      selected = path.join(selected, "index.html");
      assertNoSymlinkSegments(root, selected);
      stat = fs.lstatSync(selected, { throwIfNoEntry: false });
    }
    if (!stat && spaFallback && path.extname(pathname) === "") {
      selected = path.join(root, "index.html");
      assertNoSymlinkSegments(root, selected);
      stat = fs.lstatSync(selected, { throwIfNoEntry: false });
    }
    if (!stat) {
      return { status: 404, filePath: "", relativePath: "", contentType: "" };
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("candidate request did not resolve to a regular file");
    }
    const realFile = fs.realpathSync(selected);
    if (!isWithinRoot(root, realFile)) {
      throw new Error("candidate request resolves outside candidate directory");
    }
    return {
      status: 200,
      filePath: selected,
      relativePath: path.relative(root, selected).split(path.sep).join("/"),
      contentType: mimeType(selected),
    };
  }

  return { root, resolve: resolveFile };
}

export function listCandidateScriptAndStyleFiles(candidateDir) {
  const root = assertCandidateRoot(candidateDir);
  const files = [];
  const pending = [root];
  let totalBytes = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error("candidate payload contains a symbolic link");
      }
      if (entry.isDirectory()) {
        pending.push(absolute);
        continue;
      }
      if (!entry.isFile() || !/\.(?:css|js)$/iu.test(entry.name)) continue;
      const stat = fs.statSync(absolute);
      totalBytes += stat.size;
      files.push(absolute);
      if (files.length > MAX_SCANNED_ASSETS || totalBytes > MAX_SCANNED_BYTES) {
        throw new Error("candidate script/style scan exceeds the safety limit");
      }
    }
  }

  files.sort();
  return files.map((filePath) => ({
    filePath,
    relativePath: path.relative(root, filePath).split(path.sep).join("/"),
  }));
}

function isFrontendResource(url, resourceType) {
  try {
    return (
      new URL(url).origin === new URL(FE_BASE).origin &&
      FRONTEND_RESOURCE_TYPES.has(resourceType)
    );
  } catch {
    return false;
  }
}

function inspectStorageEntries(storageKind, entries) {
  const findings = [];
  const keys = [];
  const sensitiveKey =
    /(?:bearer|authorization|client[_-]?secret|private[_-]?key|service[_-]?role|access[_-]?token|refresh[_-]?token)/iu;
  for (const [key, value] of entries) {
    keys.push(redactDiagnosticText(key, 160));
    if (!String(value || "")) continue;
    if (sensitiveKey.test(String(key || ""))) {
      findings.push({
        source: storageKind + ":" + redactDiagnosticText(key, 120),
        category: "sensitive_storage_value",
        count: 1,
      });
    }
    findings.push(
      ...scanTextForSensitiveValues(
        storageKind + ":" + redactDiagnosticText(key, 120),
        value,
      ),
    );
  }
  return { keys, findings };
}

function redactEvidence(value) {
  if (Array.isArray(value)) return value.map(redactEvidence);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactEvidence(entry)]),
    );
  }
  if (typeof value !== "string") return value;
  return /^https?:\/\//iu.test(value)
    ? redactUrl(value)
    : redactDiagnosticText(value, 1_000);
}

function writeJsonEvidence(filePath, evidence) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(
    resolved,
    JSON.stringify(redactEvidence(evidence), null, 2) + "\n",
    "utf8",
  );
  return resolved;
}

function evidencePath(timestamp) {
  if (PROBE_JSON_OUT) return PROBE_JSON_OUT;
  const safeTimestamp = timestamp.replace(/[:.]/gu, "-");
  return path.join(
    OUT_DIR,
    "hosted-browser-release-policy-" + safeTimestamp + ".json",
  );
}

async function readDeploymentJson(candidateResolver) {
  if (candidateResolver) {
    const resolved = candidateResolver.resolve(FE_BASE + "/deployment.json", {
      spaFallback: false,
    });
    if (resolved.status !== 200) {
      return {
        ok: false,
        status: resolved.status,
        source: "candidate-dir/deployment.json",
        payload: null,
        error: "candidate deployment.json is missing",
      };
    }
    try {
      return {
        ok: true,
        status: 200,
        source: "candidate-dir/deployment.json",
        payload: JSON.parse(fs.readFileSync(resolved.filePath, "utf8")),
        error: "",
      };
    } catch (error) {
      return {
        ok: false,
        status: 200,
        source: "candidate-dir/deployment.json",
        payload: null,
        error: redactDiagnosticText(error),
      };
    }
  }

  try {
    const response = await fetch(withNoCache(FE_BASE + "/deployment.json"), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(Math.min(20_000, remainingTimeoutMs())),
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      source: redactUrl(response.url),
      payload: response.ok ? JSON.parse(text) : null,
      error: response.ok ? "" : "deployment.json returned non-2xx",
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      source: redactUrl(FE_BASE + "/deployment.json"),
      payload: null,
      error: redactDiagnosticText(error),
    };
  }
}

async function installCandidateRoute(page, candidateResolver, routeErrors) {
  await page.route(FE_BASE + "/**", async (route) => {
    const request = route.request();
    const method = request.method();
    if (method !== "GET" && method !== "HEAD") {
      routeErrors.push({
        code: "candidate_method_rejected",
        method,
        url: redactUrl(request.url()),
      });
      await route.abort("blockedbyclient");
      return;
    }

    try {
      const resolved = candidateResolver.resolve(request.url());
      if (resolved.status !== 200) {
        routeErrors.push({
          code: "candidate_file_missing",
          method,
          url: redactUrl(request.url()),
        });
        await route.fulfill({
          status: 404,
          contentType: "text/plain; charset=utf-8",
          body: method === "HEAD" ? "" : "Not found",
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: resolved.contentType,
        headers: {
          "Cache-Control": "no-store",
          "X-Pantheon-Candidate-Release": "1",
        },
        body: method === "HEAD" ? "" : fs.readFileSync(resolved.filePath),
      });
    } catch (error) {
      routeErrors.push({
        code: "candidate_path_rejected",
        method,
        url: redactUrl(request.url()),
        error: redactDiagnosticText(error),
      });
      await route.fulfill({
        status: 403,
        contentType: "text/plain; charset=utf-8",
        body: method === "HEAD" ? "" : "Forbidden",
      });
    }
  });
}

function isFrontendOriginUrl(value) {
  try {
    return new URL(value).origin === new URL(FE_BASE).origin;
  } catch {
    return false;
  }
}

function sortedDiagnostics(entries) {
  return [...entries].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function cssAlphaIsVisible(value) {
  const token = String(value || "").trim();
  if (!token) return false;
  const numeric = Number.parseFloat(token);
  if (!Number.isFinite(numeric)) return true;
  return token.endsWith("%") ? numeric > 0 : numeric > 0;
}

export function cssColorHasVisibleAlpha(value) {
  const color = String(value || "")
    .trim()
    .toLowerCase();
  if (!color || color === "transparent") return false;
  const functional = /^(rgba?)\((.*)\)$/u.exec(color);
  if (!functional) return true;

  const body = functional[2];
  const slashIndex = body.lastIndexOf("/");
  if (slashIndex >= 0) {
    return cssAlphaIsVisible(body.slice(slashIndex + 1));
  }
  if (functional[1] === "rgba") {
    const channels = body.split(",");
    if (channels.length >= 4) return cssAlphaIsVisible(channels.at(-1));
  }
  return true;
}

export function cssBoxShadowHasVisibleLayer(value) {
  const shadow = String(value || "")
    .trim()
    .toLowerCase();
  if (!shadow || shadow === "none") return false;
  const colors = shadow.match(/rgba?\([^)]*\)/gu) || [];
  return colors.length === 0 || colors.some(cssColorHasVisibleAlpha);
}

async function inspectKeyboardFocus(page) {
  const observed = new Map();
  for (let attempt = 0; attempt < KEYBOARD_FOCUS_ATTEMPTS; attempt += 1) {
    await page.keyboard.press("Tab");
    const rawSample = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof Element) || element === document.body) {
        return { domIndex: -1, reached: false, visibleCue: false };
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const reached =
        element.matches(
          'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
        ) &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth &&
        style.display !== "none" &&
        style.visibility !== "hidden";
      return {
        domIndex: Array.prototype.indexOf.call(
          document.querySelectorAll("*"),
          element,
        ),
        reached,
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
      };
    });
    const outlineVisible =
      rawSample.outlineStyle !== "none" &&
      Number.parseFloat(rawSample.outlineWidth || "0") >= 1 &&
      cssColorHasVisibleAlpha(rawSample.outlineColor);
    const sample = {
      ...rawSample,
      visibleCue:
        rawSample.reached &&
        rawSample.focusVisible &&
        (outlineVisible || cssBoxShadowHasVisibleLayer(rawSample.boxShadow)),
    };
    if (sample.reached && !observed.has(sample.domIndex)) {
      observed.set(sample.domIndex, sample.visibleCue);
    }
  }
  const samples = [...observed.values()];
  return {
    attemptedCount: KEYBOARD_FOCUS_ATTEMPTS,
    reachedCount: samples.length,
    visibleCueCount: samples.filter(Boolean).length,
    missingVisibleCueCount: samples.filter((visible) => !visible).length,
  };
}

async function waitForHostedRouteContent(page) {
  try {
    await page.waitForFunction(
      () => {
        const root = document.querySelector("#root");
        return Boolean(
          root &&
          root.childElementCount > 0 &&
          (document.body.innerText || "").trim(),
        );
      },
      undefined,
      { timeout: Math.min(10_000, remainingTimeoutMs()) },
    );
    return await page.evaluate(
      ({ quietMs, maximumMs }) =>
        new Promise((resolve) => {
          const root = document.querySelector("#root");
          if (!root) {
            resolve(false);
            return;
          }
          let quietTimer;
          let maximumTimer;
          const finish = (settled) => {
            clearTimeout(quietTimer);
            clearTimeout(maximumTimer);
            observer.disconnect();
            resolve(settled);
          };
          const markMutation = () => {
            clearTimeout(quietTimer);
            quietTimer = setTimeout(() => finish(true), quietMs);
          };
          const observer = new MutationObserver(markMutation);
          observer.observe(root, {
            attributes: true,
            characterData: true,
            childList: true,
            subtree: true,
          });
          maximumTimer = setTimeout(() => finish(false), maximumMs);
          markMutation();
        }),
      { quietMs: 400, maximumMs: 5_000 },
    );
  } catch {
    return false;
  }
}

async function inspectReducedMotion(page) {
  return page.evaluate((maximumTransitionMs) => {
    const allElements = Array.from(document.querySelectorAll("*"));
    const maximumElements = 5_000;
    let observedElementCount = 0;
    let activeAnimationCount = 0;
    let longTransitionCount = 0;

    const milliseconds = (value) => {
      const clean = String(value || "").trim();
      if (clean.endsWith("ms")) return Number.parseFloat(clean) || 0;
      if (clean.endsWith("s")) return (Number.parseFloat(clean) || 0) * 1_000;
      return 0;
    };
    const list = (value) =>
      String(value || "")
        .split(",")
        .map((item) => item.trim());

    for (const element of allElements.slice(0, maximumElements)) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        style.display === "none" ||
        style.visibility === "hidden"
      ) {
        continue;
      }
      observedElementCount += 1;

      const animationNames = list(style.animationName);
      const animationDurations = list(style.animationDuration).map(
        milliseconds,
      );
      const animationDelays = list(style.animationDelay).map(milliseconds);
      const animationIterations = list(style.animationIterationCount).map(
        (value) =>
          value === "infinite"
            ? Number.POSITIVE_INFINITY
            : Number.parseFloat(value) || 0,
      );
      if (
        animationNames.some(
          (name, index) =>
            name !== "none" &&
            (animationDurations[index % animationDurations.length] || 0) +
              (animationDelays[index % animationDelays.length] || 0) >
              1 &&
            (animationIterations[index % animationIterations.length] || 0) > 0,
        )
      ) {
        activeAnimationCount += 1;
      }

      const transitionDurations = list(style.transitionDuration).map(
        milliseconds,
      );
      const transitionDelays = list(style.transitionDelay).map(milliseconds);
      if (
        transitionDurations.some(
          (duration, index) =>
            duration +
              (transitionDelays[index % transitionDelays.length] || 0) >
            maximumTransitionMs,
        )
      ) {
        longTransitionCount += 1;
      }
    }

    return {
      preferenceActive: window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
      scanComplete: allElements.length <= maximumElements,
      scannedElementCount: Math.min(allElements.length, maximumElements),
      observedElementCount,
      activeAnimationCount,
      longTransitionCount,
      maximumTransitionMs,
    };
  }, REDUCED_MOTION_MAX_TRANSITION_MS);
}

async function inspectPerformance(page) {
  return page.evaluate(() => {
    const rounded = (value) =>
      typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.round(value))
        : null;
    const navigation = performance.getEntriesByType("navigation")[0];
    const firstContentfulPaint = performance
      .getEntriesByType("paint")
      .find((entry) => entry.name === "first-contentful-paint");
    const sameOriginResources = performance
      .getEntriesByType("resource")
      .filter((entry) => {
        try {
          return new URL(entry.name).origin === window.location.origin;
        } catch {
          return false;
        }
      });
    const totalTransferBytes = sameOriginResources.reduce(
      (total, entry) =>
        total +
        (entry.transferSize > 0
          ? entry.transferSize
          : entry.encodedBodySize || 0),
      navigation
        ? navigation.transferSize > 0
          ? navigation.transferSize
          : navigation.encodedBodySize || 0
        : 0,
    );
    return {
      responseEndMs: navigation ? rounded(navigation.responseEnd) : null,
      domContentLoadedMs: navigation
        ? rounded(navigation.domContentLoadedEventEnd)
        : null,
      loadEventMs: navigation ? rounded(navigation.loadEventEnd) : null,
      firstContentfulPaintMs: firstContentfulPaint
        ? rounded(firstContentfulPaint.startTime)
        : null,
      totalTransferBytes: rounded(totalTransferBytes),
    };
  });
}

async function runHostedUxProfile({
  browser,
  AxeBuilder,
  profile,
  pageUrl,
  candidateResolver,
  candidateRouteErrors,
}) {
  const result = {
    profile: profile.id,
    viewport: { width: profile.width, height: profile.height },
    executionCompleted: false,
    shellStatus: 0,
    requiredCoreResponsesObserved: false,
    routeContentReady: false,
    axe: { completed: false, blockingViolations: [] },
    keyboardFocus: {
      attemptedCount: KEYBOARD_FOCUS_ATTEMPTS,
      reachedCount: 0,
      visibleCueCount: 0,
      missingVisibleCueCount: 0,
    },
    reducedMotion: {
      preferenceActive: false,
      scanComplete: false,
      scannedElementCount: 0,
      observedElementCount: 0,
      activeAnimationCount: 0,
      longTransitionCount: 0,
      maximumTransitionMs: REDUCED_MOTION_MAX_TRANSITION_MS,
    },
    performance: {
      responseEndMs: null,
      domContentLoadedMs: null,
      loadEventMs: null,
      firstContentfulPaintMs: null,
      totalTransferBytes: null,
    },
    diagnostics: {
      pageErrorCount: 0,
      unexpectedConsoleErrorCount: 0,
      frontendResourceFailureCount: 0,
      frontendResourceHttpErrorCount: 0,
      authorizationRequestCount: 0,
      browserWriteMethodCount: 0,
      pageErrors: [],
      unexpectedConsoleErrors: [],
      frontendResourceFailures: [],
      frontendResourceHttpErrors: [],
      browserWriteRequests: [],
    },
    error: "",
  };
  const pageErrors = [];
  const unexpectedConsoleErrors = [];
  const frontendResourceFailures = [];
  const frontendResourceHttpErrors = [];
  const browserWriteRequests = [];
  let authorizationRequestCount = 0;
  let context;

  try {
    context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      screen: { width: profile.width, height: profile.height },
      isMobile: profile.mobile,
      hasTouch: profile.mobile,
      reducedMotion: "reduce",
      serviceWorkers: "block",
      colorScheme: "dark",
      locale: "en-US",
      timezoneId: "UTC",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(Math.min(30_000, remainingTimeoutMs()));
    page.setDefaultNavigationTimeout(Math.min(30_000, remainingTimeoutMs()));

    if (candidateResolver) {
      await installCandidateRoute(
        page,
        candidateResolver,
        candidateRouteErrors,
      );
    }
    page.on("request", (request) => {
      if (request.headers().authorization) authorizationRequestCount += 1;
      const method = canonicalBrowserMethod(request.method());
      if (isBffUrl(request.url()) && !["GET", "HEAD"].includes(method)) {
        browserWriteRequests.push({
          method,
          url: redactUrl(request.url()),
        });
      }
    });
    page.on("requestfailed", (request) => {
      if (!isFrontendOriginUrl(request.url())) return;
      frontendResourceFailures.push({
        resourceType: request.resourceType(),
        url: redactUrl(request.url()),
        error: redactDiagnosticText(
          request.failure()?.errorText || "request failed",
          240,
        ),
      });
    });
    page.on("response", (response) => {
      if (!isFrontendOriginUrl(response.url()) || response.status() < 400)
        return;
      frontendResourceHttpErrors.push({
        status: response.status(),
        resourceType: response.request().resourceType(),
        url: redactUrl(response.url()),
      });
    });
    page.on("pageerror", (error) => {
      pageErrors.push(redactDiagnosticText(error, 500));
    });
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const raw = { text: message.text(), url: message.location().url || "" };
      if (isAllowlistedConsoleError(raw)) return;
      unexpectedConsoleErrors.push({
        text: redactDiagnosticText(raw.text, 500),
        url: redactUrl(raw.url),
      });
    });

    const requiredCoreResponsePromises = REQUIRED_CORE_BFF_PATHS.map(
      (expectedPath) =>
        waitForCoreBffResponse(
          page,
          expectedPath,
          Math.min(10_000, remainingTimeoutMs()),
        ),
    );
    const response = await page.goto(pageUrl, {
      waitUntil: NAVIGATION_WAIT_UNTIL,
      timeout: Math.min(30_000, remainingTimeoutMs()),
    });
    result.shellStatus = response?.status() ?? 0;
    const requiredCoreResponses = await Promise.all(
      requiredCoreResponsePromises,
    );
    result.requiredCoreResponsesObserved = requiredCoreResponses.every(
      (entry) => entry.status > 0,
    );
    await page.waitForLoadState("load", {
      timeout: Math.min(10_000, remainingTimeoutMs()),
    });
    await page.locator("body").waitFor({
      state: "visible",
      timeout: Math.min(10_000, remainingTimeoutMs()),
    });
    result.routeContentReady =
      result.requiredCoreResponsesObserved &&
      (await waitForHostedRouteContent(page));
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page
      .waitForFunction(
        () =>
          performance
            .getEntriesByType("paint")
            .some((entry) => entry.name === "first-contentful-paint"),
        undefined,
        { timeout: Math.min(5_000, remainingTimeoutMs()) },
      )
      .catch(() => {});

    const axeResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    result.axe = {
      completed: true,
      blockingViolations: summarizeAxeViolations(axeResults.violations),
    };
    result.keyboardFocus = await inspectKeyboardFocus(page);
    result.reducedMotion = await inspectReducedMotion(page);
    result.performance = await inspectPerformance(page);
    result.executionCompleted = true;
  } catch (error) {
    result.error = redactDiagnosticText(error, 1_000);
  } finally {
    result.diagnostics = {
      pageErrorCount: pageErrors.length,
      unexpectedConsoleErrorCount: unexpectedConsoleErrors.length,
      frontendResourceFailureCount: frontendResourceFailures.length,
      frontendResourceHttpErrorCount: frontendResourceHttpErrors.length,
      authorizationRequestCount,
      browserWriteMethodCount: browserWriteRequests.length,
      pageErrors: sortedDiagnostics(pageErrors),
      unexpectedConsoleErrors: sortedDiagnostics(unexpectedConsoleErrors),
      frontendResourceFailures: sortedDiagnostics(frontendResourceFailures),
      frontendResourceHttpErrors: sortedDiagnostics(frontendResourceHttpErrors),
      browserWriteRequests: sortedDiagnostics(browserWriteRequests),
    };
    await context?.close().catch(() => {});
  }

  result.assessment = assessHostedUxProfile(result);
  return result;
}

async function runProbe() {
  const generatedAt = new Date().toISOString();
  const now = generatedAt.slice(0, 10);
  const strictConfigurationFailures = [];
  if (RELEASE_STRICT && !canonicalizeCommitSha(EXPECTED_FE_SHA)) {
    strictConfigurationFailures.push(
      "PANTHEON_EXPECTED_FE_SHA must be an exact 40-character SHA",
    );
  }
  if (RELEASE_STRICT && !canonicalizeSha256(EXPECTED_ARTIFACT_DIGEST)) {
    strictConfigurationFailures.push(
      "PANTHEON_EXPECTED_ARTIFACT_DIGEST must be an exact SHA-256 digest",
    );
  }
  if (CANDIDATE_DIR && !RELEASE_STRICT) {
    strictConfigurationFailures.push(
      "PANTHEON_CANDIDATE_DIR requires PANTHEON_PROBE_RELEASE_STRICT=1",
    );
  }
  if (strictConfigurationFailures.length > 0) {
    throw new Error(strictConfigurationFailures.join("; "));
  }

  let candidateResolver = null;
  if (CANDIDATE_DIR) candidateResolver = createCandidateResolver(CANDIDATE_DIR);

  let chromium;
  let AxeBuilder;
  try {
    ({ chromium } = await import("@playwright/test"));
    if (RELEASE_STRICT) {
      ({ default: AxeBuilder } = await import("@axe-core/playwright"));
    }
  } catch {
    throw new Error(
      "Missing Playwright or axe. Install dependencies and Playwright Chromium.",
    );
  }

  const browser = await chromium.launch({ headless: true });
  const context = RELEASE_STRICT
    ? await browser.newContext({ serviceWorkers: "block" })
    : null;
  const page = context ? await context.newPage() : await browser.newPage();
  page.setDefaultTimeout(OVERALL_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(OVERALL_TIMEOUT_MS);

  const requests = [];
  const authorizationRequests = [];
  const responses = [];
  const failed = [];
  const oldUrlHits = [];
  const consoleErrors = [];
  const unexpectedConsoleErrors = [];
  const pageErrors = [];
  const coreResponses = [];
  const bundleFetches = [];
  const publicHealthResponses = [];
  const frontendResourceFailures = [];
  const frontendResourceBadResponses = [];
  const frontendAssetUrls = new Set();
  const candidateRouteErrors = [];
  const scannedTexts = [];
  const hostedUxProfiles = [];
  let html = "";
  let bundleText = "";
  let personaFleetChecks = null;
  let shellStatus = 0;
  let storageInspection = {
    ok: !RELEASE_STRICT,
    localKeys: [],
    sessionKeys: [],
    findings: [],
    error: "",
  };

  if (candidateResolver) {
    await installCandidateRoute(page, candidateResolver, candidateRouteErrors);
  }

  page.on("request", (request) => {
    const url = request.url();
    const method = canonicalBrowserMethod(request.method());
    const authorizationPresent = Boolean(request.headers().authorization);
    if (authorizationPresent) {
      authorizationRequests.push({
        method,
        url: redactUrl(url),
      });
    }
    if (isBffUrl(url)) {
      requests.push({
        method,
        url: redactUrl(url),
        authorizationPresent,
      });
    }
    if (matchesUrlNeedle(url, OLD_BFF_URL)) {
      oldUrlHits.push({
        source: "request",
        method,
        url: redactUrl(url),
      });
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    const request = response.request();
    const method = canonicalBrowserMethod(request.method());
    const resourceType = request.resourceType();
    if (isBffUrl(url)) {
      responses.push({
        status: response.status(),
        method,
        url: redactUrl(url),
      });
    }
    if (matchesUrlNeedle(url, OLD_BFF_URL)) {
      oldUrlHits.push({
        source: "response",
        status: response.status(),
        method,
        url: redactUrl(url),
      });
    }
    if (isFrontendResource(url, resourceType)) {
      if (
        resourceType === "script" ||
        resourceType === "style" ||
        resourceType === "stylesheet"
      ) {
        frontendAssetUrls.add(url);
      }
      if (response.status() >= 400) {
        frontendResourceBadResponses.push({
          status: response.status(),
          method,
          resourceType,
          url: redactUrl(url),
        });
      }
    }
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    const method = canonicalBrowserMethod(request.method());
    const failure = redactDiagnosticText(
      request.failure()?.errorText || "request failed",
    );
    if (isBffUrl(url)) {
      failed.push({
        method,
        url: redactUrl(url),
        failure,
      });
    }
    if (matchesUrlNeedle(url, OLD_BFF_URL)) {
      oldUrlHits.push({
        source: "failed",
        method,
        url: redactUrl(url),
        failure,
      });
    }
    if (isFrontendResource(url, request.resourceType())) {
      frontendResourceFailures.push({
        method,
        resourceType: request.resourceType(),
        url: redactUrl(url),
        failure,
      });
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(redactDiagnosticText(error));
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const rawEntry = {
      text: message.text(),
      url: message.location().url || "",
    };
    const entry = {
      text: redactDiagnosticText(rawEntry.text),
      url: redactUrl(rawEntry.url),
      allowlisted: isAllowlistedConsoleError(rawEntry),
    };
    consoleErrors.push(entry);
    if (!entry.allowlisted) unexpectedConsoleErrors.push(entry);
  });

  const pageUrl = withNoCache(FE_BASE + FE_PATH);
  try {
    const requiredCoreResponsePromises = REQUIRED_CORE_BFF_PATHS.map(
      (expectedPath) => waitForCoreBffResponse(page, expectedPath),
    );
    const optionalCoreResponsePromises = OPTIONAL_CORE_BFF_PATHS.map(
      (expectedPath) =>
        waitForCoreBffResponse(page, expectedPath, OPTIONAL_CORE_TIMEOUT_MS),
    );

    const shellResponse = await page.goto(pageUrl, {
      waitUntil: NAVIGATION_WAIT_UNTIL,
      timeout: remainingTimeoutMs(),
    });
    shellStatus = shellResponse?.status() ?? 0;
    coreResponses.push(...(await Promise.all(optionalCoreResponsePromises)));
    coreResponses.push(...(await Promise.all(requiredCoreResponsePromises)));

    if (FE_PATH.includes("persona-fleet")) {
      await page
        .waitForFunction(
          () => {
            const text = document.body.innerText || "";
            const rowCount = Array.from(document.querySelectorAll("tbody tr"))
              .map((row) => (row.textContent || "").trim())
              .filter(Boolean).length;
            return (
              rowCount > 0 ||
              /AUTH_REQUIRED|authentication required|missing Bearer token|Live Persona Fleet data unavailable|目前沒有 live Persona Fleet 資料|seed fallback armed|fallback standby|NaN/iu.test(
                text,
              )
            );
          },
          undefined,
          { timeout: Math.min(15_000, remainingTimeoutMs()) },
        )
        .catch(() => {});

      personaFleetChecks = await page
        .evaluate(() => {
          const text = document.body.innerText || "";
          const rows = Array.from(document.querySelectorAll("tbody tr"))
            .map((row) => (row.textContent || "").trim())
            .filter(Boolean);
          const hasNaN = /NaN/u.test(text);
          const hasSeedFallbackArmed = /seed fallback armed/iu.test(text);
          const hasFallbackStandby = /fallback standby/iu.test(text);
          const hasLiveEmptyState =
            /Live Persona Fleet data unavailable|目前沒有 live Persona Fleet 資料/iu.test(
              text,
            );
          const hasAuthRequiredState =
            /AUTH_REQUIRED|authentication required|missing Bearer token|unauthorized/iu.test(
              text,
            );
          const hasNonProductionRows = [
            /persona-crypto/iu,
            /persona-us-equity/iu,
            /persona-tw-equity/iu,
            /Crypto Persona/iu,
            /US Equity Persona/iu,
            /Taiwan Equity Persona/iu,
            /Deploy Smoke Persona/iu,
            /dry-run-write-probe/iu,
          ].some((pattern) => pattern.test(text));
          return {
            rowCount: rows.length,
            hasNaN,
            hasSeedFallbackArmed,
            hasFallbackStandby,
            hasLiveEmptyState,
            hasAuthRequiredState,
            hasNonProductionRows,
            rowsValid:
              (rows.length > 0 || hasLiveEmptyState) &&
              !hasNaN &&
              !hasNonProductionRows,
            liveBannerValid: !hasSeedFallbackArmed,
          };
        })
        .catch(() => ({
          rowCount: 0,
          hasNaN: false,
          hasSeedFallbackArmed: false,
          hasFallbackStandby: false,
          hasLiveEmptyState: false,
          hasAuthRequiredState: false,
          hasNonProductionRows: false,
          rowsValid: false,
          liveBannerValid: false,
        }));
    }

    html = await page.content();
    scannedTexts.push({ source: "html", text: html });
    const assetUrls = await page
      .locator("script[src], link[rel='stylesheet'][href]")
      .evaluateAll((nodes) =>
        nodes.map((node) =>
          node instanceof HTMLScriptElement ? node.src : node.href,
        ),
      );
    for (const url of assetUrls) frontendAssetUrls.add(url);

    if (candidateResolver) {
      for (const asset of listCandidateScriptAndStyleFiles(
        candidateResolver.root,
      )) {
        const text = fs.readFileSync(asset.filePath, "utf8");
        scannedTexts.push({ source: asset.relativePath, text });
        bundleText += text;
        bundleFetches.push({
          source: asset.relativePath,
          fetched: redactUrl(FE_BASE + "/" + asset.relativePath),
          status: 200,
          ok: true,
          error: "",
        });
      }
    } else {
      const urls = RELEASE_STRICT
        ? [...frontendAssetUrls]
        : assetUrls.filter((url) => /\.js(?:[?#]|$)/iu.test(url));
      for (const assetUrl of urls) {
        if (remainingTimeoutMs() <= 1) {
          bundleFetches.push({
            source: redactUrl(assetUrl),
            fetched: redactUrl(assetUrl),
            status: 0,
            ok: false,
            error: "overall probe timeout exhausted before bundle fetch",
          });
          continue;
        }
        try {
          const fetchedUrl = withNoCache(assetUrl);
          const response = await fetch(fetchedUrl, {
            signal: AbortSignal.timeout(remainingTimeoutMs()),
          });
          const text = await response.text();
          bundleFetches.push({
            source: redactUrl(assetUrl),
            fetched: redactUrl(fetchedUrl),
            status: response.status,
            ok: response.ok,
            error: response.ok ? "" : "bundle returned non-2xx",
          });
          if (response.ok) {
            scannedTexts.push({ source: redactUrl(assetUrl), text });
            bundleText += text;
          }
        } catch (error) {
          bundleFetches.push({
            source: redactUrl(assetUrl),
            fetched: redactUrl(assetUrl),
            status: 0,
            ok: false,
            error: redactDiagnosticText(error),
          });
        }
      }
    }

    if (RELEASE_STRICT) {
      try {
        const storage = await page.evaluate(() => ({
          local: Object.entries(window.localStorage),
          session: Object.entries(window.sessionStorage),
        }));
        const local = inspectStorageEntries("localStorage", storage.local);
        const session = inspectStorageEntries(
          "sessionStorage",
          storage.session,
        );
        storageInspection = {
          ok: true,
          localKeys: local.keys,
          sessionKeys: session.keys,
          findings: [...local.findings, ...session.findings],
          error: "",
        };
      } catch (error) {
        storageInspection = {
          ok: false,
          localKeys: [],
          sessionKeys: [],
          findings: [],
          error: redactDiagnosticText(error),
        };
      }

      for (const profile of HOSTED_UX_PROFILES) {
        hostedUxProfiles.push(
          await runHostedUxProfile({
            browser,
            AxeBuilder,
            profile,
            pageUrl,
            candidateResolver,
            candidateRouteErrors,
          }),
        );
      }
    }
  } finally {
    await browser.close();
  }

  for (const healthPath of PUBLIC_HEALTH_PATHS) {
    try {
      const response = await fetch(BFF_BASE + healthPath, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(Math.min(10_000, remainingTimeoutMs())),
      });
      publicHealthResponses.push({
        path: healthPath,
        status: response.status,
        ok: response.ok,
      });
    } catch (error) {
      publicHealthResponses.push({
        path: healthPath,
        status: 0,
        ok: false,
        error: redactDiagnosticText(error, 200),
      });
    }
  }

  const deploymentFetch = RELEASE_STRICT
    ? await readDeploymentJson(candidateResolver)
    : null;
  const deploymentPolicy = deploymentFetch?.payload
    ? inspectDeploymentMetadata(deploymentFetch.payload, {
        expectedSha: EXPECTED_FE_SHA,
        expectedArtifactDigest: EXPECTED_ARTIFACT_DIGEST,
      })
    : {
        pass: false,
        checks: {},
        failures: ["deploymentJsonUnavailable"],
        deployment: null,
      };
  const sensitiveFindings = RELEASE_STRICT
    ? scannedTexts.flatMap(({ source, text }) =>
        scanTextForSensitiveValues(source, text),
      )
    : [];

  const containsBffStatic =
    bundleText.includes(BFF_BASE) || html.includes(BFF_BASE);
  const observedIntendedBff =
    requests.some((request) => isBffUrl(request.url)) ||
    responses.some((response) => isBffUrl(response.url)) ||
    coreResponses.some((response) => isBffUrl(response.url));
  const usesIntendedBff = observedIntendedBff;
  const containsOld =
    Boolean(OLD_BFF_URL) &&
    (bundleText.includes(OLD_BFF_URL) || html.includes(OLD_BFF_URL));
  oldUrlHits.push(...textHits("html", html, OLD_BFF_URL));
  oldUrlHits.push(...textHits("bundle", bundleText, OLD_BFF_URL));
  const oldUrlHitCount = oldUrlHits.reduce(
    (total, hit) => total + (hit.count ?? 1),
    0,
  );
  const requiredCoreResponseOk = REQUIRED_CORE_BFF_PATHS.every((expectedPath) =>
    coreResponses.some(
      (response) =>
        response.path === expectedPath && isAcceptableCoreStatus(response),
    ),
  );
  const observedProtectedResponsesOk = coreResponses
    .filter((response) => response.status > 0)
    .every(isAcceptableCoreStatus);
  const noAuthorizationRequests = authorizationRequests.length === 0;
  const browserBffMethodPolicy = inspectBrowserBffMethods(requests);
  const noEmbeddedDevBearer = !/pantheon-dev-browser\s*:/iu.test(
    html + "\n" + bundleText,
  );
  const publicHealthOk = PUBLIC_HEALTH_PATHS.every((expectedPath) =>
    publicHealthResponses.some(
      (response) => response.path === expectedPath && response.ok,
    ),
  );
  const shellOk = shellStatus >= 200 && shellStatus < 400;
  const optionalCoreResponsesObserved = OPTIONAL_CORE_BFF_PATHS.every(
    (expectedPath) =>
      coreResponses.some(
        (response) =>
          response.path === expectedPath && isAcceptableCoreStatus(response),
      ),
  );
  const basePass =
    shellOk &&
    publicHealthOk &&
    usesIntendedBff &&
    requiredCoreResponseOk &&
    observedProtectedResponsesOk &&
    noAuthorizationRequests &&
    browserBffMethodPolicy.pass &&
    noEmbeddedDevBearer &&
    oldUrlHitCount === 0 &&
    requests.length > 0 &&
    failed.length === 0;

  const strictChecks = {
    existingAuthBoundaryAndBffChecks: basePass,
    noBrowserWriteMethods: browserBffMethodPolicy.pass,
    pageErrorsAbsent: pageErrors.length === 0,
    unexpectedConsoleErrorsAbsent: unexpectedConsoleErrors.length === 0,
    frontendResourceFailuresAbsent: frontendResourceFailures.length === 0,
    frontendResourceHttpErrorsAbsent: frontendResourceBadResponses.length === 0,
    bundleFetchesComplete:
      bundleFetches.length > 0 &&
      bundleFetches.every(
        (entry) =>
          entry.ok && entry.status >= 200 && entry.status < 300 && !entry.error,
      ),
    deploymentJsonFetched: Boolean(deploymentFetch?.ok),
    deploymentPolicyPassed: deploymentPolicy.pass,
    freshStorageInspected: storageInspection.ok,
    freshStorageSensitiveValuesAbsent: storageInspection.findings.length === 0,
    htmlAndAssetSensitiveValuesAbsent: sensitiveFindings.length === 0,
    candidateRouteErrorsAbsent: candidateRouteErrors.length === 0,
    hostedUxProfileSetComplete:
      hostedUxProfiles.length === HOSTED_UX_PROFILES.length &&
      HOSTED_UX_PROFILES.every(
        (expected, index) => hostedUxProfiles[index]?.profile === expected.id,
      ),
    hostedUxProfilesPassed:
      hostedUxProfiles.length === HOSTED_UX_PROFILES.length &&
      hostedUxProfiles.every((profile) => profile.assessment?.pass === true),
  };
  const strictFailures = Object.entries(strictChecks)
    .filter(([, passed]) => !passed)
    .map(([check]) => check);
  const pass = RELEASE_STRICT ? strictFailures.length === 0 : basePass;

  const md = [
    "# Frontend Browser BFF Probe",
    "",
    "Date: " + generatedAt,
    "FE: " + FE_BASE,
    "Page URL: " + redactUrl(pageUrl),
    "BFF: " + BFF_BASE,
    "Upstream BFF: " + UPSTREAM_BFF_BASE,
    "Old BFF: " + (OLD_BFF_URL || "(disabled)"),
    "nocache: " + NOCACHE_SHA,
    "timeout ms: " + OVERALL_TIMEOUT_MS,
    "navigation waitUntil: " + NAVIGATION_WAIT_UNTIL,
    "release strict: " + RELEASE_STRICT,
    "candidate directory routed: " + Boolean(candidateResolver),
    "core waitForResponse paths: " + CORE_BFF_PATHS.join(", "),
    "required core waitForResponse paths: " +
      REQUIRED_CORE_BFF_PATHS.join(", "),
    "optional core waitForResponse paths: " +
      OPTIONAL_CORE_BFF_PATHS.join(", "),
    "",
    "## Summary",
    "",
    "- contains intended BFF URL: " + usesIntendedBff,
    "- frontend shell status: " + shellStatus,
    "- public health/ready responses valid: " + publicHealthOk,
    "- protected responses are 401/AUTH_REQUIRED: " +
      observedProtectedResponsesOk,
    "- BFF requests contain no Authorization header: " +
      noAuthorizationRequests,
    "- all browser requests with Authorization header: " +
      authorizationRequests.length,
    "- browser BFF requests use only GET/HEAD: " + browserBffMethodPolicy.pass,
    "- browser BFF write-method request count: " +
      browserBffMethodPolicy.writeRequestCount,
    "- bundle contains no embedded dev bearer literal: " + noEmbeddedDevBearer,
    "- contains intended BFF URL in html/bundle: " + containsBffStatic,
    "- intended BFF runtime request count: " + requests.length,
    "- contains old BFF URL: " + containsOld,
    "- old BFF URL hit count: " + oldUrlHitCount,
    "- required core BFF responses complete: " + requiredCoreResponseOk,
    "- optional core BFF responses observed: " + optionalCoreResponsesObserved,
    ...(personaFleetChecks
      ? [
          "- persona fleet row count: " + personaFleetChecks.rowCount,
          "- persona fleet has NaN: " + personaFleetChecks.hasNaN,
          "- persona fleet has live empty state: " +
            personaFleetChecks.hasLiveEmptyState,
          "- persona fleet has auth-required state: " +
            personaFleetChecks.hasAuthRequiredState,
          "- persona fleet has non-production rows: " +
            personaFleetChecks.hasNonProductionRows,
          "- persona fleet seed fallback armed: " +
            personaFleetChecks.hasSeedFallbackArmed,
          "- persona fleet fallback standby: " +
            personaFleetChecks.hasFallbackStandby,
          "- persona fleet rows valid (informational while unauthenticated): " +
            personaFleetChecks.rowsValid,
          "- persona fleet live banner valid (informational while unauthenticated): " +
            personaFleetChecks.liveBannerValid,
        ]
      : []),
    "- request count: " + requests.length,
    "- response count: " + responses.length,
    "- failed count: " + failed.length,
    "- pageerror count: " + pageErrors.length,
    "- unexpected console.error count: " + unexpectedConsoleErrors.length,
    "- FE document/script/style request failure count: " +
      frontendResourceFailures.length,
    "- FE document/script/style HTTP >=400 count: " +
      frontendResourceBadResponses.length,
    "- bundle fetch failure count: " +
      bundleFetches.filter((entry) => !entry.ok).length,
    "- storage sensitive finding count: " + storageInspection.findings.length,
    "- HTML/JS/CSS sensitive finding count: " + sensitiveFindings.length,
    "- deployment policy passed: " + deploymentPolicy.pass,
    "- hosted UX profile count: " + hostedUxProfiles.length,
    ...hostedUxProfiles.map(
      (profile) =>
        "- hosted UX " +
        profile.profile +
        " passed: " +
        profile.assessment.pass +
        (profile.assessment.failures.length
          ? " (" + profile.assessment.failures.join(", ") + ")"
          : ""),
    ),
    "- strict failures: " +
      (strictFailures.length ? strictFailures.join(", ") : "none"),
    "- pass: " + pass,
    "",
    "## Core BFF responses",
    "",
    "| Status | Method | Path | Required | Accepted | URL / Error |",
    "|---:|---|---|---|---|---|",
    ...coreResponses.map(
      (response) =>
        "| " +
        response.status +
        " | " +
        response.method +
        " | " +
        response.path +
        " | " +
        isRequiredCorePath(response.path) +
        " | " +
        isAcceptableCoreStatus(response) +
        " | " +
        (response.url
          ? response.url.replace(BFF_BASE, "") + " " + response.body
          : response.error) +
        " |",
    ),
    "",
    "## Public health responses",
    "",
    "| Status | Path | Accepted |",
    "|---:|---|---|",
    ...publicHealthResponses.map(
      (response) =>
        "| " +
        response.status +
        " | " +
        response.path +
        " | " +
        response.ok +
        " |",
    ),
    "",
    "## Bundle fetches",
    "",
    "| Status | Accepted | Source | Error |",
    "|---:|---|---|---|",
    ...bundleFetches.map(
      (entry) =>
        "| " +
        entry.status +
        " | " +
        entry.ok +
        " | " +
        entry.source +
        " | " +
        entry.error +
        " |",
    ),
    "",
    "## Old URL hits",
    "",
    oldUrlHits.length
      ? oldUrlHits
          .map(
            (hit) =>
              "- " +
              hit.source +
              (hit.method ? " " + hit.method : "") +
              (hit.status ? " " + hit.status : "") +
              (hit.count ? " count=" + hit.count : "") +
              ": " +
              hit.url,
          )
          .join("\n")
      : "None",
    "",
    "## Responses",
    "",
    "| Status | Method | URL |",
    "|---:|---|---|",
    ...responses.map(
      (response) =>
        "| " +
        response.status +
        " | " +
        response.method +
        " | " +
        response.url.replace(BFF_BASE, "") +
        " |",
    ),
    "",
    "## Failed",
    "",
    failed.length
      ? failed
          .map(
            (entry) =>
              "- " + entry.method + " " + entry.url + ": " + entry.failure,
          )
          .join("\n")
      : "None",
    "",
    "## Page errors",
    "",
    pageErrors.length
      ? pageErrors
          .slice(0, 20)
          .map((error) => "- " + error)
          .join("\n")
      : "None",
    "",
    "## Console errors",
    "",
    consoleErrors.length
      ? consoleErrors
          .slice(0, 20)
          .map(
            (entry) =>
              "- allowlisted=" +
              entry.allowlisted +
              " " +
              entry.text +
              (entry.url ? " (" + entry.url + ")" : ""),
          )
          .join("\n")
      : "None",
  ].join("\n");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const markdownOut = path.join(
    OUT_DIR,
    "hosted-browser-bff-probe-" + now + ".md",
  );
  fs.writeFileSync(markdownOut, md, "utf8");

  let jsonOut = "";
  if (RELEASE_STRICT || PROBE_JSON_OUT) {
    jsonOut = writeJsonEvidence(evidencePath(generatedAt), {
      schemaVersion: 1,
      probe: "pantheon-hosted-browser-release-policy",
      generatedAt,
      mode: RELEASE_STRICT ? "release-strict" : "compatibility",
      pass,
      targets: {
        feBase: FE_BASE,
        pageUrl,
        bffBase: BFF_BASE,
        upstreamBffBase: UPSTREAM_BFF_BASE,
        oldBffUrl: OLD_BFF_URL || null,
        candidateDirectoryRouted: Boolean(candidateResolver),
      },
      expectations: {
        frontendSha: canonicalizeCommitSha(EXPECTED_FE_SHA),
        artifactDigest: canonicalizeSha256(EXPECTED_ARTIFACT_DIGEST),
      },
      checks: {
        base: {
          shellOk,
          publicHealthOk,
          usesIntendedBff,
          requiredCoreResponseOk,
          observedProtectedResponsesOk,
          noAuthorizationRequests,
          noBrowserWriteMethods: browserBffMethodPolicy.pass,
          noEmbeddedDevBearer,
          oldUrlAbsent: oldUrlHitCount === 0,
          bffRequestsObserved: requests.length > 0,
          bffRequestFailuresAbsent: failed.length === 0,
          pass: basePass,
        },
        strict: strictChecks,
      },
      failures: strictFailures,
      deployment: {
        fetch: {
          ok: Boolean(deploymentFetch?.ok),
          status: deploymentFetch?.status ?? 0,
          source: deploymentFetch?.source || "",
          error: deploymentFetch?.error || "",
        },
        policy: deploymentPolicy,
      },
      storage: {
        inspected: storageInspection.ok,
        localKeys: storageInspection.localKeys,
        sessionKeys: storageInspection.sessionKeys,
        sensitiveFindings: storageInspection.findings,
        error: storageInspection.error,
      },
      secretScan: {
        scannedSourceCount: scannedTexts.length,
        findings: sensitiveFindings,
      },
      browser: {
        shellStatus,
        authorizationRequests,
        pageErrors,
        consoleErrors,
        unexpectedConsoleErrors,
        frontendResourceFailures,
        frontendResourceBadResponses,
        bundleFetches,
        candidateRouteErrors,
        hostedUxProfiles,
      },
      bff: {
        methodPolicy: browserBffMethodPolicy,
        requests,
        responses,
        failures: failed,
        coreResponses,
        publicHealthResponses,
        oldUrlHits,
      },
    });
  }

  console.log(md);
  if (jsonOut) console.log("Redacted JSON evidence: " + jsonOut);
  if (!pass) process.exitCode = 1;
}

async function runCli() {
  try {
    await runProbe();
  } catch (error) {
    const generatedAt = new Date().toISOString();
    const message = redactDiagnosticText(error, 1_000);
    if (RELEASE_STRICT || PROBE_JSON_OUT) {
      try {
        writeJsonEvidence(evidencePath(generatedAt), {
          schemaVersion: 1,
          probe: "pantheon-hosted-browser-release-policy",
          generatedAt,
          mode: RELEASE_STRICT ? "release-strict" : "compatibility",
          pass: false,
          failures: ["probeExecutionFailed"],
          error: message,
        });
      } catch (evidenceError) {
        console.error(
          "Unable to write redacted probe evidence: " +
            redactDiagnosticText(evidenceError),
        );
      }
    }
    console.error("Hosted browser/BFF probe failed: " + message);
    process.exitCode = 2;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await runCli();
}
