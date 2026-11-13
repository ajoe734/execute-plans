// Local transport regression for the hosted probes' pinned-bearer browser transport.
// Real Chromium + real HTTPS servers; not hosted product acceptance.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import path from "node:path";
import vm from "node:vm";
// @ts-expect-error plain ESM recorded route baseline
import { BASELINE_ROUTES, ENTITY_LIST_ENDPOINTS, expectedCanonicalPath } from "../scripts/lib/management-routes.mjs";
import { expect, test, chromium, request, type Browser, type CDPSession } from "@playwright/test";
// @ts-expect-error plain ESM script helper
import { installPinnedBffBearer, pinnedTargetProblem } from "../scripts/lib/pinned-browser-bff-bearer.mjs";

const TOKEN = "stream-test-token";
type Seen = { path: string; authorization?: string; tenant?: string; cookie?: string; marker?: string };
const bffSeen: Seen[] = [];
const foreignSeen: Seen[] = [];
let dir: string;
let bff: https.Server;
let foreign: https.Server;
let fe: http.Server;
let browser: Browser;
let flips = 0;
let managementFixture = false;
let bffOrigin = "";
let foreignOrigin = "";
let feOrigin = "";
const openSse = new Set<import("node:http").ServerResponse>();

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
const listen = (s: http.Server | https.Server) =>
  new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as AddressInfo).port)));
const record = (list: Seen[], req: http.IncomingMessage) =>
  list.push({
    path: req.url || "",
    authorization: req.headers.authorization as string | undefined,
    tenant: req.headers["x-tenant-id"] as string | undefined,
    cookie: req.headers.cookie,
    marker: req.headers["x-fixture-marker"] as string | undefined,
  });

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "sse-transport-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
    "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem")], { stdio: "ignore" });
  const tls = { key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) };
  foreign = https.createServer(tls, (req, res) => {
    record(foreignSeen, req);
    if (req.url === "/to-bff") return void res.writeHead(302, { ...cors, location: `${bffOrigin}/finite` }).end();
    res.writeHead(200, { ...cors, "content-type": "application/json" }).end("{}");
  });
  bff = https.createServer(tls, (req, res) => {
    record(bffSeen, req);
    // A real rejected preflight must not be synthesized into a successful one.
    if (req.url === "/cors-denied" && req.method === "OPTIONS") return void res.writeHead(403).end();
    if (managementFixture && req.url?.startsWith("/bff/") && req.headers.authorization !== `Bearer ${TOKEN}`) {
      return void res.writeHead(401, { ...cors, "content-type": "application/json" }).end("{}");
    }
    if (req.url === "/sse" || req.url === "/baseline-sse") {
      res.writeHead(200, { ...cors, "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.write("data: hello\n\n");
      openSse.add(res); // never ends
      const tick = req.url === "/sse" ? setInterval(() => res.write("data: tick\n\n"), 50) : undefined;
      res.on("close", () => clearInterval(tick));
    } else if (req.url === "/flip") {
      // Changing response: the first GET is a 200 SSE, every later GET redirects off-origin.
      if (flips++ === 0) {
        res.writeHead(200, { ...cors, "content-type": "text/event-stream" });
        res.write("data: hello\n\n");
        openSse.add(res);
      } else {
        res.writeHead(302, { ...cors, location: `${foreignOrigin}/landed` }).end();
      }
    } else if (req.url === "/same-redirect") {
      res.writeHead(302, { ...cors, location: `${bffOrigin}/sse` }).end();
    } else if (req.url === "/pending") {
      res.writeHead(200, { ...cors, "content-type": "application/json" });
      res.write("{");
      openSse.add(res);
    } else if (req.url === "/reset") {
      req.socket.destroy(); // unrelated transport failure
    } else if (req.url === "/redirect" || req.url === "/sse-redirect") {
      res.writeHead(302, { ...cors, location: `${foreignOrigin}/landed` }).end();
    } else {
      res.writeHead(200, { ...cors, "content-type": "application/json" }).end(JSON.stringify(req.url?.startsWith("/bff/") ? { items: [{ id: "local-live-id" }] } : { ready: true }));
    }
  });
  fe = http.createServer((req, res) => {
    if (req.url === "/unrelated-pending") {
      res.writeHead(200, { "content-type": "text/plain" }); res.write("pending");
      openSse.add(res); return;
    }
    // /stall: HTTP 204 is a real Document navigation that fails (ERR_ABORTED) and never commits.
    if (req.url === "/stall") return void res.writeHead(204).end();
    if (managementFixture) {
      const canonical = expectedCanonicalPath((req.url || "").split("?")[0]);
      if (canonical) return void res.writeHead(302, { location: canonical }).end();
      const links = BASELINE_ROUTES.filter((r: { kind: string }) => r.kind === "nav")
        .map((r: { path: string }) => `<a href="${r.path}">${r.path}</a>`).join("");
      return void res.writeHead(200, { "content-type": "text/html" }).end(`<body>Recorded management route fixture ${links}<script>new EventSource("${bffOrigin}/sse"); void fetch("${bffOrigin}/finite").catch(() => {});</script></body>`);
    }
    res.writeHead(200, { "content-type": "text/html" }).end("<html><body>fe</body></html>");
  });
  bffOrigin = `https://127.0.0.1:${await listen(bff)}`;
  foreignOrigin = `https://127.0.0.1:${await listen(foreign)}`;
  feOrigin = `http://127.0.0.1:${await listen(fe)}`;
  browser = await chromium.launch();
});

test.afterAll(async () => {
  for (const r of openSse) r.destroy();
  await browser?.close();
  for (const s of [bff, foreign, fe]) s?.close();
  rmSync(dir, { recursive: true, force: true });
});

const env = () => ({ PANTHEON_AUTH_PIN_BFF_ORIGIN: bffOrigin });
async function open(opts: { tenantId?: string } = {}) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const transport = await installPinnedBffBearer(context, { token: TOKEN, feBase: feOrigin, bffBase: bffOrigin, env: env(), ...opts });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await transport.attachPage(page);
  await page.goto(feOrigin);
  return { context, page, errors, transport };
}
const startSse = (page: import("@playwright/test").Page, url: string) =>
  page.evaluate((u) => new Promise<string>((resolve) => {
    const es = new EventSource(u);
    es.onmessage = (e) => resolve(e.data);
    es.onerror = () => resolve("error");
  }), url);

test.beforeEach(() => { flips = 0; bffSeen.length = 0; foreignSeen.length = 0; });

test("authenticated SSE stays open while finite JSON and navigation/closure complete", async () => {
  const unhandled: unknown[] = [];
  const onRejection = (e: unknown) => unhandled.push(e);
  process.on("unhandledRejection", onRejection);
  const { context, page, errors, transport } = await open();
  expect(await startSse(page, `${bffOrigin}/sse`)).toBe("hello"); // 200 SSE streaming, not buffered
  const finite = await page.evaluate(async (u) => (await fetch(u)).json(), `${bffOrigin}/finite`);
  expect(finite).toEqual({ ready: true });
  expect(bffSeen.filter((s) => s.path === "/sse")).toHaveLength(1);
  expect(bffSeen.find((s) => s.path === "/sse")?.authorization).toBe(`Bearer ${TOKEN}`);
  expect(bffSeen.find((s) => s.path === "/finite")?.authorization).toBe(`Bearer ${TOKEN}`);
  await page.goto(`${feOrigin}/other`); // navigate away with the stream still open
  await page.goto(feOrigin);
  await startSse(page, `${bffOrigin}/sse`);
  await page.evaluate((u) => { void fetch(u).then((r) => r.json()).catch(() => {}); }, `${bffOrigin}/pending`);
  await expect.poll(() => bffSeen.some((s) => s.path === "/pending")).toBe(true);
  await context.close(); // close with an open stream and finite body
  await transport.settle();
  transport.assertHealthy();
  await new Promise((r) => setTimeout(r, 300));
  process.off("unhandledRejection", onRejection);
  expect(unhandled).toEqual([]);
  expect(errors).toEqual([]);
});

test("a cross-origin redirect never receives the bearer (finite and SSE)", async () => {
  const { context, page } = await open({ tenantId: "tenant-x" });
  await page.evaluate((u) => fetch(u).then((r) => r.text()), `${bffOrigin}/redirect`);
  await startSse(page, `${bffOrigin}/sse-redirect`).catch(() => "");
  await expect.poll(() => foreignSeen.length).toBeGreaterThanOrEqual(2); // finite + SSE redirects both landed
  for (const s of foreignSeen) { expect(s.authorization).toBeUndefined(); expect(s.tenant).toBeUndefined(); }
  await context.close();
});

test("a response that turns into a redirect on a later GET never receives the bearer", async () => {
  const { context, page, transport } = await open({ tenantId: "tenant-x" });
  expect(await startSse(page, `${bffOrigin}/flip`)).toBe("hello"); // first GET: authenticated 200 SSE
  expect(bffSeen.filter((s) => s.path === "/flip")).toHaveLength(1);
  await startSse(page, `${bffOrigin}/flip`).catch(() => ""); // second GET: 302 off-origin
  await expect.poll(() => foreignSeen.length).toBeGreaterThanOrEqual(1);
  for (const s of foreignSeen) { expect(s.authorization).toBeUndefined(); expect(s.tenant).toBeUndefined(); }
  expect(bffSeen.filter((s) => s.path === "/flip").every((s) => s.authorization === `Bearer ${TOKEN}`)).toBe(true);
  expect(bffSeen.filter((s) => s.path === "/flip")).toHaveLength(2);
  transport.assertHealthy();
  await context.close();
});

test("only the exact BFF origin is paused; foreign redirects into it receive per-hop auth", async () => {
  const paused: string[] = [];
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const create = context.newCDPSession.bind(context);
  context.newCDPSession = async (page) => {
    const session = await create(page);
    session.on("Fetch.requestPaused", (e) => paused.push(new URL(e.request.url).origin));
    return session;
  };
  const transport = await installPinnedBffBearer(context, { token: TOKEN, tenantId: "tenant-x", feBase: feOrigin, bffBase: bffOrigin, env: env() });
  const page = await context.newPage();
  try {
    await transport.attachPage(page);
    await page.goto(feOrigin);
    await page.evaluate((u) => fetch(u).then((r) => r.text()), `${foreignOrigin}/to-bff`);
    expect(foreignSeen.find((r) => r.path === "/to-bff")).toMatchObject({ authorization: undefined, tenant: undefined });
    expect(bffSeen.find((r) => r.path === "/finite")).toMatchObject({ authorization: `Bearer ${TOKEN}`, tenant: "tenant-x" });
    expect(paused.length).toBeGreaterThan(0);
    expect(paused.every((origin) => origin === bffOrigin)).toBe(true);
    await transport.settle(); transport.assertHealthy();
  } finally { await context.close(); await transport.settle(); }
});

