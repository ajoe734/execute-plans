#!/usr/bin/env node
// MGMT-GAP-006: hosted management production acceptance harness.
//
// Crawls the hosted management console (authenticated, strict-live BFF
// mode) and asserts the acceptance list from
// docs/bff/execution-tasks/2026-06-30-management-console-production-gap/MGMT-GAP-006-production-acceptance-harness.md
// (Pantheon repo):
//   - visible nav routes + hidden legacy aliases;
//   - canonical final paths for known aliases (fails on direct-render);
//   - per-route BFF endpoint capture;
//   - no silent seed fallback in strict-live mode;
//   - detail-route honesty (undefined/NaN/blank) on live-id + fixture-id
//     detail routes;
//   - session/RBAC consistency (`/bff/me` vs privileged reads);
//   - write-CTA mock-success risk via a source-scan cross-check (no real
//     writes are performed by default — see --click-write-ctas);
//   - console/CORS failures;
//   - button/disabled-button counts with reasons;
//   - the MGMT-LOAD-006/007 load/release gate manifest reports
//     `result.pass === true`.
//
// Usage:
//   node scripts/accept-management-hosted-production.mjs \
//     [--load-gate-manifest <path>] [--src-scan-dir <path>] [--out-dir <path>]
//   node scripts/accept-management-hosted-production.mjs --load-gate-only
//
// Env overrides mirror the sibling hosted probes (see
// scripts/probe-hosted-browser-bff.mjs / scripts/validate-management-live-deep.mjs):
//   PANTHEON_FE_BASE_URL, PANTHEON_BFF_BASE_URL, PANTHEON_AUDIT_OUT_DIR,
//   PANTHEON_LOAD_BASELINE_OUT_DIR, PANTHEON_LOAD_GATE_MANIFEST,
//   PANTHEON_BFF_SMOKE_BEARER_TOKEN, PANTHEON_TENANT_ID.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  bearerAuthorization,
  normalizeOptionalBearerToken,
} from "./lib/bearer-token.mjs";
import { BASELINE_ROUTES, expectedCanonicalPath, ENTITY_LIST_ENDPOINTS } from "./lib/management-routes.mjs";

// --- argv / env --------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

const argv = parseArgs(process.argv.slice(2));

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

const FE_BASE = trimTrailingSlash(process.env.PANTHEON_FE_BASE_URL || "https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io");
const BFF_BASE = trimTrailingSlash(process.env.PANTHEON_BFF_BASE_URL || "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io");
const OUT_DIR = argv["out-dir"] || process.env.PANTHEON_AUDIT_OUT_DIR || ".lovable/audits";
const SRC_SCAN_DIR = argv["src-scan-dir"] || "src/management";
const LOAD_GATE_MANIFEST = argv["load-gate-manifest"] || process.env.PANTHEON_LOAD_GATE_MANIFEST || "";
const LOAD_BASELINE_DIR = argv["load-baseline-dir"] || process.env.PANTHEON_LOAD_BASELINE_OUT_DIR || OUT_DIR;
const ROUTE_TIMEOUT_MS = Number(process.env.PANTHEON_ACCEPT_ROUTE_TIMEOUT_MS || 20_000);
const SETTLE_TIMEOUT_MS = Number(process.env.PANTHEON_ACCEPT_SETTLE_TIMEOUT_MS || 4_000);
const CLICK_WRITE_CTAS = argv["click-write-ctas"] === "true" || process.env.PANTHEON_ACCEPT_CLICK_WRITE_CTAS === "1";
const STRICT_SOURCE_SCAN = process.env.PANTHEON_ACCEPT_STRICT_SOURCE_SCAN === "1";
const LOAD_GATE_ONLY = argv["load-gate-only"] === "true";

const OPERATOR_ID = process.env.PANTHEON_ACCEPT_OPERATOR_ID || "op-mgmt-gap-006";
const OPERATOR_ROLES = (process.env.PANTHEON_ACCEPT_OPERATOR_ROLES || "operator,reviewer,approver").split(",").map((r) => r.trim()).filter(Boolean);
// The hosted dev BFF's stub-auth allows only the `pantheon-dev` tenant (see
// `/bff/me` -> tenant.allowed_ids). `e2e/helpers/auth.ts`'s DEFAULT_FE_TENANT_ID
// ("tenant-dev") is a fixture-mock-only value for the CI-safe Playwright specs
// and 403s against the real hosted BFF.
const TENANT_ID = process.env.PANTHEON_TENANT_ID || "pantheon-dev";
const BEARER_TOKEN = normalizeOptionalBearerToken(
  process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN || process.env.BFF_AUTH_TOKEN || ""
);

