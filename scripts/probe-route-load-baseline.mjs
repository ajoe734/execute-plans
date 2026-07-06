#!/usr/bin/env node
// MGMT-LOAD-001: hosted browser route-load baseline probe.
//
// Measures /management/evidence readiness using content milestones
// (document load, shell mount, heading visible, primary Evidence API
// completion, first row/empty-state visible) instead of Playwright
// `networkidle`, because the platform shell opens a long-lived SSE
// connection (`/bff/events/stream`) on mount and `networkidle` never
// resolves for that page shape. See
// docs/04/pantheon_management_console_load_gap_2026-07-01/MANAGEMENT_CONSOLE_LOAD_GAP_SPEC.md
// section 2.6 and 4.5.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FE_BASE = trimTrailingSlash(process.env.PANTHEON_FE_BASE_URL || "https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io");
const BFF_BASE = trimTrailingSlash(process.env.PANTHEON_BFF_BASE_URL || "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io");
const ROUTE_PATH = normalizePath(process.env.PANTHEON_ROUTE_LOAD_PROBE_PATH || "/management/evidence");
const PRIMARY_API_PATH = process.env.PANTHEON_ROUTE_LOAD_PRIMARY_API_PATH || "/bff/management/evidence";
const OUT_DIR = process.env.PANTHEON_LOAD_BASELINE_OUT_DIR || ".lovable/audits";
const OVERALL_TIMEOUT_MS = 30_000;
const CONTENT_TIMEOUT_MS = 15_000;
const NAVIGATION_WAIT_UNTIL = "domcontentloaded";
const SSE_PATH = "/bff/events/stream";
const BEARER_TOKEN = process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN || process.env.BFF_AUTH_TOKEN || "";

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizePath(value) {
  const clean = String(value || "").trim();
  if (!clean) return "/";
  return clean.startsWith("/") ? clean : `/${clean}`;
}

function currentSha() {
  const fromEnv = process.env.PANTHEON_PROBE_NOCACHE_SHA || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 40);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return Date.now().toString(36);
  }
}

function tokenShape(token) {
  if (!token) return "(none — anonymous probe)";
  const colonIndex = token.indexOf(":");
  if (colonIndex === -1) return "opaque-token (shape redacted)";
  return `op-<id>:${token.slice(colonIndex + 1)} (dev stub-auth shape; not a production secret)`;
}

function pathnameOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function isBffUrl(url) {
  return url.startsWith(BFF_BASE);
}

let chromium;
try {
  ({ chromium } = await import("@playwright/test"));
} catch {
  console.error("Missing @playwright/test. Install with: npm install -D @playwright/test && npx playwright install chromium");
  process.exit(2);
}

const FE_COMMIT = currentSha();
const probeTimestamp = new Date().toISOString();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(OVERALL_TIMEOUT_MS);
page.setDefaultNavigationTimeout(OVERALL_TIMEOUT_MS);

const waterfall = [];
const requestStart = new Map();
let navStartMs = 0;

page.on("request", (req) => {
  requestStart.set(req, Date.now());
  const url = req.url();
  if (pathnameOf(url) === SSE_PATH) {
    // Long-lived stream: record that it opened, but never wait on it and
    // never treat its lifecycle as part of route readiness.
    waterfall.push({
      method: req.method(),
      url,
      path: SSE_PATH,
      status: null,
      startMs: (requestStart.get(req) ?? Date.now()) - navStartMs,
      endMs: null,
      durationMs: null,
      note: "realtime SSE stream; excluded from readiness milestones",
    });
  }
});
// Use the `response` event (fires as soon as headers arrive) rather than
// `requestfinished` + `req.response()`, which can race the browser.close()
// in the `finally` block once the readiness locator resolves.
page.on("response", (res) => {
  const req = res.request();
  const url = res.url();
  if (!isBffUrl(url) && !url.startsWith(FE_BASE)) return;
  const pathname = pathnameOf(url);
  if (pathname === SSE_PATH) return; // already recorded on request
  const started = requestStart.get(req) ?? Date.now();
  const finished = Date.now();
  waterfall.push({
    method: req.method(),
    url,
    path: pathname,
    status: res.status(),
    startMs: started - navStartMs,
    endMs: finished - navStartMs,
    durationMs: finished - started,
  });
});
page.on("requestfailed", (req) => {
  const url = req.url();
  if (!isBffUrl(url) && !url.startsWith(FE_BASE)) return;
  const pathname = pathnameOf(url);
  if (pathname === SSE_PATH) return;
  const started = requestStart.get(req) ?? Date.now();
  waterfall.push({
    method: req.method(),
    url,
    path: pathname,
    status: "ERR",
    startMs: started - navStartMs,
    endMs: Date.now() - navStartMs,
    durationMs: Date.now() - started,
    error: req.failure()?.errorText,
  });
});

const milestones = {
  navigationStartMs: 0,
  domContentLoadedMs: null,
  shellVisibleMs: null,
  headingVisibleMs: null,
  primaryApiCompleteMs: null,
  firstRowOrEmptyVisibleMs: null,
};
let error = null;