test("native cookie and unrelated header handling survive BFF-only interception and off-origin redirects", async () => {
  const c = await open({ tenantId: "tenant-x" });
  try {
    // Cookies use browser host/path rules (ports are not cookie boundaries).
    await c.context.addCookies([{ name: "fixture-session", value: "browser-cookie", url: bffOrigin, secure: true, sameSite: "None" }]);
    await c.page.evaluate((u) => fetch(u, { credentials: "include", mode: "no-cors", headers: { "x-fixture-marker": "preserved" } }).then(() => {}), `${bffOrigin}/redirect`);
    await expect.poll(() => foreignSeen.some((r) => r.path === "/landed")).toBe(true);
    expect(bffSeen.find((r) => r.path === "/redirect")).toMatchObject({ authorization: `Bearer ${TOKEN}`, tenant: "tenant-x", cookie: "fixture-session=browser-cookie" });
    for (const r of foreignSeen) {
      expect(r.authorization).toBeUndefined(); expect(r.tenant).toBeUndefined();
      expect(r.cookie || "").not.toContain(TOKEN);
    }
    await c.page.evaluate((u) => fetch(u, { headers: { "x-fixture-marker": "preserved" } }).then((r) => r.text()), `${bffOrigin}/finite`);
    expect(bffSeen.some((r) => r.path === "/finite" && r.marker === "preserved")).toBe(true);
    await c.transport.settle(); c.transport.assertHealthy();
  } finally { await c.context.close(); await c.transport.settle(); }
});

test("a genuine denied CORS preflight remains a browser and transport failure", async () => {
  const c = await open();
  try {
    const failure = await c.page.evaluate((u) => fetch(u, { method: "PUT", headers: { "x-fixture-marker": "preflight" } }).then(() => "unexpected success", () => "rejected"), `${bffOrigin}/cors-denied`);
    expect(failure).toBe("rejected");
    expect(bffSeen.filter((r) => r.path === "/cors-denied")).toHaveLength(1);
    await c.transport.settle();
    expect(() => c.transport.assertHealthy()).toThrow(/cors-denied/);
  } finally { await c.context.close(); await c.transport.settle(); }
});

test("an unrelated transport failure is surfaced, not swallowed; teardown is not", async () => {
  const { context, page, transport } = await open();
  await page.evaluate((u) => fetch(u).then(() => "ok", () => "failed"), `${bffOrigin}/reset`);
  await transport.settle();
  expect(() => transport.assertHealthy()).toThrow(/\/reset/);
  const clean = await open();
  await startSse(clean.page, `${bffOrigin}/sse`);
  await clean.context.close();
  await new Promise((r) => setTimeout(r, 300));
  await clean.transport.settle();
  clean.transport.assertHealthy();
  await context.close();
});

test("tenant selection stays consistent across finite and SSE reads", async () => {
  for (const [tenantId, expected] of [[undefined, undefined], ["tenant-x", "tenant-x"]] as const) {
    bffSeen.length = 0;
    const { context, page } = await open({ tenantId });
    await page.evaluate((u) => fetch(u, { headers: { "x-tenant-id": "stale" } }).then((r) => r.text()), `${bffOrigin}/finite`);
    await startSse(page, `${bffOrigin}/sse`);
    for (const s of bffSeen) expect(s.tenant).toBe(expected);
    expect(bffSeen.length).toBeGreaterThanOrEqual(2);
    await context.close();
  }
});

test("missing token or foreign target fails closed before any credential release", async () => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await expect(installPinnedBffBearer(context, { token: "", feBase: feOrigin, bffBase: bffOrigin, env: env() })).rejects.toThrow(/Refusing/);
  await expect(installPinnedBffBearer(context, { token: TOKEN, feBase: feOrigin, bffBase: foreignOrigin, env: env() })).rejects.toThrow(/BFF origin/);
  await expect(installPinnedBffBearer(context, { token: TOKEN, feBase: "https://evil.example", bffBase: bffOrigin, env: env() })).rejects.toThrow(/FE origin/);
  await context.close();
  expect(bffSeen).toEqual([]);
});


test("same-origin redirect preserves auth, and SSE delivers multiple chunks on one GET", async () => {
  const { context, page, transport } = await open({ tenantId: "tenant-x" });
  const chunks = await page.evaluate((u) => new Promise<string[]>((resolve) => {
    const es = new EventSource(u), data: string[] = [];
    es.onmessage = (e) => { data.push(e.data); if (data.length === 3) { es.close(); resolve(data); } };
  }), `${bffOrigin}/same-redirect`);
  expect(chunks).toEqual(["hello", "tick", "tick"]);
  expect(bffSeen.filter((s) => s.path === "/sse")).toHaveLength(1);
  for (const s of bffSeen) {
    expect(s.authorization).toBe(`Bearer ${TOKEN}`);
    expect(s.tenant).toBe("tenant-x");
  }
  await context.close();
  await transport.settle();
  // Deliberately closing EventSource while the page is live must remain visible.
  // This case checks data/auth; navigation/teardown health is checked separately.
});

test("SSE network failures propagate to the probe transport", async () => {
  const { context, page, transport } = await open();
  await startSse(page, `${bffOrigin}/reset`);
  await expect.poll(() => transport.errors.length).toBeGreaterThan(0);
  await transport.settle();
  expect(() => transport.assertHealthy()).toThrow(/GET \/reset/);
  await context.close();
});

const INTERCEPTION_BASE = "82ff528625f3ca4ad7c3e607ee7cfa7d465ea444";
// Delay only dispatch of a real CDP command, never synthesize its result/error.
// This makes the narrow Chromium navigation race reproducible without sleeps.
// lateLifecycle holds, in order, delivery of real Chromium Network/Page events to the
// helper's listeners once the held request is paused, until 80ms after the real continueRequest rejection, i.e.
// a locally imposed queued-event ordering (hosted causation is unproven). Nothing is synthesized.
async function controlledInterception(install = installPinnedBffBearer, invalidLiveId = false, lateLifecycle = false, delayRejection = false, holdCommit = false, lateSample = false, sampleBeforeHold = false, probeBrowser = browser) {
  const context = await probeBrowser.newContext({ ignoreHTTPSErrors: true });
  const create = context.newCDPSession.bind(context);
  let release!: () => void;
  let reached!: () => void;
  const paused = new Promise<void>((resolve) => { reached = resolve; });
  const dispatch = new Promise<void>((resolve) => { release = resolve; });
  const receipt: { canceled: boolean; replaced: boolean; errors: string[]; order: string[];
    lifecycle: Record<string, unknown>[] } = { canceled: false, replaced: false, errors: [], order: [], lifecycle: [] };
  let openGate!: () => void;
  let releaseRejection!: () => void;
  const rejectionGate = new Promise<void>((resolve) => { releaseRejection = resolve; });
  const gate = new Promise<void>((resolve) => { openGate = resolve; });
  let releaseCommit!: () => void;
  const commitGate = new Promise<void>((resolve) => { releaseCommit = resolve; });
  context.newCDPSession = async (page) => {
    const session = await create(page), send = session.send.bind(session);
    let held = "", networkId = "", oldLoader = "", frameId = "", heldSample = false, commandHeld = false;
    const note = (event: string, fields: Record<string, unknown> = {}) =>
      receipt.lifecycle.push({ sequence: receipt.lifecycle.length, event, ...fields });
    // Observe real browser events before the optional delivery gate. Keep only
    // opaque CDP ids, timestamps and booleans; no URLs, headers or bodies.
    session.on("Network.requestWillBeSent", (e) => {
      if (e.request.url === `${bffOrigin}/held`) {
        oldLoader = e.loaderId; frameId = e.frameId;
        note("Network.requestWillBeSent", { networkId: e.requestId, frameId, loaderId: oldLoader, timestamp: e.timestamp });
      }
    });
    session.on("Network.loadingFailed", (e) => {
      if (e.requestId === networkId) note("Network.loadingFailed", { networkId, canceled: e.canceled === true, timestamp: e.timestamp });
    });
    session.on("Page.frameNavigated", (e) => {
      if (held && e.frame.id === frameId) note("Page.frameNavigated", { frameId, loaderId: e.frame.loaderId });
    });
    session.on("Page.navigatedWithinDocument", (e) => {
      if (held && e.frameId === frameId) note("Page.navigatedWithinDocument", { frameId });
    });
    page.on("close", () => { if (held) note("page.close"); });
    if (lateLifecycle) {
      const on = session.on.bind(session);
      session.on = ((event: string, listener: (e: never) => void) => on(event as never,
        /^(Network|Page)\./u.test(event)
          ? ((e: never) => { if (held) void gate.then(() => {
            if (event === "Network.loadingFailed" && (e as { requestId: string }).requestId === networkId)
              note("helper receives Network.loadingFailed", { networkId });
            listener(e);
          }); else listener(e); }) as never : listener as never)) as typeof session.on;
    }
    if (holdCommit) { // defer only DELIVERY (in order) of real Page.frameNavigated to the helper
      const on = session.on.bind(session);
      session.on = ((event: string, listener: (e: never) => void) => on(event as never,
        event === "Page.frameNavigated" ? ((e: never) => { void commitGate.then(() => listener(e)); }) as never : listener as never)) as typeof session.on;
    }
    session.on("Network.requestWillBeSent", (e) => {
      if (e.request.url === `${bffOrigin}/held`) oldLoader = e.loaderId;
    });
    session.on("Network.loadingFailed", (e) => {
      if (e.requestId === networkId) receipt.canceled = e.canceled === true && e.errorText === "net::ERR_ABORTED";
    });
    session.on("Page.frameNavigated", (e) => {
      if (oldLoader && e.frame.loaderId !== oldLoader) receipt.replaced = true;
    });
    session.on("Fetch.requestPaused", (e) => {
      if (e.request.url === `${bffOrigin}/held`) {
        held = e.requestId; networkId = e.networkId;
        heldSample = true;
        note("Fetch.requestPaused", { interceptionId: held, networkId });
      }
    });
    // Enable observation for the exact predecessor too; this does not change
    // its continueRequest handling. The maintained helper enables both itself.
    await send("Network.enable");
    await send("Page.enable");
    session.send = (async (method: string, params: { requestId?: string }) => {
      const samplingHeld = method === "Performance.getMetrics" && (heldSample || commandHeld);
      // Retain the independent reviewer's post-command-sample counterexample.
      // A pre-command helper sample cannot follow that command; unrelated new
      // navigation samples must not be held behind the old rejection.
      if (lateSample && method === "Performance.getMetrics" && commandHeld) await rejectionGate;
      if (method === "Fetch.continueRequest" && params.requestId === held) {
        heldSample = false; commandHeld = true;
        reached();
        await dispatch;
        commandHeld = false;
        if (invalidLiveId) params = { ...params, requestId: "missing-live-interception" };
        note("Fetch.continueRequest dispatched", { interceptionId: params.requestId, networkId, invalidLiveId });
      }
      // A CDP session is ordered: a sample issued while the held command is still
      // undelivered waits behind it. A sample issued before the command is held
      // too. This is an imposed local schedule, not a hosted trace.
      if (samplingHeld) { heldSample = false; if (!sampleBeforeHold) { reached(); await dispatch; } }
      try {
        const result = await send(method as Parameters<CDPSession["send"]>[0], params);
        if (method === "Performance.getMetrics" && held) note("Performance.getMetrics", {
          heldSample: samplingHeld, timestamp: (result as { metrics: { name: string; value: number }[] }).metrics.find((m) => m.name === "Timestamp")?.value,
        });
        return result;
      }
      catch (error) {
        receipt.errors.push(String(error));
        if (method === "Fetch.continueRequest") {
          receipt.order.push("continueRequest rejected"); note("Fetch.continueRequest rejected", { invalidInterceptionId: String(error).includes("Invalid InterceptionId") });
          setTimeout(openGate, 80);
        }
        // Only DELIVERY of the real rejection is delayed; the error is never synthesized.
        if (delayRejection && method === "Fetch.continueRequest") await rejectionGate;
        if (method === "Fetch.continueRequest") note("continueRequest rejection delivered");
        throw error;
      }
    }) as CDPSession["send"];
    return session;
  };
  const transport = await install(context, { token: TOKEN, feBase: feOrigin, bffBase: bffOrigin, env: env() });
  const page = await context.newPage();
  await transport.attachPage(page);
  await page.goto(feOrigin);
  return { context, page, transport, paused, release, receipt, releaseRejection, releaseCommit };
}

