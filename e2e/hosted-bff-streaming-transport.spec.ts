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
import { expect, test, chromium, type Browser } from "@playwright/test";
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
    if (req.url === "/sse") {
      res.writeHead(200, { ...cors, "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.write("data: hello\n\n");
      openSse.add(res); // never ends
      const tick = setInterval(() => res.write("data: tick\n\n"), 50);
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
  const { context, page } = await open();
  await page.evaluate((u) => fetch(u).then((r) => r.text()), `${bffOrigin}/redirect`);
  await startSse(page, `${bffOrigin}/sse-redirect`).catch(() => "");
  await expect.poll(() => foreignSeen.length).toBeGreaterThanOrEqual(2); // finite + SSE redirects both landed
  for (const s of foreignSeen) expect(s.authorization).toBeUndefined();
  await context.close();
});

test("a response that turns into a redirect on a later GET never receives the bearer", async () => {
  const { context, page, transport } = await open();
  expect(await startSse(page, `${bffOrigin}/flip`)).toBe("hello"); // first GET: authenticated 200 SSE
  await startSse(page, `${bffOrigin}/flip`).catch(() => ""); // second GET: 302 off-origin
  await expect.poll(() => foreignSeen.length).toBeGreaterThanOrEqual(1);
  for (const s of foreignSeen) expect(s.authorization).toBeUndefined();
  expect(bffSeen.filter((s) => s.path === "/flip").every((s) => s.authorization === `Bearer ${TOKEN}`)).toBe(true);
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
  await transport.settle();
  expect(() => transport.assertHealthy()).toThrow(/GET \/reset/);
  await context.close();
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
    let routeError: Promise<unknown> | undefined;
    let resolveError!: (error: unknown) => void;
    routeError = new Promise((resolve) => { resolveError = resolve; });
    const routed = { route: (pattern: string, handler: (route: unknown) => Promise<unknown>) =>
      context.route(pattern, (route) => handler(route).catch(resolveError)) };
    await install(routed, { token: TOKEN, feBase: feOrigin, bffBase: bffOrigin, env: env() });
    const page = await context.newPage();
    await page.goto(feOrigin);
    let delivered = false;
    const stream = startSse(page, `${bffOrigin}/sse`).then(() => { delivered = true; }).catch(() => {});
    await expect.poll(() => bffSeen.some((s) => s.path === "/sse" && s.authorization === `Bearer ${TOKEN}`)).toBe(true);
    await page.waitForTimeout(200);
    expect(delivered).toBe(false);
    if (script.startsWith("probe-")) await context.close();
    const error = String(await routeError);
    expect(error).toMatch(script.startsWith("probe-") ? /Request context disposed/ : /Timeout 30000ms exceeded/);
    await context.close();
    await stream;
    console.log(JSON.stringify({ base: BASE, script, actualHttp: 200, contentType: "text/event-stream", error: error.split("Call log:")[0].trim() }));
  });
}