try {
  navStartMs = Date.now();
  const primaryApiPromise = page
    .waitForResponse(
      (res) => pathnameOf(res.url()) === PRIMARY_API_PATH && res.request().method() === "GET",
      { timeout: CONTENT_TIMEOUT_MS },
    )
    .then((res) => {
      milestones.primaryApiCompleteMs = Date.now() - navStartMs;
      return res;
    })
    .catch(() => null);

  await page.goto(`${FE_BASE}${ROUTE_PATH}`, { waitUntil: NAVIGATION_WAIT_UNTIL, timeout: OVERALL_TIMEOUT_MS });
  milestones.domContentLoadedMs = Date.now() - navStartMs;

  await page.locator("#root").waitFor({ state: "attached", timeout: CONTENT_TIMEOUT_MS });
  milestones.shellVisibleMs = Date.now() - navStartMs;

  await page.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible", timeout: CONTENT_TIMEOUT_MS });
  milestones.headingVisibleMs = Date.now() - navStartMs;

  await primaryApiPromise;

  await page.waitForFunction(
    () => {
      const readyMarker = [
        '[data-testid="evidence-route-row"]',
        '[data-testid="evidence-route-empty"]',
        '[data-testid="evidence-route-unavailable"]',
      ].some((selector) => document.querySelector(selector));
      const rowCount = document.querySelectorAll("tbody tr").length;
      const text = document.body.innerText || "";
      return readyMarker || rowCount > 0 || /no evidence|unavailable|暫無|無資料|不可用/i.test(text);
    },
    undefined,
    { timeout: CONTENT_TIMEOUT_MS },
  );
  milestones.firstRowOrEmptyVisibleMs = Date.now() - navStartMs;
} catch (err) {
  error = String(err).replace(/\s+/g, " ").slice(0, 400);
} finally {
  await browser.close();
}

const requestsBeforeFirstRow = milestones.firstRowOrEmptyVisibleMs === null
  ? waterfall.length
  : waterfall.filter((entry) => entry.startMs <= milestones.firstRowOrEmptyVisibleMs).length;

const usedNetworkidle = false; // structural guarantee: this probe never calls waitUntil: "networkidle"
const pass = !error
  && milestones.domContentLoadedMs !== null
  && milestones.headingVisibleMs !== null
  && milestones.primaryApiCompleteMs !== null
  && milestones.firstRowOrEmptyVisibleMs !== null
  && !usedNetworkidle;

const routeTiming = {
  probe: "MGMT-LOAD-001 hosted route-load baseline",
  probeTimestamp,
  feBase: FE_BASE,
  feCommit: FE_COMMIT,
  bffBase: BFF_BASE,
  authTokenShape: tokenShape(BEARER_TOKEN),
  routePath: ROUTE_PATH,
  primaryApiPath: PRIMARY_API_PATH,
  navigationWaitUntil: NAVIGATION_WAIT_UNTIL,
  usedNetworkidle,
  milestones,
  requestsBeforeFirstRow,
  totalBffOrFeRequests: waterfall.length,
  error,
  pass,
};

const now = new Date().toISOString().slice(0, 10);
fs.mkdirSync(OUT_DIR, { recursive: true });

const timingOut = path.join(OUT_DIR, `route-timing-${now}.json`);
fs.writeFileSync(timingOut, JSON.stringify(routeTiming, null, 2), "utf8");

const waterfallOut = path.join(OUT_DIR, `request-waterfall-${now}.json`);
fs.writeFileSync(waterfallOut, JSON.stringify(waterfall, null, 2), "utf8");

const md = [
  `# Management Console Route-Load Baseline — ${ROUTE_PATH}`,
  ``,
  `Date: ${probeTimestamp}`,
  `FE: ${FE_BASE}`,
  `FE commit: ${FE_COMMIT}`,
  `BFF: ${BFF_BASE}`,
  `Auth token shape: ${tokenShape(BEARER_TOKEN)}`,
  `Navigation waitUntil: ${NAVIGATION_WAIT_UNTIL} (never \`networkidle\` — the shell opens \`${SSE_PATH}\`, a long-lived SSE stream, so \`networkidle\` never resolves)`,
  ``,
  `## Milestones (ms since navigation start)`,
  ``,
  `| Milestone | ms |`,
  `|---|---:|`,
  `| domcontentloaded | ${milestones.domContentLoadedMs ?? "n/a"} |`,
  `| shell (#root) attached | ${milestones.shellVisibleMs ?? "n/a"} |`,
  `| route heading visible | ${milestones.headingVisibleMs ?? "n/a"} |`,
  `| primary Evidence API (\`${PRIMARY_API_PATH}\`) complete | ${milestones.primaryApiCompleteMs ?? "n/a"} |`,
  `| first row or empty-state visible | ${milestones.firstRowOrEmptyVisibleMs ?? "n/a"} |`,
  ``,
  `## Summary`,
  ``,
  `- non-primary/BFF+FE requests observed before first row: ${requestsBeforeFirstRow}`,
  `- total BFF/FE requests captured: ${waterfall.length}`,
  `- used \`networkidle\` as readiness signal: ${usedNetworkidle}`,
  `- error: ${error ?? "none"}`,
  `- pass: ${pass}`,
  ``,
  `## Request waterfall (BFF + FE document/asset requests)`,
  ``,
  `| Start ms | Duration ms | Status | Method | Path | Note |`,
  `|---:|---:|---|---|---|---|`,
  ...waterfall
    .slice()
    .sort((a, b) => a.startMs - b.startMs)
    .map((r) => `| ${r.startMs} | ${r.durationMs ?? "n/a"} | ${r.status ?? "n/a"} | ${r.method} | ${r.path} | ${r.note ?? r.error ?? ""} |`),
  ``,
  `Full JSON: \`${path.basename(timingOut)}\`, \`${path.basename(waterfallOut)}\``,
].join("\n");

const mdOut = path.join(OUT_DIR, `route-load-baseline-${now}.md`);
fs.writeFileSync(mdOut, md, "utf8");
console.log(md);
if (!pass) process.exitCode = 1;