test("queued cancellation lifecycle arriving after Invalid InterceptionId rejection is still proven", async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await controlledInterception(installPinnedBffBearer, false, true);
    try {
      await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
      await c.paused;
      await c.page.goto(`${feOrigin}/live-detail`);
      c.release();
      await c.transport.settle();
      expect(c.receipt.order).toEqual(["continueRequest rejected"]);
      console.log(JSON.stringify({ scenario: "queued-positive", attempt, ...c.receipt, transportErrors: c.transport.errors.length }));
      c.transport.assertHealthy();
      await c.context.close();
      await c.transport.settle();
      c.transport.assertHealthy();
    } finally { c.release(); await c.context.close(); await c.transport.settle(); }
  }
});

test("late lifecycle does not excuse live abort or invalid live protocol id", async () => {
  for (const cause of ["live abort then navigation", "invalid live protocol id"] as const) {
    const c = await controlledInterception(installPinnedBffBearer, cause === "invalid live protocol id", true);
    try {
      await c.page.evaluate((u) => {
        const controller = new AbortController();
        Object.assign(window, { cancelHeld: () => controller.abort() });
        void fetch(u, { signal: controller.signal }).catch(() => {});
      }, `${bffOrigin}/held`);
      await c.paused;
      if (cause.startsWith("live abort")) {
        await c.page.evaluate(() => (window as unknown as { cancelHeld: () => void }).cancelHeld());
        await c.page.goto(`${feOrigin}/unrelated-navigation`);
      }
      c.release();
      await c.transport.settle();
      expect(() => c.transport.assertHealthy()).toThrow(/Invalid InterceptionId/);
    } finally { c.release(); await c.context.close(); await c.transport.settle(); }
  }
});

test("same-document navigation cancelling a held request settles healthy", async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await controlledInterception();
    try {
      await c.page.evaluate((u) => {
        const controller = new AbortController();
        Object.assign(window, { cancelHeld: () => controller.abort() });
        void fetch(u, { signal: controller.signal }).catch(() => {});
      }, `${bffOrigin}/held`);
      await c.paused;
      await c.page.evaluate(() => {
        history.pushState({}, "", "/same-document-route");
        (window as unknown as { cancelHeld: () => void }).cancelHeld();
      });
      await expect.poll(() => c.receipt.canceled).toBe(true);
      c.release();
      await c.transport.settle();
      expect(c.receipt.replaced).toBe(false);
      c.transport.assertHealthy();
    } finally { c.release(); await c.context.close(); await c.transport.settle(); }
  }
});

for (const lateSample of [false, true]) {
test(`live invalid id then same-request navigation stays actionable when its real rejection is delivered late${lateSample ? " and the sample is late" : ""}`, async () => {
  const c = await controlledInterception(installPinnedBffBearer, true, false, true, false, lateSample);
  try {
    await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
    await c.paused;
    c.release();
    await expect.poll(() => c.receipt.errors.some((e) => e.includes("Invalid InterceptionId"))).toBe(true);
    expect(c.receipt.canceled).toBe(false);
    await c.page.goto(`${feOrigin}/navigation-after-rejection`);
    await expect.poll(() => c.receipt.canceled).toBe(true);
    c.releaseRejection();
    await c.transport.settle();
    console.log(JSON.stringify({ scenario: "live-invalid-delayed-rejection", lateSample, ...c.receipt, transportErrors: c.transport.errors, expectedHealth: "fail" }));
    expect(() => c.transport.assertHealthy()).toThrow(/Invalid InterceptionId/);
  } finally { c.release(); c.releaseRejection(); await c.context.close(); await c.transport.settle(); }
});
}

test("cancellation after the pre-command sample fails closed when genuine dispatch is delayed", async () => {
  const c = await controlledInterception(installPinnedBffBearer, false, false, false, false, false, true);
  try {
    await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
    await c.paused; // sample has completed, but the genuine command has not dispatched
    await c.page.goto(`${feOrigin}/after-sample`);
    await expect.poll(() => c.receipt.canceled).toBe(true);
    c.release();
    await c.transport.settle();
    const sample = c.receipt.lifecycle.find((e) => e.event === "Performance.getMetrics" && e.heldSample)!;
    const cancel = c.receipt.lifecycle.find((e) => e.event === "Network.loadingFailed")!;
    expect(cancel.timestamp as number).toBeGreaterThan(sample.timestamp as number);
    expect(c.receipt.order).toEqual(["continueRequest rejected"]);
    // CDP supplies no failure timestamp inside this interval. Even a legitimate
    // cancellation is a transport failure when its order cannot be proven.
    expect(() => c.transport.assertHealthy()).toThrow(/Invalid InterceptionId/);
  } finally { c.release(); await c.context.close(); await c.transport.settle(); }
});

// Execute the actual caller's navigation functions, using the existing real
// Chromium/HTTPS fixture. No page.route/context.route or replacement transport.
for (const entry of ["gotoRouteWithRetry", "discoverLiveNav"] as const) {
  for (const invalidLiveId of [false, true]) {
    test(`actual ${entry} drains interceptions before navigation (${invalidLiveId ? "live failure" : "open SSE"})`, async () => {
      const source = readFileSync("scripts/accept-management-hosted-production.mjs", "utf8");
      const start = source.indexOf(`async function ${entry}(`);
      const end = source.indexOf(entry === "gotoRouteWithRetry" ? "\nasync function crawlRoute(" : "\nfunction authHeaders(", start);
      const navigate = vm.runInNewContext(source.slice(start, end) + `\n${entry}`, {
        FE_BASE: feOrigin, ROUTE_TIMEOUT_MS: 5000,
      });
      const c = await controlledInterception(installPinnedBffBearer, invalidLiveId, false, true, false, true);
      try {
        expect(await startSse(c.page, `${bffOrigin}/sse`)).toBe("hello");
        await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
        await c.paused;
        let entered!: () => void;
        const settling = new Promise<void>((resolve) => { entered = resolve; });
        const transport = { ...c.transport, async settle() { entered(); await c.transport.settle(); } };
        const outcome = (entry === "gotoRouteWithRetry"
          ? navigate(c.page, `${feOrigin}/actual-detail`, transport)
          : navigate(c.page, transport)).then(() => undefined, (error: unknown) => error);
        await settling;
        expect(c.page.url()).toBe(`${feOrigin}/`);
        c.release();
        if (invalidLiveId) {
          await expect.poll(() => c.receipt.errors.some((e) => e.includes("Invalid InterceptionId"))).toBe(true);
          expect(c.receipt.canceled).toBe(false);
        }
        c.releaseRejection();
        const failure = await outcome;
        if (invalidLiveId) {
          expect(String(failure)).toContain("Invalid InterceptionId");
          expect(c.page.url()).toBe(`${feOrigin}/`);
        } else {
          expect(failure).toBeUndefined();
          expect(c.receipt.errors).toEqual([]);
          expect(c.page.url()).toBe(`${feOrigin}/${entry === "gotoRouteWithRetry" ? "actual-detail" : "management/cockpit"}`);
          await c.transport.settle();
          c.transport.assertHealthy();
        }
      } finally { c.release(); c.releaseRejection(); await c.context.close(); await c.transport.settle(); }
    });
  }
}

test("actual retry drains new work after a real HTTP 204 navigation failure with open SSE", async () => {
  const source = readFileSync("scripts/accept-management-hosted-production.mjs", "utf8");
  const start = source.indexOf("async function gotoRouteWithRetry(");
  const navigate = vm.runInNewContext(source.slice(start, source.indexOf("\nasync function crawlRoute(", start)) + "\ngotoRouteWithRetry", { ROUTE_TIMEOUT_MS: 5000 });
  const c = await controlledInterception();
  try {
    expect(await startSse(c.page, `${bffOrigin}/sse`)).toBe("hello");
    const goto = c.page.goto.bind(c.page);
    let attempts = 0, settles = 0, entered!: () => void;
    const retryDrain = new Promise<void>((resolve) => { entered = resolve; });
    c.page.goto = async (...args) => {
      attempts++;
      try { return await goto(...args); }
      catch (error) {
        if (attempts === 1) await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
        throw error; // the actual Chromium 204 error, never synthesized
      }
    };
    const transport = { ...c.transport, async settle() {
      if (++settles === 2) entered();
      await c.transport.settle();
    } };
    const outcome = navigate(c.page, `${feOrigin}/stall`, transport);
    await c.paused;
    await retryDrain;
    expect(attempts).toBe(1);
    expect(c.page.url()).toBe(`${feOrigin}/`);
    c.release();
    expect(String(await outcome)).toContain("ERR_ABORTED");
    expect(attempts).toBe(2);
    expect(c.receipt.errors).toEqual([]);
    await c.transport.settle();
    c.transport.assertHealthy();
  } finally { c.release(); await c.context.close(); await c.transport.settle(); }
});

