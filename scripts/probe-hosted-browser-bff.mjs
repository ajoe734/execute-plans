#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { normalizeOptionalBearerToken } from "./lib/bearer-token.mjs";

const FE_BASE = trimTrailingSlash(process.env.PANTHEON_FE_BASE_URL || "https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io");
const UPSTREAM_BFF_BASE = trimTrailingSlash(process.env.PANTHEON_BFF_BASE_URL || "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io");
const BFF_BASE = trimTrailingSlash(process.env.PANTHEON_BROWSER_BFF_BASE_URL || UPSTREAM_BFF_BASE);
const BFF_TARGET = new URL(BFF_BASE);
const OLD_BFF_URL = normalizeOldBffUrl(process.env.PANTHEON_OLD_BFF_URL || "https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io");
const FE_PATH = normalizePath(process.env.PANTHEON_HOSTED_PROBE_PATH || "/management/persona-fleet");
const BROWSER_AUTH_TOKEN = normalizeOptionalBearerToken(
  process.env.PANTHEON_HOSTED_BROWSER_BEARER_TOKEN
    || process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN
    || "",
  "Hosted browser probe credential",
);
const BROWSER_TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "pantheon-dev";
const OUT_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || ".lovable/audits";
const OVERALL_TIMEOUT_MS = 90_000;
const OPTIONAL_CORE_TIMEOUT_MS = 5_000;
const NAVIGATION_WAIT_UNTIL = "domcontentloaded";
const REQUIRED_CORE_BFF_PATHS = parsePathList(process.env.PANTHEON_HOSTED_REQUIRED_BFF_PATHS, [
  "/health",
]);
const OPTIONAL_CORE_BFF_PATHS = ["/bff/me"];
const CORE_BFF_PATHS = [...OPTIONAL_CORE_BFF_PATHS, ...REQUIRED_CORE_BFF_PATHS];
const probeStartedAt = Date.now();

if (FE_PATH.includes("persona-fleet") && !BROWSER_AUTH_TOKEN) {
  console.error(
    "PANTHEON_HOSTED_BROWSER_BEARER_TOKEN is required for the authenticated Persona Fleet browser probe",
  );
  process.exit(2);
}
if (/^op-fe-gate:/u.test(BROWSER_AUTH_TOKEN)) {
  console.error("Tracked local fixture credentials are forbidden for the hosted browser probe");
  process.exit(2);
}

function currentSha() {
  const fromEnv =
    process.env.PANTHEON_PROBE_NOCACHE_SHA ||
    process.env.GITHUB_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 40);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
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
  return value.replace(/\/+$/, "");
}

function normalizeOldBffUrl(value) {
  const clean = trimTrailingSlash(value.trim());
  return clean && clean !== BFF_BASE ? clean : "";
}

function normalizePath(value) {
  const clean = String(value || "").trim();
  if (!clean) return "/";
  return clean.startsWith("/") ? clean : `/${clean}`;
}