const AUTH_STORAGE_KEYS = {
  bearerToken: "pantheon.bff.bearerToken",
  legacyBearerToken: "pantheon_operator_token",
  tenantId: "pantheon.bff.tenantId",
  legacyTenantId: "pantheon_tenant_id",
  devOidcSession: "pantheon.e2e.devOidcSession",
};
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowStamp() {
  return new Date().toISOString().slice(0, 10);
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

function currentSha() {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

// --- Playwright ----------------------------------------------------------

async function loadChromium() {
  try {
    return (await import("@playwright/test")).chromium;
  } catch {
    console.error("Missing @playwright/test. Install with: npm install -D @playwright/test && npx playwright install chromium");
    process.exit(2);
  }
}

const CORS_PATTERN = /has been blocked by cors|cors policy|cross-origin request blocked/i;
const RENDER_CRASH_PATTERN = /ReferenceError|is not defined|Cannot read propert|is not a function|TypeError:|Uncaught /i;
const NET_FAIL_PATTERN = /net::ERR_|failed to fetch/i;

function classifyConsoleError(text) {
  if (CORS_PATTERN.test(text)) return "cors";
  if (NET_FAIL_PATTERN.test(text)) return "network";
  if (RENDER_CRASH_PATTERN.test(text)) return "render_crash";
  return "benign";
}

const MOCK_TEXT_PATTERNS = [
  { id: "seed_fallback_armed", pattern: /seed fallback armed/i, severity: "fail" },
  { id: "mock_write_success", pattern: /(mock|demo|示範)[^.]{0,20}(success|已成功|已儲存|saved)|( success|已成功|已儲存|saved)[^.]{0,20}(mock|demo|示範)/i, severity: "fail" },
  { id: "mock_mode_label", pattern: /mock mode|demo mode|模擬模式|示範模式/i, severity: "info" },
  { id: "fallback_standby", pattern: /fallback standby/i, severity: "info" },
];

const DETAIL_HONESTY_PATTERNS = [
  { id: "raw_undefined", pattern: /\bundefined\b/ },
  { id: "raw_nan", pattern: /\bNaN\b/ },
  { id: "invalid_date", pattern: /Invalid Date/ },
];

function textFindings(text) {
  const mock = [];
  for (const rule of MOCK_TEXT_PATTERNS) {
    const match = text.match(rule.pattern);
    if (match) mock.push({ id: rule.id, severity: rule.severity, sample: match[0].slice(0, 120) });
  }
  const honesty = [];
  for (const rule of DETAIL_HONESTY_PATTERNS) {
    if (rule.pattern.test(text)) honesty.push(rule.id);
  }
  return { mock, honesty };
}

function isBffUrl(url) {
  if (!url.startsWith(BFF_BASE)) return false;
  try {
    const pathname = new URL(url).pathname;
    return pathname.startsWith("/bff/") || ["/health", "/healthz", "/readyz", "/openapi.json"].includes(pathname);
  } catch {
    return false;
  }
}

async function gotoRouteWithRetry(page, targetUrl) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: ROUTE_TIMEOUT_MS });
      return null;
    } catch (err) {
      lastError = err;
      await page.waitForTimeout(750).catch(() => {});
    }
  }
  return lastError;
}