for (const invalidLiveId of [false, true]) {
  test(`actual browser close drains outstanding work (${invalidLiveId ? "live failure" : "open SSE"})`, async () => {
    const probeBrowser = await chromium.launch();
    const c = await controlledInterception(installPinnedBffBearer, invalidLiveId, false, true, false, true, false, probeBrowser);
    try {
      expect(await startSse(c.page, `${bffOrigin}/sse`)).toBe("hello");
      await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
      await c.paused;
      let entered!: () => void;
      const draining = new Promise<void>((resolve) => { entered = resolve; });
      const transport = { ...c.transport, async settle() { entered(); await c.transport.settle(); } };
      const source = readFileSync("scripts/accept-management-hosted-production.mjs", "utf8");
      const start = source.indexOf("  await transport.closeBrowser(browser);", source.indexOf("const liveIdResults ="));
      expect(start).toBeGreaterThan(0);
      const close = source.slice(start, source.indexOf('\n  console.log("[accept-management-hosted-production] running session/RBAC', start));
      const outcome = vm.runInNewContext(`(async () => {${close}})()`, { transport, browser: probeBrowser })
        .then(() => undefined, (error: unknown) => error);
      await draining;
      expect(probeBrowser.isConnected()).toBe(true);
      c.release();
      if (invalidLiveId) await expect.poll(() => c.receipt.errors.some((e) => e.includes("Invalid InterceptionId"))).toBe(true);
      c.releaseRejection();
      const failure = await outcome;
      expect(probeBrowser.isConnected()).toBe(false);
      if (invalidLiveId) expect(String(failure)).toContain("Invalid InterceptionId");
      else { expect(failure).toBeUndefined(); c.transport.assertHealthy(); }
    } finally { c.release(); c.releaseRejection(); await probeBrowser.close(); await c.transport.settle(); }
  });
}

for (const teardown of ["context close", "unrelated navigation"] as const) {
  test(`live invalid id is not excused by ${teardown} before settle`, async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const c = await controlledInterception(installPinnedBffBearer, true);
      try {
        await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
        await c.paused;
        c.release();
        await expect.poll(() => c.receipt.errors.length).toBeGreaterThan(0);
        if (teardown === "context close") await c.context.close();
        else await c.page.goto(`${feOrigin}/unrelated-navigation`);
        await c.transport.settle();
        expect(() => c.transport.assertHealthy()).toThrow(/Invalid InterceptionId/);
      } finally { c.release(); await c.context.close(); await c.transport.settle(); }
    }
  });
}

async function frameFetch(c: Awaited<ReturnType<typeof controlledInterception>>, abortable: boolean) {
  await c.page.evaluate((u) => { const f = document.createElement("iframe"); f.src = u; document.body.append(f); }, `${feOrigin}/frame`);
  await expect.poll(() => c.page.frames().length).toBe(2);
  const frame = c.page.frames()[1];
  await frame.waitForLoadState();
  await frame.evaluate(({ u, abortable }) => {
    const controller = new AbortController();
    Object.assign(window, { cancelHeld: () => controller.abort() });
    void fetch(u, abortable ? { signal: controller.signal } : undefined).catch(() => {});
  }, { u: `${bffOrigin}/held`, abortable });
  await c.paused;
  return frame;
}

test("iframe removal cancelling a held interception settles healthy", async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await controlledInterception();
    try {
      await frameFetch(c, false);
      await c.page.evaluate(() => document.querySelector("iframe")!.remove());
      await expect.poll(() => c.receipt.canceled).toBe(true);
      c.release();
      await c.transport.settle();
      expect(c.receipt.order).toEqual(["continueRequest rejected"]);
      c.transport.assertHealthy();
      console.log(JSON.stringify({ scenario: "frame-detach-positive", attempt, ...c.receipt }));
    } finally { c.release(); await c.context.close(); await c.transport.settle(); }
  }
});

test("live abort then later iframe removal stays actionable", async () => {
  const c = await controlledInterception();
  try {
    const frame = await frameFetch(c, true);
    await frame.evaluate(() => (window as unknown as { cancelHeld: () => void }).cancelHeld());
    await expect.poll(() => c.receipt.canceled).toBe(true);
    c.release();
    await expect.poll(() => c.receipt.errors.some((e) => e.includes("Invalid InterceptionId"))).toBe(true);
    await c.page.evaluate(() => document.querySelector("iframe")!.remove());
    await c.transport.settle();
    expect(() => c.transport.assertHealthy()).toThrow(/Invalid InterceptionId/);
  } finally { c.release(); await c.context.close(); await c.transport.settle(); }
});

test("observed live abort then immediate iframe removal before sample stays actionable", async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await controlledInterception();
    try {
      const frame = await frameFetch(c, true);
      const failed = c.page.waitForEvent("requestfailed", { predicate: (req) => req.url() === `${bffOrigin}/held` });
      await frame.evaluate(() => (window as unknown as { cancelHeld: () => void }).cancelHeld());
      const req = await failed;
      await expect.poll(() => c.receipt.canceled).toBe(true);
      expect(req.frame().isDetached()).toBe(false);
      await c.page.evaluate(() => document.querySelector("iframe")!.remove());
      c.release();
      await c.transport.settle();
      expect(c.transport.errors.some((e) => e.includes("ERR_ABORTED"))).toBe(true);
      expect(() => c.transport.assertHealthy()).toThrow(/Invalid InterceptionId/);
    } finally { c.release(); await c.context.close(); await c.transport.settle(); }
  }
});

test("exact 82ff queued cancellation fails; maintained transport proves the obsolete request", async () => {
  const source = execFileSync("git", ["show", `${INTERCEPTION_BASE}:scripts/lib/pinned-browser-bff-bearer.mjs`], { encoding: "utf8" });
  const predecessor = vm.runInNewContext(source.replaceAll("export ", "") + "\ninstallPinnedBffBearer", { URL, process, setTimeout });
  for (const [name, install] of [["exact-82ff", predecessor], ["fixed", installPinnedBffBearer]] as const) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const c = await controlledInterception(install, false, true);
      try {
        for (let nav = 0; nav < 3; nav++) {
          expect(await startSse(c.page, `${bffOrigin}/sse`)).toBe("hello");
          expect(await c.page.evaluate(async (u) => (await fetch(u)).json(), `${bffOrigin}/finite`)).toEqual({ ready: true });
          await c.page.goto(`${feOrigin}/crawl-${nav}`);
        }
        await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
        await c.paused;
        await c.page.goto(`${feOrigin}/live-detail`);
        c.release();
        await c.transport.settle();
        await expect.poll(() => c.receipt.canceled).toBe(true);
        expect(c.receipt.replaced).toBe(true);
        const events = c.receipt.lifecycle.map((e) => e.event);
        expect(events.indexOf("Network.loadingFailed")).toBeLessThan(events.indexOf("Fetch.continueRequest dispatched"));
        expect(events.indexOf("Fetch.continueRequest rejected")).toBeLessThan(events.indexOf("helper receives Network.loadingFailed"));
        if (name === "fixed") {
          const canceledAt = c.receipt.lifecycle.find((e) => e.event === "Network.loadingFailed")?.timestamp as number;
          const sampledAt = c.receipt.lifecycle.find((e) => e.event === "Performance.getMetrics" && e.heldSample)?.timestamp as number;
          expect(canceledAt).toBeLessThanOrEqual(sampledAt);
          // This imposed schedule cancels before the pre-command sample, which
          // proves cancellation preceded dispatch even with delayed event delivery.
          expect(events).toContain("Performance.getMetrics");
        }
        expect(c.receipt.errors.filter((e) => e.includes("(Fetch.continueRequest)"))).toEqual([expect.stringMatching(/Protocol error \(Fetch.continueRequest\): Invalid InterceptionId\./)]);
        if (name === "exact-82ff") expect(() => c.transport.assertHealthy()).toThrow(/Invalid InterceptionId/);
        else c.transport.assertHealthy();
        await c.context.close();
        await c.transport.settle();
        if (name === "fixed") c.transport.assertHealthy();
        console.log(JSON.stringify({ base: INTERCEPTION_BASE, implementation: name, attempt, ...c.receipt, expectedHealth: name === "fixed" ? "pass" : "fail" }));
      } finally { c.release(); await c.context.close(); await c.transport.settle(); }
    }
  }
});

for (const cause of ["live abort", "live abort then navigation", "invalid live protocol id"] as const) {
  test(`${cause} keeps the same real Invalid InterceptionId actionable`, async () => {
    const c = await controlledInterception(installPinnedBffBearer, cause === "invalid live protocol id");
    try {
      await c.page.evaluate((u) => {
        const controller = new AbortController();
        Object.assign(window, { cancelHeld: () => controller.abort() });
        void fetch(u, { signal: controller.signal }).catch(() => {});
      }, `${bffOrigin}/held`);
      await c.paused;
      if (cause.startsWith("live abort")) {
        await c.page.evaluate(() => (window as unknown as { cancelHeld: () => void }).cancelHeld());
        await expect.poll(() => c.receipt.canceled).toBe(true);
      }
      if (cause === "live abort then navigation") await c.page.goto(`${feOrigin}/unrelated-navigation`);
      c.release();
      await c.transport.settle();
      expect(c.receipt.replaced).toBe(cause === "live abort then navigation");
      expect(c.receipt.errors.filter((e) => e.includes("(Fetch.continueRequest)"))).toEqual([expect.stringMatching(/Invalid InterceptionId/)]);
      expect(() => c.transport.assertHealthy()).toThrow(/Invalid InterceptionId/);
      await c.context.close();
      await c.transport.settle();
      expect(() => c.transport.assertHealthy()).toThrow(/Invalid InterceptionId/);
    } finally { c.release(); await c.context.close(); await c.transport.settle(); }
  });
}

// Chromium can deliver Fetch.requestPaused before Network.requestWillBeSent for
// the same network id. This only defers delivery (in order) of real Network/Page
// events to the helper's listeners until the helper has seen the held request's
// pause; no event or protocol result is synthesized.
let pauseFirst = false;
const pauseBeforeNetwork = ((context: import("@playwright/test").BrowserContext, opts: unknown) => {
  const create = context.newCDPSession.bind(context);
  context.newCDPSession = async (page) => {
    const session = await create(page), on = session.on.bind(session);
    const queue: (() => void)[] = [];
    let released = false;
    session.on = ((event: string, listener: (e: never) => void) => on(event as never, ((e: { request?: { url: string } }) => {
      if (event === "Fetch.requestPaused") {
        listener(e as never);
        if (pauseFirst && !released && e.request?.url === `${bffOrigin}/held`) { released = true; queue.splice(0).forEach((f) => f()); }
      } else if (pauseFirst && !released && /^(Network|Page)\./u.test(event)) queue.push(() => listener(e as never));
      else listener(e as never);
    }) as never)) as typeof session.on;
    return session;
  };
  return installPinnedBffBearer(context, opts as Parameters<typeof installPinnedBffBearer>[1]);
}) as typeof installPinnedBffBearer;

