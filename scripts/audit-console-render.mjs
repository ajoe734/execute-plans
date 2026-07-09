#!/usr/bin/env node
/**
 * Console render-regression audit.
 *
 * Drives every management + agora route in a headless browser against a live
 * deploy and fails if any of the live-data render-regression classes appear:
 *   - error-boundary crash ("畫面渲染失敗") — also catches uncaught
 *     ReferenceError / TypeError (they trip the boundary)
 *   - "NaN"          — a formatter fed an undefined/missing numeric field
 *   - "Invalid Date" — an unguarded new Date(x).toLocaleString()
 *   - raw i18n keys ("mgmt.*") — a missing/untranslated translation key
 *   - uncaught render errors (ReferenceError / TypeError on undefined)
 *
 * These recur whenever the live BFF aggregate shape drifts from the FE
 * view-model (fields nested under metrics{}, snake_case-only timestamps,
 * objects where a string was expected, a missing import, etc.).
 *
 * Each route uses a FRESH context, and any flagged page is re-checked once with
 * a longer settle so transient strict-mode "Failed to fetch" fetch aborts
 * (inherent to crawling a live SSE app) don't cause false failures.
 *
 * Usage:
 *   PANTHEON_FE_BASE_URL=https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io \
 *     node scripts/audit-console-render.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const FE = process.env.PANTHEON_FE_BASE_URL || "http://localhost:4173";

function discoverRoutes() {
  const src = fs.readFileSync("src/App.tsx", "utf8").split("\n");
  const agoraStart = src.findIndex((l) => l.includes('path="/agora"') && l.includes("AgoraLayout"));
  const routes = new Set();
  src.forEach((line, i) => {
    const m = line.match(/<Route\s+path="([^"]+)"\s+element=\{<([A-Za-z0-9_]+)/);
    if (!m) return;
    const [, p, el] = m;
    if (el === "Navigate" || p.includes(":") || p === "*") return;
    if (p.startsWith("/")) routes.add(p);
    else if (i > agoraStart && agoraStart > 0) routes.add(`/agora/${p}`);
    else routes.add(`/management/${p}`);
  });
  return [...routes].sort();
}

// Uncaught errors indicating a real render regression (vs. a benign network /
// fetch abort from navigation or a flaky transport blip).
const RENDER_ERROR = /ReferenceError|is not defined|Cannot read|is not a function|toFixed|Minified React|Objects are not valid/i;

async function checkRoute(browser, route, settleMs) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const renderErrors = [];
  page.on("pageerror", (e) => {
    const msg = (e.message || String(e)).split("\n")[0];
    if (RENDER_ERROR.test(msg)) renderErrors.push(msg.slice(0, 80));
  });
  try {
    await page.goto(`${FE}${route}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(settleMs);
    const crash = await page.locator('[role="alert"]:has-text("畫面渲染失敗")').count();
    const txt = ((await page.locator("main").first().innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    const problems = [];
    if (crash) problems.push("error-boundary crash");
    if (/\bNaN\b/.test(txt)) problems.push(`NaN x${(txt.match(/\bNaN\b/g) || []).length}`);
    if (txt.includes("Invalid Date")) problems.push(`Invalid Date x${(txt.match(/Invalid Date/g) || []).length}`);
    if (/\bmgmt\.[a-z][a-z.]+/i.test(txt)) problems.push(`raw i18n key x${(txt.match(/\bmgmt\.[a-z][a-z.]+/gi) || []).length}`);
    if (renderErrors.length) problems.push(`render error: ${[...new Set(renderErrors)].slice(0, 2).join(" | ")}`);
    return problems;
  } catch (e) {
    return [`load failed: ${String(e.message).split("\n")[0].slice(0, 60)}`];
  } finally {
    await context.close();
  }
}

const routes = discoverRoutes();
console.log(`[audit-console-render] ${FE} — ${routes.length} routes`);
const browser = await chromium.launch();
const failures = [];
for (const route of routes) {
  let problems = await checkRoute(browser, route, 4500);
  if (problems.length) problems = await checkRoute(browser, route, 8000); // discard transients
  if (problems.length) {
    const line = `${route} — ${problems.join(", ")}`;
    failures.push(line);
    console.log(`  ✘ ${line}`);
  }
}
await browser.close();

if (failures.length) {
  console.error(`\n✘ render regressions on ${failures.length}/${routes.length} pages`);
  process.exit(1);
}
console.log(`\n✓ all ${routes.length} pages clean`);