function parsePathList(value, fallback) {
  if (!value) return fallback;
  const parsed = value
    .split(",")
    .map(normalizePath)
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function matchesUrlNeedle(url, needle) {
  if (!needle) return false;
  const cleanNeedle = trimTrailingSlash(needle.trim());
  if (!cleanNeedle) return false;
  return cleanNeedle.startsWith("http") ? url.startsWith(cleanNeedle) : url.includes(cleanNeedle);
}

function pathnameOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function isBffUrl(url) {
  let candidate;
  try {
    candidate = new URL(url);
  } catch {
    return false;
  }
  if (candidate.origin !== BFF_TARGET.origin) return false;
  const pathname = candidate.pathname;
  return pathname.startsWith("/bff/") || ["/health", "/healthz", "/readyz", "/openapi.json"].includes(pathname);
}

function isCoreBffResponse(res, expectedPath) {
  const url = res.url();
  return isBffUrl(url) && pathnameOf(url) === expectedPath && res.request().method() === "GET";
}

function isAcceptableCoreStatus(response) {
  if (response.path === "/bff/me") return response.status >= 200 && response.status < 500;
  return response.status >= 200 && response.status < 400;
}

function isRequiredCorePath(pathname) {
  return REQUIRED_CORE_BFF_PATHS.includes(pathname);
}

function remainingTimeoutMs() {
  return Math.max(1, OVERALL_TIMEOUT_MS - (Date.now() - probeStartedAt));
}

async function waitForCoreBffResponse(page, expectedPath, timeoutMs = remainingTimeoutMs()) {
  try {
    const res = await page.waitForResponse(res => isCoreBffResponse(res, expectedPath), {
      timeout: Math.min(timeoutMs, remainingTimeoutMs()),
    });
    return {
      path: expectedPath,
      status: res.status(),
      method: res.request().method(),
      url: res.url(),
      error: "",
    };
  } catch (err) {
    return {
      path: expectedPath,
      status: 0,
      method: "GET",
      url: "",
      error: String(err).replace(/\s+/g, " ").slice(0, 240),
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
  return count ? [{ source: label, url: needle, count }] : [];
}

let chromium;
try {
  ({ chromium } = await import("@playwright/test"));
} catch {
  console.error("Missing @playwright/test. Install with: npm install -D @playwright/test && npx playwright install chromium");
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(OVERALL_TIMEOUT_MS);
page.setDefaultNavigationTimeout(OVERALL_TIMEOUT_MS);
if (BROWSER_AUTH_TOKEN) {
  await page.addInitScript(
    ({ tenantId, token }) => {
      window.sessionStorage.setItem("pantheon.bff.bearerToken", token);
      window.sessionStorage.setItem("pantheon.bff.tenantId", tenantId);
    },
    { tenantId: BROWSER_TENANT_ID, token: BROWSER_AUTH_TOKEN },
  );
}

const requests = [];
const responses = [];
const failed = [];
const oldUrlHits = [];
const consoleErrors = [];
const pageErrors = [];
const coreResponses = [];
let html = "";
let bundleText = "";
let personaFleetChecks = null;
let rootChecks = null;
const bundleFetches = [];

page.on("request", req => {
  const url = req.url();
  if (isBffUrl(url)) requests.push({ method: req.method(), url });
  if (matchesUrlNeedle(url, OLD_BFF_URL)) oldUrlHits.push({ source: "request", method: req.method(), url });
});
page.on("response", res => {
  const url = res.url();
  if (isBffUrl(url)) responses.push({ status: res.status(), method: res.request().method(), url });
  if (matchesUrlNeedle(url, OLD_BFF_URL)) oldUrlHits.push({ source: "response", status: res.status(), method: res.request().method(), url });
});
page.on("requestfailed", req => {
  const url = req.url();
  if (isBffUrl(url)) failed.push({ method: req.method(), url, failure: req.failure()?.errorText });
  if (matchesUrlNeedle(url, OLD_BFF_URL)) oldUrlHits.push({ source: "failed", method: req.method(), url, failure: req.failure()?.errorText });
});
page.on("console", msg => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", error => {
  pageErrors.push(error.message);
});

const pageUrl = withNoCache(`${FE_BASE}${FE_PATH}`);
try {
  const requiredCoreResponsePromises = REQUIRED_CORE_BFF_PATHS.map(expectedPath =>
    waitForCoreBffResponse(page, expectedPath)
  );
  const optionalCoreResponsePromises = OPTIONAL_CORE_BFF_PATHS.map(expectedPath =>
    waitForCoreBffResponse(page, expectedPath, OPTIONAL_CORE_TIMEOUT_MS)
  );

  await page.goto(pageUrl, { waitUntil: NAVIGATION_WAIT_UNTIL, timeout: remainingTimeoutMs() });
  await page.waitForFunction(() => {
    const root = document.querySelector("#root");
    return Boolean(root && (root.childElementCount > 0 || root.textContent?.trim()));
  }, undefined, { timeout: Math.min(10_000, remainingTimeoutMs()) }).catch(() => {});
  rootChecks = await page.evaluate(() => {
    const root = document.querySelector("#root");
    return {
      bodyTextLength: (document.body.innerText || "").trim().length,
      childElementCount: root?.childElementCount ?? 0,
      rootTextLength: (root?.textContent || "").trim().length,
    };
  });
  coreResponses.push(...await Promise.all(optionalCoreResponsePromises));
  coreResponses.push(...await Promise.all(requiredCoreResponsePromises));

  if (FE_PATH.includes("persona-fleet")) {
    await page.waitForFunction(() => {
      const text = document.body.innerText || "";
      const rowCount = Array.from(document.querySelectorAll("tbody tr"))
        .map((tr) => (tr.textContent || "").trim())
        .filter(Boolean).length;
      return rowCount > 0 || /Live Persona Fleet data unavailable|目前沒有 live Persona Fleet 資料|seed fallback armed|fallback standby|NaN/i.test(text);
    }, undefined, { timeout: Math.min(15_000, remainingTimeoutMs()) }).catch(() => {});

    personaFleetChecks = await page.evaluate(() => {
      const text = document.body.innerText || "";
      const rows = Array.from(document.querySelectorAll("tbody tr"))
        .map((tr) => (tr.textContent || "").trim())
        .filter(Boolean);
      const hasNaN = /NaN/.test(text);
      const hasSeedFallbackArmed = /seed fallback armed/i.test(text);
      const hasFallbackStandby = /fallback standby/i.test(text);
      const hasLiveEmptyState = /Live Persona Fleet data unavailable|目前沒有 live Persona Fleet 資料/i.test(text);
      const requiredPersonaCoverage = {
        crypto: rows.some((row) => /\bcrypto\b/i.test(row)),
        twEquity: rows.some((row) => /\b(?:tw|taiwan)\b[^\n]*\bequity\b/i.test(row)),
        usEquity: rows.some((row) => /\b(?:us|u\.s\.)\b[^\n]*\bequity\b/i.test(row)),
      };
      const hasRequiredPersonaCoverage = Object.values(requiredPersonaCoverage).every(Boolean);
      const requiredSourceEvidence = {
        qlib: /\bqlib\b/i.test(text),
        shioaji: /\bshioaji\b/i.test(text),
      };
      const hasRequiredSourceEvidence = Object.values(requiredSourceEvidence).every(Boolean);
      const hasNonProductionRows = [
        /persona-crypto/i,
        /persona-us-equity/i,
        /persona-tw-equity/i,
        /Deploy Smoke Persona/i,
        /dry-run-write-probe/i,
      ].some((pattern) => pattern.test(text));
      return {
        rowCount: rows.length,
        hasNaN,
        hasSeedFallbackArmed,
        hasFallbackStandby,
        hasLiveEmptyState,
        hasNonProductionRows,
        hasRequiredPersonaCoverage,
        hasRequiredSourceEvidence,
        requiredPersonaCoverage,
        requiredSourceEvidence,
        rowsValid: rows.length >= 3
          && hasRequiredPersonaCoverage
          && hasRequiredSourceEvidence
          && !hasNaN
          && !hasNonProductionRows,
        liveBannerValid: !hasSeedFallbackArmed,
      };
    }).catch(() => ({
      rowCount: 0,
      hasNaN: false,
      hasSeedFallbackArmed: false,
      hasFallbackStandby: false,
      hasLiveEmptyState: false,
      hasNonProductionRows: false,
      hasRequiredPersonaCoverage: false,
      hasRequiredSourceEvidence: false,
      requiredPersonaCoverage: { crypto: false, twEquity: false, usEquity: false },
      requiredSourceEvidence: { qlib: false, shioaji: false },
      rowsValid: false,
      liveBannerValid: false,
    }));
  }

  html = await page.content();
  const scripts = await page.locator("script[src]").evaluateAll(nodes => nodes.map(n => n.src));
  for (const s of scripts) {
    if (remainingTimeoutMs() <= 1) break;
    try {
      const fetchedUrl = withNoCache(s);
      const res = await fetch(fetchedUrl, { signal: AbortSignal.timeout(remainingTimeoutMs()) });
      bundleFetches.push({ source: s, fetched: fetchedUrl, status: res.status });
      bundleText += await res.text();
    } catch {}
  }
} finally {
  await browser.close();
}

const containsBffStatic = bundleText.includes(BFF_BASE) || html.includes(BFF_BASE);
const observedIntendedBff =
  requests.some((request) => isBffUrl(request.url)) ||
  responses.some((response) => isBffUrl(response.url)) ||
  coreResponses.some((response) => response.url && isBffUrl(response.url));
const usesIntendedBff = containsBffStatic || observedIntendedBff;
const containsOld = Boolean(OLD_BFF_URL) && (bundleText.includes(OLD_BFF_URL) || html.includes(OLD_BFF_URL));
oldUrlHits.push(...textHits("html", html, OLD_BFF_URL));
oldUrlHits.push(...textHits("bundle", bundleText, OLD_BFF_URL));
const oldUrlHitCount = oldUrlHits.reduce((total, hit) => total + (hit.count ?? 1), 0);
const requiredCoreResponseOk =
  REQUIRED_CORE_BFF_PATHS.every(expectedPath =>
    coreResponses.some(response => response.path === expectedPath && isAcceptableCoreStatus(response))
  );
const personaFleetResponseOk = !personaFleetChecks || responses.some((response) =>
  pathnameOf(response.url) === "/bff/management/persona-fleet"
  && response.status >= 200
  && response.status < 300
);
const personaFleetOk = !personaFleetChecks || (
  personaFleetChecks.rowsValid
  && personaFleetChecks.liveBannerValid
  && personaFleetResponseOk
);
const optionalCoreResponsesObserved =
  OPTIONAL_CORE_BFF_PATHS.every(expectedPath =>
    coreResponses.some(response => response.path === expectedPath && isAcceptableCoreStatus(response))
  );
const rootRendered = Boolean(
  rootChecks
  && rootChecks.bodyTextLength > 0
  && (rootChecks.childElementCount > 0 || rootChecks.rootTextLength > 0),
);
const pass = usesIntendedBff
  && requiredCoreResponseOk
  && personaFleetOk
  && rootRendered
  && pageErrors.length === 0
  && oldUrlHitCount === 0
  && requests.length > 0
  && failed.length === 0;

const now = new Date().toISOString().slice(0, 10);
const md = [
  `# Frontend Browser BFF Probe`,
  ``,
  `Date: ${new Date().toISOString()}`,
  `FE: ${FE_BASE}`,
  `Page URL: ${pageUrl}`,
  `BFF: ${BFF_BASE}`,
  `Upstream BFF: ${UPSTREAM_BFF_BASE}`,
  `Old BFF: ${OLD_BFF_URL || "(disabled)"}`,
  `nocache: ${NOCACHE_SHA}`,
  `timeout ms: ${OVERALL_TIMEOUT_MS}`,
  `navigation waitUntil: ${NAVIGATION_WAIT_UNTIL}`,
  `core waitForResponse paths: ${CORE_BFF_PATHS.join(", ")}`,
  `required core waitForResponse paths: ${REQUIRED_CORE_BFF_PATHS.join(", ")}`,
  `optional core waitForResponse paths: ${OPTIONAL_CORE_BFF_PATHS.join(", ")}`,
  ``,
  `## Summary`,
  ``,
  `- contains intended BFF URL: ${usesIntendedBff}`,
  `- contains intended BFF URL in html/bundle: ${containsBffStatic}`,
  `- intended BFF runtime request count: ${requests.length}`,
  `- contains old BFF URL: ${containsOld}`,
  `- old BFF URL hit count: ${oldUrlHitCount}`,
  `- required core BFF responses complete: ${requiredCoreResponseOk}`,
  `- optional core BFF responses observed: ${optionalCoreResponsesObserved}`,
  `- root rendered: ${rootRendered}`,
  `- root child element count: ${rootChecks?.childElementCount ?? 0}`,
  `- root text length: ${rootChecks?.rootTextLength ?? 0}`,
  `- body text length: ${rootChecks?.bodyTextLength ?? 0}`,
  `- page error count: ${pageErrors.length}`,
  ...(personaFleetChecks ? [
    `- persona fleet row count: ${personaFleetChecks.rowCount}`,
    `- persona fleet has NaN: ${personaFleetChecks.hasNaN}`,
    `- persona fleet has live empty state: ${personaFleetChecks.hasLiveEmptyState}`,
    `- persona fleet has non-production rows: ${personaFleetChecks.hasNonProductionRows}`,
    `- persona fleet required persona coverage: ${personaFleetChecks.hasRequiredPersonaCoverage}`,
    `- persona fleet required source evidence: ${personaFleetChecks.hasRequiredSourceEvidence}`,
    `- persona fleet BFF response accepted: ${personaFleetResponseOk}`,
    `- persona fleet seed fallback armed: ${personaFleetChecks.hasSeedFallbackArmed}`,
    `- persona fleet fallback standby: ${personaFleetChecks.hasFallbackStandby}`,
    `- persona fleet rows valid: ${personaFleetChecks.rowsValid}`,
    `- persona fleet live banner valid: ${personaFleetChecks.liveBannerValid}`,
  ] : []),
  `- request count: ${requests.length}`,
  `- response count: ${responses.length}`,
  `- failed count: ${failed.length}`,
  `- pass: ${pass}`,
  ``,
  `## Core BFF responses`,
  ``,
  `| Status | Method | Path | Required | Accepted | URL / Error |`,
  `|---:|---|---|---|---|---|`,
  ...coreResponses.map(r => `| ${r.status} | ${r.method} | ${r.path} | ${isRequiredCorePath(r.path)} | ${isAcceptableCoreStatus(r)} | ${r.url ? r.url.replace(BFF_BASE, "") : r.error} |`),
  ``,
  `## Bundle fetches`,
  ``,
  `| Status | Source | Fetched |`,
  `|---:|---|---|`,
  ...bundleFetches.map(r => `| ${r.status} | ${r.source} | ${r.fetched} |`),
  ``,
  `## Old URL hits`,
  ``,
  oldUrlHits.length
    ? oldUrlHits.map(h => `- ${h.source}${h.method ? ` ${h.method}` : ""}${h.status ? ` ${h.status}` : ""}${h.count ? ` count=${h.count}` : ""}: ${h.url}`).join("\n")
    : "None",
  ``,
  `## Responses`,
  ``,
  `| Status | Method | URL |`,
  `|---:|---|---|`,
  ...responses.map(r => `| ${r.status} | ${r.method} | ${r.url.replace(BFF_BASE, "")} |`),
  ``,
  `## Failed`,
  ``,
  failed.length ? failed.map(f => `- ${f.method} ${f.url}: ${f.failure}`).join("\n") : "None",
  ``,
  `## Console errors`,
  ``,
  consoleErrors.length ? consoleErrors.slice(0, 20).map(e => `- ${e}`).join("\n") : "None",
  ``,
  `## Page errors`,
  ``,
  pageErrors.length ? pageErrors.slice(0, 20).map(e => `- ${e}`).join("\n") : "None",
].join("\n");

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `hosted-browser-bff-probe-${now}.md`);
fs.writeFileSync(out, md, "utf8");
console.log(md);
if (!pass) process.exitCode = 1;