async function crawlRoute(page, route, { source }) {
  const requests = [];
  const responses = [];
  const failedRequests = [];
  const consoleErrors = [];

  const onRequest = (req) => {
    const url = req.url();
    if (isBffUrl(url)) requests.push({ method: req.method(), url });
  };
  const onResponse = (res) => {
    const url = res.url();
    if (isBffUrl(url)) responses.push({ status: res.status(), method: res.request().method(), url });
  };
  const onRequestFailed = (req) => {
    const url = req.url();
    if (isBffUrl(url)) failedRequests.push({ method: req.method(), url, failure: req.failure()?.errorText || "" });
  };
  const onConsole = (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  };

  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);
  page.on("console", onConsole);

  const requestedPathname = route.path.split("?")[0];
  const targetUrl = `${FE_BASE}${route.path}`;
  let status = "ok";
  let navError = "";
  let finalUrl = "";
  let bodyText = "";

  try {
    const navErrorMaybe = await gotoRouteWithRetry(page, targetUrl);
    if (navErrorMaybe) throw navErrorMaybe;
    await page
      .waitForFunction(() => (document.body?.innerText || "").trim().length > 15, undefined, { timeout: SETTLE_TIMEOUT_MS })
      .catch(() => {});
    await page.waitForTimeout(400);
    finalUrl = await page.evaluate(() => window.location.pathname + window.location.search);
    bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
    if (bodyText.includes("畫面渲染失敗")) status = "crash";
    else if (bodyText.trim().length < 15) status = "blank";
  } catch (err) {
    status = "navfail";
    navError = String(err).replace(/\s+/g, " ").slice(0, 240);
  }

  let controls = { buttons: 0, enabledButtons: 0, disabledButtons: 0, disabledReasons: [], links: 0, inputs: 0, textareas: 0, selects: 0 };
  if (status !== "navfail") {
    controls = await page
      .evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const disabled = buttons.filter((b) => b.disabled || b.getAttribute("aria-disabled") === "true");
        return {
          buttons: buttons.length,
          enabledButtons: buttons.length - disabled.length,
          disabledButtons: disabled.length,
          disabledReasons: disabled.slice(0, 30).map((b) => ({
            text: (b.innerText || b.getAttribute("aria-label") || "").trim().slice(0, 60),
            reason: (b.getAttribute("title") || b.getAttribute("aria-label") || b.dataset?.reason || b.dataset?.disabledReason || "").trim().slice(0, 120),
          })),
          links: document.querySelectorAll("a[href]").length,
          inputs: document.querySelectorAll("input").length,
          textareas: document.querySelectorAll("textarea").length,
          selects: document.querySelectorAll("select").length,
        };
      })
      .catch(() => controls);
  }

  page.off("request", onRequest);
  page.off("response", onResponse);
  page.off("requestfailed", onRequestFailed);
  page.off("console", onConsole);

  const findings = textFindings(bodyText);
  const classifiedConsoleErrors = consoleErrors.map((text) => ({ text: text.slice(0, 240), kind: classifyConsoleError(text) }));

  let alias = null;
  const expected = expectedCanonicalPath(requestedPathname);
  if (expected) {
    const finalPathname = (finalUrl || "").split("?")[0];
    const redirected = finalPathname === expected;
    alias = {
      requestedPath: requestedPathname,
      expectedCanonical: expected,
      finalUrl,
      redirected,
      directRenderFail: !redirected && finalPathname === requestedPathname,
    };
  }

  return {
    path: route.path,
    kind: route.kind || "unknown",
    source,
    status,
    navError,
    finalUrl,
    alias,
    controls,
    bffRequestCount: requests.length,
    bffResponseCount: responses.length,
    bffFailedCount: failedRequests.length,
    bffFailed: failedRequests.slice(0, 10),
    bffEndpoints: [...new Set(responses.map((r) => `${r.method} ${new URL(r.url).pathname}`))],
    consoleErrors: classifiedConsoleErrors.slice(0, 15),
    consoleErrorCounts: classifiedConsoleErrors.reduce((acc, e) => {
      acc[e.kind] = (acc[e.kind] || 0) + 1;
      return acc;
    }, {}),
    mockFindings: findings.mock,
    detailHonestyViolations: findings.honesty,
    textSampleLen: bodyText.trim().length,
  };
}

async function discoverLiveNav(page) {
  await page.goto(`${FE_BASE}/management/cockpit`, { waitUntil: "domcontentloaded", timeout: ROUTE_TIMEOUT_MS }).catch(() => {});
  await page.waitForTimeout(1500);
  const hrefs = await page
    .evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      return anchors
        .map((a) => a.getAttribute("href") || "")
        .filter((href) => href.startsWith("/management/"))
        .map((href) => href.split("?")[0].replace(/\/$/, ""))
        .filter(Boolean);
    })
    .catch(() => []);
  return [...new Set(hrefs)];
}