test("a cancellation proven for a request whose pause preceded its Network.requestWillBeSent settles healthy", async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await controlledInterception(pauseBeforeNetwork);
    try {
      pauseFirst = true;
      await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
      await c.paused;
      await c.page.goto(`${feOrigin}/live-detail`);
      c.release();
      await c.transport.settle();
      expect(c.receipt.order).toEqual(["continueRequest rejected"]);
      c.transport.assertHealthy();
    } finally { pauseFirst = false; c.release(); await c.context.close(); await c.transport.settle(); }
  }
});

test("pause-before-network ordering still reports a live invalid protocol id", async () => {
  const c = await controlledInterception(pauseBeforeNetwork, true);
  try {
    pauseFirst = true;
    await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
    await c.paused;
    c.release();
    await c.transport.settle();
    expect(() => c.transport.assertHealthy()).toThrow(/Invalid InterceptionId/);
  } finally { pauseFirst = false; c.release(); await c.context.close(); await c.transport.settle(); }
});

// The observed crawl lifecycle: Chromium cancels the old document's requests, and the
// replacing navigation's commit reaches the helper later (here: after any fixed delay,
// delivered in order and unaltered once released). Hosted ordering is unproven; this is
// an imposed local schedule of the same causal facts, never a synthesized event.
async function openHeldCommit(held: string[] = ["Page.frameNavigated"]) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const create = context.newCDPSession.bind(context);
  let releaseCommit!: () => void;
  const commitGate = new Promise<void>((resolve) => { releaseCommit = resolve; });
  let armed = false; // hold only what follows the initial page load
  context.newCDPSession = async (page) => {
    const session = await create(page), on = session.on.bind(session);
    session.on = ((event: string, listener: (e: never) => void) => on(event as never,
      held.includes(event) ? ((e: never) => { if (armed) void commitGate.then(() => listener(e)); else listener(e); }) as never : listener as never)) as typeof session.on;
    return session;
  };
  const transport = await installPinnedBffBearer(context, { token: TOKEN, feBase: feOrigin, bffBase: bffOrigin, env: env() });
  const page = await context.newPage();
  await transport.attachPage(page);
  await page.goto(feOrigin);
  armed = true;
  return { context, page, transport, releaseCommit };
}
const abortableFetch = (page: import("@playwright/test").Page, path: string) => page.evaluate((u) => {
  const controller = new AbortController();
  Object.assign(window, { cancelLast: () => controller.abort() });
  void fetch(u, { signal: controller.signal }).catch(() => {});
}, `${bffOrigin}${path}`);

test("navigation cancelling an abortable BFF read is excused however late its commit reaches the helper", async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await openHeldCommit();
    try {
      await abortableFetch(c.page, "/pending");
      await expect.poll(() => bffSeen.filter((s) => s.path === "/pending").length).toBe(attempt + 1);
      const failed = c.page.waitForEvent("requestfailed", { predicate: (r) => r.url() === `${bffOrigin}/pending` });
      await c.page.goto(`${feOrigin}/live-detail`);
      await failed;
      await new Promise((r) => setTimeout(r, 200)); // far beyond the former fixed 25ms judgement
      c.releaseCommit();
      await c.transport.settle();
      c.transport.assertHealthy();
    } finally { c.releaseCommit(); await c.context.close(); await c.transport.settle(); }
  }
});

