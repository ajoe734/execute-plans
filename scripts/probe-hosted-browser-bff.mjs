#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FE_BASE = trimTrailingSlash(process.env.PANTHEON_FE_BASE_URL || "https://pantheon-dev.lovable.app");
const BFF_BASE = trimTrailingSlash(process.env.PANTHEON_BFF_BASE_URL || "https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io");
const OLD_BFF_URL = trimTrailingSlash(process.env.PANTHEON_OLD_BFF_URL || "https://pantheon-dev-bff.35.236.178.81.sslip.io");
const OUT_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || ".lovable/audits";

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

function matchesUrlNeedle(url, needle) {
  if (!needle) return false;
  const cleanNeedle = trimTrailingSlash(needle.trim());
  if (!cleanNeedle) return false;
  return cleanNeedle.startsWith("http") ? url.startsWith(cleanNeedle) : url.includes(cleanNeedle);
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

const requests = [];
const responses = [];
const failed = [];
const oldUrlHits = [];
const consoleErrors = [];

page.on("request", req => {
  const url = req.url();
  if (url.startsWith(BFF_BASE)) requests.push({ method: req.method(), url });
  if (matchesUrlNeedle(url, OLD_BFF_URL)) oldUrlHits.push({ source: "request", method: req.method(), url });
});
page.on("response", res => {
  const url = res.url();
  if (url.startsWith(BFF_BASE)) responses.push({ status: res.status(), method: res.request().method(), url });
  if (matchesUrlNeedle(url, OLD_BFF_URL)) oldUrlHits.push({ source: "response", status: res.status(), method: res.request().method(), url });
});
page.on("requestfailed", req => {
  const url = req.url();
  if (url.startsWith(BFF_BASE)) failed.push({ method: req.method(), url, failure: req.failure()?.errorText });
  if (matchesUrlNeedle(url, OLD_BFF_URL)) oldUrlHits.push({ source: "failed", method: req.method(), url, failure: req.failure()?.errorText });
});
page.on("console", msg => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

const pageUrl = withNoCache(`${FE_BASE}/management`);
await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 60000 });
const html = await page.content();
const scripts = await page.locator("script[src]").evaluateAll(nodes => nodes.map(n => n.src));
let bundleText = "";
const bundleFetches = [];
for (const s of scripts) {
  try {
    const fetchedUrl = withNoCache(s);
    const res = await fetch(fetchedUrl);
    bundleFetches.push({ source: s, fetched: fetchedUrl, status: res.status });
    bundleText += await res.text();
  } catch {}
}

await browser.close();

const containsBff = bundleText.includes(BFF_BASE) || html.includes(BFF_BASE);
const containsOld = bundleText.includes(OLD_BFF_URL) || html.includes(OLD_BFF_URL);
oldUrlHits.push(...textHits("html", html, OLD_BFF_URL));
oldUrlHits.push(...textHits("bundle", bundleText, OLD_BFF_URL));
const oldUrlHitCount = oldUrlHits.reduce((total, hit) => total + (hit.count ?? 1), 0);
const pass = containsBff && oldUrlHitCount === 0 && requests.length > 0 && responses.length === requests.length && failed.length === 0;

const now = new Date().toISOString().slice(0, 10);
const md = [
  `# Hosted Browser BFF Probe`,
  ``,
  `Date: ${new Date().toISOString()}`,
  `FE: ${FE_BASE}`,
  `Page URL: ${pageUrl}`,
  `BFF: ${BFF_BASE}`,
  `Old BFF: ${OLD_BFF_URL}`,
  `nocache: ${NOCACHE_SHA}`,
  ``,
  `## Summary`,
  ``,
  `- contains intended BFF URL: ${containsBff}`,
  `- contains old BFF URL: ${containsOld}`,
  `- old BFF URL hit count: ${oldUrlHitCount}`,
  `- request count: ${requests.length}`,
  `- response count: ${responses.length}`,
  `- failed count: ${failed.length}`,
  `- pass: ${pass}`,
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
].join("\n");

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `hosted-browser-bff-probe-${now}.md`);
fs.writeFileSync(out, md, "utf8");
console.log(md);
if (!pass) process.exitCode = 1;
