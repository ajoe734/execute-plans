// Local transport regression for the hosted probes' pinned-bearer browser transport.
// Real Chromium + real HTTPS servers; not hosted product acceptance.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { expect, test, chromium, type Browser, type CDPSession } from "@playwright/test";
// @ts-expect-error plain ESM script helper
import { installPinnedBffBearer } from "../scripts/lib/pinned-browser-bff-bearer.mjs";

const TOKEN = "stream-test-token";
type Seen = { path: string; authorization?: string; tenant?: string };
const bffSeen: Seen[] = [];
const foreignSeen: Seen[] = [];
let dir: string;
let bff: https.Server;
let foreign: https.Server;
let fe: http.Server;
let browser: Browser;
let flips = 0;
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
  });

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "sse-transport-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
    "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem")], { stdio: "ignore" });
  const tls = { key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) };
  foreign = https.createServer(tls, (req, res) => {
    record(foreignSeen, req);
    res.writeHead(200, { ...cors, "content-type": "application/json" }).end("{}");
  });
  bff = https.createServer(tls, (req, res) => {
    record(bffSeen, req);
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
      res.writeHead(200, { ...cors, "content-type": "application/json" }).end(JSON.stringify({ ready: true }));
    }
  });
  fe = http.createServer((_req, res) => res.writeHead(200, { "content-type": "text/html" }).end("<html><body>fe</body></html>"));
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
async function controlledInterception(install = installPinnedBffBearer, invalidLiveId = false, lateLifecycle = false, delayRejection = false, holdCommit = false) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
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
    let held = "", networkId = "", oldLoader = "", frameId = "", heldSample = false;
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
      if (method === "Fetch.continueRequest" && params.requestId === held) {
        heldSample = false;
        reached();
        await dispatch;
        if (invalidLiveId) params = { ...params, requestId: "missing-live-interception" };
        note("Fetch.continueRequest dispatched", { interceptionId: params.requestId, networkId, invalidLiveId });
      }
      // Hold the sample too, so cancellation can occur before both sample and
      // continuation. This is an imposed local schedule, not a hosted trace.
      const samplingHeld = method === "Performance.getMetrics" && heldSample;
      if (samplingHeld) { heldSample = false; reached(); await dispatch; }
      try {
        const result = await send(method as Parameters<CDPSession["send"]>[0], params);
        if (samplingHeld) note("Performance.getMetrics", {
          timestamp: (result as { metrics: { name: string; value: number }[] }).metrics.find((m) => m.name === "Timestamp")?.value,
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

test("live invalid id then same-request navigation stays actionable when its real rejection is delivered late", async () => {
  const c = await controlledInterception(installPinnedBffBearer, true, false, true);
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
    expect(() => c.transport.assertHealthy()).toThrow(/Invalid InterceptionId/);
    console.log(JSON.stringify({ scenario: "live-invalid-delayed-rejection", ...c.receipt, expectedHealth: "fail" }));
  } finally { c.release(); c.releaseRejection(); await c.context.close(); await c.transport.settle(); }
});

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
          const sampledAt = c.receipt.lifecycle.find((e) => e.event === "Performance.getMetrics")?.timestamp as number;
          expect(canceledAt).toBeLessThanOrEqual(sampledAt);
          expect(events.indexOf("Performance.getMetrics")).toBeLessThan(events.indexOf("Fetch.continueRequest dispatched"));
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