test("a live abort is not excused by a later navigation commit; same-URL overlap cannot excuse it", async () => {
  const c = await openHeldCommit();
  try {
    await abortableFetch(c.page, "/pending");                 // X: aborted while live
    await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/pending`); // Y: same URL, cancelled by navigation
    await expect.poll(() => bffSeen.filter((s) => s.path === "/pending").length).toBe(2);
    const live = c.page.waitForEvent("requestfailed", { predicate: (r) => r.url() === `${bffOrigin}/pending` });
    await c.page.evaluate(() => (window as unknown as { cancelLast: () => void }).cancelLast());
    await live;
    await c.page.goto(`${feOrigin}/live-detail`);
    c.releaseCommit();
    await c.transport.settle();
    expect(c.transport.errors.filter((e) => e.includes("ERR_ABORTED"))).toEqual(["GET /pending: net::ERR_ABORTED"]);
  } finally { c.releaseCommit(); await c.context.close(); await c.transport.settle(); }
});

test("Invalid InterceptionId for a request cancelled by a navigation is proven however late the commit reaches the helper", async () => {
  const c = await controlledInterception(installPinnedBffBearer, false, false, false, true);
  try {
    await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
    await c.paused;
    await c.page.goto(`${feOrigin}/live-detail`);
    await expect.poll(() => c.receipt.canceled).toBe(true);
    c.release();
    await expect.poll(() => c.receipt.errors.some((e) => e.includes("Invalid InterceptionId"))).toBe(true);
    await new Promise((r) => setTimeout(r, 1200)); // beyond the former fixed 1000ms wait
    c.releaseCommit();
    await c.transport.settle();
    c.transport.assertHealthy();
  } finally { c.release(); c.releaseCommit(); await c.context.close(); await c.transport.settle(); }
});

test("a late navigation commit cannot excuse a live invalid protocol id", async () => {
  const c = await controlledInterception(installPinnedBffBearer, true, false, false, true);
  try {
    await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
    await c.paused;
    c.release();
    await expect.poll(() => c.receipt.errors.some((e) => e.includes("Invalid InterceptionId"))).toBe(true);
    await c.page.goto(`${feOrigin}/live-detail`);
    await expect.poll(() => c.receipt.canceled).toBe(true);
    c.releaseCommit();
    await c.transport.settle();
    expect(() => c.transport.assertHealthy()).toThrow(/Invalid InterceptionId/);
  } finally { c.release(); c.releaseCommit(); await c.context.close(); await c.transport.settle(); }
});

test("the helper's own record of a navigation cancellation may trail Playwright's; causality, not arrival, decides", async () => {
  const held = ["Network.loadingFailed", "Page.frameNavigated"];
  const c = await openHeldCommit(held);
  try {
    await abortableFetch(c.page, "/pending");
    await expect.poll(() => bffSeen.filter((s) => s.path === "/pending").length).toBe(1);
    const failed = c.page.waitForEvent("requestfailed", { predicate: (r) => r.url() === `${bffOrigin}/pending` });
    await c.page.goto(`${feOrigin}/live-detail`);
    await failed;
    await new Promise((r) => setTimeout(r, 200));
    c.releaseCommit();
    await c.transport.settle();
    c.transport.assertHealthy();
  } finally { c.releaseCommit(); await c.context.close(); await c.transport.settle(); }
  // Same trailing delivery, but the abort was live before the navigation began: still a failure.
  const live = await openHeldCommit(held);
  try {
    await abortableFetch(live.page, "/pending");
    await expect.poll(() => bffSeen.filter((s) => s.path === "/pending").length).toBe(2);
    const failed = live.page.waitForEvent("requestfailed", { predicate: (r) => r.url() === `${bffOrigin}/pending` });
    await live.page.evaluate(() => (window as unknown as { cancelLast: () => void }).cancelLast());
    await failed;
    await live.page.goto(`${feOrigin}/live-detail`);
    live.releaseCommit();
    await live.transport.settle();
    expect(() => live.transport.assertHealthy()).toThrow(/GET \/pending: net::ERR_ABORTED/);
  } finally { live.releaseCommit(); await live.context.close(); await live.transport.settle(); }
});

// Bounded local causal diagnostic of the crawl lifecycle (accept-management-hosted-production's
// sequential page.goto crawl and probe-route-load-baseline's single page share this helper): an open
// SSE plus many overlapping finite BFF reads per page, then the next navigation. An observer-only
// wrapper records a sanitized per-request Fetch/Network/Page trace (method, path, opaque ids,
// ordering; never headers, tokens or query). Every Invalid InterceptionId / ERR_ABORTED that real
// Chromium produces must trace to a Network.loadingFailed(canceled) of the same network id that a
// started navigation of that frame precedes, and the helper must judge the run healthy.
// PANTHEON_CRAWL_TRACE=<file> writes the trace. It does not prove the hosted ordering.
test("crawl lifecycle trace: every cancelled read traces to a replacing navigation and settles healthy", async () => {
  const testInfo = test.info(); // real TestInfo; an empty fixture pattern is a lint error
  test.setTimeout(180_000);
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const create = context.newCDPSession.bind(context);
  const trace: Record<string, unknown>[] = [], bound = new Map<string, { path: string; frame: string }>();
  const at = (event: string, f: Record<string, unknown> = {}) => trace.push({ seq: trace.length, event, ...f });
  context.newCDPSession = async (page) => {
    const session = await create(page), send = session.send.bind(session);
    const pathOf = (u: string) => { const x = new URL(u); return x.origin === bffOrigin ? x.pathname : ""; };
    session.on("Network.requestWillBeSent", (e) => {
      const path = pathOf(e.request.url);
      if (path) { bound.set(e.requestId, { path, frame: e.frameId }); at("Network.requestWillBeSent", { net: e.requestId, frame: e.frameId, loader: e.loaderId, path, ts: e.timestamp }); }
      else if (e.type === "Document") at("Network.requestWillBeSent(Document)", { frame: e.frameId, loader: e.loaderId, ts: e.timestamp });
    });
    session.on("Fetch.requestPaused", (e) => { const b = e.networkId && bound.get(e.networkId); if (b) at("Fetch.requestPaused", { net: e.networkId, interception: e.requestId, path: b.path }); });
    session.on("Network.loadingFailed", (e) => { const b = bound.get(e.requestId); if (b) at("Network.loadingFailed", { net: e.requestId, path: b.path, canceled: e.canceled === true, error: e.errorText, ts: e.timestamp }); });
    session.on("Page.frameNavigated", (e) => at("Page.frameNavigated", { frame: e.frame.id, loader: e.frame.loaderId }));
    session.send = (async (method: string, params: { requestId?: string }) => {
      try { return await send(method as Parameters<CDPSession["send"]>[0], params as never); }
      catch (error) {
        if (method === "Fetch.continueRequest") at("Fetch.continueRequest rejected", { interception: params.requestId, invalidInterceptionId: String(error).includes("Invalid InterceptionId") });
        throw error;
      }
    }) as CDPSession["send"];
    return session;
  };
  const transport = await installPinnedBffBearer(context, { token: TOKEN, feBase: feOrigin, bffBase: bffOrigin, env: env() });
  const page = await context.newPage();
  await transport.attachPage(page);
  try {
    for (let route = 0; route < 40; route++) {
      await page.goto(`${feOrigin}/route-${route}`, { waitUntil: "domcontentloaded" });
      await page.evaluate((origin) => {
        new EventSource(`${origin}/sse`);
        for (let i = 0; i < 60; i++) void fetch(`${origin}/ready?i=${i}`).catch(() => {});
        void fetch(`${origin}/pending`).catch(() => {});
      }, bffOrigin);
    }
    await page.goto(`${feOrigin}/live-detail`, { waitUntil: "domcontentloaded" });
    await transport.settle();
    transport.assertHealthy();
  } finally { await context.close(); await transport.settle(); }
  const navs = trace.filter((t) => t.event === "Network.requestWillBeSent(Document)");
  const cancelled = trace.filter((t) => t.event === "Network.loadingFailed" && t.canceled);
  const invalid = trace.filter((t) => t.event === "Fetch.continueRequest rejected" && t.invalidInterceptionId);
  for (const c of cancelled) {
    const request = trace.find((t) => t.event === "Network.requestWillBeSent" && t.net === c.net)!;
    const replacing = navs.some((n) => n.frame === request.frame && n.loader !== request.loader && (n.ts as number) <= (c.ts as number));
    expect(replacing, `cancelled ${String(c.path)} without a replacing navigation already started`).toBe(true);
  }
  for (const i of invalid) {
    const paused = trace.find((t) => t.event === "Fetch.requestPaused" && t.interception === i.interception)!;
    expect(cancelled.some((c) => c.net === paused.net && (c.seq as number) < (i.seq as number)), "Invalid InterceptionId without prior cancellation of its own network id").toBe(true);
  }
  const summary = { cancelledReads: cancelled.length, invalidInterceptionIds: invalid.length, replacingNavigationsStarted: navs.length };
  await testInfo.attach("crawl-lifecycle-trace-summary", { body: JSON.stringify(summary), contentType: "application/json" });
  console.log(`crawl lifecycle trace summary ${JSON.stringify(summary)}`);
  if (process.env.PANTHEON_CRAWL_TRACE) writeFileSync(process.env.PANTHEON_CRAWL_TRACE, JSON.stringify({ summary, trace }, null, 1));
});

const BASE = "aa17cd4fc390e2c311ef50cbd5f7d2160faea775";
for (const script of ["probe-route-load-baseline", "accept-management-hosted-production"]) {
  test(`exact aa17 ${script} buffers real HTTP200 SSE until context disposal or 30000ms`, async () => {
    // Execute the exact committed helper, not a copy or a shortened timeout.
    const source = execFileSync("git", ["show", `${BASE}:scripts/${script}.mjs`], { encoding: "utf8" });
    const start = source.indexOf('const MAINTAINED_DEV_FE_ORIGIN =');
    const end = source.indexOf(script.startsWith("probe-") ? "\nlet chromium;" : "\nconst RETRYABLE_HTTP_STATUS", start);
    const install = vm.runInNewContext(source.slice(start, end) + "\ninstallPinnedBffBearer", { URL, process });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    context.setDefaultTimeout(30_000);
    let resolveError!: (error: unknown) => void;
    const routeError = new Promise<unknown>((resolve) => { resolveError = resolve; });
    const routed = { route: (pattern: string, handler: (route: unknown) => Promise<unknown>) =>
      context.route(pattern, (route) => handler(route).catch(resolveError)) };
    await install(routed, { token: TOKEN, feBase: feOrigin, bffBase: bffOrigin, env: env() });
    const page = await context.newPage();
    await page.goto(feOrigin);
    let delivered = false;
    const stream = startSse(page, `${bffOrigin}/baseline-sse`).then(() => { delivered = true; }).catch(() => {});
    await expect.poll(() => bffSeen.some((s) => s.path === "/baseline-sse" && s.authorization === `Bearer ${TOKEN}`)).toBe(true);
    await page.waitForTimeout(200);
    expect(delivered).toBe(false);
    if (script.startsWith("probe-")) await context.request.dispose();
    const error = String(await routeError);
    expect(error).toMatch(script.startsWith("probe-") ? /Request context disposed|Target page, context or browser has been closed/ : /Timeout 30000ms exceeded/);
    await context.close();
    await stream;
    console.log(JSON.stringify({ base: BASE, script, actualHttp: 200, contentType: "text/event-stream", error: error.split("Call log:")[0].trim() }));
  });
}

test("same-URL frame detach credit cannot excuse a live abort in another frame", async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await open();
    try {
      await c.page.evaluate((u) => { const f = document.createElement("iframe"); f.src = u; document.body.append(f); }, `${feOrigin}/frame`);
      await expect.poll(() => c.page.frames().length).toBe(2);
      await c.page.frames()[1].waitForLoadState();
      const pendingUrl = `${bffOrigin}/pending`;
      await c.page.evaluate((u) => {
        const controller = new AbortController();
        Object.assign(window, { cancelMain: () => controller.abort() });
        void fetch(u, { signal: controller.signal }).catch(() => {});
      }, pendingUrl);
      await c.page.frames()[1].evaluate((u) => { void fetch(u).catch(() => {}); }, pendingUrl);
      await expect.poll(() => bffSeen.filter((s) => s.path === "/pending").length).toBe(attempt * 2 + 2);
      let failures = 0;
      c.page.on("requestfailed", (req) => { if (req.url() === pendingUrl) failures++; });
      const mainFailed = c.page.waitForEvent("requestfailed", { predicate: (req) => req.frame() === c.page.mainFrame() && req.url() === pendingUrl });
      await c.page.evaluate(() => (window as unknown as { cancelMain: () => void }).cancelMain());
      await mainFailed;
      await c.page.evaluate(() => { const f = document.querySelector("iframe")!; f.contentWindow!.history.pushState({}, "", "/changed"); f.remove(); });
      await expect.poll(() => failures).toBe(2);
      await c.transport.settle();
      expect(() => c.transport.assertHealthy()).toThrow(/ERR_ABORTED/);
    } finally { await c.context.close(); await c.transport.settle(); }
  }
});

test("a live frame abort stays actionable when a later own detach follows another frame's genuine teardown", async () => {
  const c = await open();
  const lifecycle: Record<string, unknown>[] = [];
  const note = (event: string, fields: Record<string, unknown> = {}) => lifecycle.push({event, at: Date.now(), ...fields});
  try {
    await c.page.evaluate((u) => {
      for (const id of ["A", "B"]) {
        const f = document.createElement("iframe"); f.id = id; f.name = id; f.src = u; document.body.append(f);
      }
    }, `${feOrigin}/frame`);
    await expect.poll(() => c.page.frames().length).toBe(3);
    await expect.poll(() => Boolean(c.page.frame({name: "A"}) && c.page.frame({name: "B"}))).toBe(true);
    const a = c.page.frame({name: "A"})!, b = c.page.frame({name: "B"})!;
    await Promise.all([a.waitForLoadState(), b.waitForLoadState()]);
    const session = await c.context.newCDPSession(c.page);
    const ids = new Map<string, {frameId: string}>();
    session.on("Network.requestWillBeSent", (e) => {
      if (e.request.url === `${bffOrigin}/pending`) {
        ids.set(e.requestId, {frameId: e.frameId});
        note("Network.requestWillBeSent", {networkId: e.requestId, frameId: e.frameId});
      }
    });
    let liveFailed!: () => void;
    const networkFailed = new Promise<void>((r) => {liveFailed = r;});
    session.on("Network.loadingFailed", (e) => {
      if (ids.has(e.requestId)) {
        note("Network.loadingFailed", {networkId:e.requestId, frameId:ids.get(e.requestId)!.frameId, canceled:e.canceled, error:e.errorText, timestamp:e.timestamp});
        liveFailed();
      }
    });
    for (const event of ["Page.frameSubtreeWillBeDetached", "Page.frameDetached", "Page.navigatedWithinDocument"] as const)
      session.on(event, (e) => note(event, {frameId:e.frameId}));
    await session.send("Network.enable"); await session.send("Page.enable");
    await a.evaluate((u) => {
      const controller = new AbortController();
      Object.assign(window, {cancelA: () => controller.abort()});
      void fetch(u, {signal:controller.signal}).catch(() => {});
    }, `${bffOrigin}/pending`);
    await b.evaluate((u) => {void fetch(u).catch(() => {});}, `${bffOrigin}/pending`);
    await expect.poll(() => bffSeen.filter((s) => s.path === "/pending").length).toBe(2);
    const failures: Record<string, unknown>[] = [];
    c.page.on("requestfailed", (req) => {
      if (req.url() === `${bffOrigin}/pending`) {
        const entry = {frame:req.frame() === a ? "A" : "B", detachedAtFailure:req.frame().isDetached(), failure:req.failure()?.errorText};
        failures.push(entry); note("requestfailed", entry);
      }
    });
    const failed = c.page.waitForEvent("requestfailed", {predicate: (req) => req.frame() === a && req.url() === `${bffOrigin}/pending`});
    await a.evaluate(() => (window as unknown as {cancelA: () => void}).cancelA());
    const [req] = await Promise.all([failed, networkFailed]);
    expect(req.failure()?.errorText).toBe("net::ERR_ABORTED");
    expect(req.frame().isDetached()).toBe(false);
    note("A confirmed live after failure");
    await c.page.evaluate(() => {
      const f = document.getElementById("B") as HTMLIFrameElement;
      f.contentWindow!.history.pushState({}, "", "/changed"); f.remove();
      document.getElementById("A")!.remove();
    });
    await expect.poll(() => failures.length).toBe(2);
    await c.transport.settle();
    // A failed while still live, before any detach. B has an independent,
    // genuine navigation/detach cancellation and cannot excuse A's failure.
    expect(() => c.transport.assertHealthy()).toThrow(/ERR_ABORTED/);
  } finally {await c.context.close(); await c.transport.settle();}
});

for (const teardown of ["page-close", "navigation"] as const) {
  test(`live abort already observed before ${teardown} stays actionable`, async () => {
    const c = await open();
    const session = await c.context.newCDPSession(c.page);
    let id = "";
    const order: string[] = [];
    let resolveFailure!: () => void;
    const failed = new Promise<void>((r) => { resolveFailure = r; });
    session.on("Network.requestWillBeSent", (e) => { if (e.request.url === `${bffOrigin}/pending`) id=e.requestId; });
    session.on("Network.loadingFailed", (e) => { if(e.requestId===id) {order.push(`failure:${e.errorText}`); resolveFailure();} });
    c.page.on("close", () => order.push("page-close"));
    session.on("Page.frameNavigated", () => order.push("frame-navigation"));
    await session.send("Network.enable"); await session.send("Page.enable");
    try {
      await c.page.evaluate((u) => {const ctrl = new AbortController(); Object.assign(window, {cancelReview:()=>ctrl.abort()}); void fetch(u,{signal:ctrl.signal}).then((r)=>r.text()).catch(()=>{});}, `${bffOrigin}/pending`);
      await expect.poll(() => bffSeen.some((x)=>x.path==="/pending")).toBe(true);
      const pwFailed = c.page.waitForEvent("requestfailed", {predicate: (r)=>r.url()===`${bffOrigin}/pending`});
      await c.page.evaluate(() => (window as unknown as {cancelReview:()=>void}).cancelReview());
      const [req] = await Promise.all([pwFailed, failed]);
      expect(c.page.isClosed()).toBe(false);
      expect(req.failure()?.errorText).toBe("net::ERR_ABORTED");
      order.push("confirmed-live-failure");
      if (teardown === "page-close") await c.page.close();
      else await c.page.goto(`${feOrigin}/later-unrelated`);
      await c.transport.settle();
      expect(() => c.transport.assertHealthy()).toThrow(/ERR_ABORTED/);
    } finally {await c.context.close(); await c.transport.settle();}
  });
}

// A Document navigation that failed without committing is not "replacing" the live page:
// it must not later excuse a live abort / invalid id just because some other navigation commits.
const failedNavigation = (page: import("@playwright/test").Page) =>
  page.goto(`${feOrigin}/stall`, { timeout: 5000 }).then(() => "committed", (e) => String(e).split("\n")[0]);

test("a failed (HTTP 204) navigation does not excuse a live abort before a later unrelated navigation", async () => {
  const c = await open();
  try {
    expect(await failedNavigation(c.page)).toMatch(/ERR_ABORTED/);
    await abortableFetch(c.page, "/pending");
    await expect.poll(() => bffSeen.filter((s) => s.path === "/pending").length).toBe(1);
    const live = c.page.waitForEvent("requestfailed", { predicate: (r) => r.url() === `${bffOrigin}/pending` });
    await c.page.evaluate(() => (window as unknown as { cancelLast: () => void }).cancelLast());
    await live;
    await new Promise((r) => setTimeout(r, 150));
    await c.page.goto(`${feOrigin}/unrelated`);
    await c.transport.settle();
    expect(c.transport.errors).toEqual(["GET /pending: net::ERR_ABORTED"]);
  } finally { await c.context.close(); await c.transport.settle(); }
});

test("a failed navigation does not excuse a live invalid id before a later unrelated navigation", async () => {
  const c = await controlledInterception(installPinnedBffBearer, true);
  try {
    expect(await failedNavigation(c.page)).toMatch(/ERR_ABORTED/);
    await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
    await c.paused;
    c.release();
    await expect.poll(() => c.receipt.errors.length).toBeGreaterThan(0);
    await c.page.goto(`${feOrigin}/unrelated-navigation`);
    await c.transport.settle();
    expect(() => c.transport.assertHealthy()).toThrow(/Invalid InterceptionId/);
  } finally { c.release(); await c.context.close(); await c.transport.settle(); }
});

test("a read cancelled by a real navigation still settles healthy after an earlier failed navigation", async () => {
  const c = await open();
  try {
    expect(await failedNavigation(c.page)).toMatch(/ERR_ABORTED/);
    await abortableFetch(c.page, "/pending");
    await expect.poll(() => bffSeen.filter((s) => s.path === "/pending").length).toBe(1);
    await c.page.goto(`${feOrigin}/live-detail`);
    await c.transport.settle();
    c.transport.assertHealthy();
  } finally { await c.context.close(); await c.transport.settle(); }
});

// A busy renderer or loaded runner schedules the command (and possibly the clock sample)
// late. Keep these imposed schedules: a cancellation after the pre-command sample
// has no proven order relative to the native failure and must fail closed (source
// criterion 2 addendum, 2026-11-13). Actual caller prevention is tested separately.
for (const useCaller of [false, true]) {
for (const delaySample of [true, false]) {
test(`${useCaller ? "actual caller drains loaded reads and open SSE before successive navigations" : "reads cancelled by successive navigations settle healthy"} when ${delaySample ? "sample and command are" : "only the command is"} scheduled late`, async () => {
  const probeBrowser = useCaller ? await chromium.launch() : browser;
  const context = await probeBrowser.newContext({ ignoreHTTPSErrors: true });
  const create = context.newCDPSession.bind(context);
  context.newCDPSession = async (page) => {
    const session = await create(page), send = session.send.bind(session), held = new Set<string>();
    let tail: Promise<unknown> = Promise.resolve(); // a CDP session delivers messages in order
    session.on("Fetch.requestPaused", (e) => { if (e.request.url.startsWith(`${bffOrigin}/read-`)) held.add(e.requestId); });
    session.send = (async (method: string, params: { requestId?: string }) => {
      const late = (delaySample && method === "Performance.getMetrics") || (method === "Fetch.continueRequest" && held.has(params.requestId!));
      const turn = tail;
      const run = turn.then(async () => { if (late) await new Promise((resolve) => setTimeout(resolve, 200)); });
      tail = run;
      await run;
      return send(method as Parameters<CDPSession["send"]>[0], params);
    }) as CDPSession["send"];
    return session;
  };
  const transport = await installPinnedBffBearer(context, { token: TOKEN, feBase: feOrigin, bffBase: bffOrigin, env: env() });
  const page = await context.newPage();
  await transport.attachPage(page);
  const source = readFileSync("scripts/accept-management-hosted-production.mjs", "utf8");
  const start = source.indexOf("async function gotoRouteWithRetry(");
  const navigate = vm.runInNewContext(source.slice(start, source.indexOf("\nasync function crawlRoute(", start)) + "\ngotoRouteWithRetry", { ROUTE_TIMEOUT_MS: 5000 });
  try {
    for (let route = 0; route < (useCaller ? 3 : 12); route++) {
      if (useCaller) expect(await navigate(page, `${feOrigin}/route-${route}`, transport)).toBeNull();
      else await page.goto(`${feOrigin}/route-${route}`);
      if (useCaller) expect(await startSse(page, `${bffOrigin}/sse`)).toBe("hello");
      await page.evaluate((u) => { for (let k = 0; k < 6; k++) void fetch(`${u}/read-${k}`).catch(() => {}); }, bffOrigin);
      await page.waitForTimeout(20);
    }
    if (useCaller) expect(await navigate(page, `${feOrigin}/route-end`, transport)).toBeNull();
    else await page.goto(`${feOrigin}/route-end`);
    await page.waitForTimeout(600);
    await transport.settle();
    transport.assertHealthy();
    if (useCaller) {
      expect(bffSeen.filter((r) => r.path.startsWith("/read-")).length).toBe(18);
      expect(bffSeen.filter((r) => r.path === "/sse")).toHaveLength(3);
    }
  } finally { await context.close(); await transport.settle(); if (useCaller) await probeBrowser.close(); }
});
}
}

// Execute the maintained caller's full main(), including the JSON/Markdown
// report after discovery -> 95 baseline -> local entity resolution -> details.
// All server data and the load-gate input are generated local fixtures. Fixture
// HTML/data is local protocol coverage, never a hosted acceptance pass. Impose
// a renderer read immediately AFTER its drain, using only native CDP results.
for (const scopeCase of ["after-drain BFF", "wildcard predecessor", "pinned origin"] as const) {
test(`actual 95-route caller handles a new interception after drain through entity discovery and detail closure (${scopeCase})`, async () => {
  test.setTimeout(120_000);
  managementFixture = true;
  const probeBrowser = await chromium.launch();
  const context = await probeBrowser.newContext({ ignoreHTTPSErrors: true });
  const create = context.newCDPSession.bind(context);
  let session!: CDPSession;
  let nativeSend!: CDPSession["send"];
  let heldId = "", heldNetworkId = "", closing = false;
  let reached!: () => void, release!: () => void;
  const paused = new Promise<void>((r) => { reached = r; });
  const dispatch = new Promise<void>((r) => { release = r; });
  const trace: string[] = [];
  let foreignId = "", foreignContinues = 0;
  let foreignReached!: () => void, releaseForeign!: () => void;
  const foreignIssued = new Promise<void>((r) => { foreignReached = r; });
  const foreignDispatch = new Promise<void>((r) => { releaseForeign = r; });
  context.newCDPSession = async (page) => {
    session = await create(page);
    nativeSend = session.send.bind(session);
    session.on("Fetch.requestPaused", (e) => {
      if (e.request.url === `${bffOrigin}/held`) { heldId = e.requestId; heldNetworkId = e.networkId; trace.push(closing ? "paused after close drain" : "paused after drain"); reached(); }
      if (e.request.url === `${feOrigin}/unrelated-pending`) foreignId = e.requestId;
    });
    session.on("Network.loadingFailed", (e) => { if (e.requestId === heldNetworkId) trace.push(`cancelled:${e.canceled === true}`); });
    session.send = (async (method: string, params: { requestId?: string }) => {
      if (method === "Fetch.continueRequest" && params.requestId === foreignId) {
        foreignContinues++; foreignReached();
        await foreignDispatch;
        try { return await nativeSend(method, params as never); }
        catch (e) { trace.push(`foreign native rejection:${String(e).includes("Invalid InterceptionId")}`); throw e; }
      }
      if (method === "Fetch.continueRequest" && params.requestId === heldId) {
        trace.push("continue entered");
        await dispatch;
        try { return await nativeSend(method, params as never); }
        catch (e) { trace.push(`native rejection:${String(e).includes("Invalid InterceptionId")}`); throw e; }
      }
      return nativeSend(method as Parameters<CDPSession["send"]>[0], params);
    }) as CDPSession["send"];
    return session;
  };
  const predecessorSource = scopeCase === "wildcard predecessor" ? execFileSync("git", ["show", "819363de15b9d36d607201e558239296e8010a36:scripts/lib/pinned-browser-bff-bearer.mjs"], { encoding: "utf8" }) : "";
  const install = predecessorSource ? vm.runInNewContext(predecessorSource.replaceAll("export ", "") + "\ninstallPinnedBffBearer", { URL, process, setTimeout }) : installPinnedBffBearer;
  const transport = await install(context, { token: TOKEN, tenantId: "tenant-local", feBase: feOrigin, bffBase: bffOrigin, env: env() });
  const page = await context.newPage();
  await transport.attachPage(page);
  const transportClose = transport.closeBrowser.bind(transport);
  transport.closeBrowser = async (target: Browser) => {
    if (scopeCase !== "after-drain BFF") {
      // After the entire real caller crawl, impose a delayed continuation of
      // an unrelated FE read canceled by its renderer. All replies/errors are
      // native Chromium. This is a generated schedule, NOT the missing trace.
      const failed = page.waitForEvent("requestfailed", { predicate: (r) => r.url() === `${feOrigin}/unrelated-pending` });
      await page.evaluate((u) => {
        const controller = new AbortController();
        Object.assign(window, { cancelUnrelated: () => controller.abort() });
        void fetch(u, { signal: controller.signal }).then((r) => r.text()).catch(() => {});
      }, `${feOrigin}/unrelated-pending`);
      if (scopeCase === "wildcard predecessor") await foreignIssued;
      else await nativeSend("Performance.getMetrics");
      await page.evaluate(() => (window as unknown as { cancelUnrelated: () => void }).cancelUnrelated());
      await failed;
      releaseForeign();
      await transport.settle();
    }
    return transportClose(target);
  };
  const closeBrowser = probeBrowser.close.bind(probeBrowser);
  let lateCloseRequest = false;
  probeBrowser.close = async (...args) => {
    if (!page.isClosed()) {
      closing = true;
      const request = page.waitForEvent("request", { predicate: (r) => r.url() === `${bffOrigin}/held` });
      await page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
      await request;
      await nativeSend("Performance.getMetrics");
      lateCloseRequest = true;
    }
    return closeBrowser(...args);
  };
  const goto = page.goto.bind(page);
  let imposed = false;
  page.goto = async (...args) => {
    // Last fixture-id route -> first live-id detail is the original caller's
    // discovery/crawl/detail boundary. Run JS in the still-live old document.
    if (!imposed && args[0].endsWith("/management/strategies/local-live-id")) {
      imposed = true;
      await page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
      await paused;
      // Native round trip lets the old helper's pre-command sample complete;
      // it supplies no fabricated lifecycle fact or continuation result.
      await nativeSend("Performance.getMetrics");
      try { return await goto(...args); }
      finally { trace.push("navigation returned"); release(); }
    }
    return goto(...args);
  };
  const source = readFileSync("scripts/accept-management-hosted-production.mjs", "utf8");
  const fixtureLoadGate = join(dir, "generated-local-load-gate.json");
  const reportDir = join(dir, `generated-local-report-${scopeCase.replaceAll(" ", "-")}`);
  writeFileSync(fixtureLoadGate, JSON.stringify({ fixture: true, result: { pass: true, overall: "pass" } }));
  // Supply only the fixture browser/context and environment to the unchanged
  // main body. Its real crawl, auth checks, gate aggregation and report writes run.
  const newContext = probeBrowser.newContext.bind(probeBrowser);
  const newPage = context.newPage.bind(context);
  probeBrowser.newContext = async () => context;
  context.newPage = async () => page;
  const fixtureProcess = { exitCode: 0, cwd: () => process.cwd() };
  // The original caller performs Node reads after browser closure; this real
  // HTTPS client must likewise outlive the browser context.
  const api = await request.newContext({ ignoreHTTPSErrors: true });
  const run = vm.runInNewContext(`${source.slice(source.indexOf("function nowStamp()"), source.indexOf("async function loadChromium()"))}
${source.slice(source.indexOf("const CORS_PATTERN ="), source.lastIndexOf("\nmain();"))}
main`, {
    fs, path, execFileSync, console, URL, Map, Set, AbortSignal, process: fixtureProcess,
    loadChromium: async () => ({ launch: async () => probeBrowser }),
    installPinnedBffBearer: async () => transport,
    pinnedTargetProblem: (opts: object) => pinnedTargetProblem({ ...opts, env: env() }),
    FE_BASE: feOrigin, BFF_BASE: bffOrigin, BASELINE_ROUTES, ENTITY_LIST_ENDPOINTS, expectedCanonicalPath,
    LOAD_GATE_ONLY: false, LOAD_GATE_MANIFEST: fixtureLoadGate, LOAD_BASELINE_DIR: dir,
    OUT_DIR: reportDir, SRC_SCAN_DIR: dir, STRICT_SOURCE_SCAN: true, CLICK_WRITE_CTAS: false,
    ROUTE_TIMEOUT_MS: 5000, SETTLE_TIMEOUT_MS: 4000, BEARER_TOKEN: TOKEN, TENANT_ID: "tenant-local",
    bearerAuthorization: (token: string) => `Bearer ${token}`, RETRYABLE_HTTP_STATUS: new Set(), sleep: () => Promise.resolve(),
    // Real HTTPS requests against the same existing local BFF fixture. No
    // replacement data, errors, success assertions or aggregate gate inputs.
    fetch: async (url: string, options: { headers: Record<string, string> }) => {
      const response = await api.get(url, { headers: options.headers });
      return { status: response.status(), text: () => response.text() };
    },
  });
  try {
    if (scopeCase === "wildcard predecessor") {
      const failure = await run().then(() => undefined, (error: unknown) => error);
      expect(String(failure)).toContain("Invalid InterceptionId");
      expect(foreignContinues).toBe(1);
      expect(trace).toContain("foreign native rejection:true");
      expect(transport.errors.some((e: string) => e.includes('"path":"/unrelated-pending"') && e.includes('"issued":true'))).toBe(true);
      expect(fs.existsSync(join(reportDir, `management-hosted-acceptance-${new Date().toISOString().slice(0, 10)}.json`))).toBe(false);
      console.log(JSON.stringify({ generatedScopeCounterexample: true, scopeCase, foreignContinues, trace, errors: transport.errors }));
      return;
    }
    await run();
    expect(foreignContinues).toBe(0);
    const stamp = new Date().toISOString().slice(0, 10);
    const jsonPath = join(reportDir, `management-hosted-acceptance-${stamp}.json`);
    const mdPath = jsonPath.replace(/\.json$/, ".md");
    const report = JSON.parse(readFileSync(jsonPath, "utf8"));
    const result = { results: report.routes.filter((r: { source: string }) => r.source === "baseline-or-live-nav"),
      liveIdResults: report.routes.filter((r: { source: string }) => r.source.startsWith("live-id:")),
      liveIdResolution: report.liveIdResolution };
    expect(fixtureProcess.exitCode).toBe(0);
    expect(report.result).toMatchObject({ pass: true, overall: "pass", failures: [], missing: [] });
    expect(report.routeCounts.baseline).toBe(95);
    expect(report.routeCounts.crawled).toBe(95 + result.liveIdResults.length);
    expect(report.sessionRbac.overall).toBe("pass");
    expect(readFileSync(mdPath, "utf8")).toContain("Overall: **pass** (pass=true)");
    await test.info().attach("generated-local-management-report.json", { path: jsonPath, contentType: "application/json" });
    await test.info().attach("generated-local-management-report.md", { path: mdPath, contentType: "text/markdown" });
    expect(result.results).toHaveLength(95);
    expect(result.results.every((r: { status: string }) => r.status === "ok")).toBe(true);
    expect(result.liveIdResolution.length).toBeGreaterThan(10);
    expect(result.liveIdResults).toHaveLength(result.liveIdResolution.length);
    expect(result.liveIdResults.every((r: { status: string }) => r.status === "ok")).toBe(true);
    expect(imposed).toBe(true);
    expect(lateCloseRequest).toBe(true);
    expect(trace).toContain("paused after close drain");
    expect(trace).toContain("cancelled:true");
    expect(bffSeen.filter((r) => r.path === "/sse").length).toBeGreaterThanOrEqual(95);
    expect(trace.some((e) => e.startsWith("native rejection:"))).toBe(false);
    transport.assertHealthy();
    const invalidReads = bffSeen.filter((r) => r.authorization === "Bearer op-bogus-session:none");
    expect(invalidReads.map((r) => r.path)).toEqual(["/bff/me", "/bff/management/shell-summary"]);
    const reads = bffSeen.filter((r) => r.path.startsWith("/bff/") && r.authorization !== "Bearer op-bogus-session:none");
    expect(reads.length).toBeGreaterThan(10);
    expect(reads.every((r) => r.authorization === `Bearer ${TOKEN}` && r.tenant === "tenant-local")).toBe(true);
    console.log(JSON.stringify({ localActualCaller: true, baseline: result.results.length, details: result.liveIdResults.length, trace, transportErrors: transport.errors.length }));
  } finally {
    probeBrowser.newContext = newContext;
    context.newPage = newPage;
    await api.dispose();
    release(); releaseForeign(); managementFixture = false;
    await closeBrowser(); await transport.settle();
    console.log(JSON.stringify({ localCallerTrace: trace, transportErrors: transport.errors }));
  }
});
}

// A new-document request queued during the same transition is still live at
// release. Corrupt its actual CDP id and retain the native protocol failure;
// neither the previous document replacement nor later closure can excuse it.
test("actual caller preserves a genuine invalid id on a queued new-document request", async () => {
  const c = await controlledInterception(installPinnedBffBearer, true);
  const source = readFileSync("scripts/accept-management-hosted-production.mjs", "utf8");
  const start = source.indexOf("async function gotoRouteWithRetry(");
  const navigate = vm.runInNewContext(source.slice(start, source.indexOf("\nasync function crawlRoute(", start)) + "\ngotoRouteWithRetry", { ROUTE_TIMEOUT_MS: 5000 });
  const goto = c.page.goto.bind(c.page);
  c.page.goto = async (...args) => {
    const response = await goto(...args);
    await c.page.evaluate((u) => { void fetch(u).catch(() => {}); }, `${bffOrigin}/held`);
    return response;
  };
  try {
    expect(await navigate(c.page, `${feOrigin}/new-document`, c.transport)).toBeNull();
    await c.paused;
    c.release();
    await c.transport.settle();
    expect(c.receipt.canceled).toBe(false);
    expect(c.receipt.errors.some((e) => e.includes("Invalid InterceptionId"))).toBe(true);
    expect(() => c.transport.assertHealthy()).toThrow(/Invalid InterceptionId/);
    const detail = JSON.parse(c.transport.errors.find((e: string) => e.includes("Invalid InterceptionId"))!.match(/CDP continueRequest (\{.*\}):/)![1]);
    expect(detail).toMatchObject({ path: "/held", pausePhase: "navigation", queued: true,
      issued: true, bound: true, canceled: false });
    expect(detail.interceptionId).toBeTruthy();
    expect(detail.networkId).toBeTruthy();
    expect(typeof detail.sampledBeforeIssue).toBe("number");
    const before = c.page.url();
    const failure = await navigate(c.page, `${feOrigin}/later`, c.transport).then(() => undefined, (error: unknown) => error);
    expect(String(failure)).toContain("Invalid InterceptionId");
    expect(c.page.url()).toBe(before);
  } finally { c.release(); await c.context.close(); await c.transport.settle(); }
});