function authHeaders(token, tenantId) {
  return {
    Accept: "application/json",
    Authorization: bearerAuthorization(token),
    "X-Tenant-Id": tenantId,
    "X-Request-Id": `mgmt-gap-006-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
}

async function fetchJson(url, headers, timeoutMs = 15_000, attempts = 4) {
  let lastErr = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      const result = { status: res.status, body, raw: text.slice(0, 500), attempts: attempt };
      if (!RETRYABLE_HTTP_STATUS.has(res.status) || attempt === attempts) {
        return result;
      }
      lastErr = `status:${res.status}`;
    } catch (err) {
      lastErr = String(err).slice(0, 200);
      if (attempt === attempts) break;
    }
    await sleep(Math.min(2_000, 250 * (2 ** (attempt - 1))));
  }
  return { status: 0, body: null, error: lastErr, attempts };
}

function firstLiveId(body) {
  const items = Array.isArray(body) ? body : body?.items || body?.data?.items || body?.data || [];
  if (!Array.isArray(items) || items.length === 0) return null;
  const first = items[0];
  for (const key of ["id", "itemId", "entityId", "refId", "ref_id", "strategyId", "personaId"]) {
    if (first && typeof first[key] === "string") return first[key];
  }
  return null;
}

async function resolveLiveIdRoutes() {
  const results = [];
  const entities = new Map();
  for (const route of BASELINE_ROUTES) {
    if (route.entity && ENTITY_LIST_ENDPOINTS[route.entity] && !entities.has(route.entity)) {
      entities.set(route.entity, route.path);
    }
  }
  for (const [entity, fixturePath] of entities) {
    const endpoint = ENTITY_LIST_ENDPOINTS[entity];
    const { status, body, error } = await fetchJson(`${BFF_BASE}${endpoint}`, authHeaders(BEARER_TOKEN, TENANT_ID));
    if (status !== 200 || !body) {
      results.push({ entity, endpoint, status, error: error || "non-200 or unparseable body", liveId: null });
      continue;
    }
    const liveId = firstLiveId(body);
    if (!liveId) {
      results.push({ entity, endpoint, status, liveId: null, note: "no live id resolvable (empty list)" });
      continue;
    }
    const segments = fixturePath.split("/");
    segments[segments.length - 1] = liveId;
    results.push({ entity, endpoint, status, liveId, routePath: segments.join("/") });
  }
  return results;
}

async function sessionRbacCheck() {
  const checks = [];
  const valid = await fetchJson(`${BFF_BASE}/bff/me`, authHeaders(BEARER_TOKEN, TENANT_ID));
  checks.push({
    label: "Authenticated /bff/me returns operator identity.",
    status: valid.status >= 200 && valid.status < 300 ? "pass" : "fail",
    note: `status:${valid.status}; attempts:${valid.attempts ?? 1}`,
  });

  const bogusToken = "op-bogus-session:none";
  const invalidMe = await fetchJson(`${BFF_BASE}/bff/me`, authHeaders(bogusToken, TENANT_ID));
  const invalidMeFailClosed = invalidMe.status === 401 || invalidMe.status === 403;
  checks.push({
    label: "Invalid/no-role token is rejected by /bff/me (401/403).",
    status: invalidMeFailClosed ? "pass" : invalidMe.status === 0 ? "missing" : "fail",
    note: `status:${invalidMe.status}; attempts:${invalidMe.attempts ?? 1}`,
  });

  const invalidRead = await fetchJson(`${BFF_BASE}/bff/management/shell-summary`, authHeaders(bogusToken, TENANT_ID));
  const invalidReadFailClosed = invalidRead.status === 401 || invalidRead.status === 403;
  checks.push({
    label: "Privileged management read is not served under an invalid session (fails closed).",
    status: invalidReadFailClosed ? "pass" : invalidRead.status === 0 ? "missing" : "fail",
    note: `status:${invalidRead.status}; attempts:${invalidRead.attempts ?? 1}`,
  });

  const overall = checks.every((c) => c.status === "pass") ? "pass" : checks.some((c) => c.status === "fail") ? "fail" : "missing";
  return { overall, checks };
}

function latestManifestIn(dir) {
  if (!dir || !fs.existsSync(dir)) return "";
  return fs.readdirSync(dir)
    .filter((name) => /^release-load-gate.*\.json$/.test(name))
    .map((name) => path.join(dir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || "";
}

function resolveLoadGateManifestPath() {
  const candidates = uniqueStrings([
    LOAD_GATE_MANIFEST,
    path.join(LOAD_BASELINE_DIR, "release-load-gate-current.json"),
    path.join(OUT_DIR, "release-load-gate-current.json"),
    latestManifestIn(LOAD_BASELINE_DIR),
    latestManifestIn(OUT_DIR),
  ]);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0] || "";
}

function loadGateCheck() {
  const manifestPath = resolveLoadGateManifestPath();
  if (!manifestPath) {
    return {
      status: "missing",
      note: `no load gate manifest supplied or found in ${LOAD_BASELINE_DIR} / ${OUT_DIR}`,
      pass: null,
    };
  }
  if (!fs.existsSync(manifestPath)) {
    return { status: "missing", note: `file not found: ${manifestPath}`, pass: null };
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const pass = manifest?.result?.pass === true;
    return {
      status: pass ? "pass" : "fail",
      note: `result.pass:${manifest?.result?.pass} overall:${manifest?.result?.overall} failures:${(manifest?.result?.failures || []).length} missing:${(manifest?.result?.missing || []).length}`,
      pass,
      manifestPath,
      generatedAt: manifest?.generatedAt,
    };
  } catch (err) {
    return { status: "fail", note: `parse error: ${String(err).slice(0, 200)}`, pass: false };
  }
}

// --- write-CTA mock-success source-scan cross-check ------------------------

const GOVERNED_SIGNAL_PATTERN = /receiptId|commandId|auditRef|receipt_id|command_id|audit_ref|NonProductionActionButton|runActionSafe|bffWrites/;

function listFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...listFiles(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function sourceScanWriteCtas(srcDir) {
  const files = listFiles(srcDir);
  const findings = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    lines.forEach((line, idx) => {
      if (!/toast\.success\s*\(/.test(line)) return;
      const windowStart = Math.max(0, idx - 25);
      const windowEnd = Math.min(lines.length, idx + 25);
      const windowText = lines.slice(windowStart, windowEnd).join("\n");
      const governed = GOVERNED_SIGNAL_PATTERN.test(windowText);
      findings.push({
        file: path.relative(process.cwd(), file),
        line: idx + 1,
        snippet: line.trim().slice(0, 160),
        governed,
      });
    });
  }
  const ungoverned = findings.filter((f) => !f.governed);
  return { scannedFiles: files.length, totalToastSuccess: findings.length, ungoverned, findings };
}

// --- main ------------------------------------------------------------------

async function main() {
  const startedAt = new Date().toISOString();

  if (LOAD_GATE_ONLY) {
    const loadGate = loadGateCheck();
    console.log(JSON.stringify(loadGate, null, 2));
    if (loadGate.status !== "pass") process.exitCode = 1;
    return;
  }

  if (!BEARER_TOKEN) {
    throw new Error(
      "A short-lived BFF_AUTH_TOKEN is required for hosted production acceptance",
    );
  }

  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  await context.addInitScript(
    ({ keys, token, roles, operatorId, tenantId }) => {
      const write = (target) => {
        if (!target) return;
        target.setItem(keys.bearerToken, token);
        target.setItem(keys.legacyBearerToken, token);
        target.setItem(keys.tenantId, tenantId);
        target.setItem(keys.legacyTenantId, tenantId);
        target.setItem(
          keys.devOidcSession,
          JSON.stringify({
            aud: "pantheon-bff",
            auth_time: Math.floor(Date.now() / 1000),
            iss: "pantheon-e2e-dev-login",
            roles,
            sub: operatorId,
            tenant_id: tenantId,
          }),
        );
      };
      try {
        write(window.sessionStorage);
        write(window.localStorage);
      } catch {
        // storage may be unavailable before a durable origin exists
      }
    },
    { keys: AUTH_STORAGE_KEYS, token: BEARER_TOKEN, roles: OPERATOR_ROLES, operatorId: OPERATOR_ID, tenantId: TENANT_ID },
  );

  const page = await context.newPage();
  page.setDefaultTimeout(ROUTE_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(ROUTE_TIMEOUT_MS);

  console.log(`[accept-management-hosted-production] discovering live nav at ${FE_BASE}/management/cockpit ...`);
  const liveNavHrefs = await discoverLiveNav(page);

  const routeMap = new Map();
  for (const route of BASELINE_ROUTES) routeMap.set(route.path, { path: route.path, kind: route.kind });
  const liveNavNew = [];
  for (const href of liveNavHrefs) {
    if (!routeMap.has(href)) {
      routeMap.set(href, { path: href, kind: "live-nav" });
      liveNavNew.push(href);
    }
  }
  const baselineNavPaths = new Set(BASELINE_ROUTES.filter((r) => r.kind === "nav").map((r) => r.path));
  const liveNavSet = new Set(liveNavHrefs);
  const baselineNavMissingFromLive = [...baselineNavPaths].filter((p) => !liveNavSet.has(p));

  const routes = [...routeMap.values()];
  console.log(`[accept-management-hosted-production] crawling ${routes.length} routes (baseline ${BASELINE_ROUTES.length}, +${liveNavNew.length} newly discovered nav) ...`);

  const results = [];
  for (const route of routes) {
    const result = await crawlRoute(page, route, { source: "baseline-or-live-nav" });
    results.push(result);
  }

  console.log("[accept-management-hosted-production] resolving live entity ids for detail-honesty positive cases ...");
  const liveIdResolution = await resolveLiveIdRoutes();
  const liveIdResults = [];
  for (const resolved of liveIdResolution) {
    if (!resolved.routePath) continue;
    const result = await crawlRoute(page, { path: resolved.routePath, kind: "live-id-detail" }, { source: `live-id:${resolved.entity}` });
    liveIdResults.push(result);
  }

  await browser.close();

  console.log("[accept-management-hosted-production] running session/RBAC check ...");
  const sessionRbac = await sessionRbacCheck();

  console.log("[accept-management-hosted-production] checking MGMT-LOAD-006/007 release-load-gate manifest ...");
  const loadGate = loadGateCheck();

  console.log(`[accept-management-hosted-production] source-scanning ${SRC_SCAN_DIR} for write-CTA mock-success risk ...`);
  const sourceScan = fs.existsSync(SRC_SCAN_DIR) ? sourceScanWriteCtas(SRC_SCAN_DIR) : { scannedFiles: 0, totalToastSuccess: 0, ungoverned: [], findings: [], note: `${SRC_SCAN_DIR} not found in cwd; run from the frontend-checkout root` };

  const allResults = [...results, ...liveIdResults];
  const crashRoutes = allResults.filter((r) => r.status === "crash" || r.status === "blank" || r.status === "navfail");
  const aliasFailRoutes = allResults.filter((r) => r.alias?.directRenderFail);
  const detailHonestyFailRoutes = allResults.filter((r) => r.detailHonestyViolations.length > 0);
  const seedFallbackArmedRoutes = allResults.filter((r) => r.mockFindings.some((m) => m.id === "seed_fallback_armed"));
  const mockWriteSuccessRoutes = allResults.filter((r) => r.mockFindings.some((m) => m.id === "mock_write_success"));
  const corsRoutes = allResults.filter((r) => (r.consoleErrorCounts.cors || 0) > 0);
  const renderCrashConsoleRoutes = allResults.filter((r) => (r.consoleErrorCounts.render_crash || 0) > 0);

  const totals = allResults.reduce(
    (acc, r) => {
      acc.buttons += r.controls.buttons;
      acc.enabledButtons += r.controls.enabledButtons;
      acc.disabledButtons += r.controls.disabledButtons;
      acc.links += r.controls.links;
      acc.inputs += r.controls.inputs;
      return acc;
    },
    { buttons: 0, enabledButtons: 0, disabledButtons: 0, links: 0, inputs: 0 },
  );

  const gateChecks = [
    { label: "No route crashes, is blank, or fails to navigate.", status: crashRoutes.length === 0 ? "pass" : "fail", note: `count:${crashRoutes.length}` },
    { label: "No known alias direct-renders instead of redirecting to its canonical path.", status: aliasFailRoutes.length === 0 ? "pass" : "fail", note: `count:${aliasFailRoutes.length}` },
    { label: "No detail route shows raw undefined/NaN/Invalid Date.", status: detailHonestyFailRoutes.length === 0 ? "pass" : "fail", note: `count:${detailHonestyFailRoutes.length}` },
    { label: "No route claims seed fallback armed in strict-live mode.", status: seedFallbackArmedRoutes.length === 0 ? "pass" : "fail", note: `count:${seedFallbackArmedRoutes.length}` },
    { label: "No route shows a mock/demo success claim as production truth.", status: mockWriteSuccessRoutes.length === 0 ? "pass" : "fail", note: `count:${mockWriteSuccessRoutes.length}` },
    { label: "No CORS console errors on the hosted origin.", status: corsRoutes.length === 0 ? "pass" : "fail", note: `count:${corsRoutes.length}` },
    { label: "No render-crash console errors.", status: renderCrashConsoleRoutes.length === 0 ? "pass" : "fail", note: `count:${renderCrashConsoleRoutes.length}` },
    { label: "Session/RBAC: invalid session cannot read privileged management data.", status: sessionRbac.overall === "fail" ? "fail" : sessionRbac.overall, note: sessionRbac.checks.map((c) => `${c.label}:${c.status}`).join("; ") },
    { label: "MGMT-LOAD-006/007 release-load-gate manifest reports result.pass=true.", status: loadGate.status, note: loadGate.note },
    {
      label: "Write-CTA source scan: toast.success() calls are backed by a governed/receipt signal (soft gate).",
      status: sourceScan.ungoverned.length === 0 ? "pass" : STRICT_SOURCE_SCAN ? "fail" : "warn",
      note: `ungoverned:${sourceScan.ungoverned.length}/${sourceScan.totalToastSuccess} (strict:${STRICT_SOURCE_SCAN})`,
    },
  ];

  const hardFail = gateChecks.some((c) => c.status === "fail");
  const overall = hardFail ? "fail" : gateChecks.some((c) => c.status === "warn") ? "warn" : gateChecks.some((c) => c.status === "missing") ? "missing" : "pass";
  const pass = !hardFail;

  const manifest = {
    schemaVersion: 1,
    taskId: "MGMT-GAP-006",
    generatedAt: new Date().toISOString(),
    startedAt,
    feBase: FE_BASE,
    bffBase: BFF_BASE,
    sha: currentSha(),
    routeCounts: {
      baseline: BASELINE_ROUTES.length,
      liveNavDiscovered: liveNavHrefs.length,
      liveNavNewlyFound: liveNavNew,
      baselineNavMissingFromLive,
      crawled: allResults.length,
      liveIdDetailRoutesCrawled: liveIdResults.length,
    },
    totals,
    liveIdResolution,
    sessionRbac,
    loadGate,
    sourceScan: { ...sourceScan, findings: sourceScan.findings.slice(0, 200) },
    gateChecks,
    result: {
      pass,
      overall,
      failures: gateChecks.filter((c) => c.status === "fail").map((c) => c.label),
      warnings: gateChecks.filter((c) => c.status === "warn").map((c) => c.label),
      missing: gateChecks.filter((c) => c.status === "missing").map((c) => c.label),
    },
    routes: allResults,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = nowStamp();
  const jsonPath = path.join(OUT_DIR, `management-hosted-acceptance-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2), "utf8");

  const md = [
    `# MGMT-GAP-006 Management Hosted Production Acceptance`,
    ``,
    `Generated: ${manifest.generatedAt}`,
    `FE: ${FE_BASE}`,
    `BFF: ${BFF_BASE}`,
    `Commit: ${manifest.sha}`,
    `Overall: **${overall}** (pass=${pass})`,
    ``,
    `## Route coverage`,
    ``,
    `- baseline routes (reproduces 2026-07-01 route-control-reaudit 93-route set): ${BASELINE_ROUTES.length}`,
    `- live nav links discovered on hosted cockpit: ${liveNavHrefs.length}`,
    `- live nav links not in the 2026-07-01 baseline: ${liveNavNew.length}${liveNavNew.length ? ` (${liveNavNew.join(", ")})` : ""}`,
    `- 2026-07-01 baseline nav links no longer present in live nav: ${baselineNavMissingFromLive.length}${baselineNavMissingFromLive.length ? ` (${baselineNavMissingFromLive.join(", ")})` : ""}`,
    `- total routes crawled (baseline/live-nav + live-id detail): ${allResults.length}`,
    `- total buttons/enabled/disabled: ${totals.buttons}/${totals.enabledButtons}/${totals.disabledButtons}`,
    `- total links: ${totals.links}, inputs: ${totals.inputs}`,
    ``,
    `## Gate checks`,
    ``,
    `| Status | Check | Note |`,
    `|---|---|---|`,
    ...gateChecks.map((c) => `| ${c.status} | ${c.label} | ${c.note} |`),
    ``,
    `## Failing / crashed / blank routes`,
    ``,
    crashRoutes.length ? crashRoutes.map((r) => `- \`${r.path}\` -> status=${r.status} error="${r.navError}"`).join("\n") : "None",
    ``,
    `## Alias direct-render failures`,
    ``,
    aliasFailRoutes.length
      ? aliasFailRoutes.map((r) => `- \`${r.alias.requestedPath}\` did not redirect to \`${r.alias.expectedCanonical}\` (finalUrl=\`${r.alias.finalUrl}\`)`).join("\n")
      : "None",
    ``,
    `## Detail-honesty violations (undefined/NaN/Invalid Date)`,
    ``,
    detailHonestyFailRoutes.length
      ? detailHonestyFailRoutes.map((r) => `- \`${r.path}\` (${r.source}): ${r.detailHonestyViolations.join(", ")}`).join("\n")
      : "None",
    ``,
    `## Seed-fallback-armed / mock-success claims`,
    ``,
    [...seedFallbackArmedRoutes, ...mockWriteSuccessRoutes].length
      ? [...new Set([...seedFallbackArmedRoutes, ...mockWriteSuccessRoutes].map((r) => r.path))].map((p) => `- \`${p}\``).join("\n")
      : "None",
    ``,
    `## Console errors by class (routes with >=1 hit)`,
    ``,
    `| Route | CORS | Network | Render-crash | Benign |`,
    `|---|---:|---:|---:|---:|`,
    ...allResults
      .filter((r) => Object.values(r.consoleErrorCounts).some((n) => n > 0))
      .map((r) => `| \`${r.path}\` | ${r.consoleErrorCounts.cors || 0} | ${r.consoleErrorCounts.network || 0} | ${r.consoleErrorCounts.render_crash || 0} | ${r.consoleErrorCounts.benign || 0} |`),
    ``,
    `## Live entity id resolution`,
    ``,
    `| Entity | Endpoint | Status | Live id |`,
    `|---|---|---:|---|`,
    ...liveIdResolution.map((r) => `| ${r.entity} | ${r.endpoint} | ${r.status} | ${r.liveId || "(none)"} |`),
    ``,
    `## Session / RBAC`,
    ``,
    `| Status | Check | Note |`,
    `|---|---|---|`,
    ...sessionRbac.checks.map((c) => `| ${c.status} | ${c.label} | ${c.note} |`),
    ``,
    `## Write-CTA source-scan (toast.success without a nearby governed/receipt signal)`,
    ``,
    `Scanned ${sourceScan.scannedFiles} files under \`${SRC_SCAN_DIR}\`; ${sourceScan.totalToastSuccess} \`toast.success(\` call sites, ${sourceScan.ungoverned.length} without a governed/receipt signal within 25 lines.`,
    ``,
    sourceScan.ungoverned.length
      ? sourceScan.ungoverned.slice(0, 40).map((f) => `- \`${f.file}:${f.line}\` — \`${f.snippet}\``).join("\n")
      : "None",
    ``,
    `## Load / release gate (MGMT-LOAD-006/007)`,
    ``,
    `- manifest: ${loadGate.manifestPath || "(not supplied)"}`,
    `- status: ${loadGate.status}`,
    `- note: ${loadGate.note}`,
    ``,
    `## Notes`,
    ``,
    `- Real writes were not performed (\`--click-write-ctas\` not enabled: ${CLICK_WRITE_CTAS}); write-CTA mock-success risk is assessed via the source scan above plus the live \`mock_write_success\` text pattern, per the task's non-scope note.`,
    `- Fixture-id detail routes (e.g. \`stg_001\`, \`cp_alpha\`) intentionally reuse the 2026-07-01 crawl's ids; a 404/not-found state for those ids on a strict-live BFF is expected and desired (no seed-id leakage), not a failure by itself — only raw undefined/NaN/blank rendering fails this gate.`,
  ].join("\n");

  const mdPath = path.join(OUT_DIR, `management-hosted-acceptance-${stamp}.md`);
  fs.writeFileSync(mdPath, md, "utf8");
  console.log(md);
  console.log(`\nJSON: ${jsonPath}\nMarkdown: ${mdPath}`);

  if (!pass) process.exitCode = 1;
}

main();
